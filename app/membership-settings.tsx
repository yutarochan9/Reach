import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Switch, Platform, KeyboardAvoidingView,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

// メンバーシップ設定ページ
// クリエーターがメンバーシップページを作成・編集する

const PRICE_PRESETS = [300, 500, 980, 1500, 2000, 3000, 5000]

export default function MembershipSettingsScreen() {
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 設定値
  const [isActive, setIsActive] = useState(false)
  const [price, setPrice] = useState('500')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [benefit1, setBenefit1] = useState('メンバーシップ限定配信へのアクセス')
  const [benefit2, setBenefit2] = useState('優先サポート')
  const [benefit3, setBenefit3] = useState('最新情報をいち早くお届け')
  const [benefit4, setBenefit4] = useState('')

  // 現在の会員数
  const [memberCount, setMemberCount] = useState(0)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/(auth)/login' as any); return }
      setUserId(user.id)

      // プロフィールからメンバーシップ設定を取得
      const [{ data: prof }, { count }] = await Promise.all([
        supabase.from('profiles')
          .select('membership_price, membership_active, membership_welcome, membership_benefits')
          .eq('id', user.id)
          .single(),
        supabase.from('subscriptions')
          .select('subscriber_id', { count: 'exact', head: true })
          .eq('creator_id', user.id)
          .eq('status', 'active'),
      ])

      if (prof) {
        setIsActive(prof.membership_active ?? false)
        setPrice(String(prof.membership_price ?? 500))
        setWelcomeMessage(prof.membership_welcome ?? '')
        const benefits: string[] = prof.membership_benefits ?? []
        setBenefit1(benefits[0] ?? 'メンバーシップ限定配信へのアクセス')
        setBenefit2(benefits[1] ?? '優先サポート')
        setBenefit3(benefits[2] ?? '最新情報をいち早くお届け')
        setBenefit4(benefits[3] ?? '')
      }
      setMemberCount(count ?? 0)
      setLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    const priceNum = parseInt(price.replace(/[^0-9]/g, ''), 10)
    if (!priceNum || priceNum < 100) {
      Alert.alert('エラー', '料金は100円以上で設定してください')
      return
    }
    if (!userId) return
    setSaving(true)

    const benefits = [benefit1, benefit2, benefit3, benefit4].filter(b => b.trim())

    const { error } = await supabase.from('profiles').update({
      membership_price: priceNum,
      membership_active: isActive,
      membership_welcome: welcomeMessage.trim() || null,
      membership_benefits: benefits.length > 0 ? benefits : null,
    }).eq('id', userId)

    setSaving(false)

    if (error) {
      Alert.alert('保存エラー', error.message)
      return
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert('メンバーシップ設定を保存しました')
    } else {
      Alert.alert('保存完了', 'メンバーシップ設定を保存しました')
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  const priceNum = parseInt(price.replace(/[^0-9]/g, ''), 10) || 0

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
          <Text style={styles.headerTitle}>メンバーシップ設定</Text>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Text style={styles.saveBtnText}>保存</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* 現在の会員数 */}
          {memberCount > 0 && (
            <View style={styles.memberCountCard}>
              <Ionicons name="people" size={20} color={Colors.accent} />
              <View style={styles.memberCountInfo}>
                <Text style={styles.memberCountNum}>{memberCount}人</Text>
                <Text style={styles.memberCountLabel}>現在のメンバー数</Text>
              </View>
            </View>
          )}

          {/* 公開設定 */}
          <View style={styles.section}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleTitle}>メンバーシップを公開する</Text>
                <Text style={styles.toggleDesc}>
                  {isActive ? 'フォロワーが加入できます' : 'オフにすると加入ページが非公開になります'}
                </Text>
              </View>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: Colors.border, true: Colors.accent }}
                thumbColor={Colors.white}
              />
            </View>
          </View>

          {/* 月額料金 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>月額料金</Text>
            <View style={styles.priceInputRow}>
              <Text style={styles.priceYen}>¥</Text>
              <TextInput
                style={styles.priceInput}
                value={price}
                onChangeText={t => setPrice(t.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                placeholder="500"
                placeholderTextColor={Colors.textLight}
              />
              <Text style={styles.pricePer}>/月</Text>
            </View>
            {/* プリセット */}
            <View style={styles.presetRow}>
              {PRICE_PRESETS.map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.presetBtn, priceNum === p && styles.presetBtnActive]}
                  onPress={() => setPrice(String(p))}
                >
                  <Text style={[styles.presetText, priceNum === p && styles.presetTextActive]}>
                    ¥{p.toLocaleString()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 特典設定 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>メンバーシップ特典</Text>
            <Text style={styles.sectionDesc}>加入ページに表示される特典を編集できます（最大4つ）</Text>
            {[
              { value: benefit1, setter: setBenefit1, placeholder: '例: 限定配信へのアクセス', required: true },
              { value: benefit2, setter: setBenefit2, placeholder: '例: 優先サポート', required: false },
              { value: benefit3, setter: setBenefit3, placeholder: '例: 最新情報をいち早くお届け', required: false },
              { value: benefit4, setter: setBenefit4, placeholder: '例: オリジナルコンテンツ', required: false },
            ].map((b, i) => (
              <View key={i} style={styles.benefitInputRow}>
                <View style={styles.benefitNum}>
                  <Text style={styles.benefitNumText}>{i + 1}</Text>
                </View>
                <TextInput
                  style={[styles.benefitInput, !b.required && !b.value && styles.benefitInputOptional]}
                  value={b.value}
                  onChangeText={b.setter}
                  placeholder={b.placeholder}
                  placeholderTextColor={Colors.textLight}
                />
              </View>
            ))}
          </View>

          {/* ウェルカムメッセージ */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ウェルカムメッセージ（任意）</Text>
            <Text style={styles.sectionDesc}>加入完了時にメンバーに表示されるメッセージ</Text>
            <TextInput
              style={[styles.textarea]}
              value={welcomeMessage}
              onChangeText={setWelcomeMessage}
              placeholder="例: メンバーシップへようこそ！限定コンテンツを楽しんでください。"
              placeholderTextColor={Colors.textLight}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              maxLength={200}
            />
            <Text style={styles.charCount}>{welcomeMessage.length} / 200</Text>
          </View>

          {/* プレビューリンク */}
          {isActive && userId && (
            <TouchableOpacity
              style={styles.previewBtn}
              onPress={() => router.push({ pathname: '/membership/[creatorId]' as any, params: { creatorId: userId } })}
              activeOpacity={0.8}
            >
              <Ionicons name="eye-outline" size={16} color={Colors.accent} />
              <Text style={styles.previewBtnText}>加入ページをプレビュー</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.accent} />
            </TouchableOpacity>
          )}

          <View style={styles.noticeBox}>
            <Ionicons name="information-circle-outline" size={15} color={Colors.textLight} />
            <Text style={styles.noticeText}>
              料金を変更しても既存のメンバーには適用されません。変更は新規加入者から有効になります。
            </Text>
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
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4, width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  saveBtn: {
    backgroundColor: Colors.accent, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 7, minWidth: 52, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  content: { padding: 16, gap: 14, paddingBottom: 48 },

  memberCountCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 16,
  },
  memberCountInfo: { gap: 2 },
  memberCountNum: { fontSize: 22, fontWeight: '800', color: Colors.text },
  memberCountLabel: { fontSize: 12, color: Colors.textLight },

  section: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  sectionDesc: { fontSize: 12, color: Colors.textLight, marginTop: -6 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleInfo: { flex: 1, gap: 2 },
  toggleTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  toggleDesc: { fontSize: 12, color: Colors.textLight },

  priceInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.background, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 4,
  },
  priceYen: { fontSize: 20, fontWeight: '700', color: Colors.textLight },
  priceInput: {
    flex: 1, fontSize: 28, fontWeight: '800', color: Colors.text,
    paddingVertical: 8,
  },
  pricePer: { fontSize: 14, color: Colors.textLight, fontWeight: '600' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: Colors.background, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  presetBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  presetText: { fontSize: 13, fontWeight: '600', color: Colors.textLight },
  presetTextActive: { color: Colors.white },

  benefitInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
