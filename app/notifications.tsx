import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

type NotifItem = {
  id: string
  type: 'like' | 'follow'
  read: boolean
  created_at: string
  actor_id: string
  actor_name: string
  actor_avatar: string | null
  broadcast_id: string | null
  broadcast_preview: string | null
}

export default function NotificationsScreen() {
  const [items, setItems] = useState<NotifItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: notifs } = await supabase
      .from('notifications')
      .select('id, type, read, created_at, actor_id, broadcast_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (!notifs || notifs.length === 0) {
      setItems([])
      setLoading(false)
      return
    }

    const actorIds = [...new Set(notifs.map((n: any) => n.actor_id).filter(Boolean))]
    const broadcastIds = [...new Set(notifs.map((n: any) => n.broadcast_id).filter(Boolean))]

    const [{ data: actors }, { data: broadcasts }] = await Promise.all([
      actorIds.length > 0
        ? supabase.from('profiles').select('id, display_name, avatar_url').in('id', actorIds)
        : Promise.resolve({ data: [] }),
      broadcastIds.length > 0
        ? supabase.from('broadcasts').select('id, content').in('id', broadcastIds)
        : Promise.resolve({ data: [] }),
    ])

    const actorMap: Record<string, { display_name: string; avatar_url: string | null }> = {}
    for (const a of (actors ?? [])) actorMap[a.id] = { display_name: a.display_name, avatar_url: a.avatar_url ?? null }

    const broadcastMap: Record<string, string> = {}
    for (const b of (broadcasts ?? [])) broadcastMap[b.id] = b.content

    const list: NotifItem[] = notifs.map((n: any) => ({
      id: n.id,
      type: n.type,
      read: n.read,
      created_at: n.created_at,
      actor_id: n.actor_id,
      actor_name: actorMap[n.actor_id]?.display_name ?? '?',
      actor_avatar: actorMap[n.actor_id]?.avatar_url ?? null,
      broadcast_id: n.broadcast_id ?? null,
      broadcast_preview: n.broadcast_id ? (broadcastMap[n.broadcast_id] ?? null) : null,
    }))

    setItems(list)
    setLoading(false)

    // 未読を既読に
    const unreadIds = notifs.filter((n: any) => !n.read).map((n: any) => n.id)
    if (unreadIds.length > 0) {
      await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
    }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'たった今'
    if (diffMins < 60) return `${diffMins}分前`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}時間前`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays}日前`
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>通知</Text>
        <View style={{ width: 32 }} />
      </View>

      <FlatList
        data={items}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={48} color={Colors.border} />
            <Text style={styles.emptyText}>通知はありません</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.notifItem, !item.read && styles.notifUnread]}
            onPress={() => {
              if (item.type === 'follow') router.push(`/creator/${item.actor_id}` as any)
              else if (item.broadcast_id) router.push(`/talk/${item.actor_id}` as any)
            }}
            activeOpacity={0.85}
          >
            <TouchableOpacity onPress={() => router.push(`/creator/${item.actor_id}` as any)}>
              {item.actor_avatar ? (
                <Image source={{ uri: item.actor_avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarText}>{item.actor_name[0]}</Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.notifContent}>
              <Text style={styles.notifText}>
                <Text style={styles.actorName}>{item.actor_name}</Text>
                {item.type === 'like' ? ' さんがいいねしました' : ' さんがフォローしました'}
              </Text>
              {item.broadcast_preview && item.type === 'like' && (
                <Text style={styles.preview} numberOfLines={1}>{item.broadcast_preview}</Text>
              )}
              <Text style={styles.time}>{formatTime(item.created_at)}</Text>
            </View>
            {item.type === 'like' && (
              <Ionicons name="heart" size={18} color="#E53E3E" />
            )}
            {item.type === 'follow' && (
              <Ionicons name="person-add" size={18} color={Colors.accent} />
            )}
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
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
  notifItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    backgroundColor: Colors.white,
  },
  notifUnread: { backgroundColor: '#FFF8F0' },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.button,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: Colors.white },
  notifContent: { flex: 1 },
  notifText: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  actorName: { fontWeight: '700' },
  preview: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  time: { fontSize: 11, color: Colors.textLight, marginTop: 4 },
  separator: { height: 1, backgroundColor: Colors.border, marginLeft: 76 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textLight },
})
