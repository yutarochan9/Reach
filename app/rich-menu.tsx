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
  action: 'url' | 'code'
  url: string
  code: string
  icon: string
  bgImage?: string
  x: number   // 列 (0〜GRID_COLS-1)
  y: number   // 行 (0〜GRID_ROWS-1)
  w: number   // 列スパン
  h: number   // 行スパン
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
const GRID_COLS = 27   // 横方向（列）
const GRID_ROWS = 18   // 縦方向（行）
const genId = () => Math.random().toString(36).slice(2)

// 旧データ（x/y/w/h なし）向けデフォルト配置 - 3列×2行
const DEFAULT_POSITIONS = [
  { x: 0,  y: 0, w: 9, h: 9 },
  { x: 9,  y: 0, w: 9, h: 9 },
  { x: 18, y: 0, w: 9, h: 9 },
  { x: 0,  y: 9, w: 9, h: 9 },
  { x: 9,  y: 9, w: 9, h: 9 },
  { x: 18, y: 9, w: 9, h: 9 },
]

// ── 画像アップロード ──────────────────────────────────────

// Native: XHR + FormData
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

// Web: Supabase SDK で File オブジェクトを直接アップロード
async function uploadFileWeb(
  userId: string,
  file: File,
  onSuccess: (url: string) => void,
  setUploading: (v: boolean) => void,
) {
  console.log('[upload] 開始', { name: file.name, type: file.type, size: file.size })
  setUploading(true)
  try {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `tiles/${userId}/img_${Date.now()}.${ext}`
    console.log('[upload] パス:', path, 'バケット:', BUCKET)
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })
    if (error) {
      console.error('[upload] Supabase エラー:', error)
      Alert.alert('アップロードエラー', `${error.message}\n(コンソールに詳細あり)`)
      return
    }
    // SDK の getPublicUrl で URL を取得（手動構築より確実）
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    const publicUrl = urlData.publicUrl
    console.log('[upload] 成功 URL:', publicUrl)
    onSuccess(publicUrl)
  } catch (e: any) {
    console.error('[upload] 例外:', e)
    Alert.alert('エラー', e?.message ?? 'エラーが発生しました')
  } finally {
    setUploading(false)
  }
}

// ── Web 専用: label+input overlay ────────────────────────────
// onPress 内から input.click() を呼ぶとブラウザが user gesture と
// 認識しないためファイルピッカーが開かない。
// label 要素でラップすることでブラウザネイティブの activation を使う。
function WebImageOverlay({ onFile }: { onFile: (file: File) => void }) {
  if (Platform.OS !== 'web') return null
  return (
    <label
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        cursor: 'pointer', zIndex: 10,
      } as any}
    >
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
  const [draftTile, setDraftTile] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [scrollEnabled, setScrollEnabled] = useState(true)
  const [wideMode, setWideMode] = useState(false)
  const isWebDesktop = Platform.OS === 'web'
  const gridRef = useRef<any>(null)
  const gridRectRef = useRef({ x: 0, y: 0, w: 1, h: 1 })
  const gridSizeRef = useRef({ w: 1, h: 1 })  // onLayout で取得した正確な描画サイズ
  const draftTileRef = useRef(draftTile)
  draftTileRef.current = draftTile  // レンダーごとに同期

  const updateDraft = (v: typeof draftTile) => {
    draftTileRef.current = v
    setDraftTile(v)
  }

  // web: スクロール・リサイズのたびに gridRectRef を最新化
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const update = () => {
      const el = document.getElementById('reach-grid-area')
      if (!el) return
      const rect = el.getBoundingClientRect()
      gridRectRef.current = { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [])

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

  const getCellTile = useCallback((col: number, row: number) =>
    buttons.find(b => col >= b.x && col < b.x + b.w && row >= b.y && row < b.y + b.h) ?? null
  , [buttons])

  const handleCellPress = useCallback((col: number, row: number) => {
    const existing = getCellTile(col, row)
    if (existing) {
      updateDraft(null)
      setEditingBtn({ ...existing })
      setModalVisible(true)
      return
    }
    // 空セルをタップ → 1×1 のドラフトタイルを置く
    updateDraft({ x: col, y: row, w: 1, h: 1 })
  }, [getCellTile])

  const confirmDraft = () => {
    if (!draftTile) return
    const overlap = buttons.some(b =>
      draftTile.x < b.x + b.w && draftTile.x + draftTile.w > b.x &&
      draftTile.y < b.y + b.h && draftTile.y + draftTile.h > b.y
    )
    if (overlap) { Alert.alert('重複', '既存のタイルと重なっています'); return }
    setEditingBtn({ id: genId(), label: '', url: '', icon: 'link-outline', ...draftTile })
    updateDraft(null)
    setModalVisible(true)
  }

  // 辺ハンドルのレスポンダー（各辺の中央からドラッグでリサイズ）
  const makeEdgeHandleResponders = (edge: 'top' | 'right' | 'bottom' | 'left') => ({
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: () => setScrollEnabled(false),
    onResponderMove: (e: any) => {
      const dt = draftTileRef.current
      if (!dt) return
      const rect = getGridRect()
      if (!rect) return
      const ev = e.nativeEvent
      const cx = ev.clientX ?? ev.pageX
      const cy = ev.clientY ?? ev.pageY
      const { x: gx, y: gy, w: gw, h: gh } = { x: rect.x, y: rect.y, w: rect.w, h: rect.h }
      const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor((cx - gx) / (gw / GRID_COLS))))
      const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor((cy - gy) / (gh / GRID_ROWS))))
      let { x, y, w, h } = dt
      if (edge === 'top') {
        const ny = Math.min(row, y + h - 1); h = y + h - ny; y = ny
      } else if (edge === 'bottom') {
        h = Math.max(1, row - y + 1)
      } else if (edge === 'left') {
        const nx = Math.min(col, x + w - 1); w = x + w - nx; x = nx
      } else {
        w = Math.max(1, col - x + 1)
      }
      updateDraft({ x, y, w, h })
    },
    onResponderRelease: () => setScrollEnabled(true),
  })

  const handleSaveBtn = () => {
    const action = editingBtn?.action ?? 'url'
    if (action === 'url' && !editingBtn?.url?.trim()) return
    if (action === 'code' && !editingBtn?.code?.trim()) return
    const updated = { ...editingBtn, action, label: '', url: editingBtn.url?.trim() ?? '', code: editingBtn.code?.trim() ?? '' } as RichMenuButton
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

  // ── グリッド座標取得ユーティリティ ──
  // web: getElementById で確実にDOM要素を取得し getBoundingClientRect() で現在位置を返す
  // native: measure() のキャッシュを使用
  const getGridRect = (): { x: number; y: number; w: number; h: number } | null => {
    if (Platform.OS === 'web') {
      const el = document.getElementById('reach-grid-area')
      if (el) {
        const r = el.getBoundingClientRect()
        return { x: r.left, y: r.top, w: r.width, h: r.height }
      }
    }
    return gridRectRef.current.w > 1 ? gridRectRef.current : null
  }

  const onGridLayout = (e: any) => {
    const { width, height } = e.nativeEvent.layout
    gridSizeRef.current = { w: width, h: height }
    if (Platform.OS !== 'web') {
      gridRef.current?.measure((_: any, __: any, w: number, h: number, px: number, py: number) => {
        gridRectRef.current = { x: px, y: py, w, h }
      })
    }
  }

  const onGridPress = (e: any) => {
    const ev = e.nativeEvent
    const { w: gw, h: gh } = gridSizeRef.current
    if (gw <= 1) return

    // locationX/Y = 要素相対座標（RN / RN Web 共通）、onLayout サイズと同じ座標系
    const lx: number | undefined = ev.locationX ?? ev.offsetX
    const ly: number | undefined = ev.locationY ?? ev.offsetY

    let col: number, row: number
    if (lx != null && ly != null) {
      col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor((lx / gw) * GRID_COLS)))
      row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor((ly / gh) * GRID_ROWS)))
    } else {
      const rect = getGridRect()
      if (!rect) return
      const cx = ev.clientX ?? ev.pageX
      const cy = ev.clientY ?? ev.pageY
      col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor(((cx - rect.x) / rect.w) * GRID_COLS)))
      row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(((cy - rect.y) / rect.h) * GRID_ROWS)))
    }
    handleCellPress(col, row)
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

      <ScrollView scrollEnabled={scrollEnabled} contentContainerStyle={styles.content}>

        <View style={styles.card}>
          <View>
            <Text style={styles.toggleLabel}>メニューを表示</Text>
            <Text style={styles.toggleDesc}>トーク画面にタイルメニューを表示します</Text>
          </View>
          <ToggleSwitch value={isActive} onChange={setIsActive} />
        </View>

        <View style={styles.twoCol}>

          {/* 左：グリッドエディタ */}
          <View style={[styles.leftCol, isWebDesktop && wideMode && { flex: 2 }]}>

            {/* パネル背景 */}
            <View style={[styles.card, { marginHorizontal: 0, flexDirection: 'column', alignItems: 'stretch' }]}>
              <Text style={[styles.cardTitle, { marginBottom: 10 }]}>パネル背景</Text>
              {panelBgImage ? (
                <View style={styles.bgActions}>
                  <Image source={{ uri: panelBgImage }} style={styles.bgThumb} resizeMode="cover" />
                  <View style={[styles.bgBtn, { overflow: 'hidden' }]}>
                    <Text style={styles.bgBtnText}>{uploading ? '...' : '変更'}</Text>
                    {Platform.OS === 'web'
                      ? <WebImageOverlay onFile={f => uploadFileWeb(userId!, f, setPanelBgImage, setUploading)} />
                      : null
                    }
                    {Platform.OS !== 'web' && (
                      <TouchableOpacity
                        style={StyleSheet.absoluteFillObject}
                        onPress={() => pickImageNative(setPanelBgImage)}
                        disabled={uploading}
                      />
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
                  {Platform.OS === 'web'
                    ? <WebImageOverlay onFile={f => uploadFileWeb(userId!, f, setPanelBgImage, setUploading)} />
                    : null
                  }
                  {Platform.OS !== 'web' && (
                    <TouchableOpacity
                      style={StyleSheet.absoluteFillObject}
                      onPress={() => pickImageNative(setPanelBgImage)}
                      disabled={uploading}
                    />
                  )}
                </View>
              )}
            </View>

            {/* グリッドエディタ */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.sectionLabel, { marginHorizontal: 0 }]}>
                {draftTile ? 'コーナーをドラッグしてサイズ調整' : 'タップでタイル配置・編集'}
              </Text>
              {isWebDesktop && (
                <TouchableOpacity style={styles.wideModeBtn} onPress={() => setWideMode(v => !v)}>
                  <Ionicons name={wideMode ? 'contract-outline' : 'expand-outline'} size={16} color={Colors.accent} />
                  <Text style={styles.wideModeBtnText}>{wideMode ? '縮小' : '拡大'}</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.gridWrapper}>
              {panelBgImage && (
                <Image source={{ uri: panelBgImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" pointerEvents="none" />
              )}
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]} pointerEvents="none" />

              {/* ref を持つ View でサイズ・位置を記録。タップは最前面の absoluteFill TouchableOpacity で受付 */}
              <View
                ref={gridRef}
                id="reach-grid-area"
                style={styles.gridArea}
                onLayout={onGridLayout}
              >
                {/* 縦線 */}
                {Array.from({ length: GRID_COLS + 1 }, (_, i) => (
                  <View key={`v${i}`} pointerEvents="none" style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: `${(i / GRID_COLS) * 100}%` as any,
                    width: StyleSheet.hairlineWidth,
                    backgroundColor: 'rgba(255,255,255,0.12)',
                  }} />
                ))}
                {/* 横線 */}
                {Array.from({ length: GRID_ROWS + 1 }, (_, i) => (
                  <View key={`h${i}`} pointerEvents="none" style={{
                    position: 'absolute', left: 0, right: 0,
                    top: `${(i / GRID_ROWS) * 100}%` as any,
                    height: StyleSheet.hairlineWidth,
                    backgroundColor: 'rgba(255,255,255,0.12)',
                  }} />
                ))}
                {/* 配置済みタイル */}
                {buttons.map(btn => (
                  <View key={btn.id} pointerEvents="none" style={{
                    position: 'absolute',
                    left: `${(btn.x / GRID_COLS) * 100}%` as any,
                    top: `${(btn.y / GRID_ROWS) * 100}%` as any,
                    width: `${(btn.w / GRID_COLS) * 100}%` as any,
                    height: `${(btn.h / GRID_ROWS) * 100}%` as any,
                    backgroundColor: `${Colors.accent}99`,
                    borderWidth: 1.5, borderColor: Colors.accent,
                    alignItems: 'center', justifyContent: 'center', gap: 2,
                  }}>
                    <Ionicons name={btn.icon as any} size={11} color="#fff" />
                    <Text style={{ fontSize: 8, color: '#fff', fontWeight: '600', textAlign: 'center' }} numberOfLines={1}>{btn.label}</Text>
                  </View>
                ))}
                {/* ドラフトタイル（黄色ハイライト） */}
                {draftTile && (
                  <View pointerEvents="none" style={{
                    position: 'absolute',
                    left: `${(draftTile.x / GRID_COLS) * 100}%` as any,
                    top: `${(draftTile.y / GRID_ROWS) * 100}%` as any,
                    width: `${(draftTile.w / GRID_COLS) * 100}%` as any,
                    height: `${(draftTile.h / GRID_ROWS) * 100}%` as any,
                    backgroundColor: 'rgba(255,220,0,0.3)',
                    borderWidth: 2, borderColor: '#FFE000',
                  }} />
                )}
                {/* タップ受付レイヤー（視覚要素は全て pointerEvents="none"） */}
                <TouchableOpacity
                  activeOpacity={1}
                  style={StyleSheet.absoluteFillObject}
                  onPress={onGridPress}
                />
                {/* リサイズハンドル（辺の中央4点） */}
                {draftTile && (['top', 'right', 'bottom', 'left'] as const).map(edge => {
                  const lPct = edge === 'left' ? (draftTile.x / GRID_COLS) * 100
                    : edge === 'right' ? ((draftTile.x + draftTile.w) / GRID_COLS) * 100
                    : ((draftTile.x + draftTile.w / 2) / GRID_COLS) * 100
                  const tPct = edge === 'top' ? (draftTile.y / GRID_ROWS) * 100
                    : edge === 'bottom' ? ((draftTile.y + draftTile.h) / GRID_ROWS) * 100
                    : ((draftTile.y + draftTile.h / 2) / GRID_ROWS) * 100
                  return (
                    <View
                      key={edge}
                      style={{
                        position: 'absolute',
                        left: `${lPct}%` as any,
                        top: `${tPct}%` as any,
                        width: 14, height: 14,
                        backgroundColor: '#FFE000',
                        borderWidth: 2, borderColor: '#fff',
                        borderRadius: 7,
                        transform: [{ translateX: -7 }, { translateY: -7 }],
                        zIndex: 30,
                      }}
                      {...makeEdgeHandleResponders(edge)}
                    />
                  )
                })}
              </View>
            </View>

            {draftTile && (
              <View style={styles.draftActions}>
                <TouchableOpacity style={styles.cancelSelBtn} onPress={() => updateDraft(null)}>
                  <Text style={styles.cancelSelText}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={confirmDraft}>
                  <Text style={styles.confirmBtnText}>確定</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={[styles.note, { marginHorizontal: 0, textAlign: 'left' }]}>
              ※ URLには https:// から始まるリンクを入力してください。
            </Text>
          </View>

          {/* 右：プレビュー */}
          <View style={styles.rightCol}>
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
                  <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]} pointerEvents="none" />
                  {Array.from({ length: GRID_COLS + 1 }, (_, i) => (
                    <View key={`pv${i}`} pointerEvents="none" style={{
                      position: 'absolute', top: 0, bottom: 0,
                      left: `${(i / GRID_COLS) * 100}%` as any,
                      width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.06)',
                    }} />
                  ))}
                  {Array.from({ length: GRID_ROWS + 1 }, (_, i) => (
                    <View key={`ph${i}`} pointerEvents="none" style={{
                      position: 'absolute', left: 0, right: 0,
                      top: `${(i / GRID_ROWS) * 100}%` as any,
                      height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.06)',
                    }} />
                  ))}
                  {buttons.map(btn => (
                    <View key={btn.id} pointerEvents="none" style={{
                      position: 'absolute',
                      left: `${(btn.x / GRID_COLS) * 100}%` as any,
                      top: `${(btn.y / GRID_ROWS) * 100}%` as any,
                      width: `${(btn.w / GRID_COLS) * 100}%` as any,
                      height: `${(btn.h / GRID_ROWS) * 100}%` as any,
                      alignItems: 'center', justifyContent: 'center',
                      borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)',
                      overflow: 'hidden',
                    }}>
                      {btn.bgImage && <Image source={{ uri: btn.bgImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />}
                      {btn.bgImage && <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.4)' }]} />}
                      <Ionicons name={btn.icon as any} size={12} color="#FFF" />
                      <View style={styles.previewSep} />
                      <Text style={styles.previewLabel} numberOfLines={1}>{btn.label}</Text>
                    </View>
                  ))}
                  {buttons.length === 0 && (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>タイルなし</Text>
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
              <TouchableOpacity onPress={handleSaveBtn} disabled={
                (editingBtn?.action ?? 'url') === 'url' ? !editingBtn?.url?.trim() : !editingBtn?.code?.trim()
              }>
                <Text style={[styles.modalSave, (
                  (editingBtn?.action ?? 'url') === 'url' ? !editingBtn?.url?.trim() : !editingBtn?.code?.trim()
                ) && { opacity: 0.4 }]}>完了</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalBody}>
              {/* プレビュー */}
              <View style={styles.previewWrap}>
                <View style={styles.modalPreviewTile}>
                  {editingBtn?.bgImage && (
                    <Image source={{ uri: editingBtn.bgImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                  )}
                  {editingBtn?.bgImage && <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.4)' }]} pointerEvents="none" />}
                  <Ionicons name={(editingBtn?.icon ?? 'link-outline') as any} size={30} color="#FFF" />
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
                    <View style={[styles.bgBtn, { overflow: 'hidden' }]}>
                      <Text style={styles.bgBtnText}>{uploading ? '...' : '変更'}</Text>
                      {Platform.OS === 'web'
                        ? <WebImageOverlay onFile={f => uploadFileWeb(userId!, f, url => setEditingBtn(p => p ? { ...p, bgImage: url } : p), setUploading)} />
                        : null
                      }
                      {Platform.OS !== 'web' && (
                        <TouchableOpacity
                          style={StyleSheet.absoluteFillObject}
                          onPress={() => pickImageNative(url => setEditingBtn(p => p ? { ...p, bgImage: url } : p))}
                          disabled={uploading}
                        />
                      )}
                    </View>
                    <TouchableOpacity
                      style={[styles.bgBtn, styles.bgBtnDel]}
                      onPress={() => setEditingBtn(p => p ? { ...p, bgImage: undefined } : p)}
                    >
                      <Text style={styles.bgBtnDelText}>削除</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={[styles.bgPicker, { overflow: 'hidden' }]}>
                    {uploading
                      ? <ActivityIndicator size="small" color={Colors.accent} />
                      : <><Ionicons name="image-outline" size={20} color={Colors.accent} /><Text style={styles.bgPickerText}>画像を選択</Text></>
                    }
                    {Platform.OS === 'web'
                      ? <WebImageOverlay onFile={f => uploadFileWeb(userId!, f, url => setEditingBtn(p => p ? { ...p, bgImage: url } : p), setUploading)} />
                      : null
                    }
                    {Platform.OS !== 'web' && (
                      <TouchableOpacity
                        style={StyleSheet.absoluteFillObject}
                        onPress={() => pickImageNative(url => setEditingBtn(p => p ? { ...p, bgImage: url } : p))}
                        disabled={uploading}
                      />
                    )}
                  </View>
                )}
              </View>

              {/* アイコン */}
              <Text style={styles.fieldLabel}>アイコン</Text>
              <View style={styles.iconGrid}>
                {ICON_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.name}
                    style={[styles.iconOption, editingBtn?.icon === opt.name && styles.iconOptionActive]}
                    onPress={() => setEditingBtn(p => p ? { ...p, icon: opt.name } : p)}
                  >
                    <Ionicons name={opt.name as any} size={22} color={editingBtn?.icon === opt.name ? '#fff' : Colors.accent} />
                    <Text style={[styles.iconLabel, editingBtn?.icon === opt.name && { color: '#fff' }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* アクション種別 */}
              <Text style={styles.fieldLabel}>アクション</Text>
              <View style={styles.actionTypeRow}>
                {(['url', 'code'] as const).map(a => {
                  const isActive = (editingBtn?.action ?? 'url') === a
                  return (
                    <TouchableOpacity
                      key={a}
                      style={[styles.actionTypeBtn, isActive && styles.actionTypeBtnActive]}
                      onPress={() => setEditingBtn(p => p ? { ...p, action: a } : p)}
                    >
                      <Ionicons
                        name={a === 'url' ? 'link-outline' : 'code-slash-outline'}
                        size={16}
                        color={isActive ? '#fff' : Colors.accent}
                      />
                      <Text style={[styles.actionTypeBtnText, isActive && { color: '#fff' }]}>
                        {a === 'url' ? 'URLを開く' : 'コードを送信'}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {(editingBtn?.action ?? 'url') === 'url' ? (
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
              ) : (
                <>
                  <Text style={styles.fieldLabel}>送信コード</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="タップ時に自動送信するテキスト（例: #注文 / 予約希望）"
                    placeholderTextColor={Colors.textLight}
                    value={editingBtn?.code ?? ''}
                    onChangeText={text => setEditingBtn(p => p ? { ...p, code: text } : p)}
                    autoCapitalize="none"
                  />
                  <Text style={[styles.fieldLabel, { color: Colors.accent, fontWeight: '500', textTransform: 'none', letterSpacing: 0 }]}>
                    ユーザーがこのボタンを押すと、コードが自動でDMに送信されます
                  </Text>
                </>
              )}

              {/* 削除 */}
              {editingBtn?.id && buttons.some(b => b.id === editingBtn.id) && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteBtn(editingBtn.id!)}
                >
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
  leftCol: { flex: 1, gap: 10 },
  rightCol: { flex: 1 },
  sectionLabel: { fontSize: 11, color: Colors.textLight, marginHorizontal: 16 },
  gridWrapper: { backgroundColor: '#1C1C1E', overflow: 'hidden', borderRadius: 8 },
  wideModeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: Colors.accent },
  wideModeBtnText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  // 27列×18行 → 横長 (aspectRatio = 27/18 = 1.5)
  gridArea: { aspectRatio: 27 / 18 },
  draftActions: { flexDirection: 'row', gap: 8 },
  cancelSelBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: Colors.accent },
  cancelSelText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  confirmBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: Colors.accent },
  confirmBtnText: { fontSize: 12, color: '#fff', fontWeight: '700' },
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
  previewPanel: { backgroundColor: '#1C1C1E', overflow: 'hidden' },
  tileHandleArea: { alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  tileHandleBar: { width: 28, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  previewTileArea: { aspectRatio: 27 / 18, overflow: 'hidden' },
  previewSep: { width: 16, height: 1.5, backgroundColor: Colors.accent, marginVertical: 3 },
  previewLabel: { fontSize: 7, fontWeight: '600', textAlign: 'center', color: '#FFF' },
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
  modalPreviewTile: {
    width: 110, aspectRatio: 1, overflow: 'hidden',
    backgroundColor: '#2C2C2E', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 4,
  },
  tileSeparator: { width: 32, height: 2, backgroundColor: Colors.accent, marginVertical: 6 },
  tileLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center', color: '#FFF' },
  actionTypeRow: { flexDirection: 'row', gap: 8 },
  actionTypeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.accent,
  },
  actionTypeBtnActive: { backgroundColor: Colors.accent },
  actionTypeBtnText: { fontSize: 13, fontWeight: '600', color: Colors.accent },
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
