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

const SUPABASE_URL = 'https://mljnbtgaikilcpjjofsh.supabase.co'
const BUCKET = 'broadcast-images'
const SLOTS = [0, 1, 2, 3, 4, 5]
const genId = () => Math.random().toString(36).slice(2)

// Web は fetch+blob、Native は XHR+FormData でアップロード
async function uploadImage(
  userId: string,
  asset: ImagePicker.ImagePickerAsset,
  token: string,
): Promise<string | null> {
  const mimeType = asset.mimeType ?? 'image/jpeg'
  const rawExt = asset.uri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg'
  const ext = ['jpg', 'jpeg', 'png', 'webp'].includes(rawExt) ? rawExt : 'jpg'
  const filename = `img_${Date.now()}.${ext}`
  const path = `tiles/${userId}/${filename}`
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`

  if (Platform.OS === 'web') {
    try {
      const blob = await fetch(asset.uri).then(r => r.blob())
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: mimeType, upsert: true })
      if (error) { Alert.alert('アップロードエラー', error.message); return null }
      return publicUrl
    } catch (e: any) {
      Alert.alert('エラー', e?.message ?? '画像のアップロードに失敗しました')
      return null
    }
  }

  // Native: XHR + FormData
  return new Promise<string | null>(resolve => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('x-upsert', 'true')
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        resolve(publicUrl)
      } else {
        Alert.alert('アップロードエラー', `${xhr.status}: ${xhr.responseText}`)
        resolve(null)
      }
    }
    xhr.onerror = () => { Alert.alert('エラー', 'ネットワークエラー'); resolve(null) }
    const fd = new FormData()
    fd.append('', { uri: asset.uri, type: mimeType, name: filename } as any)
    xhr.send(fd)
  })
}

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
  const [panelBgImage, setPanelBgImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingBtn, setEditingBtn] = useState<Partial<RichMenuButton> | null>(null)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data } = await supabase.from('rich_menus').select('*').eq('creator_id', user.id).single()
    if (data) {
      setMenuId(data.id)
      setIsActive(data.is_active)
      setButtons(data.buttons ?? [])
      setPanelBgImage(data.panel_bg_image ?? null)
    }
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const handleSave = async () => {
    if (!userId) return
    setSaving(true)
    const payload = {
      buttons, is_active: isActive,
      panel_bg_image: panelBgImage,
      updated_at: new Date().toISOString(),
    }
    if (menuId) {
      await supabase.from('rich_menus').update(payload).eq('id', menuId)
    } else {
      const { data } = await supabase.from('rich_menus')
        .insert({ creator_id: userId, ...payload })
        .select().single()
      if (data) setMenuId(data.id)
    }
    setSaving(false)
    router.back()
  }

  const openSlot = (index: number) => {
    const btn = buttons[index]
    if (btn) {
      setEditingBtn({ ...btn })
    } else {
      if (buttons.length >= 6) return
      setEditingBtn({ label: '', url: '', icon: 'link-outline', id: genId() })
    }
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
    Alert.alert('削除', 'このタイルを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => setButtons(prev => prev.filter(b => b.id !== id)) },
    ])
  }

  const pickImage = async (onSuccess: (url: string) => void) => {
    if (!userId) return
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') { Alert.alert('許可が必要です', 'フォトライブラリへのアクセスを許可してください'); return }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    })
    if (result.canceled || !result.assets[0]) return
    setUploading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const url = await uploadImage(userId, result.assets[0], session.access_token)
      if (url) onSuccess(url)
    } finally {
      setUploading(false)
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
        <View style={styles.card}>
          <View>
            <Text style={styles.toggleLabel}>メニューを表示</Text>
            <Text style={styles.toggleDesc}>トーク画面にタイルメニューを表示します</Text>
          </View>
          <ToggleSwitch value={isActive} onChange={setIsActive} />
        </View>

        {/* パネル背景画像 */}
        <View style={[styles.card, { flexDirection: 'column', alignItems: 'stretch' }]}>
          <Text style={[styles.cardTitle, { marginBottom: 10 }]}>パネル背景画像</Text>
          {panelBgImage ? (
            <View style={styles.bgActions}>
              <Image source={{ uri: panelBgImage }} style={styles.bgThumb} resizeMode="cover" />
              <TouchableOpacity style={styles.bgBtn} onPress={() => pickImage(setPanelBgImage)} disabled={uploading}>
                {uploading ? <ActivityIndicator size="small" color={Colors.accent} /> : <Text style={styles.bgBtnText}>変更</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.bgBtn, styles.bgBtnDel]} onPress={() => setPanelBgImage(null)}>
                <Text style={styles.bgBtnDelText}>削除</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.bgPicker} onPress={() => pickImage(setPanelBgImage)} disabled={uploading}>
              {uploading
                ? <ActivityIndicator size="small" color={Colors.accent} />
                : <><Ionicons name="image-outline" size={18} color={Colors.accent} /><Text style={styles.bgPickerText}>背景画像を選択</Text></>
              }
            </TouchableOpacity>
          )}
        </View>

        {/* タイルパネル（トーク画面と同じ見た目） */}
        <Text style={styles.sectionLabel}>タップして編集（最大6コマ）</Text>
        <View style={styles.tilePanel}>
          {panelBgImage && (
            <Image source={{ uri: panelBgImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          )}
          <View style={styles.panelOverlay} />
          <View style={styles.tileGrid}>
            {SLOTS.map(i => {
              const btn = buttons[i]
              return (
                <TouchableOpacity
                  key={btn ? btn.id : `empty-${i}`}
                  style={styles.tileSlot}
                  onPress={() => openSlot(i)}
                  activeOpacity={0.8}
                >
                  {btn ? (
                    <>
                      {btn.bgImage && <Image source={{ uri: btn.bgImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />}
                      {btn.bgImage && <View style={styles.tileImgOverlay} />}
                      <Ionicons name={btn.icon as any} size={26} color="#FFFFFF" />
                      <View style={styles.tileSeparator} />
                      <Text style={styles.tileLabel} numberOfLines={1}>{btn.label}</Text>
                      <TouchableOpacity
                        style={styles.tileDeleteBtn}
                        onPress={() => handleDeleteBtn(btn.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close-circle" size={17} color="rgba(255,255,255,0.8)" />
                      </TouchableOpacity>
                    </>
                  ) : (
                    <Ionicons name="add" size={28} color="rgba(255,255,255,0.3)" />
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
          {/* トグルバー（プレビュー用） */}
          <View style={styles.tileToggleBar}>
            <Ionicons name="keypad-outline" size={16} color="rgba(255,255,255,0.5)" />
            <Ionicons name="chevron-down" size={13} color="rgba(255,255,255,0.5)" />
          </View>
        </View>

        <Text style={styles.note}>
          ※ URLには https:// から始まるリンクを入力してください。
        </Text>
      </ScrollView>

      {/* タイル編集モーダル */}
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
              {/* タイルプレビュー */}
              <View style={styles.previewWrap}>
                <View style={styles.previewTile}>
                  {editingBtn?.bgImage && (
                    <Image source={{ uri: editingBtn.bgImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                  )}
                  {editingBtn?.bgImage && <View style={styles.tileImgOverlay} />}
                  <Ionicons name={(editingBtn?.icon ?? 'link-outline') as any} size={30} color="#FFFFFF" />
                  <View style={styles.tileSeparator} />
                  <Text style={styles.tileLabel} numberOfLines={1}>{editingBtn?.label || 'ラベル'}</Text>
                </View>
              </View>

              {/* 背景画像 */}
              <Text style={styles.fieldLabel}>背景画像</Text>
              <View style={styles.bgActions}>
                {editingBtn?.bgImage ? (
                  <>
                    <Image source={{ uri: editingBtn.bgImage }} style={styles.bgThumb} resizeMode="cover" />
                    <TouchableOpacity
                      style={styles.bgBtn}
                      onPress={() => pickImage(url => setEditingBtn(prev => prev ? { ...prev, bgImage: url } : prev))}
                      disabled={uploading}
                    >
                      {uploading ? <ActivityIndicator size="small" color={Colors.accent} /> : <Text style={styles.bgBtnText}>変更</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.bgBtn, styles.bgBtnDel]}
                      onPress={() => setEditingBtn(prev => prev ? { ...prev, bgImage: undefined } : prev)}
                    >
                      <Text style={styles.bgBtnDelText}>削除</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.bgPicker}
                    onPress={() => pickImage(url => setEditingBtn(prev => prev ? { ...prev, bgImage: url } : prev))}
                    disabled={uploading}
                  >
                    {uploading
                      ? <ActivityIndicator size="small" color={Colors.accent} />
                      : <><Ionicons name="image-outline" size={20} color={Colors.accent} /><Text style={styles.bgPickerText}>画像を選択</Text></>
                    }
                  </TouchableOpacity>
                )}
              </View>

              {/* アイコン */}
              <Text style={styles.fieldLabel}>アイコン</Text>
              <View style={styles.iconGrid}>
                {ICON_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.name}
                    style={[styles.iconOption, editingBtn?.icon === opt.name && styles.iconOptionActive]}
                    onPress={() => setEditingBtn(prev => prev ? { ...prev, icon: opt.name } : prev)}
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
                onChangeText={text => setEditingBtn(prev => prev ? { ...prev, label: text } : prev)}
                maxLength={12}
              />

              {/* URL */}
              <Text style={styles.fieldLabel}>リンク先URL</Text>
              <TextInput
                style={styles.input}
                placeholder="https://example.com"
                placeholderTextColor={Colors.textLight}
                value={editingBtn?.url ?? ''}
                onChangeText={text => setEditingBtn(prev => prev ? { ...prev, url: text } : prev)}
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
  content: { paddingTop: 16, paddingBottom: 40, gap: 12 },

  // カード（トグル・パネル背景）
  card: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16, marginHorizontal: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    gap: 12,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 10 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
  toggleDesc: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  toggleTrack: { width: 54, height: 30, borderRadius: 15, justifyContent: 'center' },
  toggleThumb: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },

  // パネル背景
  bgActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  bgThumb: { width: 48, height: 48, borderRadius: 8 },
  bgBtn: {
    paddingHorizontal: 13, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.accent,
  },
  bgBtnText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  bgBtnDel: { borderColor: '#E53E3E' },
  bgBtnDelText: { fontSize: 13, color: '#E53E3E', fontWeight: '600' },
  bgPicker: {
    flex: 1, height: 44, borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.accent, borderStyle: 'dashed',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  bgPickerText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },

  // セクションラベル
  sectionLabel: { fontSize: 11, color: Colors.textLight, marginHorizontal: 16 },

  // タイルパネル（トーク画面と同じ見た目）
  tilePanel: {
    backgroundColor: '#1C1C1E', overflow: 'hidden',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
    borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.1)',
  },
  panelOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  tileSlot: {
    width: '33.33%', aspectRatio: 1, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14,
    borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.1)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  tileImgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  tileSeparator: { width: 36, height: 2, backgroundColor: Colors.accent, marginVertical: 7 },
  tileLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center', color: '#FFFFFF' },
  tileDeleteBtn: { position: 'absolute', top: 5, right: 5 },
  tileToggleBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 7,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },

  note: { fontSize: 11, color: Colors.textLight, lineHeight: 18, textAlign: 'center', marginHorizontal: 16 },

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
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textLight, letterSpacing: 0.5, marginTop: 8 },

  previewWrap: { alignItems: 'center', paddingVertical: 8 },
  previewTile: {
    width: 110, aspectRatio: 1, overflow: 'hidden',
    backgroundColor: '#2C2C2E', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14,
  },

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
