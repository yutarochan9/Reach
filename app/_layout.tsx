import { useEffect, useRef } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Sentry from '@sentry/react-native'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { registerPushToken } from '../lib/notifications'
import { authFlags } from '../lib/authState'
import CookieBanner from './components/CookieBanner'
import { isAnalyticsEnabled } from '../lib/cookieConsent'

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

export default function RootLayout() {
  const navigated = useRef(false)

  useEffect(() => {
    const navigateTo = async (userId: string) => {
      const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', userId).single()
      if (!prof?.display_name || prof.display_name.includes('@')) {
        router.replace('/onboarding')
      } else {
        const savedTab = await AsyncStorage.getItem('reach_last_tab').catch(() => null)
        router.replace((savedTab ?? '/(tabs)/') as any)
      }
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (navigated.current) return
      if (!session) {
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
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
      <CookieBanner />
    </>
  )
}
