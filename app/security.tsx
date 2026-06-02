import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Image, Platform,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

type Step = 'menu' | 'totp-qr' | 'totp-verify' | 'totp-disable' | 'recovery-codes'

const RECOVERY_CODE_COUNT = 8

async function sha256(text: string): Promise<string> {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.crypto?.subtle) {
    const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  }
  // Native: use expo-crypto
  try {
    const { digestStringAsync, CryptoDigestAlgorithm } = await import('expo-crypto')
    return digestStringAsync(CryptoDigestAlgorithm.SHA256, text)
  } catch {
    // フォールバック: 簡易ハッシュ（本番では推奨しないが保険）
    let h = 0
    for (let i = 0; i < text.length; i++) { h = (Math.imul(31, h) + text.charCodeAt(i)) | 0 }
    return (h >>> 0).toString(16)
  }
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      code += chars[Math.floor(Math.random() * chars.length)]
    }
    if (i < 3) code += '-'
  }
  return code
}

export default function SecurityScreen() {
  const [step, setStep] = useState<Step>('menu')
  const [totpFactors, setTotpFactors] = useState<any[]>([])
  const [enrollData, setEnrollData] = useState<any>(null)
  const [totpCode, setTotpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingFactors, setLoadingFactors] = useState(true)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [recoveryCodeCount, setRecoveryCodeCount] = useState(0)
  const [disableCode, setDisableCode] = useState('')

  const loadFactors = useCallback(async () => {
    setLoadingFactors(true)
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (!error && data) {
      setTotpFactors(data.totp ?? [])
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { count } = await supabase
        .from('recovery_codes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('used_at', null)
      setRecoveryCodeCount(count ?? 0)
    }
    setLoadingFactors(false)
  }, [])

  useFocusEffect(useCallback(() => { loadFactors() }, [loadFactors]))

  const handleEnrollTotp = async () => {
    setLoading(true)
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Reach Authenticator',
    })
    setLoading(false)
    if (error) {
      Alert.alert('エラー', error.message)
      return
    }
    setEnrollData(data)
    setTotpCode('')
    setStep('totp-qr')
  }

  const handleVerifyTotp = async () => {
    if (!enrollData || totpCode.length < 6) return
    setLoading(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrollData.id,
      code: totpCode,
    })
    setLoading(false)
    if (error) {
      Alert.alert('認証エラー', 'コードが正しくありません。アプリで表示されている6桁のコードを入力してください。')
      return
    }
    // 登録成功 → リカバリーコードを生成
    await generateAndSaveRecoveryCodes()
    setStep('recovery-codes')
    loadFactors()
  }

  const generateAndSaveRecoveryCodes = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // 既存コードを削除
    await supabase.from('recovery_codes').delete().eq('user_id', user.id)

    const codes: string[] = []
    const inserts: { user_id: string; code_hash: string }[] = []

    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
      const code = generateCode()
      codes.push(code)
      const hash = await sha256(code + user.id)
      inserts.push({ user_id: user.id, code_hash: hash })
    }

    await supabase.from('recovery_codes').insert(inserts)
    setRecoveryCodes(codes)
  }

  const handleDisableTotp = async () => {
    const factor = totpFactors[0]
    if (!factor) return
    if (disableCode.length < 6) {
      Alert.alert('コードを入力', '現在の認証アプリのコードを入力してください')
      return
    }
    setLoading(true)
    const { error: challengeErr, data: challengeData } = await supabase.auth.mfa.challenge({ factorId: factor.id })
    if (challengeErr) {
      setLoading(false)
      Alert.alert('エラー', challengeErr.message)
      return
    }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challengeData.id,
      code: disableCode,
    })
    if (verifyErr) {
      setLoading(false)
      Alert.alert('認証エラー', 'コードが正しくありません')
      return
    }
    const { error: unenrollErr } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    setLoading(false)
    if (unenrollErr) {
      Alert.alert('エラー', unenrollErr.message)
      return
    }
    // リカバリーコードも削除
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('recovery_codes').delete().eq('user_id', user.id)
    Alert.alert('完了', '二段階認証を無効にしました')
    setStep('menu')
    loadFactors()
  }

  const handleRegenerateRecoveryCodes = async () => {
    const ok = Platform.OS === 'web'
      ? window.confirm('既存のリカバリーコードはすべて無効になります。続けますか？')
      : await new Promise<boolean>(res =>
          Alert.alert('確認', '既存のリカバリーコードはすべて無効になります。', [
            { text: 'キャンセル', style: 'cancel', onPress: () => res(false) },
            { text: '再生成', style: 'destructive', onPress: () => res(true) },
          ])
        )
    if (!ok) return
    setLoading(true)
    await generateAndSaveRecoveryCodes()
    setLoading(false)
    setStep('recovery-codes')
  }

  const totpEnabled = totpFactors.length > 0

  // ── 画面切り替え ──────────────────────────────────────────
  if (step === 'totp-qr' && enrollData) {
    return (
      <View style={styles.container}>
        <Header title="認証アプリを設定" onBack={() => { supabase.auth.mfa.unenroll({ factorId: enrollData.id }); setStep('menu') }} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.desc}>
            Google AuthenticatorやAUTHYなどの認証アプリでQRコードをスキャンしてください。
          </Text>
          <View style={styles.qrWrap}>
            {enrollData.totp?.qr_code ? (
              <Image
                source={{ uri: enrollData.totp.qr_code }}
                style={{ width: 200, height: 200 }}
                resizeMode="contain"
              />
            ) : (
              <Text style={styles.secretText}>{enrollData.totp?.secret}</Text>
            )}
          </View>
          <Text style={styles.secretLabel}>手動入力コード</Text>
          <Text selectable style={styles.secretMono}>{enrollData.totp?.secret}</Text>
          <Text style={styles.desc}>スキャン後、認証アプリに表示された6桁のコードを入力してください。</Text>
          <TextInput
            style={styles.codeInput}
            placeholder="6桁のコード"
            placeholderTextColor={Colors.textLight}
            value={totpCode}
            onChangeText={setTotpCode}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />
          <TouchableOpacity
            style={[styles.primaryBtn, (totpCode.length < 6 || loading) && styles.btnDisabled]}
            onPress={handleVerifyTotp}
            disabled={totpCode.length < 6 || loading}
          >
            <Text style={styles.primaryBtnText}>{loading ? '確認中...' : '認証して有効化'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    )
  }

  if (step === 'recovery-codes') {
    return (
      <View style={styles.container}>
        <Header title="リカバリーコード" onBack={() => setStep('menu')} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.alertBox}>
            <Ionicons name="warning-outline" size={20} color="#D97706" />
            <Text style={styles.alertText}>これらのコードは今後表示されません。安全な場所に保存してください。</Text>
          </View>
          <View style={styles.codesGrid}>
            {recoveryCodes.map((code, i) => (
              <Text key={i} selectable style={styles.codeItem}>{code}</Text>
            ))}
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('menu')}>
            <Text style={styles.primaryBtnText}>保存しました</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    )
  }

  if (step === 'totp-disable') {
    return (
      <View style={styles.container}>
        <Header title="二段階認証を無効化" onBack={() => { setStep('menu'); setDisableCode('') }} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.desc}>無効化するには現在の認証アプリのコードを入力してください。</Text>
          <TextInput
            style={styles.codeInput}
            placeholder="6桁のコード"
            placeholderTextColor={Colors.textLight}
            value={disableCode}
            onChangeText={setDisableCode}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />
          <TouchableOpacity
            style={[styles.dangerBtn, (disableCode.length < 6 || loading) && styles.btnDisabled]}
            onPress={handleDisableTotp}
            disabled={disableCode.length < 6 || loading}
          >
            <Text style={styles.primaryBtnText}>{loading ? '確認中...' : '二段階認証を無効にする'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    )
  }

  // ── メニュー画面 ──────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Header title="セキュリティ" onBack={() => router.replace('/(tabs)/mypage' as any)} />
      <ScrollView contentContainerStyle={styles.content}>
        {loadingFactors ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            <Text style={styles.sectionLabel}>二段階認証（2FA）</Text>
            <View style={styles.section}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: totpEnabled ? '#38A169' : Colors.border }]} />
                <Text style={styles.statusText}>
                  {totpEnabled ? '有効（認証アプリ）' : '無効'}
                </Text>
              </View>
              <View style={styles.divider} />
              {totpEnabled ? (
                <TouchableOpacity style={styles.actionRow} onPress={() => { setDisableCode(''); setStep('totp-disable') }}>
                  <Ionicons name="shield-outline" size={18} color="#E53E3E" />
                  <Text style={[styles.actionLabel, { color: '#E53E3E' }]}>二段階認証を無効にする</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.border} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.actionRow} onPress={handleEnrollTotp} disabled={loading}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={Colors.accent} />
                  <Text style={[styles.actionLabel, { color: Colors.accent }]}>
                    {loading ? '処理中...' : '認証アプリで設定する'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.border} />
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.sectionLabel}>リカバリーコード</Text>
            <View style={styles.section}>
              <View style={styles.infoRow}>
                <Ionicons name="key-outline" size={18} color={Colors.textLight} />
                <Text style={styles.infoLabel}>未使用コード</Text>
                <Text style={styles.infoValue}>{recoveryCodeCount} / {RECOVERY_CODE_COUNT} 枚</Text>
              </View>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.actionRow} onPress={handleRegenerateRecoveryCodes} disabled={loading}>
                <Ionicons name="refresh-outline" size={18} color={Colors.accent} />
                <Text style={[styles.actionLabel, { color: Colors.accent }]}>リカバリーコードを再生成</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.border} />
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>端末移行について</Text>
            <View style={styles.section}>
              <View style={styles.infoBox}>
                <Ionicons name="phone-portrait-outline" size={18} color={Colors.textLight} />
                <Text style={styles.infoBoxText}>
                  機種変更後も、登録済みのメールアドレスとパスワードでログインできます。二段階認証を設定している場合は、認証アプリも移行してください。認証アプリを移行できない場合はリカバリーコードを使用してください。
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Ionicons name="chevron-back" size={24} color={Colors.accent} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 32 }} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
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
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: Colors.text },
  content: { padding: 16, gap: 8 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4,
  },
  section: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: 8,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 14, color: Colors.text, fontWeight: '600' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  infoLabel: { flex: 1, fontSize: 14, color: Colors.text, fontWeight: '500' },
  infoValue: { fontSize: 14, color: Colors.textLight },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  actionLabel: { flex: 1, fontSize: 15, color: Colors.text, fontWeight: '500' },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: 46 },
  infoBox: { flexDirection: 'row', gap: 12, padding: 16, alignItems: 'flex-start' },
  infoBoxText: { flex: 1, fontSize: 13, color: Colors.textLight, lineHeight: 20 },
  desc: { fontSize: 14, color: Colors.textLight, lineHeight: 22, marginBottom: 8 },
  qrWrap: { alignItems: 'center', padding: 24, backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, marginVertical: 8 },
  secretLabel: { fontSize: 12, color: Colors.textLight, marginTop: 8 },
  secretText: { fontSize: 13, color: Colors.text, padding: 16, backgroundColor: Colors.background, borderRadius: 8, textAlign: 'center' },
  secretMono: { fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: Colors.text, backgroundColor: Colors.background, padding: 12, borderRadius: 8, textAlign: 'center', letterSpacing: 2, marginBottom: 16 },
  codeInput: {
    textAlign: 'center', fontSize: 32, fontWeight: '800', letterSpacing: 10,
    color: Colors.text, backgroundColor: Colors.white,
    borderRadius: 12, paddingVertical: 16,
    borderWidth: 1, borderColor: Colors.border,
    marginVertical: 12,
  },
  primaryBtn: { backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  dangerBtn: { backgroundColor: '#E53E3E', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
  alertBox: { flexDirection: 'row', gap: 10, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 8 },
  alertText: { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 20 },
  codesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginVertical: 16 },
  codeItem: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 15, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, minWidth: 130, textAlign: 'center' },
})
