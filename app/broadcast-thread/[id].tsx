import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Alert,
} from 'react-native'
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

type Comment = {
  id: string
  content: string
  sender_id: string
  sender_name: string
  sender_avatar: string | null
  created_at: string
  is_mine: boolean
  replies: Comment[]
  // いいね
  like_count: number
  liked: boolean          // 自分がいいね済みか
  creator_liked: boolean  // 配信者がいいね済みか（YouTube風）
}

type BroadcastBlock = {
  id: string
  content: string
  image_url: string | null
  block_order: number
}

export default function BroadcastThreadScreen() {
  const { id: anchorId } = useLocalSearchParams<{ id: string }>()
  const [myId, setMyId] = useState<string | null>(null)
  const [myName, setMyName] = useState('')
  const [myAvatar, setMyAvatar] = useState<string | null>(null)
  const [isSelf, setIsSelf] = useState(false)
  const [broadcastSenderId, setBroadcastSenderId] = useState<string | null>(null)
  const [creatorAvatar, setCreatorAvatar] = useState<string | null>(null)
  const [creatorName, setCreatorName] = useState('')
  const [blocks, setBlocks] = useState<BroadcastBlock[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [inputText, setInputText] = useState('')
  const [replyToComment, setReplyToComment] = useState<Comment | null>(null)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const inputRef = useRef<TextInput>(null)
  const listRef = useRef<FlatList>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setMyId(user.id)

    const { data: anchor } = await supabase
      .from('broadcasts')
      .select('id, content, image_url, block_order, group_id, sender_id')
      .eq('id', anchorId)
      .single()

    if (!anchor) { setLoading(false); return }

    const self = user.id === anchor.sender_id
    setIsSelf(self)
    setBroadcastSenderId(anchor.sender_id)

    let broadcastIds: string[] = [anchorId as string]
    let allBlocks: BroadcastBlock[] = [anchor]
    if (anchor.group_id) {
      const { data: groupBlocks } = await supabase
        .from('broadcasts')
        .select('id, content, image_url, block_order')
        .eq('group_id', anchor.group_id)
        .order('block_order', { ascending: true })
      if (groupBlocks?.length) {
        allBlocks = groupBlocks
        broadcastIds = groupBlocks.map((b: any) => b.id)
      }
    }
    setBlocks(allBlocks.sort((a, b) => a.block_order - b.block_order))

    const { data: allMsgs } = await supabase
      .from('messages')
      .select('id, content, created_at, sender_id, receiver_id, broadcast_id, parent_message_id')
      .in('broadcast_id', broadcastIds)
      .order('created_at', { ascending: true })

    if (!allMsgs?.length) { setComments([]); setLoading(false); return }

    const msgIds = allMsgs.map((m: any) => m.id)
    const senderIds = [...new Set([user.id, anchor.sender_id, ...allMsgs.map((m: any) => m.sender_id)])]

    // プロフィールといいねを並行取得
    const [{ data: profiles }, { data: likes }] = await Promise.all([
      supabase.from('profiles').select('id, display_name, avatar_url').in('id', senderIds),
      supabase.from('message_likes').select('message_id, user_id').in('message_id', msgIds),
    ])

    const profMap: Record<string, { name: string; avatar: string | null }> = {}
    for (const p of (profiles ?? [])) profMap[p.id] = { name: p.display_name, avatar: p.avatar_url ?? null }
    setMyName(profMap[user.id]?.name ?? '')
    setMyAvatar(profMap[user.id]?.avatar ?? null)
    setCreatorAvatar(profMap[anchor.sender_id]?.avatar ?? null)
    setCreatorName(profMap[anchor.sender_id]?.name ?? '')

    // いいねマップ: message_id → { count, likedByMe, likedByCreator }
    const likeMap: Record<string, { count: number; likedByMe: boolean; likedByCreator: boolean }> = {}
    for (const l of (likes ?? [])) {
      if (!likeMap[l.message_id]) likeMap[l.message_id] = { count: 0, likedByMe: false, likedByCreator: false }
      likeMap[l.message_id].count++
      if (l.user_id === user.id) likeMap[l.message_id].likedByMe = true
      if (l.user_id === anchor.sender_id) likeMap[l.message_id].likedByCreator = true
    }

    const byId: Record<string, Comment> = {}
    for (const m of allMsgs as any[]) {
      const lk = likeMap[m.id] ?? { count: 0, likedByMe: false, likedByCreator: false }
      byId[m.id] = {
        id: m.id, content: m.content, sender_id: m.sender_id,
        sender_name: profMap[m.sender_id]?.name ?? 'ユーザー',
        sender_avatar: profMap[m.sender_id]?.avatar ?? null,
        created_at: m.created_at, is_mine: m.sender_id === user.id, replies: [],
        like_count: lk.count, liked: lk.likedByMe, creator_liked: lk.likedByCreator,
      }
    }
    const topLevel: Comment[] = []
    for (const m of allMsgs as any[]) {
      if (!m.parent_message_id) {
        topLevel.push(byId[m.id])
      } else if (byId[m.parent_message_id]) {
        byId[m.parent_message_id].replies.push(byId[m.id])
      }
    }
    setComments(topLevel)
    setLoading(false)
  }, [anchorId])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // ── いいね ───────────────────────────────────────────────
  const handleLike = async (comment: Comment) => {
    if (!myId) return

    // 楽観的UI更新
    const updateLike = (list: Comment[]): Comment[] =>
      list.map(c => {
        if (c.id === comment.id) {
          const liked = !c.liked
          const isCreatorLiking = myId === broadcastSenderId
          return {
            ...c,
            liked,
            like_count: liked ? c.like_count + 1 : Math.max(0, c.like_count - 1),
            creator_liked: isCreatorLiking ? liked : c.creator_liked,
          }
        }
        return { ...c, replies: updateLike(c.replies) }
      })
    setComments(prev => updateLike(prev))

    if (comment.liked) {
      // いいね取り消し
      await supabase.from('message_likes')
        .delete()
        .eq('message_id', comment.id)
        .eq('user_id', myId)
    } else {
      // いいね追加
      await supabase.from('message_likes').insert({
        message_id: comment.id,
        user_id: myId,
      })
    }
  }

  // ── 送信 ──────────────────────────────────────────────────
  const handleSend = async () => {
    if (!inputText.trim() || !myId || !broadcastSenderId) return
    setSending(true)
    const text = inputText.trim()
    setInputText('')

    let receiverId = broadcastSenderId
    let parentId: string | null = null

    if (replyToComment) {
      parentId = replyToComment.id
      receiverId = replyToComment.sender_id !== myId ? replyToComment.sender_id : broadcastSenderId
    }

    const { data: inserted } = await supabase.from('messages').insert({
      sender_id: myId,
      receiver_id: receiverId,
      content: text,
      broadcast_id: anchorId,
      parent_message_id: parentId,
    }).select('id, created_at').single()

    const newComment: Comment = {
      id: inserted?.id ?? `tmp-${Date.now()}`,
      content: text,
      sender_id: myId,
      sender_name: myName || 'あなた',
      sender_avatar: myAvatar,
      created_at: inserted?.created_at ?? new Date().toISOString(),
      is_mine: true,
      replies: [],
      like_count: 0,
      liked: false,
      creator_liked: false,
    }

    if (parentId) {
      setComments(prev => prev.map(c =>
        c.id === parentId
          ? { ...c, replies: [...c.replies, newComment] }
          : { ...c, replies: c.replies.map(r => r.id === parentId ? { ...r, replies: [...r.replies, newComment] } : r) }
      ))
    } else {
      setComments(prev => [...prev, newComment])
    }

    setReplyToComment(null)
    setSending(false)
    setTimeout(() => listRef.current?.scrollToEnd(), 100)
  }

  const removeComment = (list: Comment[], id: string): Comment[] =>
    list.filter(c => c.id !== id).map(c => ({ ...c, replies: removeComment(c.replies, id) }))

  const handleDeleteComment = (comment: Comment) => {
    Alert.alert('コメントを削除', 'このコメントを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          await supabase.from('messages').delete().eq('id', comment.id)
          setComments(prev => removeComment(prev, comment.id))
        },
      },
    ])
  }

  const toggleReplies = (commentId: string) => {
    setExpandedReplies(prev => {
      const next = new Set(prev)
      if (next.has(commentId)) next.delete(commentId)
      else next.add(commentId)
      return next
    })
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHour = Math.floor(diffMs / 3600000)
    const diffDay = Math.floor(diffMs / 86400000)
    if (diffMin < 1) return 'たった今'
    if (diffMin < 60) return `${diffMin}分前`
    if (diffHour < 24) return `${diffHour}時間前`
    if (diffDay < 7) return `${diffDay}日前`
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const getDescendants = (c: Comment): Comment[] => {
    const result: Comment[] = []
    for (const r of c.replies) {
      result.push(r)
      result.push(...getDescendants(r))
    }
    return result
  }

  // ── YouTube風「配信者いいね」アイコン ─────────────────────
  const CreatorLikeIcon = () => (
    <View style={styles.creatorLikeWrap}>
      {/* ハートアイコン */}
      <View style={styles.creatorLikeHeart}>
        <Ionicons name="heart" size={18} color={Colors.accent} />
      </View>
      {/* 配信者アバター（小） */}
      <View style={styles.creatorLikeAvatar}>
        {creatorAvatar
          ? <Image source={{ uri: creatorAvatar }} style={styles.creatorLikeAvatarImg} />
          : <View style={styles.creatorLikeAvatarPlaceholder}>
              <Text style={styles.creatorLikeAvatarText}>{creatorName[0] ?? 'R'}</Text>
            </View>
        }
      </View>
    </View>
  )

  const renderComment = (comment: Comment, isReply = false) => {
    const expanded = expandedReplies.has(comment.id)
    const isCreator = comment.sender_id === broadcastSenderId
    const descendants = isReply ? [] : getDescendants(comment)
    return (
      <View key={comment.id}>
        <TouchableOpacity
          activeOpacity={1}
          onLongPress={() => comment.is_mine && handleDeleteComment(comment)}
          style={[styles.commentRow, isReply && styles.commentRowReply]}
        >
          <View style={[styles.commentAvatar, isCreator && styles.commentAvatarCreator]}>
            {comment.sender_avatar
              ? <Image source={{ uri: comment.sender_avatar }} style={styles.commentAvatarImg} />
              : <Text style={styles.commentAvatarText}>{comment.sender_name[0]}</Text>
            }
          </View>
          <View style={styles.commentBody}>
            <View style={styles.commentMeta}>
              <Text style={[styles.commentName, isCreator && styles.commentNameCreator]}>
                {comment.sender_name}
                {isCreator && <Text style={styles.creatorBadge}> 配信者</Text>}
              </Text>
              <Text style={styles.commentTime}>{formatTime(comment.created_at)}</Text>
            </View>
            <Text style={styles.commentText}>{comment.content}</Text>

            {/* アクション行: コメントする ＋ いいね */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                onPress={() => {
                  setReplyToComment(comment)
                  setTimeout(() => inputRef.current?.focus(), 100)
                }}
                style={styles.replyBtn}
              >
                <Text style={styles.replyBtnText}>コメントする</Text>
              </TouchableOpacity>

              {/* いいねボタン */}
              <TouchableOpacity
                onPress={() => handleLike(comment)}
                style={styles.likeBtn}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={comment.liked ? 'thumbs-up' : 'thumbs-up-outline'}
                  size={15}
                  color={comment.liked ? Colors.accent : Colors.textLight}
                />
                {comment.like_count > 0 && (
                  <Text style={[styles.likeCount, comment.liked && styles.likeCountActive]}>
                    {comment.like_count}
                  </Text>
                )}
              </TouchableOpacity>

              {/* 配信者いいね表示（YouTubeスタイル） */}
              {comment.creator_liked && <CreatorLikeIcon />}
            </View>

            {!isReply && descendants.length > 0 && (
              <TouchableOpacity onPress={() => toggleReplies(comment.id)} style={styles.showRepliesBtn}>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={13} color={Colors.accent}
                />
                <Text style={styles.showRepliesText}>
                  {expanded ? '返信を非表示' : `${descendants.length}件の返信を見る`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>

        {!isReply && expanded && (
          <View style={styles.repliesWrap}>
            {descendants.map(r => renderComment(r, true))}
          </View>
        )}
      </View>
    )
  }

  const countAll = (c: Comment): number => 1 + c.replies.reduce((a, r) => a + countAll(r), 0)
  const totalCount = comments.reduce((acc, c) => acc + countAll(c), 0)
  const isCommentMode = !!replyToComment

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>コメント</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={comments}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={() => (
            <>
              {/* 配信プレビュー */}
              <View style={styles.broadcastPreview}>
                {blocks.map(block => (
                  <View key={block.id}>
                    {block.image_url && (
                      <Image source={{ uri: block.image_url }} style={styles.blockImage} resizeMode="cover" />
                    )}
                    {block.content.trim() && block.content !== '　' && (
                      <Text style={styles.blockText}>{block.content}</Text>
                    )}
                  </View>
                ))}
              </View>

              {/* コメント数 */}
              <View style={styles.commentCountRow}>
                <Ionicons name="chatbubble-outline" size={14} color={Colors.textLight} />
                <Text style={styles.commentCountText}>
                  {totalCount > 0 ? `${totalCount}件のコメント` : 'コメントはまだありません'}
                </Text>
              </View>
            </>
          )}
          ListEmptyComponent={() => (
            <View style={styles.emptyWrap}>
              <Ionicons name="chatbubble-outline" size={40} color={Colors.border} />
              <Text style={styles.emptyText}>最初のコメントを書いてみましょう</Text>
            </View>
          )}
          renderItem={({ item }) => renderComment(item)}
        />
      )}

      {/* 入力エリア */}
      <View style={styles.inputArea}>
        {isCommentMode && (
          <View style={styles.replyContext}>
            <Ionicons name="return-down-forward-outline" size={14} color={Colors.accent} />
            <Text style={styles.replyContextText} numberOfLines={1}>
              @{replyToComment.sender_name} に返信
            </Text>
            <TouchableOpacity onPress={() => setReplyToComment(null)}>
              <Ionicons name="close" size={16} color={Colors.textLight} />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={isCommentMode ? `@${replyToComment?.sender_name} に返信...` : 'コメントを追加...'}
            placeholderTextColor={Colors.textLight}
            value={inputText}
            onChangeText={setInputText}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            {sending
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Ionicons name="send" size={18} color={Colors.white} />
            }
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },

  listContent: { paddingBottom: 32 },

  broadcastPreview: {
    backgroundColor: Colors.white,
    margin: 12, marginBottom: 0,
    borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
    gap: 8,
  },
  blockImage: { width: '100%', height: 160, borderRadius: 10 },
  blockText: { fontSize: 14, color: Colors.text, lineHeight: 22 },

  commentCountRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  commentCountText: { fontSize: 13, color: Colors.textLight, fontWeight: '600' },

  commentRow: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    alignItems: 'flex-start',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  commentRowReply: {
    paddingLeft: 24, backgroundColor: '#FAFAF8',
  },
  commentAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, overflow: 'hidden',
  },
  commentAvatarCreator: { borderWidth: 2, borderColor: Colors.accent },
  commentAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  commentAvatarText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  commentBody: { flex: 1, gap: 4 },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  commentName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  commentNameCreator: { color: Colors.accent },
  creatorBadge: { fontSize: 11, color: Colors.accent, fontWeight: '600' },
  commentTime: { fontSize: 11, color: Colors.textLight },
  commentText: { fontSize: 14, color: Colors.text, lineHeight: 20 },

  // アクション行（コメント ＋ いいね）
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4,
  },
  replyBtn: {},
  replyBtnText: { fontSize: 12, color: Colors.textLight, fontWeight: '600' },

  // いいねボタン
  likeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  likeCount: { fontSize: 12, color: Colors.textLight, fontWeight: '600' },
  likeCountActive: { color: Colors.accent },

  // 配信者いいね（YouTubeスタイル）
  creatorLikeWrap: {
    width: 32, height: 24,
    position: 'relative',
  },
  creatorLikeHeart: {
    position: 'absolute', bottom: 0, left: 0,
  },
  creatorLikeAvatar: {
    position: 'absolute', top: 0, right: 0,
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 1.5, borderColor: Colors.white,
    overflow: 'hidden',
    backgroundColor: Colors.button,
  },
  creatorLikeAvatarImg: { width: 16, height: 16, borderRadius: 8 },
  creatorLikeAvatarPlaceholder: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  creatorLikeAvatarText: { fontSize: 8, fontWeight: '700', color: Colors.white },

  showRepliesBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 6, alignSelf: 'flex-start',
  },
  showRepliesText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  repliesWrap: {
    borderLeftWidth: 2, borderLeftColor: Colors.border, marginLeft: 30,
  },

  emptyWrap: { alignItems: 'center', padding: 48, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textLight, textAlign: 'center' },

  inputArea: { backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border },
  replyContext: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
    backgroundColor: '#F8F4EE',
  },
  replyContextText: { flex: 1, fontSize: 12, color: Colors.accent, fontWeight: '500' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, gap: 8 },
  input: {
    flex: 1, backgroundColor: Colors.background, borderRadius: 22,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: Colors.text, maxHeight: 100,
  },
  sendButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: '#B0B0B0' },
})
