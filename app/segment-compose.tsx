import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Image
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'
import { sendPushToUsers } from '../lib/notifications'
import { BETA_MODE } from '../constants/config'

// ─── 型定義 ────────────────────────────────────────────────
type Block = {
  id: string
  text: string
  imageUri: string | null
  imageUrl: string | null
  imageLinkUrl: string
  uploading: boolean
}

// セグメント配信の対象種別
type Target = 'all' | 'week' | 'month' | 'tag'

const TARGET_OPTIONS: { value: Target; label: string; desc: string; icon: string }[] = [
  { value: 'all',   label: '全フォロワー',  desc: 'フォロワー全員に届けます',         icon: 'people-outline' },
  { value: 'week',  label: '直近7日',       desc: '7日以内にフォローした人のみ',       icon: 'calendar-outline' },
  { value: 'month', label: '直近30日',      desc: '30日以内にフォローした人のみ',      icon: 'calendar-outline' },
]

function genId() { return Math.random().toString(36).slice(2) }
function genUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// ─── メインコンポーネント ────────────────────────────────────
export default function SegmentComposeScreen() {
  const [blocks, setBlocks] = useState<Block[]>([
    { id: genId(), text: '', imageUri: null, imageUrl: null, imageLinkUrl: '', uploading: false }
  ])
  // 配信対象：セグメント or タグ
  const [target, setTarget] = useState<Target>('week')
  const [selectedTag, setSelectedTag] = useState<string>('')
  const [availableTags, setAvailableTags] = useState<string[]>([])

  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)

  const [userId, setUserId] = useState('')
  const [senderName, setSenderName] = useState('')
  const [userPlan, setUserPlan] = useState<'free' | 'standard' | 'pro'>('free')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      supabase.from('profiles').select('display_name, plan').eq('id', user.id).single()
        .then(({ data }) => {
          setSenderName(data?.display_name ?? '')
          setUserPlan((data?.plan ?? 'free') as 'free' | 'standard' | 'pro')
          // タグ一覧を取得（プロ or ベータの場合）
          if (BETA_MODE || data?.plan === 'pro') {
            supabase.from('follower_tags').select('tag').eq('creator_id', user.id)
              .then(({ data: tags }) => {
                const unique = [...new Set((tags ?? []).map((t: any) => t.tag))]
                setAvailableTags(unique)
              })
          }
        })
    })
  }, [])

  const hasContent = blocks.some(b => b.text.trim() || b.imageUrl)

  const updateBlock = (id: string, patch: Partial<Block>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))
    setConfirmed(false)
  }
  const addBlock = () => {
    setBlocks(prev => [...prev, { id: genId(), text: '', imageUri: null, imageUrl: null, imageLinkUrl: '', uploading: false }])
  }
  const removeBlock = (id: string) => {
    if (blocks.length === 1) return
    setBlocks(prev => prev.filter(b => b.id !== id))
  }

  const pickImage = async (blockId: string) => {
    if (!userId) return
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('許可が必要です', 'フォトライブラリへのアクセスを許可してください'); return }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    updateBlock(blockId, { imageUri: asset.uri, uploading: true, text: '' })
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
    if (target === 'week')  q = q.gte('created_at', new Date(Date.now() - 7  * 86400000).toISOString())
    if (target === 'month') q = q.gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
    const { data } = await q
    return (data ?? []).map((f: any) => f.follower_id)
  }

  const handlePost = async () => {
    if (!hasContent || !userId) return
    setLoading(true)
    const readyBlocks = blocks.filter(b => b.text.trim() || b.imageUrl)
    const groupId = readyBlocks.length > 1 ? genUUID() : null
    const inserts = readyBlocks.map((b, i) => ({
      sender_id: userId,
      content: b.text.trim() || '　',
      image_url: b.imageUrl ?? null,
      image_link_url: b.imageLinkUrl.trim() || null,
      block_order: i,
      status: 'published',
      scheduled_at: null,
      target,
      group_id: groupId,
      public_reactions: false,
      visible_to_new_followers: true,
      is_subscriber_only: false,
    }))
    const { error } = await supabase.from('broadcasts').insert(inserts)
    if (error) { Alert.alert('エラー', error.message); setLoading(false); return }

    const notifyIds = await getTargetFollowers()
    sendPushToUsers(notifyIds, senderName, readyBlocks[0]?.text.trim().slice(0, 80) || '画像が届きました')

    setLoading(false)
    router.replace(`/talk/${userId}` as any)
  }

  // 現在の対象ラベル
  const targetLabel = target === 'tag'
    ? (selectedTag ? `🏷 ${selectedTag}` : 'タグを選択')
    : (TARGET_OPTIONS.find(t => t.value === target)?.label ?? '全フォロワー')

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/compose' as any)}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>セグメント配信</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled">

        {/* ─── 対象セグメント選択 ─── */}
        <Text style={styles.sectionLabel}>配信対象</Text>
        <View style={styles.targetSection}>
          {TARGET_OPTIONS.map((opt, i) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.targetRow, target === opt.value && styles.targetRowActive, i < TARGET_OPTIONS.length - 1 && styles.targetRowBorder]}
              onPress={() => { setTarget(opt.value); setSelectedTag('') }}
              activeOpacity={0.7}
            >
              <View style={[styles.targetCheck, target === opt.value && styles.targetCheckActive]}>
                {target === opt.value && <Ionicons name="checkmark" size={14} color={Colors.white} />}
              </View>
              <View style={styles.targetInfo}>
                <Text style={[styles.targetLabel, target === opt.value && styles.targetLabelActive]}>{opt.label}</Text>
                <Text style={styles.targetDesc}>{opt.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* タグセグメント（プロ or ベータ） */}
          {(BETA_MODE || userPlan === 'pro') && availableTags.length > 0 && (
            <>
              <View style={styles.targetDivider} />
              <Text style={styles.targetTagsLabel}>タグで絞り込む</Text>
              {availableTags.map(tag => (
                <TouchableOpacity
                  key={tag}
                  style={[styles.targetRow, target === 'tag' && selectedTag === tag && styles.targetRowActive, styles.targetRowBorder]}
                  onPress={() => { setTarget('tag'); setSelectedTag(tag) }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.targetCheck, target === 'tag' && selectedTag === tag && styles.targetCheckActive]}>
                    {target === 'tag' && selectedTag === tag && <Ionicons name="checkmark" size={14} color={Colors.white} />}
                  </View>
                  <View style={styles.targetInfo}>
                    <Text style={[styles.targetLabel, target === 'tag' && selectedTag === tag && styles.targetLabelActive]}>🏷 {tag}</Text>
                    <Text style={styles.targetDesc}>このタグのフォロワーのみ</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}
          {(BETA_MODE || userPlan === 'pro') && availableTags.length === 0 && (
            <>
              <View style={styles.targetDivider} />
              <TouchableOpacity
                style={styles.targetEmptyTag}
                onPress={() => router.push('/followers' as any)}
              >
                <Ionicons name="pricetag-outline" size={15} color={Colors.textLight} />
                <Text style={styles.targetEmptyTagText}>フォロワーにタグを付けると絞り込めます</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.border} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ─── メッセージ本文 ─── */}
        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>メッセージ</Text>
        <View style={styles.blocksSection}>
          {blocks.map((block, idx) => (
            <View key={block.id} style={styles.blockCard}>
              {blocks.length > 1 && (
                <TouchableOpacity style={styles.blockRemove} onPress={() => removeBlock(block.id)}>
                  <Ionicons name="close-circle" size={20} color={Colors.textLight} />
                </TouchableOpacity>
              )}
              {block.imageUri || block.imageUrl ? (
                <View style={styles.blockImageWrap}>
                  <Image source={{ uri: block.imageUri ?? block.imageUrl ?? '' }} style={styles.blockImage} />
                  {block.uploading && (
                    <View style={styles.uploadOverlay}>
                      <ActivityIndicator color={Colors.white} />
                    </View>
                  )}
                  <TouchableOpacity style={styles.removeImageBtn} onPress={() => updateBlock(block.id, { imageUri: null, imageUrl: null })}>
                    <Ionicons name="close-circle" size={22} color={Colors.white} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TextInput
                  style={styles.blockInput}
                  value={block.text}
                  onChangeText={t => updateBlock(block.id, { text: t })}
                  placeholder={idx === 0 ? 'メッセージを入力...' : '続きを入力...'}
                  placeholderTextColor={Colors.textLight}
                  multiline
                />
              )}
              {!block.imageUri && !block.imageUrl && (
                <TouchableOpacity style={styles.imagePickBtn} onPress={() => pickImage(block.id)}>
                  <Ionicons name="image-outline" size={18} color={Colors.textLight} />
                </TouchableOpacity>
              )}
            </View>
          ))}

          <TouchableOpacity style={styles.addBlockBtn} onPress={addBlock}>
            <Ionicons name="add-circle-outline" size={18} color={Colors.accent} />
            <Text style={styles.addBlockText}>ブロックを追加</Text>
          </TouchableOpacity>
        </View>

        {/* ─── 確認・配信ボタン ─── */}
        <View style={styles.actions}>
          {!confirmed ? (
            <TouchableOpacity
              style={[styles.confirmBtn, !hasContent && styles.buttonDisabled]}
              onPress={() => setConfirmed(true)}
              disabled={!hasContent}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color={Colors.white} />
              <Text style={styles.confirmBtnText}>最終チェック</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.sendGroup}>
              <TouchableOpacity style={styles.reEditBtn} onPress={() => setConfirmed(false)}>
                <Ionicons name="pencil-outline" size={14} color={Colors.textLight} />
                <Text style={styles.reEditBtnText}>修正</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendBtn, loading && styles.buttonDisabled]}
                onPress={handlePost}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <>
                      <Ionicons name="send" size={16} color={Colors.white} />
                      <Text style={styles.sendBtnText}>{targetLabel}に配信する</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.noticeBox}>
          <Ionicons name="information-circle-outline" size={15} color={Colors.textLight} />
          <Text style={styles.noticeText}>配信後の取り消しはできません。内容をよく確認してから送信してください。</Text>
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },

  content: { flex: 1 },
  contentInner: { padding: 16, paddingBottom: 40, gap: 8 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 4, paddingBottom: 6,
  },

  // 対象セグメント
  targetSection: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  targetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
  },
  targetRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  targetRowActive: { backgroundColor: '#F0F8FF' },
  targetCheck: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  targetCheckActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  targetInfo: { flex: 1 },
  targetLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  targetLabelActive: { color: Colors.accent },
  targetDesc: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  targetDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },
  targetTagsLabel: { fontSize: 12, fontWeight: '700', color: Colors.textLight, paddingHorizontal: 14, paddingVertical: 6 },
  targetEmptyTag: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14,
  },
  targetEmptyTagText: { flex: 1, fontSize: 13, color: Colors.textLight },

  // ブロック
  blocksSection: { gap: 10 },
  blockCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  blockRemove: { position: 'absolute', top: 8, right: 8, zIndex: 1 },
  blockInput: {
    padding: 14, fontSize: 15, color: Colors.text,
    minHeight: 100, textAlignVertical: 'top',
  },
  blockImageWrap: { position: 'relative' },
  blockImage: { width: '100%', height: 200, resizeMode: 'cover' },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  removeImageBtn: { position: 'absolute', top: 8, right: 8 },
  imagePickBtn: {
    borderTopWidth: 1, borderTopColor: Colors.border,
    padding: 10, alignItems: 'center',
  },
  addBlockBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    padding: 12,
  },
  addBlockText: { fontSize: 14, color: Colors.accent, fontWeight: '600' },

  // アクション
  actions: { marginTop: 8 },
  buttonDisabled: { opacity: 0.5 },
  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accent, borderRadius: 12, padding: 16,
  },
  confirmBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  sendGroup: { flexDirection: 'row', gap: 10 },
  reEditBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  reEditBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textLight },
  sendBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accent, borderRadius: 12, padding: 14,
  },
  sendBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  noticeBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.white, borderRadius: 10,
    padding: 12, marginTop: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  noticeText: { flex: 1, fontSize: 12, color: Colors.textLight, lineHeight: 18 },
})
