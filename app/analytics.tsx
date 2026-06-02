import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Pressable, useWindowDimensions, TextInput, Platform, Alert } from 'react-native'
import Svg, {
  Polyline, Circle, Rect, G, Line, Path,
  Defs, LinearGradient as SvgLinearGradient, Stop,
  Text as SvgText,
} from 'react-native-svg'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { BETA_MODE } from '../constants/config'

const C = {
  bg:       '#EDE4D8',
  card:     '#FFFFFF',
  header:   '#E0D4C4',
  border:   '#D4C4B0',
  accent:   '#8B5E3C',
  button:   '#C4956A',
  text:     '#3D2B1A',
  muted:    '#8B7355',
  light:    '#F5EFE6',
  danger:   '#C0392B',
  green:    '#5A8A5A',
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
  totalReplies: number
  plan: string
}
const FREE_LIMIT = 50

// ── エンゲージメント率リング（MAX=100%で意味が明確） ─────────────────
function RateRing({ pct, color, label, gradId }: { pct: number; color: string; label: string; gradId: string }) {
  const size = 72, stroke = 7
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const clamped = Math.min(Math.max(pct, 0), 1)
  const dash = circ * clamped
  const cx = size / 2, cy = size / 2
  const display = pct >= 1 ? '100%' : `${(pct * 100).toFixed(1)}%`
  return (
    <View style={{ alignItems: 'center', gap: 6, flex: 1 }}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgLinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="1" />
            <Stop offset="1" stopColor={color} stopOpacity="0.5" />
          </SvgLinearGradient>
        </Defs>
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke={C.border} strokeWidth={stroke} />
        <Circle
          cx={cx} cy={cy} r={r}
          fill="none" stroke={`url(#${gradId})`}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${Math.max(circ - dash, 0)}`}
          strokeDashoffset={circ / 4}
        />
        <SvgText x={cx} y={cy + 5} textAnchor="middle" fontSize={11} fontWeight="800" fill={C.text}>{display}</SvgText>
      </Svg>
      <Text style={{ fontSize: 11, fontWeight: '600', color: C.muted, textAlign: 'center' }}>{label}</Text>
    </View>
  )
}

// ── 今月配信リングチャート（MAXが明確なのでリングが成立） ──────────
function MonthlyRing({ used, limit, color }: { used: number; limit: number; color: string }) {
  const size = 120, stroke = 10
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.min(used / limit, 1)
  const dash = circ * pct
  const cx = size / 2, cy = size / 2
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgLinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="1" />
            <Stop offset="1" stopColor={color} stopOpacity="0.6" />
          </SvgLinearGradient>
        </Defs>
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke={C.border} strokeWidth={stroke} />
        <Circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${Math.max(circ - dash, 0)}`}
          strokeDashoffset={circ / 4}
        />
        <SvgText x={cx} y={cy - 6} textAnchor="middle" fontSize={22} fontWeight="800" fill={C.text}>{used}</SvgText>
        <SvgText x={cx} y={cy + 12} textAnchor="middle" fontSize={11} fill={C.muted}>/ {limit}</SvgText>
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
  const pX = 4, pY = 16
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
          <Stop offset="0" stopColor={color} stopOpacity="0.25" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </SvgLinearGradient>
      </Defs>
      {[0, 0.5, 1].map((t, i) => (
        <Line key={i} x1={pX} y1={pY + t * h} x2={width - pX} y2={pY + t * h}
          stroke={C.border} strokeWidth={1} strokeDasharray="3,4" />
      ))}
      <Path d={areaPath} fill={`url(#${gradId})`} />
      <Polyline points={linePts} fill="none" stroke={color} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <G key={i}>
          <Circle cx={p.x} cy={p.y} r={4} fill={C.card} stroke={color} strokeWidth={1.5} />
          {data[i] > 0 && (
            <SvgText x={p.x} y={p.y - 7} textAnchor="middle" fontSize={9} fontWeight="700" fill={color}>
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
  const labelH = 18, baseH = 6
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
        stroke={C.border} strokeWidth={1} />
      {data.map((v, i) => {
        const barH = Math.max((v / max) * barAreaH, v > 0 ? 4 : 0)
        const cx = slotW * i + slotW / 2
        const barX = cx - barW / 2
        const barY = height - baseH - barH
        return (
          <G key={i}>
            <Rect x={barX} y={barY} width={barW} height={barH}
              rx={barW / 2} fill="url(#barGrad)" opacity={v === 0 ? 0.15 : 1} />
            {v > 0 && (
              <SvgText x={cx} y={barY - 3} textAnchor="middle"
                fontSize={9} fontWeight="700" fill={color}>{v}</SvgText>
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
  const [memberStats, setMemberStats] = useState({ memberCount: 0, totalPosts: 0, monthlyPosts: 0, retentionRate: 0 })
  const [loading, setLoading] = useState(true)
  const { width } = useWindowDimensions()
  const isMobile = width < 900
  const [chartW, setChartW] = useState(0)
  const [menuBc, setMenuBc] = useState<Broadcast | null>(null)
  // 日時フィルター（YYYY-MM-DD 形式の文字列）
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const startOfMonth = new Date()
    startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

    const [
      { data: profile }, { count: followerCount }, { count: followingCount },
      { data: bcs }, { count: monthlyCount },
      { count: memberCount }, { count: totalMbPosts }, { count: monthlyMbPosts },
      { data: longTermSubs },
    ] = await Promise.all([
      supabase.from('profiles').select('plan').eq('id', user.id).single(),
      supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', user.id),
      supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', user.id),
      supabase.from('broadcasts').select('id, content, created_at, group_id, block_order')
        .eq('sender_id', user.id).eq('status', 'published').order('created_at', { ascending: false }),
      supabase.from('broadcasts').select('id', { count: 'exact', head: true })
        .eq('sender_id', user.id).eq('status', 'published')
        .gte('created_at', startOfMonth.toISOString()),
      // 会員数: アクティブな加入者数
      supabase.from('subscriptions').select('subscriber_id', { count: 'exact', head: true })
        .eq('creator_id', user.id).eq('status', 'active'),
      // 総投稿数: メンバーシップ限定配信の総数
      supabase.from('broadcasts').select('id', { count: 'exact', head: true })
        .eq('sender_id', user.id).eq('status', 'published').eq('is_subscriber_only', true),
      // 月間投稿数: 今月のメンバーシップ限定配信数
      supabase.from('broadcasts').select('id', { count: 'exact', head: true })
        .eq('sender_id', user.id).eq('status', 'published').eq('is_subscriber_only', true)
        .gte('created_at', startOfMonth.toISOString()),
      // 継続率計算用: 30日以上前から加入しているメンバー
      supabase.from('subscriptions').select('created_at')
        .eq('creator_id', user.id).eq('status', 'active').lte('created_at', thirtyDaysAgo),
    ])

    const mc = memberCount ?? 0
    const retentionRate = mc > 0 ? Math.round(((longTermSubs ?? []).length / mc) * 100) : 0
    setMemberStats({
      memberCount: mc,
      totalPosts: totalMbPosts ?? 0,
      monthlyPosts: monthlyMbPosts ?? 0,
      retentionRate,
    })

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

    const totalReplies = Object.values(replyMap).reduce((a, b) => a + b, 0)

    setStats({
      followerCount: followerCount ?? 0, followingCount: followingCount ?? 0,
      totalBroadcasts: (bcs ?? []).length, monthlyBroadcasts: monthlyCount ?? 0,
      totalReads, totalLikes, totalReplies, plan: (profile as any)?.plan ?? 'free',
    })
    setBroadcasts(enriched)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const formatDate = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}` }

  // 日時フィルターを適用した配信リスト
  const filteredBroadcasts = broadcasts.filter(bc => {
    const t = new Date(bc.created_at).getTime()
    if (dateFrom) {
      const from = new Date(dateFrom + 'T00:00:00').getTime()
      if (isNaN(from) || t < from) return false
    }
    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59').getTime()
      if (isNaN(to) || t > to) return false
    }
    return true
  })
  const fmtShort = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K` : String(n)
  const truncate = (s: string, n = 28) => s.length > n ? s.slice(0, n) + '…' : s

  const handleDeleteBc = (bc: Broadcast) => {
    setMenuBc(null)
    const doDelete = async () => {
      if (bc.group_id) {
        await supabase.from('broadcasts').delete().eq('group_id', bc.group_id)
        setBroadcasts(prev => prev.filter(b => b.group_id !== bc.group_id))
      } else {
        await supabase.from('broadcasts').delete().eq('id', bc.id)
        setBroadcasts(prev => prev.filter(b => b.id !== bc.id))
      }
    }
    if (Platform.OS === 'web') {
      if (window.confirm('この配信を削除しますか？\n削除すると元に戻せません。')) doDelete()
    } else {
      Alert.alert(
        '配信を削除',
        'この配信を削除しますか？\n削除すると元に戻せません。',
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: '削除する', style: 'destructive', onPress: doDelete },
        ]
      )
    }
  }

  if (loading) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={C.accent} />
    </View>
  )

  const isFree = !BETA_MODE && stats?.plan === 'free'
  const monthlyUsed = stats?.monthlyBroadcasts ?? 0
  const monthlyNearLimit = isFree && monthlyUsed >= FREE_LIMIT * 0.8
  const monthlyAtLimit = isFree && monthlyUsed >= FREE_LIMIT
  const ringColor = monthlyAtLimit ? C.danger : monthlyNearLimit ? '#E67E22' : C.green

  const chartData = broadcasts.slice(0, 10).reverse()
  const readSeries = chartData.map(b => b.read_count)
  const likeSeries = chartData.map(b => b.like_count)

  const followerCount = stats?.followerCount ?? 0
  const totalReads = stats?.totalReads ?? 0
  const totalBroadcasts = stats?.totalBroadcasts ?? 0
  // 既読率: 配信1件あたりの平均閲覧 ÷ フォロワー数
  const readRate = followerCount > 0 && totalBroadcasts > 0
    ? (totalReads / totalBroadcasts) / followerCount : 0
  // いいね率: 累計いいね ÷ 累計閲覧
  const likeRate = totalReads > 0 ? (stats?.totalLikes ?? 0) / totalReads : 0
  // 返信率: 累計返信 ÷ 累計閲覧
  const replyRate = totalReads > 0 ? (stats?.totalReplies ?? 0) / totalReads : 0

  const subItems = [
    { label: '累計閲覧', value: stats?.totalReads ?? 0, icon: 'eye-outline' as const },
    { label: '累計いいね', value: stats?.totalLikes ?? 0, icon: 'heart-outline' as const },
    { label: '累計配信', value: stats?.totalBroadcasts ?? 0, icon: 'radio-outline' as const },
    { label: 'フォロー中', value: stats?.followingCount ?? 0, icon: 'person-add-outline' as const },
    { label: '今月配信', value: monthlyUsed, icon: 'calendar-outline' as const },
  ]

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/mypage' as any)}
          style={{ padding: 4, width: 32 }}
        >
          <Ionicons name="chevron-back" size={24} color={C.accent} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>分析</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>

        {/* ── 左：フォロワー / 右：5つの正方形カード横一列 ── */}
        <View style={s.topRow}>
          <View style={s.followerCard}>
            <Ionicons name="people-outline" size={12} color={C.accent} />
            <Text style={s.followerNum}>{(stats?.followerCount ?? 0).toLocaleString()}</Text>
            <Text style={s.followerLabel}>フォロワー</Text>
          </View>
          {/* スマホのみ flexWrap で2段表示、PCは1列のまま */}
          <View style={[s.squaresRow, isMobile && s.squaresRowMobile]}>
            {subItems.map(item => (
              <View key={item.label} style={[s.squareCard, isMobile && s.squareCardMobile]}>
                <Ionicons name={item.icon} size={12} color={C.accent} />
                <Text style={s.squareNum}>{fmtShort(item.value)}</Text>
                <Text style={s.squareLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── エンゲージメント率 3リング ── */}
        {totalBroadcasts > 0 && (
          <View style={s.engagementCard}>
            <Text style={s.cardSectionLabel}>エンゲージメント率</Text>
            <View style={s.ringRow}>
              <RateRing pct={readRate} color={C.accent} label="既読率" gradId="rr1" />
              <RateRing pct={likeRate} color={C.button} label="いいね率" gradId="rr2" />
              <RateRing pct={replyRate} color="#7A9E7E" label="返信率" gradId="rr3" />
            </View>
            <Text style={s.rateNote}>既読率＝平均閲覧÷フォロワー　いいね率・返信率＝閲覧数比</Text>
          </View>
        )}

        {/* ── 今月の配信（無料プランのみ上限リング） ── */}
        {isFree && (
          <View style={s.card}>
            <View style={s.chartHead}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardSectionLabel}>今月の配信</Text>
                <Text style={s.cardSub}>無料プラン · 月{FREE_LIMIT}件まで</Text>
              </View>
              <MonthlyRing used={monthlyUsed} limit={FREE_LIMIT} color={ringColor} />
            </View>
            {monthlyNearLimit && (
              <TouchableOpacity onPress={() => router.push('/plan' as any)} style={[s.upgradeBar, { borderColor: `${ringColor}50` }]}>
                <Ionicons name="flash-outline" size={13} color={ringColor} />
                <Text style={[s.upgradeText, { color: ringColor }]}>
                  {monthlyAtLimit ? '上限到達 — アップグレードで無制限に' : `残り${FREE_LIMIT - monthlyUsed}回 — まもなく上限`}
                </Text>
                <Ionicons name="chevron-forward" size={13} color={ringColor} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── 閲覧数エリアチャート ── */}
        {chartData.length >= 2 && (
          <View style={s.card} onLayout={e => setChartW(e.nativeEvent.layout.width - 32)}>
            <View style={s.chartHead}>
              <View>
                <Text style={s.cardSectionLabel}>閲覧数の推移</Text>
                <Text style={s.cardSub}>直近 {chartData.length} 配信</Text>
              </View>
              <View style={[s.badge, { backgroundColor: `${C.accent}15`, borderColor: `${C.accent}40` }]}>
                <Text style={[s.badgeText, { color: C.accent }]}>閲覧数</Text>
              </View>
            </View>
            {chartW > 0 && <AreaChart data={readSeries} color={C.accent} width={chartW} height={120} gradId="readGrad" />}
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
                <Text style={s.cardSectionLabel}>いいね数</Text>
                <Text style={s.cardSub}>直近 {chartData.length} 配信</Text>
              </View>
              <View style={[s.badge, { backgroundColor: `${C.button}15`, borderColor: `${C.button}40` }]}>
                <Text style={[s.badgeText, { color: C.button }]}>いいね</Text>
              </View>
            </View>
            {chartW > 0 && <BarChart data={likeSeries} color={C.button} width={chartW} height={120} />}
            <View style={s.xLabels}>
              {chartData.map((b, i) => <Text key={i} style={s.xLabel}>{formatDate(b.created_at)}</Text>)}
            </View>
          </View>
        )}

        {/* ── メンバーシップ ── */}
        <View style={s.card}>
          <View style={s.chartHead}>
            <View>
              <Text style={s.cardSectionLabel}>メンバーシップ</Text>
              <Text style={s.cardSub}>メンバーシップ限定配信の実績</Text>
            </View>
            <View style={[s.badge, { backgroundColor: `${C.button}15`, borderColor: `${C.button}40` }]}>
              <Text style={[s.badgeText, { color: C.button }]}>限定配信</Text>
            </View>
          </View>
          {memberStats.totalPosts === 0 ? (
            <Text style={{ fontSize: 13, color: C.muted, textAlign: 'center', paddingVertical: 4 }}>
              メンバーシップ配信していません
            </Text>
          ) : (
            <View style={s.mbGrid}>
              <View style={s.mbCard}>
                <Ionicons name="people-outline" size={16} color={C.button} />
                <Text style={s.mbNum}>{memberStats.memberCount}</Text>
                <Text style={s.mbLabel}>会員数</Text>
              </View>
              <View style={s.mbCard}>
                <Ionicons name="lock-closed-outline" size={16} color={C.button} />
                <Text style={s.mbNum}>{memberStats.totalPosts}</Text>
                <Text style={s.mbLabel}>総投稿数</Text>
              </View>
              <View style={s.mbCard}>
                <Ionicons name="calendar-outline" size={16} color={C.button} />
                <Text style={s.mbNum}>{memberStats.monthlyPosts}</Text>
                <Text style={s.mbLabel}>月間投稿数</Text>
              </View>
              <View style={s.mbCard}>
                <Ionicons name="refresh-circle-outline" size={16} color={C.button} />
                <Text style={s.mbNum}>{memberStats.retentionRate}%</Text>
                <Text style={s.mbLabel}>継続率</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── 配信テーブル ── */}
        <View style={[s.card, { padding: 0, overflow: 'hidden' }]}>
          {/* タイトル行 */}
          <View style={{ padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={s.cardSectionLabel}>配信ごとの実績</Text>
            <Text style={[s.badgeText, { color: C.muted }]}>{filteredBroadcasts.length} / {broadcasts.length} 件</Text>
          </View>

          {/* 日時フィルター */}
          <View style={s.dateFilterRow}>
            <Ionicons name="calendar-outline" size={14} color={C.muted} />
            {Platform.OS === 'web' ? (
              // Web: input type="date" をそのまま使う（ネイティブのカレンダーピッカーが使える）
              <>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  style={{ fontSize: 12, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', backgroundColor: C.light, outline: 'none', flex: 1 } as any}
                />
                <Text style={{ fontSize: 12, color: C.muted }}>〜</Text>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  style={{ fontSize: 12, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', backgroundColor: C.light, outline: 'none', flex: 1 } as any}
                />
              </>
            ) : (
              // ネイティブ: テキスト入力（YYYY-MM-DD形式）
              <>
                <TextInput
                  style={s.dateInput}
                  value={dateFrom}
                  onChangeText={setDateFrom}
                  placeholder="2026-01-01"
                  placeholderTextColor={C.muted}
                  keyboardType="numbers-and-punctuation"
                />
                <Text style={{ fontSize: 12, color: C.muted }}>〜</Text>
                <TextInput
                  style={s.dateInput}
                  value={dateTo}
                  onChangeText={setDateTo}
                  placeholder="2026-12-31"
                  placeholderTextColor={C.muted}
                  keyboardType="numbers-and-punctuation"
                />
              </>
            )}
            {(dateFrom || dateTo) && (
              <TouchableOpacity onPress={() => { setDateFrom(''); setDateTo('') }}>
                <Ionicons name="close-circle" size={16} color={C.muted} />
              </TouchableOpacity>
            )}
          </View>

          {/* テーブルヘッダー（固定） */}
          <View style={s.thRow}>
            <Text style={[s.th, { flex: 1 }]}>内容</Text>
            <Text style={s.th}>日時</Text>
            <View style={{ width: 30, alignItems: 'flex-end' }}><Ionicons name="eye-outline" size={12} color={C.muted} /></View>
            <View style={{ width: 30, alignItems: 'flex-end' }}><Ionicons name="heart-outline" size={12} color={C.muted} /></View>
            <View style={{ width: 30, alignItems: 'flex-end' }}><Ionicons name="chatbubble-outline" size={12} color={C.muted} /></View>
            <View style={{ width: 28 }} />
          </View>

          {/* テーブルボディ（固定高さ＋スクロール） */}
          <ScrollView
            style={s.tableBody}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {filteredBroadcasts.length === 0 ? (
              <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
                <Ionicons name="radio-outline" size={32} color={C.border} />
                <Text style={{ color: C.muted, fontSize: 13 }}>
                  {broadcasts.length === 0 ? '配信がまだありません' : '該当する配信がありません'}
                </Text>
              </View>
            ) : filteredBroadcasts.map((bc, idx) => (
              <TouchableOpacity
                key={bc.id}
                style={[s.tdRow, idx % 2 !== 0 && { backgroundColor: C.light }]}
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
                <Text style={[s.td, { width: 30, color: C.accent }]}>{bc.read_count}</Text>
                <Text style={[s.td, { width: 30, color: C.button }]}>{bc.like_count}</Text>
                <Text style={[s.td, { width: 30, color: C.muted }]}>{bc.reply_count}</Text>
                <TouchableOpacity
                  style={s.menuDotBtn}
                  onPress={(e) => { e.stopPropagation?.(); setMenuBc(bc) }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="ellipsis-vertical" size={16} color={C.muted} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

      </ScrollView>

      {/* ── 配信メニュー（⋮） ── */}
      <Modal visible={!!menuBc} transparent animationType="fade" onRequestClose={() => setMenuBc(null)}>
        <Pressable style={s.menuOverlay} onPress={() => setMenuBc(null)}>
          <Pressable style={s.menuCard} onPress={() => {}}>
            <Text style={s.menuTitle} numberOfLines={1}>{truncate(menuBc?.content ?? '', 30)}</Text>
            <TouchableOpacity
              style={s.menuItem}
              onPress={() => menuBc && router.push(`/broadcast-thread/${menuBc.id}` as any)}
            >
              <Ionicons name="chatbubble-outline" size={18} color={C.text} />
              <Text style={s.menuItemText}>コメントを見る</Text>
            </TouchableOpacity>
            <View style={s.menuDivider} />
            <TouchableOpacity style={s.menuItem} onPress={() => menuBc && handleDeleteBc(menuBc)}>
              <Ionicons name="trash-outline" size={18} color={C.danger} />
              <Text style={[s.menuItemText, { color: C.danger }]}>削除</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    backgroundColor: C.header,
    paddingTop: 36, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: C.text },
  content: { padding: 14, gap: 12, paddingBottom: 48 },

  topRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  followerCard: {
    flex: 3,
    backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    padding: 12, gap: 4, alignItems: 'center', justifyContent: 'center',
  },
  followerNum: { fontSize: 28, fontWeight: '800', color: C.text, letterSpacing: -1 },
  followerLabel: { fontSize: 10, fontWeight: '600', color: C.accent },
  squaresRow: { flex: 5, flexDirection: 'row', gap: 6 },
  // スマホ: flexWrap で3+2の2段レイアウト
  squaresRowMobile: { flexWrap: 'wrap' },
  squareCard: {
    flex: 1,
    backgroundColor: C.card, borderRadius: 12,
    borderWidth: 1, borderColor: C.border,
    paddingVertical: 10, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  // スマホ: 1行に3枚（30%ずつ）→ 3+2の2段
  squareCardMobile: { flex: 0, flexBasis: '30%' },
  squareNum: { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  squareLabel: { fontSize: 8, fontWeight: '600', color: C.muted, textAlign: 'center' },
  statIconRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statLabel: { fontSize: 12, fontWeight: '600' },
  statNum: { fontSize: 30, fontWeight: '800', color: C.text, letterSpacing: -1 },

  card: {
    backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, padding: 16, gap: 12,
  },
  cardSectionLabel: { fontSize: 13, fontWeight: '700', color: C.text },
  cardSub: { fontSize: 11, color: C.muted, marginTop: 2 },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  xLabel: { fontSize: 9, color: C.muted, flex: 1, textAlign: 'center' },

  engagementCard: {
    backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 16, paddingVertical: 10, gap: 8,
  },
  ringRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start' },
  rateNote: { fontSize: 9, color: C.muted, textAlign: 'center', lineHeight: 14 },

  thRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: C.bg, gap: 8,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  th: { fontSize: 10, fontWeight: '700', color: C.muted },
  tdRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  tdText: { fontSize: 12, color: C.text },
  td: { fontSize: 12, fontWeight: '600', color: C.muted, textAlign: 'right' },

  groupBadge: {
    flexDirection: 'row', alignSelf: 'flex-start',
    backgroundColor: `${C.button}20`, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  groupBadgeText: { fontSize: 9, fontWeight: '700', color: C.button },

  upgradeBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.light, borderRadius: 8, borderWidth: 1,
    padding: 10,
  },
  upgradeText: { flex: 1, fontSize: 12, fontWeight: '600' },

  mbGrid: { flexDirection: 'row', gap: 8 },
  mbCard: {
    flex: 1, backgroundColor: C.light, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    paddingVertical: 10, paddingHorizontal: 4,
    alignItems: 'center', gap: 4,
  },
  mbNum: { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  mbLabel: { fontSize: 9, fontWeight: '600', color: C.muted, textAlign: 'center' },

  // 日時フィルター行
  dateFilterRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingBottom: 10,
  },
  dateInput: {
    flex: 1, fontSize: 12, color: C.text,
    borderWidth: 1, borderColor: C.border, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: C.light,
  },
  // テーブルボディ: 固定高さ＋スクロール（約8行分）
  tableBody: { maxHeight: 360 },

  menuDotBtn: { width: 28, alignItems: 'center', justifyContent: 'center' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 40 },
  menuCard: {
    backgroundColor: C.card, borderRadius: 14,
    paddingVertical: 8, overflow: 'hidden',
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  menuTitle: { fontSize: 11, color: C.muted, paddingHorizontal: 16, paddingVertical: 8 },
  menuDivider: { height: 1, backgroundColor: C.border, marginHorizontal: 16 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  menuItemText: { fontSize: 15, fontWeight: '600', color: C.text },
})
