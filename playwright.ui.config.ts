import { defineConfig, devices } from '@playwright/test';

// UI-only regressions use a local fake API, never a database or Cloudinary.
export default defineConfig({
  testDir: './tests/ui',
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'pnpm --filter @hhs/web exec next start -p 3100',
    url: 'http://127.0.0.1:3100/admin/login',
    env: { API_URL: 'http://127.0.0.1:4101' },
    reuseExistingServer: false,
  },
});
