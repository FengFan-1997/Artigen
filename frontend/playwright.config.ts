import { defineConfig, devices } from '@playwright/test';

const localChrome = process.env.ARTIGEN_E2E_CHROME_CHANNEL === '1'
  ? { channel: 'chrome' as const }
  : {};
const requestedPort = Number.parseInt(process.env.ARTIGEN_E2E_PORT || '', 10);
const e2ePort = Number.isInteger(requestedPort) && requestedPort >= 1024 && requestedPort <= 65535
  ? requestedPort
  : 51731;
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: {
    timeout: 15_000
  },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results/e2e',
  use: {
    baseURL: e2eBaseUrl,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], ...localChrome, viewport: { width: 1440, height: 960 } }
    },
    {
      name: 'firefox-desktop',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 960 } }
    },
    {
      name: 'webkit-desktop',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 960 } }
    },
    {
      name: 'chromium-mobile-360',
      use: { ...devices['Pixel 5'], ...localChrome, viewport: { width: 360, height: 800 } }
    },
    {
      name: 'chromium-mobile-390',
      use: { ...devices['Pixel 7'], ...localChrome, viewport: { width: 390, height: 844 } }
    },
    {
      name: 'webkit-tablet-768',
      use: { ...devices['iPad Mini'], viewport: { width: 768, height: 1024 } }
    }
  ]
});
