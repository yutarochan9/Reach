/**
 * my-memberships.tsx
 *
 * ファンが「加入中のメンバーシップ一覧」を確認・解約するための画面。
 * 設定画面の「収益・振込」または別途メニューから遷移する。
 */
import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform, Image, Modal,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import DefaultAvatar from './components/DefaultAvatar'
import { Colors } from '../constants/colors'

type Membership = {
  id: string
  creator_id: string
  status: 'active' | 'canceling' | 'canceled'
  created_at: string
  expires_at: string | null
  creator: {
    display_name: string
    avatar_url: string | null
    membership_price: number | null
  }
}

// 解約理由の選択肢
const CANCEL_REASONS = [
  '月額が高い',
  'コンテンツが少なかった',
  '一時停止したい',
  'その他',
]

export default function MyMembershipsScreen() {
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [loading, setLoading] = useState(true)
  const [canceling, setCanceling] = useState<string | null>(null)

  // 解約理由モーダル用ステート
  const [cancelTarget, setCancelTarget] = useState<Membership | null>(null)
  const [selectedReason, setSelectedReason] = useState<string>('')

  // 解約完了モーダル用ステート
  const [canceledInfo, setCanceledInfo] = useState<{ creatorName: string; expiresAt: string } | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/(auth)/login' as any); return }

    const { data } = await supabase
      .from('subscriptions')
      .select(`
        id,
        creator_id,
        status,
        created_at,
        expires_at,
        creator:profiles!creator_id (
          display_name,
          avatar_url,
          membership_price
        )
      `)
      .eq('subscriber_id', user.id)
      .in('status', ['active', 'canceling'])
      .order('created_at', { ascending: false })

    setMemberships((data as any) ?? [])
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // 「解約する」ボタン → 理由選択モーダルを開く
  const handleCancel = (m: Membership) => {
    setSelectedReason('')
    setCancelTarget(m)
  }

  // 理由を選んだ後に実際に解約処理を実行する
  const doCancel = async (m: Membership, reason: string) => {
    setCancelTarget(null)
    setCanceling(m.creator_id)
    try {
      // 解約理由を subscriptions テーブルに保存
      if (reason) {
        await supabase.from('subscriptions').update({ cancel_reason: reason }).eq('id', m.id)
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('ログインが必要です')

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/stripe-cancel-membership`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ creatorId: m.creator_id }),
        }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      // 解約完了モーダルを表示（終了日付き）
      setCanceledInfo({
        creatorName: m.creator.display_name,
        expiresAt: json.expiresAt ?? '',
      })
      load()
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '解約処理に失敗しました')
    } finally {
      setCanceling(null)
    }
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  }

  // 解約完了モーダル用：「〇年〇月〇日」形式
  const formatDateJa = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  }

  // 解約理由モーダルを確定したときの処理
  const confirmCancel = () => {
    if (!cancelTarget || !selectedReason) return
    doCancel(cancelTarget, selectedReason)
  }

  if (loading) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  )

  return (
    <View style={s.container}>

      {/* ── 解約完了モーダル ── */}
      <Modal
        visible={canceledInfo !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCanceledInfo(null)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.doneIconWrap}>
              <Ionicons name="checkmark-circle" size={48} color="#16a34a" />
            </View>
            <Text style={s.doneTitle}>解約手続きが完了しました</Text>
            <Text style={s.doneSub}>
              <Text style={s.doneCreator}>{canceledInfo?.creatorName}</Text>
              {'\n'}のメンバーシップは
            </Text>
            {canceledInfo?.expiresAt ? (
              <View style={s.doneExpiry}>
                <Text style={s.doneExpiryDate}>{formatDateJa(canceledInfo.expiresAt)}</Text>
                <Text style={s.doneExpiryLabel}>まで引き続きご利用いただけます</Text>
              </View>
            ) : (
              <Text style={s.doneSub}>次回更新日まで引き続きご利用いただけます。</Text>
            )}
            <Text style={s.doneNote}>それ以降は自動的に解約され、請求は発生しません。</Text>
            <TouchableOpacity style={s.doneBtn} onPress={() => setCanceledInfo(null)}>
              <Text style={s.doneBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── 解約理由モーダル ── */}
      <Modal
        visible={cancelTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelTarget(null)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>解約する理由を教えてください</Text>
            <Text style={s.modalSub}>今後のサービス改善に役立てます</Text>

            <View style={s.reasonList}>
              {CANCEL_REASONS.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[s.reasonBtn, selectedReason === r && s.reasonBtnActive]}
                  onPress={() => setSelectedReason(r)}
                  activeOpacity={0.7}
                >
                  <View style={[s.reasonRadio, selectedReason === r && s.reasonRadioActive]}>
                    {selectedReason === r && <View style={s.reasonRadioDot} />}
                  </View>
                  <Text style={[s.reasonText, selectedReason === r && s.reasonTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setCancelTarget(null)}>
                <Text style={s.modalCancelText}>やめる</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirmBtn, !selectedReason && { opacity: 0.4 }]}
                onPress={confirmCancel}
                disabled={!selectedReason}
              >
                <Text style={s.modalConfirmText}>解約を確定する</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.push('/settings' as any)}
          style={s.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>加入中のメンバーシップ</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {memberships.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="star-outline" size={48} color={Colors.border} />
            <Text style={s.emptyTitle}>加入中のメンバーシップはありません</Text>
            <Text style={s.emptyDesc}>気になるクリエイターのメンバーシップに加入してみましょう</Text>
          </View>
        ) : (
          <>
            <Text style={s.countText}>{memberships.length}件のメンバーシップ</Text>

            {memberships.map(m => (
              <View key={m.id} style={s.card}>
                <View style={s.cardTop}>
                  {m.creator.avatar_url
                    ? <Image source={{ uri: m.creator.avatar_url }} style={s.avatar} />
                    : <DefaultAvatar size={48} />
                  }
                  <View style={s.cardInfo}>
                    <Text style={s.creatorName}>{m.creator.display_name}</Text>
                    <Text style={s.price}>
                      ¥{(m.creator.membership_price ?? 500).toLocaleString()} / 月
                    </Text>
                    <Text style={s.joinedAt}>加入日：{formatDate(m.created_at)}</Text>
                  </View>

                  {/* ステータスバッジ */}
                  <View style={[
                    s.badge,
                    m.status === 'active'    && s.badgeActive,
                    m.status === 'canceling' && s.badgeCanceling,
                  ]}>
                    <Text style={[
                      s.badgeText,
                      m.status === 'active'    && s.badgeTextActive,
                      m.status === 'canceling' && s.badgeTextCanceling,
                    ]}>
                      {m.status === 'active' ? '有効' : '解約予定'}
                    </Text>
                  </View>
                </View>

                {/* 解約予定の説明 */}
                {m.status === 'canceling' && (
                  <View style={s.cancelingNote}>
                    <Ionicons name="information-circle-outline" size={14} color="#D97706" />
                    <Text style={s.cancelingNoteText}>
                      {m.expires_at
                        ? `${formatDateJa(m.expires_at)}まで利用可能です`
                        : '次回更新日に自動解約されます'}
                    </Text>
                  </View>
                )}

                {/* アクション */}
                <View style={s.cardActions}>
                  <TouchableOpacity
                    style={s.viewBtn}
                    onPress={() => router.push({ pathname: '/creator/[id]' as any, params: { id: m.creator_id } })}
                  >
                    <Text style={s.viewBtnText}>クリエイターのページへ</Text>
                  </TouchableOpacity>

                  {m.status === 'active' && (
                    <TouchableOpacity
                      style={[s.cancelBtn, canceling === m.creator_id && { opacity: 0.5 }]}
                      onPress={() => handleCancel(m)}
                      disabled={canceling === m.creator_id}
                    >
                      {canceling === m.creator_id
                        ? <ActivityIndicator size="small" color="#E53E3E" />
                        : <Text style={s.cancelBtnText}>解約する</Text>
                      }
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}

            <View style={s.noteBox}>
              <Ionicons name="information-circle-outline" size={14} color={Colors.textLight} />
              <Text style={s.noteText}>
                解約しても次回更新日まで引き続きご利用いただけます。返金は原則対応しておりません。
              </Text>
            </View>
          </>
        )}
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

  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  emptyDesc: { fontSize: 13, color: Colors.textLight, textAlign: 'center', lineHeight: 20 },

  countText: { fontSize: 12, color: Colors.textLight, paddingHorizontal: 4 },

  card: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16, gap: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarPlaceholder: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: Colors.white },
  cardInfo: { flex: 1, gap: 2 },
  creatorName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  price: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  joinedAt: { fontSize: 11, color: Colors.textLight },

  badge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1,
  },
  badgeActive: { backgroundColor: '#F0FDF4', borderColor: '#86efac' },
  badgeCanceling: { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextActive: { color: '#16a34a' },
  badgeTextCanceling: { color: '#D97706' },

  cancelingNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFBEB', borderRadius: 8, padding: 10,
  },
  cancelingNoteText: { fontSize: 12, color: '#D97706' },

  cardActions: { flexDirection: 'row', gap: 10 },
  viewBtn: {
    flex: 1, backgroundColor: Colors.background,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 10, alignItems: 'center',
  },
  viewBtnText: { fontSize: 13, fontWeight: '600', color: Colors.text },
  cancelBtn: {
    flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: '#E53E3E',
    paddingVertical: 10, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: '#E53E3E' },

  noteBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.white, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  noteText: { flex: 1, fontSize: 12, color: Colors.textLight, lineHeight: 18 },

  // 解約理由モーダル
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', backgroundColor: Colors.white, borderRadius: 20,
    padding: 24, gap: 4,
    ...(Platform.OS === 'web' ? { maxWidth: 400 } as any : {}),
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  modalSub: { fontSize: 12, color: Colors.textLight, marginBottom: 12 },

  reasonList: { gap: 8, marginBottom: 20 },
  reasonBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12,
    padding: 14, backgroundColor: Colors.background,
  },
  reasonBtnActive: { borderColor: '#E53E3E', backgroundColor: '#FFF5F5' },
  reasonRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  reasonRadioActive: { borderColor: '#E53E3E' },
  reasonRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E53E3E' },
  reasonText: { fontSize: 14, fontWeight: '600', color: Colors.text },
  reasonTextActive: { color: '#E53E3E' },

  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: Colors.textLight },
  modalConfirmBtn: {
    flex: 1.5, backgroundColor: '#E53E3E', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  modalConfirmText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  // 解約完了モーダル
  doneIconWrap: { alignItems: 'center', marginBottom: 8 },
  doneTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 12 },
  doneSub: { fontSize: 14, color: Colors.textLight, textAlign: 'center', lineHeight: 22 },
  doneCreator: { fontWeight: '700', color: Colors.text },
  doneExpiry: { alignItems: 'center', marginTop: 8, marginBottom: 4 },
  doneExpiryDate: { fontSize: 22, fontWeight: '800', color: '#16a34a' },
  doneExpiryLabel: { fontSize: 13, color: Colors.textLight, marginTop: 2 },
  doneNote: { fontSize: 12, color: Colors.textLight, textAlign: 'center', lineHeight: 18, marginTop: 8, marginBottom: 16 },
  doneBtn: {
    backgroundColor: Colors.accent, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
})
