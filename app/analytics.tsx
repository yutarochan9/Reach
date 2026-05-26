import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native'
import Svg, { Polyline, Circle, Rect, G, Line, Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'
import { BETA_MODE } from '../constants/config'

type Broadcast = {
  id: string
  content: string
  created_at: string
  read_count: number
  like_count: number
  reply_count: number
  group_id: string | null
  block_count: number
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

// ── グラデーション付き折れ線グラフ ──────────────────────────
function AreaChart({
  data, color, width, height = 100, gradId,
}: { data: number[]; color: string; width: number; height?: number; gradId: string }) {
  if (data.length < 2 || width < 10) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const pX = 4, pY = 8
  const w = width - pX * 2
  const h = height - pY * 2
  const pts = data.map((v, i) => ({
    x: pX + (i / (data.length - 1)) * w,
    y: pY + (1 - (v - min) / range) * h,
  }))
  const linePts = pts.map(p => `${p.x},${p.y}`).join(' ')
  const areaPath = [
    `M ${pts[0].x} ${pts[0].y}`,
    ...pts.slice(1).map(p => `L ${p.x} ${p.y}`),
    `L ${pts[pts.length - 1].x} ${pY + h}`,
    `L ${pts[0].x} ${pY + h}`,
    'Z',
  ].join(' ')

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.25" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </SvgLinearGradient>
      </Defs>
      {[0, 0.5, 1].map((t, i) => (
        <Line key={i}
          x1={pX} y1={pY + t * h} x2={width - pX} y2={pY + t * h}
          stroke={Colors.border} strokeWidth={1} strokeDasharray="4,4"
        />
      ))}
      <Path d={areaPath} fill={`url(#${gradId})`} />
      <Polyline points={linePts} fill="none" stroke={color} strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={3.5}
          fill="#fff" stroke={color} strokeWidth={2} />
      ))}
    </Svg>
  )
}

// ── 棒グラフ ────────────────────────────────────────────────
function BarChart({
  data, color, width, height = 90,
}: { data: number[]; color: string; width: number; height?: number }) {
  if (data.length === 0 || width < 10) return null
  const max = Math.max(...data, 1)
  const gap = 5
  const barW = Math.max((width - gap * (data.length - 1)) / data.length, 2)
  const maxH = height - 8
  return (
    <Svg width={width} height={height}>
      <Line x1={0} y1={height - 4} x2={width} y2={height - 4}
        stroke={Colors.border} strokeWidth={1} />
      {data.map((v, i) => {
        const barH = Math.max((v / max) * maxH, 2)
        return (
          <Rect key={i}
            x={i * (barW + gap)} y={height - barH - 4}
            width={barW} height={barH}
            rx={3} fill={color} opacity={v === 0 ? 0.2 : 0.85}
          />
        )
      })}
    </Svg>
  )
}

// ── ミニ折れ線（ヒーローカード用） ───────────────────────────
function MiniLine({ data, color, width, height = 40 }: { data: number[]; color: string; width: number; height: number }) {
  if (data.length < 2 || width < 10) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`
  ).join(' ')
  return (
    <Svg width={width} height={height} style={{ opacity: 0.6 }}>
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export default function AnalyticsScreen() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [loading, setLoading] = useState(true)
  const [chartW, setChartW] = useState(0)
  const [rightW, setRightW] = useState(0)

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
      supabase.from('broadcasts').select('id, content, created_at, group_id, block_order').eq('sender_id', user.id).eq('status', 'published').order('created_at', { ascending: false }),
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

    const groupMap = new Map<string, any[]>()
    const soloList: any[] = []
    for (const b of (bcs ?? [])) {
      if (b.group_id) {
        if (!groupMap.has(b.group_id)) groupMap.set(b.group_id, [])
        groupMap.get(b.group_id)!.push(b)
      } else {
        soloList.push(b)
      }
    }

    const enriched: Broadcast[] = []
    for (const [, blocks] of groupMap) {
      blocks.sort((a: any, b: any) => (a.block_order ?? 0) - (b.block_order ?? 0))
      const rep = blocks[0]
      enriched.push({
        id: rep.id, content: rep.content, created_at: rep.created_at,
        read_count: blocks.reduce((s: number, b: any) => s + (readMap[b.id] ?? 0), 0),
        like_count: blocks.reduce((s: number, b: any) => s + (likeMap[b.id] ?? 0), 0),
        reply_count: blocks.reduce((s: number, b: any) => s + (replyMap[b.id] ?? 0), 0),
        group_id: rep.group_id, block_count: blocks.length,
      })
    }
    for (const b of soloList) {
      enriched.push({
        id: b.id, content: b.content, created_at: b.created_at,
        read_count: readMap[b.id] ?? 0, like_count: likeMap[b.id] ?? 0,
        reply_count: replyMap[b.id] ?? 0, group_id: null, block_count: 1,
      })
    }
    enriched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    setStats({
      followerCount: followerCount ?? 0,
      followingCount: followingCount ?? 0,
      totalBroadcasts: (bcs ?? []).length,
      monthlyBroadcasts: monthlyCount ?? 0,
      totalReads, totalLikes,
      plan: (profile as any)?.plan ?? 'free',
    })
    setBroadcasts(enriched)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  const truncate = (text: string, len = 32) =>
    text.length > len ? text.slice(0, len) + '…' : text

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  const isFree = !BETA_MODE && stats?.plan === 'free'
  const monthlyPct = isFree ? Math.min(((stats?.monthlyBroadcasts ?? 0) / FREE_LIMIT) * 100, 100) : 100
  const monthlyNearLimit = isFree && (stats?.monthlyBroadcasts ?? 0) >= FREE_LIMIT * 0.8

  const chartData = [...broadcasts].reverse().slice(-10)
  const readSeries = chartData.map(b => b.read_count)
  const likeSeries = chartData.map(b => b.like_count)
  const miniData = readSeries.length >= 2 ? readSeries : [0, 0]

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

        {/* ── 上部ヒーローエリア ── */}
        <View style={styles.heroRow}>
          {/* フォロワーカード（アクセントカラー） */}
          <View style={styles.heroCard}
            onLayout={e => setRightW(e.nativeEvent.layout.width - 32)}
          >
            <View style={styles.heroIconRow}>
              <View style={styles.heroIconWrap}>
                <Ionicons name="people" size={18} color="#fff" />
              </View>
              <Text style={styles.heroCardLabel}>フォロワー</Text>
            </View>
            <Text style={styles.heroNumber}>{(stats?.followerCount ?? 0).toLocaleString()}</Text>
            <Text style={styles.heroSub}>フォロー中 {stats?.followingCount ?? 0}人</Text>
            {rightW > 0 && miniData.length >= 2 && (
              <View style={styles.heroChart}>
                <MiniLine data={miniData} color="#fff" width={rightW} height={36} />
              </View>
            )}
          </View>

          {/* 右側 3つの小カード */}
          <View style={styles.miniCardCol}>
            <View style={styles.miniCard}>
              <View style={[styles.miniIconWrap, { backgroundColor: `${Colors.button}20` }]}>
                <Ionicons name="eye-outline" size={15} color={Colors.button} />
              </View>
              <Text style={styles.miniValue}>{(stats?.totalReads ?? 0).toLocaleString()}</Text>
              <Text style={styles.miniLabel}>累計閲覧</Text>
            </View>
            <View style={styles.miniCard}>
              <View style={[styles.miniIconWrap, { backgroundColor: `${Colors.accent}20` }]}>
                <Ionicons name="heart-outline" size={15} color={Colors.accent} />
              </View>
              <Text style={styles.miniValue}>{(stats?.totalLikes ?? 0).toLocaleString()}</Text>
              <Text style={styles.miniLabel}>累計いいね</Text>
            </View>
            <View style={styles.miniCard}>
              <View style={[styles.miniIconWrap, { backgroundColor: `${Colors.accent}20` }]}>
                <Ionicons name="radio-outline" size={15} color={Colors.accent} />
              </View>
              <Text style={styles.miniValue}>{(stats?.totalBroadcasts ?? 0).toLocaleString()}</Text>
              <Text style={styles.miniLabel}>累計配信</Text>
            </View>
          </View>
        </View>

        {/* ── 閲覧数トレンドチャート ── */}
        {chartData.length >= 2 && (
          <View style={styles.chartCard}
            onLayout={e => setChartW(e.nativeEvent.layout.width - 32)}
          >
            <View style={styles.chartHeader}>
              <View>
                <Text style={styles.chartTitle}>閲覧数推移</Text>
                <Text style={styles.chartSub}>直近 {chartData.length} 配信</Text>
              </View>
              <View style={[styles.chartBadge, { backgroundColor: `${Colors.accent}15` }]}>
                <Ionicons name="eye-outline" size={12} color={Colors.accent} />
                <Text style={[styles.chartBadgeText, { color: Colors.accent }]}>閲覧数</Text>
              </View>
            </View>
            {chartW > 0 && (
              <AreaChart data={readSeries} color={Colors.accent} width={chartW} height={110} gradId="readGrad" />
            )}
            <View style={styles.xLabels}>
              {chartData.map((b, i) => (
                <Text key={i} style={styles.xLabel}>{formatDate(b.created_at)}</Text>
              ))}
            </View>
          </View>
        )}

        {/* ── いいね棒グラフ ＋ 今月配信カード ── */}
        {chartData.length >= 2 && (
          <View style={styles.row2}>
            <View style={[styles.chartCard, { flex: 1 }]}>
              <View style={styles.chartHeader}>
                <View>
                  <Text style={styles.chartTitle}>いいね数</Text>
                  <Text style={styles.chartSub}>直近 {chartData.length} 配信</Text>
                </View>
                <View style={[styles.chartBadge, { backgroundColor: `${Colors.button}15` }]}>
                  <Ionicons name="heart-outline" size={12} color={Colors.button} />
                  <Text style={[styles.chartBadgeText, { color: Colors.button }]}>いいね</Text>
                </View>
              </View>
              {chartW > 0 && (
                <BarChart data={likeSeries} color={Colors.button} width={chartW / 2} height={90} />
              )}
            </View>

            {/* 今月配信カード */}
            <View style={styles.monthCard}>
              <Text style={styles.monthNumber}>{stats?.monthlyBroadcasts ?? 0}</Text>
              <Text style={styles.monthLabel}>今月の配信</Text>
              {isFree && (
                <>
                  <View style={styles.monthBar}>
                    <View style={[styles.monthBarFill,
                      { width: `${monthlyPct}%` as any },
                      monthlyNearLimit && { backgroundColor: '#E53E3E' },
                    ]} />
                  </View>
                  <Text style={styles.monthLimitText}>上限 {FREE_LIMIT} 回</Text>
                  {monthlyNearLimit && (
                    <TouchableOpacity onPress={() => router.push('/plan' as any)} style={styles.upgradeBtn}>
                      <Text style={styles.upgradeBtnText}>アップグレード</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </View>
        )}

        {/* ── 配信テーブル ── */}
        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={styles.chartTitle}>配信ごとの実績</Text>
            <Text style={styles.chartSub}>{broadcasts.length} 件</Text>
          </View>

          {/* テーブルヘッダー行 */}
          <View style={styles.tableHeadRow}>
            <Text style={[styles.tableHeadCell, { flex: 1 }]}>内容</Text>
            <Text style={styles.tableHeadCell}>日時</Text>
            <View style={styles.tableHeadStats}>
              <Ionicons name="eye-outline" size={11} color={Colors.textLight} />
              <Ionicons name="heart-outline" size={11} color={Colors.textLight} />
              <Ionicons name="chatbubble-outline" size={11} color={Colors.textLight} />
            </View>
          </View>

          {broadcasts.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="radio-outline" size={32} color={Colors.border} />
              <Text style={styles.emptyText}>配信がまだありません</Text>
            </View>
          ) : (
            broadcasts.map((bc, idx) => (
              <TouchableOpacity
                key={bc.id}
                style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}
                onPress={() => router.push(`/broadcast-thread/${bc.id}` as any)}
                activeOpacity={0.7}
              >
                <View style={styles.tableCell}>
                  {bc.block_count > 1 && (
                    <View style={styles.groupBadge}>
                      <Ionicons name="layers-outline" size={9} color={Colors.accent} />
                      <Text style={styles.groupBadgeText}>{bc.block_count}件</Text>
                    </View>
                  )}
                  <Text style={styles.tableCellText} numberOfLines={1}>{truncate(bc.content)}</Text>
                </View>
                <Text style={styles.tableDateText}>{formatDate(bc.created_at)}</Text>
                <View style={styles.tableStats}>
                  <Text style={styles.tableStatNum}>{bc.read_count}</Text>
                  <Text style={styles.tableStatNum}>{bc.like_count}</Text>
                  <Text style={styles.tableStatNum}>{bc.reply_count}</Text>
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
  content: { padding: 16, gap: 12, paddingBottom: 48 },

  // ── ヒーローエリア ──
  heroRow: { flexDirection: 'row', gap: 10 },
  heroCard: {
    flex: 1, backgroundColor: Colors.accent, borderRadius: 16,
    padding: 14, gap: 2, minHeight: 110, justifyContent: 'space-between',
  },
  heroIconRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroIconWrap: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center',
  },
  heroCardLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  heroNumber: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  heroSub: { fontSize: 10, color: 'rgba(255,255,255,0.7)' },
  heroChart: { marginTop: 4 },

  miniCardCol: { width: 100, gap: 6 },
  miniCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    padding: 10, gap: 1,
  },
  miniIconWrap: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  miniValue: { fontSize: 17, fontWeight: '800', color: Colors.text },
  miniLabel: { fontSize: 10, color: Colors.textLight, fontWeight: '600' },

  // ── チャートカード ──
  chartCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16, gap: 10,
  },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  chartTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  chartSub: { fontSize: 11, color: Colors.textLight, marginTop: 1 },
  chartBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  chartBadgeText: { fontSize: 10, fontWeight: '700' },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  xLabel: { fontSize: 9, color: Colors.textLight, flex: 1, textAlign: 'center' },

  // ── 行2（いいねチャート＋今月カード） ──
  row2: { flexDirection: 'row', gap: 10 },
  monthCard: {
    width: 120, backgroundColor: Colors.text, borderRadius: 16,
    padding: 16, gap: 6, justifyContent: 'center',
  },
  monthNumber: { fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  monthLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  monthBar: { height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  monthBarFill: { height: 4, backgroundColor: Colors.button, borderRadius: 2 },
  monthLimitText: { fontSize: 9, color: 'rgba(255,255,255,0.5)' },
  upgradeBtn: {
    marginTop: 4, backgroundColor: Colors.accent,
    borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8, alignItems: 'center',
  },
  upgradeBtnText: { fontSize: 9, color: '#fff', fontWeight: '700' },

  // ── テーブル ──
  tableCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, paddingBottom: 12,
  },
  tableHeadRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: Colors.background,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border,
  },
  tableHeadCell: { fontSize: 10, fontWeight: '700', color: Colors.textLight, marginRight: 12 },
  tableHeadStats: { flexDirection: 'row', gap: 16 },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 11,
  },
  tableRowAlt: { backgroundColor: `${Colors.background}80` },
  tableCell: { flex: 1, gap: 3 },
  tableCellText: { fontSize: 12, color: Colors.text },
  tableDateText: { fontSize: 10, color: Colors.textLight, marginRight: 12, width: 36 },
  tableStats: { flexDirection: 'row', gap: 16 },
  tableStatNum: { fontSize: 12, fontWeight: '600', color: Colors.text, width: 24, textAlign: 'right' },

  groupBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: `${Colors.accent}15`, borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1, alignSelf: 'flex-start',
  },
  groupBadgeText: { fontSize: 9, fontWeight: '700', color: Colors.accent },

  emptyWrap: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyText: { fontSize: 13, color: Colors.textLight },
})
