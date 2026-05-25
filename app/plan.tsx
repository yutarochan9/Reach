import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as WebBrowser from 'expo-web-browser'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'
import { BETA_MODE } from '../constants/config'

type Plan = 'free' | 'standard' | 'pro'

const PLANS = [
  {
    id: 'free' as Plan,
    name: '無料プラン',
    price: '¥0',
    period: '',
    color: Colors.textLight,
    features: [
      'フォロワー500人まで',
      '月50回まで配信',
      '基本配信（テキスト・画像）',
      'コメント・リアクション確認',
    ],
    disabled: ['フロー配信', 'セグメント配信', 'タイル', '自動応答'],
  },
  {
    id: 'standard' as Plan,
    name: 'スタンダード',
    price: '¥2,980',
    period: '/月',
    color: Colors.accent,
    badge: '人気',
    features: [
      'フォロワー3,000人まで',
      '配信無制限',
      'フロー配信・自動化',
      '分析（閲覧数・リアクション数）',
    ],
    disabled: ['セグメント配信', 'タイル', '自動応答'],
  },
  {
    id: 'pro' as Plan,
    name: 'プロプラン',
    price: '¥7,500',
    period: '/月',
    color: '#8B4513',
    badge: '全機能',
    features: [
      'フォロワー無制限',
      '配信無制限',
      'フロー配信・自動化',
      '分析（閲覧数・リアクション数）',
      'タイル作成',
      'セグメント配信（タグで絞り込み）',
      '自動応答',
    ],
    disabled: [],
  },
]

export default function PlanScreen() {
  const [currentPlan, setCurrentPlan] = useState<Plan>('free')
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<Plan | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('plan, subscription_status')
      .eq('id', user.id)
      .single()
    setCurrentPlan((data?.plan ?? 'free') as Plan)
    setSubscriptionStatus(data?.subscription_status ?? null)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const handleUpgrade = async (plan: Plan) => {
    if (plan === 'free') return
    if (plan === currentPlan && subscriptionStatus === 'active') {
      // Manage existing subscription
      handleManage()
      return
    }

    setProcessing(plan)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { Alert.alert('エラー', 'ログインが必要です'); return }

      const res = await supabase.functions.invoke('stripe-checkout', {
        body: { plan },
      })

      if (res.error) throw new Error(res.error.message)
      const { url } = res.data

      const result = await WebBrowser.openAuthSessionAsync(url, 'reach://')
      if (result.type === 'success') {
        await new Promise(r => setTimeout(r, 1500)) // wait for webhook
        await load()
        Alert.alert('🎉 アップグレード完了', `${plan === 'standard' ? 'スタンダード' : 'プロ'}プランが有効になりました！`)
      }
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '決済処理に失敗しました')
    } finally {
      setProcessing(null)
    }
  }

  const handleManage = async () => {
    setProcessing('free')
    try {
      const res = await supabase.functions.invoke('stripe-checkout', {
        body: { plan: currentPlan },
      })
      if (res.error) throw new Error(res.error.message)
      await WebBrowser.openAuthSessionAsync(res.data.url, 'reach://')
      await load()
    } catch (e: any) {
      Alert.alert('エラー', e.message)
    } finally {
      setProcessing(null)
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>プランを選択</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {BETA_MODE && (
          <View style={styles.betaBanner}>
            <Ionicons name="gift-outline" size={20} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.betaTitle}>🎉 お試し期間中 — 全員無料</Text>
              <Text style={styles.betaDesc}>現在はプロプランの全機能を無料でご利用いただけます。正式リリース時に料金プランが適用されます。</Text>
            </View>
          </View>
        )}

        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan
          const isActive = isCurrent && subscriptionStatus === 'active'
          const isLoading = processing === plan.id

          return (
            <View
              key={plan.id}
              style={[
                styles.planCard,
                isCurrent && styles.planCardCurrent,
                plan.id === 'standard' && styles.planCardHighlight,
              ]}
            >
              {plan.badge && (
                <View style={[styles.badge, { backgroundColor: plan.color }]}>
                  <Text style={styles.badgeText}>{plan.badge}</Text>
                </View>
              )}

              <View style={styles.planHeader}>
                <Text style={[styles.planName, { color: plan.color }]}>{plan.name}</Text>
                <View style={styles.priceRow}>
                  <Text style={styles.planPrice}>{plan.price}</Text>
                  {plan.period ? <Text style={styles.planPeriod}>{plan.period}</Text> : null}
                </View>
              </View>

              <View style={styles.featureList}>
                {plan.features.map((f) => (
                  <View key={f} style={styles.featureRow}>
                    <Ionicons name="checkmark-circle" size={16} color={plan.color} />
                    <Text style={styles.featureText}>{f}</Text>
                  </View>
                ))}
                {plan.disabled.map((f) => (
                  <View key={f} style={styles.featureRow}>
                    <Ionicons name="close-circle-outline" size={16} color={Colors.border} />
                    <Text style={[styles.featureText, styles.featureDisabled]}>{f}</Text>
                  </View>
                ))}
              </View>

              {!BETA_MODE && plan.id !== 'free' && (
                <TouchableOpacity
                  style={[
                    styles.upgradeBtn,
                    { backgroundColor: isActive ? Colors.border : plan.color },
                    (isLoading || (isCurrent && !isActive)) && { opacity: 0.6 },
                  ]}
                  onPress={() => handleUpgrade(plan.id)}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.upgradeBtnText}>
                      {isActive ? '管理・解約' : isCurrent ? '選択中' : 'このプランにする'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {!BETA_MODE && plan.id === 'free' && isCurrent && (
                <View style={[styles.upgradeBtn, { backgroundColor: Colors.background }]}>
                  <Text style={[styles.upgradeBtnText, { color: Colors.textLight }]}>現在のプラン</Text>
                </View>
              )}
            </View>
          )
        })}

        <Text style={styles.note}>
          ※ 決済はブラウザ上のStripeで安全に処理されます。{'\n'}
          ※ Apple/Googleの手数料は発生しません。{'\n'}
          ※ 販売手数料は一切いただきません。
        </Text>
      </ScrollView>
    </View>
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
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  subtitle: { fontSize: 14, color: Colors.textLight, textAlign: 'center', lineHeight: 22, marginBottom: 4 },
  betaBanner: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  betaTitle: { color: '#fff', fontWeight: '800', fontSize: 15, marginBottom: 4 },
  betaDesc: { color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 19 },
  planCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 16,
    position: 'relative',
  },
  planCardCurrent: { borderColor: Colors.accent },
  planCardHighlight: { borderColor: Colors.accent, borderWidth: 2 },
  badge: {
    position: 'absolute', top: -1, right: 16,
    paddingHorizontal: 10, paddingVertical: 3,
    borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  planHeader: { gap: 4 },
  planName: { fontSize: 16, fontWeight: '800' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  planPrice: { fontSize: 28, fontWeight: '800', color: Colors.text },
  planPeriod: { fontSize: 13, color: Colors.textLight },
  featureList: { gap: 8 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { fontSize: 13, color: Colors.text, flex: 1 },
  featureDisabled: { color: Colors.textLight },
  upgradeBtn: {
    borderRadius: 12, padding: 14,
    alignItems: 'center',
  },
  upgradeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  note: { fontSize: 11, color: Colors.textLight, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },
})
