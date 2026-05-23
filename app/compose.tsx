import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  Alert, useWindowDimensions, Image, ActivityIndicator, FlatList
} from 'react-native'
import { BETA_MODE } from '../constants/config'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'
import { sendPushToUsers } from '../lib/notifications'

// ─── 型定義 ────────────────────────────────────────────────
type Block = {
  id: string
  text: string
  imageUri: string | null
  imageUrl: string | null
  uploading: boolean
}

type Target = 'all' | 'week' | 'month' | 'tag'

type DraftItem = {
  id: string
  content: string
  status: 'draft' | 'scheduled'
  scheduled_at: string | null
  target: string
  block_order: number
  image_url: string | null
  created_at: string
}

const TARGET_OPTIONS: { value: Target; label: string; desc: string }[] = [
  { value: 'all',   label: '全員',    desc: 'フォロワー全員に届けます' },
  { value: 'week',  label: '直近7日', desc: '7日以内にフォローした人' },
  { value: 'month', label: '直近30日',desc: '30日以内にフォローした人' },
]

function genId() { return Math.random().toString(36).slice(2) }
function genUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// ─── メインコンポーネント ────────────────────────────────────
export default function ComposeScreen() {
  // タブ
  const [activeTab, setActiveTab] = useState<'new' | 'drafts' | 'tools'>('new')

  // 新規配信
  const [blocks, setBlocks] = useState<Block[]>([{ id: genId(), text: '', imageUri: null, imageUrl: null, uploading: false }])
  const [target, setTarget] = useState<Target>('all')
  const [selectedTag, setSelectedTag] = useState<string>('')
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [scheduledAt, setScheduledAt] = useState('')
  const [showSchedule, setShowSchedule] = useState(false)
  const [showTarget, setShowTarget] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [publicReactions, setPublicReactions] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // 下書き・予約
  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const [draftsLoading, setDraftsLoading] = useState(false)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [draftCount, setDraftCount] = useState(0)

  // 共通
  const [senderName, setSenderName] = useState('')
  const [userId, setUserId] = useState('')
  const [userPlan, setUserPlan] = useState<'free' | 'standard' | 'pro'>('free')
  const [monthlyCount, setMonthlyCount] = useState(0)
  const { width } = useWindowDimensions()
  const isWide = width >= 768

  const FREE_LIMIT = 50

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      supabase.from('profiles').select('display_name, plan').eq('id', user.id).single()
        .then(({ data }) => {
          setSenderName(data?.display_name ?? '')
          setUserPlan((data?.plan ?? 'free') as 'free' | 'standard' | 'pro')
          // プロプランの場合タグ一覧を取得
          if (BETA_MODE || data?.plan === 'pro') {
            supabase.from('follower_tags').select('tag').eq('creator_id', user.id)
              .then(({ data: tags }) => {
                const unique = [...new Set((tags ?? []).map((t: any) => t.tag))]
                setAvailableTags(unique)
              })
          }
        })
      // 今月の配信数を取得
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)
      supabase.from('broadcasts')
        .select('id', { count: 'exact', head: true })
        .eq('sender_id', user.id)
        .eq('status', 'published')
        .gte('created_at', startOfMonth.toISOString())
        .then(({ count }) => setMonthlyCount(count ?? 0))
    })
  }, [])

  // 画面フォーカス時に下書き件数を更新
  useFocusEffect(useCallback(() => {
    if (!userId) return
    supabase.from('broadcasts').select('id', { count: 'exact', head: true })
      .eq('sender_id', userId).in('status', ['draft', 'scheduled'])
      .then(({ count }) => setDraftCount(count ?? 0))
    // スケジュール済みで時刻が来たものを公開
    supabase.from('broadcasts')
      .update({ status: 'published' })
      .eq('sender_id', userId).eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
      .then(() => {})
  }, [userId]))

  // ─── 下書き読み込み ──────────────────────────────────────
  const loadDrafts = useCallback(async () => {
    if (!userId) return
    setDraftsLoading(true)
    const { data } = await supabase
      .from('broadcasts')
      .select('id, content, status, scheduled_at, target, block_order, image_url, created_at')
      .eq('sender_id', userId)
      .in('status', ['draft', 'scheduled'])
      .order('created_at', { ascending: false })
    setDrafts((data ?? []) as DraftItem[])
    setDraftCount((data ?? []).length)
    setDraftsLoading(false)
  }, [userId])

  useEffect(() => {
    if (activeTab === 'drafts' && userId) loadDrafts()
  }, [activeTab, userId, loadDrafts])

  // ─── 下書き操作 ──────────────────────────────────────────
  const handlePublishDraft = async (item: DraftItem) => {
    setPublishingId(item.id)
    const { error } = await supabase
      .from('broadcasts')
      .update({ status: 'published', scheduled_at: null })
      .eq('id', item.id)

    if (error) {
      Alert.alert('エラー', error.message)
      setPublishingId(null)
      return
    }

    // フォロワーにプッシュ通知
    const targetVal = (item.target ?? 'all') as Target
    let q = supabase.from('follows').select('follower_id').eq('following_id', userId)
    if (targetVal === 'week') q = q.gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
    if (targetVal === 'month') q = q.gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
    const { data: follows } = await q
    const followerIds = (follows ?? []).map((f: any) => f.follower_id)
    if (followerIds.length > 0) {
      sendPushToUsers(followerIds, senderName, item.content.slice(0, 80))
    }

    setPublishingId(null)
    loadDrafts()
    Alert.alert('配信完了', '配信しました')
  }

  const handleDeleteDraft = (item: DraftItem) => {
    Alert.alert('削除', 'この下書きを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive', onPress: async () => {
          await supabase.from('broadcasts').delete().eq('id', item.id)
          loadDrafts()
        },
      },
    ])
  }

  // ─── 新規配信操作 ─────────────────────────────────────────
  const hasContent = blocks.some(b => b.text.trim() || b.imageUrl)

  const updateBlock = (id: string, patch: Partial<Block>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))
    if ('text' in patch) setConfirmed(false)
  }

  const addBlock = () => {
    setBlocks(prev => [...prev, { id: genId(), text: '', imageUri: null, imageUrl: null, uploading: false }])
  }

  const removeBlock = (id: string) => {
    if (blocks.length === 1) return
    setBlocks(prev => prev.filter(b => b.id !== id))
  }

  const pickImage = async (blockId: string) => {
    if (!userId) { Alert.alert('エラー', 'ログイン情報を読み込み中です'); return }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('許可が必要です', 'フォトライブラリへのアクセスを許可してください'); return }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    updateBlock(blockId, { imageUri: asset.uri, uploading: true })

    try {
      const mimeType = asset.mimeType ?? 'image/jpeg'
      const rawExt = asset.uri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg'
      const ext = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(rawExt) ? rawExt : 'jpg'
      const path = `${userId}/${Date.now()}.${ext}`
      const blob = await (await fetch(asset.uri)).blob()
      const { error } = await supabase.storage.from('broadcast-images').upload(path, blob, { contentType: mimeType, upsert: true })
      if (error) { Alert.alert('アップロードエラー', error.message); updateBlock(blockId, { uploading: false }); return }
      const { data: { publicUrl } } = supabase.storage.from('broadcast-images').getPublicUrl(path)
      updateBlock(blockId, { imageUrl: publicUrl, uploading: false })
    } catch (e: any) {
      Alert.alert('エラー', e?.message ?? '画像のアップロードに失敗しました')
      updateBlock(blockId, { uploading: false })
    }
  }

  const removeImage = (blockId: string) => updateBlock(blockId, { imageUri: null, imageUrl: null })

  const getTargetFollowers = async (): Promise<string[]> => {
    if (target === 'tag' && selectedTag) {
      const { data } = await supabase
        .from('follower_tags')
        .select('follower_id')
        .eq('creator_id', userId)
        .eq('tag', selectedTag)
      return (data ?? []).map((f: any) => f.follower_id)
    }
    let q = supabase.from('follows').select('follower_id').eq('following_id', userId)
    if (target === 'week') q = q.gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
    if (target === 'month') q = q.gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
    const { data } = await q
    return (data ?? []).map((f: any) => f.follower_id)
  }

  const parseScheduledAt = (): Date | null => {
    if (!scheduledAt.trim()) return null
    const m = scheduledAt.trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})$/)
    if (!m) return null
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
    return isNaN(d.getTime()) ? null : d
  }

  const handlePost = async (asDraft = false) => {
    if (!hasContent || !userId) return

    // 無料プランの月50回制限チェック（下書きは除外・ベータ期間中はスキップ）
    if (!BETA_MODE && !asDraft && userPlan === 'free' && monthlyCount >= FREE_LIMIT) {
      Alert.alert(
        '今月の配信上限に達しました',
        `無料プランは月${FREE_LIMIT}回まで配信できます。\nスタンダードプランにアップグレードすると無制限になります。`,
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: 'プランを見る', onPress: () => router.push('/plan' as any) },
        ]
      )
      return
    }

    if (!asDraft && scheduledAt.trim()) {
      const parsed = parseScheduledAt()
      if (!parsed) { Alert.alert('日時の形式が正しくありません', '例: 2026/05/20 14:00'); return }
      if (parsed <= new Date()) { Alert.alert('過去の日時は設定できません', '未来の日時を入力してください'); return }
    }
    asDraft ? setSaving(true) : setLoading(true)
    const scheduledDate = !asDraft ? parseScheduledAt() : null
    const status = asDraft ? 'draft' : scheduledDate ? 'scheduled' : 'published'
    const readyBlocks = blocks.filter(b => b.text.trim() || b.imageUrl)
    const groupId = readyBlocks.length > 1 ? genUUID() : null
    const inserts = readyBlocks.map((b, i) => ({
      sender_id: userId, content: b.text.trim() || '　',
      image_url: b.imageUrl ?? null, block_order: i,
      status, scheduled_at: scheduledDate?.toISOString() ?? null, target,
      group_id: groupId,
      public_reactions: (BETA_MODE || userPlan === 'standard' || userPlan === 'pro') ? publicReactions : false,
    }))
    const { error } = await supabase.from('broadcasts').insert(inserts)
    if (error) { Alert.alert('エラー', error.message); asDraft ? setSaving(false) : setLoading(false); return }
    if (status === 'published') {
      const followerIds = await getTargetFollowers()
      sendPushToUsers(followerIds, senderName, readyBlocks[0]?.text.trim().slice(0, 80) || '画像が届きました')
      setMonthlyCount(prev => prev + 1)
    }
    if (status === 'draft') {
      Alert.alert('下書き保存', '下書きを保存しました。「下書き・予約」タブから配信できます。')
      setBlocks([{ id: genId(), text: '', imageUri: null, imageUrl: null, uploading: false }])
      setTarget('all'); setScheduledAt(''); setConfirmed(false); setPublicReactions(false)
      setActiveTab('drafts')
    } else if (status === 'scheduled') {
      Alert.alert('予約完了', `${scheduledLabel}に配信予定として保存しました。`)
      setBlocks([{ id: genId(), text: '', imageUri: null, imageUrl: null, uploading: false }])
      setTarget('all'); setScheduledAt(''); setConfirmed(false); setPublicReactions(false)
      setActiveTab('drafts')
    } else {
      // 配信後は自分のトーク画面へ遷移して送信内容を確認できる
      router.replace(`/talk/${userId}` as any)
    }
    asDraft ? setSaving(false) : setLoading(false)
  }

  // ─── 描画用変数 ──────────────────────────────────────────
  const now = new Date()
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  const targetLabel = target === 'tag' ? (selectedTag ? `🏷 ${selectedTag}` : 'タグ絞込') : (TARGET_OPTIONS.find(t => t.value === target)?.label ?? '全員')
  const scheduledLabel = parseScheduledAt()
    ? parseScheduledAt()!.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const getTargetLabel = (t: string | null) => {
    if (t === 'week') return '直近7日'
    if (t === 'month') return '直近30日'
    return '全員'
  }

  // ─── エディタ（新規配信タブ） ─────────────────────────────
  const Editor = (
    <ScrollView style={styles.editorPanel} contentContainerStyle={styles.editorPanelContent} keyboardShouldPersistTaps="handled">
      <View style={styles.toolbar}>
        <TouchableOpacity style={[styles.toolBtn, showTarget && styles.toolBtnActive]} onPress={() => { setShowTarget(true); setShowSchedule(false) }}>
          <Ionicons name="people-outline" size={15} color={showTarget ? Colors.white : Colors.accent} />
          <Text style={[styles.toolBtnText, showTarget && styles.toolBtnTextActive]}>{targetLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toolBtn, showSchedule && styles.toolBtnActive]} onPress={() => { setShowSchedule(true); setShowTarget(false) }}>
          <Ionicons name="time-outline" size={15} color={showSchedule ? Colors.white : Colors.accent} />
          <Text style={[styles.toolBtnText, showSchedule && styles.toolBtnTextActive]}>{scheduledLabel ?? 'スケジュール'}</Text>
        </TouchableOpacity>
        {(BETA_MODE || userPlan === 'standard' || userPlan === 'pro') && (
          <TouchableOpacity
            style={[styles.toolBtn, publicReactions && styles.toolBtnActive]}
            onPress={() => setPublicReactions(v => !v)}
          >
            <Ionicons
              name={publicReactions ? 'heart' : 'heart-outline'}
              size={15}
              color={publicReactions ? Colors.white : Colors.accent}
            />
            <Text style={[styles.toolBtnText, publicReactions && styles.toolBtnTextActive]}>
              {publicReactions ? 'リアクション公開' : 'リアクション非公開'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {showTarget && (
        <View style={styles.optionCard}>
          <Text style={styles.optionTitle}>配信対象</Text>
          {TARGET_OPTIONS.map(opt => (
            <TouchableOpacity key={opt.value} style={[styles.optionRow, target === opt.value && styles.optionRowActive]}
              onPress={() => { setTarget(opt.value); setShowTarget(false) }}>
              <View style={styles.optionLeft}>
                <Text style={[styles.optionLabel, target === opt.value && styles.optionLabelActive]}>{opt.label}</Text>
                <Text style={styles.optionDesc}>{opt.desc}</Text>
              </View>
              {target === opt.value && <Ionicons name="checkmark" size={18} color={Colors.accent} />}
            </TouchableOpacity>
          ))}
          {(BETA_MODE || userPlan === 'pro') && (
            <>
              <View style={styles.optionDivider} />
              <Text style={styles.optionSectionLabel}>セグメント配信（プロ）</Text>
              {availableTags.length === 0 ? (
                <Text style={styles.optionEmptyTag}>フォロワーにタグを付けると絞り込めます</Text>
              ) : (
                availableTags.map(tag => (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.optionRow, target === 'tag' && selectedTag === tag && styles.optionRowActive]}
                    onPress={() => { setTarget('tag'); setSelectedTag(tag); setShowTarget(false) }}
                  >
                    <View style={styles.optionLeft}>
                      <Text style={[styles.optionLabel, target === 'tag' && selectedTag === tag && styles.optionLabelActive]}>🏷 {tag}</Text>
                      <Text style={styles.optionDesc}>このタグのフォロワーのみ</Text>
                    </View>
                    {target === 'tag' && selectedTag === tag && <Ionicons name="checkmark" size={18} color={Colors.accent} />}
                  </TouchableOpacity>
                ))
              )}
            </>
          )}
        </View>
      )}

      {showSchedule && (
        <View style={styles.optionCard}>
          <Text style={styles.optionTitle}>配信日時</Text>
          <Text style={styles.scheduleHint}>
            形式: YYYY/MM/DD HH:MM　（例: {now.getFullYear()}/{String(now.getMonth()+1).padStart(2,'0')}/{String(now.getDate()).padStart(2,'0')} {String(now.getHours()).padStart(2,'0')}:{String(now.getMinutes()).padStart(2,'0')}）
          </Text>
          <TextInput
            style={styles.scheduleInput}
            placeholder="例: 2026/05/20 14:00"
            placeholderTextColor={Colors.textLight}
            value={scheduledAt}
            onChangeText={setScheduledAt}
            keyboardType="numbers-and-punctuation"
          />
          {scheduledAt.trim() && !parseScheduledAt() && (
            <Text style={styles.scheduleError}>⚠ 形式が正しくありません（YYYY/MM/DD HH:MM）</Text>
          )}
          {parseScheduledAt() && parseScheduledAt()! <= new Date() && (
            <Text style={styles.scheduleError}>⚠ 過去の日時は設定できません</Text>
          )}
          {parseScheduledAt() && parseScheduledAt()! > new Date() && (
            <Text style={styles.schedulePreview}>
              ✓ {parseScheduledAt()!.toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })} に配信
            </Text>
          )}
          <View style={styles.scheduleActions}>
            <TouchableOpacity onPress={() => { setScheduledAt(''); setShowSchedule(false) }}>
              <Text style={styles.scheduleClear}>クリア</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.scheduleOk} onPress={() => setShowSchedule(false)}>
              <Text style={styles.scheduleOkText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {blocks.map((block, idx) => (
        <View key={block.id} style={styles.blockCard}>
          <View style={styles.blockHeader}>
            <View style={styles.blockNum}><Text style={styles.blockNumText}>{idx + 1}</Text></View>
            <Text style={styles.blockLabel}>メッセージ {idx + 1}</Text>
            {blocks.length > 1 && (
              <TouchableOpacity onPress={() => removeBlock(block.id)} style={styles.blockRemove}>
                <Ionicons name="trash-outline" size={16} color={Colors.textLight} />
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={styles.textarea}
            placeholder="メッセージを入力..."
            placeholderTextColor={Colors.textLight}
            value={block.text}
            onChangeText={t => updateBlock(block.id, { text: t })}
            multiline maxLength={500} textAlignVertical="top"
          />
          {block.imageUri && (
            <View style={styles.imagePreviewWrap}>
              <Image source={{ uri: block.imageUri }} style={styles.imagePreview} resizeMode="cover" />
              {block.uploading
                ? <View style={styles.uploadOverlay}><ActivityIndicator color={Colors.white} /><Text style={styles.uploadText}>アップロード中...</Text></View>
                : <TouchableOpacity style={styles.imageRemove} onPress={() => removeImage(block.id)}><Ionicons name="close-circle" size={24} color={Colors.white} /></TouchableOpacity>
              }
            </View>
          )}
          <View style={styles.blockFooter}>
            <TouchableOpacity style={styles.imageBtn} onPress={() => pickImage(block.id)} disabled={block.uploading}>
              <Ionicons name="image-outline" size={16} color={Colors.accent} />
              <Text style={styles.imageBtnText}>画像を追加</Text>
            </TouchableOpacity>
            <Text style={[styles.counter, block.text.length > 450 && styles.counterWarn]}>{block.text.length} / 500</Text>
          </View>
        </View>
      ))}

      <TouchableOpacity style={styles.addBlockBtn} onPress={addBlock}>
        <Ionicons name="add-circle-outline" size={18} color={Colors.accent} />
        <Text style={styles.addBlockText}>メッセージブロックを追加</Text>
      </TouchableOpacity>

      {!BETA_MODE && userPlan === 'free' && (
        <TouchableOpacity
          style={[styles.limitBox, monthlyCount >= FREE_LIMIT && styles.limitBoxWarn]}
          onPress={() => router.push('/plan' as any)}
          activeOpacity={0.8}
        >
          <Ionicons
            name={monthlyCount >= FREE_LIMIT ? 'warning-outline' : 'radio-outline'}
            size={15}
            color={monthlyCount >= FREE_LIMIT ? '#E53E3E' : Colors.accent}
          />
          <Text style={[styles.limitText, monthlyCount >= FREE_LIMIT && styles.limitTextWarn]}>
            今月の配信: {monthlyCount} / {FREE_LIMIT}回
            {monthlyCount >= FREE_LIMIT ? '　上限に達しました' : ''}
          </Text>
          <Text style={styles.limitLink}>プランを見る →</Text>
        </TouchableOpacity>
      )}

      <View style={styles.noticeBox}>
        <Ionicons name="information-circle-outline" size={15} color={Colors.textLight} />
        <Text style={styles.noticeText}>配信後の取り消しはできません。内容をよく確認してから送信してください。</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.draftBtn, (!hasContent || saving) && styles.buttonDisabled]}
          onPress={() => handlePost(true)} disabled={!hasContent || saving}>
          {saving ? <ActivityIndicator size="small" color={Colors.accent} />
            : <><Ionicons name="save-outline" size={16} color={Colors.accent} /><Text style={styles.draftBtnText}>下書き保存</Text></>}
        </TouchableOpacity>

        {!confirmed ? (
          <TouchableOpacity
            style={[styles.confirmBtn, (!hasContent || (!BETA_MODE && userPlan === 'free' && monthlyCount >= FREE_LIMIT)) && styles.buttonDisabled]}
            onPress={() => {
              if (!BETA_MODE && userPlan === 'free' && monthlyCount >= FREE_LIMIT) {
                router.push('/plan' as any)
                return
              }
              setConfirmed(true)
            }}
            disabled={!hasContent}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color={Colors.white} />
            <Text style={styles.confirmBtnText}>
              {!BETA_MODE && userPlan === 'free' && monthlyCount >= FREE_LIMIT ? 'アップグレードが必要です' : '最終チェック'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.sendGroup}>
            <TouchableOpacity style={styles.reEditBtn} onPress={() => setConfirmed(false)}>
              <Ionicons name="pencil-outline" size={14} color={Colors.textLight} />
              <Text style={styles.reEditBtnText}>修正</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sendBtn, loading && styles.buttonDisabled]}
              onPress={() => handlePost(false)} disabled={loading}>
              {loading ? <ActivityIndicator size="small" color={Colors.white} />
                : <><Ionicons name="send" size={16} color={Colors.white} />
                   <Text style={styles.sendBtnText}>{scheduledLabel ? `${scheduledLabel}に配信` : '今すぐ配信する'}</Text></>
              }
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  )

  // ─── プレビューパネル ─────────────────────────────────────
  const Preview = (
    <View style={styles.previewPanel}>
      <View style={styles.previewHeader}>
        <Text style={styles.previewTitle}>プレビュー</Text>
        {scheduledLabel && (
          <View style={styles.scheduleBadge}>
            <Ionicons name="time" size={12} color={Colors.accent} />
            <Text style={styles.scheduleBadgeText}>{scheduledLabel}</Text>
          </View>
        )}
        {target !== 'all' && (
          <View style={styles.targetBadge}>
            <Ionicons name="filter" size={12} color="#6B7280" />
            <Text style={styles.targetBadgeText}>{targetLabel}のみ</Text>
          </View>
        )}
      </View>
      <View style={styles.phoneFrame}>
        <View style={styles.phoneHeader}>
          <View style={styles.phoneAvatar}><Text style={styles.phoneAvatarText}>{senderName[0] ?? 'R'}</Text></View>
          <View>
            <Text style={styles.phoneHeaderName}>{senderName || 'あなた'}</Text>
            <Text style={styles.phoneHeaderSub}>配信アカウント</Text>
          </View>
        </View>
        <ScrollView style={styles.phoneChat} contentContainerStyle={styles.phoneChatContent}>
          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeText}>{now.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}</Text>
          </View>
          {hasContent ? blocks.filter(b => b.text.trim() || b.imageUri).map((block) => (
            <View key={block.id} style={styles.bubbleRow}>
              <View style={styles.bubbleAvatar}><Text style={styles.bubbleAvatarText}>{senderName[0] ?? 'R'}</Text></View>
              <View style={styles.bubbleWrap}>
                <View style={[styles.bubble, confirmed && styles.bubbleConfirmed]}>
                  {block.imageUri && <Image source={{ uri: block.imageUri }} style={styles.bubbleImage} resizeMode="cover" />}
                  {block.text.trim() && <Text style={styles.bubbleText}>{block.text}</Text>}
                </View>
                <Text style={styles.bubbleTime}>{timeStr}</Text>
              </View>
            </View>
          )) : (
            <View style={styles.emptyPreview}>
              <Text style={styles.emptyPreviewText}>メッセージを入力すると{'\n'}ここにプレビューが表示されます</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  )

  // ─── 下書き・予約タブ ─────────────────────────────────────
  const DraftsList = (
    <View style={{ flex: 1 }}>
      {draftsLoading ? (
        <View style={styles.draftsCenter}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : drafts.length === 0 ? (
        <View style={styles.draftsCenter}>
          <Ionicons name="document-outline" size={48} color={Colors.border} />
          <Text style={styles.draftsEmptyTitle}>下書きはありません</Text>
          <Text style={styles.draftsEmptyText}>「新規配信」タブで下書き保存するとここに表示されます</Text>
        </View>
      ) : (
        <FlatList
          data={drafts}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.draftsList}
          renderItem={({ item }) => {
            const isPublishing = publishingId === item.id
            return (
              <View style={styles.draftCard}>
                <View style={styles.draftCardTop}>
                  <View style={styles.draftStatusBadge}>
                    {item.status === 'scheduled'
                      ? <><Ionicons name="time" size={12} color={Colors.accent} /><Text style={styles.draftScheduledText}>予約</Text></>
                      : <><Ionicons name="document-text-outline" size={12} color={Colors.textLight} /><Text style={styles.draftDraftText}>下書き</Text></>
                    }
                  </View>
                  <Text style={styles.draftMeta}>
                    {item.status === 'scheduled' && item.scheduled_at
                      ? `配信予定: ${formatDate(item.scheduled_at)}`
                      : `保存: ${formatDate(item.created_at)}`}
                  </Text>
                </View>

                {item.image_url && (
                  <Image source={{ uri: item.image_url }} style={styles.draftImage} resizeMode="cover" />
                )}
                <Text style={styles.draftContent} numberOfLines={5}>{item.content}</Text>

                <View style={styles.draftCardFooter}>
                  <View style={styles.draftTags}>
                    <View style={styles.draftTag}>
                      <Ionicons name="people-outline" size={11} color={Colors.textLight} />
                      <Text style={styles.draftTagText}>{getTargetLabel(item.target)}</Text>
                    </View>
                    {item.block_order > 0 && (
                      <View style={styles.draftTag}>
                        <Text style={styles.draftTagText}>ブロック {item.block_order + 1}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.draftActions}>
                    <TouchableOpacity
                      style={[styles.publishBtn, isPublishing && styles.buttonDisabled]}
                      onPress={() => handlePublishDraft(item)}
                      disabled={isPublishing || publishingId !== null}
                    >
                      {isPublishing
                        ? <ActivityIndicator size="small" color={Colors.white} />
                        : <><Ionicons name="radio-outline" size={15} color={Colors.white} /><Text style={styles.publishBtnText}>今すぐ配信</Text></>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteDraft(item)}>
                      <Ionicons name="trash-outline" size={16} color="#E53E3E" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )
          }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </View>
  )

  // ─── レンダリング ─────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* ヘッダー */}
      <View style={styles.pageHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.cancelButton}>
          <Ionicons name="chevron-back" size={20} color={Colors.textLight} />
          <Text style={styles.cancelText}>キャンセル</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>配信管理</Text>
        {activeTab === 'new' ? (
          <View style={styles.recipientBadge}>
            <Ionicons name="people-outline" size={14} color={Colors.accent} />
            <Text style={styles.recipientText}>{targetLabel}</Text>
          </View>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {/* タブバー */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'new' && styles.tabActive]}
          onPress={() => setActiveTab('new')}
        >
          <Ionicons name="add-circle-outline" size={15} color={activeTab === 'new' ? Colors.accent : Colors.textLight} />
          <Text style={[styles.tabText, activeTab === 'new' && styles.tabTextActive]}>新規配信</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'drafts' && styles.tabActive]}
          onPress={() => setActiveTab('drafts')}
        >
          <Ionicons name="document-text-outline" size={15} color={activeTab === 'drafts' ? Colors.accent : Colors.textLight} />
          <Text style={[styles.tabText, activeTab === 'drafts' && styles.tabTextActive]}>下書き・予約</Text>
          {draftCount > 0 && (
            <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{draftCount}</Text></View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'tools' && styles.tabActive]}
          onPress={() => setActiveTab('tools')}
        >
          <Ionicons name="construct-outline" size={15} color={activeTab === 'tools' ? Colors.accent : Colors.textLight} />
          <Text style={[styles.tabText, activeTab === 'tools' && styles.tabTextActive]}>ツール</Text>
        </TouchableOpacity>
      </View>

      {/* コンテンツ */}
      {activeTab === 'new' ? (
        isWide ? (
          <View style={styles.wideLayout}>
            {Editor}
            {Preview}
          </View>
        ) : (
          <ScrollView style={styles.narrowLayout} keyboardShouldPersistTaps="handled">
            {Editor}
            {Preview}
          </ScrollView>
        )
      ) : activeTab === 'drafts' ? (
        DraftsList
      ) : (
        <ScrollView contentContainerStyle={styles.toolsList}>
          <Text style={styles.toolsSectionLabel}>配信ツール</Text>
          <View style={styles.toolsSection}>
            <ToolMenuItem
              icon="git-branch-outline"
              label="フロー配信"
              desc="フォロー後に自動でメッセージを送る"
              plan="standard"
              onPress={() => router.push('/step-sequences' as any)}
            />
            <View style={styles.toolsDivider} />
            <ToolMenuItem
              icon="people-outline"
              label="フォロワー管理"
              desc="タグ付けでセグメント配信の準備"
              onPress={() => router.push('/followers' as any)}
            />
          </View>

          <Text style={styles.toolsSectionLabel}>プロ機能</Text>
          <View style={styles.toolsSection}>
            <ToolMenuItem
              icon="chatbubbles-outline"
              label="自動応答"
              desc="キーワードに反応してDMを自動返信"
              plan="pro"
              onPress={() => router.push('/auto-responses' as any)}
            />
            <View style={styles.toolsDivider} />
            <ToolMenuItem
              icon="apps-outline"
              label="タイル"
              desc="プロフィールにボタンメニューを設置"
              plan="pro"
              onPress={() => router.push('/rich-menu' as any)}
            />
          </View>

        </ScrollView>
      )}
    </View>
  )
}

// ─── スタイル ─────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F0EB' },

  pageHeader: {
    backgroundColor: Colors.header,
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  cancelButton: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  cancelText: { fontSize: 14, color: Colors.textLight },
  pageTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  recipientBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.white, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  recipientText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },

  // タブバー
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.accent },
  tabText: { fontSize: 14, fontWeight: '600', color: Colors.textLight },
  tabTextActive: { color: Colors.accent },
  tabBadge: {
    backgroundColor: Colors.accent, borderRadius: 9,
    minWidth: 18, height: 18, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  tabBadgeText: { color: Colors.white, fontSize: 10, fontWeight: '700' },

  wideLayout: { flex: 1, flexDirection: 'row' },
  narrowLayout: { flex: 1 },

  // エディタ
  editorPanel: { flex: 1, borderRightWidth: 1, borderRightColor: Colors.border },
  editorPanelContent: { padding: 20, gap: 14 },

  toolbar: { flexDirection: 'row', gap: 8 },
  toolBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.white, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: Colors.border,
  },
  toolBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  toolBtnText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  toolBtnTextActive: { color: Colors.white },

  optionCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 10,
  },
  optionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textLight },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8,
  },
  optionRowActive: { backgroundColor: '#FDF6EE' },
  optionLeft: { gap: 2 },
  optionLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  optionLabelActive: { color: Colors.accent },
  optionDesc: { fontSize: 12, color: Colors.textLight },
  optionDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },
  optionSectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4, paddingVertical: 4 },
  optionEmptyTag: { fontSize: 12, color: Colors.textLight, padding: 8, textAlign: 'center' },

  scheduleInput: {
    backgroundColor: Colors.background, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: Colors.text, borderWidth: 1, borderColor: Colors.border,
  },
  scheduleHint: { fontSize: 11, color: Colors.textLight, lineHeight: 16 },
  scheduleError: { fontSize: 12, color: '#E53E3E', fontWeight: '600' },
  schedulePreview: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  scheduleActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  scheduleClear: { fontSize: 14, color: Colors.textLight, paddingVertical: 6 },
  scheduleOk: { backgroundColor: Colors.accent, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 6 },
  scheduleOkText: { color: Colors.white, fontWeight: '700', fontSize: 14 },

  blockCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  blockHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: '#FAFAF8',
  },
  blockNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  blockNumText: { fontSize: 11, color: Colors.white, fontWeight: '700' },
  blockLabel: { flex: 1, fontSize: 13, color: Colors.textLight, fontWeight: '600' },
  blockRemove: { padding: 4 },

  textarea: { padding: 14, fontSize: 15, color: Colors.text, lineHeight: 24, minHeight: 100 },
  imagePreviewWrap: { position: 'relative', marginHorizontal: 14, marginBottom: 8, borderRadius: 8, overflow: 'hidden' },
  imagePreview: { width: '100%', height: 160, borderRadius: 8 },
  uploadOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  uploadText: { color: Colors.white, fontSize: 12 },
  imageRemove: { position: 'absolute', top: 8, right: 8 },

  blockFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  imageBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  imageBtnText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  counter: { fontSize: 12, color: Colors.textLight },
  counterWarn: { color: '#E53E3E' },

  addBlockBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', paddingVertical: 12,
  },
  addBlockText: { fontSize: 14, color: Colors.accent, fontWeight: '600' },

  limitBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  limitBoxWarn: { borderColor: '#FEB2B2', backgroundColor: '#FFF5F5' },
  limitText: { flex: 1, fontSize: 12, color: Colors.accent, fontWeight: '600' },
  limitTextWarn: { color: '#E53E3E' },
  limitLink: { fontSize: 11, color: Colors.textLight },

  noticeBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.white, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  noticeText: { flex: 1, fontSize: 12, color: Colors.textLight, lineHeight: 18 },

  actions: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  sendGroup: { flex: 2, flexDirection: 'row', gap: 6, alignItems: 'stretch' },
  reEditBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  reEditBtnText: { fontSize: 12, color: Colors.textLight, fontWeight: '600' },
  draftBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.white, borderRadius: 12, paddingVertical: 13,
    borderWidth: 1, borderColor: Colors.button,
  },
  draftBtnText: { color: Colors.accent, fontWeight: '700', fontSize: 14 },
  confirmBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.button, borderRadius: 12, paddingVertical: 13,
  },
  confirmBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  sendBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 13,
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  sendBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  buttonDisabled: { opacity: 0.4 },

  // プレビュー
  previewPanel: { width: 320, padding: 20, gap: 10 },
  previewHeader: { gap: 8 },
  previewTitle: { fontSize: 13, fontWeight: '700', color: Colors.textLight },
  scheduleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EFF6FF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start',
  },
  scheduleBadgeText: { fontSize: 11, color: Colors.accent, fontWeight: '600' },
  targetBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F3F4F6', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start',
  },
  targetBadgeText: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  phoneFrame: {
    flex: 1, backgroundColor: '#F0F0F0', borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border, minHeight: 420,
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
  phoneChatContent: { padding: 12, gap: 8 },
  dateBadge: { alignItems: 'center', marginVertical: 4 },
  dateBadgeText: {
    fontSize: 11, color: Colors.textLight,
    backgroundColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
  },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  bubbleAvatar: {
    width: 30, height: 30, borderRadius: 6,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center',
  },
  bubbleAvatarText: { fontSize: 12, fontWeight: '700', color: Colors.white },
  bubbleWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, maxWidth: '85%' },
  bubble: {
    backgroundColor: Colors.white, borderRadius: 14, borderTopLeftRadius: 4, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  bubbleConfirmed: { borderWidth: 1.5, borderColor: Colors.accent },
  bubbleImage: { width: 180, height: 120 },
  bubbleText: { fontSize: 13, color: Colors.text, lineHeight: 20, padding: 10 },
  bubbleTime: { fontSize: 10, color: Colors.textLight, marginBottom: 2 },
  emptyPreview: { paddingTop: 40, alignItems: 'center' },
  emptyPreviewText: { fontSize: 12, color: Colors.textLight, textAlign: 'center', lineHeight: 20 },

  // 下書きリスト
  draftsCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  draftsEmptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  draftsEmptyText: { fontSize: 13, color: Colors.textLight, textAlign: 'center' },
  draftsList: { padding: 16 },
  draftCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 10,
  },
  draftCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  draftStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  draftScheduledText: { fontSize: 11, fontWeight: '700', color: Colors.accent },
  draftDraftText: { fontSize: 11, fontWeight: '600', color: Colors.textLight },
  draftMeta: { fontSize: 11, color: Colors.textLight, flex: 1 },
  draftImage: { width: '100%', height: 140, borderRadius: 8 },
  draftContent: { fontSize: 14, color: Colors.text, lineHeight: 21 },
  draftCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  draftTags: { flexDirection: 'row', gap: 8 },
  draftTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  draftTagText: { fontSize: 11, color: Colors.textLight },
  draftActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  publishBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.accent, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  publishBtnText: { fontSize: 13, color: Colors.white, fontWeight: '700' },
  deleteBtn: {
    width: 34, height: 34, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FED7D7',
  },

  // ツールタブ
  toolsList: { padding: 16, gap: 8, paddingBottom: 40 },
  toolsSectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4,
  },
  toolsSection: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  toolsDivider: { height: 1, backgroundColor: Colors.border, marginLeft: 52 },
  toolsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  toolsIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center',
  },
  toolsInfo: { flex: 1 },
  toolsLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
  toolsDesc: { fontSize: 12, color: Colors.textLight, marginTop: 1 },
  toolsPlanBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
  },
  toolsPlanText: { fontSize: 10, fontWeight: '700', color: Colors.white },
})

function ToolMenuItem({ icon, label, desc, plan, onPress }: {
  icon: string
  label: string
  desc: string
  plan?: 'standard' | 'pro'
  onPress: () => void
}) {
  const planColor = plan === 'pro' ? '#8B4513' : Colors.accent
  return (
    <TouchableOpacity style={styles.toolsRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.toolsIconWrap}>
        <Ionicons name={icon as any} size={20} color={Colors.accent} />
      </View>
      <View style={styles.toolsInfo}>
        <Text style={styles.toolsLabel}>{label}</Text>
        <Text style={styles.toolsDesc}>{desc}</Text>
      </View>
      {plan && (
        <View style={[styles.toolsPlanBadge, { backgroundColor: planColor }]}>
          <Text style={styles.toolsPlanText}>{plan === 'pro' ? 'PRO' : 'STD'}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={Colors.border} />
    </TouchableOpacity>
  )
}
