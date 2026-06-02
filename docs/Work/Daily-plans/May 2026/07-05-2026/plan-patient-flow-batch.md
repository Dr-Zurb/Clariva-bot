# Batch — Patient seeing flow (07 May 2026)

> **Status:** `Shipped` 2026-05-08 (implementation + task docs synced).
> **Source plan:** [Product plans/plan-patient-seeing-flow.md](../../../Product%20plans/plan-patient-seeing-flow.md).
> **Execution order (authoritative):** [Tasks/EXECUTION-ORDER-patient-flow.md](./Tasks/EXECUTION-ORDER-patient-flow.md).
> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
> **Effort:** ~5 dev-days serial · ~2.5 calendar days with 4 parallel chats.

---

## What this batch ships

The cockpit redesign batch (06 May 2026) nailed the **inside** of a consultation. This batch closes the **seam between two consultations**:

1. **Wrap-up checkpoint (Phase 1)** — explicit "Done with patient" CTA flips `appointments.status → completed`, persists diagnosis + follow-up, atomically ends the consultation session. Replaces the buried kebab `Mark completed` item.
2. **Cockpit queue rail + auto-advance (Phase 2)** — thin horizontal strip in `CockpitHeader` shows `#4 of 12 · 3 done · ‹ Asha P (now) · Mohit K (next) ›`. After wrap-up, a 5-second cancellable countdown auto-advances to the next patient. Telemed / slot doctors get the same UX, sourced from `useTodaysAppointments`.
3. **Visual differentiation (Phase 3)** — `OpdQueueStrip` and `TodaysSchedule` render outcome (`done` / `live` / `late` / `no-show`) instead of time-pastness. Plus QoL: keyboard shortcuts, prefetch next chart, "Running behind" badge, walk-in fast path, auto-no-show worker, end-of-day card.

---

## Decision lock (from source plan, copied here for stability)

| ID | Decision | Source |
|---|---|---|
| **P-D1** | Explicit "Done with patient" CTA owns appointment completion. | locked 2026-05-07 |
| **P-D2** | Auto-advance default = 5 s cancellable countdown. | locked 2026-05-07 |
| **P-D3** | Queue rail = thin top strip in `CockpitHeader`, not a side rail. | locked 2026-05-07 |
| **P-D4** | Wrap-up mandatory fields = diagnosis (free text + chips) + follow-up (chips). | locked 2026-05-07 |
| **P-D5** | Queue rail renders for telemed / slot doctors too (`useTodaysAppointments`). | locked 2026-05-07 |
| **P-D6** | Completed entries stay visible, greyed; behind a `Done (3) ▾` disclosure when `>5`. | locked 2026-05-07 |
| **P-D7** | Auto-no-show is opt-in, default off, configurable per doctor. | locked 2026-05-07 |

Revisiting any of these belongs in a new `Decision:` block on the affected source-plan item with a clear `Modify` rationale.

---

## Phases

### Phase 1 — Wrap-up keystone (5 tasks · ~1 dev-day)

| Task | Source-plan ID | Effort | Surface |
|---|---|---|---|
| [pf-01 — wrap-up migration](./Tasks/task-pf-01-wrapup-migration.md) | P1.4 | XS (~0.25d) | Backend migration |
| [pf-02 — wrap-up backend endpoint](./Tasks/task-pf-02-wrapup-backend.md) | P1.2 | S (~0.5d) | Backend controller / service / route |
| [pf-03 — cockpit state: add `wrap_up`](./Tasks/task-pf-03-cockpit-state-wrapup.md) | P1.3 | XS (~0.5d) | Frontend helper |
| [pf-04 — `<WrapUpDialog>` component](./Tasks/task-pf-04-wrapup-dialog.md) | P1.1 | M (~0.5d) | Frontend component |
| [pf-05 — header "Done" CTA + retire kebab item](./Tasks/task-pf-05-cockpit-header-done-cta.md) | P1.5 | XS (~0.5d) | Frontend |

**Phase 1 gate:** `pf-04` opens, `pf-02` returns 200 on a real appointment, `appointments.status` flips to `completed`, kebab "Mark completed" gone.

### Phase 2 — Queue rail + auto-advance (6 tasks · ~1.5 dev-days)

| Task | Source-plan ID | Effort | Surface |
|---|---|---|---|
| [pf-06 — fix `useOpdSnapshot` enum drift + widen](./Tasks/task-pf-06-opd-snapshot-enum-fix.md) | P4.1 | XS (~0.25d) | Frontend hook |
| [pf-07 — `useDoctorDayPipeline()` adapter](./Tasks/task-pf-07-doctor-day-pipeline-hook.md) | P2.2 | S (~0.5d) | Frontend hook |
| [pf-08 — `<CockpitQueueRail>` + nav + counter](./Tasks/task-pf-08-cockpit-queue-rail.md) | P2.1, P2.3, P2.4 | M (~1d) | Frontend component |
| [pf-09 — `doctor_settings.patient_flow_advance` + Settings UI](./Tasks/task-pf-09-doctor-settings-flow-advance.md) | P3.3 | S (~0.5d) | Backend migration + frontend |
| [pf-10 — `useNextAppointmentRoute()` hook](./Tasks/task-pf-10-next-appointment-route-hook.md) | P3.2 | XS (~0.25d) | Frontend hook |
| [pf-11 — `<NextPatientCountdown>` overlay](./Tasks/task-pf-11-next-patient-countdown.md) | P3.1 | S (~0.5d) | Frontend component |

**Phase 2 gate:** queue rail visible in cockpit; clicking a token re-mounts cockpit on that appointment; after wrap-up, 5 s countdown auto-routes to next patient (or shows EOD card).

### Phase 3 — Visual + QoL (7 tasks · ~1.5 dev-days)

| Task | Source-plan ID | Effort | Surface |
|---|---|---|---|
| [pf-12 — `OpdQueueStrip` STATUS_META + summary](./Tasks/task-pf-12-opd-strip-extension.md) | P4.2 | S (~0.5d) | Frontend |
| [pf-13 — `TodaysSchedule` outcome rows + inline no-show](./Tasks/task-pf-13-todays-schedule-outcomes.md) | P4.3, P4.4 | M (~1d) | Frontend |
| [pf-14 — keyboard shortcuts + "Running behind" badge](./Tasks/task-pf-14-cockpit-micro-shortcuts.md) | P5.1, P5.3 | XS (~0.5d) | Frontend |
| [pf-15 — prefetch next patient's chart](./Tasks/task-pf-15-prefetch-next-chart.md) | P5.2 | S (~0.5d) | Frontend |
| [pf-16 — "+ Walk-in" fast path](./Tasks/task-pf-16-walkin-fast-path.md) | P5.4 | S (~0.5d) | Frontend |
| [pf-17 — auto-no-show worker](./Tasks/task-pf-17-auto-noshow-worker.md) | P5.5 | S (~0.5d) | Backend worker |
| [pf-18 — end-of-day summary card](./Tasks/task-pf-18-end-of-day-summary.md) | P5.6 | XS (~0.25d) | Frontend |

**Phase 3 gate:** OPD strip header reads `3 done · 1 in consult · 8 waiting`; today's schedule rows colour by outcome; auto-no-show worker safely no-ops when setting is NULL.

---

## Whole-batch acceptance gate

Run the following after all 3 phase gates close. One Opus chat, paste full diff, ask for the final grade.

```
- [ ] Wrap-up dialog opens from header "Done with patient" CTA at any state ∈ {live, wrap_up}.
- [ ] Wrap-up endpoint atomically flips appointment + ends session + persists diagnosis/follow-up.
- [ ] Cockpit queue rail visible in queue mode AND in slot/telemed mode (P-D5).
- [ ] Completed appointments stay visible (greyed) in OpdQueueStrip and queue rail (P-D6).
- [ ] After Send Rx → Done with patient → 5 s countdown → next cockpit interactive in ≤2 s with prefetched chart.
- [ ] Doctor can opt out of countdown via Settings → instant or manual.
- [ ] Auto-no-show worker no-ops when doctor_settings.auto_no_show_after_min IS NULL (P-D7 default).
- [ ] Inline "Mark no-show" works on stale-but-pending Today's Schedule rows.
- [ ] Kebab "Mark completed" item retired; <MarkCompletedForm> deleted; no orphan imports.
- [ ] No regressions in: cockpit redesign batch (06-05-2026) acceptance gates, prescription send pipeline, modality switching.
- [ ] Type-check + lint clean across frontend and backend.
- [ ] All migrations apply cleanly on a fresh database (P1.4, P3.3).
```

---

## Open questions (carry from source plan; lock before merging)

| ID | Question | Recommendation | Owner |
|---|---|---|---|
| P-Q1 | ICD-10 / SNOMED migration path for `diagnosis_tags`. | Parallel column when ICD lands; keep free-text. | Defer until T-something. |
| P-Q2 | `wrap_up` lifetime — auto-complete after 24 h with empty diagnosis? | Yes, with system note. | pf-17 owner can implement alongside auto-no-show worker. |
| P-Q3 | Wrap-up for cancelled / no-show appointments? | Skip the dialog for these states. | pf-04 owner — covered in spec. |
| P-Q4 | Telemetry events for the flow. | `cockpit.wrap_up.{opened,completed}`, `cockpit.next_patient.advanced`, `cockpit.queue_rail.token_clicked`. PHI-free counts only. | Out of batch — track in inbox. |
| P-Q5 | Telehealth wrap-up parity. | Show passive "We'll DM the chat history" line; no toggle. | pf-04 owner — covered in spec. |

---

## References

- [Product plans/plan-patient-seeing-flow.md](../../../Product%20plans/plan-patient-seeing-flow.md) — source plan (the **what**).
- [Tasks/EXECUTION-ORDER-patient-flow.md](./Tasks/EXECUTION-ORDER-patient-flow.md) — execution order (the **how**, multi-chat lane matrix).
- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules and chat heuristics.
- [Daily-plans/May 2026/06-05-2026/plan-cockpit-redesign-batch.md](../06-05-2026/plan-cockpit-redesign-batch.md) — predecessor batch (cockpit shell this batch extends).

---

**Created:** 2026-05-07. **Status:** `Shipped` 2026-05-08. **Owner:** TBD.
