import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Modal, Pressable, Alert,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { useTalkContext } from '../contexts/TalkContext'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'
import { sendPushToUsers } from '../../lib/notifications'

const isWeb = Platform.OS === 'web'

// モジュールレベルキャッシュ（セッション内タブ切り替えで即時表示）
const _dmCache = new Map<string, IMMessage[]>()

type IMMessage = {
  id: string
  content: string
  sender_id: string
  created_at: string
  reply_to_id: string | null
  reply_preview?: string | null
  is_auto?: boolean
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
  // 相手が自分のメンバーシップ会員かどうか（自分がクリエーターのときのみtrue）
  const [isPartnerSubscriber, setIsPartnerSubscriber] = useState(false)
  const [dmBlocked, setDmBlocked] = useState(false)  // 鍵垢 & 非フォロワーの場合にブロック
  // 担当者呼び出し
  const [escalationButtonEnabled, setEscalationButtonEnabled] = useState(false) // クリエーターがボタン表示をONにしているか
  const [escalationCooldown, setEscalationCooldown] = useState(false) // 24h クールダウン中
  const [sendingEscalation, setSendingEscalation] = useState(false)
  const [messages, setMessages] = useState<IMMessage[]>(() => _dmCache.get(partnerId) ?? [])
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<IMMessage | null>(null)
  const [loading, setLoading] = useState(!_dmCache.has(partnerId))
  const [longPressMsg, setLongPressMsg] = useState<IMMessage | null>(null)
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)
  const flatListRef = useRef<FlatList>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const myIdRef = useRef<string | null>(null)
  const escalationCooldownRef = useRef(false)
  const [webKbHeight, setWebKbHeight] = useState(0)

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const vv = (window as any).visualViewport
    if (!vv) return
    const update = () => setWebKbHeight(Math.max(0, window.innerHeight - vv.height))
    vv.addEventListener('resize', update)
    return () => vv.removeEventListener('resize', update)
  }, [])

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMyId(user.id)
    myIdRef.current = user.id

    const [{ data: profile }, { data: myProfile }, { data: subData }, { data: followData }] = await Promise.all([
      supabase.from('profiles').select('display_name, avatar_url, is_private, escalation_button_enabled').eq('id', partnerId).single(),
      supabase.from('profiles').select('display_name, avatar_url').eq('id', user.id).single(),
      // 相手が自分のメンバーシップ会員かどうかチェック
      supabase.from('subscriptions').select('id')
        .eq('subscriber_id', partnerId).eq('creator_id', user.id).eq('status', 'active').maybeSingle(),
      // 自分が相手をフォローしているかチェック
      supabase.from('follows').select('follower_id')
        .eq('follower_id', user.id).eq('following_id', partnerId).maybeSingle(),
    ])
    setPartnerName(profile?.display_name ?? '')
    setPartnerAvatar(profile?.avatar_url ?? null)
    setMyName(myProfile?.display_name ?? '')
    setMyAvatar(myProfile?.avatar_url ?? null)
    setIsPartnerSubscriber(!!subData)
    // クリエーターが担当者返信要求ボタンをONにしているか
    setEscalationButtonEnabled(profile?.escalation_button_enabled ?? false)

    // 鍵垢 & 非フォロワーの場合はDMブロック
    if (profile?.is_private && !followData) {
      setDmBlocked(true)
      setLoading(false)
      return
    }

    const { data: msgs } = await supabase
      .from('messages')
      .select('id, content, sender_id, created_at, reply_to_id, is_auto')
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

    const parsed = msgs.map((m: any) => ({
      ...m,
      reply_preview: m.reply_to_id ? (replyMap[m.reply_to_id] ?? null) : null,
    }))
    _dmCache.set(partnerId, parsed)
    // AsyncStorageに永続化（アプリ再起動後も即時表示できるように）
    AsyncStorage.setItem(`dm_cache_${partnerId}`, JSON.stringify(parsed)).catch(() => {})
    // 既存データと同じなら setMessages しない（FlatListのスクロールリセット防止）
    setMessages(prev => {
      if (prev.length > 0 && prev.length === parsed.length) {
        const checkLen = Math.min(5, prev.length)
        const isSame = prev.slice(-checkLen).every((m, i) => m.id === parsed.slice(-checkLen)[i]?.id)
        if (isSame) return prev
      }
      return parsed
    })

    // pending な依頼が存在する間はクールダウン
    // ただし 24h 放置 or resolved になったら再依頼可能
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: pendingEsc } = await supabase
      .from('dm_escalations')
      .select('id, created_at')
      .eq('requester_id', user.id)
      .eq('creator_id', partnerId)
      .eq('status', 'pending')
      .maybeSingle()
    const isCooldown = !!pendingEsc && pendingEsc.created_at >= since24h
    if (pendingEsc && pendingEsc.created_at < since24h) {
      // 24h 放置 → resolved にして再依頼可能
      supabase.from('dm_escalations').update({ status: 'resolved' }).eq('id', pendingEsc.id).then(() => {})
    }
    setEscalationCooldown(isCooldown)
    escalationCooldownRef.current = isCooldown

    setLoading(false)
  }, [partnerId])

  useEffect(() => {
    const cached = _dmCache.get(partnerId)
    if (cached && cached.length > 0) {
      // モジュールキャッシュあり: データは即時、scroll確定後に表示
      setMessages(cached)
      setLoading(false)
      // バックグラウンドで最新化（スピナーは出さない）
      load()
    } else {
      // モジュールキャッシュなし: AsyncStorageを確認
      setLoading(true)
      setMessages([])
      AsyncStorage.getItem(`dm_cache_${partnerId}`).then(raw => {
        if (raw) {
          try {
            const parsed: IMMessage[] = JSON.parse(raw)
            if (parsed.length > 0) {
              _dmCache.set(partnerId, parsed)
              setMessages(parsed)
              setLoading(false)
            }
          } catch {}
        }
        // ネットワークから最新取得（キャッシュあり時はバックグラウンド）
        load()
      }).catch(() => load())
    }
  }, [load, partnerId])


  // ポーリング：2秒おきに新着メッセージ取得 + クールダウン解除チェック
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!myIdRef.current) return
      const [{ data: msgs }] = await Promise.all([
        supabase
          .from('messages')
          .select('id, content, sender_id, created_at, reply_to_id, is_auto')
          .or(
            `and(sender_id.eq.${myIdRef.current},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${myIdRef.current})`
          )
          .is('broadcast_id', null)
          .order('created_at', { ascending: true }),
      ])
      if (msgs) {
        setMessages(prev => {
          const prevIds = new Set(prev.map(m => m.id))
          const newMsgs = msgs.filter((m: any) => !prevIds.has(m.id))
          if (newMsgs.length === 0) return prev
          triggerDmReload()
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
          return [...prev, ...newMsgs.map((m: any) => ({ ...m, reply_preview: null }))]
        })
      }
      // クールダウン中なら resolved になったか / 24h 放置されたかを確認して解除
      if (escalationCooldownRef.current) {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { data: stillPending } = await supabase
          .from('dm_escalations')
          .select('id, created_at')
          .eq('requester_id', myIdRef.current)
          .eq('creator_id', partnerId)
          .eq('status', 'pending')
          .maybeSingle()
        if (!stillPending || stillPending.created_at < since24h) {
          // resolved になった or 24h 放置 → resolved に更新して再依頼可能に
          if (stillPending) {
            supabase.from('dm_escalations').update({ status: 'resolved' }).eq('id', stillPending.id).then(() => {})
          }
          setEscalationCooldown(false)
          escalationCooldownRef.current = false
        }
      }
    }, 2000)
    return () => clearInterval(timer)
  }, [partnerId, triggerDmReload])

  // 担当者呼び出しを実行
  const handleEscalation = async () => {
    if (!myId || sendingEscalation) return
    const doRequest = async () => {
      setSendingEscalation(true)
      // dm_escalations テーブルに記録
      await supabase.from('dm_escalations').insert({
        requester_id: myId,
        creator_id: partnerId,
        status: 'pending',
      })
      // チャットに専用システムメッセージを挿入（クリエイター側にも見える）
      const { data } = await supabase.from('messages').insert({
        sender_id: myId,
        receiver_id: partnerId,
        content: '〔担当者への対応依頼〕',
      }).select().single()
      if (data) {
        setMessages(prev => [...prev, { ...data, reply_preview: null }])
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100)
      }
      // クリエーターにプッシュ通知を送信
      sendPushToUsers(
        [partnerId],
        `${myName} から担当者対応の依頼`,
        '直接の返信・対応が求められています',
      )
      setEscalationCooldown(true)
      escalationCooldownRef.current = true
      setSendingEscalation(false)
    }
    if (Platform.OS === 'web') {
      if (window.confirm('担当者に対応を依頼しますか？\n返信までお時間をいただく場合があります。')) doRequest()
    } else {
      Alert.alert(
        '担当者に対応を依頼',
        '担当者に直接の対応を依頼しますか？\n返信までお時間をいただく場合があります。',
        [{ text: 'キャンセル', style: 'cancel' }, { text: '依頼する', onPress: doRequest }]
      )
    }
  }

  const handleSend = async () => {
    if (!text.trim() || !myIdRef.current || !partnerId) return
    const content = text.trim()
    const senderId = myIdRef.current
    setText('')
    const insertData: any = { sender_id: senderId, receiver_id: partnerId, content }
    if (replyTo) insertData.reply_to_id = replyTo.id
    const { data } = await supabase.from('messages').insert(insertData).select().single()
    if (data) {
      setMessages(prev => [...prev, { ...data, reply_preview: replyTo ? replyTo.content : null }])
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100)
    }
    setReplyTo(null)
    triggerDmReload()

    const { data: myProfile } = await supabase
      .from('profiles').select('display_name').eq('id', senderId).single()
    sendPushToUsers([partnerId], myProfile?.display_name ?? 'IM', content.slice(0, 80))

    setTimeout(async () => {
      await supabase.rpc('check_and_send_auto_response', {
        p_creator_id: partnerId,
        p_receiver_id: senderId,
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

  if (dmBlocked) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 }]}>
        <Ionicons name="lock-closed" size={40} color={Colors.border} />
        <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.text, textAlign: 'center' }}>
          このアカウントにDMできません
        </Text>
        <Text style={{ fontSize: 13, color: Colors.textLight, textAlign: 'center', lineHeight: 20 }}>
          フォローが承認されるとDMを送れるようになります
        </Text>
        <TouchableOpacity
          onPress={() => onClose ? onClose() : router.back()}
          style={{ marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: Colors.button, borderRadius: 20 }}
        >
          <Text style={{ fontSize: 14, color: Colors.white, fontWeight: '600' }}>戻る</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // invertedで下から描画するため逆順にする
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages])

  return (
    <KeyboardAvoidingView
      style={[styles.container, isWeb && webKbHeight > 0 ? { paddingBottom: webKbHeight } : undefined]}
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
            <Text style={styles.headerSub}>DM</Text>
          </View>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <FlatList
        ref={flatListRef}
        data={reversedMessages}
        keyExtractor={item => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={styles.messageList}
        inverted
        ListEmptyComponent={() => (
          <View style={styles.emptyWrap}>
            <Ionicons name="chatbubbles-outline" size={40} color={Colors.border} />
            <Text style={styles.emptyText}>まだメッセージはありません</Text>
          </View>
        )}
        renderItem={({ item, index }) => {
          const isOwn = item.sender_id === myId
          // invertedなので index+1 が1つ古いメッセージ
          const prev = index < reversedMessages.length - 1 ? reversedMessages[index + 1] : null
          // 担当者呼び出しメッセージ — 担当者側にも目立つよう全幅カードで表示
          if (item.content === '〔担当者への対応依頼〕') {
            return (
              <View style={styles.escalationCardWrap}>
                {showDate(item, prev) && (
                  <View style={styles.dateDivider}>
                    <Text style={styles.dateText}>
                      {new Date(item.created_at).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}
                    </Text>
                  </View>
                )}
                <View style={styles.escalationCard}>
                  <View style={styles.escalationCardIcon}>
                    <Ionicons name="alert-circle" size={22} color="#fff" />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.escalationCardTitle}>担当者への対応依頼</Text>
                    <Text style={styles.escalationCardSub}>
                      直接の返信・対応が求められています
                    </Text>
                  </View>
                  <Text style={styles.escalationCardTime}>{formatTime(item.created_at)}</Text>
                </View>
              </View>
            )
          }
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
                <TouchableOpacity onPress={() => router.push(`/creator/${isOwn ? (myId ?? '') : partnerId}` as any)} activeOpacity={0.8}>
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
                </TouchableOpacity>
                <View style={[styles.bubbleWrap, isOwn && styles.bubbleWrapOwn]}>
                  <View style={styles.msgNameRow}>
                    <Text style={styles.msgNameLabel}>{isOwn ? myName : partnerName}</Text>
                    {/* 相手が自分のメンバーシップ会員なら★バッジ（自分だけ見える） */}
                    {!isOwn && isPartnerSubscriber && (
                      <View style={styles.memberBadge}>
                        <Ionicons name="star" size={9} color="#fff" />
                        <Text style={styles.memberBadgeText}>会員</Text>
                      </View>
                    )}
                  </View>
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
                    {!isOwn && item.is_auto && (
                      <View style={styles.autoBadge}>
                        <Ionicons name="flash-outline" size={9} color="#888" />
                        <Text style={styles.autoBadgeText}>自動応答</Text>
                      </View>
                    )}
                    {!isOwn && !item.is_auto && (
                      <View style={[styles.autoBadge, styles.staffBadge]}>
                        <Ionicons name="person-outline" size={9} color="#5A7FD6" />
                        <Text style={[styles.autoBadgeText, styles.staffBadgeText]}>担当者応答</Text>
                      </View>
                    )}
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
          <Pressable style={styles.popupBox} onPress={() => {}}>
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
            {longPressMsg?.sender_id === myId && (
              <TouchableOpacity
                style={styles.popupBtn}
                onPress={async () => {
                  const msg = longPressMsg
                  setLongPressMsg(null)
                  await supabase.from('messages').delete().eq('id', msg!.id)
                  setMessages(prev => prev.filter(m => m.id !== msg!.id))
                }}
              >
                <Ionicons name="trash-outline" size={22} color="#E53E3E" />
                <Text style={[styles.popupBtnText, { color: '#E53E3E' }]}>削除</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* 担当者呼び出しバナー: クリエーターがボタン表示をONにしているときのみ表示 */}
      {escalationButtonEnabled && (
        <View style={styles.escalationBar}>
          <Ionicons name="person-circle-outline" size={16} color={Colors.textLight} />
          <Text style={styles.escalationBarText}>自動応答で解決しない場合</Text>
          <TouchableOpacity
            style={[styles.escalationBtn, (sendingEscalation || escalationCooldown) && styles.escalationBtnDisabled]}
            onPress={handleEscalation}
            disabled={sendingEscalation || escalationCooldown}
          >
            <Text style={styles.escalationBtnText}>
              {escalationCooldown ? '依頼済み' : sendingEscalation ? '送信中...' : '担当者に相談'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

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
    paddingTop: isWeb ? 16 : 56, paddingHorizontal: 16, paddingBottom: 12,
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
  messageList: { padding: 16, gap: 4, paddingBottom: 24 },
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
  msgNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  msgNameLabel: { fontSize: 11, color: Colors.textLight, fontWeight: '600' },
  memberBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: Colors.accent, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  memberBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },
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
  autoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#F0F0F0', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  autoBadgeText: { fontSize: 9, color: '#888', fontWeight: '600' },
  staffBadge: { backgroundColor: '#EDF2FF' },
  staffBadgeText: { color: '#5A7FD6' },
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
    fontSize: 16, color: Colors.text, maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: '#B0B0B0' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textLight },

  // 担当者呼び出しバナー（入力欄の直上）
  // 派手にせず、グレー系でシリアスな印象にする
  escalationBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: Colors.background,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  escalationBarText: { flex: 1, fontSize: 12, color: Colors.textLight },
  escalationBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: '#D4875A',
    backgroundColor: Colors.white,
  },
  escalationBtnDisabled: { borderColor: Colors.border, opacity: 0.5 },
  escalationBtnText: { fontSize: 12, fontWeight: '600', color: '#7A3010' },

  // 担当者依頼カード（全幅・目立つデザイン）
  escalationCardWrap: { paddingHorizontal: 16, marginVertical: 10 },
  escalationCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFF8F2',
    borderWidth: 1, borderColor: '#F0C898',
    borderRadius: 14, padding: 14,
  },
  escalationCardIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#D4875A', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  escalationCardTitle: { fontSize: 13, fontWeight: '700', color: '#7A3010' },
  escalationCardSub: { fontSize: 11, color: '#9B4A15', lineHeight: 16 },
  escalationCardTime: { fontSize: 10, color: '#B5601E', alignSelf: 'flex-start', marginTop: 2 },
})
