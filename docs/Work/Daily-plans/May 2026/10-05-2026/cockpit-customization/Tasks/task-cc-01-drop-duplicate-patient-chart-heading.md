# Task cc-01: Drop the duplicate "Patient chart" heading

## 10 May 2026 — Batch [Cockpit customization](../plan-cockpit-customization-batch.md) — Phase A, Lane α — **XS, ~30min**

---

## Task overview

The cockpit's chart rail renders **two** "Patient chart" headings on every desktop appointment view. Reproducible right now: open `/dashboard/appointments/[id]` for any appointment with a patient — the chart column shows "Patient chart" at the top of the in-flow rail header, then again immediately below as the panel's own heading.

This is a regression from yesterday's `cs-05` (chart-rail toggle position task). cs-05 added a new `<header>` block to `<AppointmentChartRail>` to host the in-flow collapse chevron. The header includes its own `<h3>Patient chart</h3>` title. But `<PatientChartPanel>` — the component the rail wraps — already renders **its own** `<h2>Patient chart</h2>` block at the top. cs-05 didn't drop the panel's heading, so they're rendered back-to-back.

The fix is one conditional: gate `<PatientChartPanel>`'s own header on `layout !== "desktop"`. The desktop layout (rail-hosted, cockpit context) has the column header above it — the panel's own heading is redundant. The `mobile` layout (bottom-sheet) keeps the heading because there's no column header above it.

**Estimated time:** ~30 min (5 min code, 10 min visual verification, 15 min unit-test update if one exists for `PatientChartPanel`).

**Status:** Done.

**Hard deps:** none.

**Source:** [plan-cockpit-customization-batch.md § CC-D8](../plan-cockpit-customization-batch.md#decision-lock-locked-2026-05-10-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat. Pre-load:
- This task file.
- `frontend/components/ehr/PatientChartPanel.tsx` (the file you'll edit; the heading lives at lines ~118–130).
- `frontend/components/ehr/AppointmentChartRail.tsx` (read-only — confirm the rail's own header is the canonical heading in desktop layout).

**Estimated turns:** 1 turn.

---

## Acceptance criteria

### Conditional render in `PatientChartPanel`

- [ ] In `frontend/components/ehr/PatientChartPanel.tsx`, find the `<header>` block that wraps the `<h2>Patient chart</h2>`. The current shape is something like:

  ```tsx
  <header className="mb-2 flex items-center justify-between">
    <h2 className={…}>Patient chart</h2>
  </header>
  ```

- [ ] Wrap the `<header>` in a layout-aware condition:

  ```tsx
  {layout !== "desktop" && (
    <header className="mb-2 flex items-center justify-between">
      <h2 className={…}>Patient chart</h2>
    </header>
  )}
  ```

  - **Why gate on `layout !== "desktop"` instead of dropping the header outright?** The mobile bottom-sheet (`layout === "mobile"`) and the in-call mini-panel (`layout === "in-call"`) usages don't have a column-header above them. Removing the heading entirely would leave those contexts headless. Conditioning on layout is the right surgical fix.
  - **Why keep the `mb-2` margin spacing?** The margin only renders when the header renders, so removing the header conditionally also removes the spacing — exactly the desired behaviour.

### Test update (if a panel test exists)

- [ ] Search for an existing test file: `rg -l "PatientChartPanel" frontend/`.
- [ ] If `frontend/components/ehr/__tests__/PatientChartPanel.test.tsx` (or similar) exists:
  - Add an assertion: rendering with `layout="desktop"` does NOT render an `<h2>Patient chart</h2>`.
  - Add an assertion: rendering with `layout="mobile"` DOES render the heading (regression guard for the bottom-sheet case).
- [ ] If no test exists, document this in the PR description (don't create a new test file just for this — the visual verification covers it).

### Type-check + lint

- [ ] `pnpm --filter frontend tsc --noEmit` is clean.
- [ ] `pnpm --filter frontend lint` — no new warnings on the touched file.

### Manual verification

- [ ] Open `/dashboard/appointments/[id]` for an appointment in `ready` state. Confirm:
  - "Patient chart" appears **exactly once** at the top of the chart rail (the in-flow header from `AppointmentChartRail`).
  - The first section ("Allergies") is immediately below the header with the existing visual gap (the AppointmentChartRail header's `border-b` line).
- [ ] Open the same page on a mobile viewport (use DevTools responsive mode, ≤1023px). The chart bottom sheet still has its own "Patient chart" heading (the mobile branch).

---

## Out of scope

- **Renaming the heading** — "Patient chart" stays. If we want to change to e.g. "Patient summary", that's a different task.
- **Changing the heading style** — the desktop rail header's `text-sm font-semibold` is fine. Mobile keeps its `text-base font-semibold`.
- **Removing the panel's own heading entirely** — the mobile / in-call layouts still need it. Hence the `layout !== "desktop"` gate, not an outright deletion.
- **Refactoring the AppointmentChartRail's own header** — that's cc-02's job (lift the header into a shared `<CockpitColumnHeader>` component).

---

## Files expected to touch

**Modified:**
- `frontend/components/ehr/PatientChartPanel.tsx` (~3 LOC delta — wrap one block in a condition).
- `frontend/components/ehr/__tests__/PatientChartPanel.test.tsx` if it exists (~10 LOC delta — two new it-blocks).

**New:** none.

---

## Notes / open decisions

1. **Why this is a separate task from cc-02 (the column-header refactor)?** cc-02 lifts the rail's header into a shared component — but even after cc-02 ships, the `<PatientChartPanel>` heading would still render below it. The deduplication is logically separate from the lifting. Shipping cc-01 standalone gives an immediate user-visible win on day-one of this batch; cc-02 lands later.
2. **Could we just remove the `<h2>` from `PatientChartPanel` outright?** No — the mobile bottom-sheet (`layout === "mobile"`) renders the panel without any rail wrapping it. Removing the heading would leave a headless mobile sheet. The `layout` prop is already there; the gate is the right shape.
3. **Why not use `aria-labelledby` to point both at the same id?** Overengineering for a single-line conditional. The doctor sees one heading; AT users get one labelled region. No accessibility regression.

---

## References

- **Affected files:**
  - `frontend/components/ehr/PatientChartPanel.tsx` (lines ~118–130 — the `<header>` block)
- **Source of the regression:** [Daily-plans/May 2026/09-05-2026/cockpit-shell-redesign/Tasks/task-cs-05-chart-rail-toggle-position.md](../../../09-05-2026/cockpit-shell-redesign/Tasks/task-cs-05-chart-rail-toggle-position.md) — added the rail's in-flow header without dropping the panel's own.
- **Stitched follow-up:** [`task-cc-02-cockpit-column-header-component.md`](./task-cc-02-cockpit-column-header-component.md) — replaces the rail's bespoke header with a shared component (different chat, different PR).

---

**Owner:** TBD
**Created:** 2026-05-10
**Status:** Done — fix was already applied in `PatientChartPanel.tsx` (line 120: `{layout !== "desktop" && …}`). No `PatientChartPanel.test.tsx` exists; per spec, no new test file was created.
