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

export default function AutoResponsesScreen() {
  const [rules, setRules] = useState<AutoResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [editing, setEditing] = useState<Partial<AutoResponse> & { keywords: string[] } | null>(null)
  const [keywordInput, setKeywordInput] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data } = await supabase
      .from('auto_responses')
      .select('*')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false })
    // keywords列がない場合はkeywordから補完
    const normalized = (data ?? []).map((r: any) => ({
      ...r,
      keywords: (r.keywords && r.keywords.length > 0) ? r.keywords : (r.keyword ? [r.keyword] : []),
    }))
    setRules(normalized)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const openNew = () => {
    setEditing({ keywords: [], response_text: '', is_active: true })
    setKeywordInput('')
    setModalVisible(true)
  }

  const openEdit = (rule: AutoResponse) => {
    setEditing({ ...rule, keywords: [...rule.keywords] })
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
    setSaving(true)

    const payload = {
      keywords: editing.keywords,
      keyword: editing.keywords[0],   // 後方互換
      response_text: editing.response_text.trim(),
      is_active: editing.is_active ?? true,
    }

    if (editing.id) {
      await supabase.from('auto_responses').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('auto_responses').insert({ creator_id: userId, ...payload, match_count: 0 })
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
          setRules(prev => prev.filter(r => r.id !== rule.id))
        },
      },
    ])
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
        <Text style={styles.headerTitle}>自動応答</Text>
        <TouchableOpacity onPress={openNew} style={styles.addButton}>
          <Ionicons name="add" size={24} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={16} color={Colors.textLight} />
        <Text style={styles.infoText}>
          フォロワーからのDMにキーワードが含まれると自動返信します。1つのルールに複数のキーワードを設定できます。
        </Text>
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
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => openEdit(item)} activeOpacity={0.7}>
              <View style={styles.cardBody}>
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
              </View>
              <View style={styles.cardActions}>
                <ToggleSwitch value={item.is_active} onChange={() => handleToggle(item)} />
                <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={18} color="#E53E3E" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

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
              >
                <Text style={[styles.modalSave, (!editing?.keywords.length || !editing?.response_text?.trim() || saving) && { opacity: 0.4 }]}>
                  {saving ? '保存中' : '保存'}
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>キーワード（複数設定可）</Text>
              {/* 追加済みキーワードチップ */}
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
              {/* キーワード入力 */}
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
              <Text style={styles.fieldHint}>いずれかのキーワードを含むDMが届いたら自動返信します</Text>

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
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  addButton: { padding: 4, width: 32, alignItems: 'flex-end' },
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
    padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
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
    backgroundColor: Colors.header, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalCancel: { fontSize: 16, color: Colors.textLight },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  modalSave: { fontSize: 16, color: Colors.accent, fontWeight: '700' },
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
})
