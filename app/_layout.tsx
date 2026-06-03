import { useEffect, useRef, useState } from 'react'
import { Stack, router, usePathname } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Sentry from '@sentry/react-native'
import * as Updates from 'expo-updates'
import { Platform, AppState, View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { registerPushToken } from '../lib/notifications'
import { authFlags } from '../lib/authState'
import { sendPushToUsers } from '../lib/notifications'
import { upsertDeviceSession } from '../lib/deviceSession'
import CookieBanner from './components/CookieBanner'
import { isAnalyticsEnabled } from '../lib/cookieConsent'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/colors'
import { BETA_GATE, ADMIN_USER_ID } from '../constants/config'
import BetaGate, { isBetaUnlocked } from './beta-gate'

// ── メンテナンス画面 ────────────────────────────────────────────────
function MaintenanceScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#F7F7F9', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Ionicons name="construct-outline" size={56} color="#B0B0B0" />
      <Text style={{ fontSize: 20, fontWeight: '700', color: '#333', marginTop: 20, marginBottom: 10 }}>
        メンテナンス中
      </Text>
      <Text style={{ fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 22 }}>
        現在システムのメンテナンスを行っています。{'\n'}しばらくしてから再度お試しください。
      </Text>
    </View>
  )
}

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

const SKIP_SAVE = ['/(auth)', '/onboarding', '/device-pending', '/talk/', '/creator/', '/im/', '/broadcast-thread/']
const isRestorable = (p: string) =>
  p && p !== '/' && !SKIP_SAVE.some(s => p.startsWith(s))

// 未ログインでも閲覧を許可するパス
const PUBLIC_PREFIXES = ['/creator/', '/talk/', '/terms', '/tokutei', '/privacy', '/landing']
const isPublicPath = (p: string) => PUBLIC_PREFIXES.some(prefix => p.startsWith(prefix))

export default function RootLayout() {
  const { width } = useWindowDimensions()
  const pathname = usePathname()
  const isDesktop = Platform.OS === 'web' && width >= 900
  const isAuthRoute = pathname.startsWith('/(auth)') || pathname === '/onboarding'
    || pathname === '/login' || pathname === '/signup'
  const isLanding = pathname === '/landing'
  const showSidebar = isDesktop && !isAuthRoute && !isLanding

  const navigated = useRef(false)
  const currentUserId = useRef<string | null>(null)

  // ── ベータゲート ────────────────────────────────────────
  // BETA_GATE = true のとき、パスワード未入力ならゲート画面を表示
  const [gateChecked, setGateChecked] = useState(false)
  const [gateUnlocked, setGateUnlocked] = useState(false)
  // ── メンテナンスモード ────────────────────────────────────────
  // MAINTENANCE_MODE = true かつ管理者以外はメンテ画面のみ表示
  const [isMaintenanceBlocked, setIsMaintenanceBlocked] = useState(false)
  const [maintenanceChecked, setMaintenanceChecked] = useState(false)

  useEffect(() => {
    if (!BETA_GATE) { setGateUnlocked(true); setGateChecked(true); return }
    isBetaUnlocked().then(unlocked => {
      setGateUnlocked(unlocked)
      setGateChecked(true)
    })
  }, [])

  useEffect(() => {
    // feature_flagsテーブルの maintenance_mode を参照（管理者画面からリアルタイム切替可能）
    const checkMaintenance = async () => {
      try {
        const [{ data: flagData }, { data: { user } }] = await Promise.all([
          supabase.from('feature_flags').select('enabled').eq('key', 'maintenance_mode').maybeSingle(),
          supabase.auth.getUser(),
        ])
        const isOn = flagData?.enabled ?? false
        if (!isOn) {
          setIsMaintenanceBlocked(false)
        } else {
          // メンテ中: ログインユーザーが管理者(ADMIN_USER_ID)かチェック
          setIsMaintenanceBlocked(!user || user.id !== ADMIN_USER_ID)
        }
      } catch {
        setIsMaintenanceBlocked(false)
      } finally {
        setMaintenanceChecked(true)
      }
    }
    checkMaintenance()
  }, [])

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
      // isRestorable: タブ画面など通常の保存対象パス
      // isPublicPath: /talk/ や /creator/ の共有リンク（保存対象外だが留まるべき）
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const p = window.location.pathname
        if (isRestorable(p) || isPublicPath(p)) return
      }

      // Native / web のルート: 保存済みパスへ復元
      const saved = await AsyncStorage.getItem('reach_last_path').catch(() => null)
      // 過去のバグで保存された無効パス（例: /(tabs)/home）は破棄してホームへ
      const INVALID_SAVED = ['/(tabs)/home', '/(tabs)/compose']
      const validSaved = saved && isRestorable(saved) && !INVALID_SAVED.includes(saved) ? saved : null
      if (!validSaved && saved) AsyncStorage.removeItem('reach_last_path').catch(() => {})
      router.replace((validSaved ?? '/(tabs)/') as any)
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (navigated.current) return
      if (!session) {
        // パブリックルートはログインなしで通過
        if (Platform.OS === 'web' && typeof window !== 'undefined' && isPublicPath(window.location.pathname)) return
        // Web でルート（/）にアクセスした場合はランディングページへ
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.pathname === '/') {
          router.replace('/landing' as any)
          return
        }
        router.replace('/(auth)/login')
      } else {
        navigated.current = true
        currentUserId.current = session.user.id
        registerPushToken().catch(() => {})
        // セッション復元時は少し遅延させてからデバイス登録（認証トークンの準備を待つ）
        setTimeout(() => upsertDeviceSession(session.user.id).catch(e => console.error('[layout] upsert error:', e)), 1500)
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
        // Web ではランディングページへ、ネイティブはログインへ
        router.replace(Platform.OS === 'web' ? '/landing' as any : '/(auth)/login')
      }
      if (event === 'SIGNED_IN') {
        if (authFlags.skipNextSignedIn) { authFlags.skipNextSignedIn = false; return }
        if (navigated.current) return  // セッションリフレッシュによる再発火は無視
        navigated.current = true
        currentUserId.current = session!.user.id
        registerPushToken().catch(() => {})
        // ログイン直後は即実行（SIGNED_IN イベントなので認証済み確実）
        upsertDeviceSession(session!.user.id).catch(e => console.error('[layout] upsert error:', e))
        navigateTo(session!.user.id).catch(() => router.replace('/(tabs)/'))
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── Web: バージョンポーリング（1分ごとに version.json をチェックして自動リロード）─
  useEffect(() => {
    if (Platform.OS !== 'web') return
    let currentHash: string | null = null

    const check = async () => {
      try {
        const res = await fetch('/version.json?t=' + Date.now())
        if (!res.ok) return
        const { hash } = await res.json()
        if (currentHash === null) {
          // 初回: 現在のハッシュを記録するだけ
          currentHash = hash
          return
        }
        if (currentHash !== hash) {
          // 新しいバージョンが検出されたら自動リロード
          window.location.reload()
        }
      } catch {
        // ネットワークエラーは無視
      }
    }

    check()
    const timer = setInterval(check, 60 * 1000) // 1分ごと
    return () => clearInterval(timer)
  }, [])

  // ── ネイティブ: EAS Update（起動時・フォアグラウンド復帰時に OTA 更新チェック）─
  useEffect(() => {
    if (Platform.OS === 'web') return
    if (!Updates.isEnabled) return  // 開発中 (Expo Go / metro) はスキップ

    const checkUpdate = async () => {
      try {
        const result = await Updates.checkForUpdateAsync()
        if (!result.isAvailable) return
        await Updates.fetchUpdateAsync()
        await Updates.reloadAsync()  // 新バージョンを即適用して再起動
      } catch {
        // ネットワーク障害など → 無視して続行
      }
    }

    checkUpdate()

    // アプリがフォアグラウンドに戻るたびにもチェック
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') checkUpdate()
    })
    return () => sub.remove()
  }, [])

  // ── アプリ前面復帰時の処理（デバイスセッション承認は無効化済み）─────────────
  useEffect(() => {
    const handleActive = async () => {
      // 現在はデバイス承認フローを使用していないため何もしない
    }

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onVis = () => { if (document.visibilityState === 'visible') handleActive() }
      document.addEventListener('visibilitychange', onVis)
      return () => document.removeEventListener('visibilitychange', onVis)
    } else {
      const sub = AppState.addEventListener('change', state => {
        if (state === 'active') handleActive()
      })
      return () => sub.remove()
    }
  }, [])

  // ── ゲート判定（全Hook定義の後に配置：Rules of Hooks を守るため）─────────────
  // ゲート確認中は何も表示しない（チラつき防止）
  if (!gateChecked || !maintenanceChecked) return null
  // メンテナンス中は管理者以外にメンテ画面のみ表示
  if (isMaintenanceBlocked) {
    return <MaintenanceScreen />
  }
  // パスワード未入力ならゲート画面だけ表示
  if (BETA_GATE && !gateUnlocked) {
    return <BetaGate onUnlock={() => setGateUnlocked(true)} />
  }

  return (
    <View style={{ flex: 1, flexDirection: showSidebar ? 'row' : 'column', ...(Platform.OS === 'web' ? { height: '100vh' as any } : {}) }}>
      {showSidebar && <DesktopSidebar />}
      <View style={{ flex: 1 }}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
        <CookieBanner />
      </View>
    </View>
  )
}
