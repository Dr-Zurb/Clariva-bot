# Batch — OPD queue redesign (08 May 2026)

> **Status:** `Drafted` 2026-05-08.
> **Source:** screenshot review on 2026-05-08 (Ask-mode walkthrough), backed by code reads of `frontend/components/opd/DoctorQueueBoard.tsx`, `backend/src/services/opd-doctor-service.ts`, `backend/src/routes/api/v1/opd.ts`, and `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx`.
> **Execution order (authoritative):** [Tasks/EXECUTION-ORDER-opd-queue.md](./Tasks/EXECUTION-ORDER-opd-queue.md).
> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
> **Effort:** ~4.5 dev-days serial · ~2 calendar days with 4 parallel chats.

---

## What this batch ships

The doctor's OPD queue page (`/dashboard/opd-today` → `<DoctorQueueBoard>`) becomes a clinical-grade dense table that the doctor actually wants to live on for an entire session.

1. **Drop initials masking; show full PHI on the doctor's queue (Phase 1).** Backend `DoctorQueueSessionRow` widens to expose `patientName`, `medicalRecordNumber`, `patientPhone`, `age`, `gender`, `reasonForVisit`, `serviceLabel`, `consultationType`, `scheduledAt`, `queueCreatedAt`, `episodeId`, `opdEventType`. The "Initials only" rule from `e-task-opd-06` was a misapplied PHI restriction on a doctor-scoped surface; this batch corrects it and documents the privacy decision so future engineers don't reapply it. A future patient-facing waiting-room display gets its own endpoint with its own privacy rules — not this one.
2. **Dense table refactor (Phase 2).** Replace the current 5-column 52 px-row table with a 12-column ~32 px-row dense table (Linear / CRM density). Status grouping (Active / Done / Missed) with disclosures. Sticky header. Status meta from `getOpdStatusMeta`. Inline expand for last-visit / allergies / episode without leaving the page. Wires to `useOpdSnapshot` so the page and the cockpit strip share one source of truth (no drift, visibility-aware polling).
3. **Filters + search (Phase 3).** Status segmented control (All / Waiting / Called / In consult / Done / No-show / Skipped) with counts. Search box (name / phone / token / MRN). URL-param persistence for shareable / refreshable filtered views.
4. **Action consolidation (Phase 4).** Single primary `Open` per row that auto-marks `waiting → called` (fixes the user complaint that `Open` and `Call` are two buttons doing the work of one). Whole-row click target. Overflow `⋯` menu collapses the four secondary actions: `Mark called silently` (the rare assistant-led flow), `Requeue after current`, `Send to end of queue`, `Mark as no-show`. The bare `Skip` button is gone.
5. **Session controls + density + polish (Phase 5).** Session-level toolbar exposes `Broadcast delay` and `Offer early join` actions on this page (today they're only reachable from appointment detail). Density toggle (Compact / Default) persisted to localStorage. Mobile 2-line card fallback below `lg`. Keyboard shortcuts (`J/K/Enter/C/S/⋯//`). Telemetry (PHI-free counts).

**Out of scope for this batch:** patient-facing waiting-room TV display (its own endpoint + privacy rules); receptionist-facing queue (different role); reordering / drag-to-reorder tokens; multi-doctor pooled queues. Tracked in source-plan follow-ups.

---

## Decision lock (locked 2026-05-08, copied here for stability)

| ID | Decision | Why |
|---|---|---|
| **OQ-D1** | Doctor's OPD queue rows show **full** patient name + MRN + phone + age/gender. Initials masking is removed. | Doctor JWT scopes the endpoint; doctor sees full PHI on every adjacent surface. Initials cause real clinical-safety risk (collisions). |
| **OQ-D2** | Single primary action per row = **Open** (auto-marks `waiting → called`, idempotent). Whole row is the click target. | The bare `Open + Call + Skip` triplet was a UX tax with no payoff — `called` triggers no notification and exists only as a state marker. |
| **OQ-D3** | "Skip" button is **retired**. The four real outcomes — `Mark called silently`, `Requeue after current`, `Send to end of queue`, `Mark as no-show` — live in a row-level overflow menu. | `skipped` enum stays in the DB as a valid intermediate state; doctors don't need a button for it. Current `Skip` is destructive-feeling and ambiguous. |
| **OQ-D4** | Row height target = **~32 px (Default)** / **~28 px (Compact)**. Row is single-line; reason / service have hover-tooltips for full text. | An 80-patient day must fit in one screen with grouping; "the doctor never scrolls to find the next person to see." |
| **OQ-D5** | Entries are visually **grouped** by status (`Active` always at top, sticky; `Done today (N)` and `No-show / skipped (N)` collapsible). Done collapses by default when `N > 10`. Missed collapses by default when `N > 5`. | Mirrors `OpdQueueStrip` so the cockpit strip and full page have identical grouping semantics. |
| **OQ-D6** | The page consumes `useOpdSnapshot` (the same hook the cockpit strip uses). 30 s visibility-aware polling, single source of truth. | Eliminates the strip ↔ page drift bug. Removes the bespoke 15 s `setInterval` in `DoctorQueueBoard.tsx`. |
| **OQ-D7** | The page is **doctor-only** PHI surface. Any future receptionist / kiosk / waiting-room display gets its **own** endpoint with its own privacy rules. The widened `/opd/queue-session` endpoint stays gated by the doctor JWT. | Documents the boundary so the privacy decision isn't accidentally re-applied. |

Revisiting any of these belongs in a new `Decision:` block on the affected task spec with a clear `Modify` rationale.

---

## Phases

### Phase 1 — Backend widening (1 task · ~0.5 dev-day)

| Task | Source decision | Effort | Surface |
|---|---|---|---|
| [oq-01 — widen `DoctorQueueSessionRow` API; drop initials masking](./Tasks/task-oq-01-backend-widen-queue-api.md) | OQ-D1, OQ-D7 | S (~0.5d) | Backend service + types |

**Phase 1 gate:** `GET /v1/opd/queue-session?date=…` returns `patientName`, `medicalRecordNumber`, `patientPhone`, `age`, `gender`, `reasonForVisit`, `serviceLabel`, `consultationType`, `scheduledAt`, `queueCreatedAt`, `episodeId`, `opdEventType` for each row. `patientLabel` is removed from the type. Response is still doctor-scoped via existing JWT + ownership checks.

### Phase 2 — Dense table refactor (5 tasks · ~2 dev-days)

| Task | Source decision | Effort | Surface |
|---|---|---|---|
| [oq-02 — frontend types + api client mapping](./Tasks/task-oq-02-frontend-types-update.md) | OQ-D1 | XS (~0.25d) | Frontend types + `lib/api.ts` |
| [oq-03 — `<OpdQueueDenseRow>` single-row component](./Tasks/task-oq-03-dense-row-component.md) | OQ-D2, OQ-D4 | M (~0.75d) | Frontend component |
| [oq-04 — `<OpdQueueTable>` shell + grouping + sticky header](./Tasks/task-oq-04-table-shell-grouping.md) | OQ-D5 | M (~0.5d) | Frontend component |
| [oq-05 — `<OpdQueueRowExpanded>` inline-expand panel](./Tasks/task-oq-05-row-expanded-panel.md) | OQ-D4 | S (~0.5d) | Frontend component |
| [oq-06 — wire page to `useOpdSnapshot`](./Tasks/task-oq-06-wire-opd-snapshot.md) | OQ-D6 | XS (~0.25d) | Frontend hook wiring |

**Phase 2 gate:** Visiting `/dashboard/opd-today` shows a single dense table with full names, MRN, phone, status dot, modality icon, scheduled time, and waited-time. Active rows always at top. `useOpdSnapshot` is the only data source. The bespoke `setInterval(load, 15s)` in `DoctorQueueBoard.tsx` is gone. `<DoctorQueueBoard>` itself is deleted (or thin-wraps `<OpdQueueTable>` for backwards compat — pick one in oq-04).

### Phase 3 — Filters & search (2 tasks · ~0.75 dev-day)

| Task | Source decision | Effort | Surface |
|---|---|---|---|
| [oq-07 — status segmented control + counts](./Tasks/task-oq-07-status-filter.md) | OQ-D5 | S (~0.5d) | Frontend |
| [oq-08 — search box (name / phone / token / MRN)](./Tasks/task-oq-08-search-box.md) | OQ-D5 | XS (~0.25d) | Frontend |

**Phase 3 gate:** Status filter chips with live counts; clicking one narrows visible rows + flips section visibility. Search box filters across name / phone (digits-only match) / token (`#NN` literal) / MRN. Filter state persists in URL params (`?status=waiting&q=ravi`).

### Phase 4 — Actions & overflow (2 tasks · ~0.75 dev-day)

| Task | Source decision | Effort | Surface |
|---|---|---|---|
| [oq-09 — frontend api clients for `requeue` + `markNoShow`](./Tasks/task-oq-09-frontend-action-clients.md) | OQ-D3 | XS (~0.25d) | Frontend `lib/api.ts` |
| [oq-10 — row primary action + overflow menu + row click target](./Tasks/task-oq-10-row-actions-overflow.md) | OQ-D2, OQ-D3 | M (~0.5d) | Frontend |

**Phase 4 gate:** Each row has exactly one visible primary affordance (`Open` chevron) + one overflow `⋯`. Clicking the row (or `Open`) auto-marks `waiting → called` and routes to the appointment. Overflow menu offers the four real outcomes; each round-trips to the existing backend route and refetches the snapshot. `Skip` button is gone.

### Phase 5 — Session controls + density + polish (4 tasks · ~1 dev-day)

| Task | Source decision | Effort | Surface |
|---|---|---|---|
| [oq-11 — session toolbar (broadcast delay + offer early join)](./Tasks/task-oq-11-session-toolbar.md) | — | S (~0.5d) | Frontend |
| [oq-12 — density toggle + mobile fallback](./Tasks/task-oq-12-density-mobile.md) | OQ-D4 | S (~0.5d) | Frontend |
| [oq-13 — keyboard shortcuts + a11y polish + per-filter empty states](./Tasks/task-oq-13-keyboard-a11y.md) | OQ-D2 | S (~0.5d) | Frontend |
| [oq-14 — PHI-free telemetry events](./Tasks/task-oq-14-telemetry.md) | — | XS (~0.25d) | Frontend |

**Phase 5 gate:** Session toolbar above the table exposes `Broadcast delay` and `Offer early join` actions (matching the per-row overflow but at session-level for "all upcoming"). Density toggle (`Compact` / `Default`) persists. Below `lg` the table swaps to 2-line cards. `J/K/Enter/C/S/⋯//` keyboard map works. Telemetry events fire (counts only, no patient IDs).

---

## Whole-batch acceptance gate

Run after all 5 phase gates close. One Opus chat, paste full diff, ask for the final grade.

```
- [ ] /dashboard/opd-today renders the new <OpdQueueTable>; old <DoctorQueueBoard> is gone (or is a 1-line re-export).
- [ ] Each row shows full name + MRN + phone + age/gender + reason + service + modality + scheduled time + waited time + status dot.
- [ ] No row in the codebase still imports patientLabelFromName or DoctorQueueSessionRow.patientLabel; type is removed.
- [ ] Active rows always render above Done / No-show; counts in the disclosure labels match.
- [ ] Single Open button + ⋯ overflow per row. No Call button. No Skip button.
- [ ] Open / row click auto-marks waiting → called (idempotent — already-called rows don't refire).
- [ ] Overflow menu has: Mark called silently · Requeue after current · Send to end of queue · Mark as no-show. Each round-trips and refetches.
- [ ] Status filter chips show live counts; filter state persists in URL params.
- [ ] Search matches name (substring, case-insensitive), phone (digits only), token (#NN literal), MRN.
- [ ] Page consumes useOpdSnapshot; bespoke setInterval gone. Polling pauses when tab hidden.
- [ ] Session toolbar exposes Broadcast delay + Offer early join.
- [ ] Density toggle (Compact / Default) persists across reloads via localStorage.
- [ ] Below lg breakpoint, the table renders as a 2-line card list driven by the same data hook.
- [ ] Keyboard shortcuts: J/K row nav, Enter open, C call, S overflow, / focus search. All keys respect typing context (not while typing in the search box).
- [ ] Per-filter empty states ("No waiting patients", "No completed yet", etc).
- [ ] Telemetry: opd_queue.viewed, opd_queue.row_clicked, opd_queue.filter_changed, opd_queue.action fire with PHI-free payloads.
- [ ] No regressions in: cockpit OpdQueueStrip, useOpdSnapshot consumers (cockpit strip, queue rail), appointment detail page, doctor settings.
- [ ] Type-check + lint clean (frontend and backend).
- [ ] No new migrations (this batch is purely additive on the API layer + a UI rebuild).
```

---

## Open questions (carry into source plan; lock before merging)

| ID | Question | Recommendation | Owner |
|---|---|---|---|
| OQ-Q1 | Should we expose patient `email` on the row too? | No — phone is enough. Email lives on appointment detail. | oq-01 — covered in spec. |
| OQ-Q2 | Click-to-copy on phone vs. `tel:` link? | Click-to-copy + tooltip. `tel:` doesn't work on desktop browsers without a registered handler. | oq-03 — covered in spec. |
| OQ-Q3 | Does the doctor want bulk actions (multi-select rows → bulk requeue)? | Out of batch — track in inbox. | Defer. |
| OQ-Q4 | Should `wait > 30 min` highlight be configurable per doctor? | No — start with a hard 30 min threshold; add a setting only if doctors ask. | oq-03 — covered in spec. |
| OQ-Q5 | Allergy/flag chip on the row vs. tooltip-only? | Tooltip-only on the row; full chip in the inline expand (oq-05). Avoids a 13th column. | oq-03 / oq-05 — covered. |

---

## Privacy / compliance note

This batch **widens what `/v1/opd/queue-session` returns** for the doctor JWT. It does **not** create a new endpoint, change RLS, or alter audit. The widened payload is identical to what the doctor sees on `/dashboard/appointments/:id` (the appointment detail page they're already authorized to view). No migration touches PHI columns.

Any future patient-facing or non-doctor surface that wants queue data **must** consume a different endpoint that filters PHI server-side. **OQ-D7 documents this contract.**

---

## References

- **Predecessor batches (the cockpit half this batch parallels):**
  - [Daily-plans/May 2026/06-05-2026/plan-cockpit-redesign-batch.md](../06-05-2026/plan-cockpit-redesign-batch.md) — cockpit shell.
  - [Daily-plans/May 2026/07-05-2026/plan-patient-flow-batch.md](../07-05-2026/plan-patient-flow-batch.md) — wrap-up + queue rail (cockpit strip got `pf-12` polish; this batch is the equivalent for the full `/opd-today` page).
- **Source code surfaces this batch rewrites:**
  - `frontend/components/opd/DoctorQueueBoard.tsx` (old; deleted or thin-wrapped).
  - `frontend/components/opd/OpdTodayClient.tsx` (kept; mounts the new table).
  - `backend/src/services/opd-doctor-service.ts` § `listDoctorQueueSession` (widened in oq-01).
  - `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx` (precedent — this batch copies its grouping / status meta primitives).
- **Original e-task-opd-06 spec** (where the initials rule came from):
  - [docs/Work/Daily-plans/March 2026/2026-03-24/OPD modes/e-task-opd-06-frontend-doctor-dashboard-opd-controls.md](../../../Daily-plans/March%202026/2026-03-24/OPD%20modes/e-task-opd-06-frontend-doctor-dashboard-opd-controls.md) — § 1.1 line: *"Patient labels: **initials only** on queue rows."* OQ-D1 + OQ-D7 explicitly supersede that line for the doctor surface.
- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules and chat heuristics.

---

**Created:** 2026-05-08. **Status:** `Drafted`. **Owner:** TBD.
