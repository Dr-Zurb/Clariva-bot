/**
 * Starts Next.js dev server with env from .env.local loaded in this process.
 * Used by Playwright E2E so the app has the same Supabase/E2E env as manual runs.
 * Run from frontend dir: node scripts/start-dev-with-env.js
 */
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const frontendDir = path.resolve(__dirname, "..");
const envPath = path.join(frontendDir, ".env.local");
const { parsed } = require("dotenv").config({ path: envPath });

const port = process.env.E2E_PORT || process.env.PORT || "3003";
const env = { ...process.env, PORT: port };
if (parsed) {
  Object.assign(env, parsed);
}

const nextBin = path.join(frontendDir, "node_modules", "next", "dist", "bin", "next");
const useNextBin = fs.existsSync(nextBin);
// Don't use shell: true so paths with spaces (e.g. Program Files) work
const child = spawn(
  useNextBin ? process.execPath : "npx",
  useNextBin ? [nextBin, "dev"] : ["next", "dev"],
  { cwd: frontendDir, env, stdio: "inherit" }
);

child.on("exit", (code) => process.exit(code != null ? code : 0));
