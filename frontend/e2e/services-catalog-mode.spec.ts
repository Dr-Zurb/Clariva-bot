/**
 * Plan 03 · Task 12 — Services catalog mode selector smoke test.
 *
 * Verifies that `/dashboard/settings/practice-setup/services-catalog`
 * renders exactly ONE of the three mode branches:
 *
 *   - `[data-testid="catalog-mode-selector"]` when `catalog_mode` is null
 *   - `[data-testid="single-fee-catalog-editor"]` when `catalog_mode` is `'single_fee'`
 *   - `[data-testid="switch-to-single-fee"]` when `catalog_mode` is `'multi_service'`
 *     (the toolbar button is the only Task-12-specific marker on that branch;
 *     the rest of the editor is unchanged from Plan 01/02 and has no stable
 *     testid of its own — using the switch button keeps this spec resilient
 *     to future ServiceCatalogEditor refactors.)
 *
 * This is intentionally a smoke check, not an exhaustive flow test. Jest is
 * not wired up in the frontend yet (see docs/capture/inbox.md entry 2026-04-04);
 * when it is, unit tests for the selector, single-fee editor, and mode-switch
 * dialog should land alongside and shrink this file's scope back to a thin
 * post-login navigation check.
 *
 * Environment:
 *   - Reuses `E2E_USER` / `E2E_PASSWORD` from dashboard.spec.ts. The test is
 *     skipped when either is missing, exactly like the full-flow test there,
 *     so CI without seed creds still passes.
 */
import { test, expect } from "@playwright/test";

function normalizeEnv(value: string | undefined): string {
  if (value == null) return "";
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

test.describe("Services catalog · mode branching (Task 12)", () => {
  const e2eUser = normalizeEnv(process.env.E2E_USER);
  const e2ePassword = normalizeEnv(process.env.E2E_PASSWORD);

  test.skip(
    !e2eUser || !e2ePassword,
    "E2E_USER and E2E_PASSWORD must be set for services-catalog mode smoke test"
  );

  test("renders exactly one mode branch for the signed-in doctor", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    page.setDefaultTimeout(20_000);

    // Minimal login — same pattern as dashboard.spec.ts, trimmed. If Supabase
    // env is missing we fail fast with the same "run dev:e2e" hint the main
    // spec produces.
    await page.context().clearCookies();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel(/email/i)).toBeVisible();

    await page.getByLabel(/email/i).fill(e2eUser);
    await page.locator("#login-password").fill(e2ePassword);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    // Go straight to the catalog page (navigating through settings menus
    // would make this spec brittle against sidebar IA changes).
    await page.goto("/dashboard/settings/practice-setup/services-catalog", {
      waitUntil: "domcontentloaded",
    });

    // Wait for loading skeleton to clear — the page renders `Loading…` until
    // the initial `getDoctorSettings` resolves.
    await expect(page.getByText("Services catalog")).toBeVisible({
      timeout: 20_000,
    });

    const selector = page.getByTestId("catalog-mode-selector");
    const singleFee = page.getByTestId("single-fee-catalog-editor");
    const multiService = page.getByTestId("switch-to-single-fee");

    // Wait until one of the three becomes visible. We can't assert which one
    // without knowing the doctor's current `catalog_mode`, so we OR them.
    await expect
      .poll(
        async () => {
          const [selVisible, singleVisible, multiVisible] = await Promise.all([
            selector.isVisible().catch(() => false),
            singleFee.isVisible().catch(() => false),
            multiService.isVisible().catch(() => false),
          ]);
          return Number(selVisible) + Number(singleVisible) + Number(multiVisible);
        },
        { timeout: 15_000, message: "Expected exactly one mode branch to render" }
      )
      .toBe(1);

    // Plan 02 / Task 12 gating check: when single-fee is active, the
    // toolbar "Switch to one flat fee" button (which only exists in
    // multi-service mode) must not be on the page. This is the single
    // most load-bearing absence we can assert without bolting extra
    // testids onto the existing Plan 01/02 surfaces. The full set of
    // surfaces that get hidden (AI sparkle, review panel, health badge,
    // templates toolbar, scope-mode nudges) all live inside the gated
    // subtree, so "switch button is absent" is a sound proxy.
    if (await singleFee.isVisible()) {
      await expect(multiService).toHaveCount(0);
    }

    if (await selector.isVisible()) {
      // Neither editor should be mounted in the null-mode state.
      await expect(singleFee).toHaveCount(0);
      await expect(multiService).toHaveCount(0);
    }
  });
});
