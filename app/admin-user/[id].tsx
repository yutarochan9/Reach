/**
 * admin-user/[id].tsx
 * 管理者専用のユーザー詳細画面。
 * プロフィール・配信分析・メンバーシップ情報を一覧表示する。
 * 管理者権限がない場合はアクセス不可。
 */

import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, Platform, Alert,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'

type UserDetail = {
  id: string
  display_name: string
  username: string | null
  avatar_url: string | null
  plan: string
  is_admin: boolean
  is_banned: boolean
  is_private: boolean
  bio: string | null
  created_at: string
}

type Analytics = {
  broadcasts: number
  totalReads: number
  totalLikes: number
  followers: number
  following: number
  subsAsCreator: number      // 自分のメンシプ登録者数
  subsAsSubscriber: number   // 自分が登録しているメンシプ数
  membershipPrice: number | null
}

type SubCreator = {
  id: string
  display_name: string
  username: string | null
  avatar_url: string | null
  membership_price: number | null
}

type RecentBroadcast = {
  id: string
  content: string
  created_at: string
  readCount: number
  likeCount: number
}

export default function AdminUserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [user, setUser] = useState<UserDetail | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [subCreators, setSubCreators] = useState<SubCreator[]>([])
  const [recentBroadcasts, setRecentBroadcasts] = useState<RecentBroadcast[]>([])

  useEffect(() => {
    const load = async () => {
      // 管理者チェック
      const { data: { user: me } } = await supabase.auth.getUser()
      if (!me) { router.replace('/(auth)/login'); return }
      const { data: myProfile } = await supabase.from('profiles').select('is_admin').eq('id', me.id).single()
      if (!myProfile?.is_admin) { setIsAdmin(false); setLoading(false); return }
      setIsAdmin(true)

      // ユーザー情報
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, plan, is_admin, is_banned, is_private, bio, created_at, membership_price')
        .eq('id', id)
        .single()
      setUser(prof as UserDetail)

      // 配信一覧（過去7日間）
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
      const { data: broadcasts } = await supabase
        .from('broadcasts')
        .select('id, content, created_at')
        .eq('sender_id', id)
        .eq('status', 'published')
        .gte('created_at', weekAgo)
        .order('created_at', { ascending: false })
        .limit(50)
      const bcIds = (broadcasts ?? []).map((b: any) => b.id)

      // 各種カウント並列取得
      const [
        { count: bcCount },
        { count: followerCount },
        { count: followingCount },
        { count: subsAsCreator },
        { count: subsAsSubscriber },
        { data: reads },
        { data: likes },
        { data: subCreatorData },
      ] = await Promise.all([
        supabase.from('broadcasts').select('id', { count: 'exact', head: true }).eq('sender_id', id).eq('status', 'published'),
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', id),
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', id),
        supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('creator_id', id).eq('status', 'active'),
        supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('subscriber_id', id).eq('status', 'active'),
        bcIds.length > 0
          ? supabase.from('broadcast_reads').select('broadcast_id').in('broadcast_id', bcIds)
          : Promise.resolve({ data: [] }),
        bcIds.length > 0
          ? supabase.from('reactions').select('broadcast_id').in('broadcast_id', bcIds)
          : Promise.resolve({ data: [] }),
        supabase.from('subscriptions')
          .select('creator:profiles!subscriptions_creator_id_fkey(id, display_name, username, avatar_url, membership_price)')
          .eq('subscriber_id', id)
          .eq('status', 'active'),
      ])

      // 既読数・いいね数をbroadcast単位で集計
      const readMap: Record<string, number> = {}
      const likeMap: Record<string, number> = {}
      for (const r of (reads ?? [])) readMap[(r as any).broadcast_id] = (readMap[(r as any).broadcast_id] ?? 0) + 1
      for (const r of (likes ?? [])) likeMap[(r as any).broadcast_id] = (likeMap[(r as any).broadcast_id] ?? 0) + 1

      setAnalytics({
        broadcasts: bcCount ?? 0,
        totalReads: Object.values(readMap).reduce((s, v) => s + v, 0),
        totalLikes: Object.values(likeMap).reduce((s, v) => s + v, 0),
        followers: followerCount ?? 0,
        following: followingCount ?? 0,
        subsAsCreator: subsAsCreator ?? 0,
        subsAsSubscriber: subsAsSubscriber ?? 0,
        membershipPrice: (prof as any)?.membership_price ?? null,
      })

      // 最近の配信に既読・いいねを紐付け
      setRecentBroadcasts(
        (broadcasts ?? []).map((b: any) => ({
          id: b.id,
          content: b.content,
          created_at: b.created_at,
          readCount: readMap[b.id] ?? 0,
          likeCount: likeMap[b.id] ?? 0,
        }))
      )

      // 登録中のクリエイター
      setSubCreators(
        (subCreatorData ?? [])
          .map((s: any) => s.creator)
          .filter(Boolean) as SubCreator[]
      )

      setLoading(false)
    }
    load()
  }, [id])

  // BAN トグル
  const toggleBan = () => {
    if (!user) return
    const next = !user.is_banned
    const msg = next
      ? `「${user.display_name}」をBANしますか？`
      : `「${user.display_name}」のBANを解除しますか？`
    const doBan = async () => {
      await supabase.from('profiles').update({ is_banned: next }).eq('id', id)
      setUser(u => u ? { ...u, is_banned: next } : u)
    }
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doBan()
    } else {
      Alert.alert(next ? 'BANする' : 'BAN解除', msg, [
        { text: 'キャンセル', style: 'cancel' },
        { text: next ? 'BANする' : '解除する', style: 'destructive', onPress: doBan },
      ])
    }
  }

  if (loading) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  )

  if (!isAdmin) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center', gap: 12 }]}>
      <Ionicons name="lock-closed-outline" size={40} color={Colors.border} />
      <Text style={{ color: Colors.textLight }}>管理者のみアクセスできます</Text>
      <TouchableOpacity onPress={() => router.back()}><Text style={{ color: Colors.accent }}>戻る</Text></TouchableOpacity>
    </View>
  )

  if (!user) return null

  const PLAN_COLORS: Record<string, string> = { free: Colors.textLight, standard: Colors.accent, pro: '#8B4513' }
  const PLAN_LABELS: Record<string, string> = { free: '無料', standard: 'スタンダード', pro: 'プロ' }

  return (
    <View style={s.container}>
      {/* ヘッダー */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{user.display_name}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>

        {/* ── プロフィール ─────────────────────────── */}
        <View style={s.profileCard}>
          <View style={s.profileTop}>
            {user.avatar_url
              ? <Image source={{ uri: user.avatar_url }} style={s.avatar} />
              : <View style={[s.avatar, s.avatarFallback]}>
                  <Text style={s.avatarText}>{user.display_name[0]}</Text>
                </View>
            }
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={s.name}>{user.display_name}</Text>
                {user.is_admin && <View style={s.adminBadge}><Text style={s.adminBadgeText}>管理者</Text></View>}
                {user.is_banned && <View style={s.bannedBadge}><Text style={s.bannedBadgeText}>BAN</Text></View>}
                {user.is_private && <View style={s.privateBadge}><Ionicons name="lock-closed" size={9} color={Colors.textLight} /><Text style={s.privateBadgeText}>鍵垢</Text></View>}
              </View>
              {user.username && <Text style={s.username}>@{user.username}</Text>}
              <Text style={[s.plan, { color: PLAN_COLORS[user.plan] ?? Colors.textLight }]}>
                {PLAN_LABELS[user.plan] ?? user.plan} プラン
              </Text>
              <Text style={s.joinDate}>登録日: {new Date(user.created_at).toLocaleDateString('ja-JP')}</Text>
            </View>
          </View>
          {user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}
          {/* アクション */}
          <View style={s.profileActions}>
            <TouchableOpacity
              style={s.viewBtn}
              onPress={() => router.push(`/talk/${id}` as any)}
            >
              <Ionicons name="megaphone-outline" size={14} color={Colors.accent} />
              <Text style={s.viewBtnText}>配信を見る</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.banBtn, user.is_banned && s.banBtnActive]}
              onPress={toggleBan}
            >
              <Ionicons name="ban" size={14} color={user.is_banned ? Colors.white : '#DC2626'} />
              <Text style={[s.banBtnText, user.is_banned && s.banBtnTextActive]}>
                {user.is_banned ? 'BAN中' : 'BAN'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 活動統計（タグ形式・折り返し） ─────── */}
        <Text style={s.sectionLabel}>活動統計</Text>
        <View style={s.statsTags}>
          {[
            { label: '配信', value: analytics?.broadcasts ?? 0, icon: 'megaphone-outline', color: Colors.accent },
            { label: 'フォロワー', value: analytics?.followers ?? 0, icon: 'people-outline', color: '#4CAF50' },
            { label: 'フォロー中', value: analytics?.following ?? 0, icon: 'person-add-outline', color: '#9575CD' },
            { label: '総既読', value: analytics?.totalReads ?? 0, icon: 'eye-outline', color: '#E07A4A' },
            { label: '総いいね', value: analytics?.totalLikes ?? 0, icon: 'heart-outline', color: '#E05555' },
            ...(analytics?.subsAsCreator ? [{ label: 'メンシプ会員', value: analytics.subsAsCreator, icon: 'star-outline', color: '#C9962A' }] : []),
            ...(analytics?.subsAsSubscriber ? [{ label: 'メンシプ登録中', value: analytics.subsAsSubscriber, icon: 'star', color: '#C9962A' }] : []),
          ].map(tag => (
            <View key={tag.label} style={[s.statTag, { borderColor: `${tag.color}40`, backgroundColor: `${tag.color}10` }]}>
              <Ionicons name={tag.icon as any} size={13} color={tag.color} />
              <Text style={[s.statTagValue, { color: tag.color }]}>{tag.value.toLocaleString()}</Text>
              <Text style={s.statTagLabel}>{tag.label}</Text>
            </View>
          ))}
        </View>

        {/* ── クリエイターとしてのメンシプ ────────── */}
        {analytics?.membershipPrice != null && (
          <>
            <Text style={s.sectionLabel}>メンバーシップ（クリエイター）</Text>
            <View style={s.card}>
              <View style={s.mbCreatorRow}>
                <View style={s.mbIconWrap}>
                  <Ionicons name="star" size={16} color={Colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.mbCreatorLabel}>月額料金</Text>
                  <Text style={s.mbCreatorPrice}>¥{analytics.membershipPrice.toLocaleString()}</Text>
                </View>
                <View style={s.mbCreatorCount}>
                  <Text style={s.mbCreatorCountNum}>{analytics.subsAsCreator}</Text>
                  <Text style={s.mbCreatorCountLabel}>人が登録</Text>
                </View>
              </View>
              <View style={s.divider} />
              <View style={s.mbRevenueRow}>
                <Text style={s.mbRevenueLabel}>月間推計収益</Text>
                <Text style={s.mbRevenueValue}>
                  ¥{((analytics.membershipPrice ?? 0) * (analytics.subsAsCreator ?? 0)).toLocaleString()}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* ── 登録中のメンシプ ─────────────────────── */}
        {subCreators.length > 0 && (
          <>
            <Text style={s.sectionLabel}>登録中のメンバーシップ（{subCreators.length}件）</Text>
            <View style={s.card}>
              {subCreators.map((c, idx) => (
                <View key={c.id}>
                  {idx > 0 && <View style={s.divider} />}
                  <TouchableOpacity
                    style={s.subCreatorRow}
                    onPress={() => router.push(`/admin-user/${c.id}` as any)}
                  >
                    {c.avatar_url
                      ? <Image source={{ uri: c.avatar_url }} style={s.subCreatorAvatar} />
                      : <View style={[s.subCreatorAvatar, s.subCreatorAvatarFb]}>
                          <Text style={s.subCreatorAvatarText}>{c.display_name[0]}</Text>
                        </View>
                    }
                    <View style={{ flex: 1 }}>
                      <Text style={s.subCreatorName}>{c.display_name}</Text>
                      {c.username && <Text style={s.subCreatorUser}>@{c.username}</Text>}
                    </View>
                    <Text style={s.subCreatorPrice}>
                      {c.membership_price != null ? `¥${c.membership_price.toLocaleString()}/月` : '—'}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.border} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── 最近の配信（過去7日間） ──────────────── */}
        {recentBroadcasts.length > 0 && (
          <>
            <Text style={s.sectionLabel}>過去7日間の配信（{recentBroadcasts.length}件）</Text>
            <ScrollView style={s.bcScroll} nestedScrollEnabled>
              {recentBroadcasts.map(bc => (
                <View key={bc.id} style={s.bcCard}>
                  <Text style={s.bcContent} numberOfLines={2}>{bc.content || '（画像のみ）'}</Text>
                  <View style={s.bcMeta}>
                    <Text style={s.bcDate}>
                      {new Date(bc.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <View style={s.bcStats}>
                      <View style={s.bcStatItem}>
                        <Ionicons name="eye-outline" size={12} color={Colors.textLight} />
                        <Text style={s.bcStatText}>{bc.readCount}</Text>
                      </View>
                      <View style={s.bcStatItem}>
                        <Ionicons name="heart-outline" size={12} color={Colors.textLight} />
                        <Text style={s.bcStatText}>{bc.likeCount}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  )
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <View style={s.statCard}>
      <View style={[s.statIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={[s.statValue, { color }]}>{value.toLocaleString()}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.header, paddingTop: 36, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4, width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, flex: 1, textAlign: 'center' },
  content: { padding: 16, gap: 8 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 4, paddingTop: 10, paddingBottom: 4,
  },
  // プロフィールカード
  profileCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 12,
  },
  profileTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  avatar: { width: 60, height: 60, borderRadius: 30 },
  avatarFallback: { backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontWeight: '700', color: Colors.white },
  name: { fontSize: 16, fontWeight: '700', color: Colors.text },
  username: { fontSize: 12, color: Colors.accent },
  plan: { fontSize: 12, fontWeight: '600' },
  joinDate: { fontSize: 11, color: Colors.textLight },
  bio: { fontSize: 13, color: Colors.text, lineHeight: 20 },
  adminBadge: { backgroundColor: '#EEF2FF', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  adminBadgeText: { fontSize: 10, color: '#4F46E5', fontWeight: '700' },
  bannedBadge: { backgroundColor: '#FEE2E2', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  bannedBadgeText: { fontSize: 10, color: '#DC2626', fontWeight: '700' },
  privateBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.background, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  privateBadgeText: { fontSize: 10, color: Colors.textLight, fontWeight: '600' },
  profileActions: { flexDirection: 'row', gap: 8 },
  viewBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: Colors.accent, borderRadius: 10, paddingVertical: 8,
  },
  viewBtnText: { fontSize: 13, fontWeight: '700', color: Colors.accent },
  banBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#DC2626', borderRadius: 10, paddingVertical: 8,
  },
  banBtnActive: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  banBtnText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
  banBtnTextActive: { color: Colors.white },
  // 統計タグ
  statsTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  statTagValue: { fontSize: 14, fontWeight: '800' },
  statTagLabel: { fontSize: 12, color: Colors.textLight, fontWeight: '500' },
  // 統計グリッド
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: {
    flex: 1, minWidth: '30%', backgroundColor: Colors.white,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    padding: 12, alignItems: 'center', gap: 4,
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, color: Colors.textLight, fontWeight: '600', textAlign: 'center' },
  // 汎用カード
  card: { backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: 16 },
  // クリエイターメンシプ
  mbCreatorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  mbIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: `${Colors.accent}15`, alignItems: 'center', justifyContent: 'center' },
  mbCreatorLabel: { fontSize: 11, color: Colors.textLight },
  mbCreatorPrice: { fontSize: 18, fontWeight: '800', color: Colors.text },
  mbCreatorCount: { alignItems: 'center' },
  mbCreatorCountNum: { fontSize: 20, fontWeight: '800', color: Colors.accent },
  mbCreatorCountLabel: { fontSize: 10, color: Colors.textLight },
  mbRevenueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, paddingHorizontal: 14 },
  mbRevenueLabel: { fontSize: 12, color: Colors.textLight, fontWeight: '600' },
  mbRevenueValue: { fontSize: 16, fontWeight: '800', color: Colors.text },
  // 登録中メンシプ
  subCreatorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  subCreatorAvatar: { width: 36, height: 36, borderRadius: 18 },
  subCreatorAvatarFb: { backgroundColor: Colors.button, alignItems: 'center', justifyContent: 'center' },
  subCreatorAvatarText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  subCreatorName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  subCreatorUser: { fontSize: 11, color: Colors.textLight },
  subCreatorPrice: { fontSize: 12, color: Colors.textLight, marginRight: 4 },
  // 最近の配信
  bcScroll: { maxHeight: 320 },
  bcCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 6,
  },
  bcContent: { fontSize: 13, color: Colors.text, lineHeight: 20 },
  bcMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bcDate: { fontSize: 11, color: Colors.textLight },
  bcStats: { flexDirection: 'row', gap: 10 },
  bcStatItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  bcStatText: { fontSize: 11, color: Colors.textLight },
})
