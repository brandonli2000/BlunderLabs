import { defineConfig, devices } from "@playwright/test";

const PORT = 5199;

/**
 * End-to-end tests drive the real app (real Stockfish in a Web Worker, real
 * IndexedDB) in Chromium. External APIs are always intercepted with recorded
 * fixtures, so runs are deterministic and never touch Lichess or Chess.com.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  // Each test runs Stockfish workers; too many at once starves the CPU and causes timeouts.
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
