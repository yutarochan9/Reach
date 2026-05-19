import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, SafeAreaView, ScrollView, Image,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { authFlags } from '../../lib/authState'
import { Colors } from '../../constants/colors'

export default function SignupScreen() {
  const [step, setStep] = useState<'form' | 'otp' | 'profile'>('form')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [otp, setOtp] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    if (!email.trim() || !password) {
      Alert.alert('入力エラー', 'すべての項目を入力してください')
      return
    }
    if (password.length < 8) {
      Alert.alert('パスワードエラー', 'パスワードは8文字以上で入力してください')
      return
    }

    setLoading(true)
    authFlags.skipNextSignedIn = true
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    })
    if (error) {
      authFlags.skipNextSignedIn = false
      setLoading(false)
      Alert.alert('エラー', error.message)
      return
    }

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

    authFlags.skipNextSignedIn = true
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: 'email',
    })
    if (error) {
      authFlags.skipNextSignedIn = false
      setLoading(false)
      Alert.alert('認証エラー', '認証コードが正しくありません。もう一度確認してください。')
      return
    }

    setLoading(false)
    setStep('profile')
  }

  const handleSaveProfile = async () => {
    if (!displayName.trim()) {
      Alert.alert('入力エラー', 'ユーザー名を入力してください')
      return
    }
    setUsernameError('')

    const trimmedUsername = username.trim() || null
    if (trimmedUsername) {
      const { data: existing } = await supabase
        .from('profiles').select('id').eq('username', trimmedUsername).maybeSingle()
      if (existing) {
        setUsernameError('このユーザーアドレスはすでに使われています')
        return
      }
    }

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({
        display_name: displayName.trim(),
        username: trimmedUsername,
      }).eq('id', user.id)
    }
    setLoading(false)
    router.replace('/(tabs)/')
  }

  const handleResend = async () => {
    setLoading(true)
    await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    })
    setLoading(false)
    Alert.alert('再送しました', `${email} に認証コードを再送しました。`)
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          {step === 'otp' ? (
            <TouchableOpacity onPress={() => { setStep('form'); setOtp('') }} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
            </TouchableOpacity>
          ) : step === 'form' ? (
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
            </TouchableOpacity>
          ) : <View />}
        </View>

        <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
          <View style={styles.logoArea}>
            <Image source={require('../../assets/icon.png')} style={styles.logoIcon} />
            <Text style={styles.logoText}>Reach</Text>
          </View>

          {step === 'form' && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>サインアップ</Text>
              <Text style={styles.cardSub}>アカウントを作成してはじめましょう</Text>

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
                  placeholder="パスワード（8文字以上）"
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
                onPress={handleRegister}
                disabled={!email.trim() || !password || loading}
              >
                <Text style={styles.buttonText}>{loading ? '処理中...' : '認証コードを送る'}</Text>
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>または</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => router.push('/(auth)/login')}
              >
                <Text style={styles.secondaryButtonText}>すでにアカウントをお持ちの方</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'otp' && (
            <View style={styles.card}>
              <View style={styles.otpIconWrap}>
                <Ionicons name="mail-open-outline" size={36} color={Colors.accent} />
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
                <Text style={styles.buttonText}>{loading ? '確認中...' : '認証する'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleResend} style={styles.resendBtn}>
                <Text style={styles.resendText}>コードを再送する</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'profile' && (
            <View style={styles.card}>
              <View style={styles.otpIconWrap}>
                <Ionicons name="person-circle-outline" size={40} color={Colors.accent} />
              </View>
              <Text style={styles.cardTitle}>プロフィール設定</Text>
              <Text style={styles.cardSub}>あなたの名前とアドレスを設定してください</Text>

              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={18} color={Colors.textLight} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="ユーザー名（表示名）"
                  placeholderTextColor={Colors.textLight}
                  value={displayName}
                  onChangeText={setDisplayName}
                  maxLength={30}
                  autoFocus
                />
              </View>

              <View style={[styles.inputWrap, usernameError ? styles.inputWrapError : null]}>
                <Text style={styles.atSign}>@</Text>
                <TextInput
                  style={styles.input}
                  placeholder="ユーザーアドレス（英数字・_のみ）"
                  placeholderTextColor={Colors.textLight}
                  value={username}
                  onChangeText={v => { setUsername(v.replace(/[^a-zA-Z0-9_]/g, '')); setUsernameError('') }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={30}
                />
              </View>
              {usernameError ? <Text style={styles.errorText}>{usernameError}</Text> : null}

              <TouchableOpacity
                style={[styles.button, (!displayName.trim() || loading) && styles.buttonDisabled]}
                onPress={handleSaveProfile}
                disabled={!displayName.trim() || loading}
              >
                <Text style={styles.buttonText}>{loading ? '保存中...' : 'はじめる'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  kav: { flex: 1 },
  topBar: { height: 52, paddingHorizontal: 8, justifyContent: 'center' },
  backBtn: { padding: 8, alignSelf: 'flex-start' },
  inner: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center', paddingBottom: 40 },
  logoArea: { alignItems: 'center', marginBottom: 36, gap: 10 },
  logoIcon: { width: 80, height: 80, borderRadius: 20 },
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
  inputWrapError: { borderColor: '#E53E3E' },
  inputIcon: { marginRight: 8 },
  atSign: { fontSize: 16, color: Colors.textLight, marginRight: 4 },
  eyeBtn: { padding: 4 },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.text,
  },
  errorText: { fontSize: 12, color: '#E53E3E', marginTop: -8 },
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
