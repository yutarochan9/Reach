import { useState, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

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

type FollowerItem = {
  id: string
  name: string
  avatar: string | null
  lastIm: string | null
  lastImTime: string | null
  is_official: boolean
}

type FlatRow =
  | { type: 'my'; myId: string; name: string; avatar: string | null; last_content: string; created_at: string; is_official: boolean; public_reactions: boolean; like_count: number; comment_count: number }
  | { type: 'section-header'; sectionId: 'following' | 'followers'; label: string; open: boolean; count: number }
  | { type: 'following-item'; data: FollowingItem }
  | { type: 'follower-item'; data: FollowerItem }

export default function TalkScreen() {
  const [myId, setMyId] = useState<string | null>(null)
  const [myItem, setMyItem] = useState<{ name: string; avatar: string | null; last_content: string; created_at: string; is_official: boolean; public_reactions: boolean; like_count: number; comment_count: number } | null>(null)
  const [followingItems, setFollowingItems] = useState<FollowingItem[]>([])
  const [followerItems, setFollowerItems] = useState<FollowerItem[]>([])
  const [followingOpen, setFollowingOpen] = useState(true)
  const [followersOpen, setFollowersOpen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const load = useCallback(async () => {
    try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setMyId(user.id)

    const [
      { data: followingData },
      { data: followerData },
      { data: myProfile },
      { data: myBroadcasts },
    ] = await Promise.all([
      supabase.from('follows').select('following_id').eq('follower_id', user.id),
      supabase.from('follows').select('follower_id').eq('following_id', user.id),
      supabase.from('profiles').select('display_name, avatar_url, is_official').eq('id', user.id).single(),
      supabase.from('broadcasts')
        .select('id, content, created_at, public_reactions')
        .eq('sender_id', user.id).eq('status', 'published')
        .order('created_at', { ascending: false }).limit(1),
    ])

    const followingIds = (followingData ?? []).map((f: any) => f.following_id)
    const followerIds = (followerData ?? []).map((f: any) => f.follower_id)

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
    setMyItem({
      name: myProfile?.display_name ?? 'あなた',
      avatar: myProfile?.avatar_url ?? null,
      last_content: myLastBroadcast?.content ?? 'まだ配信がありません',
      created_at: myLastBroadcast?.created_at ?? new Date().toISOString(),
      is_official: (myProfile as any)?.is_official ?? false,
      public_reactions: myLastBroadcast?.public_reactions ?? false,
      like_count: myLikeCount,
      comment_count: myCommentCount,
    })

    // フォロー中セクション
    if (followingIds.length > 0) {
      const [{ data: broadcasts }, { data: reads }, { data: profiles }] = await Promise.all([
        supabase.from('broadcasts')
          .select('id, sender_id, content, created_at, public_reactions')
          .in('sender_id', followingIds)
          .eq('status', 'published')
          .order('created_at', { ascending: false }),
        supabase.from('talk_reads').select('sender_id, last_read_at').eq('user_id', user.id),
        supabase.from('profiles').select('id, display_name, avatar_url, is_official').in('id', followingIds),
      ])

      const readMap: Record<string, string> = {}
      ;(reads ?? []).forEach((r: any) => { readMap[r.sender_id] = r.last_read_at })

      const profMap: Record<string, { display_name: string; avatar_url: string | null; is_official: boolean }> = {}
      for (const p of (profiles ?? [])) profMap[p.id] = p

      const senderBroadcasts: Record<string, any[]> = {}
      for (const b of (broadcasts ?? [])) {
        if (!senderBroadcasts[b.sender_id]) senderBroadcasts[b.sender_id] = []
        senderBroadcasts[b.sender_id].push(b)
      }

      const publicBcIds = followingIds
        .map(id => senderBroadcasts[id]?.[0])
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
        const latest = bcs[0]
        const lastRead = readMap[id]
        const unread = lastRead ? bcs.filter((b: any) => b.created_at > lastRead).length : bcs.length
        return {
          id,
          name: profMap[id]?.display_name ?? '?',
          avatar: profMap[id]?.avatar_url ?? null,
          last_content: latest?.content ?? 'まだ配信がありません',
          created_at: latest?.created_at ?? new Date(0).toISOString(),
          unread,
          is_official: profMap[id]?.is_official ?? false,
          public_reactions: latest?.public_reactions ?? false,
          like_count: latest?.public_reactions ? (likeMap[latest.id] ?? 0) : 0,
          comment_count: latest?.public_reactions ? (commentMap[latest.id] ?? 0) : 0,
        }
      }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      setFollowingItems(fItems)
    } else {
      setFollowingItems([])
    }

    // フォロワーセクション
    if (followerIds.length > 0) {
      const [{ data: profData }, { data: imMessages }] = await Promise.all([
        supabase.from('profiles').select('id, display_name, avatar_url, is_official').in('id', followerIds),
        supabase.from('messages')
          .select('id, content, sender_id, created_at')
          .eq('receiver_id', user.id)
          .is('broadcast_id', null)
          .in('sender_id', followerIds)
          .order('created_at', { ascending: false }),
      ])

      const profMap2: Record<string, { display_name: string; avatar_url: string | null; is_official: boolean }> = {}
      for (const p of (profData ?? [])) profMap2[p.id] = p

      const latestImMap: Record<string, { content: string; created_at: string }> = {}
      for (const m of (imMessages ?? [])) {
        if (!latestImMap[m.sender_id]) {
          latestImMap[m.sender_id] = { content: m.content, created_at: m.created_at }
        }
      }

      setFollowerItems(followerIds.map(id => ({
        id,
        name: profMap2[id]?.display_name ?? '?',
        avatar: profMap2[id]?.avatar_url ?? null,
        lastIm: latestImMap[id]?.content ?? null,
        lastImTime: latestImMap[id]?.created_at ?? null,
        is_official: profMap2[id]?.is_official ?? false,
      })))
    } else {
      setFollowerItems([])
    }

    setLoading(false)
    } catch (e) {
      console.error('talk load error:', e)
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => {
    load()
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current).catch(() => {})
      channelRef.current = null
    }
    const channel = supabase
      .channel(`talk-list-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'broadcasts' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => load())
      .subscribe()
    channelRef.current = channel
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(() => {})
        channelRef.current = null
      }
    }
  }, [load]))

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

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

  // フラットリストデータを構築
  const flatData: FlatRow[] = []

  if (myId && myItem) {
    flatData.push({ type: 'my', myId, ...myItem })
  }

  flatData.push({
    type: 'section-header', sectionId: 'following',
    label: 'フォロー中', open: followingOpen, count: followingItems.length,
  })
  if (followingOpen) {
    followingItems.forEach(d => flatData.push({ type: 'following-item', data: d }))
  }

  flatData.push({
    type: 'section-header', sectionId: 'followers',
    label: 'フォロワー', open: followersOpen, count: followerItems.length,
  })
  if (followersOpen) {
    followerItems.forEach(d => flatData.push({ type: 'follower-item', data: d }))
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>トーク</Text>
      </View>

      <FlatList
        data={flatData}
        keyExtractor={(item) => {
          if (item.type === 'my') return 'my'
          if (item.type === 'section-header') return `header-${item.sectionId}`
          if (item.type === 'following-item') return `following-${item.data.id}`
          if (item.type === 'follower-item') return `follower-${item.data.id}`
          return 'unknown'
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        renderItem={({ item }) => {
          if (item.type === 'my') {
            return (
              <TouchableOpacity style={styles.talkItem} onPress={() => router.push(`/talk/${item.myId}` as any)}>
                <View style={[styles.avatar, styles.selfAvatar]}>
                  {item.avatar
                    ? <Image source={{ uri: item.avatar }} style={styles.avatarImage} />
                    : <Text style={styles.avatarText}>{item.name[0]}</Text>
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

          if (item.type === 'section-header') {
            const toggle = item.sectionId === 'following'
              ? () => setFollowingOpen(v => !v)
              : () => setFollowersOpen(v => !v)
            return (
              <TouchableOpacity style={styles.sectionHeader} onPress={toggle} activeOpacity={0.7}>
                <View style={styles.sectionHeaderLeft}>
                  <Text style={styles.sectionHeaderText}>{item.label}</Text>
                  {item.count > 0 && (
                    <View style={styles.sectionCount}>
                      <Text style={styles.sectionCountText}>{item.count}</Text>
                    </View>
                  )}
                </View>
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
              <TouchableOpacity style={styles.talkItem} onPress={() => router.push(`/talk/${d.id}` as any)}>
                <TouchableOpacity
                  onPress={() => router.push(`/creator/${d.id}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={styles.avatar}>
                    {d.avatar
                      ? <Image source={{ uri: d.avatar }} style={styles.avatarImage} />
                      : <Text style={styles.avatarText}>{d.name[0]}</Text>
                    }
                  </View>
                </TouchableOpacity>
                <View style={styles.talkInfo}>
                  <View style={styles.talkHeader}>
                    <View style={styles.nameRow}>
                      <Text style={styles.talkName}>{d.name}</Text>
                      {d.is_official && <Ionicons name="checkmark-circle" size={14} color="#1D9BF0" />}
                    </View>
                    <Text style={styles.talkTime}>{formatTime(d.created_at)}</Text>
                  </View>
                  <View style={styles.talkFooter}>
                    <Text style={[styles.lastMessage, d.unread > 0 && styles.lastMessageUnread]} numberOfLines={1}>
                      {d.last_content}
                    </Text>
                    {d.unread > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{d.unread > 99 ? '99+' : d.unread}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            )
          }

          if (item.type === 'follower-item') {
            const d = item.data
            return (
              <TouchableOpacity style={styles.talkItem} onPress={() => router.push(`/im/${d.id}` as any)}>
                <View style={styles.avatar}>
                  {d.avatar
                    ? <Image source={{ uri: d.avatar }} style={styles.avatarImage} />
                    : <Text style={styles.avatarText}>{d.name[0]}</Text>
                  }
                </View>
                <View style={styles.talkInfo}>
                  <View style={styles.talkHeader}>
                    <View style={styles.nameRow}>
                      <Text style={styles.talkName}>{d.name}</Text>
                      {d.is_official && <Ionicons name="checkmark-circle" size={14} color="#1D9BF0" />}
                    </View>
                    {d.lastImTime && <Text style={styles.talkTime}>{formatTime(d.lastImTime)}</Text>}
                  </View>
                  {d.lastIm && (
                    <Text style={styles.lastMessage} numberOfLines={1}>{d.lastIm}</Text>
                  )}
                </View>
              </TouchableOpacity>
            )
          }

          return null
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.accent },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHeaderText: {
    fontSize: 13, fontWeight: '700', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  sectionCount: {
    backgroundColor: Colors.border, borderRadius: 10,
    minWidth: 20, height: 20, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionCountText: { fontSize: 11, color: Colors.textLight, fontWeight: '700' },
  talkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.white,
    gap: 12,
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  talkName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  selfBadge: {
    backgroundColor: Colors.accent, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  selfBadgeText: { fontSize: 10, color: Colors.white, fontWeight: '700' },
  talkTime: { fontSize: 12, color: Colors.textLight },
  talkFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lastMessageRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lastMessage: { fontSize: 13, color: Colors.textLight, flex: 1 },
  lastMessageUnread: { color: Colors.text, fontWeight: '600' },
  talkCountBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  talkCountText: { fontSize: 10, color: Colors.textLight },
  badge: {
    backgroundColor: Colors.accent, borderRadius: 10,
    minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6, marginLeft: 8,
  },
  badgeText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  separator: { height: 1, backgroundColor: Colors.border, marginLeft: 80 },
})
