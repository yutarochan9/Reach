import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, Image, Modal, Pressable, Linking, StyleSheet as RN,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'
import { sendPushToUsers } from '../../lib/notifications'

type Broadcast = {
  id: string; content: string; image_url: string | null
  created_at: string; block_order: number; group_id: string | null; public_reactions: boolean
}
type BroadcastGroup = {
  anchorId: string; group_id: string | null; blocks: Broadcast[]
  like_count: number; liked: boolean; read_count: number
  public_reactions: boolean; comment_count: number
}

const DEFAULT_TILE_POS = [
  { x: 0, y: 0, w: 9, h: 9 }, { x: 9, y: 0, w: 9, h: 9 }, { x: 18, y: 0, w: 9, h: 9 },
  { x: 0, y: 9, w: 9, h: 9 }, { x: 9, y: 9, w: 9, h: 9 }, { x: 18, y: 9, w: 9, h: 9 },
]
const GRID_C = 27, GRID_R = 18

export default function TalkDetailPanel({ creatorId, onClose }: { creatorId: string; onClose: () => void }) {
  const senderId = creatorId
  const [myId, setMyId] = useState<string | null>(null)
  const [isSelf, setIsSelf] = useState(false)
  const [loading, setLoading] = useState(true)
  const [senderName, setSenderName] = useState('')
  const [senderAvatar, setSenderAvatar] = useState<string | null>(null)
  const [senderIsOfficial, setSenderIsOfficial] = useState(false)
  const [groups, setGroups] = useState<BroadcastGroup[]>([])
  const [imText, setImText] = useState('')
  const [longPressGroup, setLongPressGroup] = useState<BroadcastGroup | null>(null)
  const [richMenu, setRichMenu] = useState<{ buttons: any[]; is_active: boolean; panel_bg_image?: string | null } | null>(null)
  const [tileOpen, setTileOpen] = useState(true)
  const flatListRef = useRef<FlatList>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setMyId(user.id)
      const self = user.id === senderId
      setIsSelf(self)

      const [{ data: profile }, { data: broadcasts }, { data: menu }] = await Promise.all([
        supabase.from('profiles').select('display_name, avatar_url, is_official').eq('id', senderId).single(),
        supabase.from('broadcasts')
          .select('id, content, image_url, created_at, block_order, group_id, public_reactions')
          .eq('sender_id', senderId).eq('status', 'published')
          .order('created_at', { ascending: true }),
        supabase.from('rich_menus').select('buttons, is_active, panel_bg_image').eq('creator_id', senderId).maybeSingle(),
      ])

      setSenderName(profile?.display_name ?? '')
      setSenderAvatar(profile?.avatar_url ?? null)
      setSenderIsOfficial((profile as any)?.is_official ?? false)
      setRichMenu(menu && menu.is_active ? menu : null)

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
          anchorId: anchor.id, group_id: anchor.group_id, blocks,
          like_count: likeMap[anchor.id]?.count ?? 0, liked: likeMap[anchor.id]?.liked ?? false,
          read_count: readMap[anchor.id] ?? 0, public_reactions: anchor.public_reactions,
          comment_count: countMap[anchor.id] ?? 0,
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

  useEffect(() => {
    if (!myId || !senderId) return
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
    const channel = supabase
      .channel(`panel-${senderId}-${myId}-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'broadcasts', filter: `sender_id=eq.${senderId}` },
        (payload) => {
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
              if (existing) return prev.map(g => g.group_id === bc.group_id
                ? { ...g, blocks: [...g.blocks, newBlock].sort((a, b) => a.block_order - b.block_order) } : g)
            }
            return [...prev, { anchorId: bc.id, group_id: bc.group_id ?? null, blocks: [newBlock], like_count: 0, liked: false, read_count: 0, public_reactions: bc.public_reactions ?? false, comment_count: 0 }]
          })
          setTimeout(() => flatListRef.current?.scrollToEnd(), 100)
        })
      .subscribe()
    channelRef.current = channel
    return () => { if (channelRef.current) { supabase.removeChannel(channelRef.current).catch(() => {}); channelRef.current = null } }
  }, [myId, senderId])

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
    await supabase.from('messages').insert({ sender_id: myId, receiver_id: senderId, content: text.trim() })
    const { data: myProfile } = await supabase.from('profiles').select('display_name').eq('id', myId).single()
    sendPushToUsers([senderId], myProfile?.display_name ?? 'メッセージ', text.trim().slice(0, 80))
  }

  const handleSend = async () => {
    if (!imText.trim() || !myId) return
    const text = imText.trim()
    setImText('')
    await sendMessage(text)
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const normalizedButtons = richMenu?.buttons.map((b: any, i: number) =>
    b.x != null ? b : { ...b, ...(DEFAULT_TILE_POS[i] ?? { x: 0, y: 0, w: 6, h: 9 }) }
  ) ?? []

  const TilePanel = richMenu && normalizedButtons.length > 0 ? (
    <View style={styles.tileContainer}>
      {richMenu.panel_bg_image && (
        <Image source={{ uri: richMenu.panel_bg_image }} style={StyleSheet.absoluteFillObject} resizeMode="cover" pointerEvents="none" />
      )}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]} pointerEvents="none" />
      <TouchableOpacity style={styles.tileHandle} onPress={() => setTileOpen(p => !p)} activeOpacity={0.7}>
        <View style={styles.tileHandleBar} />
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
                borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden',
              }}
              onPress={() => {
                if (btn.action === 'code' && btn.code) {
                  sendMessage(btn.code)
                } else if (btn.url) {
                  Linking.openURL(btn.url)
                }
              }}
              activeOpacity={0.75}
            >
              {btn.bgImage && <Image source={{ uri: btn.bgImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />}
              {btn.bgImage && <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.4)' }]} />}
              <Text style={styles.tileBtnLabel} numberOfLines={1}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
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

      {/* メッセージ一覧 */}
      <FlatList
        ref={flatListRef}
        data={groups}
        keyExtractor={item => item.anchorId}
        style={{ flex: 1 }}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={() => (
          <View style={styles.emptyWrap}>
            <Ionicons name="radio-outline" size={40} color={Colors.border} />
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
                  <View style={{ maxWidth: '80%', flexShrink: 1 }}>
                    <Text style={styles.senderNameLabel}>{senderName}</Text>
                    {group.blocks.map((block, idx) => (
                      <View key={block.id} style={[styles.broadcastBubble, idx > 0 && { marginTop: 4 }]}>
                        {block.image_url && (
                          <Image source={{ uri: block.image_url }} style={styles.broadcastImage} resizeMode="cover" />
                        )}
                        {block.content.trim() && block.content !== '　' && (
                          <Text style={styles.broadcastText}>{block.content}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                </View>
                <View style={[styles.bubbleFooter, { paddingLeft: 44 }]}>
                  <Text style={styles.bubbleTime}>{formatTime(group.blocks[group.blocks.length - 1].created_at)}</Text>
                  <TouchableOpacity style={styles.moreBtn} onPress={() => setLongPressGroup(group)}>
                    <Text style={styles.moreBtnText}>···</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )
        }}
      />

      {/* リアクションポップアップ */}
      <Modal visible={!!longPressGroup} transparent animationType="slide" onRequestClose={() => setLongPressGroup(null)}>
        <Pressable style={styles.popupOverlay} onPress={() => setLongPressGroup(null)}>
          <Pressable style={styles.popupBox} onPress={e => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <TouchableOpacity style={styles.popupBtn}
              onPress={() => { if (!isSelf && longPressGroup) handleLike(longPressGroup); if (!isSelf) setLongPressGroup(null) }}
              activeOpacity={isSelf ? 1 : 0.7}>
              <View style={[styles.popupIconWrap, longPressGroup?.liked && { backgroundColor: '#FFF0F0' }]}>
                <Ionicons name={longPressGroup?.liked ? 'heart' : 'heart-outline'} size={22} color={longPressGroup?.liked ? '#E53E3E' : Colors.text} />
              </View>
              <Text style={styles.popupBtnText}>いいね（{longPressGroup?.like_count ?? 0}）</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.popupBtn}
              onPress={() => { if (longPressGroup) router.push(`/broadcast-thread/${longPressGroup.anchorId}` as any); setLongPressGroup(null) }}>
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

      {TilePanel}

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
  messageList: { padding: 12, gap: 10, paddingBottom: 24 },
  dateDivider: { alignItems: 'center', marginVertical: 6 },
  dateText: { fontSize: 11, color: Colors.textLight, backgroundColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  groupWrap: { marginBottom: 4 },
  broadcastRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  broadcastAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  broadcastAvatarImg: { width: 32, height: 32, borderRadius: 16 },
  broadcastAvatarText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  senderNameLabel: { fontSize: 11, color: Colors.textLight, marginBottom: 3, fontWeight: '600' },
  broadcastBubble: {
    backgroundColor: Colors.white, borderRadius: 14, borderTopLeftRadius: 4,
    padding: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  broadcastImage: { width: '100%', height: 160, borderRadius: 8, marginBottom: 6 },
  broadcastText: { fontSize: 13, color: Colors.text, lineHeight: 20 },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  bubbleTime: { fontSize: 10, color: Colors.textLight },
  moreBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  moreBtnText: { fontSize: 14, color: Colors.textLight, letterSpacing: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  emptyText: { fontSize: 13, color: Colors.textLight },
  tileContainer: { backgroundColor: '#1C1C1E', overflow: 'hidden' },
  tileHandle: { alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  tileHandleBar: { width: 28, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  tileGridArea: { aspectRatio: 27 / 18, overflow: 'hidden' },
  tileBtnLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center', color: '#FFF' },
  inputArea: { backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 6, gap: 6 },
  input: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 5,
    fontSize: 13, color: Colors.text, maxHeight: 80,
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
