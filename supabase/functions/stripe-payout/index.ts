/**
 * stripe-payout
 *
 * 毎月末に Supabase Cron から自動呼び出しされ、
 * creator_earnings テーブルの未払い収益をクリエイターの銀行口座へ振り込む。
 *
 * 処理の流れ：
 *   1. payout_status = 'pending' の収益をクリエイターごとに集計
 *   2. stripe.transfers.create でプラットフォームから Connect アカウントへ送金
 *   3. stripe.payouts.create で Connect アカウントから銀行口座へ出金
 *   4. creator_earnings を 'paid' に更新
 *
 * 注意：
 *   - クリエイターが Stripe の身元確認を完了していない場合、
 *     step 3 は失敗するが step 2 は成功する（残高に積み上がり続ける）。
 *   - 確認完了後に自動で支払われるよう、エラーは記録するが処理を止めない。
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

serve(async (req) => {
  // Cron からの呼び出しは Authorization ヘッダーで Service Role Key を使う
  const authHeader = req.headers.get('Authorization')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (!authHeader || !authHeader.includes(serviceRoleKey)) {
    // 管理者トークンか Service Role が必要
    return new Response('Unauthorized', { status: 401 })
  }

  const today = new Date()
  const payoutMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const results: { creatorId: string; amount: number; status: string; error?: string }[] = []

  try {
    // ── 未払い収益をクリエイターごとに集計 ─────────────────────
    const { data: earnings, error: fetchError } = await supabase
      .from('creator_earnings')
      .select('id, creator_id, creator_amount')
      .eq('payout_status', 'pending')

    if (fetchError) throw fetchError
    if (!earnings || earnings.length === 0) {
      return new Response(JSON.stringify({ message: '未払い収益なし', results: [] }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // creator_id ごとに収益をまとめる
    const byCreator = new Map<string, { totalAmount: number; ids: string[] }>()
    for (const e of earnings) {
      if (!byCreator.has(e.creator_id)) {
        byCreator.set(e.creator_id, { totalAmount: 0, ids: [] })
      }
      const entry = byCreator.get(e.creator_id)!
      entry.totalAmount += e.creator_amount
      entry.ids.push(e.id)
    }

    // ── クリエイターごとに振込処理 ───────────────────────────────
    for (const [creatorId, { totalAmount, ids }] of byCreator) {

      // Stripe Connect アカウント ID を取得
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_connect_account_id, display_name')
        .eq('id', creatorId)
        .single()

      if (!profile?.stripe_connect_account_id) {
        // Connect アカウント未設定のクリエイターはスキップ
        results.push({ creatorId, amount: totalAmount, status: 'skipped_no_account' })
        continue
      }

      try {
        // Step1: プラットフォーム → Connect アカウントへ送金（Transfer）
        const transfer = await stripe.transfers.create({
          amount: totalAmount,        // 円単位（JPY は最小単位が1円）
          currency: 'jpy',
          destination: profile.stripe_connect_account_id,
          description: `Reach メンバーシップ収益 ${payoutMonth}（${profile.display_name ?? creatorId}）`,
          metadata: {
            creator_id: creatorId,
            payout_month: payoutMonth,
            earning_ids: ids.join(','),
          },
        })

        // Step2: Connect アカウント → 銀行口座へ出金（Payout）
        // 身元確認が完了していないと失敗するが、Transfer は成功しているため
        // 残高は積み上がり続け、確認完了後に自動で処理される
        try {
          await stripe.payouts.create(
            {
              amount: totalAmount,
              currency: 'jpy',
              description: `Reach 振込 ${payoutMonth}`,
            },
            { stripeAccount: profile.stripe_connect_account_id }
          )
        } catch (payoutErr) {
          // Payout が失敗してもレコードは paid にする（Transfer は完了しているため）
          console.warn(`Payout failed for creator ${creatorId}:`, payoutErr)
        }

        // ── creator_earnings を paid に更新 ─────────────────────
        await supabase
          .from('creator_earnings')
          .update({
            payout_status: 'paid',
            payout_date: today.toISOString().split('T')[0],
          })
          .in('id', ids)

        // クリエイターへ振込完了通知
        await supabase.from('notifications').insert({
          user_id: creatorId,
          type: 'payout_completed',
          actor_id: null,
          metadata: { amount: totalAmount, payout_month: payoutMonth },
        })

        results.push({ creatorId, amount: totalAmount, status: 'paid', transferId: transfer.id } as any)

      } catch (err) {
        console.error(`Payout error for creator ${creatorId}:`, err)
        results.push({ creatorId, amount: totalAmount, status: 'error', error: (err as Error).message })
      }
    }

    return new Response(JSON.stringify({ payoutMonth, results }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('stripe-payout fatal error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
