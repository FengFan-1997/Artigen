import { defineConfig } from '@playwright/test';
import base from './playwright.config';
// Workspace acceptance uses installed Chrome and still captures failed screens;
// no video encoder or bundled browser download is required on small disks.
export default defineConfig({
  ...base,
  reporter: [['list']],
  outputDir: process.env.ARTIGEN_TEST_OUTPUT || 'test-results/workspace',
  use: { ...base.use, video: 'off', trace: 'off' }
});
