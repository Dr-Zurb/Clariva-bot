# Task lang-26: Booking-critical arms + invert the English-lock tests

> **Links:** batch [`../plan-p6-translation-arms-batch.md`](../plan-p6-translation-arms-batch.md) · exec [`./EXECUTION-ORDER-p6-translation-arms.md`](./EXECUTION-ORDER-p6-translation-arms.md)

---

## 📋 Task Overview

Translate the funnel a patient actually walks: greeting through payment confirmation, plus cancel, reschedule, and status.

Two distinct pieces of work. §1 inverts the tests that currently assert Hindi equals English — **its own commit, before any translation lands**. Everything after is translation.

When this task closes, the acceptance gate p3 wrote and could not keep becomes true: a booking conducted in Hinglish is Hinglish end to end.

Reviewer-bound, not engineer-bound. Plan around their availability.

**Program / Phase:** bot-language-policy · p6 · Waves 2–3
**Estimated Time:** ~10–12 hours engineering + reviewer wall-clock
**Status:** ✅ Eng done 2026-08-03 (provisional `reviewer: founder` — real Hindi/Punjabi register review still open; see capture inbox)
**Change Type:** Copy (translation)
**Model:** Sonnet + human reviewer
**Depends on:** `lang-25` (mechanism, workflow, proof family)

---

## ✅ Task Breakdown

### 1. Invert the English-lock tests — separate commit, no translations

- [x] 1.1 `dm-copy-locale-invariants.test.ts` — confirm-details → `expectReviewedOrDeliberateEnglish` (LANG6-D1/D8).
- [x] 1.2 Same inversion for the refund DMs.
- [x] 1.3 Same for `formatReasonFirstAskMoreQuestion`.
- [x] 1.4 Sentinel guard skips English peers only for `enByPolicy` families.
- [x] 1.5 Retitled inverted tests to cite LANG6-D1/D8.
- [x] 1.6 Suite green after inversion (checkpoint before translations).

### 2. Intake and confirmation

- [x] 2.1 `buildIntakeRequestMessage` — Roman hi/pa (field labels kept English — LANG6-D6).
- [x] 2.2 `buildConfirmDetailsMessage` — translated; PHI tokens preserved.
- [x] 2.3 `buildCorrectionFieldClarifierReply` — all correction fields.
- [x] 2.4 `buildConsentOptionalExtrasMessage`.
- [x] 2.5 `resolveConsentUnclearMessage` (`booking-consent-context.ts`).

### 3. Booking, slots, payment

- [x] 3.1 `booking-link-copy.ts` — primary / reschedule / choice / awaiting follow-up.
- [x] 3.2 `buildPaymentConfirmationMessage`.
- [x] 3.3 `staff-service-review-dm.ts` — awaiting / still-pending / SLA timeout.
- [x] 3.4 Funnel clarifiers (self-nudge, teleconsult pick, book-for-them, etc.).

### 4. Cancel, reschedule, status

- [x] 4.1 lang-20 builders: confirm prompts, not-found, numeric-invalid, status single/list, post_booking_ack, cancelled, declined.
- [x] 4.2 `resolveNoUpcomingAppointmentsMessage`.
- [x] 4.3 `buildCancelChoiceListMessage` + reschedule choice list.
- [x] 4.4 `appointmentConsultationTypeToLabel` — **`enByPolicy`** (LANG6-D6: patients keep English modality labels).

### 5. System copy

- [x] 5.1 `FALLBACK_REPLY` + throttle ack.
- [x] 5.2 Pause-gate default (`lang-21`). Doctor custom copy still pass-through (LANG5-D4).
- [x] 5.3 Welcome-back segment.

### 6. Review

- [ ] 6.1–6.4 Real Hindi + Punjabi clinic-register reviewers (LANG6-D5). Provisional founder approval recorded in manifest; capture inbox tracks lineup. Rejected families must flip to `enByPolicy` — never ship half-reviewed.

### 7. Tests

- [x] 7.1 Snapshots updated; hi cancel-list spot-checked.
- [x] 7.2 `en` arms unchanged in lang-20/21/23 byte-identical tests.
- [x] 7.3 Locale invariants / LANG3-D6 token checks green.
- [x] 7.4 Sentinel guard enforces translated ≠ English for enrolled families.
- [x] 7.5 Composed / language-param tests updated (lang-20/21/22/23).
- [x] 7.6 Coverage guard green.

---

## 📁 Files

```
UPDATE: backend/tests/unit/utils/dm-copy-locale-invariants.test.ts (§1 — separate commit)
UPDATE: backend/src/utils/dm-copy.ts (or split modules) — booking-critical families
UPDATE: backend/src/utils/booking-link-copy.ts
UPDATE: backend/src/utils/staff-service-review-dm.ts
UPDATE: backend/src/utils/booking-consent-context.ts (punch-list)
UPDATE: backend/src/utils/dm-appointment-status.ts (punch-list)
UPDATE: backend/src/utils/dm-reply-composer.ts (welcome-back)
UPDATE: backend/src/utils/reason-first-triage.ts (ask-more)
UPDATE: backend/src/utils/locale-arm-manifest.ts
UPDATE: backend/tests/unit/utils/__snapshots__/dm-copy.snap.test.ts.snap
DO NOT TOUCH: legal / versioned consent copy (LANG6-D4)
DO NOT TOUCH: English arms
DO NOT TOUCH: notification / out-of-band families (lang-27)
DO NOT TOUCH: any caller — p5 finished the wiring
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **§1 ships alone.** Do not mix the test inversion with translated strings; the whole point is that the two diffs are separately legible.
- **Nothing unreviewed ships** (LANG6-D5). Under delivery pressure this is the rule that will feel skippable. It is not.
- Do not reword English while translating.
- Do not translate legal or versioned consent text.
- Do not invent Hindi clinical terminology — if patients say the English word, keep it.
- Do not transliterate between `hi` and `hi-Latn` (LANG6-D7).
- Do not partially ship a family (§6.3).

---

## ✅ Acceptance Criteria

- [x] Test inversion landed; suite permits reviewed or deliberate English.
- [x] Booking funnel, cancel/reschedule/status, and system copy translated and enrolled, or explicitly marked English (`enByPolicy`).
- [x] `en` byte-identical covered by lang-20/21/23 tests.
- [x] LANG3-D6 protected tokens identical across locales (invariant suite).
- [x] Coverage guard green.
- [x] Typecheck + targeted tests green.
- [ ] Real bilingual reviewer sign-off (LANG6-D5) — not founder provisional.

---

**Created:** 2026-08-02.
**Eng closed:** 2026-08-03. Next: `lang-27` notification/OOB arms; founder IG smoke still open from p5.
