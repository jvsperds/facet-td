import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // Software WebGL (SwiftShader) is CPU-bound: fewer parallel browsers, more time each.
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5199',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
  },
});
