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

type TileButton = {
  id: string
  label: string
  url: string
  icon: string
  bgImage?: string
  x: number
  y: number
  w: number
  h: number
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

async function uploadImageNative(
  userId: string, asset: ImagePicker.ImagePickerAsset, token: string,
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
  userId: string, file: File,
  onSuccess: (url: string) => void, setUploading: (v: boolean) => void,
) {
  setUploading(true)
  try {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `tiles/${userId}/img_${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from(BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })
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
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' } as any}
        onChange={(e: any) => { const file = e.target.files?.[0]; if (file) { onFile(file); e.target.value = '' } }}
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
  const trackBg = anim.interpolate({ inputRange: [0, 1], outputRange: ['#D1D5DB', Colors.accent] })
  return (
    <TouchableOpacity onPress={() => onChange(!value)} activeOpacity={0.85}>
      <Animated.View style={[styles.toggleTrack, { backgroundColor: trackBg }]}>
        <Animated.View style={[styles.toggleThumb, { transform: [{ translateX: thumbX }] }]} />
      </Animated.View>
    </TouchableOpacity>
  )
}

export default function TileScreen() {
  const [isActive, setIsActive] = useState(false)
  const [buttons, setButtons] = useState<TileButton[]>([])
  const [panelBgImage, setPanelBgImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [tileId, setTileId] = useState<string | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingBtn, setEditingBtn] = useState<Partial<TileButton> | null>(null)
  const [uploading, setUploading] = useState(false)
  const [draftTile, setDraftTile] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [scrollEnabled, setScrollEnabled] = useState(true)
  const gridRef = useRef<any>(null)
  const gridRectRef = useRef({ x: 0, y: 0, w: 1, h: 1 })
  const draftTileRef = useRef(draftTile)
  draftTileRef.current = draftTile

  const updateDraft = (v: typeof draftTile) => {
    draftTileRef.current = v
    setDraftTile(v)
  }

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data } = await supabase.from('rich_menus').select('*').eq('creator_id', user.id).single()
    if (data) {
      setTileId(data.id)
      setIsActive(data.is_active)
      const raw: any[] = data.buttons ?? []
      const normalized = raw.map((b, i) =>
        b.x != null ? b : { ...b, ...(DEFAULT_POSITIONS[i] ?? { x: 0, y: 0, w: 9, h: 9 }) }
      ) as TileButton[]
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
    if (tileId) {
      await supabase.from('rich_menus').update(payload).eq('id', tileId)
    } else {
      const { data } = await supabase.from('rich_menus').insert({ creator_id: userId, ...payload }).select().single()
      if (data) setTileId(data.id)
    }
    setSaving(false)
    router.back()
  }

  const getTileAt = useCallback((col: number, row: number) =>
    buttons.find(b => col >= b.x && col < b.x + b.w && row >= b.y && row < b.y + b.h) ?? null
  , [buttons])

  const handleCellPress = useCallback((col: number, row: number) => {
    const existing = getTileAt(col, row)
    if (existing) {
      updateDraft(null)
      setEditingBtn({ ...existing })
      setModalVisible(true)
      return
    }
    updateDraft({ x: col, y: row, w: 1, h: 1 })
  }, [getTileAt])

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

  const makeEdgeHandleResponders = (edge: 'top' | 'right' | 'bottom' | 'left') => ({
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: () => setScrollEnabled(false),
    onResponderMove: (e: any) => {
      const dt = draftTileRef.current
      if (!dt) return
      const { pageX, pageY } = e.nativeEvent
      const { x: gx, y: gy, w: gw, h: gh } = gridRectRef.current
      const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor((pageX - gx) / (gw / GRID_COLS))))
      const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor((pageY - gy) / (gh / GRID_ROWS))))
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
    if (!editingBtn?.label?.trim() || !editingBtn?.url?.trim()) return
    const updated = { ...editingBtn, label: editingBtn.label.trim(), url: editingBtn.url.trim() } as TileButton
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

  const onGridLayout = () => {
    gridRef.current?.measure((_: any, __: any, w: number, h: number, px: number, py: number) => {
      gridRectRef.current = { x: px, y: py, w, h }
    })
  }

  const onGridPress = (e: any) => {
    const { pageX, pageY } = e.nativeEvent
    const { x, y, w, h } = gridRectRef.current
    const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor(((pageX - x) / w) * GRID_COLS)))
    const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(((pageY - y) / h) * GRID_ROWS)))
    handleCellPress(col, row)
  }

  // チャット風フラットプレビュー（compose と同スタイル）
  const PhonePreview = () => (
    <View style={styles.phoneFrame}>
      {/* ヘッダー */}
      <View style={styles.phoneHeader}>
        <View style={styles.phoneAvatar}><Text style={styles.phoneAvatarText}>R</Text></View>
        <View>
          <Text style={styles.phoneHeaderName}>クリエイター名</Text>
          <Text style={styles.phoneHeaderSub}>トーク画面</Text>
        </View>
      </View>
      {/* チャットエリア */}
      <View style={styles.phoneChatArea}>
        <View style={styles.dateBadge}>
          <Text style={styles.dateBadgeText}>{new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}</Text>
        </View>
        <View style={styles.bubbleRow}>
          <View style={styles.bubbleAvatar}><Text style={styles.bubbleAvatarText}>R</Text></View>
          <View style={styles.bubble}><Text style={styles.bubbleText}>こんにちは！</Text></View>
        </View>
        <View style={[styles.bubbleRow, { justifyContent: 'flex-end' }]}>
          <View style={[styles.bubble, styles.bubbleSelf]}>
            <Text style={[styles.bubbleText, { color: '#FFF' }]}>よろしく！</Text>
          </View>
        </View>
      </View>
      {/* タイルパネル */}
      <View style={styles.phoneTilePanel}>
        <View style={styles.phoneTileHandle}>
          <View style={styles.phoneTileHandleBar} />
        </View>
        <View style={styles.phoneTileGrid}>
          {panelBgImage && (
            <Image source={{ uri: panelBgImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" pointerEvents="none" />
          )}
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]} pointerEvents="none" />
          {Array.from({ length: GRID_COLS + 1 }, (_, i) => (
            <View key={`pv${i}`} pointerEvents="none" style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${(i / GRID_COLS) * 100}%` as any,
              width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)',
            }} />
          ))}
          {Array.from({ length: GRID_ROWS + 1 }, (_, i) => (
            <View key={`ph${i}`} pointerEvents="none" style={{
              position: 'absolute', left: 0, right: 0,
              top: `${(i / GRID_ROWS) * 100}%` as any,
              height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)',
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
              borderRightWidth: 0.5, borderBottomWidth: 0.5,
              borderColor: 'rgba(255,255,255,0.15)', overflow: 'hidden',
            }}>
              {btn.bgImage && <Image source={{ uri: btn.bgImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />}
              {btn.bgImage && <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.4)' }]} />}
              <Ionicons name={btn.icon as any} size={14} color="#FFF" />
              <View style={{ width: 16, height: 1.5, backgroundColor: Colors.accent, marginVertical: 3 }} />
              <Text style={{ fontSize: 9, fontWeight: '600', color: '#FFF', textAlign: 'center' }} numberOfLines={1}>{btn.label}</Text>
            </View>
          ))}
          {buttons.length === 0 && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>タイルなし</Text>
            </View>
          )}
        </View>
      </View>
      {/* DMエリア */}
      <View style={styles.phoneDmRow}>
        <View style={styles.phoneDmField}><Text style={styles.phoneDmPlaceholder}>DMを送る...</Text></View>
        <View style={styles.phoneDmSend}><Ionicons name="send" size={12} color="#FFF" /></View>
      </View>
    </View>
  )

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

      {/* 2カラムレイアウト */}
      <View style={styles.bodyRow}>

        {/* 左：設定エリア */}
        <ScrollView
          style={styles.leftPanel}
          scrollEnabled={scrollEnabled}
          contentContainerStyle={styles.leftContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 表示切り替え */}
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>メニューを表示</Text>
              <Text style={styles.toggleDesc}>トーク画面に表示</Text>
            </View>
            <ToggleSwitch value={isActive} onChange={setIsActive} />
          </View>

          {/* パネル背景 */}
          <View style={[styles.card, { flexDirection: 'column', alignItems: 'stretch' }]}>
            <Text style={[styles.cardTitle, { marginBottom: 8 }]}>パネル背景</Text>
            {panelBgImage ? (
              <View style={styles.bgActions}>
                <Image source={{ uri: panelBgImage }} style={styles.bgThumb} resizeMode="cover" />
                <View style={[styles.bgBtn, { overflow: 'hidden' }]}>
                  <Text style={styles.bgBtnText}>{uploading ? '...' : '変更'}</Text>
                  {Platform.OS === 'web'
                    ? <WebImageOverlay onFile={f => uploadFileWeb(userId!, f, setPanelBgImage, setUploading)} />
                    : null}
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
                  : <><Ionicons name="image-outline" size={16} color={Colors.accent} /><Text style={styles.bgPickerText}>背景画像を選択</Text></>
                }
                {Platform.OS === 'web'
                  ? <WebImageOverlay onFile={f => uploadFileWeb(userId!, f, setPanelBgImage, setUploading)} />
                  : null}
                {Platform.OS !== 'web' && (
                  <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => pickImageNative(setPanelBgImage)} disabled={uploading} />
                )}
              </View>
            )}
          </View>

          {/* グリッドエディタ */}
          <Text style={styles.sectionLabel}>
            {draftTile ? '辺をドラッグしてサイズ調整' : 'タップで配置・編集'}
          </Text>

          <View style={styles.gridWrapper}>
            {panelBgImage && (
              <Image source={{ uri: panelBgImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" pointerEvents="none" />
            )}
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]} pointerEvents="none" />
            <View ref={gridRef} style={styles.gridArea} onLayout={onGridLayout}>
              {Array.from({ length: GRID_COLS + 1 }, (_, i) => (
                <View key={`v${i}`} pointerEvents="none" style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${(i / GRID_COLS) * 100}%` as any,
                  width: StyleSheet.hairlineWidth,
                  backgroundColor: 'rgba(255,255,255,0.12)',
                }} />
              ))}
              {Array.from({ length: GRID_ROWS + 1 }, (_, i) => (
                <View key={`h${i}`} pointerEvents="none" style={{
                  position: 'absolute', left: 0, right: 0,
                  top: `${(i / GRID_ROWS) * 100}%` as any,
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: 'rgba(255,255,255,0.12)',
                }} />
              ))}
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
              <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFillObject} onPress={onGridPress} />

              {/* 辺ハンドル（カプセル形） */}
              {draftTile && (['top', 'right', 'bottom', 'left'] as const).map(edge => {
                const isHoriz = edge === 'top' || edge === 'bottom'
                const lPct = edge === 'left' ? (draftTile.x / GRID_COLS) * 100
                  : edge === 'right' ? ((draftTile.x + draftTile.w) / GRID_COLS) * 100
                  : ((draftTile.x + draftTile.w / 2) / GRID_COLS) * 100
                const tPct = edge === 'top' ? (draftTile.y / GRID_ROWS) * 100
                  : edge === 'bottom' ? ((draftTile.y + draftTile.h) / GRID_ROWS) * 100
                  : ((draftTile.y + draftTile.h / 2) / GRID_ROWS) * 100
                const hw = isHoriz ? 32 : 10
                const hh = isHoriz ? 10 : 32
                return (
                  <View
                    key={edge}
                    style={{
                      position: 'absolute',
                      left: `${lPct}%` as any,
                      top: `${tPct}%` as any,
                      width: hw, height: hh,
                      backgroundColor: '#FFE000',
                      borderWidth: 2, borderColor: '#fff',
                      borderRadius: 5,
                      transform: [{ translateX: -(hw / 2) }, { translateY: -(hh / 2) }],
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

          <Text style={styles.note}>※ URLには https:// から始まるリンクを入力してください。</Text>
        </ScrollView>

        {/* 右：フラットプレビュー */}
        <View style={styles.rightPanel}>
          <Text style={styles.previewLabel}>プレビュー</Text>
          <View style={{ flex: 1 }}>
            <PhonePreview />
          </View>
        </View>

      </View>

      {/* タイル編集モーダル */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => { setModalVisible(false); setEditingBtn(null) }}>
                <Text style={styles.modalCancel}>キャンセル</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>タイル設定</Text>
              <TouchableOpacity onPress={handleSaveBtn} disabled={!editingBtn?.label?.trim() || !editingBtn?.url?.trim()}>
                <Text style={[styles.modalSave, (!editingBtn?.label?.trim() || !editingBtn?.url?.trim()) && { opacity: 0.4 }]}>完了</Text>
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
                        : null}
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
                    {Platform.OS === 'web'
                      ? <WebImageOverlay onFile={f => uploadFileWeb(userId!, f, url => setEditingBtn(p => p ? { ...p, bgImage: url } : p), setUploading)} />
                      : null}
                    {Platform.OS !== 'web' && (
                      <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => pickImageNative(url => setEditingBtn(p => p ? { ...p, bgImage: url } : p))} disabled={uploading} />
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

              {/* ラベル */}
              <Text style={styles.fieldLabel}>ラベル</Text>
              <TextInput
                style={styles.input}
                placeholder="例: 公式サイト"
                placeholderTextColor={Colors.textLight}
                value={editingBtn?.label ?? ''}
                onChangeText={text => setEditingBtn(p => p ? { ...p, label: text } : p)}
                maxLength={12}
              />

              {/* URL */}
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

  // 2カラム
  bodyRow: { flex: 1, flexDirection: 'row' },

  // 左パネル
  leftPanel: { flex: 1, borderRightWidth: 1, borderRightColor: Colors.border },
  leftContent: { padding: 12, paddingBottom: 40, gap: 10 },

  // 右パネル（フラットプレビュー）
  rightPanel: {
    width: 320,
    backgroundColor: Colors.background,
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 16,
    gap: 8,
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
  },
  previewLabel: { fontSize: 13, fontWeight: '700', color: Colors.textLight },

  // compose と同スタイルのフラットフレーム
  phoneFrame: {
    flex: 1, backgroundColor: '#F0F0F0', borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
  },
  phoneHeader: {
    backgroundColor: Colors.white, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  phoneAvatar: {
    width: 34, height: 34, borderRadius: 7,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center',
  },
  phoneAvatarText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  phoneHeaderName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  phoneHeaderSub: { fontSize: 10, color: Colors.textLight },
  phoneChatArea: { padding: 12, gap: 8 },
  dateBadge: { alignItems: 'center', marginVertical: 4 },
  dateBadgeText: {
    fontSize: 11, color: Colors.textLight,
    backgroundColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
  },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  bubbleAvatar: {
    width: 30, height: 30, borderRadius: 6,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center',
  },
  bubbleAvatarText: { fontSize: 12, fontWeight: '700', color: Colors.white },
  bubble: {
    backgroundColor: Colors.white, borderRadius: 14, borderTopLeftRadius: 4, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  bubbleSelf: { backgroundColor: Colors.accent, borderTopLeftRadius: 14, borderTopRightRadius: 4 },
  bubbleText: { fontSize: 13, color: Colors.text, lineHeight: 20, padding: 10 },
  phoneTilePanel: { backgroundColor: '#1C1C1E', overflow: 'hidden' },
  phoneTileHandle: {
    alignItems: 'center', paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  phoneTileHandleBar: { width: 28, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  phoneTileGrid: { aspectRatio: 27 / 18, overflow: 'hidden' },
  phoneDmRow: {
    backgroundColor: Colors.white,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  phoneDmField: {
    flex: 1, height: 34, borderRadius: 17,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, justifyContent: 'center',
  },
  phoneDmPlaceholder: { fontSize: 13, color: Colors.textLight },
  phoneDmSend: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },

  // 設定カード
  card: {
    backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8,
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  toggleLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  toggleDesc: { fontSize: 11, color: Colors.textLight, marginTop: 1 },
  toggleTrack: { width: 54, height: 30, borderRadius: 15, justifyContent: 'center' },
  toggleThumb: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  bgActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bgThumb: { width: 40, height: 40, borderRadius: 6 },
  bgBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: Colors.accent },
  bgBtnText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  bgBtnDel: { borderColor: '#E53E3E' },
  bgBtnDelText: { fontSize: 12, color: '#E53E3E', fontWeight: '600' },
  bgPicker: {
    height: 38, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.accent, borderStyle: 'dashed',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  bgPickerText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  sectionLabel: { fontSize: 10, color: Colors.textLight },
  gridWrapper: { backgroundColor: '#1C1C1E', overflow: 'hidden', borderRadius: 8 },
  gridArea: { aspectRatio: 27 / 18 },
  draftActions: { flexDirection: 'row', gap: 8 },
  cancelSelBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: Colors.accent },
  cancelSelText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  confirmBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.accent },
  confirmBtnText: { fontSize: 12, color: '#fff', fontWeight: '700' },
  note: { fontSize: 10, color: Colors.textLight, lineHeight: 16 },

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
  modalPreviewTile: {
    width: 120, aspectRatio: 1, overflow: 'hidden',
    backgroundColor: '#2C2C2E', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 4,
  },
  tileSeparator: { width: 32, height: 2, backgroundColor: Colors.accent, marginVertical: 6 },
  tileLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center', color: '#FFF' },
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
