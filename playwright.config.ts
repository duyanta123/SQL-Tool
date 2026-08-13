import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5199', url: 'http://127.0.0.1:5199', reuseExistingServer: true },
  use: { baseURL: 'http://127.0.0.1:5199', trace: 'retain-on-failure', channel: 'chrome' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-390', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, browserName: 'chromium', channel: 'chrome' } },
    { name: 'mobile-320', use: { ...devices['iPhone 13'], viewport: { width: 320, height: 740 }, browserName: 'chromium', channel: 'chrome' } },
  ],
});
