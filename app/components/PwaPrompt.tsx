import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Platform, Image, Animated } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/colors'

const STORAGE_KEY = 'reach_pwa_prompt_dismissed'

function isIosMobileSafari() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  const ua = navigator.userAgent
  if (!/iP(hone|ad|od)/.test(ua)) return false
  if (!/WebKit/.test(ua)) return false
  if (/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua)) return false
  return true
}

function isStandalone() {
  if (typeof window === 'undefined') return true
  return (
    (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

export default function PwaPrompt() {
  const [visible, setVisible] = useState(false)
  const slideAnim = useState(new Animated.Value(300))[0]

  useEffect(() => {
    if (Platform.OS !== 'web') return
    if (!isIosMobileSafari()) return
    if (isStandalone()) return
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (dismissed) return
    // 少し遅らせて表示
    const t = setTimeout(() => {
      setVisible(true)
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start()
    }, 2000)
    return () => clearTimeout(t)
  }, [])

  const dismiss = () => {
    Animated.timing(slideAnim, {
      toValue: 400,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setVisible(false))
    localStorage.setItem(STORAGE_KEY, '1')
  }

  if (!visible) return null

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* ハンドルバー */}
        <View style={styles.handle} />

        {/* ヘッダー */}
        <View style={styles.header}>
          <Image source={require('../../assets/icon.png')} style={styles.appIcon} />
          <View style={styles.headerText}>
            <Text style={styles.title}>アプリとして使う</Text>
            <Text style={styles.subtitle}>ホーム画面に追加するとLINEのように快適に使えます</Text>
          </View>
        </View>

        {/* ステップ */}
        <View style={styles.steps}>
          <View style={styles.step}>
            <View style={styles.stepIcon}>
              <Ionicons name="share-outline" size={20} color={Colors.accent} />
            </View>
            <View style={styles.stepText}>
              <Text style={styles.stepTitle}>Safariの共有ボタンをタップ</Text>
              <Text style={styles.stepDesc}>画面下中央の □↑ アイコン</Text>
            </View>
          </View>
          <View style={styles.stepDivider} />
          <View style={styles.step}>
            <View style={styles.stepIcon}>
              <Ionicons name="add-circle-outline" size={20} color={Colors.accent} />
            </View>
            <View style={styles.stepText}>
              <Text style={styles.stepTitle}>「ホーム画面に追加」を選択</Text>
              <Text style={styles.stepDesc}>メニューを下にスクロールして見つけてください</Text>
            </View>
          </View>
          <View style={styles.stepDivider} />
          <View style={styles.step}>
            <View style={styles.stepIcon}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#34C759" />
            </View>
            <View style={styles.stepText}>
              <Text style={styles.stepTitle}>「追加」をタップ</Text>
              <Text style={styles.stepDesc}>アドレスバーなしで快適に起動できます</Text>
            </View>
          </View>
        </View>

        {/* ボタン */}
        <TouchableOpacity style={styles.dismissBtn} onPress={dismiss} activeOpacity={0.7}>
          <Text style={styles.dismissText}>あとで</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute' as any,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    pointerEvents: 'box-none' as any,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 20,
    gap: 14,
  },
  appIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
  },
  headerText: { flex: 1 },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textLight,
    lineHeight: 18,
  },
  steps: {
    marginHorizontal: 20,
    backgroundColor: Colors.background,
    borderRadius: 16,
    paddingVertical: 4,
    marginBottom: 20,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  stepText: { flex: 1 },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  stepDesc: {
    fontSize: 12,
    color: Colors.textLight,
  },
  stepDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 66,
    marginRight: 16,
  },
  dismissBtn: {
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  dismissText: {
    fontSize: 15,
    color: Colors.textLight,
    fontWeight: '600',
  },
})
