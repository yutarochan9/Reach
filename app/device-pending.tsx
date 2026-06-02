/**
 * device-pending.tsx
 * 新規端末でログインしたとき、ホスト端末の承認を待つ画面。
 * 3秒おきにステータスをポーリングし、approved になったら通常画面へ遷移する。
 * denied になった場合はサインアウトしてログイン画面へ戻す。
 */

import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { getDeviceKey, getDeviceName } from '../lib/deviceSession'
import { Colors } from '../constants/colors'

export default function DevicePendingScreen() {
  const [denied, setDenied] = useState(false)
  const [deviceName] = useState(getDeviceName())

  // 3秒おきにステータスをポーリング
  useEffect(() => {
    let active = true
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !active) return
      const deviceKey = await getDeviceKey()
      const { data } = await supabase
        .from('device_sessions')
        .select('status')
        .eq('user_id', user.id)
        .eq('device_key', deviceKey)
        .maybeSingle()
      if (!active) return
      if (data?.status === 'approved') {
        // 承認された → 通常の画面へ
        router.replace('/(tabs)/' as any)
      } else if (data?.status === 'denied' || !data) {
        setDenied(true)
      }
    }
    check()
    const timer = setInterval(check, 3000)
    return () => { active = false; clearInterval(timer) }
  }, [])

  const handleCancel = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const deviceKey = await getDeviceKey()
      await supabase.from('device_sessions').delete()
        .eq('user_id', user.id).eq('device_key', deviceKey)
    }
    await supabase.auth.signOut({ scope: 'local' })
    router.replace('/(auth)/login')
  }

  if (denied) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={[styles.iconWrap, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="close-circle" size={40} color="#DC2626" />
          </View>
          <Text style={styles.title}>ログインが拒否されました</Text>
          <Text style={styles.desc}>
            ホスト端末からこのデバイスのログインが拒否されました。{'\n'}
            別のアカウントでログインするか、ホスト端末から再度承認を依頼してください。
          </Text>
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
            <Text style={styles.cancelText}>ログイン画面に戻る</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="phone-portrait-outline" size={40} color={Colors.accent} />
        </View>
        <Text style={styles.title}>ホスト端末の承認を待っています</Text>
        <View style={styles.deviceRow}>
          <Ionicons name="desktop-outline" size={14} color={Colors.textLight} />
          <Text style={styles.deviceName}>{deviceName}</Text>
        </View>
        <Text style={styles.desc}>
          最初に登録されたホスト端末でReachを開き、{'\n'}
          <Text style={{ fontWeight: '700' }}>設定 › ログイン中のデバイス</Text> から{'\n'}
          このデバイスを承認してください。
        </Text>
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 8 }} />
        <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
          <Text style={styles.cancelText}>キャンセル</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: {
    backgroundColor: Colors.white, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border,
    padding: 28, width: '100%', maxWidth: 380,
    alignItems: 'center', gap: 12,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 24px rgba(0,0,0,0.08)' } as any : {
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1, shadowRadius: 12, elevation: 6,
    }),
  },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: `${Colors.accent}15`,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  deviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.background, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  deviceName: { fontSize: 13, color: Colors.textLight, fontWeight: '600' },
  desc: {
    fontSize: 13, color: Colors.textLight, textAlign: 'center', lineHeight: 20, marginTop: 4,
  },
  cancelBtn: {
    marginTop: 12, paddingHorizontal: 24, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
  },
  cancelText: { fontSize: 14, color: Colors.textLight, fontWeight: '600' },
})
