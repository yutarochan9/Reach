/**
 * device-sessions.tsx
 * 設定 › ログイン中のデバイス 画面。
 * 承認待ちデバイスの承認・拒否と、ログイン済みデバイスのログアウトを管理する。
 */

import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'
import { getDeviceKey, promoteNewHost } from '../lib/deviceSession'

type DeviceSession = {
  id: string
  device_name: string
  platform: string
  device_key: string
  last_seen: string
  is_host: boolean
  status: 'approved' | 'pending' | 'denied'
}

export default function DeviceSessionsScreen() {
  const [deviceSessions, setDeviceSessions] = useState<DeviceSession[]>([])
  const [currentDeviceKey, setCurrentDeviceKey] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: sessions }, deviceKey] = await Promise.all([
      supabase.from('device_sessions')
        .select('id, device_name, platform, device_key, last_seen, is_host, status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
      getDeviceKey(),
    ])
    setDeviceSessions((sessions as DeviceSession[]) ?? [])
    setCurrentDeviceKey(deviceKey)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // 特定デバイスをログアウト（自端末なら即サインアウト）
  const handleLogoutDevice = (session: DeviceSession) => {
    const isCurrentDevice = session.device_key === currentDeviceKey
    const msg = isCurrentDevice
      ? 'このデバイスからログアウトします。よろしいですか？'
      : `「${session.device_name}」のセッションを終了します。よろしいですか？`
    const doLogout = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (session.is_host && user) await promoteNewHost(user.id, session.device_key)
      await supabase.from('device_sessions').delete().eq('id', session.id)
      if (isCurrentDevice) {
        await supabase.auth.signOut()
        router.replace('/(auth)/login')
      } else {
        setDeviceSessions(prev => prev.filter(s => s.id !== session.id))
      }
    }
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doLogout()
    } else {
      Alert.alert(
        isCurrentDevice ? 'このデバイスをログアウト' : `「${session.device_name}」をログアウト`,
        msg,
        [{ text: 'キャンセル', style: 'cancel' }, { text: 'ログアウト', style: 'destructive', onPress: doLogout }]
      )
    }
  }

  // 他のすべてのデバイスをログアウト
  const handleLogoutOtherDevices = () => {
    const msg = '他のすべてのデバイスのセッションを終了します。よろしいですか？'
    const doLogout = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('device_sessions').delete()
        .eq('user_id', user.id).neq('device_key', currentDeviceKey)
      setDeviceSessions(prev => prev.filter(s => s.device_key === currentDeviceKey))
    }
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doLogout()
    } else {
      Alert.alert('他のデバイスをすべてログアウト', msg,
        [{ text: 'キャンセル', style: 'cancel' }, { text: 'ログアウト', style: 'destructive', onPress: doLogout }]
      )
    }
  }

  // 承認待ちデバイスを承認する
  const handleApproveDevice = async (session: DeviceSession) => {
    await supabase.from('device_sessions').update({ status: 'approved' }).eq('id', session.id)
    setDeviceSessions(prev => prev.map(s => s.id === session.id ? { ...s, status: 'approved' } : s))
  }

  // 承認待ちデバイスを拒否する
  const handleDenyDevice = async (session: DeviceSession) => {
    await supabase.from('device_sessions').update({ status: 'denied' }).eq('id', session.id)
    setTimeout(async () => {
      await supabase.from('device_sessions').delete().eq('id', session.id)
    }, 500)
    setDeviceSessions(prev => prev.filter(s => s.id !== session.id))
  }

  const pendingSessions = deviceSessions.filter(s => s.status === 'pending')
  const approvedSessions = deviceSessions.filter(s => s.status === 'approved')

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/settings' as any)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ログイン中のデバイス</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>

          {/* 承認待ちデバイス */}
          {pendingSessions.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>承認待ちのデバイス</Text>
              <View style={styles.section}>
                {pendingSessions.map((session, idx) => (
                  <View key={session.id}>
                    {idx > 0 && <View style={styles.divider} />}
                    <View style={styles.deviceRow}>
                      <View style={[styles.deviceIconWrap, { backgroundColor: '#FEF3C7' }]}>
                        <Ionicons
                          name={session.platform === 'ios' ? 'phone-portrait-outline' : session.platform === 'android' ? 'logo-android' : 'desktop-outline' as any}
                          size={20} color="#D97706"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.deviceName} numberOfLines={1}>{session.device_name}</Text>
                        <Text style={styles.deviceSub}>承認をリクエスト中</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity style={styles.approveBtn} onPress={() => handleApproveDevice(session)}>
                          <Text style={styles.approveBtnText}>承認</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.denyBtn} onPress={() => handleDenyDevice(session)}>
                          <Text style={styles.denyBtnText}>拒否</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ログイン済みデバイス */}
          <Text style={styles.sectionLabel}>ログイン中</Text>
          <View style={styles.section}>
            {approvedSessions.length === 0 ? (
              <View style={styles.deviceRow}>
                <Text style={styles.deviceSub}>デバイスがありません</Text>
              </View>
            ) : (
              approvedSessions.map((session, idx) => {
                const isCurrent = session.device_key === currentDeviceKey
                const platformIcon =
                  session.platform === 'ios' ? 'phone-portrait-outline' :
                  session.platform === 'android' ? 'logo-android' : 'desktop-outline'
                const lastSeen = (() => {
                  const diff = Date.now() - new Date(session.last_seen).getTime()
                  if (diff < 60000)    return 'たった今'
                  if (diff < 3600000)  return `${Math.floor(diff / 60000)}分前`
                  if (diff < 86400000) return `${Math.floor(diff / 3600000)}時間前`
                  return `${Math.floor(diff / 86400000)}日前`
                })()
                return (
                  <View key={session.id}>
                    {idx > 0 && <View style={styles.divider} />}
                    <View style={styles.deviceRow}>
                      <View style={[styles.deviceIconWrap, isCurrent && styles.deviceIconWrapCurrent]}>
                        <Ionicons name={platformIcon as any} size={18} color={isCurrent ? Colors.accent : Colors.textLight} />
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          <Text style={styles.deviceName} numberOfLines={1}>{session.device_name}</Text>
                          {session.is_host && (
                            <View style={styles.hostBadge}>
                              <Ionicons name="shield-checkmark" size={9} color={Colors.white} />
                              <Text style={styles.hostBadgeText}>ホスト</Text>
                            </View>
                          )}
                          {isCurrent && (
                            <View style={styles.currentBadge}>
                              <Text style={styles.currentBadgeText}>このデバイス</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.deviceSub}>最終アクセス：{lastSeen}</Text>
                      </View>
                      {/* ⋯ ボタン（押すと確認ダイアログ） */}
                      <TouchableOpacity
                        onPress={() => handleLogoutDevice(session)}
                        style={styles.deviceMoreBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textLight} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              })
            )}
          </View>

          {/* 他のすべてのデバイスをログアウト */}
          {approvedSessions.length > 1 && (
            <TouchableOpacity style={styles.logoutAllBtn} onPress={handleLogoutOtherDevices}>
              <Ionicons name="log-out-outline" size={15} color={Colors.textLight} />
              <Text style={styles.logoutAllText}>他のすべてのデバイスをログアウト</Text>
            </TouchableOpacity>
          )}

        </ScrollView>
      )}
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  content: { padding: 16, gap: 8 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textLight,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4,
  },
  section: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: 8,
  },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: 58 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  deviceIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  deviceIconWrapCurrent: { backgroundColor: `${Colors.accent}15` },
  deviceName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  deviceSub: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
  deviceMoreBtn: { padding: 6, borderRadius: 16 },
  currentBadge: {
    backgroundColor: `${Colors.accent}20`, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  currentBadgeText: { fontSize: 10, color: Colors.accent, fontWeight: '700' },
  hostBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.accent, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  hostBadgeText: { fontSize: 10, color: Colors.white, fontWeight: '700' },
  approveBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, backgroundColor: Colors.accent,
  },
  approveBtnText: { fontSize: 12, color: Colors.white, fontWeight: '700' },
  denyBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.border,
  },
  denyBtnText: { fontSize: 12, color: Colors.textLight, fontWeight: '600' },
  logoutAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 4,
  },
  logoutAllText: { fontSize: 13, color: Colors.textLight },
})
