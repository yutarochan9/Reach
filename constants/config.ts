// ベータ期間中は true にして全機能を無料開放。終了時に false に戻す。
export const BETA_MODE = true

// ベータテスト用パスワードゲート
// このパスワードを知っている人だけがアプリを使える
// 正式リリース時は BETA_GATE = false にして無効化する
export const BETA_GATE = true
export const BETA_PASSWORD = 'reach2026'

// メンテナンスフラグ
// true にすると管理者以外はメンテナンス画面のみ表示（パスワード入力もなし）
// ベータテスト中に問題が起きたときに即座にアクセスを止められる
export const MAINTENANCE_MODE = false
export const ADMIN_USER_ID = '37cdff89-f955-48d9-8412-35221b3e6244' // 管理者のユーザーID
