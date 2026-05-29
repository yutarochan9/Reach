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

    const senderIds = [...new Set([user.id, ...allMsgs.map((m: any) => m.sender_id)])]
    const { data: profiles } = await supabase
      .from('profiles').select('id, display_name, avatar_url').in('id', senderIds)
    const profMap: Record<string, { name: string; avatar: string | null }> = {}
    for (const p of (profiles ?? [])) profMap[p.id] = { name: p.display_name, avatar: p.avatar_url ?? null }
    setMyName(profMap[user.id]?.name ?? '')
    setMyAvatar(profMap[user.id]?.avatar ?? null)

    const byId: Record<string, Comment> = {}
    for (const m of allMsgs as any[]) {
      byId[m.id] = {
        id: m.id, content: m.content, sender_id: m.sender_id,
        sender_name: profMap[m.sender_id]?.name ?? 'ユーザー',
        sender_avatar: profMap[m.sender_id]?.avatar ?? null,
        created_at: m.created_at, is_mine: m.sender_id === user.id, replies: [],
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

            <TouchableOpacity
              onPress={() => {
                setReplyToComment(comment)
                setTimeout(() => inputRef.current?.focus(), 100)
              }}
              style={styles.replyBtn}
            >
              <Text style={styles.replyBtnText}>コメントする</Text>
            </TouchableOpacity>

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
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/home' as any)} style={styles.backButton}>
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
  replyBtn: { alignSelf: 'flex-start', marginTop: 4 },
  replyBtnText: { fontSize: 12, color: Colors.textLight, fontWeight: '600' },
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
