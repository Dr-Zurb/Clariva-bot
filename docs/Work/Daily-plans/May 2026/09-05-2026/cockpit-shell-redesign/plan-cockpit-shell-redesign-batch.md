# Cockpit shell redesign — 09 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Fresh chat per task, smallest model that can solve the problem, deterministic verifications. Phase A is XS/S Sonnet 4.6 work, Phase B is the only place we need Opus 4.7 (the structural rewrite of the cockpit shell), Phase C is XS/S Sonnet 4.6 polish.

**Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-cockpit-shell-redesign.md`](./Tasks/EXECUTION-ORDER-cockpit-shell-redesign.md).

---

## Why this batch

The morning [`cockpit-polish`](../cockpit-polish/plan-cockpit-polish-batch.md) batch shipped its 9 task-level changes correctly. When the user retested, two structural issues emerged that the cp-NN scope couldn't fix:

1. **Sticky-offset drift causes the new two-row header, the queue rail, the chart rail toggle, and the Rx rail toggle to overlap.** `task-cp-09` made `CockpitHeader` ~24px taller (two-row patient identity with demographics). `CockpitQueueRail` is sticky at `top-[2.75rem]` — calibrated for the previous 44px header. `AppointmentChartRail` and `RxRailToggle` are sticky at `top-12` — also calibrated for the previous header. None of them were updated. Visually, the queue rail now bleeds *into* the header band and the rail toggles bleed into the queue rail.
2. **The page-scroll + sticky shell itself is wrong for a long Rx.** The doctor types into the prescription form and the *whole page* scrolls. Once the form runs past the viewport, the consultation room (video / voice / text) scrolls out of view. The user explicitly asked for the opposite shape: "all three major columns interchangeable and adjustable in width, independent of each other in vertical scroll" — so the patient stays visible no matter how long the Rx grows.

Two tightly-related cosmetic regressions also surfaced:

3. **The chart-rail collapse toggle is `absolute right-1 top-3`** inside `<AppointmentChartRail>` — it bleeds across the column boundary and visually intrudes on the cockpit center. The user called this out as "way out, oddly placed".
4. **The "Mark no-show" link from cp-05 is rendered as a `<button>` inside a `<p>`** in the second row of the new header, pushed right by `ml-auto`. Invalid HTML and visually awkward.
5. **`CockpitHeader` shows `#?` for the OPD token number.** The `getAppointmentById` payload doesn't include `opd_token_number` or `opd_event_type`; only the OPD snapshot does. Solved by widening the appointment payload (mirrors `cp-07` for demographics).

This batch fixes all five in **11 small-to-medium tasks across 3 phases**, runs as **4 parallel-chat lanes** (~12h wall-clock with 4 chats), and ships **no new migrations**.

---

## Decision lock (locked 2026-05-09, copied here for stability)

The following decisions are **frozen** for the duration of this batch. Re-opening them requires a new batch.

- **CS-D1: Replace page-scroll + sticky with fixed-height + per-column scroll on `lg+`.** The cockpit container becomes `h-[calc(100vh-var(--app-header-h)-var(--cockpit-header-h))]` on `lg` and up. Each column (`<AppointmentChartRail>`, the consultation+Rx body, `<RxWorkspace>`) gets `overflow-y-auto`. **Below `lg`** (mobile / tablet) we keep the existing page-scroll + bottom-pill-bar layout — single-column flows don't benefit from independent scroll regions.
- **CS-D2: Use `react-resizable-panels` for the three columns at `lg+`.** Drag handles between columns; widths persist per browser via `autoSaveId="cockpit-shell"`. Each panel has a `minSize` floor (chart rail: 18%, body: 35%, Rx: 22%) so dragging can't collapse a column to nothing — collapse is a discrete user gesture (chevron click), not a 0% drag. Default split is `26 / 48 / 26`.
- **CS-D3: Use shadcn's `Resizable` primitives** (which wrap `react-resizable-panels`). Generated into `frontend/components/ui/resizable.tsx`. Already in our dep tree pattern (we use shadcn elsewhere); no theming friction.
- **CS-D4: Centralize sticky offsets in CSS variables.** `--app-header-h: 56px` (existing global header), `--cockpit-header-h: 76px` (new two-row patient header), `--cockpit-queue-h: 44px` (3-chip strip). Set on `<ConsultationCockpit>`'s root via inline `style`. Replace every `top-12`, `top-[2.75rem]`, `top-3` literal across the cockpit subtree with `top-[var(--…)]` references. One source of truth means future header-height changes don't fan out into 7 files.
- **CS-D5: Move `Mark no-show` from inline header link to the existing `KebabMenu`.** The cp-05 inline `<button>` inside `<p>` becomes a `KebabMenu` item alongside `Reschedule` / `Cancel` / `Open patient profile`. The header second row reverts to demographic-only metadata — clean, no a11y warnings, no `ml-auto-in-a-paragraph` hack. Keyboard shortcut `m` still triggers it from anywhere in the cockpit (existing hotkey, unchanged).
- **CS-D6: Backend payload widening — `opd_event_type` + `opd_token_number` on `getAppointmentById` and `getDoctorAppointments`.** Same shape as cp-07 (demographics): `LEFT JOIN opd_queue_entries oqe ON oqe.appointment_id = a.id` then expose two optional columns on the response. Solves the `#?` rendering. Doctor-scoped only (already enforced by row-level access checks).
- **CS-D7: Replace `<RxRailToggle>` (vertical stub) and the chart-rail absolute chevron with shadcn `<ResizableHandle withHandle>` + a discrete collapse button on each panel header.** The handle gives visual hover affordance for resize; the collapse button gives a deterministic click target for one-tap hide/show. We get both behaviours in the right hands.

Decisions explicitly **not** in scope for this batch (deferred):

- Mobile/tablet shell. The current pill-bar + page-scroll layout stays. A separate batch can revisit small-screen ergonomics if the user requests it.
- Resizable rows (vertical). Only column resize. Vertical regions (consultation room ↔ ready-card ↔ ended-card transitions) stay fixed proportions.
- Drag-and-drop column reordering. Order is fixed: chart, body, Rx (LTR), or Rx, body, chart (RTL — handled at app `dir` level, not by user drag).

---

## Phases

### Phase A — Polish & sticky offsets (5 tasks, ~3h, 3 parallel lanes)

Stop the bleeding before refactoring. These five tasks are independent, low-risk, and unlock a clean baseline for Phase B.

- [`task-cs-01-cockpit-css-variables.md`](./Tasks/task-cs-01-cockpit-css-variables.md) — XS — Centralize sticky offsets into CSS variables on `<ConsultationCockpit>` root; replace literal `top-12` / `top-[2.75rem]` / `top-3` across the cockpit subtree.
- [`task-cs-02-mark-no-show-kebab.md`](./Tasks/task-cs-02-mark-no-show-kebab.md) — S — Move "Mark no-show" from the inline header link (cp-05 invalid HTML) into the existing `KebabMenu`. Header second row reverts to demographics-only.
- [`task-cs-03-appointment-opd-fields-backend.md`](./Tasks/task-cs-03-appointment-opd-fields-backend.md) — S — Backend `getAppointmentById` + `getDoctorAppointments` widening: `opd_event_type`, `opd_token_number`. Mirrors cp-07.
- [`task-cs-04-appointment-opd-fields-frontend.md`](./Tasks/task-cs-04-appointment-opd-fields-frontend.md) — XS — Frontend `Appointment` type mirror; `<CockpitHeader>` consumes the real `opd_token_number` (kills `#?`).
- [`task-cs-05-chart-rail-toggle-position.md`](./Tasks/task-cs-05-chart-rail-toggle-position.md) — S — Reposition chart-rail collapse toggle from `absolute right-1 top-3` into the rail header (in-flow). Style parity with `RxRailToggle`. Visual cleanup for the boundary "bleed" the user flagged.

### Phase B — Independent scroll + resize (3 tasks, ~6h, 1 lane sequential)

The structural rewrite. Sequential by necessity — each task builds on the previous one's output.

- [`task-cs-06-add-resizable-panels-dep.md`](./Tasks/task-cs-06-add-resizable-panels-dep.md) — S — Add `react-resizable-panels` dep + generate shadcn `Resizable` primitives at `frontend/components/ui/resizable.tsx`. No layout changes yet.
- [`task-cs-07-cockpit-shell-fixed-height.md`](./Tasks/task-cs-07-cockpit-shell-fixed-height.md) — **L** — Refactor `<ConsultationCockpit>` desktop shell from `lg:grid lg:grid-cols-12` + `computeColSpans` + page-scroll-with-sticky to a fixed-height flex container with three `overflow-y-auto` columns. Below `lg`, keep the existing layout untouched (`<lg`: page-scroll + pill bar). This is **the** big task in this batch.
- [`task-cs-08-resizable-panels-wiring.md`](./Tasks/task-cs-08-resizable-panels-wiring.md) — M — Wrap the three columns from cs-07 in `<ResizablePanelGroup>` + `<ResizableHandle>`. Replace `<RxRailToggle>` and the chart-rail collapse chevron with panel-API-driven collapse / expand. Add `autoSaveId="cockpit-shell"`. Integrate the hotkey for `[` / `]` (collapse left / right rail).

### Phase C — Polish (3 tasks, ~3h, 3 parallel lanes)

Cleanup that's only sensible *after* the shell is right.

- [`task-cs-09-hide-global-start-consult-on-cockpit.md`](./Tasks/task-cs-09-hide-global-start-consult-on-cockpit.md) — XS — Hide the global "Start consult" button on `/dashboard/appointments/[id]` (it's redundant — the cockpit has its own start CTAs).
- [`task-cs-10-slim-readycard.md`](./Tasks/task-cs-10-slim-readycard.md) — S — Slim `<ReadyCard>` to a single primary CTA + a small "switch modality" text link. Currently has 3 competing CTAs.
- [`task-cs-11-rx-section-nav.md`](./Tasks/task-cs-11-rx-section-nav.md) — M — Sticky section-nav chip strip at the top of `<RxWorkspace>` (Symptoms / Vitals / Diagnosis / Medicines / Tests / Notes) for jump-scroll within the now-independently-scrolling Rx column.

---

## Cross-cutting acceptance gate (whole batch)

Before declaring this batch shipped, all of the following must be true:

- [ ] **No layout overlap on `lg+`.** Header, queue rail, chart rail, body, Rx column all render edge-to-edge with no z-fighting and no sticky bleed. Visual smoke test on 1366×768, 1920×1080, 2560×1440.
- [ ] **The consultation room stays on screen while the Rx scrolls.** Open a video appointment with the Rx form long enough to overflow (add 8+ medicines manually). Scroll the Rx column. Confirm the video tile in the body column does not move and stays interactive.
- [ ] **`Mark no-show` works from the keyboard (`m`) and from the kebab menu.** Both paths land on the same backend call; the inline button from cp-05 is gone.
- [ ] **`CockpitHeader` shows the real OPD token (e.g. `#3`) for queue-mode appointments.** The `#?` placeholder is gone everywhere.
- [ ] **Resize handles work and persist widths.** Drag the left handle to `~30%`, refresh the page, the chart rail still renders at `~30%`. Same for right handle. `localStorage` key `react-resizable-panels:cockpit-shell` is populated.
- [ ] **Collapse buttons hide / show the side rails without jumping the scroll position of any column.** Each column's scroll offset is preserved across collapse / expand cycles.
- [ ] **No regressions on the cp-NN tests.** `cockpit-state.test.ts` (Vitest), `useCockpitHotkeys.test.ts`, and `cockpit-header.test.tsx` (if present) all stay green.
- [ ] **`<lg` mobile / tablet view is byte-identical to before this batch.** The mobile layout uses the same `MobilePillBar` + page-scroll; the only diff in mobile bundles should be the `var(--cockpit-header-h)` substitutions from cs-01.

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| `react-resizable-panels` SSR mismatch (Next.js hydration warning) | M | Use the shadcn `<Resizable>` wrapper, which renders deterministically. Wrap in a `'use client'` boundary at `<ConsultationCockpit>` (already client-only). |
| Saved panel widths get out of sync after a future column reorder | L | `autoSaveId` is "cockpit-shell" — bump the suffix (e.g. `-v2`) any time we change the panel count or order. Document this in `cs-08`. |
| Independent column scrolling traps focus inside one column on Tab | M | Each panel is just a `div` with `overflow-y-auto`; Tab focus order follows DOM, not visual scroll position. Verify in cs-09 acceptance with keyboard nav. |
| Mobile users on a `lg`-sized landscape phone get the desktop shell unexpectedly | L | Tailwind `lg` is `1024px+`. A landscape phone above 1024px wide is rare and the desktop shell still works; don't add a UA sniff. |
| `KebabMenu` migration inadvertently changes hotkey behaviour | M | cs-02 keeps `m` bound to the same action; only the click surface moves. Test with `useCockpitHotkeys.test.ts`. |

---

## Cost estimate

Expected model-mix per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Phase | Tasks | Sonnet 4.6 Medium | Opus 4.7 Thinking-XHigh | Tokens (rough) |
|---|---|---|---|---|
| Phase A | cs-01 → cs-05 | 5/5 | 0/5 | ~30k in / ~40k out |
| Phase B | cs-06 → cs-08 | 1/3 (cs-06) | 2/3 (cs-07, cs-08) | ~80k in / ~120k out |
| Phase C | cs-09 → cs-11 | 3/3 | 0/3 | ~25k in / ~35k out |
| **Total** | **11** | **9** | **2** | **~135k in / ~195k out** |

Cheaper than `cockpit-polish` (which ran 1 Opus task); the bulk of cost is in cs-07 because it touches the cockpit shell at every state transition.

---

## References

- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules
- Style precedent: [`cockpit-polish/plan-cockpit-polish-batch.md`](../cockpit-polish/plan-cockpit-polish-batch.md) — sibling batch from the same day
- Cross-day predecessors:
  - [Daily-plans/May 2026/06-05-2026/plan-cockpit-redesign-batch.md](../../06-05-2026/plan-cockpit-redesign-batch.md) — original cockpit redesign that introduced the state machine + sticky shell this batch refactors.
  - [Daily-plans/May 2026/07-05-2026/plan-patient-flow-batch.md](../../07-05-2026/plan-patient-flow-batch.md) — auto-advance + countdown.
  - [`cockpit-polish/plan-cockpit-polish-batch.md`](../cockpit-polish/plan-cockpit-polish-batch.md) — sibling batch shipped earlier today; cs-NN tasks build on its output.

---

**Status:** `Drafted` 2026-05-09. **Owner:** TBD.
