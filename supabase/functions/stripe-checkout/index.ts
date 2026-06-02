import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

// プランの Price ID
const PRICE_IDS: Record<string, string> = {
  standard: Deno.env.get('STRIPE_PRICE_STANDARD')!,
  pro: Deno.env.get('STRIPE_PRICE_PRO')!,
}

// メンバーシップの固定 Price ID（Stripe ダッシュボードで事前作成した月額）
const MEMBERSHIP_PRICE_IDS: Record<number, string> = {
  500:  Deno.env.get('STRIPE_MEMBERSHIP_PRICE_500')!,
  1000: Deno.env.get('STRIPE_MEMBERSHIP_PRICE_1000')!,
  3000: Deno.env.get('STRIPE_MEMBERSHIP_PRICE_3000')!,
}

// 開発支援金は自由金額のため price_data で都度作成（一回払いなので Stripe 側の汚染は軽微）

// アプリのベースURL（Vercel本番 or ローカル開発）
const APP_URL = Deno.env.get('APP_URL') ?? 'https://reachapp.jp'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { plan, type, creatorId, amount } = body

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No auth header')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) throw new Error('Unauthorized')

    // Stripe カスタマーの取得 or 作成
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, display_name')
      .eq('id', user.id)
      .single()

    let customerId = profile?.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: profile?.display_name ?? undefined,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
      await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
    }

    // ── 開発支援金（一回払い・自由金額） ─────────────────────
    if (type === 'support') {
      if (!amount || amount < 100 || amount > 500000) throw new Error('Invalid amount')

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'jpy',
            unit_amount: amount,
            product_data: { name: 'Reach 開発支援金' },
          },
        }],
        success_url: `${APP_URL}/support?payment=success`,
        cancel_url: `${APP_URL}/support`,
        locale: 'ja',
      })

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── メンバーシップ決済（全額Reach受け取り・月次振込方式） ──
    if (type === 'membership') {
      if (!creatorId || !amount) throw new Error('creatorId and amount are required')

      // クリエイターが振込口座を登録済みか確認
      const { data: creatorProfile } = await supabase
        .from('profiles')
        .select('bank_account_number, membership_active')
        .eq('id', creatorId)
        .single()

      if (!creatorProfile?.bank_account_number) {
        throw new Error('クリエイターが振込先口座を登録していません')
      }

      // 固定 Price ID を使用（500 / 1000 / 3000 のいずれか）
      const membershipPriceId = MEMBERSHIP_PRICE_IDS[amount as number]
      if (!membershipPriceId) throw new Error(`Unsupported membership amount: ${amount}`)

      // 全額 Reach のアカウントに入る（Stripe Connect なし）
      // webhook で creator_earnings に収益を記録し、月次で振込
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: membershipPriceId, quantity: 1 }],
        success_url: `${APP_URL}/membership-checkout/${creatorId}?payment=success`,
        cancel_url: `${APP_URL}/creator/${creatorId}`,
        locale: 'ja',
        subscription_data: {
          metadata: {
            type: 'membership',
            subscriber_id: user.id,
            creator_id: creatorId,
            amount: String(amount),
          },
        },
      })

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── プランサブスクリプション ──────────────────────────────
    if (!PRICE_IDS[plan]) throw new Error('Invalid plan')

    // 既にアクティブなサブスクがある場合 → カスタマーポータルへ
    const { data: prof2 } = await supabase
      .from('profiles')
      .select('subscription_status, subscription_id')
      .eq('id', user.id)
      .single()

    if (prof2?.subscription_status === 'active' && prof2?.subscription_id) {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${APP_URL}/plan`,
      })
      return new Response(JSON.stringify({ url: portalSession.url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 新規チェックアウト
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      success_url: `${APP_URL}/plan?payment=success`,
      cancel_url: `${APP_URL}/plan?payment=cancel`,
      locale: 'ja',
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan },
      },
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
