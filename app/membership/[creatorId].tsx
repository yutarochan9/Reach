import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, Platform,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import Head from 'expo-router/head'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

type Profile = {
  id: string
  display_name: string
  bio: string | null
  avatar_url: string | null
  membership_active: boolean | null
  membership_price: number | null
  membership_benefits: string[] | null
  membership_description: string | null
  membership_welcome: string | null
  membership_community: boolean | null
  membership_close_date: string | null
}

const formatDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
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

// "icon|text" 形式をパース（旧形式のテキストのみも対応）
const parseBenefitStr = (s: string, fallbackIcon: string) => {
  const sepIdx = s.indexOf('|')
  if (sepIdx > 0) return { icon: s.slice(0, sepIdx), title: s.slice(sepIdx + 1) }
  return { icon: fallbackIcon, title: s }
}

export default function MembershipPage() {
  const { creatorId } = useLocalSearchParams<{ creatorId: string }>()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [myId, setMyId] = useState<string | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [isPrivate, setIsPrivate] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setMyId(user?.id ?? null)
      const [{ data }, followResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, display_name, bio, avatar_url, membership_active, membership_price, membership_benefits, membership_description, membership_welcome, membership_community, membership_close_date, is_private')
          .eq('id', creatorId)
          .single(),
        user
          ? supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', creatorId).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      setProfile(data)
      setIsPrivate((data as any)?.is_private ?? false)
      setIsFollowing(!!(followResult as any)?.data)
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

  const isOwner = myId === profile.id

  // 非公開かつオーナー以外はアクセス不可
  if (!profile.membership_active && !isOwner) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32 }]}>
        <Ionicons name="lock-closed-outline" size={40} color={Colors.textLight} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.text, textAlign: 'center' }}>
          このメンバーシップは現在非公開です
        </Text>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace(`/creator/${creatorId}` as any)}>
          <Text style={{ color: Colors.accent, fontSize: 14 }}>戻る</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // 鍵垢かつ未承認フォロワーはメンバーシップページにアクセス不可
  if (isPrivate && !isOwner && !isFollowing) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32 }]}>
        <Ionicons name="lock-closed-outline" size={40} color={Colors.textLight} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.text, textAlign: 'center' }}>
          フォロワー限定のメンバーシップです
        </Text>
        <Text style={{ fontSize: 13, color: Colors.textLight, textAlign: 'center', lineHeight: 20 }}>
          フォローが承認されると{'\n'}メンバーシップに加入できます
        </Text>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace(`/creator/${creatorId}` as any)}>
          <Text style={{ color: Colors.accent, fontSize: 14 }}>戻る</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const price = profile.membership_price ?? DEFAULT_PRICE

  // DB設定の特典があればそれを使う、なければデフォルト
  const rawBenefits = profile.membership_benefits && profile.membership_benefits.length > 0
    ? profile.membership_benefits
    : DEFAULT_BENEFITS.map(b => b.title)
  const benefits = rawBenefits.map((raw, i) => {
    const { icon, title } = parseBenefitStr(raw, BENEFIT_ICONS[i % BENEFIT_ICONS.length])
    return { icon, title }
  })

  const handleJoin = () => {
    if (!myId) { router.push('/(auth)/login' as any); return }
    router.push({ pathname: '/membership-checkout/[creatorId]' as any, params: { creatorId } })
  }

  return (
    <View style={styles.container}>
      {/* 共有・インデックス防止 */}
      {Platform.OS === 'web' && (
        <Head>
          <meta name="robots" content="noindex, nofollow" />
          <meta name="twitter:card" content="none" />
        </Head>
      )}

      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace(`/creator/${creatorId}` as any)} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>メンバーシップ</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* 閉鎖予定警告バナー */}
        {profile.membership_close_date && (
          <View style={styles.closeWarningBanner}>
            <Ionicons name="warning" size={18} color="#D32F2F" />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.closeWarningTitle}>このメンバーシップは終了予定です</Text>
              <Text style={styles.closeWarningBody}>
                <Text style={styles.closeWarningDate}>{formatDate(profile.membership_close_date)}</Text>
                {' '}に閉鎖が予定されています。加入後1ヶ月以内に終了する可能性があります。
              </Text>
            </View>
          </View>
        )}

        {/* クリエーター情報 + 料金 */}
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

        {/* 加入ページのメッセージ（料金と特典の間） */}
        {profile.membership_description ? (
          <View style={styles.pageMessageBox}>
            <Text style={styles.pageMessageText}>{profile.membership_description}</Text>
          </View>
        ) : null}

        {/* 特典 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>メンバーシップ特典</Text>
          <View style={styles.benefitsList}>
            {benefits.map((b, i) => (
              <View key={i} style={[styles.benefitRow, i > 0 && styles.benefitDivider]}>
                <View style={styles.benefitIcon}>
                  <Ionicons name={b.icon as any} size={20} color={Colors.accent} />
                </View>
                <View style={styles.benefitText}>
                  <Text style={styles.benefitTitle}>{b.title}</Text>
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

        {/* 著作権・無断使用禁止 */}
        <View style={styles.legalBox}>
          <View style={styles.legalHeader}>
            <Ionicons name="shield-checkmark" size={14} color="#8B4513" />
            <Text style={styles.legalTitle}>コンテンツの取り扱いについて</Text>
          </View>
          <Text style={styles.legalText}>
            本メンバーシップ内のコンテンツ（テキスト・画像・動画等）は著作権法により保護されています。{'\n\n'}
            メンバーシップ内のコンテンツを無断で転載・複製・スクリーンショット・二次配布・他サイトへの掲載等を行うことは禁止します。{'\n\n'}
            違反が確認された場合、著作権法に基づく法的措置を取ることがあります。
          </Text>
        </View>
      </ScrollView>

      {/* 加入ボタン（固定フッター）— オーナーには非表示 */}
      {!isOwner && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.joinBtn} onPress={handleJoin} activeOpacity={0.85}>
            <Ionicons name="star" size={18} color={Colors.white} />
            <Text style={styles.joinBtnText}>加入する  ¥{price.toLocaleString()}/月</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
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

  // 加入ページメッセージ（料金と特典の間）
  pageMessageBox: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 16,
  },
  pageMessageText: { fontSize: 14, color: Colors.text, lineHeight: 22 },

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

  noticeBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.white, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  noticeText: { flex: 1, fontSize: 12, color: Colors.textLight, lineHeight: 18 },

  legalBox: {
    backgroundColor: '#FDF6EE', borderRadius: 12, padding: 14, gap: 10,
    borderWidth: 1, borderColor: '#F0DCBB',
  },
  legalHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legalTitle: { fontSize: 12, fontWeight: '700', color: '#8B4513' },
  legalText: { fontSize: 11, color: '#6B4C2A', lineHeight: 18 },

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
  joinBtn: {
    backgroundColor: Colors.accent, borderRadius: 14,
    paddingVertical: 16, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  joinBtnText: { fontSize: 16, fontWeight: '800', color: Colors.white },
})
