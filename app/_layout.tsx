import { useEffect, useRef } from 'react'
import { Stack, router, usePathname } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Sentry from '@sentry/react-native'
import { Platform, View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { registerPushToken } from '../lib/notifications'
import { authFlags } from '../lib/authState'
import CookieBanner from './components/CookieBanner'
import PwaPrompt from './components/PwaPrompt'
import { isAnalyticsEnabled } from '../lib/cookieConsent'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/colors'

const SIDEBAR_W = 68

function DesktopSidebar() {
  const pathname = usePathname()
  const NAV = [
    { route: '/',       activeIcon: 'home'       as const, icon: 'home-outline'       as const, label: 'ホーム' },
    { route: '/talk',   activeIcon: 'chatbubble' as const, icon: 'chatbubble-outline' as const, label: 'メッセージ' },
    { route: '/shop',   activeIcon: 'compass'    as const, icon: 'compass-outline'    as const, label: '発見' },
    { route: '/mypage', activeIcon: 'person'     as const, icon: 'person-outline'     as const, label: 'マイページ' },
  ]
  const isActive = (route: string) => {
    if (route === '/') return pathname === '/' || pathname === ''
    return pathname.startsWith(route)
  }
  return (
    <View style={sb.wrap}>
      {NAV.map(item => {
        const active = isActive(item.route)
        return (
          <TouchableOpacity key={item.route} style={sb.item} onPress={() => router.push(item.route as any)} activeOpacity={0.7}>
            <Ionicons name={active ? item.activeIcon : item.icon} size={22} color={active ? Colors.accent : Colors.textLight} />
            <Text style={[sb.label, { color: active ? Colors.accent : Colors.textLight }]}>{item.label}</Text>
          </TouchableOpacity>
        )
      })}
      <TouchableOpacity
        style={sb.composeBtn}
        onPress={async () => {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return
          const { count } = await supabase.from('broadcasts').select('id', { count: 'exact', head: true }).eq('sender_id', user.id)
          router.push((count ?? 0) === 0 ? '/broadcast-intro' : '/compose')
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={22} color={Colors.white} />
      </TouchableOpacity>
    </View>
  )
}

const sb = StyleSheet.create({
  wrap: {
    width: SIDEBAR_W,
    backgroundColor: Colors.header,
    borderRightWidth: 1, borderRightColor: Colors.border,
    alignItems: 'center', paddingTop: 16, paddingBottom: 16, gap: 4,
  },
  item: { width: SIDEBAR_W - 8, paddingVertical: 10, alignItems: 'center', gap: 3, borderRadius: 10 },
  label: { fontSize: 9, fontWeight: '600' },
  composeBtn: {
    marginTop: 12, width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 6,
  },
})

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production' && (Platform.OS !== 'web' || isAnalyticsEnabled()),
  tracesSampleRate: 0.2,
})

// Web: 同意が変わったタイミングでSentryの有効/無効を切り替え
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('cookieConsentChanged', (e: any) => {
    const client = Sentry.getClient()
    if (client) client.getOptions().enabled = e.detail === 'accepted' && process.env.NODE_ENV === 'production'
  })
}

const SKIP_SAVE = ['/(auth)', '/onboarding', '/talk/', '/creator/', '/im/', '/broadcast-thread/']
const isRestorable = (p: string) =>
  p && p !== '/' && !SKIP_SAVE.some(s => p.startsWith(s))

// 未ログインでも閲覧を許可するパス
const PUBLIC_PREFIXES = ['/creator/', '/talk/']
const isPublicPath = (p: string) => PUBLIC_PREFIXES.some(prefix => p.startsWith(prefix))

export default function RootLayout() {
  const { width } = useWindowDimensions()
  const pathname = usePathname()
  const isDesktop = Platform.OS === 'web' && width >= 900
  const isAuthRoute = pathname.startsWith('/(auth)') || pathname === '/onboarding'
  const showSidebar = isDesktop && !isAuthRoute

  const navigated = useRef(false)

  // パスが変わるたびに保存（認証・オンボーディング画面は除く）
  useEffect(() => {
    if (isRestorable(pathname)) {
      AsyncStorage.setItem('reach_last_path', pathname).catch(() => {})
    }
  }, [pathname])

  useEffect(() => {
    const navigateTo = async (userId: string) => {
      const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', userId).single()
      if (!prof?.display_name || prof.display_name.includes('@')) {
        router.replace('/onboarding')
        return
      }

      // Web: すでに有効な画面のURLにいる場合はそのまま留まる
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const p = window.location.pathname
        if (isRestorable(p)) return
      }

      // Native / web のルート: 保存済みパスへ復元
      const saved = await AsyncStorage.getItem('reach_last_path').catch(() => null)
      router.replace((saved && isRestorable(saved) ? saved : '/(tabs)/') as any)
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (navigated.current) return
      if (!session) {
        // パブリックルートはログインなしで通過
        if (Platform.OS === 'web' && typeof window !== 'undefined' && isPublicPath(window.location.pathname)) return
        router.replace('/(auth)/login')
      } else {
        navigated.current = true
        registerPushToken().catch(() => {})
        navigateTo(session.user.id).catch(() => router.replace('/(tabs)/'))
      }
    }).catch(() => {
      router.replace('/(auth)/login')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        if (authFlags.skipNextSignedOut) { authFlags.skipNextSignedOut = false; return }
        if (Platform.OS === 'web' && typeof window !== 'undefined' && isPublicPath(window.location.pathname)) return
        navigated.current = false
        router.replace('/(auth)/login')
      }
      if (event === 'SIGNED_IN') {
        if (authFlags.skipNextSignedIn) { authFlags.skipNextSignedIn = false; return }
        if (navigated.current) return  // セッションリフレッシュによる再発火は無視
        navigated.current = true
        registerPushToken().catch(() => {})
        navigateTo(session!.user.id).catch(() => router.replace('/(tabs)/'))
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <View style={{ flex: 1, flexDirection: showSidebar ? 'row' : 'column' }}>
      {showSidebar && <DesktopSidebar />}
      <View style={{ flex: 1 }}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
        <CookieBanner />
        <PwaPrompt />
      </View>
    </View>
  )
}
