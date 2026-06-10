import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export async function registerPushToken() {
  if (!Device.isDevice) return
  if (Platform.OS === 'web') return

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== 'granted') return

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    })
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId
  const token = (await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  )).data
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await supabase.from('profiles').update({ push_token: token }).eq('id', user.id)
  }
}

// 通知種別 → 設定キーのマッピング
type NotifSettingKey =
  | 'messages'       // DM受信
  | 'new_broadcast'  // 配信新着
  | 'reactions'      // いいね
  | 'comments'       // コメント
  | 'follows'        // フォロー
  | 'follow_request' // フォローリクエスト
  | 'membership'     // メンバーシップ加入・退会

// 現在時刻（JST）がおやすみ時間帯かどうか判定
function isInQuietHours(start: string, end: string): boolean {
  const now = new Date()
  const jstH = (now.getUTCHours() + 9) % 24
  const jstM = now.getUTCMinutes()
  const cur = `${String(jstH).padStart(2, '0')}:${String(jstM).padStart(2, '0')}`
  // 日をまたぐ場合（例: 22:00〜08:00）も考慮
  return start <= end ? (cur >= start && cur < end) : (cur >= start || cur < end)
}

/**
 * 指定ユーザーにプッシュ通知を送る
 * @param userIds    送信先ユーザーIDリスト
 * @param title      通知タイトル
 * @param body       通知本文
 * @param data       タップ時のナビゲーション用データ
 * @param notifType  通知種別（ユーザー設定でOFFなら送らない）
 */
export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data: Record<string, any> = {},
  notifType?: NotifSettingKey,
) {
  if (userIds.length === 0) return

  const { data: profiles } = await supabase
    .from('profiles')
    .select('push_token, notification_settings')
    .in('id', userIds)
    .not('push_token', 'is', null)

  const tokens = (profiles ?? [])
    .filter((p: any) => {
      const s: Record<string, any> = p.notification_settings ?? {}
      // 通知種別がOFFなら除外
      if (notifType && s[notifType] === false) return false
      // おやすみモード中なら除外
      if (s.quiet_hours_enabled) {
        const start = s.quiet_hours_start ?? '22:00'
        const end   = s.quiet_hours_end   ?? '08:00'
        if (isInQuietHours(start, end)) return false
      }
      return true
    })
    .map((p: any) => p.push_token)
    .filter(Boolean)

  if (tokens.length === 0) return

  const messages = tokens.map((token: string) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data,
  }))

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  })
}
