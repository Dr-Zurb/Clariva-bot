# Capture — 2026-09-08

> **2026-09-10:** Features 1 + 2 are no longer open design. SoT is [`plan-p3-rx-lifecycle-same-day-revise-batch.md`](../../Daily-plans/August%202026/31-08-2026/rx-lifecycle/p3-same-day-revise/plan-p3-rx-lifecycle-same-day-revise-batch.md). Sections below kept for thread history.

## Rx edit window, same-day return, last-visit ghosts

## Type

- [x] Idea / exploration
- [ ] Bug or incident
- [x] Task / refactor
- [x] Product / UX

## Context

Real-OPD dogfood after the frequent-medicine-combo work. Three related gaps on a finished / returning patient, to discuss and implement **one by one**.

Program already exists — do not re-derive the lifecycle:

- Product: [`docs/Work/Product plans/plan-rx-lifecycle.md`](../../Product%20plans/plan-rx-lifecycle.md) (RXL-DL-1…16)
- Daily batches: [`docs/Work/Daily-plans/August 2026/31-08-2026/rx-lifecycle/`](../../Daily-plans/August%202026/31-08-2026/rx-lifecycle/)
- Phase 1 lock integrity **implemented** (not shipped — full-repo tsc/lint/suite not green)
- Phase 2 append notes **in progress** (`rxl-05`…`07` landed; `rxl-08` next)
- Phase 3 **same-day revise** (`rxl-19`…`29`) — full plan written 2026-09-10. Phase A implemented. Old 15-minute window (`rxl-11`…`18`) superseded.

Inbox precursors: `2026-09-07 — Second editing and re-prescription flow` · `2026-09-07 — Revisit last-medicines handling`

---

## Feature 1 — Edit an attested prescription (same-day revise)

**User quote:** visit was done, doc missed something, wants to edit the prescription. Earlier we gave a time window; the new printed slip should show an edited timestamp at the bottom.

**Relocked 2026-09-09:** not a 15-minute in-place window. One paper slip per clinic-local visit-day. After Finish, same-day reopen is editable; re-issue creates Version N+1 as a **new row** that supersedes. Footer: `Revised 6:40 PM, 9 Sep 2026 — replaces the slip issued 10:15 AM. Version 2.`

**SoT:** [`plan-p3-rx-lifecycle-same-day-revise-batch.md`](../../Daily-plans/August%202026/31-08-2026/rx-lifecycle/p3-same-day-revise/plan-p3-rx-lifecycle-same-day-revise-batch.md) (`rxl-19`…`29`). Old `p3-revise-window` (`rxl-11`…`18`) is superseded — do not start `rxl-11`.

**Current state (2026-09-10):** Phase A landed — print/send do not attest; continuation unlock. Service layer still hard-locks after `attested_at` until `rxl-23`. No version / supersede columns yet (`rxl-21`, Opus).

---

## Feature 2 — Same-day return after the edit window (RBS / “come back in 15”)

**User quote:** off the edit window, patient sent for blood tests, returns later today. Doc should be able to make a new prescription — currently things get locked. Print draft without saving should be emphasised because a lot of slips are interim: “RBS, get it done, return in 15 minutes.”

**Current state (amended 2026-09-09):**

- Print / send **no longer attest** (`rxl-20`). RXL-Q1 relocked Finish-only. Wrap-up still attests.
- Mid-session lock desync: `setNoteClosed(true)` is never called. After print, `cockpitState` stays `live` so the form stays editable while the server refuses writes (`ConflictError`).
- Continuation load path exists (`rxl-07` / `resolveRxLoadDecision`): closed newest note → `continue` (fresh empty form, subjective carry seed, same `appointment_id`). Lazy create on first user edit (RXL-DL-4). Queue / `visit_payments` untouched (RXL-DL-3).
- Carry-forward still excludes by appointment (`rxl-08` not started), so a same-day sibling note is invisible as a source.
- Visit history still lists visits, not notes (`rxl-09` not started).
- No separate “print draft” path. Same PDF GET attests.

**Direction to discuss (do not implement as “print draft louder”):**

1. **Requisition print** — emit only the investigations block, do **not** attest. The note stays a draft; patient returns; doctor finishes the same note. Matches the RBS case without a second document.
2. **Detach attest from `GET /pdf`.** Attest is an intent; belongs on Finish / Send / an explicit Issue action. Prefetch, retry, or reload of the print view should not lock the chart.
3. **Finish Phase 2** after that: `rxl-08` (carry sibling), `rxl-09` (history per note), `rxl-10` (gate). True second note under the same appointment for a real second encounter later the same day.

**Locked decisions that this feature will re-open:** RXL-Q1 (print attests). Worth a deliberate tick, not a silent override.

---

## Feature 3 — Last-visit details on the current prescription

**User quote:** last visit details should sit on the current prescription, greyed out — previous complaints and meds — so the doctor has a picture while typing.

**Current state (exists, behind a click or only on vitals):**

- Vitals ghosts: `LastVisitVitalGhost` + `useLastVisitVitals` + `extractLastVisitGhostVitals`. Grey `prev {value}`, click applies when the field is empty. **Correction 2026-09-08:** the click uses `setField` and **does** dirty the form — an earlier draft of this note said `seedFields`. Only desk-vitals auto-seed (`DeskVitalsSectionNoteSeed`) and hydrate/`RESET` take the non-dirtying path. Ghosts are not clickable when `contentLocked` (`fieldset disabled`), though the query still runs.
- Previous Rx side sheet / popover, “Copy from last visit”, `CarryForwardButton` (“Same as last visit”), ComplaintCard prior-pool banners, SnapshotPane / HistoryPane.
- APIs: `GET /prescriptions/last-in-episode`, `GET /prescriptions/last-subjective`, `listRecentPrescriptionsByPatient`.

**PROMOTED 2026-09-08** → own product plan: [`../../Product plans/plan-last-visit-context.md`](../../Product%20plans/plan-last-visit-context.md) (`LVC-DL-1…10`, prefix `lvc`, 3 phases). Recon there found this capability already exists **six times over** across six affordances with three different scopes and one dead surface — so the job is one coherent surface plus the missing CST/repeat action, not a new widget. Four decisions locked in the source thread: collapsed strip per section · patient-scoped “last visit” · repeat appends with one-action undo · repeated complaints drop `onset`/`duration`. Sections below are superseded by that plan; kept for thread history.

**Direction to discuss:**

- Extend the vitals-ghost pattern to complaints, diagnosis, and medicines — ambient, not a mouse trip.
- Prior **medicines must not** be ghost *rows inside the medicine list*. A stray Enter on a fast-typing capture bar must not commit last-visit drugs. Render a read-only reference strip; apply only on deliberate click.
- RXL-DL-6 still applies: continuation notes carry subjective, not objective. Last-visit ghosts are *reference*, not auto-seeded plan.
- RXL-Q5 (list revisions, compare on demand) is about visit-history rows, not the live form — does not block this.

**Cheapest of the three.** No migration.

---

## Suggested discuss / implement order

Discuss each before building. Suggested sitting order (can override):

**Revised 2026-09-08 — Feature 3 goes first** (founder call: the other two both act on one attested note and will bleed into each other; Feature 3 touches no lifecycle surface).

1. **Feature 3 (last visit context)** — own program: [`plan-last-visit-context.md`](../../Product%20plans/plan-last-visit-context.md). No attest / lock / print coupling, no migration.
2. **Feature 2 (attest trigger + requisition print)** — unblocks the live RBS lock; no migration.
3. **Phase 2 close** (`rxl-08`…`10`) — sibling carry + history per note.
4. **Feature 1 (Phase 3-B same-day revise)** — Opus sitting for `rxl-21`…`23`. No snapshot PHI table.

Clear Phase 1 residuals (full-repo tsc / lint / suite) before stacking more phases.

---

## Links & pointers

- Product (Features 1 + 2): `docs/Work/Product plans/plan-rx-lifecycle.md`
- Product (Feature 3): `docs/Work/Product plans/plan-last-visit-context.md`
- Phase 2: `docs/Work/Daily-plans/August 2026/31-08-2026/rx-lifecycle/p2-append-notes/`
- Phase 3: `docs/Work/Daily-plans/August 2026/31-08-2026/rx-lifecycle/p3-same-day-revise/`
- Attest + write guard: `backend/src/services/prescription-service.ts` (`attestPrescriptionIfUnset`, `assertPrescriptionContentWritable`)
- Print attests: `backend/src/controllers/prescription-controller.ts` (`getPrescriptionPdfUrlHandler`, `getPrescriptionPdfHandler`)
- Load / lock: `frontend/components/cockpit/rx/rxLoadDecision.ts`, `useRxLock.ts`, `useRxFormProviderSetup.ts`
- Vitals ghost precedent: `frontend/components/cockpit/rx/inputs/LastVisitVitalGhost.tsx`

## Next step (when promoting)

- [x] Feature 3 promoted to [`plan-last-visit-context.md`](../../Product%20plans/plan-last-visit-context.md) 2026-09-08.
- [x] Promote `lvc` Phase 3 to [`../../Daily-plans/September 2026/08-09-2026/last-visit-context/p3-consolidation/`](../../Daily-plans/September%202026/08-09-2026/last-visit-context/p3-consolidation/) 2026-09-10. Phases 1 / 2 / 4 stay in-tree (no retrospective Daily-plans).
- [x] Feature 2 (RXL-Q1 Finish-only + print does not lock) — Phase 3-A `rxl-19`/`rxl-20` landed 2026-09-09.
- [ ] Feature 1 is Phase 3-B (`rxl-21`…`25`). Do **not** start `rxl-11`. Do not start `rxl-21` on Auto — Opus.
- [ ] Do not treat this note as the execution backlog.
