/**
 * stripe-account-status
 *
 * クリエイターの Stripe Connect アカウントの審査状況を返す。
 * membership-settings.tsx がロード時に呼び出し、
 * 審査NGの場合はメンバーシップの有効化をブロックする。
 *
 * レスポンス例:
 *   { connected: false }                          // Stripe未連携
 *   { connected: true, ok: true }                 // 問題なし
 *   { connected: true, ok: false, reason: "..." } // 審査NG
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

// Stripe の disabled_reason を日本語に変換
function describeReason(reason: string | null | undefined): string {
  if (!reason) return '審査中です。しばらくお待ちください。'
  if (reason.includes('requirements.past_due'))  return '必要な情報が未入力です。本人確認情報を確認してください。'
  if (reason.includes('listed'))                 return 'アカウントが制限されています。サポートへお問い合わせください。'
  if (reason.includes('rejected'))               return '審査が否認されました。身分証明書を確認の上、再度アップロードしてください。'
  if (reason.includes('under_review'))           return '審査中です。通常1〜2営業日以内に完了します。'
  if (reason.includes('other'))                  return 'アカウントに問題があります。サポートへお問い合わせください。'
  return '審査が完了していません。本人確認情報を確認してください。'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 認証
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('認証情報がありません')

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) throw new Error('認証に失敗しました')

    // profiles から stripe_connect_account_id を取得
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_connect_account_id')
      .eq('id', user.id)
      .single()

    // Stripe 未連携（口座・本人確認情報が未登録）
    if (!profile?.stripe_connect_account_id) {
      return new Response(JSON.stringify({ connected: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Stripe アカウント情報を取得
    const account = await stripe.accounts.retrieve(profile.stripe_connect_account_id)

    const ok = account.charges_enabled && account.payouts_enabled

    return new Response(JSON.stringify({
      connected: true,
      ok,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      // 問題がある場合は理由を返す
      reason: ok ? null : describeReason(account.requirements?.disabled_reason),
      // 追加で必要な情報があれば返す（フロントで表示用）
      currently_due: account.requirements?.currently_due ?? [],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('stripe-account-status error:', error)
    // エラー時は「問題なし」として扱う（ネットワーク障害でブロックしない）
    return new Response(JSON.stringify({ connected: true, ok: true, error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
