/**
 * テスト用アカウントのUUID一覧
 * 分析・管理画面・発見画面などから除外するために使用する
 *
 * 新しいテストアカウントを追加した場合はここに追記する
 */
export const TEST_ACCOUNT_IDS = [
  'd192aa4c-3821-40b3-9cf6-d3645d431e77', // 運営テスト
  '0075e766-2e0f-4b62-8c0b-5a7cf012ef9a', // 配信者テスト
  'bbee0474-9e54-4fac-8842-d1f5a9a62646', // 受信者テスト
] as const

/** Supabase の .not('col', 'in', ...) に渡す形式 */
export const TEST_IDS_CSV = `(${TEST_ACCOUNT_IDS.join(',')})`
