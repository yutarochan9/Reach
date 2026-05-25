import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/colors'

const FEATURES = [
  {
    icon: 'radio-outline' as const,
    title: 'リアルタイム配信',
    desc: 'テキスト・画像・動画をフォロワーへ即時に届けられます。',
  },
  {
    icon: 'chatbubble-ellipses-outline' as const,
    title: 'ダイレクトメッセージ',
    desc: 'クリエイターとフォロワーが1対1でやり取りできます。',
  },
  {
    icon: 'git-branch-outline' as const,
    title: 'フロー配信',
    desc: 'フォロー後の自動メッセージなど、配信を自動化できます。',
  },
  {
    icon: 'pricetag-outline' as const,
    title: 'セグメント配信',
    desc: 'タグで絞り込み、特定のファンだけに届ける配信が可能です。',
  },
  {
    icon: 'grid-outline' as const,
    title: 'タイルメニュー',
    desc: 'クリエイター独自のメニューをトーク画面に設置できます。',
  },
  {
    icon: 'bar-chart-outline' as const,
    title: '詳細分析',
    desc: '閲覧数・リアクション数など配信の効果を数値で把握できます。',
  },
]

export default function AboutScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
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
          <Text style={styles.heroTagline}>クリエイターとファンをつなぐ、{'\n'}次世代の配信プラットフォーム</Text>
        </View>

        {/* コンセプト */}
        <View style={styles.conceptCard}>
          <Text style={styles.conceptText}>
            Reachは、クリエイターが自分のファンに直接・確実に情報を届けるためのアプリです。{'\n\n'}
            SNSのアルゴリズムに左右されることなく、フォロワー全員に配信が届きます。シンプルな操作で、すぐに使い始められます。
          </Text>
        </View>

        {/* 機能一覧 */}
        <Text style={styles.sectionTitle}>主な機能</Text>
        <View style={styles.featureGrid}>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.featureCard}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={f.icon} size={22} color={Colors.accent} />
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
  hero: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  logo: { width: 72, height: 72, borderRadius: 18 },
  heroTitle: { fontSize: 28, fontWeight: '800', color: Colors.text, letterSpacing: 1 },
  heroTagline: { fontSize: 14, color: Colors.textLight, textAlign: 'center', lineHeight: 22 },
  conceptCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  conceptText: { fontSize: 14, color: Colors.text, lineHeight: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textLight, letterSpacing: 0.5 },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  featureCard: {
    width: '48%',
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  featureIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  featureTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  featureDesc: { fontSize: 12, color: Colors.textLight, lineHeight: 18 },
  versionRow: { alignItems: 'center', marginTop: 4 },
  versionText: { fontSize: 12, color: Colors.border },
})
