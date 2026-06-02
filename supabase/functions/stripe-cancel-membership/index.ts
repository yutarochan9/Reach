/**
 * stripe-cancel-membership
 *
 * ファンがメンバーシップを解約するときに呼ばれる。
 * Stripe のサブスクリプションを「期間終了時にキャンセル」に設定する。
 * → ファンは残り期間まで引き続き利用でき、次の更新日以降は課金されない。
 * → Webhook が customer.subscription.deleted を受信した時点で DB を canceled に更新する。
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('認証情報がありません')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) throw new Error('認証に失敗しました')

    const { creatorId } = await req.json()
    if (!creatorId) throw new Error('creatorId が必要です')

    // 対象サブスクリプションを取得（本人確認）
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id, stripe_subscription_id, status')
      .eq('subscriber_id', user.id)
      .eq('creator_id', creatorId)
      .eq('status', 'active')
      .maybeSingle()

    if (!sub?.stripe_subscription_id) {
      throw new Error('有効なメンバーシップが見つかりません')
    }

    // Stripe で期間終了時キャンセルに設定
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
    })

    // DB を即座に 'canceling' に更新（次回更新日までは利用可能）
    await supabase.from('subscriptions').update({
      status: 'canceling',
      updated_at: new Date().toISOString(),
    }).eq('id', sub.id)

    // クリエイターへ解約通知
    await supabase.from('notifications').insert({
      user_id: creatorId,
      type: 'membership_canceled',
      actor_id: user.id,
    })

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
