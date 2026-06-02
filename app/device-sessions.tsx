/**
 * device-sessions.tsx
 * 設定 › ログイン中のデバイス 画面。
 * ログイン済みデバイスの一覧表示・ログアウトを管理する。
 * ホスト承認フローは廃止済み。
 */

import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'
import { getDeviceKey, upsertDeviceSession } from '../lib/deviceSession'

type DeviceSession = {
  id: string
  device_name: string
  platform: string
  device_key: string
  last_seen: string
  location: string | null
  status: 'approved' | 'pending' | 'denied'
}

// last_seen を「X分前」などの相対表現に変換
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000)    return 'たった今'
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}分前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}時間前`
  return `${Math.floor(diff / 86400000)}日前`
}

// last_seen を「YYYY/MM/DD HH:mm」形式に変換
function formatDatetime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function DeviceSessionsScreen() {
  const [deviceSessions, setDeviceSessions] = useState<DeviceSession[]>([])
  const [currentDeviceKey, setCurrentDeviceKey] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (!user) { console.warn('[device-sessions] getUser failed:', userError?.message); return }

    const deviceKey = await getDeviceKey()

    // 現在のデバイスを upsert（画面を開くたびに last_seen を更新 & 未登録なら登録）
    const result = await upsertDeviceSession(user.id)
    console.log('[device-sessions] upsert result:', result)

    const { data: sessions, error: fetchError } = await supabase.from('device_sessions')
      .select('id, device_name, platform, device_key, last_seen, location, status')
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .order('last_seen', { ascending: false })

    if (fetchError) console.error('[device-sessions] fetch error:', fetchError.message)

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

          {/* ログイン済みデバイス一覧 */}
          <Text style={styles.sectionLabel}>ログイン中</Text>
          <View style={styles.section}>
            {deviceSessions.length === 0 ? (
              <View style={styles.deviceRow}>
                <Text style={styles.deviceSub}>デバイスがありません</Text>
              </View>
            ) : (
              deviceSessions.map((session, idx) => {
                const isCurrent = session.device_key === currentDeviceKey
                // デバイス名からアイコンを選択
                // platform='web' でもiPhone/Androidなら携帯アイコンを使う
                const name = session.device_name.toLowerCase()
                const platformIcon =
                  session.platform === 'ios' || name.includes('iphone') || name.includes('ipad')
                    ? 'phone-portrait-outline'
                  : session.platform === 'android' || name.includes('android') || name.includes('pixel') || name.includes('galaxy') || name.includes('samsung')
                    ? 'logo-android'
                  : 'desktop-outline'
                return (
                  <View key={session.id}>
                    {idx > 0 && <View style={styles.divider} />}
                    <View style={styles.deviceRow}>
                      {/* デバイスアイコン */}
                      <View style={[styles.deviceIconWrap, isCurrent && styles.deviceIconWrapCurrent]}>
                        <Ionicons name={platformIcon as any} size={18} color={isCurrent ? Colors.accent : Colors.textLight} />
                      </View>

                      {/* デバイス情報 */}
                      <View style={{ flex: 1, gap: 2 }}>
                        {/* デバイス名 + "このデバイス"バッジ */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          <Text style={styles.deviceName} numberOfLines={1}>{session.device_name}</Text>
                          {isCurrent && (
                            <View style={styles.currentBadge}>
                              <Text style={styles.currentBadgeText}>このデバイス</Text>
                            </View>
                          )}
                        </View>
                        {/* 場所（取得できた場合のみ表示） */}
                        {session.location ? (
                          <Text style={styles.deviceSub}>
                            <Ionicons name="location-outline" size={10} color={Colors.textLight} /> {session.location}
                          </Text>
                        ) : null}
                        {/* 最終ログイン日時：相対時間 + 絶対時間 */}
                        <Text style={styles.deviceSub}>
                          最終ログイン：{relativeTime(session.last_seen)}（{formatDatetime(session.last_seen)}）
                        </Text>
                      </View>

                      {/* ⋯ メニューボタン */}
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
          {deviceSessions.length > 1 && (
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
  deviceSub: { fontSize: 11, color: Colors.textLight, marginTop: 1 },
  deviceMoreBtn: { padding: 6, borderRadius: 16 },
  currentBadge: {
    backgroundColor: `${Colors.accent}20`, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  currentBadgeText: { fontSize: 10, color: Colors.accent, fontWeight: '700' },
  logoutAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 4,
  },
  logoutAllText: { fontSize: 13, color: Colors.textLight },
})
