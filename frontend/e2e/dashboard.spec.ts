/**
 * E2E: Critical dashboard flows (login, list, detail) per FRONTEND_TESTING.md.
 * Uses E2E_BASE_URL; optional E2E_USER / E2E_PASSWORD for full login flow (test account only).
 * Env is loaded in playwright.config.ts and passed to workers.
 */
import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test("loads and shows sign-in form", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /sign in/i })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign in/i })
    ).toBeVisible();
  });
});

test.describe("Dashboard access", () => {
  test("unauthenticated visit to dashboard appointments redirects to login", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard/appointments", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/(login|auth)/, { timeout: 10_000 });
  });
});

// Normalize env credentials: trim and strip surrounding quotes (some loaders leave quotes in value)
function normalizeEnv(value: string | undefined): string {
  if (value == null) return "";
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

test.describe("Full flow: login → dashboard → appointments", () => {
  const e2eUser = normalizeEnv(process.env.E2E_USER);
  const e2ePassword = normalizeEnv(process.env.E2E_PASSWORD);

  test.skip(
    !e2eUser || !e2ePassword,
    "E2E_USER and E2E_PASSWORD must be set for full login flow (test account only)"
  );

  test("login, navigate to dashboard, then appointments list", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    // Cap individual step timeouts so we fail fast instead of burning the full test timeout
    page.setDefaultTimeout(20_000);
    if (!e2eUser.includes("@") || !e2ePassword.length) {
      throw new Error(
        "E2E_USER or E2E_PASSWORD missing or invalid in this worker. Run tests from frontend dir: cd frontend && npm run test:e2e. Ensure .env.local has E2E_USER=your@email.com and E2E_PASSWORD=\"yourpassword\" (quote if password has #)."
      );
    }
    await page.context().clearCookies();
    // Fail fast if the app doesn't have Supabase env (server + client need it)
    const envCheckRes = await page.request.get("/api/env-check", { timeout: 10_000 }).catch(() => null);
    const envCheck = envCheckRes ? ((await envCheckRes.json().catch(() => ({}))) as { supabase?: boolean }) : null;
    if (envCheck?.supabase === false) {
      throw new Error(
        "App at baseURL has no NEXT_PUBLIC_SUPABASE_* (env-check). Start with: cd frontend && npm run dev:e2e. If it still fails, clear cache: remove frontend/.next then run dev:e2e again."
      );
    }

    let authStatus: number | null = null;
    page.on("response", (res) => {
      const u = res.url();
      if (u.includes("supabase") && u.includes("auth")) authStatus = res.status();
    });

    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 10_000 });
    // If client has no Supabase env, login page shows this on mount—fail fast
    const configError = page.getByTestId("login-error-message");
    await configError.waitFor({ state: "visible", timeout: 2_000 }).catch(() => null);
    const configMsg = (await configError.textContent().catch(() => "")) ?? "";
    if (configMsg.includes("Supabase is not configured")) {
      throw new Error(
        `Client bundle has no Supabase env: ${configMsg.trim()} Clear frontend/.next and restart with npm run dev:e2e.`
      );
    }
    try {
      await page.getByLabel(/email/i).fill(e2eUser);
      const passwordField = page.locator("#login-password");
      await passwordField.fill(e2ePassword);
      await page.getByRole("button", { name: /sign in/i }).click();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("closed") || msg.includes("Target page")) {
        throw new Error(
          `Test timed out or browser closed before login (${msg.slice(0, 80)}). Ensure dev server is ready (npm run dev:e2e) and try again.`
        );
      }
      throw err;
    }

    // Wait for either redirect to dashboard or for auth/error to settle
    await Promise.race([
      page.waitForURL(/\/dashboard/, { timeout: 15_000 }),
      page
        .waitForResponse(
          (r) => r.url().includes("supabase") && r.url().includes("auth"),
          { timeout: 10_000 }
        )
        .then(() => page.waitForTimeout(1000)),
    ]).catch(() => null);
    if (!page.url().includes("/dashboard")) {
      await page.waitForURL(/\/dashboard/, { timeout: 3_000 }).catch(() => null);
    }

    if (page.url().includes("/dashboard")) {
      // Success
    } else {
      // Prefer the known error element; wait for it or any alert to have settled (keep short to avoid test timeout)
      const errorEl = page.getByTestId("login-error-message");
      await errorEl.waitFor({ state: "visible", timeout: 3_000 }).catch(() => null);
      await page.waitForTimeout(400);
      let alertText = (await errorEl.textContent().catch(() => "")) || "";
      if (!alertText.trim()) {
        const fallback = page.locator("#login-error").or(page.getByRole("alert"));
        alertText = (await fallback.first().textContent().catch(() => "")) || "";
      }
      const buttonText = (await page.getByRole("button", { name: /sign in/i }).textContent().catch(() => "")) ?? "";

      let hint = "";
      try {
        const res = await page.request.get("/api/env-check", { timeout: 5_000 });
        const data = (await res.json()) as { supabase?: boolean };
        if (data.supabase === false) {
          hint =
            " App has no Supabase URL/key (env-check). Start dev server with: npm run dev:e2e (from frontend dir) so NEXT_PUBLIC_SUPABASE_* are set.";
        }
      } catch {
        hint = " Could not reach /api/env-check (server busy or timeout).";
      }
      if (authStatus == null) {
        hint +=
          " No Supabase auth request was seen—ensure the app was started with npm run dev:e2e so the client has Supabase env.";
      } else {
        hint += ` Supabase auth response: ${authStatus}.`;
      }
      if (buttonText.includes("Signing in")) {
        hint += " Button still shows 'Signing in…'—request may be stuck or blocked (check network/CORS).";
      }
      throw new Error(
        (alertText.trim()
          ? `Login failed: ${alertText.trim()}.${hint}`
          : `Login failed (no message). Page: ${page.url()}. Button: "${buttonText.trim()}".${hint} Ensure .env.local has NEXT_PUBLIC_SUPABASE_* and E2E_USER/E2E_PASSWORD; run tests from frontend dir.`)
      );
    }
    await expect(
      page.getByRole("navigation", { name: /main navigation/i })
    ).toBeVisible();

    await page.getByRole("link", { name: /^appointments$/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/appointments/);
    await expect(
      page.getByRole("group", { name: /filter appointments/i })
    ).toBeVisible();
  });
});
