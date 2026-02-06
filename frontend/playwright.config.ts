import path from "path";
import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// When run as "cd frontend && npm run test:e2e", cwd is frontend
const frontendDir = process.cwd();
loadEnv({ path: path.join(frontendDir, ".env.local") });

/**
 * Playwright E2E config for doctor dashboard.
 * Uses port 3003 by default so the frontend does not conflict with backend (3000) or other dev (3002).
 * When webServer runs, cwd is set to frontend so Next.js loads .env.local (Supabase, E2E_*).
 * @see docs/Reference/FRONTEND_TESTING.md, docs/testing/e2e-runbook.md
 */
const e2ePort = process.env.E2E_PORT || "3003";
const webServerUrl = `http://localhost:${e2ePort}/`;
const runWebServer = !process.env.CI && !process.env.E2E_USE_EXISTING_SERVER;
// When using existing server, always hit frontend on e2ePort (ignore E2E_BASE_URL in .env.local which may be backend)
const useExistingServer = !!process.env.E2E_USE_EXISTING_SERVER;
const baseURLWithSlash =
  runWebServer
    ? webServerUrl
    : useExistingServer
      ? webServerUrl
      : `${(process.env.E2E_BASE_URL || `http://localhost:${e2ePort}`).replace(/\/$/, "")}/`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: baseURLWithSlash,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: runWebServer
    ? {
        command: "node scripts/start-dev-with-env.js",
        url: webServerUrl,
        cwd: frontendDir,
        reuseExistingServer: true,
        timeout: 60_000,
        env: { ...process.env, E2E_PORT: e2ePort },
      }
    : undefined,
});
