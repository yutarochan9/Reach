import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
  Modal,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'
import ToggleSwitch from './components/ToggleSwitch'

// ── 価格プラン ─────────────────────────────────────────────
const PRICE_OPTIONS = [
  { value: 500,  label: '¥500' },
  { value: 1000, label: '¥1,000' },
  { value: 3000, label: '¥3,000' },
]

// ── 選択可能なアイコン一覧 ──────────────────────────────────
const ICON_OPTIONS = [
  'lock-closed-outline',
  'star-outline',
  'notifications-outline',
  'heart-outline',
  'people-outline',
  'flash-outline',
  'gift-outline',
  'camera-outline',
  'mic-outline',
  'videocam-outline',
  'document-text-outline',
  'chatbubbles-outline',
  'trophy-outline',
  'ribbon-outline',
  'download-outline',
  'calendar-outline',
  'shield-checkmark-outline',
  'mail-outline',
  'musical-notes-outline',
  'diamond-outline',
] as const

type IconOption = typeof ICON_OPTIONS[number]

// ── 特典の型 ───────────────────────────────────────────────
type Benefit = { icon: string; text: string }

// DBの文字列をパース（新形式: "icon|text"、旧形式: "text"）
const parseBenefit = (s: string): Benefit => {
  const sepIdx = s.indexOf('|')
  if (sepIdx > 0) return { icon: s.slice(0, sepIdx), text: s.slice(sepIdx + 1) }
  return { icon: 'star-outline', text: s }
}

// Benefitを文字列に変換して保存
const encodeBenefit = (b: Benefit): string => `${b.icon}|${b.text}`

// デフォルト特典（新規・未設定の場合）
const DEFAULT_BENEFITS: Benefit[] = [
  { icon: 'lock-closed-outline', text: 'メンバーシップ限定配信へのアクセス' },
  { icon: 'star-outline', text: '優先サポート' },
  { icon: 'notifications-outline', text: '最新情報をいち早くお届け' },
  { icon: 'gift-outline', text: '' },
]

// 30日後の日付を返す
const getScheduledCloseDate = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

// Date → YYYY/MM/DD 表示用
const formatDate = (d: Date) =>
  `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`

export default function MembershipSettingsScreen() {
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [memberCount, setMemberCount] = useState(0)

  // 振込先口座
  const [bankRegistered, setBankRegistered] = useState(false)
  const params = useLocalSearchParams<{ connect?: string }>()

  // 設定値
  const [isActive, setIsActive]             = useState(false)
  const [price, setPrice]                   = useState(500)
  const [benefits, setBenefits]             = useState<Benefit[]>(DEFAULT_BENEFITS)
  const [pageMessage, setPageMessage]       = useState('')   // 加入ページに表示するメッセージ
  const [welcomeMessage, setWelcomeMessage] = useState('')  // 加入完了後のウェルカムメッセージ

  // 閉鎖スケジュール
  const [closeDate, setCloseDate]       = useState<Date | null>(null)
  const [closeMessage, setCloseMessage] = useState('')

  // アイコンピッカー（何番目の特典を編集中か）
  const [iconPickerIdx, setIconPickerIdx] = useState<number | null>(null)

  // 閉鎖確認モーダル
  const [showCloseModal, setShowCloseModal]     = useState(false)
  const [modalMessage, setModalMessage]         = useState('')
  const [closeSaving, setCloseSaving]           = useState(false)

  // 公開確認モーダル
  const [showActivateModal, setShowActivateModal] = useState(false)
  const [activateIsCancelClose, setActivateIsCancelClose] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/(auth)/login' as any); return }
      setUserId(user.id)

      // 設定読み込み & 期限切れ閉鎖処理を実行
      const [{ data: prof }, { count }] = await Promise.all([
        supabase.from('profiles')
          .select('membership_price, membership_active, membership_welcome, membership_benefits, membership_close_date, membership_close_message, membership_description, bank_account_number')
          .eq('id', user.id).single(),
        supabase.from('subscriptions')
          .select('subscriber_id', { count: 'exact', head: true })
          .eq('creator_id', user.id).eq('status', 'active'),
      ])

      await supabase.rpc('process_membership_closures')

      if (prof) {
        setBankRegistered(!!prof.bank_account_number)
        setIsActive(prof.membership_active ?? false)
        const saved = prof.membership_price ?? 500
        setPrice(PRICE_OPTIONS.some(p => p.value === saved) ? saved : 500)
        setPageMessage(prof.membership_description ?? '')
        setWelcomeMessage(prof.membership_welcome ?? '')

        // 特典をパース（新旧両フォーマット対応）
        const rawBenefits: string[] = prof.membership_benefits ?? []
        const parsed: Benefit[] = rawBenefits.map(parseBenefit)
        // 4件になるように末尾を補完
        while (parsed.length < 4) {
          const idx = parsed.length
          parsed.push({ icon: DEFAULT_BENEFITS[idx]?.icon ?? 'star-outline', text: '' })
        }
        setBenefits(parsed.slice(0, 4))

        if (prof.membership_close_date) setCloseDate(new Date(prof.membership_close_date))
        setCloseMessage(prof.membership_close_message ?? '')
      }
      setMemberCount(count ?? 0)
      setLoading(false)
    }
    load()
  }, [])

  // Connect onboarding 完了後のリダイレクト処理
  useEffect(() => {
    if (params.connect === 'success') {
      // webhook が処理するまで少し待ってからリロード
      setTimeout(async () => {
        if (!userId) return
        const { data } = await supabase.from('profiles')
          .select('stripe_connect_onboarded').eq('id', userId).single()
        setConnectOnboarded(data?.stripe_connect_onboarded ?? false)
      }, 2000)
      Alert.alert('設定完了', '収益受け取り設定が完了しました！')
    } else if (params.connect === 'refresh') {
      Alert.alert('再試行', 'セッションが切れました。もう一度お試しください。')
    }
  }, [params.connect, userId])


  // ─────────────────────────────────────────────────────────
  // DBに現在の設定を保存するユーティリティ
  // ─────────────────────────────────────────────────────────
  const saveToDb = async (silent = false) => {
    if (!userId) return false
    const benefitStrings = benefits.filter(b => b.text.trim()).map(encodeBenefit)
    const { error } = await supabase.from('profiles').update({
      membership_price: price,
      membership_active: isActive,
      membership_description: pageMessage.trim() || null,
      membership_welcome: welcomeMessage.trim() || null,
      membership_benefits: benefitStrings.length > 0 ? benefitStrings : null,
    }).eq('id', userId)
    if (error && !silent) Alert.alert('保存エラー', error.message)
    return !error
  }

  // ─────────────────────────────────────────────────────────
  // トグル ON/OFF ハンドラ
  // ─────────────────────────────────────────────────────────
  const handleToggleChange = (newValue: boolean) => {
    if (!newValue && isActive) {
      // OFF にする → 閉鎖モーダルを表示
      const defaultMsg =
        'いつもご利用いただきありがとうございます。誠に恐れ入りますが、メンバーシップを終了することとなりました。' +
        `${formatDate(getScheduledCloseDate())}をもって閉鎖いたします。` +
        'ご理解のほどよろしくお願いいたします。'
      setModalMessage(closeMessage || defaultMsg)
      setShowCloseModal(true)
    } else if (newValue && !isActive) {
      // ON にする前に振込先口座が登録済みか確認
      if (!bankRegistered) {
        Alert.alert(
          '振込先口座が未登録です',
          'メンバーシップを公開するには、先に振込先口座を登録してください。'
        )
        return
      }
      setActivateIsCancelClose(!!closeDate)
      setShowActivateModal(true)
    }
  }

  // ─────────────────────────────────────────────────────────
  // 公開確定（ONモーダルの「公開する」ボタン）
  // ─────────────────────────────────────────────────────────
  const handleConfirmActivate = async () => {
    if (!userId) return
    setShowActivateModal(false)
    setIsActive(true)
    setCloseDate(null)
    setCloseMessage('')
    await supabase.from('profiles').update({
      membership_active: true,
      membership_close_date: null,
      membership_close_message: null,
    }).eq('id', userId)
  }

  // ─────────────────────────────────────────────────────────
  // 閉鎖確定（OFFモーダルの「確定」ボタン）
  // ─────────────────────────────────────────────────────────
  const handleConfirmClose = async () => {
    if (!userId) return
    if (!modalMessage.trim()) {
      Alert.alert('メッセージ必須', '会員への連絡メッセージを入力してください。')
      return
    }
    setCloseSaving(true)
    const scheduled = getScheduledCloseDate()
    const { error } = await supabase.from('profiles').update({
      membership_active: false,
      membership_close_date: scheduled.toISOString(),
      membership_close_message: modalMessage.trim(),
    }).eq('id', userId)
    setCloseSaving(false)
    if (error) { Alert.alert('エラー', error.message); return }
    setIsActive(false)
    setCloseDate(scheduled)
    setCloseMessage(modalMessage)
    setShowCloseModal(false)
  }

  // ─────────────────────────────────────────────────────────
  // 通常の「保存」ボタン
  // ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    const ok = await saveToDb()
    setSaving(false)
    if (ok) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('保存しました')
      } else {
        Alert.alert('保存完了', 'メンバーシップ設定を保存しました')
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // プレビューボタン（保存してから開く）
  // ─────────────────────────────────────────────────────────
  const handlePreview = async () => {
    if (!userId) return
    // 現在の入力内容をDBに保存してからプレビューを表示
    await saveToDb(true)
    router.push({ pathname: '/membership/[creatorId]' as any, params: { creatorId: userId } })
  }

  // ─────────────────────────────────────────────────────────
  // 特典のアイコンを更新
  // ─────────────────────────────────────────────────────────
  const updateBenefitIcon = (idx: number, icon: string) => {
    setBenefits(prev => prev.map((b, i) => i === idx ? { ...b, icon } : b))
    setIconPickerIdx(null)
  }

  const updateBenefitText = (idx: number, text: string) => {
    setBenefits(prev => prev.map((b, i) => i === idx ? { ...b, text } : b))
  }

  if (loading) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  )

  const scheduledCloseDate = getScheduledCloseDate()

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.container}>

        {/* ヘッダー */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.push('/(tabs)/compose' as any)}
            style={s.backBtn}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>メンバーシップ設定</Text>
          <TouchableOpacity style={[s.saveBtn, saving && s.saveBtnOff]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>保存</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

          {/* 会員数 */}
          {memberCount > 0 && (
            <View style={s.statCard}>
              <Ionicons name="people" size={20} color={Colors.accent} />
              <View>
                <Text style={s.statNum}>{memberCount}人</Text>
                <Text style={s.statLabel}>現在のメンバー数</Text>
              </View>
            </View>
          )}

          {/* ── 振込先口座設定 ── */}
          <View style={s.connectCard}>
            <View style={s.connectHeader}>
              <View style={[s.connectDot, bankRegistered && s.connectDotActive]} />
              <Text style={s.connectTitle}>振込先口座</Text>
              {bankRegistered && (
                <View style={s.connectBadge}>
                  <Ionicons name="checkmark" size={11} color="#fff" />
                  <Text style={s.connectBadgeText}>登録済み</Text>
                </View>
              )}
            </View>
            <Text style={s.connectDesc}>
              {bankRegistered
                ? '毎月末に収益の70%をご登録の口座へ振り込みます。'
                : 'メンバーシップ収益を受け取るには、振込先口座を登録してください。'}
            </Text>
            <TouchableOpacity
              style={s.connectBtn}
              onPress={() => router.push('/bank-account' as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="business-outline" size={16} color={Colors.white} />
              <Text style={s.connectBtnText}>
                {bankRegistered ? '口座情報を確認・変更する' : '振込先口座を登録する'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── 閉鎖スケジュール中の警告カード ── */}
          {closeDate && (
            <View style={s.closeWarningCard}>
              <View style={s.closeWarningHeader}>
                <Ionicons name="warning" size={18} color={s.closeWarningTitle.color as string} />
                <Text style={s.closeWarningTitle}>閉鎖スケジュール中</Text>
              </View>
              <Text style={s.closeWarningDate}>
                閉鎖予定日：<Text style={s.closeWarningDateBold}>{formatDate(closeDate)}</Text>
              </Text>
              <Text style={s.closeWarningMsg} numberOfLines={3}>{closeMessage}</Text>
              <TouchableOpacity
                style={s.cancelCloseBtn}
                onPress={() => handleToggleChange(true)}
              >
                <Ionicons name="refresh" size={14} color={Colors.accent} />
                <Text style={s.cancelCloseBtnText}>閉鎖をキャンセルして再公開する</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── 公開設定 ── */}
          <View style={s.section}>
            <View style={s.row}>
              <View style={s.rowInfo}>
                <Text style={s.rowTitle}>メンバーシップを公開する</Text>
                <Text style={s.rowDesc}>
                  {!bankRegistered
                    ? '⚠ 先に振込先口座を登録してください'
                    : isActive
                      ? 'フォロワーが加入できます'
                      : closeDate
                        ? `${formatDate(closeDate)} に閉鎖予定`
                        : 'オフにすると加入ページが非公開になります'}
                </Text>
              </View>
              <ToggleSwitch value={isActive} onValueChange={handleToggleChange} />
            </View>
          </View>

          {/* ── 月額料金（3択） ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>月額料金</Text>
            <View style={s.priceGrid}>
              {PRICE_OPTIONS.map(opt => {
                const selected = price === opt.value
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.priceCard, selected && s.priceCardSelected]}
                    onPress={() => setPrice(opt.value)}
                    activeOpacity={0.8}
                  >
                    {selected && (
                      <View style={s.priceCheck}>
                        <Ionicons name="checkmark" size={12} color={Colors.white} />
                      </View>
                    )}
                    <Text style={[s.priceLabel, selected && s.priceLabelSelected]}>{opt.label}</Text>
                    <Text style={s.priceMonth}>/月</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* ── 特典（アイコン選択 + テキスト入力） ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>メンバーシップ特典</Text>
            <Text style={s.sectionDesc}>アイコンをタップして変更できます（最大4つ）</Text>

            {benefits.map((b, i) => {
              const isOptional = i === 3
              return (
                <View key={i} style={s.benefitRow}>
                  {/* アイコンボタン */}
                  <TouchableOpacity
                    style={[s.benefitIconBtn, isOptional && !b.text && s.benefitIconBtnOptional]}
                    onPress={() => setIconPickerIdx(i)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name={b.icon as any} size={18} color={isOptional && !b.text ? Colors.textLight : Colors.accent} />
                  </TouchableOpacity>
                  {/* テキスト入力 */}
                  <TextInput
                    style={[s.benefitInput, isOptional && !b.text && s.benefitInputOptional]}
                    value={b.text}
                    onChangeText={text => updateBenefitText(i, text)}
                    placeholder={
                      i === 0 ? '例: 限定配信へのアクセス' :
                      i === 1 ? '例: 優先サポート' :
                      i === 2 ? '例: 最新情報をいち早くお届け' :
                               '例: オリジナルコンテンツ（任意）'
                    }
                    placeholderTextColor={Colors.textLight}
                  />
                </View>
              )
            })}
          </View>

          {/* ── 加入ページのメッセージ ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>加入ページのメッセージ（任意）</Text>
            <Text style={s.sectionDesc}>料金・特典の間に表示されます</Text>
            <TextInput
              style={s.textarea}
              value={pageMessage}
              onChangeText={setPageMessage}
              placeholder="例: このメンバーシップでは毎週限定配信をお届けします。ぜひご加入ください！"
              placeholderTextColor={Colors.textLight}
              multiline numberOfLines={4} textAlignVertical="top" maxLength={400}
            />
            <Text style={s.charCount}>{pageMessage.length} / 400</Text>
          </View>

          {/* ── ウェルカムメッセージ ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>ウェルカムメッセージ（任意）</Text>
            <Text style={s.sectionDesc}>加入完了後にメンバーへ表示するメッセージ</Text>
            <TextInput
              style={s.textarea}
              value={welcomeMessage}
              onChangeText={setWelcomeMessage}
              placeholder="例: メンバーシップへようこそ！"
              placeholderTextColor={Colors.textLight}
              multiline numberOfLines={3} textAlignVertical="top" maxLength={200}
            />
            <Text style={s.charCount}>{welcomeMessage.length} / 200</Text>
          </View>

          {/* プレビューボタン（保存してから開く） */}
          {userId && (
            <TouchableOpacity
              style={s.previewBtn}
              onPress={handlePreview}
              activeOpacity={0.8}
            >
              <Ionicons name="eye-outline" size={16} color={Colors.accent} />
              <Text style={s.previewBtnText}>加入ページをプレビュー</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.accent} />
            </TouchableOpacity>
          )}

          <View style={s.noticeBox}>
            <Ionicons name="information-circle-outline" size={15} color={Colors.textLight} />
            <Text style={s.noticeText}>
              料金変更は新規加入者から適用されます。既存メンバーには影響しません。
            </Text>
          </View>

        </ScrollView>
      </View>

      {/* ═══════════════════════════════════════════════
          アイコンピッカーモーダル
      ═══════════════════════════════════════════════ */}
      <Modal
        visible={iconPickerIdx !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setIconPickerIdx(null)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { maxWidth: 360 }]}>
            <Text style={s.sectionTitle}>アイコンを選択</Text>
            <View style={s.iconGrid}>
              {ICON_OPTIONS.map(icon => {
                const selected = iconPickerIdx !== null && benefits[iconPickerIdx]?.icon === icon
                return (
                  <TouchableOpacity
                    key={icon}
                    style={[s.iconOption, selected && s.iconOptionSelected]}
                    onPress={() => iconPickerIdx !== null && updateBenefitIcon(iconPickerIdx, icon)}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={icon as any}
                      size={22}
                      color={selected ? Colors.white : Colors.text}
                    />
                  </TouchableOpacity>
                )
              })}
            </View>
            <TouchableOpacity style={s.modalCancelBtn} onPress={() => setIconPickerIdx(null)}>
              <Text style={s.modalCancelBtnText}>キャンセル</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════
          公開確認モーダル（ON にするとき）
      ═══════════════════════════════════════════════ */}
      <Modal
        visible={showActivateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActivateModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Ionicons name="star" size={22} color={Colors.accent} />
              <Text style={[s.modalTitle, { color: Colors.accent }]}>
                {activateIsCancelClose ? '閉鎖をキャンセルして再公開' : 'メンバーシップを公開する'}
              </Text>
            </View>
            <View style={[s.modalInfoBox, { backgroundColor: '#FDF6EE', borderColor: '#F0DCBB' }]}>
              <Text style={s.modalInfoText}>
                {activateIsCancelClose
                  ? `閉鎖スケジュール（${formatDate(closeDate!)}）を取り消し、メンバーシップを再公開します。\n\n新規加入が再び可能になります。`
                  : 'メンバーシップを公開します。フォロワーが加入できるようになります。\n\n⚠ オフにする場合は1ヶ月後に閉鎖されます。既存メンバーへの通知が送られます。'}
              </Text>
            </View>
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowActivateModal(false)}>
                <Text style={s.modalCancelBtnText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirmBtn, { backgroundColor: Colors.accent }]}
                onPress={handleConfirmActivate}
              >
                <Text style={s.modalConfirmBtnText}>
                  {activateIsCancelClose ? '再公開する' : '公開する'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════
          閉鎖確認モーダル
      ═══════════════════════════════════════════════ */}
      <Modal
        visible={showCloseModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCloseModal(false)}
      >
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.modalCard}>
              <View style={s.modalHeader}>
                <Ionicons name="warning" size={22} color="#D32F2F" />
                <Text style={s.modalTitle}>メンバーシップを非公開にする</Text>
              </View>
              <View style={s.modalInfoBox}>
                <Text style={s.modalInfoText}>
                  非公開にすると新規加入ができなくなり、{'\n'}
                  <Text style={s.modalInfoBold}>{formatDate(scheduledCloseDate)}</Text>
                  {' '}に既存メンバーのサブスクリプションも自動的に閉鎖されます。{'\n\n'}
                  閉鎖のタイミングで会員全員へ下記のメッセージが通知されます。
                </Text>
              </View>
              <Text style={s.modalFieldLabel}>
                会員への連絡メッセージ
                <Text style={s.modalRequired}> ＊必須</Text>
              </Text>
              <TextInput
                style={s.modalTextarea}
                value={modalMessage}
                onChangeText={setModalMessage}
                placeholder="例: いつもご利用ありがとうございます。メンバーシップを終了することとなりました..."
                placeholderTextColor={Colors.textLight}
                multiline numberOfLines={5} textAlignVertical="top" maxLength={500}
              />
              <Text style={s.modalCharCount}>{modalMessage.length} / 500</Text>
              <View style={s.modalBtns}>
                <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowCloseModal(false)} disabled={closeSaving}>
                  <Text style={s.modalCancelBtnText}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.modalConfirmBtn, closeSaving && { opacity: 0.5 }]}
                  onPress={handleConfirmClose}
                  disabled={closeSaving}
                >
                  {closeSaving
                    ? <ActivityIndicator size="small" color={Colors.white} />
                    : <Text style={s.modalConfirmBtnText}>閉鎖をスケジュールする</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
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
  headerTitle: { fontSize: 24, fontWeight: '700', color: Colors.text },
  saveBtn: { backgroundColor: Colors.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 7, minWidth: 52, alignItems: 'center' },
  saveBtnOff: { opacity: 0.5 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  content: { padding: 16, gap: 14, paddingBottom: 48 },

  statCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 16,
  },
  statNum: { fontSize: 22, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 12, color: Colors.textLight },

  connectCard: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 10,
  },
  connectHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  connectDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border,
  },
  connectDotActive: { backgroundColor: '#22c55e' },
  connectTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, flex: 1 },
  connectBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#22c55e', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  connectBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  connectDesc: { fontSize: 12, color: Colors.textLight, lineHeight: 19 },
  connectBtn: {
    backgroundColor: Colors.accent, borderRadius: 10,
    paddingVertical: 12, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, marginTop: 4,
  },
  connectBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  closeWarningCard: {
    backgroundColor: '#FFF3F3', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#F44336', padding: 16, gap: 10,
  },
  closeWarningHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  closeWarningTitle: { fontSize: 14, fontWeight: '800', color: '#D32F2F' },
  closeWarningDate: { fontSize: 13, color: Colors.text },
  closeWarningDateBold: { fontWeight: '800', color: '#D32F2F' },
  closeWarningMsg: { fontSize: 12, color: Colors.textLight, lineHeight: 18 },
  cancelCloseBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.white, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.accent,
    paddingHorizontal: 12, paddingVertical: 9, alignSelf: 'flex-start',
  },
  cancelCloseBtnText: { fontSize: 13, fontWeight: '700', color: Colors.accent },

  section: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  sectionDesc: { fontSize: 12, color: Colors.textLight, marginTop: -6 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowInfo: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  rowDesc: { fontSize: 12, color: Colors.textLight },

  priceGrid: { flexDirection: 'row', gap: 10 },
  priceCard: {
    flex: 1, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background,
    paddingVertical: 16, paddingHorizontal: 8,
    alignItems: 'center', gap: 2, position: 'relative',
  },
  priceCardSelected: { borderColor: Colors.accent, backgroundColor: '#FDF6EE' },
  priceCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  priceLabel: { fontSize: 18, fontWeight: '900', color: Colors.textLight, letterSpacing: -0.5 },
  priceLabelSelected: { color: Colors.accent },
  priceMonth: { fontSize: 10, color: Colors.textLight },

  // 特典行
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitIconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FDF6EE', borderWidth: 1.5, borderColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  benefitIconBtnOptional: {
    backgroundColor: Colors.background, borderColor: Colors.border, borderStyle: 'dashed',
  },
  benefitInput: {
    flex: 1, backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.text,
  },
  benefitInputOptional: { borderStyle: 'dashed' },

  textarea: {
    backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: Colors.text, lineHeight: 22, minHeight: 80,
  },
  charCount: { fontSize: 11, color: Colors.textLight, textAlign: 'right', marginTop: -6 },

  previewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.accent,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  previewBtnText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.accent },

  noticeBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.white, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  noticeText: { flex: 1, fontSize: 12, color: Colors.textLight, lineHeight: 18 },

  // アイコングリッド
  iconGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8,
    justifyContent: 'center',
  },
  iconOption: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: Colors.background,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  iconOptionSelected: {
    backgroundColor: Colors.accent, borderColor: Colors.accent,
  },

  // モーダル共通
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalCard: {
    backgroundColor: Colors.white, borderRadius: 20, padding: 24,
    width: '100%', maxWidth: 440, gap: 16,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#D32F2F', flex: 1 },
  modalInfoBox: {
    backgroundColor: '#FFF3F3', borderRadius: 10,
    borderWidth: 1, borderColor: '#FFCDD2', padding: 14,
  },
  modalInfoText: { fontSize: 13, color: Colors.text, lineHeight: 20 },
  modalInfoBold: { fontWeight: '800', color: '#D32F2F' },
  modalFieldLabel: { fontSize: 13, fontWeight: '700', color: Colors.text },
  modalRequired: { color: '#D32F2F', fontWeight: '700' },
  modalTextarea: {
    backgroundColor: Colors.background, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: Colors.text, lineHeight: 22, minHeight: 120,
  },
  modalCharCount: { fontSize: 11, color: Colors.textLight, textAlign: 'right', marginTop: -10 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border,
    paddingVertical: 14, alignItems: 'center',
  },
  modalCancelBtnText: { fontSize: 14, fontWeight: '700', color: Colors.textLight },
  modalConfirmBtn: {
    flex: 2, borderRadius: 12, backgroundColor: '#D32F2F',
    paddingVertical: 14, alignItems: 'center',
  },
  modalConfirmBtnText: { fontSize: 14, fontWeight: '800', color: Colors.white },
})
