import { defineConfig } from '@playwright/test';

// The end-to-end tests run against the offline backend, so they need no Supabase
// project. The online versus test uses a stand-in server (tests/e2e/fakeSupabase.ts)
// that runs the real migrations in an in-process Postgres, with a second copy of the app pointed at it.
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
    { name: 'phone', testIgnore: /online/, use: { viewport: { width: 375, height: 740 }, hasTouch: true } },
    { name: 'desktop', testIgnore: /online/, use: { viewport: { width: 1280, height: 800 } } },
    { name: 'online', testMatch: /online/, use: { baseURL: 'http://localhost:5175', viewport: { width: 390, height: 800 } } },
  ],
  webServer: [
    {
      command: 'npx vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
    },
    {
      command: 'node --experimental-strip-types --no-warnings tests/e2e/fakeSupabase.ts 54329',
      url: 'http://localhost:54329/health',
      reuseExistingServer: false,
    },
    {
      command: 'npx vite --port 5175 --strictPort',
      url: 'http://localhost:5175',
      reuseExistingServer: false,
      env: { VITE_SUPABASE_URL: 'http://localhost:54329', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
    },
  ],
});
