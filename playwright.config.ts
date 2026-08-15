import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5199', url: 'http://127.0.0.1:5199', reuseExistingServer: true },
  use: {
    baseURL: 'http://127.0.0.1:5199',
    trace: 'retain-on-failure',
    // 视觉基线依赖浏览器渲染一致：使用 Playwright 自带 Chromium（版本随 @playwright/test 锁定），
    // 避免 CI 安装的最新 Chrome 与本地生成基线的 Chrome 版本不同导致像素级 diff
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.05 },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-390', use: { ...devices['iPhone 13'], browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'mobile-320', use: { ...devices['iPhone 13'], browserName: 'chromium', viewport: { width: 320, height: 740 } } },
  ],
});
