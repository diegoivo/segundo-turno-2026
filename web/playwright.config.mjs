import { defineConfig } from '@playwright/test';

// Usa o Google Chrome instalado (channel "chrome"); sem ele: npx playwright install chromium e CHROME_CHANNEL=
const channel = process.env.CHROME_CHANNEL === undefined ? 'chrome' : process.env.CHROME_CHANNEL || undefined;
export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '*.spec.mjs',
  workers: 1,
  timeout: 30000,
  reporter: [['list']],
  use: { browserName: 'chromium', channel, headless: true },
});
