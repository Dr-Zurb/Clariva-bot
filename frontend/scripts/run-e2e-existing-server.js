/**
 * Runs Playwright E2E tests against an already-running app (no webServer).
 * Use when you started the app with npm run dev:e2e so the full login flow works.
 */
const { spawn } = require("child_process");

process.env.E2E_USE_EXISTING_SERVER = "1";
const child = spawn("npx", ["playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
  shell: true,
});
child.on("exit", (code) => process.exit(code != null ? code : 0));
