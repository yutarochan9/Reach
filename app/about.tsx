import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/colors'

const PILLARS = [
  {
    icon: 'checkmark-circle-outline' as const,
    title: '必ず届く',
    desc: 'アルゴリズムに左右されない。フォロワー全員に確実に、確認されるまで手元に残る。',
  },
  {
    icon: 'people-outline' as const,
    title: '誰でも配信できる',
    desc: 'アカウント登録してすぐ配信をスタート。特別なスキルや機材は一切不要。',
  },
  {
    icon: 'images-outline' as const,
    title: '多彩なコンテンツ',
    desc: 'テキスト・画像・動画を自由に組み合わせて、まとめて一斉送信できる。',
  },
]

const FEATURES = [
  { icon: 'flash-outline' as const, title: '自動応答', desc: 'キーワードに反応して自動でメッセージを返信。' },
  { icon: 'time-outline' as const, title: '予約配信', desc: '指定した日時に自動で配信をスタート。' },
  { icon: 'git-network-outline' as const, title: 'フロー配信', desc: 'シナリオを組んで順番に自動配信。' },
  { icon: 'pricetag-outline' as const, title: 'セグメント配信', desc: '特定のファンだけに絞って配信できる。' },
  { icon: 'grid-outline' as const, title: 'タイルメニュー', desc: '独自のメニューをトーク画面に設置。' },
  { icon: 'bar-chart-outline' as const, title: '分析', desc: '閲覧数・いいね・既読率をリアルタイムで確認。' },
]

export default function AboutScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/mypage' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reachとは</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* ヒーロー */}
        <View style={styles.hero}>
          <Image source={require('../assets/icon.png')} style={styles.logo} />
          <Text style={styles.heroTitle}>Reach</Text>
          <Text style={styles.heroTagline}>あなたの言葉を、確実にファンへ。</Text>
        </View>

        {/* キャッチ */}
        <View style={styles.catchCard}>
          <Text style={styles.catchText}>
            SNSでは、どれだけ良い投稿をしてもアルゴリズムに弾かれてファンに届かないことがある。
          </Text>
          <Text style={[styles.catchText, { marginTop: 10, fontWeight: '700', color: Colors.accent }]}>
            Reachは違います。{'\n'}フォロワー全員に、必ず届く。
          </Text>
        </View>

        {/* 3つの強み */}
        <Text style={styles.sectionTitle}>Reachが選ばれる理由</Text>
        <View style={styles.pillarList}>
          {PILLARS.map((p) => (
            <View key={p.title} style={styles.pillarCard}>
              <View style={styles.pillarIconWrap}>
                <Ionicons name={p.icon} size={24} color={Colors.accent} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.pillarTitle}>{p.title}</Text>
                <Text style={styles.pillarDesc}>{p.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* 機能一覧 */}
        <Text style={styles.sectionTitle}>主な機能</Text>
        <View style={styles.featureGrid}>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.featureCard}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={f.icon} size={20} color={Colors.accent} />
              </View>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.desc}</Text>
            </View>
          ))}
        </View>

        <View style={styles.versionRow}>
          <Text style={styles.versionText}>Reach — お試し期間中</Text>
        </View>
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
  content: { padding: 20, paddingBottom: 48, gap: 20 },

  hero: { alignItems: 'center', paddingVertical: 8, gap: 10 },
  logo: { width: 72, height: 72, borderRadius: 18 },
  heroTitle: { fontSize: 30, fontWeight: '800', color: Colors.text, letterSpacing: 1 },
  heroTagline: { fontSize: 15, color: Colors.textLight, textAlign: 'center', fontWeight: '500' },

  catchCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    padding: 20, borderWidth: 1, borderColor: Colors.border,
  },
  catchText: { fontSize: 14, color: Colors.text, lineHeight: 24 },

  sectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.textLight, letterSpacing: 0.8 },

  pillarList: { gap: 10 },
  pillarCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    backgroundColor: Colors.white, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: Colors.border,
  },
  pillarIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  pillarTitle: { fontSize: 15, fontWeight: '800', color: Colors.text },
  pillarDesc: { fontSize: 13, color: Colors.textLight, lineHeight: 20 },

  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  featureCard: {
    width: '47.5%', backgroundColor: Colors.white,
    borderRadius: 14, padding: 14, gap: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  featureIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  featureTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  featureDesc: { fontSize: 12, color: Colors.textLight, lineHeight: 18 },

  versionRow: { alignItems: 'center', marginTop: 4 },
  versionText: { fontSize: 12, color: Colors.border },
})
