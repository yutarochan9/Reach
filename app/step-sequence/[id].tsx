import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, KeyboardAvoidingView, Platform, useWindowDimensions
} from 'react-native'
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

type StepMessage = {
  id: string
  day_offset: number
  content: string
  sort_order: number
}

// 固定の日数選択肢（カスタム入力は別途 UI で対応）
const DAY_OPTIONS = [0, 1, 3, 7, 30]

function dayLabel(offset: number) {
  return offset === 0 ? 'フォロー直後' : `${offset}日後`
}

function groupByDay(msgs: StepMessage[]): { day: number; items: StepMessage[] }[] {
  const map = new Map<number, StepMessage[]>()
  for (const m of msgs) {
    if (!map.has(m.day_offset)) map.set(m.day_offset, [])
    map.get(m.day_offset)!.push(m)
  }
  const days = [...map.keys()].sort((a, b) => a - b)
  return days.map(day => ({
    day,
    items: map.get(day)!.sort((a, b) => a.sort_order - b.sort_order),
  }))
}

export default function StepSequenceEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { width } = useWindowDimensions()
  const isWide = width >= 768   // タブレット/PCはサイドバイサイド、スマホはエディタのみ
  const [name, setName] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [messages, setMessages] = useState<StepMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingMsg, setEditingMsg] = useState<Partial<StepMessage> | null>(null)
  const [saving, setSaving] = useState(false)
  // カスタム日数入力
  const [customDayInput, setCustomDayInput] = useState('')
  const [showCustomDay, setShowCustomDay] = useState(false)
  // 時点追加モーダル
  const [dayPickerVisible, setDayPickerVisible] = useState(false)
  // スマホ用プレビュー表示タブ
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor')

  const load = useCallback(async () => {
    const [{ data: seq }, { data: msgs }] = await Promise.all([
      supabase.from('step_sequences').select('name').eq('id', id).single(),
      supabase.from('step_messages').select('*').eq('sequence_id', id).order('day_offset').order('sort_order'),
    ])
    setName(seq?.name ?? '')
    setMessages(msgs ?? [])
    setLoading(false)
  }, [id])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const openNew = (day: number) => {
    setEditingMsg({ day_offset: day, content: '' })
    // DAY_OPTIONSにない値はカスタム入力として扱う
    const isCustom = !DAY_OPTIONS.includes(day)
    setShowCustomDay(isCustom)
    setCustomDayInput(isCustom ? String(day) : '')
    setModalVisible(true)
  }

  const openEdit = (msg: StepMessage) => {
    setEditingMsg({ ...msg })
    const isCustom = !DAY_OPTIONS.includes(msg.day_offset)
    setShowCustomDay(isCustom)
    setCustomDayInput(isCustom ? String(msg.day_offset) : '')
    setModalVisible(true)
  }

  const handleSave = async () => {
    if (!editingMsg?.content?.trim()) return
    setSaving(true)

    if (editingMsg.id) {
      await supabase.from('step_messages').update({
        day_offset: editingMsg.day_offset,
        content: editingMsg.content.trim(),
      }).eq('id', editingMsg.id)
    } else {
      // sort_order は同日内の最大値 + 1
      const sameDayMsgs = messages.filter(m => m.day_offset === editingMsg.day_offset)
      const nextOrder = sameDayMsgs.length > 0
        ? Math.max(...sameDayMsgs.map(m => m.sort_order)) + 1
        : 0
      await supabase.from('step_messages').insert({
        sequence_id: id,
        day_offset: editingMsg.day_offset ?? 0,
        content: editingMsg.content?.trim(),
        sort_order: nextOrder,
      })
    }

    setSaving(false)
    setModalVisible(false)
    setEditingMsg(null)
    load()
  }

  const handleDelete = (msg: StepMessage) => {
    Alert.alert('削除', 'このメッセージを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          await supabase.from('step_messages').delete().eq('id', msg.id)
          setMessages(prev => prev.filter(m => m.id !== msg.id))
        },
      },
    ])
  }

  // 同日内の順番を上下に入れ替え
  const moveMessage = async (msg: StepMessage, dir: 'up' | 'down') => {
    const sameDayMsgs = messages
      .filter(m => m.day_offset === msg.day_offset)
      .sort((a, b) => a.sort_order - b.sort_order)
    const idx = sameDayMsgs.findIndex(m => m.id === msg.id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sameDayMsgs.length) return

    const target = sameDayMsgs[swapIdx]
    const newOrderA = target.sort_order
    const newOrderB = msg.sort_order

    await Promise.all([
      supabase.from('step_messages').update({ sort_order: newOrderA }).eq('id', msg.id),
      supabase.from('step_messages').update({ sort_order: newOrderB }).eq('id', target.id),
    ])

    setMessages(prev => prev.map(m => {
      if (m.id === msg.id) return { ...m, sort_order: newOrderA }
      if (m.id === target.id) return { ...m, sort_order: newOrderB }
      return m
    }))
  }

  // まだ使っていない日を返す（時点追加用）
  const usedDays = new Set(messages.map(m => m.day_offset))
  const availableDays = DAY_OPTIONS.filter(d => !usedDays.has(d))

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  const grouped = groupByDay(messages)

  // ── プレビュー用チャット ────────────────────────────────
  const Preview = (
    <View style={isWide ? styles.previewPanel : styles.previewPanelMobile}>
      <Text style={styles.previewTitle}>プレビュー</Text>
      <View style={styles.phoneFrame}>
        <View style={styles.phoneHeader}>
          <View style={styles.phoneAvatar}><Text style={styles.phoneAvatarText}>R</Text></View>
          <View>
            <Text style={styles.phoneHeaderName}>クリエイター名</Text>
            <Text style={styles.phoneHeaderSub}>配信アカウント</Text>
          </View>
        </View>
        <ScrollView style={styles.phoneChat} contentContainerStyle={styles.phoneChatContent}>
          {grouped.length === 0 ? (
            <View style={styles.emptyPreview}>
              <Text style={styles.emptyPreviewText}>メッセージを追加すると{'\n'}ここに表示されます</Text>
            </View>
          ) : grouped.map((group, gi) => (
            <View key={group.day}>
              <View style={styles.dateBadge}>
                <Text style={styles.dateBadgeText}>{dayLabel(group.day)}</Text>
              </View>
              {group.items.map((msg, mi) => (
                <View key={msg.id} style={styles.bubbleRow}>
                  {mi === 0 && (
                    <View style={styles.bubbleAvatar}><Text style={styles.bubbleAvatarText}>R</Text></View>
                  )}
                  {mi > 0 && <View style={{ width: 30 }} />}
                  <View style={styles.bubbleWrap}>
                    <View style={styles.bubble}>
                      <Text style={styles.bubbleText}>{msg.content}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  )

  // ── タイムラインエディタ ─────────────────────────────────
  const Editor = (
    <ScrollView style={styles.editorPanel} contentContainerStyle={styles.editorContent}>
      {grouped.length === 0 ? (
        <View style={styles.emptyEditor}>
          <Ionicons name="git-branch-outline" size={40} color={Colors.border} />
          <Text style={styles.emptyTitle}>メッセージがありません</Text>
          <Text style={styles.emptyDesc}>フォロー後のタイミングを設定して{'\n'}自動メッセージを追加してください</Text>
          <TouchableOpacity style={styles.addFirstBtn} onPress={() => openNew(0)}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addFirstBtnText}>フォロー直後のメッセージを追加</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {grouped.map((group, gi) => (
            <View key={group.day} style={styles.dayGroup}>
              {/* タイムライン縦線 */}
              {gi > 0 && <View style={styles.timelineLine} />}

              {/* 日ラベル */}
              <View style={styles.dayHeader}>
                <View style={styles.dayDot} />
                <View style={styles.dayBadge}>
                  <Ionicons name="time-outline" size={13} color={Colors.accent} />
                  <Text style={styles.dayBadgeText}>{dayLabel(group.day)}</Text>
                </View>
              </View>

              {/* メッセージカード */}
              <View style={styles.msgList}>
                {group.items.map((msg, mi) => (
                  <View key={msg.id} style={styles.msgRow}>
                    {/* 順番バッジ */}
                    <View style={styles.orderBadge}>
                      <Text style={styles.orderNum}>{mi + 1}</Text>
                    </View>
                    {/* カード */}
                    <TouchableOpacity
                      style={styles.msgCard}
                      onPress={() => openEdit(msg)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.msgContent} numberOfLines={3}>{msg.content}</Text>
                    </TouchableOpacity>
                    {/* 操作ボタン */}
                    <View style={styles.msgActions}>
                      <TouchableOpacity
                        onPress={() => moveMessage(msg, 'up')}
                        disabled={mi === 0}
                        style={[styles.moveBtn, mi === 0 && { opacity: 0.25 }]}
                      >
                        <Ionicons name="chevron-up" size={16} color={Colors.textLight} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => moveMessage(msg, 'down')}
                        disabled={mi === group.items.length - 1}
                        style={[styles.moveBtn, mi === group.items.length - 1 && { opacity: 0.25 }]}
                      >
                        <Ionicons name="chevron-down" size={16} color={Colors.textLight} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(msg)} style={styles.deleteBtn}>
                        <Ionicons name="trash-outline" size={15} color="#E53E3E" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                {/* この時点にメッセージを追加 */}
                <TouchableOpacity style={styles.addMsgBtn} onPress={() => openNew(group.day)}>
                  <Ionicons name="add" size={15} color={Colors.accent} />
                  <Text style={styles.addMsgText}>このタイミングにメッセージを追加</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* 新しい時点を追加 */}
          {availableDays.length > 0 && (
            <TouchableOpacity
              style={styles.addDayBtn}
              onPress={() => setDayPickerVisible(true)}
            >
              <Ionicons name="add-circle-outline" size={18} color={Colors.accent} />
              <Text style={styles.addDayText}>新しいタイミングを追加</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </ScrollView>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/step-sequences' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <TextInput
          style={styles.headerTitle}
          value={name}
          onChangeText={setName}
          placeholder="シーケンス名"
          placeholderTextColor={Colors.textLight}
          returnKeyType="done"
          selectTextOnFocus
        />
        <TouchableOpacity
          style={styles.addButton}
          onPress={async () => {
            if (!name.trim()) return
            setNameSaving(true)
            await supabase.from('step_sequences').update({ name: name.trim() }).eq('id', id)
            setNameSaving(false)
            router.replace('/step-sequences' as any)
          }}
          disabled={nameSaving}
        >
          {nameSaving
            ? <ActivityIndicator size="small" color={Colors.accent} />
            : <Text style={styles.saveButtonText}>保存</Text>
          }
        </TouchableOpacity>
      </View>

      {isWide ? (
        // PC/タブレット: エディタ + プレビューを横並び
        <View style={styles.bodyRow}>
          {Editor}
          {Preview}
        </View>
      ) : (
        // スマホ: タブで切り替え
        <View style={{ flex: 1 }}>
          <View style={styles.mobileTabBar}>
            <TouchableOpacity
              style={[styles.mobileTab, mobileTab === 'editor' && styles.mobileTabActive]}
              onPress={() => setMobileTab('editor')}
            >
              <Text style={[styles.mobileTabText, mobileTab === 'editor' && styles.mobileTabTextActive]}>編集</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mobileTab, mobileTab === 'preview' && styles.mobileTabActive]}
              onPress={() => setMobileTab('preview')}
            >
              <Text style={[styles.mobileTabText, mobileTab === 'preview' && styles.mobileTabTextActive]}>プレビュー</Text>
            </TouchableOpacity>
          </View>
          {mobileTab === 'editor' ? Editor : Preview}
        </View>
      )}

      {/* メッセージ編集モーダル */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => { setModalVisible(false); setEditingMsg(null) }}>
                <Text style={styles.modalCancel}>キャンセル</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{editingMsg?.id ? '編集' : '新しいメッセージ'}</Text>
              <TouchableOpacity
                onPress={handleSave}
                disabled={!editingMsg?.content?.trim() || saving}
              >
                <Text style={[styles.modalSave, (!editingMsg?.content?.trim() || saving) && { opacity: 0.4 }]}>
                  {saving ? '保存中' : '保存'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.fieldLabel}>送信タイミング</Text>
              <View style={styles.daySelector}>
                {DAY_OPTIONS.map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.dayChip, !showCustomDay && editingMsg?.day_offset === d && styles.dayChipActive]}
                    onPress={() => { setShowCustomDay(false); setCustomDayInput(''); setEditingMsg(prev => ({ ...prev, day_offset: d })) }}
                  >
                    <Text style={[styles.dayChipText, !showCustomDay && editingMsg?.day_offset === d && styles.dayChipTextActive]}>
                      {d === 0 ? '直後' : `${d}日後`}
                    </Text>
                  </TouchableOpacity>
                ))}
                {/* カスタム日数チップ */}
                <TouchableOpacity
                  style={[styles.dayChip, showCustomDay && styles.dayChipActive]}
                  onPress={() => { setShowCustomDay(true); setCustomDayInput('') }}
                >
                  <Text style={[styles.dayChipText, showCustomDay && styles.dayChipTextActive]}>日にち選択</Text>
                </TouchableOpacity>
              </View>
              {showCustomDay && (
                <View style={styles.customDayRow}>
                  <TextInput
                    style={styles.customDayInput}
                    value={customDayInput}
                    onChangeText={v => {
                      const n = v.replace(/[^0-9]/g, '')
                      setCustomDayInput(n)
                      const num = parseInt(n, 10)
                      if (!isNaN(num) && num >= 0) {
                        setEditingMsg(prev => ({ ...prev, day_offset: num }))
                      }
                    }}
                    placeholder="例: 14"
                    keyboardType="number-pad"
                    placeholderTextColor={Colors.textLight}
                  />
                  <Text style={styles.customDayUnit}>日後に送信</Text>
                </View>
              )}
              <Text style={styles.fieldLabel}>メッセージ内容</Text>
              <TextInput
                style={styles.textarea}
                placeholder="送信するメッセージを入力..."
                placeholderTextColor={Colors.textLight}
                value={editingMsg?.content ?? ''}
                onChangeText={text => setEditingMsg(prev => ({ ...prev, content: text }))}
                multiline
                textAlignVertical="top"
                autoFocus={!editingMsg?.id}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 時点選択モーダル */}
      <Modal visible={dayPickerVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setDayPickerVisible(false)}
        >
          <TouchableOpacity style={styles.dayPickerBox} activeOpacity={1} onPress={() => {}}>
            <Text style={styles.dayPickerTitle}>追加するタイミングを選択</Text>
            {availableDays.map(d => (
              <TouchableOpacity
                key={d}
                style={styles.dayPickerItem}
                onPress={() => { setDayPickerVisible(false); openNew(d) }}
              >
                <Ionicons name="time-outline" size={18} color={Colors.accent} />
                <Text style={styles.dayPickerItemText}>{dayLabel(d)}</Text>
              </TouchableOpacity>
            ))}
            {/* 日にちを直接入力 */}
            <View style={[styles.dayPickerItem, { borderBottomWidth: 0, flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="create-outline" size={18} color={Colors.accent} />
                <Text style={styles.dayPickerItemText}>日にちを指定</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 26 }}>
                <TextInput
                  style={[styles.customDayInput, { width: 80 }]}
                  value={customDayInput}
                  onChangeText={v => setCustomDayInput(v.replace(/[^0-9]/g, ''))}
                  placeholder="例: 14"
                  keyboardType="number-pad"
                  placeholderTextColor={Colors.textLight}
                  returnKeyType="done"
                />
                <Text style={{ fontSize: 14, color: Colors.textLight }}>日後</Text>
                <TouchableOpacity
                  style={{ backgroundColor: Colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                  onPress={() => {
                    const n = parseInt(customDayInput, 10)
                    if (!isNaN(n) && n >= 0) { setCustomDayInput(''); setDayPickerVisible(false); openNew(n) }
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>追加</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.text, textAlign: 'center', paddingVertical: 4, paddingHorizontal: 8 },
  addButton: { padding: 4, minWidth: 40, alignItems: 'flex-end', justifyContent: 'center' },
  saveButtonText: { fontSize: 15, fontWeight: '700', color: Colors.accent },

  bodyRow: { flex: 1, flexDirection: 'row' },

  // スマホ用タブ
  mobileTabBar: {
    flexDirection: 'row', backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  mobileTab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  mobileTabActive: { borderBottomColor: Colors.accent },
  mobileTabText: { fontSize: 14, fontWeight: '600', color: Colors.textLight },
  mobileTabTextActive: { color: Colors.accent },

  // ── エディタ（左） ─────────────────────────────────────
  editorPanel: { flex: 1, borderRightWidth: 1, borderRightColor: Colors.border },
  editorContent: { padding: 16, paddingBottom: 40 },

  emptyEditor: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  emptyDesc: { fontSize: 13, color: Colors.textLight, textAlign: 'center', lineHeight: 20 },
  addFirstBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
    backgroundColor: Colors.accent, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12,
  },
  addFirstBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // タイムライングループ
  dayGroup: { marginBottom: 4 },
  timelineLine: { width: 2, height: 20, backgroundColor: Colors.border, marginLeft: 16, marginBottom: 0 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  dayDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.accent, marginLeft: 10 },
  dayBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.accent + '18', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  dayBadgeText: { fontSize: 13, fontWeight: '700', color: Colors.accent },

  msgList: { paddingLeft: 34, gap: 8, marginBottom: 8 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  orderBadge: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 10,
  },
  orderNum: { fontSize: 11, fontWeight: '800', color: Colors.textLight },
  msgCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 12,
  },
  msgContent: { fontSize: 13, color: Colors.text, lineHeight: 19 },
  msgActions: { gap: 2, paddingTop: 6 },
  moveBtn: { padding: 3 },
  deleteBtn: { padding: 3, marginTop: 2 },

  addMsgBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.accent, borderStyle: 'dashed',
    alignSelf: 'flex-start',
  },
  addMsgText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  addDayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 14, borderRadius: 12, marginTop: 12,
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
    justifyContent: 'center',
  },
  addDayText: { fontSize: 14, color: Colors.accent, fontWeight: '600' },

  // ── プレビュー（右） ────────────────────────────────────
  previewPanel: { width: 300, padding: 16, gap: 8 },
  previewPanelMobile: { flex: 1, padding: 16, gap: 8 },
  previewTitle: { fontSize: 13, fontWeight: '700', color: Colors.textLight },
  phoneFrame: {
    flex: 1, backgroundColor: '#F0F0F0', borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border, minHeight: 400,
  },
  phoneHeader: {
    backgroundColor: Colors.white, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  phoneAvatar: {
    width: 34, height: 34, borderRadius: 7,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center',
  },
  phoneAvatarText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  phoneHeaderName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  phoneHeaderSub: { fontSize: 10, color: Colors.textLight },
  phoneChat: { flex: 1 },
  phoneChatContent: { padding: 12, gap: 4 },
  dateBadge: { alignItems: 'center', marginVertical: 8 },
  dateBadgeText: {
    fontSize: 11, color: Colors.textLight,
    backgroundColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
  },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 4 },
  bubbleAvatar: {
    width: 28, height: 28, borderRadius: 6,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  bubbleAvatarText: { fontSize: 11, fontWeight: '700', color: Colors.white },
  bubbleWrap: { flex: 1 },
  bubble: {
    backgroundColor: Colors.white, borderRadius: 14, borderTopLeftRadius: 4, overflow: 'hidden',
    alignSelf: 'flex-start', maxWidth: '90%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  bubbleText: { fontSize: 13, color: Colors.text, lineHeight: 19, padding: 10 },
  emptyPreview: { paddingTop: 40, alignItems: 'center' },
  emptyPreviewText: { fontSize: 12, color: Colors.textLight, textAlign: 'center', lineHeight: 20 },

  // ── モーダル ───────────────────────────────────────────
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    backgroundColor: Colors.header, paddingTop: 36, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalCancel: { fontSize: 16, color: Colors.textLight },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  modalSave: { fontSize: 16, color: Colors.accent, fontWeight: '700' },
  modalBody: { padding: 16, gap: 12, flex: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  daySelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  dayChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  dayChipText: { fontSize: 13, color: Colors.textLight, fontWeight: '600' },
  dayChipTextActive: { color: '#fff' },
  // カスタム日数入力
  customDayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  customDayInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 15, color: Colors.text, backgroundColor: Colors.white,
    width: 80,
  },
  customDayUnit: { fontSize: 14, color: Colors.textLight },
  textarea: {
    flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    padding: 14, fontSize: 15, color: Colors.text, backgroundColor: Colors.white,
    minHeight: 160,
  },

  // 時点選択
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 },
  dayPickerBox: { backgroundColor: Colors.white, borderRadius: 18, padding: 20, gap: 4 },
  dayPickerTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  dayPickerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  dayPickerItemText: { fontSize: 15, color: Colors.text, fontWeight: '600' },
})
