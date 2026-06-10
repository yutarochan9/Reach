import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, Image, Modal, Pressable, Linking, Platform, Animated,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'
import { sendPushToUsers } from '../../lib/notifications'
import { useTalkContext } from '../contexts/TalkContext'

const isWeb = Platform.OS === 'web'

// タイルメニューのモジュールレベルキャッシュ（即時表示用）
const _tileCache = new Map<string, any>()

// ─── 型定義 ────────────────────────────────────────────────────────
type Broadcast = {
  id: string
  content: string
  image_url: string | null
  image_link_url: string | null  // 画像タップで開くURL
  created_at: string
  block_order: number
  group_id: string | null
  public_reactions: boolean
  is_subscriber_only: boolean    // メンバーシップ限定フラグ
}

type BroadcastGroup = {
  anchorId: string
  group_id: string | null
  blocks: Broadcast[]
  like_count: number
  liked: boolean
  read_count: number
  public_reactions: boolean
  comment_count: number
  is_subscriber_only: boolean   // グループ全体のフラグ
}

const DEFAULT_TILE_POS = [
  { x: 0, y: 0, w: 9, h: 9 }, { x: 9, y: 0, w: 9, h: 9 }, { x: 18, y: 0, w: 9, h: 9 },
  { x: 0, y: 9, w: 9, h: 9 }, { x: 9, y: 9, w: 9, h: 9 }, { x: 18, y: 9, w: 9, h: 9 },
]
const GRID_C = 27, GRID_R = 18

export default function TalkDetailPanel({ creatorId, onClose }: { creatorId: string; onClose: () => void }) {
  const senderId = creatorId
  const { setSelectedDmId, setSelectedTalkId, triggerDmReload, isDesktop } = useTalkContext()
  const [myId, setMyId] = useState<string | null>(null)
  const [isSelf, setIsSelf] = useState(false)
  const [isSubscriber, setIsSubscriber] = useState(false)  // メンバーシップ登録状態
  const [loading, setLoading] = useState(true)
  const [senderName, setSenderName] = useState('')
  const [senderAvatar, setSenderAvatar] = useState<string | null>(null)
  const [senderIsOfficial, setSenderIsOfficial] = useState(false)
  const [groups, setGroups] = useState<BroadcastGroup[]>([])
  // 画像の自然サイズキャッシュ（URL → {w, h}）
  const [imageSizes, setImageSizes] = useState<Record<string, { w: number; h: number }>>({})
  const [imText, setImText] = useState('')
  const IM_LINE_H = 22
  const IM_MIN_H  = IM_LINE_H + 20
  const IM_MAX_H  = IM_LINE_H * 5 + 20
  const [imInputH, setImInputH] = useState(IM_MIN_H)
  const [longPressGroup, setLongPressGroup] = useState<BroadcastGroup | null>(null)
  const [tileMenu, setTileMenu] = useState<{ buttons: any[]; is_active: boolean; panel_bg_image?: string | null } | null>(_tileCache.get(senderId) ?? null)
  const [tileOpen, setTileOpen] = useState(true)
  const [tileFullHeight, setTileFullHeight] = useState(0)  // タイルパネルの実際の高さ（FlatListのpaddingBottom用）
  const flatListRef = useRef<FlatList>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const prevScrollYRef = useRef(0)         // スクロール方向検出用
  const tileGridAnim = useRef(new Animated.Value(1)).current  // 1=open, 0=closed
  const tileClosedByScrollRef = useRef(false)  // スクロールで閉じたかどうか
  const tileOpenRef = useRef(true)             // stale closure回避用
  const scrolledFarEnoughRef = useRef(false)   // 十分上にスクロールしたかどうか（再開条件）
  const tileClosedAtRef = useRef(0)            // タイルを閉じた時刻（クールダウン用）

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setMyId(user.id)
      const self = user.id === senderId
      setIsSelf(self)

      // メンバーシップ登録確認（本人以外のみ）
      let subscribed = false
      if (user && !self) {
        try {
          const { data: subData } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('subscriber_id', user.id)
            .eq('creator_id', senderId)
            .eq('status', 'active')
            .maybeSingle()
          subscribed = !!subData
        } catch {}
      }
      setIsSubscriber(subscribed)

      const [{ data: profile }, { data: broadcasts }, { data: menu }] = await Promise.all([
        supabase.from('profiles').select('display_name, avatar_url, is_official').eq('id', senderId).single(),
        supabase.from('broadcasts')
          .select('id, content, image_url, image_link_url, created_at, block_order, group_id, public_reactions, is_subscriber_only')
          .eq('sender_id', senderId).eq('status', 'published')
          .is('step_message_id', null)   // フロー配信（個別送信）は配信一覧に表示しない
          .order('created_at', { ascending: true }),
        supabase.from('tiles').select('buttons, is_active, panel_bg_image').eq('creator_id', senderId).maybeSingle(),
      ])

      setSenderName(profile?.display_name ?? '')
      setSenderAvatar(profile?.avatar_url ?? null)
      setSenderIsOfficial((profile as any)?.is_official ?? false)
      const tileData = menu && menu.is_active ? menu : null
      if (tileData) _tileCache.set(senderId, tileData)
      setTileMenu(tileData)

      // メンバーシップ限定配信は本人またはサブスク登録者のみ表示
      const allBcs = (broadcasts ?? []) as Broadcast[]
      const bcs = self || subscribed ? allBcs : allBcs.filter(b => !b.is_subscriber_only)
      const bcIds = bcs.map(b => b.id)

      const [{ data: reactions }, { data: reads }, { data: commentCounts }] = await Promise.all([
        bcIds.length > 0
          ? supabase.from('reactions').select('broadcast_id, user_id').in('broadcast_id', bcIds)
          : Promise.resolve({ data: [] }),
        bcIds.length > 0
          ? supabase.from('broadcast_reads').select('broadcast_id, user_id').in('broadcast_id', bcIds)
          : Promise.resolve({ data: [] }),
        bcIds.length > 0
          ? supabase.from('messages').select('broadcast_id').in('broadcast_id', bcIds)
          : Promise.resolve({ data: [] }),
      ])

      const likeMap: Record<string, { count: number; liked: boolean }> = {}
      const readMap: Record<string, number> = {}
      const countMap: Record<string, number> = {}
      for (const r of (reactions ?? [])) {
        if (!likeMap[r.broadcast_id]) likeMap[r.broadcast_id] = { count: 0, liked: false }
        likeMap[r.broadcast_id].count++
        if (r.user_id === user.id) likeMap[r.broadcast_id].liked = true
      }
      for (const r of (reads ?? [])) readMap[r.broadcast_id] = (readMap[r.broadcast_id] ?? 0) + 1
      for (const r of (commentCounts ?? [])) countMap[(r as any).broadcast_id] = (countMap[(r as any).broadcast_id] ?? 0) + 1

      const groupMap = new Map<string, Broadcast[]>()
      const groupOrder: string[] = []
      for (const b of bcs) {
        const key = b.group_id ?? b.id
        if (!groupMap.has(key)) { groupMap.set(key, []); groupOrder.push(key) }
        groupMap.get(key)!.push(b)
      }
      const result: BroadcastGroup[] = groupOrder.map(key => {
        const blocks = groupMap.get(key)!.sort((a, b) => a.block_order - b.block_order)
        const anchor = blocks[0]
        return {
          anchorId: anchor.id,
          group_id: anchor.group_id,
          blocks,
          like_count: likeMap[anchor.id]?.count ?? 0,
          liked: likeMap[anchor.id]?.liked ?? false,
          read_count: readMap[anchor.id] ?? 0,
          public_reactions: anchor.public_reactions,
          comment_count: countMap[anchor.id] ?? 0,
          is_subscriber_only: anchor.is_subscriber_only ?? false,
        }
      })
      setGroups(result)

      if (!self && bcIds.length > 0) {
        await supabase.from('talk_reads').upsert(
          { user_id: user.id, sender_id: senderId, last_read_at: new Date().toISOString() },
          { onConflict: 'user_id,sender_id' }
        )
      }
    } catch (e) {
      console.error('TalkDetailPanel load error:', e)
    } finally {
      setLoading(false)
    }
  }, [senderId])

  // creatorId が変わったらリロード
  useEffect(() => {
    setLoading(true)
    setGroups([])
    load()
  }, [load])


  // groups が更新されたら、含まれる画像URLのサイズを取得
  useEffect(() => {
    const urls = groups.flatMap(g =>
      g.blocks.map(b => b.image_url).filter((u): u is string => !!u)
    )
    urls.forEach(url => {
      setImageSizes(prev => {
        if (prev[url]) return prev          // 既に取得済みならスキップ
        Image.getSize(url, (w, h) => {
          setImageSizes(p => ({ ...p, [url]: { w, h } }))
        }, () => {})
        return prev
      })
    })
  }, [groups])

  // URL とパネル内最大幅からアスペクト比を保ったサイズを返す
  const getImgStyle = (url: string, maxW: number) => {
    const size = imageSizes[url]
    if (!size) return { width: maxW, height: Math.round(maxW * 9 / 16) }  // デフォルト16:9
    const ratio = size.h / size.w
    const w = Math.min(maxW, size.w)
    const h = Math.min(Math.round(w * ratio), 360)   // 縦長でも最大360px
    return { width: w, height: h }
  }

  // リアルタイム更新
  useEffect(() => {
    if (!myId || !senderId) return
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
    const channel = supabase
      .channel(`panel-${senderId}-${myId}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'broadcasts',
        filter: `sender_id=eq.${senderId}`,
      }, (payload) => {
        const bc = payload.new as any
        if (bc.status !== 'published') return
        // メンバーシップ限定は非登録者に届かない
        if (bc.is_subscriber_only && !isSelf && !isSubscriber) return
        const newBlock: Broadcast = {
          id: bc.id, content: bc.content, image_url: bc.image_url ?? null,
          image_link_url: bc.image_link_url ?? null,
          created_at: bc.created_at, block_order: bc.block_order,
          group_id: bc.group_id ?? null, public_reactions: bc.public_reactions ?? false,
          is_subscriber_only: bc.is_subscriber_only ?? false,
        }
        setGroups(prev => {
          if (bc.group_id) {
            const existing = prev.find(g => g.group_id === bc.group_id)
            if (existing) return prev.map(g => g.group_id === bc.group_id
              ? { ...g, blocks: [...g.blocks, newBlock].sort((a, b) => a.block_order - b.block_order) } : g)
          }
          return [...prev, {
            anchorId: bc.id, group_id: bc.group_id ?? null, blocks: [newBlock],
            like_count: 0, liked: false, read_count: 0,
            public_reactions: bc.public_reactions ?? false, comment_count: 0,
            is_subscriber_only: bc.is_subscriber_only ?? false,
          }]
        })
        setTimeout(() => flatListRef.current?.scrollToEnd(), 100)
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      if (channelRef.current) { supabase.removeChannel(channelRef.current).catch(() => {}); channelRef.current = null }
    }
  }, [myId, senderId, isSelf, isSubscriber])

  const handleShare = (group: BroadcastGroup) => {
    const textBlock = group.blocks.find(b => b.content.trim() && b.content !== '　')
    const snippet = textBlock ? textBlock.content.slice(0, 60) : ''
    const profileUrl = `https://reachapp.jp/creator/${senderId}`
    const shareText = `${snippet ? snippet + '\n\n' : ''}${senderName} さんのReachをチェック 👀`
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(profileUrl)}`
    if (isWeb && typeof window !== 'undefined') {
      if (navigator.share) {
        navigator.share({ title: `${senderName} on Reach`, text: shareText, url: profileUrl }).catch(() => {})
      } else {
        window.open(tweetUrl, '_blank')
      }
    } else {
      Linking.openURL(tweetUrl)
    }
  }

  const handleLike = async (group: BroadcastGroup) => {
    if (!myId || isSelf) return
    if (group.liked) {
      await supabase.from('reactions').delete().eq('broadcast_id', group.anchorId).eq('user_id', myId).eq('type', 'like')
      setGroups(prev => prev.map(g => g.anchorId === group.anchorId ? { ...g, like_count: Math.max(0, g.like_count - 1), liked: false } : g))
    } else {
      await supabase.from('reactions').insert({ broadcast_id: group.anchorId, user_id: myId, type: 'like' })
      setGroups(prev => prev.map(g => g.anchorId === group.anchorId ? { ...g, like_count: g.like_count + 1, liked: true } : g))
    }
  }

  const sendMessage = async (text: string) => {
    if (!text.trim() || !myId) return
    const content = text.trim()
    await supabase.from('messages').insert({ sender_id: myId, receiver_id: senderId, content })
    const { data: myProfile } = await supabase.from('profiles').select('display_name').eq('id', myId).single()
    sendPushToUsers([senderId], myProfile?.display_name ?? 'メッセージ', content.slice(0, 80))
    setTimeout(async () => {
      await supabase.rpc('check_and_send_auto_response', {
        p_creator_id: senderId, p_receiver_id: myId, p_message: content,
      })
    }, 1200)
  }

  const handleSend = async () => {
    if (!imText.trim() || !myId) return
    const text = imText.trim()
    setImText('')
    await sendMessage(text)
    triggerDmReload()
    if (isDesktop) {
      setSelectedTalkId(null)
      setSelectedDmId(senderId)
    } else {
      router.push(`/im/${senderId}` as any)
    }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  // タイルをアニメーション付きで閉じる
  const closeTileAnimated = (byScroll = false) => {
    tileClosedByScrollRef.current = byScroll
    tileOpenRef.current = false
    setTileOpen(false)
    Animated.timing(tileGridAnim, {
      toValue: 0, duration: 220, useNativeDriver: false,
    }).start()
  }
  // タイルをアニメーション付きで開く
  const openTileAnimated = () => {
    tileOpenRef.current = true
    setTileOpen(true)
    Animated.timing(tileGridAnim, {
      toValue: 1, duration: 250, useNativeDriver: false,
    }).start()
  }

  const normalizedButtons = tileMenu?.buttons.map((b: any, i: number) =>
    b.x != null ? b : { ...b, ...(DEFAULT_TILE_POS[i] ?? { x: 0, y: 0, w: 6, h: 9 }) }
  ) ?? []

  // invertedで下から描画するため逆順にする（hooksはearly returnより前）
  const reversedGroups = useMemo(() => [...groups].reverse(), [groups])

  // タイルボタンコンテンツ（レイアウト計測用に常にレンダリングし、translateYで出し入れ）
  const TilePanel = tileMenu && normalizedButtons.length > 0 ? (
    // タイルの高さを計測するためのラッパー（レイアウト計算に使うが画面外に隠す仕組みはtranslateYで行う）
    <Animated.View
      style={[
        styles.tileContainer,
        {
          // position absoluteでFlatListのレイアウトに影響しない
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          // translateYで下にスライドして隠す（tileFullHeightが0の間は表示したまま）
          transform: [{
            translateY: tileFullHeight > 0
              ? tileGridAnim.interpolate({
                  inputRange: [0, 1],
                  // 0=閉じた状態: handleの高さ(30px)だけ残して残りを下にスライド
                  outputRange: [tileFullHeight - 30, 0],
                })
              : 0,
          }],
        },
      ]}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height
        if (h > 0) setTileFullHeight(h)
      }}
    >
      {tileMenu.panel_bg_image && (
        <Image source={{ uri: tileMenu.panel_bg_image }} style={StyleSheet.absoluteFillObject} resizeMode="cover" pointerEvents="none" />
      )}
      {tileMenu.panel_bg_image && <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.35)' }]} pointerEvents="none" />}
      <TouchableOpacity
        style={[styles.tileHandle, !tileMenu.panel_bg_image && { borderBottomColor: 'rgba(0,0,0,0.06)' }]}
        onPress={() => tileOpen ? closeTileAnimated(false) : openTileAnimated()}
        activeOpacity={0.7}
      >
        <View style={[styles.tileHandleBar, !tileMenu.panel_bg_image && { backgroundColor: 'rgba(0,0,0,0.15)' }]} />
      </TouchableOpacity>
      <View style={styles.tileGridArea}>
        {normalizedButtons.map((btn: any) => (
          <TouchableOpacity
            key={btn.id}
            style={{
              position: 'absolute',
              left: `${(btn.x / GRID_C) * 100}%` as any,
              top: `${(btn.y / GRID_R) * 100}%` as any,
              width: `${(btn.w / GRID_C) * 100}%` as any,
              height: `${(btn.h / GRID_R) * 100}%` as any,
              alignItems: 'center', justifyContent: 'center',
              borderRightWidth: 0.5, borderBottomWidth: 0.5,
              borderColor: tileMenu.panel_bg_image ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)', overflow: 'hidden',
            }}
            onPress={async () => {
              if (btn.action === 'code') {
                const code = btn.code?.trim()
                if (!code || !myId) return
                await supabase.from('messages').insert({ sender_id: myId, receiver_id: senderId, content: code })
                router.push(`/im/${senderId}` as any)
              } else if (btn.action === 'page') {
                router.push(btn.url as any)
              } else if (btn.url) {
                try {
                  const parsed = new URL(btn.url)
                  if (isWeb && parsed.origin === window.location.origin) {
                    router.push(parsed.pathname as any)
                  } else if (btn.url.startsWith('/')) {
                    router.push(btn.url as any)
                  } else {
                    Linking.openURL(btn.url)
                  }
                } catch {
                  if (btn.url.startsWith('/')) router.push(btn.url as any)
                  else Linking.openURL(btn.url)
                }
              }
            }}
            activeOpacity={0.75}
          >
            {btn.bgImage && <Image source={{ uri: btn.bgImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />}
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  ) : null

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* パネルヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color={Colors.textLight} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerAvatar}>
            {senderAvatar
              ? <Image source={{ uri: senderAvatar }} style={styles.headerAvatarImg} />
              : <Text style={styles.headerAvatarText}>{senderName[0]}</Text>
            }
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.headerName}>{senderName}</Text>
            {senderIsOfficial && <Ionicons name="checkmark-circle" size={14} color="#1D9BF0" />}
          </View>
        </View>
        <TouchableOpacity style={styles.profileBtn} onPress={() => router.push(`/creator/${senderId}` as any)}>
          <Ionicons name="person-circle-outline" size={22} color={Colors.textLight} />
        </TouchableOpacity>
      </View>

      {/* メンバーシップ登録中バナー */}
      {!isSelf && isSubscriber && (
        <View style={styles.subscriberBanner}>
          <Ionicons name="star" size={11} color={Colors.accent} />
          <Text style={styles.subscriberBannerText}>メンバーシップ登録中</Text>
        </View>
      )}

      {/* メッセージ一覧 + タイルパネルのコンテナ（relativeでタイルをabsolute配置） */}
      <View style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <FlatList
        ref={flatListRef}
        data={reversedGroups}
        keyExtractor={item => item.anchorId}
        style={{ flex: 1 }}
        // タイルが表示中はその高さ分だけpaddingBottomを取る（タイルの下にコンテンツが隠れないよう）
        // invertedなのでpaddingTopが視覚的な下（最新メッセージ側）に効く＝タイルの後ろに隠れないよう余白を確保
        contentContainerStyle={[styles.messageList, tileFullHeight > 0 && tileMenu ? { paddingTop: tileFullHeight } : undefined]}
        inverted
        onScroll={(e) => {
          const currentY = e.nativeEvent.contentOffset.y
          // inverted時: y=0が最下部(新着)、yが増えると上スクロール(古い方向)
          if (tileOpenRef.current) {
            // タイル表示中: 上に30px以上スクロールしたら閉じる
            if (currentY > prevScrollYRef.current + 30) {
              scrolledFarEnoughRef.current = false
              tileClosedAtRef.current = Date.now()
              closeTileAnimated(true)
            }
          } else if (tileClosedByScrollRef.current && tileMenu) {
            // 閉じてから800ms以内は再開しない（揺り戻し防止）
            const cooldownOk = Date.now() - tileClosedAtRef.current > 800
            // 閉じた後: 上に50px以上行ったら「十分上に行った」とみなす
            if (currentY > prevScrollYRef.current + 50) scrolledFarEnoughRef.current = true
            // 十分上に行った後、下方向に50px以上スクロールしたら再表示
            if (cooldownOk && scrolledFarEnoughRef.current && currentY < prevScrollYRef.current - 50) {
              scrolledFarEnoughRef.current = false
              openTileAnimated()
            }
          }
          prevScrollYRef.current = currentY
        }}
        scrollEventThrottle={50}
        ListEmptyComponent={() => (
          // invertedで180°回転するため、scaleY:-1で打ち消す
          <View style={[styles.emptyWrap, { transform: [{ scaleY: -1 }] }]}>
            <Ionicons name="radio-outline" size={40} color={Colors.border} />
            <Text style={styles.emptyText}>まだ配信がありません</Text>
          </View>
        )}
        renderItem={({ item: group, index }) => {
          if (!group.blocks.length) return null
          // invertedなので index+1 が1つ古いグループ
          const prevGroup = index < reversedGroups.length - 1 ? reversedGroups[index + 1] : null
          const showDate = !prevGroup || !prevGroup.blocks.length ||
            new Date(group.blocks[0].created_at).toDateString() !== new Date(prevGroup.blocks[0].created_at).toDateString()
          return (
            <>
              {showDate && (
                <View style={styles.dateDivider}>
                  <Text style={styles.dateText}>
                    {new Date(group.blocks[0].created_at).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}
                  </Text>
                </View>
              )}
              <View style={styles.groupWrap}>
                <View style={styles.broadcastRow}>
                  {/* アバター（タップでプロフィールへ） */}
                  <TouchableOpacity onPress={() => router.push(`/creator/${senderId}` as any)} activeOpacity={0.8} style={styles.broadcastAvatar}>
                    {senderAvatar
                      ? <Image source={{ uri: senderAvatar }} style={styles.broadcastAvatarImg} />
                      : <Text style={styles.broadcastAvatarText}>{senderName[0]}</Text>
                    }
                  </TouchableOpacity>

                  {/* バブル群 */}
                  <View style={styles.blocksWrap}>
                    {/* 送信者名 + メンバーシップバッジ */}
                    <View style={styles.senderNameRow}>
                      <Text style={styles.senderNameLabel}>{senderName}</Text>
                      {group.is_subscriber_only && (
                        <View style={styles.subscriberBadge}>
                          <Ionicons name="lock-closed" size={10} color={Colors.white} />
                          <Text style={styles.subscriberBadgeText}>メンバーシップ</Text>
                        </View>
                      )}
                    </View>

                    {group.blocks.map((block, idx) => {
                      const hasText = block.content.trim() && block.content !== '　'
                      const isImageOnly = !!block.image_url && !hasText

                      // 画像リンクを開くハンドラー
                      const openImgLink = () => {
                        if (!block.image_link_url) return
                        if (isWeb && typeof window !== 'undefined') {
                          window.open(block.image_link_url, '_blank', 'noopener')
                        } else {
                          Linking.openURL(block.image_link_url).catch(() => {})
                        }
                      }

                      // 画像のみ → 吹き出しなし
                      if (isImageOnly) {
                        const imgDims = getImgStyle(block.image_url!, 280)
                        const imgEl = (
                          <Image
                            source={{ uri: block.image_url! }}
                            style={[styles.broadcastImageOnly, imgDims, idx > 0 && { marginTop: 4 }]}
                            resizeMode="cover"
                          />
                        )
                        return block.image_link_url ? (
                          <TouchableOpacity key={block.id} onPress={openImgLink} activeOpacity={0.85}>
                            {imgEl}
                          </TouchableOpacity>
                        ) : (
                          <View key={block.id}>{imgEl}</View>
                        )
                      }

                      // 画像+テキスト または テキストのみ → 吹き出し
                      const imgDims = block.image_url ? getImgStyle(block.image_url, 280) : null
                      return (
                        <View key={block.id} style={[styles.broadcastBubble, idx > 0 && { marginTop: 4 }]}>
                          {block.image_url && (
                            block.image_link_url ? (
                              <TouchableOpacity onPress={openImgLink} activeOpacity={0.85}>
                                <Image source={{ uri: block.image_url }} style={[styles.broadcastImage, imgDims!]} resizeMode="cover" />
                              </TouchableOpacity>
                            ) : (
                              <Image source={{ uri: block.image_url }} style={[styles.broadcastImage, imgDims!]} resizeMode="cover" />
                            )
                          )}
                          {hasText && (
                            <Text style={styles.broadcastText}>{block.content}</Text>
                          )}
                        </View>
                      )
                    })}
                  </View>
                </View>

                {/* 時刻・シェア・···ボタン */}
                <View style={[styles.bubbleFooter, { paddingLeft: 40 }]}>
                  <Text style={styles.bubbleTime}>{formatTime(group.blocks[group.blocks.length - 1].created_at)}</Text>
                  <TouchableOpacity style={styles.shareBtn} onPress={() => handleShare(group)} activeOpacity={0.7}>
                    <Ionicons name="share-outline" size={13} color={Colors.textLight} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.moreBtn} onPress={() => setLongPressGroup(group)}>
                    <Text style={styles.moreBtnText}>···</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )
        }}
      />

      {/* タイルパネル（position absoluteでFlatListのスクロールに影響しない） */}
      {TilePanel}
      </View>

      {/* リアクションポップアップ */}
      <Modal visible={!!longPressGroup} transparent animationType="slide" onRequestClose={() => setLongPressGroup(null)}>
        <Pressable style={styles.popupOverlay} onPress={() => setLongPressGroup(null)}>
          <Pressable style={styles.popupBox} onPress={e => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <TouchableOpacity
              style={styles.popupBtn}
              onPress={() => { if (!isSelf && longPressGroup) handleLike(longPressGroup); if (!isSelf) setLongPressGroup(null) }}
              activeOpacity={isSelf ? 1 : 0.7}
            >
              <View style={[styles.popupIconWrap, longPressGroup?.liked && { backgroundColor: '#FFF0F0' }]}>
                <Ionicons name={longPressGroup?.liked ? 'heart' : 'heart-outline'} size={22} color={longPressGroup?.liked ? '#E53E3E' : Colors.text} />
              </View>
              <Text style={styles.popupBtnText}>いいね（{longPressGroup?.like_count ?? 0}）</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.popupBtn}
              onPress={() => { if (longPressGroup) router.push(`/broadcast-thread/${longPressGroup.anchorId}` as any); setLongPressGroup(null) }}
            >
              <View style={styles.popupIconWrap}>
                <Ionicons name="chatbubble-outline" size={22} color={Colors.text} />
              </View>
              <Text style={styles.popupBtnText}>コメント（{longPressGroup?.comment_count ?? 0}）</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.popupBtn, styles.popupCancelBtn]} onPress={() => setLongPressGroup(null)}>
              <Text style={styles.popupCancelText}>キャンセル</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* DM入力エリア */}
      <View style={styles.inputArea}>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { height: imInputH }]}
            placeholder="DMを送る。"
            placeholderTextColor={Colors.textLight}
            value={imText}
            onChangeText={setImText}
            multiline
            scrollEnabled={imInputH >= IM_MAX_H}
            onContentSizeChange={e => {
              const h = e.nativeEvent.contentSize.height
              setImInputH(Math.min(Math.max(h, IM_MIN_H), IM_MAX_H))
            }}
          />
          <TouchableOpacity
            style={[styles.sendButton, !imText.trim() && styles.sendDisabled]}
            onPress={handleSend}
            disabled={!imText.trim()}
          >
            <Ionicons name="send" size={18} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header, paddingTop: 14, paddingHorizontal: 12, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  closeBtn: { padding: 4, width: 32 },
  profileBtn: { padding: 4, width: 32, alignItems: 'flex-end' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' },
  headerAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  headerAvatarImg: { width: 32, height: 32, borderRadius: 16 },
  headerAvatarText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  headerName: { fontSize: 14, fontWeight: '700', color: Colors.text },

  // メンバーシップ登録中バナー
  subscriberBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.main, borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  subscriberBannerText: { fontSize: 11, color: Colors.accent, fontWeight: '700' },

  messageList: { padding: 12, gap: 10, paddingBottom: 24 },
  dateDivider: { alignItems: 'center', marginVertical: 6 },
  dateText: {
    fontSize: 11, color: Colors.textLight,
    backgroundColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
  },
  groupWrap: { marginBottom: 4 },
  broadcastRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  broadcastAvatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.button,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden',
  },
  broadcastAvatarImg: { width: 32, height: 32, borderRadius: 16 },
  broadcastAvatarText: { fontSize: 13, fontWeight: '700', color: Colors.white },

  // バブル群のラッパー
  blocksWrap: { flex: 1, flexShrink: 1 },

  // 送信者名 + メンバーシップバッジ（flexWrapで確実に表示）
  senderNameRow: {
    flexDirection: 'row', alignItems: 'center',
    flexWrap: 'wrap', gap: 5, marginBottom: 3,
  },
  senderNameLabel: { fontSize: 11, color: Colors.textLight, fontWeight: '600' },
  subscriberBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.accent, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  subscriberBadgeText: { fontSize: 9, color: Colors.white, fontWeight: '700' },

  // 吹き出し（テキストあり）
  broadcastBubble: {
    backgroundColor: Colors.white, borderRadius: 14, borderTopLeftRadius: 4,
    padding: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
    alignSelf: 'flex-start',   // コンテンツ幅に合わせる
    maxWidth: '100%',           // 親の幅を超えない
  },
  // 吹き出し内の画像（サイズはgetImgStyleで動的計算）
  broadcastImage: { borderRadius: 8, marginBottom: 4 },
  // 画像のみのメッセージ（吹き出しなし）
  broadcastImageOnly: {
    borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
  },
  broadcastText: { fontSize: 13, color: Colors.text, lineHeight: 20 },

  bubbleFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  bubbleTime: { fontSize: 10, color: Colors.textLight },
  shareBtn: {
    paddingHorizontal: 6, paddingVertical: 3,
    backgroundColor: Colors.white, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  moreBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  moreBtnText: { fontSize: 14, color: Colors.textLight, letterSpacing: 1 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  emptyText: { fontSize: 13, color: Colors.textLight },

  tileContainer: { backgroundColor: '#FFFFFF', overflow: 'hidden' },
  tileHandle: { alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  tileHandleBar: { width: 28, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  tileGridArea: { aspectRatio: 27 / 18, overflow: 'hidden' },

  inputArea: { backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 6, gap: 6 },
  input: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 5,
    fontSize: 13, color: Colors.text,
  },
  sendButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { backgroundColor: '#B0B0B0' },

  popupOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  popupBox: { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginVertical: 10 },
  popupBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 20 },
  popupIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  popupBtnText: { fontSize: 15, color: Colors.text, fontWeight: '500' },
  popupCancelBtn: { marginTop: 4, borderTopWidth: 1, borderTopColor: Colors.border },
  popupCancelText: { fontSize: 15, color: Colors.textLight, fontWeight: '500', flex: 1, textAlign: 'center' },
})
