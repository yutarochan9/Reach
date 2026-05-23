import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, ActivityIndicator } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

type Settings = {
  messages: boolean
  reactions: boolean
  follows: boolean
  show_preview: boolean
  quiet_hours_enabled: boolean
  quiet_hours_start: string
  quiet_hours_end: string
}

const DEFAULT_SETTINGS: Settings = {
  messages: true,
  reactions: true,
  follows: true,
  show_preview: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
}

export default function NotificationSettingsScreen() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('notification_settings')
      .eq('id', user.id)
      .single()
    if (data?.notification_settings) {
      setSettings({ ...DEFAULT_SETTINGS, ...data.notification_settings })
    }
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const updateSetting = async (key: keyof Settings, value: boolean | string) => {
    const next = { ...settings, [key]: value }
    setSettings(next)
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles')
        .update({ notification_settings: next })
        .eq('id', user.id)
    }
    setSaving(false)
  }

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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>通知設定</Text>
        <View style={{ width: 32 }}>
          {saving && <ActivityIndicator size="small" color={Colors.accent} />}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>通知の種類</Text>
        <View style={styles.section}>
          <ToggleRow
            icon="chatbubble-outline"
            label="メッセージ"
            desc="新しいDMを受け取ったとき"
            value={settings.messages}
            onChange={(v) => updateSetting('messages', v)}
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="heart-outline"
            label="リアクション"
            desc="投稿にいいねがついたとき"
            value={settings.reactions}
            onChange={(v) => updateSetting('reactions', v)}
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="person-add-outline"
            label="フォロー"
            desc="新しいフォロワーが増えたとき"
            value={settings.follows}
            onChange={(v) => updateSetting('follows', v)}
          />
        </View>

        <Text style={styles.sectionLabel}>プレビュー表示</Text>
        <View style={styles.section}>
          <ToggleRow
            icon="eye-outline"
            label="メッセージ内容を表示"
            desc="ロック画面・通知センターに本文を表示する"
            value={settings.show_preview}
            onChange={(v) => updateSetting('show_preview', v)}
          />
          {!settings.show_preview && (
            <View style={styles.noteBox}>
              <Text style={styles.noteText}>通知には「新しいメッセージ」とだけ表示されます</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>通知しない時間帯</Text>
        <View style={styles.section}>
          <ToggleRow
            icon="moon-outline"
            label="おやすみモード"
            desc="指定した時間帯は通知を送らない"
            value={settings.quiet_hours_enabled}
            onChange={(v) => updateSetting('quiet_hours_enabled', v)}
          />
          {settings.quiet_hours_enabled && (
            <>
              <View style={styles.divider} />
              <View style={styles.timeRow}>
                <Text style={styles.timeLabel}>開始</Text>
                <TimeSelector
                  value={settings.quiet_hours_start}
                  onChange={(v) => updateSetting('quiet_hours_start', v)}
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.timeRow}>
                <Text style={styles.timeLabel}>終了</Text>
                <TimeSelector
                  value={settings.quiet_hours_end}
                  onChange={(v) => updateSetting('quiet_hours_end', v)}
                />
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

function ToggleRow({
  icon, label, desc, value, onChange,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  desc: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <View style={styles.toggleRow}>
      <Ionicons name={icon} size={18} color={Colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDesc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.border, true: Colors.button }}
        thumbColor={Colors.white}
      />
    </View>
  )
}

const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

function TimeSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <View>
      <TouchableOpacity style={styles.timePicker} onPress={() => setOpen(o => !o)}>
        <Text style={styles.timeValue}>{value}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
      </TouchableOpacity>
      {open && (
        <View style={styles.timeDropdown}>
          <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
            {HOURS.map(h => (
              <TouchableOpacity
                key={h}
                style={[styles.timeOption, h === value && styles.timeOptionActive]}
                onPress={() => { onChange(h); setOpen(false) }}
              >
                <Text style={[styles.timeOptionText, h === value && { color: Colors.accent, fontWeight: '700' }]}>{h}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
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
  content: { padding: 16, gap: 8 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4,
  },
  section: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: 8,
  },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: 46 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  toggleLabel: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  toggleDesc: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
  noteBox: { backgroundColor: '#F0F9FF', padding: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  noteText: { fontSize: 12, color: '#0369A1' },
  timeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  timeLabel: { flex: 1, fontSize: 14, color: Colors.text, fontWeight: '500' },
  timePicker: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border },
  timeValue: { fontSize: 15, fontWeight: '600', color: Colors.accent },
  timeDropdown: { position: 'absolute', right: 0, top: 44, backgroundColor: Colors.white, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, zIndex: 100, width: 100, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 8 },
  timeOption: { paddingVertical: 10, paddingHorizontal: 16 },
  timeOptionActive: { backgroundColor: `${Colors.accent}18` },
  timeOptionText: { fontSize: 14, color: Colors.text },
})
