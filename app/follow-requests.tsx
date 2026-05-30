import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

type Request = {
  id: string
  requester_id: string
  created_at: string
  name: string
  avatar: string | null
}

export default function FollowRequestsScreen() {
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [myId, setMyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setMyId(user.id)

    const { data } = await supabase
      .from('follow_requests')
      .select('id, requester_id, created_at')
      .eq('target_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (!data?.length) { setRequests([]); setLoading(false); return }

    const requesterIds = data.map((r: any) => r.requester_id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', requesterIds)

    const profMap: Record<string, { display_name: string; avatar_url: string | null }> = {}
    for (const p of (profiles ?? [])) profMap[p.id] = p

    setRequests(data.map((r: any) => ({
      id: r.id,
      requester_id: r.requester_id,
      created_at: r.created_at,
      name: profMap[r.requester_id]?.display_name ?? '?',
      avatar: profMap[r.requester_id]?.avatar_url ?? null,
    })))
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const handleApprove = async (req: Request) => {
    // フォロー承認：follows に追加 + リクエストを approved に更新
    await Promise.all([
      supabase.from('follows').insert({ follower_id: req.requester_id, following_id: myId }),
      supabase.from('follow_requests').update({ status: 'approved' }).eq('id', req.id),
    ])
    setRequests(prev => prev.filter(r => r.id !== req.id))
  }

  const handleReject = async (req: Request) => {
    await supabase.from('follow_requests').update({ status: 'rejected' }).eq('id', req.id)
    setRequests(prev => prev.filter(r => r.id !== req.id))
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/settings' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>フォローリクエスト</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.accent} /></View>
      ) : requests.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyText}>リクエストはありません</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={r => r.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <TouchableOpacity onPress={() => router.push(`/creator/${item.requester_id}` as any)} activeOpacity={0.8}>
                <View style={styles.avatar}>
                  {item.avatar
                    ? <Image source={{ uri: item.avatar }} style={styles.avatarImg} />
                    : <Text style={styles.avatarText}>{item.name[0]}</Text>
                  }
                </View>
              </TouchableOpacity>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(item)}>
                  <Text style={styles.approveTxt}>承認</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.rejectBtn} onPress={() => handleReject(item)}>
                  <Text style={styles.rejectTxt}>削除</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textLight },
  list: { padding: 16, gap: 0 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarText: { fontSize: 18, fontWeight: '700', color: Colors.white },
  name: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
  actions: { flexDirection: 'row', gap: 8 },
  approveBtn: {
    backgroundColor: Colors.accent, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  approveTxt: { fontSize: 13, fontWeight: '700', color: Colors.white },
  rejectBtn: {
    backgroundColor: Colors.white, borderRadius: 8, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  rejectTxt: { fontSize: 13, fontWeight: '600', color: Colors.textLight },
  sep: { height: 1, backgroundColor: Colors.border, marginLeft: 72 },
})
