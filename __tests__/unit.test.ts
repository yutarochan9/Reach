/**
 * 単体テスト
 * ユーティリティ関数・ロジックの純粋な振る舞いを検証
 */

// ── genId / genUUID ────────────────────────────────────────────────────────
function genId() { return Math.random().toString(36).slice(2) }
function genUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

describe('genId', () => {
  it('空でない文字列を返す', () => {
    expect(genId().length).toBeGreaterThan(0)
  })
  it('呼び出すたびに異なる値を返す', () => {
    expect(genId()).not.toBe(genId())
  })
})

describe('genUUID', () => {
  it('UUID v4 形式（xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx）を返す', () => {
    expect(genUUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
  it('呼び出すたびに異なる値を返す', () => {
    expect(genUUID()).not.toBe(genUUID())
  })
})

// ── parseScheduledAt ───────────────────────────────────────────────────────
function parseScheduledAt(scheduledAt: string): Date | null {
  if (!scheduledAt.trim()) return null
  const m = scheduledAt.trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  if (isNaN(d.getTime())) return null
  if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3] || d.getHours() !== +m[4] || d.getMinutes() !== +m[5]) return null
  return d
}

describe('parseScheduledAt', () => {
  it('空文字列は null を返す', () => {
    expect(parseScheduledAt('')).toBeNull()
  })
  it('スラッシュ区切りを正しくパース', () => {
    const d = parseScheduledAt('2026/12/25 09:00')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(11) // 0-indexed
    expect(d!.getDate()).toBe(25)
    expect(d!.getHours()).toBe(9)
  })
  it('ハイフン区切りも受け付ける', () => {
    expect(parseScheduledAt('2026-06-15 14:30')).not.toBeNull()
  })
  it('不正な形式は null を返す', () => {
    expect(parseScheduledAt('2026/13/45 99:99')).toBeNull()
    expect(parseScheduledAt('あいうえお')).toBeNull()
    expect(parseScheduledAt('2026/06/01')).toBeNull() // 時刻なし
  })
})

// ── formatTime ────────────────────────────────────────────────────────────
function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  if (diffDays === 1) return '昨日'
  return `${d.getMonth() + 1}/${d.getDate()}`
}

describe('formatTime', () => {
  it('今日の時刻は HH:MM 形式で返す', () => {
    const now = new Date()
    const result = formatTime(now.toISOString())
    expect(result).toMatch(/^\d{2}:\d{2}$/)
  })
  it('昨日の時刻は「昨日」を返す', () => {
    const yesterday = new Date(Date.now() - 86400000 * 1.5)
    expect(formatTime(yesterday.toISOString())).toBe('昨日')
  })
  it('2日以上前は M/D 形式で返す', () => {
    const old = new Date(Date.now() - 86400000 * 5)
    const result = formatTime(old.toISOString())
    expect(result).toMatch(/^\d{1,2}\/\d{1,2}$/)
  })
})

// ── parseBenefitStr ────────────────────────────────────────────────────────
function parseBenefitStr(s: string, fallbackIcon: string) {
  const sepIdx = s.indexOf('|')
  if (sepIdx > 0) return { icon: s.slice(0, sepIdx), title: s.slice(sepIdx + 1) }
  return { icon: fallbackIcon, title: s }
}

describe('parseBenefitStr', () => {
  it('パイプ区切りの場合アイコンとタイトルを分離', () => {
    const result = parseBenefitStr('star-outline|限定配信へのアクセス', 'default-icon')
    expect(result.icon).toBe('star-outline')
    expect(result.title).toBe('限定配信へのアクセス')
  })
  it('パイプなしの場合はフォールバックアイコンを使用', () => {
    const result = parseBenefitStr('テキストのみ', 'lock-closed-outline')
    expect(result.icon).toBe('lock-closed-outline')
    expect(result.title).toBe('テキストのみ')
  })
  it('先頭がパイプの場合はフォールバック扱い（sepIdx=0）', () => {
    const result = parseBenefitStr('|タイトル', 'fallback')
    expect(result.icon).toBe('fallback')
  })
})

// ── フォロワー数カウント ────────────────────────────────────────────────────
describe('フォロワー上限チェック', () => {
  const FREE_FOLLOWER_LIMIT = 10000
  const canFollow = (plan: string, count: number) =>
    plan !== 'free' || count < FREE_FOLLOWER_LIMIT

  it('無料プランでフォロワー9999人はフォロー可能', () => {
    expect(canFollow('free', 9999)).toBe(true)
  })
  it('無料プランでフォロワー10000人はフォロー不可', () => {
    expect(canFollow('free', 10000)).toBe(false)
  })
  it('スタンダードプランは上限なし', () => {
    expect(canFollow('standard', 99999)).toBe(true)
  })
})

// ── ブロックのコンテンツ有無チェック ──────────────────────────────────────
describe('hasContent チェック', () => {
  type Block = { text: string; imageUrl: string | null; videoUrl: string | null }
  const hasContent = (blocks: Block[]) =>
    blocks.some(b => b.text.trim() || b.imageUrl || b.videoUrl)

  it('テキストがあれば true', () => {
    expect(hasContent([{ text: 'こんにちは', imageUrl: null, videoUrl: null }])).toBe(true)
  })
  it('空白のみは false', () => {
    expect(hasContent([{ text: '   ', imageUrl: null, videoUrl: null }])).toBe(false)
  })
  it('画像URLがあれば true', () => {
    expect(hasContent([{ text: '', imageUrl: 'https://example.com/img.jpg', videoUrl: null }])).toBe(true)
  })
  it('動画URLがあれば true', () => {
    expect(hasContent([{ text: '', imageUrl: null, videoUrl: 'https://example.com/vid.mp4' }])).toBe(true)
  })
  it('全ブロックが空なら false', () => {
    expect(hasContent([
      { text: '', imageUrl: null, videoUrl: null },
      { text: '　', imageUrl: null, videoUrl: null },
    ])).toBe(false)
  })
})

// ── 月次カウント制限 ───────────────────────────────────────────────────────
describe('月次配信制限', () => {
  const FREE_LIMIT = 50
  const BETA_MODE = false
  const isBlocked = (plan: string, count: number) =>
    !BETA_MODE && plan === 'free' && count >= FREE_LIMIT

  it('無料プラン49回は制限なし', () => {
    expect(isBlocked('free', 49)).toBe(false)
  })
  it('無料プラン50回でブロック', () => {
    expect(isBlocked('free', 50)).toBe(true)
  })
  it('スタンダードプランは50回超えてもブロックなし', () => {
    expect(isBlocked('standard', 100)).toBe(false)
  })
})
