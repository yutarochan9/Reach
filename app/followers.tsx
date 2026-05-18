import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, TextInput, Modal, Image
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

type Follower = {
  id: string
  display_name: string
  avatar_url: string | null
  followed_at: string
  tags: string[]
}

export default function FollowersScreen() {
  const [followers, setFollowers] = useState<Follower[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [tagModalVisible, setTagModalVisible] = useState(false)
  const [selectedFollower, setSelectedFollower] = useState<Follower | null>(null)
  const [newTag, setNewTag] = useState('')
  const [savingTag, setSavingTag] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data: follows } = await supabase
      .from('follows')
      .select('follower_id, created_at')
      .eq('following_id', user.id)
      .order('created_at', { ascending: false })

    if (!follows?.length) { setLoading(false); return }

    const ids = follows.map((f: any) => f.follower_id)
    const [{ data: profiles }, { data: tags }] = await Promise.all([
      supabase.from('profiles').select('id, display_name, avatar_url').in('id', ids),
      supabase.from('follower_tags').select('follower_id, tag').eq('creator_id', user.id).in('follower_id', ids),
    ])

    const tagMap: Record<string, string[]> = {}
    for (const t of (tags ?? [])) {
      if (!tagMap[t.follower_id]) tagMap[t.follower_id] = []
      tagMap[t.follower_id].push(t.tag)
    }

    const result: Follower[] = follows.map((f: any) => {
      const prof = (profiles ?? []).find((p: any) => p.id === f.follower_id)
      return {
        id: f.follower_id,
        display_name: prof?.display_name ?? 'ユーザー',
        avatar_url: prof?.avatar_url ?? null,
        followed_at: f.created_at,
        tags: tagMap[f.follower_id] ?? [],
      }
    })

    setFollowers(result)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const openTagModal = (follower: Follower) => {
    setSelectedFollower(follower)
    setNewTag('')
    setTagModalVisible(true)
  }

  const handleAddTag = async () => {
    if (!newTag.trim() || !userId || !selectedFollower) return
    setSavingTag(true)
    await supabase.from('follower_tags').upsert({
      creator_id: userId,
      follower_id: selectedFollower.id,
      tag: newTag.trim(),
    })
    setFollowers(prev => prev.map(f =>
      f.id === selectedFollower.id
        ? { ...f, tags: [...new Set([...f.tags, newTag.trim()])] }
        : f
    ))
    setSelectedFollower(prev => prev ? { ...prev, tags: [...new Set([...prev.tags, newTag.trim()])] } : prev)
    setNewTag('')
    setSavingTag(false)
  }

  const handleRemoveTag = async (tag: string) => {
    if (!userId || !selectedFollower) return
    await supabase.from('follower_tags')
      .delete()
      .eq('creator_id', userId)
      .eq('follower_id', selectedFollower.id)
      .eq('tag', tag)
    setFollowers(prev => prev.map(f =>
      f.id === selectedFollower.id ? { ...f, tags: f.tags.filter(t => t !== tag) } : f
    ))
    setSelectedFollower(prev => prev ? { ...prev, tags: prev.tags.filter(t => t !== tag) } : prev)
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} フォロー`
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
        <Text style={styles.headerTitle}>フォロワー管理 ({followers.length}人)</Text>
        <View style={{ width: 32 }} />
      </View>

      {followers.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyText}>フォロワーがいません</Text>
        </View>
      ) : (
        <FlatList
          data={followers}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <TouchableOpacity
                onPress={() => router.push(`/creator/${item.id}` as any)}
                style={styles.cardLeft}
                activeOpacity={0.7}
              >
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>{item.display_name[0]}</Text>
                  </View>
                )}
                <View style={styles.info}>
                  <Text style={styles.name}>{item.display_name}</Text>
                  <Text style={styles.followDate}>{formatDate(item.followed_at)}</Text>
                  {item.tags.length > 0 && (
                    <View style={styles.tagRow}>
                      {item.tags.map(tag => (
                        <View key={tag} style={styles.tagChip}>
                          <Text style={styles.tagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tagBtn} onPress={() => openTagModal(item)}>
                <Ionicons name="pricetag-outline" size={18} color={Colors.accent} />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <Modal visible={tagModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setTagModalVisible(false)}>
              <Text style={styles.modalClose}>完了</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{selectedFollower?.display_name} のタグ</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.modalBody}>
            <View style={styles.currentTags}>
              {(selectedFollower?.tags ?? []).length === 0 ? (
                <Text style={styles.noTagText}>タグがまだありません</Text>
              ) : (
                (selectedFollower?.tags ?? []).map(tag => (
                  <View key={tag} style={styles.tagChipLarge}>
                    <Text style={styles.tagTextLarge}>{tag}</Text>
                    <TouchableOpacity onPress={() => handleRemoveTag(tag)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Ionicons name="close" size={14} color={Colors.accent} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
            <Text style={styles.fieldLabel}>タグを追加</Text>
            <View style={styles.tagInputRow}>
              <TextInput
                style={styles.tagInput}
                placeholder="例: VIP、購入済み、東京"
                placeholderTextColor={Colors.textLight}
                value={newTag}
                onChangeText={setNewTag}
                onSubmitEditing={handleAddTag}
                maxLength={20}
              />
              <TouchableOpacity
                style={[styles.tagAddBtn, (!newTag.trim() || savingTag) && { opacity: 0.4 }]}
                onPress={handleAddTag}
                disabled={!newTag.trim() || savingTag}
              >
                {savingTag ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.tagAddText}>追加</Text>}
              </TouchableOpacity>
            </View>
            <Text style={styles.tagHint}>タグはセグメント配信（プロプラン）で使えます</Text>
          </View>
        </View>
      </Modal>
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
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14, flexDirection: 'row', alignItems: 'center',
  },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  info: { flex: 1, gap: 3 },
  name: { fontSize: 14, fontWeight: '700', color: Colors.text },
  followDate: { fontSize: 11, color: Colors.textLight },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  tagChip: {
    backgroundColor: Colors.background, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: Colors.border,
  },
  tagText: { fontSize: 11, color: Colors.accent, fontWeight: '600' },
  tagBtn: { padding: 8 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  emptyText: { fontSize: 14, color: Colors.textLight },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    backgroundColor: Colors.header, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalClose: { fontSize: 16, color: Colors.accent, fontWeight: '700' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  modalBody: { padding: 16, gap: 12 },
  currentTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, minHeight: 44 },
  noTagText: { fontSize: 13, color: Colors.textLight },
  tagChipLarge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.background, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.accent,
  },
  tagTextLarge: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  tagInputRow: { flexDirection: 'row', gap: 10 },
  tagInput: {
    flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    padding: 12, fontSize: 15, color: Colors.text, backgroundColor: Colors.white,
  },
  tagAddBtn: { backgroundColor: Colors.accent, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  tagAddText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  tagHint: { fontSize: 11, color: Colors.textLight },
})
