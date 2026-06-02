/**
 * Stripe Connect Express オンボーディング
 *
 * クリエイターが収益受け取り用の Stripe アカウントを開設するためのリンクを生成する。
 * 初回呼び出し時は Stripe に Connect Express アカウントを作成して profiles に保存。
 * 既存アカウントがある場合はアカウントリンクを再発行する。
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

const APP_URL = Deno.env.get('APP_URL') ?? 'https://reachapp.jp'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No auth header')

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) throw new Error('Unauthorized')

    // 既存の Connect アカウント ID を確認
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_connect_account_id, display_name')
      .eq('id', user.id)
      .single()

    let connectAccountId = profile?.stripe_connect_account_id

    // アカウントがなければ新規作成
    if (!connectAccountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'JP',
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        business_profile: {
          name: profile?.display_name ?? undefined,
          // Reachプラットフォームのクリエイターとして事前入力
          // → クリエイターが業種・説明を手入力する手間を省く
          url: 'https://reachapp.jp',
          mcc: '7372', // コンピュータプログラミング・データ処理（コンテンツ配信に近い）
          product_description: 'Reachを通じてファンにコンテンツを配信するクリエイターです。月額メンバーシップや限定配信を提供しています。',
        },
        metadata: { supabase_user_id: user.id },
      })
      connectAccountId = account.id

      // profiles に保存
      await supabase.from('profiles')
        .update({ stripe_connect_account_id: connectAccountId })
        .eq('id', user.id)
    }

    // オンボーディングリンクを生成（有効期限があるため毎回新規発行）
    const accountLink = await stripe.accountLinks.create({
      account: connectAccountId,
      refresh_url: `${APP_URL}/membership-settings?connect=refresh`,
      return_url:  `${APP_URL}/membership-settings?connect=success`,
      type: 'account_onboarding',
    })

    return new Response(JSON.stringify({ url: accountLink.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
