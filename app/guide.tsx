import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/colors'

const STEPS = [
  {
    step: '1',
    title: 'アカウントを作成する',
    desc: 'メールアドレスとパスワードで登録します。登録後すぐに使い始められます。',
    icon: 'person-add-outline' as const,
  },
  {
    step: '2',
    title: 'クリエイターをフォローする',
    desc: 'お気に入りのクリエイターのプロフィールページからフォローします。フォロー後、配信が届くようになります。',
    icon: 'heart-outline' as const,
  },
  {
    step: '3',
    title: '配信を受け取る',
    desc: 'クリエイターが配信するとトーク画面に届きます。テキスト・画像・動画など様々な形式に対応しています。',
    icon: 'notifications-outline' as const,
  },
  {
    step: '4',
    title: 'DMで直接やり取りする',
    desc: 'クリエイターとダイレクトメッセージでやり取りできます。質問や感想を気軽に送りましょう。',
    icon: 'chatbubble-ellipses-outline' as const,
  },
  {
    step: '5',
    title: 'タイルメニューを活用する',
    desc: 'トーク画面下部のタイルメニューからリンクや自動返信ボタンを使えます。',
    icon: 'grid-outline' as const,
  },
]

const TIPS = [
  { icon: 'shield-checkmark-outline' as const, text: 'フォロワー限定の配信はフォロー後に届きます' },
  { icon: 'bell-outline' as const, text: '配信の通知はデバイスの設定から変更できます' },
  { icon: 'lock-closed-outline' as const, text: 'DMの内容はクリエイターとあなただけが見られます' },
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
        <Text style={styles.lead}>Reachの基本的な使い方を説明します。</Text>

        <Text style={styles.sectionTitle}>はじめ方</Text>
        <View style={styles.stepList}>
          {STEPS.map((s, idx) => (
            <View key={s.step} style={styles.stepRow}>
              <View style={styles.stepLeft}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>{s.step}</Text>
                </View>
                {idx < STEPS.length - 1 && <View style={styles.stepLine} />}
              </View>
              <View style={styles.stepCard}>
                <View style={styles.stepTitleRow}>
                  <Ionicons name={s.icon} size={18} color={Colors.accent} />
                  <Text style={styles.stepTitle}>{s.title}</Text>
                </View>
                <Text style={styles.stepDesc}>{s.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>知っておくと便利</Text>
        <View style={styles.tipsCard}>
          {TIPS.map((t, i) => (
            <View key={i} style={[styles.tipRow, i < TIPS.length - 1 && styles.tipBorder]}>
              <Ionicons name={t.icon} size={18} color={Colors.accent} />
              <Text style={styles.tipText}>{t.text}</Text>
            </View>
          ))}
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
  content: { padding: 20, paddingBottom: 48, gap: 16 },
  lead: { fontSize: 14, color: Colors.textLight, lineHeight: 22 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textLight, letterSpacing: 0.5, marginTop: 4 },
  stepList: { gap: 0 },
  stepRow: { flexDirection: 'row', gap: 12 },
  stepLeft: { alignItems: 'center', width: 28 },
  stepBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepBadgeText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
  stepLine: { width: 2, flex: 1, backgroundColor: Colors.border, marginVertical: 4 },
  stepCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 14,
    padding: 14, marginBottom: 10, gap: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  stepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  stepDesc: { fontSize: 13, color: Colors.textLight, lineHeight: 20 },
  tipsCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  tipBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  tipText: { fontSize: 13, color: Colors.text, flex: 1, lineHeight: 20 },
})
