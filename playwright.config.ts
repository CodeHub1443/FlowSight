import { defineConfig, devices } from '@playwright/test';

// Each worktree sets its own E2E_PORT so parallel e2e runs never collide.
const PORT = Number(process.env.E2E_PORT ?? 4173);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`E2E_PORT must be a port number, got "${process.env.E2E_PORT}"`);
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // /live renders WebGL on SwiftShader (CPU). Parallel workers starve each other and screenshots time out,
  // and a /live test with several screenshots needs more than the 30 s default.
  workers: 1,
  timeout: 90_000,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Desktop Chrome'],
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Headless WebGL on SwiftShader (CPU) so /live renders the 3D canvas. Frame times are not representative.
        launchOptions: {
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    // The dev readout (Ctrl+Shift+D) is compiled in for the e2e build only.
    env: { VITE_DEBUG_PANEL: '1' },
    timeout: 180_000,
  },
});
