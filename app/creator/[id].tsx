import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image, Alert, Linking, Modal, TextInput, Platform } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import Head from 'expo-router/head'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'
import { BETA_MODE } from '../../constants/config'

const FREE_FOLLOWER_LIMIT = 10000

const SNS_FIELDS = [
  { key: 'x', label: 'X', icon: 'logo-twitter' as const },
  { key: 'instagram', label: 'Instagram', icon: 'logo-instagram' as const },
  { key: 'youtube', label: 'YouTube', icon: 'logo-youtube' as const },
  { key: 'tiktok', label: 'TikTok', icon: 'logo-tiktok' as const },
  { key: 'note', label: 'note', icon: 'document-text-outline' as const },
  { key: 'website', label: 'Web', icon: 'globe-outline' as const },
]

type Profile = {
  id: string
  display_name: string
  bio: string | null
  avatar_url: string | null
  is_official: boolean
  username: string | null
  sns_links: Record<string, string> | null
  plan: string
  membership_active: boolean | null
  is_private: boolean | null
}


export default function CreatorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [myId, setMyId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [followerCount, setFollowerCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [isPrivate, setIsPrivate] = useState(false)
  const [followRequestStatus, setFollowRequestStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none')
  const [creatorPlan, setCreatorPlan] = useState<string>('free')
  const [richMenu, setRichMenu] = useState<{ buttons: any[]; is_active: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isSubscriber, setIsSubscriber] = useState(false)
  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [reportReason, setReportReason] = useState<string | null>(null)
  const [reportDetails, setReportDetails] = useState('')
  const [reportSubmitting, setReportSubmitting] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setMyId(user?.id ?? null)

    const [{ data: prof }, { data: follows }, myFollowResult, { data: menu }, mySubResult, myRequestResult] = await Promise.all([
      supabase.from('profiles').select('id, display_name, bio, avatar_url, is_official, username, sns_links, plan, membership_active, is_private').eq('id', id).single(),
      supabase.from('follows').select('follower_id').eq('following_id', id),
      user
        ? supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('rich_menus').select('buttons, is_active').eq('creator_id', id).maybeSingle(),
      user
        ? supabase.from('subscriptions').select('subscriber_id').eq('subscriber_id', user.id).eq('creator_id', id).eq('status', 'active').maybeSingle()
        : Promise.resolve({ data: null }),
      user
        ? supabase.from('follow_requests').select('status').eq('requester_id', user.id).eq('target_id', id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    setProfile(prof)
    setCreatorPlan(prof?.plan ?? 'free')
    setIsPrivate(prof?.is_private ?? false)
    setFollowerCount((follows ?? []).length)
    setIsFollowing(!!(myFollowResult as any)?.data)
    setFollowRequestStatus((myRequestResult as any)?.data?.status ?? 'none')
    setRichMenu(menu && menu.is_active ? menu : null)
    setIsSubscriber(!!(mySubResult as any)?.data)
    setLoading(false)
  }, [id])

  const handleMembershipToggle = async () => {
    if (!myId) { router.push('/(auth)/login' as any); return }
    if (isSubscriber) {
      // 退会確認
      Alert.alert(
        'メンバーシップを退会',
        'メンバーシップを退会しますか？\n\n⚠ 退会するとメンバーシップ限定コンテンツはトーク画面から即座に消えます。',
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '退会する', style: 'destructive', onPress: async () => {
              await supabase.from('subscriptions').delete().eq('subscriber_id', myId).eq('creator_id', id)
              setIsSubscriber(false)
            }
          },
        ]
      )
    } else {
      // 加入フローへ
      router.push({ pathname: '/membership/[creatorId]' as any, params: { creatorId: id } })
    }
  }

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
    } else if (isPrivate) {
      // 鍵垢の場合はフォローリクエストを送る
      if (followRequestStatus === 'pending') {
        // リクエスト取り消し
        await supabase.from('follow_requests').delete().eq('requester_id', myId).eq('target_id', id)
        setFollowRequestStatus('none')
      } else {
        await supabase.from('follow_requests').upsert(
          { requester_id: myId, target_id: id, status: 'pending' },
          { onConflict: 'requester_id,target_id' }
        )
        setFollowRequestStatus('pending')
      }
    } else {
      // 通常フォロー
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

  const ogImage = profile?.avatar_url ?? 'https://reach-pi-one.vercel.app/icon.png'
  const ogTitle = `${profile?.display_name ?? 'クリエーター'} | Reach`
  const ogDesc = profile?.bio ?? 'Reach でクリエーターをフォローして配信を楽しもう'

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' && (
        <Head>
          <title>{ogTitle}</title>
          <meta property="og:title" content={ogTitle} />
          <meta property="og:description" content={ogDesc} />
          <meta property="og:image" content={ogImage} />
          <meta property="og:site_name" content="Reach" />
          <meta property="og:type" content="profile" />
          <meta name="twitter:card" content="summary" />
          <meta name="twitter:title" content={ogTitle} />
          <meta name="twitter:description" content={ogDesc} />
          <meta name="twitter:image" content={ogImage} />
        </Head>
      )}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.7}
            onPress={() => {
              const url = `https://reach-pi-one.vercel.app/creator/${id}`
              if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
                if (navigator.share) {
                  navigator.share({ title: profile?.display_name ?? '', url })
                } else {
                  navigator.clipboard?.writeText(url).then(() => window.alert('リンクをコピーしました'))
                }
              }
            }}
          >
            <Ionicons name="share-outline" size={22} color={Colors.accent} />
          </TouchableOpacity>
          {!isSelf && myId && profile ? (
            <TouchableOpacity style={styles.backButton} onPress={() => setReportModalVisible(true)} activeOpacity={0.6}>
              <Ionicons name="flag-outline" size={22} color={Colors.textLight} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 32 }} />
          )}
        </View>
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
          {profile.username && <Text style={styles.username}>@{profile.username}</Text>}
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
          {profile.sns_links && SNS_FIELDS.some(f => profile.sns_links?.[f.key]) && (
            <View style={styles.snsRow}>
              {SNS_FIELDS.filter(f => profile.sns_links?.[f.key]).map(f => (
                <TouchableOpacity
                  key={f.key}
                  style={styles.snsBtn}
                  onPress={() => Linking.openURL(profile.sns_links![f.key])}
                  activeOpacity={0.7}
                >
                  <Ionicons name={f.icon} size={16} color={Colors.accent} />
                  <Text style={styles.snsBtnText}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{followerCount.toLocaleString()}</Text>
              <Text style={styles.statLabel}>フォロワー</Text>
            </View>
          </View>
          {!isSelf && (
            <View style={styles.actionButtons}>
              {myId ? (
                <>
                  <TouchableOpacity
                    style={[styles.followButton, (isFollowing || followRequestStatus === 'pending') && styles.followingButton]}
                    onPress={handleFollow}
                  >
                    {isFollowing
                      ? <><Ionicons name="checkmark" size={16} color={Colors.accent} /><Text style={styles.followingButtonText}>フォロー中</Text></>
                      : followRequestStatus === 'pending'
                        ? <><Ionicons name="time-outline" size={16} color={Colors.accent} /><Text style={styles.followingButtonText}>リクエスト中</Text></>
                        : isPrivate
                          ? <><Ionicons name="lock-closed-outline" size={16} color={Colors.accent} /><Text style={styles.followButtonText}>フォローリクエスト</Text></>
                          : <><Ionicons name="add" size={16} color={Colors.accent} /><Text style={styles.followButtonText}>フォローする</Text></>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.talkButton}
                    onPress={() => router.push(`/talk/${id}` as any)}
                  >
                    <Ionicons name="radio-outline" size={16} color={Colors.accent} />
                    <Text style={styles.talkButtonText}>配信</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dmButton}
                    onPress={() => router.push({ pathname: '/im/[userId]' as any, params: { userId: id } })}
                  >
                    <Ionicons name="chatbubble-outline" size={16} color={Colors.accent} />
                    <Text style={styles.dmButtonText}>DM</Text>
                  </TouchableOpacity>
                  {(profile.membership_active || isSubscriber) && (
                    <TouchableOpacity
                      style={[styles.membershipButton, isSubscriber && styles.membershipButtonActive]}
                      onPress={handleMembershipToggle}
                    >
                      <Ionicons name="star" size={16} color={Colors.accent} />
                      <Text style={[styles.membershipButtonText, isSubscriber && styles.membershipButtonTextActive]}>
                        {isSubscriber ? '登録中' : 'メンバー'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <TouchableOpacity
                  style={styles.followButton}
                  onPress={() => router.push('/(auth)/login' as any)}
                >
                  <Ionicons name="add" size={16} color={Colors.white} />
                  <Text style={styles.followButtonText}>登録してフォローする</Text>
                </TouchableOpacity>
              )}
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
    paddingTop: 36,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, width: 32 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: Colors.text },
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
  username: { fontSize: 13, color: Colors.accent, marginTop: -2 },
  bio: { fontSize: 14, color: Colors.textLight, textAlign: 'center', lineHeight: 20 },
  snsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 },
  snsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: Colors.background, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border,
  },
  snsBtnText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 24, marginVertical: 4 },
  statItem: { alignItems: 'center', gap: 2 },
  statNum: { fontSize: 18, fontWeight: '700', color: Colors.text },
  statLabel: { fontSize: 12, color: Colors.textLight },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.border },
  actionButtons: { flexDirection: 'row', gap: 6, marginTop: 8, width: '100%' },
  // 全ボタン共通: 白背景 + アクセントボーダー
  followButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.accent,
    borderRadius: 12, paddingVertical: 10,
  },
  followingButton: {
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.accent,
  },
  followButtonText: { color: Colors.accent, fontWeight: '700', fontSize: 12 },
  followingButtonText: { color: Colors.accent, fontWeight: '700', fontSize: 12 },
  talkButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.accent,
    borderRadius: 12, paddingVertical: 10,
  },
  talkButtonText: { color: Colors.accent, fontWeight: '700', fontSize: 12 },
  dmButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.accent,
    borderRadius: 12, paddingVertical: 10,
  },
  dmButtonText: { color: Colors.accent, fontWeight: '700', fontSize: 12 },
  membershipButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.accent,
    borderRadius: 12, paddingVertical: 10,
  },
  membershipButtonActive: {
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.accent,
  },
  membershipButtonText: { color: Colors.accent, fontWeight: '700', fontSize: 12 },
  membershipButtonTextActive: { color: Colors.accent },
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
