import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

type AnnTag = 'お知らせ' | '新機能' | 'アップデート'
type NewsItem = { id: string; tag: AnnTag; title: string; body: string; created_at: string }

// 過去の固定ニュース（DB移行前の履歴として残す）
const LEGACY_NEWS: NewsItem[] = [
  { id: 'legacy-4', tag: 'アップデート', title: 'デスクトップ対応',     body: 'PCブラウザからもReachをご利用いただけるようになりました。2カラムレイアウトで快適に操作できます。',                              created_at: '2026-05-01T00:00:00Z' },
  { id: 'legacy-3', tag: '新機能',       title: 'フロー配信・自動化',   body: 'フォロー後に自動で配信を送るフロー配信機能をリリースしました。クリエイターの配信効率が大幅に向上します。',                      created_at: '2026-05-01T00:00:01Z' },
  { id: 'legacy-2', tag: '新機能',       title: 'タイルメニュー機能',   body: 'クリエイターがフォロワー向けにカスタムメニューを設置できるタイル機能をリリースしました。',                                        created_at: '2026-05-01T00:00:02Z' },
  { id: 'legacy-1', tag: 'お知らせ',     title: 'Reachサービス開始',   body: 'Reachのサービスを開始しました。お試し期間中はプロプランの全機能を無料でご利用いただけます。',                                    created_at: '2026-05-01T00:00:03Z' },
]

const TAG_COLORS: Record<string, string> = {
  アップデート: Colors.button,
  お知らせ:     Colors.textLight,
  新機能:       Colors.accent,
}

export default function NewsScreen() {
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)

  useFocusEffect(useCallback(() => {
    supabase
      .from('announcements')
      .select('id, tag, title, body, created_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        // DBのニュース（新しい順）+ 過去の固定ニュースを結合
        setItems([...(data ?? []) as NewsItem[], ...LEGACY_NEWS])
        setLoading(false)
      })
  }, []))

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}年${d.getMonth() + 1}月`
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>最新情報</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <Ionicons name="newspaper-outline" size={40} color={Colors.border} />
          <Text style={{ color: Colors.textLight, fontSize: 14 }}>まだ情報はありません</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {items.map((item, i) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.timelineLeft}>
                <View style={styles.dot} />
                {i < items.length - 1 && <View style={styles.line} />}
              </View>
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.tag, { backgroundColor: TAG_COLORS[item.tag] ?? Colors.textLight }]}>
                    <Text style={styles.tagText}>{item.tag ?? 'お知らせ'}</Text>
                  </View>
                  <Text style={styles.date}>{formatDate(item.created_at)}</Text>
                </View>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
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
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: Colors.text },
  content: { padding: 20, paddingBottom: 48 },
  row: { flexDirection: 'row', gap: 12 },
  timelineLeft: { alignItems: 'center', width: 16 },
  dot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.accent,
    marginTop: 18, flexShrink: 0,
  },
  line: { width: 2, flex: 1, backgroundColor: Colors.border, marginTop: 4 },
  card: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 14,
    padding: 16, marginBottom: 12, gap: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  tagText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  date: { fontSize: 12, color: Colors.textLight },
  title: { fontSize: 15, fontWeight: '700', color: Colors.text },
  body: { fontSize: 13, color: Colors.textLight, lineHeight: 20 },
})
