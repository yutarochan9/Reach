import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

export default function SignupScreen() {
  const [step, setStep] = useState<'form' | 'otp'>('form')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSendOtp = async () => {
    if (!name.trim() || !email.trim()) {
      Alert.alert('入力エラー', 'すべての項目を入力してください')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        data: { display_name: name.trim() },
      },
    })
    setLoading(false)
    if (error) {
      Alert.alert('エラー', error.message)
    } else {
      setStep('otp')
    }
  }

  const handleVerifyOtp = async () => {
    if (otp.length < 6) return
    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: 'email',
    })
    setLoading(false)
    if (error) {
      Alert.alert('認証エラー', '認証コードが正しくありません。もう一度確認してください。')
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.logoArea}>
          <Text style={styles.logo}>Reach</Text>
          <Text style={styles.tagline}>今すぐ発信者になろう</Text>
        </View>

        {step === 'form' ? (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="表示名（ニックネーム）"
              placeholderTextColor={Colors.textLight}
              value={name}
              onChangeText={setName}
              maxLength={30}
            />
            <TextInput
              style={styles.input}
              placeholder="メールアドレス"
              placeholderTextColor={Colors.textLight}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.button, (!name.trim() || !email.trim() || loading) && styles.buttonDisabled]}
              onPress={handleSendOtp}
              disabled={!name.trim() || !email.trim() || loading}
            >
              <Text style={styles.buttonText}>{loading ? '送信中...' : '認証コードを送る'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')} style={styles.link}>
              <Text style={styles.linkText}>すでにアカウントをお持ちの方はこちら</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.stepLabel}>{email} に認証コードを送りました</Text>
            <Text style={styles.stepSub}>メールに届いた6桁のコードを入力してください</Text>
            <TextInput
              style={[styles.input, styles.otpInput]}
              placeholder="6桁のコード"
              placeholderTextColor={Colors.textLight}
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.button, (otp.length < 6 || loading) && styles.buttonDisabled]}
              onPress={handleVerifyOtp}
              disabled={otp.length < 6 || loading}
            >
              <Text style={styles.buttonText}>{loading ? '確認中...' : '登録する'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setStep('form'); setOtp('') }} style={styles.link}>
              <Text style={styles.linkText}>戻る</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSendOtp} style={styles.link}>
              <Text style={styles.linkText}>コードを再送する</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 32 },
  logoArea: { alignItems: 'center', marginBottom: 48 },
  logo: { fontSize: 42, fontWeight: '800', color: Colors.accent, letterSpacing: 2 },
  tagline: { fontSize: 14, color: Colors.textLight, marginTop: 8 },
  form: { gap: 12 },
  stepLabel: { fontSize: 15, color: Colors.text, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  stepSub: { fontSize: 13, color: Colors.textLight, textAlign: 'center', marginBottom: 4 },
  input: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  otpInput: { textAlign: 'center', fontSize: 28, fontWeight: '700', letterSpacing: 8 },
  button: {
    backgroundColor: Colors.button,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
  link: { alignItems: 'center', marginTop: 8 },
  linkText: { color: Colors.accent, fontSize: 14 },
})
