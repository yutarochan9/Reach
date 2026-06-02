import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
  Modal, FlatList,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

// 銀行・支店の型
type Bank   = { code: string; name: string; kana: string }
type Branch = { code: string; name: string; kana: string }

// bank.teraren.com の公開APIで金融機関・支店を検索
const BANK_API = 'https://bank.teraren.com'

export default function BankAccountScreen() {
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 選択済み銀行・支店
  const [selectedBank,   setSelectedBank]   = useState<Bank | null>(null)
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null)
  const [bankAccountType,   setBankAccountType]   = useState<'普通' | '当座'>('普通')
  const [bankAccountNumber, setBankAccountNumber] = useState('')
  const [bankAccountHolder, setBankAccountHolder] = useState('')
  const [bankRegistered, setBankRegistered] = useState(false)

  // 銀行検索モーダル
  const [showBankModal,   setShowBankModal]   = useState(false)
  const [showBranchModal, setShowBranchModal] = useState(false)
  const [bankQuery,   setBankQuery]   = useState('')
  const [branchQuery, setBranchQuery] = useState('')
  const [banks,    setBanks]    = useState<Bank[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [bankSearching,   setBankSearching]   = useState(false)
  const [branchSearching, setBranchSearching] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/(auth)/login' as any); return }
      setUserId(user.id)

      const { data } = await supabase
        .from('profiles')
        .select('bank_name, bank_branch_name, bank_account_type, bank_account_number, bank_account_holder, bank_code, bank_branch_code')
        .eq('id', user.id)
        .single()

      if (data?.bank_account_number) {
        setSelectedBank(data.bank_name ? { code: data.bank_code ?? '', name: data.bank_name, kana: '' } : null)
        setSelectedBranch(data.bank_branch_name ? { code: data.bank_branch_code ?? '', name: data.bank_branch_name, kana: '' } : null)
        setBankAccountType((data.bank_account_type as '普通' | '当座') ?? '普通')
        setBankAccountNumber(data.bank_account_number ?? '')
        setBankAccountHolder(data.bank_account_holder ?? '')
        setBankRegistered(true)
      }
      setLoading(false)
    }
    load()
  }, [])

  // 銀行名検索
  const searchBanks = useCallback(async (q: string) => {
    if (!q.trim()) { setBanks([]); return }
    setBankSearching(true)
    try {
      const res = await fetch(`${BANK_API}/banks.json`)
      const all: Bank[] = await res.json()
      const lower = q.toLowerCase()
      setBanks(
        all.filter(b =>
          b.name.includes(q) || b.kana.toLowerCase().includes(lower)
        ).slice(0, 30)
      )
    } catch {
      setBanks([])
    } finally {
      setBankSearching(false)
    }
  }, [])

  // 支店名検索
  const searchBranches = useCallback(async (q: string) => {
    if (!selectedBank?.code) return
    setBranchSearching(true)
    try {
      const res = await fetch(`${BANK_API}/banks/${selectedBank.code}/branches.json`)
      const all: Branch[] = await res.json()
      const lower = q.toLowerCase()
      setBranches(
        q.trim()
          ? all.filter(b => b.name.includes(q) || b.kana.toLowerCase().includes(lower)).slice(0, 30)
          : all.slice(0, 30)
      )
    } catch {
      setBranches([])
    } finally {
      setBranchSearching(false)
    }
  }, [selectedBank])

  const openBankModal = () => {
    setBankQuery('')
    setBanks([])
    setShowBankModal(true)
  }

  const openBranchModal = () => {
    if (!selectedBank) { Alert.alert('先に銀行を選択してください'); return }
    setBranchQuery('')
    searchBranches('')
    setShowBranchModal(true)
  }

  const selectBank = (bank: Bank) => {
    setSelectedBank(bank)
    setSelectedBranch(null)
    setShowBankModal(false)
  }

  const selectBranch = (branch: Branch) => {
    setSelectedBranch(branch)
    setShowBranchModal(false)
  }

  const handleSave = async () => {
    if (!userId) return
    if (!selectedBank || !selectedBranch) {
      Alert.alert('入力エラー', '銀行・支店を選択してください')
      return
    }
    if (!bankAccountNumber.trim() || !bankAccountHolder.trim()) {
      Alert.alert('入力エラー', '口座番号と口座名義を入力してください')
      return
    }
    if (!/^\d{7}$/.test(bankAccountNumber)) {
      Alert.alert('入力エラー', '口座番号は7桁の数字で入力してください')
      return
    }
    setSaving(true)
    try {
      // profiles に口座情報を保存（bank_code / bank_branch_code も含む）
      const { error } = await supabase.from('profiles').update({
        bank_name:           selectedBank.name,
        bank_code:           selectedBank.code,
        bank_branch_name:    selectedBranch.name,
        bank_branch_code:    selectedBranch.code,
        bank_account_type:   bankAccountType,
        bank_account_number: bankAccountNumber.trim(),
        bank_account_holder: bankAccountHolder.trim(),
        bank_registered_at:  new Date().toISOString(),
      }).eq('id', userId)
      if (error) throw error

      // Stripe Connect Custom アカウントに銀行口座を登録（バックグラウンドで実行）
      // 失敗しても口座情報の保存自体は完了しているため、ユーザーに影響しない
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        supabase.functions.invoke('stripe-connect-setup', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch((e) => console.warn('stripe-connect-setup failed:', e))
      }

      setBankRegistered(true)

      // 本人確認情報が未入力なら続けて入力を促す
      const { data: profile } = await supabase.from('profiles')
        .select('kyc_completed_at').eq('id', userId).single()
      const kycDone = !!profile?.kyc_completed_at

      if (Platform.OS === 'web') {
        window.alert('振込先口座を登録しました')
        if (!kycDone) router.push('/payout-profile' as any)
      } else {
        if (kycDone) {
          Alert.alert('登録完了', '振込先口座を登録しました')
        } else {
          Alert.alert(
            '登録完了',
            '振込先口座を登録しました。\n次に本人確認情報を入力してください。',
            [
              { text: 'あとで', style: 'cancel' },
              { text: '入力する', onPress: () => router.push('/payout-profile' as any) },
            ]
          )
        }
      }
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  )

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.container}>

        {/* ヘッダー */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.push('/settings' as any)}
            style={s.backBtn}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>振込先口座</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

          <View style={s.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.textLight} />
            <Text style={s.infoText}>
              メンバーシップ収益の70%を毎月末に登録口座へ振り込みます。{'\n'}
              銀行・支店名は検索で選択できます。
            </Text>
          </View>

          {bankRegistered && (
            <View style={s.registeredBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
              <Text style={s.registeredText}>口座登録済み</Text>
            </View>
          )}

          <View style={s.section}>

            {/* 銀行選択 */}
            <Text style={s.label}>銀行名</Text>
            <TouchableOpacity style={s.selectBtn} onPress={openBankModal} activeOpacity={0.8}>
              <Text style={[s.selectBtnText, !selectedBank && s.selectBtnPlaceholder]}>
                {selectedBank ? selectedBank.name : '銀行を検索して選択'}
              </Text>
              {selectedBank
                ? <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
                : <Ionicons name="search-outline" size={18} color={Colors.textLight} />
              }
            </TouchableOpacity>

            {/* 支店選択 */}
            <Text style={s.label}>支店名</Text>
            <TouchableOpacity
              style={[s.selectBtn, !selectedBank && { opacity: 0.5 }]}
              onPress={openBranchModal}
              activeOpacity={0.8}
              disabled={!selectedBank}
            >
              <Text style={[s.selectBtnText, !selectedBranch && s.selectBtnPlaceholder]}>
                {selectedBranch ? selectedBranch.name : '支店を検索して選択'}
              </Text>
              {selectedBranch
                ? <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
                : <Ionicons name="search-outline" size={18} color={Colors.textLight} />
              }
            </TouchableOpacity>

            {/* 口座種別 */}
            <Text style={s.label}>口座種別</Text>
            <View style={s.typeRow}>
              {(['普通', '当座'] as const).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[s.typeBtn, bankAccountType === type && s.typeBtnSelected]}
                  onPress={() => setBankAccountType(type)}
                >
                  <Text style={[s.typeBtnText, bankAccountType === type && s.typeBtnTextSelected]}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 口座番号 */}
            <Text style={s.label}>口座番号</Text>
            <TextInput
              style={s.input}
              value={bankAccountNumber}
              onChangeText={setBankAccountNumber}
              placeholder="1234567（7桁）"
              placeholderTextColor={Colors.textLight}
              keyboardType="numeric"
              maxLength={7}
            />
            {bankAccountNumber.length > 0 && bankAccountNumber.length < 7 && (
              <Text style={s.hint}>あと {7 - bankAccountNumber.length} 桁</Text>
            )}
            {bankAccountNumber.length === 7 && (
              <Text style={s.hintOk}>✓ 7桁OK</Text>
            )}

            {/* 口座名義 */}
            <Text style={s.label}>口座名義（カタカナ）</Text>
            <TextInput
              style={s.input}
              value={bankAccountHolder}
              onChangeText={setBankAccountHolder}
              placeholder="例：ヤマダ タロウ"
              placeholderTextColor={Colors.textLight}
            />
            <Text style={s.note}>通帳に記載されている名義をカタカナで入力してください</Text>
          </View>

          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Text style={s.saveBtnText}>
                  {bankRegistered ? '口座情報を更新する' : '振込先口座を登録する'}
                </Text>
            }
          </TouchableOpacity>

        </ScrollView>
      </View>

      {/* ── 銀行検索モーダル ── */}
      <Modal visible={showBankModal} animationType="slide" onRequestClose={() => setShowBankModal(false)}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>銀行を選択</Text>
            <TouchableOpacity onPress={() => setShowBankModal(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <View style={s.searchRow}>
            <Ionicons name="search-outline" size={18} color={Colors.textLight} style={{ marginLeft: 12 }} />
            <TextInput
              style={s.searchInput}
              value={bankQuery}
              onChangeText={q => { setBankQuery(q); searchBanks(q) }}
              placeholder="銀行名またはカナで検索"
              placeholderTextColor={Colors.textLight}
              autoFocus
            />
          </View>
          {bankSearching
            ? <ActivityIndicator style={{ marginTop: 24 }} color={Colors.accent} />
            : <FlatList
                data={banks}
                keyExtractor={b => b.code}
                renderItem={({ item }) => (
                  <TouchableOpacity style={s.listItem} onPress={() => selectBank(item)}>
                    <Text style={s.listItemName}>{item.name}</Text>
                    <Text style={s.listItemSub}>{item.kana}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  bankQuery.length > 0
                    ? <Text style={s.emptyText}>見つかりませんでした</Text>
                    : <Text style={s.emptyText}>銀行名を入力して検索</Text>
                }
              />
          }
        </View>
      </Modal>

      {/* ── 支店検索モーダル ── */}
      <Modal visible={showBranchModal} animationType="slide" onRequestClose={() => setShowBranchModal(false)}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{selectedBank?.name}の支店を選択</Text>
            <TouchableOpacity onPress={() => setShowBranchModal(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <View style={s.searchRow}>
            <Ionicons name="search-outline" size={18} color={Colors.textLight} style={{ marginLeft: 12 }} />
            <TextInput
              style={s.searchInput}
              value={branchQuery}
              onChangeText={q => { setBranchQuery(q); searchBranches(q) }}
              placeholder="支店名またはカナで検索"
              placeholderTextColor={Colors.textLight}
              autoFocus
            />
          </View>
          {branchSearching
            ? <ActivityIndicator style={{ marginTop: 24 }} color={Colors.accent} />
            : <FlatList
                data={branches}
                keyExtractor={b => b.code}
                renderItem={({ item }) => (
                  <TouchableOpacity style={s.listItem} onPress={() => selectBranch(item)}>
                    <Text style={s.listItemName}>{item.name}</Text>
                    <Text style={s.listItemSub}>{item.kana}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={s.emptyText}>見つかりませんでした</Text>
                }
              />
          }
        </View>
      </Modal>

    </KeyboardAvoidingView>
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

  content: { padding: 16, gap: 14, paddingBottom: 48 },

  infoBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.white, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  infoText: { flex: 1, fontSize: 13, color: Colors.textLight, lineHeight: 20 },

  registeredBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#86efac',
  },
  registeredText: { fontSize: 14, fontWeight: '600', color: '#16a34a' },

  section: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16, gap: 8,
  },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 4 },

  selectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  selectBtnText: { fontSize: 14, color: Colors.text, flex: 1 },
  selectBtnPlaceholder: { color: Colors.textLight },

  input: {
    backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, color: Colors.text,
  },
  hint:   { fontSize: 12, color: Colors.textLight, marginTop: -4 },
  hintOk: { fontSize: 12, color: '#22c55e', fontWeight: '600', marginTop: -4 },
  note:   { fontSize: 11, color: Colors.textLight, marginTop: -4, lineHeight: 16 },

  typeRow: { flexDirection: 'row', gap: 10 },
  typeBtn: {
    flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border,
    paddingVertical: 10, alignItems: 'center', backgroundColor: Colors.background,
  },
  typeBtnSelected: { borderColor: Colors.accent, backgroundColor: '#FDF6EE' },
  typeBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textLight },
  typeBtnTextSelected: { color: Colors.accent },

  saveBtn: {
    backgroundColor: Colors.accent, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  // モーダル
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12,
    backgroundColor: Colors.header, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    margin: 12, backgroundColor: Colors.white,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: {
    flex: 1, paddingHorizontal: 10, paddingVertical: 12,
    fontSize: 15, color: Colors.text,
  },
  listItem: {
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  listItemName: { fontSize: 15, color: Colors.text, fontWeight: '500' },
  listItemSub:  { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  emptyText: { textAlign: 'center', color: Colors.textLight, marginTop: 40, fontSize: 14 },
})
