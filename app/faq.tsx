import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/colors'

const FAQS = [
  { q: 'Reachは無料で使えますか？', a: 'はい、現在お試し期間中のため全機能を無料でご利用いただけます。' },
  { q: 'フォローするとどうなりますか？', a: 'フォローしたクリエイターの配信がトーク画面に届くようになります。フォロワー限定コンテンツも受け取れます。' },
  { q: 'フォローを解除するにはどうすればいいですか？', a: 'クリエイターのプロフィールページからフォロー解除ができます。解除後は新しい配信が届かなくなります。' },
  { q: 'DMはクリエイター以外に見られますか？', a: 'いいえ。DMはクリエイターとあなたの間だけで共有されます。第三者には公開されません。' },
  { q: '通知が来ません。どうすればいいですか？', a: 'デバイスの設定からReachの通知を許可してください。また、アプリの設定でも通知のオン/オフを確認できます。' },
  { q: 'タイルメニューとは何ですか？', a: 'トーク画面の下部に表示されるボタンメニューです。クリエイターが設定したリンクや自動返信ボタンが並んでいます。' },
  { q: 'アカウントを削除するにはどうすればいいですか？', a: 'マイページの設定からアカウント削除の申請ができます。削除後はデータの復元はできませんのでご注意ください。' },
  { q: '困ったときはどこに問い合わせできますか？', a: 'マイページの「お問い合わせ」からご連絡ください。通常2〜3営業日以内にご返信します。' },
]

export default function FaqScreen() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/mypage' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>よくある質問</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {FAQS.map((faq, i) => {
          const isOpen = openIndex === i
          return (
            <View key={i} style={styles.item}>
              <TouchableOpacity
                style={styles.question}
                onPress={() => setOpenIndex(isOpen ? null : i)}
                activeOpacity={0.7}
              >
                <View style={styles.qBadge}>
                  <Text style={styles.qBadgeText}>Q</Text>
                </View>
                <Text style={styles.qText}>{faq.q}</Text>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textLight} />
              </TouchableOpacity>
              {isOpen && (
                <View style={styles.answer}>
                  <View style={[styles.qBadge, styles.aBadge]}>
                    <Text style={[styles.qBadgeText, styles.aBadgeText]}>A</Text>
                  </View>
                  <Text style={styles.aText}>{faq.a}</Text>
                </View>
              )}
            </View>
          )
        })}

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
  content: { padding: 20, paddingBottom: 48, gap: 10 },
  item: { backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  question: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  qBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  qBadgeText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
  qText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text, lineHeight: 20 },
  answer: { flexDirection: 'row', gap: 12, padding: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.background, alignItems: 'flex-start' },
  aBadge: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  aBadgeText: { color: Colors.textLight },
  aText: { flex: 1, fontSize: 13, color: Colors.textLight, lineHeight: 21 },
  versionRow: { alignItems: 'center', marginTop: 8 },
  versionText: { fontSize: 12, color: Colors.border },
})
