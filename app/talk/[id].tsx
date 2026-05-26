import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Modal, Pressable, Linking, Alert,
  useWindowDimensions, ScrollView,
} from 'react-native'
const isWeb = Platform.OS === 'web'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams, router } from 'expo-router'

// セッション内メモリキャッシュ（ナビゲーション往復で即時表示）
const richMenuMem = new Map<string, any>()
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'
import { sendPushToUsers } from '../../lib/notifications'

type Broadcast = {
  id: string
  content: string
  image_url: string | null
  created_at: string
  block_order: number
  group_id: string | null
  public_reactions: boolean
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
}

export default function TalkDetailScreen() {
  const { width } = useWindowDimensions()
  const isDesktop = isWeb && width >= 900
  const params = useLocalSearchParams<{ id: string }>()
  const senderId = Array.isArray(params.id) ? params.id[0] : params.id
  const [myId, setMyId] = useState<string | null>(null)
  const [isSelf, setIsSelf] = useState(false)
  const [loading, setLoading] = useState(true)
  const [senderName, setSenderName] = useState('')
  const [senderAvatar, setSenderAvatar] = useState<string | null>(null)
  const [senderIsOfficial, setSenderIsOfficial] = useState(false)
  const [senderBio, setSenderBio] = useState<string | null>(null)
  const [senderUsername, setSenderUsername] = useState<string | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [groups, setGroups] = useState<BroadcastGroup[]>([])
  const [imText, setImText] = useState('')
  const [longPressGroup, setLongPressGroup] = useState<BroadcastGroup | null>(null)
  const [richMenu, setRichMenu] = useState<{ buttons: any[]; is_active: boolean; panel_bg_image?: string | null } | null>(null)
  const [richMenuLoading, setRichMenuLoading] = useState(true)
  const [tileVisible, setTileVisible] = useState(false)
  const tileLoadedRef = useRef(0)
  const [tileOpen, setTileOpen] = useState(true)
  const flatListRef = useRef<FlatList>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const [webKbHeight, setWebKbHeight] = useState(0)

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const vv = (window as any).visualViewport
    if (!vv) return
    const update = () => setWebKbHeight(Math.max(0, window.innerHeight - vv.height))
    vv.addEventListener('resize', update)
    return () => vv.removeEventListener('resize', update)
  }, [])

  // タイル: メモリ→AsyncStorage→ネットワーク の順に即時表示
  useEffect(() => {
    const key = `rich_menu_${senderId}`

    // 1. メモリキャッシュ（同セッション内は即時・同期）
    if (richMenuMem.has(senderId)) {
      setRichMenu(richMenuMem.get(senderId))
      setRichMenuLoading(false)
    } else {
      // 2. AsyncStorageキャッシュ（アプリ再起動後も即時）
      AsyncStorage.getItem(key).then(cached => {
        if (cached) {
          try {
            const parsed = JSON.parse(cached)
            richMenuMem.set(senderId, parsed)
            setRichMenu(parsed)
          } catch {}
        }
        setRichMenuLoading(false)
      }).catch(() => setRichMenuLoading(false))
    }

    // 3. ネットワーク（常にバックグラウンドで最新化）
    supabase.from('rich_menus')
      .select('buttons, is_active, panel_bg_image')
      .eq('creator_id', senderId)
      .maybeSingle()
      .then(({ data: menu }) => {
        const val = menu?.is_active ? menu : null
        richMenuMem.set(senderId, val)
        setRichMenu(val)
        if (val) AsyncStorage.setItem(key, JSON.stringify(val)).catch(() => {})
        else AsyncStorage.removeItem(key).catch(() => {})
      })
  }, [senderId])

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setMyId(user.id)
      const self = user.id === senderId
      setIsSelf(self)

      const [{ data: profile }, { data: broadcasts }, { data: followRow }] = await Promise.all([
        supabase.from('profiles').select('display_name, avatar_url, is_official, bio, username').eq('id', senderId).single(),
        supabase.from('broadcasts')
          .select('id, content, image_url, created_at, block_order, group_id, public_reactions')
          .eq('sender_id', senderId)
          .eq('status', 'published')
          .order('created_at', { ascending: true }),
        self ? Promise.resolve({ data: null }) :
          supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', senderId).maybeSingle(),
      ])

      setSenderName(profile?.display_name ?? '')
      setSenderAvatar(profile?.avatar_url ?? null)
      setSenderIsOfficial((profile as any)?.is_official ?? false)
      setSenderBio((profile as any)?.bio ?? null)
      setSenderUsername((profile as any)?.username ?? null)
      setIsFollowing(!!followRow)

      const bcs = (broadcasts ?? []) as Broadcast[]
      const bcIds = bcs.map(b => b.id)

      const [{ data: reactions }, { data: reads }, { data: commentCounts }] = await Promise.all([
        bcIds.length > 0
          ? supabase.from('reactions').select('broadcast_id, user_id').in('broadcast_id', bcIds)
          : Promise.resolve({ data: [] }),
        bcIds.length > 0
          ? supabase.from('broadcast_reads').select('broadcast_id, user_id').in('broadcast_id', bcIds)
          : Promise.resolve({ data: [] }),
        bcIds.length > 0
          ? supabase.from('messages')
              .select('broadcast_id')
              .in('broadcast_id', bcIds)
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
        }
      })
      setGroups(result)

      if (!self && bcIds.length > 0) {
        await supabase.from('talk_reads').upsert(
          { user_id: user.id, sender_id: senderId, last_read_at: new Date().toISOString() },
          { onConflict: 'user_id,sender_id' }
        )
        const alreadyRead = new Set(
          (reads ?? []).filter((r: any) => r.user_id === user.id).map((r: any) => r.broadcast_id)
        )
        const toMark = bcIds.filter(id => !alreadyRead.has(id))
        if (toMark.length > 0) {
          await supabase.from('broadcast_reads').upsert(
            toMark.map(id => ({ broadcast_id: id, user_id: user.id })),
            { onConflict: 'broadcast_id,user_id' }
          )
        }
      }
    } catch (e) {
      console.error('talk/[id] load error:', e)
    } finally {
      setLoading(false)
    }
  }, [senderId])

  useEffect(() => { load() }, [load])

  // richMenu が確定したら画像を事前ロードし、全部揃ったら一斉表示
  useEffect(() => {
    if (richMenuLoading) return
    if (!richMenu || !richMenu.buttons?.length) {
      setTileVisible(false)
      return
    }
    const imgUrls = richMenu.buttons
      .map((b: any) => b.bgImage)
      .filter(Boolean) as string[]
    const panelBg = richMenu.panel_bg_image
    const allUrls = panelBg ? [panelBg, ...imgUrls] : imgUrls

    if (allUrls.length === 0) {
      setTileVisible(true)
      return
    }
    tileLoadedRef.current = 0
    setTileVisible(false)
    allUrls.forEach(url => {
      if (isWeb && typeof window !== 'undefined') {
        const img = new window.Image()
        img.onload = img.onerror = () => {
          tileLoadedRef.current++
          if (tileLoadedRef.current >= allUrls.length) setTileVisible(true)
        }
        img.src = url
      } else {
        Image.prefetch(url)
          .catch(() => {})
          .finally(() => {
            tileLoadedRef.current++
            if (tileLoadedRef.current >= allUrls.length) setTileVisible(true)
          })
      }
    })
  }, [richMenu, richMenuLoading])

  useEffect(() => {
    if (!myId || !senderId) return
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    const channel = supabase
      .channel(`talk-detail-${senderId}-${myId}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'broadcasts',
        filter: `sender_id=eq.${senderId}`,
      }, (payload) => {
        try {
          const bc = payload.new as any
          if (bc.status !== 'published') return
          const newBlock: Broadcast = {
            id: bc.id, content: bc.content, image_url: bc.image_url ?? null,
            created_at: bc.created_at, block_order: bc.block_order,
            group_id: bc.group_id ?? null, public_reactions: bc.public_reactions ?? false,
          }
          setGroups(prev => {
            if (bc.group_id) {
              const existing = prev.find(g => g.group_id === bc.group_id)
              if (existing) {
                return prev.map(g =>
                  g.group_id === bc.group_id
                    ? { ...g, blocks: [...g.blocks, newBlock].sort((a, b) => a.block_order - b.block_order) }
                    : g
                )
              }
            }
            return [...prev, {
              anchorId: bc.id, group_id: bc.group_id ?? null, blocks: [newBlock],
              like_count: 0, liked: false, read_count: 0,
              public_reactions: bc.public_reactions ?? false, comment_count: 0,
            }]
          })
          setTimeout(() => flatListRef.current?.scrollToEnd(), 100)
          if (myId !== senderId) {
            supabase.from('broadcast_reads').upsert(
              { broadcast_id: bc.id, user_id: myId },
              { onConflict: 'broadcast_id,user_id' }
            ).catch(() => {})
          }
        } catch {}
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' }, (payload) => {
        setGroups(prev => prev.map(g =>
          g.anchorId === payload.new.broadcast_id
            ? { ...g, like_count: g.like_count + 1, liked: payload.new.user_id === myId ? true : g.liked }
            : g
        ))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reactions' }, (payload) => {
        setGroups(prev => prev.map(g =>
          g.anchorId === payload.old?.broadcast_id
            ? { ...g, like_count: Math.max(0, g.like_count - 1), liked: payload.old?.user_id === myId ? false : g.liked }
            : g
        ))
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(() => {})
        channelRef.current = null
      }
    }
  }, [myId, senderId])

  const handleLike = async (group: BroadcastGroup) => {
    if (!myId || isSelf) return
    if (group.liked) {
      await supabase.from('reactions').delete()
        .eq('broadcast_id', group.anchorId).eq('user_id', myId).eq('type', 'like')
      setGroups(prev => prev.map(g =>
        g.anchorId === group.anchorId ? { ...g, like_count: Math.max(0, g.like_count - 1), liked: false } : g
      ))
    } else {
      await supabase.from('reactions').insert({ broadcast_id: group.anchorId, user_id: myId, type: 'like' })
      setGroups(prev => prev.map(g =>
        g.anchorId === group.anchorId ? { ...g, like_count: g.like_count + 1, liked: true } : g
      ))
    }
  }

  const handleDelete = (group: BroadcastGroup) => {
    setLongPressGroup(null)
    Alert.alert('配信を削除', 'この配信を削除しますか？この操作は取り消せません。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          if (group.group_id) {
            await supabase.from('broadcasts').delete().eq('group_id', group.group_id)
          } else {
            await supabase.from('broadcasts').delete().eq('id', group.anchorId)
          }
          setGroups(prev => prev.filter(g => g.anchorId !== group.anchorId))
        },
      },
    ])
  }

  const handleFollowToggle = async () => {
    if (!myId) return
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', myId).eq('following_id', senderId)
      setIsFollowing(false)
    } else {
      await supabase.from('follows').insert({ follower_id: myId, following_id: senderId })
      setIsFollowing(true)
    }
  }

  const handleSend = async () => {
    if (!imText.trim() || !myId) return
    const text = imText.trim()
    setImText('')
    await supabase.from('messages').insert({
      sender_id: myId,
      receiver_id: senderId,
      content: text,
    })
    const { data: myProfile } = await supabase
      .from('profiles').select('display_name').eq('id', myId).single()
    sendPushToUsers([senderId], myProfile?.display_name ?? 'メッセージ', text.slice(0, 80))

    // 自動応答
    const capturedMyId = myId
    setTimeout(async () => {
      await supabase.rpc('check_and_send_auto_response', {
        p_creator_id: senderId,
        p_receiver_id: capturedMyId,
        p_message: text,
      })
    }, 1200)

    // DM画面へ遷移
    router.push(`/im/${senderId}` as any)
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  const BroadcastList = (
    <FlatList
      ref={flatListRef}
      data={groups}
      keyExtractor={item => item.anchorId}
      style={{ flex: 1 }}
      contentContainerStyle={styles.messageList}
      onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      ListEmptyComponent={() => (
        <View style={styles.emptyWrap}>
          <Ionicons name="radio-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyText}>まだ配信がありません</Text>
        </View>
      )}
      renderItem={({ item: group, index }) => {
        if (!group.blocks.length) return null
        const prevGroup = index > 0 ? groups[index - 1] : null
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
                <View style={styles.broadcastAvatar}>
                  {senderAvatar
                    ? <Image source={{ uri: senderAvatar }} style={styles.broadcastAvatarImg} />
                    : <Text style={styles.broadcastAvatarText}>{senderName[0]}</Text>
                  }
                </View>
                <View style={styles.blocksWrap}>
                  <Text style={styles.senderNameLabel}>{senderName}</Text>
                  {group.blocks.map((block, idx) => (
                    <View key={block.id} style={[styles.broadcastBubble, isSelf && styles.broadcastBubbleSelf, idx > 0 && { marginTop: 4 }]}>
                      {block.image_url && (
                        <Image source={{ uri: block.image_url }} style={styles.broadcastImage} resizeMode="cover" />
                      )}
                      {block.content.trim() && block.content !== '　' && (
                        <Text style={[styles.broadcastText, isSelf && styles.broadcastTextSelf]}>{block.content}</Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>

              {/* 時刻 + ···ボタン */}
              <View style={[styles.bubbleFooter, { paddingLeft: 44 }]}>
                <Text style={styles.bubbleTime}>
                  {formatTime(group.blocks[group.blocks.length - 1].created_at)}
                </Text>
                <TouchableOpacity
                  style={styles.moreBtn}
                  onPress={() => setLongPressGroup(group)}
                >
                  <Text style={styles.moreBtnText}>···</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )
      }}
    />
  )

  const ReactionPopup = (
    <Modal
      visible={!!longPressGroup}
      transparent
      animationType="slide"
      onRequestClose={() => setLongPressGroup(null)}
    >
      <Pressable style={styles.popupOverlay} onPress={() => setLongPressGroup(null)}>
        <Pressable style={styles.popupBox} onPress={e => e.stopPropagation()}>
          {/* ドラッグハンドル */}
          <View style={styles.sheetHandle} />

          {/* 公開/非公開インジケーター */}
          <View style={styles.popupPublicRow}>
            <Ionicons
              name={longPressGroup?.public_reactions ? 'globe-outline' : 'lock-closed-outline'}
              size={13}
              color={Colors.textLight}
            />
            <Text style={styles.popupPublicText}>
              {longPressGroup?.public_reactions ? '公開配信' : '非公開配信'}
            </Text>
          </View>

          {/* いいね（全員表示、視聴者のみタップ可） */}
          <TouchableOpacity
            style={styles.popupBtn}
            onPress={() => {
              if (!isSelf && longPressGroup) handleLike(longPressGroup)
              if (!isSelf) setLongPressGroup(null)
            }}
            activeOpacity={isSelf ? 1 : 0.7}
          >
            <View style={[styles.popupIconWrap, longPressGroup?.liked && { backgroundColor: '#FFF0F0' }]}>
              <Ionicons
                name={longPressGroup?.liked ? 'heart' : 'heart-outline'}
                size={22}
                color={longPressGroup?.liked ? '#E53E3E' : Colors.text}
              />
            </View>
            <Text style={styles.popupBtnText}>いいね（{longPressGroup?.like_count ?? 0}）</Text>
          </TouchableOpacity>

          {/* コメント（全員） */}
          <TouchableOpacity
            style={styles.popupBtn}
            onPress={() => {
              if (longPressGroup) router.push(`/broadcast-thread/${longPressGroup.anchorId}` as any)
              setLongPressGroup(null)
            }}
          >
            <View style={styles.popupIconWrap}>
              <Ionicons name="chatbubble-outline" size={22} color={Colors.text} />
            </View>
            <Text style={styles.popupBtnText}>コメント（{longPressGroup?.comment_count ?? 0}）</Text>
          </TouchableOpacity>

          {/* 削除（自分の配信のみ） */}
          {isSelf && longPressGroup && (
            <TouchableOpacity style={styles.popupBtn} onPress={() => handleDelete(longPressGroup)}>
              <View style={[styles.popupIconWrap, { backgroundColor: '#FFF0F0' }]}>
                <Ionicons name="trash-outline" size={22} color="#E53E3E" />
              </View>
              <Text style={[styles.popupBtnText, { color: '#E53E3E' }]}>削除</Text>
            </TouchableOpacity>
          )}

          {/* キャンセル */}
          <TouchableOpacity style={[styles.popupBtn, styles.popupCancelBtn]} onPress={() => setLongPressGroup(null)}>
            <Text style={styles.popupCancelText}>キャンセル</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  )

  // タイルグリッドのJSX（isSelf・非selfで共有）
  // 旧形式（x/y/w/h なし）のデフォルト配置
  const DEFAULT_TILE_POS = [
    { x: 0, y: 0, w: 9, h: 9 }, { x: 9, y: 0, w: 9, h: 9 }, { x: 18, y: 0, w: 9, h: 9 },
    { x: 0, y: 9, w: 9, h: 9 }, { x: 9, y: 9, w: 9, h: 9 }, { x: 18, y: 9, w: 9, h: 9 },
  ]
  const GRID_C = 27
  const GRID_R = 18
  const normalizedButtons = richMenu?.buttons.map((b: any, i: number) =>
    b.x != null ? b : { ...b, ...(DEFAULT_TILE_POS[i] ?? { x: 0, y: 0, w: 6, h: 9 }) }
  ) ?? []

  const TilePanel = tileVisible && richMenu && normalizedButtons.length > 0 ? (
    <View style={[
      styles.tileContainer,
      isWeb && richMenu.panel_bg_image
        ? { backgroundImage: `url(${richMenu.panel_bg_image})`, backgroundSize: 'cover', backgroundPosition: 'center' } as any
        : undefined,
    ]}>
          {/* ネイティブのみImage使用。webはCSSbackgroundImageで同一レンダリングサイクルに表示 */}
          {!isWeb && richMenu.panel_bg_image && (
            <Image source={{ uri: richMenu.panel_bg_image }} style={StyleSheet.absoluteFillObject} resizeMode="cover" pointerEvents="none" />
          )}
          {richMenu.panel_bg_image && <View style={styles.panelDimOverlay} pointerEvents="none" />}
          <TouchableOpacity style={[styles.tileHandle, !richMenu.panel_bg_image && { borderBottomColor: 'rgba(0,0,0,0.06)' }]} onPress={() => setTileOpen(p => !p)} activeOpacity={0.7}>
            <View style={[styles.tileHandleBar, !richMenu.panel_bg_image && { backgroundColor: 'rgba(0,0,0,0.15)' }]} />
          </TouchableOpacity>
          {tileOpen && (
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
                    borderColor: richMenu.panel_bg_image ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)',
                    overflow: 'hidden',
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
                        if (Platform.OS === 'web' && parsed.origin === window.location.origin) {
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
          )}
        </View>
  ) : null

  if (isSelf) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>あなたの配信</Text>
          <View style={{ width: 32 }} />
        </View>
        {BroadcastList}
        {ReactionPopup}
        {TilePanel}
      </View>
    )
  }

  // デスクトップ用右パネル（プロフィール）
  const RightPanel = isDesktop ? (
    <View style={styles.rightPanel}>
      <View style={styles.rightPanelHeader}>
        <Text style={styles.rightPanelHeaderText}>プロフィール</Text>
      </View>
      <ScrollView contentContainerStyle={styles.rightPanelScroll}>
        {/* アバター行（メッセージタブのリスト行スタイル） */}
        <TouchableOpacity
          style={styles.rpRow}
          onPress={() => router.push(`/creator/${senderId}` as any)}
          activeOpacity={0.8}
        >
          <View style={styles.rpAvatar}>
            {senderAvatar
              ? <Image source={{ uri: senderAvatar }} style={styles.rpAvatarImg} />
              : <Text style={styles.rpAvatarText}>{senderName[0]}</Text>
            }
          </View>
          <View style={styles.rpInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.rpName}>{senderName}</Text>
              {senderIsOfficial && <Ionicons name="checkmark-circle" size={14} color="#1D9BF0" />}
            </View>
            {senderUsername ? <Text style={styles.rpUsername}>@{senderUsername}</Text> : null}
          </View>
        </TouchableOpacity>

        <View style={styles.rpDivider} />

        {senderBio ? (
          <>
            <View style={styles.rpSection}>
              <Text style={styles.rpSectionLabel}>BIO</Text>
              <Text style={styles.rpBio}>{senderBio}</Text>
            </View>
            <View style={styles.rpDivider} />
          </>
        ) : null}

        <View style={styles.rpSection}>
          <TouchableOpacity
            style={[styles.rpFollowBtn, isFollowing && styles.rpFollowingBtn]}
            onPress={handleFollowToggle}
            activeOpacity={0.8}
          >
            <Text style={[styles.rpFollowTxt, isFollowing && styles.rpFollowingTxt]}>
              {isFollowing ? 'フォロー中' : 'フォローする'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  ) : null

  return (
    <View style={styles.outerWrap}>
      {RightPanel}
      <KeyboardAvoidingView
        style={[styles.container, isWeb && webKbHeight > 0 ? { paddingBottom: webKbHeight } : undefined]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.headerAvatar}>
              {senderAvatar
                ? <Image source={{ uri: senderAvatar }} style={styles.headerAvatarImage} />
                : <Text style={styles.headerAvatarText}>{senderName[0]}</Text>
              }
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.headerName}>{senderName}</Text>
              {senderIsOfficial && <Ionicons name="checkmark-circle" size={14} color="#1D9BF0" />}
            </View>
          </View>
          <View style={{ width: 32 }} />
        </View>

        {BroadcastList}
        {ReactionPopup}
        {TilePanel}

        {/* DM入力エリア（常に表示） */}
        <View style={styles.inputArea}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="DMを送る..."
              placeholderTextColor={Colors.textLight}
              value={imText}
              onChangeText={setImText}
              multiline
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
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  outerWrap: { flex: 1, flexDirection: 'row', backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: isWeb ? 12 : 56, paddingHorizontal: 16, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'center' },
  headerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  headerAvatarImage: { width: 36, height: 36, borderRadius: 18 },
  headerAvatarText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  headerName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  rightPanel: {
    width: 320,
    flexShrink: 0,
    backgroundColor: Colors.header,
    borderRightWidth: 1, borderRightColor: Colors.border,
  },
  rightPanelHeader: {
    paddingTop: 12, paddingBottom: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rightPanelHeaderText: { fontSize: 13, fontWeight: '700', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  rightPanelScroll: { paddingBottom: 32 },
  rpRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.white,
  },
  rpAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  rpAvatarImg: { width: 48, height: 48, borderRadius: 24 },
  rpAvatarText: { fontSize: 20, fontWeight: '700', color: Colors.white },
  rpInfo: { flex: 1 },
  rpName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  rpUsername: { fontSize: 12, color: Colors.textLight, marginTop: 1 },
  rpDivider: { height: 1, backgroundColor: Colors.border },
  rpSection: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: Colors.white },
  rpSectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  rpBio: { fontSize: 13, color: Colors.text, lineHeight: 19 },
  rpFollowBtn: {
    backgroundColor: Colors.accent, borderRadius: 20,
    paddingVertical: 9, alignItems: 'center',
  },
  rpFollowingBtn: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.accent },
  rpFollowTxt: { fontSize: 14, fontWeight: '700', color: Colors.white },
  rpFollowingTxt: { color: Colors.accent },
  messageList: { padding: 16, gap: 12, paddingBottom: 32 },

  dateDivider: { alignItems: 'center', marginVertical: 8 },
  dateText: {
    fontSize: 11, color: Colors.textLight,
    backgroundColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12,
  },
  groupWrap: { marginBottom: 4 },
  broadcastRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  broadcastAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.button,
    alignItems: 'center', justifyContent: 'center', marginTop: 2, overflow: 'hidden', flexShrink: 0,
  },
  broadcastAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  broadcastAvatarText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  blocksWrap: { maxWidth: '80%', flexShrink: 1 },
  senderNameLabel: { fontSize: 11, color: Colors.textLight, marginBottom: 3, fontWeight: '600' },
  broadcastBubble: {
    backgroundColor: Colors.white, borderRadius: 16, borderTopLeftRadius: 4,
    padding: 12, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
    alignSelf: 'flex-start',
  },
  broadcastBubbleSelf: { backgroundColor: Colors.button },
  broadcastImage: { width: 220, height: 160, borderRadius: 12, marginBottom: 4 },
  broadcastText: { fontSize: 14, color: Colors.text, lineHeight: 21 },
  broadcastTextSelf: { color: Colors.white },
  bubbleFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap',
  },
  bubbleTime: { fontSize: 10, color: Colors.textLight },
  countBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  countBadgeText: { fontSize: 11, color: Colors.textLight },
  moreBtn: {
    paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
  },
  moreBtnText: { fontSize: 14, color: Colors.textLight, letterSpacing: 2 },
  popupOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  popupBox: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 32, paddingTop: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 12,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 12,
  },
  popupPublicRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 24, paddingBottom: 12,
  },
  popupPublicText: { fontSize: 12, color: Colors.textLight },
  popupBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingVertical: 16, paddingHorizontal: 24,
  },
  popupIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  popupBtnText: { fontSize: 16, color: Colors.text, fontWeight: '500' },
  popupCancelBtn: { marginTop: 4, borderTopWidth: 1, borderTopColor: Colors.border },
  popupCancelText: { fontSize: 16, color: Colors.textLight, fontWeight: '500', flex: 1, textAlign: 'center' },
  inputArea: {
    backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, gap: 8 },
  input: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 22,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 16, color: Colors.text, maxHeight: 100,
  },
  sendButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: '#B0B0B0' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textLight },
  tileContainer: { backgroundColor: '#FFFFFF', overflow: 'hidden' },
  panelDimOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  tileHandle: {
    alignItems: 'center', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  tileHandleBar: { width: 32, height: 3, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.15)' },
  // 18:27グリッド比率で絶対配置タイルを並べるエリア
  tileGridArea: { aspectRatio: 27 / 18, overflow: 'hidden' },
  tileBtnImgOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  tileSeparator: { width: 32, height: 2, backgroundColor: Colors.accent, marginVertical: 6 },
  tileBtnLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center', color: Colors.text },
})
