import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, Platform,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

type Profile = {
  id: string
  display_name: string
  bio: string | null
  avatar_url: string | null
  membership_price: number | null
  membership_benefits: string[] | null
  membership_welcome: string | null
  membership_community: boolean | null
}

const DEFAULT_PRICE = 500

const DEFAULT_BENEFITS = [
  { title: 'メンバーシップ限定配信へのアクセス' },
  { title: '優先サポート' },
  { title: '最新情報をいち早くお届け' },
]

const BENEFIT_ICONS = [
  'lock-closed-outline', 'star-outline', 'notifications-outline',
  'heart-outline', 'people-outline',
] as const

export default function MembershipPage() {
  const { creatorId } = useLocalSearchParams<{ creatorId: string }>()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [myId, setMyId] = useState<string | null>(null)

  useEffect(() => {
    const fetch = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setMyId(user?.id ?? null)
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, bio, avatar_url, membership_price, membership_benefits, membership_welcome, membership_community')
        .eq('id', creatorId)
        .single()
      setProfile(data)
      setLoading(false)
    }
    fetch()
  }, [creatorId])

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  if (!profile) return null

  const price = profile.membership_price ?? DEFAULT_PRICE

  // DB設定の特典があればそれを使う、なければデフォルト
  const benefitTitles = profile.membership_benefits && profile.membership_benefits.length > 0
    ? profile.membership_benefits
    : DEFAULT_BENEFITS.map(b => b.title)
  const benefits = benefitTitles.map((title, i) => ({
    icon: BENEFIT_ICONS[i % BENEFIT_ICONS.length],
    title,
    desc: '',
  }))

  const handleJoin = () => {
    if (!myId) { router.push('/(auth)/login' as any); return }
    router.push({ pathname: '/membership-checkout/[creatorId]' as any, params: { creatorId } })
  }

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>メンバーシップ</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* クリエーター情報 */}
        <View style={styles.creatorCard}>
          <View style={styles.creatorRow}>
            {profile.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              : <View style={styles.avatarPlaceholder}><Text style={styles.avatarText}>{profile.display_name[0]}</Text></View>
            }
            <View style={styles.creatorInfo}>
              <Text style={styles.creatorName}>{profile.display_name}</Text>
              {profile.bio ? <Text style={styles.creatorBio} numberOfLines={2}>{profile.bio}</Text> : null}
            </View>
          </View>
          <View style={styles.priceBanner}>
            <Text style={styles.priceBannerLabel}>月額料金</Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceYen}>¥</Text>
              <Text style={styles.priceNum}>{price.toLocaleString()}</Text>
              <Text style={styles.pricePer}>/月</Text>
            </View>
          </View>
        </View>

        {/* 特典 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>メンバーシップ特典</Text>
          <View style={styles.benefitsList}>
            {benefits.map((b, i) => (
              <View key={i} style={[styles.benefitRow, i > 0 && styles.benefitDivider]}>
                <View style={styles.benefitIcon}>
                  <Ionicons name={b.icon} size={20} color={Colors.accent} />
                </View>
                <View style={styles.benefitText}>
                  <Text style={styles.benefitTitle}>{b.title}</Text>
                  <Text style={styles.benefitDesc}>{b.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* 注意事項 */}
        <View style={styles.noticeBox}>
          <Ionicons name="information-circle-outline" size={15} color={Colors.textLight} />
          <Text style={styles.noticeText}>
            メンバーシップはいつでも退会できます。次回の更新日前に退会した場合、その月の残りの期間は引き続きご利用いただけます。
          </Text>
        </View>
      </ScrollView>

      {/* 加入ボタン（固定フッター） */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.joinBtn} onPress={handleJoin} activeOpacity={0.85}>
          <Ionicons name="star" size={18} color={Colors.white} />
          <Text style={styles.joinBtnText}>加入する  ¥{price.toLocaleString()}/月</Text>
        </TouchableOpacity>
      </View>
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
  backBtn: { padding: 4, width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },

  content: { padding: 16, gap: 16, paddingBottom: 120 },

  creatorCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  creatorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
  },
  avatar: { width: 60, height: 60, borderRadius: 30 },
  avatarPlaceholder: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 24, fontWeight: '700', color: Colors.white },
  creatorInfo: { flex: 1, gap: 4 },
  creatorName: { fontSize: 17, fontWeight: '700', color: Colors.text },
  creatorBio: { fontSize: 13, color: Colors.textLight, lineHeight: 18 },

  priceBanner: {
    backgroundColor: Colors.accent, paddingHorizontal: 20, paddingVertical: 16,
    alignItems: 'center', gap: 4,
  },
  priceBannerLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.8)', letterSpacing: 1 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  priceYen: { fontSize: 20, fontWeight: '700', color: Colors.white, marginBottom: 4 },
  priceNum: { fontSize: 42, fontWeight: '900', color: Colors.white, letterSpacing: -2 },
  pricePer: { fontSize: 16, color: 'rgba(255,255,255,0.8)', marginBottom: 6 },

  section: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.textLight,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  benefitsList: { padding: 0 },
  benefitRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  benefitDivider: { borderTopWidth: 1, borderTopColor: Colors.border },
  benefitIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center',
  },
  benefitText: { flex: 1, gap: 3 },
  benefitTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  benefitDesc: { fontSize: 12, color: Colors.textLight, lineHeight: 18 },

  noticeBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.white, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  noticeText: { flex: 1, fontSize: 12, color: Colors.textLight, lineHeight: 18 },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.white,
    borderTopWidth: 1, borderTopColor: Colors.border,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  joinBtn: {
    backgroundColor: Colors.accent, borderRadius: 14,
    paddingVertical: 16, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  joinBtnText: { fontSize: 16, fontWeight: '800', color: Colors.white },
})
