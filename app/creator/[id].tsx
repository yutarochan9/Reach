import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image, Alert, Linking, Modal, TextInput, Platform } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'
import { BETA_MODE } from '../../constants/config'

const FREE_FOLLOWER_LIMIT = 500

type Profile = {
  id: string
  display_name: string
  bio: string | null
  avatar_url: string | null
  is_official: boolean
}


export default function CreatorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [myId, setMyId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [followerCount, setFollowerCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [creatorPlan, setCreatorPlan] = useState<string>('free')
  const [richMenu, setRichMenu] = useState<{ buttons: any[]; is_active: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [reportReason, setReportReason] = useState<string | null>(null)
  const [reportDetails, setReportDetails] = useState('')
  const [reportSubmitting, setReportSubmitting] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMyId(user.id)

    const [{ data: prof }, { data: follows }, { data: myFollow }, { data: menu }] = await Promise.all([
      supabase.from('profiles').select('*, plan').eq('id', id).single(),
      supabase.from('follows').select('follower_id').eq('following_id', id),
      supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', id).maybeSingle(),
      supabase.from('rich_menus').select('buttons, is_active').eq('creator_id', id).maybeSingle(),
    ])

    setProfile(prof)
    setCreatorPlan((prof as any)?.plan ?? 'free')
    setFollowerCount((follows ?? []).length)
    setIsFollowing(!!myFollow)
    setRichMenu(menu && menu.is_active ? menu : null)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const handleFollow = async () => {
    if (!myId) return
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', myId).eq('following_id', id)
      setIsFollowing(false)
      setFollowerCount(c => c - 1)
    } else {
      // フォロワー上限チェック（無料プランは500人まで・ベータ期間中はスキップ）
      if (!BETA_MODE && creatorPlan === 'free' && followerCount >= FREE_FOLLOWER_LIMIT) {
        Alert.alert(
          'フォローできません',
          `このクリエイターは無料プランのフォロワー上限（${FREE_FOLLOWER_LIMIT}人）に達しています。`,
          [{ text: 'OK' }]
        )
        return
      }
      await supabase.from('follows').insert({ follower_id: myId, following_id: id })
      setIsFollowing(true)
      setFollowerCount(c => c + 1)

      // アクティブなフロー配信シーケンスへ自動エンロール
      const { data: sequences } = await supabase
        .from('step_sequences')
        .select('id')
        .eq('creator_id', id)
        .eq('is_active', true)
      if (sequences?.length) {
        await supabase.from('step_enrollments').upsert(
          sequences.map((seq: any) => ({
            follower_id: myId,
            creator_id: id,
            sequence_id: seq.id,
          })),
          { onConflict: 'follower_id,sequence_id', ignoreDuplicates: true }
        )
      }
    }
  }



  const REPORT_REASONS = [
    { key: 'spam', label: 'スパム' },
    { key: 'inappropriate', label: '不適切なコンテンツ' },
    { key: 'harassment', label: 'ハラスメント' },
    { key: 'fraud', label: '詐欺・偽アカウント' },
    { key: 'other', label: 'その他' },
  ]

  const handleSubmitReport = async () => {
    if (!reportReason || !myId) return
    setReportSubmitting(true)
    await supabase.from('reports').insert({
      reporter_id: myId,
      reported_user_id: id,
      reason: reportReason,
      details: reportDetails.trim() || null,
      status: 'pending',
    })
    setReportSubmitting(false)
    setReportModalVisible(false)
    setReportReason(null)
    setReportDetails('')
    if (Platform.OS === 'web') {
      window.alert('報告を受け付けました。ご協力ありがとうございます。')
    } else {
      Alert.alert('報告完了', '報告を受け付けました。ご協力ありがとうございます。')
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  if (!profile) return null

  const isSelf = myId === id

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        {!isSelf && profile ? (
          <TouchableOpacity style={styles.backButton} onPress={() => setReportModalVisible(true)} activeOpacity={0.6}>
            <Ionicons name="flag-outline" size={22} color={Colors.textLight} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 32 }} />
        )}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        contentContainerStyle={styles.list}
      >
        <View style={styles.profileSection}>
          <View style={styles.avatarWrap}>
            {profile.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
              : <View style={styles.avatar}><Text style={styles.avatarText}>{profile.display_name[0]}</Text></View>
            }
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.name}>{profile.display_name}</Text>
            {profile.is_official && <Ionicons name="checkmark-circle" size={18} color="#1D9BF0" />}
          </View>
          {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{followerCount.toLocaleString()}</Text>
              <Text style={styles.statLabel}>フォロワー</Text>
            </View>
          </View>
          {!isSelf && (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.followButton, isFollowing && styles.followingButton]}
                onPress={handleFollow}
              >
                {isFollowing
                  ? <><Ionicons name="checkmark" size={16} color={Colors.button} /><Text style={styles.followingButtonText}>フォロー中</Text></>
                  : <><Ionicons name="add" size={16} color={Colors.white} /><Text style={styles.followButtonText}>フォローする</Text></>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.talkButton}
                onPress={() => router.push(`/talk/${id}` as any)}
              >
                <Ionicons name="chatbubbles" size={18} color={Colors.white} />
                <Text style={styles.talkButtonText}>メッセージ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dmButton}
                onPress={() => router.push({ pathname: '/im/[userId]' as any, params: { userId: id } })}
              >
                <Ionicons name="chatbubble-outline" size={18} color={Colors.accent} />
                <Text style={styles.dmButtonText}>DM</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={reportModalVisible} transparent animationType="fade" onRequestClose={() => setReportModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setReportModalVisible(false)}>
          <TouchableOpacity style={styles.modalCard} activeOpacity={1} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ユーザーを報告</Text>
              <TouchableOpacity onPress={() => setReportModalVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.textLight} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>報告の種類を選択してください</Text>
            <View style={styles.reasonGrid}>
              {REPORT_REASONS.map(r => (
                <TouchableOpacity
                  key={r.key}
                  style={[styles.reasonItem, reportReason === r.key && styles.reasonItemActive]}
                  onPress={() => setReportReason(r.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.reasonLabel, reportReason === r.key && styles.reasonLabelActive]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.reportTextarea}
              placeholder="詳細（任意）"
              placeholderTextColor={Colors.textLight}
              value={reportDetails}
              onChangeText={setReportDetails}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.reportSubmitBtn, (!reportReason || reportSubmitting) && styles.btnDisabled]}
              onPress={handleSubmitReport}
              disabled={!reportReason || reportSubmitting}
            >
              {reportSubmitting
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.reportSubmitText}>報告する</Text>
              }
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  list: { paddingBottom: 32 },
  profileSection: { alignItems: 'center', padding: 24, gap: 8 },
  avatarWrap: { marginBottom: 4 },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: Colors.button,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImage: { width: 88, height: 88, borderRadius: 44 },
  avatarText: { fontSize: 36, fontWeight: '700', color: Colors.white },
  name: { fontSize: 20, fontWeight: '700', color: Colors.text },
  bio: { fontSize: 14, color: Colors.textLight, textAlign: 'center' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 24, marginVertical: 4 },
  statItem: { alignItems: 'center', gap: 2 },
  statNum: { fontSize: 18, fontWeight: '700', color: Colors.text },
  statLabel: { fontSize: 12, color: Colors.textLight },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.border },
  actionButtons: { flexDirection: 'row', gap: 8, marginTop: 8, width: '100%' },
  followButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: Colors.accent,
    borderRadius: 12, paddingVertical: 11,
  },
  followingButton: {
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.accent,
  },
  followButtonText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  followingButtonText: { color: Colors.accent, fontWeight: '700', fontSize: 14 },
  talkButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: Colors.accent,
    borderRadius: 12, paddingVertical: 11,
  },
  talkButtonText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  dmButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: Colors.white,
    borderRadius: 12, paddingVertical: 11,
    borderWidth: 1.5, borderColor: Colors.accent,
  },
  dmButtonText: { color: Colors.accent, fontWeight: '700', fontSize: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginTop: 16, alignSelf: 'flex-start' },
  richMenuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%', marginTop: 8 },
  richMenuBtn: {
    flex: 1, minWidth: '28%', backgroundColor: Colors.white,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    padding: 12, alignItems: 'center', gap: 6,
  },
  richMenuBtnLabel: { fontSize: 11, color: Colors.text, fontWeight: '600', textAlign: 'center' },
  reportBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 20, padding: 4, opacity: 0.6 },
  reportBtnText: { fontSize: 11, color: Colors.textLight },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 20, gap: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  modalSub: { fontSize: 12, color: Colors.textLight },
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonItem: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.background,
  },
  reasonItemActive: { borderColor: '#E53E3E', backgroundColor: '#FFF5F5' },
  reasonLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  reasonLabelActive: { color: '#E53E3E' },
  reportTextarea: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    padding: 12, fontSize: 14, color: Colors.text, backgroundColor: Colors.white, minHeight: 72,
  },
  reportSubmitBtn: {
    backgroundColor: '#E53E3E', borderRadius: 10, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  reportSubmitText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.45 },
  broadcastCard: {
    backgroundColor: Colors.white,
    marginHorizontal: 16, marginBottom: 10,
    borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  broadcastContent: { fontSize: 14, color: Colors.text, lineHeight: 22 },
  broadcastMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  broadcastDate: { fontSize: 11, color: Colors.textLight },
  metaRight: { flexDirection: 'row', gap: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: Colors.textLight },
  empty: { textAlign: 'center', color: Colors.textLight, fontSize: 14, marginTop: 32 },
})
