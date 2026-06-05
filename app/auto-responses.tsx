import { useState, useCallback, useRef, useEffect } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, KeyboardAvoidingView, Platform, Animated, ScrollView
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

type AutoResponse = {
  id: string
  keywords: string[]
  keyword: string
  response_text: string
  is_active: boolean
  match_count: number
  match_type: 'contains' | 'exact'
  priority: number
  time_from: string | null
  time_to: string | null
}

type EditState = Partial<AutoResponse> & {
  keywords: string[]
  match_type: 'contains' | 'exact'
  use_time: boolean
  time_from: string
  time_to: string
}

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current
  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 200, useNativeDriver: false }).start()
  }, [value])
  const thumbX = anim.interpolate({ inputRange: [0, 1], outputRange: [3, 27] })
  const trackBg = anim.interpolate({ inputRange: [0, 1], outputRange: ['#D1D5DB', Colors.accent] })
  return (
    <TouchableOpacity onPress={() => onChange(!value)} activeOpacity={0.85}>
      <Animated.View style={[styles.toggleTrack, { backgroundColor: trackBg }]}>
        <Animated.View style={[styles.toggleThumb, { transform: [{ translateX: thumbX }] }]} />
      </Animated.View>
    </TouchableOpacity>
  )
}

function SegmentControl({
  options, value, onChange,
}: { options: { label: string; value: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={seg.wrap}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt.value}
          style={[seg.item, value === opt.value && seg.itemActive]}
          onPress={() => onChange(opt.value)}
          activeOpacity={0.7}
        >
          <Text style={[seg.label, value === opt.value && seg.labelActive]}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export default function AutoResponsesScreen() {
  const [rules, setRules] = useState<AutoResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [keywordInput, setKeywordInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [escalationEnabled, setEscalationEnabled] = useState(false)
  const [savingEscalation, setSavingEscalation] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const [{ data }, { data: profile }] = await Promise.all([
      supabase.from('auto_responses').select('*').eq('creator_id', user.id).order('priority', { ascending: true }),
      supabase.from('profiles').select('escalation_button_enabled').eq('id', user.id).single(),
    ])
    const normalized = (data ?? []).map((r: any) => ({
      ...r,
      keywords: (r.keywords && r.keywords.length > 0) ? r.keywords : (r.keyword ? [r.keyword] : []),
      match_type: r.match_type ?? 'contains',
      priority: r.priority ?? 0,
      time_from: r.time_from ? r.time_from.slice(0, 5) : null,
      time_to: r.time_to ? r.time_to.slice(0, 5) : null,
    }))
    setRules(normalized)
    setEscalationEnabled(profile?.escalation_button_enabled ?? false)
    setLoading(false)
  }, [])

  const handleEscalationToggle = async (val: boolean) => {
    setSavingEscalation(true)
    setEscalationEnabled(val)
    await supabase.from('profiles').update({ escalation_button_enabled: val }).eq('id', userId!)
    setSavingEscalation(false)
  }

  useFocusEffect(useCallback(() => { load() }, [load]))

  const openNew = () => {
    setEditing({
      keywords: [], response_text: '', is_active: true,
      match_type: 'contains', use_time: false, time_from: '09:00', time_to: '18:00',
    })
    setKeywordInput('')
    setModalVisible(true)
  }

  const openEdit = (rule: AutoResponse) => {
    setEditing({
      ...rule,
      keywords: [...rule.keywords],
      match_type: rule.match_type ?? 'contains',
      use_time: !!(rule.time_from && rule.time_to),
      time_from: rule.time_from ?? '09:00',
      time_to: rule.time_to ?? '18:00',
    })
    setKeywordInput('')
    setModalVisible(true)
  }

  const addKeyword = () => {
    const kw = keywordInput.trim()
    if (!kw || !editing) return
    if (editing.keywords.includes(kw)) { setKeywordInput(''); return }
    setEditing(prev => prev ? { ...prev, keywords: [...prev.keywords, kw] } : prev)
    setKeywordInput('')
  }

  const removeKeyword = (kw: string) => {
    setEditing(prev => prev ? { ...prev, keywords: prev.keywords.filter(k => k !== kw) } : prev)
  }

  const handleSave = async () => {
    if (!editing?.keywords.length || !editing?.response_text?.trim() || !userId) return
    if (editing.use_time && (!TIME_RE.test(editing.time_from) || !TIME_RE.test(editing.time_to))) {
      Alert.alert('エラー', '時刻はHH:MM形式（例: 09:00）で入力してください')
      return
    }
    setSaving(true)

    const payload: Record<string, any> = {
      keywords: editing.keywords,
      keyword: editing.keywords[0],
      response_text: editing.response_text.trim(),
      is_active: editing.is_active ?? true,
      match_type: editing.match_type,
      time_from: editing.use_time ? editing.time_from : null,
      time_to: editing.use_time ? editing.time_to : null,
    }

    if (editing.id) {
      await supabase.from('auto_responses').update(payload).eq('id', editing.id)
    } else {
      payload.creator_id = userId
      payload.match_count = 0
      payload.priority = rules.length
      await supabase.from('auto_responses').insert(payload)
    }

    setSaving(false)
    setModalVisible(false)
    setEditing(null)
    load()
  }

  const handleToggle = async (rule: AutoResponse) => {
    await supabase.from('auto_responses').update({ is_active: !rule.is_active }).eq('id', rule.id)
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r))
  }

  const handleDelete = (rule: AutoResponse) => {
    const label = rule.keywords[0] ?? rule.keyword
    Alert.alert('削除', `「${label}」のルールを削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          await supabase.from('auto_responses').delete().eq('id', rule.id)
          const updated = rules.filter(r => r.id !== rule.id)
          await Promise.all(updated.map((r, i) =>
            supabase.from('auto_responses').update({ priority: i }).eq('id', r.id)
          ))
          setRules(updated.map((r, i) => ({ ...r, priority: i })))
        },
      },
    ])
  }

  const handleMove = async (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= rules.length) return
    const newRules = [...rules]
    ;[newRules[index], newRules[next]] = [newRules[next], newRules[index]]
    await Promise.all(newRules.map((r, i) =>
      supabase.from('auto_responses').update({ priority: i }).eq('id', r.id)
    ))
    setRules(newRules.map((r, i) => ({ ...r, priority: i })))
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
        <TouchableOpacity onPress={() => router.push('/(tabs)/compose?tab=tools' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>自動応答</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/compose?tab=tools' as any)} style={styles.saveButton}>
          <Text style={styles.saveButtonText}>保存</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={16} color={Colors.textLight} />
        <Text style={styles.infoText}>
          キーワードを含むDMが届くと自動返信します。優先度は上が高く、最初にマッチしたルールが使われます。
        </Text>
      </View>

      {/* 担当者返信要求ボタンの表示設定 */}
      <View style={styles.escalationSection}>
        <View style={styles.escalationRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.escalationLabel}>担当者返信要求ボタンを表示</Text>
            <Text style={styles.escalationDesc}>
              ONにすると、DMの相手が「担当者への対応を依頼する」ボタンを使えるようになります
            </Text>
          </View>
          {savingEscalation ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <ToggleSwitch value={escalationEnabled} onChange={handleEscalationToggle} />
          )}
        </View>
      </View>

      {rules.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyText}>自動応答ルールがありません</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={openNew}>
            <Text style={styles.emptyBtnText}>追加する</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rules}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <View style={styles.card}>
              {/* 優先度ボタン */}
              <View style={styles.orderCol}>
                <TouchableOpacity
                  onPress={() => handleMove(index, -1)}
                  disabled={index === 0}
                  style={[styles.orderBtn, index === 0 && { opacity: 0.2 }]}
                >
                  <Ionicons name="chevron-up" size={16} color={Colors.textLight} />
                </TouchableOpacity>
                <Text style={styles.orderNum}>{index + 1}</Text>
                <TouchableOpacity
                  onPress={() => handleMove(index, 1)}
                  disabled={index === rules.length - 1}
                  style={[styles.orderBtn, index === rules.length - 1 && { opacity: 0.2 }]}
                >
                  <Ionicons name="chevron-down" size={16} color={Colors.textLight} />
                </TouchableOpacity>
              </View>

              {/* カード本体 */}
              <TouchableOpacity style={styles.cardBody} onPress={() => openEdit(item)} activeOpacity={0.7}>
                <View style={styles.keywordRow}>
                  <View style={styles.keywordChips}>
                    {item.keywords.map(kw => (
                      <View key={kw} style={styles.keywordBadge}>
                        <Ionicons name="key-outline" size={11} color={Colors.accent} />
                        <Text style={styles.keywordText}>{kw}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.matchCount}>{item.match_count}回</Text>
                </View>
                <Text style={styles.responsePreview} numberOfLines={2}>{item.response_text}</Text>
                <View style={styles.tagRow}>
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>
                      {item.match_type === 'exact' ? '完全一致' : '部分一致'}
                    </Text>
                  </View>
                  {item.time_from && item.time_to && (
                    <View style={styles.tag}>
                      <Ionicons name="time-outline" size={11} color={Colors.textLight} />
                      <Text style={styles.tagText}>{item.time_from}〜{item.time_to}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              {/* アクション */}
              <View style={styles.cardActions}>
                <ToggleSwitch value={item.is_active} onChange={() => handleToggle(item)} />
                <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={18} color="#E53E3E" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* 新規作成FAB */}
      <TouchableOpacity style={styles.fab} onPress={openNew}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => { setModalVisible(false); setEditing(null) }}>
                <Text style={styles.modalCancel}>キャンセル</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{editing?.id ? '編集' : '新しいルール'}</Text>
              <TouchableOpacity
                onPress={handleSave}
                disabled={!editing?.keywords.length || !editing?.response_text?.trim() || saving}
                style={[styles.saveBtn, (!editing?.keywords.length || !editing?.response_text?.trim() || saving) && { opacity: 0.4 }]}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="checkmark" size={20} color="#fff" />
                }
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">

              {/* キーワード */}
              <Text style={styles.fieldLabel}>キーワード（複数設定可）</Text>
              {(editing?.keywords ?? []).length > 0 && (
                <View style={styles.chipRow}>
                  {(editing?.keywords ?? []).map(kw => (
                    <View key={kw} style={styles.chip}>
                      <Text style={styles.chipText}>{kw}</Text>
                      <TouchableOpacity onPress={() => removeKeyword(kw)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Ionicons name="close" size={13} color={Colors.accent} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.kwInputRow}>
                <TextInput
                  style={styles.kwInput}
                  placeholder="キーワードを入力（例: 申込み）"
                  placeholderTextColor={Colors.textLight}
                  value={keywordInput}
                  onChangeText={setKeywordInput}
                  onSubmitEditing={addKeyword}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[styles.kwAddBtn, !keywordInput.trim() && { opacity: 0.4 }]}
                  onPress={addKeyword}
                  disabled={!keywordInput.trim()}
                >
                  <Text style={styles.kwAddText}>追加</Text>
                </TouchableOpacity>
              </View>

              {/* 一致方法 */}
              <Text style={styles.fieldLabel}>一致方法</Text>
              <SegmentControl
                options={[
                  { label: '部分一致（含む）', value: 'contains' },
                  { label: '完全一致', value: 'exact' },
                ]}
                value={editing?.match_type ?? 'contains'}
                onChange={v => setEditing(prev => prev ? { ...prev, match_type: v as any } : prev)}
              />
              <Text style={styles.fieldHint}>
                {editing?.match_type === 'exact'
                  ? 'キーワードと完全に一致するDMにのみ返信します'
                  : 'キーワードを含むDMに返信します'}
              </Text>

              {/* 返信内容 */}
              <Text style={styles.fieldLabel}>返信内容</Text>
              <TextInput
                style={styles.textarea}
                placeholder="自動返信するメッセージを入力..."
                placeholderTextColor={Colors.textLight}
                value={editing?.response_text ?? ''}
                onChangeText={text => setEditing(prev => prev ? { ...prev, response_text: text } : prev)}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />

              {/* 時間帯設定 */}
              <Text style={styles.fieldLabel}>応答時間帯</Text>
              <SegmentControl
                options={[
                  { label: '常時', value: 'always' },
                  { label: '時間帯を指定', value: 'custom' },
                ]}
                value={editing?.use_time ? 'custom' : 'always'}
                onChange={v => setEditing(prev => prev ? { ...prev, use_time: v === 'custom' } : prev)}
              />
              {editing?.use_time && (
                <View style={styles.timeRow}>
                  <View style={styles.timeField}>
                    <Text style={styles.timeLabel}>開始</Text>
                    <TextInput
                      style={styles.timeInput}
                      value={editing.time_from}
                      onChangeText={t => setEditing(prev => prev ? { ...prev, time_from: t } : prev)}
                      placeholder="09:00"
                      placeholderTextColor={Colors.textLight}
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                    />
                  </View>
                  <Text style={styles.timeSep}>〜</Text>
                  <View style={styles.timeField}>
                    <Text style={styles.timeLabel}>終了</Text>
                    <TextInput
                      style={styles.timeInput}
                      value={editing.time_to}
                      onChangeText={t => setEditing(prev => prev ? { ...prev, time_to: t } : prev)}
                      placeholder="18:00"
                      placeholderTextColor={Colors.textLight}
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                    />
                  </View>
                </View>
              )}
              {editing?.use_time && (
                <Text style={styles.fieldHint}>HH:MM形式で入力（例: 09:00）。日本時間で判定します。</Text>
              )}

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const seg = StyleSheet.create({
  wrap: {
    flexDirection: 'row', borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.background, overflow: 'hidden',
  },
  item: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  itemActive: { backgroundColor: Colors.accent },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textLight },
  labelActive: { color: '#fff' },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: 36, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: Colors.text },
  saveButton: { paddingVertical: 6, paddingHorizontal: 14, backgroundColor: Colors.accent, borderRadius: 10 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  fab: {
    position: 'absolute', right: 20, bottom: 32,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 8,
  },
  infoBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    margin: 16, padding: 12, backgroundColor: Colors.white,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
  },
  infoText: { flex: 1, fontSize: 12, color: Colors.textLight, lineHeight: 18 },
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  orderCol: { alignItems: 'center', gap: 2, width: 24 },
  orderBtn: { padding: 2 },
  orderNum: { fontSize: 11, fontWeight: '700', color: Colors.textLight },
  cardBody: { flex: 1, gap: 6 },
  keywordRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  keywordChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1 },
  keywordBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.background, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.border,
  },
  keywordText: { fontSize: 11, fontWeight: '700', color: Colors.accent },
  matchCount: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
  responsePreview: { fontSize: 13, color: Colors.textLight, lineHeight: 18 },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.background, borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border,
  },
  tagText: { fontSize: 10, color: Colors.textLight, fontWeight: '600' },
  cardActions: { flexDirection: 'column', alignItems: 'center', gap: 8 },
  deleteBtn: { padding: 4 },
  toggleTrack: { width: 54, height: 30, borderRadius: 15, justifyContent: 'center' },
  toggleThumb: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  emptyText: { fontSize: 14, color: Colors.textLight },
  emptyBtn: { backgroundColor: Colors.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    backgroundColor: Colors.header, paddingTop: 36, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalCancel: { fontSize: 16, color: Colors.textLight },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  saveBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  modalBody: { padding: 16, gap: 10, paddingBottom: 40 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  fieldHint: { fontSize: 11, color: Colors.textLight },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.background, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.accent,
  },
  chipText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  kwInputRow: { flexDirection: 'row', gap: 8 },
  kwInput: {
    flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    padding: 12, fontSize: 15, color: Colors.text, backgroundColor: Colors.white,
  },
  kwAddBtn: {
    backgroundColor: Colors.accent, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center',
  },
  kwAddText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  textarea: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    padding: 14, fontSize: 15, color: Colors.text, backgroundColor: Colors.white,
    minHeight: 140,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  timeField: { flex: 1, gap: 4 },
  timeLabel: { fontSize: 11, color: Colors.textLight, fontWeight: '600' },
  timeInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    padding: 12, fontSize: 16, color: Colors.text, backgroundColor: Colors.white, textAlign: 'center',
  },
  timeSep: { fontSize: 16, color: Colors.textLight, marginTop: 18 },
  escalationSection: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 14,
  },
  escalationRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  escalationLabel: { fontSize: 14, fontWeight: '700', color: Colors.text },
  escalationDesc: { fontSize: 12, color: Colors.textLight, lineHeight: 17, marginTop: 2 },
})
