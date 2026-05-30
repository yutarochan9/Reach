import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'
import ToggleSwitch from './components/ToggleSwitch'

// ── 価格プラン ─────────────────────────────────────────────
const PRICE_OPTIONS = [
  { value: 500,  label: '¥500' },
  { value: 1000, label: '¥1,000' },
  { value: 3000, label: '¥3,000' },
]

// ── デフォルト特典 ─────────────────────────────────────────
const DEFAULT_BENEFITS = [
  'メンバーシップ限定配信へのアクセス',
  '優先サポート',
  '最新情報をいち早くお届け',
]

export default function MembershipSettingsScreen() {
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [memberCount, setMemberCount] = useState(0)

  // 設定値
  const [isActive, setIsActive]         = useState(false)
  const [price, setPrice]               = useState(500)
  const [benefit1, setBenefit1]         = useState(DEFAULT_BENEFITS[0])
  const [benefit2, setBenefit2]         = useState(DEFAULT_BENEFITS[1])
  const [benefit3, setBenefit3]         = useState(DEFAULT_BENEFITS[2])
  const [benefit4, setBenefit4]         = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/(auth)/login' as any); return }
      setUserId(user.id)

      const [{ data: prof }, { count }] = await Promise.all([
        supabase.from('profiles')
          .select('membership_price, membership_active, membership_welcome, membership_benefits, membership_community')
          .eq('id', user.id).single(),
        supabase.from('subscriptions')
          .select('subscriber_id', { count: 'exact', head: true })
          .eq('creator_id', user.id).eq('status', 'active'),
      ])

      if (prof) {
        setIsActive(prof.membership_active ?? false)
        // 保存されていない場合 or 500/1000/3000 以外の場合は 500 に丸める
        const saved = prof.membership_price ?? 500
        setPrice(PRICE_OPTIONS.some(p => p.value === saved) ? saved : 500)
        setWelcomeMessage(prof.membership_welcome ?? '')
        const benefits: string[] = prof.membership_benefits ?? []
        setBenefit1(benefits[0] ?? DEFAULT_BENEFITS[0])
        setBenefit2(benefits[1] ?? DEFAULT_BENEFITS[1])
        setBenefit3(benefits[2] ?? DEFAULT_BENEFITS[2])
        setBenefit4(benefits[3] ?? '')
      }
      setMemberCount(count ?? 0)
      setLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    if (!userId) return
    setSaving(true)
    const benefits = [benefit1, benefit2, benefit3, benefit4].filter(b => b.trim())
    const { error } = await supabase.from('profiles').update({
      membership_price: price,
      membership_active: isActive,
      membership_welcome: welcomeMessage.trim() || null,
      membership_benefits: benefits.length > 0 ? benefits : null,
    }).eq('id', userId)
    setSaving(false)
    if (error) { Alert.alert('保存エラー', error.message); return }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert('保存しました')
    } else {
      Alert.alert('保存完了', 'メンバーシップ設定を保存しました')
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
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>メンバーシップ設定</Text>
          <TouchableOpacity style={[s.saveBtn, saving && s.saveBtnOff]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>保存</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

          {/* 会員数 */}
          {memberCount > 0 && (
            <View style={s.statCard}>
              <Ionicons name="people" size={20} color={Colors.accent} />
              <View>
                <Text style={s.statNum}>{memberCount}人</Text>
                <Text style={s.statLabel}>現在のメンバー数</Text>
              </View>
            </View>
          )}

          {/* ── 公開設定 ── */}
          <View style={s.section}>
            <View style={s.row}>
              <View style={s.rowInfo}>
                <Text style={s.rowTitle}>メンバーシップを公開する</Text>
                <Text style={s.rowDesc}>{isActive ? 'フォロワーが加入できます' : 'オフにすると加入ページが非公開になります'}</Text>
              </View>
              <ToggleSwitch value={isActive} onValueChange={setIsActive} />
            </View>
          </View>

          {/* ── 月額料金（3択） ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>月額料金</Text>
            <View style={s.priceGrid}>
              {PRICE_OPTIONS.map(opt => {
                const selected = price === opt.value
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.priceCard, selected && s.priceCardSelected]}
                    onPress={() => setPrice(opt.value)}
                    activeOpacity={0.8}
                  >
                    {selected && (
                      <View style={s.priceCheck}>
                        <Ionicons name="checkmark" size={12} color={Colors.white} />
                      </View>
                    )}
                    <Text style={[s.priceLabel, selected && s.priceLabelSelected]}>{opt.label}</Text>
                    <Text style={s.priceMonth}>/月</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* ── 特典 ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>メンバーシップ特典</Text>
            <Text style={s.sectionDesc}>加入ページに表示されます（最大4つ ＋ コミュニティ）</Text>

            {[
              { value: benefit1, setter: setBenefit1, ph: '例: 限定配信へのアクセス' },
              { value: benefit2, setter: setBenefit2, ph: '例: DMで優先的に返信' },
              { value: benefit3, setter: setBenefit3, ph: '例: 最新情報をいち早くお届け' },
              { value: benefit4, setter: setBenefit4, ph: '例: オリジナルコンテンツ（任意）' },
            ].map((b, i) => (
              <View key={i} style={s.benefitRow}>
                <View style={s.benefitNum}><Text style={s.benefitNumText}>{i + 1}</Text></View>
                <TextInput
                  style={[s.benefitInput, !b.value && i > 0 && s.benefitInputOptional]}
                  value={b.value}
                  onChangeText={b.setter}
                  placeholder={b.ph}
                  placeholderTextColor={Colors.textLight}
                />
              </View>
            ))}

          </View>

          {/* ── ウェルカムメッセージ ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>ウェルカムメッセージ（任意）</Text>
            <Text style={s.sectionDesc}>加入完了後にメンバーへ表示するメッセージ</Text>
            <TextInput
              style={s.textarea}
              value={welcomeMessage}
              onChangeText={setWelcomeMessage}
              placeholder="例: メンバーシップへようこそ！"
              placeholderTextColor={Colors.textLight}
              multiline numberOfLines={3} textAlignVertical="top" maxLength={200}
            />
            <Text style={s.charCount}>{welcomeMessage.length} / 200</Text>
          </View>

          {/* プレビューボタン */}
          {isActive && userId && (
            <TouchableOpacity
              style={s.previewBtn}
              onPress={() => router.push({ pathname: '/membership/[creatorId]' as any, params: { creatorId: userId } })}
              activeOpacity={0.8}
            >
              <Ionicons name="eye-outline" size={16} color={Colors.accent} />
              <Text style={s.previewBtnText}>加入ページをプレビュー</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.accent} />
            </TouchableOpacity>
          )}

          <View style={s.noticeBox}>
            <Ionicons name="information-circle-outline" size={15} color={Colors.textLight} />
            <Text style={s.noticeText}>
              料金変更は新規加入者から適用されます。既存メンバーには影響しません。
            </Text>
          </View>

        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4, width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  saveBtn: { backgroundColor: Colors.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 7, minWidth: 52, alignItems: 'center' },
  saveBtnOff: { opacity: 0.5 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  content: { padding: 16, gap: 14, paddingBottom: 48 },

  statCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 16,
  },
  statNum: { fontSize: 22, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 12, color: Colors.textLight },

  section: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  sectionDesc: { fontSize: 12, color: Colors.textLight, marginTop: -6 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowInfo: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  rowDesc: { fontSize: 12, color: Colors.textLight },

  // 価格3択カード
  priceGrid: { flexDirection: 'row', gap: 10 },
  priceCard: {
    flex: 1, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background,
    paddingVertical: 16, paddingHorizontal: 8,
    alignItems: 'center', gap: 2, position: 'relative',
  },
  priceCardSelected: {
    borderColor: Colors.accent, backgroundColor: '#FDF6EE',
  },
  priceCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  priceLabel: { fontSize: 18, fontWeight: '900', color: Colors.textLight, letterSpacing: -0.5 },
  priceLabelSelected: { color: Colors.accent },
  priceMonth: { fontSize: 10, color: Colors.textLight },
  // 特典入力
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  benefitNumText: { fontSize: 11, fontWeight: '700', color: Colors.white },
  benefitInput: {
    flex: 1, backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.text,
  },
  benefitInputOptional: { borderStyle: 'dashed' },

  // ウェルカムメッセージ
  textarea: {
    backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: Colors.text, lineHeight: 22, minHeight: 80,
  },
  charCount: { fontSize: 11, color: Colors.textLight, textAlign: 'right', marginTop: -6 },

  previewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.accent,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  previewBtnText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.accent },

  noticeBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.white, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  noticeText: { flex: 1, fontSize: 12, color: Colors.textLight, lineHeight: 18 },
})
