/**
 * stripe-connect-setup
 *
 * クリエイターが振込先口座を登録したときに呼ばれる。
 * Stripe Connect Custom アカウントをプログラムで作成し、
 * 日本国内の銀行口座を外部口座として登録する。
 * クリエイター側は Stripe の UI を一切操作しなくてよい。
 *
 * 流れ：
 *   1. profiles から bank_code / bank_branch_code / bank_account_number / bank_account_holder を取得
 *   2. stripe_connect_account_id がなければ Custom アカウントを新規作成
 *   3. 外部口座（銀行口座）を登録 or 更新
 *   4. profiles.stripe_connect_account_id を保存
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

    // ── プロフィールから口座情報＋KYC情報を取得 ─────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select(`
        display_name,
        stripe_connect_account_id,
        bank_code,
        bank_branch_code,
        bank_account_number,
        bank_account_holder,
        bank_account_type,
        kyc_dob_year,
        kyc_dob_month,
        kyc_dob_day,
        kyc_phone,
        kyc_postal_code,
        kyc_address_state,
        kyc_address_city,
        kyc_address_line1,
        kyc_document_path
      `)
      .eq('id', user.id)
      .single()

    if (!profile?.bank_account_number || !profile?.bank_code || !profile?.bank_branch_code) {
      throw new Error('口座情報が登録されていません')
    }

    // Stripe のルーティング番号 = 銀行コード(4桁) + 支店コード(3桁)
    const routingNumber = profile.bank_code.padStart(4, '0') + profile.bank_branch_code.padStart(3, '0')

    let connectAccountId = profile.stripe_connect_account_id

    // ── Custom アカウント新規作成 ─────────────────────────────────
    if (!connectAccountId) {
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'

      const account = await stripe.accounts.create({
        type: 'custom',
        country: 'JP',
        email: user.email,
        capabilities: {
          transfers: { requested: true },
        },
        // プラットフォームが利用規約に同意する（クリエイターの代わりに Reach が受け入れる）
        tos_acceptance: {
          date: Math.floor(Date.now() / 1000),
          ip: clientIp,
          service_agreement: 'full',
        },
        // 支払いスケジュールを手動にする（月次一括で stripe-payout から明示的に実行）
        settings: {
          payouts: {
            schedule: { interval: 'manual' },
          },
        },
        individual: {
          email: user.email,
          // 口座名義（カタカナ）を名前として登録
          first_name: profile.bank_account_holder ?? profile.display_name ?? 'Creator',
          last_name: '',
          // 生年月日（入力済みの場合のみ設定）
          ...(profile.kyc_dob_year && profile.kyc_dob_month && profile.kyc_dob_day ? {
            dob: {
              year:  profile.kyc_dob_year,
              month: profile.kyc_dob_month,
              day:   profile.kyc_dob_day,
            },
          } : {}),
          // 電話番号
          ...(profile.kyc_phone ? { phone: `+81${profile.kyc_phone.replace(/^0/, '')}` } : {}),
          // 住所（日本語）
          ...(profile.kyc_address_state ? {
            address_kanji: {
              postal_code: profile.kyc_postal_code ?? '',
              state:       profile.kyc_address_state,
              city:        profile.kyc_address_city ?? '',
              line1:       profile.kyc_address_line1 ?? '',
              country:     'JP',
            },
          } : {}),
        },
        metadata: {
          supabase_user_id: user.id,
        },
      })

      connectAccountId = account.id

      // profiles に Connect アカウント ID を保存
      await supabase.from('profiles')
        .update({ stripe_connect_account_id: connectAccountId })
        .eq('id', user.id)
    }

    // ── 既存アカウントにKYCデータを更新（新規作成後 or 再呼び出し時） ─
    const kycUpdate: Record<string, any> = {}
    if (profile.kyc_dob_year && profile.kyc_dob_month && profile.kyc_dob_day) {
      kycUpdate['individual[dob][year]']  = String(profile.kyc_dob_year)
      kycUpdate['individual[dob][month]'] = String(profile.kyc_dob_month)
      kycUpdate['individual[dob][day]']   = String(profile.kyc_dob_day)
    }
    if (profile.kyc_phone) {
      kycUpdate['individual[phone]'] = `+81${profile.kyc_phone.replace(/^0/, '')}`
    }
    if (profile.kyc_address_state) {
      kycUpdate['individual[address_kanji][state]']       = profile.kyc_address_state
      kycUpdate['individual[address_kanji][city]']        = profile.kyc_address_city ?? ''
      kycUpdate['individual[address_kanji][line1]']       = profile.kyc_address_line1 ?? ''
      kycUpdate['individual[address_kanji][postal_code]'] = profile.kyc_postal_code ?? ''
    }
    if (Object.keys(kycUpdate).length > 0) {
      await stripe.accounts.update(connectAccountId, {
        individual: {
          ...(profile.kyc_dob_year ? { dob: { year: profile.kyc_dob_year, month: profile.kyc_dob_month!, day: profile.kyc_dob_day! } } : {}),
          ...(profile.kyc_phone ? { phone: `+81${profile.kyc_phone.replace(/^0/, '')}` } : {}),
          ...(profile.kyc_address_state ? {
            address_kanji: {
              postal_code: profile.kyc_postal_code ?? '',
              state: profile.kyc_address_state,
              city:  profile.kyc_address_city ?? '',
              line1: profile.kyc_address_line1 ?? '',
              country: 'JP',
            },
          } : {}),
        } as any,
      })
    }

    // ── 身分証明書を Stripe Files にアップロードして本人確認に登録 ──
    if (profile.kyc_document_path) {
      try {
        // Supabase Storage からファイルをダウンロード
        const { data: fileData, error: dlError } = await supabase.storage
          .from('kyc-documents')
          .download(profile.kyc_document_path)

        if (!dlError && fileData) {
          // Stripe Files API にアップロード（multipart/form-data）
          const formData = new FormData()
          formData.append('purpose', 'identity_document')
          formData.append('file', fileData, 'id_front.jpg')

          const fileRes = await fetch('https://files.stripe.com/v1/files', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`,
            },
            body: formData,
          })
          const stripeFile = await fileRes.json()

          if (stripeFile.id) {
            // 本人確認書類として登録
            await stripe.accounts.update(connectAccountId, {
              individual: {
                verification: {
                  document: { front: stripeFile.id },
                },
              } as any,
            })
          }
        }
      } catch (docErr) {
        // 書類アップロードが失敗しても全体の処理は続行する
        console.warn('ID document upload failed:', docErr)
      }
    }

    // ── 既存の外部口座を削除（口座変更に対応） ──────────────────
    const existingAccounts = await stripe.accounts.listExternalAccounts(
      connectAccountId,
      { object: 'bank_account', limit: 10 }
    )
    for (const ea of existingAccounts.data) {
      await stripe.accounts.deleteExternalAccount(connectAccountId, ea.id)
    }

    // ── 新しい銀行口座を外部口座として登録 ──────────────────────
    await stripe.accounts.createExternalAccount(connectAccountId, {
      external_account: {
        object: 'bank_account',
        country: 'JP',
        currency: 'jpy',
        // 日本の場合: 銀行コード4桁 + 支店コード3桁 = 7桁
        routing_number: routingNumber,
        account_number: profile.bank_account_number,
        account_holder_name: profile.bank_account_holder,
        account_holder_type: 'individual',
      } as any,
    })

    return new Response(JSON.stringify({ success: true, connectAccountId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('stripe-connect-setup error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
