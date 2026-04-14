# Task B6: Status Check — Show All Appointments + Token Number
## 2026-04-14 — Sprint 2

---

## Task Overview

Improve the appointment status check to show all upcoming appointments (not just the next one) and include queue token numbers where applicable.

**Estimated Time:** 2.5 hours
**Status:** DONE
**Completed:** 2026-04-14

**Change Type:**
- [x] **Update existing** — Change or remove existing code

**Current State:**
- `instagram-dm-webhook-handler.ts` ~2008–2056: `check_appointment_status` handler only shows the **next** appointment (single summary line)
- `formatAppointmentStatusLine` ~963–981: formats one appointment; uses `Intl.DateTimeFormat('en-US')` (hardcoded locale)
- `webhook-appointment-helpers.ts` ~11–55: `getMergedUpcomingAppointmentsForRelatedPatients` returns a list but handler only uses first
- No join to `opd_queue` / token data

**What's missing:**
- Loop through all appointments in the status response
- Token/queue number display
- Locale-aware date formatting

**Scope Guard:**
- Expected files touched: 2–3
- `instagram-dm-webhook-handler.ts`, `webhook-appointment-helpers.ts`, possibly `appointment-service.ts`

**Reference:** [scenario-alignment-plan.md](./scenario-alignment-plan.md) § B6
**Scenario:** [all bot patient scenarios](../../Reference/all%20bot%20patient%20scenarios) § 8

---

## Task Breakdown

### 1. Show all upcoming appointments
- [x] 1.1 In the status handler, iterate over the full list from `getMergedUpcomingAppointmentsForRelatedPatients` (not just index 0)
- [x] 1.2 Format each appointment as a numbered line: `1. General Consultation — 15 Apr 2026, 10:00 AM — Confirmed`
- [x] 1.3 Include "For **{name}**:" prefix when appointment is for a related patient (already partially exists)
- [x] 1.4 Cap at a reasonable limit (e.g. 10) to avoid massive DMs

### 2. Add token/queue number
- [x] 2.1 Check if `opd_queue` or equivalent table has token data linked to appointments
- [x] 2.2 If token exists, append to status line: `Token: #12`
- [x] 2.3 If no token system / no token assigned, omit (graceful degradation)

### 3. Locale-aware date formatting
- [x] 3.1 Replace `Intl.DateTimeFormat('en-US')` with detected locale or a more universal format
- [x] 3.2 For now, a locale-neutral format like `15 Apr 2026, 10:00 AM` is acceptable
- [x] 3.3 Full language mirroring of surrounding text covered by A7

### 4. Verification
- [x] 4.1 `tsc --noEmit` passes
- [x] 4.2 Manual test: patient with 3 upcoming appointments → all 3 shown
- [x] 4.3 Manual test: patient with 0 appointments → "No upcoming appointments"
- [x] 4.4 Review: date formatting is not US-centric

---

## Files to Create/Update

- `instagram-dm-webhook-handler.ts` — MODIFY (loop + formatting)
- `webhook-appointment-helpers.ts` — REVIEW/MODIFY (token join if needed)
- `appointment-service.ts` — REVIEW (check if token data is available)

---

## Design Constraints

- Must handle patients with many appointments gracefully (cap at 10)
- Token number display is only relevant for queue/OPD mode clinics
- Date format should work internationally (not just US)

---

## Global Safety Gate

- [x] **Data touched?** Yes — reading appointment + queue data
  - [x] **RLS verified?** Uses existing merged patient ID approach
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** No
- [x] **Retention / deletion impact?** No

---

## Acceptance Criteria

- [x] Patient with multiple appointments → all shown (numbered list)
- [x] Patient with 0 appointments → appropriate message
- [x] Token number shown when available
- [x] Date formatting is not US-specific
- [x] No regression for single-appointment case

---

**Last Updated:** 2026-04-14
