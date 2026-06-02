/**
 * IAP（App内課金）ヘルパー — Web スタブ
 * iOS/Android では lib/iap.native.ts が優先的に使われる。
 * Web ビルドではこのファイルが使われ、IAP は無効。
 */

// ── App Store Connect / Google Play Console に登録するプロダクトID ──
export const IAP_SKUS = {
  // プラン（自動更新サブスクリプション）
  PLAN_STANDARD: 'reach_plan_standard_monthly',
  PLAN_PRO:      'reach_plan_pro_monthly',

  // 開発応援（消耗型）
  SUPPORT_1000:   'reach_support_1000',
  SUPPORT_10000:  'reach_support_10000',
  SUPPORT_100000: 'reach_support_100000',

  // メンバーシップ価格ティア（消耗型）
  MEMBERSHIP_100:  'reach_membership_100',
  MEMBERSHIP_300:  'reach_membership_300',
  MEMBERSHIP_500:  'reach_membership_500',
  MEMBERSHIP_1000: 'reach_membership_1000',
  MEMBERSHIP_2000: 'reach_membership_2000',
  MEMBERSHIP_3000: 'reach_membership_3000',
  MEMBERSHIP_5000: 'reach_membership_5000',
} as const

/** クリエイターの月額料金を最寄りのIAPティアSKUに変換 */
export function getMembershipSku(price: number): string {
  const tiers = [100, 300, 500, 1000, 2000, 3000, 5000]
  const closest = tiers.reduce((prev, curr) =>
    Math.abs(curr - price) < Math.abs(prev - price) ? curr : prev
  )
  return `reach_membership_${closest}`
}

/** IAP が使えるプラットフォームか（Web では false） */
export const IS_NATIVE = false

/** IAP 接続を初期化（Web: no-op） */
export async function initIAP(): Promise<void> {}

/** IAP 接続を終了（Web: no-op） */
export async function endIAP(): Promise<void> {}

/**
 * プランのサブスクリプション購入（Web では使用不可）
 * iOS では App Store のサブスクリプション購入シートを表示する
 */
export async function purchasePlanIAP(_sku: string): Promise<void> {
  throw new Error('IAP はネイティブアプリでのみ利用できます')
}

/**
 * 応援（消耗型）購入（Web では使用不可）
 * iOS では App Store の購入シートを表示する
 */
export async function purchaseSupportIAP(_sku: string): Promise<void> {
  throw new Error('IAP はネイティブアプリでのみ利用できます')
}

/**
 * メンバーシップ（消耗型）購入（Web では使用不可）
 * iOS では App Store の購入シートを表示する
 */
export async function purchaseMembershipIAP(_sku: string): Promise<void> {
  throw new Error('IAP はネイティブアプリでのみ利用できます')
}
