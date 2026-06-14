import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Image,
  ActivityIndicator, Alert,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import DefaultAvatar from '../components/DefaultAvatar'
import { Colors } from '../../constants/colors'

type Message = {
  id: string
  content: string
  sender_id: string
  display_name: string
  avatar_url: string | null
  is_creator_message: boolean
  created_at: string
  deleted_at: string | null
}

type SpotInfo = {
  id: string
  title: string | null
  creator_id: string
  creator_name: string
  creator_avatar: string | null
  opened_at: string
  auto_close_at: string
  status: string
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 残り時間（秒）
function secondsLeft(autoCloseIso: string): number {
  return Math.max(0, (new Date(autoCloseIso).getTime() - Date.now()) / 1000)
}

export default function SpotChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [spot, setSpot] = useState<SpotInfo | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [myId, setMyId] = useState<string | null>(null)
  const [isCreator, setIsCreator] = useState(false)
  const [creatorHeaderOpen, setCreatorHeaderOpen] = useState(true)
  const [timeLeftStr, setTimeLeftStr] = useState('')
  const flatListRef = useRef<FlatList>(null)

  // スポット情報と初期メッセージ取得
  const loadSpot = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMyId(user.id)

    const { data: spotData } = await supabase
      .from('spots')
      .select('id, title, creator_id, opened_at, auto_close_at, status')
      .eq('id', id)
      .single()

    if (!spotData) { router.back(); return }

    const { data: creator } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', spotData.creator_id)
      .single()

    setSpot({
      ...spotData,
      creator_name: (creator as any)?.display_name ?? '不明',
      creator_avatar: (creator as any)?.avatar_url ?? null,
    })
    setIsCreator(user.id === spotData.creator_id)

    // 参加記録
    await supabase.from('spot_participants').upsert(
      { spot_id: id, user_id: user.id },
      { onConflict: 'spot_id,user_id' }
    )

    await loadMessages()
    setLoading(false)
  }, [id])

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from('spot_messages')
      .select('id, content, sender_id, is_creator_message, created_at, deleted_at')
      .eq('spot_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(200)

    if (!data?.length) { setMessages([]); return }

    const senderIds = [...new Set(data.map((m: any) => m.sender_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', senderIds)

    const profileMap: Record<string, any> = {}
    for (const p of (profiles ?? [])) profileMap[p.id] = p

    setMessages(data.map((m: any) => ({
      ...m,
      display_name: profileMap[m.sender_id]?.display_name ?? '不明',
      avatar_url: profileMap[m.sender_id]?.avatar_url ?? null,
    })))
  }, [id])

  useEffect(() => { loadSpot() }, [loadSpot])

  // リアルタイム購読
  useEffect(() => {
    const channel = supabase
      .channel(`spot:${id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'spot_messages',
        filter: `spot_id=eq.${id}`,
      }, () => { loadMessages() })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'spots',
        filter: `id=eq.${id}`,
      }, (payload) => {
        if (payload.new.status === 'closed') {
          Alert.alert('スポット終了', 'このスポットは終了しました')
          router.back()
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id, loadMessages])

  // 残り時間カウントダウン
  useEffect(() => {
    if (!spot) return
    const update = () => {
      const secs = secondsLeft(spot.auto_close_at)
      if (secs <= 0) { setTimeLeftStr('終了間近'); return }
      if (secs < 60) setTimeLeftStr(`残り${Math.ceil(secs)}秒`)
      else setTimeLeftStr(`残り${Math.ceil(secs / 60)}分`)
    }
    update()
    const timer = setInterval(update, 10000)
    return () => clearInterval(timer)
  }, [spot])

  const sendMessage = async () => {
    if (!input.trim() || !myId || !spot) return
    const content = input.trim()
    setInput('')
    await supabase.from('spot_messages').insert({
      spot_id: id,
      sender_id: myId,
      content,
      is_creator_message: isCreator,
    })
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
  }

  // クリエイターがスポットを終了
  const closeSpot = async () => {
    Alert.alert('スポットを終了', 'スポットを終了しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '終了する', style: 'destructive',
        onPress: async () => {
          await supabase.from('spots').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', id)
          router.back()
        },
      },
    ])
  }

  // クリエイターによるメッセージ削除
  const deleteMessage = async (msgId: string) => {
    await supabase.from('spot_messages').update({ deleted_at: new Date().toISOString() }).eq('id', msgId)
    setMessages(prev => prev.filter(m => m.id !== msgId))
  }

  if (loading || !spot) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  // 配信者の最新コメント（ヘッダー表示用）
  const creatorMessages = messages.filter(m => m.is_creator_message)
  const latestCreatorMsg = creatorMessages[creatorMessages.length - 1]

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.accent} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {spot.creator_avatar
            ? <Image source={{ uri: spot.creator_avatar }} style={styles.headerAvatar} />
            : <DefaultAvatar size={30} />
          }
          <View>
            <Text style={styles.headerName}>{spot.creator_name}</Text>
            <Text style={styles.headerSub}>{spot.title ?? 'スポット開催中'}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <Text style={styles.timeLeft}>{timeLeftStr}</Text>
        </View>
        {isCreator && (
          <TouchableOpacity onPress={closeSpot} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>終了</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 配信者コメント固定エリア */}
      {latestCreatorMsg && (
        <TouchableOpacity
          style={styles.creatorHeader}
          onPress={() => setCreatorHeaderOpen(v => !v)}
          activeOpacity={0.8}
        >
          <Ionicons name="megaphone-outline" size={14} color={Colors.accent} style={{ marginRight: 6 }} />
          {creatorHeaderOpen ? (
            <Text style={styles.creatorHeaderText} numberOfLines={2}>{latestCreatorMsg.content}</Text>
          ) : (
            <Text style={styles.creatorHeaderText} numberOfLines={1}>配信者のコメントを見る</Text>
          )}
          <Ionicons
            name={creatorHeaderOpen ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={Colors.textLight}
            style={{ marginLeft: 'auto' }}
          />
        </TouchableOpacity>
      )}

      {/* チャット */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={() => (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>まだメッセージがありません{'\n'}最初に話しかけてみよう！</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={[styles.messageRow, item.is_creator_message && styles.messageRowCreator]}>
            {item.avatar_url
              ? <Image source={{ uri: item.avatar_url }} style={styles.msgAvatar} />
              : <DefaultAvatar size={32} />
            }
            <View style={[styles.messageBubble, item.is_creator_message && styles.messageBubbleCreator]}>
              <View style={styles.messageHeader}>
                <Text style={[styles.messageSender, item.is_creator_message && styles.messageSenderCreator]}>
                  {item.display_name}
                  {item.is_creator_message && ' 🎙'}
                </Text>
                <Text style={styles.messageTime}>{formatTime(item.created_at)}</Text>
                {isCreator && item.sender_id !== myId && (
                  <TouchableOpacity onPress={() => deleteMessage(item.id)} style={{ marginLeft: 6 }}>
                    <Ionicons name="trash-outline" size={12} color={Colors.border} />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.messageContent}>{item.content}</Text>
            </View>
          </View>
        )}
      />

      {/* 入力エリア */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="メッセージを送る..."
          placeholderTextColor={Colors.textLight}
          multiline
          maxLength={200}
          returnKeyType="send"
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!input.trim()}
        >
          <Ionicons name="send" size={18} color={Colors.white} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.header,
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
    paddingBottom: 12, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: 8,
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerAvatar: { width: 30, height: 30, borderRadius: 15 },
  headerName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  headerSub: { fontSize: 11, color: Colors.textLight },
  headerRight: { alignItems: 'flex-end', gap: 2 },

  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEE2E2', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  liveText: { fontSize: 10, fontWeight: '800', color: '#EF4444' },
  timeLeft: { fontSize: 10, color: Colors.accent, fontWeight: '600' },

  closeBtn: {
    backgroundColor: '#EF4444', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  closeBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },

  creatorHeader: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.header,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  creatorHeaderText: { fontSize: 13, color: Colors.text, flex: 1, fontWeight: '500' },

  messageList: { paddingHorizontal: 12, paddingVertical: 12, gap: 10 },

  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  emptyText: { textAlign: 'center', color: Colors.textLight, fontSize: 14, lineHeight: 22 },

  messageRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  messageRowCreator: { /* 配信者は同じ並びでデザインで区別 */ },
  msgAvatar: { width: 32, height: 32, borderRadius: 16, marginTop: 2 },

  messageBubble: {
    flex: 1, backgroundColor: Colors.white,
    borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  messageBubbleCreator: {
    backgroundColor: '#FDF3E7',
    borderColor: Colors.accent,
    borderWidth: 1.5,
  },

  messageHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  messageSender: { fontSize: 12, fontWeight: '700', color: Colors.textLight },
  messageSenderCreator: { color: Colors.accent },
  messageTime: { fontSize: 10, color: Colors.border },
  messageContent: { fontSize: 14, color: Colors.text, lineHeight: 20 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    backgroundColor: Colors.white,
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  input: {
    flex: 1, fontSize: 14, color: Colors.text,
    backgroundColor: Colors.background, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.border },
})
