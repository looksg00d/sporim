import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * The product is used on a phone, held one-handed, while two people argue. The mobile
 * project is the one that must stay green; desktop is the secondary check.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Two projects' worth of Chromium contexts alongside a running dev server is more
  // than a laptop can start inside the setup timeout; capped rather than left to '50%'.
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? [['html'], ['github']] : [['list']],
  timeout: 45_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Deterministic: the app must never depend on the runner's locale or timezone.
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_DIST_DIR: '.next-e2e',
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXT_PUBLIC_APP_ENV: 'local',
      NEXT_PUBLIC_CHAIN_MODE: 'mock',
      NEXT_PUBLIC_FEE_BPS: '300',
      NEXT_PUBLIC_MAX_STAKE_USDC: '100',
    },
  },
});
