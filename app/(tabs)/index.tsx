import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Image } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

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

export default function HomeScreen() {
  const [creators, setCreators] = useState<FollowedCreator[]>([])
  const [followers, setFollowers] = useState<FollowerProfile[]>([])
  const [myDisplayName, setMyDisplayName] = useState('')
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [unreadNotifs, setUnreadNotifs] = useState(0)
  const [followingOpen, setFollowingOpen] = useState(true)
  const [followersOpen, setFollowersOpen] = useState(true)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMyUserId(user.id)

    const [{ data: profile }, { data: followersData }, { data: follows }, { count: notifCount }] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', user.id).single(),
      supabase.from('follows').select('follower_id').eq('following_id', user.id),
      supabase.from('follows').select('following_id').eq('follower_id', user.id),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false),
    ])

    setMyDisplayName(profile?.display_name ?? '')
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

    setCreators((followingProfiles.data ?? []) as FollowedCreator[])
    setFollowers((followerProfiles.data ?? []) as FollowerProfile[])
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

  const flatData: HomeRow[] = [
    { type: 'my-posts' },
    { type: 'section', sectionId: 'following', count: creators.length, open: followingOpen },
    ...(followingOpen ? creators.map(c => ({ type: 'following-item' as const, data: c })) : []),
    { type: 'section', sectionId: 'followers', count: followers.length, open: followersOpen },
    ...(followersOpen ? followers.map(f => ({ type: 'follower-item' as const, data: f })) : []),
  ]

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            onPress={() => myUserId && router.push(`/creator/${myUserId}` as any)}
            activeOpacity={0.75}
          >
            <Text style={styles.headerTitle}>{myDisplayName}</Text>
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/notifications' as any)}>
              <Ionicons name="notifications-outline" size={22} color={Colors.accent} />
              {unreadNotifs > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadNotifs > 9 ? '9+' : unreadNotifs}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/(tabs)/shop' as any)}>
              <Ionicons name="search-outline" size={22} color={Colors.accent} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

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
          if (leadingItem.type === 'section' || leadingItem.type === 'my-posts') return null
          return <View style={styles.separator} />
        }}
        renderItem={({ item }) => {
          if (item.type === 'my-posts') {
            return (
              <TouchableOpacity
                style={styles.myPostsCard}
                onPress={() => myUserId && router.push(`/creator/${myUserId}` as any)}
                activeOpacity={0.85}
              >
                <View style={styles.myPostsIcon}>
                  <Ionicons name="grid-outline" size={20} color={Colors.white} />
                </View>
                <View style={styles.myPostsText}>
                  <Text style={styles.myPostsTitle}>あなたの投稿</Text>
                  <Text style={styles.myPostsSub}>配信履歴・返信を確認</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
              </TouchableOpacity>
            )
          }

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
              <View style={styles.creatorRow}>
                <TouchableOpacity
                  style={styles.creatorLeft}
                  onPress={() => router.push(`/creator/${d.id}` as any)}
                  activeOpacity={0.8}
                >
                  <View style={styles.avatar}>
                    {d.avatar_url
                      ? <Image source={{ uri: d.avatar_url }} style={styles.avatarImage} />
                      : <Text style={styles.avatarText}>{d.display_name[0]}</Text>
                    }
                  </View>
                  <View style={styles.creatorInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={styles.creatorName}>{d.display_name}</Text>
                      {d.is_official && <Ionicons name="checkmark-circle" size={14} color="#1D9BF0" />}
                    </View>
                    {d.bio && <Text style={styles.creatorBio} numberOfLines={1}>{d.bio}</Text>}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.talkIconBtn}
                  onPress={() => router.push(`/talk/${d.id}` as any)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chatbubbles-outline" size={22} color={Colors.accent} />
                </TouchableOpacity>
              </View>
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
                <View style={styles.avatar}>
                  {d.avatar_url
                    ? <Image source={{ uri: d.avatar_url }} style={styles.avatarImage} />
                    : <Text style={styles.avatarText}>{d.display_name[0]}</Text>
                  }
                </View>
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
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.accent, letterSpacing: 1 },
  headerActions: { flexDirection: 'row', gap: 4 },
  headerIconBtn: { padding: 6, position: 'relative' },
  notifBadge: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: '#E53E3E', borderRadius: 8,
    minWidth: 16, height: 16, paddingHorizontal: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  notifBadgeText: { color: Colors.white, fontSize: 10, fontWeight: '700' },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  profileName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  list: { paddingBottom: 32 },
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
