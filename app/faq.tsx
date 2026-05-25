import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/colors'

const FAQS = [
  {
    category: '通知・配信',
    items: [
      {
        q: '通知が届きません',
        a: '設定画面でプッシュ通知がオンになっているか確認してください。また、お使いの端末の設定アプリからReachの通知が許可されているかもご確認ください。',
      },
      {
        q: 'フォローしたのに配信が届きません',
        a: 'ホーム画面を下に引っ張って更新してみてください。クリエイターが配信を行っていない場合は何も表示されません。',
      },
    ],
  },
  {
    category: 'アカウント',
    items: [
      {
        q: 'パスワードを忘れました',
        a: 'ログイン画面でメールアドレスを入力すると確認コードが送られます。コードでログイン後、設定からパスワードを変更できます。',
      },
      {
        q: 'メールアドレスを変更したい',
        a: '現在、メールアドレスの変更はサポートにお問い合わせいただく必要があります。お問い合わせフォームよりご連絡ください。',
      },
      {
        q: 'アカウントを削除したい',
        a: '設定画面の一番下にある「アカウントを削除する」から手続きができます。削除すると投稿・フォロー情報を含む全データが完全に削除されます。',
      },
    ],
  },
  {
    category: '料金・プラン',
    items: [
      {
        q: 'フォロワーとして利用するのに料金はかかりますか？',
        a: 'フォロワーとしての利用は完全無料です。配信を受け取ったり、コメント・リアクションをするのに料金はかかりません。',
      },
      {
        q: 'クリエイターとして配信するには料金がかかりますか？',
        a: '現在はお試し期間中につき、全機能を無料でご利用いただけます。正式リリース後に料金プランが適用される予定です。',
      },
    ],
  },
  {
    category: 'その他',
    items: [
      {
        q: '複数アカウントを持てますか？',
        a: '1人につき1アカウントのご利用をお願いしています。複数アカウントの作成は利用規約違反となる場合があります。',
      },
      {
        q: '不適切なコンテンツを見つけた',
        a: '配信・コメント画面の右上メニューから通報できます。確認のうえ適切に対処いたします。',
      },
    ],
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <TouchableOpacity
      style={styles.faqItem}
      onPress={() => setOpen(v => !v)}
      activeOpacity={0.7}
    >
      <View style={styles.faqQ}>
        <Text style={styles.qMark}>Q</Text>
        <Text style={styles.qText}>{q}</Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={Colors.textLight}
        />
      </View>
      {open && (
        <View style={styles.faqA}>
          <Text style={styles.aMark}>A</Text>
          <Text style={styles.aText}>{a}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

export default function FaqScreen() {
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
        {FAQS.map((cat) => (
          <View key={cat.category} style={styles.category}>
            <Text style={styles.categoryLabel}>{cat.category}</Text>
            <View style={styles.card}>
              {cat.items.map((item, i) => (
                <View key={i}>
                  {i > 0 && <View style={styles.divider} />}
                  <FaqItem q={item.q} a={item.a} />
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.note}>
          解決しない場合はお問い合わせフォームよりご連絡ください。
        </Text>
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
  content: { padding: 16, paddingBottom: 48, gap: 20 },
  category: { gap: 8 },
  categoryLabel: { fontSize: 12, fontWeight: '700', color: Colors.textLight, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: Colors.border },
  faqItem: { padding: 16 },
  faqQ: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qMark: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.accent,
    color: Colors.white,
    fontWeight: '800', fontSize: 12,
    textAlign: 'center', lineHeight: 22,
    flexShrink: 0,
  },
  qText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
  faqA: { flexDirection: 'row', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.background },
  aMark: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.button,
    color: Colors.white,
    fontWeight: '800', fontSize: 12,
    textAlign: 'center', lineHeight: 22,
    flexShrink: 0,
  },
  aText: { flex: 1, fontSize: 13, color: Colors.textLight, lineHeight: 20 },
  note: { fontSize: 13, color: Colors.textLight, textAlign: 'center', lineHeight: 20 },
})
