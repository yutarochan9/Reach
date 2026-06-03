import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Image, Alert, Platform, KeyboardAvoidingView,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'
import { IS_NATIVE, getMembershipSku, initIAP, endIAP, purchaseMembershipIAP } from '../../lib/iap'

// Webでのカード入力フォームは不要 — Stripe Checkoutへリダイレクトする
const IS_WEB = Platform.OS === 'web'

type Profile = {
  id: string
  display_name: string
  avatar_url: string | null
  membership_price: number | null
  membership_close_date: string | null
  membership_welcome: string | null
}

const formatDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

const DEFAULT_PRICE = 500

export default function MembershipCheckout() {
  const { creatorId, payment } = useLocalSearchParams<{ creatorId: string; payment?: string }>()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [myId, setMyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  // ネイティブ用カード入力フィールド（Webでは未使用）
  const [cardName, setCardName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')

  useEffect(() => {
    const fetch = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/(auth)/login' as any); return }
      setMyId(user.id)
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, membership_price, membership_close_date, membership_welcome')
        .eq('id', creatorId)
        .single()
      setProfile(data)
      setLoading(false)

      // Stripe決済完了後にリダイレクトで戻ってきた場合
      if (payment === 'success') {
        // Webhook fallback: stripe-checkout edge function (service_role) でupsert
        // クライアントからの直接insertはRLSでブロックされる可能性があるため
        try {
          await supabase.functions.invoke('stripe-checkout', {
            body: { type: 'confirm-membership', creatorId },
          })
        } catch {}
        // トーク画面（配信一覧）へリダイレクト → 加入後すぐにメンシプ限定配信を閲覧できる
        router.replace(`/talk/${creatorId}` as any)
      }
    }
    fetch()
    // iOS: IAP 接続を初期化
    if (IS_NATIVE) { initIAP().catch(() => {}) }
    return () => { if (IS_NATIVE) endIAP().catch(() => {}) }
  }, [creatorId, payment])

  // カード番号フォーマット: 4桁ごとにスペース
  const formatCardNumber = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 16)
    return digits.replace(/(.{4})/g, '$1 ').trim()
  }

  // 有効期限フォーマット: MM/YY
  const formatExpiry = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 4)
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`
    return digits
  }

  const isFormValid =
    cardName.trim().length > 0 &&
    cardNumber.replace(/\s/g, '').length === 16 &&
    expiry.length === 5 &&
    cvv.length >= 3

  // 加入完了後の共通処理
  const onJoinSuccess = () => {
    const welcomeMsg = profile?.membership_welcome?.trim()
    const baseMsg = `${profile?.display_name ?? 'クリエーター'} のメンバーシップに加入しました！`
    const fullMsg = welcomeMsg ? `${baseMsg}\n\n${welcomeMsg}` : baseMsg
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(fullMsg)
    } else {
      Alert.alert('加入完了 🎉', fullMsg)
    }
    router.replace(`/creator/${creatorId}` as any)
  }

  const handlePayment = async () => {
    if (!myId) return
    setProcessing(true)

    try {
      if (IS_NATIVE) {
        // ── iOS / Android: App Store IAP ─────────────────────────
        const priceVal = profile?.membership_price ?? DEFAULT_PRICE
        const sku = getMembershipSku(priceVal)
        await purchaseMembershipIAP(sku, myId, creatorId as string)
        onJoinSuccess()
      } else {
        // ── Web: Stripe Checkout へリダイレクト ──────────────────
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          window.alert('エラー: ログインが必要です')
          return
        }
        const price = profile?.membership_price ?? DEFAULT_PRICE
        const res = await supabase.functions.invoke('stripe-checkout', {
          body: { type: 'membership', creatorId, amount: price },
        })
        if (res.error || res.data?.error) throw new Error(res.data?.error ?? res.error?.message ?? '購入に失敗しました')
        if (!res.data?.url) throw new Error('決済URLの取得に失敗しました')
        window.location.href = res.data.url
        return // リダイレクト後は処理不要
      }
    } catch (e: any) {
      if (e?.code !== 'E_USER_CANCELLED') {
        if (IS_WEB) {
          window.alert('エラー: ' + (e.message ?? '購入に失敗しました'))
        } else {
          Alert.alert('エラー', e.message ?? '購入に失敗しました')
        }
      }
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  if (!profile) return null

  const price = profile.membership_price ?? DEFAULT_PRICE

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>お支払い</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* 閉鎖予定警告バナー */}
          {profile.membership_close_date && (
            <View style={styles.closeWarningBanner}>
              <Ionicons name="warning" size={18} color="#D32F2F" />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.closeWarningTitle}>終了予定のメンバーシップです</Text>
                <Text style={styles.closeWarningBody}>
                  このメンバーシップは{' '}
                  <Text style={styles.closeWarningDate}>{formatDate(profile.membership_close_date)}</Text>
                  {' '}に閉鎖予定です。加入後1ヶ月以内に終了する可能性があります。それでもよろしければ下記で支払いを確定してください。
                </Text>
              </View>
            </View>
          )}

          {/* 注文内容サマリー */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>加入内容</Text>
            <View style={styles.summaryRow}>
              {profile.avatar_url
                ? <Image source={{ uri: profile.avatar_url }} style={styles.summaryAvatar} />
                : <View style={styles.summaryAvatarPlaceholder}>
                    <Text style={styles.summaryAvatarText}>{profile.display_name[0]}</Text>
                  </View>
              }
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryName}>{profile.display_name}</Text>
                <Text style={styles.summaryPlan}>メンバーシップ（月額）</Text>
              </View>
              <Text style={styles.summaryPrice}>¥{price.toLocaleString()}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryTotal}>
              <Text style={styles.summaryTotalLabel}>今月のお支払い</Text>
              <Text style={styles.summaryTotalPrice}>¥{price.toLocaleString()}</Text>
            </View>
          </View>

          {IS_NATIVE ? (
            /* ── iOS / Android: App Store IAP ── */
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="storefront-outline" size={18} color={Colors.accent} />
                <Text style={styles.sectionTitle}>App Store 経由で加入</Text>
              </View>
              <View style={{ padding: 16, gap: 6 }}>
                <Text style={{ fontSize: 13, color: Colors.textLight, lineHeight: 20 }}>
                  App Store の安全な決済システムを使って加入します。{'\n'}
                  クレジットカード情報はAppleが管理します。
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Ionicons name="shield-checkmark-outline" size={14} color={Colors.textLight} />
                  <Text style={{ fontSize: 11, color: Colors.textLight }}>Apple ID の支払い方法が使われます</Text>
                </View>
              </View>
            </View>
          ) : (
            /* ── Web: Stripe Checkout へリダイレクト ── */
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="card-outline" size={18} color={Colors.accent} />
                <Text style={styles.sectionTitle}>クレジットカード決済</Text>
              </View>
              <View style={{ padding: 16, gap: 8 }}>
                <Text style={{ fontSize: 13, color: Colors.textLight, lineHeight: 20 }}>
                  Stripe の安全な決済ページに移動してお支払いいただきます。{'\n'}
                  カード情報はStripeが管理し、Reachには保存されません。
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="shield-checkmark-outline" size={14} color={Colors.textLight} />
                  <Text style={{ fontSize: 11, color: Colors.textLight }}>SSL暗号化・PCI DSS準拠</Text>
                </View>
              </View>
            </View>
          )}

          {/* セキュリティ表示 */}
          <View style={styles.securityRow}>
            <Ionicons name="shield-checkmark-outline" size={14} color={Colors.textLight} />
            <Text style={styles.securityText}>
              {IS_NATIVE ? 'Apple の安全な決済システムで保護されます' : 'Stripe の安全な決済システムで保護されます'}
            </Text>
          </View>

          {/* 利用規約 */}
          <Text style={styles.termsText}>
            「支払いを確定する」を押すことで、メンバーシップの利用規約に同意したものとみなされます。毎月自動更新されます。
          </Text>

        </ScrollView>

        {/* 支払いボタン（固定フッター） */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.payBtn, processing && styles.payBtnDisabled]}
            onPress={handlePayment}
            disabled={processing}
            activeOpacity={0.85}
          >
            {processing
              ? <ActivityIndicator color={Colors.white} />
              : <>
                  <Ionicons name="lock-closed" size={16} color={Colors.white} />
                  <Text style={styles.payBtnText}>支払いを確定する  ¥{price.toLocaleString()}</Text>
                </>
            }
          </TouchableOpacity>
        </View>
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
  backBtn: { padding: 4, width: 32 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: Colors.text },

  content: { padding: 16, gap: 16, paddingBottom: 120 },

  summaryCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 12,
  },
  summaryLabel: { fontSize: 11, fontWeight: '700', color: Colors.textLight, letterSpacing: 0.5 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryAvatar: { width: 44, height: 44, borderRadius: 22 },
  summaryAvatarPlaceholder: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center',
  },
  summaryAvatarText: { fontSize: 18, fontWeight: '700', color: Colors.white },
  summaryInfo: { flex: 1, gap: 2 },
  summaryName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  summaryPlan: { fontSize: 12, color: Colors.textLight },
  summaryPrice: { fontSize: 16, fontWeight: '700', color: Colors.text },
  summaryDivider: { height: 1, backgroundColor: Colors.border },
  summaryTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryTotalLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  summaryTotalPrice: { fontSize: 20, fontWeight: '800', color: Colors.accent },

  section: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 14,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },

  fieldGroup: { gap: 6 },
  fieldRow: { flexDirection: 'row', gap: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textLight },
  input: {
    backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.text,
  },

  securityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    justifyContent: 'center',
  },
  securityText: { fontSize: 11, color: Colors.textLight },

  termsText: {
    fontSize: 11, color: Colors.textLight, textAlign: 'center', lineHeight: 17,
  },

  closeWarningBanner: {
    backgroundColor: '#FFF3F3', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#F44336',
    padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start',
  },
  closeWarningTitle: { fontSize: 13, fontWeight: '800', color: '#D32F2F' },
  closeWarningBody: { fontSize: 12, color: Colors.text, lineHeight: 18 },
  closeWarningDate: { fontWeight: '800', color: '#D32F2F' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.white,
    borderTopWidth: 1, borderTopColor: Colors.border,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  payBtn: {
    backgroundColor: Colors.accent, borderRadius: 14,
    paddingVertical: 16, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  payBtnDisabled: { opacity: 0.4 },
  payBtnText: { fontSize: 16, fontWeight: '800', color: Colors.white },
})
