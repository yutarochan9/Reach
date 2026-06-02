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
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/landing' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>特定商取引法に基づく表記</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>最終更新：{LAST_UPDATED}</Text>

        {/* ── 販売価格 ── */}
        <Text style={styles.sectionTitle}>販売価格</Text>
        <View style={styles.card}>
          <Row label="スタンダードプラン" value="¥2,980（税込）/ 月" />
          <View style={styles.divider} />
          <Row label="プロプラン" value="¥7,500（税込）/ 月" />
          <View style={styles.divider} />
          <Row label="開発支援金" value="¥300 / ¥500 / ¥1,000（各税込・一回払い）" />
          <View style={styles.divider} />
          <Row label="メンバーシップ" value="各クリエイター設定（¥500〜¥3,000、税込）/ 月" />
          <View style={styles.divider} />
          <Row label="プラットフォーム手数料" value="販売価格の30%（決済手数料含む）" />
        </View>

        {/* ── 支払方法・時期 ── */}
        <Text style={styles.sectionTitle}>支払方法 / 時期</Text>
        <View style={styles.card}>
          <Row label="Web" value="クレジットカード（Stripe）" />
          <View style={styles.divider} />
          <Row label="iOS / Android" value="App Store / Google Play アプリ内課金" />
          <View style={styles.divider} />
          <Row label="請求タイミング" value="申込時に初回課金、以降は毎月同日に自動更新" />
        </View>

        {/* ── 返品・キャンセル ── */}
        <Text style={styles.sectionTitle}>返品・キャンセル</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.bodyText}>
              デジタルサービスの性質上、原則として返金・キャンセル不可。サブスクリプションはいつでも解約でき、解約後は翌更新日以降の請求は発生しません。App Store / Google Play 経由は各ストアの返金ポリシーに従います。
            </Text>
          </View>
        </View>

        {/* ── 動作環境 ── */}
        <Text style={styles.sectionTitle}>動作環境</Text>
        <View style={styles.card}>
          <Row label="Web" value="Chrome / Safari / Edge 最新版推奨" />
          <View style={styles.divider} />
          <Row label="iOS / Android" value="iOS 16以上 / Android 10以上" />
        </View>

        {/* ── 連絡先（目立たない） ── */}
        <View style={styles.footer}>
          <Text style={styles.footerItem}>メール：reach.official.jp@gmail.com</Text>
          <Text style={styles.footerItem}>所在地・電話番号：請求があり次第開示</Text>
          <Text style={styles.footerItem}>販売者名：Yasui Yutaro</Text>
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
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },

  content: { padding: 16, gap: 6, paddingBottom: 48 },
  updated: { fontSize: 11, color: Colors.textLight, textAlign: 'right', marginBottom: 2 },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.4,
    paddingHorizontal: 4, paddingTop: 10, paddingBottom: 2,
  },
  card: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  row: { paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'column', gap: 3 },
  rowLabel: { fontSize: 11, fontWeight: '700', color: Colors.textLight },
  rowValue: { fontSize: 13, color: Colors.text, lineHeight: 19 },
  rowLink: { color: Colors.accent },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 14 },
  bodyText: { fontSize: 13, color: Colors.text, lineHeight: 20 },

  footer: {
    marginTop: 16, gap: 4, alignItems: 'center', paddingBottom: 8,
  },
  footerItem: {
    fontSize: 11, color: Colors.textLight, opacity: 0.55, textAlign: 'center',
  },
})
