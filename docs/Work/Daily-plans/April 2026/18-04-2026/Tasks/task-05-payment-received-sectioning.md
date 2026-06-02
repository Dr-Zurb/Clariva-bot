# Task 05: Payment-received confirmation DM sectioning
## 18 April 2026 — Plan "Patient DM copy polish", P1

---

## Task Overview

The happy-path payment confirmation DM is this today (`backend/src/services/notification-service.ts` ~line 180):

```
Payment received. Your appointment on Tue, Apr 29, 4:30 PM is confirmed.

Your patient ID: **CLR-00123**. Save this for future bookings.

We'll send a reminder before your visit.
```

It works but reads like a bank SMS. This is the **single most emotionally important moment** in the DM flow — the patient just paid; we need to make them feel safe and clearly tell them what to do next.

**Fix (from 2026-04-17 audit):** scan-friendly structure with one-piece-of-info-per-line, clearer labeling, and a dedicated "what happens next" closing.

**Target shape:**

```
✅ **Payment received.**

Your appointment is confirmed for **Tue, Apr 29 · 4:30 PM**.

🆔 **Patient ID:** CLR-00123
_Save this for future bookings._

We'll send a reminder before your visit. Reply here anytime if you need to reschedule or have questions.
```

**Variant — no MRN available yet** (patient ID not minted because creation race / legacy flow):

```
✅ **Payment received.**

Your appointment is confirmed for **Tue, Apr 29 · 4:30 PM**.

We'll send a reminder before your visit. Reply here anytime if you need to reschedule or have questions.
```

**Estimated Time:** 1–1.5 hours  
**Status:** Done (2026-04-18)  
**Depends on:** [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md)  
**Plan:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)

### Implementation Plan (high level)

1. Add `buildPaymentConfirmationMessage(input)` to `dm-copy.ts`:
   ```ts
   export interface PaymentConfirmationInput {
     appointmentDateDisplay: string; // already formatted in caller's timezone, e.g. "Tue, Apr 29 · 4:30 PM"
     patientMrn?: string;            // omitted → no MRN block
   }
   ```
2. Replace the inline string at `notification-service.ts:180` with a call to the helper.
3. The existing `formatAppointmentDate(appointmentDateIso, timezone)` output is already used for `dateStr`. Keep that and pass the result in. If its current format is `Tue, Apr 29, 4:30 PM` (comma-separated), tweak the builder to format the display with `· ` (middle-dot + space) separator **inside the builder** — not by touching the time formatter. This keeps the formatter untouched for the reminder-before-visit messages that share it.
4. Snapshot both variants.

**Scope trade-offs:**
- The ✅ and 🆔 emojis are deliberate on this message only. Payment confirmations are the single moment where an emoji earns its place (trust signal). Do NOT extend emoji use to the booking-confirmation DM sent earlier in the flow — that stays plain-text.
- Don't include the booking URL or a link to cancel/reschedule in the body; the current flow relies on patient replies being captured by the same conversation. Adding a link creates an abandoned-booking-style deep-link we'd need to route.
- Don't add amount paid / currency to the copy. Patient already saw it in the Razorpay / provider UI and Phase-1 payment invoice email. Adding it here introduces a fresh source-of-truth drift risk.

### Change Type

- [x] **Create new** — builder in `dm-copy.ts`
- [x] **Update existing** — 1 call site in `notification-service.ts`

### Current State

- `backend/src/services/notification-service.ts:180` — inline template literal.
- `getDoctorSettings` and `formatAppointmentDate` already resolve timezone + date string — reused, not touched.
- `sendInstagramMessage` call + audit log unchanged.

### Scope Guard

- Expected files touched: 2 + tests.
- Do NOT change the payment audit log (`auditNotificationSent`) semantics.
- Do NOT change when this message fires (stays tied to `payment_confirmation_dm`).

### Reference Documentation

- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)
- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md)

---

## Task Breakdown

### 1. Builder

- [x] 1.1 Implement:
  ```ts
  export function buildPaymentConfirmationMessage(i: PaymentConfirmationInput): string {
    const parts: string[] = [
      '✅ **Payment received.**',
      '',
      `Your appointment is confirmed for **${formatDateWithMiddot(i.appointmentDateDisplay)}**.`,
    ];
    if (i.patientMrn?.trim()) {
      parts.push('', `🆔 **Patient ID:** ${i.patientMrn.trim()}`, '_Save this for future bookings._');
    }
    parts.push('', "We'll send a reminder before your visit. Reply here anytime if you need to reschedule or have questions.");
    return parts.join('\n');
  }
  ```
- [x] 1.2 `formatDateWithMiddot` implemented as a regex-based helper in `dm-copy.ts`. Matches `"Wkday, Mon D[, YYYY], H:MM AM/PM"` → `"Wkday, Mon D · H:MM AM/PM"` (year dropped, date/time comma replaced with middle dot). Returns input unchanged on any format variance; never throws.

### 2. Wire

- [x] 2.1 Replaced the inline template at `notification-service.ts:180` with:
  ```ts
  const message = buildPaymentConfirmationMessage({
    appointmentDateDisplay: dateStr,
    patientMrn: patientMrn?.trim() || undefined,
  });
  ```
- [x] 2.2 Removed the now-unused `idLine` local.

### 3. Tests

- [x] 3.1 Snapshots committed (3 new cases, snapshot suite now at 29):
  - `payment / with MRN (happy path, year-stripped middot date)`
  - `payment / without MRN (shorter variant)`
  - `payment / MRN has surrounding whitespace (trims before rendering)`
- [x] 3.2 Unit tests for `formatDateWithMiddot` (4 cases: year, no year, single-digit day+hour, unexpected shape) + 3 `buildPaymentConfirmationMessage` invariants (MRN omission on empty/whitespace, closing paragraph, exactly-one ✅/🆔).

### 4. Verification

- [x] 4.1 `tsc --noEmit` clean.
- [x] 4.2 Full unit suite green: **879 tests / 80 suites / 29 snapshots** (up from 869/80/26 post-Task-04, +10 tests, +3 snapshots). No regressions.
- [ ] 4.3 Staging: trigger a test payment → verify the DM matches target shape with MRN; repeat with a patient missing MRN (or simulate) → verify shorter variant. _(manual, deferred to staging rollout)_

---

## Files to Create/Update

```
backend/src/utils/dm-copy.ts                                   — UPDATED (add buildPaymentConfirmationMessage + formatDateWithMiddot)
backend/src/services/notification-service.ts                   — UPDATED (call builder; remove idLine)
backend/tests/unit/utils/dm-copy.snap.test.ts                  — UPDATED (3 snapshots)
backend/tests/unit/utils/__snapshots__/dm-copy.snap.test.ts.snap — UPDATED
```

---

## Design Constraints

- **✅ and 🆔 are the only emojis in this task's copy.** No other emoji anywhere.
- **Date line always bolds the full "day · time"** segment.
- **MRN line always below the confirmation sentence** — never in the first paragraph.
- **Closing line invites replies** — this is the only place where we proactively tell the patient "you can still talk to us here". That messaging matters because the payment DM often comes many hours after the booking flow ended.
- **Italics only for the helper under the MRN** — nothing else uses italics in this message.

---

## Global Safety Gate

- [x] **Data touched?** Reads appointment + doctor settings; no writes beyond existing audit log. Unchanged from pre-refactor.
- [x] **Any PHI in logs?** No new logging added.
- [x] **External API or AI call?** No.
- [x] **Retention / deletion impact?** None.

---

## Acceptance & Verification Criteria

- [x] `buildPaymentConfirmationMessage` exists and handles both variants (with / without MRN), with `🆔 Patient ID` + italic "save" helper appearing only when MRN is non-empty after trim.
- [x] `notification-service.ts:180` calls the builder; inline template literal and `idLine` local are gone.
- [x] 3 snapshots committed; `formatDateWithMiddot` unit tests + `buildPaymentConfirmationMessage` invariants pass.
- [x] `tsc --noEmit` clean; full suite green (879 / 80 / 29).
- [ ] Staging manual verification on both variants. _(manual step owned by rollout)_

---

## Related Tasks

- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md) — prerequisite.
- [Task 06](./task-06-abandoned-reminder-url.md) — sibling message on the booking edge of the patient lifecycle.

---

**Last Updated:** 2026-04-18  
**Pattern:** Emotionally-important happy-path message gets dedicated structure + trust signals  
**Reference:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)
