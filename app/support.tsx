import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Alert, ActivityIndicator, TextInput, KeyboardAvoidingView,
} from 'react-native'
import { router, useNavigation, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'
import { IAP_SKUS, IS_NATIVE, initIAP, endIAP, purchaseSupportIAP } from '../lib/iap'

// ネイティブ（IAP）の固定選択肢 — App Store は事前登録 SKU が必要なため固定
const IAP_AMOUNTS = [
  { sku: IAP_SKUS.SUPPORT_1000,   amount: 1000,   label: '¥1,000',   desc: 'ちょっとした応援' },
  { sku: IAP_SKUS.SUPPORT_10000,  amount: 10000,  label: '¥10,000',  desc: 'しっかり応援' },
  { sku: IAP_SKUS.SUPPORT_100000, amount: 100000, label: '¥100,000', desc: '全力で応援' },
]

// 最小・最大金額（Stripe の制限に合わせる）
const MIN_AMOUNT = 100
const MAX_AMOUNT = 500000

export default function SupportScreen() {
  // Web: 自由入力
  const [inputAmount, setInputAmount] = useState('500')
  // Native: 固定 IAP 選択
  const [selectedIAP, setSelectedIAP] = useState(IAP_AMOUNTS[1])
  const [processing, setProcessing] = useState(false)
  const navigation = useNavigation()
  const params = useLocalSearchParams<{ payment?: string }>()

  // 安全な戻る処理
  const goBack = () => {
    if (navigation.canGoBack()) router.back()
    else router.replace('/(tabs)/mypage' as any)
  }

  // iOS: IAP 接続を初期化
  useEffect(() => {
    if (!IS_NATIVE) return
    initIAP().catch(() => {})
    return () => { endIAP().catch(() => {}) }
  }, [])

  // Stripe 決済完了後のリダイレクト処理
  useEffect(() => {
    if (params.payment === 'success') {
      if (Platform.OS === 'web') {
        window.alert('ありがとうございます！応援していただきありがとうございます 🙏')
      } else {
        Alert.alert('ありがとうございます！', '応援していただきありがとうございます 🙏')
      }
    }
  }, [params.payment])

  // Web: 入力値のバリデーション
  const parsedAmount = parseInt(inputAmount.replace(/,/g, ''), 10)
  const isValidAmount = !isNaN(parsedAmount) && parsedAmount >= MIN_AMOUNT && parsedAmount <= MAX_AMOUNT

  // Web: Stripe Checkout へリダイレクト（price_data で都度作成）
  const handleStripeSupport = async () => {
    if (!isValidAmount) {
      Alert.alert('金額エラー', `¥${MIN_AMOUNT.toLocaleString()}〜¥${MAX_AMOUNT.toLocaleString()} の範囲で入力してください`)
      return
    }
    setProcessing(true)
    try {
      const res = await supabase.functions.invoke('stripe-checkout', {
        body: { type: 'support', amount: parsedAmount },
      })
      if (res.error) throw new Error(res.error.message)
      window.location.href = res.data.url
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '決済処理に失敗しました')
      setProcessing(false)
    }
  }

  // iOS/Android: App Store IAP で応援
  const handleIAPSupport = async () => {
    setProcessing(true)
    try {
      await purchaseSupportIAP(selectedIAP.sku)
      Alert.alert('ありがとうございます！', '応援していただきありがとうございます 🙏')
    } catch (e: any) {
      if (e?.code !== 'E_USER_CANCELLED') {
        Alert.alert('エラー', e.message ?? '購入に失敗しました')
      }
    } finally {
      setProcessing(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>開発を応援する</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* ヒーローセクション */}
          <View style={styles.heroSection}>
            <View style={styles.heartIcon}>
              <Ionicons name="heart" size={40} color="#E05555" />
            </View>
            <Text style={styles.heroTitle}>Reachを応援してください</Text>
            <Text style={styles.heroDesc}>
              Reachは個人開発のアプリです。{'\n'}
              いただいたご支援はサーバー代・開発費として{'\n'}
              大切に使わせていただきます。
            </Text>
          </View>

          {IS_NATIVE ? (
            /* ── iOS / Android: IAP 固定3択 ── */
            <>
              <Text style={styles.sectionLabel}>応援する金額を選ぶ</Text>
              <View style={styles.section}>
                {IAP_AMOUNTS.map((item, i, arr) => (
                  <View key={item.amount}>
                    <TouchableOpacity
                      style={styles.amountRow}
                      onPress={() => setSelectedIAP(item)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.radio, selectedIAP.amount === item.amount && styles.radioSelected]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.amountLabel}>{item.label}</Text>
                        <Text style={styles.amountDesc}>{item.desc}</Text>
                      </View>
                    </TouchableOpacity>
                    {i < arr.length - 1 && <View style={styles.divider} />}
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.supportBtn, processing && { opacity: 0.6 }]}
                onPress={handleIAPSupport}
                disabled={processing}
                activeOpacity={0.85}
              >
                {processing
                  ? <ActivityIndicator color={Colors.white} />
                  : <>
                      <Ionicons name="heart" size={20} color={Colors.white} />
                      <Text style={styles.supportBtnText}>{selectedIAP.label} 応援する</Text>
                    </>
                }
              </TouchableOpacity>
              <Text style={styles.hint}>App Store 経由で安全にお支払いいただけます。</Text>
            </>
          ) : (
            /* ── Web: 自由金額入力 + Stripe Checkout ── */
            <>
              <Text style={styles.sectionLabel}>応援する金額を入力</Text>
              <View style={styles.amountInputCard}>
                <Text style={styles.yenSign}>¥</Text>
                <TextInput
                  style={styles.amountInput}
                  value={inputAmount}
                  onChangeText={v => setInputAmount(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="500"
                  placeholderTextColor={Colors.textLight}
                  maxLength={7}
                />
                <Text style={styles.amountUnit}>円</Text>
              </View>
              {inputAmount !== '' && !isValidAmount && (
                <Text style={styles.amountError}>
                  ¥{MIN_AMOUNT.toLocaleString()}〜¥{MAX_AMOUNT.toLocaleString()} の範囲で入力してください
                </Text>
              )}

              <TouchableOpacity
                style={[styles.supportBtn, (!isValidAmount || processing) && { opacity: 0.45 }]}
                onPress={handleStripeSupport}
                disabled={!isValidAmount || processing}
                activeOpacity={0.85}
              >
                {processing
                  ? <ActivityIndicator color={Colors.white} />
                  : <>
                      <Ionicons name="heart" size={20} color={Colors.white} />
                      <Text style={styles.supportBtnText}>
                        {isValidAmount ? `¥${parsedAmount.toLocaleString()} ` : ''}応援する
                      </Text>
                    </>
                }
              </TouchableOpacity>
              <Text style={styles.hint}>Stripe の安全な決済ページに移動します。</Text>
            </>
          )}

          {/* 使い道 */}
          <Text style={styles.sectionLabel}>ご支援の使い道</Text>
          <View style={styles.section}>
            {[
              { icon: 'server-outline',          label: 'サーバー・インフラ費' },
              { icon: 'code-slash-outline',       label: '機能開発・改善' },
              { icon: 'shield-checkmark-outline', label: 'セキュリティ強化' },
              { icon: 'megaphone-outline',        label: '広告・プロモーション費' },
              { icon: 'rocket-outline',           label: 'アプリの継続運営' },
            ].map((item, i, arr) => (
              <View key={i}>
                <View style={styles.featureRow}>
                  <Ionicons name={item.icon as any} size={18} color={Colors.accent} />
                  <Text style={styles.featureLabel}>{item.label}</Text>
                </View>
                {i < arr.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>

          {/* メッセージ */}
          <View style={styles.messageCard}>
            <Text style={styles.messageText}>
              ご支援いただかなくてもReachは無料でお使いいただけます。{'\n'}
              もし「応援したい」と思っていただけたら、それだけで嬉しいです。
            </Text>
            <Text style={styles.messageSig}>— Reach 開発者より</Text>
          </View>

        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: 36, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: Colors.text },

  content: { padding: 20, gap: 12, paddingBottom: 40 },

  heroSection: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  heartIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#FFF0F0',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  heroDesc: { fontSize: 14, color: Colors.textLight, textAlign: 'center', lineHeight: 22 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4,
  },
  section: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },

  // IAP 固定選択
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.border },
  radioSelected: { borderColor: '#E05555', backgroundColor: '#E05555' },
  amountLabel: { fontSize: 15, fontWeight: '700', color: Colors.text },
  amountDesc: { fontSize: 12, color: Colors.textLight, marginTop: 1 },

  // Web 自由入力
  amountInputCard: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1.5, borderColor: Colors.accent,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 4,
  },
  yenSign: { fontSize: 22, fontWeight: '700', color: Colors.textLight, marginRight: 4 },
  amountInput: {
    flex: 1, fontSize: 32, fontWeight: '800', color: Colors.text,
    paddingVertical: 14,
  },
  amountUnit: { fontSize: 16, fontWeight: '600', color: Colors.textLight },
  amountError: { fontSize: 12, color: '#E53E3E', marginTop: -4, paddingHorizontal: 4 },

  supportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#E05555', borderRadius: 14, paddingVertical: 16, marginTop: 4,
  },
  supportBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  hint: { textAlign: 'center', fontSize: 12, color: Colors.textLight, marginTop: 4 },

  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  featureLabel: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: 46 },

  messageCard: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    padding: 18, gap: 8, marginTop: 4,
  },
  messageText: { fontSize: 13, color: Colors.textLight, lineHeight: 21 },
  messageSig: { fontSize: 13, color: Colors.accent, fontWeight: '600', textAlign: 'right' },
})
