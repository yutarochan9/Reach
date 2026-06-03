/**
 * admin.tsx
 *
 * 管理者専用ダッシュボード。
 * タブ：KPI / ユーザー / 報告 / 配信 / メンシプ / 振込 / お知らせ / フラグ
 */
import React, { useState, useCallback, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform, Image, FlatList,
} from 'react-native'
import ToggleSwitch from './components/ToggleSwitch'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'
import { TEST_IDS_CSV } from '../constants/testAccounts'

// ── プラットフォーム収益設定 ─────────────────────────────────
const PLAN_PRICE: Record<string, number> = { free: 0, standard: 980, pro: 1980 }
const MEMBERSHIP_FEE_RATE = 0.15

// ── カラーパレット（KPIダッシュボード用） ────────────────────
const D = {
  card:    '#FFFFFF',
  hero:    '#FFFFFF',
  border:  Colors.border,
  accent:  Colors.accent,
  warm:    Colors.button,
  brown:   Colors.accent,
  green:   '#4CAF50',
  orange:  '#E07A4A',
  purple:  '#9575CD',
  gold:    '#C9962A',
  red:     '#E05555',
  text:    Colors.text,
  sub:     '#5C3D1E',
  divider: Colors.border,
}

// ── 型定義 ────────────────────────────────────────────────────
type Tab = 'dashboard' | 'users' | 'reports' | 'memberships' | 'payouts' | 'announcements' | 'flags' | 'support'
type RankingUser = { id: string; display_name: string; username: string | null; avatar_url: string | null; count: number }
type RankPeriod = 'today' | 'month' | 'all'
type RankType = 'broadcasts' | 'followers' | 'memberships' | 'earnings' | 'likes' | 'comments' | 'reports'
type PeriodRankings = Record<RankType, RankingUser[]>

const RANK_TYPES: { key: RankType; label: string; unit: string }[] = [
  { key: 'broadcasts',  label: '配信数',        unit: '件' },
  { key: 'followers',   label: 'フォロワー増加', unit: '人' },
  { key: 'memberships', label: 'メンシプ加入',   unit: '人' },
  { key: 'earnings',    label: '収益額',         unit: '' },
  { key: 'likes',       label: 'いいね受取',     unit: '件' },
  { key: 'comments',    label: 'コメント受取',   unit: '件' },
  { key: 'reports',     label: '報告数',         unit: '件' },
]

async function loadPeriodRankings(period: RankPeriod): Promise<PeriodRankings> {
  const now = new Date()
  const since = period === 'today'
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    : period === 'month'
    ? new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    : null

  const wd = (q: any) => since ? q.gte('created_at', since) : q

  const [
    { data: bcData }, { data: followData }, { data: subsData },
    { data: earningsData }, { data: reactionsRaw }, { data: commentsRaw }, { data: reportsData },
  ] = await Promise.all([
    wd(supabase.from('broadcasts').select('sender_id, sender:profiles!broadcasts_sender_id_fkey(display_name,username,avatar_url)').eq('status','published')).limit(5000),
    wd(supabase.from('follows').select('following_id, following:profiles!follows_following_id_fkey(display_name,username,avatar_url)').not('follower_id', 'in', TEST_IDS_CSV)).limit(5000),
    wd(supabase.from('subscriptions').select('creator_id, creator:profiles!subscriptions_creator_id_fkey(display_name,username,avatar_url)').eq('status','active').not('subscriber_id', 'in', TEST_IDS_CSV)).limit(5000),
    wd(supabase.from('creator_earnings').select('creator_id, creator_amount, creator:profiles!creator_earnings_creator_id_fkey(display_name,username,avatar_url)')).limit(5000),
    wd(supabase.from('reactions').select('broadcast_id')).limit(5000),
    wd(supabase.from('messages').select('broadcast_id').not('broadcast_id','is',null)).limit(5000),
    wd(supabase.from('reports').select('reported_user_id, reported_user:profiles!reports_reported_user_id_fkey(display_name,username,avatar_url)').not('reported_user_id','is',null)).limit(2000),
  ])

  // reactions・comments は broadcast の sender を特定するため追加クエリ
  const bcIds = [...new Set([
    ...(reactionsRaw ?? []).map((r: any) => r.broadcast_id),
    ...(commentsRaw  ?? []).map((m: any) => m.broadcast_id),
  ].filter(Boolean))]
  const senderMap = new Map<string, { sender_id: string; display_name: string; username: string | null; avatar_url: string | null }>()
  if (bcIds.length > 0) {
    const { data: bcs } = await supabase.from('broadcasts')
      .select('id, sender_id, sender:profiles!broadcasts_sender_id_fkey(display_name,username,avatar_url)')
      .in('id', bcIds.slice(0, 1000))
    for (const b of (bcs ?? []) as any[]) senderMap.set(b.id, { sender_id: b.sender_id, ...b.sender })
  }

  const top10 = (m: Map<string, RankingUser>) => [...m.values()].sort((a, b) => b.count - a.count).slice(0, 10)

  const bcMap = new Map<string, RankingUser>()
  for (const b of (bcData ?? []) as any[]) {
    if (!b.sender) continue
    if (!bcMap.has(b.sender_id)) bcMap.set(b.sender_id, { id: b.sender_id, ...b.sender, count: 0 })
    bcMap.get(b.sender_id)!.count++
  }
  const followMap = new Map<string, RankingUser>()
  for (const f of (followData ?? []) as any[]) {
    if (!f.following) continue
    if (!followMap.has(f.following_id)) followMap.set(f.following_id, { id: f.following_id, ...f.following, count: 0 })
    followMap.get(f.following_id)!.count++
  }
  const mbMap = new Map<string, RankingUser>()
  for (const s of (subsData ?? []) as any[]) {
    if (!s.creator) continue
    if (!mbMap.has(s.creator_id)) mbMap.set(s.creator_id, { id: s.creator_id, ...s.creator, count: 0 })
    mbMap.get(s.creator_id)!.count++
  }
  const earningsMap = new Map<string, RankingUser>()
  for (const e of (earningsData ?? []) as any[]) {
    if (!e.creator) continue
    if (!earningsMap.has(e.creator_id)) earningsMap.set(e.creator_id, { id: e.creator_id, ...e.creator, count: 0 })
    earningsMap.get(e.creator_id)!.count += e.creator_amount
  }
  const likesMap = new Map<string, RankingUser>()
  for (const r of (reactionsRaw ?? []) as any[]) {
    const bc = senderMap.get(r.broadcast_id); if (!bc) continue
    if (!likesMap.has(bc.sender_id)) likesMap.set(bc.sender_id, { id: bc.sender_id, display_name: bc.display_name, username: bc.username, avatar_url: bc.avatar_url, count: 0 })
    likesMap.get(bc.sender_id)!.count++
  }
  const commentsMap = new Map<string, RankingUser>()
  for (const m of (commentsRaw ?? []) as any[]) {
    const bc = senderMap.get(m.broadcast_id); if (!bc) continue
    if (!commentsMap.has(bc.sender_id)) commentsMap.set(bc.sender_id, { id: bc.sender_id, display_name: bc.display_name, username: bc.username, avatar_url: bc.avatar_url, count: 0 })
    commentsMap.get(bc.sender_id)!.count++
  }
  const reportsMap = new Map<string, RankingUser>()
  for (const r of (reportsData ?? []) as any[]) {
    if (!r.reported_user) continue
    if (!reportsMap.has(r.reported_user_id)) reportsMap.set(r.reported_user_id, { id: r.reported_user_id, ...r.reported_user, count: 0 })
    reportsMap.get(r.reported_user_id)!.count++
  }

  const top100 = (m: Map<string, RankingUser>) => [...m.values()].sort((a, b) => b.count - a.count).slice(0, 100)
  return {
    broadcasts: top100(bcMap), followers: top100(followMap), memberships: top100(mbMap),
    earnings: top100(earningsMap), likes: top100(likesMap), comments: top100(commentsMap), reports: top100(reportsMap),
  }
}
type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed'

const STATUS_LABEL: Record<ReportStatus, string> = { pending: '未対応', reviewed: '確認済', resolved: '対応済', dismissed: '却下' }
const STATUS_COLOR: Record<ReportStatus, string> = { pending: '#D97706', reviewed: '#2563EB', resolved: '#16a34a', dismissed: Colors.textLight }

type KPI = {
  totalUsers: number; newToday: number; newThisWeek: number; totalCreators: number
  freeUsers: number; standardUsers: number; proUsers: number
  totalBroadcasts: number; totalMessages: number
  todayBroadcasts: number; todayDMs: number; todayComments: number; todayLikes: number
  totalSubscriptions: number; newSubsToday: number; newSubsThisWeek: number
  totalMembershipFees: number; planRevenue: number; membershipCommission: number; totalRevenue: number
  supportTotal: number; supportCount: number
}
type DailyRow = { date: string; newUsers: number; broadcasts: number; dms: number; comments: number }

type UserRow = {
  id: string; display_name: string; username: string
  avatar_url: string | null; plan: string; is_admin: boolean; is_banned: boolean; created_at: string
}
type Report = {
  id: string; reporter_id: string; reported_user_id: string | null
  reason: string; details: string | null; status: ReportStatus
  admin_note: string | null; created_at: string
  reporter: { display_name: string; username: string } | null
  reported_user: { display_name: string; username: string } | null
  reported_broadcast: { id: string; content: string } | null
}
type BroadcastRow = {
  id: string; content: string; created_at: string
  is_subscriber_only: boolean; target: string
  sender: { display_name: string; username: string } | null
}
type MembershipRow = {
  id: string; status: string; created_at: string
  creator: { id: string; display_name: string; username: string; membership_price: number | null } | null
  subscriber: { id: string; display_name: string; username: string } | null
}
type PayoutRow = {
  creator_id: string; creator_name: string
  pending_amount: number; paid_amount: number
  pending_count: number; has_stripe: boolean; last_payout_date: string | null
}
type AnnTag = 'お知らせ' | '新機能' | 'アップデート'
type Announcement = { id: string; title: string; body: string; tag: AnnTag; created_at: string }
type FeatureFlag  = { id: string; key: string; enabled: boolean; description: string | null }
type ContactMessage = {
  id: string; user_id: string | null; category: string; body: string
  status: string; admin_note: string | null; created_at: string
  user?: { display_name: string; username: string } | null
}
const CONTACT_CAT: Record<string, string> = {
  bug: '不具合', feature: '機能要望', account: 'アカウント', billing: '課金', other: 'その他'
}
const CONTACT_STATUS_LABEL: Record<string, string> = { pending: '未対応', resolved: '対応済' }
const CONTACT_STATUS_COLOR: Record<string, string> = { pending: '#D97706', resolved: '#16a34a' }

// ── SVG エイリアス（TypeScript型チェック回避） ───────────────
const SvgEl    = 'svg'             as any
const CircleEl = 'circle'          as any
const PolyEl   = 'polyline'        as any
const PolyFill = 'polygon'         as any
const DefsEl   = 'defs'            as any
const LgEl     = 'linearGradient'  as any
const StopEl   = 'stop'            as any

// ── ドーナツチャート（Web・SVG） ─────────────────────────────
function DonutChart({ segments, size = 130, sw = 18, centerLabel }: {
  segments: { value: number; color: string }[]
  size?: number; sw?: number; centerLabel?: string
}) {
  if (Platform.OS !== 'web') return null
  const total = segments.reduce((s, d) => s + d.value, 0) || 1
  const r = (size - sw) / 2
  const cx = size / 2; const cy = size / 2
  const circ = 2 * Math.PI * r
  let offset = 0
  const arcs = segments.map(seg => {
    const dash = (seg.value / total) * circ
    const arc = { color: seg.color, dash, offset }
    offset += dash
    return arc
  })
  return (
    <View style={{ width: size, height: size }}>
      <SvgEl width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
        <CircleEl cx={cx} cy={cy} r={r} fill="none" stroke={Colors.border} strokeWidth={sw} />
        {arcs.map((arc, i) => (
          <CircleEl key={i} cx={cx} cy={cy} r={r} fill="none" stroke={arc.color} strokeWidth={sw}
            strokeDasharray={`${arc.dash} ${circ - arc.dash}`} strokeDashoffset={-arc.offset} />
        ))}
      </SvgEl>
      {centerLabel !== undefined && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: D.text, fontSize: 15, fontWeight: '800' }}>{centerLabel}</Text>
        </View>
      )}
    </View>
  )
}

// ── ラインチャート（Web・SVG） ───────────────────────────────
function MiniLineChart({ datasets, height = 72, chartWidth = 300 }: {
  datasets: { data: number[]; color: string; label: string }[]
  height?: number; chartWidth?: number
}) {
  if (Platform.OS !== 'web' || !datasets[0]?.data.length) return null
  const n = datasets[0].data.length
  const allVals = datasets.flatMap(d => d.data)
  const maxVal = Math.max(...allVals, 1)
  const padT = 6; const padB = 4; const innerH = height - padT - padB
  const toPath = (data: number[]) =>
    data.map((v, i) => {
      const x = n > 1 ? (i / (n - 1)) * chartWidth : chartWidth / 2
      const y = padT + innerH - (v / maxVal) * innerH
      return `${x},${y}`
    }).join(' ')
  const gid = (color: string) => `lg${color.replace('#', '')}`
  return (
    <SvgEl width="100%" height={height} viewBox={`0 0 ${chartWidth} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <DefsEl>
        {datasets.map(ds => (
          <LgEl key={ds.color} id={gid(ds.color)} x1="0" y1="0" x2="0" y2="1">
            <StopEl offset="0%" stopColor={ds.color} stopOpacity="0.25" />
            <StopEl offset="100%" stopColor={ds.color} stopOpacity="0" />
          </LgEl>
        ))}
      </DefsEl>
      {datasets.map(ds => {
        const pts = toPath(ds.data)
        const area = `0,${height} ${pts} ${chartWidth},${height}`
        return (
          <React.Fragment key={ds.color}>
            <PolyFill points={area} fill={`url(#${gid(ds.color)})`} />
            <PolyEl points={pts} fill="none" stroke={ds.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </React.Fragment>
        )
      })}
      {datasets.map(ds => {
        const last = ds.data[ds.data.length - 1]
        const x = chartWidth
        const y = padT + innerH - (last / maxVal) * innerH
        return <CircleEl key={ds.color + '_dot'} cx={x} cy={y} r="3.5" fill={ds.color} stroke={Colors.background} strokeWidth="1.5" />
      })}
    </SvgEl>
  )
}

// ── 凡例アイテム ─────────────────────────────────────────────
function LegendItem({ color, label, value, pct }: { color: string; label: string; value: number; pct: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ flex: 1, color: D.sub, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: D.text, fontSize: 12, fontWeight: '700', width: 36, textAlign: 'right' }}>{value}</Text>
      <Text style={{ color: D.sub, fontSize: 11, width: 38, textAlign: 'right' }}>{pct.toFixed(0)}%</Text>
    </View>
  )
}

// ── DarkCard（KPIグリッドカード） ────────────────────────────
const dkCardStyle = {
  card:    { flex: 1, minWidth: '45%' as any, backgroundColor: D.card, borderWidth: 1, borderColor: D.border, borderRadius: 14, padding: 14, gap: 4 },
  iconWrap:{ width: 34, height: 34, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  value:   { fontSize: 24, fontWeight: '800' as const },
  label:   { fontSize: 11, color: D.sub, fontWeight: '600' as const },
  sub:     { fontSize: 10, color: D.sub },
}
function DarkCard({ label, value, icon, color, sub }: { label: string; value: string | number; icon: any; color: string; sub?: string }) {
  return (
    <View style={dkCardStyle.card}>
      <View style={[dkCardStyle.iconWrap, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <Text style={[dkCardStyle.value, { color }]}>{typeof value === 'number' ? value.toLocaleString() : value}</Text>
      <Text style={dkCardStyle.label}>{label}</Text>
      {sub ? <Text style={dkCardStyle.sub}>{sub}</Text> : null}
    </View>
  )
}

// ── メインコンポーネント ─────────────────────────────────────
export default function AdminScreen() {
  const [tab, setTab]       = useState<Tab>('dashboard')
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  const [kpi, setKpi]             = useState<KPI | null>(null)
  const [dailyTrend, setDailyTrend] = useState<DailyRow[]>([])

  const [users, setUsers]           = useState<UserRow[]>([])
  const [userSearch, setUserSearch] = useState('')

  const [reports, setReports]               = useState<Report[]>([])
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [adminNote, setAdminNote]           = useState('')
  const [savingNote, setSavingNote]         = useState(false)

  const [userView, setUserView]             = useState<'ranking' | 'list'>('ranking')
  const [rankPeriod, setRankPeriod]         = useState<RankPeriod>('today')
  const [periodRankings, setPeriodRankings] = useState<Record<string, PeriodRankings>>({})
  const [rankLoading, setRankLoading]       = useState(false)
  const [expandedTypes, setExpandedTypes]   = useState<Set<string>>(new Set())

  const [memberships, setMemberships] = useState<MembershipRow[]>([])
  const [mbSearch, setMbSearch]       = useState('')

  const [payouts, setPayouts]             = useState<PayoutRow[]>([])
  const [payoutLoading, setPayoutLoading] = useState(false)

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [annTag, setAnnTag]               = useState<AnnTag>('お知らせ')
  const [annTitle, setAnnTitle]           = useState('')
  const [annBody, setAnnBody]             = useState('')
  const [savingAnn, setSavingAnn]         = useState(false)

  const [flags, setFlags]       = useState<FeatureFlag[]>([])
  const [freePeriod, setFreePeriod] = useState(true)

  const [contactMessages, setContactMessages]   = useState<ContactMessage[]>([])
  const [selectedContact, setSelectedContact]   = useState<ContactMessage | null>(null)
  const [contactNote, setContactNote]           = useState('')
  const [savingContact, setSavingContact]       = useState(false)

  const [cancelReasonBreakdown, setCancelReasonBreakdown] = useState<Record<string, number>>({})
  const [deletingContent, setDeletingContent]   = useState(false)
  const [notifBody, setNotifBody]               = useState('')
  const [sendingNotif, setSendingNotif]         = useState(false)

  // ── データ読み込み ────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/(tabs)' as any); return }

    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) { setIsAdmin(false); setLoading(false); return }
    setIsAdmin(true)

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const weekStart  = new Date(now.getTime() - 7 * 86400000).toISOString()

    const [
      { count: totalUsers },
      { count: newToday },
      { count: newThisWeek },
      { count: totalBroadcasts },
      { count: totalMessages },
      { count: todayBroadcasts },
      { count: todayDMs },
      { count: todayComments },
      { count: todayLikes },
      { count: totalSubscriptions },
      { count: newSubsToday },
      { count: newSubsThisWeek },
      { data: usersData },
      { data: reportsData },
      { data: annData },
      { data: flagsData },
      { data: weekProfiles },
      { data: weekBroadcasts },
      { data: weekMessages },
      { data: activeSubs },
      { data: supportData },
    ] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).neq('is_test', true),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).neq('is_test', true).gte('created_at', todayStart),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).neq('is_test', true).gte('created_at', weekStart),
      supabase.from('broadcasts').select('id', { count: 'exact', head: true }),
      supabase.from('messages').select('id', { count: 'exact', head: true }),
      supabase.from('broadcasts').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', todayStart).is('broadcast_id', null),
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', todayStart).not('broadcast_id', 'is', null),
      supabase.from('message_likes').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active').not('subscriber_id', 'in', TEST_IDS_CSV),
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active').gte('created_at', todayStart).not('subscriber_id', 'in', TEST_IDS_CSV),
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active').gte('created_at', weekStart).not('subscriber_id', 'in', TEST_IDS_CSV),
      supabase.from('profiles').select('id, display_name, username, avatar_url, plan, is_admin, is_banned, created_at').neq('is_test', true).order('created_at', { ascending: false }).limit(200),
      supabase.from('reports').select(`id, reporter_id, reported_user_id, reason, details, status, admin_note, created_at,
        reporter:profiles!reports_reporter_id_fkey(display_name, username),
        reported_user:profiles!reports_reported_user_id_fkey(display_name, username),
        reported_broadcast:broadcasts!reports_reported_broadcast_id_fkey(id, content)`).order('created_at', { ascending: false }),
      supabase.from('announcements').select('id, title, body, tag, created_at').order('created_at', { ascending: false }),
      supabase.from('feature_flags').select('id, key, enabled, description').order('key'),
      supabase.from('profiles').select('created_at').gte('created_at', weekStart),
      supabase.from('broadcasts').select('created_at').gte('created_at', weekStart),
      supabase.from('messages').select('created_at, broadcast_id').gte('created_at', weekStart),
      supabase.from('subscriptions').select('creator:profiles!subscriptions_creator_id_fkey(membership_price)').eq('status', 'active').not('subscriber_id', 'in', TEST_IDS_CSV),
      supabase.from('support_payments').select('amount'),
    ])

    const { data: creatorIds } = await supabase.from('broadcasts').select('sender_id').limit(10000)
    const uniqueCreators = new Set((creatorIds ?? []).map((b: any) => b.sender_id)).size

    const allUsers = (usersData as UserRow[]) ?? []
    const nonAdminUsers = allUsers.filter(u => !u.is_admin)
    const standardUsers = nonAdminUsers.filter(u => u.plan === 'standard').length
    const proUsers      = nonAdminUsers.filter(u => u.plan === 'pro').length
    const freeUsers     = allUsers.filter(u => u.is_admin || !u.plan || u.plan === 'free').length

    const fpFlag2 = ((flagsData as FeatureFlag[]) ?? []).find(f => f.key === 'free_period')
    const isFree  = fpFlag2 ? fpFlag2.enabled : true
    const planRevenue = isFree ? 0 : standardUsers * PLAN_PRICE.standard + proUsers * PLAN_PRICE.pro
    const totalMembershipFees = isFree ? 0 : (activeSubs ?? []).reduce((sum: number, s: any) =>
      sum + (Number(s.creator?.membership_price) || 0), 0)
    const membershipCommission = isFree ? 0 : Math.round(totalMembershipFees * MEMBERSHIP_FEE_RATE)
    const totalRevenue = planRevenue + membershipCommission

    const supportList = (supportData ?? []) as { amount: number }[]
    const supportTotal = supportList.reduce((s, p) => s + p.amount, 0)
    const supportCount = supportList.length

    setKpi({
      totalUsers: totalUsers ?? 0, newToday: newToday ?? 0, newThisWeek: newThisWeek ?? 0,
      totalCreators: uniqueCreators, freeUsers, standardUsers, proUsers,
      totalBroadcasts: totalBroadcasts ?? 0, totalMessages: totalMessages ?? 0,
      todayBroadcasts: todayBroadcasts ?? 0, todayDMs: todayDMs ?? 0,
      todayComments: todayComments ?? 0, todayLikes: todayLikes ?? 0,
      totalSubscriptions: totalSubscriptions ?? 0, newSubsToday: newSubsToday ?? 0, newSubsThisWeek: newSubsThisWeek ?? 0,
      totalMembershipFees, planRevenue, membershipCommission, totalRevenue, supportTotal, supportCount,
    })

    // 過去7日間トレンド
    const trend: DailyRow[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
      const dEnd   = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString()
      trend.push({
        date: i === 0 ? '今日' : `${d.getMonth() + 1}/${d.getDate()}`,
        newUsers:   (weekProfiles ?? []).filter((p: any) => p.created_at >= dStart && p.created_at < dEnd).length,
        broadcasts: (weekBroadcasts ?? []).filter((b: any) => b.created_at >= dStart && b.created_at < dEnd).length,
        dms:        (weekMessages ?? []).filter((m: any) => m.created_at >= dStart && m.created_at < dEnd && !m.broadcast_id).length,
        comments:   (weekMessages ?? []).filter((m: any) => m.created_at >= dStart && m.created_at < dEnd && !!m.broadcast_id).length,
      })
    }
    setDailyTrend(trend)
    setUsers(allUsers)
    setReports((reportsData as any[]) ?? [])
    setAnnouncements((annData as Announcement[]) ?? [])
    const allFlags = (flagsData as FeatureFlag[]) ?? []
    setFlags(allFlags)
    setFreePeriod(allFlags.find(f => f.key === 'free_period')?.enabled ?? true)

    // メンバーシップ
    const { data: mbData } = await supabase.from('subscriptions')
      .select(`id, status, created_at,
        creator:profiles!subscriptions_creator_id_fkey(id, display_name, username, membership_price),
        subscriber:profiles!subscriptions_subscriber_id_fkey(id, display_name, username)`)
      .order('created_at', { ascending: false }).limit(300)
    setMemberships((mbData as any as MembershipRow[]) ?? [])

    // 振込管理
    const { data: earningsData } = await supabase.from('creator_earnings')
      .select(`creator_id, creator_amount, payout_status, payout_date,
        creator:profiles!creator_earnings_creator_id_fkey(display_name, stripe_connect_account_id)`)
      .order('created_at', { ascending: false })
    const pMap = new Map<string, PayoutRow>()
    for (const e of (earningsData ?? []) as any[]) {
      const id = e.creator_id
      if (!pMap.has(id)) pMap.set(id, {
        creator_id: id, creator_name: e.creator?.display_name ?? '不明',
        pending_amount: 0, paid_amount: 0, pending_count: 0,
        has_stripe: !!e.creator?.stripe_connect_account_id, last_payout_date: null,
      })
      const row = pMap.get(id)!
      if (e.payout_status === 'pending') { row.pending_amount += e.creator_amount; row.pending_count++ }
      else if (e.payout_status === 'paid') {
        row.paid_amount += e.creator_amount
        if (!row.last_payout_date || e.payout_date > row.last_payout_date) row.last_payout_date = e.payout_date
      }
    }
    setPayouts([...pMap.values()].sort((a, b) => b.pending_amount - a.pending_amount))

    // 解約理由の集計
    const { data: cancelData } = await supabase
      .from('subscriptions').select('cancel_reason').not('cancel_reason', 'is', null)
    const breakdown: Record<string, number> = {}
    ;(cancelData ?? []).forEach((s: any) => {
      const r = s.cancel_reason ?? 'その他'
      breakdown[r] = (breakdown[r] ?? 0) + 1
    })
    setCancelReasonBreakdown(breakdown)

    // お問い合わせ一覧
    const { data: contactData } = await supabase
      .from('contact_messages')
      .select(`id, user_id, category, body, status, admin_note, created_at,
        user:profiles!contact_messages_user_id_fkey(display_name, username)`)
      .order('created_at', { ascending: false })
      .limit(200)
    setContactMessages((contactData as any as ContactMessage[]) ?? [])

    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // ランキング: ユーザータブ内のランキングビューで期間が変わったときにロード
  React.useEffect(() => {
    if (tab !== 'users' || userView !== 'ranking' || !isAdmin) return
    if (periodRankings[rankPeriod]) return  // キャッシュ済み
    setRankLoading(true)
    loadPeriodRankings(rankPeriod)
      .then(r => { setPeriodRankings(prev => ({ ...prev, [rankPeriod]: r })); setRankLoading(false) })
      .catch(() => setRankLoading(false))
  }, [tab, userView, rankPeriod, isAdmin, periodRankings])

  // ── ハンドラー ────────────────────────────────────────────
  const handleUpdateStatus = async (report: Report, status: ReportStatus) => {
    setSavingNote(true)
    await supabase.from('reports').update({ status, admin_note: adminNote.trim() || null }).eq('id', report.id)
    setSavingNote(false); setSelectedReport(null); load()
  }

  const toggleBan = (u: UserRow) => {
    const next = !u.is_banned
    const msg = next ? `「${u.display_name}」をBANしますか？` : `「${u.display_name}」のBANを解除しますか？`
    const doBan = async () => {
      await supabase.from('profiles').update({ is_banned: next }).eq('id', u.id)
      setUsers(prev => prev.map(r => r.id === u.id ? { ...r, is_banned: next } : r))
    }
    if (Platform.OS === 'web') { if (window.confirm(msg)) doBan() }
    else Alert.alert(next ? 'BAN' : 'BAN解除', msg, [
      { text: 'キャンセル', style: 'cancel' },
      { text: next ? 'BANする' : '解除する', style: 'destructive', onPress: doBan },
    ])
  }

  const sendAnnouncement = async () => {
    if (!annTitle.trim() || !annBody.trim()) return
    setSavingAnn(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      // 管理者履歴用に announcements テーブルへ保存（tag付き）
      await supabase.from('announcements').insert({ title: annTitle.trim(), body: annBody.trim(), tag: annTag, created_by: user?.id })
      // 全ユーザーのベル通知へ一斉送信
      const { data: allUsers } = await supabase.from('profiles').select('id').eq('is_banned', false)
      const notifs = (allUsers ?? []).map((u: any) => ({
        user_id: u.id, type: 'announcement', actor_id: null,
        metadata: { title: annTitle.trim(), body: annBody.trim() },
      }))
      // 500件ずつバッチインサート
      for (let i = 0; i < notifs.length; i += 500) {
        await supabase.from('notifications').insert(notifs.slice(i, i + 500))
      }
      if (Platform.OS === 'web') window.alert(`${notifs.length}人に通知を送信しました`)
      else Alert.alert('送信完了', `${notifs.length}人に通知を送信しました`)
      setAnnTitle(''); setAnnBody('')
      load()
    } catch (e: any) {
      Alert.alert('エラー', e.message)
    } finally {
      setSavingAnn(false)
    }
  }

  const deleteAnnouncement = async (id: string) => {
    if (Platform.OS === 'web' && !window.confirm('このお知らせを削除しますか？')) return
    await supabase.from('announcements').delete().eq('id', id)
    setAnnouncements(prev => prev.filter(a => a.id !== id))
  }

  const toggleFlag = async (flag: FeatureFlag) => {
    const next = !flag.enabled
    setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, enabled: next } : f))
    await supabase.from('feature_flags').update({ enabled: next }).eq('id', flag.id)
  }

  const handleResolveContact = async (c: ContactMessage, status: string) => {
    setSavingContact(true)
    await supabase.from('contact_messages').update({ status, admin_note: contactNote.trim() || null }).eq('id', c.id)
    setSavingContact(false)
    setSelectedContact(null)
    setContactNote('')
    setNotifBody('')
    load()
  }

  // 報告された配信を管理者が削除する
  const handleDeleteBroadcast = async () => {
    if (!selectedReport?.reported_broadcast?.id) return
    if (Platform.OS === 'web') {
      if (!window.confirm('この配信を削除しますか？この操作は取り消せません。')) return
      doDeleteBroadcast()
    } else {
      Alert.alert('配信を削除', 'この配信を削除しますか？この操作は取り消せません。', [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除する', style: 'destructive', onPress: doDeleteBroadcast },
      ])
    }
  }

  const doDeleteBroadcast = async () => {
    if (!selectedReport?.reported_broadcast?.id) return
    setDeletingContent(true)
    await supabase.from('broadcasts').update({ status: 'deleted' }).eq('id', selectedReport.reported_broadcast.id)
    await supabase.from('reports').update({ status: 'resolved', admin_note: adminNote.trim() || '配信を削除しました' }).eq('id', selectedReport.id)
    setDeletingContent(false)
    setSelectedReport(null)
    load()
  }

  // お問い合わせユーザーへ個別通知を送る
  const handleSendNotifToUser = async () => {
    if (!selectedContact?.user_id || !notifBody.trim()) return
    setSendingNotif(true)
    await supabase.from('notifications').insert({
      user_id: selectedContact.user_id,
      type: 'announcement',
      actor_id: null,
      metadata: { title: 'Reachからのお知らせ', body: notifBody.trim() },
    })
    setNotifBody('')
    setSendingNotif(false)
    if (Platform.OS === 'web') window.alert('ユーザーに通知を送りました')
    else Alert.alert('送信完了', 'ユーザーに通知を送りました')
  }

  const addFlag = async () => {
    const key = Platform.OS === 'web' ? window.prompt('フラグのキー（英数字・アンダースコア）') : ''
    if (!key) return
    const desc = Platform.OS === 'web' ? window.prompt('説明（任意）') ?? '' : ''
    const { error } = await supabase.from('feature_flags').insert({ key, description: desc || null })
    if (error) Alert.alert('エラー', error.message); else load()
  }

  const triggerPayout = async () => {
    if (Platform.OS === 'web' && !window.confirm('今すぐ全クリエイターへ振込処理を実行しますか？')) return
    setPayoutLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/stripe-payout`,
        { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` } }
      )
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      if (Platform.OS === 'web') window.alert(`完了！ ${json.results?.length ?? 0}件処理しました`)
      load()
    } catch (e: any) {
      Alert.alert('エラー', e.message)
    } finally {
      setPayoutLoading(false)
    }
  }

  // ── ローディング / 権限なし ───────────────────────────────
  if (isAdmin === null || loading) {
    return <View style={[st.container, st.center]}><ActivityIndicator color={Colors.accent} /></View>
  }
  if (!isAdmin) {
    return (
      <View style={[st.container, st.center, { gap: 16 }]}>
        <Ionicons name="lock-closed-outline" size={40} color={Colors.textLight} />
        <Text style={{ color: Colors.textLight }}>アクセスできません</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={{ color: Colors.accent }}>戻る</Text></TouchableOpacity>
      </View>
    )
  }

  // ── お問い合わせ詳細 ─────────────────────────────────────
  if (selectedContact) {
    return (
      <View style={st.container}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => { setSelectedContact(null); setContactNote('') }} style={st.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={st.headerTitle}>お問い合わせ詳細</Text>
          <View style={{ width: 32 }} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={st.card}>
            <InfoRow label="カテゴリ"     value={CONTACT_CAT[selectedContact.category] ?? selectedContact.category} />
            {selectedContact.user && (
              <InfoRow label="送信者" value={`${selectedContact.user.display_name} @${selectedContact.user.username}`} />
            )}
            <InfoRow label="ステータス"
              value={CONTACT_STATUS_LABEL[selectedContact.status] ?? selectedContact.status}
              valueColor={CONTACT_STATUS_COLOR[selectedContact.status]} />
            <InfoRow label="日時" value={new Date(selectedContact.created_at).toLocaleString('ja-JP')} last />
          </View>
          <Text style={st.sectionLabel}>内容</Text>
          <View style={[st.card, { gap: 0 }]}>
            <Text style={{ fontSize: 14, color: Colors.text, lineHeight: 22, padding: 4 }}>{selectedContact.body}</Text>
          </View>
          <Text style={st.sectionLabel}>管理者メモ</Text>
          <TextInput
            style={st.textarea}
            placeholder="返答メモ・対応内容（任意）"
            placeholderTextColor={Colors.textLight}
            value={contactNote} onChangeText={setContactNote} multiline
          />
          {selectedContact.status === 'pending' && (
            <>
              <Text style={st.sectionLabel}>ステータス変更</Text>
              <TouchableOpacity
                style={[st.statusBtn, { borderColor: CONTACT_STATUS_COLOR.resolved }, savingContact && { opacity: 0.4 }]}
                onPress={() => handleResolveContact(selectedContact, 'resolved')}
                disabled={savingContact}
              >
                <Text style={[st.statusBtnText, { color: CONTACT_STATUS_COLOR.resolved }]}>
                  {savingContact ? '保存中...' : '対応済みにする'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* ユーザーへの個別通知 */}
          {selectedContact.user_id && (
            <>
              <Text style={st.sectionLabel}>ユーザーへの個別通知</Text>
              <TextInput
                style={st.textarea}
                placeholder="通知メッセージを入力..."
                placeholderTextColor={Colors.textLight}
                value={notifBody} onChangeText={setNotifBody} multiline
              />
              <TouchableOpacity
                style={[st.primaryBtn, (!notifBody.trim() || sendingNotif) && { opacity: 0.4 }]}
                onPress={handleSendNotifToUser}
                disabled={!notifBody.trim() || sendingNotif}
              >
                <Ionicons name="notifications-outline" size={16} color={Colors.white} />
                <Text style={st.primaryBtnText}>{sendingNotif ? '送信中...' : 'ユーザーに通知を送る'}</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    )
  }

  // ── 報告詳細 ─────────────────────────────────────────────
  if (selectedReport) {
    return (
      <View style={st.container}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => setSelectedReport(null)} style={st.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={st.headerTitle}>報告詳細</Text>
          <View style={{ width: 32 }} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={st.card}>
            <InfoRow label="報告者"   value={`${selectedReport.reporter?.display_name} @${selectedReport.reporter?.username}`} />
            {selectedReport.reported_user && <InfoRow label="対象者" value={`${selectedReport.reported_user.display_name} @${selectedReport.reported_user.username}`} />}
            {selectedReport.reported_broadcast && <InfoRow label="対象投稿" value={selectedReport.reported_broadcast.content.slice(0, 80)} />}
            <InfoRow label="理由" value={selectedReport.reason} />
            {selectedReport.details && <InfoRow label="詳細" value={selectedReport.details} />}
            <InfoRow label="ステータス" value={STATUS_LABEL[selectedReport.status]} valueColor={STATUS_COLOR[selectedReport.status]} />
            <InfoRow label="日時" value={new Date(selectedReport.created_at).toLocaleString('ja-JP')} last />
          </View>
          <Text style={st.sectionLabel}>管理者メモ</Text>
          <TextInput
            style={st.textarea}
            placeholder="対応内容・メモ（任意）"
            placeholderTextColor={Colors.textLight}
            value={adminNote} onChangeText={setAdminNote} multiline
          />
          <Text style={st.sectionLabel}>ステータスを変更</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['reviewed', 'resolved', 'dismissed'] as ReportStatus[]).map(s => (
              <TouchableOpacity key={s}
                style={[st.statusBtn, { borderColor: STATUS_COLOR[s] }, savingNote && { opacity: 0.4 }]}
                onPress={() => handleUpdateStatus(selectedReport, s)} disabled={savingNote}
              >
                <Text style={[st.statusBtnText, { color: STATUS_COLOR[s] }]}>
                  {savingNote ? '保存中...' : STATUS_LABEL[s]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 配信削除クイックアクション */}
          {selectedReport.reported_broadcast?.id && (
            <>
              <Text style={st.sectionLabel}>クイックアクション</Text>
              <TouchableOpacity
                style={[st.statusBtn, { borderColor: '#E53E3E', flex: 0, paddingVertical: 12 }, deletingContent && { opacity: 0.4 }]}
                onPress={handleDeleteBroadcast}
                disabled={deletingContent}
              >
                <Text style={[st.statusBtnText, { color: '#E53E3E', textAlign: 'center' }]}>
                  {deletingContent ? '削除中...' : '報告された配信を削除する'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    )
  }

  // ── タブ定義 ─────────────────────────────────────────────
  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'dashboard',    label: 'KPI' },
    { key: 'users',        label: 'ユーザー' },
    { key: 'reports',      label: '報告', badge: reports.filter(r => r.status === 'pending').length },
    { key: 'memberships',  label: 'メンシプ' },
    { key: 'payouts',      label: '振込', badge: payouts.filter(p => p.pending_amount > 0).length },
    { key: 'announcements',label: 'お知らせ' },
    { key: 'flags',        label: 'フラグ' },
    { key: 'support',      label: 'お問い合わせ', badge: contactMessages.filter(m => m.status === 'pending').length },
  ]

  // KPI計算
  const totalPlanUsers = (kpi?.totalUsers ?? 0) || 1
  const planDonut = [
    { value: kpi?.freeUsers ?? 0,     color: Colors.border },
    { value: kpi?.standardUsers ?? 0, color: Colors.accent },
    { value: kpi?.proUsers ?? 0,      color: D.gold },
  ]
  const trendDatasets = [
    { data: dailyTrend.map(r => r.broadcasts), color: D.accent,  label: '配信' },
    { data: dailyTrend.map(r => r.dms),        color: D.orange,  label: 'DM' },
    { data: dailyTrend.map(r => r.comments),   color: D.purple,  label: 'コメント' },
  ]
  const trendMax = {
    users: Math.max(1, ...dailyTrend.map(r => r.newUsers)),
    bc:    Math.max(1, ...dailyTrend.map(r => r.broadcasts)),
    dms:   Math.max(1, ...dailyTrend.map(r => r.dms)),
    comm:  Math.max(1, ...dailyTrend.map(r => r.comments)),
  }

  const filteredUsers = users.filter(u =>
    u.display_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.username?.toLowerCase().includes(userSearch.toLowerCase())
  )
  const filteredMb = memberships.filter(m => {
    const q = mbSearch.toLowerCase()
    return !q ||
      m.creator?.display_name?.toLowerCase().includes(q) ||
      m.creator?.username?.toLowerCase().includes(q) ||
      m.subscriber?.display_name?.toLowerCase().includes(q) ||
      m.subscriber?.username?.toLowerCase().includes(q)
  })

  const paneStyle     = { flex: 1 } as const
  const viewPaneStyle = { flex: 1 } as const

  return (
    <View style={st.container}>
      {/* ヘッダー */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>管理者画面</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* タブバー: web では ScrollView の flex 膨張バグを避けるため plain View を使う */}
      {Platform.OS === 'web' ? (
        <View style={[st.tabScroll, st.tabBar]}>
          {TABS.map(t => (
            <TouchableOpacity key={t.key}
              style={[st.tabItem, tab === t.key && st.tabItemActive]}
              onPress={() => setTab(t.key)}>
              <Text style={[st.tabText, tab === t.key && st.tabTextActive]}>{t.label}</Text>
              {!!t.badge && t.badge > 0 && (
                <View style={st.tabBadge}><Text style={st.tabBadgeText}>{t.badge}</Text></View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={st.tabScroll} contentContainerStyle={st.tabBar}>
          {TABS.map(t => (
            <TouchableOpacity key={t.key}
              style={[st.tabItem, tab === t.key && st.tabItemActive]}
              onPress={() => setTab(t.key)}>
              <Text style={[st.tabText, tab === t.key && st.tabTextActive]}>{t.label}</Text>
              {!!t.badge && t.badge > 0 && (
                <View style={st.tabBadge}><Text style={st.tabBadgeText}>{t.badge}</Text></View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ════════════════════════════════════
          KPI ダッシュボード（元のデザインを完全復元）
      ════════════════════════════════════ */}
      {tab === 'dashboard' && (
        <ScrollView style={paneStyle} contentContainerStyle={dk.content}>

          {/* 収益ヒーローカード */}
          <View style={dk.heroCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Ionicons name="flash" size={14} color={D.gold} />
              <Text style={{ color: D.gold, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>PLATFORM REVENUE</Text>
            </View>
            <Text style={dk.heroValue}>¥{(kpi?.totalRevenue ?? 0).toLocaleString()}</Text>
            <Text style={{ color: D.sub, fontSize: 12, marginBottom: 16 }}>月額推定収益（プラン + メンシプ手数料）</Text>
            <View style={dk.heroDivider} />
            <View style={{ flexDirection: 'row', gap: 24, marginTop: 14 }}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: D.accent }} />
                  <Text style={{ color: D.sub, fontSize: 11 }}>プラン収益</Text>
                </View>
                <Text style={{ color: D.accent, fontSize: 20, fontWeight: '800' }}>¥{(kpi?.planRevenue ?? 0).toLocaleString()}</Text>
                <Text style={{ color: D.sub, fontSize: 10, marginTop: 2 }}>Standard×{kpi?.standardUsers} + Pro×{kpi?.proUsers}</Text>
              </View>
              <View style={{ width: 1, backgroundColor: D.divider }} />
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: D.purple }} />
                  <Text style={{ color: D.sub, fontSize: 11 }}>メンシプ手数料 {(MEMBERSHIP_FEE_RATE * 100).toFixed(0)}%</Text>
                </View>
                <Text style={{ color: D.purple, fontSize: 20, fontWeight: '800' }}>¥{(kpi?.membershipCommission ?? 0).toLocaleString()}</Text>
                <Text style={{ color: D.sub, fontSize: 10, marginTop: 2 }}>総額¥{(kpi?.totalMembershipFees ?? 0).toLocaleString()} × {(MEMBERSHIP_FEE_RATE * 100).toFixed(0)}%</Text>
              </View>
            </View>
          </View>

          {/* 応援支援金 */}
          <Text style={dk.sectionLabel}>SUPPORT</Text>
          <View style={[dk.card, { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20 }]}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF0F0', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="heart" size={22} color="#E05555" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: D.sub, fontSize: 11, marginBottom: 2 }}>応援累計</Text>
              <Text style={{ color: '#E05555', fontSize: 28, fontWeight: '900', letterSpacing: -0.5 }}>
                ¥{(kpi?.supportTotal ?? 0).toLocaleString()}
              </Text>
              <Text style={{ color: D.sub, fontSize: 11, marginTop: 2 }}>{kpi?.supportCount ?? 0}件の応援</Text>
            </View>
          </View>

          {/* プラン分布 */}
          <Text style={dk.sectionLabel}>PLAN DISTRIBUTION</Text>
          <View style={[dk.card, { flexDirection: 'row', alignItems: 'center', gap: 20, padding: 20 }]}>
            <DonutChart segments={planDonut} size={130} sw={20} centerLabel={`${kpi?.totalUsers ?? 0}`} />
            <View style={{ flex: 1, gap: 2 }}>
              <LegendItem color={Colors.border} label="Free"     value={kpi?.freeUsers ?? 0}     pct={((kpi?.freeUsers ?? 0) / totalPlanUsers) * 100} />
              <LegendItem color={D.accent}      label="Standard" value={kpi?.standardUsers ?? 0} pct={((kpi?.standardUsers ?? 0) / totalPlanUsers) * 100} />
              <LegendItem color={D.gold}        label="Pro"      value={kpi?.proUsers ?? 0}      pct={((kpi?.proUsers ?? 0) / totalPlanUsers) * 100} />
              <View style={{ height: 1, backgroundColor: D.divider, marginVertical: 8 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: D.sub, fontSize: 11 }}>有料率</Text>
                <Text style={{ color: D.accent, fontSize: 13, fontWeight: '800' }}>
                  {(((kpi?.standardUsers ?? 0) + (kpi?.proUsers ?? 0)) / totalPlanUsers * 100).toFixed(1)}%
                </Text>
              </View>
            </View>
          </View>

          {/* 今日 */}
          <Text style={dk.sectionLabel}>TODAY</Text>
          <View style={dk.grid}>
            <DarkCard label="今日の新規ユーザー" value={kpi?.newToday ?? 0}        icon="person-add-outline"  color={D.green} />
            <DarkCard label="今日のメンシプ加入" value={kpi?.newSubsToday ?? 0}    icon="star"                color={D.gold} />
            <DarkCard label="今日の配信"         value={kpi?.todayBroadcasts ?? 0} icon="megaphone-outline"   color={D.accent} />
            <DarkCard label="今日のDM"           value={kpi?.todayDMs ?? 0}        icon="chatbubble-outline"  color={D.orange} />
            <DarkCard label="今日のコメント"     value={kpi?.todayComments ?? 0}   icon="chatbubbles-outline" color={D.purple} />
            <DarkCard label="今日のいいね"       value={kpi?.todayLikes ?? 0}      icon="thumbs-up-outline"   color={D.red} />
          </View>

          {/* 累計 */}
          <Text style={dk.sectionLabel}>TOTALS</Text>
          <View style={dk.grid}>
            <DarkCard label="総ユーザー"      value={kpi?.totalUsers ?? 0}           icon="people-outline"      color={D.text} />
            <DarkCard label="クリエイター"    value={kpi?.totalCreators ?? 0}        icon="radio-outline"       color={D.gold} />
            <DarkCard label="今週の新規"      value={kpi?.newThisWeek ?? 0}          icon="trending-up-outline" color={D.accent} />
            <DarkCard label="今週のメンシプ"  value={kpi?.newSubsThisWeek ?? 0}      icon="trending-up-outline" color={D.green} />
            <DarkCard label="総会員数"        value={kpi?.totalSubscriptions ?? 0}   icon="star-outline"        color={D.purple} />
            <DarkCard label="月間メンシプ総額" value={`¥${(kpi?.totalMembershipFees ?? 0).toLocaleString()}`} icon="cash-outline" color={D.accent} sub="全クリエイター合計" />
            <DarkCard label="総配信数"        value={kpi?.totalBroadcasts ?? 0}      icon="megaphone-outline"   color={D.accent} />
            <DarkCard label="総メッセージ"    value={kpi?.totalMessages ?? 0}        icon="chatbubbles-outline" color={D.orange} />
          </View>

          {/* 過去7日間トレンド */}
          <Text style={dk.sectionLabel}>7-DAY TREND</Text>
          <View style={[dk.card, { padding: 16 }]}>
            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 10 }}>
              {trendDatasets.map(ds => (
                <View key={ds.color} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 16, height: 2, backgroundColor: ds.color, borderRadius: 1 }} />
                  <Text style={{ color: D.sub, fontSize: 11 }}>{ds.label}</Text>
                </View>
              ))}
            </View>
            <MiniLineChart datasets={trendDatasets} height={72} chartWidth={300} />
          </View>

          {/* トレンドテーブル */}
          <View style={dk.trendCard}>
            <View style={dk.trendHeader}>
              <Text style={dk.trendDateCol}>日付</Text>
              {[{ label: '新規', color: D.green }, { label: '配信', color: D.accent }, { label: 'DM', color: D.orange }, { label: 'コメ', color: D.purple }].map(c => (
                <View key={c.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.color }} />
                  <Text style={dk.trendColLabel}>{c.label}</Text>
                </View>
              ))}
            </View>
            {dailyTrend.map((row, i) => {
              const isToday = row.date === '今日'
              return (
                <View key={row.date} style={[dk.trendRow, i % 2 === 0 && dk.trendRowAlt, isToday && dk.trendRowToday]}>
                  <Text style={[dk.trendDate, isToday && { color: D.accent, fontWeight: '800' }]}>{row.date}</Text>
                  {[
                    { v: row.newUsers,   max: trendMax.users, color: D.green },
                    { v: row.broadcasts, max: trendMax.bc,    color: D.accent },
                    { v: row.dms,        max: trendMax.dms,   color: D.orange },
                    { v: row.comments,   max: trendMax.comm,  color: D.purple },
                  ].map((col, ci) => (
                    <View key={ci} style={{ flex: 1 }}>
                      <View style={dk.trendBarBg}>
                        <View style={[dk.trendBar, { width: `${Math.max(col.v / col.max * 100, col.v > 0 ? 8 : 0)}%` as any, backgroundColor: col.color, alignItems: 'center', justifyContent: 'center' as const }]}>
                          {col.v > 0 && <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff', paddingHorizontal: 3 }} numberOfLines={1}>{col.v}</Text>}
                        </View>
                      </View>
                      {col.v === 0 && <Text style={[dk.trendNum, { fontSize: 10, color: Colors.textLight }]}>0</Text>}
                    </View>
                  ))}
                </View>
              )
            })}
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* ════════════════════════════════════
          ユーザー タブ
      ════════════════════════════════════ */}
      {tab === 'users' && (
        <View style={viewPaneStyle}>
          {/* ランキング / 一覧 サブタブ */}
          <View style={st.subTabBar}>
            {(['ranking', 'list'] as const).map(v => (
              <TouchableOpacity key={v} style={[st.subTab, userView === v && st.subTabActive]} onPress={() => setUserView(v)}>
                <Text style={[st.subTabText, userView === v && st.subTabTextActive]}>
                  {v === 'ranking' ? 'ランキング' : '一覧'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── 一覧ビュー ── */}
          {userView === 'list' && (
            <>
              <View style={st.searchBar}>
                <Ionicons name="search-outline" size={16} color={Colors.textLight} />
                <TextInput style={st.searchInput} placeholder="名前・ユーザー名で検索"
                  placeholderTextColor={Colors.textLight} value={userSearch} onChangeText={setUserSearch} />
              </View>
              <FlatList
                style={{ flex: 1 }}
                data={filteredUsers}
                keyExtractor={u => u.id}
                contentContainerStyle={{ padding: 12, gap: 8 }}
                ListEmptyComponent={<Text style={st.empty}>ユーザーが見つかりません</Text>}
                renderItem={({ item: u }) => (
                  <TouchableOpacity style={st.listCard}
                    onPress={() => router.push(`/admin-user/${u.id}` as any)} activeOpacity={0.8}>
                    {u.avatar_url
                      ? <Image source={{ uri: u.avatar_url }} style={st.avatar} />
                      : <View style={[st.avatar, st.avatarFb]}>
                          <Text style={st.avatarText}>{u.display_name?.[0] ?? '?'}</Text>
                        </View>
                    }
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={st.listName} numberOfLines={1}>{u.display_name}</Text>
                        {u.is_admin  && <Pill label="管理者" color="#4F46E5" bg="#EEF2FF" />}
                        {u.is_banned && <Pill label="BAN"    color="#DC2626" bg="#FEE2E2" />}
                      </View>
                      <Text style={st.listSub}>@{u.username} · {u.plan ?? 'free'} · {new Date(u.created_at).toLocaleDateString('ja-JP')}</Text>
                    </View>
                    <TouchableOpacity onPress={() => toggleBan(u)}
                      style={[st.banBtn, u.is_banned && st.banBtnActive]}>
                      <Text style={[st.banBtnText, u.is_banned && { color: Colors.white }]}>
                        {u.is_banned ? 'BAN解除' : 'BAN'}
                      </Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            </>
          )}

          {/* ── ランキングビュー ── */}
          {userView === 'ranking' && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={[st.tabContent, { paddingTop: 8 }]}>
              {/* 期間セレクター */}
              <View style={st.periodBar}>
                {(['today', 'month', 'all'] as RankPeriod[]).map(p => (
                  <TouchableOpacity key={p} style={[st.periodBtn, rankPeriod === p && st.periodBtnActive]} onPress={() => setRankPeriod(p)}>
                    <Text style={[st.periodBtnText, rankPeriod === p && st.periodBtnTextActive]}>
                      {p === 'today' ? '今日' : p === 'month' ? '今月' : '全期間'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

                  {/* 全ランキング種別をセクション表示 */}
              {rankLoading ? (
                <View style={[st.center, { paddingTop: 40 }]}><ActivityIndicator color={Colors.accent} /></View>
              ) : (
                <View style={{ gap: 20 }}>
                  {RANK_TYPES.map(rt => {
                    const data = periodRankings[rankPeriod]?.[rt.key] ?? []
                    const isExpanded = expandedTypes.has(rt.key)
                    const visible = isExpanded ? data : data.slice(0, 10)
                    const hasMore = data.length > 10
                    return (
                      <View key={rt.key}>
                        <Text style={st.rankSectionTitle}>{rt.label}</Text>
                        {data.length === 0 ? (
                          <Text style={[st.empty, { paddingTop: 8 }]}>データなし</Text>
                        ) : (
                          <>
                            <View style={{ gap: 6 }}>
                              {visible.map((u, i) => (
                                <TouchableOpacity key={u.id} style={st.rankRow} onPress={() => router.push(`/admin-user/${u.id}` as any)} activeOpacity={0.8}>
                                  <Text style={[st.rankNum, i < 3 && { color: Colors.accent }]}>#{i + 1}</Text>
                                  {u.avatar_url
                                    ? <Image source={{ uri: u.avatar_url }} style={st.rankAvatar} />
                                    : <View style={[st.rankAvatar, st.rankAvatarFb]}><Text style={st.rankAvatarText}>{u.display_name[0]}</Text></View>
                                  }
                                  <View style={{ flex: 1 }}>
                                    <Text style={st.rankName}>{u.display_name}</Text>
                                    {u.username && <Text style={st.listSub}>@{u.username}</Text>}
                                  </View>
                                  <Text style={st.rankCount}>
                                    {rt.key === 'earnings' ? `¥${u.count.toLocaleString()}` : `${u.count.toLocaleString()}${rt.unit}`}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                            {hasMore && (
                              <TouchableOpacity
                                style={st.expandBtn}
                                onPress={() => setExpandedTypes(prev => {
                                  const next = new Set(prev)
                                  if (next.has(rt.key)) next.delete(rt.key); else next.add(rt.key)
                                  return next
                                })}
                              >
                                <Text style={st.expandBtnText}>
                                  {isExpanded ? '折りたたむ' : `もっと見る (${data.length - 10}件)`}
                                </Text>
                                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.accent} />
                              </TouchableOpacity>
                            )}
                          </>
                        )}
                      </View>
                    )
                  })}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      )}

      {/* ════════════════════════════════════
          報告 タブ
      ════════════════════════════════════ */}
      {tab === 'reports' && (
        <ScrollView style={paneStyle} contentContainerStyle={st.tabContent}>
          {reports.length === 0
            ? <Text style={st.empty}>報告はありません</Text>
            : reports.map(item => (
              <TouchableOpacity key={item.id} style={st.card}
                onPress={() => { setSelectedReport(item); setAdminNote(item.admin_note ?? '') }} activeOpacity={0.8}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={[st.pill, { backgroundColor: STATUS_COLOR[item.status] + '20' }]}>
                    <Text style={[st.pillText, { color: STATUS_COLOR[item.status] }]}>{STATUS_LABEL[item.status]}</Text>
                  </View>
                  <Text style={st.listSub}>{new Date(item.created_at).toLocaleDateString('ja-JP')}</Text>
                </View>
                <Text style={st.listName}>{item.reason}</Text>
                {item.reported_user && <Text style={st.listSub}>対象: {item.reported_user.display_name}</Text>}
                {item.reported_broadcast && <Text style={st.listSub} numberOfLines={1}>投稿: {item.reported_broadcast.content}</Text>}
              </TouchableOpacity>
            ))
          }
        </ScrollView>
      )}


      {/* ════════════════════════════════════
          メンシプ タブ
      ════════════════════════════════════ */}
      {tab === 'memberships' && (
        <View style={viewPaneStyle}>
          <View style={st.mbSummary}>
            <View style={st.mbSummaryItem}>
              <Text style={st.mbSummaryValue}>{memberships.filter(m => m.status === 'active').length}</Text>
              <Text style={st.mbSummaryLabel}>アクティブ</Text>
            </View>
            <View style={st.mbSummaryDivider} />
            <View style={st.mbSummaryItem}>
              <Text style={st.mbSummaryValue}>
                ¥{memberships.filter(m => m.status === 'active')
                  .reduce((s, m) => s + (m.creator?.membership_price ?? 0), 0).toLocaleString()}
              </Text>
              <Text style={st.mbSummaryLabel}>月間総額</Text>
            </View>
          </View>
          <View style={st.searchBar}>
            <Ionicons name="search-outline" size={16} color={Colors.textLight} />
            <TextInput style={st.searchInput} placeholder="クリエイター・会員名で検索"
              placeholderTextColor={Colors.textLight} value={mbSearch} onChangeText={setMbSearch} />
          </View>
          <FlatList
            style={{ flex: 1 }}
            data={filteredMb}
            keyExtractor={m => m.id}
            contentContainerStyle={{ padding: 12, gap: 8 }}
            ListEmptyComponent={<Text style={st.empty}>メンバーシップがありません</Text>}
            ListHeaderComponent={Object.keys(cancelReasonBreakdown).length > 0 ? (
              <View style={[st.card, { marginBottom: 8 }]}>
                <Text style={[st.sectionLabel, { marginBottom: 10 }]}>解約理由の集計</Text>
                {Object.entries(cancelReasonBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([reason, count]) => {
                    const total = Object.values(cancelReasonBreakdown).reduce((s, v) => s + v, 0)
                    const pct = total > 0 ? Math.round(count / total * 100) : 0
                    return (
                      <View key={reason} style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.text }}>{reason}</Text>
                          <Text style={{ fontSize: 12, color: Colors.textLight }}>{count}件　{pct}%</Text>
                        </View>
                        <View style={{ height: 6, backgroundColor: Colors.border, borderRadius: 3 }}>
                          <View style={{ height: 6, backgroundColor: Colors.accent, borderRadius: 3, width: `${pct}%` as any }} />
                        </View>
                      </View>
                    )
                  })
                }
              </View>
            ) : null}
            renderItem={({ item: m }) => (
              <View style={st.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Ionicons name="radio-outline" size={13} color={Colors.accent} />
                  <TouchableOpacity onPress={() => router.push(`/creator/${m.creator?.id}` as any)}>
                    <Text style={st.listName}>
                      {m.creator?.display_name}<Text style={st.listSub}> @{m.creator?.username}</Text>
                    </Text>
                  </TouchableOpacity>
                  <Text style={[st.listSub, { marginLeft: 'auto' }]}>
                    {m.creator?.membership_price ? `¥${m.creator.membership_price.toLocaleString()}/月` : '未設定'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="person-outline" size={13} color={Colors.textLight} />
                  <Text style={st.listSub} numberOfLines={1}>{m.subscriber?.display_name} @{m.subscriber?.username}</Text>
                  <View style={[st.pill, { backgroundColor: m.status === 'active' ? '#DCFCE7' : Colors.border }]}>
                    <Text style={[st.pillText, { color: m.status === 'active' ? '#16a34a' : Colors.textLight }]}>
                      {m.status === 'active' ? 'アクティブ' : m.status}
                    </Text>
                  </View>
                  <Text style={[st.listSub, { marginLeft: 'auto' }]}>{new Date(m.created_at).toLocaleDateString('ja-JP')}</Text>
                </View>
              </View>
            )}
          />
        </View>
      )}

      {/* ════════════════════════════════════
          振込 タブ
      ════════════════════════════════════ */}
      {tab === 'payouts' && (
        <ScrollView style={paneStyle} contentContainerStyle={st.tabContent}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={[st.card, { flex: 1, gap: 4 }]}>
              <Text style={st.listSub}>振込待ち合計</Text>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#E07A4A' }}>
                ¥{payouts.reduce((s, p) => s + p.pending_amount, 0).toLocaleString()}
              </Text>
            </View>
            <View style={[st.card, { flex: 1, gap: 4 }]}>
              <Text style={st.listSub}>振込済み累計</Text>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#16a34a' }}>
                ¥{payouts.reduce((s, p) => s + p.paid_amount, 0).toLocaleString()}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[st.primaryBtn, payoutLoading && { opacity: 0.4 }]}
            onPress={triggerPayout} disabled={payoutLoading}>
            {payoutLoading ? <ActivityIndicator color={Colors.white} size="small" /> : <Ionicons name="cash-outline" size={18} color={Colors.white} />}
            <Text style={st.primaryBtnText}>{payoutLoading ? '処理中...' : '今すぐ振込を実行'}</Text>
          </TouchableOpacity>
          <Text style={st.sectionLabel}>クリエイター別</Text>
          {payouts.length === 0
            ? <Text style={st.empty}>収益データがありません</Text>
            : payouts.map(p => (
              <View key={p.creator_id} style={st.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={st.listName}>{p.creator_name}</Text>
                  <View style={[st.pill, { backgroundColor: p.has_stripe ? '#DCFCE7' : '#FEE2E2' }]}>
                    <Text style={[st.pillText, { color: p.has_stripe ? '#16a34a' : '#DC2626' }]}>
                      {p.has_stripe ? 'Stripe設定済' : 'Stripe未設定'}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.listSub}>振込待ち ({p.pending_count}件)</Text>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: p.pending_amount > 0 ? '#E07A4A' : Colors.textLight }}>
                      ¥{p.pending_amount.toLocaleString()}
                    </Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: Colors.border }} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.listSub}>振込済み累計</Text>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#16a34a' }}>¥{p.paid_amount.toLocaleString()}</Text>
                  </View>
                </View>
                {p.last_payout_date && <Text style={[st.listSub, { marginTop: 6 }]}>最終振込: {p.last_payout_date}</Text>}
              </View>
            ))
          }
        </ScrollView>
      )}

      {/* ════════════════════════════════════
          お知らせ タブ
      ════════════════════════════════════ */}
      {tab === 'announcements' && (
        <ScrollView style={paneStyle} contentContainerStyle={st.tabContent}>
          <Text style={st.sectionLabel}>最新情報を作成</Text>
          {/* タグ選択 */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['お知らせ', '新機能', 'アップデート'] as AnnTag[]).map(tag => {
              const COLOR: Record<AnnTag, string> = { 'お知らせ': Colors.textLight, '新機能': Colors.accent, 'アップデート': Colors.button }
              const active = annTag === tag
              return (
                <TouchableOpacity key={tag}
                  style={[st.tagBtn, { borderColor: COLOR[tag] }, active && { backgroundColor: COLOR[tag] }]}
                  onPress={() => setAnnTag(tag)}>
                  <Text style={[st.tagBtnText, { color: active ? Colors.white : COLOR[tag] }]}>{tag}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <View style={st.card}>
            <TextInput style={st.annTitle} placeholder="タイトル"
              placeholderTextColor={Colors.textLight} value={annTitle} onChangeText={setAnnTitle} />
            <View style={{ height: 1, backgroundColor: Colors.border }} />
            <TextInput style={st.annBody} placeholder="本文"
              placeholderTextColor={Colors.textLight} value={annBody} onChangeText={setAnnBody}
              multiline textAlignVertical="top" />
          </View>
          <TouchableOpacity
            style={[st.primaryBtn, (!annTitle.trim() || !annBody.trim() || savingAnn) && { opacity: 0.4 }]}
            onPress={sendAnnouncement} disabled={!annTitle.trim() || !annBody.trim() || savingAnn}>
            <Ionicons name="newspaper-outline" size={18} color={Colors.white} />
            <Text style={st.primaryBtnText}>{savingAnn ? '保存中...' : '最新情報を公開・通知'}</Text>
          </TouchableOpacity>
          <Text style={st.sectionLabel}>公開済み</Text>
          {announcements.length === 0
            ? <Text style={st.empty}>お知らせはありません</Text>
            : announcements.map(a => {
              const TAG_COLOR: Record<string, string> = { 'お知らせ': Colors.textLight, '新機能': Colors.accent, 'アップデート': Colors.button }
              const tagColor = TAG_COLOR[a.tag ?? 'お知らせ'] ?? Colors.textLight
              return (
                <View key={a.id} style={st.card}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <View style={[st.tagBtn, { backgroundColor: tagColor, borderColor: tagColor, paddingHorizontal: 8, paddingVertical: 2 }]}>
                      <Text style={[st.tagBtnText, { color: Colors.white }]}>{a.tag ?? 'お知らせ'}</Text>
                    </View>
                    <Text style={[st.listSub, { flex: 1 }]} numberOfLines={1}>{new Date(a.created_at).toLocaleString('ja-JP')}</Text>
                    <TouchableOpacity onPress={() => deleteAnnouncement(a.id)}>
                      <Ionicons name="trash-outline" size={16} color="#E53E3E" />
                    </TouchableOpacity>
                  </View>
                  <Text style={st.listName} numberOfLines={1}>{a.title}</Text>
                  <Text style={st.listSub} numberOfLines={2}>{a.body}</Text>
                </View>
              )
            })
          }
        </ScrollView>
      )}

      {/* ════════════════════════════════════
          フラグ タブ
      ════════════════════════════════════ */}
      {tab === 'flags' && (
        <ScrollView style={paneStyle} contentContainerStyle={st.tabContent}>

          {/* ── メンテナンスモード（専用カード） ─────────────────── */}
          {(() => {
            const maintenanceFlag = flags.find(f => f.key === 'maintenance_mode')
            const isOn = maintenanceFlag?.enabled ?? false
            const toggle = async () => {
              if (maintenanceFlag) {
                toggleFlag(maintenanceFlag)
              } else {
                // まだDBにない場合は作成してトグル
                const { data } = await supabase.from('feature_flags').insert({
                  key: 'maintenance_mode',
                  enabled: true,
                  description: 'trueにすると管理者以外はメンテナンス画面のみ表示',
                }).select().single()
                if (data) setFlags(prev => [...prev, data as FeatureFlag])
              }
            }
            return (
              <View style={[st.card, { borderWidth: isOn ? 2 : 1, borderColor: isOn ? '#E05555' : Colors.border, gap: 10 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isOn ? '#FEE2E2' : Colors.background, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="construct-outline" size={18} color={isOn ? '#E05555' : Colors.textLight} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.flagKey, { color: isOn ? '#E05555' : Colors.text }]}>メンテナンスモード</Text>
                    <Text style={st.listSub}>ONにすると管理者以外アクセス不可</Text>
                  </View>
                  <ToggleSwitch value={isOn} onValueChange={toggle} />
                </View>
                {isOn && (
                  <View style={{ backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10 }}>
                    <Text style={{ fontSize: 12, color: '#B91C1C', fontWeight: '600' }}>
                      ⚠ 現在メンテナンス中です。管理者以外はアクセスできません。
                    </Text>
                  </View>
                )}
              </View>
            )
          })()}

          <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 4 }} />

          <TouchableOpacity style={st.addBtn} onPress={addFlag}>
            <Ionicons name="add-circle-outline" size={18} color={Colors.accent} />
            <Text style={{ color: Colors.accent, fontWeight: '600', fontSize: 14 }}>フラグを追加</Text>
          </TouchableOpacity>
          {flags.filter(f => f.key !== 'maintenance_mode').length === 0
            ? <Text style={st.empty}>フラグがありません</Text>
            : flags.filter(f => f.key !== 'maintenance_mode').map(f => (
              <View key={f.id} style={[st.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={st.flagKey}>{f.key}</Text>
                  {f.description && <Text style={st.listSub}>{f.description}</Text>}
                </View>
                <ToggleSwitch value={f.enabled} onValueChange={() => toggleFlag(f)} />
              </View>
            ))
          }
        </ScrollView>
      )}

      {/* ════════════════════════════════════
          お問い合わせ タブ
      ════════════════════════════════════ */}
      {tab === 'support' && (
        <ScrollView style={paneStyle} contentContainerStyle={st.tabContent}>
          {/* サマリー */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={[st.card, { flex: 1, alignItems: 'center', gap: 4, padding: 14 }]}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#D97706' }}>
                {contactMessages.filter(m => m.status === 'pending').length}
              </Text>
              <Text style={st.listSub}>未対応</Text>
            </View>
            <View style={[st.card, { flex: 1, alignItems: 'center', gap: 4, padding: 14 }]}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#16a34a' }}>
                {contactMessages.filter(m => m.status === 'resolved').length}
              </Text>
              <Text style={st.listSub}>対応済み</Text>
            </View>
          </View>

          {/* 一覧 */}
          {contactMessages.length === 0 ? (
            <Text style={st.empty}>お問い合わせはありません</Text>
          ) : (
            contactMessages.map(c => (
              <TouchableOpacity
                key={c.id} style={st.card}
                onPress={() => { setSelectedContact(c); setContactNote(c.admin_note ?? ''); setNotifBody('') }}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={[st.pill, { backgroundColor: (CONTACT_STATUS_COLOR[c.status] ?? '#888') + '25' }]}>
                    <Text style={[st.pillText, { color: CONTACT_STATUS_COLOR[c.status] ?? '#888' }]}>
                      {CONTACT_STATUS_LABEL[c.status] ?? c.status}
                    </Text>
                  </View>
                  <Text style={st.listSub}>{new Date(c.created_at).toLocaleDateString('ja-JP')}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <View style={[st.pill, { backgroundColor: Colors.background }]}>
                    <Text style={[st.pillText, { color: Colors.textLight }]}>
                      {CONTACT_CAT[c.category] ?? c.category}
                    </Text>
                  </View>
                  {c.user && (
                    <Text style={st.listSub}>{c.user.display_name} @{c.user.username}</Text>
                  )}
                </View>
                <Text style={st.listSub} numberOfLines={2}>{c.body}</Text>
                {c.admin_note && (
                  <View style={{ marginTop: 6, flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                    <Ionicons name="pencil-outline" size={12} color={Colors.textLight} />
                    <Text style={[st.listSub, { flex: 1 }]} numberOfLines={1}>{c.admin_note}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

    </View>
  )
}

// ── 小コンポーネント ─────────────────────────────────────────
function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color }}>{label}</Text>
    </View>
  )
}

function InfoRow({ label, value, valueColor, last }: { label: string; value: string; valueColor?: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: Colors.border }}>
      <Text style={{ width: 80, fontSize: 12, color: Colors.textLight, fontWeight: '600' }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 13, color: valueColor ?? Colors.text, fontWeight: valueColor ? '700' : '400' }}>{value}</Text>
    </View>
  )
}

// ── KPIダッシュボード スタイル ────────────────────────────────
const dk = StyleSheet.create({
  content: { padding: 16, gap: 10 },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: D.sub, letterSpacing: 1.5, paddingTop: 10, paddingBottom: 2 },
  heroCard: {
    backgroundColor: D.hero, borderWidth: 1, borderColor: D.border, borderRadius: 18, padding: 20,
    ...(Platform.OS === 'web' ? { boxShadow: '0 2px 12px rgba(0,0,0,0.08)' } as any : { shadowColor: '#000', shadowRadius: 8, shadowOpacity: 0.1, elevation: 4 }),
  },
  heroValue:  { fontSize: 42, fontWeight: '900', color: D.text, letterSpacing: -1, marginBottom: 2 },
  heroDivider:{ height: 1, backgroundColor: D.divider },
  card:       { backgroundColor: D.card, borderWidth: 1, borderColor: D.border, borderRadius: 14 },
  grid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  trendCard:  { backgroundColor: D.card, borderWidth: 1, borderColor: D.border, borderRadius: 14, overflow: 'hidden' },
  trendHeader:{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.background, borderBottomWidth: 1, borderBottomColor: D.divider },
  trendDateCol:{ width: 40, fontSize: 10, fontWeight: '700', color: D.sub },
  trendColLabel:{ fontSize: 10, fontWeight: '700', color: D.sub },
  trendRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: D.divider },
  trendRowAlt:  { backgroundColor: '#F9F6F2' },
  trendRowToday:{ backgroundColor: '#F0E8DE' },
  trendDate:  { width: 40, fontSize: 12, fontWeight: '600', color: D.sub },
  trendNum:   { fontSize: 12, fontWeight: '700', color: D.text },
  trendBarBg: { height: 20, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' as const },
  trendBar:   { height: 20, borderRadius: 4, minWidth: 2 },
})

// ── 通常タブ スタイル ─────────────────────────────────────────
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center:    { justifyContent: 'center', alignItems: 'center' },

  header: {
    backgroundColor: Colors.header, paddingTop: 36, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn:     { padding: 4, width: 32 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },

  tabScroll:     { height: 46, flexShrink: 0, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBar:        { flexDirection: 'row', paddingHorizontal: 4 },
  tabItem:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, height: 46 },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  tabText:       { fontSize: 13, fontWeight: '600', color: Colors.textLight },
  tabTextActive: { color: Colors.accent },
  tabBadge:      { backgroundColor: '#E53E3E', borderRadius: 8, paddingHorizontal: 5, minWidth: 18, alignItems: 'center' },
  tabBadgeText:  { fontSize: 10, fontWeight: '800', color: Colors.white },

  tabPane: { flex: 1 },

  tabContent: { padding: 12, gap: 10, paddingBottom: 40 },

  card: { backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: Colors.textLight, letterSpacing: 1 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 12, padding: 10, backgroundColor: Colors.white,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },

  listCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 12,
  },
  avatar:     { width: 40, height: 40, borderRadius: 20 },
  avatarFb:   { backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  listName:   { fontSize: 14, fontWeight: '700', color: Colors.text },
  listSub:    { fontSize: 11, color: Colors.textLight, marginTop: 2 },

  banBtn:       { borderWidth: 1.5, borderColor: '#DC2626', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  banBtnActive: { backgroundColor: '#DC2626' },
  banBtnText:   { fontSize: 11, fontWeight: '700', color: '#DC2626' },

  pill:     { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  pillText: { fontSize: 10, fontWeight: '700' },

  textarea: {
    backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    padding: 12, fontSize: 14, color: Colors.text, minHeight: 80, textAlignVertical: 'top',
  },
  statusBtn:     { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  statusBtnText: { fontSize: 13, fontWeight: '700' },

  primaryBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14 },
  primaryBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },

  mbSummary:      { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 12, paddingHorizontal: 20 },
  mbSummaryItem:  { flex: 1, alignItems: 'center' },
  mbSummaryValue: { fontSize: 20, fontWeight: '800', color: Colors.text },
  mbSummaryLabel: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
  mbSummaryDivider:{ width: 1, height: 36, backgroundColor: Colors.border },

  annTitle: { padding: 12, fontSize: 15, fontWeight: '700', color: Colors.text },
  annBody:  { padding: 12, fontSize: 14, color: Colors.text, minHeight: 80 },
  tagBtn:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5 },
  tagBtnText: { fontSize: 12, fontWeight: '700' },

  addBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 },
  flagKey: { fontSize: 14, fontWeight: '700', color: Colors.text, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  empty: { textAlign: 'center', color: Colors.textLight, paddingTop: 40 },

  // サブタブ（一覧/ランキング）
  subTabBar: { flexDirection: 'row', backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  subTab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  subTabActive: { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  subTabText: { fontSize: 13, fontWeight: '600', color: Colors.textLight },
  subTabTextActive: { color: Colors.accent },
  // 期間セレクター
  periodBar: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  periodBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.white },
  periodBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  periodBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textLight },
  periodBtnTextActive: { color: Colors.white },
  // ランキング種別
  rankTypeScroll: { marginBottom: 12 },
  rankTypeBar: { flexDirection: 'row', gap: 6, paddingBottom: 2 },
  rankTypeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  rankTypeBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  rankTypeBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textLight },
  rankTypeBtnTextActive: { color: Colors.white },

  rankSectionTitle: {
    fontSize: 15, fontWeight: '800', color: Colors.text, letterSpacing: 0.3,
    marginBottom: 8, marginTop: 4,
    paddingLeft: 10, paddingVertical: 6,
    borderLeftWidth: 3, borderLeftColor: Colors.accent,
    backgroundColor: Colors.background, borderRadius: 4,
  },
  expandBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 4, paddingVertical: 10, marginTop: 2 },
  expandBtnText: { fontSize: 13, fontWeight: '600' as const, color: Colors.accent },

  rankRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 12,
  },
  rankNum:      { width: 28, fontSize: 13, fontWeight: '800', color: Colors.textLight, textAlign: 'center' },
  rankAvatar:   { width: 36, height: 36, borderRadius: 18 },
  rankAvatarFb: { backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center' },
  rankAvatarText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  rankName:     { fontSize: 14, fontWeight: '700', color: Colors.text },
  rankCount:    { fontSize: 14, fontWeight: '800', color: Colors.accent },
})
