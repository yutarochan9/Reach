import { View } from 'react-native'

/**
 * デフォルトアバター（プロフィール画像未設定時に表示）
 * ベージュ背景＋グレーのシルエット（頭＋肩）で統一
 */
export default function DefaultAvatar({ size = 48, style }: { size?: number; style?: any }) {
  const bg = '#EDE5D8'       // ベージュ背景
  const fg = '#A0897A'       // グレーブラウン（シルエット色）

  const headSize  = size * 0.38
  const bodySize  = size * 0.68

  return (
    <View style={[{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: bg,
      overflow: 'hidden',
      alignItems: 'center',
    }, style]}>
      {/* 頭 */}
      <View style={{
        width: headSize, height: headSize, borderRadius: headSize / 2,
        backgroundColor: fg,
        marginTop: size * 0.20,
      }} />
      {/* 肩・体（大きい円を下からはみ出させてクリップ）*/}
      <View style={{
        width: bodySize, height: bodySize, borderRadius: bodySize / 2,
        backgroundColor: fg,
        marginTop: size * 0.06,
      }} />
    </View>
  )
}
