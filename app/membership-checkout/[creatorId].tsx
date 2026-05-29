import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Image, Alert, Platform, KeyboardAvoidingView,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

type Profile = {
  id: string
  display_name: string
  avatar_url: string | null
  membership_price: number | null
}

const DEFAULT_PRICE = 500

export default function MembershipCheckout() {
  const { creatorId } = useLocalSearchParams<{ creatorId: string }>()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [myId, setMyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  // カード入力フィールド
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
        .select('id, display_name, avatar_url, membership_price')
        .eq('id', creatorId)
        .single()
      setProfile(data)
      setLoading(false)
    }
    fetch()
  }, [creatorId])

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

  const handlePayment = async () => {
    if (!isFormValid || !myId) return
    setProcessing(true)

    // 実際の決済処理はここにStripe等のSDKを組み込む
    // 現在はサブスクリプションをDBに直接登録（デモ）
    const { error } = await supabase.from('subscriptions').insert({
      subscriber_id: myId,
      creator_id: creatorId,
      status: 'active',
    })

    setProcessing(false)

    if (error) {
      if (error.code === '23505') {
        // 既に加入済みの場合（重複エラー）
        router.replace(`/creator/${creatorId}` as any)
        return
      }
      Alert.alert('エラー', error.message)
      return
    }

    // 成功
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(`${profile?.display_name ?? 'クリエーター'} のメンバーシップに加入しました！`)
    } else {
      Alert.alert('加入完了', `${profile?.display_name ?? 'クリエーター'} のメンバーシップに加入しました！`)
    }

    // クリエーターページに戻る（スタックをリセット）
    router.replace(`/creator/${creatorId}` as any)
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

          {/* お支払い方法 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="card-outline" size={18} color={Colors.accent} />
              <Text style={styles.sectionTitle}>クレジットカード</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>カード名義（ローマ字）</Text>
              <TextInput
                style={styles.input}
                placeholder="TARO YAMADA"
                placeholderTextColor={Colors.textLight}
                value={cardName}
                onChangeText={setCardName}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>カード番号</Text>
              <TextInput
                style={styles.input}
                placeholder="1234 5678 9012 3456"
                placeholderTextColor={Colors.textLight}
                value={cardNumber}
                onChangeText={t => setCardNumber(formatCardNumber(t))}
                keyboardType="numeric"
                maxLength={19}
              />
            </View>

            <View style={styles.fieldRow}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>有効期限</Text>
                <TextInput
                  style={styles.input}
                  placeholder="MM/YY"
                  placeholderTextColor={Colors.textLight}
                  value={expiry}
                  onChangeText={t => setExpiry(formatExpiry(t))}
                  keyboardType="numeric"
                  maxLength={5}
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>セキュリティコード</Text>
                <TextInput
                  style={styles.input}
                  placeholder="123"
                  placeholderTextColor={Colors.textLight}
                  value={cvv}
                  onChangeText={t => setCvv(t.replace(/\D/g, '').slice(0, 4))}
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry
                />
              </View>
            </View>
          </View>

          {/* セキュリティ表示 */}
          <View style={styles.securityRow}>
            <Ionicons name="shield-checkmark-outline" size={14} color={Colors.textLight} />
            <Text style={styles.securityText}>SSL暗号化で安全にお支払い情報を保護します</Text>
          </View>

          {/* 利用規約 */}
          <Text style={styles.termsText}>
            「支払いを確定する」を押すことで、メンバーシップの利用規約に同意したものとみなされます。毎月自動更新されます。
          </Text>

        </ScrollView>

        {/* 支払いボタン（固定フッター） */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.payBtn, (!isFormValid || processing) && styles.payBtnDisabled]}
            onPress={handlePayment}
            disabled={!isFormValid || processing}
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
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4, width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },

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
