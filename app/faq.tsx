import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/colors'

const FAQS = [
  {
    q: 'Reachは無料で使えますか？',
    a: 'はい、現在お試し期間中のため全機能を無料でご利用いただけます。',
  },
  {
    q: 'フォローするとどうなりますか？',
    a: 'フォローしたクリエイターの配信がトーク画面に届くようになります。フォロワー限定コンテンツも受け取れます。',
  },
  {
    q: 'フォローを解除するにはどうすればいいですか？',
    a: 'クリエイターのプロフィールページからフォロー解除ができます。解除後は新しい配信が届かなくなります。',
  },
  {
    q: 'DMはクリエイター以外に見られますか？',
    a: 'いいえ。DMはクリエイターとあなたの間だけで共有されます。第三者には公開されません。',
  },
  {
    q: '通知が来ません。どうすればいいですか？',
    a: 'デバイスの設定からReachの通知を許可してください。また、アプリの設定でも通知のオン/オフを確認できます。',
  },
  {
    q: 'タイルメニューとは何ですか？',
    a: 'トーク画面の下部に表示されるボタンメニューです。クリエイターが設定したリンクや自動返信ボタンが並んでいます。',
  },
  {
    q: 'アカウントを削除するにはどうすればいいですか？',
    a: 'マイページの設定からアカウント削除の申請ができます。削除後はデータの復元はできませんのでご注意ください。',
  },
  {
    q: '困ったときはどこに問い合わせできますか？',
    a: 'マイページの「お問い合わせ」からご連絡ください。通常2〜3営業日以内にご返信します。',
  },
]

export default function FaqScreen() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
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
                <Text style={styles.qLabel}>Q</Text>
                <Text style={styles.qText}>{faq.q}</Text>
                <Ionicons
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.textLight}
                />
              </TouchableOpacity>
              {isOpen && (
                <View style={styles.answer}>
                  <Text style={styles.aLabel}>A</Text>
                  <Text style={styles.aText}>{faq.a}</Text>
                </View>
              )}
            </View>
          )
        })}
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
  content: { padding: 16, paddingBottom: 48, gap: 8 },
  item: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  question: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 16,
  },
  qLabel: {
    fontSize: 15, fontWeight: '800', color: Colors.accent,
    width: 20, textAlign: 'center', flexShrink: 0,
  },
  qText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text, lineHeight: 20 },
  answer: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingBottom: 16, paddingTop: 2,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  aLabel: {
    fontSize: 15, fontWeight: '800', color: Colors.textLight,
    width: 20, textAlign: 'center', flexShrink: 0, marginTop: 12,
  },
  aText: { flex: 1, fontSize: 13, color: Colors.textLight, lineHeight: 21, marginTop: 12 },
})
