import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native'
import Svg, {
  Polyline, Circle, Rect, G, Line, Path,
  Defs, LinearGradient as SvgLinearGradient, Stop,
  Text as SvgText, RadialGradient,
} from 'react-native-svg'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { BETA_MODE } from '../constants/config'

// ── ダークテーマカラー ──────────────────────────────────────
const D = {
  bg:       '#0D1117',
  card:     '#161B22',
  border:   '#21262D',
  cyan:     '#39D0D8',
  blue:     '#58A6FF',
  purple:   '#BC8CFF',
  orange:   '#FF8C42',
  green:    '#3FB950',
  text:     '#E6EDF3',
  muted:    '#8B949E',
  dimmed:   '#30363D',
}

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

// ── リングチャート ────────────────────────────────────────────
function RingChart({ pct, color, size = 80, stroke = 8, label, value }:
  { pct: number; color: string; size?: number; stroke?: number; label: string; value: string }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const dash = Math.max(circ * Math.min(pct, 1), 0)
  const cx = size / 2, cy = size / 2
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={`rg${label}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity="0.15" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        {/* 背景リング */}
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke={D.dimmed} strokeWidth={stroke} />
        {/* グロー背景 */}
        <Circle cx={cx} cy={cy} r={r} fill={`url(#rg${label})`} />
        {/* プログレスリング */}
        <Circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={circ / 4}
          opacity={0.95}
        />
        {/* 中央テキスト */}
        <SvgText x={cx} y={cy - 5} textAnchor="middle" fontSize={14} fontWeight="800" fill={D.text}>{value}</SvgText>
        <SvgText x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fill={D.muted}>{label}</SvgText>
      </Svg>
    </View>
  )
}

// ── エリアチャート ───────────────────────────────────────────
function AreaChart({ data, color, width, height = 110, gradId }:
  { data: number[]; color: string; width: number; height?: number; gradId: string }) {
  if (data.length < 2 || width < 10) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const pX = 4, pY = 14
  const w = width - pX * 2, h = height - pY * 2
  const pts = data.map((v, i) => ({
    x: pX + (i / (data.length - 1)) * w,
    y: pY + (1 - (v - min) / range) * h,
  }))
  const linePts = pts.map(p => `${p.x},${p.y}`).join(' ')
  const areaPath = [
    `M ${pts[0].x} ${pts[0].y}`,
    ...pts.slice(1).map(p => `L ${p.x} ${p.y}`),
    `L ${pts[pts.length - 1].x} ${pY + h}`,
    `L ${pts[0].x} ${pY + h}`, 'Z',
  ].join(' ')

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.35" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </SvgLinearGradient>
      </Defs>
      {[0, 0.5, 1].map((t, i) => (
        <Line key={i} x1={pX} y1={pY + t * h} x2={width - pX} y2={pY + t * h}
          stroke={D.dimmed} strokeWidth={1} strokeDasharray="3,4" />
      ))}
      <Path d={areaPath} fill={`url(#${gradId})`} />
      <Polyline points={linePts} fill="none" stroke={color} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <G key={i}>
          <Circle cx={p.x} cy={p.y} r={5} fill={D.card} stroke={color} strokeWidth={1.5} />
          {data[i] > 0 && (
            <SvgText x={p.x} y={p.y - 8} textAnchor="middle" fontSize={9} fontWeight="700" fill={color}>
              {data[i]}
            </SvgText>
          )}
        </G>
      ))}
    </Svg>
  )
}

// ── 棒グラフ ────────────────────────────────────────────────
function BarChart({ data, color, width, height = 110 }:
  { data: number[]; color: string; width: number; height?: number }) {
  if (data.length === 0 || width < 10) return null
  const max = Math.max(...data, 1)
  const labelH = 16, baseH = 6
  const barAreaH = height - labelH - baseH
  const slotW = width / data.length
  const barW = Math.max(slotW * 0.3, 3)

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgLinearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="1" />
          <Stop offset="1" stopColor={color} stopOpacity="0.3" />
        </SvgLinearGradient>
      </Defs>
      <Line x1={0} y1={height - baseH} x2={width} y2={height - baseH}
        stroke={D.dimmed} strokeWidth={1} />
      {data.map((v, i) => {
        const barH = Math.max((v / max) * barAreaH, v > 0 ? 4 : 0)
        const cx = slotW * i + slotW / 2
        const barX = cx - barW / 2
        const barY = height - baseH - barH
        return (
          <G key={i}>
            <Rect x={barX} y={barY} width={barW} height={barH}
              rx={barW / 2} fill="url(#barGrad)" opacity={v === 0 ? 0.1 : 1} />
            {v > 0 && (
              <SvgText x={cx} y={barY - 3} textAnchor="middle"
                fontSize={10} fontWeight="800" fill={color}>{v}</SvgText>
            )}
          </G>
        )
      })}
    </Svg>
  )
}

export default function AnalyticsScreen() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [loading, setLoading] = useState(true)
  const [chartW, setChartW] = useState(0)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const startOfMonth = new Date()
    startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)

    const [
      { data: profile }, { count: followerCount }, { count: followingCount },
      { data: bcs }, { count: monthlyCount },
    ] = await Promise.all([
      supabase.from('profiles').select('plan').eq('id', user.id).single(),
      supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', user.id),
      supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', user.id),
      supabase.from('broadcasts').select('id, content, created_at, group_id, block_order')
        .eq('sender_id', user.id).eq('status', 'published').order('created_at', { ascending: false }),
      supabase.from('broadcasts').select('id', { count: 'exact', head: true })
        .eq('sender_id', user.id).eq('status', 'published')
        .gte('created_at', startOfMonth.toISOString()),
    ])

    const bcIds = (bcs ?? []).map((b: any) => b.id)
    const [{ data: reactions }, { data: reads }, { data: replies }] = await Promise.all([
      bcIds.length > 0 ? supabase.from('reactions').select('broadcast_id').in('broadcast_id', bcIds) : Promise.resolve({ data: [] }),
      bcIds.length > 0 ? supabase.from('broadcast_reads').select('broadcast_id').in('broadcast_id', bcIds) : Promise.resolve({ data: [] }),
      bcIds.length > 0 ? supabase.from('messages').select('broadcast_id').in('broadcast_id', bcIds) : Promise.resolve({ data: [] }),
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
      if (b.group_id) { if (!groupMap.has(b.group_id)) groupMap.set(b.group_id, []); groupMap.get(b.group_id)!.push(b) }
      else soloList.push(b)
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
    for (const b of soloList) enriched.push({
      id: b.id, content: b.content, created_at: b.created_at,
      read_count: readMap[b.id] ?? 0, like_count: likeMap[b.id] ?? 0,
      reply_count: replyMap[b.id] ?? 0, group_id: null, block_count: 1,
    })
    enriched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    setStats({
      followerCount: followerCount ?? 0, followingCount: followingCount ?? 0,
      totalBroadcasts: (bcs ?? []).length, monthlyBroadcasts: monthlyCount ?? 0,
      totalReads, totalLikes, plan: (profile as any)?.plan ?? 'free',
    })
    setBroadcasts(enriched)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const formatDate = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}` }
  const truncate = (s: string, n = 30) => s.length > n ? s.slice(0, n) + '…' : s

  if (loading) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={D.cyan} />
    </View>
  )

  const isFree = !BETA_MODE && stats?.plan === 'free'
  const monthlyPct = isFree ? Math.min(((stats?.monthlyBroadcasts ?? 0) / FREE_LIMIT), 1) : 1
  const monthlyNearLimit = isFree && (stats?.monthlyBroadcasts ?? 0) >= FREE_LIMIT * 0.8

  const chartData = [...broadcasts].reverse().slice(-10)
  const readSeries = chartData.map(b => b.read_count)
  const likeSeries = chartData.map(b => b.like_count)

  const followerPct = Math.min((stats?.followerCount ?? 0) / Math.max((stats?.followerCount ?? 0) + 10, 100), 1)
  const readPct = Math.min((stats?.totalReads ?? 0) / Math.max((stats?.totalReads ?? 0) + 10, 100), 1)
  const likePct = Math.min((stats?.totalLikes ?? 0) / Math.max((stats?.totalLikes ?? 0) + 10, 50), 1)

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4, width: 32 }}>
          <Ionicons name="chevron-back" size={24} color={D.cyan} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>分析</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>

        {/* ── リングチャート 3連 ── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>OVERVIEW</Text>
          <View style={s.ringRow}>
            <RingChart pct={followerPct} color={D.cyan} size={110} stroke={9}
              label="フォロワー" value={(stats?.followerCount ?? 0).toString()} />
            <RingChart pct={readPct} color={D.purple} size={110} stroke={9}
              label="累計閲覧" value={(stats?.totalReads ?? 0).toLocaleString()} />
            <RingChart pct={likePct} color={D.orange} size={110} stroke={9}
              label="累計いいね" value={(stats?.totalLikes ?? 0).toString()} />
          </View>
        </View>

        {/* ── 数値カード 3枚 ── */}
        <View style={s.row3}>
          {[
            { label: '累計配信', value: stats?.totalBroadcasts ?? 0, color: D.blue, icon: 'radio-outline' },
            { label: '今月配信', value: stats?.monthlyBroadcasts ?? 0, color: D.green, icon: 'calendar-outline', pct: monthlyPct, isFree },
            { label: 'フォロー中', value: stats?.followingCount ?? 0, color: D.cyan, icon: 'person-add-outline' },
          ].map(item => (
            <View key={item.label} style={s.statCard}>
              <Ionicons name={item.icon as any} size={14} color={item.color} />
              <Text style={[s.statNum, { color: item.color }]}>{item.value.toLocaleString()}</Text>
              <Text style={s.statLabel}>{item.label}</Text>
              {item.pct !== undefined && item.isFree && (
                <View style={s.miniBar}>
                  <View style={[s.miniBarFill, { width: `${item.pct * 100}%` as any, backgroundColor: monthlyNearLimit ? '#F85149' : D.green }]} />
                </View>
              )}
            </View>
          ))}
        </View>

        {/* ── 閲覧数エリアチャート ── */}
        {chartData.length >= 2 && (
          <View style={s.card} onLayout={e => setChartW(e.nativeEvent.layout.width - 32)}>
            <View style={s.chartHead}>
              <View>
                <Text style={s.cardLabel}>READ TREND</Text>
                <Text style={s.chartSub}>閲覧数推移 · 直近{chartData.length}配信</Text>
              </View>
              <View style={[s.badge, { borderColor: D.cyan }]}>
                <Text style={[s.badgeText, { color: D.cyan }]}>閲覧数</Text>
              </View>
            </View>
            {chartW > 0 && <AreaChart data={readSeries} color={D.cyan} width={chartW} height={120} gradId="readGrad" />}
            <View style={s.xLabels}>
              {chartData.map((b, i) => <Text key={i} style={s.xLabel}>{formatDate(b.created_at)}</Text>)}
            </View>
          </View>
        )}

        {/* ── いいね棒グラフ ── */}
        {chartData.length >= 2 && (
          <View style={s.card}>
            <View style={s.chartHead}>
              <View>
                <Text style={s.cardLabel}>LIKES</Text>
                <Text style={s.chartSub}>いいね数 · 直近{chartData.length}配信</Text>
              </View>
              <View style={[s.badge, { borderColor: D.orange }]}>
                <Text style={[s.badgeText, { color: D.orange }]}>いいね</Text>
              </View>
            </View>
            {chartW > 0 && <BarChart data={likeSeries} color={D.orange} width={chartW} height={120} />}
            <View style={s.xLabels}>
              {chartData.map((b, i) => <Text key={i} style={s.xLabel}>{formatDate(b.created_at)}</Text>)}
            </View>
          </View>
        )}

        {/* ── 配信テーブル ── */}
        <View style={[s.card, { padding: 0, overflow: 'hidden' }]}>
          <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={s.cardLabel}>BROADCASTS</Text>
              <Text style={s.chartSub}>配信ごとの実績</Text>
            </View>
            <Text style={[s.badgeText, { color: D.muted }]}>{broadcasts.length} 件</Text>
          </View>

          {/* ヘッダー行 */}
          <View style={s.thRow}>
            <Text style={[s.th, { flex: 1 }]}>内容</Text>
            <Text style={s.th}>日時</Text>
            <Text style={[s.th, { width: 28, textAlign: 'right' }]}>👁</Text>
            <Text style={[s.th, { width: 28, textAlign: 'right' }]}>♡</Text>
            <Text style={[s.th, { width: 28, textAlign: 'right' }]}>💬</Text>
          </View>

          {broadcasts.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
              <Ionicons name="radio-outline" size={32} color={D.dimmed} />
              <Text style={{ color: D.muted, fontSize: 13 }}>配信がまだありません</Text>
            </View>
          ) : broadcasts.map((bc, idx) => (
            <TouchableOpacity
              key={bc.id}
              style={[s.tdRow, idx % 2 === 0 && { backgroundColor: `${D.dimmed}30` }]}
              onPress={() => router.push(`/broadcast-thread/${bc.id}` as any)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1, gap: 2 }}>
                {bc.block_count > 1 && (
                  <View style={s.groupBadge}>
                    <Text style={s.groupBadgeText}>{bc.block_count}件まとめて</Text>
                  </View>
                )}
                <Text style={s.tdText} numberOfLines={1}>{truncate(bc.content)}</Text>
              </View>
              <Text style={[s.td, { width: 36 }]}>{formatDate(bc.created_at)}</Text>
              <Text style={[s.td, { width: 28, color: D.cyan }]}>{bc.read_count}</Text>
              <Text style={[s.td, { width: 28, color: D.orange }]}>{bc.like_count}</Text>
              <Text style={[s.td, { width: 28, color: D.purple }]}>{bc.reply_count}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {monthlyNearLimit && (
          <TouchableOpacity onPress={() => router.push('/plan' as any)} style={s.upgradeBar}>
            <Ionicons name="flash-outline" size={14} color={D.orange} />
            <Text style={s.upgradeText}>
              {(stats?.monthlyBroadcasts ?? 0) >= FREE_LIMIT ? '上限到達 — アップグレードで無制限に' : `残り${FREE_LIMIT - (stats?.monthlyBroadcasts ?? 0)}回 — まもなく上限`}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={D.orange} />
          </TouchableOpacity>
        )}

      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: D.bg },
  header: {
    backgroundColor: D.card,
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: D.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: D.text },
  content: { padding: 14, gap: 12, paddingBottom: 48 },

  card: {
    backgroundColor: D.card, borderRadius: 14,
    borderWidth: 1, borderColor: D.border, padding: 16, gap: 12,
  },
  cardLabel: { fontSize: 10, fontWeight: '800', color: D.muted, letterSpacing: 1.5 },
  chartSub: { fontSize: 12, fontWeight: '600', color: D.text, marginTop: 1 },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  xLabel: { fontSize: 9, color: D.muted, flex: 1, textAlign: 'center' },

  ringRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },

  row3: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: D.card, borderRadius: 12,
    borderWidth: 1, borderColor: D.border,
    padding: 12, gap: 3, alignItems: 'flex-start',
  },
  statNum: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  statLabel: { fontSize: 10, color: D.muted, fontWeight: '600' },
  miniBar: { height: 3, width: '100%', backgroundColor: D.dimmed, borderRadius: 2, overflow: 'hidden', marginTop: 2 },
  miniBarFill: { height: 3, borderRadius: 2 },

  thRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: D.dimmed, gap: 8,
  },
  th: { fontSize: 10, fontWeight: '700', color: D.muted },
  tdRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  tdText: { fontSize: 12, color: D.text },
  td: { fontSize: 12, fontWeight: '600', color: D.muted, textAlign: 'right' },

  groupBadge: {
    flexDirection: 'row', alignSelf: 'flex-start',
    backgroundColor: `${D.purple}25`, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  groupBadgeText: { fontSize: 9, fontWeight: '700', color: D.purple },

  upgradeBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${D.orange}15`, borderRadius: 10, borderWidth: 1, borderColor: `${D.orange}40`,
    padding: 12,
  },
  upgradeText: { flex: 1, fontSize: 12, color: D.orange, fontWeight: '600' },
})
