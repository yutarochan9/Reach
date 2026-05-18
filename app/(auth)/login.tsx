import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, SafeAreaView,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

export default function LoginScreen() {
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignIn = async () => {
    if (!email.trim() || !password) return
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) {
      setLoading(false)
      if (error.message.toLowerCase().includes('invalid login') || error.message.toLowerCase().includes('invalid credentials')) {
        Alert.alert('サインイン失敗', 'メールアドレスまたはパスワードが正しくありません。')
      } else {
        Alert.alert('エラー', error.message)
      }
      return
    }
    // パスワード確認後、メール認証コードを送信
    await supabase.auth.signOut()
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    })
    setLoading(false)
    if (otpError) {
      Alert.alert('エラー', otpError.message)
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
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          {step === 'otp' && (
            <TouchableOpacity onPress={() => { setStep('credentials'); setOtp('') }} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.inner}>
          <View style={styles.logoArea}>
            <View style={styles.logoIcon}>
              <Text style={styles.logoIconText}>R</Text>
            </View>
            <Text style={styles.logoText}>Reach</Text>
          </View>

          {step === 'credentials' ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>サインイン</Text>
              <Text style={styles.cardSub}>登録済みのメールアドレスとパスワードを入力してください</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="mail-outline" size={18} color={Colors.textLight} style={styles.inputIcon} />
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
              </View>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.textLight} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="パスワード"
                  placeholderTextColor={Colors.textLight}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textLight} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.button, (!email.trim() || !password || loading) && styles.buttonDisabled]}
                onPress={handleSignIn}
                disabled={!email.trim() || !password || loading}
              >
                <Text style={styles.buttonText}>{loading ? '確認中...' : 'サインイン'}</Text>
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>または</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => router.push('/(auth)/signup')}
              >
                <Text style={styles.secondaryButtonText}>新規サインアップ</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.otpIconWrap}>
                <Ionicons name="shield-checkmark-outline" size={36} color={Colors.accent} />
              </View>
              <Text style={styles.cardTitle}>メール認証</Text>
              <Text style={styles.cardSub}>{email}{'\n'}に送信した6桁のコードを入力してください</Text>
              <TextInput
                style={styles.otpInput}
                placeholder="------"
                placeholderTextColor={Colors.border}
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
                <Text style={styles.buttonText}>{loading ? '確認中...' : 'サインイン'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSignIn} style={styles.resendBtn}>
                <Text style={styles.resendText}>コードを再送する</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  kav: { flex: 1 },
  topBar: { height: 52, paddingHorizontal: 8, justifyContent: 'center' },
  backBtn: { padding: 8, alignSelf: 'flex-start' },
  inner: { flex: 1, paddingHorizontal: 24, justifyContent: 'center', paddingBottom: 40 },
  logoArea: { alignItems: 'center', marginBottom: 36, gap: 10 },
  logoIcon: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  logoIconText: { fontSize: 32, fontWeight: '900', color: Colors.white },
  logoText: { fontSize: 28, fontWeight: '800', color: Colors.text, letterSpacing: 1 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 24,
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  cardSub: { fontSize: 13, color: Colors.textLight, textAlign: 'center', lineHeight: 20 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 8 },
  eyeBtn: { padding: 4 },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.text,
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontSize: 12, color: Colors.textLight },
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.accent,
  },
  secondaryButtonText: { color: Colors.accent, fontWeight: '700', fontSize: 15 },
  otpIconWrap: { alignItems: 'center', marginBottom: 4 },
  otpInput: {
    textAlign: 'center',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 12,
    color: Colors.text,
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resendBtn: { alignItems: 'center' },
  resendText: { color: Colors.accent, fontSize: 14 },
})
