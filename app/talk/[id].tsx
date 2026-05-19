import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Modal, Pressable,
} from 'react-native'
const isWeb = Platform.OS === 'web'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'
import { sendPushToUsers } from '../../lib/notifications'

type Broadcast = {
  id: string
  content: string
  image_url: string | null
  created_at: string
  block_order: number
  group_id: string | null
  public_reactions: boolean
}

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

type BroadcastGroup = {
  anchorId: string
  group_id: string | null
  blocks: Broadcast[]
  like_count: number
  liked: boolean
  read_count: number
  public_reactions: boolean
  comments: Comment[]
  comment_count: number
}

export default function TalkDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const senderId = Array.isArray(params.id) ? params.id[0] : params.id
  const [myId, setMyId] = useState<string | null>(null)
  const [isSelf, setIsSelf] = useState(false)
  const [loading, setLoading] = useState(true)
  const [senderName, setSenderName] = useState('')
  const [senderAvatar, setSenderAvatar] = useState<string | null>(null)
  const [groups, setGroups] = useState<BroadcastGroup[]>([])

  const [inputText, setInputText] = useState('')
  const [activeCommentBroadcastId, setActiveCommentBroadcastId] = useState<string | null>(null)
  const [replyToComment, setReplyToComment] = useState<Comment | null>(null)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())
  const [longPressGroup, setLongPressGroup] = useState<BroadcastGroup | null>(null)
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null)

  const flatListRef = useRef<FlatList>(null)
  const inputRef = useRef<TextInput>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setMyId(user.id)
      const self = user.id === senderId
      setIsSelf(self)

      const [{ data: profile }, { data: broadcasts }] = await Promise.all([
        supabase.from('profiles').select('display_name, avatar_url').eq('id', senderId).single(),
        supabase.from('broadcasts')
          .select('id, content, image_url, created_at, block_order, group_id, public_reactions')
          .eq('sender_id', senderId)
          .eq('status', 'published')
          .order('created_at', { ascending: true }),
      ])

      setSenderName(profile?.display_name ?? '')
      setSenderAvatar(profile?.avatar_url ?? null)

      const bcs = (broadcasts ?? []) as Broadcast[]
      const bcIds = bcs.map(b => b.id)

      const [{ data: reactions }, { data: reads }, { data: allMsgs }] = await Promise.all([
        bcIds.length > 0
          ? supabase.from('reactions').select('broadcast_id, user_id').in('broadcast_id', bcIds)
          : Promise.resolve({ data: [] }),
        bcIds.length > 0
          ? supabase.from('broadcast_reads').select('broadcast_id, user_id').in('broadcast_id', bcIds)
          : Promise.resolve({ data: [] }),
        bcIds.length > 0
          ? supabase.from('messages')
              .select('id, content, created_at, sender_id, receiver_id, broadcast_id, parent_message_id')
              .in('broadcast_id', bcIds)
              .order('created_at', { ascending: true })
          : Promise.resolve({ data: [] }),
      ])

      const msgSenderIds = [...new Set((allMsgs ?? []).map((m: any) => m.sender_id))]
      const { data: msgProfiles } = msgSenderIds.length > 0
        ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', msgSenderIds)
        : { data: [] }

      const msgProfileMap: Record<string, { name: string; avatar: string | null }> = {}
      for (const p of (msgProfiles ?? [])) {
        msgProfileMap[p.id] = { name: p.display_name, avatar: p.avatar_url ?? null }
      }

      const likeMap: Record<string, { count: number; liked: boolean }> = {}
      const readMap: Record<string, number> = {}
      for (const r of (reactions ?? [])) {
        if (!likeMap[r.broadcast_id]) likeMap[r.broadcast_id] = { count: 0, liked: false }
        likeMap[r.broadcast_id].count++
        if (r.user_id === user.id) likeMap[r.broadcast_id].liked = true
      }
      for (const r of (reads ?? [])) readMap[r.broadcast_id] = (readMap[r.broadcast_id] ?? 0) + 1

      // ネスト構造でコメントを構築
      const topLevelByBcast: Record<string, Comment[]> = {}
      const commentById: Record<string, Comment> = {}

      for (const m of (allMsgs ?? []) as any[]) {
        if (!m.parent_message_id) {
          const c: Comment = {
            id: m.id, content: m.content, sender_id: m.sender_id,
            sender_name: msgProfileMap[m.sender_id]?.name ?? 'ユーザー',
            sender_avatar: msgProfileMap[m.sender_id]?.avatar ?? null,
            created_at: m.created_at, is_mine: m.sender_id === user.id, replies: [],
          }
          commentById[m.id] = c
          if (!topLevelByBcast[m.broadcast_id]) topLevelByBcast[m.broadcast_id] = []
          topLevelByBcast[m.broadcast_id].push(c)
        }
      }
      for (const m of (allMsgs ?? []) as any[]) {
        if (m.parent_message_id && commentById[m.parent_message_id]) {
          commentById[m.parent_message_id].replies.push({
            id: m.id, content: m.content, sender_id: m.sender_id,
            sender_name: msgProfileMap[m.sender_id]?.name ?? 'ユーザー',
            sender_avatar: msgProfileMap[m.sender_id]?.avatar ?? null,
            created_at: m.created_at, is_mine: m.sender_id === user.id, replies: [],
          })
        }
      }

      const groupMap = new Map<string, Broadcast[]>()
      const groupOrder: string[] = []
      for (const b of bcs) {
        const key = b.group_id ?? b.id
        if (!groupMap.has(key)) { groupMap.set(key, []); groupOrder.push(key) }
        groupMap.get(key)!.push(b)
      }

      const result: BroadcastGroup[] = groupOrder.map(key => {
        const blocks = groupMap.get(key)!.sort((a, b) => a.block_order - b.block_order)
        const anchor = blocks[0]
        const comments = topLevelByBcast[anchor.id] ?? []
        return {
          anchorId: anchor.id, group_id: anchor.group_id, blocks,
          like_count: likeMap[anchor.id]?.count ?? 0,
          liked: likeMap[anchor.id]?.liked ?? false,
          read_count: readMap[anchor.id] ?? 0,
          public_reactions: anchor.public_reactions,
          comments,
          comment_count: comments.reduce((acc, c) => acc + 1 + c.replies.length, 0),
        }
      })
      setGroups(result)

      if (!self && bcIds.length > 0) {
        await supabase.from('talk_reads').upsert(
          { user_id: user.id, sender_id: senderId, last_read_at: new Date().toISOString() },
          { onConflict: 'user_id,sender_id' }
        )
        const alreadyRead = new Set(
          (reads ?? []).filter((r: any) => r.user_id === user.id).map((r: any) => r.broadcast_id)
        )
        const toMark = bcIds.filter(id => !alreadyRead.has(id))
        if (toMark.length > 0) {
          await supabase.from('broadcast_reads').upsert(
            toMark.map(id => ({ broadcast_id: id, user_id: user.id })),
            { onConflict: 'broadcast_id,user_id' }
          )
        }
      }
    } catch (e) {
      console.error('talk/[id] load error:', e)
    } finally {
      setLoading(false)
    }
  }, [senderId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!myId || !senderId) return
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    const channel = supabase
      .channel(`talk-detail-${senderId}-${myId}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'broadcasts',
        filter: `sender_id=eq.${senderId}`,
      }, (payload) => {
        try {
          const bc = payload.new as any
          if (bc.status !== 'published') return
          const newBlock: Broadcast = {
            id: bc.id, content: bc.content, image_url: bc.image_url ?? null,
            created_at: bc.created_at, block_order: bc.block_order,
            group_id: bc.group_id ?? null, public_reactions: bc.public_reactions ?? false,
          }
          setGroups(prev => {
            if (bc.group_id) {
              const existing = prev.find(g => g.group_id === bc.group_id)
              if (existing) {
                return prev.map(g =>
                  g.group_id === bc.group_id
                    ? { ...g, blocks: [...g.blocks, newBlock].sort((a, b) => a.block_order - b.block_order) }
                    : g
                )
              }
            }
            return [...prev, {
              anchorId: bc.id, group_id: bc.group_id ?? null, blocks: [newBlock],
              like_count: 0, liked: false, read_count: 0,
              public_reactions: bc.public_reactions ?? false, comments: [], comment_count: 0,
            }]
          })
          setTimeout(() => flatListRef.current?.scrollToEnd(), 100)
          if (myId !== senderId) {
            supabase.from('broadcast_reads').upsert(
              { broadcast_id: bc.id, user_id: myId },
              { onConflict: 'broadcast_id,user_id' }
            ).catch(() => {})
          }
        } catch {}
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' }, (payload) => {
        setGroups(prev => prev.map(g =>
          g.anchorId === payload.new.broadcast_id
            ? { ...g, like_count: g.like_count + 1, liked: payload.new.user_id === myId ? true : g.liked }
            : g
        ))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reactions' }, (payload) => {
        setGroups(prev => prev.map(g =>
          g.anchorId === payload.old?.broadcast_id
            ? { ...g, like_count: Math.max(0, g.like_count - 1), liked: payload.old?.user_id === myId ? false : g.liked }
            : g
        ))
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(() => {})
        channelRef.current = null
      }
    }
  }, [myId, senderId])

  const handleLike = async (group: BroadcastGroup) => {
    if (!myId || isSelf) return
    if (group.liked) {
      await supabase.from('reactions').delete()
        .eq('broadcast_id', group.anchorId).eq('user_id', myId).eq('type', 'like')
      setGroups(prev => prev.map(g =>
        g.anchorId === group.anchorId ? { ...g, like_count: Math.max(0, g.like_count - 1), liked: false } : g
      ))
    } else {
      await supabase.from('reactions').insert({ broadcast_id: group.anchorId, user_id: myId, type: 'like' })
      setGroups(prev => prev.map(g =>
        g.anchorId === group.anchorId ? { ...g, like_count: g.like_count + 1, liked: true } : g
      ))
    }
  }

  const focusComment = (broadcastId: string) => {
    setActiveCommentBroadcastId(broadcastId)
    setReplyToComment(null)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const focusReply = (comment: Comment, broadcastId: string) => {
    setActiveCommentBroadcastId(broadcastId)
    setReplyToComment(comment)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const cancelComment = () => {
    setActiveCommentBroadcastId(null)
    setReplyToComment(null)
  }

  const toggleReplies = (commentId: string) => {
    setExpandedReplies(prev => {
      const next = new Set(prev)
      if (next.has(commentId)) next.delete(commentId)
      else next.add(commentId)
      return next
    })
  }

  const handleSend = async () => {
    if (!inputText.trim() || !myId) return
    const text = inputText.trim()
    setInputText('')

    if (activeCommentBroadcastId) {
      let receiverId = senderId
      if (replyToComment) {
        receiverId = replyToComment.sender_id !== myId ? replyToComment.sender_id : senderId
      }
      await supabase.from('messages').insert({
        sender_id: myId,
        receiver_id: receiverId,
        content: text,
        broadcast_id: activeCommentBroadcastId,
        parent_message_id: replyToComment?.id ?? null,
      })
      setReplyToComment(null)
      setActiveCommentBroadcastId(null)
      await load()
    } else if (!isSelf) {
      await supabase.from('messages').insert({
        sender_id: myId,
        receiver_id: senderId,
        content: text,
      })
      const { data: myProfile } = await supabase
        .from('profiles').select('display_name').eq('id', myId).single()
      sendPushToUsers([senderId], myProfile?.display_name ?? 'メッセージ', text.slice(0, 80))
    }
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
    if (diffDay === 1) return '昨日'
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  const renderComment = (comment: Comment, broadcastId: string, isReply = false) => {
    const repliesExpanded = expandedReplies.has(comment.id)
    return (
      <View key={comment.id}>
        <View style={[styles.commentRow, isReply && styles.commentRowReply]}>
          <View style={styles.commentAvatar}>
            {comment.sender_avatar
              ? <Image source={{ uri: comment.sender_avatar }} style={styles.commentAvatarImg} />
              : <Text style={styles.commentAvatarText}>{comment.sender_name[0]}</Text>
            }
          </View>
          <View style={styles.commentBody}>
            <View style={styles.commentMeta}>
              <Text style={styles.commentName}>{comment.sender_name}</Text>
              <Text style={styles.commentTime}>{formatTime(comment.created_at)}</Text>
            </View>
            <Text style={styles.commentText}>{comment.content}</Text>
            {!isReply && (
              <TouchableOpacity onPress={() => focusReply(comment, broadcastId)} style={styles.replyBtn}>
                <Text style={styles.replyBtnText}>返信する</Text>
              </TouchableOpacity>
            )}
            {!isReply && comment.replies.length > 0 && (
              <TouchableOpacity onPress={() => toggleReplies(comment.id)} style={styles.showRepliesBtn}>
                <Ionicons
                  name={repliesExpanded ? 'chevron-up' : 'chevron-down'}
                  size={12} color={Colors.accent}
                />
                <Text style={styles.showRepliesText}>
                  {repliesExpanded ? '返信を非表示' : `${comment.replies.length}件の返信`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {!isReply && repliesExpanded && (
          <View style={styles.repliesWrap}>
            {comment.replies.map(reply => renderComment(reply, broadcastId, true))}
          </View>
        )}
      </View>
    )
  }

  const renderCommentsSection = (group: BroadcastGroup) => (
    <View style={styles.commentsSection}>
      {/* ハート・コメントアクションバー */}
      <View style={styles.actionsBar}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => !isSelf && handleLike(group)}
          activeOpacity={isSelf ? 1 : 0.7}
        >
          <Ionicons
            name={group.liked ? 'heart' : 'heart-outline'}
            size={22}
            color={group.liked ? '#E53E3E' : isSelf ? Colors.border : Colors.text}
          />
          {group.like_count > 0 && (
            <Text style={[styles.actionCount, group.liked && styles.actionCountLiked]}>
              {group.like_count}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => focusComment(group.anchorId)}
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubble-outline" size={20} color={Colors.textLight} />
          {group.comment_count > 0 && (
            <Text style={styles.actionCountMuted}>{group.comment_count}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* コメント一覧 */}
      {group.comments.length > 0 && (
        <View style={styles.commentsList}>
          {group.comments.map(c => renderComment(c, group.anchorId))}
        </View>
      )}
    </View>
  )

  const isCommentMode = !!activeCommentBroadcastId

  const BroadcastList = (
    <FlatList
      ref={flatListRef}
      data={groups}
      keyExtractor={item => item.anchorId}
      contentContainerStyle={styles.messageList}
      onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      ListEmptyComponent={() => (
        <View style={styles.emptyWrap}>
          <Ionicons name="radio-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyText}>まだ配信がありません</Text>
        </View>
      )}
      renderItem={({ item: group, index }) => {
        if (!group.blocks.length) return null
        const prevGroup = index > 0 ? groups[index - 1] : null
        const showDate = !prevGroup || !prevGroup.blocks.length ||
          new Date(group.blocks[0].created_at).toDateString() !== new Date(prevGroup.blocks[0].created_at).toDateString()
        return (
          <>
            {showDate && (
              <View style={styles.dateDivider}>
                <Text style={styles.dateText}>
                  {new Date(group.blocks[0].created_at).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}
                </Text>
              </View>
            )}
            <View
              style={styles.groupWrap}
              {...(isWeb ? {
                onMouseEnter: () => setHoveredGroupId(group.anchorId),
                onMouseLeave: () => setHoveredGroupId(null),
              } as any : {})}
            >
              <View style={styles.broadcastRow}>
                {!isSelf && (
                  <View style={styles.broadcastAvatar}>
                    {senderAvatar
                      ? <Image source={{ uri: senderAvatar }} style={styles.broadcastAvatarImg} />
                      : <Text style={styles.broadcastAvatarText}>{senderName[0]}</Text>
                    }
                  </View>
                )}
                <View style={styles.blocksWrap}>
                  {group.blocks.map((block, idx) => (
                    <TouchableOpacity
                      key={block.id}
                      style={[styles.broadcastBubble, isSelf && styles.broadcastBubbleSelf, idx > 0 && { marginTop: 4 }]}
                      onPress={isSelf ? () => router.push(`/broadcast-thread/${group.anchorId}` as any) : undefined}
                      onLongPress={!isWeb ? () => setLongPressGroup(group) : undefined}
                      delayLongPress={400}
                      activeOpacity={isSelf ? 0.8 : 0.95}
                    >
                      {block.image_url && (
                        <Image source={{ uri: block.image_url }} style={styles.broadcastImage} resizeMode="cover" />
                      )}
                      {block.content.trim() && block.content !== '　' && (
                        <Text style={[styles.broadcastText, isSelf && styles.broadcastTextSelf]}>{block.content}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                  <View style={styles.bubbleFooter}>
                    <Text style={styles.bubbleTime}>
                      {formatTime(group.blocks[group.blocks.length - 1].created_at)}
                    </Text>
                    {isWeb && hoveredGroupId === group.anchorId && (
                      <TouchableOpacity
                        style={styles.moreBtn}
                        onPress={() => setLongPressGroup(group)}
                      >
                        <Text style={styles.moreBtnText}>···</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {renderCommentsSection(group)}
                </View>
              </View>
            </View>
          </>
        )
      }}
    />
  )

  const ReactionPopup = (
    <Modal
      visible={!!longPressGroup}
      transparent
      animationType="fade"
      onRequestClose={() => setLongPressGroup(null)}
    >
      <Pressable style={styles.popupOverlay} onPress={() => setLongPressGroup(null)}>
        <View style={styles.popupBox}>
          {isSelf && (
            <TouchableOpacity
              style={styles.popupBtn}
              onPress={() => {
                if (longPressGroup) router.push(`/broadcast-thread/${longPressGroup.anchorId}` as any)
                setLongPressGroup(null)
              }}
            >
              <Ionicons name="chatbubble-outline" size={22} color={Colors.text} />
              <Text style={styles.popupBtnText}>コメントを見る</Text>
            </TouchableOpacity>
          )}
        </View>
      </Pressable>
    </Modal>
  )

  if (isSelf) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>あなたの配信</Text>
          <View style={{ width: 32 }} />
        </View>
        {BroadcastList}
        {ReactionPopup}
        {/* 発信者用：返信モード時のみ表示 */}
        {isCommentMode && (
          <View style={styles.inputArea}>
            <View style={styles.commentContext}>
              <Ionicons name="return-down-forward-outline" size={14} color={Colors.accent} />
              <Text style={styles.commentContextText} numberOfLines={1}>
                {replyToComment ? `@${replyToComment.sender_name} に返信` : 'コメントを追加'}
              </Text>
              <TouchableOpacity onPress={cancelComment}>
                <Ionicons name="close" size={16} color={Colors.textLight} />
              </TouchableOpacity>
            </View>
            <View style={styles.inputRow}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder={replyToComment ? `@${replyToComment.sender_name} に返信...` : 'コメントを追加...'}
                placeholderTextColor={Colors.textLight}
                value={inputText}
                onChangeText={setInputText}
                multiline
              />
              <TouchableOpacity
                style={[styles.sendButton, !inputText.trim() && styles.sendDisabled]}
                onPress={handleSend}
                disabled={!inputText.trim()}
              >
                <Ionicons name="send" size={18} color={Colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerAvatar}>
            {senderAvatar
              ? <Image source={{ uri: senderAvatar }} style={styles.headerAvatarImage} />
              : <Text style={styles.headerAvatarText}>{senderName[0]}</Text>
            }
          </View>
          <Text style={styles.headerName}>{senderName}</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {BroadcastList}
      {ReactionPopup}

      <View style={styles.inputArea}>
        {isCommentMode && (
          <View style={styles.commentContext}>
            <Ionicons name={replyToComment ? 'return-down-forward-outline' : 'chatbubble-outline'} size={14} color={Colors.accent} />
            <Text style={styles.commentContextText} numberOfLines={1}>
              {replyToComment ? `@${replyToComment.sender_name} に返信` : 'コメントを追加'}
            </Text>
            <TouchableOpacity onPress={cancelComment}>
              <Ionicons name="close" size={16} color={Colors.textLight} />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={
              isCommentMode
                ? (replyToComment ? `@${replyToComment.sender_name} に返信...` : 'コメントを追加...')
                : 'メッセージを送る...'
            }
            placeholderTextColor={Colors.textLight}
            value={inputText}
            onChangeText={setInputText}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim()}
          >
            <Ionicons name="send" size={18} color={Colors.white} />
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
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'center' },
  headerAvatar: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  headerAvatarImage: { width: 36, height: 36, borderRadius: 8 },
  headerAvatarText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  headerName: { fontSize: 15, fontWeight: '700', color: Colors.text },

  messageList: { padding: 16, gap: 12, paddingBottom: 32 },
  dateDivider: { alignItems: 'center', marginVertical: 8 },
  dateText: {
    fontSize: 11, color: Colors.textLight,
    backgroundColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12,
  },
  groupWrap: { marginBottom: 4 },
  broadcastRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  broadcastAvatar: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: Colors.button,
    alignItems: 'center', justifyContent: 'center', marginTop: 2, overflow: 'hidden', flexShrink: 0,
  },
  broadcastAvatarImg: { width: 36, height: 36, borderRadius: 8 },
  broadcastAvatarText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  blocksWrap: { flex: 1 },
  broadcastBubble: {
    backgroundColor: Colors.white, borderRadius: 16, borderTopLeftRadius: 4,
    padding: 12, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
    alignSelf: 'flex-start',
  },
  broadcastBubbleSelf: { backgroundColor: Colors.button },
  broadcastImage: { width: 220, height: 160, borderRadius: 12, marginBottom: 4 },
  broadcastText: { fontSize: 14, color: Colors.text, lineHeight: 21 },
  broadcastTextSelf: { color: Colors.white },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  bubbleTime: { fontSize: 10, color: Colors.textLight, marginLeft: 2 },
  moreBtn: {
    paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
  },
  moreBtnText: { fontSize: 14, color: Colors.textLight, letterSpacing: 2 },

  // コメントセクション
  commentsSection: {
    marginTop: 6,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderTopLeftRadius: 2,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  actionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 0,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 2, paddingHorizontal: 6,
  },
  actionCount: { fontSize: 14, fontWeight: '600', color: Colors.text },
  actionCountLiked: { color: '#E53E3E' },
  actionCountMuted: { fontSize: 13, color: Colors.textLight, fontWeight: '500' },

  commentsList: {
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingTop: 4, paddingBottom: 8,
  },
  commentRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    alignItems: 'flex-start',
  },
  commentRowReply: {
    paddingLeft: 20,
  },
  commentAvatar: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, overflow: 'hidden',
  },
  commentAvatarImg: { width: 30, height: 30, borderRadius: 8 },
  commentAvatarText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  commentBody: { flex: 1, gap: 2 },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  commentTime: { fontSize: 11, color: Colors.textLight },
  commentText: { fontSize: 13, color: Colors.text, lineHeight: 19 },
  replyBtn: { marginTop: 4, alignSelf: 'flex-start' },
  replyBtnText: { fontSize: 12, color: Colors.textLight, fontWeight: '600' },
  showRepliesBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, alignSelf: 'flex-start',
  },
  showRepliesText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  repliesWrap: {
    borderLeftWidth: 2, borderLeftColor: Colors.border, marginLeft: 27,
  },

  // 入力エリア
  inputArea: { backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border },
  commentContext: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
    backgroundColor: '#F8F4EE',
  },
  commentContextText: { flex: 1, fontSize: 12, color: Colors.accent, fontWeight: '500' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, gap: 8 },
  input: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 22,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: Colors.text, maxHeight: 100,
  },
  sendButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: '#B0B0B0' },

  popupOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center',
  },
  popupBox: {
    backgroundColor: Colors.white, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 4,
    minWidth: 200, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  popupBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 20 },
  popupBtnText: { fontSize: 16, color: Colors.text, fontWeight: '500' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textLight },
})
