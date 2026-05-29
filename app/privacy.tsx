import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/colors'

const LAST_UPDATED = '2026年5月24日'
const SERVICE_NAME = 'Reach'
const COMPANY = 'Reach運営事務局'
const CONTACT_X = '@Reach_X_PR'
const CONTACT_X_URL = 'https://x.com/Reach_X_PR'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function Body({ children }: { children: string }) {
  return <Text style={styles.body}>{children}</Text>
}

function Item({ n, children }: { n: number; children: string }) {
  return (
    <View style={styles.itemRow}>
      <Text style={styles.itemNum}>（{n}）</Text>
      <Text style={styles.itemText}>{children}</Text>
    </View>
  )
}

export default function PrivacyScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/mypage' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>プライバシーポリシー</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>最終更新日：{LAST_UPDATED}</Text>

        <Body>
          {`${COMPANY}（以下「当社」）は、${SERVICE_NAME}（以下「本サービス」）における利用者の個人情報の取扱いについて、以下のとおりプライバシーポリシー（以下「本ポリシー」）を定めます。`}
        </Body>

        <Section title="第1条　取得する情報">
          <Body>当社は、本サービスの提供にあたり、以下の情報を取得します。</Body>
          <Item n={1}>メールアドレス、パスワード（ハッシュ化して保存）</Item>
          <Item n={2}>表示名、プロフィール画像、自己紹介文</Item>
          <Item n={3}>投稿・配信コンテンツ、いいね・フォローなどの行動履歴</Item>
          <Item n={4}>デバイス情報（機種、OS、プッシュ通知トークン）</Item>
          <Item n={5}>アクセスログ（IPアドレス、ブラウザ情報、参照URL）</Item>
          <Item n={6}>Cookie・ローカルストレージに保存される設定情報</Item>
          <Item n={7}>お問い合わせ内容</Item>
        </Section>

        <Section title="第2条　利用目的">
          <Body>取得した情報は、以下の目的のために利用します。</Body>
          <Item n={1}>本サービスの提供・運営・改善</Item>
          <Item n={2}>ユーザー認証およびアカウント管理</Item>
          <Item n={3}>プッシュ通知の送信</Item>
          <Item n={4}>不正利用・規約違反の検知および対応</Item>
          <Item n={5}>利用状況の分析によるサービス改善（同意いただいた場合のみ）</Item>
          <Item n={6}>お問い合わせへの対応</Item>
          <Item n={7}>法令に基づく対応</Item>
        </Section>

        <Section title="第3条　Cookieの使用について">
          <Body>
            本サービスでは、以下の目的でCookieおよびローカルストレージを使用します。
          </Body>
          <Item n={1}>【必須】ログイン状態の維持・セッション管理</Item>
          <Item n={2}>【必須】Cookie同意状態の保存</Item>
          <Item n={3}>【分析・任意】サービス利用状況の分析（Sentry）</Item>
          <Body>
            {'\n'}分析目的のCookieは、ご同意いただいた場合のみ使用します。ブラウザの設定からCookieを無効にすることもできますが、一部機能が利用できなくなる場合があります。
          </Body>
        </Section>

        <Section title="第4条　第三者提供">
          <Body>
            当社は、以下のいずれかに該当する場合を除き、取得した個人情報を第三者に提供しません。
          </Body>
          <Item n={1}>ご本人の同意がある場合</Item>
          <Item n={2}>法令に基づく開示要請がある場合</Item>
          <Item n={3}>人の生命・身体・財産の保護のために必要な場合</Item>
          <Body>{'\n'}なお、本サービスでは以下のサービスに情報処理を委託しています。</Body>
          <Item n={1}>Supabase, Inc.（データベース・認証・ストレージ）</Item>
          <Item n={2}>Sentry（エラー監視・同意いただいた場合のみ）</Item>
          <Item n={3}>Vercel, Inc.（ホスティング）</Item>
        </Section>

        <Section title="第5条　データの保存期間">
          <Body>
            アカウントが有効な期間中、取得した情報を保存します。退会後は、法令で定められた期間を除き、速やかに削除します。
          </Body>
        </Section>

        <Section title="第6条　安全管理措置">
          <Body>
            当社は、個人情報の漏えい・滅失・毀損を防止するため、適切な安全管理措置を講じます。パスワードは暗号化して保存し、通信にはTLS暗号化を使用します。
          </Body>
        </Section>

        <Section title="第7条　ユーザーの権利">
          <Body>ユーザーは、自身の個人情報について以下の権利を有します。</Body>
          <Item n={1}>開示・訂正・削除の請求</Item>
          <Item n={2}>利用停止の請求</Item>
          <Item n={3}>Cookie同意の撤回（設定画面から変更可能）</Item>
          <Body>{'\n'}請求はお問い合わせフォームまたは下記連絡先よりお申し出ください。</Body>
        </Section>

        <Section title="第8条　未成年者の利用">
          <Body>
            本サービスは13歳以上を対象としています。13歳未満の方は保護者の同意を得たうえでご利用ください。
          </Body>
        </Section>

        <Section title="第9条　ポリシーの変更">
          <Body>
            当社は、法令の変更やサービスの改善に伴い、本ポリシーを変更することがあります。重要な変更がある場合は、本サービス内でお知らせします。変更後も継続してご利用いただいた場合、変更後のポリシーに同意したものとみなします。
          </Body>
        </Section>

        <Section title="第10条　お問い合わせ">
          <Body>{`本ポリシーに関するお問い合わせは、以下の窓口までご連絡ください。\n\n${COMPANY}`}</Body>
          <TouchableOpacity onPress={() => Linking.openURL(CONTACT_X_URL)}>
            <Text style={styles.contactLink}>X（DM）：{CONTACT_X}</Text>
          </TouchableOpacity>
        </Section>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  content: { padding: 20, gap: 4, paddingBottom: 48 },
  updated: { fontSize: 12, color: Colors.textLight, marginBottom: 12 },
  section: { marginTop: 20, gap: 6 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  body: { fontSize: 13, color: Colors.text, lineHeight: 22 },
  itemRow: { flexDirection: 'row', gap: 4, paddingLeft: 4 },
  itemNum: { fontSize: 13, color: Colors.textLight, minWidth: 36 },
  itemText: { fontSize: 13, color: Colors.text, lineHeight: 22, flex: 1 },
  contactLink: { fontSize: 13, color: '#1D9BF0', textDecorationLine: 'underline', marginTop: 4 },
})
