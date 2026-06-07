import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './__tests__',
  testMatch: '**/*.spec.ts',
  timeout: 30000,
  retries: 1,
  use: {
    headless: true,
    viewport: { width: 390, height: 844 }, // iPhone 14
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  },
  projects: [
    {
      name: 'Mobile (iPhone)',
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: 'Desktop',
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
})
