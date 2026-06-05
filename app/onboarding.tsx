import { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, Image } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

export default function OnboardingScreen() {
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername]       = useState('')
  const [saving, setSaving]           = useState(false)

  // username の重複チェック状態
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // username が変わるたびに 600ms デバウンスで重複チェック
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const val = username.trim()
    if (!val) { setUsernameStatus('idle'); return }

    // 形式チェック（英数字・アンダースコアのみ、3文字以上）
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(val)) {
      setUsernameStatus('invalid')
      return
    }

    setUsernameStatus('checking')
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', val)
        .maybeSingle()
      setUsernameStatus(data ? 'taken' : 'ok')
    }, 600)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [username])

  const canSave = displayName.trim().length > 0 && usernameStatus === 'ok' && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim(),
        username: username.trim().toLowerCase(),
      })
      .eq('id', user.id)

    setSaving(false)
    if (error) {
      // unique制約エラーの場合（競合）
      if (error.code === '23505') {
        setUsernameStatus('taken')
        Alert.alert('このユーザーアドレスはすでに使われています', '別のアドレスを入力してください。')
      } else {
        Alert.alert('エラー', error.message)
      }
    } else {
      router.replace('/(tabs)/')
    }
  }

  // username ステータスに応じたUI
  const getUsernameStyle = () => {
    if (usernameStatus === 'ok')      return { borderColor: '#16a34a' }
    if (usernameStatus === 'taken')   return { borderColor: '#E53E3E' }
    if (usernameStatus === 'invalid') return { borderColor: '#E53E3E' }
    return {}
  }
  const getUsernameHint = () => {
    if (usernameStatus === 'checking') return { text: '確認中...', color: Colors.textLight }
    if (usernameStatus === 'ok')       return { text: '✓ 使用できます', color: '#16a34a' }
    if (usernameStatus === 'taken')    return { text: '✗ このアドレスはすでに使われています', color: '#E53E3E' }
    if (usernameStatus === 'invalid')  return { text: '3〜30文字の英数字・_(アンダースコア)のみ', color: '#E53E3E' }
    return { text: '3〜30文字・英数字・_のみ（後から変更可）', color: Colors.textLight }
  }

  const hint = getUsernameHint()

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Image source={require('../assets/icon.png')} style={styles.iconWrap} />

        <Text style={styles.title}>Reachへようこそ</Text>
        <Text style={styles.subtitle}>まずはプロフィールを設定しましょう</Text>

        <View style={styles.form}>
          {/* 表示名 */}
          <Text style={styles.label}>表示名 <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="例: 田中 太郎"
            placeholderTextColor={Colors.textLight}
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={30}
          />

          {/* ユーザーアドレス（必須・重複不可） */}
          <Text style={[styles.label, { marginTop: 14 }]}>
            ユーザーアドレス <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, getUsernameStyle()]}
            placeholder="例: tanaka_taro"
            placeholderTextColor={Colors.textLight}
            value={username}
            onChangeText={v => setUsername(v.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
          />
          <Text style={[styles.hint, { color: hint.color }]}>{hint.text}</Text>
        </View>

        <TouchableOpacity
          style={[styles.button, !canSave && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={!canSave}
        >
          <Text style={styles.buttonText}>{saving ? '設定中...' : 'はじめる'}</Text>
          {!saving && <Ionicons name="arrow-forward" size={18} color={Colors.white} />}
        </TouchableOpacity>

        {/* スキップ不可のため削除 */}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inner: { flex: 1, padding: 32, justifyContent: 'center', gap: 8 },
  iconWrap: {
    width: 80, height: 80, borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 8,
  },
  title:    { fontSize: 26, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: Colors.textLight, textAlign: 'center', marginBottom: 16 },
  form:     { gap: 6 },
  label:    { fontSize: 13, fontWeight: '600', color: Colors.textLight, marginTop: 4 },
  required: { color: '#E53E3E' },
  input: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: Colors.text,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  hint: { fontSize: 11, marginTop: 4 },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 14, paddingVertical: 16,
    marginTop: 28,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8,
    elevation: 6,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
})
