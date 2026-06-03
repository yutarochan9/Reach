/**
 * send-step-messages
 * 毎日1回呼び出して、ステップ配信の該当メッセージを送信する
 * 呼び出し方: Supabase Dashboard > Edge Functions > send-step-messages > Invoke
 *             または cron で毎日 9:00 JST に invoke
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // アクティブなシーケンスの全エンロールメントを取得
  const { data: enrollments, error: enrollErr } = await supabase
    .from('step_enrollments')
    .select('id, follower_id, creator_id, sequence_id, enrolled_at')
    .eq('completed', false)

  if (enrollErr) {
    return new Response(JSON.stringify({ error: enrollErr.message }), { status: 500, headers: corsHeaders })
  }

  let sent = 0

  for (const enrollment of (enrollments ?? [])) {
    const enrolledAt = new Date(enrollment.enrolled_at)
    const now = new Date()
    const daysSince = Math.floor((now.getTime() - enrolledAt.getTime()) / (1000 * 60 * 60 * 24))

    // 今日送るべきステップメッセージを取得
    const { data: messages } = await supabase
      .from('step_messages')
      .select('id, content, is_subscriber_only')
      .eq('sequence_id', enrollment.sequence_id)
      .eq('day_offset', daysSince)

    if (!messages?.length) continue

    // メンシプ限定メッセージを送るかどうか: フォロワーがアクティブ会員か確認
    let isSubscriber = false
    if (messages.some((m: any) => m.is_subscriber_only)) {
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('subscriber_id', enrollment.follower_id)
        .eq('creator_id', enrollment.creator_id)
        .eq('status', 'active')
        .maybeSingle()
      isSubscriber = !!subData
    }

    // 既に今日送信済みか確認（broadcasts テーブルで重複チェック）
    for (const msg of messages) {
      // メンシプ限定メッセージは会員のみ送信
      if ((msg as any).is_subscriber_only && !isSubscriber) continue

      const { count } = await supabase
        .from('broadcasts')
        .select('id', { count: 'exact', head: true })
        .eq('sender_id', enrollment.creator_id)
        .eq('step_message_id', msg.id)
        .eq('recipient_id', enrollment.follower_id)

      if ((count ?? 0) > 0) continue // 送信済み

      // broadcasts テーブルに挿入（DM的な扱い）
      await supabase.from('broadcasts').insert({
        sender_id: enrollment.creator_id,
        content: msg.content,
        status: 'published',
        target: 'step',
        step_message_id: msg.id,
        recipient_id: enrollment.follower_id,
        is_subscriber_only: (msg as any).is_subscriber_only ?? false,
      })

      sent++
    }

    // シーケンスの最後のメッセージを超えたら完了フラグ
    const { count: totalMessages } = await supabase
      .from('step_messages')
      .select('id', { count: 'exact', head: true })
      .eq('sequence_id', enrollment.sequence_id)
      .gt('day_offset', daysSince)

    if ((totalMessages ?? 0) === 0) {
      await supabase
        .from('step_enrollments')
        .update({ completed: true })
        .eq('id', enrollment.id)
    }
  }

  return new Response(
    JSON.stringify({ success: true, sent, enrollments: (enrollments ?? []).length }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
