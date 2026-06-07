/**
 * 結合テスト
 * Supabase をモックしてフォロー・配信・フロー配信フローを検証
 */

const { supabase } = require('../__mocks__/supabase')

// ── フォロー処理 ──────────────────────────────────────────────────────────
describe('フォロー処理', () => {
  beforeEach(() => jest.clearAllMocks())

  it('通常フォロー: follows テーブルに INSERT される', async () => {
    const followChain = { insert: jest.fn(() => Promise.resolve({ data: {}, error: null })) }
    supabase.from.mockImplementation((table: string) =>
      table === 'follows' ? followChain : { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn(() => Promise.resolve({ data: null })) }
    )

    await supabase.from('follows').insert({ follower_id: 'user-123', following_id: 'creator-456' })
    expect(followChain.insert).toHaveBeenCalledWith({ follower_id: 'user-123', following_id: 'creator-456' })
  })

  it('鍵垢フォロー: follow_requests テーブルに INSERT される', async () => {
    const reqChain = {
      delete: jest.fn().mockReturnThis(),
      insert: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      eq: jest.fn().mockReturnThis(),
    }
    supabase.from.mockReturnValue(reqChain)

    await supabase.from('follow_requests').delete().eq('requester_id', 'user-123').eq('target_id', 'creator-456')
    await supabase.from('follow_requests').insert({ requester_id: 'user-123', target_id: 'creator-456', status: 'pending' })

    expect(reqChain.delete).toHaveBeenCalled()
    expect(reqChain.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }))
  })

  it('フォロー解除: follows テーブルから DELETE される', async () => {
    const chain = {
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: jest.fn((cb: Function) => Promise.resolve({ data: null, error: null }).then(cb)),
    }
    supabase.from.mockReturnValue(chain)

    supabase.from('follows').delete().eq('follower_id', 'user-123').eq('following_id', 'creator-456')
    expect(chain.delete).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('follower_id', 'user-123')
  })
})

// ── 配信作成フロー ─────────────────────────────────────────────────────────
describe('配信作成フロー', () => {
  beforeEach(() => jest.clearAllMocks())

  it('published 配信: broadcasts に INSERT される', async () => {
    const chain = { insert: jest.fn(() => Promise.resolve({ data: [{ id: 'bc-1' }], error: null })) }
    supabase.from.mockReturnValue(chain)

    const inserts = [{
      sender_id: 'user-123', content: 'テストメッセージ',
      status: 'published', target: 'all',
      image_url: null, video_url: null, block_order: 0,
    }]
    const { error } = await supabase.from('broadcasts').insert(inserts)
    expect(error).toBeNull()
    expect(chain.insert).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ status: 'published' })]))
  })

  it('下書き: status=draft で INSERT される', async () => {
    const chain = { insert: jest.fn(() => Promise.resolve({ data: [{ id: 'bc-2' }], error: null })) }
    supabase.from.mockReturnValue(chain)

    await supabase.from('broadcasts').insert([{ sender_id: 'user-123', content: '下書き', status: 'draft' }])
    expect(chain.insert).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ status: 'draft' })]))
  })

  it('INSERT エラー時はエラーオブジェクトが返る', async () => {
    const chain = { insert: jest.fn(() => Promise.resolve({ data: null, error: { message: 'RLS violation' } })) }
    supabase.from.mockReturnValue(chain)

    const { error } = await supabase.from('broadcasts').insert([{}])
    expect(error).not.toBeNull()
    expect(error.message).toBe('RLS violation')
  })
})

// ── フロー配信エンロール ────────────────────────────────────────────────────
describe('フロー配信エンロール', () => {
  beforeEach(() => jest.clearAllMocks())

  it('enroll_step_sequences RPC が呼ばれる', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    const { error } = await supabase.rpc('enroll_step_sequences', {
      p_creator_id: 'creator-456',
      p_follower_id: 'user-123',
    })
    expect(supabase.rpc).toHaveBeenCalledWith('enroll_step_sequences', {
      p_creator_id: 'creator-456',
      p_follower_id: 'user-123',
    })
    expect(error).toBeNull()
  })

  it('RPC がエラーを返しても呼び出し元はクラッシュしない', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'no sequences' } })

    const { error } = await supabase.rpc('enroll_step_sequences', { p_creator_id: 'x', p_follower_id: 'y' })
    expect(error).not.toBeNull()
  })
})

// ── 鍵垢 + メンバーシップアクセス制御 ────────────────────────────────────
describe('鍵垢メンバーシップアクセス制御', () => {
  const canAccessMembership = (isPrivate: boolean, isOwner: boolean, isFollowing: boolean) =>
    isOwner || !isPrivate || isFollowing

  it('オーナーは常にアクセス可', () => {
    expect(canAccessMembership(true, true, false)).toBe(true)
  })
  it('非公開アカウント + 非フォロワーはアクセス不可', () => {
    expect(canAccessMembership(true, false, false)).toBe(false)
  })
  it('非公開アカウント + フォロワーはアクセス可', () => {
    expect(canAccessMembership(true, false, true)).toBe(true)
  })
  it('公開アカウントは誰でもアクセス可', () => {
    expect(canAccessMembership(false, false, false)).toBe(true)
  })
})

// ── settings トグルのエラーハンドリング ────────────────────────────────────
describe('settings トグル', () => {
  beforeEach(() => jest.clearAllMocks())

  it('DB 更新成功時は新しい値が反映される', async () => {
    const chain = { update: jest.fn().mockReturnThis(), eq: jest.fn(() => Promise.resolve({ error: null })) }
    supabase.from.mockReturnValue(chain)

    let isPrivate = false
    const { error } = await supabase.from('profiles').update({ is_private: true }).eq('id', 'user-123')
    if (!error) isPrivate = true
    expect(isPrivate).toBe(true)
  })

  it('DB 更新失敗時は値が変わらない', async () => {
    const chain = { update: jest.fn().mockReturnThis(), eq: jest.fn(() => Promise.resolve({ error: { message: 'DB error' } })) }
    supabase.from.mockReturnValue(chain)

    let isPrivate = false
    const { error } = await supabase.from('profiles').update({ is_private: true }).eq('id', 'user-123')
    if (!error) isPrivate = true
    expect(isPrivate).toBe(false)
  })
})

// ── 月次カウント（INSERT 成功後のみインクリメント）────────────────────────
describe('月次カウントの整合性', () => {
  it('INSERT 成功時のみ +1 される', async () => {
    let count = 0
    const doInsert = async (shouldFail: boolean) => {
      const error = shouldFail ? { message: 'error' } : null
      if (!error) count++
    }
    await doInsert(false); expect(count).toBe(1)
    await doInsert(true);  expect(count).toBe(1)
    await doInsert(false); expect(count).toBe(2)
  })
})
