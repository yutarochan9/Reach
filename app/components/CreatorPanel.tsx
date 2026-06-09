/**
 * CreatorPanel.tsx
 *
 * ホーム画面デスクトップ版の右ペインに表示するクリエイタープロフィールパネル。
 * creator/[id].tsx の内容をサイドパネル用にコンパクトにまとめたもの。
 */
import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, Alert, Linking, Platform,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'
import DefaultAvatar from './DefaultAvatar'
import { BETA_MODE } from '../../constants/config'
import { TEST_IDS_CSV } from '../../constants/testAccounts'

const FREE_FOLLOWER_LIMIT = 500

const SNS_FIELDS = [
  { key: 'x',         label: 'X',         icon: 'logo-twitter'       as const },
  { key: 'instagram', label: 'Instagram',  icon: 'logo-instagram'    as const },
  { key: 'youtube',   label: 'YouTube',    icon: 'logo-youtube'      as const },
  { key: 'tiktok',    label: 'TikTok',     icon: 'logo-tiktok'       as const },
  { key: 'note',      label: 'note',       icon: 'document-text-outline' as const },
  { key: 'website',   label: 'Web',        icon: 'globe-outline'     as const },
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

type Props = {
  creatorId: string
}

export default function CreatorPanel({ creatorId }: Props) {
  const [myId, setMyId]                           = useState<string | null>(null)
  const [profile, setProfile]                     = useState<Profile | null>(null)
  const [followerCount, setFollowerCount]         = useState(0)
  const [isFollowing, setIsFollowing]             = useState(false)
  const [isPrivate, setIsPrivate]                 = useState(false)
  const [followRequestStatus, setFollowRequestStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none')
  const [creatorPlan, setCreatorPlan]             = useState('free')
  const [isSubscriber, setIsSubscriber]           = useState(false)
  const [pinnedBroadcast, setPinnedBroadcast]     = useState<{ id: string; content: string; created_at: string } | null>(null)
  const [loading, setLoading]                     = useState(true)
  const [followLoading, setFollowLoading]         = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setMyId(user?.id ?? null)

    const [{ data: prof }, { data: follows }, myFollowResult, mySubResult, myRequestResult] = await Promise.all([
      supabase.from('profiles').select('id, display_name, bio, avatar_url, is_official, username, sns_links, plan, membership_active, is_private, pinned_broadcast_id').eq('id', creatorId).single(),
      supabase.from('follows').select('follower_id').eq('following_id', creatorId).not('follower_id', 'in', TEST_IDS_CSV),
      user ? supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', creatorId).maybeSingle() : Promise.resolve({ data: null }),
      user ? supabase.from('subscriptions').select('subscriber_id').eq('subscriber_id', user.id).eq('creator_id', creatorId).eq('status', 'active').maybeSingle() : Promise.resolve({ data: null }),
      user ? supabase.from('follow_requests').select('status').eq('requester_id', user.id).eq('target_id', creatorId).maybeSingle() : Promise.resolve({ data: null }),
    ])

    setProfile(prof)
    setCreatorPlan(prof?.plan ?? 'free')
    setIsPrivate(prof?.is_private ?? false)
    setFollowerCount((follows ?? []).length)
    setIsFollowing(!!(myFollowResult as any)?.data)
    setFollowRequestStatus((myRequestResult as any)?.data?.status ?? 'none')
    setIsSubscriber(!!(mySubResult as any)?.data)

    const pinnedId = (prof as any)?.pinned_broadcast_id
    if (pinnedId) {
      const { data: pinned } = await supabase.from('broadcasts').select('id, content, created_at').eq('id', pinnedId).single()
      setPinnedBroadcast(pinned ?? null)
    } else {
      setPinnedBroadcast(null)
    }
    setLoading(false)
  }, [creatorId])

  useEffect(() => { load() }, [load])

  const doUnfollow = async () => {
    await supabase.from('follows').delete().eq('follower_id', myId!).eq('following_id', creatorId)
    setIsFollowing(false)
    setFollowerCount(c => c - 1)
  }

  const handleFollow = async () => {
    if (!myId || followLoading) return
    setFollowLoading(true)
    if (isFollowing) {
      const msg = 'フォローを外すと配信欄が非表示になります。\nよろしいですか？'
      if (Platform.OS === 'web') {
        if (window.confirm(msg)) await doUnfollow()
      } else {
        Alert.alert('フォローを外しますか？', msg, [
          { text: 'キャンセル', style: 'cancel' },
          { text: 'フォローを外す', style: 'destructive', onPress: doUnfollow },
        ])
      }
    } else if (isPrivate) {
      if (followRequestStatus === 'pending') {
        await supabase.from('follow_requests').delete().eq('requester_id', myId).eq('target_id', creatorId)
        setFollowRequestStatus('none')
      } else {
        await supabase.from('follow_requests').delete().eq('requester_id', myId).eq('target_id', creatorId)
        await supabase.from('follow_requests').insert({ requester_id: myId, target_id: creatorId, status: 'pending' })
        setFollowRequestStatus('pending')
      }
    } else {
      if (!BETA_MODE && creatorPlan === 'free' && followerCount >= FREE_FOLLOWER_LIMIT) {
        Alert.alert('フォローできません', `このクリエイターは無料プランのフォロワー上限（${FREE_FOLLOWER_LIMIT}人）に達しています。`)
        setFollowLoading(false)
        return
      }
      await supabase.from('follows').insert({ follower_id: myId, following_id: creatorId })
      setIsFollowing(true)
      setFollowerCount(c => c + 1)
      supabase.rpc('enroll_step_sequences', { p_creator_id: creatorId, p_follower_id: myId })
        .then(({ error }) => { if (error) console.error('enroll_step_sequences:', error.message) })
    }
    setFollowLoading(false)
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    )
  }

  if (!profile) return (
    <View style={s.center}>
      <Text style={s.emptyText}>プロフィールを読み込めませんでした</Text>
    </View>
  )

  const isSelf = myId === creatorId

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* アバター・名前 */}
      <View style={s.profileTop}>
        {profile.avatar_url
          ? <Image source={{ uri: profile.avatar_url }} style={s.avatar} />
          : <DefaultAvatar size={80} />
        }
        <View style={s.nameRow}>
          <Text style={s.name}>{profile.display_name}</Text>
          {profile.is_official && <Ionicons name="checkmark-circle" size={17} color="#1D9BF0" />}
        </View>
        {profile.username && <Text style={s.username}>@{profile.username}</Text>}
      </View>

      {/* フォロワー数 */}
      <View style={s.statsRow}>
        <Ionicons name="people-outline" size={14} color={Colors.textLight} />
        <Text style={s.statText}>{followerCount.toLocaleString()} フォロワー</Text>
      </View>

      {/* bio */}
      {profile.bio ? <Text style={s.bio}>{profile.bio}</Text> : null}

      {/* SNSリンク */}
      {profile.sns_links && SNS_FIELDS.some(f => profile.sns_links?.[f.key]) && (
        <View style={s.snsRow}>
          {SNS_FIELDS.filter(f => profile.sns_links?.[f.key]).map(f => (
            <TouchableOpacity key={f.key} style={s.snsBtn} onPress={() => Linking.openURL(profile.sns_links![f.key])} activeOpacity={0.7}>
              <Ionicons name={f.icon} size={14} color={Colors.accent} />
              <Text style={s.snsBtnText}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* アクションボタン */}
      {!isSelf && myId && (
        <View style={s.actionRow}>
          <TouchableOpacity
            style={[s.btn, (isFollowing || followRequestStatus === 'pending') && s.btnFollowing, followLoading && { opacity: 0.5 }]}
            onPress={handleFollow} disabled={followLoading}
          >
            {isFollowing
              ? <><Ionicons name="checkmark" size={14} color={Colors.accent} /><Text style={s.btnFollowingText}>フォロー中</Text></>
              : followRequestStatus === 'pending'
                ? <><Ionicons name="time-outline" size={14} color={Colors.accent} /><Text style={s.btnFollowingText}>リクエスト中</Text></>
                : isPrivate
                  ? <><Ionicons name="lock-closed-outline" size={14} color={Colors.white} /><Text style={s.btnText}>フォローリクエスト</Text></>
                  : <><Ionicons name="add" size={14} color={Colors.white} /><Text style={s.btnText}>フォローする</Text></>
            }
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push(`/talk/${creatorId}` as any)}>
            <Ionicons name="radio-outline" size={18} color={Colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push({ pathname: '/im/[userId]' as any, params: { userId: creatorId } })}>
            <Ionicons name="chatbubble-outline" size={18} color={Colors.accent} />
          </TouchableOpacity>
        </View>
      )}

      {/* ピックアップ配信 */}
      {pinnedBroadcast && (!isPrivate || isSelf || isFollowing) && (
        <View style={s.pinCard}>
          <View style={s.pinHeader}>
            <Ionicons name="bookmark" size={13} color={Colors.accent} />
            <Text style={s.pinTitle}>ピックアップ</Text>
          </View>
          <TouchableOpacity onPress={() => router.push(`/talk/${creatorId}` as any)} activeOpacity={0.85}>
            <Text style={s.pinContent} numberOfLines={4}>{pinnedBroadcast.content.trim()}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* プロフィール全体を見るボタン */}
      <TouchableOpacity style={s.fullProfileBtn} onPress={() => router.push(`/creator/${creatorId}` as any)} activeOpacity={0.8}>
        <Text style={s.fullProfileText}>プロフィールを全画面で見る</Text>
        <Ionicons name="arrow-forward" size={14} color={Colors.accent} />
      </TouchableOpacity>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, paddingBottom: 48, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: Colors.textLight, fontSize: 14 },

  profileTop: { alignItems: 'center', gap: 8 },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontSize: 19, fontWeight: '700', color: Colors.text },
  username: { fontSize: 13, color: Colors.accent },

  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center' },
  statText: { fontSize: 13, color: Colors.textLight },

  bio: { fontSize: 14, color: Colors.textLight, lineHeight: 20, textAlign: 'center' },

  snsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  snsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: Colors.white, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border,
  },
  snsBtnText: { fontSize: 12, color: Colors.accent },

  actionRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 16, paddingVertical: 9,
    backgroundColor: Colors.accent, borderRadius: 22,
  },
  btnFollowing: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  btnText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  btnFollowingText: { fontSize: 13, fontWeight: '700', color: Colors.accent },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },

  pinCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14, gap: 8,
  },
  pinHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pinTitle: { fontSize: 12, fontWeight: '700', color: Colors.accent },
  pinContent: { fontSize: 13, color: Colors.text, lineHeight: 20 },

  fullProfileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12,
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  fullProfileText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
})
