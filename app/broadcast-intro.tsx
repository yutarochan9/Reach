import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/colors'

export default function BroadcastIntroScreen() {
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/home' as any)} style={styles.closeButton}>
        <Ionicons name="close" size={24} color={Colors.textLight} />
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="radio" size={56} color={Colors.white} />
        </View>

        <Text style={styles.title}>Reachで配信しよう</Text>
        <Text style={styles.subtitle}>フォロワー全員に、あなたのメッセージが届きます</Text>

        <View style={styles.featureList}>
          <FeatureItem
            icon="people-outline"
            title="全フォロワーに一斉配信"
            desc="送ったメッセージはフォロワー全員のトーク画面に届きます"
          />
          <FeatureItem
            icon="chatbubble-outline"
            title="個別のDMも受け取れる"
            desc="フォロワーからの返信はあなただけに届きます"
          />
          <FeatureItem
            icon="lock-closed-outline"
            title="プライベートな配信"
            desc="フォロワー以外には公開されません"
          />
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.startButton}
          onPress={() => router.replace('/compose')}
        >
          <Text style={styles.startText}>はじめての配信へ</Text>
          <Ionicons name="arrow-forward" size={18} color={Colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

function FeatureItem({ icon, title, desc }: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  title: string
  desc: string
}) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={22} color={Colors.accent} />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    padding: 4,
  },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.text, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: Colors.textLight, textAlign: 'center', lineHeight: 21, marginBottom: 36 },
  featureList: { width: '100%', gap: 20 },
  feature: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  featureText: { flex: 1 },
  featureTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 3 },
  featureDesc: { fontSize: 13, color: Colors.textLight, lineHeight: 19 },
  footer: { padding: 24, paddingBottom: 40 },
  startButton: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  startText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
})
