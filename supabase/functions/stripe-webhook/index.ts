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

const PRICE_TO_PLAN: Record<string, string> = {
  [Deno.env.get('STRIPE_PRICE_STANDARD') ?? '']: 'standard',
  [Deno.env.get('STRIPE_PRICE_PRO') ?? '']: 'pro',
}

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    )
  } catch (err) {
    console.error('Webhook signature failed:', err)
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.CheckoutSession
        const meta = session.subscription_data?.metadata ?? {}

        if (meta.type === 'membership') {
          // ── メンバーシップ加入 ────────────────────────────────
          const subscriberId = meta.subscriber_id
          const creatorId = meta.creator_id
          const amount = parseInt(meta.amount ?? '0', 10)

          if (subscriberId && creatorId) {
            // 既存レコードがあれば更新（重複防止）
            const { data: existing } = await supabase
              .from('subscriptions')
              .select('id')
              .eq('subscriber_id', subscriberId)
              .eq('creator_id', creatorId)
              .maybeSingle()

            if (existing) {
              await supabase.from('subscriptions').update({
                status: 'active',
                stripe_subscription_id: session.subscription as string,
                updated_at: new Date().toISOString(),
              }).eq('id', existing.id)
            } else {
              await supabase.from('subscriptions').insert({
                subscriber_id: subscriberId,
                creator_id: creatorId,
                status: 'active',
                stripe_subscription_id: session.subscription as string,
              })
            }

            // 収益を記録（クリエイター70%・Reach30%）
            if (amount > 0) {
              const creatorAmount = Math.floor(amount * 0.7)
              const reachAmount = amount - creatorAmount
              await supabase.from('creator_earnings').insert({
                creator_id: creatorId,
                subscriber_id: subscriberId,
                amount,
                creator_amount: creatorAmount,
                reach_amount: reachAmount,
                stripe_subscription_id: session.subscription as string,
                payout_status: 'pending',
              })
            }

            // クリエイターへ通知（新規メンバー加入）
            await supabase.from('notifications').insert({
              user_id: creatorId,
              type: 'membership_joined',
              actor_id: subscriberId,
              metadata: { amount },
            })
          }
        } else {
          // ── プランサブスクリプション ──────────────────────────
          const userId = meta.supabase_user_id
          const plan = meta.plan
          if (userId && plan) {
            await supabase.from('profiles').update({
              plan,
              subscription_id: session.subscription as string,
              subscription_status: 'active',
              plan_expires_at: null,
            }).eq('id', userId)
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const meta = sub.metadata ?? {}

        if (meta.type === 'membership') {
          // メンバーシップのステータス更新
          const subscriberId = meta.subscriber_id
          const creatorId = meta.creator_id
          if (subscriberId && creatorId) {
            await supabase.from('subscriptions').update({
              status: sub.status === 'active' ? 'active' : 'canceled',
              updated_at: new Date().toISOString(),
            }).eq('subscriber_id', subscriberId).eq('creator_id', creatorId)
          }
        } else {
          // プランのステータス更新
          const userId = meta.supabase_user_id
          const priceId = sub.items.data[0]?.price.id
          const plan = PRICE_TO_PLAN[priceId] ?? 'free'
          if (userId) {
            await supabase.from('profiles').update({
              plan: sub.status === 'active' ? plan : 'free',
              subscription_status: sub.status,
              plan_expires_at: ['canceled', 'unpaid'].includes(sub.status)
                ? new Date(sub.current_period_end * 1000).toISOString()
                : null,
            }).eq('id', userId)
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const meta = sub.metadata ?? {}

        if (meta.type === 'membership') {
          const subscriberId = meta.subscriber_id
          const creatorId = meta.creator_id
          if (subscriberId && creatorId) {
            await supabase.from('subscriptions').update({
              status: 'canceled',
              updated_at: new Date().toISOString(),
            }).eq('subscriber_id', subscriberId).eq('creator_id', creatorId)
          }
        } else {
          const userId = meta.supabase_user_id
          if (userId) {
            await supabase.from('profiles').update({
              plan: 'free',
              subscription_id: null,
              subscription_status: 'canceled',
              plan_expires_at: null,
            }).eq('id', userId)
          }
        }
        break
      }

      // Connect アカウントの onboarding 完了を検知してフラグを立てる
      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        const isOnboarded =
          account.details_submitted &&
          account.charges_enabled &&
          account.payouts_enabled

        if (isOnboarded) {
          await supabase.from('profiles').update({
            stripe_connect_onboarded: true,
          }).eq('stripe_connect_account_id', account.id)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
        if (profiles?.[0]) {
          await supabase.from('profiles').update({ subscription_status: 'past_due' })
            .eq('id', profiles[0].id)
        }
        break
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err)
    return new Response('Handler error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
