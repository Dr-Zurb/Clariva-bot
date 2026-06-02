/**
 * np-01 baseline capture — dev or prod build.
 *
 * Usage (existing dev server on :3000):
 *   E2E_USE_EXISTING_SERVER=1 node scripts/capture-nav-baseline.mjs --mode=dev
 *
 * Prod build (requires prior `next build`):
 *   node scripts/capture-nav-baseline.mjs --mode=prod
 *
 * Requires E2E_USER + E2E_PASSWORD in frontend/.env.local.
 * PHI-free: captures only durations, counts, and route paths.
 */

import path from "path";
import { config as loadEnv } from "dotenv";
import { chromium } from "playwright";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.join(__dirname, "..");
loadEnv({ path: path.join(frontendDir, ".env.local") });

function parseArgs() {
  const modeArg = process.argv.find((a) => a.startsWith("--mode="));
  const mode = modeArg?.split("=")[1] ?? "dev";
  if (mode !== "dev" && mode !== "prod") {
    throw new Error("--mode must be dev or prod");
  }
  return { mode };
}

function normalizeEnv(value) {
  if (value == null) return "";
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return Math.round(sorted[lower]);
  const weight = rank - lower;
  return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

function summarizeDurations(values) {
  return {
    count: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
  };
}

async function login(page, user, password) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto("/login", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.getByLabel(/email/i).waitFor({ state: "visible", timeout: 60_000 });
    await page.getByLabel(/email/i).fill(user);
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (page.url().includes("/dashboard")) return;
      await page.waitForTimeout(500);
    }

    if (attempt === 3) throw new Error("Login failed after 3 attempts");
    await page.waitForTimeout(2000);
  }
}

async function clickNav(page, labelRegex) {
  await page.getByRole("navigation", { name: /main navigation/i })
    .getByRole("link", { name: labelRegex })
    .click();
}

async function waitForSurface(page, urlPattern) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (urlPattern.test(new URL(page.url()).pathname)) break;
    await page.waitForTimeout(200);
  }
  if (!urlPattern.test(new URL(page.url()).pathname)) {
    throw new Error(`Expected URL matching ${urlPattern}, got ${page.url()}`);
  }
  await page.waitForTimeout(800);
}

async function captureNavMeasurement(page) {
  return page.evaluate(() => {
    const last = window.__navPerf?.getLastMeasurement?.() ?? null;
    window.__navPerf?.clearMeasurements?.();
    return last;
  });
}

async function runSurface(page, spec, kind) {
  const apiDurations = [];
  const reqStart = new Map();
  const onRequest = (req) => {
    if (!req.url().includes("/api/v1/") || req.method() !== "GET") return;
    reqStart.set(req, Date.now());
  };
  const onResponse = (res) => {
    const req = res.request();
    if (!req.url().includes("/api/v1/") || req.method() !== "GET") return;
    const start = reqStart.get(req);
    if (start != null) apiDurations.push(Date.now() - start);
  };
  page.on("request", onRequest);
  page.on("response", onResponse);

  const navStartMs = Date.now();
  const fromPath = new URL(page.url()).pathname;
  if (spec.navLabel) {
    await clickNav(page, spec.navLabel);
  } else if (spec.action) {
    await page.evaluate(
      ({ from, to }) => window.__navPerf?.markNavClick(from, to),
      { from: fromPath, to: spec.toPath },
    );
    await spec.action(page);
  }
  await waitForSurface(page, spec.urlPattern);

  if (spec.action) {
    await page.evaluate((pathname) => {
      window.__navPerf?.markRouteFcp?.(pathname);
    }, new URL(page.url()).pathname);
  }

  const navPerf = await captureNavMeasurement(page);
  page.off("request", onRequest);
  page.off("response", onResponse);

  const wallClockMs = Date.now() - navStartMs;

  return {
    surface: spec.id,
    kind,
    clickToFcpMs: navPerf?.clickToFcpMs ?? wallClockMs,
    apiRequestCount: navPerf?.apiRequestCount ?? apiDurations.length,
    apiDurations: summarizeDurations(apiDurations),
  };
}

async function findPatientDetailLink(page, baseURL) {
  const patientId = await page.evaluate(async () => {
    const storageKey = Object.keys(localStorage).find((k) =>
      k.includes("auth-token"),
    );
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const session = JSON.parse(raw);
      const token = session?.access_token ?? session?.currentSession?.access_token;
      if (!token) return null;
      const res = await fetch("/api/v1/patients?limit=1", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const body = await res.json();
      return body?.data?.patients?.[0]?.id ?? body?.patients?.[0]?.id ?? null;
    } catch {
      return null;
    }
  });
  if (patientId) return `/dashboard/patients-v2/${patientId}`;

  const apiRes = await page.request
    .get(`${baseURL}api/v1/patients?limit=1`)
    .catch(() => null);
  if (apiRes?.ok()) {
    const body = await apiRes.json().catch(() => null);
    const id =
      body?.data?.patients?.[0]?.id ?? body?.patients?.[0]?.id ?? null;
    if (id) return `/dashboard/patients-v2/${id}`;
  }

  const patientsResponse = page.waitForResponse(
    (res) =>
      res.url().includes("/api/v1/patients") &&
      res.request().method() === "GET" &&
      !res.url().includes("possible-duplicates"),
    { timeout: 30_000 },
  );
  await page.goto(`${baseURL}dashboard/patients-v2`, {
    waitUntil: "domcontentloaded",
  });
  const res = await patientsResponse.catch(() => null);
  if (res?.ok()) {
    const body = await res.json().catch(() => null);
    const id =
      body?.data?.patients?.[0]?.id ?? body?.patients?.[0]?.id ?? null;
    if (id) return `/dashboard/patients-v2/${id}`;
  }

  await page.waitForTimeout(3000);
  const listLink = page.locator('a[href^="/dashboard/patients-v2/"]').first();
  const visible = await listLink
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (visible) return listLink.getAttribute("href");

  const envPatientId = process.env.E2E_PATIENT_ID?.trim();
  if (envPatientId) return `/dashboard/patients-v2/${envPatientId}`;

  // Fallback: UUID from the E2E doctor's panel (captured during dev baseline run).
  // PHI-free — id only, no names or clinical data in this artifact.
  return "/dashboard/patients-v2/cbb28396-8d13-4029-aaed-2aef3bc98001";
}

async function startProdServer(port) {
  const child = spawn("npx", ["next", "start", "-p", port], {
    cwd: frontendDir,
    stdio: "pipe",
    env: { ...process.env, NODE_ENV: "production" },
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("prod server timeout")), 90_000);
    const onData = (d) => {
      if (String(d).toLowerCase().includes("ready")) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
  });
  return child;
}

async function main() {
  const { mode } = parseArgs();
  const user = normalizeEnv(process.env.E2E_USER);
  const password = normalizeEnv(process.env.E2E_PASSWORD);
  if (!user || !password) {
    throw new Error("E2E_USER and E2E_PASSWORD required in .env.local");
  }

  const port = process.env.E2E_PORT || (mode === "prod" ? "3004" : "3000");
  const baseURL = `http://localhost:${port}/`;

  let prodServer = null;
  if (mode === "prod" && !process.env.E2E_USE_EXISTING_SERVER) {
    prodServer = await startProdServer(port);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  page.setDefaultTimeout(60_000);

  const results = [];
  try {
    await login(page, user, password);

    const patientHref = await findPatientDetailLink(page, baseURL);
    const patientPath =
      patientHref?.split("?")[0] ?? "/dashboard/patients-v2/unknown";
    const patientPattern = new RegExp(
      patientPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );

    const surfaces = [
      {
        id: "today",
        navLabel: /^today$/i,
        urlPattern: /\/dashboard\/?$/,
      },
      {
        id: "opd",
        navLabel: /^opd$/i,
        urlPattern: /\/dashboard\/opd-today/,
      },
      {
        id: "patients-list",
        navLabel: /^patients$/i,
        urlPattern: /\/dashboard\/patients-v2\/?$/,
      },
      {
        id: "patient-detail",
        toPath: patientPath,
        action: async (p) => {
          await p.goto(`${baseURL}${patientPath.replace(/^\//, "")}`, {
            waitUntil: "domcontentloaded",
          });
        },
        urlPattern: patientPattern,
      },
    ];

    // Cold pass: start from OPD, click each sidebar destination once.
    await page.goto(`${baseURL}dashboard/opd-today`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.__navPerf?.clearMeasurements?.());

    for (const spec of surfaces) {
      results.push(await runSurface(page, spec, "cold"));
    }

    // Repeat pass: start from alerts (unused in cold pass), re-click each sidebar item.
    await page.goto(`${baseURL}dashboard/alerts`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__navPerf?.clearMeasurements?.());

    for (const spec of surfaces) {
      if (spec.navLabel) {
        results.push(await runSurface(page, spec, "repeat"));
      }
    }

    // Patient detail repeat via list click (not a sidebar hop).
    await page.goto(`${baseURL}dashboard/patients-v2`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(800);
    const repeatApi = [];
    const repeatReqStart = new Map();
    const repeatOnRequest = (req) => {
      if (!req.url().includes("/api/v1/") || req.method() !== "GET") return;
      repeatReqStart.set(req, Date.now());
    };
    const repeatOnResponse = (res) => {
      const req = res.request();
      if (!req.url().includes("/api/v1/") || req.method() !== "GET") return;
      const start = repeatReqStart.get(req);
      if (start != null) repeatApi.push(Date.now() - start);
    };
    page.on("request", repeatOnRequest);
    page.on("response", repeatOnResponse);
    const repeatNavStartMs = Date.now();
    await page.evaluate(
      ({ from, to }) => window.__navPerf?.markNavClick(from, to),
      {
        from: "/dashboard/patients-v2",
        to: patientPath,
      },
    );
    await page.goto(`${baseURL}${patientPath.replace(/^\//, "")}`, {
      waitUntil: "domcontentloaded",
    });
    await waitForSurface(page, patientPattern);
    await page.evaluate((pathname) => {
      window.__navPerf?.markRouteFcp?.(pathname);
    }, patientPath);
    const repeatDetail = await captureNavMeasurement(page);
    page.off("request", repeatOnRequest);
    page.off("response", repeatOnResponse);
    const repeatWallMs = Date.now() - repeatNavStartMs;
    results.push({
      surface: "patient-detail",
      kind: "repeat",
      clickToFcpMs: repeatDetail?.clickToFcpMs ?? repeatWallMs,
      apiRequestCount: repeatDetail?.apiRequestCount ?? repeatApi.length,
      apiDurations: summarizeDurations(repeatApi),
    });

    console.log(
      JSON.stringify(
        { mode, baseURL, capturedAt: new Date().toISOString(), results },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    if (prodServer) prodServer.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
