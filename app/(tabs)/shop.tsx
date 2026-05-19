import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput, Image } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

type Creator = {
  id: string
  display_name: string
  bio: string | null
  avatar_url: string | null
  follower_count: number
  is_following: boolean
  is_official: boolean
}

export default function DiscoverScreen() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [myId, setMyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMyId(user.id)

    const { data: profiles } = await supabase
      .from('profiles').select('id, display_name, bio, avatar_url, is_official').neq('id', user.id)

    if (!profiles) return

    const { data: follows } = await supabase
      .from('follows').select('following_id').eq('follower_id', user.id)
    const followingIds = new Set((follows ?? []).map((f: any) => f.following_id))

    const { data: counts } = await supabase.from('follows').select('following_id')
    const followerMap: Record<string, number> = {}
    ;(counts ?? []).forEach((f: any) => {
      followerMap[f.following_id] = (followerMap[f.following_id] ?? 0) + 1
    })

    const list = profiles.map((p: any) => ({
      ...p,
      follower_count: followerMap[p.id] ?? 0,
      is_following: followingIds.has(p.id),
    })).sort((a: Creator, b: Creator) => b.follower_count - a.follower_count)

    setCreators(list)
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
    setCreators(prev => prev.map(c =>
      c.id === creatorId
        ? { ...c, is_following: !isFollowing, follower_count: c.follower_count + (isFollowing ? -1 : 1) }
        : c
    ))
  }

  const filtered = creators.filter(c =>
    c.display_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.bio ?? '').toLowerCase().includes(search.toLowerCase())
  )

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
        <Text style={styles.headerTitle}>おすすめ発信者</Text>
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

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        ListEmptyComponent={() => (
          <Text style={styles.empty}>見つかりませんでした</Text>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.creatorCard}
            onPress={() => router.push(`/creator/${item.id}` as any)}
            activeOpacity={0.85}
          >
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.display_name[0]}</Text>
              </View>
            )}
            <View style={styles.creatorInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.creatorName}>{item.display_name}</Text>
                {item.is_official && <Ionicons name="checkmark-circle" size={14} color="#1D9BF0" />}
              </View>
              {item.bio && <Text style={styles.creatorBio} numberOfLines={1}>{item.bio}</Text>}
              <Text style={styles.followerCount}>{item.follower_count.toLocaleString()} フォロワー</Text>
            </View>
            <TouchableOpacity
              style={[styles.followButton, item.is_following && styles.followingButton]}
              onPress={() => handleFollow(item.id, item.is_following)}
            >
              <Text style={[styles.followButtonText, item.is_following && styles.followingText]}>
                {item.is_following ? 'フォロー中' : 'フォロー'}
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: Colors.text },
  list: { paddingHorizontal: 12, paddingBottom: 32, gap: 10 },
  empty: { textAlign: 'center', color: Colors.textLight, marginTop: 32 },
  creatorCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.button,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: Colors.white },
  avatarImage: { width: 48, height: 48, borderRadius: 24 },
  creatorInfo: { flex: 1 },
  creatorName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  creatorBio: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  followerCount: { fontSize: 11, color: Colors.textLight, marginTop: 3 },
  followButton: {
    backgroundColor: Colors.button,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  followingButton: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.button },
  followButtonText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  followingText: { color: Colors.button },
})
