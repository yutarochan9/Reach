import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { Colors } from '../constants/colors'

// 存在しないルートにアクセスした場合、ホームへリダイレクト
export default function NotFoundScreen() {
  useEffect(() => {
    // 過去のバグで生成された /(tabs)/home などの無効URLを含む
    // ブラウザ履歴を踏んだ場合も含めてホームへ戻す
    const timer = setTimeout(() => {
      router.replace('/(tabs)/' as any)
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  )
}
