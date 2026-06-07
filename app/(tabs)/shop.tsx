import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Image,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

// ── スコアリング係数 ──────────────────────────────────────────
const W_TAG_MATCH  = 40   // タグ一致（1タグにつき）
const W_LIKE_COUNT = 15   // いいね数（上限50でキャップ）
const W_COMMENT    = 10   // コメント数（上限50でキャップ）
// 時間減衰：半減期48時間（2日経つとスコアが半分になる）
const DECAY_HALF_LIFE_H = 48
const DECAY_RATE = Math.LN2 / DECAY_HALF_LIFE_H

// ── 型定義 ──────────────────────────────────────────────────
type FeedItem = {
  id: string
  public_title: string | null
  content: string
  created_at: string
  like_count: number
  comment_count: number
  sender_id: string
  display_name: string
  avatar_url: string | null
  username: string | null
  my_liked: boolean
  score: number
}

// ── 相対時間フォーマット ──────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'たった今'
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}日前`
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// ── モジュールキャッシュ ──────────────────────────────────────
let _cache: FeedItem[] = []
let _loaded = false

export default function DiscoverFeedScreen() {
  const [items, setItems] = useState<FeedItem[]>(_cache)
  const [loading, setLoading] = useState(!_loaded)
  const [refreshing, setRefreshing] = useState(false)
  const [myId, setMyId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMyId(user.id)

    // is_public=true の配信を新着順で取得（自分以外）
    const { data: broadcasts } = await supabase
      .from('broadcasts')
      .select('id, public_title, content, created_at, sender_id')
      .eq('status', 'published')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(200)

    if (!broadcasts?.length) {
      _cache = []
      _loaded = true
      setItems([])
      setLoading(false)
      return
    }

    const bcIds = broadcasts.map((b: any) => b.id)
    const senderIds = [...new Set(broadcasts.map((b: any) => b.sender_id))]

    // クリエイター情報・いいね数・コメント数・自分のいいね・自分のタグを並列取得
    const [
      { data: profiles },
      { data: reactions },
      { data: comments },
      { data: myReactions },
      { data: myProfile },
    ] = await Promise.all([
      supabase.from('profiles').select('id, display_name, avatar_url, username, tags').in('id', senderIds),
      supabase.from('reactions').select('broadcast_id').in('broadcast_id', bcIds),
      supabase.from('messages').select('broadcast_id').in('broadcast_id', bcIds).not('broadcast_id', 'is', null),
      supabase.from('reactions').select('broadcast_id').in('broadcast_id', bcIds).eq('user_id', user.id),
      supabase.from('profiles').select('tags').eq('id', user.id).single(),
    ])

    const myTags: Set<string> = new Set(((myProfile as any)?.tags ?? []).map((t: string) => t.toLowerCase()))

    const profileMap: Record<string, any> = {}
    for (const p of (profiles ?? [])) profileMap[p.id] = p

    const likeMap: Record<string, number> = {}
    for (const r of (reactions ?? [])) likeMap[r.broadcast_id] = (likeMap[r.broadcast_id] ?? 0) + 1

    const commentMap: Record<string, number> = {}
    for (const c of (comments ?? [])) commentMap[c.broadcast_id] = (commentMap[c.broadcast_id] ?? 0) + 1

    const myLikedSet = new Set((myReactions ?? []).map((r: any) => r.broadcast_id))
    const now = Date.now()

    const feed: FeedItem[] = broadcasts.map((b: any) => {
      const p = profileMap[b.sender_id] ?? {}
      const likeCount = likeMap[b.id] ?? 0
      const commentCount = commentMap[b.id] ?? 0

      // タグ一致数（クリエイターのタグと自分のタグ）
      const creatorTags: string[] = (p.tags ?? []).map((t: string) => t.toLowerCase())
      const tagMatch = myTags.size > 0
        ? creatorTags.filter(t => myTags.has(t)).length
        : 0

      // 時間減衰：投稿からの経過時間（時間単位）
      const hoursAgo = (now - new Date(b.created_at).getTime()) / 3600000
      const decay = Math.exp(-DECAY_RATE * hoursAgo)

      // ベーススコア × 時間減衰
      const baseScore =
        tagMatch    * W_TAG_MATCH +
        Math.min(likeCount, 50)    / 50 * W_LIKE_COUNT +
        Math.min(commentCount, 50) / 50 * W_COMMENT
      const score = baseScore * decay

      return {
        id: b.id,
        public_title: b.public_title ?? null,
        content: b.content,
        created_at: b.created_at,
        like_count: likeCount,
        comment_count: commentCount,
        sender_id: b.sender_id,
        display_name: p.display_name ?? '不明',
        avatar_url: p.avatar_url ?? null,
        username: p.username ?? null,
        my_liked: myLikedSet.has(b.id),
        score,
      }
    }).sort((a: any, b: any) => b.score - a.score)

    _cache = feed
    _loaded = true
    setItems(feed)
    setPage(1)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false) }

  // いいねのトグル
  const handleLike = async (item: FeedItem) => {
    if (!myId) return
    if (item.my_liked) {
      await supabase.from('reactions').delete()
        .eq('broadcast_id', item.id).eq('user_id', myId)
    } else {
      await supabase.from('reactions').insert({ broadcast_id: item.id, user_id: myId, type: 'like' })
    }
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, my_liked: !i.my_liked, like_count: i.like_count + (i.my_liked ? -1 : 1) }
      : i
    ))
  }

  const pagedItems = items.slice(0, page * PAGE_SIZE)
  const hasMore = items.length > page * PAGE_SIZE

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>発見</Text>
        <Text style={styles.headerSub}>クリエイターの投稿をチェック</Text>
      </View>

      <FlatList
        data={pagedItems}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        ListEmptyComponent={() => (
          <View style={styles.emptyWrap}>
            <Ionicons name="newspaper-outline" size={52} color={Colors.border} />
            <Text style={styles.emptyTitle}>まだ投稿がありません</Text>
            <Text style={styles.emptyDesc}>クリエイターが「発見に投稿」すると{'\n'}ここに表示されます</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <FeedCard item={item} onLike={handleLike} />
        )}
        ListFooterComponent={() => hasMore ? (
          <TouchableOpacity style={styles.moreBtn} onPress={() => setPage(p => p + 1)}>
            <Text style={styles.moreTxt}>さらに読み込む</Text>
            <Ionicons name="chevron-down" size={14} color={Colors.accent} />
          </TouchableOpacity>
        ) : null}
      />
    </View>
  )
}

// ── フィードカード ────────────────────────────────────────────
function FeedCard({ item, onLike }: { item: FeedItem; onLike: (item: FeedItem) => void }) {
  const hasTitle = item.public_title && item.public_title.trim().length > 0

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/broadcast-thread/${item.id}` as any)}
      activeOpacity={0.88}
    >
      {/* クリエイター情報 */}
      <TouchableOpacity
        style={styles.creatorRow}
        onPress={() => router.push(`/creator/${item.sender_id}` as any)}
        activeOpacity={0.75}
      >
        {item.avatar_url
          ? <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
          : <View style={styles.avatarFb}><Text style={styles.avatarTxt}>{item.display_name[0]}</Text></View>
        }
        <View style={styles.creatorInfo}>
          <Text style={styles.creatorName}>{item.display_name}</Text>
          {item.username && <Text style={styles.creatorAt}>@{item.username}</Text>}
        </View>
        <Text style={styles.timeAgo}>{timeAgo(item.created_at)}</Text>
      </TouchableOpacity>

      {/* タイトル（あれば） */}
      {hasTitle && (
        <Text style={styles.title} numberOfLines={2}>{item.public_title}</Text>
      )}

      {/* 本文 */}
      <Text
        style={[styles.body, hasTitle && styles.bodyWithTitle]}
        numberOfLines={hasTitle ? 3 : 5}
      >
        {item.content}
      </Text>

      {/* フッター：いいね・コメント */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.footerBtn}
          onPress={(e) => { e.stopPropagation?.(); onLike(item) }}
          activeOpacity={0.7}
        >
          <Ionicons
            name={item.my_liked ? 'heart' : 'heart-outline'}
            size={17}
            color={item.my_liked ? '#E53E3E' : Colors.textLight}
          />
          <Text style={[styles.footerCount, item.my_liked && styles.footerCountLiked]}>
            {item.like_count > 0 ? item.like_count.toLocaleString() : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.footerBtn}
          onPress={() => router.push(`/broadcast-thread/${item.id}` as any)}
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubble-outline" size={16} color={Colors.textLight} />
          <Text style={styles.footerCount}>
            {item.comment_count > 0 ? item.comment_count.toLocaleString() : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.header,
    paddingTop: 36, paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.accent },
  headerSub: { fontSize: 12, color: Colors.textLight, marginTop: 2 },

  list: { paddingTop: 8, paddingBottom: 40 },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textLight },
  emptyDesc: { fontSize: 13, color: Colors.border, textAlign: 'center', lineHeight: 20 },

  card: {
    backgroundColor: Colors.white,
    marginHorizontal: 12, marginBottom: 10,
    borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
  },

  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFb: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center',
  },
  avatarTxt: { fontSize: 15, fontWeight: '700', color: Colors.white },
  creatorInfo: { flex: 1 },
  creatorName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  creatorAt: { fontSize: 11, color: Colors.textLight, marginTop: 1 },
  timeAgo: { fontSize: 11, color: Colors.border },

  title: {
    fontSize: 17, fontWeight: '800', color: Colors.text,
    lineHeight: 24, marginBottom: 8,
  },
  body: { fontSize: 14, color: Colors.text, lineHeight: 22 },
  bodyWithTitle: { color: Colors.textLight },

  footer: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerCount: { fontSize: 13, color: Colors.textLight, minWidth: 16 },
  footerCountLiked: { color: '#E53E3E' },

  moreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 16, marginHorizontal: 12, marginBottom: 32,
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  moreTxt: { fontSize: 13, fontWeight: '600', color: Colors.accent },
})
