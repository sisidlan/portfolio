import { defineConfig } from '@playwright/test';

const developmentURL = process.env.TEST_BASE_URL;

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    workers: 2,
    use: {
        baseURL: developmentURL || 'http://127.0.0.1:4323',
        viewport: { width: 1600, height: 1100 },
        trace: 'retain-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
        },
        { name: 'firefox', use: { browserName: 'firefox' } },
        { name: 'webkit', use: { browserName: 'webkit' } },
    ],
    webServer: developmentURL
        ? undefined
        : {
              command: 'node tests/preview.mjs',
              url: 'http://127.0.0.1:4323',
              reuseExistingServer: false,
              gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
          },
});
