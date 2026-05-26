import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput, Image, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

const PAGE_SIZE = 20

// ── スコアリング係数 ──────────────────────────────────
// 返信率を最重視（YouTube/Xで「コメント率」が最強エンゲージメント指標とされる）
// いいね率は次点（Instagramリールのエンゲージメント計算式参考）
// 配信頻度：継続して届けているクリエイターをブースト（TikTok「コンスタンシー」参考）
// ソーシャル近接：フォロー中の人もフォローしているかは補足信号のみ
const W_REPLY_RATE    = 200  // 返信率（返信数 / 閲覧数）
const W_REACTION_RATE = 100  // いいね率（いいね数 / 閲覧数）
const W_FREQ          = 3    // 配信本数（30日以内、上限20本）
const W_SOCIAL        = 4    // ソーシャル近接（1人につき）
const W_POPULARITY    = 8    // フォロワー数（上限500でキャップ）
const W_TAG_MATCH     = 15   // 自分のタグと一致（1タグにつき）

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
  tag_match_count: number   // 自分のタグとの一致数
}

export default function DiscoverScreen() {
  const [recommended, setRecommended] = useState<Creator[]>([])
  const [allScored, setAllScored] = useState<Creator[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [myId, setMyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMyId(user.id)

    // 1. 自分のフォロー中リスト
    const { data: myFollows } = await supabase
      .from('follows').select('following_id').eq('follower_id', user.id)
    const myFollowingIds = (myFollows ?? []).map((f: any) => f.following_id)
    const myFollowingSet = new Set([user.id, ...myFollowingIds])

    // 2. 自分のプロフィール（タグ取得）と候補プロフィール（未フォロー・自分以外、最大300件）
    const [{ data: myProfile }, { data: profiles }] = await Promise.all([
      supabase.from('profiles').select('tags').eq('id', user.id).single(),
      supabase.from('profiles').select('id, display_name, bio, avatar_url, tags').neq('id', user.id).limit(300),
    ])
    const myTags: string[] = (myProfile as any)?.tags ?? []
    const myTagSet = new Set(myTags.map((t: string) => t.toLowerCase()))
    if (!profiles?.length) { setLoading(false); return }

    const candidateIds = profiles.map((p: any) => p.id).filter((id: string) => !myFollowingSet.has(id))
    if (!candidateIds.length) { setAllScored([]); setRecommended([]); setLoading(false); return }

    const since30 = new Date(Date.now() - 30 * 86400_000).toISOString()

    // 3. 並列取得
    const [
      { data: allFollows },
      { data: socialFollows },
      { data: recentBroadcasts },
    ] = await Promise.all([
      // フォロワー数
      supabase.from('follows').select('following_id').in('following_id', candidateIds),
      // ソーシャル近接
      myFollowingIds.length > 0
        ? supabase.from('follows').select('following_id')
            .in('follower_id', myFollowingIds).in('following_id', candidateIds)
        : Promise.resolve({ data: [] }),
      // 30日以内の配信（id + sender_id のみ）
      supabase.from('broadcasts')
        .select('id, sender_id')
        .in('sender_id', candidateIds)
        .eq('status', 'published')
        .gte('created_at', since30)
        .limit(2000),
    ])

    // 配信IDリストを構築
    const bcList = (recentBroadcasts ?? []) as { id: string; sender_id: string }[]
    const bcIds = bcList.map(b => b.id)

    // 4. 配信があれば reactions / reads / replies を取得
    const [{ data: reactions }, { data: reads }, { data: replies }] =
      bcIds.length > 0
        ? await Promise.all([
            supabase.from('reactions').select('broadcast_id').in('broadcast_id', bcIds),
            supabase.from('broadcast_reads').select('broadcast_id').in('broadcast_id', bcIds),
            supabase.from('messages').select('broadcast_id').in('broadcast_id', bcIds).not('broadcast_id', 'is', null),
          ])
        : [{ data: [] }, { data: [] }, { data: [] }]

    // 5. per-creator 集計
    const followerMap: Record<string, number> = {}
    for (const f of (allFollows ?? [])) followerMap[f.following_id] = (followerMap[f.following_id] ?? 0) + 1

    const socialMap: Record<string, number> = {}
    for (const f of (socialFollows ?? [])) socialMap[f.following_id] = (socialMap[f.following_id] ?? 0) + 1

    // 配信ごとのリアクション・閲覧・返信数
    const reactionByBc: Record<string, number> = {}
    for (const r of (reactions ?? [])) reactionByBc[r.broadcast_id] = (reactionByBc[r.broadcast_id] ?? 0) + 1
    const readByBc: Record<string, number> = {}
    for (const r of (reads ?? [])) readByBc[r.broadcast_id] = (readByBc[r.broadcast_id] ?? 0) + 1
    const replyByBc: Record<string, number> = {}
    for (const r of (replies ?? [])) replyByBc[r.broadcast_id] = (replyByBc[r.broadcast_id] ?? 0) + 1

    // クリエイターごとに集約
    const creatorStats: Record<string, { bcCount: number; totalReactions: number; totalReads: number; totalReplies: number }> = {}
    for (const b of bcList) {
      if (!creatorStats[b.sender_id]) creatorStats[b.sender_id] = { bcCount: 0, totalReactions: 0, totalReads: 0, totalReplies: 0 }
      creatorStats[b.sender_id].bcCount++
      creatorStats[b.sender_id].totalReactions += reactionByBc[b.id] ?? 0
      creatorStats[b.sender_id].totalReads     += readByBc[b.id] ?? 0
      creatorStats[b.sender_id].totalReplies   += replyByBc[b.id] ?? 0
    }

    // 6. スコアリング
    const scored: Creator[] = profiles
      .filter((p: any) => !myFollowingSet.has(p.id))
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

        const score =
          replyRate      * W_REPLY_RATE +
          reactionRate   * W_REACTION_RATE +
          Math.min(bcCount, 20) * W_FREQ +
          sc             * W_SOCIAL +
          Math.min(fc, 500) / 500 * W_POPULARITY +
          tagMatchCount  * W_TAG_MATCH

        return {
          ...p,
          follower_count: fc,
          is_following: false,
          score,
          social_count: sc,
          broadcast_count: bcCount,
          reaction_rate: reactionRate,
          reply_rate: replyRate,
          tags: creatorTags,
          tag_match_count: tagMatchCount,
        }
      })
      .sort((a: Creator, b: Creator) => b.score - a.score)

    // 返信率 or いいね率が高い上位をおすすめカードに
    const topRec = scored
      .filter(c => c.reply_rate > 0 || c.reaction_rate > 0 || c.social_count > 0)
      .slice(0, 6)
    setRecommended(topRec)
    setAllScored(scored)
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
    setRecommended(p => p.map(upd))
  }

  const isSearching = search.length > 0
  const searchResults = isSearching
    ? allScored.filter(c => {
        const q = search.toLowerCase().replace(/^#/, '')
        return (
          c.display_name.toLowerCase().includes(q) ||
          (c.bio ?? '').toLowerCase().includes(q) ||
          c.tags.some(t => t.toLowerCase().includes(q))
        )
      })
    : []

  const pagedList = allScored.slice(0, page * PAGE_SIZE)
  const hasMore = allScored.length > page * PAGE_SIZE

  if (loading) return (
    <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>発見</Text>
      </View>

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

      {isSearching ? (
        <FlatList
          data={searchResults}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={() => <Text style={styles.empty}>見つかりませんでした</Text>}
          renderItem={({ item }) => <CreatorRow item={item} onFollow={handleFollow} />}
        />
      ) : (
        <FlatList
          data={pagedList}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
          ListHeaderComponent={() => (
            <>
              {recommended.length > 0 && (
                <View style={{ marginBottom: 4 }}>
                  <View style={styles.sectionRow}>
                    <Ionicons name="flame-outline" size={15} color={Colors.accent} />
                    <Text style={styles.sectionTitle}>エンゲージメント高め</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
                    {recommended.map(item => (
                      <TouchableOpacity key={item.id} style={styles.hCard}
                        onPress={() => router.push(`/creator/${item.id}` as any)} activeOpacity={0.8}>
                        {item.avatar_url
                          ? <Image source={{ uri: item.avatar_url }} style={styles.hAvatar} />
                          : <View style={styles.hAvatarFb}><Text style={styles.hAvatarTxt}>{item.display_name[0]}</Text></View>
                        }
                        <Text style={styles.hName} numberOfLines={1}>{item.display_name}</Text>
                        <EngagementLabel item={item} />
                        <TouchableOpacity
                          style={[styles.hFollowBtn, item.is_following && styles.hFollowingBtn]}
                          onPress={() => handleFollow(item.id, item.is_following)}
                        >
                          <Text style={[styles.hFollowTxt, item.is_following && styles.hFollowingTxt]}>
                            {item.is_following ? 'フォロー中' : 'フォロー'}
                          </Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
              <View style={[styles.sectionRow, { paddingHorizontal: 12 }]}>
                <Ionicons name="star-outline" size={15} color={Colors.accent} />
                <Text style={styles.sectionTitle}>おすすめ</Text>
                <Text style={styles.sectionCount}>{allScored.length}人</Text>
              </View>
            </>
          )}
          ListEmptyComponent={() => <Text style={styles.empty}>クリエイターがまだいません</Text>}
          renderItem={({ item }) => <CreatorRow item={item} onFollow={handleFollow} />}
          ListFooterComponent={() => hasMore ? (
            <TouchableOpacity style={styles.moreBtn} onPress={() => setPage(p => p + 1)}>
              <Text style={styles.moreTxt}>さらに表示</Text>
              <Ionicons name="chevron-down" size={14} color={Colors.accent} />
            </TouchableOpacity>
          ) : null}
        />
      )}
    </View>
  )
}

// エンゲージメントの一番強いシグナルを1行で表示
function EngagementLabel({ item }: { item: Creator }) {
  if (item.tag_match_count > 0) return <Text style={styles.hSub}>タグ {item.tag_match_count}個一致</Text>
  if (item.reply_rate > 0.02) return <Text style={styles.hSub}>返信率 {(item.reply_rate * 100).toFixed(1)}%</Text>
  if (item.reaction_rate > 0.05) return <Text style={styles.hSub}>いいね率 {(item.reaction_rate * 100).toFixed(1)}%</Text>
  if (item.social_count > 0) return <Text style={styles.hSub}>{item.social_count}人がフォロー中</Text>
  if (item.broadcast_count > 0) return <Text style={styles.hSub}>月{item.broadcast_count}本配信</Text>
  return <Text style={styles.hSub}>{item.follower_count.toLocaleString()} フォロワー</Text>
}

function CreatorRow({ item, onFollow }: { item: Creator; onFollow: (id: string, f: boolean) => void }) {
  // カードのサブバッジ：最も強いシグナルを1つ
  const badge = item.tag_match_count > 0
    ? { label: `タグ一致 ${item.tag_match_count}個`, color: '#8B5E3C' }
    : item.reply_rate > 0.02
    ? { label: `返信率 ${(item.reply_rate * 100).toFixed(1)}%`, color: '#7A9E7E' }
    : item.reaction_rate > 0.05
    ? { label: `いいね率 ${(item.reaction_rate * 100).toFixed(1)}%`, color: Colors.button }
    : item.social_count > 0
    ? { label: `${item.social_count}人がフォロー`, color: Colors.accent }
    : item.broadcast_count >= 4
    ? { label: `月${item.broadcast_count}本配信`, color: Colors.textLight }
    : null

  return (
    <TouchableOpacity style={styles.card}
      onPress={() => router.push(`/creator/${item.id}` as any)} activeOpacity={0.85}>
      {item.avatar_url
        ? <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        : <View style={styles.avatarFb}><Text style={styles.avatarTxt}>{item.display_name[0]}</Text></View>
      }
      <View style={styles.info}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.name}>{item.display_name}</Text>
          {badge && (
            <View style={[styles.badge, { backgroundColor: `${badge.color}20` }]}>
              <Text style={[styles.badgeTxt, { color: badge.color }]}>{badge.label}</Text>
            </View>
          )}
        </View>
        {item.bio && <Text style={styles.bio} numberOfLines={1}>{item.bio}</Text>}
        <Text style={styles.sub}>{item.follower_count.toLocaleString()} フォロワー</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header, paddingTop: 56,
    paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.accent },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', margin: 12,
    backgroundColor: Colors.white, borderRadius: 12,
    paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: Colors.text },
  list: { paddingBottom: 40 },
  empty: { textAlign: 'center', color: Colors.textLight, marginTop: 32 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.text, flex: 1 },
  sectionCount: { fontSize: 11, color: Colors.textLight },

  hList: { paddingHorizontal: 12, gap: 10, paddingBottom: 4 },
  hCard: {
    width: 112, backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 12, alignItems: 'center', gap: 5,
  },
  hAvatar: { width: 52, height: 52, borderRadius: 26 },
  hAvatarFb: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center' },
  hAvatarTxt: { fontSize: 22, fontWeight: '700', color: Colors.white },
  hName: { fontSize: 12, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  hSub: { fontSize: 10, color: Colors.textLight, textAlign: 'center' },
  hFollowBtn: { backgroundColor: Colors.accent, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, width: '100%', alignItems: 'center' },
  hFollowingBtn: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.accent },
  hFollowTxt: { fontSize: 11, fontWeight: '700', color: Colors.white },
  hFollowingTxt: { color: Colors.accent },

  card: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: Colors.border, marginHorizontal: 12, marginBottom: 8,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFb: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 20, fontWeight: '700', color: Colors.white },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text },
  bio: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  sub: { fontSize: 11, color: Colors.textLight, marginTop: 3 },
  badge: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  badgeTxt: { fontSize: 9, fontWeight: '700' },
  followBtn: { backgroundColor: Colors.button, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  followingBtn: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.button },
  followTxt: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  followingTxt: { color: Colors.button },

  moreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 16, marginHorizontal: 12, marginBottom: 32,
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  moreTxt: { fontSize: 13, fontWeight: '600', color: Colors.accent },
})
