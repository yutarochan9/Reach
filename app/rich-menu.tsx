import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, KeyboardAvoidingView, Platform, Switch
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

type RichMenuButton = {
  id: string
  label: string
  url: string
  icon: string
  bgColor?: string
  textColor?: string
}

const ICON_OPTIONS = [
  { name: 'link-outline', label: 'リンク' },
  { name: 'globe-outline', label: 'Web' },
  { name: 'mail-outline', label: 'メール' },
  { name: 'call-outline', label: '電話' },
  { name: 'cart-outline', label: 'ショップ' },
  { name: 'calendar-outline', label: '予約' },
  { name: 'document-text-outline', label: '資料' },
  { name: 'gift-outline', label: 'プレゼント' },
  { name: 'star-outline', label: 'お気に入り' },
  { name: 'information-circle-outline', label: '情報' },
]

const COLOR_OPTIONS = [
  { bg: '#2C2C2E', text: '#FFFFFF', label: 'ダーク' },
  { bg: '#1C1C1E', text: '#FFFFFF', label: 'ブラック' },
  { bg: '#38A169', text: '#FFFFFF', label: 'グリーン' },
  { bg: '#028090', text: '#FFFFFF', label: 'ティール' },
  { bg: '#3182CE', text: '#FFFFFF', label: 'ブルー' },
  { bg: '#E53E3E', text: '#FFFFFF', label: 'レッド' },
  { bg: '#DD6B20', text: '#FFFFFF', label: 'オレンジ' },
  { bg: '#805AD5', text: '#FFFFFF', label: 'パープル' },
  { bg: '#FFFFFF', text: '#2D3748', label: 'ホワイト' },
  { bg: '#F4F6FA', text: '#2D3748', label: 'ライト' },
]

const genId = () => Math.random().toString(36).slice(2)

export default function RichMenuScreen() {
  const [isActive, setIsActive] = useState(false)
  const [buttons, setButtons] = useState<RichMenuButton[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingBtn, setEditingBtn] = useState<Partial<RichMenuButton> | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data } = await supabase
      .from('rich_menus')
      .select('*')
      .eq('creator_id', user.id)
      .single()
    if (data) {
      setMenuId(data.id)
      setIsActive(data.is_active)
      setButtons(data.buttons ?? [])
    }
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const handleSave = async () => {
    if (!userId) return
    setSaving(true)
    if (menuId) {
      await supabase.from('rich_menus').update({ buttons, is_active: isActive, updated_at: new Date().toISOString() }).eq('id', menuId)
    } else {
      const { data } = await supabase.from('rich_menus').insert({ creator_id: userId, buttons, is_active: isActive }).select().single()
      if (data) setMenuId(data.id)
    }
    setSaving(false)
    Alert.alert('保存しました', 'タイルが更新されました')
  }

  const openNew = () => {
    if (buttons.length >= 6) { Alert.alert('上限', 'ボタンは最大6個です'); return }
    setEditingBtn({ label: '', url: '', icon: 'link-outline', id: genId() })
    setModalVisible(true)
  }

  const openEdit = (btn: RichMenuButton) => {
    setEditingBtn({ ...btn })
    setModalVisible(true)
  }

  const handleSaveBtn = () => {
    if (!editingBtn?.label?.trim() || !editingBtn?.url?.trim()) return
    const updated = { ...editingBtn, label: editingBtn.label.trim(), url: editingBtn.url.trim() } as RichMenuButton
    setButtons(prev => {
      const exists = prev.find(b => b.id === updated.id)
      return exists ? prev.map(b => b.id === updated.id ? updated : b) : [...prev, updated]
    })
    setModalVisible(false)
    setEditingBtn(null)
  }

  const handleDeleteBtn = (id: string) => {
    setButtons(prev => prev.filter(b => b.id !== id))
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
        <Text style={styles.headerTitle}>タイル</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={styles.saveButton}
        >
          {saving ? <ActivityIndicator size="small" color={Colors.accent} /> : <Text style={styles.saveText}>保存</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>メニューを表示</Text>
              <Text style={styles.toggleDesc}>プロフィール画面にボタンを表示します</Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              trackColor={{ false: Colors.border, true: Colors.button }}
              thumbColor={Colors.white}
            />
          </View>
        </View>

        {/* プレビュー */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>プレビュー</Text>
          {buttons.length === 0 ? (
            <View style={styles.previewEmpty}>
              <Text style={styles.previewEmptyText}>ボタンを追加してください</Text>
            </View>
          ) : (
            <View style={styles.previewGrid}>
              {buttons.map(btn => (
                <View key={btn.id} style={[styles.previewBtn, { backgroundColor: btn.bgColor ?? '#2C2C2E' }]}>
                  <Ionicons name={btn.icon as any} size={22} color={btn.textColor ?? '#FFFFFF'} />
                  <Text style={[styles.previewBtnLabel, { color: btn.textColor ?? '#FFFFFF' }]} numberOfLines={1}>{btn.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ボタン一覧 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>ボタン ({buttons.length}/6)</Text>
            <TouchableOpacity onPress={openNew} style={styles.addBtn}>
              <Ionicons name="add" size={16} color={Colors.accent} />
              <Text style={styles.addBtnText}>追加</Text>
            </TouchableOpacity>
          </View>

          {buttons.map((btn, idx) => (
            <View key={btn.id} style={styles.btnRow}>
              <Ionicons name={btn.icon as any} size={20} color={Colors.accent} />
              <View style={styles.btnInfo}>
                <Text style={styles.btnLabel}>{btn.label}</Text>
                <Text style={styles.btnUrl} numberOfLines={1}>{btn.url}</Text>
              </View>
              <TouchableOpacity onPress={() => openEdit(btn)} style={styles.editIcon}>
                <Ionicons name="pencil-outline" size={16} color={Colors.textLight} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeleteBtn(btn.id)} style={styles.editIcon}>
                <Ionicons name="trash-outline" size={16} color="#E53E3E" />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <Text style={styles.note}>
          ※ ボタンは最大6個まで設定できます。{'\n'}
          ※ URLには https:// から始まるリンクを入力してください。
        </Text>
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => { setModalVisible(false); setEditingBtn(null) }}>
                <Text style={styles.modalCancel}>キャンセル</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>ボタン設定</Text>
              <TouchableOpacity
                onPress={handleSaveBtn}
                disabled={!editingBtn?.label?.trim() || !editingBtn?.url?.trim()}
              >
                <Text style={[styles.modalSave, (!editingBtn?.label?.trim() || !editingBtn?.url?.trim()) && { opacity: 0.4 }]}>
                  完了
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalBody}>
              <Text style={styles.fieldLabel}>アイコン</Text>
              <View style={styles.iconGrid}>
                {ICON_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.name}
                    style={[styles.iconOption, editingBtn?.icon === opt.name && styles.iconOptionActive]}
                    onPress={() => setEditingBtn(prev => ({ ...prev, icon: opt.name }))}
                  >
                    <Ionicons name={opt.name as any} size={22} color={editingBtn?.icon === opt.name ? '#fff' : Colors.accent} />
                    <Text style={[styles.iconLabel, editingBtn?.icon === opt.name && { color: '#fff' }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>ボタンの色</Text>
              <View style={styles.colorGrid}>
                {COLOR_OPTIONS.map((opt, i) => {
                  const isSelected = (editingBtn?.bgColor ?? '#2C2C2E') === opt.bg
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.colorOption, { backgroundColor: opt.bg }, isSelected && styles.colorOptionActive]}
                      onPress={() => setEditingBtn(prev => ({ ...prev, bgColor: opt.bg, textColor: opt.text }))}
                    >
                      {isSelected && <Ionicons name="checkmark" size={16} color={opt.text} />}
                    </TouchableOpacity>
                  )
                })}
              </View>

              <Text style={styles.fieldLabel}>ラベル</Text>
              <TextInput
                style={styles.input}
                placeholder="例: 公式サイト"
                placeholderTextColor={Colors.textLight}
                value={editingBtn?.label ?? ''}
                onChangeText={text => setEditingBtn(prev => ({ ...prev, label: text }))}
                maxLength={12}
              />

              <Text style={styles.fieldLabel}>リンク先URL</Text>
              <TextInput
                style={styles.input}
                placeholder="https://example.com"
                placeholderTextColor={Colors.textLight}
                value={editingBtn?.url ?? ''}
                onChangeText={text => setEditingBtn(prev => ({ ...prev, url: text }))}
                autoCapitalize="none"
                keyboardType="url"
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
  backButton: { padding: 4, width: 40 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  saveButton: { width: 40, alignItems: 'flex-end' },
  saveText: { fontSize: 16, color: Colors.accent, fontWeight: '700' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  section: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 12,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
  toggleDesc: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  previewEmpty: { height: 60, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, borderRadius: 10 },
  previewEmptyText: { fontSize: 13, color: Colors.textLight },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  previewBtn: {
    flex: 1, minWidth: '30%', borderRadius: 12,
    padding: 12, alignItems: 'center', gap: 6,
  },
  previewBtnLabel: { fontSize: 11, fontWeight: '600' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorOption: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  colorOptionActive: { borderWidth: 2, borderColor: Colors.accent },
  btnRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  btnInfo: { flex: 1 },
  btnLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  btnUrl: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
  editIcon: { padding: 4 },
  note: { fontSize: 11, color: Colors.textLight, lineHeight: 18, textAlign: 'center' },
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
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconOption: {
    width: '18%', aspectRatio: 1, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  iconOptionActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  iconLabel: { fontSize: 9, color: Colors.textLight },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    padding: 12, fontSize: 15, color: Colors.text, backgroundColor: Colors.white,
  },
})
