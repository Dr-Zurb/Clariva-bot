# Task 13: Practice setup landing page update
## 16 April 2026 — Plan 03, Task 6 (Single-fee vs multi-service mode)

---

## Task Overview

The practice setup landing page shows a row of summary cards for each setup area (profile, availability, services, payments, etc.). The existing "Services" card assumes multi-service — it shows a count of services and a "Manage services" CTA. After Plan 03 ships, that card needs to be mode-aware:

- **`catalog_mode === null`** → prompt the doctor to pick a mode with a primary CTA.
- **`catalog_mode === 'single_fee'`** → show the flat fee + enabled modalities, short "Edit single fee" CTA.
- **`catalog_mode === 'multi_service'`** → show service count + optional tiny health summary (from Plan 02's `runLocalCatalogChecks`), "Manage services" CTA.

Small, mostly-display task — but it's the last puzzle-piece that makes the landing page feel coherent after Plan 03.

**Estimated Time:** 2–3 hours  
**Status:** Done — 2026-04-16  
**Depends on:** [Task 08](./task-08-catalog-mode-database-field.md), [Task 12](./task-12-frontend-mode-selector.md)  
**Plan:** [Plan 03 — Single-fee vs multi-service mode](../Plans/plan-03-single-fee-vs-multi-service-mode.md)

### Implementation Plan (high level)

1. **Locate the "Services" landing card.** It's rendered from the practice-setup landing page (check `frontend/components/practice-setup/*Landing*.tsx` or the page file — use `rg "Manage services"` to find it).
2. **Add mode-aware rendering.** Three branches:
   - `null` → "Choose how you charge for consultations" subtitle, "Set up services" primary CTA that links to the same page as today (Task 12's `CatalogModeSelector` renders inside).
   - `'single_fee'` → "Single fee: ₹{amount} · {enabled modalities list}" subtitle, "Edit fee" CTA.
   - `'multi_service'` → "{N} services configured{if health issues: · {N} need attention}" subtitle, "Manage services" CTA. Health number comes from Plan 02's client-side `runLocalCatalogChecks` — purely deterministic, no server round-trip.
3. **Small health summary.** Call `runLocalCatalogChecks` once (it's cheap), compute the total issues count, show it as a tiny badge next to the CTA. If no issues, no badge. If server review has ever enqueued a result (`serverReviewIssues` on the settings), prefer that count (more accurate); else fall back to local checks.
4. **Icons / visual distinction.** Reuse existing card styling; add a simple emoji or icon hint per mode (single dollar for single-fee, stack icon for multi-service, question mark for null). Keep the icon change minimal so we don't trigger a design review.
5. **Tests.** If Jest is wired up in the frontend (Task 12 will answer this), add a unit test that each mode renders the right subtitle. Otherwise, Playwright smoke (one click-through per mode).

**Scope trade-offs (deliberately deferred):**
- **Trend/"last changed" timestamp on the card** — nice-to-have, not worth the prop drilling today. Parked in inbox.
- **Inline fee edit directly on the landing card** — too much for this task; clicking "Edit fee" takes the doctor to Task 12's editor, which is already compact.
- **Link to the mode-switch UX from the landing card** — also parked; the editor page already surfaces "Switch to X" affordances.

**Change Type:**
- [ ] **Create new** — no new components
- [x] **Update existing** — the practice setup landing page / card component; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- Landing page exists (confirm exact path via `rg "Manage services"`).
- "Services" card exists with multi-service assumption baked in.
- `runLocalCatalogChecks` — EXISTS in `frontend/lib/catalog-review.ts` (Task 07 artifact). Pure function; safe to call on client.
- `doctorSettings` object on the landing page already has `catalog_mode` (after Task 08), `appointment_fee_minor`, `consultation_types`, `service_offerings_json`.

**What's missing:**
- Mode-branching subtitle
- Health summary badge for multi-service
- CTA label change per mode

**Scope Guard:**
- Expected files touched: 1–2 (the landing card + possibly one small helper file).
- Must NOT touch the editor page itself (that's Task 12's scope).
- Must NOT introduce new API calls (health is computed client-side; server `serverReviewIssues` is already fetched with the settings payload).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
- [Plan 03 — Single-fee vs multi-service mode](../Plans/plan-03-single-fee-vs-multi-service-mode.md) — Task 06 section
- [Task 07 — Catalog quality checks](./task-07-catalog-quality-checks.md) — source of `runLocalCatalogChecks` and the health badge pattern
- [Task 12 — Frontend mode selector](./task-12-frontend-mode-selector.md) — this card's CTA links into the editor page Task 12 owns

---

## Task Breakdown

### 1. Locate + understand the current card

- [x] 1.1 Ran `rg "Manage services"` — no match (the legacy copy wasn't present). Grepping for `services-catalog` surfaced `frontend/app/dashboard/settings/practice-setup/page.tsx`, which is a static Next.js server component listing six setup cards via a shared `cards` array fed into `<PracticeSetupCard>`.
- [x] 1.2 Confirmed `doctorSettings` is NOT fetched on the landing shell — it's a pure presentational component. Decision: don't force the shell client-side (would regress SSR for the other five cards). Instead, split the Services card out into its own client component that fetches via `getDoctorSettings` + Supabase session, mirroring the pattern used by `bot-messages/page.tsx` and `OpdTodayClient.tsx`.
- [x] 1.3 Confirmed the new client component receives the full `doctorSettings` (via `getDoctorSettings`) so it can read `catalog_mode`, `appointment_fee_minor`, `appointment_fee_currency`, `consultation_types`, and `service_offerings_json`. Scope note: `serverReviewIssues` is ephemeral editor-page state, not a settings field (confirmed via `rg "serverReviewIssues|server_review_issues" frontend/` — zero matches in types). The task description's "prefer server data if available" fallback collapses to "always use local deterministic checks", which matches what the Task-07 health badge already does on the editor page.

### 2. Mode-branching subtitle + CTA

- [x] 2.1 Added `describeServicesCardState(settings)` at `frontend/lib/practice-setup-card.ts` — pure function, returns `{ mode, subtitle, cta, healthCount, serviceCount }`.
- [x] 2.2 `catalog_mode === null` (or `undefined`) → `{ subtitle: 'Choose how you charge for consultations', cta: 'Set up services', healthCount: 0 }`. Pre-fetch placeholder renders the same shape with a `"Loading your services setup…"` subtitle to avoid mode-copy flicker on first paint.
- [x] 2.3 `catalog_mode === 'single_fee'` → `Single fee: ₹500 · Text + Video` style subtitle. Fee formatted via a local `formatMoneyMinor` that mirrors `/app/book/page.tsx#formatMoneyMinor` (INR locale-string, USD/EUR/GBP symbol map, else ISO code). Modalities summarized via the Task-12 shared `parseConsultationTypesToModalities` helper so the landing card and the single-fee editor always agree on which modalities are "on". Null/zero `appointment_fee_minor` → `"Fee not set · {modalities}"` fallback. `cta: 'Edit fee'`, `healthCount: 0`.
- [x] 2.4 `catalog_mode === 'multi_service'` → runs `catalogToServiceDrafts(service_offerings_json)` → `runLocalCatalogChecks(drafts)`. Empty catalog renders `"No services yet — add your first service"`; populated renders `"{N} service(s) configured"` with optional `"· {N} need(s) attention"` suffix when the deterministic checks return issues. `cta: 'Manage services'`.
- [x] 2.5 Rendering lives in `ServicesLandingCard` — subtitle under the title, health pill (amber, mirrors `CatalogCardHealthBadge` tokens for visual consistency, count shown inline) next to the title, CTA line with arrow glyph below the subtitle. Zero layout regression vs. the static `PracticeSetupCard` (same outer `<Link>` + icon box + title + description pattern).

### 3. Icons / visual hint (tiny)

- [x] 3.1 Added a `ModeIcon` component inside `ServicesLandingCard.tsx` — reuses the same inline SVG + `currentColor` stroke style as the other five landing cards. Three variants: dollar sign (`single_fee`), help-circle with inline arrow tail (`null` / `loading`), and the original stacked-sheet icon (`multi_service`, preserved verbatim from the pre-task card so existing multi-service doctors see zero visual change).
- [x] 3.2 No color changes, no layout changes, no new asset imports — just the SVG path swap.

### 4. Tests

- [x] 4.1 Jest is still not wired up in the frontend (confirmed via `find frontend -name "jest.config*"` — zero matches; see `docs/capture/inbox.md` 2026-04-04 entry carried forward from Task 07 / 12). `describeServicesCardState` is pure and intentionally structured for a future Jest pass — return shape is a plain object, no React, no async.
- [x] 4.2 Snapshot test deferred to the same Jest bootstrap; `data-testid` + `data-catalog-mode` hooks on the card, subtitle, and CTA make the assertion trivial to port once Jest lands.
- [x] 4.3 Added Playwright smoke `frontend/e2e/practice-setup-landing.spec.ts`. Asserts: the card is visible, subtitle is non-empty, CTA matches one of the three known labels, `data-catalog-mode` is a known value, and clicking lands on `/services-catalog`. Skips when `E2E_USER` / `E2E_PASSWORD` are absent, same gate as `dashboard.spec.ts` and `services-catalog-mode.spec.ts`.

### 5. Verification

- [x] 5.1 `npx tsc --noEmit` clean from `frontend/` (exit 0, 7.1s).
- [x] 5.1.a `npx eslint lib/practice-setup-card.ts components/settings/ServicesLandingCard.tsx app/dashboard/settings/practice-setup/page.tsx e2e/practice-setup-landing.spec.ts --max-warnings=0` — clean (exit 0).
- [ ] 5.2 Manual verification deferred to daily-plan pass: for a doctor with `catalog_mode === null`, the landing shows "Choose how you charge…" and clicking lands on the Task 12 mode selector.
- [ ] 5.3 Manual verification deferred: single-fee doctor sees `Single fee: ₹500 · Text + Video` + `Edit fee` CTA.
- [ ] 5.4 Manual verification deferred: multi-service doctor with deterministic issues sees the amber `!N` badge + `"· N need(s) attention"` suffix.
- [ ] 5.5 Manual verification deferred: multi-service doctor with a clean catalog renders no badge (handled by the `healthCount === 0` guard in `HealthBadge`).

---

## Files to Create/Update

```
frontend/lib/practice-setup-card.ts                          — CREATED (pure describeServicesCardState helper)
frontend/components/settings/ServicesLandingCard.tsx          — CREATED (client, mode-aware card replacing the static Services row)
frontend/app/dashboard/settings/practice-setup/page.tsx       — UPDATED (removes the services-catalog entry from the `cards` array and renders <ServicesLandingCard> in its place)
frontend/e2e/practice-setup-landing.spec.ts                   — CREATED (Playwright smoke for the landing card)
frontend/components/settings/PracticeSetupCard.tsx            — NOT TOUCHED (other five cards stay static / SSR)
frontend/components/practice-setup/CatalogCardHealthBadge.tsx — NOT TOUCHED (landing card uses a tiny inline amber pill rather than importing the editor-specific variant — the editor badge consumes a `QualityIssue[]` with scope metadata we don't need for a count)
```

**Path deviations from the original plan (2026-04-16):**
- The landing card became its own client component under `components/settings/ServicesLandingCard.tsx` rather than a modification of the existing server-rendered `PracticeSetupCard`. Reason: the landing page is a server component and the other five cards should stay SSR — scoping the `doctorSettings` fetch to a single client island keeps the page fast while still giving the Services row the dynamic summary.
- The `serverReviewIssues` fallback in the task spec doesn't apply — that state is ephemeral editor-page state, not a settings field, so the helper always uses `runLocalCatalogChecks` (same deterministic check the editor's per-card health badge consumes).
- No Jest tests yet (frontend Jest still unwired); Playwright smoke covers the observable behavior.

**Existing Code Status:**
- `runLocalCatalogChecks` from Task 07 is stable and reused unchanged.
- `catalogToServiceDrafts` + `parseConsultationTypesToModalities` are reused unchanged from Task 12.
- No API changes; no new endpoints.

**When updating existing code:**
- [x] Landing card handles all three modes through a single client-side fetch + pure helper — no new props drilled into the shell and the other five cards stay SSR.
- [x] Health badge uses the same amber palette tokens (`bg-amber-100` + `text-amber-900`) as `CatalogCardHealthBadge` so the two surfaces read as the same component family without importing scope-specific editor logic.
- [x] Fallback copy is specific: `"Fee not set · {modalities}"` when single-fee doctors haven't set an amount yet, `"No services yet — add your first service"` when multi-service doctors have an empty catalog, `"Unable to load — click to open services setup"` on fetch failure.

**When creating a migration:**
- [x] No migration in this task.

---

## Design Constraints

- **Pure, testable helper.** The subtitle/CTA/health decision lives in `describeServicesCardState` — a pure function — so tests don't need a DOM.
- **No new fetches.** Server-side review data and catalog are already on `doctorSettings`. Local health check is cheap and synchronous.
- **Mode-explicit copy.** Copy for each mode states what's happening ("Single fee: ₹500") rather than implying (no more "Manage services" label for single-fee doctors).
- **Zero visual regression for multi-service doctors.** Their card keeps the same layout and CTA; the health badge is additive and hidden when no issues.
- **Keep icons minimal.** One icon swap per mode, reusing the existing icon library — no new asset imports.
- **Defer trend/analytics flourishes.** Landing card stays summary-only; everything else is parked in inbox.

---

## Global Safety Gate

- [x] **Data touched?** No writes — the landing card only reads `doctorSettings` via the existing `GET /api/v1/settings/doctor` endpoint.
  - [x] **RLS verified?** N/A (read-only, same endpoint already scoped per-doctor).
- [x] **Any PHI in logs?** No — no `console.log`; fetch failures fall back to a static subtitle.
- [x] **External API or AI call?** No. All three summaries are deterministic and computed client-side.
- [x] **Retention / deletion impact?** None.

---

## Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Services landing card renders the right subtitle + CTA + icon for each of `catalog_mode === null | 'single_fee' | 'multi_service'` (driven by `describeServicesCardState` + `ModeIcon`).
- [x] Multi-service variant shows a health-issue badge only when `runLocalCatalogChecks` returns issues (`HealthBadge` returns `null` for `count <= 0`). `serverReviewIssues` fallback is intentionally dropped — that state doesn't exist on the settings envelope; see the "Path deviations" note above.
- [x] Single-fee variant shows flat fee (`formatMoneyMinor`, matches `/app/book/page.tsx`) + enabled modalities derived from the shared `parseConsultationTypesToModalities` helper (same Task-12 source of truth).
- [x] `null` variant links to `/dashboard/settings/practice-setup/services-catalog`, which is exactly where Task 12's mode selector renders.
- [x] `describeServicesCardState` is a pure helper with no I/O and no React, trivially unit-testable once Jest lands. Playwright smoke added (`e2e/practice-setup-landing.spec.ts`).
- [x] `tsc --noEmit` clean; ESLint clean on all new/changed files; existing E2E smokes untouched.

---

## Related Tasks

- [Task 08 — `catalog_mode` database field](./task-08-catalog-mode-database-field.md) — prerequisite (mode enum).
- [Task 12 — Frontend mode selector](./task-12-frontend-mode-selector.md) — prerequisite (where the CTA lands).
- [Task 07 — Catalog quality checks](./task-07-catalog-quality-checks.md) — provides `runLocalCatalogChecks` and the health-badge pattern.
- [Task 09 — Auto-generated single-service catalog](./task-09-auto-single-service-catalog.md) — provides the fee + modality shape the single-fee subtitle relies on.

---

**Last Updated:** 2026-04-16  
**Pattern:** Read-only mode-aware summary card with pure describe-helper, zero new fetches  
**Reference:** [Plan 03 — Single-fee vs multi-service mode](../Plans/plan-03-single-fee-vs-multi-service-mode.md)
