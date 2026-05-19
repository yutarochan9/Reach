import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

type FollowedCreator = {
  id: string
  display_name: string
  bio: string | null
}

type MyProfile = {
  display_name: string
  follower_count: number
}

export default function HomeScreen() {
  const [creators, setCreators] = useState<FollowedCreator[]>([])
  const [myProfile, setMyProfile] = useState<MyProfile | null>(null)
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [unreadNotifs, setUnreadNotifs] = useState(0)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMyUserId(user.id)

    const [{ data: profile }, { data: followers }, { data: follows }, { count: notifCount }] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', user.id).single(),
      supabase.from('follows').select('follower_id').eq('following_id', user.id),
      supabase.from('follows').select('following_id').eq('follower_id', user.id),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false),
    ])

    setMyProfile({
      display_name: profile?.display_name ?? '',
      follower_count: (followers ?? []).length,
    })
    setUnreadNotifs(notifCount ?? 0)

    const followingIds = (follows ?? []).map((f: any) => f.following_id)
    if (followingIds.length === 0) {
      setCreators([])
      setLoading(false)
      return
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, bio')
      .in('id', followingIds)
      .order('display_name')

    setCreators(profiles ?? [])
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Reach</Text>
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
        {myProfile && (
          <TouchableOpacity
            style={styles.profileRow}
            onPress={() => myUserId && router.push(`/creator/${myUserId}` as any)}
            activeOpacity={0.75}
          >
            <Text style={styles.profileName}>{myProfile.display_name}</Text>
            <View style={styles.followerPill}>
              <Ionicons name="people-outline" size={13} color={Colors.accent} />
              <Text style={styles.followerNum}>{myProfile.follower_count.toLocaleString()}</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={creators}
        keyExtractor={item => item.id}
        contentContainerStyle={creators.length === 0 ? styles.emptyContainer : styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        ListHeaderComponent={() => (
          <View>
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
            {creators.length > 0 && (
              <Text style={styles.sectionLabel}>フォロー中のアカウント</Text>
            )}
          </View>
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyWrap}>
            <Ionicons name="radio-outline" size={48} color={Colors.border} />
            <Text style={styles.emptyTitle}>フォロー中の発信者がいません</Text>
            <Text style={styles.emptyDesc}>発信者をフォローすると{'\n'}ここに表示されます</Text>
            <TouchableOpacity style={styles.discoverButton} onPress={() => router.push('/(tabs)/shop' as any)}>
              <Text style={styles.discoverText}>発信者を探す</Text>
            </TouchableOpacity>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.creatorRow}>
            <TouchableOpacity
              style={styles.creatorLeft}
              onPress={() => router.push(`/creator/${item.id}` as any)}
              activeOpacity={0.8}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.display_name[0]}</Text>
              </View>
              <View style={styles.creatorInfo}>
                <Text style={styles.creatorName}>{item.display_name}</Text>
                {item.bio && <Text style={styles.creatorBio} numberOfLines={1}>{item.bio}</Text>}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.talkIconBtn}
              onPress={() => router.push(`/talk/${item.id}` as any)}
              activeOpacity={0.7}
            >
              <Ionicons name="chatbubbles-outline" size={22} color={Colors.accent} />
            </TouchableOpacity>
          </View>
        )}
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
  followerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.white, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.border,
  },
  followerNum: { fontSize: 13, fontWeight: '700', color: Colors.accent },
  myPostsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  myPostsIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  myPostsText: { flex: 1 },
  myPostsTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  myPostsSub: { fontSize: 12, color: Colors.textLight, marginTop: 1 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.textLight,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  list: { paddingVertical: 8 },
  emptyContainer: { flex: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  emptyDesc: { fontSize: 14, color: Colors.textLight, textAlign: 'center', lineHeight: 22 },
  discoverButton: {
    marginTop: 8, backgroundColor: Colors.button,
    borderRadius: 20, paddingHorizontal: 24, paddingVertical: 10,
  },
  discoverText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
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
  creatorLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  creatorInfo: { flex: 1 },
  creatorName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  creatorBio: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  talkIconBtn: { padding: 8 },
  separator: { height: 1, backgroundColor: Colors.border, marginLeft: 76 },
})
