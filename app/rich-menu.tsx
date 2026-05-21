import { useState, useCallback, useRef, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, KeyboardAvoidingView,
  Platform, Image, Animated,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
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
  bgImage?: string
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

const SLOTS = [0, 1, 2, 3, 4, 5]
const genId = () => Math.random().toString(36).slice(2)

// カスタムトグルスイッチ
function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current
  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 200, useNativeDriver: false }).start()
  }, [value])
  const thumbX = anim.interpolate({ inputRange: [0, 1], outputRange: [3, 27] })
  const trackBg = anim.interpolate({ inputRange: [0, 1], outputRange: ['#D1D5DB', '#028090'] })
  return (
    <TouchableOpacity onPress={() => onChange(!value)} activeOpacity={0.85}>
      <Animated.View style={[styles.toggleTrack, { backgroundColor: trackBg }]}>
        <Animated.View style={[styles.toggleThumb, { transform: [{ translateX: thumbX }] }]} />
      </Animated.View>
    </TouchableOpacity>
  )
}

export default function RichMenuScreen() {
  const [isActive, setIsActive] = useState(false)
  const [buttons, setButtons] = useState<RichMenuButton[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingBtn, setEditingBtn] = useState<Partial<RichMenuButton> | null>(null)
  const [uploadingBg, setUploadingBg] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data } = await supabase.from('rich_menus').select('*').eq('creator_id', user.id).single()
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
    router.back()
  }

  // スロットをタップ → 既存ボタンなら編集、空なら新規
  const openSlot = (index: number) => {
    const btn = buttons[index]
    if (btn) {
      setEditingBtn({ ...btn })
    } else {
      if (buttons.length >= 6) return
      setEditingBtn({ label: '', url: '', icon: 'link-outline', bgColor: '#2C2C2E', textColor: '#FFFFFF', id: genId() })
    }
    setModalVisible(true)
  }

  const handleSaveBtn = () => {
    if (!editingBtn?.label?.trim() || !editingBtn?.url?.trim()) return
    const updated = {
      ...editingBtn,
      label: editingBtn.label.trim(),
      url: editingBtn.url.trim(),
    } as RichMenuButton
    setButtons(prev => {
      const exists = prev.find(b => b.id === updated.id)
      return exists ? prev.map(b => b.id === updated.id ? updated : b) : [...prev, updated]
    })
    setModalVisible(false)
    setEditingBtn(null)
  }

  const handleDeleteBtn = (id: string) => {
    Alert.alert('削除', 'このタイルを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => setButtons(prev => prev.filter(b => b.id !== id)) },
    ])
  }

  // 背景画像アップロード
  const pickBgImage = async () => {
    if (!userId) return
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') { Alert.alert('許可が必要です', 'フォトライブラリへのアクセスを許可してください'); return }
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    setUploadingBg(true)
    try {
      const mimeType = asset.mimeType ?? 'image/jpeg'
      const rawExt = asset.uri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg'
      const ext = ['jpg', 'jpeg', 'png', 'webp'].includes(rawExt) ? rawExt : 'jpg'
      const path = `tiles/${userId}/${Date.now()}.${ext}`
      const blob = await (await fetch(asset.uri)).blob()
      const { error } = await supabase.storage.from('broadcast-images').upload(path, blob, { contentType: mimeType, upsert: true })
      if (error) { Alert.alert('アップロードエラー', error.message); return }
      const { data: { publicUrl } } = supabase.storage.from('broadcast-images').getPublicUrl(path)
      setEditingBtn(prev => ({ ...prev, bgImage: publicUrl }))
    } catch {
      Alert.alert('エラー', '画像のアップロードに失敗しました')
    } finally {
      setUploadingBg(false)
    }
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
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>タイル</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveButton}>
          {saving ? <ActivityIndicator size="small" color={Colors.accent} /> : <Text style={styles.saveText}>保存</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 表示切り替えトグル */}
        <View style={styles.toggleCard}>
          <View>
            <Text style={styles.toggleLabel}>メニューを表示</Text>
            <Text style={styles.toggleDesc}>トーク画面にタイルメニューを表示します</Text>
          </View>
          <ToggleSwitch value={isActive} onChange={setIsActive} />
        </View>

        {/* タイルグリッド（プレビュー兼編集） */}
        <View style={styles.gridCard}>
          <Text style={styles.gridCaption}>タップしてタイルを追加・編集（最大6コマ）</Text>
          <View style={styles.tilePanel}>
          <View style={styles.tileGrid}>
            {SLOTS.map(i => {
              const btn = buttons[i]
              if (btn) {
                return (
                  <TouchableOpacity key={btn.id} style={styles.tileSlotWrap} onPress={() => openSlot(i)} activeOpacity={0.85}>
                    <View style={[styles.tileSlot, { backgroundColor: btn.bgColor ?? '#2C2C2E' }]}>
                      {btn.bgImage ? (
                        <Image source={{ uri: btn.bgImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                      ) : null}
                      {/* 画像がある場合は暗めのオーバーレイで文字を見やすく */}
                      {btn.bgImage ? <View style={styles.tileImgOverlay} /> : null}
                      <Ionicons name={btn.icon as any} size={26} color={btn.textColor ?? '#FFFFFF'} />
                      <Text style={[styles.tileLabel, { color: btn.textColor ?? '#FFFFFF' }]} numberOfLines={2}>{btn.label}</Text>
                      {/* 削除ボタン */}
                      <TouchableOpacity style={styles.tileDeleteBtn} onPress={() => handleDeleteBtn(btn.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.85)" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                )
              }
              return (
                <TouchableOpacity key={`empty-${i}`} style={styles.tileSlotWrap} onPress={() => openSlot(i)} activeOpacity={0.7}>
                  <View style={[styles.tileSlot, styles.tileSlotEmpty]}>
                    <Ionicons name="add" size={30} color={Colors.border} />
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
          </View>
        </View>

        <Text style={styles.note}>
          ※ タイルは最大6コマまで設定できます。{'\n'}
          ※ URLには https:// から始まるリンクを入力してください。
        </Text>
      </ScrollView>

      {/* 編集モーダル */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => { setModalVisible(false); setEditingBtn(null) }}>
                <Text style={styles.modalCancel}>キャンセル</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>タイル設定</Text>
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

              {/* ミニプレビュー */}
              <View style={styles.miniPreviewWrap}>
                <View style={[styles.miniPreview, { backgroundColor: editingBtn?.bgColor ?? '#2C2C2E' }]}>
                  {editingBtn?.bgImage ? (
                    <Image source={{ uri: editingBtn.bgImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                  ) : null}
                  {editingBtn?.bgImage ? <View style={styles.tileImgOverlay} /> : null}
                  <Ionicons name={(editingBtn?.icon ?? 'link-outline') as any} size={28} color={editingBtn?.textColor ?? '#FFFFFF'} />
                  <Text style={[styles.miniPreviewLabel, { color: editingBtn?.textColor ?? '#FFFFFF' }]} numberOfLines={2}>
                    {editingBtn?.label || 'ラベル'}
                  </Text>
                </View>
              </View>

              {/* 背景画像 */}
              <Text style={styles.fieldLabel}>背景画像</Text>
              <View style={styles.bgImageRow}>
                {editingBtn?.bgImage ? (
                  <>
                    <Image source={{ uri: editingBtn.bgImage }} style={styles.bgImageThumb} resizeMode="cover" />
                    <TouchableOpacity style={styles.bgImageBtn} onPress={pickBgImage} disabled={uploadingBg}>
                      {uploadingBg ? <ActivityIndicator size="small" color={Colors.accent} /> : <Text style={styles.bgImageBtnText}>変更</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.bgImageBtn, styles.bgImageBtnDel]} onPress={() => setEditingBtn(prev => ({ ...prev, bgImage: undefined }))}>
                      <Text style={styles.bgImageBtnDelText}>削除</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={styles.bgImagePicker} onPress={pickBgImage} disabled={uploadingBg}>
                    {uploadingBg
                      ? <ActivityIndicator size="small" color={Colors.accent} />
                      : <><Ionicons name="image-outline" size={20} color={Colors.accent} /><Text style={styles.bgImagePickerText}>画像を選択</Text></>
                    }
                  </TouchableOpacity>
                )}
              </View>

              {/* 背景色 */}
              <Text style={styles.fieldLabel}>背景色{editingBtn?.bgImage ? '（画像設定時はオーバーレイ色）' : ''}</Text>
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

              {/* アイコン */}
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

              {/* ラベル */}
              <Text style={styles.fieldLabel}>ラベル</Text>
              <TextInput
                style={styles.input}
                placeholder="例: 公式サイト"
                placeholderTextColor={Colors.textLight}
                value={editingBtn?.label ?? ''}
                onChangeText={text => setEditingBtn(prev => ({ ...prev, label: text }))}
                maxLength={12}
              />

              {/* URL */}
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

  // トグル
  toggleCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
  toggleDesc: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  toggleTrack: {
    width: 54, height: 30, borderRadius: 15,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },

  // タイルグリッド
  gridCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    padding: 12, gap: 10,
  },
  gridCaption: { fontSize: 11, color: Colors.textLight, textAlign: 'center' },
  tilePanel: {
    backgroundColor: '#1C1C1E', borderRadius: 16, overflow: 'hidden', padding: 4,
  },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  tileSlotWrap: { width: '33.33%' },
  tileSlot: {
    aspectRatio: 1.15, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8,
    backgroundColor: '#2C2C2E',
  },
  tileSlotEmpty: {
    backgroundColor: '#2C2C2E',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  tileImgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  tileLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  tileDeleteBtn: { position: 'absolute', top: 4, right: 4 },

  note: { fontSize: 11, color: Colors.textLight, lineHeight: 18, textAlign: 'center' },

  // モーダル
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

  // ミニプレビュー
  miniPreviewWrap: { alignItems: 'center', paddingVertical: 8 },
  miniPreview: {
    width: 100, height: 90, borderRadius: 14, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8,
  },
  miniPreviewLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },

  // 背景画像
  bgImageRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bgImageThumb: { width: 56, height: 56, borderRadius: 8 },
  bgImageBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.accent,
  },
  bgImageBtnText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  bgImageBtnDel: { borderColor: '#E53E3E' },
  bgImageBtnDelText: { fontSize: 13, color: '#E53E3E', fontWeight: '600' },
  bgImagePicker: {
    flex: 1, height: 52, borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.accent, borderStyle: 'dashed',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  bgImagePickerText: { fontSize: 14, color: Colors.accent, fontWeight: '600' },

  // 色選択
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorOption: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  colorOptionActive: { borderWidth: 2.5, borderColor: Colors.accent },

  // アイコン選択
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
