import { useState, useCallback, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

type IMConvo = {
  userId: string
  userName: string
  userAvatar: string | null
  lastMessage: string
  lastTime: string
  isOfficial: boolean
}

export default function IMInboxScreen() {
  const [convos, setConvos] = useState<IMConvo[]>([])
  const [loading, setLoading] = useState(true)
  const myIdRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    myIdRef.current = user.id

    // 自分宛のIMメッセージ（broadcast_id IS NULL）
    const { data: imMessages } = await supabase
      .from('messages')
      .select('id, content, sender_id, created_at')
      .eq('receiver_id', user.id)
      .is('broadcast_id', null)
      .order('created_at', { ascending: false })

    // 送信者ごとに最新1件
    const seen = new Set<string>()
    const raw: { userId: string; lastMessage: string; lastTime: string }[] = []
    for (const m of (imMessages ?? [])) {
      if (!seen.has(m.sender_id)) {
        seen.add(m.sender_id)
        raw.push({ userId: m.sender_id, lastMessage: m.content, lastTime: m.created_at })
      }
    }

    if (raw.length === 0) {
      setConvos([])
      setLoading(false)
      return
    }

    const senderIds = raw.map(c => c.userId)
    const { data: profiles } = await supabase
      .from('profiles').select('id, display_name, avatar_url, is_official').in('id', senderIds)
    const profMap: Record<string, { display_name: string; avatar_url: string | null; is_official: boolean }> = {}
    for (const p of (profiles ?? [])) profMap[p.id] = p

    setConvos(raw.map(c => ({
      ...c,
      userName: profMap[c.userId]?.display_name ?? '?',
      userAvatar: profMap[c.userId]?.avatar_url ?? null,
      isOfficial: profMap[c.userId]?.is_official ?? false,
    })))
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // リアルタイム：自分宛の新着DMを受信したら即リロード
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      channel = supabase.channel(`im-inbox-${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`,
        }, (payload) => {
          if ((payload.new as any).broadcast_id) return // ブロードキャストコメントは除外
          load()
        })
        .subscribe()
    })
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [load])

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
        <Text style={styles.headerTitle}>メッセージ受信箱</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={convos}
          keyExtractor={item => item.userId}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={Colors.border} />
              <Text style={styles.emptyText}>IMはまだありません</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.convoRow}
              onPress={() => router.push(`/im/${item.userId}` as any)}
              activeOpacity={0.85}
            >
              {item.userAvatar ? (
                <Image source={{ uri: item.userAvatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarText}>{item.userName[0]}</Text>
                </View>
              )}
              <View style={styles.convoInfo}>
                <View style={styles.convoHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.name}>{item.userName}</Text>
                    {item.isOfficial && <Ionicons name="checkmark-circle" size={14} color="#1D9BF0" />}
                  </View>
                  <Text style={styles.time}>{formatTime(item.lastTime)}</Text>
                </View>
                <Text style={styles.lastMsg} numberOfLines={1}>{item.lastMessage}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.border} />
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: Colors.border, marginLeft: 76 }} />
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
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  convoRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, backgroundColor: Colors.white, gap: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: Colors.white },
  convoInfo: { flex: 1 },
  convoHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text },
  time: { fontSize: 12, color: Colors.textLight },
  lastMsg: { fontSize: 13, color: Colors.textLight },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textLight },
})
