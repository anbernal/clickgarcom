const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: true,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4318',
    channel: process.env.KDS_TEST_BROWSER_CHANNEL || 'chrome',
    headless: true,
    viewport: { width: 1366, height: 768 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'PORT=4318 ADMIN_API_PROXY_TARGET=http://127.0.0.1:59999 node server.js',
    url: 'http://127.0.0.1:4318/health',
    reuseExistingServer: true,
  },
});
