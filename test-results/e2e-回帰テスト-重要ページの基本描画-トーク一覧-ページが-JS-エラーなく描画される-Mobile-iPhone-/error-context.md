# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e.spec.ts >> 回帰テスト: 重要ページの基本描画 >> トーク一覧 ページが JS エラーなく描画される
- Location: __tests__\e2e.spec.ts:99:9

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: Test timeout of 30000ms exceeded.
Call log:
  - navigating to "https://reachapp.jp/", waiting until "load"

```

# Test source

```ts
  3   |  * Playwright で https://reachapp.jp に対して実行
  4   |  */
  5   | import { test, expect, Page } from '@playwright/test'
  6   | 
  7   | const BASE = 'https://reachapp.jp'
  8   | 
  9   | // ── ヘルパー ──────────────────────────────────────────────────────────────
  10  | async function waitForApp(page: Page) {
  11  |   await page.waitForLoadState('networkidle', { timeout: 15000 })
  12  | }
  13  | 
  14  | // ── システムテスト: ページ疎通確認 ─────────────────────────────────────────
  15  | test.describe('システムテスト: 主要ページの疎通', () => {
  16  |   test('トップ / ログインページが 200 で返る', async ({ page }) => {
  17  |     const res = await page.goto(BASE)
  18  |     expect(res?.status()).toBeLessThan(400)
  19  |     await waitForApp(page)
  20  |   })
  21  | 
  22  |   test('利用規約ページが表示される', async ({ page }) => {
  23  |     await page.goto(`${BASE}/terms`)
  24  |     await waitForApp(page)
  25  |     const text = await page.textContent('body')
  26  |     expect(text).toMatch(/利用規約|Terms/)
  27  |   })
  28  | 
  29  |   test('特定商取引法ページが表示される', async ({ page }) => {
  30  |     await page.goto(`${BASE}/tokutei`)
  31  |     await waitForApp(page)
  32  |     const text = await page.textContent('body')
  33  |     expect(text).toMatch(/特定商取引|販売業者/)
  34  |   })
  35  | 
  36  |   test('存在しないページは 404 相当の表示またはリダイレクト', async ({ page }) => {
  37  |     await page.goto(`${BASE}/nonexistent-page-xyz-12345`)
  38  |     await waitForApp(page)
  39  |     // SPA なのでステータスより UI で判断
  40  |     const text = await page.textContent('body')
  41  |     expect(text?.length).toBeGreaterThan(0)
  42  |   })
  43  | })
  44  | 
  45  | // ── E2Eテスト: ログインフロー ─────────────────────────────────────────────
  46  | test.describe('E2E: ログイン画面', () => {
  47  |   test('ログイン画面が表示される', async ({ page }) => {
  48  |     await page.goto(`${BASE}/(auth)/login`)
  49  |     await waitForApp(page)
  50  |     const body = await page.textContent('body')
  51  |     // ログインフォームかトーク画面のいずれか（既ログインの場合はリダイレクト）
  52  |     expect(body).toBeTruthy()
  53  |   })
  54  | 
  55  |   test('メールアドレス入力欄が存在する', async ({ page }) => {
  56  |     await page.goto(`${BASE}/(auth)/login`)
  57  |     await waitForApp(page)
  58  |     // input[type=email] または placeholder にメールを含む入力欄
  59  |     const emailInput = page.locator('input[type="email"], input[placeholder*="メール"], input[placeholder*="mail"]').first()
  60  |     const count = await emailInput.count()
  61  |     // ログイン済みでリダイレクトされている場合はスキップ
  62  |     if (count > 0) {
  63  |       await expect(emailInput).toBeVisible()
  64  |     }
  65  |   })
  66  | })
  67  | 
  68  | // ── E2Eテスト: プロフィールページ ────────────────────────────────────────
  69  | test.describe('E2E: クリエイタープロフィール', () => {
  70  |   test('プロフィールページが読み込まれる（ダミーID）', async ({ page }) => {
  71  |     // 存在しないIDはエラー表示になるが、クラッシュしないことを確認
  72  |     await page.goto(`${BASE}/creator/00000000-0000-0000-0000-000000000000`)
  73  |     await waitForApp(page)
  74  |     const body = await page.textContent('body')
  75  |     expect(body?.length).toBeGreaterThan(10)
  76  |   })
  77  | })
  78  | 
  79  | // ── E2Eテスト: メンバーシップページ鍵垢ガード ────────────────────────────
  80  | test.describe('E2E: メンバーシップ鍵垢ガード', () => {
  81  |   test('未ログインでメンバーシップページにアクセスするとガードされる', async ({ page }) => {
  82  |     await page.goto(`${BASE}/membership/00000000-0000-0000-0000-000000000000`)
  83  |     await waitForApp(page)
  84  |     const body = await page.textContent('body')
  85  |     // 非公開・ガード・またはローディングのいずれか
  86  |     expect(body?.length).toBeGreaterThan(0)
  87  |   })
  88  | })
  89  | 
  90  | // ── 回帰テスト: 以前バグがあった箇所の確認 ────────────────────────────────
  91  | test.describe('回帰テスト: 重要ページの基本描画', () => {
  92  |   const pages = [
  93  |     { path: '/', name: 'トーク一覧' },
  94  |     { path: '/terms', name: '利用規約' },
  95  |     { path: '/tokutei', name: '特定商取引法' },
  96  |   ]
  97  | 
  98  |   for (const { path, name } of pages) {
  99  |     test(`${name} ページが JS エラーなく描画される`, async ({ page }) => {
  100 |       const jsErrors: string[] = []
  101 |       page.on('pageerror', err => jsErrors.push(err.message))
  102 | 
> 103 |       await page.goto(`${BASE}${path}`)
      |                  ^ Error: page.goto: Test timeout of 30000ms exceeded.
  104 |       await waitForApp(page)
  105 | 
  106 |       // 致命的な JS エラーがないことを確認
  107 |       const fatalErrors = jsErrors.filter(e =>
  108 |         !e.includes('ResizeObserver') && // ブラウザ固有の無害なエラー
  109 |         !e.includes('Non-Error promise rejection')
  110 |       )
  111 |       expect(fatalErrors).toHaveLength(0)
  112 |     })
  113 |   }
  114 | })
  115 | 
```