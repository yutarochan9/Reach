/**
 * landing.tsx
 *
 * reachapp.jp のトップランディングページ。
 * 未ログインの Web ユーザーが最初に訪れたときに表示される。
 * ログイン済みユーザーはホームへリダイレクトされる（_layout.tsx 側で制御）。
 */
import { useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, Dimensions, Animated, Image,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/colors'

const { width: SCREEN_W } = Dimensions.get('window')
const isWeb = Platform.OS === 'web'

// ── フィーチャーカード ────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: 'megaphone-outline' as const,
    title: '一斉ブロードキャスト',
    desc: 'クリエイターがファンへ直接メッセージを届ける新しいかたち。テキスト・画像・動画を一括配信。',
  },
  {
    icon: 'star-outline' as const,
    title: 'メンバーシップ',
    desc: '月額制のメンバーシップで、特別なコンテンツをファンに届け、安定した収益を実現。',
  },
  {
    icon: 'chatbubble-ellipses-outline' as const,
    title: '1対1メッセージ',
    desc: 'ファンとクリエイターが直接つながれるプライベートなメッセージ機能。',
  },
  {
    icon: 'bar-chart-outline' as const,
    title: '収益管理',
    desc: '売上・振込状況をリアルタイムで確認。毎月自動で銀行口座へ振り込み。',
  },
]

// ── ステップ ────────────────────────────────────────────────────────────────
const STEPS = [
  { num: '01', title: 'アカウントを作成', desc: 'メールアドレスで簡単に登録。無料ではじめられる。' },
  { num: '02', title: '配信を楽しむ', desc: '好きなクリエイターをフォローして配信を受け取る。メンバーシップに加入すれば、より深くつながれる。' },
  { num: '03', title: '配信してみる', desc: 'クリエイターとして一斉配信やメンバーシップを始める。ファンとの新しいつながりが生まれる。' },
]

export default function LandingPage() {
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(30)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

      {/* ── ヘッダー ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.logoWrap}>
          <Image source={require('../assets/icon.png')} style={styles.logoIcon} />
          <Text style={styles.logo}>Reach</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(auth)/login' as any)} style={styles.loginBtn}>
          <Text style={styles.loginBtnText}>ログイン</Text>
        </TouchableOpacity>
      </View>

      {/* ── ヒーロー ─────────────────────────────────────────── */}
      <Animated.View style={[styles.hero, { opacity: fadeAnim }]}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>クリエイター向けプラットフォーム</Text>
        </View>
        <Text style={styles.heroTitle}>
          クリエイターと{'\n'}ファンをつなぐ{'\n'}
          <Text style={styles.heroAccent}>新しいかたち</Text>
        </Text>
        <Text style={styles.heroDesc}>
          Reachは、クリエイターがファンへ直接届ける一斉配信・メンバーシップ・メッセージ機能を備えた日本発のプラットフォームです。
        </Text>
      </Animated.View>

      {/* ── 機能紹介 ─────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>FEATURES</Text>
        <Text style={styles.sectionTitle}>Reachでできること</Text>
        <View style={styles.featuresGrid}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.featureCard}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={f.icon} size={26} color={Colors.accent} />
              </View>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.desc}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── はじめ方 ─────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>HOW IT WORKS</Text>
        <Text style={styles.sectionTitle}>3ステップではじめる</Text>
        <View style={styles.steps}>
          {STEPS.map((s, i) => (
            <View key={i} style={styles.step}>
              <Text style={styles.stepNum}>{s.num}</Text>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepDesc}>{s.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* ── CTA バナー ───────────────────────────────────────── */}
      <View style={styles.ctaBanner}>
        <Text style={styles.ctaBannerTitle}>今すぐはじめよう</Text>
        <Text style={styles.ctaBannerDesc}>登録は無料。クリエイターもファンも、すぐに使えます。</Text>
        <TouchableOpacity style={styles.ctaBannerBtn} onPress={() => router.push('/(auth)/signup' as any)}>
          <Text style={styles.ctaBannerBtnText}>無料で登録する</Text>
          <Ionicons name="arrow-forward" size={18} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      {/* ── フッター ─────────────────────────────────────────── */}
      <View style={styles.footer}>
        <Text style={styles.footerLogo}>Reach</Text>
        <View style={styles.footerLinks}>
          <TouchableOpacity onPress={() => router.push('/terms' as any)}>
            <Text style={styles.footerLink}>利用規約</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/privacy' as any)}>
            <Text style={styles.footerLink}>プライバシーポリシー</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/tokutei' as any)}>
            <Text style={styles.footerLink}>特定商取引法</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/contact' as any)}>
            <Text style={styles.footerLink}>お問い合わせ</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.footerCopy}>© 2026 Reach. All rights reserved.</Text>
      </View>

    </ScrollView>
  )
}

const MAX_W = 960

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { alignItems: 'center' },

  // Header
  header: {
    width: '100%', maxWidth: MAX_W,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 16,
  },
  logoWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoIcon: { width: 48, height: 48, borderRadius: 12 },
  logo: { fontSize: 36, fontWeight: '800', color: Colors.accent, letterSpacing: 1 },
  headerRight: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  loginBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  loginBtnText: { fontSize: 14, color: Colors.textLight, fontWeight: '600' },
  signupBtnSmall: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.accent,
  },
  signupBtnSmallText: { fontSize: 14, color: Colors.white, fontWeight: '700' },

  // Hero
  hero: {
    width: '100%', maxWidth: MAX_W,
    alignItems: 'center', paddingHorizontal: 24,
    paddingTop: 48, paddingBottom: 64,
  },
  badge: {
    backgroundColor: Colors.header, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
    marginBottom: 24, borderWidth: 1, borderColor: Colors.border,
  },
  badgeText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  heroTitle: {
    fontSize: isWeb ? 52 : 38, fontWeight: '900', color: Colors.text,
    textAlign: 'center', lineHeight: isWeb ? 64 : 48, marginBottom: 20,
  },
  heroAccent: { color: Colors.accent },
  heroDesc: {
    fontSize: 16, color: Colors.textLight, textAlign: 'center',
    lineHeight: 26, maxWidth: 540, marginBottom: 36,
  },
  ctaRow: { flexDirection: 'row', gap: 12, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'center' },
  ctaPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.accent, paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 30,
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  ctaPrimaryText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  ctaSecondary: {
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 30,
    borderWidth: 1.5, borderColor: Colors.accent,
  },
  ctaSecondaryText: { fontSize: 16, fontWeight: '700', color: Colors.accent },
  heroNote: { fontSize: 12, color: Colors.textLight },

  // Section
  section: { width: '100%', maxWidth: MAX_W, paddingHorizontal: 24, paddingVertical: 56 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: Colors.accent, letterSpacing: 2,
    marginBottom: 10, textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 28, fontWeight: '800', color: Colors.text,
    textAlign: 'center', marginBottom: 40,
  },

  // Features
  featuresGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center',
  },
  featureCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 24,
    width: isWeb ? 'calc(50% - 8px)' as any : '100%',
    minWidth: 280, maxWidth: 440,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8,
  },
  featureIconWrap: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  featureTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  featureDesc: { fontSize: 14, color: Colors.textLight, lineHeight: 22 },

  // Pricing
  pricingSection: { backgroundColor: Colors.header, borderRadius: 24, marginHorizontal: 24, width: undefined },
  pricingCard: {
    backgroundColor: Colors.white, borderRadius: 20, padding: 32,
    alignItems: 'center', maxWidth: 480, width: '100%', alignSelf: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12,
  },
  pricingTag: {
    fontSize: 12, fontWeight: '700', color: Colors.accent, letterSpacing: 1,
    backgroundColor: Colors.background, paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 10, marginBottom: 16,
  },
  pricingNum: { fontSize: 72, fontWeight: '900', color: Colors.accent, lineHeight: 80 },
  pricingUnit: { fontSize: 36, fontWeight: '700' },
  pricingDesc: {
    fontSize: 14, color: Colors.textLight, textAlign: 'center',
    lineHeight: 22, marginTop: 12, maxWidth: 360,
  },
  pricingDivider: { height: 1, backgroundColor: Colors.border, width: '100%', marginVertical: 24 },
  pricingList: { width: '100%', gap: 12 },
  pricingItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pricingItemText: { fontSize: 14, color: Colors.text, fontWeight: '500' },

  // Steps
  steps: { gap: 24 },
  step: {
    flexDirection: 'row', gap: 20, alignItems: 'flex-start',
    backgroundColor: Colors.white, borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: Colors.border,
  },
  stepNum: { fontSize: 28, fontWeight: '900', color: Colors.border, minWidth: 40 },
  stepContent: { flex: 1 },
  stepTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  stepDesc: { fontSize: 14, color: Colors.textLight, lineHeight: 22 },

  // CTA Banner
  ctaBanner: {
    width: '100%', maxWidth: MAX_W - 48,
    backgroundColor: Colors.accent, borderRadius: 24, padding: 40,
    alignItems: 'center', marginHorizontal: 24, marginBottom: 24,
  },
  ctaBannerTitle: { fontSize: 28, fontWeight: '800', color: Colors.white, marginBottom: 12 },
  ctaBannerDesc: { fontSize: 15, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginBottom: 28, lineHeight: 24 },
  ctaBannerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 30,
  },
  ctaBannerBtnText: { fontSize: 16, fontWeight: '700', color: Colors.accent },

  // Footer
  footer: {
    width: '100%', maxWidth: MAX_W,
    paddingHorizontal: 24, paddingVertical: 40,
    alignItems: 'center', gap: 16,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  footerLogo: { fontSize: 20, fontWeight: '800', color: Colors.accent },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, justifyContent: 'center' },
  footerLink: { fontSize: 13, color: Colors.textLight },
  footerCopy: { fontSize: 12, color: Colors.border },
})
