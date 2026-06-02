#!/usr/bin/env node
/**
 * Sub-batch C · task-video-C2 — copy `@twilio/video-processors`
 * runtime assets (tflite model, WASM binaries, web workers) from
 * `node_modules/@twilio/video-processors/dist/build/` into
 * `frontend/public/twilio-video-processors-assets/`.
 *
 * Why a script (not a build-time webpack config):
 *   - Twilio's processors load the workers + WASM at runtime via
 *     plain `fetch()` against a configurable `assetsPath`. The
 *     files are NOT bundled into the JS — they are static
 *     resources that must live at the configured public URL.
 *   - The recommended pattern (from Twilio's README) is "copy the
 *     contents of `dist/build` to a publicly accessible directory
 *     within your application's web server."
 *   - Doing this in a postinstall script means the assets stay
 *     in sync with the installed version automatically. CI, fresh
 *     clones, and `npm ci` all work without manual intervention.
 *   - Same-origin hosting avoids the CORS + CSP gymnastics in
 *     Twilio's "Cross-Origin Configuration" section. Our public/
 *     directory is served by Next.js at `/`, no extra headers
 *     needed.
 *
 * Idempotent — overwrites destination files with the latest source
 * each run. Safe to commit destination to git; safer to gitignore
 * since the bytes change with the package version (a future
 * `.gitignore` update may add `public/twilio-video-processors-assets/`
 * — for now we leave that decision to follow-up).
 *
 * Usage:
 *   node scripts/copy-twilio-video-processors-assets.mjs
 *
 * Wired as `postinstall` in `package.json`. Skips silently when
 * the source folder is missing (e.g. `npm install --omit=optional`
 * scenarios that don't pull video-processors). Throws on a real
 * copy failure so CI fails loudly rather than shipping a half-
 * deployed PiP/blur surface.
 */

import { mkdir, copyFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve from the script location (frontend/scripts/) to keep
// the script runnable from any cwd. The frontend package root is
// always one level up from the script.
const FRONTEND_ROOT = dirname(__dirname);
const SOURCE_DIR = join(
  FRONTEND_ROOT,
  "node_modules",
  "@twilio",
  "video-processors",
  "dist",
  "build",
);
const DEST_DIR = join(FRONTEND_ROOT, "public", "twilio-video-processors-assets");

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function copyDir(srcDir, destDir) {
  await ensureDir(destDir);
  const entries = await readdir(srcDir);
  let copied = 0;
  for (const name of entries) {
    const srcPath = join(srcDir, name);
    const destPath = join(destDir, name);
    const info = await stat(srcPath);
    if (info.isDirectory()) {
      copied += await copyDir(srcPath, destPath);
    } else if (info.isFile()) {
      await copyFile(srcPath, destPath);
      copied += 1;
    }
  }
  return copied;
}

async function main() {
  if (!existsSync(SOURCE_DIR)) {
    // The package isn't installed (e.g. an `npm install --omit=optional`
    // edge case, or running this script before `@twilio/video-processors`
    // is added to deps). Don't fail the whole install — the consuming
    // code defensively no-ops when the assets are missing.
    console.log(
      `[copy-twilio-video-processors-assets] source not found at ${SOURCE_DIR}; skipping.`,
    );
    return;
  }
  const copied = await copyDir(SOURCE_DIR, DEST_DIR);
  console.log(
    `[copy-twilio-video-processors-assets] copied ${copied} file(s) to ${DEST_DIR}`,
  );
}

main().catch((err) => {
  console.error("[copy-twilio-video-processors-assets] failed:", err);
  process.exit(1);
});
