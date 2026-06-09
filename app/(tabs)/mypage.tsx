import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Modal, Image, ActivityIndicator, Clipboard, Linking, Platform, PanResponder, Share } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

// ── モジュールレベルキャッシュ ────────────────────────────────
// コンポーネントが再マウントされても直前のデータを即時表示し、かくつきをなくす
let _cachedUser: any = null
let _cachedProfile: any = null

const CROP_CONTAINER = 300
const CROP_CIRCLE = 220
const CROP_OUTPUT = 400
const CROP_INSET = (CROP_CONTAINER - CROP_CIRCLE) / 2

function WebCropModal({ uri, onConfirm, onCancel }: {
  uri: string
  onConfirm: (base64: string) => void
  onCancel: () => void
}) {
  const [dx, setDx] = useState(0)
  const [dy, setDy] = useState(0)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const base = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const img = new (window as any).Image()
    img.onload = () => setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = uri
  }, [uri])

  const scale = naturalSize ? CROP_CONTAINER / naturalSize.w : 1
  const displayH = naturalSize ? naturalSize.h * scale : CROP_CONTAINER
  const initialY = (CROP_CONTAINER - displayH) / 2

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gs) => { setDx(base.current.x + gs.dx); setDy(base.current.y + gs.dy) },
    onPanResponderRelease: (_, gs) => { base.current = { x: base.current.x + gs.dx, y: base.current.y + gs.dy } },
  })).current

  const handleConfirm = async () => {
    const canvas = document.createElement('canvas')
    canvas.width = CROP_OUTPUT
    canvas.height = CROP_OUTPUT
    const ctx = canvas.getContext('2d')!
    const img = new (window as any).Image()
    await new Promise<void>(resolve => { img.onload = resolve; img.src = uri })

    const sc = CROP_CONTAINER / img.naturalWidth
    const dh = img.naturalHeight * sc
    const iy = (CROP_CONTAINER - dh) / 2

    const srcCX = (CROP_CONTAINER / 2 - dx) / sc
    const srcCY = (CROP_CONTAINER / 2 - (iy + dy)) / sc
    const srcR = (CROP_CIRCLE / 2) / sc

    ctx.save()
    ctx.beginPath()
    ctx.arc(CROP_OUTPUT / 2, CROP_OUTPUT / 2, CROP_OUTPUT / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(img, srcCX - srcR, srcCY - srcR, srcR * 2, srcR * 2, 0, 0, CROP_OUTPUT, CROP_OUTPUT)
    ctx.restore()

    onConfirm(canvas.toDataURL('image/jpeg', 0.85).split(',')[1])
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={cropStyles.overlay}>
        <View style={cropStyles.card}>
          <Text style={cropStyles.title}>切り取り位置を調整</Text>
          <Text style={cropStyles.hint}>ドラッグして丸の範囲を決める</Text>

          <View style={cropStyles.container} {...panResponder.panHandlers}>
            {naturalSize && (
              <Image
                source={{ uri }}
                style={{
                  position: 'absolute',
                  width: CROP_CONTAINER,
                  height: displayH,
                  top: initialY + dy,
                  left: dx,
                }}
                resizeMode="cover"
              />
            )}
            <View
              pointerEvents="none"
              style={[
                cropStyles.circleOverlay,
                { boxShadow: `0 0 0 ${CROP_CONTAINER * 2}px rgba(0,0,0,0.6)` } as any,
              ]}
            />
          </View>

          <View style={cropStyles.btns}>
            <TouchableOpacity style={cropStyles.cancelBtn} onPress={onCancel}>
              <Text style={cropStyles.cancelText}>キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cropStyles.confirmBtn} onPress={handleConfirm}>
              <Text style={cropStyles.confirmText}>この位置で確定</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const SNS_FIELDS = [
  { key: 'x', label: 'X (Twitter)', placeholder: 'https://x.com/yourname', icon: 'logo-twitter' as const },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourname', icon: 'logo-instagram' as const },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourname', icon: 'logo-youtube' as const },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@yourname', icon: 'logo-tiktok' as const },
  { key: 'note', label: 'note', placeholder: 'https://note.com/yourname', icon: 'document-text-outline' as const },
  { key: 'website', label: 'Webサイト', placeholder: 'https://yoursite.com', icon: 'globe-outline' as const },
]

export default function MyPageScreen() {
  // キャッシュがあれば初期値として使う（フォーカス時のかくつき防止）
  const [user, setUser] = useState<any>(_cachedUser)
  const [profile, setProfile] = useState<any>(_cachedProfile)
  // キャッシュがない初回ロードのみスピナーを表示する（2回目以降はバックグラウンド更新）
  const [loading, setLoading] = useState(_cachedProfile === null)
  const [editVisible, setEditVisible] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editSns, setEditSns] = useState<Record<string, string>>({})
  const [editTags, setEditTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [cropVisible, setCropVisible] = useState(false)
  const [cropUri, setCropUri] = useState<string | null>(null)
  // 鍵アカウント & フォローリクエスト待ち件数
  const [isPrivate, setIsPrivate] = useState(false)
  const [pendingFollowCount, setPendingFollowCount] = useState(0)
  // ピックアップ配信（編集モーダル内）
  const [editPinnedId, setEditPinnedId] = useState<string | null>(null)
  const [showingPicker, setShowingPicker] = useState(false)
  const [pickerBroadcasts, setPickerBroadcasts] = useState<{ id: string; content: string; image_url: string | null; created_at: string }[]>([])
  const [loadingPicker, setLoadingPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getUser()
    if (!data.user) return
    // キャッシュと state を同時更新（非同期完了後にのみ反映）
    _cachedUser = data.user
    setUser(data.user)

    const { data: prof } = await supabase
      .from('profiles')
      .select('id, display_name, bio, avatar_url, is_official, username, sns_links, plan, is_private, pinned_broadcast_id')
      .eq('id', data.user.id)
      .single()
    _cachedProfile = prof
    setProfile(prof)
    setIsPrivate(prof?.is_private ?? false)

    // フォローリクエスト件数も同時に取得（別途 useFocusEffect を使わない）
    const { count } = await supabase
      .from('follow_requests')
      .select('id', { count: 'exact', head: true })
      .eq('target_id', data.user.id)
      .eq('status', 'pending')
    setPendingFollowCount(count ?? 0)
    setLoading(false)
  }, [])

  // フォーカスのたびにバックグラウンドで最新データを取得
  // キャッシュがあれば画面は即座に表示済みなのでかくつかない
  useFocusEffect(useCallback(() => {
    load()
  }, [load]))

const openEdit = () => {
    setEditName(profile?.display_name ?? '')
    setEditBio(profile?.bio ?? '')
    setEditUsername(profile?.username ?? '')
    setEditSns(profile?.sns_links ?? {})
    setEditTags(profile?.tags ?? [])
    setTagInput('')
    setUsernameError('')
    setEditPinnedId(profile?.pinned_broadcast_id ?? null)
    setShowingPicker(false)
    setPickerBroadcasts([])
    setPickerSearch('')
    setEditVisible(true)
  }

  const openPickupPicker = () => {
    if (showingPicker) { setShowingPicker(false); return }
    setPickerSearch('')
    setPickerBroadcasts([])
    setShowingPicker(true)
    // showingPicker が true になると useEffect が初回ロードを実行する
  }

  // pickerSearch が変わるたびにサーバー検索（300ms デバウンス）
  // showingPicker が true になった瞬間も実行（初回ロード）
  useEffect(() => {
    if (!showingPicker || !user) return
    setLoadingPicker(true)
    const timer = setTimeout(async () => {
      const trimmed = pickerSearch.trim()
      let q = supabase
        .from('broadcasts')
        .select('id, content, image_url, created_at')
        .eq('sender_id', user.id)
        .eq('status', 'published')
        .eq('is_subscriber_only', false)  // MB限定は除外
        .eq('target', 'all')              // 直近フォロワー限定（week/month）も除外
        .order('created_at', { ascending: false })

      if (trimmed) {
        // 日付パターン判定: YYYY-MM-DD / YYYY/MM/DD
        const dayMatch = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
        // 月パターン: YYYY-MM / YYYY/MM
        const monthMatch = trimmed.match(/^(\d{4})[\/\-](\d{1,2})$/)
        // 年パターン: YYYY
        const yearMatch = trimmed.match(/^(\d{4})$/)

        if (dayMatch) {
          const [, y, m, d] = dayMatch
          const start = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
          const next = new Date(+y, +m - 1, +d + 1).toISOString().slice(0, 10)
          q = (q as any).gte('created_at', `${start}T00:00:00`).lt('created_at', `${next}T00:00:00`)
        } else if (monthMatch) {
          const year = +monthMatch[1], month = +monthMatch[2]
          const start = `${year}-${String(month).padStart(2, '0')}-01`
          const end = month === 12
            ? `${year + 1}-01-01`
            : `${year}-${String(month + 1).padStart(2, '0')}-01`
          q = (q as any).gte('created_at', start).lt('created_at', end)
        } else if (yearMatch) {
          q = (q as any).gte('created_at', `${trimmed}-01-01`).lt('created_at', `${+trimmed + 1}-01-01`)
        } else {
          // キーワード検索（全件対象）
          q = (q as any).ilike('content', `%${trimmed}%`)
        }
        q = (q as any).limit(50)
      } else {
        // 空のときは最新30件
        q = (q as any).limit(30)
      }

      const { data } = await q
      setPickerBroadcasts(data ?? [])
      setLoadingPicker(false)
    }, pickerSearch ? 300 : 0)  // 入力中は300msデバウンス、初回は即時

    return () => clearTimeout(timer)
  }, [pickerSearch, showingPicker, user])

  const handleSave = async () => {
    if (!editName.trim()) return
    setUsernameError('')

    // ユーザーアドレスは必須
    const trimmedUsername = editUsername.trim().toLowerCase() || null
    if (!trimmedUsername) {
      setUsernameError('ユーザーアドレスは必須です')
      return
    }
    // 形式チェック
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(trimmedUsername)) {
      setUsernameError('3〜30文字の英数字・_のみ使用できます')
      return
    }

    // ユーザーID重複チェック
    if (trimmedUsername !== profile?.username) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', trimmedUsername)
        .neq('id', user.id)
        .maybeSingle()
      if (existing) {
        setUsernameError('このユーザーIDはすでに使われています')
        return
      }
    }

    setSaving(true)
    const { data, error } = await supabase
      .from('profiles')
      .update({
        display_name: editName.trim(),
        bio: editBio.trim() || null,
        username: trimmedUsername,
        sns_links: editSns,
        tags: editTags,
        pinned_broadcast_id: editPinnedId ?? null,
      })
      .eq('id', user.id)
      .select().single()
    setSaving(false)
    if (error) {
      if (error.message.includes('profiles_username_unique')) {
        setUsernameError('このユーザーIDはすでに使われています')
      } else {
        Alert.alert('エラー', error.message)
      }
    } else {
      setProfile(data)
      setEditVisible(false)
    }
  }

  const uploadAvatarBase64 = async (base64: string, ext: string) => {
    if (!user) return
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg'
    const path = `${user.id}/avatar.${ext}`
    const byteCharacters = atob(base64)
    const byteArray = new Uint8Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i)
    const { error } = await supabase.storage.from('avatars').upload(path, byteArray, { contentType, upsert: true })
    if (error) { Alert.alert('エラー', error.message); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const { data: updated } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id).select().single()
    if (updated) setProfile(updated)
  }

  const handleWebCropConfirm = async (base64: string) => {
    if (!cropUri) return
    setCropVisible(false)
    setUploadingAvatar(true)
    try {
      await uploadAvatarBase64(base64, 'jpg')
    } finally {
      setUploadingAvatar(false)
      if (cropUri.startsWith('blob:')) URL.revokeObjectURL(cropUri)
      setCropUri(null)
    }
  }

  const handleAvatarPress = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/jpeg,image/png,image/webp'
      input.onchange = (e: any) => {
        const file = e.target.files?.[0]
        if (!file) return
        setCropUri(URL.createObjectURL(file))
        setCropVisible(true)
      }
      input.click()
      return
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('許可が必要です', 'フォトライブラリへのアクセスを許可してください')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    })

    if (result.canceled || !result.assets[0]) return

    setUploadingAvatar(true)
    try {
      const asset = result.assets[0]
      if (!asset.base64) { Alert.alert('エラー', '画像の読み込みに失敗しました'); return }
      const ext = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase().replace('jpeg', 'jpg')
      await uploadAvatarBase64(asset.base64, ext)
    } finally {
      setUploadingAvatar(false)
    }
  }

  const displayName = profile?.display_name ?? user?.user_metadata?.display_name ?? 'ユーザー'
  const snsLinks: Record<string, string> = profile?.sns_links ?? {}
  const hasSns = SNS_FIELDS.some(f => snsLinks[f.key])

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {cropVisible && cropUri && (
        <WebCropModal uri={cropUri} onConfirm={handleWebCropConfirm} onCancel={() => { setCropVisible(false); if (cropUri?.startsWith('blob:')) URL.revokeObjectURL(cropUri); setCropUri(null) }} />
      )}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>マイページ</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileCard}>
          <TouchableOpacity onPress={handleAvatarPress} style={styles.avatarWrap} activeOpacity={0.8}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{displayName[0]}</Text>
              </View>
            )}
            {uploadingAvatar ? (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color={Colors.white} size="small" />
              </View>
            ) : (
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={14} color={Colors.white} />
              </View>
            )}
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.displayName}>{displayName}</Text>
            {profile?.is_official && <Ionicons name="checkmark-circle" size={18} color="#1D9BF0" />}
          </View>
          {profile?.username && (
            <Text style={styles.username}>@{profile.username}</Text>
          )}
          {profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}

          {hasSns && (
            <View style={styles.snsRow}>
              {SNS_FIELDS.filter(f => snsLinks[f.key]).map(f => (
                <TouchableOpacity key={f.key} onPress={() => Linking.openURL(snsLinks[f.key])} style={styles.snsIcon}>
                  <Ionicons name={f.icon} size={20} color={Colors.accent} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={styles.shareIdBtn}
            onPress={async () => {
              if (!user) return
              const profileUrl = `https://reachapp.jp/creator/${user.id}`
              const shareText = `${profile?.display_name ?? ''} のReachをチェック 👀`
              if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
                navigator.share({ title: `${profile?.display_name ?? 'Reach'} | Reach`, text: shareText, url: profileUrl }).catch(() => {})
              } else if (Platform.OS !== 'web') {
                Share.share({ message: `${shareText}\n${profileUrl}` }).catch(() => {})
              } else {
                Clipboard.setString(profileUrl)
                Alert.alert('コピーしました', 'プロフィールURLをコピーしました。')
              }
            }}
          >
            <Ionicons name="share-social-outline" size={14} color={Colors.accent} />
            <Text style={styles.shareIdText}>プロフィールを共有</Text>
          </TouchableOpacity>
        </View>

<View style={styles.menuSection}>
          <MenuItem icon="create-outline" label="プロフィール編集" onPress={openEdit} />
          <MenuItem icon="bar-chart-outline" label="分析" onPress={() => router.push('/analytics' as any)} />
          <MenuItem icon="people-outline" label="フォローリクエスト" onPress={() => router.push('/follow-requests' as any)} badge={pendingFollowCount} />
          <MenuItem icon="settings-outline" label="設定" onPress={() => router.push('/settings' as any)} last />
        </View>

      </ScrollView>

      <Modal visible={editVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditVisible(false)} style={styles.modalHeaderSide}>
              <Text style={styles.modalCancel}>キャンセル</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>プロフィール編集</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving || !editName.trim()} style={styles.modalHeaderSide}>
              <Text style={[styles.modalSave, (saving || !editName.trim()) && { opacity: 0.4 }, { textAlign: 'right' }]}>
                {saving ? '保存中' : '保存'}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.fieldLabel}>表示名</Text>
            <TextInput
              style={styles.fieldInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="表示名"
              placeholderTextColor={Colors.textLight}
            />
            <Text style={styles.fieldLabel}>ユーザーアドレス <Text style={{ color: '#E53E3E' }}>*</Text></Text>
            <TextInput
              style={[styles.fieldInput, usernameError ? styles.fieldInputError : null]}
              value={editUsername}
              onChangeText={v => { setEditUsername(v.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()); setUsernameError('') }}
              placeholder="例: reach_user123（英数字・_のみ・必須）"
              placeholderTextColor={Colors.textLight}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
            />
            {usernameError
              ? <Text style={styles.errorText}>{usernameError}</Text>
              : <Text style={{ fontSize: 11, color: Colors.textLight, marginBottom: 4 }}>3〜30文字・英数字・_のみ</Text>
            }
            <Text style={styles.fieldLabel}>自己紹介</Text>
            <TextInput
              style={[styles.fieldInput, styles.bioInput]}
              value={editBio}
              onChangeText={setEditBio}
              placeholder="自己紹介（任意）"
              placeholderTextColor={Colors.textLight}
              multiline
            />
            {/* ピックアップ配信 */}
            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>ピックアップ配信</Text>
            <Text style={[styles.fieldLabel, { fontSize: 11, fontWeight: '400', marginTop: 0, marginBottom: 8 }]}>
              プロフィールに固定表示する配信を1つ選べます。
            </Text>
            {/* 選択済みのプレビュー行 */}
            {editPinnedId && (
              <View style={styles.pickupPreviewRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickupPreviewText} numberOfLines={2}>
                    {pickerBroadcasts.find(b => b.id === editPinnedId)?.content?.trim() || '（設定済み）'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setEditPinnedId(null)} style={styles.pickupRemoveBtn} activeOpacity={0.7}>
                  <Ionicons name="close" size={16} color={Colors.textLight} />
                </TouchableOpacity>
              </View>
            )}
            {/* 配信選択ボタン（トグル） */}
            <TouchableOpacity
              style={[styles.pickupSelectBtn, showingPicker && { backgroundColor: Colors.button }]}
              onPress={openPickupPicker}
              activeOpacity={0.7}
            >
              <Ionicons name={showingPicker ? 'chevron-up' : 'bookmark-outline'} size={16} color={Colors.accent} />
              <Text style={styles.pickupSelectText}>{showingPicker ? '閉じる' : editPinnedId ? '変更する' : '配信を選択する'}</Text>
            </TouchableOpacity>
            {/* インラインピッカー */}
            {showingPicker && (
              <View style={styles.inlinePicker}>
                {/* 検索バー */}
                <View style={styles.pickerSearchWrap}>
                  <Ionicons name="search" size={15} color={Colors.textLight} />
                  <TextInput
                    style={styles.pickerSearchInput}
                    placeholder="キーワード・日付で検索（例: 2025-05）"
                    placeholderTextColor={Colors.textLight}
                    value={pickerSearch}
                    onChangeText={setPickerSearch}
                    autoFocus={false}
                    fontSize={16}
                  />
                  {pickerSearch ? (
                    <TouchableOpacity onPress={() => setPickerSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={16} color={Colors.textLight} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                {loadingPicker ? (
                  <ActivityIndicator color={Colors.accent} style={{ marginVertical: 16 }} />
                ) : pickerBroadcasts.length === 0 ? (
                  <Text style={styles.pinEmpty}>
                    {pickerSearch.trim() ? '該当する配信がありません' : '配信がまだありません'}
                  </Text>
                ) : (
                  pickerBroadcasts.map(bc => (
                    <TouchableOpacity
                      key={bc.id}
                      style={[styles.pinItem, editPinnedId === bc.id && { backgroundColor: `${Colors.accent}10` }]}
                      onPress={() => { setEditPinnedId(bc.id); setShowingPicker(false) }}
                      activeOpacity={0.7}
                    >
                      {bc.image_url
                        ? <Image source={{ uri: bc.image_url }} style={styles.pinThumb} />
                        : <View style={styles.pinThumbPlaceholder}><Ionicons name="image-outline" size={18} color={Colors.textLight} /></View>
                      }
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pinContent} numberOfLines={2}>{bc.content.trim() || ((bc as any).video_url ? '動画を送信しました' : '画像を送信しました')}</Text>
                        <Text style={styles.pinDate}>{new Date(bc.created_at).toLocaleDateString('ja-JP')}</Text>
                      </View>
                      {editPinnedId === bc.id && <Ionicons name="bookmark" size={16} color={Colors.accent} />}
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            <Text style={[styles.fieldLabel, { marginTop: 24 }]}>SNS・リンク</Text>
            {SNS_FIELDS.map(f => (
              <View key={f.key}>
                <View style={styles.snsFieldRow}>
                  <Ionicons name={f.icon} size={18} color={Colors.accent} style={styles.snsFieldIcon} />
                  <Text style={styles.snsFieldLabel}>{f.label}</Text>
                </View>
                <TextInput
                  style={styles.fieldInput}
                  value={editSns[f.key] ?? ''}
                  onChangeText={v => setEditSns(prev => ({ ...prev, [f.key]: v }))}
                  placeholder={f.placeholder}
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>
            ))}
            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>
              カテゴリータグ <Text style={{ color: Colors.textLight, fontWeight: '400' }}>（最大10個・検索に使用）</Text>
            </Text>
            <Text style={[styles.fieldLabel, { fontSize: 11, fontWeight: '400', marginTop: 0 }]}>
              プロフィールには表示されません。あなたの投稿内容に合うタグを登録してください。
            </Text>
            <View style={styles.tagInputRow}>
              <TextInput
                style={[styles.fieldInput, { flex: 1, paddingVertical: 10 }]}
                value={tagInput}
                onChangeText={v => setTagInput(v.replace(/[　\s#＃]/g, ''))}
                placeholder="例: ビジネス、料理、旅行"
                placeholderTextColor={Colors.textLight}
                onSubmitEditing={() => {
                  const t = tagInput.trim()
                  if (t && editTags.length < 10 && !editTags.includes(t)) {
                    setEditTags(p => [...p, t])
                  }
                  setTagInput('')
                }}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.tagAddBtn, (editTags.length >= 10 || !tagInput.trim()) && { opacity: 0.4 }]}
                disabled={editTags.length >= 10 || !tagInput.trim()}
                onPress={() => {
                  const t = tagInput.trim()
                  if (t && editTags.length < 10 && !editTags.includes(t)) {
                    setEditTags(p => [...p, t])
                  }
                  setTagInput('')
                }}
              >
                <Text style={styles.tagAddBtnText}>追加</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.tagList}>
              {editTags.map(tag => (
                <TouchableOpacity key={tag} style={styles.tagChip} onPress={() => setEditTags(p => p.filter(t => t !== tag))}>
                  <Text style={styles.tagChipText}>#{tag}</Text>
                  <Ionicons name="close" size={12} color={Colors.accent} />
                </TouchableOpacity>
              ))}
              {editTags.length === 0 && (
                <Text style={{ fontSize: 12, color: Colors.textLight }}>タグがまだありません</Text>
              )}
            </View>
            <Text style={{ fontSize: 11, color: Colors.textLight, marginTop: 4 }}>{editTags.length}/10</Text>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

function MenuItem({ icon, label, onPress, badge = 0, last = false }: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  onPress: () => void
  badge?: number
  last?: boolean
}) {
  return (
    <TouchableOpacity style={[styles.menuItem, last && styles.menuItemLast]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={Colors.accent} style={styles.menuIcon} />
      <Text style={styles.menuLabel}>{label}</Text>
      {badge > 0 && (
        <View style={styles.menuBadge}>
          <Text style={styles.menuBadgeText}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: 36,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.accent },
  content: { padding: 16, gap: 16 },
  profileCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  avatarWrap: { position: 'relative', marginBottom: 8 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.button,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 40, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.white,
  },
  avatarText: { fontSize: 30, fontWeight: '700', color: Colors.white },
  displayName: { fontSize: 20, fontWeight: '700', color: Colors.text },
  bio: { fontSize: 13, color: Colors.textLight, textAlign: 'center' },
  username: { fontSize: 13, color: Colors.accent, marginTop: 2 },
  snsRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  snsIcon: { padding: 4 },
  shareIdBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 8, paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: Colors.background, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border,
  },
  shareIdText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  // フォローリクエスト待ちバナー
  followRequestBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.accent, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    marginBottom: 8,
  },
  followRequestLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  followRequestText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  followRequestBadge: {
    backgroundColor: Colors.white, borderRadius: 12,
    minWidth: 24, height: 24, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  followRequestBadgeText: { fontSize: 13, fontWeight: '800', color: Colors.accent },

  menuSection: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuItemLast: { borderBottomWidth: 0 },
  menuIcon: { width: 24 },
  menuLabel: { flex: 1, fontSize: 15, color: Colors.text, fontWeight: '500' },
  menuBadge: {
    backgroundColor: Colors.accent, borderRadius: 10,
    minWidth: 20, height: 20, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center', marginRight: 4,
  },
  menuBadgeText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    backgroundColor: Colors.header,
    paddingTop: 36,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalCancel: { fontSize: 15, color: Colors.textLight },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, flex: 1, textAlign: 'center' },
  modalHeaderSide: { minWidth: 60 },
  modalSave: { fontSize: 15, color: Colors.accent, fontWeight: '700' },
  modalBody: { padding: 20 },
  fieldLabel: { fontSize: 13, color: Colors.textLight, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  fieldInput: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fieldInputError: { borderColor: '#E53E3E' },
  errorText: { fontSize: 12, color: '#E53E3E', marginTop: 4 },
  bioInput: { minHeight: 100, textAlignVertical: 'top' },
  snsFieldRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 4 },
  snsFieldIcon: {},
  snsFieldLabel: { fontSize: 13, color: Colors.textLight, fontWeight: '600' },
  tagInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  tagAddBtn: {
    backgroundColor: Colors.accent, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  tagAddBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  tagList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${Colors.accent}15`, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: `${Colors.accent}30`,
  },
  tagChipText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  // ピックアップ配信（編集モーダル内）
  pickupPreviewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 12,
  },
  pickupPreviewText: { fontSize: 13, color: Colors.text, lineHeight: 18 },
  pickupChangeSmallBtn: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  pickupChangeSmallText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  pickupRemoveBtn: { padding: 4 },
  pickupSelectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 14, backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
  },
  pickupSelectText: { fontSize: 14, color: Colors.accent, fontWeight: '600' },
  pinEmpty: { textAlign: 'center', color: Colors.textLight, fontSize: 14, marginVertical: 24 },
  inlinePicker: {
    backgroundColor: Colors.background, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    marginTop: 4, overflow: 'hidden',
  },
  pickerSearchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  pickerSearchInput: {
    flex: 1, fontSize: 14, color: Colors.text,
  },
  pinItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  pinThumb: { width: 52, height: 52, borderRadius: 8, resizeMode: 'cover' },
  pinThumbPlaceholder: {
    width: 52, height: 52, borderRadius: 8, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  pinContent: { fontSize: 13, color: Colors.text, lineHeight: 18 },
  pinDate: { fontSize: 11, color: Colors.textLight, marginTop: 3 },
})

const cropStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 20, alignItems: 'center', gap: 12, width: '100%', maxWidth: 340 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.text },
  hint: { fontSize: 12, color: Colors.textLight },
  container: {
    width: CROP_CONTAINER, height: CROP_CONTAINER,
    overflow: 'hidden', borderRadius: 8,
    backgroundColor: '#000',
  },
  circleOverlay: {
    position: 'absolute',
    top: CROP_INSET, left: CROP_INSET,
    width: CROP_CIRCLE, height: CROP_CIRCLE,
    borderRadius: CROP_CIRCLE / 2,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)',
  },
  btns: { flexDirection: 'row', gap: 10, width: '100%' },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  cancelText: { fontSize: 14, color: Colors.text, fontWeight: '600' },
  confirmBtn: {
    flex: 1, backgroundColor: Colors.accent, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  confirmText: { fontSize: 14, color: Colors.white, fontWeight: '700' },
})
