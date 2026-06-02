/**
 * payout-profile.tsx
 *
 * 収益振込のための本人確認情報入力画面。
 * Stripe は振込（Payout）の前にアカウント名義人の本人確認を求める。
 * ここで入力した情報は stripe-connect-setup に渡され、
 * Stripe Custom Connect アカウントの individual フィールドに登録される。
 *
 * 必須項目（Stripe 日本版の要件）：
 *   - 生年月日（年・月・日）
 *   - 電話番号
 *   - 住所（郵便番号・都道府県・市区町村・番地）
 */
import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform, KeyboardAvoidingView, Image,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

// 都道府県リスト
const PREFECTURES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県',
  '静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
  '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
  '熊本県','大分県','宮崎県','鹿児島県','沖縄県',
]

export default function PayoutProfileScreen() {
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(false)

  // 身分証明書
  const [docUri,       setDocUri]       = useState<string | null>(null)   // ローカルプレビュー用
  const [docUploaded,  setDocUploaded]  = useState(false)                 // アップロード済みか
  const [docUploading, setDocUploading] = useState(false)

  // 生年月日
  const [dobYear,  setDobYear]  = useState('')
  const [dobMonth, setDobMonth] = useState('')
  const [dobDay,   setDobDay]   = useState('')

  // 電話番号
  const [phone, setPhone] = useState('')

  // 住所
  const [postalCode, setPostalCode] = useState('')
  const [addressState, setAddressState] = useState('')   // 都道府県
  const [addressCity,  setAddressCity]  = useState('')   // 市区町村
  const [addressLine1, setAddressLine1] = useState('')   // 番地・建物名

  // 都道府県ピッカー表示
  const [showPrefPicker, setShowPrefPicker] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/(auth)/login' as any); return }
      setUserId(user.id)

      const { data } = await supabase
        .from('profiles')
        .select('kyc_dob_year,kyc_dob_month,kyc_dob_day,kyc_phone,kyc_postal_code,kyc_address_state,kyc_address_city,kyc_address_line1,kyc_completed_at,kyc_document_path')
        .eq('id', user.id)
        .single()

      if (data) {
        if (data.kyc_dob_year)    setDobYear(String(data.kyc_dob_year))
        if (data.kyc_dob_month)   setDobMonth(String(data.kyc_dob_month))
        if (data.kyc_dob_day)     setDobDay(String(data.kyc_dob_day))
        if (data.kyc_phone)       setPhone(data.kyc_phone)
        if (data.kyc_postal_code) setPostalCode(data.kyc_postal_code)
        if (data.kyc_address_state) setAddressState(data.kyc_address_state)
        if (data.kyc_address_city)  setAddressCity(data.kyc_address_city)
        if (data.kyc_address_line1) setAddressLine1(data.kyc_address_line1)
        if (data.kyc_completed_at)  setCompleted(true)
        if (data.kyc_document_path) setDocUploaded(true)
      }
      setLoading(false)
    }
    load()
  }, [])

  // 身分証明書の写真を選んでアップロード
  const handlePickDocument = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('権限が必要です', '写真ライブラリへのアクセスを許可してください')
        return
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
    })
    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    setDocUri(asset.uri)
    setDocUploading(true)

    try {
      if (!userId) throw new Error('ログインが必要です')

      // Supabase Storage へアップロード（プライベートバケット）
      const ext = asset.uri.split('.').pop() ?? 'jpg'
      const path = `${userId}/id_front.${ext}`

      // ファイルを Blob として取得
      const response = await fetch(asset.uri)
      const blob = await response.blob()

      const { error } = await supabase.storage
        .from('kyc-documents')
        .upload(path, blob, {
          contentType: asset.mimeType ?? 'image/jpeg',
          upsert: true,
        })
      if (error) throw error

      // DB にパスを保存
      await supabase.from('profiles').update({
        kyc_document_path: path,
        kyc_document_uploaded_at: new Date().toISOString(),
      }).eq('id', userId)

      setDocUploaded(true)
      if (Platform.OS === 'web') {
        window.alert('身分証明書をアップロードしました')
      } else {
        Alert.alert('完了', '身分証明書をアップロードしました')
      }
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? 'アップロードに失敗しました')
      setDocUri(null)
    } finally {
      setDocUploading(false)
    }
  }

  // 郵便番号から住所を自動入力（郵便番号検索API）
  const fetchAddressFromPostal = async (code: string) => {
    const digits = code.replace(/-/g, '')
    if (digits.length !== 7) return
    try {
      const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digits}`)
      const json = await res.json()
      if (json.results?.[0]) {
        const r = json.results[0]
        setAddressState(r.address1 ?? '')
        setAddressCity((r.address2 ?? '') + (r.address3 ?? ''))
      }
    } catch {
      // 無視
    }
  }

  // バリデーション
  const yearNum  = parseInt(dobYear, 10)
  const monthNum = parseInt(dobMonth, 10)
  const dayNum   = parseInt(dobDay, 10)

  const isValidDob = yearNum >= 1900 && yearNum <= 2010
    && monthNum >= 1 && monthNum <= 12
    && dayNum >= 1 && dayNum <= 31

  const isValidPhone = /^0\d{9,10}$/.test(phone.replace(/-/g, ''))
  const isValidPostal = /^\d{7}$/.test(postalCode.replace(/-/g, ''))
  const isValidAddress = addressState.length > 0 && addressCity.length > 0 && addressLine1.length > 0

  const canSave = isValidDob && isValidPhone && isValidPostal && isValidAddress

  const handleSave = async () => {
    if (!userId || !canSave) return
    setSaving(true)
    try {
      // DB に保存
      const { error } = await supabase.from('profiles').update({
        kyc_dob_year:      yearNum,
        kyc_dob_month:     monthNum,
        kyc_dob_day:       dayNum,
        kyc_phone:         phone.replace(/-/g, ''),
        kyc_postal_code:   postalCode.replace(/-/g, ''),
        kyc_address_state: addressState,
        kyc_address_city:  addressCity,
        kyc_address_line1: addressLine1,
        kyc_completed_at:  new Date().toISOString(),
      }).eq('id', userId)
      if (error) throw error

      // Stripe Connect アカウントを作成/更新（バックグラウンドで実行）
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        supabase.functions.invoke('stripe-connect-setup', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(e => console.warn('stripe-connect-setup:', e))
      }

      setCompleted(true)
      if (Platform.OS === 'web') {
        window.alert('本人確認情報を保存しました')
      } else {
        Alert.alert('保存完了', '本人確認情報を保存しました')
      }
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  )

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.container}>

        {/* ヘッダー */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.push('/settings' as any)}
            style={s.backBtn}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>本人確認情報</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

          {/* 説明 */}
          <View style={s.infoBox}>
            <Ionicons name="shield-checkmark-outline" size={16} color={Colors.accent} />
            <Text style={s.infoText}>
              Stripe の規則により、振込の前に本人確認が必要です。{'\n'}
              入力情報は安全に暗号化されて保存されます。
            </Text>
          </View>

          {completed && (
            <View style={s.completedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
              <Text style={s.completedText}>本人確認済み</Text>
            </View>
          )}

          {/* 生年月日 */}
          <Text style={s.sectionLabel}>生年月日</Text>
          <View style={s.section}>
            <View style={s.dobRow}>
              <View style={s.dobField}>
                <Text style={s.dobLabel}>年</Text>
                <TextInput
                  style={s.dobInput}
                  value={dobYear}
                  onChangeText={v => setDobYear(v.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1990"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
              <View style={s.dobField}>
                <Text style={s.dobLabel}>月</Text>
                <TextInput
                  style={s.dobInput}
                  value={dobMonth}
                  onChangeText={v => setDobMonth(v.replace(/\D/g, '').slice(0, 2))}
                  placeholder="1"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
              <View style={s.dobField}>
                <Text style={s.dobLabel}>日</Text>
                <TextInput
                  style={s.dobInput}
                  value={dobDay}
                  onChangeText={v => setDobDay(v.replace(/\D/g, '').slice(0, 2))}
                  placeholder="1"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
            </View>
            {dobYear.length === 4 && dobMonth.length > 0 && dobDay.length > 0 && !isValidDob && (
              <Text style={s.errorText}>正しい生年月日を入力してください</Text>
            )}
          </View>

          {/* 電話番号 */}
          <Text style={s.sectionLabel}>電話番号</Text>
          <View style={s.section}>
            <TextInput
              style={s.input}
              value={phone}
              onChangeText={v => setPhone(v.replace(/[^\d-]/g, ''))}
              placeholder="09012345678（ハイフンなし）"
              placeholderTextColor={Colors.textLight}
              keyboardType="phone-pad"
              maxLength={13}
            />
            {phone.length > 0 && !isValidPhone && (
              <Text style={s.errorText}>正しい電話番号を入力してください（例: 09012345678）</Text>
            )}
          </View>

          {/* 住所 */}
          <Text style={s.sectionLabel}>住所</Text>
          <View style={s.section}>

            {/* 郵便番号 */}
            <Text style={s.label}>郵便番号</Text>
            <TextInput
              style={s.input}
              value={postalCode}
              onChangeText={v => {
                const d = v.replace(/\D/g, '').slice(0, 7)
                setPostalCode(d)
                fetchAddressFromPostal(d)
              }}
              placeholder="1234567（ハイフンなし）"
              placeholderTextColor={Colors.textLight}
              keyboardType="number-pad"
              maxLength={7}
            />
            {isValidPostal && (
              <Text style={s.hintOk}>✓ 住所を自動入力しました（変更可）</Text>
            )}

            {/* 都道府県 */}
            <Text style={[s.label, { marginTop: 12 }]}>都道府県</Text>
            <TouchableOpacity
              style={s.selectBtn}
              onPress={() => setShowPrefPicker(!showPrefPicker)}
              activeOpacity={0.8}
            >
              <Text style={[s.selectBtnText, !addressState && s.placeholder]}>
                {addressState || '都道府県を選択'}
              </Text>
              <Ionicons
                name={showPrefPicker ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.textLight}
              />
            </TouchableOpacity>

            {/* 都道府県リスト */}
            {showPrefPicker && (
              <View style={s.prefList}>
                <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                  {PREFECTURES.map(p => (
                    <TouchableOpacity
                      key={p}
                      style={[s.prefItem, addressState === p && s.prefItemSelected]}
                      onPress={() => { setAddressState(p); setShowPrefPicker(false) }}
                    >
                      <Text style={[s.prefItemText, addressState === p && s.prefItemTextSelected]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* 市区町村 */}
            <Text style={[s.label, { marginTop: 12 }]}>市区町村</Text>
            <TextInput
              style={s.input}
              value={addressCity}
              onChangeText={setAddressCity}
              placeholder="渋谷区"
              placeholderTextColor={Colors.textLight}
            />

            {/* 番地・建物名 */}
            <Text style={[s.label, { marginTop: 12 }]}>番地・建物名</Text>
            <TextInput
              style={s.input}
              value={addressLine1}
              onChangeText={setAddressLine1}
              placeholder="1-2-3 ○○マンション101号室"
              placeholderTextColor={Colors.textLight}
            />
          </View>

          {/* 身分証明書 */}
          <Text style={s.sectionLabel}>身分証明書（任意・推奨）</Text>
          <View style={s.section}>
            <Text style={s.docDesc}>
              マイナンバーカード（表面）・運転免許証・パスポートのいずれか。{'\n'}
              振込量が増えると Stripe から提出を求められます。事前に登録しておくとスムーズです。
            </Text>

            {/* プレビュー or アップロード済みバッジ */}
            {docUri ? (
              <Image source={{ uri: docUri }} style={s.docPreview} resizeMode="cover" />
            ) : docUploaded ? (
              <View style={s.docUploadedBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                <Text style={s.docUploadedText}>身分証明書アップロード済み</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[s.docBtn, docUploading && { opacity: 0.5 }]}
              onPress={handlePickDocument}
              disabled={docUploading}
              activeOpacity={0.8}
            >
              {docUploading ? (
                <ActivityIndicator size="small" color={Colors.accent} />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={18} color={Colors.accent} />
                  <Text style={s.docBtnText}>
                    {docUploaded ? '身分証明書を変更する' : '身分証明書を選択する'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* 注意事項 */}
          <View style={s.noteBox}>
            <Text style={s.noteText}>
              ・ 入力情報は Stripe の本人確認システムに送信されます{'\n'}
              ・ 身分証明書画像は暗号化して安全に保管されます{'\n'}
              ・ 第三者に開示することはありません{'\n'}
              ・ 18歳未満の方はご利用いただけません
            </Text>
          </View>

          {/* 保存ボタン */}
          <TouchableOpacity
            style={[s.saveBtn, (!canSave || saving) && { opacity: 0.45 }]}
            onPress={handleSave}
            disabled={!canSave || saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Text style={s.saveBtnText}>
                  {completed ? '本人確認情報を更新する' : '本人確認情報を保存する'}
                </Text>
            }
          </TouchableOpacity>

        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: 36, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4, width: 32 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },

  content: { padding: 16, gap: 12, paddingBottom: 48 },

  infoBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.white, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  infoText: { flex: 1, fontSize: 13, color: Colors.textLight, lineHeight: 20 },

  completedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#86efac',
  },
  completedText: { fontSize: 14, fontWeight: '600', color: '#16a34a' },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 4, paddingTop: 4,
  },
  section: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 8,
  },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text },

  // 生年月日
  dobRow: { flexDirection: 'row', gap: 10 },
  dobField: { flex: 1, gap: 4 },
  dobLabel: { fontSize: 12, color: Colors.textLight, fontWeight: '600' },
  dobInput: {
    backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 16, color: Colors.text, textAlign: 'center',
  },

  input: {
    backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, color: Colors.text,
  },

  selectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  selectBtnText: { fontSize: 14, color: Colors.text },
  placeholder: { color: Colors.textLight },

  prefList: {
    backgroundColor: Colors.white, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  prefItem: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  prefItemSelected: { backgroundColor: `${Colors.accent}15` },
  prefItemText: { fontSize: 14, color: Colors.text },
  prefItemTextSelected: { color: Colors.accent, fontWeight: '700' },

  hintOk: { fontSize: 12, color: '#22c55e', fontWeight: '600', marginTop: -4 },
  errorText: { fontSize: 12, color: '#E53E3E', marginTop: -4 },

  noteBox: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
  },
  noteText: { fontSize: 12, color: Colors.textLight, lineHeight: 20 },

  saveBtn: {
    backgroundColor: Colors.accent, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  // 身分証明書
  docDesc: { fontSize: 12, color: Colors.textLight, lineHeight: 18 },
  docPreview: {
    width: '100%', height: 180, borderRadius: 10,
    backgroundColor: Colors.border,
  },
  docUploadedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F0FDF4', borderRadius: 8, padding: 10,
  },
  docUploadedText: { fontSize: 13, fontWeight: '600', color: '#16a34a' },
  docBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.accent,
    paddingVertical: 12,
  },
  docBtnText: { fontSize: 14, fontWeight: '600', color: Colors.accent },
})
