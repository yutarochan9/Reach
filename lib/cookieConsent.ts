import { Platform } from 'react-native'

const STORAGE_KEY = 'reach_cookie_consent'

export type ConsentStatus = 'accepted' | 'declined' | null

export function getConsent(): ConsentStatus {
  if (Platform.OS !== 'web') return 'accepted'
  try {
    return (localStorage.getItem(STORAGE_KEY) as ConsentStatus) ?? null
  } catch {
    return null
  }
}

export function setConsent(status: 'accepted' | 'declined') {
  if (Platform.OS !== 'web') return
  try {
    localStorage.setItem(STORAGE_KEY, status)
    // カスタムイベントで他のモジュールに通知
    window.dispatchEvent(new CustomEvent('cookieConsentChanged', { detail: status }))
  } catch {}
}

export function isAnalyticsEnabled(): boolean {
  return getConsent() === 'accepted'
}
