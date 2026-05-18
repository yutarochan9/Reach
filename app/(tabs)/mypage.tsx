import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Modal, Image, ActivityIndicator, Clipboard, Linking } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

const SNS_FIELDS = [
  { key: 'x', label: 'X (Twitter)', placeholder: 'https://x.com/yourname', icon: 'logo-twitter' as const },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourname', icon: 'logo-instagram' as const },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourname', icon: 'logo-youtube' as const },
  { key: 'website', label: 'Webサイト', placeholder: 'https://yoursite.com', icon: 'globe-outline' as const },
]

export default function MyPageScreen() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [editVisible, setEditVisible] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editSns, setEditSns] = useState<Record<string, string>>({})
  const [usernameError, setUsernameError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getUser()
    if (!data.user) return
    setUser(data.user)
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', data.user.id).single()
    setProfile(prof)
  }, [])

  useEffect(() => { load() }, [load])

  const handleLogout = async () => {
    Alert.alert('ログアウト', 'ログアウトしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'ログアウト', style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  const openEdit = () => {
    setEditName(profile?.display_name ?? '')
    setEditBio(profile?.bio ?? '')
    setEditUsername(profile?.username ?? '')
    setEditSns(profile?.sns_links ?? {})
    setUsernameError('')
    setEditVisible(true)
  }

  const handleSave = async () => {
    if (!editName.trim()) return
    setUsernameError('')

    // ユーザーID重複チェック
    const trimmedUsername = editUsername.trim() || null
    if (trimmedUsername && trimmedUsername !== profile?.username) {
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

  const handleAvatarPress = async () => {
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
      const ext = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase().replace('jpeg', 'jpg')
      const path = `${user.id}/avatar.${ext}`
      const contentType = ext === 'png' ? 'image/png' : 'image/jpeg'

      if (!asset.base64) {
        Alert.alert('エラー', '画像の読み込みに失敗しました')
        return
      }

      const byteCharacters = atob(asset.base64)
      const byteArray = new Uint8Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i)
      }

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, byteArray, { contentType, upsert: true })

      if (uploadError) {
        Alert.alert('エラー', uploadError.message)
        return
      }

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const { data: updated } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)
        .select().single()

      if (updated) setProfile(updated)
    } finally {
      setUploadingAvatar(false)
    }
  }

  const displayName = profile?.display_name ?? user?.user_metadata?.display_name ?? 'ユーザー'
  const snsLinks: Record<string, string> = profile?.sns_links ?? {}
  const hasSns = SNS_FIELDS.some(f => snsLinks[f.key])

  return (
    <View style={styles.container}>
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
          <Text style={styles.displayName}>{displayName}</Text>
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
            onPress={() => {
              const id = profile?.username ?? displayName
              Clipboard.setString(id)
              Alert.alert('コピーしました', `「${id}」をクリップボードにコピーしました。`)
            }}
          >
            <Ionicons name="share-social-outline" size={14} color={Colors.accent} />
            <Text style={styles.shareIdText}>プロフィール名をコピー</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.menuSection}>
          <MenuItem icon="create-outline" label="プロフィール編集" onPress={openEdit} />
          <MenuItem icon="settings-outline" label="設定" onPress={() => router.push('/settings' as any)} last />
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>ログアウト</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={editVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditVisible(false)}>
              <Text style={styles.modalCancel}>キャンセル</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>プロフィール編集</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving || !editName.trim()}>
              <Text style={[styles.modalSave, (saving || !editName.trim()) && { opacity: 0.4 }]}>
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
            <Text style={styles.fieldLabel}>ユーザーID（アドレス）</Text>
            <TextInput
              style={[styles.fieldInput, usernameError ? styles.fieldInputError : null]}
              value={editUsername}
              onChangeText={v => { setEditUsername(v.replace(/[^a-zA-Z0-9_]/g, '')); setUsernameError('') }}
              placeholder="例: reach_user123（英数字・_のみ）"
              placeholderTextColor={Colors.textLight}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {usernameError ? <Text style={styles.errorText}>{usernameError}</Text> : null}
            <Text style={styles.fieldLabel}>自己紹介</Text>
            <TextInput
              style={[styles.fieldInput, styles.bioInput]}
              value={editBio}
              onChangeText={setEditBio}
              placeholder="自己紹介（任意）"
              placeholderTextColor={Colors.textLight}
              multiline
            />
            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>SNS・リンク</Text>
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
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.accent },
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
  logoutButton: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logoutText: { color: '#E53E3E', fontWeight: '600', fontSize: 15 },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    backgroundColor: Colors.header,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalCancel: { fontSize: 15, color: Colors.textLight },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
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
})
