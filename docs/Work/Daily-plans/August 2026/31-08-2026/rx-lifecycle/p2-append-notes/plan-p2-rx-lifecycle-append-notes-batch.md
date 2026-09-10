# Plan p2 — Rx lifecycle: append notes

## 31 Aug 2026 — Batch `rx-lifecycle` / `p2-append-notes` (`rxl-05..10`) — **L, ~21h · Opus on migration + guard**

> **Status:** **IMPLEMENTED** 2026-09-10 — residuals recorded; not Shipped. RXL-Q1 later **reversed** (Finish only). Phase 3 same-day revise already shipped.
> **Product plan:** [`plan-rx-lifecycle.md`](../../../../../Product%20plans/plan-rx-lifecycle.md) (RXL-DL-1…12)
> **Program:** [`../README.md`](../README.md) · Prefix `rxl`
> **Exec order:** [`Tasks/EXECUTION-ORDER-p2-rx-lifecycle-append-notes.md`](./Tasks/EXECUTION-ORDER-p2-rx-lifecycle-append-notes.md)
> **Prior phase:** [`../p1-lock-integrity/`](../p1-lock-integrity/) — decision lock inherited; `rxl-03`'s seed-vs-edit split is a hard dependency of `rxl-07`.
> **Not this sitting:** edit window, revision snapshots, PDF retention, slip marker, supersede. All Phase 3.

---

## Why this phase

Phase 1 made an attested note read-only. That is correct and immediately raises the real question: the doctor comes back to the patient at 5 pm and has nowhere to write.

The answer is not to unlock the old note. It is to start a new one. A prescription is a document; a second visit produces a second document. The schema already permits it — `prescriptions.appointment_id` has an index and **no unique constraint**, `listPrescriptionsByAppointment` already returns an ordered list, and the Rx autosave already creates-if-missing. What is missing is an attest stamp, a service-layer guard, and a load path that starts fresh instead of rehydrating an attested note.

Crucially the new note lives under the **same appointment** (RXL-DL-3). The appointment is the queue and billing unit; the prescription is the clinical-document unit. Keeping them separate means the record can grow without claiming the patient was seen twice or owes a second fee.

---

## Decision lock (inherits the product plan)

RXL-DL-1…12 are locked. Do not re-litigate in a task file.

Phase 2 implements RXL-DL-1 (attest stamp is the boundary), RXL-DL-3 (new note, same appointment), RXL-DL-4 (lazy creation) and RXL-DL-6 (carry subjective, not objective).

**RXL-DL-8 applies with force here.** Phase 2 hard-locks an attested prescription. The 15-minute window does **not** arrive until Phase 3, because the snapshot that traces an in-window edit arrives with it. There must be no interim state in which a post-attest edit is accepted but not captured.

**Confirm before promote (recommended defaults in the product plan):**

| ID | Default | Owner |
|---|---|---|
| RXL-Q1 | Attest stamp set by the **first** of finish / send / print | **Locked** 2026-08-31 |
| RXL-Q5 | Visit history lists notes; compare on demand, no inline diff | ⟨fill⟩ |

---

## Scope Guard — DO NOT TOUCH

- **`appointments`** — no new row, no status change, no token, no scheduling side effect. A continuation note must be invisible to the queue.
- `visit_payments` / `visit_payment_reversals` / hisab / desk-left. A second note must not imply a second fee.
- Queue / OPD / pipeline / `useNextAppointmentRoute` / `useDoctorDayPipeline` / next-patient advance / `useOpdSnapshot`.
- The PDF service, PDF cache and `sent_to_patient_at` semantics — Phase 3 owns those. This phase must not change what a print produces.
- `prescription_medicines` / `prescription_attachments` schema.
- Desk-vitals fetching and prefetch (Phase 1 settled this).
- The edit window in any form. An attested note is hard-locked this phase.
- Patient-facing share link and `/r/[id]`.

---

## Tasks

| ID | Title | Size | Model |
|----|-------|------|-------|
| [`rxl-05`](./Tasks/task-rxl-05-attest-stamp-migration.md) | Attest stamp column + types | M | **Opus** — PHI table ALTER |
| [`rxl-06`](./Tasks/task-rxl-06-attest-and-write-guard.md) | Set the stamp; refuse writes to an attested Rx | L | **Opus** — the enforcement boundary |
| [`rxl-07`](./Tasks/task-rxl-07-lazy-new-note.md) | Load path: fresh note instead of rehydrating an attested one | L | Sonnet |
| [`rxl-08`](./Tasks/task-rxl-08-carry-forward-sibling.md) | Carry-forward must see a same-appointment sibling | S | Grok 4.6 (owner override) — **Implemented** 2026-09-10 |
| [`rxl-09`](./Tasks/task-rxl-09-visit-history-per-note.md) | Visit history lists notes, not visits | M | Grok 4.6 (owner override) — **Implemented** 2026-09-10 |
| [`rxl-10`](./Tasks/task-rxl-10-phase-2-gate.md) | Suites + docs + gate | M | Grok 4.6 (owner override) — **Implemented** 2026-09-10 |

---

## Acceptance gate

- [x] RXL-Q1 recorded, then **reversed** 2026-09-09 (Finish only). RXL-Q5 listed-with-compare (`rxl-09`).
- [x] Migration `226` (attest) + `231` (revision) additive; `231` applied on dev. Reverse in-file on both.
- [x] Stamp set once by Finish. Print / send do not attest (`rxl-20`). A second attest does not move it.
- [x] `updatePrescription` refuses a **previous clinic day's** issued note with a typed `ConflictError`. Same-day issued is writable (`rxl-23`). Original "any attested write refused" amended.
- [x] `logDataModification` is called with `changedFields` (names only) on prescription updates and attest.
- [x] Later clinic day → `review` (read-only, no mint). Same-day issued → `adopt` (`rxl-24`). Original "always empty" amended.
- [x] New visit / continuation mint on first user edit, not on open.
- [x] New row reuses `appointment_id`. Source-level: no `appointments` insert, no `visit_payments` touch. Live queue/OPD/hisab byte-compare **not run**.
- [x] Carry copies complaints / history / diagnosis; vitals and exam empty (RXL-DL-6).
- [x] Carry-forward excludes the working prescription, not the appointment (`rxl-08`). Skips superseded.
- [x] Visit history lists notes with timestamps, version / superseded, reprint by id (`rxl-09` / `rxl-28`).
- [ ] No PHI in logs or audit metadata. Type-check + lint + suites green. **Targeted suites green. Repo-wide tsc/lint pre-existing dirty.**

---

## Risk (phase)

Covered by the product-plan register. Phase-specific:

- **`rxl-07` hard-depends on `rxl-03`.** If Phase 1's seed-vs-edit split did not fully land, lazy creation will produce empty notes from chart browsing. Verify `rxl-03`'s zero-write test is green before starting.
- **`rxl-06` is the real feature.** Everything else is ergonomics. If the guard is not enforced in the service layer, the phase has not shipped regardless of how the UI behaves.
- **The load path is shared with brand-new visits.** `useRxFormProviderSetup` serves both the first note of a visit and a continuation. A regression here breaks every consultation, not just returns — the highest-blast-radius change in the program.
- Migration number: head was `225` at spec time and `hl-01` also claims "next unclaimed". Whichever lands second must re-check, not assume.

---

**Created:** 2026-08-31.
**Last Updated:** 2026-09-10 (`rxl-05`…`10` implemented; residuals on the gate).
