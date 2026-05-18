import { useEffect, useRef } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { supabase } from '../lib/supabase'
import { registerPushToken } from '../lib/notifications'
import { authFlags } from '../lib/authState'

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
            router.replace('/(tabs)/')
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
            router.replace('/(tabs)/')
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
    </>
  )
}
