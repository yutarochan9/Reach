import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native'
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

type ReplyItem = {
  id: string
  content: string
  sender_id: string
  sender_name: string
  sender_avatar: string | null
  created_at: string
}

type BroadcastBlock = {
  id: string
  content: string
  image_url: string | null
  block_order: number
}

export default function BroadcastThreadScreen() {
  const { id: anchorId } = useLocalSearchParams<{ id: string }>()
  const [replies, setReplies] = useState<ReplyItem[]>([])
  const [blocks, setBlocks] = useState<BroadcastBlock[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)

    // アンカー配信を取得してgroup_id確認
    const { data: anchor } = await supabase
      .from('broadcasts')
      .select('id, content, image_url, block_order, group_id')
      .eq('id', anchorId)
      .single()

    if (!anchor) { setLoading(false); return }

    // 同一グループの全ブロック取得
    let broadcastIds: string[] = [anchorId]
    let allBlocks: BroadcastBlock[] = [anchor]

    if (anchor.group_id) {
      const { data: groupBlocks } = await supabase
        .from('broadcasts')
        .select('id, content, image_url, block_order')
        .eq('group_id', anchor.group_id)
        .order('block_order', { ascending: true })
      if (groupBlocks && groupBlocks.length > 0) {
        allBlocks = groupBlocks
        broadcastIds = groupBlocks.map((b: any) => b.id)
      }
    }

    setBlocks(allBlocks.sort((a, b) => a.block_order - b.block_order))

    // この配信グループへの返信メッセージ
    const { data: messages } = await supabase
      .from('messages')
      .select('id, content, sender_id, created_at')
      .in('broadcast_id', broadcastIds)
      .order('created_at', { ascending: false })

    if (!messages || messages.length === 0) {
      setReplies([])
      setLoading(false)
      return
    }

    const senderIds = [...new Set(messages.map((m: any) => m.sender_id))]
    const { data: profiles } = await supabase
      .from('profiles').select('id, display_name, avatar_url').in('id', senderIds)

    const profMap: Record<string, { display_name: string; avatar_url: string | null }> = {}
    for (const p of (profiles ?? [])) profMap[p.id] = p

    setReplies(messages.map((m: any) => ({
      id: m.id,
      content: m.content,
      sender_id: m.sender_id,
      sender_name: profMap[m.sender_id]?.display_name ?? '?',
      sender_avatar: profMap[m.sender_id]?.avatar_url ?? null,
      created_at: m.created_at,
    })))

    setLoading(false)
  }, [anchorId])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
    if (diff === 0) return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    if (diff === 1) return '昨日'
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>返信一覧</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={replies}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 32 }}
          ListHeaderComponent={() => (
            <View style={styles.broadcastPreview}>
              <Text style={styles.broadcastPreviewLabel}>配信内容</Text>
              {blocks.map(block => (
                <View key={block.id} style={styles.blockItem}>
                  {block.image_url && (
                    <Image source={{ uri: block.image_url }} style={styles.blockImage} resizeMode="cover" />
                  )}
                  {block.content.trim() && block.content !== '　' && (
                    <Text style={styles.blockText}>{block.content}</Text>
                  )}
                </View>
              ))}
              <View style={styles.divider} />
              <Text style={styles.replyCountLabel}>{replies.length}件の返信</Text>
            </View>
          )}
          ListEmptyComponent={() => (
            <View style={styles.emptyWrap}>
              <Ionicons name="chatbubble-outline" size={40} color={Colors.border} />
              <Text style={styles.emptyText}>返信はまだありません</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.replyRow}
              onPress={() => router.push(`/im/${item.sender_id}` as any)}
              activeOpacity={0.85}
            >
              {item.sender_avatar ? (
                <Image source={{ uri: item.sender_avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarText}>{item.sender_name[0]}</Text>
                </View>
              )}
              <View style={styles.replyContent}>
                <View style={styles.replyHeader}>
                  <Text style={styles.senderName}>{item.sender_name}</Text>
                  <Text style={styles.replyTime}>{formatTime(item.created_at)}</Text>
                </View>
                <Text style={styles.replyText}>{item.content}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={Colors.border} />
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: Colors.border, marginLeft: 68 }} />
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  broadcastPreview: {
    backgroundColor: Colors.white,
    margin: 12,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  broadcastPreviewLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },
  blockItem: { marginBottom: 8 },
  blockImage: { width: '100%', height: 160, borderRadius: 10, marginBottom: 6 },
  blockText: { fontSize: 14, color: Colors.text, lineHeight: 21 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  replyCountLabel: { fontSize: 13, fontWeight: '600', color: Colors.textLight },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: Colors.white,
    gap: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.button,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: Colors.white },
  replyContent: { flex: 1 },
  replyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  senderName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  replyTime: { fontSize: 11, color: Colors.textLight },
  replyText: { fontSize: 13, color: Colors.text, lineHeight: 19 },
  emptyWrap: { alignItems: 'center', padding: 40, gap: 10 },
  emptyText: { fontSize: 14, color: Colors.textLight },
})
