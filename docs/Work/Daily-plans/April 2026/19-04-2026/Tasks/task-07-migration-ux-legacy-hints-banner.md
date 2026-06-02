# Task 07: Migration UX — legacy hints banner + read-only legacy display

## 19 April 2026 — Plan [Service catalog matcher routing v2](../Plans/plan-service-catalog-matcher-routing-v2.md) — Phase 1.5

---

## Task overview

While doctors still have **only** legacy `keywords` / `include_when` (no `examples`), the UI should:

1. **Show** that routing will keep working via the **resolver** (Task 03) until they migrate.
2. Optionally **surface** legacy text as **read-only** (collapsed section or “Legacy hints — edit by converting to example phrases”) so nothing is hidden.
3. **Banner** (one-time dismissible or persistent until first save with examples): short explanation + link to internal help / Task 01 doc if available.

After the doctor adds **example phrases** and saves, legacy fields may remain in JSON until a later deprecation task — product decision: **clear legacy on save** vs **keep for audit** — document in PR.

**Estimated time:** 3–6 hours

**Status:** Done

**Depends on:** Task 06 (same card UI)

**Plan:** [plan-service-catalog-matcher-routing-v2.md](../Plans/plan-service-catalog-matcher-routing-v2.md)

---

## Acceptance criteria

- [x] No “empty” matcher UX for legacy-only rows — doctor sees either migrated examples or clear legacy + CTA.
- [x] Copy is non-alarming (resolver still matches legacy data).
- [x] E2E or component test optional — manual QA checklist in PR if tests not added (see QA checklist below).

---

## Out of scope

- Bulk admin script to convert all doctors’ catalogs (post–v2 stable; optional follow-up).

---

## References

- Task 06 — primary editor changes
- Plan Phase 1.5 — migration notes

---

## Product decision (locked in this PR)

> **Clear legacy on save** — when a row's `matcherExamples` becomes non-empty,
> `draftsToCatalogOrNull` writes only `matcher_hints.examples` (+ `exclude_when`)
> and intentionally drops legacy `keywords` / `include_when`.

Rationale:

- The resolver (`backend/src/utils/matcher-routing-resolve.ts`) already prefers
  `examples` when present, so dual-writing both legacy + v2 fields would be a
  silent dual-write — exactly the overlap this plan exists to remove.
- Audit value of legacy text is low: it was free-text the doctor typed, not a
  derived signal. The doctor still sees the legacy values in the per-card
  callout *before* converting; once converted (and saved), the v2 list is the
  truthful representation of routing intent.
- An always-visible migration callout (Task 07, this task) replaces the
  Task 06 `<details>` disclosure so the doctor never accidentally clears
  meaningful information without seeing it first.

Reverting the decision later (e.g. keep legacy for post-mortems) is a single
two-line change in `draftsToCatalogOrNull` — the writer's the only place that
emits the v2 / legacy split.

---

## Shipped

| Concern | Change |
| --- | --- |
| Helper | `convertLegacyHintsToExamples(draft)` added to `frontend/lib/service-catalog-drafts.ts` — splits `matcherKeywords` on `[,;\n]+` and `matcherIncludeWhen` on `\r?\n`, merges with any existing `matcherExamples`, runs through `normalizeMatcherExamplesDraft` (trim, dedupe case-insensitive, clamp to 24 × 120 chars), and zeros both legacy fields. Pure function — caller swaps the result into state and the doctor still has to hit Save. |
| Drawer per-card UX | `ServiceOfferingDetailDrawer.tsx` replaces the Task 06 `<details>` disclosure with an **always-visible migration callout** (`data-testid="drawer-legacy-hints-migration-callout"`) for legacy-only rows. Three pieces inside: (1) non-alarming explainer ("routing keeps working — assistant uses Keywords / Book this service when… text below until you add Example phrases above"), (2) one-tap **Convert to example phrases** button (`data-testid="drawer-convert-legacy-hints"`) that calls `convertLegacyHintsToExamples`, (3) the editable Keywords + Book-when textareas, kept open (no longer behind a `<details>`) so the row is never blank-looking. Footnote line restates the save-time clear semantics. |
| `hasUnmigratedLegacyHints` exported | Now exported from `ServiceOfferingDetailDrawer.tsx` (was `function` only) so the page-level banner uses the same precedence rule as the per-card callout — single source of truth, mirrors the backend resolver. |
| Catalog-level banner | `app/dashboard/settings/practice-setup/services-catalog/page.tsx` adds a compact dismissible banner (`data-testid="catalog-routing-v2-migration-banner"`) above the multi-service editor's action row. Shown only when (a) at least one row has only-legacy hints AND (b) the doctor hasn't dismissed it on this browser before. Pluralized count copy ("1 service…" / "N services…"). Dismissal persists in `localStorage` under `clariva.routing-v2-migration-banner.dismissed`; the banner also auto-hides when the count hits 0 (every row migrated), so a doctor with no legacy rows never sees it. |
| Failure modes handled | localStorage may throw in private mode / quota errors — both `useEffect` (read) and `dismissRoutingV2Banner` (write) wrap in `try/catch` and fail open (banner shows). Non-fatal; banner reappears on next visit if write failed, doctor can dismiss again. |
| Single-fee mode | Banner is gated on the `multi_service` JSX branch so single-fee doctors (whose catalog is auto-generated and has no matcher hints) never see it. |

### Verification

- Frontend `npx tsc --noEmit` — clean.
- Frontend `npx next lint --dir lib --dir components/practice-setup --dir app/dashboard/settings/practice-setup` — clean.
- Backend untouched — no test re-run required (`tsc` + lint pass on touched files only); previous backend baseline (1010/1010 from Task 06) holds.
- Grep across `frontend/`: only writer of `matcher_hints.keywords` is still the legacy fallback branch of `draftsToCatalogOrNull` (un-migrated rows only). Confirmed.

### Files touched

- `frontend/lib/service-catalog-drafts.ts` — `convertLegacyHintsToExamples` helper.
- `frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx` — migration callout replaces `<details>`; `hasUnmigratedLegacyHints` exported.
- `frontend/app/dashboard/settings/practice-setup/services-catalog/page.tsx` — catalog-level banner state + render.

---

## Manual QA checklist (done in this PR / for reviewer to re-run)

1. **Legacy-only row, drawer**
   - Open a card with `keywords` / `include_when` populated and `examples` empty.
   - The amber "This service still uses older matching hints" callout appears (always visible — not collapsed).
   - The Keywords + Book this service when… textareas are visible underneath and editable.
   - Click **Convert to example phrases** → Example phrases textarea fills with the comma/newline-split list, both legacy textareas clear, the callout disappears (since `cardHasLegacyOnly` is now false).
   - Save the page → catalog persists with `matcher_hints.examples` only (no `keywords` / `include_when`); confirm via API or DB.
2. **Mixed row (examples + legacy already populated)**
   - The callout does **not** show (resolver prefers examples; `draftsToCatalogOrNull` already drops legacy on save).
   - Sparkle button still works (re-run AI / diff modal renders examples row).
3. **Pure v2 row (examples only)**
   - The callout does **not** show.
4. **Catalog-level banner — count + dismiss**
   - With ≥1 legacy-only row, the amber catalog banner shows above the action buttons with the correct pluralized count.
   - Click **Dismiss** → banner hides; reload the page; banner stays hidden (localStorage persistence).
   - Convert all legacy rows via the per-card CTA (or migrate them manually) → banner auto-hides because count is 0.
   - In a different browser / incognito → banner shows again (per-browser dismissal, no server state).
5. **Single-fee mode**
   - Switch to single-fee mode → banner does not render (different JSX branch).
6. **Empty catalog / catch-all only**
   - Catch-all is `flexible` and never has matcher hints → no callout, no banner.
7. **Non-blocking on save errors**
   - If converting and the doctor leaves without saving (UnsavedLeaveGuard) → leave guard fires as expected because `isDirty` flips on convert.
