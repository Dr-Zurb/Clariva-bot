# Plan p4 — Clinic link: show up ready

## 27 Sep 2026 — Batch `clinic-link` / `p4-show-up` (`clk-20..24`)

> **Status:** **Gate walked** 2026-09-27. `clk-20` through `clk-24` are in. The order list stays dark. A live SMS is still unsent because Twilio is not configured; this phase does not send a message and does not change reminder copy.
> **Product plan:** [`plan-clinic-link.md`](../../../../../Product%20plans/plan-clinic-link.md) (CLK-DL-1…12)
> **Prior phase:** [`../p3-photos/`](../p3-photos/)
> **Program:** [`../README.md`](../README.md) · Prefix `clk`
> **Exec order:** [`Tasks/EXECUTION-ORDER-p4-clinic-link-show-up.md`](./Tasks/EXECUTION-ORDER-p4-clinic-link-show-up.md)

---

## Why this phase

Phase 3 holds the papers. This phase tells the person how to show up, and lets the person who booked hand the prep link to the person who will attend. A video visit can already test the camera and mic in the waiting room. That check stays there. A failed check stays on that page and does not cancel the visit.

The desk’s pending-test list is a staff read and that program’s order loop is still in progress. This batch leaves the order list dark.

---

## Decision lock

CLK-DL-1…12 stay locked. Do not re-litigate them here.

Three fixed lines, and no others. Pick by `appointments.consultation_type`:

| Value | Line |
|---|---|
| `video` | Sit in a quiet room. Keep your medicine strips in front of the camera. |
| `voice` | Find a place where you can talk. |
| `in_clinic` | Bring your old papers. |
| `text`, null, or anything else | No line |

The same three sentences appear on the prep page and on `/my-visit`. The video sentence also appears on the video waiting room, beside the check that already exists. Do not write a fasting line, a bladder line, or a second-language question.

Share sends the history-form prep URL (`/book/prep?t=`). It does not send `/my-visit`, `/consult/join`, or `/book?token=`. The join token is a stronger credential than the prep token. Minting a prep URL from a join token is allowed only when the person taps share. Do not mint one on the lobby poll. The polled snapshot is cacheable and must not carry a prep token.

The camera and mic check already lives in `VideoConsultPreCall` on the video waiting room. Reuse it. A deny or a skip stays on that page. Neither one cancels the appointment. Do not add `getUserMedia` to the prep page.

The order list stays dark. Desk visit-prep’s pending list (`listPendingLabAppointments`) is staff-only, returns patient names, and that phase is still in progress. A new patient and a follow-up with an open test both see no test label. A patient upload does not write `visit_lab_order_fulfillments`.

Collection-notice wording stays `⟨fill — counsel⟩` (HL-DL-10). No new Instagram stage (CLK-DL-12). T−24h stays link-free. Reminder copy is unchanged.

---

## What already exists (inspected 2026-09-27)

- Prep page: `frontend/app/book/prep/page.tsx`. History-form token. History GET does not return `consultation_type`. Photo upload from Phase 3 is on this page.
- Visit hub: `frontend/app/my-visit/page.tsx` renders `PatientVisitSession` with a consultation token. `GET /api/v1/bookings/session/snapshot?token=` builds `PatientOpdSnapshot`. That snapshot has queue and slot fields. It does not have `consultationType` or a prep path. The handler sets `Cache-Control` from `suggestedPollSeconds`.
- `appointments.consultation_type` is already `text` \| `voice` \| `video` \| `in_clinic`. Public checkout writes it.
- Video waiting room: `PatientVideoWaitingRoom` renders `VideoConsultPreCall` before the doctor starts. Continue and “Skip mic check” cache a device choice. They do not create a Twilio room and they do not cancel the visit. `PatientVideoWaitingRoom.test.tsx` already covers the check staying on the page.
- Voice already has its own pre-call. This phase does not add a second mic check.
- Desk lab orders: `desk-lab-orders-service.ts`. Pending is derived. `listPendingLabAppointments` is a doctor-scoped staff read and includes `patient_name`. There is no public order route.
- Latest migration in the repo includes `244`. This phase does not add `245`.

---

## Scope Guard — DO NOT TOUCH

- Reminder stages and reminder copy, including T−24h with no link.
- A new SMS, Twilio setup, or a new Instagram stage.
- Rebuilding the camera or mic check, or calling `getUserMedia` from the prep page.
- Cancelling an appointment because a device was denied.
- `listPendingLabAppointments`, fulfillment writes, and test labels on a public page.
- Chart tables, history sidecar rules, and the patient photo path from Phase 3.
- Face, Aadhaar, insurance, fasting lines, and home vitals.
- Collection-notice wording. Leave it `⟨fill — counsel⟩`.
- Logging tokens, names, phones, or the prep URL.

---

## Tasks

| ID | Title | Size | Depends on |
|----|-------|------|------------|
| [`clk-20`](./Tasks/task-clk-20-arrival-lines.md) | Three arrival lines | M | Phase 3 gate |
| [`clk-21`](./Tasks/task-clk-21-share-prep-url.md) | Share the prep URL | M | clk-20 |
| [`clk-22`](./Tasks/task-clk-22-video-line-on-waiting-room.md) | Video line beside the existing mic check | S | clk-20 |
| [`clk-23`](./Tasks/task-clk-23-order-list-stays-dark.md) | Order list stays dark | S | Phase 3 gate |
| [`clk-24`](./Tasks/task-clk-24-phase-4-gate.md) | Phase 4 gate | M | clk-21, clk-22, clk-23 |

`clk-22` and `clk-23` do not wait on the share control. `clk-21` waits on the lines so the prep page is edited once the copy exists.

---

## Acceptance gate

- [x] A video visit shows the video sentence on the prep page, on `/my-visit`, and on the video waiting room. The existing mic check is still on that waiting room. Deny and skip leave the appointment in place. (2026-09-27)
- [x] A voice visit shows only the voice sentence. An in-clinic visit shows only the papers sentence. A text visit shows no arrival sentence. (2026-09-27)
- [x] Share sends `/book/prep?t=` and does not send the join URL. The snapshot poll does not contain a prep token. (2026-09-27)
- [x] A follow-up with an open desk order sees no test label. A patient photo does not write a fulfillment row. (2026-09-27)
- [x] Reminder copy is unchanged. No new previsit stage. (2026-09-27)
- [x] Logs have no token, name, phone, or prep URL. (2026-09-27)
- [x] Typecheck, lint, and the new suites are green. (2026-09-27)

Commands: dummy visits on the local clinic page, then cancelled. Prep and `/my-visit` showed the matching sentence for video, voice, and in-clinic, and no sentence for text. Share from both pages copied `/book/prep?t=`. The snapshot had the modality and no prep token. An attested desk order’s label was absent from the public history payload, the prep page, and the hub. The waiting room showed the video sentence and the existing mic check; a denied camera and Skip left the appointment in place. `npx jest` on the three Phase 4 backend suites (9 tests). `npx vitest run` on the arrival line, share control, prep page, and waiting room (10 tests). `npx eslint` on the Phase 4 backend and frontend sources, exit 0. Backend `npx tsc --noEmit` exit 2 only in pre-existing `* 2.ts` duplicates. Frontend `npx tsc --noEmit` has pre-existing errors and none in the Phase 4 files.

---

**Created:** 2026-09-27.
