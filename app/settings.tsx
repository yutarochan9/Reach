import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import ToggleSwitch from './components/ToggleSwitch'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'
import { BETA_MODE } from '../constants/config'

type Plan = 'free' | 'standard' | 'pro'
const PLAN_LABELS: Record<Plan, string> = { free: '無料', standard: 'スタンダード', pro: 'プロ' }
const PLAN_COLORS: Record<Plan, string> = { free: Colors.textLight, standard: Colors.accent, pro: '#8B4513' }

export default function SettingsScreen() {
  const [email, setEmail] = useState<string | null>(null)
  const [pushEnabled, setPushEnabled] = useState(true)
  const [plan, setPlan] = useState<Plan>('free')
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingPush, setSavingPush] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setEmail(user.email ?? null)

    const { data: profile } = await supabase
      .from('profiles')
      .select('push_enabled, plan, subscription_status, is_admin')
      .eq('id', user.id)
      .single()

    setPushEnabled(profile?.push_enabled ?? true)
    setPlan(BETA_MODE ? 'pro' : (profile?.plan ?? 'free') as Plan)
    setSubscriptionStatus(profile?.subscription_status ?? null)
    setIsAdmin(profile?.is_admin ?? false)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const handlePushToggle = async (val: boolean) => {
    setSavingPush(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({ push_enabled: val }).eq('id', user.id)
    }
    setPushEnabled(val)
    setSavingPush(false)
  }

  const handleLogout = async () => {
    const doLogout = async () => {
      await supabase.auth.signOut()
      router.replace('/(auth)/login')
    }
    if (Platform.OS === 'web') {
      if (window.confirm('ログアウトしますか？')) doLogout()
    } else {
      Alert.alert('ログアウト', 'ログアウトしますか？', [
        { text: 'キャンセル', style: 'cancel' },
        { text: 'ログアウト', style: 'destructive', onPress: doLogout },
      ])
    }
  }

  const handleDeleteAccount = () => {
    if (Platform.OS === 'web') {
      const ok = window.confirm(
        'アカウントを削除すると、すべてのデータが失われます。この操作は取り消せません。\n\n本当に削除しますか？'
      )
      if (ok) confirmDelete()
    } else {
      Alert.alert(
        'アカウント削除',
        'アカウントを削除すると、すべてのデータが失われます。この操作は取り消せません。',
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: '削除する', style: 'destructive', onPress: confirmDelete },
        ]
      )
    }
  }

  const confirmDelete = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setLoading(true)
    const res = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    )
    setLoading(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      Alert.alert('エラー', body.error ?? '削除に失敗しました')
      return
    }
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
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
        <TouchableOpacity onPress={() => router.replace('/(tabs)/mypage' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>設定</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>プラン</Text>
        <View style={styles.section}>
          <View style={styles.infoRow}>
            <Ionicons name="star-outline" size={18} color={PLAN_COLORS[plan]} />
            <Text style={styles.infoLabel}>現在のプラン</Text>
            <Text style={[styles.infoValue, { color: PLAN_COLORS[plan], fontWeight: '700' }]}>
              {PLAN_LABELS[plan]}
              {subscriptionStatus === 'past_due' ? ' (支払い遅延)' : ''}
            </Text>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.actionRow} onPress={() => router.push('/plan' as any)}>
            <Ionicons name="trending-up-outline" size={18} color={Colors.accent} />
            <Text style={[styles.actionLabel, { color: Colors.accent }]}>
              {plan === 'free' ? 'プランをアップグレード' : 'プランを変更・管理'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.border} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>アカウント</Text>
        <View style={styles.section}>
          <View style={styles.infoRow}>
            <Ionicons name="mail-outline" size={18} color={Colors.textLight} />
            <Text style={styles.infoLabel}>メールアドレス</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{email ?? '—'}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>通知</Text>
        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <Ionicons name="notifications-outline" size={18} color={Colors.accent} />
              <View>
                <Text style={styles.toggleLabel}>プッシュ通知</Text>
                <Text style={styles.toggleDesc}>いいね・フォローの通知を受け取る</Text>
              </View>
            </View>
            <ToggleSwitch
              value={pushEnabled}
              onValueChange={handlePushToggle}
              disabled={savingPush}
            />
          </View>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.actionRow} onPress={() => router.push('/notification-settings' as any)}>
            <Ionicons name="options-outline" size={18} color={Colors.accent} />
            <Text style={styles.actionLabel}>通知の詳細設定</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.border} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>セキュリティ</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionRow} onPress={() => router.push('/security' as any)}>
            <Ionicons name="shield-checkmark-outline" size={18} color={Colors.accent} />
            <Text style={styles.actionLabel}>二段階認証・端末移行</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.border} />
          </TouchableOpacity>
        </View>

        {isAdmin && (
          <>
            <Text style={styles.sectionLabel}>運営</Text>
            <View style={styles.section}>
              <TouchableOpacity style={styles.actionRow} onPress={() => router.push('/admin' as any)}>
                <Ionicons name="settings-outline" size={18} color="#8B5CF6" />
                <Text style={[styles.actionLabel, { color: '#8B5CF6' }]}>管理者画面</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.border} />
              </TouchableOpacity>
            </View>
          </>
        )}

        <Text style={styles.sectionLabel}>サポート</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionRow} onPress={() => router.push('/contact' as any)}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={Colors.accent} />
            <Text style={styles.actionLabel}>お問い合わせ</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.border} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>法的情報</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionRow} onPress={() => router.push('/terms' as any)}>
            <Ionicons name="document-text-outline" size={18} color={Colors.accent} />
            <Text style={styles.actionLabel}>利用規約</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.border} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.actionRow} onPress={() => router.push('/privacy' as any)}>
            <Ionicons name="shield-outline" size={18} color={Colors.accent} />
            <Text style={styles.actionLabel}>プライバシーポリシー</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.border} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>その他</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionRow} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color={Colors.textLight} />
            <Text style={styles.actionLabel}>ログアウト</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.border} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.actionRow} onPress={handleDeleteAccount}>
            <Ionicons name="trash-outline" size={18} color="#E53E3E" />
            <Text style={[styles.actionLabel, { color: '#E53E3E' }]}>アカウントを削除</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.border} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
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
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  infoLabel: { fontSize: 14, color: Colors.text, fontWeight: '500', width: 110 },
  infoValue: { flex: 1, fontSize: 14, color: Colors.textLight, textAlign: 'right' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    gap: 12,
  },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  toggleLabel: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  toggleDesc: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: 46 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  actionLabel: { flex: 1, fontSize: 15, color: Colors.text, fontWeight: '500' },
})
