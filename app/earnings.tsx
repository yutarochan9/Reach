/**
 * earnings.tsx
 *
 * クリエイターの収益確認画面。
 * - 累計収益・未払い・振込済みのサマリーを表示
 * - 振込申請ボタン（申請制：クリエイターが任意のタイミングで申請）
 * - 月ごとの収益内訳を一覧表示
 * - 各行には「いつ・いくら・ステータス」を表示
 */
import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

const MIN_PAYOUT = 1000  // 最低振込申請金額（円）

type Earning = {
  id: string
  amount: number
  creator_amount: number
  reach_amount: number
  payout_status: 'pending' | 'paid'
  payout_date: string | null
  created_at: string
  subscriber: { display_name: string } | null
}

type MonthGroup = {
  month: string        // "2026-06"
  label: string        // "2026年6月"
  total: number        // creator_amount の合計
  items: Earning[]
}

export default function EarningsScreen() {
  const [groups, setGroups]         = useState<MonthGroup[]>([])
  const [pending, setPending]       = useState(0)
  const [paid, setPaid]             = useState(0)
  const [loading, setLoading]       = useState(true)
  const [requesting, setRequesting] = useState(false)  // 振込申請中
  const [expanded, setExpanded]     = useState<string | null>(null)  // 展開中の月

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/(auth)/login' as any); return }

    const { data } = await supabase
      .from('creator_earnings')
      .select(`
        id,
        amount,
        creator_amount,
        reach_amount,
        payout_status,
        payout_date,
        created_at,
        subscriber:profiles!subscriber_id ( display_name )
      `)
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false })

    const earnings: Earning[] = (data as any) ?? []

    // サマリー集計
    let totalPending = 0
    let totalPaid = 0
    for (const e of earnings) {
      if (e.payout_status === 'pending') totalPending += e.creator_amount
      else                               totalPaid    += e.creator_amount
    }
    setPending(totalPending)
    setPaid(totalPaid)

    // 月ごとにグループ化
    const map = new Map<string, MonthGroup>()
    for (const e of earnings) {
      const d = new Date(e.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!map.has(key)) {
        const label = `${d.getFullYear()}年${d.getMonth() + 1}月`
        map.set(key, { month: key, label, total: 0, items: [] })
      }
      const g = map.get(key)!
      g.total += e.creator_amount
      g.items.push(e)
    }
    setGroups(Array.from(map.values()))

    // 最新月を自動展開
    if (map.size > 0) setExpanded(Array.from(map.keys())[0])

    setLoading(false)
  }, [])

  // ── 振込申請 ───────────────────────────────────────────────────────────────
  const requestPayout = async () => {
    if (pending < MIN_PAYOUT) {
      Alert.alert('振込申請できません', `振込待ち金額が¥${MIN_PAYOUT.toLocaleString()}未満です（現在: ¥${pending.toLocaleString()}）`)
      return
    }
    Alert.alert(
      '振込申請',
      `¥${pending.toLocaleString()} を振込申請します。\n登録口座への振込処理が実行されます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '申請する',
          onPress: async () => {
            setRequesting(true)
            try {
              const { data: { session } } = await supabase.auth.getSession()
              if (!session) throw new Error('ログインが必要です')

              const res = await fetch(
                `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/stripe-payout-request`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                  },
                }
              )
              const json = await res.json()
              if (!res.ok) throw new Error(json.error ?? '申請に失敗しました')

              Alert.alert('申請完了', `¥${json.amount?.toLocaleString()} の振込申請が完了しました。口座への入金まで数日かかる場合があります。`)
              load()  // データを再読み込み
            } catch (e: any) {
              Alert.alert('エラー', e.message)
            } finally {
              setRequesting(false)
            }
          },
        },
      ]
    )
  }

  useFocusEffect(useCallback(() => { load() }, [load]))

  const fmt = (iso: string) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  if (loading) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  )

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.push('/settings' as any)}
          style={s.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>収益</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>

        {/* サマリーカード */}
        <View style={s.summaryRow}>
          <View style={[s.summaryCard, s.summaryCardPending]}>
            <Text style={s.summaryLabel}>振込待ち</Text>
            <Text style={[s.summaryAmount, { color: Colors.accent }]}>
              ¥{pending.toLocaleString()}
            </Text>
            <Text style={s.summaryNote}>申請制</Text>
          </View>
          <View style={[s.summaryCard, s.summaryCardPaid]}>
            <Text style={s.summaryLabel}>振込済み（累計）</Text>
            <Text style={[s.summaryAmount, { color: '#16a34a' }]}>
              ¥{paid.toLocaleString()}
            </Text>
            <Text style={s.summaryNote}>手取り70%</Text>
          </View>
        </View>

        {/* 振込申請ボタン */}
        <TouchableOpacity
          style={[s.payoutBtn, (requesting || pending < MIN_PAYOUT) && s.payoutBtnDisabled]}
          onPress={requestPayout}
          disabled={requesting || pending < MIN_PAYOUT}
          activeOpacity={0.8}
        >
          {requesting
            ? <ActivityIndicator color={Colors.white} size="small" />
            : <Ionicons name="arrow-down-circle-outline" size={18} color={Colors.white} />
          }
          <Text style={s.payoutBtnText}>
            {requesting ? '申請中...' : '振込申請する'}
          </Text>
        </TouchableOpacity>

        {/* 振込の仕組み説明 */}
        <View style={s.infoBox}>
          <Ionicons name="information-circle-outline" size={15} color={Colors.textLight} />
          <Text style={s.infoText}>
            メンバーシップ収益の70%を受け取れます。振込申請ボタンから任意のタイミングで申請できます（最低¥{MIN_PAYOUT.toLocaleString()}から）。振込先口座は設定から変更できます。
          </Text>
        </View>

        {/* 収益ゼロ */}
        {groups.length === 0 && (
          <View style={s.empty}>
            <Ionicons name="bar-chart-outline" size={48} color={Colors.border} />
            <Text style={s.emptyTitle}>まだ収益がありません</Text>
            <Text style={s.emptyDesc}>メンバーシップを公開してファンを集めましょう</Text>
            <TouchableOpacity
              style={s.emptyBtn}
              onPress={() => router.push('/membership-settings' as any)}
            >
              <Text style={s.emptyBtnText}>メンバーシップ設定へ</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 月次グループ */}
        {groups.map(g => (
          <View key={g.month} style={s.monthBlock}>
            {/* 月ヘッダー（タップで展開） */}
            <TouchableOpacity
              style={s.monthHeader}
              onPress={() => setExpanded(expanded === g.month ? null : g.month)}
              activeOpacity={0.8}
            >
              <View style={s.monthHeaderLeft}>
                <Text style={s.monthLabel}>{g.label}</Text>
                <Text style={s.monthTotal}>¥{g.total.toLocaleString()}</Text>
              </View>
              <View style={s.monthHeaderRight}>
                <Text style={s.monthCount}>{g.items.length}件</Text>
                <Ionicons
                  name={expanded === g.month ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textLight}
                />
              </View>
            </TouchableOpacity>

            {/* 明細（展開時） */}
            {expanded === g.month && (
              <View style={s.itemList}>
                {g.items.map((e, i) => (
                  <View key={e.id} style={[s.item, i > 0 && s.itemBorder]}>
                    <View style={s.itemLeft}>
                      <Text style={s.itemSubscriber}>
                        {(e.subscriber as any)?.display_name ?? '不明なユーザー'}
                      </Text>
                      <Text style={s.itemDate}>{fmt(e.created_at)}</Text>
                    </View>
                    <View style={s.itemRight}>
                      <Text style={s.itemAmount}>+¥{e.creator_amount.toLocaleString()}</Text>
                      <View style={[
                        s.statusBadge,
                        e.payout_status === 'pending' ? s.statusPending : s.statusPaid,
                      ]}>
                        <Text style={[
                          s.statusText,
                          e.payout_status === 'pending' ? s.statusTextPending : s.statusTextPaid,
                        ]}>
                          {e.payout_status === 'pending' ? '振込待ち' : '振込済'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: 36, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4, width: 32 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },

  content: { padding: 16, gap: 12, paddingBottom: 40 },

  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: {
    flex: 1, borderRadius: 14, padding: 16, gap: 4,
    borderWidth: 1,
  },
  summaryCardPending: { backgroundColor: '#FFF8F0', borderColor: '#FDDCAB' },
  summaryCardPaid:    { backgroundColor: '#F0FDF4', borderColor: '#86efac' },
  summaryLabel:  { fontSize: 11, fontWeight: '700', color: Colors.textLight },
  summaryAmount: { fontSize: 22, fontWeight: '800' },
  summaryNote:   { fontSize: 10, color: Colors.textLight },

  payoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accent, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 24,
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6,
  },
  payoutBtnDisabled: { backgroundColor: Colors.border, shadowOpacity: 0 },
  payoutBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  infoBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.white, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  infoText: { flex: 1, fontSize: 12, color: Colors.textLight, lineHeight: 18 },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  emptyDesc:  { fontSize: 13, color: Colors.textLight, textAlign: 'center' },
  emptyBtn: {
    backgroundColor: Colors.accent, borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12, marginTop: 4,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  monthBlock: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  monthHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16,
  },
  monthHeaderLeft: { gap: 2 },
  monthHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthLabel: { fontSize: 14, fontWeight: '700', color: Colors.text },
  monthTotal: { fontSize: 18, fontWeight: '800', color: Colors.accent },
  monthCount: { fontSize: 12, color: Colors.textLight },

  itemList: { borderTopWidth: 1, borderTopColor: Colors.border },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, paddingHorizontal: 16 },
  itemBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  itemLeft: { gap: 2 },
  itemSubscriber: { fontSize: 13, fontWeight: '600', color: Colors.text },
  itemDate:       { fontSize: 11, color: Colors.textLight },
  itemRight: { alignItems: 'flex-end', gap: 4 },
  itemAmount: { fontSize: 14, fontWeight: '700', color: Colors.text },
  statusBadge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  statusPending: { backgroundColor: '#FFF8F0' },
  statusPaid:    { backgroundColor: '#F0FDF4' },
  statusText: { fontSize: 10, fontWeight: '700' },
  statusTextPending: { color: '#D97706' },
  statusTextPaid:    { color: '#16a34a' },
})
