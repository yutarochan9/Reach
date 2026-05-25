import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/colors'

const STEPS = [
  {
    icon: 'compass-outline' as const,
    title: 'クリエイターを探す',
    desc: '「発見」タブからお気に入りのクリエイターを検索してフォローしましょう。フォローすると配信が届くようになります。',
  },
  {
    icon: 'radio-outline' as const,
    title: '配信を受け取る',
    desc: 'フォローしたクリエイターの配信はホーム画面に届きます。テキスト・画像・動画など様々な形式で受け取れます。',
  },
  {
    icon: 'heart-outline' as const,
    title: 'リアクション・コメント',
    desc: '配信にハートなどのリアクションを送ったり、コメントでクリエイターと交流できます。',
  },
  {
    icon: 'chatbubble-outline' as const,
    title: 'クリエイターにDMを送る',
    desc: 'メッセージタブからクリエイターに直接DMを送ることができます。個別のやり取りが可能です。',
  },
  {
    icon: 'notifications-outline' as const,
    title: '通知をオンにする',
    desc: '設定から通知をオンにしておくと、新しい配信を見逃しません。端末の通知設定も確認してください。',
  },
]

export default function GuideScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>使い方ガイド</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Ionicons name="sparkles" size={36} color={Colors.accent} />
          <Text style={styles.heroTitle}>Reachへようこそ</Text>
          <Text style={styles.heroDesc}>クリエイターの配信をリアルタイムで受け取れるアプリです。{'\n'}基本的な使い方を5ステップでご紹介します。</Text>
        </View>

        {STEPS.map((step, i) => (
          <View key={i} style={styles.stepCard}>
            <View style={styles.stepLeft}>
              <View style={styles.stepNumWrap}>
                <Text style={styles.stepNum}>{i + 1}</Text>
              </View>
              {i < STEPS.length - 1 && <View style={styles.stepLine} />}
            </View>
            <View style={styles.stepBody}>
              <View style={styles.stepIconWrap}>
                <Ionicons name={step.icon} size={20} color={Colors.accent} />
              </View>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepDesc}>{step.desc}</Text>
            </View>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>ご不明な点はよくある質問もご覧ください</Text>
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
  content: { padding: 20, paddingBottom: 48 },
  hero: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  heroDesc: { fontSize: 14, color: Colors.textLight, textAlign: 'center', lineHeight: 22 },
  stepCard: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  stepLeft: {
    alignItems: 'center',
    width: 32,
  },
  stepNumWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  stepNum: { color: Colors.white, fontWeight: '800', fontSize: 14 },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.border,
    marginTop: 4,
    marginBottom: 4,
    minHeight: 24,
  },
  stepBody: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  stepTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  stepDesc: { fontSize: 13, color: Colors.textLight, lineHeight: 20 },
  footer: { alignItems: 'center', marginTop: 8 },
  footerText: { fontSize: 13, color: Colors.textLight },
})
