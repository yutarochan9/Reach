import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, SafeAreaView, Image, ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Path } from 'react-native-svg'
import { supabase } from '../../lib/supabase'
import { authFlags } from '../../lib/authState'
import { Colors } from '../../constants/colors'
import { TEST_ACCOUNT_IDS } from '../../constants/testAccounts'

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </Svg>
  )
}

type Step = 'credentials' | 'otp' | 'totp'

export default function LoginScreen() {
  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [otp, setOtp] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [totpFactorId, setTotpFactorId] = useState('')
  const [loading, setLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  const handleSignIn = async () => {
    if (!email.trim() || !password) return
    setLoading(true)
    setLoginError('')

    // パスワード認証（SIGNED_INイベントは手動ナビゲートするためスキップ）
    authFlags.skipNextSignedIn = true
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) {
      authFlags.skipNextSignedIn = false
      setLoading(false)
      setLoginError('メールアドレスまたはパスワードが正しくありません。')
      return
    }

    // テストアカウントはOTPをスキップしてそのまま入る
    const { data: { user: authedUser } } = await supabase.auth.getUser()
    if (authedUser && TEST_ACCOUNT_IDS.includes(authedUser.id as any)) {
      const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', authedUser.id).single()
      setLoading(false)
      if (!prof?.display_name || prof.display_name.includes('@')) {
        router.replace('/onboarding' as any)
      } else {
        router.replace('/(tabs)/' as any)
      }
      return
    }

    // TOTPが登録されているか確認
    const { data: factorsData } = await supabase.auth.mfa.listFactors()
    const totpFactors = factorsData?.totp ?? []
    if (totpFactors.length > 0) {
      // TOTP画面へ（サインアウトしない・AAL1セッションを維持）
      setTotpFactorId(totpFactors[0].id)
      setTotpCode('')
      setLoading(false)
      setStep('totp')
      return
    }

    // TOTP未登録 → OTPなしでそのまま直接サインイン
    const { data: { user: signedInUser } } = await supabase.auth.getUser()
    authFlags.skipNextSignedIn = false
    setLoading(false)
    if (signedInUser) {
      const { data: prof } = await supabase.from('profiles').select('display_name, username').eq('id', signedInUser.id).single()
      if (!prof?.display_name || prof.display_name.includes('@') || !prof?.username) {
        router.replace('/onboarding' as any)
      } else {
        router.replace('/(tabs)/' as any)
      }
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
    if (error) {
      setLoading(false)
      Alert.alert('認証エラー', '認証コードが正しくありません。もう一度確認してください。')
      return
    }
    // 認証成功 → 明示的にナビゲート（_layout.tsxのSIGNED_INイベントに依存しない）
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
      if (!prof?.display_name || prof.display_name.includes('@')) {
        setLoading(false)
        router.replace('/onboarding' as any)
        return
      }
    }
    setLoading(false)
    router.replace('/(tabs)/' as any)
  }

  const handleVerifyTotp = async () => {
    if (totpCode.length < 6 || !totpFactorId) return
    setLoading(true)
    const { error: challengeErr, data: challengeData } = await supabase.auth.mfa.challenge({
      factorId: totpFactorId,
    })
    if (challengeErr) {
      setLoading(false)
      Alert.alert('エラー', challengeErr.message)
      return
    }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: totpFactorId,
      challengeId: challengeData.id,
      code: totpCode,
    })
    setLoading(false)
    if (verifyErr) {
      Alert.alert('認証エラー', 'コードが正しくありません。認証アプリを確認してください。')
      return
    }
    // 成功 → _layout.tsxのSIGNED_INイベントが処理、authFlagsをクリア
    authFlags.skipNextSignedIn = false
  }

  const handleGoogleLogin = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: Platform.OS === 'web'
          ? `${window.location.origin}/`
          : 'reach://login',
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
    setLoading(false)
    if (error) Alert.alert('エラー', error.message)
    // web: リダイレクトが起きるので以降の処理は不要
  }

  const handleAppleLogin = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: Platform.OS === 'web'
          ? `${window.location.origin}/`
          : 'reach://login',
      },
    })
    setLoading(false)
    if (error) Alert.alert('エラー', error.message)
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          {(step === 'otp' || step === 'totp') && (
            <TouchableOpacity
              onPress={async () => {
                if (step === 'totp') {
                  // TOTP中断 → サインアウト
                  authFlags.skipNextSignedOut = true
                  await supabase.auth.signOut()
                  authFlags.skipNextSignedIn = false
                }
                setStep('credentials')
                setOtp('')
                setTotpCode('')
              }}
              style={styles.backBtn}
            >
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.inner}>
          <View style={styles.logoArea}>
            <Image source={require('../../assets/icon.png')} style={styles.logoIcon} />
            <Text style={styles.logoText}>Reach</Text>
          </View>

          {step === 'credentials' && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>サインイン</Text>
              <Text style={styles.cardSub}>登録済みのメールアドレスとパスワードを入力してください</Text>
              <View style={[styles.inputWrap, email ? styles.inputWrapFilled : null]}>
                <Ionicons name="mail-outline" size={18} color={email ? Colors.text : Colors.textLight} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, Platform.OS === 'web' && {
                    // ブラウザのオートフィル青色を背景色で上書き
                    WebkitBoxShadow: `0 0 0 1000px ${Colors.background} inset`,
                    WebkitTextFillColor: Colors.text,
                  } as any]}
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
                {loading
                  ? <ActivityIndicator color={Colors.white} />
                  : <Text style={styles.buttonText}>サインイン</Text>
                }
              </TouchableOpacity>

              {loginError ? (
                <Text style={styles.errorText}>{loginError}</Text>
              ) : null}

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>または</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity style={styles.oauthButton} onPress={handleGoogleLogin} disabled={loading}>
                <GoogleIcon size={18} />
                <Text style={styles.oauthButtonText}>Googleでサインイン</Text>
              </TouchableOpacity>

              {Platform.OS === 'ios' && (
                <TouchableOpacity style={[styles.oauthButton, { backgroundColor: '#000', borderColor: '#000' }]} onPress={handleAppleLogin} disabled={loading}>
                  <Ionicons name="logo-apple" size={18} color={Colors.white} />
                  <Text style={[styles.oauthButtonText, { color: Colors.white }]}>Appleでサインイン</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => router.push('/(auth)/signup')}
              >
                <Text style={styles.secondaryButtonText}>新規サインアップ</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'otp' && (
            <View style={styles.card}>
              <View style={styles.otpIconWrap}>
                <Ionicons name="mail-outline" size={36} color={Colors.accent} />
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
                {loading
                  ? <ActivityIndicator color={Colors.white} />
                  : <Text style={styles.buttonText}>サインイン</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSignIn} style={styles.resendBtn}>
                <Text style={styles.resendText}>コードを再送する</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'totp' && (
            <View style={styles.card}>
              <View style={styles.otpIconWrap}>
                <Ionicons name="shield-checkmark-outline" size={36} color={Colors.accent} />
              </View>
              <Text style={styles.cardTitle}>二段階認証</Text>
              <Text style={styles.cardSub}>認証アプリに表示されている{'\n'}6桁のコードを入力してください</Text>
              <TextInput
                style={styles.otpInput}
                placeholder="------"
                placeholderTextColor={Colors.border}
                value={totpCode}
                onChangeText={setTotpCode}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
              <TouchableOpacity
                style={[styles.button, (totpCode.length < 6 || loading) && styles.buttonDisabled]}
                onPress={handleVerifyTotp}
                disabled={totpCode.length < 6 || loading}
              >
                {loading
                  ? <ActivityIndicator color={Colors.white} />
                  : <Text style={styles.buttonText}>認証する</Text>
                }
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
  inputWrapFilled: { borderColor: Colors.text },
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
  oauthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  oauthButtonText: { color: Colors.text, fontWeight: '700', fontSize: 15 },
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
  errorText: { color: '#E53E3E', fontSize: 13, textAlign: 'center' },
})
