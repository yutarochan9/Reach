import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Image,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import DefaultAvatar from '../components/DefaultAvatar'
import { Colors } from '../../constants/colors'

type Spot = {
  id: string
  title: string | null
  opened_at: string
  auto_close_at: string
  creator_id: string
  display_name: string
  avatar_url: string | null
  username: string | null
  participant_count: number
}

// 開始からの経過時間を「○分前」形式で表示
function timeOpen(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'たった今'
  if (diff < 3600) return `${Math.floor(diff / 60)}分前に開始`
  return `${Math.floor(diff / 3600)}時間前に開始`
}

// 残り時間を表示
function timeLeft(autoCloseIso: string): string {
  const diff = (new Date(autoCloseIso).getTime() - Date.now()) / 1000
  if (diff <= 0) return '終了間近'
  if (diff < 60) return `残り${Math.ceil(diff)}秒`
  return `残り${Math.ceil(diff / 60)}分`
}

export default function SpotScreen() {
  const [spots, setSpots] = useState<Spot[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // フォロー中のクリエイターのopenなスポットを取得
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)

    const followingIds = (follows ?? []).map((f: any) => f.following_id)

    const { data: openSpots } = await supabase
      .from('spots')
      .select('id, title, opened_at, auto_close_at, creator_id')
      .eq('status', 'open')
      .in('creator_id', followingIds.length > 0 ? followingIds : ['__none__'])
      .order('opened_at', { ascending: false })

    if (!openSpots?.length) {
      setSpots([])
      setLoading(false)
      return
    }

    const creatorIds = [...new Set(openSpots.map((s: any) => s.creator_id))]
    const spotIds = openSpots.map((s: any) => s.id)

    const [{ data: profiles }, { data: participants }] = await Promise.all([
      supabase.from('profiles').select('id, display_name, avatar_url, username').in('id', creatorIds),
      supabase.from('spot_participants').select('spot_id').in('spot_id', spotIds).is('kicked_at', null),
    ])

    const profileMap: Record<string, any> = {}
    for (const p of (profiles ?? [])) profileMap[p.id] = p

    const participantCount: Record<string, number> = {}
    for (const p of (participants ?? [])) {
      participantCount[p.spot_id] = (participantCount[p.spot_id] ?? 0) + 1
    }

    const result: Spot[] = openSpots.map((s: any) => {
      const p = profileMap[s.creator_id] ?? {}
      return {
        id: s.id,
        title: s.title,
        opened_at: s.opened_at,
        auto_close_at: s.auto_close_at,
        creator_id: s.creator_id,
        display_name: p.display_name ?? '不明',
        avatar_url: p.avatar_url ?? null,
        username: p.username ?? null,
        participant_count: participantCount[s.id] ?? 0,
      }
    })

    setSpots(result)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false) }

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
        <Text style={styles.headerTitle}>スポット</Text>
        <Text style={styles.headerSub}>フォロー中のクリエイターのスポット</Text>
      </View>

      <FlatList
        data={spots}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        ListEmptyComponent={() => (
          <View style={styles.emptyWrap}>
            <Ionicons name="radio-outline" size={52} color={Colors.border} />
            <Text style={styles.emptyTitle}>開催中のスポットはありません</Text>
            <Text style={styles.emptyDesc}>フォロー中のクリエイターが{'\n'}スポットを開くと通知が届きます</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/spot/${item.id}` as any)}
            activeOpacity={0.88}
          >
            {/* ライブバッジ */}
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>

            {/* クリエイター情報 */}
            <View style={styles.creatorRow}>
              {item.avatar_url
                ? <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                : <DefaultAvatar size={44} />
              }
              <View style={styles.creatorInfo}>
                <Text style={styles.creatorName}>{item.display_name}</Text>
                {item.username && <Text style={styles.creatorAt}>@{item.username}</Text>}
              </View>
              <Text style={styles.timeOpen}>{timeOpen(item.opened_at)}</Text>
            </View>

            {/* タイトル */}
            {item.title ? (
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
            ) : (
              <Text style={styles.noTitle}>スポット開催中</Text>
            )}

            {/* フッター */}
            <View style={styles.footer}>
              <View style={styles.footerLeft}>
                <Ionicons name="people-outline" size={14} color={Colors.textLight} />
                <Text style={styles.footerText}>{item.participant_count}人参加中</Text>
              </View>
              <Text style={styles.timeLeft}>{timeLeft(item.auto_close_at)}</Text>
            </View>
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
    paddingTop: 36, paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.accent },
  headerSub: { fontSize: 12, color: Colors.textLight, marginTop: 2 },

  list: { paddingTop: 12, paddingBottom: 40, paddingHorizontal: 12 },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textLight },
  emptyDesc: { fontSize: 13, color: Colors.border, textAlign: 'center', lineHeight: 20 },

  card: {
    backgroundColor: Colors.white,
    borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },

  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', marginBottom: 10,
    backgroundColor: '#FEE2E2', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  liveDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  liveText: { fontSize: 11, fontWeight: '800', color: '#EF4444', letterSpacing: 0.5 },

  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  creatorInfo: { flex: 1 },
  creatorName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  creatorAt: { fontSize: 12, color: Colors.textLight, marginTop: 1 },
  timeOpen: { fontSize: 11, color: Colors.border },

  title: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  noTitle: { fontSize: 14, color: Colors.textLight, marginBottom: 12 },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerText: { fontSize: 12, color: Colors.textLight },
  timeLeft: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
})
