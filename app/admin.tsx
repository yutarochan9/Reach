import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform, ScrollView, Image,
} from 'react-native'
import ToggleSwitch from './components/ToggleSwitch'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

type Tab = 'dashboard' | 'users' | 'reports' | 'announcements' | 'flags'
type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed'

type KPI = {
  totalUsers: number
  newToday: number
  newThisWeek: number
  totalBroadcasts: number
  totalMessages: number
  totalCreators: number
}

type UserRow = {
  id: string
  display_name: string
  username: string
  avatar_url: string | null
  plan: string
  is_admin: boolean
  is_banned: boolean
  created_at: string
}

type Report = {
  id: string
  reason: string
  details: string | null
  status: ReportStatus
  admin_note: string | null
  created_at: string
  reporter: { display_name: string; username: string } | null
  reported_user: { display_name: string; username: string } | null
  reported_broadcast: { content: string } | null
}

type Announcement = {
  id: string
  title: string
  body: string
  created_at: string
  creator: { display_name: string } | null
}

type FeatureFlag = {
  id: string
  key: string
  enabled: boolean
  description: string | null
}

const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: '未対応', reviewed: '確認済', resolved: '対応済', dismissed: '却下',
}
const STATUS_COLORS: Record<ReportStatus, string> = {
  pending: '#D97706', reviewed: '#2563EB', resolved: '#38A169', dismissed: Colors.textLight,
}
const PLAN_COLORS: Record<string, string> = {
  free: Colors.textLight, standard: Colors.accent, pro: '#8B4513',
}

export default function AdminScreen() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  // KPI
  const [kpi, setKpi] = useState<KPI | null>(null)

  // Users
  const [users, setUsers] = useState<UserRow[]>([])
  const [userSearch, setUserSearch] = useState('')

  // Reports
  const [reports, setReports] = useState<Report[]>([])
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [adminNote, setAdminNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [annTitle, setAnnTitle] = useState('')
  const [annBody, setAnnBody] = useState('')
  const [savingAnn, setSavingAnn] = useState(false)

  // Flags
  const [flags, setFlags] = useState<FeatureFlag[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/(tabs)' as any); return }

    const { data: profile } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).single()

    if (!profile?.is_admin) { setIsAdmin(false); setLoading(false); return }
    setIsAdmin(true)

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [
      { count: totalUsers },
      { count: newToday },
      { count: newThisWeek },
      { count: totalBroadcasts },
      { count: totalMessages },
      { data: usersData },
      { data: reportsData },
      { data: annData },
      { data: flagsData },
    ] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', weekStart),
      supabase.from('broadcasts').select('id', { count: 'exact', head: true }),
      supabase.from('messages').select('id', { count: 'exact', head: true }),
      supabase.from('profiles')
        .select('id, display_name, username, avatar_url, plan, is_admin, is_banned, created_at')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('reports').select(`
        id, reason, details, status, admin_note, created_at,
        reporter:profiles!reports_reporter_id_fkey(display_name, username),
        reported_user:profiles!reports_reported_user_id_fkey(display_name, username),
        reported_broadcast:broadcasts!reports_reported_broadcast_id_fkey(content)
      `).order('created_at', { ascending: false }),
      supabase.from('announcements')
        .select('id, title, body, created_at, creator:profiles(display_name)')
        .order('created_at', { ascending: false }),
      supabase.from('feature_flags').select('id, key, enabled, description').order('key'),
    ])

    // クリエイター数（配信を持つユーザー）
    const { data: creatorIds } = await supabase
      .from('broadcasts').select('sender_id').limit(10000)
    const uniqueCreators = new Set((creatorIds ?? []).map((b: any) => b.sender_id)).size

    setKpi({
      totalUsers: totalUsers ?? 0,
      newToday: newToday ?? 0,
      newThisWeek: newThisWeek ?? 0,
      totalBroadcasts: totalBroadcasts ?? 0,
      totalMessages: totalMessages ?? 0,
      totalCreators: uniqueCreators,
    })
    setUsers((usersData as UserRow[]) ?? [])
    setReports((reportsData as any[]) ?? [])
    setAnnouncements((annData as any[]) ?? [])
    setFlags((flagsData as FeatureFlag[]) ?? [])
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // ── ユーザー管理 ──────────────────────────────────────────
  const toggleBan = async (u: UserRow) => {
    const next = !u.is_banned
    await supabase.from('profiles').update({ is_banned: next }).eq('id', u.id)
    setUsers(prev => prev.map(r => r.id === u.id ? { ...r, is_banned: next } : r))
  }

  const toggleAdmin = async (u: UserRow) => {
    const next = !u.is_admin
    if (Platform.OS === 'web') {
      if (!window.confirm(`${u.display_name} を${next ? '管理者に設定' : '管理者から外し'}ますか？`)) return
    }
    await supabase.from('profiles').update({ is_admin: next }).eq('id', u.id)
    setUsers(prev => prev.map(r => r.id === u.id ? { ...r, is_admin: next } : r))
  }

  const filteredUsers = users.filter(u =>
    u.display_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.username?.toLowerCase().includes(userSearch.toLowerCase())
  )

  // ── 報告 ──────────────────────────────────────────────────
  const handleUpdateStatus = async (report: Report, status: ReportStatus) => {
    setSavingNote(true)
    await supabase.from('reports').update({
      status, admin_note: adminNote.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', report.id)
    setSavingNote(false)
    setSelectedReport(null)
    load()
  }

  // ── アナウンス ────────────────────────────────────────────
  const sendAnnouncement = async () => {
    if (!annTitle.trim() || !annBody.trim()) return
    setSavingAnn(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('announcements').insert({
      title: annTitle.trim(), body: annBody.trim(), created_by: user?.id,
    })
    setAnnTitle('')
    setAnnBody('')
    setSavingAnn(false)
    load()
  }

  const deleteAnnouncement = async (id: string) => {
    if (Platform.OS === 'web') {
      if (!window.confirm('このアナウンスを削除しますか？')) return
    }
    await supabase.from('announcements').delete().eq('id', id)
    setAnnouncements(prev => prev.filter(a => a.id !== id))
  }

  // ── 機能フラグ ────────────────────────────────────────────
  const toggleFlag = async (flag: FeatureFlag) => {
    const next = !flag.enabled
    setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, enabled: next } : f))
    await supabase.from('feature_flags').update({ enabled: next, updated_at: new Date().toISOString() }).eq('id', flag.id)
  }

  const addFlag = async () => {
    const key = Platform.OS === 'web' ? window.prompt('フラグのキー（英数字・アンダースコア）') : ''
    if (!key) return
    const desc = Platform.OS === 'web' ? window.prompt('説明') ?? '' : ''
    const { error } = await supabase.from('feature_flags').insert({ key, description: desc || null })
    if (error) Alert.alert('エラー', error.message)
    else load()
  }

  // ── ガード ────────────────────────────────────────────────
  if (isAdmin === null || loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  if (!isAdmin) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', gap: 16 }]}>
        <Ionicons name="lock-closed-outline" size={48} color={Colors.textLight} />
        <Text style={{ fontSize: 16, color: Colors.textLight }}>このページにはアクセスできません</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: Colors.accent }}>戻る</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ── 報告詳細 ──────────────────────────────────────────────
  if (selectedReport) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelectedReport(null)} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>報告詳細</Text>
          <View style={{ width: 32 }} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.section}>
            <InfoRow label="報告者" value={`${selectedReport.reporter?.display_name} (@${selectedReport.reporter?.username})`} />
            <View style={styles.divider} />
            {selectedReport.reported_user && <>
              <InfoRow label="対象ユーザー" value={`${selectedReport.reported_user.display_name} (@${selectedReport.reported_user.username})`} />
              <View style={styles.divider} />
            </>}
            {selectedReport.reported_broadcast && <>
              <InfoRow label="対象投稿" value={selectedReport.reported_broadcast.content.slice(0, 80)} />
              <View style={styles.divider} />
            </>}
            <InfoRow label="理由" value={selectedReport.reason} />
            {selectedReport.details && <>
              <View style={styles.divider} />
              <InfoRow label="詳細" value={selectedReport.details} />
            </>}
            <View style={styles.divider} />
            <InfoRow label="ステータス" value={STATUS_LABELS[selectedReport.status]} valueColor={STATUS_COLORS[selectedReport.status]} />
            <View style={styles.divider} />
            <InfoRow label="報告日時" value={new Date(selectedReport.created_at).toLocaleString('ja-JP')} />
          </View>

          <Text style={styles.sectionLabel}>管理者メモ</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="対応内容・メモ（任意）"
            placeholderTextColor={Colors.textLight}
            value={adminNote}
            onChangeText={setAdminNote}
            multiline numberOfLines={3}
          />
          <Text style={styles.sectionLabel}>ステータスを変更</Text>
          <View style={styles.statusBtns}>
            {(['reviewed', 'resolved', 'dismissed'] as ReportStatus[]).map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.statusBtn, { borderColor: STATUS_COLORS[s] }, savingNote && styles.btnDisabled]}
                onPress={() => handleUpdateStatus(selectedReport, s)}
                disabled={savingNote}
              >
                <Text style={[styles.statusBtnText, { color: STATUS_COLORS[s] }]}>
                  {savingNote ? '保存中...' : STATUS_LABELS[s]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    )
  }

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'dashboard', label: 'KPI' },
    { key: 'users', label: 'ユーザー' },
    { key: 'reports', label: '報告', badge: reports.filter(r => r.status === 'pending').length },
    { key: 'announcements', label: 'お知らせ' },
    { key: 'flags', label: 'フラグ' },
  ]

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>管理者画面</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* タブバー */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[styles.tabItem, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            {!!t.badge && t.badge > 0 && (
              <View style={styles.badge}><Text style={styles.badgeText}>{t.badge}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── ダッシュボード ── */}
      {tab === 'dashboard' && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionLabel}>ユーザー</Text>
          <View style={styles.kpiGrid}>
            <KpiCard label="総ユーザー数" value={kpi?.totalUsers ?? 0} icon="people-outline" color={Colors.accent} />
            <KpiCard label="今日の新規" value={kpi?.newToday ?? 0} icon="person-add-outline" color="#38A169" />
            <KpiCard label="今週の新規" value={kpi?.newThisWeek ?? 0} icon="trending-up-outline" color="#2563EB" />
            <KpiCard label="クリエイター数" value={kpi?.totalCreators ?? 0} icon="radio-outline" color="#8B5CF6" />
          </View>
          <Text style={styles.sectionLabel}>コンテンツ</Text>
          <View style={styles.kpiGrid}>
            <KpiCard label="総配信数" value={kpi?.totalBroadcasts ?? 0} icon="megaphone-outline" color={Colors.accent} />
            <KpiCard label="総DM数" value={kpi?.totalMessages ?? 0} icon="chatbubbles-outline" color="#D97706" />
          </View>
        </ScrollView>
      )}

      {/* ── ユーザー管理 ── */}
      {tab === 'users' && (
        <View style={{ flex: 1 }}>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={16} color={Colors.textLight} />
            <TextInput
              style={styles.searchInput}
              placeholder="名前・ユーザー名で検索"
              placeholderTextColor={Colors.textLight}
              value={userSearch}
              onChangeText={setUserSearch}
            />
          </View>
          <FlatList
            data={filteredUsers}
            keyExtractor={u => u.id}
            contentContainerStyle={styles.content}
            ListEmptyComponent={<Text style={styles.empty}>ユーザーが見つかりません</Text>}
            renderItem={({ item: u }) => (
              <View style={styles.userCard}>
                <View style={styles.userLeft}>
                  {u.avatar_url
                    ? <Image source={{ uri: u.avatar_url }} style={styles.userAvatar} />
                    : <View style={[styles.userAvatar, styles.userAvatarFallback]}>
                        <Text style={styles.userAvatarText}>{u.display_name?.[0] ?? '?'}</Text>
                      </View>
                  }
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.userName} numberOfLines={1}>{u.display_name}</Text>
                      {u.is_admin && <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>管理者</Text></View>}
                      {u.is_banned && <View style={styles.bannedBadge}><Text style={styles.bannedBadgeText}>BAN</Text></View>}
                    </View>
                    <Text style={styles.userSub}>@{u.username} · {u.plan ?? 'free'} · {new Date(u.created_at).toLocaleDateString('ja-JP')}</Text>
                  </View>
                </View>
                <View style={styles.userActions}>
                  <TouchableOpacity
                    style={[styles.userActionBtn, u.is_admin && styles.userActionBtnActive]}
                    onPress={() => toggleAdmin(u)}
                  >
                    <Ionicons name="shield-outline" size={14} color={u.is_admin ? Colors.white : Colors.textLight} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.userActionBtn, u.is_banned && styles.userActionBtnBan]}
                    onPress={() => toggleBan(u)}
                  >
                    <Ionicons name={u.is_banned ? 'ban' : 'ban-outline'} size={14} color={u.is_banned ? Colors.white : Colors.textLight} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </View>
      )}

      {/* ── 報告 ── */}
      {tab === 'reports' && (
        <FlatList
          data={reports}
          keyExtractor={r => r.id}
          contentContainerStyle={styles.content}
          ListEmptyComponent={<Text style={styles.empty}>報告はありません</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.reportCard}
              onPress={() => { setSelectedReport(item); setAdminNote(item.admin_note ?? '') }}
            >
              <View style={styles.reportHeader}>
                <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLORS[item.status]}20` }]}>
                  <Text style={[styles.statusPillText, { color: STATUS_COLORS[item.status] }]}>{STATUS_LABELS[item.status]}</Text>
                </View>
                <Text style={styles.reportDate}>{new Date(item.created_at).toLocaleDateString('ja-JP')}</Text>
              </View>
              <Text style={styles.reportReason}>{item.reason}</Text>
              {item.reported_user && <Text style={styles.reportTarget}>対象: {item.reported_user.display_name}</Text>}
              {item.reported_broadcast && (
                <Text style={styles.reportTarget} numberOfLines={1}>投稿: {item.reported_broadcast.content}</Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {/* ── アナウンス ── */}
      {tab === 'announcements' && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionLabel}>新規お知らせ</Text>
          <View style={styles.section}>
            <TextInput
              style={styles.annTitleInput}
              placeholder="タイトル"
              placeholderTextColor={Colors.textLight}
              value={annTitle}
              onChangeText={setAnnTitle}
            />
            <View style={styles.divider} />
            <TextInput
              style={styles.annBodyInput}
              placeholder="本文"
              placeholderTextColor={Colors.textLight}
              value={annBody}
              onChangeText={setAnnBody}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
          <TouchableOpacity
            style={[styles.sendBtn, (!annTitle.trim() || !annBody.trim() || savingAnn) && styles.btnDisabled]}
            onPress={sendAnnouncement}
            disabled={!annTitle.trim() || !annBody.trim() || savingAnn}
          >
            <Ionicons name="megaphone-outline" size={18} color={Colors.white} />
            <Text style={styles.sendBtnText}>{savingAnn ? '送信中...' : '全ユーザーに送信'}</Text>
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>送信済みお知らせ</Text>
          {announcements.length === 0
            ? <Text style={styles.empty}>お知らせはありません</Text>
            : announcements.map(a => (
              <View key={a.id} style={styles.annCard}>
                <View style={styles.annCardHeader}>
                  <Text style={styles.annTitle}>{a.title}</Text>
                  <TouchableOpacity onPress={() => deleteAnnouncement(a.id)}>
                    <Ionicons name="trash-outline" size={16} color="#E53E3E" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.annBody} numberOfLines={2}>{a.body}</Text>
                <Text style={styles.annDate}>{new Date(a.created_at).toLocaleString('ja-JP')}</Text>
              </View>
            ))
          }
        </ScrollView>
      )}

      {/* ── 機能フラグ ── */}
      {tab === 'flags' && (
        <FlatList
          data={flags}
          keyExtractor={f => f.id}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <TouchableOpacity style={styles.addFlagBtn} onPress={addFlag}>
              <Ionicons name="add-circle-outline" size={18} color={Colors.accent} />
              <Text style={[styles.tabText, { color: Colors.accent }]}>フラグを追加</Text>
            </TouchableOpacity>
          }
          ListEmptyComponent={<Text style={styles.empty}>フラグがありません</Text>}
          renderItem={({ item }) => (
            <View style={styles.flagRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.flagKey}>{item.key}</Text>
                {item.description && <Text style={styles.flagDesc}>{item.description}</Text>}
              </View>
              <ToggleSwitch value={item.enabled} onValueChange={() => toggleFlag(item)} />
            </View>
          )}
        />
      )}
    </View>
  )
}

function KpiCard({ label, value, icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <View style={kpi.card}>
      <View style={[kpi.iconWrap, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={kpi.value}>{value.toLocaleString()}</Text>
      <Text style={kpi.label}>{label}</Text>
    </View>
  )
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor, fontWeight: '600' } : {}]}>{value}</Text>
    </View>
  )
}

const kpi = StyleSheet.create({
  card: {
    flex: 1, minWidth: '45%', backgroundColor: Colors.white,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    padding: 16, gap: 6, alignItems: 'flex-start',
  },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 28, fontWeight: '800', color: Colors.text },
  label: { fontSize: 12, color: Colors.textLight, fontWeight: '600' },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  tabScroll: { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.white },
  tabBar: { flexDirection: 'row', paddingHorizontal: 4 },
  tabItem: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 14 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.textLight },
  tabTextActive: { color: Colors.accent },
  badge: { backgroundColor: '#E53E3E', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { fontSize: 10, fontWeight: '800', color: Colors.white },
  content: { padding: 16, gap: 10 },
  empty: { textAlign: 'center', color: Colors.textLight, paddingTop: 40 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 8, paddingBottom: 2,
  },
  section: { backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: Colors.border },
  infoRow: { flexDirection: 'row', padding: 14, gap: 8 },
  infoLabel: { width: 100, fontSize: 13, color: Colors.textLight, fontWeight: '500' },
  infoValue: { flex: 1, fontSize: 13, color: Colors.text },
  // 検索
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 12, padding: 10, backgroundColor: Colors.white,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },
  // ユーザーカード
  userCard: {
    backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  userLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  userAvatar: { width: 40, height: 40, borderRadius: 20 },
  userAvatarFallback: { backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  userName: { fontSize: 14, fontWeight: '700', color: Colors.text, flex: 1 },
  userSub: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
  adminBadge: { backgroundColor: '#EEF2FF', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  adminBadgeText: { fontSize: 10, color: '#4F46E5', fontWeight: '700' },
  bannedBadge: { backgroundColor: '#FEE2E2', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  bannedBadgeText: { fontSize: 10, color: '#DC2626', fontWeight: '700' },
  userActions: { flexDirection: 'row', gap: 6 },
  userActionBtn: {
    width: 32, height: 32, borderRadius: 8, borderWidth: 1,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  userActionBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  userActionBtnBan: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  // 報告
  reportCard: {
    backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 6,
  },
  reportHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  reportDate: { fontSize: 11, color: Colors.textLight },
  reportReason: { fontSize: 14, fontWeight: '600', color: Colors.text },
  reportTarget: { fontSize: 12, color: Colors.textLight },
  noteInput: {
    backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    padding: 14, fontSize: 14, color: Colors.text, minHeight: 80, textAlignVertical: 'top',
  },
  statusBtns: { flexDirection: 'row', gap: 8 },
  statusBtn: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  statusBtnText: { fontSize: 13, fontWeight: '700' },
  btnDisabled: { opacity: 0.45 },
  // アナウンス
  annTitleInput: { padding: 14, fontSize: 15, fontWeight: '700', color: Colors.text },
  annBodyInput: { padding: 14, fontSize: 14, color: Colors.text, minHeight: 100 },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14,
  },
  sendBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  annCard: {
    backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 6,
  },
  annCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  annTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, flex: 1 },
  annBody: { fontSize: 13, color: Colors.textLight, lineHeight: 18 },
  annDate: { fontSize: 11, color: Colors.textLight },
  // フラグ
  flagRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 12,
  },
  flagKey: { fontSize: 14, fontWeight: '700', color: Colors.text, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  flagDesc: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  addFlagBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
})
