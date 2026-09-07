'use strict';

const { defineConfig, devices } = require('@playwright/test');
const path = require('node:path');

const baseURL = process.env.BASE_URL || 'http://localhost:3000';

module.exports = defineConfig({
  testDir: './tests',
  outputDir: '/tmp/fp-e2e-results',
  preserveOutput: 'never',
  reporter: [
    ['list'],
    ['html', { outputFolder: path.resolve(__dirname, 'playwright-report'), open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
  ],
  globalSetup: require.resolve('./global-setup'),
  expect: {
    timeout: 5000,
  },
  workers: process.env.CI ? 2 : undefined,
});
