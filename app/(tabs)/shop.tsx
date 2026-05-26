import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput, Image, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

const PAGE_SIZE = 20
const SOCIAL_WEIGHT = 10   // フォロー中の人もフォロー → 1人につき10点
const POPULAR_MAX  = 10    // フォロワー数 (上限100人分) → 最大10点
const ACTIVE_BONUS = 3     // 30日以内に配信あり
const OFFICIAL_BONUS = 5   // 公式バッジ

type Creator = {
  id: string
  display_name: string
  bio: string | null
  avatar_url: string | null
  follower_count: number
  is_following: boolean
  is_official: boolean
  score: number
  social_count: number  // 自フォロー中で何人がフォローしているか
  is_active: boolean    // 30日以内に配信あり
}

export default function DiscoverScreen() {
  const [recommended, setRecommended] = useState<Creator[]>([])  // 上位 (ソーシャル近接)
  const [allScored, setAllScored] = useState<Creator[]>([])      // スコア順全件
  const [myId, setMyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMyId(user.id)

    // 1. 自分のフォロー中リスト
    const { data: myFollows } = await supabase
      .from('follows').select('following_id').eq('follower_id', user.id)
    const myFollowingIds = (myFollows ?? []).map((f: any) => f.following_id)
    const myFollowingSet = new Set([user.id, ...myFollowingIds])

    // 2. 候補プロフィール（未フォロー・自分以外、最大300件）
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, bio, avatar_url, is_official')
      .neq('id', user.id)
      .limit(300)
    if (!profiles?.length) { setLoading(false); return }

    const candidateIds = profiles.map((p: any) => p.id).filter(id => !myFollowingSet.has(id))
    if (!candidateIds.length) { setAllScored([]); setRecommended([]); setLoading(false); return }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString()

    // 3. 並列取得: フォロワー数 / ソーシャル近接 / 最近の活動
    const [{ data: allFollows }, { data: socialFollows }, { data: recentBroadcasts }] = await Promise.all([
      // フォロワー数: 候補全員分
      supabase.from('follows').select('following_id').in('following_id', candidateIds),
      // ソーシャル近接: 自分のフォロー中が候補をフォローしているか
      myFollowingIds.length > 0
        ? supabase.from('follows').select('following_id').in('follower_id', myFollowingIds).in('following_id', candidateIds)
        : Promise.resolve({ data: [] }),
      // 30日以内に配信したクリエイター
      supabase.from('broadcasts').select('sender_id').in('sender_id', candidateIds).eq('status', 'published').gte('created_at', thirtyDaysAgo),
    ])

    // カウントマップを構築
    const followerMap: Record<string, number> = {}
    for (const f of (allFollows ?? [])) followerMap[f.following_id] = (followerMap[f.following_id] ?? 0) + 1

    const socialMap: Record<string, number> = {}
    for (const f of (socialFollows ?? [])) socialMap[f.following_id] = (socialMap[f.following_id] ?? 0) + 1

    const activeSet = new Set((recentBroadcasts ?? []).map((b: any) => b.sender_id))

    // スコアリング
    const scored: Creator[] = profiles
      .filter((p: any) => !myFollowingSet.has(p.id))
      .map((p: any) => {
        const fc = followerMap[p.id] ?? 0
        const sc = socialMap[p.id] ?? 0
        const active = activeSet.has(p.id)
        const score =
          sc * SOCIAL_WEIGHT +
          Math.min(fc, 100) / 100 * POPULAR_MAX +
          (active ? ACTIVE_BONUS : 0) +
          (p.is_official ? OFFICIAL_BONUS : 0)
        return {
          ...p,
          follower_count: fc,
          is_following: false,
          score,
          social_count: sc,
          is_active: active,
        }
      })
      .sort((a, b) => b.score - a.score)

    // ソーシャル近接がある上位5件を「あなたへのおすすめ」に
    const topSocial = scored.filter(c => c.social_count > 0).slice(0, 6)
    setRecommended(topSocial)
    setAllScored(scored)
    setPage(1)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const handleFollow = async (creatorId: string, isFollowing: boolean) => {
    if (!myId) return
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', myId).eq('following_id', creatorId)
    } else {
      await supabase.from('follows').insert({ follower_id: myId, following_id: creatorId })
    }
    const update = (c: Creator) => c.id === creatorId
      ? { ...c, is_following: !isFollowing, follower_count: c.follower_count + (isFollowing ? -1 : 1) }
      : c
    setAllScored(prev => prev.map(update))
    setRecommended(prev => prev.map(update))
  }

  // 検索中は全件から絞り込み
  const isSearching = search.length > 0
  const searchResults = isSearching ? allScored.filter(c =>
    c.display_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.bio ?? '').toLowerCase().includes(search.toLowerCase())
  ) : []

  // ページネーション（検索中は無効）
  const pagedList = allScored.slice(0, page * PAGE_SIZE)
  const hasMore = allScored.length > page * PAGE_SIZE

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
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={Colors.textLight} style={styles.searchIcon} />
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
        // 検索結果
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
              {/* あなたへのおすすめ（ソーシャルグラフ近接） */}
              {recommended.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="people-outline" size={15} color={Colors.accent} />
                    <Text style={styles.sectionTitle}>フォロー中の人もフォロー</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
                    {recommended.map(item => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.hCard}
                        onPress={() => router.push(`/creator/${item.id}` as any)}
                        activeOpacity={0.8}
                      >
                        {item.avatar_url
                          ? <Image source={{ uri: item.avatar_url }} style={styles.hAvatar} />
                          : <View style={styles.hAvatarFallback}><Text style={styles.hAvatarText}>{item.display_name[0]}</Text></View>
                        }
                        <Text style={styles.hName} numberOfLines={1}>{item.display_name}</Text>
                        <Text style={styles.hSub}>{item.social_count}人がフォロー中</Text>
                        <TouchableOpacity
                          style={[styles.hFollowBtn, item.is_following && styles.hFollowingBtn]}
                          onPress={() => handleFollow(item.id, item.is_following)}
                        >
                          <Text style={[styles.hFollowText, item.is_following && styles.hFollowingText]}>
                            {item.is_following ? 'フォロー中' : 'フォロー'}
                          </Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* おすすめリスト ヘッダー */}
              <View style={[styles.sectionHeader, { marginTop: recommended.length > 0 ? 4 : 0, marginBottom: 4, paddingHorizontal: 12 }]}>
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
              <Text style={styles.moreBtnText}>さらに表示</Text>
              <Ionicons name="chevron-down" size={14} color={Colors.accent} />
            </TouchableOpacity>
          ) : null}
        />
      )}
    </View>
  )
}

function CreatorRow({ item, onFollow }: { item: Creator; onFollow: (id: string, isFollowing: boolean) => void }) {
  return (
    <TouchableOpacity
      style={styles.creatorCard}
      onPress={() => router.push(`/creator/${item.id}` as any)}
      activeOpacity={0.85}
    >
      {item.avatar_url
        ? <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} />
        : <View style={styles.avatar}><Text style={styles.avatarText}>{item.display_name[0]}</Text></View>
      }
      <View style={styles.creatorInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={styles.creatorName}>{item.display_name}</Text>
          {item.is_official && <Ionicons name="checkmark-circle" size={14} color="#1D9BF0" />}
          {item.social_count > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.social_count}人</Text>
            </View>
          )}
          {item.is_active && !item.social_count && (
            <View style={[styles.badge, { backgroundColor: `${Colors.accent}18` }]}>
              <Text style={[styles.badgeText, { color: Colors.accent }]}>配信中</Text>
            </View>
          )}
        </View>
        {item.bio && <Text style={styles.creatorBio} numberOfLines={1}>{item.bio}</Text>}
        <Text style={styles.followerCount}>{item.follower_count.toLocaleString()} フォロワー</Text>
      </View>
      <TouchableOpacity
        style={[styles.followButton, item.is_following && styles.followingButton]}
        onPress={() => onFollow(item.id, item.is_following)}
      >
        <Text style={[styles.followButtonText, item.is_following && styles.followingText]}>
          {item.is_following ? 'フォロー中' : 'フォロー'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.accent },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: 12, backgroundColor: Colors.white,
    borderRadius: 12, paddingHorizontal: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: Colors.text },
  list: { paddingBottom: 40 },
  empty: { textAlign: 'center', color: Colors.textLight, marginTop: 32 },

  section: { marginBottom: 4 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.text, flex: 1 },
  sectionCount: { fontSize: 11, color: Colors.textLight },

  horizontalList: { paddingHorizontal: 12, gap: 10, paddingBottom: 4 },
  hCard: {
    width: 110, backgroundColor: Colors.white,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    padding: 12, alignItems: 'center', gap: 6,
  },
  hAvatar: { width: 52, height: 52, borderRadius: 26 },
  hAvatarFallback: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center',
  },
  hAvatarText: { fontSize: 22, fontWeight: '700', color: Colors.white },
  hName: { fontSize: 12, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  hSub: { fontSize: 10, color: Colors.textLight, textAlign: 'center' },
  hFollowBtn: {
    backgroundColor: Colors.accent, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 5, width: '100%', alignItems: 'center',
  },
  hFollowingBtn: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.accent },
  hFollowText: { fontSize: 11, fontWeight: '700', color: Colors.white },
  hFollowingText: { color: Colors.accent },

  creatorCard: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: Colors.border,
    marginHorizontal: 12, marginBottom: 8,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: Colors.white },
  avatarImage: { width: 48, height: 48, borderRadius: 24 },
  creatorInfo: { flex: 1 },
  creatorName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  creatorBio: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  followerCount: { fontSize: 11, color: Colors.textLight, marginTop: 3 },
  badge: {
    backgroundColor: `${Colors.button}25`, borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  badgeText: { fontSize: 9, fontWeight: '700', color: Colors.button },
  followButton: {
    backgroundColor: Colors.button, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  followingButton: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.button },
  followButtonText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  followingText: { color: Colors.button },

  moreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 16, marginHorizontal: 12,
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 32,
  },
  moreBtnText: { fontSize: 13, fontWeight: '600', color: Colors.accent },
})
