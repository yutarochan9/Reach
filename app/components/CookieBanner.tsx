import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native'
import { router } from 'expo-router'
import { Colors } from '../../constants/colors'
import { getConsent, setConsent } from '../../lib/cookieConsent'

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (Platform.OS !== 'web') return
    if (getConsent() === null) setVisible(true)
  }, [])

  const accept = () => {
    setConsent('accepted')
    setVisible(false)
  }

  const decline = () => {
    setConsent('declined')
    setVisible(false)
  }

  if (!visible || Platform.OS !== 'web') return null

  return (
    <View style={styles.wrap}>
      <View style={styles.banner}>
        <Text style={styles.text}>
          Reachはサービス向上のため、必要なCookieを使用しています。詳細は
          <Text style={styles.link} onPress={() => router.push('/privacy' as any)}> プライバシーポリシー </Text>
          をご覧ください。
        </Text>
        <View style={styles.btns}>
          <TouchableOpacity style={styles.declineBtn} onPress={decline}>
            <Text style={styles.declineText}>必要なもののみ</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptBtn} onPress={accept}>
            <Text style={styles.acceptText}>すべて許可</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute' as any,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    padding: 12,
    pointerEvents: 'box-none' as any,
  },
  banner: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  text: { fontSize: 13, color: Colors.text, lineHeight: 20 },
  link: { color: Colors.accent },
  btns: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  declineBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  declineText: { fontSize: 13, color: Colors.text, fontWeight: '600' },
  acceptBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  acceptText: { fontSize: 13, color: Colors.white, fontWeight: '600' },
})
