import { useState, useEffect, useCallback } from 'react'
import { Tabs, router, usePathname } from 'expo-router'
import { Colors } from '../../constants/colors'
import { View, Text, StyleSheet, TouchableOpacity, Platform, useWindowDimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../lib/supabase'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TalkContext } from '../contexts/TalkContext'
import TalkDetailPanel from '../components/TalkDetailPanel'
import IMChatPanel from '../components/IMChatPanel'

const SIDEBAR_W = 68

// ── デスクトップ用左サイドバー ─────────────────────────────────
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
    <View style={sidebar.wrap}>
      {NAV.map(item => {
        const active = isActive(item.route)
        return (
          <TouchableOpacity
            key={item.route}
            style={sidebar.item}
            onPress={() => router.push(item.route as any)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={active ? item.activeIcon : item.icon}
              size={22}
              color={active ? Colors.accent : Colors.textLight}
            />
            <Text style={[sidebar.label, { color: active ? Colors.accent : Colors.textLight }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        )
      })}

      <TouchableOpacity
        style={sidebar.composeBtn}
        onPress={async () => {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return
          const { count } = await supabase
            .from('broadcasts')
            .select('id', { count: 'exact', head: true })
            .eq('sender_id', user.id)
          router.push((count ?? 0) === 0 ? '/broadcast-intro' : '/compose')
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={22} color={Colors.white} />
      </TouchableOpacity>
    </View>
  )
}

// ── モバイル用ボトムタブバー ───────────────────────────────────
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const bottomPad = Math.max(insets.bottom, 8)
  const iconMap: Record<string, { active: React.ComponentProps<typeof Ionicons>['name']; inactive: React.ComponentProps<typeof Ionicons>['name']; label: string }> = {
    index:  { active: 'home',         inactive: 'home-outline',         label: 'ホーム' },
    talk:   { active: 'chatbubble',   inactive: 'chatbubble-outline',   label: 'メッセージ' },
    shop:   { active: 'compass',      inactive: 'compass-outline',      label: '発見' },
    mypage: { active: 'person',       inactive: 'person-outline',       label: 'マイページ' },
  }

  const tabs = state.routes.map((route, index) => {
    const focused = state.index === index
    const icon = iconMap[route.name]
    if (!icon) return null
    return (
      <TouchableOpacity
        key={route.key}
        style={styles.tab}
        onPress={() => navigation.navigate(route.name)}
        activeOpacity={0.7}
      >
        <Ionicons name={focused ? icon.active : icon.inactive} size={24} color={focused ? Colors.accent : Colors.textLight} />
        <Text style={[styles.tabLabel, { color: focused ? Colors.accent : Colors.textLight }]}>{icon.label}</Text>
      </TouchableOpacity>
    )
  })

  const left = tabs.slice(0, 2)
  const right = tabs.slice(2)

  return (
    <View style={[styles.tabBar, { paddingBottom: bottomPad, height: 56 + bottomPad }]}>
      <View style={styles.tabGroup}>{left}</View>
      <TouchableOpacity
        style={styles.centerButton}
        onPress={async () => {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return
          const { count } = await supabase
            .from('broadcasts')
            .select('id', { count: 'exact', head: true })
            .eq('sender_id', user.id)
          router.push((count ?? 0) === 0 ? '/broadcast-intro' : '/compose')
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>
      <View style={styles.tabGroup}>{right}</View>
    </View>
  )
}

const TALK_LIST_W = 400

// ── トーク未選択時の空状態 ──────────────────────────────────────
function TalkEmptyPanel() {
  return (
    <View style={emptyPanel.wrap}>
      <Ionicons name="chatbubble-ellipses-outline" size={56} color={Colors.border} />
      <Text style={emptyPanel.text}>トークを選択してください</Text>
    </View>
  )
}

// ── タブレイアウト本体 ─────────────────────────────────────────
export default function TabLayout() {
  const { width } = useWindowDimensions()
  const isDesktop = Platform.OS === 'web' && width >= 900
  const pathname = usePathname()

  const [selectedTalkId, setSelectedTalkId] = useState<string | null>(null)
  const [selectedDmId, setSelectedDmId] = useState<string | null>(null)
  const [dmReloadKey, setDmReloadKey] = useState(0)
  const triggerDmReload = useCallback(() => setDmReloadKey(k => k + 1), [])

  // トークページ以外に移動したらパネルを閉じる
  useEffect(() => {
    if (!pathname.startsWith('/talk')) {
      setSelectedTalkId(null)
      setSelectedDmId(null)
    }
    // タブを記憶（全プラットフォーム）
    const tabRoutes = ['/(tabs)/', '/(tabs)/talk', '/(tabs)/shop', '/(tabs)/mypage']
    const match = tabRoutes.find(r => r === pathname || (r !== '/(tabs)/' && pathname.startsWith(r)))
    if (match) AsyncStorage.setItem('reach_last_tab', match).catch(() => {})
  }, [pathname])

  // デスクトップのトークページでは常に2カラム表示
  const isTalkPage = pathname.startsWith('/talk') || pathname === '/talk'
  const showTwoCol = isDesktop && isTalkPage

  return (
    <TalkContext.Provider value={{ selectedTalkId, setSelectedTalkId, selectedDmId, setSelectedDmId, isDesktop, dmReloadKey, triggerDmReload }}>
      <View style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column', backgroundColor: Colors.background }}>

        {/* 左サイドバー（デスクトップのみ） */}
        {isDesktop && <DesktopSidebar />}

        {/* タブコンテンツ（常にflex:1で残り全幅を使用） */}
        <View style={{ flex: 1, borderRightWidth: showTwoCol ? 1 : 0, borderRightColor: Colors.border }}>
          <Tabs
            tabBar={(props) => isDesktop ? <></> : <CustomTabBar {...props} />}
            screenOptions={{ headerShown: false }}
          >
            <Tabs.Screen name="index" />
            <Tabs.Screen name="talk" />
            <Tabs.Screen name="shop" />
            <Tabs.Screen name="mypage" />
            <Tabs.Screen name="compose" />
          </Tabs>
        </View>

        {/* 右チャットエリア：右端に固定幅で配置 */}
        {showTwoCol && (
          <View style={{ width: 480, borderLeftWidth: 1, borderLeftColor: Colors.border, overflow: 'hidden' }}>
            {selectedDmId
              ? <IMChatPanel
                  partnerId={selectedDmId}
                  isPanel
                  onClose={() => setSelectedDmId(null)}
                />
              : selectedTalkId
              ? <TalkDetailPanel
                  creatorId={selectedTalkId}
                  onClose={() => setSelectedTalkId(null)}
                />
              : <TalkEmptyPanel />
            }
          </View>
        )}

      </View>
    </TalkContext.Provider>
  )
}

// ── スタイル ─────────────────────────────────────────────────
const sidebar = StyleSheet.create({
  wrap: {
    width: SIDEBAR_W,
    backgroundColor: Colors.header,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 16,
    gap: 4,
  },
  item: {
    width: SIDEBAR_W - 8,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 3,
    borderRadius: 10,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
  },
  composeBtn: {
    marginTop: 12,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
})

const emptyPanel = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  text: {
    fontSize: 15,
    color: Colors.textLight,
    fontWeight: '500',
  },
})

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.main,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 8,
  },
  tabGroup: { flex: 1, flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 3 },
  tabLabel: { fontSize: 10, fontWeight: '600' },
  centerButton: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 12,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
})
