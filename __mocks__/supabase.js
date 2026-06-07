const mockChain = (returnVal = { data: null, error: null }) => {
  const chain = {
    select: jest.fn(() => chain),
    insert: jest.fn(() => Promise.resolve(returnVal)),
    update: jest.fn(() => chain),
    delete: jest.fn(() => chain),
    upsert: jest.fn(() => Promise.resolve(returnVal)),
    eq: jest.fn(() => chain),
    neq: jest.fn(() => chain),
    in: jest.fn(() => chain),
    or: jest.fn(() => chain),
    is: jest.fn(() => chain),
    gte: jest.fn(() => chain),
    lte: jest.fn(() => chain),
    gt: jest.fn(() => chain),
    order: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    single: jest.fn(() => Promise.resolve(returnVal)),
    maybeSingle: jest.fn(() => Promise.resolve(returnVal)),
    then: jest.fn((cb) => Promise.resolve(returnVal).then(cb)),
  }
  return chain
}

const supabase = {
  auth: {
    getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'user-123', email: 'test@example.com' } } })),
    getSession: jest.fn(() => Promise.resolve({ data: { session: { access_token: 'token' } } })),
    signOut: jest.fn(() => Promise.resolve()),
  },
  from: jest.fn(() => mockChain()),
  rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
  storage: {
    from: jest.fn(() => ({
      upload: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://example.com/file.jpg' } })),
    })),
  },
  channel: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
  })),
  removeChannel: jest.fn(() => Promise.resolve()),
}

module.exports = { supabase }
