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
import * as Device from 'expo-device'
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
// ネイティブ(iOS/Android)では expo-device の modelName を使う（例: "iPhone 15 Pro"）
// Web では UserAgent を解析してブラウザ/OSを返す（例: "Chrome / Windows"）
export function getDeviceName(): string {
  // ── ネイティブアプリ（iOS / Android） ──
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    // Device.modelName: "iPhone 15 Pro", "Pixel 8", "iPad Air (5th generation)" など
    if (Device.modelName) return Device.modelName
    // フォールバック: OS名とバージョン
    const os = Platform.OS === 'ios' ? 'iPhone' : 'Android'
    return Device.osVersion ? `${os} ${Device.osVersion}` : os
  }

  // ── Web ──
  if (typeof navigator === 'undefined') return 'Web'
  const ua = navigator.userAgent

  // モバイルWebの場合もモデル名を試みる
  if (ua.includes('iPhone')) {
    // iOSバージョンからモデルを推定してブラウザ名を付ける
    const match = ua.match(/iPhone OS (\d+)_/)
    const major = match ? parseInt(match[1], 10) : 0
    let model = 'iPhone'
    if (major >= 19) model = 'iPhone 17'
    else if (major === 18) model = 'iPhone 16'
    else if (major === 17) model = 'iPhone 15'
    else if (major === 16) model = 'iPhone 14'
    else if (major === 15) model = 'iPhone 13'
    else if (major === 14) model = 'iPhone 12'
    // ブラウザも付ける（Safari / Chrome on iOS など）
    let browser = 'Safari'
    if (ua.includes('CriOS')) browser = 'Chrome'
    else if (ua.includes('FxiOS')) browser = 'Firefox'
    return `${model} / ${browser}`
  }
  if (ua.includes('iPad')) return 'iPad'
  if (ua.includes('Android')) {
    // Android の機種名（例: SM-G991B → "Samsung Galaxy S21"）
    const m = ua.match(/Android [^;]+;\s*([^)]+)\)/)
    if (m) return m[1].trim()
    return 'Android'
  }

  // デスクトップブラウザ
  let browser = 'ブラウザ'
  if      (ua.includes('Edg'))                               browser = 'Edge'
  else if (ua.includes('Chrome') && !ua.includes('Edg'))     browser = 'Chrome'
  else if (ua.includes('Firefox'))                            browser = 'Firefox'
  else if (ua.includes('Safari') && !ua.includes('Chrome'))  browser = 'Safari'
  let os = 'PC'
  if      (ua.includes('Windows'))  os = 'Windows'
  else if (ua.includes('Mac'))      os = 'Mac'
  else if (ua.includes('Linux'))    os = 'Linux'
  return `${browser} / ${os}`
}

// ─── IPジオロケーションで現在地を取得 ──────────────────────────────────────────
// ipapi.co の無料APIを使って「都市名, 国コード」を返す（例: "Tokyo, JP"）
// 失敗・タイムアウト時は null を返す
export async function getLocation(): Promise<string | null> {
  try {
    // AbortSignal.timeout は古いブラウザで未対応のため Promise.race でタイムアウト実装
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const res = await fetch('https://ipapi.co/json/', { signal: controller.signal })
      .finally(() => clearTimeout(timer))
    if (!res.ok) return null
    const data = await res.json()
    const city    = data.city    ?? ''
    const country = data.country ?? ''
    return [city, country].filter(Boolean).join(', ') || null
  } catch {
    return null
  }
}

// ─── セッション登録・更新 ──────────────────────────────────────────────────────
// 戻り値: 'approved'（常に通常画面へ）— 承認フローは無効化済み
export async function upsertDeviceSession(userId: string): Promise<DeviceStatus> {
  const deviceKey  = await getDeviceKey()
  const deviceName = getDeviceName()
  const platform   = Platform.OS

  // 既存セッションがあれば last_seen を更新して現在ステータスを返す
  const { data: existing } = await supabase
    .from('device_sessions')
    .select('id, status')
    .eq('user_id', userId)
    .eq('device_key', deviceKey)
    .maybeSingle()

  if (existing) {
    await supabase.from('device_sessions')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', existing.id)
    return 'approved'
  }

  // 新規端末 — 承認フローなしで即 approved として登録
  // ロケーション取得（失敗しても登録は続行）
  const location = await getLocation().catch(() => null)

  const { error } = await supabase.from('device_sessions').insert({
    user_id:     userId,
    device_key:  deviceKey,
    device_name: deviceName,
    platform,
    last_seen:   new Date().toISOString(),
    status:      'approved',
    is_host:     false,
    location:    location ?? null,
  })

  if (error) {
    console.error('[deviceSession] insert error:', error.message, error.details)
  }

  return 'approved'
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
