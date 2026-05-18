import { useState } from 'react'
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

export default function OnboardingScreen() {
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!displayName.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim(),
        username: username.trim() || null,
      })
      .eq('id', user.id)

    setSaving(false)
    if (error) {
      Alert.alert('エラー', error.message)
    } else {
      router.replace('/(tabs)/')
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <View style={styles.iconWrap}>
          <Ionicons name="radio" size={48} color={Colors.accent} />
        </View>

        <Text style={styles.title}>Reachへようこそ</Text>
        <Text style={styles.subtitle}>まずはプロフィールを設定しましょう</Text>

        <View style={styles.form}>
          <Text style={styles.label}>表示名 <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="例: 田中 太郎"
            placeholderTextColor={Colors.textLight}
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={30}
          />

          <Text style={styles.label}>ユーザーID <Text style={styles.optional}>（任意）</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="例: tanaka_taro（英数字・_のみ）"
            placeholderTextColor={Colors.textLight}
            value={username}
            onChangeText={v => setUsername(v.replace(/[^a-zA-Z0-9_]/g, ''))}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
          />
          <Text style={styles.hint}>後から変更できます</Text>
        </View>

        <TouchableOpacity
          style={[styles.button, (!displayName.trim() || saving) && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={!displayName.trim() || saving}
        >
          <Text style={styles.buttonText}>{saving ? '設定中...' : 'はじめる'}</Text>
          {!saving && <Ionicons name="arrow-forward" size={18} color={Colors.white} />}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace('/(tabs)/')} style={styles.skipButton}>
          <Text style={styles.skipText}>スキップ</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inner: { flex: 1, padding: 32, justifyContent: 'center', gap: 8 },
  iconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.white,
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  title: { fontSize: 26, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: Colors.textLight, textAlign: 'center', marginBottom: 16 },
  form: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textLight, marginTop: 12 },
  required: { color: '#E53E3E' },
  optional: { fontWeight: '400' },
  input: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border,
  },
  hint: { fontSize: 11, color: Colors.textLight },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 14, paddingVertical: 16,
    marginTop: 24,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8,
    elevation: 6,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
  skipButton: { alignItems: 'center', marginTop: 12 },
  skipText: { fontSize: 13, color: Colors.textLight },
})
