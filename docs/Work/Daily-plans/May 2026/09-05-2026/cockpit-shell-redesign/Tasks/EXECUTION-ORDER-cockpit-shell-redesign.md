# Cockpit shell redesign — execution order

> Sibling document of [`plan-cockpit-shell-redesign-batch.md`](../plan-cockpit-shell-redesign-batch.md). The plan covers *what* and *why*; this doc covers *who-runs-what-when* and *which model*.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (4 lanes, 3 phases)

```
Wave 1 (Phase A — ~3h, run 3 lanes in parallel):
  Lane α  ──┬── cs-01 (XS, Sonnet 4.6)
            └── cs-05 (S,  Sonnet 4.6)
  Lane β  ──┬── cs-03 (S,  Sonnet 4.6)  [backend]
            └── cs-04 (XS, Sonnet 4.6)  [stitched after cs-03]
  Lane γ  ──── cs-02 (S,  Sonnet 4.6)

Wave 2 (Phase B — ~6h, sequential single lane):
  Lane δ  ──── cs-06 (S, Sonnet 4.6) ──> cs-07 (L, Opus 4.7) ──> cs-08 (M, Opus 4.7)

Wave 3 (Phase C — ~3h, run 3 lanes in parallel):
  Lane α  ──── cs-09 (XS, Sonnet 4.6)
  Lane β  ──── cs-10 (S,  Sonnet 4.6)
  Lane γ  ──── cs-11 (M,  Sonnet 4.6)
```

**Total wall-clock with 3-4 chats running in parallel:** ~12 hours. **Total agent-time (sequential equivalent):** ~21 hours.

The bottleneck is Wave 2 (Phase B) — it's a sequential single-lane wave because cs-07 needs cs-06's deps in place, and cs-08 needs cs-07's restructured shell. There's no honest way to parallelize the structural rewrite.

---

## Lane-by-lane details

### Wave 1 — Phase A

#### Lane α: Sticky offsets + chart-rail toggle (Sonnet 4.6)

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | [cs-01](./task-cs-01-cockpit-css-variables.md) | XS | `ConsultationCockpit.tsx`, `CockpitHeader.tsx`, `CockpitQueueRail.tsx`, `RxRailToggle.tsx`, `AppointmentChartRail.tsx`, `frontend/app/globals.css` | Set `--app-header-h`, `--cockpit-header-h`, `--cockpit-queue-h` variables. Rewrite every `top-12`, `top-[2.75rem]`, `top-3` literal. Visual-only, no behaviour change. |
| 1 | [cs-05](./task-cs-05-chart-rail-toggle-position.md) | S | `AppointmentChartRail.tsx`, `RxRailToggle.tsx` | Reposition the chart-rail toggle from `absolute right-1 top-3` into the rail header (in-flow, matching the `RxRailToggle` aesthetics). Stitch onto cs-01 in the same chat — both touch `AppointmentChartRail.tsx`. |

**Branch suggestion:** `feature/cs-shell-stickyfix`. Single PR for both steps.

#### Lane β: Backend OPD-fields widening + frontend type mirror (Sonnet 4.6)

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | [cs-03](./task-cs-03-appointment-opd-fields-backend.md) | S | `backend/src/services/appointment-service.ts` (`getAppointmentById`, `getDoctorAppointments`), the existing migration `046_opd_queue.sql`, the cp-07 PR (precedent) | Widen the SELECT with `LEFT JOIN opd_queue_entries oqe ON oqe.appointment_id = a.id` exposing `oqe.event_type` AS `opd_event_type` and `oqe.token_number` AS `opd_token_number`. Type-mirror in `backend/src/types/database.ts` and `backend/src/types/appointment.ts`. |
| 1 | [cs-04](./task-cs-04-appointment-opd-fields-frontend.md) | XS | `frontend/types/appointment.ts`, `frontend/components/consultation/cockpit/CockpitHeader.tsx` | Add the two optional fields to the frontend `Appointment` type. Replace the `?` fallback in `<CockpitHeader>` with the real `opd_token_number`. Run `pnpm tsc --noEmit` locally. |

**Branch suggestion:** `feature/cs-appointment-opd-fields`. cs-04 is stitched after cs-03 in the same chat (the change is one-line on the FE — no point starting a new chat).

#### Lane γ: Mark-no-show into KebabMenu (Sonnet 4.6)

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | [cs-02](./task-cs-02-mark-no-show-kebab.md) | S | `CockpitHeader.tsx` (the cp-09 second-row layout + cp-05 mark-no-show button), the existing `KebabMenu` component, `useCockpitHotkeys.ts` | Move the `<button>` from inline (invalid HTML) into a `KebabMenu` item. Verify the `m` keyboard shortcut still works. |

**Branch suggestion:** `feature/cs-mark-no-show-kebab`.

---

### Wave 2 — Phase B (sequential single lane δ)

This is the structural rewrite. Cannot be parallelized.

| Step | Task | Size | Model | Notes |
|---|---|---|---|---|
| 0 | [cs-06](./task-cs-06-add-resizable-panels-dep.md) | S | Sonnet 4.6 | Add the dep + generate the shadcn primitive. Verify no SSR warning in `pnpm dev`. |
| 1 | [cs-07](./task-cs-07-cockpit-shell-fixed-height.md) | **L** | Opus 4.7 Thinking-XHigh | The big task. Replace the desktop grid + sticky model with a fixed-height flex container with three `overflow-y-auto` columns. Mobile/tablet untouched. **Pre-load aggressively** — see cs-07's `Pre-load list` section. **Estimated turns:** 6–10 across multiple iterations. |
| 2 | [cs-08](./task-cs-08-resizable-panels-wiring.md) | M | Opus 4.7 Thinking-XHigh | Wrap the three columns in `<ResizablePanelGroup>` + `<ResizableHandle>`. Replace `RxRailToggle` and chart-rail chevron with panel.collapse() / panel.expand(). Add `autoSaveId="cockpit-shell"`. |

**Branch suggestion:** `feature/cs-shell-redesign`. **Single PR**, since cs-07 + cs-08 produce a layout that's only sensible together.

**Pre-merge gate after cs-08:** the cross-cutting acceptance gate from `plan-cockpit-shell-redesign-batch.md § Cross-cutting acceptance gate (whole batch)` must pass before ANY Wave-3 task starts. Wave 3 is cosmetic-only and shouldn't be the diff that exposes a Phase-B regression.

---

### Wave 3 — Phase C

#### Lane α: Hide global Start consult on cockpit (Sonnet 4.6)

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | [cs-09](./task-cs-09-hide-global-start-consult-on-cockpit.md) | XS | `frontend/components/AppHeader.tsx` (or wherever the global Start consult button lives), `frontend/app/dashboard/appointments/[id]/page.tsx` | Pathname-aware: hide on `/dashboard/appointments/[id]` only. |

#### Lane β: Slim ReadyCard (Sonnet 4.6)

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | [cs-10](./task-cs-10-slim-readycard.md) | S | `ReadyCard.tsx`, the cockpit-state spec for the `ready` state | Single primary CTA (`Start consult`), small text link below (`Switch modality`). |

#### Lane γ: Rx workspace section nav (Sonnet 4.6)

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | [cs-11](./task-cs-11-rx-section-nav.md) | M | `RxWorkspace.tsx`, `PrescriptionForm.tsx` (section structure) | Sticky chip strip at top of `<RxWorkspace>` (Symptoms / Vitals / Diagnosis / Medicines / Tests / Notes). Click jumps to `scrollIntoView({ block: 'start' })` within the column. |

---

## Per-task model picks

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Task | Size | Recommended model | Why |
|---|---|---|---|
| cs-01 | XS | Sonnet 4.6 Medium | CSS variable plumbing — mechanical. |
| cs-02 | S | Sonnet 4.6 Medium | Move a button into an existing menu — one component change. |
| cs-03 | S | Sonnet 4.6 Medium | SQL JOIN + type mirror; mirrors cp-07 precedent. |
| cs-04 | XS | Sonnet 4.6 Medium | Add 2 optional fields to a TS type. |
| cs-05 | S | Sonnet 4.6 Medium | Reposition a button. Cosmetic. |
| cs-06 | S | Sonnet 4.6 Medium | `pnpm add` + copy the shadcn snippet. |
| **cs-07** | **L** | **Opus 4.7 Thinking-XHigh** | **Structural rewrite of the cockpit shell across all 4 cockpit states (idle / ready / inCall / ended) plus mobile branch. Many edge cases.** |
| cs-08 | M | Opus 4.7 Thinking-XHigh | Wires up panel APIs + persistence + collapse buttons; small but the panel API is unfamiliar territory. |
| cs-09 | XS | Sonnet 4.6 Medium | Pathname check + conditional render. |
| cs-10 | S | Sonnet 4.6 Medium | Drop two CTA blocks; promote one. |
| cs-11 | M | Sonnet 4.6 Medium | New component (chip strip) + scroll-into-view wiring. Self-contained. |

---

## Acceptance gates per phase

### Phase A gate (after Wave 1, before Wave 2 starts)

- [ ] `pnpm tsc --noEmit` clean.
- [ ] `pnpm lint` clean for changed files.
- [ ] Visual smoke test: open `/dashboard/appointments/[id]` for an appointment in `idle`, `ready`, `inCall`, and `ended` states. Confirm:
  - No vertical overlap between header / queue rail / chart rail / Rx rail.
  - Chart-rail collapse toggle is in-flow at the rail header (not floating).
  - Mark-no-show is reachable from the kebab menu and from `m` keystroke.
  - `<CockpitHeader>` shows the real OPD token (not `#?`).

### Phase B gate (after Wave 2, before Wave 3 starts)

The full cross-cutting batch acceptance gate from `plan-cockpit-shell-redesign-batch.md § Cross-cutting acceptance gate (whole batch)`. **All checkboxes must be green.**

### Phase C gate (after Wave 3, before merge)

- [ ] All Phase-A and Phase-B gates still green.
- [ ] Global Start-consult is hidden on `/dashboard/appointments/[id]`.
- [ ] `<ReadyCard>` shows one primary CTA + one text link.
- [ ] `<RxWorkspace>` shows the section-nav chip strip; clicking each chip scrolls the Rx column to the right section without scrolling the page.
- [ ] No regression on the cp-NN tests.

---

## Cost estimate

Expected model-mix per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Wave | Tasks | Sonnet 4.6 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|
| Wave 1 | cs-01, 02, 03, 04, 05 | 4 | 0 | ~3h |
| Wave 2 | cs-06, 07, 08 | 1 | 2 (long) | ~6h |
| Wave 3 | cs-09, 10, 11 | 3 | 0 | ~3h |

---

## References

- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules and chat heuristics
- Style precedent: [`cockpit-polish/Tasks/EXECUTION-ORDER-cockpit-polish.md`](../../cockpit-polish/Tasks/EXECUTION-ORDER-cockpit-polish.md) — sibling exec-order doc from earlier today
- Cross-day:
  - [Daily-plans/May 2026/06-05-2026/Tasks/task-cockpit-2-shell.md](../../../06-05-2026/Tasks/task-cockpit-2-shell.md) — original cockpit shell that this batch refactors.
  - [Daily-plans/May 2026/07-05-2026/Tasks/task-pf-08-cockpit-queue-rail.md](../../../07-05-2026/Tasks/task-pf-08-cockpit-queue-rail.md) — the queue rail whose sticky offset cs-01 fixes.
