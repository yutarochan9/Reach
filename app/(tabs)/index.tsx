import { useState, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Image, TextInput } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'
import DefaultAvatar from '../components/DefaultAvatar'


type FollowedCreator = {
  id: string
  display_name: string
  bio: string | null
  is_official: boolean
  avatar_url: string | null
}

type FollowerProfile = {
  id: string
  display_name: string
  avatar_url: string | null
  is_official: boolean
}

type HomeRow =
  | { type: 'my-posts' }
  | { type: 'section'; sectionId: 'following' | 'followers'; count: number; open: boolean }
  | { type: 'following-item'; data: FollowedCreator }
  | { type: 'follower-item'; data: FollowerProfile }

// ── モジュールレベルキャッシュ（再マウント時のフラッシュ防止）──────────
let _cachedCreators: FollowedCreator[] = []
let _cachedFollowers: FollowerProfile[] = []
let _cachedMyDisplayName = ''
let _cachedMyAvatar: string | null = null
let _cachedMyUserId: string | null = null
let _homeLoaded = false

// ── ホーム画面 ────────────────────────────────────────────
export default function HomeScreen() {
  const [creators, setCreators] = useState<FollowedCreator[]>(_cachedCreators)
  const [followers, setFollowers] = useState<FollowerProfile[]>(_cachedFollowers)
  const [myDisplayName, setMyDisplayName] = useState(_cachedMyDisplayName)
  const [myAvatar, setMyAvatar] = useState<string | null>(_cachedMyAvatar)
  const [myUserId, setMyUserId] = useState<string | null>(_cachedMyUserId)
  const [loading, setLoading] = useState(!_homeLoaded)
  const [refreshing, setRefreshing] = useState(false)
  const [unreadNotifs, setUnreadNotifs] = useState(0)
  const [followingOpen, setFollowingOpen] = useState(true)
  const [followersOpen, setFollowersOpen] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<TextInput>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMyUserId(user.id)

    const [{ data: profile }, { data: followersData }, { data: follows }, { count: notifCount }] = await Promise.all([
      supabase.from('profiles').select('display_name, avatar_url').eq('id', user.id).single(),
      supabase.from('follows').select('follower_id').eq('following_id', user.id),
      supabase.from('follows').select('following_id').eq('follower_id', user.id),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false),
    ])

    _cachedMyDisplayName = profile?.display_name ?? ''
    _cachedMyAvatar = profile?.avatar_url ?? null
    _cachedMyUserId = user.id
    setMyDisplayName(_cachedMyDisplayName)
    setMyAvatar(_cachedMyAvatar)
    setUnreadNotifs(notifCount ?? 0)

    const followingIds = (follows ?? []).map((f: any) => f.following_id)
    const followerIds = (followersData ?? []).map((f: any) => f.follower_id)

    const [followingProfiles, followerProfiles] = await Promise.all([
      followingIds.length > 0
        ? supabase.from('profiles').select('id, display_name, bio, is_official, avatar_url').in('id', followingIds).order('display_name')
        : Promise.resolve({ data: [] }),
      followerIds.length > 0
        ? supabase.from('profiles').select('id, display_name, avatar_url, is_official').in('id', followerIds)
        : Promise.resolve({ data: [] }),
    ])

    _cachedCreators = (followingProfiles.data ?? []) as FollowedCreator[]
    _cachedFollowers = (followerProfiles.data ?? []) as FollowerProfile[]
    _homeLoaded = true
    setCreators(_cachedCreators)
    setFollowers(_cachedFollowers)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  const q = searchQuery.toLowerCase()
  const filteredCreators = q ? creators.filter(c => c.display_name.toLowerCase().includes(q)) : creators
  const filteredFollowers = q ? followers.filter(f => f.display_name.toLowerCase().includes(q)) : followers

  const flatData: HomeRow[] = [
    { type: 'section', sectionId: 'following', count: filteredCreators.length, open: followingOpen },
    ...(followingOpen ? filteredCreators.map(c => ({ type: 'following-item' as const, data: c })) : []),
    { type: 'section', sectionId: 'followers', count: filteredFollowers.length, open: followersOpen },
    ...(followersOpen ? filteredFollowers.map(f => ({ type: 'follower-item' as const, data: f })) : []),
  ]

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.headerProfile}
            onPress={() => router.push('/(tabs)/mypage' as any)}
            activeOpacity={0.75}
          >
            <View style={styles.headerAvatar}>
              {myAvatar
                ? <Image source={{ uri: myAvatar }} style={styles.headerAvatarImg} />
                : <Text style={styles.headerAvatarText}>{myDisplayName[0]}</Text>
              }
            </View>
            <Text style={styles.headerTitle}>{myDisplayName}</Text>
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/notifications' as any)}>
              <Ionicons name="notifications-outline" size={20} color={Colors.accent} />
              {unreadNotifs > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadNotifs > 9 ? '9+' : unreadNotifs}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => {
              const next = !showSearch
              setShowSearch(next)
              if (!next) setSearchQuery('')
              else setTimeout(() => searchInputRef.current?.focus(), 50)
            }}>
              <Ionicons name={showSearch ? 'close' : 'search-outline'} size={20} color={Colors.accent} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {showSearch && (
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={Colors.textLight} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="名前で検索..."
            placeholderTextColor={Colors.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      )}


      <FlatList
        data={flatData}
        keyExtractor={(item, index) => {
          if (item.type === 'my-posts') return 'my-posts'
          if (item.type === 'section') return `section-${item.sectionId}`
          if (item.type === 'following-item') return `following-${item.data.id}`
          if (item.type === 'follower-item') return `follower-${item.data.id}`
          return `row-${index}`
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={({ leadingItem }) => {
          if (!leadingItem) return null
          if (leadingItem.type === 'section') return null
          return <View style={styles.separator} />
        }}
        renderItem={({ item }) => {

          if (item.type === 'section') {
            const toggle = item.sectionId === 'following'
              ? () => setFollowingOpen(v => !v)
              : () => setFollowersOpen(v => !v)
            const label = item.sectionId === 'following' ? 'フォロー中' : 'フォロワー'
            return (
              <TouchableOpacity style={styles.sectionHeader} onPress={toggle} activeOpacity={0.7}>
                <View style={styles.sectionHeaderLeft}>
                  <Text style={styles.sectionHeaderText}>{label}</Text>
                  <View style={styles.sectionCount}>
                    <Text style={styles.sectionCountText}>{item.count}</Text>
                  </View>
                </View>
                <Ionicons name={item.open ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
              </TouchableOpacity>
            )
          }

          if (item.type === 'following-item') {
            const d = item.data
            return (
              <TouchableOpacity
                style={styles.creatorRow}
                onPress={() => router.push(`/creator/${d.id}` as any)}
                activeOpacity={0.8}
              >
                {d.avatar_url
                  ? <Image source={{ uri: d.avatar_url }} style={styles.avatarImage} />
                  : <DefaultAvatar size={48} />
                }
                <View style={styles.creatorInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.creatorName}>{d.display_name}</Text>
                    {d.is_official && <Ionicons name="checkmark-circle" size={14} color="#1D9BF0" />}
                  </View>
                  {d.bio && <Text style={styles.creatorBio} numberOfLines={1}>{d.bio}</Text>}
                </View>
              </TouchableOpacity>
            )
          }

          if (item.type === 'follower-item') {
            const d = item.data
            return (
              <TouchableOpacity
                style={styles.creatorRow}
                onPress={() => router.push(`/creator/${d.id}` as any)}
                activeOpacity={0.8}
              >
                {d.avatar_url
                  ? <Image source={{ uri: d.avatar_url }} style={styles.avatarImage} />
                  : <DefaultAvatar size={48} />
                }
                <View style={styles.creatorInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.creatorName}>{d.display_name}</Text>
                    {d.is_official && <Ionicons name="checkmark-circle" size={14} color="#1D9BF0" />}
                  </View>
                </View>
              </TouchableOpacity>
            )
          }

          return null
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.accent, letterSpacing: 1 },
  headerActions: { flexDirection: 'row', gap: 4, marginRight: 14 },
  headerIconBtn: { padding: 6, position: 'relative' },
  notifBadge: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: '#E53E3E', borderRadius: 8,
    minWidth: 16, height: 16, paddingHorizontal: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  notifBadgeText: { color: Colors.white, fontSize: 10, fontWeight: '700' },
  annBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#FEF3C7', borderBottomWidth: 1, borderBottomColor: '#FDE68A',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  annBannerTitle: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  annBannerBody: { fontSize: 12, color: '#92400E', lineHeight: 17, marginTop: 2 },
  headerProfile: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  headerAvatarImg: { width: 48, height: 48, borderRadius: 24 },
  headerAvatarText: { fontSize: 20, fontWeight: '700', color: Colors.white },
  list: { paddingBottom: 32 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.header,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  searchInput: {
    flex: 1, fontSize: 15, color: Colors.text,
    paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: Colors.background, borderRadius: 10,
  },

  myPostsCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: 16, marginTop: 14, marginBottom: 4,
    borderRadius: 14, padding: 14, gap: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  myPostsIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  myPostsText: { flex: 1 },
  myPostsTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  myPostsSub: { fontSize: 12, color: Colors.textLight, marginTop: 1 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: Colors.background,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
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
  creatorRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.white, gap: 12,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.button,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: Colors.white },
  avatarImage: { width: 48, height: 48, borderRadius: 24 },
  creatorLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  creatorInfo: { flex: 1 },
  creatorName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  creatorBio: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  talkIconBtn: { padding: 8 },
  separator: { height: 1, backgroundColor: Colors.border, marginLeft: 76 },
})
