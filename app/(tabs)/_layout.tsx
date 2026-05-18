import { Tabs, router } from 'expo-router'
import { Colors } from '../../constants/colors'
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const tabs = state.routes.map((route, index) => {
    const { options } = descriptors[route.key]
    const focused = state.index === index

    type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

    const iconMap: Record<string, { active: IoniconsName; inactive: IoniconsName; label: string }> = {
      index:  { active: 'home',         inactive: 'home-outline',         label: 'ホーム' },
      talk:   { active: 'chatbubble',   inactive: 'chatbubble-outline',   label: 'トーク' },
      shop:   { active: 'compass',      inactive: 'compass-outline',      label: '発見' },
      mypage: { active: 'person',       inactive: 'person-outline',       label: 'マイページ' },
    }

    const icon = iconMap[route.name]
    if (!icon) return null

    return (
      <TouchableOpacity
        key={route.key}
        style={styles.tab}
        onPress={() => navigation.navigate(route.name)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={focused ? icon.active : icon.inactive}
          size={24}
          color={focused ? Colors.accent : Colors.textLight}
        />
        <Text style={[styles.tabLabel, { color: focused ? Colors.accent : Colors.textLight }]}>
          {icon.label}
        </Text>
      </TouchableOpacity>
    )
  })

  const left = tabs.slice(0, 2)
  const right = tabs.slice(2)

  return (
    <View style={styles.tabBar}>
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
          if ((count ?? 0) === 0) {
            router.push('/broadcast-intro')
          } else {
            router.push('/compose')
          }
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>

      <View style={styles.tabGroup}>{right}</View>
    </View>
  )
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="talk" />
      <Tabs.Screen name="shop" />
      <Tabs.Screen name="mypage" />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.main,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    height: Platform.OS === 'ios' ? 84 : 64,
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
    paddingHorizontal: 8,
  },
  tabGroup: {
    flex: 1,
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  centerButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 12,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
})
