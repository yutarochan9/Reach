/**
 * IAP（App内課金）ヘルパー — iOS / Android ネイティブ実装
 * Metro バンドラーは .native.ts を優先するため、
 * iOS/Android ビルドではこちらが使われる。
 * Web ビルドでは lib/iap.ts（スタブ）が使われる。
 */
import * as RNIap from 'react-native-iap'
import { supabase } from './supabase'

// ── プロダクトID（iap.ts と同一） ────────────────────────────
export const IAP_SKUS = {
  PLAN_STANDARD: 'reach_plan_standard_monthly',
  PLAN_PRO:      'reach_plan_pro_monthly',
  SUPPORT_1000:   'reach_support_1000',
  SUPPORT_10000:  'reach_support_10000',
  SUPPORT_100000: 'reach_support_100000',
  MEMBERSHIP_100:  'reach_membership_100',
  MEMBERSHIP_300:  'reach_membership_300',
  MEMBERSHIP_500:  'reach_membership_500',
  MEMBERSHIP_1000: 'reach_membership_1000',
  MEMBERSHIP_2000: 'reach_membership_2000',
  MEMBERSHIP_3000: 'reach_membership_3000',
  MEMBERSHIP_5000: 'reach_membership_5000',
} as const

export function getMembershipSku(price: number): string {
  const tiers = [100, 300, 500, 1000, 2000, 3000, 5000]
  const closest = tiers.reduce((prev, curr) =>
    Math.abs(curr - price) < Math.abs(prev - price) ? curr : prev
  )
  return `reach_membership_${closest}`
}

export const IS_NATIVE = true

/** App Store / Google Play への接続を開始 */
export async function initIAP(): Promise<void> {
  await RNIap.initConnection()
}

/** 接続を終了（画面離脱時に呼ぶ） */
export async function endIAP(): Promise<void> {
  await RNIap.endConnection()
}

/**
 * プラン購入（自動更新サブスクリプション）
 * 購入完了はRNIapのpurchaseUpdatedListenerで受け取る
 * TODO: Supabase Edge Function でレシート検証 + プラン更新
 */
export async function purchasePlanIAP(sku: string): Promise<void> {
  await RNIap.requestSubscription({ sku })
}

/**
 * 開発応援購入（消耗型）
 * TODO: 購入後 support_payments テーブルに記録
 */
export async function purchaseSupportIAP(sku: string): Promise<void> {
  await RNIap.requestPurchase({ sku })
}

/**
 * メンバーシップ購入（消耗型）
 * 購入後 subscriptions テーブルに記録する
 * TODO: サーバーサイドでレシート検証を行う
 */
export async function purchaseMembershipIAP(
  sku: string,
  subscriberId: string,
  creatorId: string,
): Promise<void> {
  await RNIap.requestPurchase({ sku })
  // 購入完了後にDBへ記録（本番ではレシート検証をサーバーで行うこと）
  await supabase.from('subscriptions').insert({
    subscriber_id: subscriberId,
    creator_id: creatorId,
    status: 'active',
  })
}
