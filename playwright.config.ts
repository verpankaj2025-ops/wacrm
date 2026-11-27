import { defineConfig } from '@playwright/test';

const port = 3100;
const baseURL = 'http://127.0.0.1:' + port;

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  workers: 1, // The local Supabase browser fixtures use the same port.
  use: {
    baseURL,
    actionTimeout: 10000,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
  },
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port ' + port,
    url: baseURL + '/login',
    env: {
      APP_URL: baseURL,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54329',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'local-browser-test',
      NEXT_TELEMETRY_DISABLED: '1',
      WHATSAPP_APP_SECRET: 'fixture-app-secret',
      WHATSAPP_VERIFY_TOKEN: 'fixture-verify-token',
    },
    timeout: 60000,
  },
});
