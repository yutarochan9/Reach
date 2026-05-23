import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Switch, Platform,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

type Tab = 'reports' | 'flags'
type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed'

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

type FeatureFlag = {
  id: string
  key: string
  enabled: boolean
  description: string | null
}

const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: '未対応',
  reviewed: '確認済',
  resolved: '対応済',
  dismissed: '却下',
}
const STATUS_COLORS: Record<ReportStatus, string> = {
  pending: '#D97706',
  reviewed: '#2563EB',
  resolved: '#38A169',
  dismissed: Colors.textLight,
}

export default function AdminScreen() {
  const [tab, setTab] = useState<Tab>('reports')
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [adminNote, setAdminNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/(tabs)' as any); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!profile?.is_admin) {
      setIsAdmin(false)
      setLoading(false)
      return
    }
    setIsAdmin(true)

    const [{ data: rData }, { data: fData }] = await Promise.all([
      supabase
        .from('reports')
        .select(`
          id, reason, details, status, admin_note, created_at,
          reporter:profiles!reports_reporter_id_fkey(display_name, username),
          reported_user:profiles!reports_reported_user_id_fkey(display_name, username),
          reported_broadcast:broadcasts!reports_reported_broadcast_id_fkey(content)
        `)
        .order('created_at', { ascending: false }),
      supabase
        .from('feature_flags')
        .select('id, key, enabled, description')
        .order('key'),
    ])

    setReports((rData as any[]) ?? [])
    setFlags((fData as FeatureFlag[]) ?? [])
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const handleUpdateStatus = async (report: Report, status: ReportStatus) => {
    setSavingNote(true)
    await supabase.from('reports').update({
      status,
      admin_note: adminNote.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', report.id)
    setSavingNote(false)
    setSelectedReport(null)
    load()
  }

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

  // 管理者チェック前
  if (isAdmin === null || loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  // 非管理者
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

  // 報告詳細モーダル
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
        <FlatList
          data={[1]}
          keyExtractor={() => 'detail'}
          contentContainerStyle={styles.content}
          renderItem={() => (
            <View style={{ gap: 12 }}>
              <View style={styles.section}>
                <InfoRow label="報告者" value={`${selectedReport.reporter?.display_name} (@${selectedReport.reporter?.username})`} />
                <View style={styles.divider} />
                {selectedReport.reported_user && (
                  <InfoRow label="対象ユーザー" value={`${selectedReport.reported_user.display_name} (@${selectedReport.reported_user.username})`} />
                )}
                {selectedReport.reported_broadcast && (
                  <>
                    <View style={styles.divider} />
                    <InfoRow label="対象投稿" value={selectedReport.reported_broadcast.content.slice(0, 80)} />
                  </>
                )}
                <View style={styles.divider} />
                <InfoRow label="理由" value={selectedReport.reason} />
                {selectedReport.details && (
                  <>
                    <View style={styles.divider} />
                    <InfoRow label="詳細" value={selectedReport.details} />
                  </>
                )}
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
                multiline
                numberOfLines={3}
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
            </View>
          )}
        />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>管理者画面</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* タブ */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tabItem, tab === 'reports' && styles.tabActive]} onPress={() => setTab('reports')}>
          <Text style={[styles.tabText, tab === 'reports' && styles.tabTextActive]}>報告</Text>
          {reports.filter(r => r.status === 'pending').length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{reports.filter(r => r.status === 'pending').length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, tab === 'flags' && styles.tabActive]} onPress={() => setTab('flags')}>
          <Text style={[styles.tabText, tab === 'flags' && styles.tabTextActive]}>機能フラグ</Text>
        </TouchableOpacity>
      </View>

      {tab === 'reports' ? (
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
                  <Text style={[styles.statusPillText, { color: STATUS_COLORS[item.status] }]}>
                    {STATUS_LABELS[item.status]}
                  </Text>
                </View>
                <Text style={styles.reportDate}>{new Date(item.created_at).toLocaleDateString('ja-JP')}</Text>
              </View>
              <Text style={styles.reportReason}>{item.reason}</Text>
              {item.reported_user && (
                <Text style={styles.reportTarget}>対象: {item.reported_user.display_name}</Text>
              )}
              {item.reported_broadcast && (
                <Text style={styles.reportTarget} numberOfLines={1}>
                  投稿: {item.reported_broadcast.content}
                </Text>
              )}
            </TouchableOpacity>
          )}
        />
      ) : (
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
              <Switch
                value={item.enabled}
                onValueChange={() => toggleFlag(item)}
                trackColor={{ false: Colors.border, true: Colors.button }}
                thumbColor={Colors.white}
              />
            </View>
          )}
        />
      )}
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
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.white },
  tabItem: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 14 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  tabText: { fontSize: 14, fontWeight: '600', color: Colors.textLight },
  tabTextActive: { color: Colors.accent },
  badge: { backgroundColor: '#E53E3E', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '800', color: Colors.white },
  content: { padding: 16, gap: 10 },
  empty: { textAlign: 'center', color: Colors.textLight, paddingTop: 40 },
  reportCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 6,
  },
  reportHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  reportDate: { fontSize: 11, color: Colors.textLight },
  reportReason: { fontSize: 14, fontWeight: '600', color: Colors.text },
  reportTarget: { fontSize: 12, color: Colors.textLight },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 12,
  },
  flagKey: { fontSize: 14, fontWeight: '700', color: Colors.text, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  flagDesc: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  addFlagBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  section: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: Colors.border },
  infoRow: { flexDirection: 'row', padding: 14, gap: 8 },
  infoLabel: { width: 100, fontSize: 13, color: Colors.textLight, fontWeight: '500' },
  infoValue: { flex: 1, fontSize: 13, color: Colors.text },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 4,
  },
  noteInput: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    fontSize: 14,
    color: Colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  statusBtns: { flexDirection: 'row', gap: 8 },
  statusBtn: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  statusBtnText: { fontSize: 13, fontWeight: '700' },
  btnDisabled: { opacity: 0.45 },
})
