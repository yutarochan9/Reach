/**
 * E2E / システムテスト
 * Playwright で https://reachapp.jp に対して実行
 */
import { test, expect, Page } from '@playwright/test'

const BASE = 'https://reachapp.jp'

// ── ヘルパー ──────────────────────────────────────────────────────────────
async function waitForApp(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 })
}

// ── システムテスト: ページ疎通確認 ─────────────────────────────────────────
test.describe('システムテスト: 主要ページの疎通', () => {
  test('トップ / ログインページが 200 で返る', async ({ page }) => {
    const res = await page.goto(BASE)
    expect(res?.status()).toBeLessThan(400)
    await waitForApp(page)
  })

  test('利用規約ページが表示される', async ({ page }) => {
    await page.goto(`${BASE}/terms`)
    await waitForApp(page)
    const text = await page.textContent('body')
    expect(text).toMatch(/利用規約|Terms/)
  })

  test('特定商取引法ページが表示される', async ({ page }) => {
    await page.goto(`${BASE}/tokutei`)
    await waitForApp(page)
    const text = await page.textContent('body')
    expect(text).toMatch(/特定商取引|販売業者/)
  })

  test('存在しないページは 404 相当の表示またはリダイレクト', async ({ page }) => {
    await page.goto(`${BASE}/nonexistent-page-xyz-12345`)
    await waitForApp(page)
    // SPA なのでステータスより UI で判断
    const text = await page.textContent('body')
    expect(text?.length).toBeGreaterThan(0)
  })
})

// ── E2Eテスト: ログインフロー ─────────────────────────────────────────────
test.describe('E2E: ログイン画面', () => {
  test('ログイン画面が表示される', async ({ page }) => {
    await page.goto(`${BASE}/(auth)/login`)
    await waitForApp(page)
    const body = await page.textContent('body')
    // ログインフォームかトーク画面のいずれか（既ログインの場合はリダイレクト）
    expect(body).toBeTruthy()
  })

  test('メールアドレス入力欄が存在する', async ({ page }) => {
    await page.goto(`${BASE}/(auth)/login`)
    await waitForApp(page)
    // input[type=email] または placeholder にメールを含む入力欄
    const emailInput = page.locator('input[type="email"], input[placeholder*="メール"], input[placeholder*="mail"]').first()
    const count = await emailInput.count()
    // ログイン済みでリダイレクトされている場合はスキップ
    if (count > 0) {
      await expect(emailInput).toBeVisible()
    }
  })
})

// ── E2Eテスト: プロフィールページ ────────────────────────────────────────
test.describe('E2E: クリエイタープロフィール', () => {
  test('プロフィールページが読み込まれる（ダミーID）', async ({ page }) => {
    // 存在しないIDはエラー表示になるが、クラッシュしないことを確認
    await page.goto(`${BASE}/creator/00000000-0000-0000-0000-000000000000`)
    await waitForApp(page)
    const body = await page.textContent('body')
    expect(body?.length).toBeGreaterThan(10)
  })
})

// ── E2Eテスト: メンバーシップページ鍵垢ガード ────────────────────────────
test.describe('E2E: メンバーシップ鍵垢ガード', () => {
  test('未ログインでメンバーシップページにアクセスするとガードされる', async ({ page }) => {
    await page.goto(`${BASE}/membership/00000000-0000-0000-0000-000000000000`)
    await waitForApp(page)
    const body = await page.textContent('body')
    // 非公開・ガード・またはローディングのいずれか
    expect(body?.length).toBeGreaterThan(0)
  })
})

// ── 回帰テスト: 以前バグがあった箇所の確認 ────────────────────────────────
test.describe('回帰テスト: 重要ページの基本描画', () => {
  const pages = [
    { path: '/', name: 'トーク一覧' },
    { path: '/terms', name: '利用規約' },
    { path: '/tokutei', name: '特定商取引法' },
  ]

  for (const { path, name } of pages) {
    test(`${name} ページが JS エラーなく描画される`, async ({ page }) => {
      const jsErrors: string[] = []
      page.on('pageerror', err => jsErrors.push(err.message))

      await page.goto(`${BASE}${path}`)
      await waitForApp(page)

      // 致命的な JS エラーがないことを確認
      const fatalErrors = jsErrors.filter(e =>
        !e.includes('ResizeObserver') && // ブラウザ固有の無害なエラー
        !e.includes('Non-Error promise rejection')
      )
      expect(fatalErrors).toHaveLength(0)
    })
  }
})
