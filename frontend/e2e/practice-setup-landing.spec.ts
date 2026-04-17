/**
 * Plan 03 · Task 13 — Practice Setup landing "Services" card smoke.
 *
 * Verifies that the landing page renders the mode-aware services card with:
 *   - a visible subtitle
 *   - a CTA line ("Set up services" | "Edit fee" | "Manage services")
 *   - a `data-catalog-mode` attribute matching one of the three known modes
 *     (`single_fee`, `multi_service`, or `null` for undecided doctors)
 *   - clicking the card lands on `/services-catalog`
 *
 * Pairs with `services-catalog-mode.spec.ts` (Task 12) — this one covers the
 * reverse direction: does the landing tile accurately summarize what the
 * catalog page will show?
 *
 * Uses the same `E2E_USER` / `E2E_PASSWORD` gate as `dashboard.spec.ts` so
 * CI without seed creds keeps passing.
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

test.describe("Practice Setup landing · Services card (Task 13)", () => {
  const e2eUser = normalizeEnv(process.env.E2E_USER);
  const e2ePassword = normalizeEnv(process.env.E2E_PASSWORD);

  test.skip(
    !e2eUser || !e2ePassword,
    "E2E_USER and E2E_PASSWORD must be set for the practice-setup landing smoke test"
  );

  test("mode-aware Services card shows subtitle + CTA and links to catalog page", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    page.setDefaultTimeout(20_000);

    await page.context().clearCookies();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel(/email/i)).toBeVisible();

    await page.getByLabel(/email/i).fill(e2eUser);
    await page.locator("#login-password").fill(e2ePassword);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/dashboard/settings/practice-setup", {
      waitUntil: "domcontentloaded",
    });

    const card = page.getByTestId("services-landing-card");
    await expect(card).toBeVisible({ timeout: 15_000 });

    // Subtitle is always present; exact text depends on mode — we only assert
    // it's non-empty so this stays resilient to copy tweaks.
    const subtitle = page.getByTestId("services-landing-subtitle");
    await expect(subtitle).toBeVisible();
    const subtitleText = (await subtitle.textContent())?.trim() ?? "";
    expect(subtitleText.length).toBeGreaterThan(0);

    // CTA must be one of the three known labels. We match loosely in case
    // the subtitle wraps whitespace.
    const cta = page.getByTestId("services-landing-cta");
    await expect(cta).toBeVisible();
    const ctaText = (await cta.textContent())?.trim() ?? "";
    expect(ctaText).toMatch(/Set up services|Edit fee|Manage services/);

    // data-catalog-mode attribute is the stable contract between this card
    // and the Task 12 branching on the catalog page.
    const mode = await card.getAttribute("data-catalog-mode");
    expect(mode).not.toBeNull();
    expect(["single_fee", "multi_service", "null"]).toContain(mode);

    // Click-through lands on the catalog page — the route ownership contract
    // from Task 12.
    await card.click();
    await page.waitForURL(
      /\/dashboard\/settings\/practice-setup\/services-catalog/,
      { timeout: 15_000 }
    );
  });
});
