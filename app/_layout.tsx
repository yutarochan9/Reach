import { useEffect, useRef } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Sentry from '@sentry/react-native'
import { Platform } from 'react-native'
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (navigated.current) return
      navigated.current = true
      if (!session) {
        router.replace('/(auth)/login')
      } else {
        registerPushToken().catch(() => {})
        supabase.from('profiles').select('display_name').eq('id', session.user.id).single().then(({ data: prof }) => {
          if (!prof?.display_name || prof.display_name.includes('@')) {
            router.replace('/onboarding')
          } else {
            const savedTab = Platform.OS === 'web' ? (() => { try { return localStorage.getItem('reach_last_tab') } catch { return null } })() : null
            router.replace((savedTab ?? '/(tabs)/') as any)
          }
        }).catch(() => {
          router.replace('/(tabs)/')
        })
      }
    }).catch(() => {
      router.replace('/(auth)/login')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        if (authFlags.skipNextSignedOut) { authFlags.skipNextSignedOut = false; return }
        router.replace('/(auth)/login')
      }
      if (event === 'SIGNED_IN') {
        if (authFlags.skipNextSignedIn) { authFlags.skipNextSignedIn = false; return }
        registerPushToken().catch(() => {})
        supabase.from('profiles').select('display_name').eq('id', session!.user.id).single().then(({ data: prof }) => {
          if (!prof?.display_name || prof.display_name.includes('@')) {
            router.replace('/onboarding')
          } else {
            const savedTab = Platform.OS === 'web' ? (() => { try { return localStorage.getItem('reach_last_tab') } catch { return null } })() : null
            router.replace((savedTab ?? '/(tabs)/') as any)
          }
        }).catch(() => {
          router.replace('/(tabs)/')
        })
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
