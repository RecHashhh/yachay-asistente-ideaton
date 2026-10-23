import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5181',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-gl=swiftshader', '--enable-webgl'] },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5181 --strictPort',
    env: { VITE_API_URL: 'http://127.0.0.1:8000', VITE_MAP_API_URL: '/__maps_api' },
    url: 'http://127.0.0.1:5181',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
