import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, KeyboardAvoidingView, Platform
} from 'react-native'
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

type StepMessage = {
  id: string
  day_offset: number
  content: string
  sort_order: number
}

export default function StepSequenceEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [name, setName] = useState('')
  const [messages, setMessages] = useState<StepMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingMsg, setEditingMsg] = useState<Partial<StepMessage> | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [{ data: seq }, { data: msgs }] = await Promise.all([
      supabase.from('step_sequences').select('name').eq('id', id).single(),
      supabase.from('step_messages').select('*').eq('sequence_id', id).order('day_offset').order('sort_order'),
    ])
    setName(seq?.name ?? '')
    setMessages(msgs ?? [])
    setLoading(false)
  }, [id])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const openNew = () => {
    setEditingMsg({ day_offset: 0, content: '' })
    setModalVisible(true)
  }

  const openEdit = (msg: StepMessage) => {
    setEditingMsg({ ...msg })
    setModalVisible(true)
  }

  const handleSave = async () => {
    if (!editingMsg?.content?.trim()) return
    setSaving(true)

    if (editingMsg.id) {
      // 更新
      await supabase.from('step_messages').update({
        day_offset: editingMsg.day_offset,
        content: editingMsg.content.trim(),
      }).eq('id', editingMsg.id)
    } else {
      // 新規
      await supabase.from('step_messages').insert({
        sequence_id: id,
        day_offset: editingMsg.day_offset ?? 0,
        content: editingMsg.content?.trim(),
        sort_order: messages.length,
      })
    }

    setSaving(false)
    setModalVisible(false)
    setEditingMsg(null)
    load()
  }

  const handleDelete = (msg: StepMessage) => {
    Alert.alert('削除', 'このメッセージを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          await supabase.from('step_messages').delete().eq('id', msg.id)
          setMessages(prev => prev.filter(m => m.id !== msg.id))
        },
      },
    ])
  }

  const dayLabel = (offset: number) => {
    if (offset === 0) return 'フォロー直後'
    return `フォロー後 ${offset}日目`
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
        <Text style={styles.headerTitle} numberOfLines={1}>{name}</Text>
        <TouchableOpacity onPress={openNew} style={styles.addButton}>
          <Ionicons name="add" size={24} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      {messages.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubble-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyText}>メッセージを追加してください</Text>
          <Text style={styles.emptySubText}>フォロー後のタイミングを指定して{'\n'}メッセージを自動送信できます</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={openNew}>
            <Text style={styles.emptyBtnText}>追加する</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <View style={styles.stepRow}>
              <View style={styles.stepLeft}>
                <View style={styles.stepDot} />
                {index < messages.length - 1 && <View style={styles.stepLine} />}
              </View>
              <TouchableOpacity
                style={styles.stepCard}
                onPress={() => openEdit(item)}
                activeOpacity={0.7}
              >
                <View style={styles.stepCardHeader}>
                  <View style={styles.dayBadge}>
                    <Ionicons name="time-outline" size={12} color={Colors.accent} />
                    <Text style={styles.dayText}>{dayLabel(item.day_offset)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={16} color="#E53E3E" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.stepContent} numberOfLines={3}>{item.content}</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => { setModalVisible(false); setEditingMsg(null) }}>
                <Text style={styles.modalCancel}>キャンセル</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{editingMsg?.id ? '編集' : '新しいメッセージ'}</Text>
              <TouchableOpacity
                onPress={handleSave}
                disabled={!editingMsg?.content?.trim() || saving}
              >
                <Text style={[styles.modalSave, (!editingMsg?.content?.trim() || saving) && { opacity: 0.4 }]}>
                  {saving ? '保存中' : '保存'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.fieldLabel}>送信タイミング</Text>
              <View style={styles.daySelector}>
                {[0, 1, 3, 7, 14, 30].map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.dayChip, editingMsg?.day_offset === d && styles.dayChipActive]}
                    onPress={() => setEditingMsg(prev => ({ ...prev, day_offset: d }))}
                  >
                    <Text style={[styles.dayChipText, editingMsg?.day_offset === d && styles.dayChipTextActive]}>
                      {d === 0 ? '直後' : `${d}日後`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>メッセージ内容</Text>
              <TextInput
                style={styles.textarea}
                placeholder="送信するメッセージを入力..."
                placeholderTextColor={Colors.textLight}
                value={editingMsg?.content ?? ''}
                onChangeText={text => setEditingMsg(prev => ({ ...prev, content: text }))}
                multiline
                numberOfLines={8}
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
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  addButton: { padding: 4, width: 32, alignItems: 'flex-end' },
  list: { padding: 16, paddingBottom: 40 },
  stepRow: { flexDirection: 'row', gap: 12, minHeight: 80 },
  stepLeft: { alignItems: 'center', paddingTop: 16, width: 16 },
  stepDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.accent },
  stepLine: { flex: 1, width: 2, backgroundColor: Colors.border, marginTop: 4 },
  stepCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 12, gap: 8,
  },
  stepCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.background, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  dayText: { fontSize: 11, fontWeight: '700', color: Colors.accent },
  stepContent: { fontSize: 13, color: Colors.text, lineHeight: 19 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
  emptyText: { fontSize: 15, fontWeight: '700', color: Colors.text },
  emptySubText: { fontSize: 13, color: Colors.textLight, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { backgroundColor: Colors.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 4 },
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
  modalBody: { padding: 16, gap: 12, flex: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  daySelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  dayChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  dayChipText: { fontSize: 13, color: Colors.textLight, fontWeight: '600' },
  dayChipTextActive: { color: '#fff' },
  textarea: {
    flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    padding: 14, fontSize: 15, color: Colors.text, backgroundColor: Colors.white,
    minHeight: 160,
  },
})
