import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/colors'

type NewsItem = {
  date: string
  tag: 'アップデート' | 'お知らせ' | '新機能'
  title: string
  body: string
}

const TAG_COLORS: Record<NewsItem['tag'], string> = {
  アップデート: Colors.button,
  お知らせ: Colors.textLight,
  新機能: Colors.accent,
}

const NEWS: NewsItem[] = [
  {
    date: '2026年5月',
    tag: 'お知らせ',
    title: 'Reachサービス開始',
    body: 'Reachのサービスを開始しました。お試し期間中はプロプランの全機能を無料でご利用いただけます。',
  },
  {
    date: '2026年5月',
    tag: '新機能',
    title: 'タイルメニュー機能',
    body: 'クリエイターがフォロワー向けにカスタムメニューを設置できるタイル機能をリリースしました。',
  },
  {
    date: '2026年5月',
    tag: '新機能',
    title: 'フロー配信・自動化',
    body: 'フォロー後に自動で配信を送るフロー配信機能をリリースしました。クリエイターの配信効率が大幅に向上します。',
  },
  {
    date: '2026年5月',
    tag: '新機能',
    title: 'セグメント配信',
    body: 'タグを使って特定のフォロワーグループにだけ配信を届けるセグメント配信機能をリリースしました。',
  },
  {
    date: '2026年5月',
    tag: 'アップデート',
    title: 'デスクトップ対応',
    body: 'PCブラウザからもReachをご利用いただけるようになりました。2カラムレイアウトで快適に操作できます。',
  },
]

export default function NewsScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/home' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>最新情報</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {NEWS.map((item, i) => (
          <View key={i} style={styles.row}>
            <View style={styles.timelineLeft}>
              <View style={styles.dot} />
              {i < NEWS.length - 1 && <View style={styles.line} />}
            </View>
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.tag, { backgroundColor: TAG_COLORS[item.tag] }]}>
                  <Text style={styles.tagText}>{item.tag}</Text>
                </View>
                <Text style={styles.date}>{item.date}</Text>
              </View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
            </View>
          </View>
        ))}
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
  row: { flexDirection: 'row', gap: 12 },
  timelineLeft: { alignItems: 'center', width: 16 },
  dot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.accent,
    marginTop: 18,
    flexShrink: 0,
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.border,
    marginTop: 4,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 6,
  },
  tagText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  date: { fontSize: 12, color: Colors.textLight },
  title: { fontSize: 15, fontWeight: '700', color: Colors.text },
  body: { fontSize: 13, color: Colors.textLight, lineHeight: 20 },
})
