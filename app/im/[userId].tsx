import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image,
} from 'react-native'
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'
import { sendPushToUsers } from '../../lib/notifications'

type IMMessage = {
  id: string
  content: string
  sender_id: string
  created_at: string
  reply_to_id: string | null
  reply_preview?: string | null
}

export default function IMScreen() {
  const { userId: partnerId } = useLocalSearchParams<{ userId: string }>()
  const [myId, setMyId] = useState<string | null>(null)
  const [partnerName, setPartnerName] = useState('')
  const [partnerAvatar, setPartnerAvatar] = useState<string | null>(null)
  const [messages, setMessages] = useState<IMMessage[]>([])
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<IMMessage | null>(null)
  const [loading, setLoading] = useState(true)
  const flatListRef = useRef<FlatList>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMyId(user.id)

    const { data: profile } = await supabase
      .from('profiles').select('display_name, avatar_url').eq('id', partnerId).single()
    setPartnerName(profile?.display_name ?? '')
    setPartnerAvatar(profile?.avatar_url ?? null)

    // IMメッセージ（broadcast_id IS NULL）
    const { data: msgs } = await supabase
      .from('messages')
      .select('id, content, sender_id, created_at, reply_to_id')
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`
      )
      .is('broadcast_id', null)
      .order('created_at', { ascending: true })

    if (!msgs) { setLoading(false); return }

    // reply_to_idのプレビュー取得
    const replyIds = [...new Set(msgs.filter((m: any) => m.reply_to_id).map((m: any) => m.reply_to_id))]
    const replyMap: Record<string, string> = {}
    if (replyIds.length > 0) {
      const { data: replyMsgs } = await supabase
        .from('messages').select('id, content').in('id', replyIds)
      for (const r of (replyMsgs ?? [])) replyMap[r.id] = r.content
    }

    setMessages(msgs.map((m: any) => ({
      ...m,
      reply_preview: m.reply_to_id ? (replyMap[m.reply_to_id] ?? null) : null,
    })))
    setLoading(false)
  }, [partnerId])

  useFocusEffect(useCallback(() => {
    load()
    // リアルタイム購読
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const channel = supabase
        .channel(`im-${user.id}-${partnerId}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'messages',
          filter: `sender_id=eq.${partnerId}`,
        }, async (payload) => {
          if (payload.new.broadcast_id || payload.new.receiver_id !== user.id) return
          let reply_preview = null
          if (payload.new.reply_to_id) {
            const { data } = await supabase.from('messages').select('content').eq('id', payload.new.reply_to_id).single()
            reply_preview = data?.content ?? null
          }
          setMessages(prev => [...prev, { ...payload.new as any, reply_preview }])
          setTimeout(() => flatListRef.current?.scrollToEnd(), 100)
        })
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    })
  }, [load, partnerId]))

  const handleSend = async () => {
    if (!text.trim() || !myId) return
    const content = text.trim()
    setText('')
    const insertData: any = {
      sender_id: myId,
      receiver_id: partnerId,
      content,
    }
    if (replyTo) {
      insertData.reply_to_id = replyTo.id
    }
    const { data } = await supabase.from('messages').insert(insertData).select().single()
    if (data) {
      setMessages(prev => [...prev, {
        ...data,
        reply_preview: replyTo ? replyTo.content : null,
      }])
      setTimeout(() => flatListRef.current?.scrollToEnd(), 100)
    }
    setReplyTo(null)
    const { data: myProfile } = await supabase
      .from('profiles').select('display_name').eq('id', myId).single()
    sendPushToUsers([partnerId], myProfile?.display_name ?? 'IM', content.slice(0, 80))

    // 自動応答チェック（相手クリエイターのキーワードルールを確認）
    const { data: autoRules } = await supabase
      .from('auto_responses')
      .select('keyword, response_text, match_count')
      .eq('creator_id', partnerId)
      .eq('is_active', true)
    const matched = (autoRules ?? []).find((rule: any) =>
      content.toLowerCase().includes(rule.keyword.toLowerCase())
    )
    if (matched) {
      // 少し遅延して自動返信（自然に見せる）
      setTimeout(async () => {
        const { data: autoReply } = await supabase.from('messages').insert({
          sender_id: partnerId,
          receiver_id: myId,
          content: matched.response_text,
        }).select().single()
        if (autoReply) {
          setMessages(prev => [...prev, { ...autoReply, reply_preview: null }])
          setTimeout(() => flatListRef.current?.scrollToEnd(), 100)
        }
        // マッチカウントを増やす
        await supabase.from('auto_responses')
          .update({ match_count: matched.match_count + 1 })
          .eq('creator_id', partnerId)
          .eq('keyword', matched.keyword)
      }, 1200)
    }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const showDate = (cur: IMMessage, prev: IMMessage | null) => {
    if (!prev) return true
    return new Date(cur.created_at).toDateString() !== new Date(prev.created_at).toDateString()
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {partnerAvatar ? (
            <Image source={{ uri: partnerAvatar }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarFallback}>
              <Text style={styles.headerAvatarText}>{partnerName[0]}</Text>
            </View>
          )}
          <View>
            <Text style={styles.headerName}>{partnerName}</Text>
            <Text style={styles.headerSub}>メッセージ</Text>
          </View>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={() => (
          <View style={styles.emptyWrap}>
            <Ionicons name="chatbubbles-outline" size={40} color={Colors.border} />
            <Text style={styles.emptyText}>まだメッセージはありません</Text>
          </View>
        )}
        renderItem={({ item, index }) => {
          const isOwn = item.sender_id === myId
          const prev = index > 0 ? messages[index - 1] : null
          return (
            <>
              {showDate(item, prev) && (
                <View style={styles.dateDivider}>
                  <Text style={styles.dateText}>
                    {new Date(item.created_at).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}
                  </Text>
                </View>
              )}
              <TouchableOpacity
                onLongPress={() => setReplyTo(item)}
                activeOpacity={0.9}
                style={[styles.msgRow, isOwn && styles.msgRowOwn]}
              >
                {!isOwn && (
                  partnerAvatar
                    ? <Image source={{ uri: partnerAvatar }} style={styles.msgAvatar} />
                    : <View style={styles.msgAvatarFallback}>
                        <Text style={styles.msgAvatarText}>{partnerName[0]}</Text>
                      </View>
                )}
                <View style={styles.bubbleWrap}>
                  {item.reply_preview && (
                    <View style={[styles.replyQuote, isOwn && styles.replyQuoteOwn]}>
                      <Ionicons name="return-down-forward-outline" size={11} color={isOwn ? 'rgba(255,255,255,0.7)' : Colors.textLight} />
                      <Text style={[styles.replyQuoteText, isOwn && styles.replyQuoteTextOwn]} numberOfLines={1}>
                        {item.reply_preview}
                      </Text>
                    </View>
                  )}
                  <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                    <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>{item.content}</Text>
                  </View>
                  <Text style={[styles.msgTime, isOwn && styles.msgTimeOwn]}>{formatTime(item.created_at)}</Text>
                </View>
              </TouchableOpacity>
            </>
          )
        }}
      />

      <View style={styles.inputArea}>
        {replyTo && (
          <View style={styles.replyBar}>
            <Ionicons name="return-down-forward-outline" size={14} color={Colors.accent} />
            <Text style={styles.replyBarText} numberOfLines={1}>{replyTo.content}</Text>
            <TouchableOpacity onPress={() => setReplyTo(null)}>
              <Ionicons name="close" size={16} color={Colors.textLight} />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="メッセージ..."
            placeholderTextColor={Colors.textLight}
            value={text}
            onChangeText={setText}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !text.trim() && styles.sendDisabled]}
            onPress={handleSend}
            disabled={!text.trim()}
          >
            <Ionicons name="send" size={18} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F0F0' },
  header: {
    backgroundColor: Colors.white,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'center' },
  headerAvatar: { width: 36, height: 36, borderRadius: 18 },
  headerAvatarFallback: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center',
  },
  headerAvatarText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  headerName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  headerSub: { fontSize: 10, color: Colors.textLight },
  messageList: { padding: 16, gap: 4, paddingBottom: 16 },
  dateDivider: { alignItems: 'center', marginVertical: 10 },
  dateText: {
    fontSize: 11, color: Colors.textLight,
    backgroundColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12,
  },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 6 },
  msgRowOwn: { flexDirection: 'row-reverse' },
  msgAvatar: { width: 32, height: 32, borderRadius: 16, marginBottom: 18 },
  msgAvatarFallback: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
  },
  msgAvatarText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  bubbleWrap: { maxWidth: '75%', alignItems: 'flex-start' },
  replyQuote: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
    marginBottom: 3, maxWidth: '100%',
  },
  replyQuoteOwn: { backgroundColor: 'rgba(255,255,255,0.25)' },
  replyQuoteText: { fontSize: 11, color: Colors.textLight, flex: 1 },
  replyQuoteTextOwn: { color: 'rgba(255,255,255,0.8)' },
  bubble: {
    borderRadius: 18,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  bubbleOther: { backgroundColor: Colors.white, borderBottomLeftRadius: 4 },
  bubbleOwn: { backgroundColor: Colors.accent, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, color: Colors.text, lineHeight: 21 },
  bubbleTextOwn: { color: Colors.white },
  msgTime: { fontSize: 10, color: Colors.textLight, marginTop: 3, alignSelf: 'flex-start' },
  msgTimeOwn: { alignSelf: 'flex-end' },
  inputArea: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  replyBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
  },
  replyBarText: { flex: 1, fontSize: 12, color: Colors.accent, fontStyle: 'italic' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: '#B0B0B0' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textLight },
})
