import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/colors'

const LAST_UPDATED = '2026年6月2日'
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

export default function TermsScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/mypage' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>利用規約</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>最終更新日：{LAST_UPDATED}</Text>

        <Body>
          {`本利用規約（以下「本規約」）は、${COMPANY}（以下「当社」）が提供する${SERVICE_NAME}（以下「本サービス」）の利用条件を定めるものです。ユーザーの皆さまには、本規約に同意のうえ本サービスをご利用いただきます。`}
        </Body>

        <Section title="第1条　適用">
          <Body>
            本規約は、ユーザーと当社との間の本サービスの利用に関わる一切の関係に適用されます。当社が別途定める個別規定も本規約の一部を構成します。
          </Body>
        </Section>

        <Section title="第2条　アカウント登録">
          <Body>本サービスのアカウント登録にあたり、以下を確認・同意してください。</Body>
          <Item n={1}>登録情報は正確かつ最新の情報を提供すること</Item>
          <Item n={2}>1人につき1アカウントのみ登録できること</Item>
          <Item n={3}>アカウントの譲渡・売買は禁止されていること</Item>
          <Item n={4}>パスワードは自己の責任で管理すること</Item>
        </Section>

        <Section title="第3条　サービスの内容">
          <Body>
            本サービスは、クリエイターがフォロワーへ一斉配信・メッセージ送信できるプラットフォームです。当社は、ユーザーへの事前通知なくサービス内容を変更・追加・廃止することがあります。
          </Body>
        </Section>

        <Section title="第4条　利用資格・年齢制限">
          <Body>
            本サービスは、日本国内に居住する方を対象としています。未成年者（18歳未満）が本サービスを利用する場合は、保護者の同意が必要です。課金機能（サブスクリプション・メンバーシップ・開発支援金）を利用する場合は、保護者の同意を得たうえでご利用ください。当社は未成年者による保護者の同意を得ない課金について、一切の責任を負いません。
          </Body>
        </Section>

        <Section title="第5条　料金・課金・収益分配">
          <Body>本サービスにおける料金・課金・収益分配について以下のとおり定めます。</Body>
          <Item n={1}>クリエイタープランの月額料金は特定商取引法に基づく表記ページに記載の通りです（税込表示）。</Item>
          <Item n={2}>クリエイターが設定するメンバーシップ料金は¥500・¥1,000・¥3,000（各税込）から選択できます。</Item>
          <Item n={3}>メンバーシップ収益は、決済手数料を含むプラットフォーム手数料30%を差し引いた70%をクリエイターに支払います。</Item>
          <Item n={4}>サブスクリプションおよびメンバーシップは毎月自動更新されます。解約はいつでも設定画面から行え、次回更新日以降の請求は発生しません。</Item>
          <Item n={5}>デジタルコンテンツ・サービスの性質上、原則として返金には応じられません。ただし、当社の重大な瑕疵による場合はこの限りではありません。</Item>
          <Item n={6}>App Store・Google Play 経由の決済については、各ストアの規約・返金ポリシーが適用される場合があります。</Item>
        </Section>

        <Section title="第6条　禁止事項">
          <Body>ユーザーは以下の行為を行ってはなりません。</Body>
          <Item n={1}>法令または公序良俗に違反する行為</Item>
          <Item n={2}>他のユーザーへの誹謗中傷・ハラスメント・脅迫</Item>
          <Item n={3}>スパム・無差別な商業宣伝・フィッシング</Item>
          <Item n={4}>他者の知的財産権・プライバシーを侵害する行為</Item>
          <Item n={5}>本サービスへの不正アクセス・リバースエンジニアリング</Item>
          <Item n={6}>虚偽の情報を登録・拡散する行為</Item>
          <Item n={7}>未成年者に有害なコンテンツの投稿</Item>
          <Item n={8}>その他、当社が不適切と判断する行為</Item>
        </Section>

        <Section title="第7条　コンテンツの権利">
          <Body>
            ユーザーが本サービスに投稿したコンテンツの著作権はユーザーに帰属します。ただし、ユーザーは当社に対し、本サービスの運営・改善・プロモーションに必要な範囲で、無償・非独占的にコンテンツを利用する権利を許諾するものとします。
          </Body>
        </Section>

        <Section title="第8条　サービスの停止・中断">
          <Body>当社は以下の場合、ユーザーへの事前通知なくサービスを停止・中断できます。</Body>
          <Item n={1}>システムのメンテナンス・緊急対応</Item>
          <Item n={2}>天災・停電・通信障害などの不可抗力</Item>
          <Item n={3}>その他、運営上やむを得ない場合</Item>
        </Section>

        <Section title="第9条　利用制限・アカウント停止">
          <Body>
            ユーザーが本規約に違反した場合、または不適切な行為があった場合、当社は事前通知なくコンテンツの削除・利用制限・アカウント停止を行うことができます。
          </Body>
        </Section>

        <Section title="第10条　退会">
          <Body>
            ユーザーはいつでも設定画面からアカウントを削除できます。退会後はコンテンツ・履歴等が削除され、復元できません。
          </Body>
        </Section>

        <Section title="第11条　運営によるコンテンツへのアクセス">
          <Body>
            当社は、本サービスの適正な運営および利用規約の執行を目的として、以下のとおりコンテンツにアクセスすることがあります。
          </Body>
          <Item n={1}>ユーザーが投稿・配信した全てのコンテンツ（配信・メッセージ・プロフィール等）は、規約違反の調査・サービス品質の維持・改善のために当社が参照することがあります。</Item>
          <Item n={2}>ダイレクトメッセージ（DM）は原則として第三者に開示しませんが、重大な規約違反（ハラスメント・脅迫・違法コンテンツの共有等）に関する調査が必要と当社が判断した場合に限り、当該調査の範囲内で閲覧することがあります。</Item>
          <Item n={3}>上記によるコンテンツへのアクセスは、最小限の範囲にとどめ、調査目的以外には利用しません。</Item>
          <Item n={4}>本サービスをご利用いただくことにより、ユーザーは本条に定める取扱いに同意したものとみなします。</Item>
        </Section>

        <Section title="第12条　免責事項">
          <Body>当社は以下について責任を負いません。</Body>
          <Item n={1}>本サービスの中断・停止・終了によって生じた損害</Item>
          <Item n={2}>ユーザー間のトラブルによって生じた損害</Item>
          <Item n={3}>第三者によるなりすまし・不正アクセスによる損害</Item>
          <Item n={4}>外部リンク先のサービス・コンテンツに関するもの</Item>
          <Body>{'\n'}当社の責任が生じる場合でも、故意・重過失による場合を除き、賠償額はユーザーが直近1ヶ月に支払った利用料金を上限とします。</Body>
        </Section>

        <Section title="第13条　サービスの終了">
          <Body>
            当社は、30日前までに本サービス内でお知らせのうえ、本サービスを終了することがあります。
          </Body>
        </Section>

        <Section title="第14条　規約の変更">
          <Body>
            当社は本規約を変更することがあります。重要な変更は本サービス内でお知らせし、変更後も継続してご利用いただいた場合は変更後の規約に同意したものとみなします。
          </Body>
        </Section>

        <Section title="第15条　準拠法・管轄裁判所">
          <Body>
            本規約は日本法に準拠します。本サービスに関する紛争は、当社所在地を管轄する日本の裁判所を第一審の専属的合意管轄裁判所とします。
          </Body>
        </Section>

        <Section title="第16条　お問い合わせ">
          <Body>{`本規約に関するお問い合わせは、以下の窓口までご連絡ください。\n\n${COMPANY}`}</Body>
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
    backgroundColor: Colors.header, paddingTop: 36, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: Colors.text },
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
