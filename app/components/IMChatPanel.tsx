import { useState, useCallback, useRef, useEffect } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Modal, Pressable,
} from 'react-native'
import { router } from 'expo-router'
import { useTalkContext } from '../contexts/TalkContext'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'
import { sendPushToUsers } from '../../lib/notifications'

const isWeb = Platform.OS === 'web'

type IMMessage = {
  id: string
  content: string
  sender_id: string
  created_at: string
  reply_to_id: string | null
  reply_preview?: string | null
}

interface Props {
  partnerId: string
  onClose?: () => void
  isPanel?: boolean
}

export default function IMChatPanel({ partnerId, onClose, isPanel }: Props) {
  const { triggerDmReload } = useTalkContext()
  const [myId, setMyId] = useState<string | null>(null)
  const [myName, setMyName] = useState('')
  const [myAvatar, setMyAvatar] = useState<string | null>(null)
  const [partnerName, setPartnerName] = useState('')
  const [partnerAvatar, setPartnerAvatar] = useState<string | null>(null)
  const [messages, setMessages] = useState<IMMessage[]>([])
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<IMMessage | null>(null)
  const [loading, setLoading] = useState(true)
  const [longPressMsg, setLongPressMsg] = useState<IMMessage | null>(null)
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)
  const flatListRef = useRef<FlatList>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const myIdRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMyId(user.id)
    myIdRef.current = user.id

    const [{ data: profile }, { data: myProfile }] = await Promise.all([
      supabase.from('profiles').select('display_name, avatar_url').eq('id', partnerId).single(),
      supabase.from('profiles').select('display_name, avatar_url').eq('id', user.id).single(),
    ])
    setPartnerName(profile?.display_name ?? '')
    setPartnerAvatar(profile?.avatar_url ?? null)
    setMyName(myProfile?.display_name ?? '')
    setMyAvatar(myProfile?.avatar_url ?? null)

    const { data: msgs } = await supabase
      .from('messages')
      .select('id, content, sender_id, created_at, reply_to_id')
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`
      )
      .is('broadcast_id', null)
      .order('created_at', { ascending: true })

    if (!msgs) { setLoading(false); return }

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

  useEffect(() => {
    setLoading(true)
    setMessages([])
    load()
  }, [load])

  // ポーリング：3秒おきに新着メッセージを取得（Realtimeの代替）
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!myIdRef.current) return
      const { data: msgs } = await supabase
        .from('messages')
        .select('id, content, sender_id, created_at, reply_to_id')
        .or(
          `and(sender_id.eq.${myIdRef.current},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${myIdRef.current})`
        )
        .is('broadcast_id', null)
        .order('created_at', { ascending: true })
      if (!msgs) return
      setMessages(prev => {
        const prevIds = new Set(prev.map(m => m.id))
        const newMsgs = msgs.filter((m: any) => !prevIds.has(m.id))
        if (newMsgs.length === 0) return prev
        triggerDmReload()
        setTimeout(() => flatListRef.current?.scrollToEnd(), 100)
        return [...prev, ...newMsgs.map((m: any) => ({ ...m, reply_preview: null }))]
      })
    }, 2000)
    return () => clearInterval(timer)
  }, [partnerId, triggerDmReload])

  const handleSend = async () => {
    if (!text.trim() || !myIdRef.current) return
    const content = text.trim()
    setText('')
    const insertData: any = { sender_id: myIdRef.current, receiver_id: partnerId, content }
    if (replyTo) insertData.reply_to_id = replyTo.id
    const { data } = await supabase.from('messages').insert(insertData).select().single()
    if (data) {
      setMessages(prev => [...prev, { ...data, reply_preview: replyTo ? replyTo.content : null }])
      setTimeout(() => flatListRef.current?.scrollToEnd(), 100)
    }
    setReplyTo(null)
    triggerDmReload() // 送信直後にDMリストを更新

    const { data: myProfile } = await supabase
      .from('profiles').select('display_name').eq('id', myIdRef.current).single()
    sendPushToUsers([partnerId], myProfile?.display_name ?? 'IM', content.slice(0, 80))

    setTimeout(async () => {
      await supabase.rpc('check_and_send_auto_response', {
        p_creator_id: partnerId,
        p_receiver_id: myIdRef.current,
        p_message: content,
      })
    }, 1200)
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
      <View style={[styles.header, isPanel && styles.headerPanel]}>
        <TouchableOpacity
          onPress={onClose ?? (() => router.back())}
          style={styles.backButton}
        >
          <Ionicons
            name={isPanel ? 'close' : 'chevron-back'}
            size={isPanel ? 22 : 24}
            color={Colors.accent}
          />
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
                activeOpacity={0.9}
                style={[styles.msgRow, isOwn && styles.msgRowOwn]}
                onLongPress={!isWeb ? () => setLongPressMsg(item) : undefined}
                delayLongPress={400}
                {...(isWeb ? {
                  onMouseEnter: () => setHoveredMsgId(item.id),
                  onMouseLeave: () => setHoveredMsgId(null),
                } as any : {})}
              >
                {!isOwn ? (
                  partnerAvatar
                    ? <Image source={{ uri: partnerAvatar }} style={styles.msgAvatar} />
                    : <View style={styles.msgAvatarFallback}>
                        <Text style={styles.msgAvatarText}>{partnerName[0]}</Text>
                      </View>
                ) : (
                  myAvatar
                    ? <Image source={{ uri: myAvatar }} style={styles.msgAvatar} />
                    : <View style={styles.msgAvatarFallback}>
                        <Text style={styles.msgAvatarText}>{myName[0]}</Text>
                      </View>
                )}
                <View style={[styles.bubbleWrap, isOwn && styles.bubbleWrapOwn]}>
                  <Text style={styles.msgNameLabel}>{isOwn ? myName : partnerName}</Text>
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
                  <View style={[styles.msgFooter, isOwn && styles.msgFooterOwn]}>
                    <Text style={styles.msgTime}>{formatTime(item.created_at)}</Text>
                    {isWeb && hoveredMsgId === item.id && (
                      <TouchableOpacity
                        style={styles.moreBtn}
                        onPress={() => setLongPressMsg(item)}
                      >
                        <Text style={styles.moreBtnText}>···</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            </>
          )
        }}
      />

      <Modal
        visible={!!longPressMsg}
        transparent
        animationType="fade"
        onRequestClose={() => setLongPressMsg(null)}
      >
        <Pressable style={styles.popupOverlay} onPress={() => setLongPressMsg(null)}>
          <View style={styles.popupBox}>
            <TouchableOpacity
              style={styles.popupBtn}
              onPress={() => {
                if (longPressMsg) setReplyTo(longPressMsg)
                setLongPressMsg(null)
              }}
            >
              <Ionicons name="return-down-forward-outline" size={22} color={Colors.text} />
              <Text style={styles.popupBtnText}>返信する</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

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
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerPanel: { paddingTop: 14 },
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
  msgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  msgRowOwn: { flexDirection: 'row-reverse' },
  msgAvatar: { width: 32, height: 32, borderRadius: 16 },
  msgAvatarFallback: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center',
  },
  msgAvatarText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  bubbleWrap: { maxWidth: '75%', alignItems: 'flex-start' },
  bubbleWrapOwn: { alignItems: 'flex-end' },
  msgNameLabel: { fontSize: 11, color: Colors.textLight, fontWeight: '600', marginBottom: 3 },
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
    borderRadius: 18, padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  bubbleOther: { backgroundColor: Colors.white, borderBottomLeftRadius: 4 },
  bubbleOwn: { backgroundColor: Colors.accent, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, color: Colors.text, lineHeight: 21 },
  bubbleTextOwn: { color: Colors.white },
  msgFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  msgFooterOwn: { flexDirection: 'row-reverse' },
  msgTime: { fontSize: 10, color: Colors.textLight },
  moreBtn: {
    paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  moreBtnText: { fontSize: 14, color: Colors.textLight, letterSpacing: 2 },
  popupOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  popupBox: {
    backgroundColor: Colors.white, borderRadius: 16,
    paddingVertical: 8, paddingHorizontal: 4, minWidth: 200,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  popupBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, paddingHorizontal: 20,
  },
  popupBtnText: { fontSize: 16, color: Colors.text, fontWeight: '500' },
  inputArea: { backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border },
  replyBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
  },
  replyBarText: { flex: 1, fontSize: 12, color: Colors.accent, fontStyle: 'italic' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, gap: 8 },
  input: {
    flex: 1, backgroundColor: Colors.white,
    borderRadius: 22, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: Colors.text, maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: '#B0B0B0' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textLight },
})
