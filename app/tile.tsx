import { useState, useCallback, useRef, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, KeyboardAvoidingView,
  Platform, Image, Animated, useWindowDimensions,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

type RichMenuButton = {
  id: string
  label: string
  action: 'url' | 'code' | 'page'
  url: string
  code: string
  icon: string
  bgImage?: string
  x: number
  y: number
  w: number
  h: number
}


const REACH_PAGES = [
  { label: '使い方ガイド', path: '/guide', icon: 'book-outline' },
  { label: 'Reachとは', path: '/about', icon: 'information-circle-outline' },
  { label: '最新情報・お知らせ', path: '/news', icon: 'newspaper-outline' },
  { label: 'よくある質問', path: '/faq', icon: 'help-circle-outline' },
]

const SUPABASE_URL = 'https://mljnbtgaikilcpjjofsh.supabase.co'
const BUCKET = 'broadcast-images'
const GRID_COLS = 27
const GRID_ROWS = 18
const genId = () => Math.random().toString(36).slice(2)

const DEFAULT_POSITIONS = [
  { x: 0,  y: 0, w: 9, h: 9 },
  { x: 9,  y: 0, w: 9, h: 9 },
  { x: 18, y: 0, w: 9, h: 9 },
  { x: 0,  y: 9, w: 9, h: 9 },
  { x: 9,  y: 9, w: 9, h: 9 },
  { x: 18, y: 9, w: 9, h: 9 },
]

// ── 画像アップロード ──────────────────────────────────────

async function uploadImageNative(
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
  return new Promise<string | null>(resolve => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('x-upsert', 'true')
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) resolve(publicUrl)
      else { Alert.alert('アップロードエラー', `${xhr.status}: ${xhr.responseText}`); resolve(null) }
    }
    xhr.onerror = () => { Alert.alert('エラー', 'ネットワークエラー'); resolve(null) }
    const fd = new FormData()
    fd.append('', { uri: asset.uri, type: mimeType, name: filename } as any)
    xhr.send(fd)
  })
}

async function uploadFileWeb(
  userId: string,
  file: File,
  onSuccess: (url: string) => void,
  setUploading: (v: boolean) => void,
) {
  setUploading(true)
  try {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `tiles/${userId}/img_${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })
    if (error) { Alert.alert('アップロードエラー', error.message); return }
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    onSuccess(urlData.publicUrl)
  } catch (e: any) {
    Alert.alert('エラー', e?.message ?? 'エラーが発生しました')
  } finally {
    setUploading(false)
  }
}

function WebImageOverlay({ onFile }: { onFile: (file: File) => void }) {
  if (Platform.OS !== 'web') return null
  return (
    <label style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, cursor: 'pointer', zIndex: 10 } as any}>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' } as any}
        onChange={(e: any) => {
          const file = e.target.files?.[0]
          if (file) { onFile(file); e.target.value = '' }
        }}
      />
    </label>
  )
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

// 数値ステッパー
function Stepper({
  value, min, max, onChange,
}: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.stepperRow}>
      <TouchableOpacity
        style={[styles.stepperBtn, value <= min && { opacity: 0.3 }]}
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
      >
        <Text style={styles.stepperBtnText}>−</Text>
      </TouchableOpacity>
      <Text style={styles.stepperValue}>{value}</Text>
      <TouchableOpacity
        style={[styles.stepperBtn, value >= max && { opacity: 0.3 }]}
        onPress={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
      >
        <Text style={styles.stepperBtnText}>+</Text>
      </TouchableOpacity>
    </View>
  )
}

// N〜M 範囲入力行
function RangeRow({ label, unit, startVal, endVal, minStart, maxEnd, onChangeStart, onChangeEnd }: {
  label: string; unit: string
  startVal: number; endVal: number
  minStart: number; maxEnd: number
  onChangeStart: (v: number) => void
  onChangeEnd: (v: number) => void
}) {
  return (
    <View style={styles.rangeRow}>
      <Text style={styles.rangeLabel}>{label}</Text>
      <View style={styles.rangeInputs}>
        <Stepper value={startVal} min={minStart} max={endVal} onChange={onChangeStart} />
        <Text style={styles.rangeSep}>〜</Text>
        <Stepper value={endVal} min={startVal} max={maxEnd} onChange={onChangeEnd} />
        <Text style={styles.rangeUnit}>{unit}</Text>
      </View>
    </View>
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
  const [draft, setDraft] = useState({ x: 0, y: 0, w: 9, h: 9 })
  const { width } = useWindowDimensions()
  const isWide = width >= 768

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data } = await supabase.from('rich_menus').select('*').eq('creator_id', user.id).single()
    if (data) {
      setMenuId(data.id)
      setIsActive(data.is_active)
      const raw: any[] = data.buttons ?? []
      const normalized = raw.map((b, i) =>
        b.x != null ? b : { ...b, ...(DEFAULT_POSITIONS[i] ?? { x: 0, y: 0, w: 9, h: 9 }) }
      ) as RichMenuButton[]
      setButtons(normalized)
      setPanelBgImage(data.panel_bg_image ?? null)
    }
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const handleSave = async () => {
    if (!userId) return
    setSaving(true)
    const payload = { buttons, is_active: isActive, panel_bg_image: panelBgImage, updated_at: new Date().toISOString() }
    if (menuId) {
      await supabase.from('rich_menus').update(payload).eq('id', menuId)
    } else {
      const { data } = await supabase.from('rich_menus').insert({ creator_id: userId, ...payload }).select().single()
      if (data) setMenuId(data.id)
    }
    setSaving(false)
    router.back()
  }

  const openAddModal = () => {
    setEditingBtn({ id: genId(), label: '', url: '', code: '', icon: 'link-outline', action: 'url' as const, ...draft })
    setModalVisible(true)
  }

  const openEditModal = (btn: RichMenuButton) => {
    setEditingBtn({ ...btn })
    setModalVisible(true)
  }

  const handleSaveBtn = () => {
    const action = editingBtn?.action ?? 'url'
    if (action === 'url' && !editingBtn?.url?.trim()) return
    if (action === 'code' && !editingBtn?.code?.trim()) return
    if (action === 'page' && !editingBtn?.url?.trim()) return
    const updated = {
      ...editingBtn,
      action,
      label: '',
      url: editingBtn?.url?.trim() ?? '',
      code: editingBtn?.code?.trim() ?? '',
      x: editingBtn?.x ?? 0,
      y: editingBtn?.y ?? 0,
      w: editingBtn?.w ?? 9,
      h: editingBtn?.h ?? 9,
    } as RichMenuButton

    // 重複チェック
    const overlap = buttons.some(b => {
      if (b.id === updated.id) return false
      return updated.x < b.x + b.w && updated.x + updated.w > b.x &&
             updated.y < b.y + b.h && updated.y + updated.h > b.y
    })
    if (overlap) { Alert.alert('重複', '既存のタイルと重なっています。位置やサイズを調整してください'); return }

    setButtons(prev => {
      const exists = prev.find(b => b.id === updated.id)
      return exists ? prev.map(b => b.id === updated.id ? updated : b) : [...prev, updated]
    })
    setModalVisible(false)
    setEditingBtn(null)
  }

  const handleDeleteBtn = (id: string) => {
    setButtons(prev => prev.filter(b => b.id !== id))
    setModalVisible(false)
    setEditingBtn(null)
  }

  const pickImageNative = async (onSuccess: (url: string) => void) => {
    if (!userId) return
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('許可が必要です', 'フォトライブラリへのアクセスを許可してください'); return }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 })
    if (!result.assets?.[0]) return
    setUploading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const url = await uploadImageNative(userId, result.assets[0], session.access_token)
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

        <View style={styles.card}>
          <View>
            <Text style={styles.toggleLabel}>メニューを表示</Text>
            <Text style={styles.toggleDesc}>トーク画面にタイルメニューを表示します</Text>
          </View>
          <ToggleSwitch value={isActive} onChange={setIsActive} />
        </View>

        <View style={[styles.twoCol, !isWide && styles.twoColMobile]}>

          {/* 左：グリッドプレビュー + タイル一覧 */}
          <View style={styles.leftCol}>

            {/* パネル背景 */}
            <View style={[styles.card, { marginHorizontal: 0, flexDirection: 'column', alignItems: 'stretch' }]}>
              <Text style={[styles.cardTitle, { marginBottom: 10 }]}>パネル背景</Text>
              {panelBgImage ? (
                <View style={styles.bgActions}>
                  <Image source={{ uri: panelBgImage }} style={styles.bgThumb} resizeMode="cover" />
                  <View style={[styles.bgBtn, { overflow: 'hidden' }]}>
                    <Text style={styles.bgBtnText}>{uploading ? '...' : '変更'}</Text>
                    {Platform.OS === 'web' && <WebImageOverlay onFile={f => uploadFileWeb(userId!, f, setPanelBgImage, setUploading)} />}
                    {Platform.OS !== 'web' && (
                      <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => pickImageNative(setPanelBgImage)} disabled={uploading} />
                    )}
                  </View>
                  <TouchableOpacity style={[styles.bgBtn, styles.bgBtnDel]} onPress={() => setPanelBgImage(null)}>
                    <Text style={styles.bgBtnDelText}>削除</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.bgPicker, { overflow: 'hidden' }]}>
                  {uploading
                    ? <ActivityIndicator size="small" color={Colors.accent} />
                    : <><Ionicons name="image-outline" size={18} color={Colors.accent} /><Text style={styles.bgPickerText}>背景画像を選択</Text></>
                  }
                  {Platform.OS === 'web' && <WebImageOverlay onFile={f => uploadFileWeb(userId!, f, setPanelBgImage, setUploading)} />}
                  {Platform.OS !== 'web' && (
                    <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => pickImageNative(setPanelBgImage)} disabled={uploading} />
                  )}
                </View>
              )}
            </View>

            {/* グリッドプレビュー */}
            <Text style={[styles.sectionLabel, { marginHorizontal: 0 }]}>グリッドプレビュー</Text>

            <View style={styles.gridWrapper}>
              {panelBgImage && (
                <Image source={{ uri: panelBgImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" pointerEvents="none" />
              )}
              {panelBgImage && <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.35)' }]} pointerEvents="none" />}
              <View style={styles.gridArea}>
                {Array.from({ length: GRID_COLS + 1 }, (_, i) => (
                  <View key={`v${i}`} pointerEvents="none" style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: `${(i / GRID_COLS) * 100}%` as any,
                    width: StyleSheet.hairlineWidth, backgroundColor: panelBgImage ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.07)',
                  }} />
                ))}
                {Array.from({ length: GRID_ROWS + 1 }, (_, i) => (
                  <View key={`h${i}`} pointerEvents="none" style={{
                    position: 'absolute', left: 0, right: 0,
                    top: `${(i / GRID_ROWS) * 100}%` as any,
                    height: StyleSheet.hairlineWidth, backgroundColor: panelBgImage ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.07)',
                  }} />
                ))}
                {/* ドラフトハイライト（重複=赤、正常=黄色） */}
                {(() => {
                  const overlaps = buttons.some(b =>
                    draft.x < b.x + b.w && draft.x + draft.w > b.x &&
                    draft.y < b.y + b.h && draft.y + draft.h > b.y
                  )
                  return (
                    <View pointerEvents="none" style={{
                      position: 'absolute',
                      left: `${(draft.x / GRID_COLS) * 100}%` as any,
                      top: `${(draft.y / GRID_ROWS) * 100}%` as any,
                      width: `${(draft.w / GRID_COLS) * 100}%` as any,
                      height: `${(draft.h / GRID_ROWS) * 100}%` as any,
                      backgroundColor: overlaps ? 'rgba(220, 50, 50, 0.3)' : 'rgba(255, 220, 0, 0.22)',
                      borderWidth: 2,
                      borderColor: overlaps ? '#E53E3E' : '#FFD700',
                      borderStyle: 'dashed',
                    }} />
                  )
                })()}

                {/* タイルはタップで編集モーダルを開く */}
                {buttons.map(btn => (
                  <TouchableOpacity
                    key={btn.id}
                    activeOpacity={0.75}
                    onPress={() => openEditModal(btn)}
                    style={{
                      position: 'absolute',
                      left: `${(btn.x / GRID_COLS) * 100}%` as any,
                      top: `${(btn.y / GRID_ROWS) * 100}%` as any,
                      width: `${(btn.w / GRID_COLS) * 100}%` as any,
                      height: `${(btn.h / GRID_ROWS) * 100}%` as any,
                      backgroundColor: `${Colors.accent}99`,
                      borderWidth: 1.5, borderColor: Colors.accent,
                      alignItems: 'center', justifyContent: 'center', gap: 2,
                    }}
                  >
                    <Ionicons name={btn.icon as any} size={11} color="#fff" />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 範囲入力（グリッド外・モーダル外） */}
            <RangeRow
              label="列" unit="列"
              startVal={draft.x + 1}
              endVal={draft.x + draft.w}
              minStart={1} maxEnd={GRID_COLS}
              onChangeStart={v => setDraft(d => { const end = d.x + d.w; return { ...d, x: v - 1, w: end - (v - 1) } })}
              onChangeEnd={v => setDraft(d => ({ ...d, w: v - d.x }))}
            />
            <RangeRow
              label="行" unit="行"
              startVal={draft.y + 1}
              endVal={draft.y + draft.h}
              minStart={1} maxEnd={GRID_ROWS}
              onChangeStart={v => setDraft(d => { const end = d.y + d.h; return { ...d, y: v - 1, h: end - (v - 1) } })}
              onChangeEnd={v => setDraft(d => ({ ...d, h: v - d.y }))}
            />

            {/* タイルを追加ボタン（重複時は無効） */}
            {(() => {
              const overlaps = buttons.some(b =>
                draft.x < b.x + b.w && draft.x + draft.w > b.x &&
                draft.y < b.y + b.h && draft.y + draft.h > b.y
              )
              return (
                <TouchableOpacity
                  style={[styles.addBtn, overlaps && { opacity: 0.35, borderColor: '#E53E3E' }]}
                  onPress={overlaps ? undefined : openAddModal}
                  disabled={overlaps}
                >
                  <Ionicons name="add-circle-outline" size={18} color={overlaps ? '#E53E3E' : Colors.accent} />
                  <Text style={[styles.addBtnText, overlaps && { color: '#E53E3E' }]}>
                    {overlaps ? '重複しています' : 'タイルを追加'}
                  </Text>
                </TouchableOpacity>
              )
            })()}

            <Text style={[styles.note, { marginHorizontal: 0, textAlign: 'left' }]}>
              ※ タイルをタップすると編集できます。
            </Text>
          </View>

          {/* 右：プレビュー */}
          <View style={[styles.rightCol, !isWide && styles.rightColMobile]}>
            <Text style={[styles.sectionLabel, { marginHorizontal: 0 }]}>プレビュー</Text>
            <View style={[styles.phoneFrame, { marginHorizontal: 0 }]}>
              <View style={styles.phoneHeader}>
                <View style={styles.phoneAvatar}><Text style={styles.phoneAvatarText}>R</Text></View>
                <Text style={styles.phoneName}>クリエイター名</Text>
              </View>
              <View style={styles.phoneChat}>
                <View style={styles.bubbleRow}>
                  <View style={styles.bubble}><Text style={styles.bubbleText}>こんにちは！</Text></View>
                </View>
                <View style={[styles.bubbleRow, { justifyContent: 'flex-end' }]}>
                  <View style={[styles.bubble, styles.bubbleSelf]}>
                    <Text style={[styles.bubbleText, { color: '#FFF' }]}>よろしくお願いします</Text>
                  </View>
                </View>
              </View>
              <View style={styles.previewPanel}>
                <View style={styles.tileHandleArea}><View style={styles.tileHandleBar} /></View>
                <View style={styles.previewTileArea}>
                  {panelBgImage && (
                    <Image source={{ uri: panelBgImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" pointerEvents="none" />
                  )}
                  {panelBgImage && <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.35)' }]} pointerEvents="none" />}
                  {buttons.map(btn => (
                    <View key={btn.id} pointerEvents="none" style={{
                      position: 'absolute',
                      left: `${(btn.x / GRID_COLS) * 100}%` as any,
                      top: `${(btn.y / GRID_ROWS) * 100}%` as any,
                      width: `${(btn.w / GRID_COLS) * 100}%` as any,
                      height: `${(btn.h / GRID_ROWS) * 100}%` as any,
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 0.5,
                      borderColor: panelBgImage ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                      overflow: 'hidden',
                    }}>
                      {btn.bgImage && <Image source={{ uri: btn.bgImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />}
                      {btn.bgImage && <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.32)' }]} />}
                      {!btn.bgImage && !panelBgImage && (
                        <View style={{
                          width: 18, height: 18, borderRadius: 9,
                          backgroundColor: `${Colors.accent}18`,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Ionicons name={btn.icon as any} size={10} color={Colors.accent} />
                        </View>
                      )}
                      {(btn.bgImage || panelBgImage) && (
                        <Ionicons name={btn.icon as any} size={13} color="rgba(255,255,255,0.92)" />
                      )}
                    </View>
                  ))}
                  {buttons.length === 0 && (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 9, color: panelBgImage ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)' }}>タイルなし</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.phoneDmArea}>
                <View style={styles.phoneDmField}><Text style={styles.phoneDmPlaceholder}>メッセージ</Text></View>
                <View style={styles.phoneDmSend}><Ionicons name="arrow-up" size={13} color="#FFF" /></View>
              </View>
            </View>
          </View>

        </View>
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
              <TouchableOpacity onPress={handleSaveBtn} disabled={(() => {
                const a = editingBtn?.action ?? 'url'
                if (a === 'url') return !editingBtn?.url?.trim()
                if (a === 'page') return !editingBtn?.url?.trim()
                return !editingBtn?.code?.trim()
              })()}>
                <Text style={[styles.modalSave, (() => {
                  const a = editingBtn?.action ?? 'url'
                  if (a === 'url') return !editingBtn?.url?.trim()
                  if (a === 'page') return !editingBtn?.url?.trim()
                  return !editingBtn?.code?.trim()
                })() && { opacity: 0.4 }]}>完了</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalBody}>

              {/* 背景画像 */}
              <Text style={styles.fieldLabel}>背景画像</Text>
              <View style={styles.bgActions}>
                {editingBtn?.bgImage ? (
                  <>
                    <Image source={{ uri: editingBtn.bgImage }} style={styles.bgThumb} resizeMode="cover" />
                    <View style={[styles.bgBtn, { overflow: 'hidden' }]}>
                      <Text style={styles.bgBtnText}>{uploading ? '...' : '変更'}</Text>
                      {Platform.OS === 'web' && <WebImageOverlay onFile={f => uploadFileWeb(userId!, f, url => setEditingBtn(p => p ? { ...p, bgImage: url } : p), setUploading)} />}
                      {Platform.OS !== 'web' && (
                        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => pickImageNative(url => setEditingBtn(p => p ? { ...p, bgImage: url } : p))} disabled={uploading} />
                      )}
                    </View>
                    <TouchableOpacity style={[styles.bgBtn, styles.bgBtnDel]} onPress={() => setEditingBtn(p => p ? { ...p, bgImage: undefined } : p)}>
                      <Text style={styles.bgBtnDelText}>削除</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={[styles.bgPicker, { overflow: 'hidden' }]}>
                    {uploading
                      ? <ActivityIndicator size="small" color={Colors.accent} />
                      : <><Ionicons name="image-outline" size={20} color={Colors.accent} /><Text style={styles.bgPickerText}>画像を選択</Text></>
                    }
                    {Platform.OS === 'web' && <WebImageOverlay onFile={f => uploadFileWeb(userId!, f, url => setEditingBtn(p => p ? { ...p, bgImage: url } : p), setUploading)} />}
                    {Platform.OS !== 'web' && (
                      <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => pickImageNative(url => setEditingBtn(p => p ? { ...p, bgImage: url } : p))} disabled={uploading} />
                    )}
                  </View>
                )}
              </View>

              {/* アクション種別 */}
              <Text style={styles.fieldLabel}>アクション</Text>
              <View style={styles.actionTypeRow}>
                {([
                  { key: 'url', label: 'URLを開く', icon: 'link-outline' },
                  { key: 'page', label: 'Reachページへ', icon: 'apps-outline' },
                  { key: 'code', label: 'ワンタップ返信', icon: 'chatbubble-ellipses-outline' },
                ] as const).map(({ key: a, label, icon }) => {
                  const isAct = (editingBtn?.action ?? 'url') === a
                  return (
                    <TouchableOpacity
                      key={a}
                      style={[styles.actionTypeBtn, isAct && styles.actionTypeBtnActive]}
                      onPress={() => setEditingBtn(p => p ? {
                        ...p, action: a,
                        icon: a === 'url' ? 'link-outline' : a === 'page' ? 'apps-outline' : 'chatbubble-ellipses-outline',
                        url: a === 'page' ? (REACH_PAGES[0]?.path ?? '') : (a === 'url' ? (p.url ?? '') : ''),
                      } : p)}
                    >
                      <Ionicons name={icon} size={14} color={isAct ? '#fff' : Colors.accent} />
                      <Text style={[styles.actionTypeBtnText, { fontSize: 11 }, isAct && { color: '#fff' }]}>{label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {(editingBtn?.action ?? 'url') === 'url' && (
                <>
                  <Text style={styles.fieldLabel}>リンク先URL</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="https://example.com"
                    placeholderTextColor={Colors.textLight}
                    value={editingBtn?.url ?? ''}
                    onChangeText={text => setEditingBtn(p => p ? { ...p, url: text } : p)}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                </>
              )}

              {editingBtn?.action === 'page' && (
                <>
                  <Text style={styles.fieldLabel}>ページを選択</Text>
                  {REACH_PAGES.map(p => {
                    const isSelected = editingBtn?.url === p.path
                    return (
                      <TouchableOpacity
                        key={p.path}
                        style={[styles.pageOption, isSelected && styles.pageOptionActive]}
                        onPress={() => setEditingBtn(prev => prev ? { ...prev, url: p.path, icon: p.icon } : prev)}
                      >
                        <Ionicons name={isSelected ? 'radio-button-on' : 'radio-button-off'} size={18} color={Colors.accent} />
                        <Ionicons name={p.icon as any} size={16} color={Colors.accent} style={{ marginLeft: 4 }} />
                        <Text style={styles.pageOptionText}>{p.label}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </>
              )}

              {editingBtn?.action === 'code' && (
                <>
                  <Text style={styles.fieldLabel}>返信メッセージ</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="例：予約希望 / 詳しく聞きたい"
                    placeholderTextColor={Colors.textLight}
                    value={editingBtn?.code ?? ''}
                    onChangeText={text => setEditingBtn(p => p ? { ...p, code: text } : p)}
                    autoCapitalize="none"
                  />
                  <Text style={[styles.fieldLabel, { color: Colors.accent, fontWeight: '500', textTransform: 'none', letterSpacing: 0 }]}>
                    フォロワーがボタンを押すと、このメッセージが自動でDMに送られます
                  </Text>
                </>
              )}

              {/* 削除 */}
              {editingBtn?.id && buttons.some(b => b.id === editingBtn.id) && (
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteBtn(editingBtn.id!)}>
                  <Ionicons name="trash-outline" size={16} color="#E53E3E" />
                  <Text style={styles.deleteBtnText}>このタイルを削除</Text>
                </TouchableOpacity>
              )}
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
    backgroundColor: Colors.header, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 40 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  saveButton: { width: 40, alignItems: 'flex-end' },
  saveText: { fontSize: 16, color: Colors.accent, fontWeight: '700' },
  content: { paddingTop: 16, paddingBottom: 40, gap: 12 },
  card: {
    backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
    padding: 16, marginHorizontal: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
  toggleDesc: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  toggleTrack: { width: 54, height: 30, borderRadius: 15, justifyContent: 'center' },
  toggleThumb: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  bgActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  bgThumb: { width: 48, height: 48, borderRadius: 8 },
  bgBtn: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: Colors.accent },
  bgBtnText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  bgBtnDel: { borderColor: '#E53E3E' },
  bgBtnDelText: { fontSize: 13, color: '#E53E3E', fontWeight: '600' },
  bgPicker: {
    flex: 1, height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.accent, borderStyle: 'dashed',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  bgPickerText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  twoCol: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, alignItems: 'flex-start' },
  twoColMobile: { flexDirection: 'column' },
  leftCol: { flex: 1, gap: 10 },
  rightCol: { width: 320 },
  rightColMobile: { width: '100%' as any },
  sectionLabel: { fontSize: 11, color: Colors.textLight, marginHorizontal: 16 },
  gridWrapper: { backgroundColor: '#F5EFE8', overflow: 'hidden', borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  gridArea: { aspectRatio: 27 / 18 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.accent, borderStyle: 'dashed',
  },
  addBtnText: { fontSize: 14, color: Colors.accent, fontWeight: '600' },
  note: { fontSize: 11, color: Colors.textLight, lineHeight: 18, textAlign: 'center', marginHorizontal: 16 },
  phoneFrame: { marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  phoneHeader: {
    backgroundColor: Colors.white, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  phoneAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  phoneAvatarText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  phoneName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  phoneChat: { backgroundColor: Colors.background, paddingHorizontal: 12, paddingVertical: 5, gap: 5 },
  bubbleRow: { flexDirection: 'row' },
  bubble: {
    backgroundColor: Colors.white, borderRadius: 14, borderTopLeftRadius: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
  },
  bubbleSelf: { backgroundColor: Colors.accent, borderTopLeftRadius: 14, borderTopRightRadius: 4 },
  bubbleText: { fontSize: 11, color: Colors.text, lineHeight: 18, paddingHorizontal: 8, paddingVertical: 5 },
  phoneDmArea: {
    backgroundColor: Colors.white, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  phoneDmField: { flex: 1, height: 30, borderRadius: 15, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, justifyContent: 'center' },
  phoneDmPlaceholder: { fontSize: 11, color: Colors.textLight },
  phoneDmSend: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  previewPanel: { backgroundColor: '#F5EFE8', overflow: 'hidden' },
  tileHandleArea: { alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
  tileHandleBar: { width: 28, height: 3, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.15)' },
  previewTileArea: { aspectRatio: 27 / 18, overflow: 'hidden' },
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
  rangeRow: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 10,
  },
  rangeLabel: { fontSize: 12, fontWeight: '700', color: Colors.textLight },
  rangeInputs: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rangeSep: { fontSize: 16, color: Colors.textLight, fontWeight: '500' },
  rangeUnit: { fontSize: 13, color: Colors.textLight, fontWeight: '600', marginLeft: 4 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepperBtn: {
    width: 34, height: 34, borderRadius: 8, backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  stepperBtnText: { fontSize: 18, color: Colors.text, fontWeight: '600', lineHeight: 22 },
  stepperValue: { fontSize: 18, fontWeight: '700', color: Colors.text, minWidth: 28, textAlign: 'center' },
  actionTypeRow: { flexDirection: 'row', gap: 8 },
  actionTypeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.accent,
  },
  actionTypeBtnActive: { backgroundColor: Colors.accent },
  actionTypeBtnText: { fontSize: 13, fontWeight: '600', color: Colors.accent },
  pageOption: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  pageOptionActive: { borderColor: Colors.accent, backgroundColor: `${Colors.accent}10` },
  pageOptionText: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconOption: {
    width: '18%', aspectRatio: 1, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  iconOptionActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  iconLabel: { fontSize: 9, color: Colors.textLight },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, fontSize: 15, color: Colors.text, backgroundColor: Colors.white },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E53E3E' },
  deleteBtnText: { fontSize: 15, color: '#E53E3E', fontWeight: '600' },
})
