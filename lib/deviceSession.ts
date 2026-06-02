/**
 * deviceSession.ts
 * 複数端末ログイン管理ユーティリティ。
 *
 * ホスト/承認フロー:
 *   - 最初に登録された端末が「ホスト」(is_host=true, status='approved')
 *   - 2台目以降は「pending」として登録され、ホスト端末の承認が必要
 *   - ホストがログアウトした場合は次の approved 端末が自動昇格
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { supabase } from './supabase'
import { sendPushToUsers } from './notifications'

const DEVICE_KEY_STORAGE = 'reach_device_key'

export type DeviceStatus = 'approved' | 'pending' | 'denied'

// ─── 端末固有キーの生成・取得 ──────────────────────────────────────────────────
export async function getDeviceKey(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(DEVICE_KEY_STORAGE)
    if (stored) return stored
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    await AsyncStorage.setItem(DEVICE_KEY_STORAGE, key)
    return key
  } catch {
    return `fallback-${Date.now()}`
  }
}

// ─── 人間が読みやすいデバイス名 ───────────────────────────────────────────────
export function getDeviceName(): string {
  if (Platform.OS === 'ios')     return 'iPhone / iPad'
  if (Platform.OS === 'android') return 'Android'
  if (typeof navigator === 'undefined') return 'Web'
  const ua = navigator.userAgent
  let browser = 'ブラウザ'
  if      (ua.includes('Edg'))                                    browser = 'Edge'
  else if (ua.includes('Chrome') && !ua.includes('Edg'))          browser = 'Chrome'
  else if (ua.includes('Firefox'))                                 browser = 'Firefox'
  else if (ua.includes('Safari') && !ua.includes('Chrome'))        browser = 'Safari'
  let os = 'PC'
  if      (ua.includes('iPhone') || ua.includes('iPad'))           os = 'iOS'
  else if (ua.includes('Android'))                                  os = 'Android'
  else if (ua.includes('Windows'))                                  os = 'Windows'
  else if (ua.includes('Mac'))                                      os = 'Mac'
  else if (ua.includes('Linux'))                                    os = 'Linux'
  return `${browser} / ${os}`
}

// ─── セッション登録・更新 ──────────────────────────────────────────────────────
// 戻り値:
//   'approved' → そのまま通常画面へ
//   'pending'  → /device-pending 画面で承認待ち
export async function upsertDeviceSession(userId: string): Promise<DeviceStatus> {
  const deviceKey  = await getDeviceKey()
  const deviceName = getDeviceName()
  const platform   = Platform.OS

  // 既存セッションがあれば last_seen を更新して現在ステータスを返す
  const { data: existing } = await supabase
    .from('device_sessions')
    .select('id, status, is_host')
    .eq('user_id', userId)
    .eq('device_key', deviceKey)
    .maybeSingle()

  if (existing) {
    await supabase.from('device_sessions')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', existing.id)
    return existing.status as DeviceStatus
  }

  // 新規端末 — 承認済みセッションが1件でもあればホスト承認が必要
  const { count } = await supabase
    .from('device_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'approved')

  const isFirstDevice = (count ?? 0) === 0
  const status: DeviceStatus = isFirstDevice ? 'approved' : 'pending'

  await supabase.from('device_sessions').insert({
    user_id:     userId,
    device_key:  deviceKey,
    device_name: deviceName,
    platform,
    last_seen:   new Date().toISOString(),
    status,
    is_host:     isFirstDevice,
  })

  // 新規端末が pending の場合はホスト端末（同ユーザーの全端末）に通知
  if (!isFirstDevice) {
    sendPushToUsers(
      [userId],
      '新しいデバイスのログイン申請',
      `「${deviceName}」からのログイン申請があります。設定画面で承認してください。`
    ).catch(() => {})
  }

  return status
}

// ─── 現在のデバイスのステータスを取得 ────────────────────────────────────────
// null → セッション行が存在しない（リモートログアウト済み）
export async function getDeviceSessionStatus(userId: string): Promise<DeviceStatus | null> {
  try {
    const deviceKey = await getDeviceKey()
    const { data } = await supabase
      .from('device_sessions')
      .select('status')
      .eq('user_id', userId)
      .eq('device_key', deviceKey)
      .maybeSingle()
    return data ? (data.status as DeviceStatus) : null
  } catch {
    return 'approved' // ネットワーク障害時はサインアウトしない
  }
}

// ─── ホスト昇格 ───────────────────────────────────────────────────────────────
// ホスト端末がログアウトしたとき、次の approved 端末を自動的にホストに昇格させる。
export async function promoteNewHost(userId: string, loggedOutDeviceKey: string): Promise<void> {
  const { data: next } = await supabase
    .from('device_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .neq('device_key', loggedOutDeviceKey)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (next) {
    await supabase.from('device_sessions')
      .update({ is_host: true })
      .eq('id', next.id)
  }
}
