# Plan p2 — Clinic link: prep on that visit

## 23 Sep 2026 — Batch `clinic-link` / `p2-visit-prep` (`clk-09..14`)

> **Status:** **Gate walked** 2026-09-27. `clk-09` through `clk-14` are in. Migration `243` was applied before the walk. A live SMS was not sent because Twilio is not configured; the SMS unit test covers practice, when, the prep URL, and no reason. The Phase 1 live-SMS box stays open for the same reason.
> **Product plan:** [`plan-clinic-link.md`](../../../../../Product%20plans/plan-clinic-link.md) (CLK-DL-1…12)
> **Prior phase:** [`../p1-public-book/`](../p1-public-book/)
> **Program:** [`../README.md`](../README.md) · Prefix `clk`
> **Exec order:** [`Tasks/EXECUTION-ORDER-p2-clinic-link-visit-prep.md`](./Tasks/EXECUTION-ORDER-p2-clinic-link-visit-prep.md)

---

## Why this phase

Phase 1 holds the slot. This phase lets the same person leave medicines, allergies, conditions, and the story of this illness. Skipping still leaves a valid appointment. The doctor accepts the words onto the chart. The desk screen does not change.

Photos, the mic check, and the share sheet are Phases 3 and 4. They are not in this batch.

---

## Decision lock

CLK-DL-1…12 stay locked in the product plan. Do not re-litigate them here.

This phase uses CLK-DL-7 (sidecar, then accept; never the desk upsert), CLK-DL-8 (one row; desk wins), CLK-DL-9 (illness chips on the appointment), CLK-DL-10 (`actor_id` is `patients.id` for a patient write), and CLK-DL-12 (one `kind: 'history-form'` token). Token shape and expiry are HL-DL-4 and HL-DL-5 in [`plan-history-link.md`](../../../../../Product%20plans/plan-history-link.md). The public page never receives chart rows (HL-DL-8). The collection notice is `⟨fill — counsel⟩` (HL-DL-10).

---

## What already exists (inspected 2026-09-23)

- `patient_history_submissions` (migration `234`, `assistant` added in `235`). One row per appointment. Sources `front_desk` | `patient` | `assistant`. `actor_id` is `NOT NULL`, no FK. The column comment says it is an `auth.users` id.
- `upsertHistorySubmission` writes the sidecar and calls `applyDeskHistoryToChart`. Doctor accept is `acceptHistorySubmissionItem`. Accepting a medicine writes `patient_medications` with `source = 'self'`.
- `why_today`, `allergies`, `medicines`, `conditions`, and `notice_version` already exist on the sidecar. There is no public patient route.
- `appointments.reason_for_visit` exists. There is no `appointments.previsit_context` column.
- `visit_documents.actor_id` has the same “auth.users id” comment. This phase does not add an upload route.
- Booking tokens are `booking-token.ts` (`conversationId` + `doctorId`). Join tokens are a different kind. Neither is `history-form`.
- Phase 1 checkout creates the appointment. `clk-06` is the booking SMS (practice and when, no prep URL). It may still be unbuilt when this batch is read. This phase extends that SMS. It does not send a second one.

---

## Scope Guard — DO NOT TOUCH

- Desk history UI and `upsertHistorySubmission`.
- Chart tables on the patient path (`patient_allergies`, `patient_medications`, `patient_chronic_conditions`, `prescriptions`).
- File upload, camera check, share sheet, follow-up order list.
- Phone OTP and “same as last time.”
- A new Instagram previsit stage. T−24h stays link-free.
- `platform = 'web'`.
- Collection-notice wording. Leave it `⟨fill — counsel⟩`. Do not ship `DRAFT-*`.
- Logging names, phones, ages, reasons, medicines, or token material.

---

## Tasks

| ID | Title | Size | Depends on |
|----|-------|------|------------|
| [`clk-09`](./Tasks/task-clk-09-prep-columns.md) | Illness-chip column and `actor_id` comments | S | Phase 1 gate |
| [`clk-10`](./Tasks/task-clk-10-history-form-token.md) | `history-form` token | M | Phase 1 gate |
| [`clk-11`](./Tasks/task-clk-11-patient-history-write.md) | Patient insert of the sidecar and the chips | L | clk-09, clk-10 |
| [`clk-12`](./Tasks/task-clk-12-patient-history-read.md) | Empty public read; desk row hides the lists | M | clk-11 |
| [`clk-13`](./Tasks/task-clk-13-prep-screen-and-sms.md) | Post-book screen and the prep URL on the booking SMS | M | clk-12 |
| [`clk-14`](./Tasks/task-clk-14-phase-2-gate.md) | Phase 2 gate | M | clk-13 |

`clk-09` and `clk-10` do not read each other. The write waits on both.

---

## Acceptance gate

- [x] A dummy patient submits “Telma 40” and “since 3 days, worse.” Chart tables stay unchanged until the doctor accepts. Accept writes `patient_medications` with `source = 'self'`. (2026-09-27)
- [x] A second patient submit is 409. A desk or assistant row is unchanged after the patient opens the link. The three lists are hidden. The chips still save. (2026-09-27)
- [x] Public GET does not return existing allergies, medicines, or conditions from the chart. (2026-09-27)
- [x] A booking token or a join token cannot submit prep. An expired or cancelled visit cannot either. (2026-09-27)
- [x] Skip leaves the appointment valid. The booking SMS is still one message: practice, when, and the prep URL. No reason. Live Twilio send skipped; body covered by `public-clinic-booking-sms.test.ts`. (2026-09-27)
- [x] Desk history UI is unchanged. (2026-09-27)
- [x] Logs: appointment id and counts only. (2026-09-27)
- [x] Typecheck, lint, and the new suites are green. Lint and the new suites passed. Whole-project `tsc --noEmit` still exits 2 on pre-existing files outside this phase. (2026-09-27)

---

**Created:** 2026-09-23.
