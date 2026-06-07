const store = {}
module.exports = {
  getItem: jest.fn((key) => Promise.resolve(store[key] ?? null)),
  setItem: jest.fn((key, val) => { store[key] = val; return Promise.resolve() }),
  removeItem: jest.fn((key) => { delete store[key]; return Promise.resolve() }),
  multiGet: jest.fn((keys) => Promise.resolve(keys.map(k => [k, store[k] ?? null]))),
}
