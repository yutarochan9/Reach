import { useState, useCallback, useRef, useEffect } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image, Animated, PanResponder, Platform, Alert, TextInput } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'
import { useTalkContext } from '../contexts/TalkContext'
import DefaultAvatar from '../components/DefaultAvatar'

// ── モジュールレベルキャッシュ（タブ切り替え時の即時表示用）────────────────
let _cachedMyId: string | null = null
let _cachedMyItem: any = null
let _cachedFollowingItems: FollowingItem[] = []
let _cachedDmItems: DmItem[] = []
let _cachedEscalationRequests: EscalationRequest[] = []
let _cachedBroadcastCursor: string | null = null
let _cachedDmCursor: string | null = null
let _cachedHasMoreFollowing = false
let _cachedHasMoreDm = false
let _talkLoaded = false

const BC_LIMIT = 100   // 配信：初回読み込み上限
const DM_LIMIT = 200   // DM：初回読み込み上限

const PIN_COLOR = '#7CB342'  // ピン止めの黄緑色
const ACTION_WIDTH = 80    // DMの削除パネル幅
const DM_LEFT_W = 160      // DMの右スワイプパネル幅（ピン+通知オフ）
const FOLLOW_LEFT_W = 160   // 右スワイプで開くピン+通知オフパネル幅
const FOLLOW_RIGHT_W = 80   // 左スワイプで開く削除パネル幅
const isWeb = Platform.OS === 'web'

type FollowingItem = {
  id: string
  name: string
  avatar: string | null
  last_content: string
  created_at: string
  unread: number
  is_official: boolean
  public_reactions: boolean
  like_count: number
  comment_count: number
}

type DmItem = {
  otherId: string
  name: string
  avatar: string | null
  lastContent: string
  lastTime: string
  is_official: boolean
}

// 担当者対応依頼（クリエーター宛の未対応依頼）
type EscalationRequest = {
  id: string
  requesterId: string
  requesterName: string
  requesterAvatar: string | null
  created_at: string
}

type FlatRow =
  | { type: 'my'; myId: string; name: string; avatar: string | null; last_content: string; created_at: string; is_official: boolean; public_reactions: boolean; like_count: number; comment_count: number }
  | { type: 'section-header'; sectionId: 'following' | 'dm'; label: string; open: boolean }
  | { type: 'following-item'; data: FollowingItem }
  | { type: 'dm-item'; data: DmItem }
  | { type: 'escalation-header'; count: number }
  | { type: 'escalation-item'; data: EscalationRequest }

function SwipeableDmRow({
  data, isPinned, isMuted, onPress, onPin, onMute, onDelete, formatTime, selected,
}: {
  data: DmItem
  isPinned: boolean
  isMuted: boolean
  onPress: () => void
  onPin: () => void
  onMute: () => void
  onDelete: () => void
  formatTime: (iso: string) => string
  selected?: boolean
}) {
  const translateX = useRef(new Animated.Value(0)).current
  const openState = useRef<'none' | 'left' | 'right'>('none')

  const close = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 80 }).start()
    openState.current = 'none'
  }
  const openLeft = () => {
    Animated.spring(translateX, { toValue: DM_LEFT_W, useNativeDriver: true, tension: 80 }).start()
    openState.current = 'left'
  }
  const openRight = () => {
    Animated.spring(translateX, { toValue: -ACTION_WIDTH, useNativeDriver: true, tension: 80 }).start()
    openState.current = 'right'
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => { translateX.stopAnimation() },
      onPanResponderMove: (_, g) => {
        const base = openState.current === 'left' ? DM_LEFT_W : openState.current === 'right' ? -ACTION_WIDTH : 0
        translateX.setValue(Math.max(-ACTION_WIDTH, Math.min(DM_LEFT_W, base + g.dx)))
      },
      onPanResponderRelease: (_, g) => {
        if (openState.current === 'left') { g.dx < -40 ? close() : openLeft() }
        else if (openState.current === 'right') { g.dx > 40 ? close() : openRight() }
        else { if (g.dx > 40) openLeft(); else if (g.dx < -40) openRight(); else close() }
      },
    })
  ).current

  return (
    <View style={swipeStyles.wrap}>
      {/* 左アクション: ピン止め + 通知オフ（右スワイプで表示） */}
      <View style={swipeStyles.leftActions}>
        <TouchableOpacity style={[swipeStyles.pinBtn, isPinned && swipeStyles.pinBtnActive]} onPress={() => { close(); onPin() }}>
          <Ionicons name={isPinned ? 'pin' : 'pin-outline'} size={18} color={Colors.white} />
          <Text style={swipeStyles.actionText}>{isPinned ? '解除' : 'ピン'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[swipeStyles.muteBtn, isMuted && swipeStyles.muteBtnActive]} onPress={() => { close(); onMute() }}>
          <Ionicons name={isMuted ? 'notifications' : 'notifications-off-outline'} size={18} color={Colors.white} />
          <Text style={swipeStyles.actionText}>{isMuted ? '通知オン' : '通知オフ'}</Text>
        </TouchableOpacity>
      </View>
      {/* 右アクション: 削除（左スワイプで表示） */}
      <View style={swipeStyles.rightActions}>
        <TouchableOpacity style={swipeStyles.deleteBtn} onPress={() => { close(); setTimeout(onDelete, 200) }}>
          <Ionicons name="trash-outline" size={18} color={Colors.white} />
          <Text style={swipeStyles.actionText}>削除</Text>
        </TouchableOpacity>
      </View>

      {/* スライドする行 */}
      <Animated.View
        style={[swipeStyles.row, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={[styles.talkItem, selected && styles.talkItemSelected, isPinned && styles.talkItemPinned]}
          onPress={() => { if (openState.current !== 'none') { close() } else { onPress() } }}
          activeOpacity={0.8}
        >
          <View style={styles.avatar}>
            {data.avatar
              ? <Image source={{ uri: data.avatar }} style={styles.avatarImage} />
              : <DefaultAvatar size={52} />
            }
            {isMuted && (
              <View style={swipeStyles.mutedDot}>
                <Ionicons name="notifications-off" size={8} color={Colors.white} />
              </View>
            )}
          </View>
          <View style={styles.talkInfo}>
            <View style={styles.talkHeader}>
              <View style={styles.nameRow}>
                <Text style={styles.talkName}>{data.name}</Text>
                {data.is_official && <Ionicons name="checkmark-circle" size={14} color="#1D9BF0" />}
              </View>
              <Text style={styles.talkTime}>{formatTime(data.lastTime)}</Text>
            </View>
            <Text style={styles.lastMessage} numberOfLines={1}>{data.lastContent}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  )
}

// ── フォロー中クリエーター行 (両方向スワイプ) ──────────────────────────────
function SwipeableFollowingRow({
  data, isPinned, isMuted, onPress, onPin, onMute, onDelete, formatTime, selected,
}: {
  data: FollowingItem
  isPinned: boolean
  isMuted: boolean
  onPress: () => void
  onPin: () => void
  onMute: () => void
  onDelete: () => void
  formatTime: (iso: string) => string
  selected?: boolean
}) {
  const translateX = useRef(new Animated.Value(0)).current
  const openState = useRef<'none' | 'left' | 'right'>('none')

  const close = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 80 }).start()
    openState.current = 'none'
  }
  const openLeft = () => {  // 右スワイプ → 左のピン+通知ボタンを開く
    Animated.spring(translateX, { toValue: FOLLOW_LEFT_W, useNativeDriver: true, tension: 80 }).start()
    openState.current = 'left'
  }
  const openRight = () => {  // 左スワイプ → 右の削除ボタンを開く
    Animated.spring(translateX, { toValue: -FOLLOW_RIGHT_W, useNativeDriver: true, tension: 80 }).start()
    openState.current = 'right'
  }

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderGrant: () => { translateX.stopAnimation() },
    onPanResponderMove: (_, g) => {
      const base = openState.current === 'left' ? FOLLOW_LEFT_W : openState.current === 'right' ? -FOLLOW_RIGHT_W : 0
      translateX.setValue(Math.max(-FOLLOW_RIGHT_W, Math.min(FOLLOW_LEFT_W, base + g.dx)))
    },
    onPanResponderRelease: (_, g) => {
      if (openState.current === 'left') { g.dx < -40 ? close() : openLeft() }
      else if (openState.current === 'right') { g.dx > 40 ? close() : openRight() }
      else { if (g.dx > 40) openLeft(); else if (g.dx < -40) openRight(); else close() }
    },
  })).current

  const showUnread = !isMuted && data.unread > 0

  return (
    <View style={followSwipe.wrap}>
      {/* 左アクション: ピン止め + 通知オフ（右スワイプで表示） */}
      <View style={followSwipe.leftActions}>
        <TouchableOpacity style={[followSwipe.pinBtn, isPinned && followSwipe.pinBtnActive]} onPress={() => { close(); onPin() }}>
          <Ionicons name={isPinned ? 'pin' : 'pin-outline'} size={18} color={Colors.white} />
          <Text style={followSwipe.actionText}>{isPinned ? '解除' : 'ピン'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[followSwipe.muteBtn, isMuted && followSwipe.muteBtnActive]} onPress={() => { close(); onMute() }}>
          <Ionicons name={isMuted ? 'notifications' : 'notifications-off-outline'} size={18} color={Colors.white} />
          <Text style={followSwipe.actionText}>{isMuted ? '通知オン' : '通知オフ'}</Text>
        </TouchableOpacity>
      </View>
      {/* 右アクション: 削除（左スワイプで表示） */}
      <View style={followSwipe.rightActions}>
        <TouchableOpacity style={followSwipe.deleteBtn} onPress={() => { close(); setTimeout(onDelete, 200) }}>
          <Ionicons name="trash-outline" size={18} color={Colors.white} />
          <Text style={followSwipe.actionText}>削除</Text>
        </TouchableOpacity>
      </View>
      {/* スライドする行 */}
      <Animated.View style={[followSwipe.row, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        <TouchableOpacity
          style={[styles.talkItem, selected && styles.talkItemSelected, isPinned && styles.talkItemPinned]}
          onPress={() => { if (openState.current !== 'none') { close() } else { onPress() } }}
          activeOpacity={0.8}
        >
          <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
            <View style={styles.avatar}>
              {data.avatar
                ? <Image source={{ uri: data.avatar }} style={styles.avatarImage} />
                : <DefaultAvatar size={52} />
              }
              {isMuted && (
                <View style={followSwipe.mutedDot}>
                  <Ionicons name="notifications-off" size={8} color={Colors.white} />
                </View>
              )}
            </View>
          </TouchableOpacity>
          <View style={styles.talkInfo}>
            <View style={styles.talkHeader}>
              <View style={styles.nameRow}>
                <Text style={styles.talkName}>{data.name}</Text>
                {data.is_official && <Ionicons name="checkmark-circle" size={14} color="#1D9BF0" />}
              </View>
              <Text style={styles.talkTime}>{formatTime(data.created_at)}</Text>
            </View>
            <View style={styles.talkFooter}>
              <Text style={[styles.lastMessage, showUnread && styles.lastMessageUnread]} numberOfLines={1}>{data.last_content}</Text>
              {showUnread && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{data.unread > 99 ? '99+' : data.unread}</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  )
}

export default function TalkScreen() {
  const { setSelectedTalkId, setSelectedDmId, isDesktop, selectedTalkId, selectedDmId, dmReloadKey } = useTalkContext()
  const [myId, setMyId] = useState<string | null>(_cachedMyId)
  const [myItem, setMyItem] = useState<{ name: string; avatar: string | null; last_content: string; created_at: string; is_official: boolean; public_reactions: boolean; like_count: number; comment_count: number } | null>(_cachedMyItem)
  const [followingItems, setFollowingItems] = useState<FollowingItem[]>(_cachedFollowingItems)
  const [dmItems, setDmItems] = useState<DmItem[]>(_cachedDmItems)
  const [followingOpen, setFollowingOpen] = useState(true)
  const [dmOpen, setDmOpen] = useState(true)
  const [escalationRequests, setEscalationRequests] = useState<EscalationRequest[]>(_cachedEscalationRequests)
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set())
  const [mutedIds, setMutedIds] = useState<Set<string>>(new Set())
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [dmPinnedIds, setDmPinnedIds] = useState<Set<string>>(new Set())
  const [dmMutedIds, setDmMutedIds] = useState<Set<string>>(new Set())

  // 起動時：開閉状態 + トークキャッシュを一括復元
  useEffect(() => {
    AsyncStorage.multiGet([
      'talk_following_open', 'talk_dm_open',
      'talk_pinned_ids', 'talk_muted_ids', 'talk_hidden_ids',
      'talk_dm_pinned_ids', 'talk_dm_muted_ids',
      'talk_cache_following', 'talk_cache_dm', 'talk_cache_my',  // トークキャッシュ
    ]).then(pairs => {
      const fo = pairs[0][1]; const do_ = pairs[1][1]
      if (fo !== null) setFollowingOpen(fo === 'true')
      if (do_ !== null) setDmOpen(do_ === 'true')
      try { if (pairs[2][1]) setPinnedIds(new Set(JSON.parse(pairs[2][1]))) } catch {}
      try { if (pairs[3][1]) setMutedIds(new Set(JSON.parse(pairs[3][1]))) } catch {}
      try { if (pairs[4][1]) setHiddenIds(new Set(JSON.parse(pairs[4][1]))) } catch {}
      try { if (pairs[5][1]) setDmPinnedIds(new Set(JSON.parse(pairs[5][1]))) } catch {}
      try { if (pairs[6][1]) setDmMutedIds(new Set(JSON.parse(pairs[6][1]))) } catch {}

      // モジュールキャッシュがない（＝ページ再読み込み）時のみAsyncStorageから復元
      if (!_talkLoaded) {
        try {
          if (pairs[7][1]) {
            const fi = JSON.parse(pairs[7][1]) as FollowingItem[]
            setFollowingItems(fi); _cachedFollowingItems = fi
          }
        } catch {}
        try {
          if (pairs[8][1]) {
            const di = JSON.parse(pairs[8][1]) as DmItem[]
            setDmItems(di); _cachedDmItems = di
          }
        } catch {}
        try {
          if (pairs[9][1]) {
            const mi = JSON.parse(pairs[9][1])
            setMyItem(mi); _cachedMyItem = mi
          }
        } catch {}
        // キャッシュがあればローディング非表示にして、バックグラウンドで更新
        if (pairs[7][1] || pairs[8][1]) setLoading(false)
      }
    }).catch(() => {})
  }, [])
  useEffect(() => { AsyncStorage.setItem('talk_following_open', String(followingOpen)).catch(() => {}) }, [followingOpen])
  useEffect(() => { AsyncStorage.setItem('talk_dm_open', String(dmOpen)).catch(() => {}) }, [dmOpen])
  useEffect(() => { AsyncStorage.setItem('talk_pinned_ids', JSON.stringify([...pinnedIds])).catch(() => {}) }, [pinnedIds])
  useEffect(() => { AsyncStorage.setItem('talk_muted_ids', JSON.stringify([...mutedIds])).catch(() => {}) }, [mutedIds])
  useEffect(() => { AsyncStorage.setItem('talk_hidden_ids', JSON.stringify([...hiddenIds])).catch(() => {}) }, [hiddenIds])
  useEffect(() => { AsyncStorage.setItem('talk_dm_pinned_ids', JSON.stringify([...dmPinnedIds])).catch(() => {}) }, [dmPinnedIds])
  useEffect(() => { AsyncStorage.setItem('talk_dm_muted_ids', JSON.stringify([...dmMutedIds])).catch(() => {}) }, [dmMutedIds])
  const [loading, setLoading] = useState(!_talkLoaded)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [broadcastCursor, setBroadcastCursor] = useState<string | null>(_cachedBroadcastCursor)
  const [dmCursor, setDmCursor] = useState<string | null>(_cachedDmCursor)
  const [hasMoreFollowing, setHasMoreFollowing] = useState(_cachedHasMoreFollowing)
  const [hasMoreDm, setHasMoreDm] = useState(_cachedHasMoreDm)
  const [loadingMoreFollowing, setLoadingMoreFollowing] = useState(false)
  const [loadingMoreDm, setLoadingMoreDm] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const load = useCallback(async () => {
    try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setMyId(user.id)
    _cachedMyId = user.id

    const [
      { data: followingData },
      { data: myProfile },
      { data: myBroadcasts },
      { data: escData },
    ] = await Promise.all([
      supabase.from('follows').select('following_id').eq('follower_id', user.id),
      supabase.from('profiles').select('display_name, avatar_url, is_official').eq('id', user.id).single(),
      supabase.from('broadcasts')
        .select('id, content, image_url, video_url, created_at, public_reactions')
        .eq('sender_id', user.id).eq('status', 'published')
        .order('created_at', { ascending: false }).limit(1),
      supabase.from('dm_escalations')
        .select('id, requester_id, created_at')
        .eq('creator_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ])

    const followingIds = (followingData ?? []).map((f: any) => f.following_id)

    const myLastBroadcast = myBroadcasts?.[0]
    let myLikeCount = 0
    let myCommentCount = 0
    if (myLastBroadcast?.public_reactions) {
      const [{ data: myReactions }, { data: myComments }] = await Promise.all([
        supabase.from('reactions').select('id', { count: 'exact', head: false }).eq('broadcast_id', myLastBroadcast.id),
        supabase.from('messages').select('id', { count: 'exact', head: false }).eq('broadcast_id', myLastBroadcast.id),
      ])
      myLikeCount = (myReactions ?? []).length
      myCommentCount = (myComments ?? []).length
    }
    const myRawContent = myLastBroadcast?.content ?? ''
    const myDisplayContent = myRawContent.trim() ? myRawContent.trim()
      : myLastBroadcast?.video_url ? '動画を送信しました'
      : myLastBroadcast?.image_url ? '画像を送信しました'
      : myLastBroadcast ? '画像を送信しました'
      : 'まだ配信がありません'
    setMyItem({
      name: myProfile?.display_name ?? 'あなた',
      avatar: myProfile?.avatar_url ?? null,
      last_content: myDisplayContent,
      created_at: myLastBroadcast?.created_at ?? new Date().toISOString(),
      is_official: (myProfile as any)?.is_official ?? false,
      public_reactions: myLastBroadcast?.public_reactions ?? false,
      like_count: myLikeCount,
      comment_count: myCommentCount,
    })

    // 担当者対応依頼（escalation_button_enabled = true のクリエーター宛）
    if ((escData ?? []).length > 0) {
      const reqIds = (escData ?? []).map((e: any) => e.requester_id)
      const { data: reqProfs } = await supabase
        .from('profiles').select('id, display_name, avatar_url').in('id', reqIds)
      const reqProfMap: Record<string, any> = {}
      for (const p of (reqProfs ?? [])) reqProfMap[p.id] = p
      setEscalationRequests((escData ?? []).map((e: any) => ({
        id: e.id,
        requesterId: e.requester_id,
        requesterName: reqProfMap[e.requester_id]?.display_name ?? '?',
        requesterAvatar: reqProfMap[e.requester_id]?.avatar_url ?? null,
        created_at: e.created_at,
      })))
    } else {
      setEscalationRequests([])
    }

    // フォロー中セクション
    const since365 = new Date(Date.now() - 365 * 86400_000).toISOString()
    if (followingIds.length > 0) {
      const [{ data: broadcasts }, { data: reads }, { data: profiles }, { data: subs }] = await Promise.all([
        supabase.from('broadcasts')
          .select('id, sender_id, content, image_url, video_url, created_at, public_reactions, is_subscriber_only')
          .in('sender_id', followingIds)
          .eq('status', 'published')
          .or(`recipient_id.is.null,recipient_id.eq.${user.id}`)
          .gte('created_at', since365)
          .order('created_at', { ascending: false })
          .limit(BC_LIMIT),
        supabase.from('talk_reads').select('sender_id, last_read_at').eq('user_id', user.id),
        supabase.from('profiles').select('id, display_name, avatar_url, is_official').in('id', followingIds),
        // 自分がサブスクしているクリエーター一覧を取得（MB限定メッセージのフィルタリング用）
        supabase.from('subscriptions').select('creator_id').eq('subscriber_id', user.id).eq('status', 'active'),
      ])

      const readMap: Record<string, string> = {}
      ;(reads ?? []).forEach((r: any) => { readMap[r.sender_id] = r.last_read_at })

      const profMap: Record<string, { display_name: string; avatar_url: string | null; is_official: boolean }> = {}
      for (const p of (profiles ?? [])) profMap[p.id] = p

      // サブスク中のクリエーターIDのセット
      const subSet = new Set((subs ?? []).map((s: any) => s.creator_id))

      const senderBroadcasts: Record<string, any[]> = {}
      for (const b of (broadcasts ?? [])) {
        if (!senderBroadcasts[b.sender_id]) senderBroadcasts[b.sender_id] = []
        senderBroadcasts[b.sender_id].push(b)
      }

      const publicBcIds = followingIds
        .map(id => {
          // 表示可能な最新メッセージ（MB限定はサブスク済みのみ）
          const visibleBcs = (senderBroadcasts[id] ?? []).filter((b: any) => !b.is_subscriber_only || subSet.has(id))
          return visibleBcs[0]
        })
        .filter((b: any) => b?.public_reactions)
        .map((b: any) => b.id)

      const likeMap: Record<string, number> = {}
      const commentMap: Record<string, number> = {}
      if (publicBcIds.length > 0) {
        const [{ data: rData }, { data: cData }] = await Promise.all([
          supabase.from('reactions').select('broadcast_id').in('broadcast_id', publicBcIds),
          supabase.from('messages').select('broadcast_id').in('broadcast_id', publicBcIds),
        ])
        for (const r of (rData ?? [])) likeMap[r.broadcast_id] = (likeMap[r.broadcast_id] ?? 0) + 1
        for (const c of (cData ?? [])) commentMap[(c as any).broadcast_id] = (commentMap[(c as any).broadcast_id] ?? 0) + 1
      }

      const fItems: FollowingItem[] = followingIds.map(id => {
        const bcs = senderBroadcasts[id] ?? []
        // MB限定はサブスク済みのみ表示、それ以外は非表示
        const visibleBcs = bcs.filter((b: any) => !b.is_subscriber_only || subSet.has(id))
        const latest = visibleBcs[0]
        const lastRead = readMap[id]
        const unread = lastRead ? visibleBcs.filter((b: any) => b.created_at > lastRead).length : visibleBcs.length
        const rawContent = latest?.content ?? ''
        const displayContent = rawContent.trim() ? rawContent.trim()
          : latest?.video_url ? '動画を送信しました'
          : latest?.image_url ? '画像を送信しました'
          : latest ? '画像を送信しました'
          : 'まだ配信がありません'
        return {
          id,
          name: profMap[id]?.display_name ?? '?',
          avatar: profMap[id]?.avatar_url ?? null,
          last_content: displayContent,
          created_at: latest?.created_at ?? new Date(0).toISOString(),
          unread,
          is_official: profMap[id]?.is_official ?? false,
          public_reactions: latest?.public_reactions ?? false,
          like_count: latest?.public_reactions ? (likeMap[latest.id] ?? 0) : 0,
          comment_count: latest?.public_reactions ? (commentMap[latest.id] ?? 0) : 0,
        }
      }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      // カーソル（追加読み込み用）＆「もっと見る」フラグ
      const allBcs = broadcasts ?? []
      const hasMore = allBcs.length >= BC_LIMIT
      const cursor = allBcs.length > 0 ? allBcs[allBcs.length - 1].created_at : null
      setBroadcastCursor(cursor); _cachedBroadcastCursor = cursor
      setHasMoreFollowing(hasMore); _cachedHasMoreFollowing = hasMore

      setFollowingItems(fItems)
      _cachedFollowingItems = fItems
    } else {
      setFollowingItems([])
      _cachedFollowingItems = []
      setBroadcastCursor(null); _cachedBroadcastCursor = null
      setHasMoreFollowing(false); _cachedHasMoreFollowing = false
    }

    // DMセクション
    const { data: dmMessages } = await supabase
      .from('messages')
      .select('id, content, sender_id, receiver_id, created_at')
      .is('broadcast_id', null)
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(DM_LIMIT)

    const latestByOther: Record<string, { content: string; created_at: string }> = {}
    for (const m of (dmMessages ?? [])) {
      const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id
      // 自分自身へのDMは除外
      if (otherId === user.id) continue
      if (!latestByOther[otherId]) {
        latestByOther[otherId] = { content: m.content, created_at: m.created_at }
      }
    }
    const otherIds = Object.keys(latestByOther)
    if (otherIds.length > 0) {
      const { data: dmProfs } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, is_official')
        .in('id', otherIds)
      const dmProfMap: Record<string, { display_name: string; avatar_url: string | null; is_official: boolean }> = {}
      for (const p of (dmProfs ?? [])) dmProfMap[p.id] = p

      const newDmItems = otherIds
        .map(id => ({
          otherId: id,
          name: dmProfMap[id]?.display_name ?? '?',
          avatar: dmProfMap[id]?.avatar_url ?? null,
          lastContent: latestByOther[id].content,
          lastTime: latestByOther[id].created_at,
          is_official: dmProfMap[id]?.is_official ?? false,
        }))
        .sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime())
      setDmItems(newDmItems)
      _cachedDmItems = newDmItems
      const allDms = dmMessages ?? []
      const dmHasMore = allDms.length >= DM_LIMIT
      const dmCursorVal = allDms.length > 0 ? allDms[allDms.length - 1].created_at : null
      setDmCursor(dmCursorVal); _cachedDmCursor = dmCursorVal
      setHasMoreDm(dmHasMore); _cachedHasMoreDm = dmHasMore
    } else {
      setDmItems([])
      _cachedDmItems = []
      setDmCursor(null); _cachedDmCursor = null
      setHasMoreDm(false); _cachedHasMoreDm = false
    }

    // myItemもキャッシュ（setMyItem後に同値を保存）
    _cachedMyItem = {
      name: myProfile?.display_name ?? 'あなた',
      avatar: myProfile?.avatar_url ?? null,
      last_content: myDisplayContent,
      created_at: myLastBroadcast?.created_at ?? new Date().toISOString(),
      is_official: (myProfile as any)?.is_official ?? false,
      public_reactions: myLastBroadcast?.public_reactions ?? false,
      like_count: myLikeCount,
      comment_count: myCommentCount,
    }
    _talkLoaded = true
    setLoading(false)

    // AsyncStorageに保存（次回の再起動時に即表示するため）
    AsyncStorage.multiSet([
      ['talk_cache_following', JSON.stringify(_cachedFollowingItems)],
      ['talk_cache_dm',        JSON.stringify(_cachedDmItems)],
      ['talk_cache_my',        JSON.stringify(_cachedMyItem ?? null)],
    ]).catch(() => {})

    } catch (e) {
      console.error('talk load error:', e)
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => {
    // 配信画面から戻ってきた場合、読んだ送信者のバッジを即時クリア
    AsyncStorage.getItem('last_read_talk').then(senderId => {
      if (senderId) {
        setFollowingItems(prev => prev.map(item =>
          item.id === senderId ? { ...item, unread: 0 } : item
        ))
        AsyncStorage.removeItem('last_read_talk').catch(() => {})
      }
    }).catch(() => {})

    // フォロー解除されたアカウントを配信欄から即時削除
    AsyncStorage.getItem('unfollowed_creator_id').then(creatorId => {
      if (creatorId) {
        setFollowingItems(prev => prev.filter(item => item.id !== creatorId))
        AsyncStorage.removeItem('unfollowed_creator_id').catch(() => {})
      }
    }).catch(() => {})

    // キャッシュがあれば即表示済み → バックグラウンドで静かに更新
    // キャッシュなし（初回）は load() 内でローディング表示
    load()
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current).catch(() => {})
      channelRef.current = null
    }

    // broadcasts の更新（フィルターなしでも broadcasts はフォロー中のみ見える）
    const channel = supabase
      .channel(`talk-broadcasts-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'broadcasts' }, () => load())
      .subscribe()
    channelRef.current = channel

    // DM更新：送受信どちらでも検知するため2チャンネル（フィルターあり）
    let dmSentCh: ReturnType<typeof supabase.channel> | null = null
    let dmRecvCh: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      dmSentCh = supabase
        .channel(`talk-dm-sent-${user.id}-${Date.now()}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'messages',
          filter: `sender_id=eq.${user.id}`,
        }, (payload) => {
          if (!(payload.new as any).broadcast_id) load()
        })
        .subscribe()

      dmRecvCh = supabase
        .channel(`talk-dm-recv-${user.id}-${Date.now()}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'messages',
          filter: `receiver_id=eq.${user.id}`,
        }, (payload) => {
          if (!(payload.new as any).broadcast_id) load()
        })
        .subscribe()
    })

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(() => {})
        channelRef.current = null
      }
      if (dmSentCh) supabase.removeChannel(dmSentCh).catch(() => {})
      if (dmRecvCh) supabase.removeChannel(dmRecvCh).catch(() => {})
    }
  }, [load]))

  // 外部トリガー（IMChatPanel送信・受信）でDMリストを即時更新
  useEffect(() => {
    if (dmReloadKey > 0) load()
  }, [dmReloadKey, load])

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  // ── 配信：追加読み込み（カーソル以前の100件） ────────────────────────────
  const loadMoreFollowing = useCallback(async () => {
    if (!myId || !broadcastCursor || loadingMoreFollowing) return
    setLoadingMoreFollowing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: myFollows } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
      const followingIds = (myFollows ?? []).map((f: any) => f.following_id)
      if (!followingIds.length) return

      const { data: moreBcs } = await supabase.from('broadcasts')
        .select('id, sender_id, content, image_url, video_url, created_at, public_reactions, is_subscriber_only')
        .in('sender_id', followingIds)
        .eq('status', 'published')
        .or(`recipient_id.is.null,recipient_id.eq.${user.id}`)
        .lt('created_at', broadcastCursor)   // カーソル以前を取得
        .order('created_at', { ascending: false })
        .limit(BC_LIMIT)

      if (!moreBcs?.length) { setHasMoreFollowing(false); _cachedHasMoreFollowing = false; return }

      const { data: subs } = await supabase.from('subscriptions').select('creator_id').eq('subscriber_id', user.id).eq('status', 'active')
      const subSet = new Set((subs ?? []).map((s: any) => s.creator_id))
      const { data: profiles } = await supabase.from('profiles').select('id, display_name, avatar_url, is_official').in('id', [...new Set(moreBcs.map(b => b.sender_id))])
      const profMap: Record<string, any> = {}
      for (const p of (profiles ?? [])) profMap[p.id] = p

      const { data: reads } = await supabase.from('talk_reads').select('sender_id, last_read_at').eq('user_id', user.id)
      const readMap: Record<string, string> = {}
      ;(reads ?? []).forEach((r: any) => { readMap[r.sender_id] = r.last_read_at })

      const senderBcs: Record<string, any[]> = {}
      for (const b of moreBcs) {
        if (!senderBcs[b.sender_id]) senderBcs[b.sender_id] = []
        senderBcs[b.sender_id].push(b)
      }

      const newItems: FollowingItem[] = Object.keys(senderBcs).map(id => {
        const visibleBcs = senderBcs[id].filter((b: any) => !b.is_subscriber_only || subSet.has(id))
        const latest = visibleBcs[0]
        const lastRead = readMap[id]
        const unread = lastRead ? visibleBcs.filter((b: any) => b.created_at > lastRead).length : visibleBcs.length
        const rawContent = latest?.content ?? ''
        const displayContent = rawContent.trim() ? rawContent.trim()
          : latest?.video_url ? '動画を送信しました'
          : latest?.image_url ? '画像を送信しました'
          : latest ? '画像を送信しました' : 'まだ配信がありません'
        return {
          id, name: profMap[id]?.display_name ?? '?', avatar: profMap[id]?.avatar_url ?? null,
          last_content: displayContent, created_at: latest?.created_at ?? new Date(0).toISOString(),
          unread, is_official: profMap[id]?.is_official ?? false,
          public_reactions: latest?.public_reactions ?? false, like_count: 0, comment_count: 0,
        }
      }).filter(item => !followingItems.some(f => f.id === item.id)) // 重複除外

      const merged = [...followingItems, ...newItems].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setFollowingItems(merged); _cachedFollowingItems = merged

      const newCursor = moreBcs[moreBcs.length - 1].created_at
      setBroadcastCursor(newCursor); _cachedBroadcastCursor = newCursor
      const stillMore = moreBcs.length >= BC_LIMIT
      setHasMoreFollowing(stillMore); _cachedHasMoreFollowing = stillMore
    } finally {
      setLoadingMoreFollowing(false)
    }
  }, [myId, broadcastCursor, loadingMoreFollowing, followingItems])

  // ── DM：追加読み込み ─────────────────────────────────────────────────────
  const loadMoreDm = useCallback(async () => {
    if (!myId || !dmCursor || loadingMoreDm) return
    setLoadingMoreDm(true)
    try {
      const { data: moreDms } = await supabase.from('messages')
        .select('id, content, sender_id, receiver_id, created_at')
        .is('broadcast_id', null)
        .or(`sender_id.eq.${myId},receiver_id.eq.${myId}`)
        .lt('created_at', dmCursor)
        .order('created_at', { ascending: false })
        .limit(DM_LIMIT)

      if (!moreDms?.length) { setHasMoreDm(false); _cachedHasMoreDm = false; return }

      // 既存のDMアイテムに追加（新しい相手のみ）
      const latestByOther: Record<string, { content: string; created_at: string }> = {}
      for (const m of moreDms) {
        const otherId = m.sender_id === myId ? m.receiver_id : m.sender_id
        if (otherId === myId) continue
        if (!latestByOther[otherId] && !dmItems.some(d => d.otherId === otherId)) {
          latestByOther[otherId] = { content: m.content, created_at: m.created_at }
        }
      }
      const newOtherIds = Object.keys(latestByOther)
      if (newOtherIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, display_name, avatar_url, is_official').in('id', newOtherIds)
        const profMap: Record<string, any> = {}
        for (const p of (profs ?? [])) profMap[p.id] = p
        const newDmItems: DmItem[] = newOtherIds.map(id => ({
          otherId: id, name: profMap[id]?.display_name ?? '?', avatar: profMap[id]?.avatar_url ?? null,
          lastContent: latestByOther[id].content, lastTime: latestByOther[id].created_at,
          is_official: profMap[id]?.is_official ?? false,
        }))
        const merged = [...dmItems, ...newDmItems].sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime())
        setDmItems(merged); _cachedDmItems = merged
      }

      const newCursor = moreDms[moreDms.length - 1].created_at
      setDmCursor(newCursor); _cachedDmCursor = newCursor
      setHasMoreDm(moreDms.length >= DM_LIMIT); _cachedHasMoreDm = moreDms.length >= DM_LIMIT
    } finally {
      setLoadingMoreDm(false)
    }
  }, [myId, dmCursor, loadingMoreDm, dmItems])

  const handleHideDm = (otherId: string) => {
    setDmItems(prev => prev.filter(d => d.otherId !== otherId))
  }

  const handleDeleteDm = (otherId: string) => {
    const confirm = () => {
      supabase.from('messages')
        .delete()
        .is('broadcast_id', null)
        .or(`and(sender_id.eq.${myId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${myId})`)
        .then(() => {
          setDmItems(prev => prev.filter(d => d.otherId !== otherId))
        })
    }
    if (isWeb) {
      if (window.confirm('このDM履歴を削除しますか？')) confirm()
    } else {
      Alert.alert('DMを削除', 'このDM履歴を削除しますか？', [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: confirm },
      ])
    }
  }

  const handleResolveEscalation = async (id: string) => {
    await supabase.from('dm_escalations').update({ status: 'resolved' }).eq('id', id)
    setEscalationRequests(prev => prev.filter(e => e.id !== id))
  }

  const togglePin = (id: string) => setPinnedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleMute = (id: string) => setMutedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const hideFollowing = (id: string) => setHiddenIds(prev => { const s = new Set(prev); s.add(id); return s })
  const toggleDmPin = (id: string) => setDmPinnedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleDmMute = (id: string) => setDmMutedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
    if (diffDays === 0) return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    if (diffDays === 1) return '昨日'
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  const flatData: FlatRow[] = []

  if (myId && myItem) {
    flatData.push({ type: 'my', myId, ...myItem })
  }

  // 担当者依頼セクション（pending があるときのみ表示）
  if (escalationRequests.length > 0) {
    flatData.push({ type: 'escalation-header', count: escalationRequests.length })
    escalationRequests.forEach(e => flatData.push({ type: 'escalation-item', data: e }))
  }

  // 検索フィルタリング
  const q = search.toLowerCase()
  const visibleFollowing = followingItems
    .filter(d => !hiddenIds.has(d.id))
    .filter(d => !q || d.name.toLowerCase().includes(q) || d.last_content.toLowerCase().includes(q))
    .sort((a, b) => {
      const ap = pinnedIds.has(a.id) ? 1 : 0
      const bp = pinnedIds.has(b.id) ? 1 : 0
      return bp - ap
    })

  flatData.push({
    type: 'section-header', sectionId: 'following',
    label: '配信', open: followingOpen,
  })
  if (followingOpen) {
    visibleFollowing.forEach(d => flatData.push({ type: 'following-item', data: d }))
    if (hasMoreFollowing && !q) flatData.push({ type: 'load-more-following' } as any)
  }

  flatData.push({
    type: 'section-header', sectionId: 'dm',
    label: 'DM', open: dmOpen,
  })
  if (dmOpen) {
    const sortedDm = [...dmItems]
      .filter(d => !q || d.name.toLowerCase().includes(q) || d.lastContent.toLowerCase().includes(q))
      .sort((a, b) => {
        const ap = dmPinnedIds.has(a.otherId) ? 1 : 0
        const bp = dmPinnedIds.has(b.otherId) ? 1 : 0
        return bp - ap
      })
    sortedDm.forEach(d => flatData.push({ type: 'dm-item', data: d }))
    if (hasMoreDm && !q) flatData.push({ type: 'load-more-dm' } as any)
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>メッセージ</Text>
      </View>

      {/* 検索ボックス */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={15} color={Colors.textLight} style={{ marginRight: 6 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="名前・内容で検索"
          placeholderTextColor={Colors.textLight}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={15} color={Colors.textLight} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={flatData}
        keyExtractor={(item) => {
          if (item.type === 'my') return 'my'
          if (item.type === 'section-header') return `header-${item.sectionId}`
          if (item.type === 'following-item') return `following-${item.data.id}`
          if (item.type === 'dm-item') return `dm-${item.data.otherId}`
          if (item.type === 'escalation-header') return 'escalation-header'
          if (item.type === 'escalation-item') return `escalation-${item.data.id}`
          return 'unknown'
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        renderItem={({ item }) => {
          if (item.type === 'my') {
            return (
              <TouchableOpacity style={[styles.talkItem, isDesktop && selectedTalkId === item.myId && styles.talkItemSelected]} activeOpacity={0.85} onPress={() => { setSelectedDmId(null); isDesktop ? setSelectedTalkId(item.myId) : router.push(`/talk/${item.myId}` as any) }}>
                <View style={[styles.avatar, styles.selfAvatar]}>
                  {item.avatar
                    ? <Image source={{ uri: item.avatar }} style={styles.avatarImage} />
                    : <DefaultAvatar size={52} />
                  }
                </View>
                <View style={styles.talkInfo}>
                  <View style={styles.talkHeader}>
                    <View style={styles.nameRow}>
                      <Text style={styles.talkName}>{item.name}</Text>
                      {item.is_official && <Ionicons name="checkmark-circle" size={14} color="#1D9BF0" />}
                      <View style={styles.selfBadge}>
                        <Text style={styles.selfBadgeText}>自分</Text>
                      </View>
                    </View>
                    <Text style={styles.talkTime}>{formatTime(item.created_at)}</Text>
                  </View>
                  <Text style={styles.lastMessage} numberOfLines={1}>{item.last_content}</Text>
                </View>
              </TouchableOpacity>
            )
          }

          if (item.type === 'escalation-header') {
            return (
              <View style={escStyles.header}>
                <View style={escStyles.iconWrap}>
                  <Ionicons name="alert-circle" size={14} color="#fff" />
                </View>
                <Text style={escStyles.headerText}>担当者対応の依頼</Text>
                <View style={escStyles.countBadge}>
                  <Text style={escStyles.countBadgeText}>{item.count}</Text>
                </View>
              </View>
            )
          }

          if (item.type === 'escalation-item') {
            const e = item.data
            return (
              <TouchableOpacity
                style={escStyles.item}
                activeOpacity={0.85}
                onPress={() => {
                  if (isDesktop) { setSelectedTalkId(null); setSelectedDmId(e.requesterId) }
                  else { router.push({ pathname: '/im/[userId]' as any, params: { userId: e.requesterId } }) }
                }}
              >
                <View style={[styles.avatar, escStyles.itemAvatar]}>
                  {e.requesterAvatar
                    ? <Image source={{ uri: e.requesterAvatar }} style={styles.avatarImage} />
                    : <DefaultAvatar size={52} />
                  }
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={escStyles.itemName}>{e.requesterName}</Text>
                  <Text style={escStyles.itemSub}>担当者への対応を依頼しています</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={escStyles.itemTime}>{formatTime(e.created_at)}</Text>
                  <TouchableOpacity
                    style={escStyles.resolveBtn}
                    onPress={() => handleResolveEscalation(e.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="checkmark" size={11} color="#F97316" />
                    <Text style={escStyles.resolveBtnText}>対応済み</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )
          }

          // ── もっと見る（配信）────────────────────────────────────────
          if ((item as any).type === 'load-more-following') {
            return (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMoreFollowing} disabled={loadingMoreFollowing}>
                {loadingMoreFollowing
                  ? <ActivityIndicator size="small" color={Colors.accent} />
                  : <><Ionicons name="chevron-down" size={14} color={Colors.accent} /><Text style={styles.loadMoreTxt}>過去の配信者を読み込む</Text></>
                }
              </TouchableOpacity>
            )
          }

          // ── もっと見る（DM）─────────────────────────────────────────
          if ((item as any).type === 'load-more-dm') {
            return (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMoreDm} disabled={loadingMoreDm}>
                {loadingMoreDm
                  ? <ActivityIndicator size="small" color={Colors.accent} />
                  : <><Ionicons name="chevron-down" size={14} color={Colors.accent} /><Text style={styles.loadMoreTxt}>過去のDM相手を読み込む</Text></>
                }
              </TouchableOpacity>
            )
          }

          if (item.type === 'section-header') {
            const toggle = item.sectionId === 'following'
              ? () => setFollowingOpen(v => !v)
              : () => setDmOpen(v => !v)
            // セクションごとに異なるアイコン・アクセントカラーを設定
            const isFollowing = item.sectionId === 'following'
            const sectionIcon = isFollowing ? 'radio-outline' : 'chatbubbles-outline'
            const sectionColor = isFollowing ? Colors.accent : '#6B7A8D'  // 配信=ブラウン / DM=ブルーグレー
            return (
              <TouchableOpacity
                style={[styles.sectionHeader, { borderLeftWidth: 3, borderLeftColor: sectionColor }]}
                onPress={toggle}
                activeOpacity={0.7}
              >
                <Ionicons name={sectionIcon} size={15} color={sectionColor} />
                <Text style={[styles.sectionHeaderText, { color: sectionColor }]}>{item.label}</Text>
                <Ionicons
                  name={item.open ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textLight}
                />
              </TouchableOpacity>
            )
          }

          if (item.type === 'following-item') {
            const d = item.data
            return (
              <SwipeableFollowingRow
                data={d}
                isPinned={pinnedIds.has(d.id)}
                isMuted={mutedIds.has(d.id)}
                selected={isDesktop && selectedTalkId === d.id}
                onPress={() => { setSelectedDmId(null); isDesktop ? setSelectedTalkId(d.id) : router.push(`/talk/${d.id}` as any) }}
                onPin={() => togglePin(d.id)}
                onMute={() => toggleMute(d.id)}
                onDelete={() => hideFollowing(d.id)}
                formatTime={formatTime}
              />
            )
          }

          if (item.type === 'dm-item') {
            return (
              <SwipeableDmRow
                data={item.data}
                isPinned={dmPinnedIds.has(item.data.otherId)}
                isMuted={dmMutedIds.has(item.data.otherId)}
                selected={isDesktop && selectedDmId === item.data.otherId}
                onPress={() => {
                  if (isDesktop) {
                    setSelectedTalkId(null)
                    setSelectedDmId(item.data.otherId)
                  } else {
                    router.push({ pathname: '/im/[userId]' as any, params: { userId: item.data.otherId } })
                  }
                }}
                onPin={() => toggleDmPin(item.data.otherId)}
                onMute={() => toggleDmMute(item.data.otherId)}
                onDelete={() => handleDeleteDm(item.data.otherId)}
                formatTime={formatTime}
              />
            )
          }

          return null
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  )
}

const followSwipe = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden', backgroundColor: Colors.white },
  leftActions: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: FOLLOW_LEFT_W, flexDirection: 'row',
  },
  rightActions: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: FOLLOW_RIGHT_W,
  },
  pinBtn: { flex: 1, backgroundColor: PIN_COLOR, alignItems: 'center', justifyContent: 'center', gap: 4 },
  pinBtnActive: { backgroundColor: '#558B2F' },
  muteBtn: { flex: 1, backgroundColor: '#8E8E93', alignItems: 'center', justifyContent: 'center', gap: 4 },
  muteBtnActive: { backgroundColor: '#636366' },
  deleteBtn: { flex: 1, backgroundColor: '#E53E3E', alignItems: 'center', justifyContent: 'center', gap: 4 },
  actionText: { fontSize: 11, color: Colors.white, fontWeight: '700' },
  row: { backgroundColor: Colors.white },
  mutedDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#8E8E93',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.white,
  },
})

const swipeStyles = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden', backgroundColor: Colors.white },
  leftActions: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: DM_LEFT_W, flexDirection: 'row',
  },
  rightActions: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: ACTION_WIDTH,
  },
  pinBtn: { flex: 1, backgroundColor: PIN_COLOR, alignItems: 'center', justifyContent: 'center', gap: 4 },
  pinBtnActive: { backgroundColor: '#558B2F' },
  muteBtn: { flex: 1, backgroundColor: '#8E8E93', alignItems: 'center', justifyContent: 'center', gap: 4 },
  muteBtnActive: { backgroundColor: '#636366' },
  deleteBtn: {
    flex: 1, backgroundColor: '#E53E3E',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  actionText: { fontSize: 11, color: Colors.white, fontWeight: '700' },
  row: { backgroundColor: Colors.white },
  mutedDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#8E8E93',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.white,
  },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: 36,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.accent },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginVertical: 8,
    backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, paddingVertical: 9, fontSize: 14, color: Colors.text },
  loadMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, marginHorizontal: 12, marginBottom: 4,
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  loadMoreTxt: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionHeaderText: {
    flex: 1,
    fontSize: 13, fontWeight: '700', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  talkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.white,
    gap: 12,
  },
  talkItemPinned: {
    borderLeftWidth: 6,
    borderLeftColor: PIN_COLOR,
  },
  talkItemSelected: {
    backgroundColor: `${Colors.accent}18`,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.button,
    alignItems: 'center', justifyContent: 'center',
  },
  selfAvatar: { backgroundColor: Colors.accent },
  avatarImage: { width: 52, height: 52, borderRadius: 26 },
  avatarText: { fontSize: 22, fontWeight: '700', color: Colors.white },
  talkInfo: { flex: 1 },
  talkHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  talkName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  selfBadge: {
    backgroundColor: Colors.accent, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  selfBadgeText: { fontSize: 10, color: Colors.white, fontWeight: '700' },
  talkTime: { fontSize: 12, color: Colors.textLight },
  talkFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lastMessage: { fontSize: 13, color: Colors.textLight, flex: 1 },
  lastMessageUnread: { color: Colors.text, fontWeight: '600' },
  badge: {
    backgroundColor: Colors.accent, borderRadius: 10,
    minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6, marginLeft: 8,
  },
  badgeText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  separator: { height: 1, backgroundColor: Colors.border, marginLeft: 80 },
})

// 担当者依頼セクション用スタイル（薄くて落ち着いたアンバー系）
const escStyles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#FFF8F2',
    borderBottomWidth: 1, borderBottomColor: '#F0C898',
    borderTopWidth: 1, borderTopColor: '#F0C898',
  },
  iconWrap: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#D4875A', alignItems: 'center', justifyContent: 'center',
  },
  headerText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#7A3010' },
  countBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: '#D4875A', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  countBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#FFFBF7',
    borderBottomWidth: 1, borderBottomColor: '#F0C898',
  },
  itemAvatar: { backgroundColor: '#D4875A' },
  itemName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  itemSub: { fontSize: 12, color: '#9B4A15' },
  itemTime: { fontSize: 11, color: Colors.textLight },
  resolveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1, borderColor: '#D4875A',
  },
  resolveBtnText: { fontSize: 11, fontWeight: '600', color: '#7A3010' },
})
