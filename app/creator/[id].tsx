import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image, Alert, Linking } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'
import { BETA_MODE } from '../../constants/config'

const FREE_FOLLOWER_LIMIT = 500

type Profile = {
  id: string
  display_name: string
  bio: string | null
  avatar_url: string | null
  is_official: boolean
}

type Broadcast = {
  id: string
  content: string
  created_at: string
  like_count: number
  read_count: number
  reply_count: number
}

export default function CreatorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [myId, setMyId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [followerCount, setFollowerCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [creatorPlan, setCreatorPlan] = useState<string>('free')
  const [richMenu, setRichMenu] = useState<{ buttons: any[]; is_active: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMyId(user.id)

    const [{ data: prof }, { data: bcs }, { data: follows }, { data: myFollow }, { data: menu }] = await Promise.all([
      supabase.from('profiles').select('*, plan').eq('id', id).single(),
      supabase.from('broadcasts').select('id, content, created_at').eq('sender_id', id).eq('status', 'published').order('created_at', { ascending: false }),
      supabase.from('follows').select('follower_id').eq('following_id', id),
      supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', id).maybeSingle(),
      supabase.from('rich_menus').select('buttons, is_active').eq('creator_id', id).maybeSingle(),
    ])

    setProfile(prof)
    setCreatorPlan((prof as any)?.plan ?? 'free')
    setFollowerCount((follows ?? []).length)
    setIsFollowing(!!myFollow)
    setRichMenu(menu && menu.is_active ? menu : null)

    const bcIds = (bcs ?? []).map((b: any) => b.id)
    const [{ data: reactions }, { data: reads }, { data: replies }] = await Promise.all([
      bcIds.length > 0
        ? supabase.from('reactions').select('broadcast_id').in('broadcast_id', bcIds)
        : Promise.resolve({ data: [] }),
      bcIds.length > 0
        ? supabase.from('broadcast_reads').select('broadcast_id').in('broadcast_id', bcIds)
        : Promise.resolve({ data: [] }),
      bcIds.length > 0
        ? supabase.from('messages').select('broadcast_id').in('broadcast_id', bcIds)
        : Promise.resolve({ data: [] }),
    ])

    const likeMap: Record<string, number> = {}
    const readMap: Record<string, number> = {}
    const replyMap: Record<string, number> = {}
    for (const r of (reactions ?? [])) likeMap[r.broadcast_id] = (likeMap[r.broadcast_id] ?? 0) + 1
    for (const r of (reads ?? [])) readMap[r.broadcast_id] = (readMap[r.broadcast_id] ?? 0) + 1
    for (const r of (replies ?? [])) replyMap[r.broadcast_id] = (replyMap[r.broadcast_id] ?? 0) + 1

    setBroadcasts((bcs ?? []).map((b: any) => ({
      ...b,
      like_count: likeMap[b.id] ?? 0,
      read_count: readMap[b.id] ?? 0,
      reply_count: replyMap[b.id] ?? 0,
    })))
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const handleFollow = async () => {
    if (!myId) return
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', myId).eq('following_id', id)
      setIsFollowing(false)
      setFollowerCount(c => c - 1)
    } else {
      // フォロワー上限チェック（無料プランは500人まで・ベータ期間中はスキップ）
      if (!BETA_MODE && creatorPlan === 'free' && followerCount >= FREE_FOLLOWER_LIMIT) {
        Alert.alert(
          'フォローできません',
          `このクリエイターは無料プランのフォロワー上限（${FREE_FOLLOWER_LIMIT}人）に達しています。`,
          [{ text: 'OK' }]
        )
        return
      }
      await supabase.from('follows').insert({ follower_id: myId, following_id: id })
      setIsFollowing(true)
      setFollowerCount(c => c + 1)

      // アクティブなフロー配信シーケンスへ自動エンロール
      const { data: sequences } = await supabase
        .from('step_sequences')
        .select('id')
        .eq('creator_id', id)
        .eq('is_active', true)
      if (sequences?.length) {
        await supabase.from('step_enrollments').upsert(
          sequences.map((seq: any) => ({
            follower_id: myId,
            creator_id: id,
            sequence_id: seq.id,
          })),
          { onConflict: 'follower_id,sequence_id', ignoreDuplicates: true }
        )
      }
    }
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  if (!profile) return null

  const isSelf = myId === id

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={styles.headerTitle}>{profile.display_name}</Text>
          {profile.is_official && <Ionicons name="checkmark-circle" size={16} color="#1D9BF0" />}
        </View>
        <View style={{ width: 32 }} />
      </View>

      <FlatList
        data={broadcasts}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        ListHeaderComponent={() => (
          <View style={styles.profileSection}>
            <View style={styles.avatarWrap}>
              {profile.avatar_url
                ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                : <View style={styles.avatar}><Text style={styles.avatarText}>{profile.display_name[0]}</Text></View>
              }
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.name}>{profile.display_name}</Text>
              {profile.is_official && <Ionicons name="checkmark-circle" size={18} color="#1D9BF0" />}
            </View>
            {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{followerCount.toLocaleString()}</Text>
                <Text style={styles.statLabel}>フォロワー</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{broadcasts.length}</Text>
                <Text style={styles.statLabel}>配信</Text>
              </View>
            </View>
            {!isSelf && (
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.followButton, isFollowing && styles.followingButton]}
                  onPress={handleFollow}
                >
                  {isFollowing
                    ? <><Ionicons name="checkmark" size={16} color={Colors.button} /><Text style={styles.followingButtonText}>フォロー中</Text></>
                    : <><Ionicons name="add" size={16} color={Colors.white} /><Text style={styles.followButtonText}>フォローする</Text></>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.talkButton}
                  onPress={() => router.push(`/talk/${id}` as any)}
                >
                  <Ionicons name="chatbubbles" size={18} color={Colors.white} />
                  <Text style={styles.talkButtonText}>トーク</Text>
                </TouchableOpacity>
              </View>
            )}
            {richMenu && richMenu.buttons.length > 0 && (
              <View style={styles.richMenuGrid}>
                {richMenu.buttons.map((btn: any) => (
                  <TouchableOpacity
                    key={btn.id}
                    style={styles.richMenuBtn}
                    onPress={() => Linking.openURL(btn.url)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={btn.icon ?? 'link-outline'} size={22} color={Colors.accent} />
                    <Text style={styles.richMenuBtnLabel} numberOfLines={1}>{btn.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Text style={styles.sectionTitle}>配信一覧</Text>
          </View>
        )}
        ListEmptyComponent={() => (
          <Text style={styles.empty}>まだ配信がありません</Text>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.broadcastCard}
            activeOpacity={isSelf ? 0.75 : 1}
            onPress={isSelf ? () => router.push(`/broadcast-thread/${item.id}` as any) : undefined}
          >
            <Text style={styles.broadcastContent}>{item.content}</Text>
            <View style={styles.broadcastMeta}>
              <Text style={styles.broadcastDate}>{formatDate(item.created_at)}</Text>
              <View style={styles.metaRight}>
                {isSelf && (
                  <View style={styles.metaItem}>
                    <Ionicons name="eye-outline" size={13} color={Colors.accent} />
                    <Text style={[styles.metaText, { color: Colors.accent }]}>{item.read_count}</Text>
                  </View>
                )}
                <View style={styles.metaItem}>
                  <Ionicons name="heart" size={13} color="#E53E3E" />
                  <Text style={styles.metaText}>{item.like_count}</Text>
                </View>
                {isSelf && (
                  <View style={styles.metaItem}>
                    <Ionicons name="chatbubble-outline" size={13} color={Colors.textLight} />
                    <Text style={styles.metaText}>{item.reply_count}</Text>
                  </View>
                )}
                {isSelf && (
                  <Ionicons name="chevron-forward" size={13} color={Colors.border} />
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  list: { paddingBottom: 32 },
  profileSection: { alignItems: 'center', padding: 24, gap: 8 },
  avatarWrap: { marginBottom: 4 },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: Colors.button,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImage: { width: 88, height: 88, borderRadius: 44 },
  avatarText: { fontSize: 36, fontWeight: '700', color: Colors.white },
  name: { fontSize: 20, fontWeight: '700', color: Colors.text },
  bio: { fontSize: 14, color: Colors.textLight, textAlign: 'center' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 24, marginVertical: 4 },
  statItem: { alignItems: 'center', gap: 2 },
  statNum: { fontSize: 18, fontWeight: '700', color: Colors.text },
  statLabel: { fontSize: 12, color: Colors.textLight },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.border },
  actionButtons: { flexDirection: 'row', gap: 10, marginTop: 8 },
  followButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.button,
    borderRadius: 24, paddingHorizontal: 24, paddingVertical: 10,
  },
  followingButton: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.button },
  followButtonText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  followingButtonText: { color: Colors.button, fontWeight: '700', fontSize: 15 },
  talkButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.accent,
    borderRadius: 24, paddingHorizontal: 24, paddingVertical: 10,
  },
  talkButtonText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginTop: 16, alignSelf: 'flex-start' },
  richMenuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%', marginTop: 8 },
  richMenuBtn: {
    flex: 1, minWidth: '28%', backgroundColor: Colors.white,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    padding: 12, alignItems: 'center', gap: 6,
  },
  richMenuBtnLabel: { fontSize: 11, color: Colors.text, fontWeight: '600', textAlign: 'center' },
  broadcastCard: {
    backgroundColor: Colors.white,
    marginHorizontal: 16, marginBottom: 10,
    borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  broadcastContent: { fontSize: 14, color: Colors.text, lineHeight: 22 },
  broadcastMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  broadcastDate: { fontSize: 11, color: Colors.textLight },
  metaRight: { flexDirection: 'row', gap: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: Colors.textLight },
  empty: { textAlign: 'center', color: Colors.textLight, fontSize: 14, marginTop: 32 },
})
