import { defineConfig } from '@playwright/test';

// The end-to-end test runs against the offline backend, so it needs no Supabase project.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'off',
    timezoneId: 'Europe/London',
    locale: 'en-GB',
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 375, height: 740 }, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
});
