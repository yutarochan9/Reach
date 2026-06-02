/**
 * beta-gate.tsx
 *
 * ベータテスト期間中のパスワードゲート画面。
 * BETA_GATE = true のとき、アプリの最前面に表示される。
 * 正しいパスワードを入力すると AsyncStorage に記録され、
 * 次回以降は入力不要になる。
 * 正式リリース時は BETA_GATE = false にするだけで無効化できる。
 */
import { useState, useRef } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { BETA_PASSWORD } from '../constants/config'
import { Colors } from '../constants/colors'

const STORAGE_KEY = 'beta_gate_unlocked'

type Props = {
  onUnlock: () => void
}

export default function BetaGate({ onUnlock }: Props) {
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const inputRef = useRef<TextInput>(null)

  const handleSubmit = async () => {
    if (!input.trim()) return
    setLoading(true)
    setError(false)

    // 少し待ってUXを自然に
    await new Promise(r => setTimeout(r, 400))

    if (input.trim() === BETA_PASSWORD) {
      await AsyncStorage.setItem(STORAGE_KEY, '1')
      onUnlock()
    } else {
      setError(true)
      setInput('')
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={s.card}>
        {/* ロゴ */}
        <View style={s.logoWrap}>
          <Image
            source={require('../assets/icon.png')}
            style={s.logo}
            resizeMode="contain"
          />
        </View>

        {/* テキスト */}
        <View style={s.textBlock}>
          <View style={s.betaBadge}>
            <Text style={s.betaBadgeText}>BETA</Text>
          </View>
          <Text style={s.title}>現在テスト公開中です</Text>
          <Text style={s.desc}>
            Reachはただいまベータテスト中のため、{'\n'}
            招待を受けた方のみご利用いただけます。{'\n'}
            パスワードを入力してお進みください。
          </Text>
        </View>

        {/* 入力欄 */}
        <View style={s.inputWrap}>
          <View style={[s.inputRow, error && s.inputRowError]}>
            <Ionicons name="lock-closed-outline" size={18} color={error ? '#E53E3E' : Colors.textLight} style={{ marginLeft: 14 }} />
            <TextInput
              ref={inputRef}
              style={s.input}
              placeholder="ベータパスワード"
              placeholderTextColor={Colors.textLight}
              value={input}
              onChangeText={t => { setInput(t); setError(false) }}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />
            <TouchableOpacity onPress={() => setShowPw(v => !v)} style={s.eyeBtn}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textLight} />
            </TouchableOpacity>
          </View>
          {error && (
            <Text style={s.errorText}>パスワードが違います。もう一度お試しください。</Text>
          )}
        </View>

        {/* ボタン */}
        <TouchableOpacity
          style={[s.btn, (!input.trim() || loading) && s.btnDisabled]}
          onPress={handleSubmit}
          disabled={!input.trim() || loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.btnText}>入る</Text>
          }
        </TouchableOpacity>

        {/* フッター */}
        <Text style={s.footer}>
          招待をご希望の方はReach公式SNSまでお問い合わせください
        </Text>
      </View>
    </KeyboardAvoidingView>
  )
}

/** AsyncStorageを確認してゲートが解除済みか返す */
export async function isBetaUnlocked(): Promise<boolean> {
  const val = await AsyncStorage.getItem(STORAGE_KEY)
  return val === '1'
}

/** ゲートのロックをリセットする（テスト用） */
export async function resetBetaGate(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY)
}

const s = StyleSheet.create({
  root: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
    backgroundColor: Colors.background,
    justifyContent: 'center', alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%', maxWidth: 400,
    backgroundColor: Colors.white,
    borderRadius: 24, padding: 32,
    alignItems: 'center', gap: 20,
    borderWidth: 1, borderColor: Colors.border,
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 40px rgba(0,0,0,0.10)' } as any : {
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.10, shadowRadius: 20, elevation: 8,
    }),
  },
  logoWrap: { alignItems: 'center' },
  logo: { width: 72, height: 72, borderRadius: 16 },
  textBlock: { alignItems: 'center', gap: 10 },
  betaBadge: {
    backgroundColor: Colors.accent, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  betaBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  desc: { fontSize: 13, color: Colors.textLight, textAlign: 'center', lineHeight: 20 },
  inputWrap: { width: '100%', gap: 6 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12,
    backgroundColor: Colors.background,
  },
  inputRowError: { borderColor: '#E53E3E' },
  input: {
    flex: 1, fontSize: 15, color: Colors.text,
    paddingVertical: 14, paddingHorizontal: 10,
  },
  eyeBtn: { padding: 12 },
  errorText: { fontSize: 12, color: '#E53E3E', paddingHorizontal: 4 },
  btn: {
    width: '100%', backgroundColor: Colors.accent,
    borderRadius: 12, paddingVertical: 15, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: {
    fontSize: 11, color: Colors.textLight,
    textAlign: 'center', lineHeight: 17,
  },
})
