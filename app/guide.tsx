import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/colors'

const STEPS = [
  { step: '1', title: 'アカウントを作成する', desc: 'メールアドレスとパスワードで登録します。登録後すぐに使い始められます。', icon: 'person-add-outline' as const },
  { step: '2', title: 'クリエイターをフォローする', desc: 'お気に入りのクリエイターのプロフィールページからフォローします。フォロー後、配信が届くようになります。', icon: 'heart-outline' as const },
  { step: '3', title: '配信を受け取る', desc: 'クリエイターが配信するとトーク画面に届きます。テキスト・画像・動画など様々な形式に対応しています。', icon: 'notifications-outline' as const },
  { step: '4', title: '配信にいいねとコメントをしてみよう', desc: '配信メッセージを長押しするといいね・コメントができます。クリエイターに気持ちを伝えてみましょう。', icon: 'heart-circle-outline' as const },
  { step: '5', title: 'DMで直接やり取りする', desc: 'クリエイターとダイレクトメッセージでやり取りできます。質問や感想を気軽に送りましょう。', icon: 'chatbubble-ellipses-outline' as const },
]

const TOOLS = [
  { icon: 'radio-outline' as const, title: 'トーク（配信）', desc: 'クリエイターからの配信がここに届きます。テキスト・画像・動画など様々な形式に対応しています。フォロワー全員に確実に届くのが特徴です。' },
  { icon: 'chatbubble-ellipses-outline' as const, title: 'ダイレクトメッセージ', desc: 'クリエイターと1対1でやり取りできます。質問・感想・相談など、気軽にメッセージを送りましょう。内容はあなたとクリエイターだけが見られます。' },
  { icon: 'grid-outline' as const, title: 'タイルメニュー', desc: 'トーク画面の下部に表示されるボタンメニューです。クリエイターが設定したリンクや自動返信ボタンが並んでいます。タップするだけで簡単に使えます。' },
  { icon: 'person-outline' as const, title: 'プロフィール', desc: 'クリエイターのプロフィールページからフォロー・フォロー解除ができます。過去の配信を確認することもできます。' },
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
        <View style={styles.conceptCard}>
          <Text style={styles.conceptText}>
            Reachの基本的な使い方を説明します。{'\n\n'}
            アカウントを作成してクリエイターをフォローするだけで、すぐに配信を受け取れます。
          </Text>
        </View>

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
                  <View style={styles.featureIconWrap}>
                    <Ionicons name={s.icon} size={18} color={Colors.accent} />
                  </View>
                  <Text style={styles.stepTitle}>{s.title}</Text>
                </View>
                <Text style={styles.stepDesc}>{s.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>ツール説明</Text>
        <View style={styles.toolList}>
          {TOOLS.map((t) => (
            <View key={t.title} style={styles.toolCard}>
              <View style={styles.toolTitleRow}>
                <View style={styles.featureIconWrap}>
                  <Ionicons name={t.icon} size={22} color={Colors.accent} />
                </View>
                <Text style={styles.featureTitle}>{t.title}</Text>
              </View>
              <Text style={styles.toolDesc}>{t.desc}</Text>
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
  conceptCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: Colors.border },
  conceptText: { fontSize: 14, color: Colors.text, lineHeight: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textLight, letterSpacing: 0.5 },
  stepList: { gap: 0 },
  stepRow: { flexDirection: 'row', gap: 12 },
  stepLeft: { alignItems: 'center', width: 28 },
  stepBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepBadgeText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
  stepLine: { width: 2, flex: 1, backgroundColor: Colors.border, marginVertical: 4 },
  stepCard: { flex: 1, backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 10, gap: 8, borderWidth: 1, borderColor: Colors.border },
  stepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepTitle: { fontSize: 13, fontWeight: '700', color: Colors.text, flex: 1 },
  stepDesc: { fontSize: 12, color: Colors.textLight, lineHeight: 18 },
  featureIconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  featureTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  toolList: { gap: 10 },
  toolCard: { backgroundColor: Colors.white, borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: Colors.border },
  toolTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toolDesc: { fontSize: 13, color: Colors.textLight, lineHeight: 21 },
  versionRow: { alignItems: 'center', marginTop: 4 },
  versionText: { fontSize: 12, color: Colors.border },
})
