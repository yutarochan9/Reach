/**
 * stripe-payout-request
 *
 * クリエイターが自分のタイミングで振込申請するときに呼ばれる。
 * 認証済みユーザー自身の pending 収益のみを処理する。
 *
 * 制限：
 *   - 最低振込金額: 1,000円（未満は申請不可）
 *   - Stripe Connect アカウント未設定の場合はエラー
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MIN_PAYOUT = 1000  // 最低振込金額（円）

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── 認証 ─────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('認証情報がありません')

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) throw new Error('認証に失敗しました')

    // ── プロフィール取得 ─────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, stripe_connect_account_id')
      .eq('id', user.id)
      .single()

    if (!profile?.stripe_connect_account_id) {
      throw new Error('振込先口座が登録されていません。先に振込先口座を設定してください。')
    }

    // ── pending 収益を集計 ──────────────────────────────────────
    const { data: earnings, error: fetchError } = await supabase
      .from('creator_earnings')
      .select('id, creator_amount')
      .eq('creator_id', user.id)
      .eq('payout_status', 'pending')

    if (fetchError) throw fetchError

    if (!earnings || earnings.length === 0) {
      throw new Error('振込待ちの収益がありません')
    }

    const totalAmount = earnings.reduce((s: number, e: any) => s + e.creator_amount, 0)
    const ids = earnings.map((e: any) => e.id)

    if (totalAmount < MIN_PAYOUT) {
      throw new Error(`振込金額が最低金額（¥${MIN_PAYOUT.toLocaleString()}）未満です（現在: ¥${totalAmount.toLocaleString()}）`)
    }

    const today = new Date()
    const payoutMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

    // ── Step1: Transfer（プラットフォーム → Connect アカウント） ─
    const transfer = await stripe.transfers.create({
      amount: totalAmount,
      currency: 'jpy',
      destination: profile.stripe_connect_account_id,
      description: `Reach 振込申請 ${today.toLocaleDateString('ja-JP')}（${profile.display_name ?? user.id}）`,
      metadata: {
        creator_id: user.id,
        payout_month: payoutMonth,
        earning_ids: ids.join(','),
        type: 'manual_request',
      },
    })

    // ── Step2: Payout（Connect アカウント → 銀行口座） ───────────
    try {
      await stripe.payouts.create(
        {
          amount: totalAmount,
          currency: 'jpy',
          description: `Reach 振込 ${today.toLocaleDateString('ja-JP')}`,
        },
        { stripeAccount: profile.stripe_connect_account_id }
      )
    } catch (payoutErr) {
      // 身元確認未完了でも Transfer は完了しているため処理継続
      console.warn('Payout failed (may need KYC):', payoutErr)
    }

    // ── DB を paid に更新 ───────────────────────────────────────
    await supabase
      .from('creator_earnings')
      .update({
        payout_status: 'paid',
        payout_date: today.toISOString().split('T')[0],
      })
      .in('id', ids)

    // ── 振込完了通知 ─────────────────────────────────────────────
    await supabase.from('notifications').insert({
      user_id: user.id,
      type: 'payout_completed',
      actor_id: null,
      metadata: { amount: totalAmount, payout_month: payoutMonth },
    })

    return new Response(JSON.stringify({ success: true, amount: totalAmount, transferId: transfer.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('stripe-payout-request error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
