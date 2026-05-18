import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, KeyboardAvoidingView, Platform, Switch
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

type AutoResponse = {
  id: string
  keyword: string
  response_text: string
  is_active: boolean
  match_count: number
}

export default function AutoResponsesScreen() {
  const [rules, setRules] = useState<AutoResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [editing, setEditing] = useState<Partial<AutoResponse> | null>(null)
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
    setRules(data ?? [])
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const openNew = () => {
    setEditing({ keyword: '', response_text: '', is_active: true })
    setModalVisible(true)
  }

  const openEdit = (rule: AutoResponse) => {
    setEditing({ ...rule })
    setModalVisible(true)
  }

  const handleSave = async () => {
    if (!editing?.keyword?.trim() || !editing?.response_text?.trim() || !userId) return
    setSaving(true)

    if (editing.id) {
      await supabase.from('auto_responses').update({
        keyword: editing.keyword.trim(),
        response_text: editing.response_text.trim(),
        is_active: editing.is_active,
      }).eq('id', editing.id)
    } else {
      await supabase.from('auto_responses').insert({
        creator_id: userId,
        keyword: editing.keyword.trim(),
        response_text: editing.response_text.trim(),
        is_active: true,
      })
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
    Alert.alert('削除', `「${rule.keyword}」のルールを削除しますか？`, [
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
          フォロワーからのDMに特定のキーワードが含まれていると、自動で返信します。
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
                  <View style={styles.keywordBadge}>
                    <Ionicons name="key-outline" size={12} color={Colors.accent} />
                    <Text style={styles.keywordText}>{item.keyword}</Text>
                  </View>
                  <Text style={styles.matchCount}>{item.match_count}回マッチ</Text>
                </View>
                <Text style={styles.responsePreview} numberOfLines={2}>{item.response_text}</Text>
              </View>
              <View style={styles.cardActions}>
                <Switch
                  value={item.is_active}
                  onValueChange={() => handleToggle(item)}
                  trackColor={{ false: Colors.border, true: Colors.button }}
                  thumbColor={Colors.white}
                />
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
                disabled={!editing?.keyword?.trim() || !editing?.response_text?.trim() || saving}
              >
                <Text style={[styles.modalSave, (!editing?.keyword?.trim() || !editing?.response_text?.trim() || saving) && { opacity: 0.4 }]}>
                  {saving ? '保存中' : '保存'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.fieldLabel}>キーワード</Text>
              <TextInput
                style={styles.input}
                placeholder="例: 申込み、詳細、料金"
                placeholderTextColor={Colors.textLight}
                value={editing?.keyword ?? ''}
                onChangeText={text => setEditing(prev => ({ ...prev, keyword: text }))}
              />
              <Text style={styles.fieldHint}>このキーワードを含むDMが届いたら自動返信します</Text>

              <Text style={styles.fieldLabel}>返信内容</Text>
              <TextInput
                style={styles.textarea}
                placeholder="自動返信するメッセージを入力..."
                placeholderTextColor={Colors.textLight}
                value={editing?.response_text ?? ''}
                onChangeText={text => setEditing(prev => ({ ...prev, response_text: text }))}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
            </View>
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
  keywordRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  keywordBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.background, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  keywordText: { fontSize: 12, fontWeight: '700', color: Colors.accent },
  matchCount: { fontSize: 11, color: Colors.textLight },
  responsePreview: { fontSize: 13, color: Colors.textLight, lineHeight: 18 },
  cardActions: { flexDirection: 'column', alignItems: 'center', gap: 8 },
  deleteBtn: { padding: 4 },
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
  modalBody: { padding: 16, gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  fieldHint: { fontSize: 11, color: Colors.textLight, marginTop: -4 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    padding: 12, fontSize: 15, color: Colors.text, backgroundColor: Colors.white,
  },
  textarea: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    padding: 14, fontSize: 15, color: Colors.text, backgroundColor: Colors.white,
    minHeight: 140,
  },
})
