import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/colors'

type FaqSection = { section: string; items: { q: string; a: string }[] }

const SECTIONS: FaqSection[] = [
  {
    section: '基本的な使い方',
    items: [
      { q: 'Reachとは何ですか？', a: 'Reachは、クリエイターとファンをつなぐメッセージ配信プラットフォームです。クリエイターの投稿がアルゴリズムに埋もれることなく、フォロワー全員に確実に届くのが特徴です。' },
      { q: 'Reachは無料で使えますか？', a: 'はい、現在お試し期間中のため全機能を無料でご利用いただけます。将来的に有料プランが導入される場合は事前にお知らせします。' },
      { q: 'フォローするとどうなりますか？', a: 'フォローしたクリエイターの配信がトーク画面に届くようになります。フォロワー限定コンテンツやメンバーシップ限定配信も受け取れます。' },
      { q: 'フォローを解除するにはどうすればいいですか？', a: 'クリエイターのプロフィールページ右上のメニューからフォロー解除ができます。解除後は新しい配信が届かなくなります。過去の配信は引き続き閲覧できます。' },
      { q: '配信にいいねやコメントをするには？', a: '配信メッセージを長押しするといいね・コメントのメニューが表示されます。クリエイターに気持ちを伝えてみましょう。' },
    ],
  },
  {
    section: 'メンバーシップ',
    items: [
      { q: 'メンバーシップとは何ですか？', a: 'クリエイターが設定した月額料金を支払うことで、メンバーシップ限定の配信やコンテンツを受け取れる仕組みです。クリエイターへの継続的なサポートになります。' },
      { q: 'メンバーシップに加入するにはどうすればいいですか？', a: 'クリエイターのプロフィールページから「メンバーになる」ボタンをタップし、支払い情報を入力してください。加入後すぐに限定コンテンツを受け取れます。' },
      { q: 'メンバーシップを解約するにはどうすればいいですか？', a: 'マイページ→「加入中のメンバーシップ」から解約できます。解約後は次回更新日以降に限定コンテンツへのアクセスが終了します。' },
      { q: 'メンバーシップの料金はどのように支払いますか？', a: 'クレジットカード・デビットカードでの支払いに対応しています。毎月自動で更新されます。' },
    ],
  },
  {
    section: 'クリエイター向け',
    items: [
      { q: '誰でもクリエイターになれますか？', a: 'はい。アカウント登録後すぐに配信を作成できます。フォロワー向けの配信だけでなく、メンバーシップや自動応答など様々なツールを活用できます。' },
      { q: 'メンバーシップを設定するにはどうすればいいですか？', a: 'マイページ→「メンバーシップ設定」から月額料金と説明文を設定できます。Stripe連携が必要です。' },
      { q: '収益の振込はどのように行われますか？', a: 'Stripeと連携した口座に毎月振り込まれます。マイページ→「収益・振込」から状況を確認できます。' },
      { q: 'タイルメニューとは何ですか？', a: 'フォロワーのトーク画面の下部に表示されるボタンメニューです。リンク・自動返信・Reachの各ページへの誘導ボタンを自由に配置できます。マイページ→「タイル」から設定できます。' },
      { q: 'フロー配信とは何ですか？', a: 'フォロー後に自動で順番にメッセージを届けるシナリオ配信機能です。ウェルカムメッセージやステップごとのコンテンツ配信に活用できます。' },
    ],
  },
  {
    section: 'DM・メッセージ',
    items: [
      { q: 'DMはクリエイター以外に見られますか？', a: 'いいえ。DMはクリエイターとあなたの間だけで共有されます。第三者には公開されません。' },
      { q: 'DMを送ったのに返信がありません', a: 'クリエイターによっては返信に時間がかかる場合があります。クリエイターが自動応答を設定している場合は自動でメッセージが届くことがあります。' },
    ],
  },
  {
    section: 'アカウント・セキュリティ',
    items: [
      { q: '通知が来ません。どうすればいいですか？', a: 'デバイスの設定からReachの通知を許可してください。また、マイページ→「通知設定」でも通知のオン/オフを確認できます。アプリをホーム画面に追加（PWA）することで通知が届きやすくなります。' },
      { q: '新しいデバイスでログインできません', a: 'セキュリティのため、新しいデバイスでのログインには管理者の承認が必要な場合があります。承認されるまでしばらくお待ちください。' },
      { q: 'アカウントを削除するにはどうすればいいですか？', a: 'マイページ→設定→「アカウントを削除」から申請できます。削除後はデータの復元はできませんのでご注意ください。メンバーシップ加入中の場合は先に解約してください。' },
      { q: '不適切なコンテンツや嫌がらせを受けました', a: '配信やユーザーのプロフィールページの「報告」ボタンから通報できます。運営チームが確認し適切に対応します。' },
      { q: '困ったときはどこに問い合わせできますか？', a: 'マイページ→「お問い合わせ」からご連絡ください。通常2〜3営業日以内にご返信します。' },
    ],
  },
]

export default function FaqScreen() {
  const [openKey, setOpenKey] = useState<string | null>(null)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>よくある質問</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {SECTIONS.map(sec => (
          <View key={sec.section}>
            <Text style={styles.sectionLabel}>{sec.section}</Text>
            <View style={{ gap: 8 }}>
              {sec.items.map((faq, i) => {
                const key = `${sec.section}-${i}`
                const isOpen = openKey === key
                return (
                  <View key={key} style={styles.item}>
                    <TouchableOpacity
                      style={styles.question}
                      onPress={() => setOpenKey(isOpen ? null : key)}
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
            </View>
          </View>
        ))}

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
    paddingTop: 36, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: Colors.text },
  content: { padding: 20, paddingBottom: 48, gap: 20 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: Colors.textLight, letterSpacing: 0.5, marginBottom: 8 },
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
