import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

type Broadcast = {
  id: string
  content: string
  created_at: string
  read_count: number
  like_count: number
  reply_count: number
}

type Stats = {
  followerCount: number
  followingCount: number
  totalBroadcasts: number
  monthlyBroadcasts: number
  totalReads: number
  totalLikes: number
  plan: string
}

const FREE_LIMIT = 50

export default function AnalyticsScreen() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const [
      { data: profile },
      { count: followerCount },
      { count: followingCount },
      { data: bcs },
      { count: monthlyCount },
    ] = await Promise.all([
      supabase.from('profiles').select('plan').eq('id', user.id).single(),
      supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', user.id),
      supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', user.id),
      supabase.from('broadcasts').select('id, content, created_at').eq('sender_id', user.id).eq('status', 'published').order('created_at', { ascending: false }),
      supabase.from('broadcasts').select('id', { count: 'exact', head: true })
        .eq('sender_id', user.id).eq('status', 'published')
        .gte('created_at', startOfMonth.toISOString()),
    ])

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

    const totalReads = Object.values(readMap).reduce((a, b) => a + b, 0)
    const totalLikes = Object.values(likeMap).reduce((a, b) => a + b, 0)

    const enriched: Broadcast[] = (bcs ?? []).map((b: any) => ({
      id: b.id,
      content: b.content,
      created_at: b.created_at,
      read_count: readMap[b.id] ?? 0,
      like_count: likeMap[b.id] ?? 0,
      reply_count: replyMap[b.id] ?? 0,
    }))

    setStats({
      followerCount: followerCount ?? 0,
      followingCount: followingCount ?? 0,
      totalBroadcasts: (bcs ?? []).length,
      monthlyBroadcasts: monthlyCount ?? 0,
      totalReads,
      totalLikes,
      plan: (profile as any)?.plan ?? 'free',
    })
    setBroadcasts(enriched)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const truncate = (text: string, len = 40) =>
    text.length > len ? text.slice(0, len) + '…' : text

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  const isFree = stats?.plan === 'free'
  const monthlyPct = isFree ? Math.min(((stats?.monthlyBroadcasts ?? 0) / FREE_LIMIT) * 100, 100) : 100
  const monthlyNearLimit = isFree && (stats?.monthlyBroadcasts ?? 0) >= FREE_LIMIT * 0.8

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>分析</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* フォロワー・フォロー */}
        <View style={styles.row2}>
          <View style={[styles.statCard, { flex: 1 }]}>
            <Ionicons name="people-outline" size={20} color={Colors.accent} />
            <Text style={styles.statValue}>{stats?.followerCount.toLocaleString()}</Text>
            <Text style={styles.statLabel}>フォロワー</Text>
            {isFree && (
              <Text style={styles.statSub}>上限500人</Text>
            )}
          </View>
          <View style={[styles.statCard, { flex: 1 }]}>
            <Ionicons name="person-add-outline" size={20} color={Colors.accent} />
            <Text style={styles.statValue}>{stats?.followingCount.toLocaleString()}</Text>
            <Text style={styles.statLabel}>フォロー中</Text>
          </View>
        </View>

        {/* 累計 */}
        <View style={styles.row3}>
          <View style={styles.statCard}>
            <Ionicons name="radio-outline" size={18} color={Colors.button} />
            <Text style={styles.statValue}>{stats?.totalBroadcasts.toLocaleString()}</Text>
            <Text style={styles.statLabel}>累計配信</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="eye-outline" size={18} color={Colors.button} />
            <Text style={styles.statValue}>{stats?.totalReads.toLocaleString()}</Text>
            <Text style={styles.statLabel}>累計閲覧数</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="heart-outline" size={18} color={Colors.button} />
            <Text style={styles.statValue}>{stats?.totalLikes.toLocaleString()}</Text>
            <Text style={styles.statLabel}>累計いいね</Text>
          </View>
        </View>

        {/* 今月の配信（無料プランのみ進捗バー） */}
        {isFree && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>今月の配信</Text>
              <Text style={[styles.monthlyCount, monthlyNearLimit && styles.monthlyCountWarn]}>
                {stats?.monthlyBroadcasts} / {FREE_LIMIT}回
              </Text>
            </View>
            <View style={styles.progressBg}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${monthlyPct}%` as any },
                  monthlyNearLimit && { backgroundColor: '#E53E3E' },
                ]}
              />
            </View>
            {monthlyNearLimit && (
              <TouchableOpacity onPress={() => router.push('/plan' as any)} style={styles.upgradeHint}>
                <Ionicons name="trending-up-outline" size={14} color={Colors.accent} />
                <Text style={styles.upgradeHintText}>
                  {(stats?.monthlyBroadcasts ?? 0) >= FREE_LIMIT
                    ? '上限に達しました。アップグレードで無制限に。'
                    : 'まもなく上限です。アップグレードで無制限に。'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* 配信一覧 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>配信ごとの実績</Text>
          {broadcasts.length === 0 ? (
            <Text style={styles.empty}>配信がまだありません</Text>
          ) : (
            broadcasts.map((bc) => (
              <TouchableOpacity
                key={bc.id}
                style={styles.bcRow}
                onPress={() => router.push(`/broadcast-thread/${bc.id}` as any)}
                activeOpacity={0.7}
              >
                <View style={styles.bcMain}>
                  <Text style={styles.bcContent}>{truncate(bc.content)}</Text>
                  <Text style={styles.bcDate}>{formatDate(bc.created_at)}</Text>
                </View>
                <View style={styles.bcStats}>
                  <View style={styles.bcStat}>
                    <Ionicons name="eye-outline" size={13} color={Colors.textLight} />
                    <Text style={styles.bcStatText}>{bc.read_count}</Text>
                  </View>
                  <View style={styles.bcStat}>
                    <Ionicons name="heart-outline" size={13} color={Colors.textLight} />
                    <Text style={styles.bcStatText}>{bc.like_count}</Text>
                  </View>
                  <View style={styles.bcStat}>
                    <Ionicons name="chatbubble-outline" size={13} color={Colors.textLight} />
                    <Text style={styles.bcStatText}>{bc.reply_count}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  content: { padding: 16, gap: 12, paddingBottom: 40 },

  row2: { flexDirection: 'row', gap: 10 },
  row3: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  statValue: { fontSize: 26, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textLight, fontWeight: '600' },
  statSub: { fontSize: 10, color: Colors.textLight },

  section: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 12,
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  monthlyCount: { fontSize: 13, fontWeight: '700', color: Colors.accent },
  monthlyCountWarn: { color: '#E53E3E' },

  progressBg: {
    height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden',
  },
  progressFill: {
    height: 8, backgroundColor: Colors.button, borderRadius: 4,
  },
  upgradeHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.background, borderRadius: 8, padding: 10,
  },
  upgradeHintText: { fontSize: 12, color: Colors.accent, flex: 1, fontWeight: '500' },

  empty: { fontSize: 13, color: Colors.textLight, textAlign: 'center', paddingVertical: 12 },
  bcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  bcMain: { flex: 1, gap: 3 },
  bcContent: { fontSize: 13, color: Colors.text, lineHeight: 18 },
  bcDate: { fontSize: 11, color: Colors.textLight },
  bcStats: { flexDirection: 'row', gap: 10 },
  bcStat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  bcStatText: { fontSize: 12, color: Colors.textLight },
})
