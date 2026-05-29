import { useState, useCallback, useRef, useEffect } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, Animated
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current
  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 200, useNativeDriver: false }).start()
  }, [value])
  const thumbX = anim.interpolate({ inputRange: [0, 1], outputRange: [3, 27] })
  const trackBg = anim.interpolate({ inputRange: [0, 1], outputRange: ['#D1D5DB', Colors.accent] })
  return (
    <TouchableOpacity onPress={() => onChange(!value)} activeOpacity={0.85}>
      <Animated.View style={[styles.toggleTrack, { backgroundColor: trackBg }]}>
        <Animated.View style={[styles.toggleThumb, { transform: [{ translateX: thumbX }] }]} />
      </Animated.View>
    </TouchableOpacity>
  )
}

type Sequence = {
  id: string
  name: string
  is_active: boolean
  created_at: string
  message_count?: number
}

export default function StepSequencesScreen() {
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data: seqs } = await supabase
      .from('step_sequences')
      .select('id, name, is_active, created_at')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false })

    if (!seqs) { setLoading(false); return }

    // メッセージ数を取得
    const withCount = await Promise.all(seqs.map(async (seq) => {
      const { count } = await supabase
        .from('step_messages')
        .select('id', { count: 'exact', head: true })
        .eq('sequence_id', seq.id)
      return { ...seq, message_count: count ?? 0 }
    }))

    setSequences(withCount)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const handleCreate = async () => {
    if (!newName.trim() || !userId) return
    setSaving(true)
    const { data, error } = await supabase
      .from('step_sequences')
      .insert({ creator_id: userId, name: newName.trim() })
      .select().single()
    setSaving(false)
    if (error) { Alert.alert('エラー', error.message); return }
    setModalVisible(false)
    setNewName('')
    router.push(`/step-sequence/${data.id}` as any)
  }

  const handleToggle = async (seq: Sequence) => {
    await supabase
      .from('step_sequences')
      .update({ is_active: !seq.is_active })
      .eq('id', seq.id)
    setSequences(prev => prev.map(s => s.id === seq.id ? { ...s, is_active: !s.is_active } : s))
  }

  const handleDelete = (seq: Sequence) => {
    Alert.alert('削除', `「${seq.name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          await supabase.from('step_sequences').delete().eq('id', seq.id)
          setSequences(prev => prev.filter(s => s.id !== seq.id))
        },
      },
    ])
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
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/mypage' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>フロー配信</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addButton}>
          <Ionicons name="add" size={24} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={16} color={Colors.textLight} />
        <Text style={styles.infoText}>
          フォローされたタイミングを起点に、自動でメッセージを配信します。
        </Text>
      </View>

      {sequences.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="git-branch-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyText}>フロー配信がまだありません</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => setModalVisible(true)}>
            <Text style={styles.emptyBtnText}>作成する</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sequences}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/step-sequence/${item.id}` as any)}
              activeOpacity={0.7}
            >
              <View style={styles.cardLeft}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardSub}>{item.message_count}件のメッセージ</Text>
              </View>
              <View style={styles.cardRight}>
                <ToggleSwitch value={item.is_active} onChange={() => handleToggle(item)} />
                <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={18} color="#E53E3E" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>新しいシーケンス</Text>
            <TextInput
              style={styles.input}
              placeholder="例: 新規フォロワー向け"
              placeholderTextColor={Colors.textLight}
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setModalVisible(false); setNewName('') }}
              >
                <Text style={styles.cancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createBtn, (!newName.trim() || saving) && { opacity: 0.4 }]}
                onPress={handleCreate}
                disabled={!newName.trim() || saving}
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.createText}>作成して編集</Text>}
              </TouchableOpacity>
            </View>
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
  addButton: { padding: 4, width: 32, alignItems: 'flex-end' },
  infoBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    margin: 16, padding: 12, backgroundColor: Colors.white,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
  },
  infoText: { flex: 1, fontSize: 12, color: Colors.textLight, lineHeight: 18 },
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16, flexDirection: 'row', alignItems: 'center',
  },
  cardLeft: { flex: 1, gap: 4 },
  cardName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  cardSub: { fontSize: 12, color: Colors.textLight },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deleteBtn: { padding: 4 },
  toggleTrack: { width: 54, height: 30, borderRadius: 15, justifyContent: 'center' },
  toggleThumb: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  emptyText: { fontSize: 14, color: Colors.textLight },
  emptyBtn: {
    backgroundColor: Colors.accent, borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 },
  modal: { backgroundColor: Colors.white, borderRadius: 18, padding: 24, gap: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    padding: 12, fontSize: 15, color: Colors.text, backgroundColor: Colors.background,
  },
  modalButtons: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelText: { color: Colors.textLight, fontWeight: '600' },
  createBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: Colors.accent, alignItems: 'center' },
  createText: { color: '#fff', fontWeight: '700' },
})
