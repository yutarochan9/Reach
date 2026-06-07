module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\\.(ts|tsx|js|jsx)$': 'babel-jest' },
  testMatch: ['**/__tests__/**/*.test.(ts|js)'],
  testPathIgnorePatterns: ['/node_modules/', '/.vercel/', '/dist/'],
  modulePathIgnorePatterns: ['<rootDir>/.vercel/', '<rootDir>/dist/'],
  haste: { platforms: [] },
  moduleNameMapper: {
    '^react-native$': '<rootDir>/__mocks__/react-native.js',
    '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/async-storage.js',
    '^expo-router$': '<rootDir>/__mocks__/expo-router.js',
    '^../../lib/supabase$': '<rootDir>/__mocks__/supabase.js',
    '^../lib/supabase$': '<rootDir>/__mocks__/supabase.js',
  },
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['app/**/*.tsx', 'lib/**/*.ts', '!**/__tests__/**'],
}
