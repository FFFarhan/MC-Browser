import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-angle=swiftshader',
            '--enable-webgl',
            '--ignore-gpu-blocklist',
            '--disable-features=WebRtcHideLocalIpsWithMdns',
          ],
        },
      },
    },
  ],
  ...(process.env['PLAYWRIGHT_USE_EXISTING_SERVER']
    ? {}
    : {
        webServer: [
          {
            command: 'npm run signal:build && npm run signal:start',
            url: 'http://127.0.0.1:8787/health',
            reuseExistingServer: !process.env['CI'],
            timeout: 30_000,
          },
          {
            command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
            url: 'http://127.0.0.1:4173',
            reuseExistingServer: !process.env['CI'],
            timeout: 30_000,
          },
        ],
      }),
});
