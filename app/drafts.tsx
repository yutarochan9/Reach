import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, RefreshControl } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'
import { sendPushToUsers } from '../lib/notifications'

type Draft = {
  id: string
  content: string
  status: 'draft' | 'scheduled'
  scheduled_at: string | null
  target: string | null
  block_order: number | null
  image_url: string | null
  created_at: string
}

export default function DraftsScreen() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userId, setUserId] = useState('')

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data } = await supabase
      .from('broadcasts')
      .select('id, content, status, scheduled_at, target, block_order, image_url, created_at')
      .eq('sender_id', user.id)
      .in('status', ['draft', 'scheduled'])
      .order('created_at', { ascending: false })

    setDrafts((data ?? []) as Draft[])
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const handlePublishNow = async (draft: Draft) => {
    Alert.alert('今すぐ配信', 'この下書きを今すぐ配信しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '配信する', onPress: async () => {
          const { error } = await supabase
            .from('broadcasts')
            .update({ status: 'published', scheduled_at: null })
            .eq('id', draft.id)
          if (error) { Alert.alert('エラー', error.message); return }

          // フォロワーにプッシュ通知
          const { data: follows } = await supabase
            .from('follows').select('follower_id').eq('following_id', userId)
          const followerIds = (follows ?? []).map((f: any) => f.follower_id)
          if (followerIds.length > 0) {
            const { data: prof } = await supabase
              .from('profiles').select('display_name').eq('id', userId).single()
            sendPushToUsers(followerIds, prof?.display_name ?? '新着', draft.content.slice(0, 80))
          }

          load()
        },
      },
    ])
  }

  const handleDelete = async (draft: Draft) => {
    Alert.alert('削除', 'この下書きを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive', onPress: async () => {
          await supabase.from('broadcasts').delete().eq('id', draft.id)
          setDrafts(prev => prev.filter(d => d.id !== draft.id))
        },
      },
    ])
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const getTargetLabel = (target: string | null) => {
    if (target === 'week') return '直近7日'
    if (target === 'month') return '直近30日'
    return '全員'
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  const draftItems = drafts.filter(d => d.status === 'draft')
  const scheduledItems = drafts.filter(d => d.status === 'scheduled')

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/mypage' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>下書き・予約配信</Text>
        <View style={{ width: 32 }} />
      </View>

      <FlatList
        data={drafts}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        ListHeaderComponent={() => (
          <>
            {scheduledItems.length > 0 && (
              <View style={styles.sectionHeader}>
                <Ionicons name="time-outline" size={16} color={Colors.accent} />
                <Text style={styles.sectionTitle}>予約配信 ({scheduledItems.length})</Text>
              </View>
            )}
          </>
        )}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.statusBadge}>
                {item.status === 'scheduled' ? (
                  <><Ionicons name="time" size={12} color={Colors.accent} />
                  <Text style={styles.scheduledBadgeText}>予約</Text></>
                ) : (
                  <><Ionicons name="document-text-outline" size={12} color={Colors.textLight} />
                  <Text style={styles.draftBadgeText}>下書き</Text></>
                )}
              </View>
              <Text style={styles.cardMeta}>
                {item.status === 'scheduled' && item.scheduled_at
                  ? `配信予定: ${formatDate(item.scheduled_at)}`
                  : `保存: ${formatDate(item.created_at)}`}
              </Text>
            </View>

            <Text style={styles.cardContent} numberOfLines={4}>{item.content}</Text>

            <View style={styles.cardFooter}>
              <View style={styles.cardTags}>
                <View style={styles.tag}>
                  <Ionicons name="people-outline" size={11} color={Colors.textLight} />
                  <Text style={styles.tagText}>{getTargetLabel(item.target)}</Text>
                </View>
                {item.image_url && (
                  <View style={styles.tag}>
                    <Ionicons name="image-outline" size={11} color={Colors.textLight} />
                    <Text style={styles.tagText}>画像あり</Text>
                  </View>
                )}
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handlePublishNow(item)}
                >
                  <Ionicons name="radio-outline" size={16} color={Colors.accent} />
                  <Text style={styles.actionButtonText}>今すぐ配信</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(item)}
                >
                  <Ionicons name="trash-outline" size={16} color="#E53E3E" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: Colors.border }} />}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Ionicons name="document-outline" size={48} color={Colors.border} />
            <Text style={styles.emptyTitle}>下書きはありません</Text>
            <Text style={styles.emptyText}>配信画面で下書き保存した内容がここに表示されます</Text>
          </View>
        )}
        contentContainerStyle={drafts.length === 0 ? { flex: 1 } : {}}
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.background,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.accent },
  card: {
    backgroundColor: Colors.white,
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scheduledBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.accent },
  draftBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.textLight },
  cardMeta: { fontSize: 11, color: Colors.textLight, flex: 1 },
  cardContent: { fontSize: 14, color: Colors.text, lineHeight: 21 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTags: { flexDirection: 'row', gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tagText: { fontSize: 11, color: Colors.textLight },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.background,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.accent,
  },
  actionButtonText: { fontSize: 12, color: Colors.accent, fontWeight: '700' },
  deleteButton: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF5F5',
    borderWidth: 1, borderColor: '#FED7D7',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  emptyText: { fontSize: 13, color: Colors.textLight, textAlign: 'center' },
})
