import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/colors'

const LAST_UPDATED = '2026年6月2日'

function Row({ label, value, isLink }: { label: string; value: string; isLink?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {isLink ? (
        <TouchableOpacity onPress={() => Linking.openURL(`mailto:${value}`)}>
          <Text style={[styles.rowValue, styles.rowLink]}>{value}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.rowValue}>{value}</Text>
      )}
    </View>
  )
}

export default function TokuteiScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>特定商取引法に基づく表記</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>最終更新日：{LAST_UPDATED}</Text>

        <View style={styles.card}>
          <Row label="販売者名" value="Yasui Yutaro" />
          <View style={styles.divider} />
          <Row
            label="所在地"
            value="請求があり次第、遅滞なく開示いたします"
          />
          <View style={styles.divider} />
          <Row
            label="電話番号"
            value="請求があり次第、遅滞なく開示いたします"
          />
          <View style={styles.divider} />
          <Row
            label="メールアドレス"
            value="reach.official.jp@gmail.com"
            isLink
          />
        </View>

        <Text style={styles.sectionTitle}>販売価格</Text>
        <View style={styles.card}>
          <Row label="スタンダードプラン" value="¥2,980（税込）/ 月" />
          <View style={styles.divider} />
          <Row label="プロプラン" value="¥7,500（税込）/ 月" />
          <View style={styles.divider} />
          <Row label="開発支援金" value="¥300 / ¥500 / ¥1,000（各税込・一回払い）" />
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>クリエイターメンバーシップ</Text>
            <Text style={styles.rowValue}>各クリエイターが設定する金額（¥500 / ¥1,000 / ¥3,000、各税込）/ 月{'\n'}※金額はクリエイターにより異なります</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>プラットフォーム手数料</Text>
            <Text style={styles.rowValue}>販売価格の30%（Stripe・App Store・Google Play 等の決済手数料を含む）{'\n'}クリエイターへのお支払いは販売価格の70%です</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>支払方法</Text>
        <View style={styles.card}>
          <Row label="Web" value="クレジットカード（Stripe）" />
          <View style={styles.divider} />
          <Row label="iOS / Android" value="App Store / Google Play 経由のアプリ内課金" />
        </View>

        <Text style={styles.sectionTitle}>支払時期</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.bodyText}>
              サブスクリプションプランおよびメンバーシップは、申し込み時に初回課金が行われ、以降は毎月同日に自動更新されます。開発支援金は申し込み時に一回のみ課金されます。
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>役務の提供時期</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.bodyText}>
              決済完了後、直ちにサービスをご利用いただけます。
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>返品・キャンセルについて</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.bodyText}>
              デジタルコンテンツ・サービスの性質上、原則として返金・キャンセルはお受けしておりません。{'\n\n'}
              サブスクリプションはいつでも解約でき、解約後は次の更新日以降の請求は発生しません。解約月の残り期間は引き続きご利用いただけます。{'\n\n'}
              App Store / Google Play 経由の購入については、各ストアの返金ポリシーに従います。
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>動作環境</Text>
        <View style={styles.card}>
          <Row label="Web" value="最新版のChrome / Safari / Edge 推奨" />
          <View style={styles.divider} />
          <Row label="iOS" value="iOS 16以上" />
          <View style={styles.divider} />
          <Row label="Android" value="Android 10以上" />
        </View>

        <Text style={styles.note}>
          本表記に関するお問い合わせは reach.official.jp@gmail.com までご連絡ください。
        </Text>
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },

  content: { padding: 16, gap: 8, paddingBottom: 48 },
  updated: { fontSize: 12, color: Colors.textLight, textAlign: 'right', marginBottom: 4 },

  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.4,
    paddingHorizontal: 4, paddingTop: 12, paddingBottom: 2,
  },

  card: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: 'column', gap: 4,
  },
  rowLabel: { fontSize: 12, fontWeight: '700', color: Colors.textLight },
  rowValue: { fontSize: 14, color: Colors.text, lineHeight: 21 },
  rowLink: { color: Colors.accent },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 16 },

  bodyText: { fontSize: 14, color: Colors.text, lineHeight: 22 },

  note: {
    fontSize: 12, color: Colors.textLight, textAlign: 'center',
    lineHeight: 20, paddingTop: 8, paddingHorizontal: 8,
  },
})
