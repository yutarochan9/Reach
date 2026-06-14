import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput, Image, ScrollView, Platform, useWindowDimensions } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'
import DefaultAvatar from '../components/DefaultAvatar'

const PAGE_SIZE = 20

const W_TAG_MATCH      = 40
const W_REACTION_RATE  = 80
const W_REACTION_COUNT = 10
const W_REPLY_RATE     = 40
const W_REPLY_COUNT    = 8
const W_VIEW_RATE      = 30
const W_FREQ           = 3
const W_SOCIAL         = 4
const W_POPULARITY     = 8

// note風カテゴリーグループ定義
const CATEGORY_GROUPS = [
  {
    label: '日常',
    items: ['ライフスタイル', '料理・グルメ', '住まい', '健康・ウェルネス', '子育て', 'ペット', 'レビュー'],
  },
  {
    label: '気持ち・こころ',
    items: ['恋愛・パートナーシップ', '家族・人間関係', 'メンタルヘルス', '占い・スピリチュアル'],
  },
  {
    label: '推し・エンタメ',
    items: ['音楽', 'アニメ・マンガ', 'ゲーム', '映画・ドラマ', 'Vtuber・配信者', 'スポーツ観戦', 'アイドル'],
  },
  {
    label: '趣味',
    items: ['旅行・お出かけ', 'ファッション・美容', 'アウトドア', '写真', 'DIY・ハンドメイド', '料理レシピ'],
  },
  {
    label: 'つくること',
    items: ['イラスト・デザイン', '音楽制作', '文章・小説', '動画・配信制作', 'ハンドメイド作品'],
  },
  {
    label: 'まなび・しごと',
    items: ['キャリア・転職', '副業・起業', '投資・お金', '資格・スキルアップ', '語学', '教育'],
  },
  {
    label: '社会・ニュース',
    items: ['時事・ニュース', 'テクノロジー・AI', 'ビジネス', '環境・サステナビリティ', '政治・経済', '地域'],
  },
  {
    label: 'SNS・プラットフォーム',
    items: ['YouTube', 'TikTok', 'Instagram', 'X（Twitter）', 'note'],
  },
]

type Creator = {
  id: string
  display_name: string
  bio: string | null
  avatar_url: string | null
  follower_count: number
  is_following: boolean
  score: number
  social_count: number
  broadcast_count: number
  reaction_rate: number
  reply_rate: number
  tags: string[]
  tag_match_count: number
  username: string | null
}

let _cachedScored: Creator[] = []
let _cachedProfiles: Creator[] = []
let _shopLoaded = false

export default function DiscoverScreen() {
  const { width } = useWindowDimensions()
  const isDesktop = Platform.OS === 'web' && width >= 900

  const [allScored, setAllScored] = useState<Creator[]>(_cachedScored)
  const [allProfiles, setAllProfiles] = useState<Creator[]>(_cachedProfiles)
  const [loading, setLoading] = useState(!_shopLoaded)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [myId, setMyId] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  // アコーディオンの開閉状態（グループ名 → open/closed）
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMyId(user.id)

    const { data: myFollows } = await supabase
      .from('follows').select('following_id').eq('follower_id', user.id)
    const myFollowingIds = (myFollows ?? []).map((f: any) => f.following_id)
    const myFollowingSet = new Set([user.id, ...myFollowingIds])

    const [{ data: myProfile }, { data: profiles }] = await Promise.all([
      supabase.from('profiles').select('tags').eq('id', user.id).single(),
      supabase.from('profiles').select('id, display_name, bio, avatar_url, tags, username').neq('id', user.id).neq('is_test', true).limit(300),
    ])
    const myTags: string[] = (myProfile as any)?.tags ?? []
    const myTagSet = new Set(myTags.map((t: string) => t.toLowerCase()))
    if (!profiles?.length) { setLoading(false); return }

    const candidateIds = profiles.map((p: any) => p.id).filter((id: string) => !myFollowingSet.has(id))
    if (!candidateIds.length) { setAllScored([]); setAllProfiles([]); setLoading(false); return }

    const since30 = new Date(Date.now() - 30 * 86400_000).toISOString()

    const [
      { data: allFollows },
      { data: socialFollows },
      { data: recentBroadcasts },
    ] = await Promise.all([
      supabase.from('follows').select('following_id').in('following_id', candidateIds),
      myFollowingIds.length > 0
        ? supabase.from('follows').select('following_id')
            .in('follower_id', myFollowingIds).in('following_id', candidateIds)
        : Promise.resolve({ data: [] }),
      supabase.from('broadcasts')
        .select('id, sender_id')
        .in('sender_id', candidateIds)
        .eq('status', 'published')
        .gte('created_at', since30)
        .limit(2000),
    ])

    const bcList = (recentBroadcasts ?? []) as { id: string; sender_id: string }[]
    const bcIds = bcList.map(b => b.id)

    const [{ data: reactions }, { data: reads }, { data: replies }] =
      bcIds.length > 0
        ? await Promise.all([
            supabase.from('reactions').select('broadcast_id').in('broadcast_id', bcIds),
            supabase.from('broadcast_reads').select('broadcast_id').in('broadcast_id', bcIds),
            supabase.from('messages').select('broadcast_id').in('broadcast_id', bcIds).not('broadcast_id', 'is', null),
          ])
        : [{ data: [] }, { data: [] }, { data: [] }]

    const followerMap: Record<string, number> = {}
    for (const f of (allFollows ?? [])) followerMap[f.following_id] = (followerMap[f.following_id] ?? 0) + 1
    const socialMap: Record<string, number> = {}
    for (const f of (socialFollows ?? [])) socialMap[f.following_id] = (socialMap[f.following_id] ?? 0) + 1

    const reactionByBc: Record<string, number> = {}
    for (const r of (reactions ?? [])) reactionByBc[r.broadcast_id] = (reactionByBc[r.broadcast_id] ?? 0) + 1
    const readByBc: Record<string, number> = {}
    for (const r of (reads ?? [])) readByBc[r.broadcast_id] = (readByBc[r.broadcast_id] ?? 0) + 1
    const replyByBc: Record<string, number> = {}
    for (const r of (replies ?? [])) replyByBc[r.broadcast_id] = (replyByBc[r.broadcast_id] ?? 0) + 1

    const creatorStats: Record<string, { bcCount: number; totalReactions: number; totalReads: number; totalReplies: number }> = {}
    for (const b of bcList) {
      if (!creatorStats[b.sender_id]) creatorStats[b.sender_id] = { bcCount: 0, totalReactions: 0, totalReads: 0, totalReplies: 0 }
      creatorStats[b.sender_id].bcCount++
      creatorStats[b.sender_id].totalReactions += reactionByBc[b.id] ?? 0
      creatorStats[b.sender_id].totalReads     += readByBc[b.id] ?? 0
      creatorStats[b.sender_id].totalReplies   += replyByBc[b.id] ?? 0
    }

    const allScoredFull: Creator[] = profiles
      .map((p: any) => {
        const fc = followerMap[p.id] ?? 0
        const sc = socialMap[p.id] ?? 0
        const st = creatorStats[p.id]
        const bcCount      = st?.bcCount ?? 0
        const totalReads   = st?.totalReads ?? 0
        const reactionRate = totalReads > 0 ? st!.totalReactions / totalReads : 0
        const replyRate    = totalReads > 0 ? st!.totalReplies   / totalReads : 0
        const creatorTags: string[] = (p as any).tags ?? []
        const tagMatchCount = myTagSet.size > 0
          ? creatorTags.filter((t: string) => myTagSet.has(t.toLowerCase())).length
          : 0
        const viewRate = (bcCount > 0 && fc > 0) ? Math.min(totalReads / (bcCount * fc), 1) : 0
        const score =
          tagMatchCount  * W_TAG_MATCH +
          reactionRate   * W_REACTION_RATE +
          Math.min(st?.totalReactions ?? 0, 100) / 100 * W_REACTION_COUNT +
          replyRate      * W_REPLY_RATE +
          Math.min(st?.totalReplies ?? 0, 100) / 100 * W_REPLY_COUNT +
          viewRate       * W_VIEW_RATE +
          Math.min(bcCount, 20) * W_FREQ +
          sc             * W_SOCIAL +
          Math.min(fc, 500) / 500 * W_POPULARITY
        return {
          ...p,
          follower_count: fc,
          is_following: myFollowingSet.has(p.id),
          score,
          social_count: sc,
          broadcast_count: bcCount,
          reaction_rate: reactionRate,
          reply_rate: replyRate,
          tags: creatorTags,
          tag_match_count: tagMatchCount,
          username: (p as any).username ?? null,
        }
      })
      .sort((a: Creator, b: Creator) => b.score - a.score)

    const scored = allScoredFull.filter(c => !c.is_following)
    _cachedScored = scored
    _cachedProfiles = allScoredFull
    _shopLoaded = true
    setAllScored(scored)
    setAllProfiles(allScoredFull)
    setPage(1)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false) }

  const handleFollow = async (creatorId: string, isFollowing: boolean) => {
    if (!myId) return
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', myId).eq('following_id', creatorId)
    } else {
      await supabase.from('follows').insert({ follower_id: myId, following_id: creatorId })
    }
    const upd = (c: Creator) => c.id === creatorId
      ? { ...c, is_following: !isFollowing, follower_count: c.follower_count + (isFollowing ? -1 : 1) }
      : c
    setAllScored(p => p.map(upd))
    setAllProfiles(p => p.map(upd))
  }

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))
  }

  const risingList = [...allScored]
    .sort((a, b) => (b.broadcast_count * (1 + b.reaction_rate)) - (a.broadcast_count * (1 + a.reaction_rate)))

  const filteredList = (() => {
    if (selectedCategory === 'all') return allScored
    if (selectedCategory === 'recommended') return allScored.filter(c => c.tag_match_count > 0)
    if (selectedCategory === 'rising') return risingList
    return allScored.filter(c => c.tags.some(t => t.toLowerCase() === selectedCategory.toLowerCase()))
  })()

  const isSearching = search.length > 0
  const searchResults = isSearching
    ? allProfiles.filter(c => {
        const q = search.toLowerCase().replace(/^#/, '')
        return (
          c.display_name.toLowerCase().includes(q) ||
          (c.username ?? '').toLowerCase().includes(q) ||
          (c.bio ?? '').toLowerCase().includes(q) ||
          c.tags.some(t => t.toLowerCase().includes(q))
        )
      })
    : []

  const displayList = isSearching ? searchResults : filteredList
  const pagedList = displayList.slice(0, page * PAGE_SIZE)
  const hasMore = displayList.length > page * PAGE_SIZE

  if (loading) return (
    <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  )

  const select = (cat: string) => { setSelectedCategory(cat); setPage(1) }

  // ── 左サイドバー ────────────────────────────────────────────────────
  const Sidebar = (
    <ScrollView style={sidebar.wrap} contentContainerStyle={sidebar.content} showsVerticalScrollIndicator={false}>
      {/* 固定メニュー */}
      <SideItem label="すべて"   active={selectedCategory === 'all'}         onPress={() => select('all')} />
      <SideItem label="おすすめ" active={selectedCategory === 'recommended'} onPress={() => select('recommended')} bold />
      <SideItem label="急上昇"   active={selectedCategory === 'rising'}      onPress={() => select('rising')} bold />

      <View style={sidebar.divider} />
      <Text style={sidebar.genreHeader}>ジャンル</Text>

      {/* アコーディオングループ */}
      {CATEGORY_GROUPS.map(group => (
        <View key={group.label}>
          {/* グループヘッダー（タップで開閉） */}
          <TouchableOpacity style={sidebar.groupHeader} onPress={() => toggleGroup(group.label)} activeOpacity={0.7}>
            <Text style={sidebar.groupLabel}>{group.label}</Text>
            <Ionicons
              name={openGroups[group.label] ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={Colors.textLight}
            />
          </TouchableOpacity>
          {/* サブカテゴリー（開いているときのみ） */}
          {openGroups[group.label] && group.items.map(item => (
            <SideItem
              key={item}
              label={item}
              active={selectedCategory === item}
              onPress={() => select(item)}
              indent
            />
          ))}
        </View>
      ))}
    </ScrollView>
  )

  // ── 右コンテンツパネル ───────────────────────────────────────────────
  const ListPanel = (
    <View style={{ flex: 1 }}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={Colors.textLight} style={{ marginRight: 6 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="名前・キーワードで検索"
          placeholderTextColor={Colors.textLight}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={Colors.textLight} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={pagedList}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        ListHeaderComponent={() => !isSearching ? (
          <View style={styles.sectionRow}>
            <Ionicons name="star-outline" size={15} color={Colors.accent} />
            <Text style={styles.sectionTitle}>
              {selectedCategory === 'all' ? 'すべて'
                : selectedCategory === 'recommended' ? 'おすすめ'
                : selectedCategory === 'rising' ? '急上昇'
                : `#${selectedCategory}`}
            </Text>
            <Text style={styles.sectionCount}>{displayList.length}人</Text>
          </View>
        ) : null}
        ListEmptyComponent={() => (
          <Text style={styles.empty}>
            {isSearching ? '見つかりませんでした' : 'クリエイターがまだいません'}
          </Text>
        )}
        renderItem={({ item }) => <CreatorRow item={item} onFollow={handleFollow} />}
        ListFooterComponent={() => hasMore ? (
          <TouchableOpacity style={styles.moreBtn} onPress={() => setPage(p => p + 1)}>
            <Text style={styles.moreTxt}>さらに表示</Text>
            <Ionicons name="chevron-down" size={14} color={Colors.accent} />
          </TouchableOpacity>
        ) : null}
      />
    </View>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>検索</Text>
      </View>

      {isDesktop ? (
        <View style={styles.desktopLayout}>
          {/* 左サイドバー：幅固定でflexが広がらないようにView で囲む */}
          <View style={styles.desktopLeft}>
            {Sidebar}
          </View>
          <View style={styles.desktopRight}>{ListPanel}</View>
        </View>
      ) : (
        ListPanel
      )}
    </View>
  )
}

// ── サイドバーアイテム ─────────────────────────────────────────────────
function SideItem({ label, active, onPress, indent, bold }: {
  label: string; active: boolean; onPress: () => void; indent?: boolean; bold?: boolean
}) {
  return (
    <TouchableOpacity
      style={[sidebar.item, active && sidebar.itemActive, indent && sidebar.itemIndent]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[
        sidebar.itemText,
        indent && sidebar.itemTextIndent,
        bold && sidebar.itemBold,
        active && sidebar.itemTextActive,
      ]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  )
}

function CreatorRow({ item, onFollow }: { item: Creator; onFollow: (id: string, f: boolean) => void }) {
  return (
    <TouchableOpacity style={styles.card}
      onPress={() => router.push(`/creator/${item.id}` as any)} activeOpacity={0.85}>
      {item.avatar_url
        ? <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        : <DefaultAvatar size={48} />
      }
      <View style={styles.info}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={styles.name}>{item.display_name}</Text>
          {(item as any).is_official && (
            <Ionicons name="checkmark-circle" size={14} color={Colors.accent} />
          )}
        </View>
        {item.bio && <Text style={styles.bio} numberOfLines={1}>{item.bio}</Text>}
        <View style={styles.statsRow}>
          <Ionicons name="people-outline" size={12} color={Colors.textLight} />
          <Text style={styles.sub}>{item.follower_count.toLocaleString()}</Text>
          {item.broadcast_count > 0 && (
            <>
              <Ionicons name="radio-outline" size={12} color={Colors.textLight} style={{ marginLeft: 8 }} />
              <Text style={styles.sub}>{item.broadcast_count}</Text>
            </>
          )}
          {item.tags.length > 0 && (
            <Text style={styles.tagChip} numberOfLines={1}>#{item.tags[0]}</Text>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={[styles.followBtn, item.is_following && styles.followingBtn]}
        onPress={() => onFollow(item.id, item.is_following)}
      >
        <Text style={[styles.followTxt, item.is_following && styles.followingTxt]}>
          {item.is_following ? 'フォロー中' : 'フォロー'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  )
}

// ── サイドバースタイル ─────────────────────────────────────────────────
const sidebar = StyleSheet.create({
  wrap: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    backgroundColor: Colors.header,
  },
  content: { paddingVertical: 10, paddingHorizontal: 6 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 8, marginHorizontal: 4 },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 8,
  },
  groupLabel: { fontSize: 14, fontWeight: '700', color: Colors.accent },
  genreHeader: {
    fontSize: 14, fontWeight: '700', color: Colors.accent,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  item: {
    paddingVertical: 7, paddingHorizontal: 10,
    borderRadius: 7, marginBottom: 1,
  },
  itemIndent: { paddingLeft: 16 },
  itemActive: { backgroundColor: Colors.background },
  itemText: { fontSize: 13, color: Colors.text },
  itemBold: { fontWeight: '700', color: Colors.accent },
  itemTextActive: { fontWeight: '700', color: Colors.accent },
  itemTextIndent: { color: Colors.textLight },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header, paddingTop: 36,
    paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.accent },

  desktopLayout: { flex: 1, flexDirection: 'row' },
  // 左サイドバー：幅固定・縮まない
  desktopLeft: { width: 180, flexShrink: 0 },
  // 右コンテンツ：残り全部
  desktopRight: { flex: 1, overflow: 'hidden' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', margin: 12,
    backgroundColor: Colors.white, borderRadius: 12,
    paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: Colors.text },
  list: { paddingBottom: 40, paddingHorizontal: 8 },
  columnWrapper: { gap: 0 },
  // デスクトップ2カラム：各カードを flex:1 で均等幅に
  cardWrapper: { flex: 1 },
  empty: { textAlign: 'center', color: Colors.textLight, marginTop: 32 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingVertical: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.text, flex: 1 },
  sectionCount: { fontSize: 11, color: Colors.textLight },

  card: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: Colors.border, margin: 4,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text },
  bio: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  sub: { fontSize: 11, color: Colors.textLight },
  tagChip: { fontSize: 11, color: Colors.accent, marginLeft: 8, fontWeight: '600' },

  followBtn: { backgroundColor: Colors.button, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  followingBtn: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.button },
  followTxt: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  followingTxt: { color: Colors.button },

  moreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 16, marginHorizontal: 4, marginBottom: 32,
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  moreTxt: { fontSize: 13, fontWeight: '600', color: Colors.accent },
})
