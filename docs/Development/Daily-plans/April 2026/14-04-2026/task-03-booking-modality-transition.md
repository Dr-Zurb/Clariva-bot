# Task B2+B3: Modality Booking-Page-Only + Fee→Booking Transition Message
## 2026-04-14 — Sprint 1

---

## Task Overview

Two related booking UX fixes:
1. **B2:** Stop persisting `consultationModality` from chat when multiple modalities exist. Modality source of truth is the booking page.
2. **B3:** When transitioning from fee quote to booking, send an explicit message: "You'll choose your consultation mode on the booking page." Also expand `userExplicitlyWantsToBookNow` regex coverage.

**Estimated Time:** 1.5 hours
**Status:** DONE
**Completed:** 2026-04-14

**Change Type:**
- [x] **Update existing** — Change or remove existing code

**Current State:**
- **B2:** `instagram-dm-webhook-handler.ts` ~1564–1596 — `consultation_channel_pick` branch sets `consultationModality: nextModality` from user's text/voice/video pick in chat. This contradicts "modality only on booking page."
- **B3:** No dedicated transition message exists when going from `fee_quote` to booking. `formatFeeBookingCtaForDm` (~1183–1200) is generic. `userExplicitlyWantsToBookNow` may not match phrases like "okay book" or "let's go."

**Scope Guard:**
- Expected files touched: 2
- `instagram-dm-webhook-handler.ts`, `consultation-fees.ts`

**Reference:** [scenario-alignment-plan.md](./scenario-alignment-plan.md) § B2, B3
**Scenarios:** [all bot patient scenarios](../../Reference/all%20bot%20patient%20scenarios) § 5, 6

---

## Task Breakdown

### 1. B2 — Don't persist modality in chat
- [x] 1.1 In `consultation_channel_pick` branch, when doctor is teleconsult-only with **multiple** modalities enabled: do NOT set `consultationModality`
- [x] 1.2 Instead, acknowledge: "Got it, you can confirm your preferred mode on the booking page"
- [x] 1.3 If only **one** modality exists → auto-set is fine (no ambiguity)
- [x] 1.4 Ensure downstream booking link generation works without `consultationModality` being pre-set (the booking page handles it)

### 2. B3 — Fee → Booking transition message
- [x] 2.1 In the `book_responded` or `fee_quote` → booking transition path, add a specific message: "Great, let's book. You'll choose your consultation mode (text/voice/video) on the booking page."
- [x] 2.2 Show single price or range (already done by A2 change when `showModalityBreakdown: false`), not the full modality table again
- [x] 2.3 Expand `userExplicitlyWantsToBookNow` regex to cover:
  - "okay book" / "ok book"
  - "let's go" / "lets go"
  - "go ahead"
  - "proceed"
  - "sure, book" / "yes book"

### 3. Verification
- [x] 3.1 `tsc --noEmit` passes
- [x] 3.2 Unit test: `userExplicitlyWantsToBookNow("okay book")` → true
- [x] 3.3 Unit test: `userExplicitlyWantsToBookNow("let's go")` → true
- [x] 3.4 Review: channel pick with multiple modalities → modality NOT stored
- [x] 3.5 Review: fee shown → "do it" → transition message mentions booking page

---

## Files to Create/Update

- `instagram-dm-webhook-handler.ts` — MODIFY (channel pick + transition path)
- `consultation-fees.ts` — MODIFY (expand `userExplicitlyWantsToBookNow`)

---

## Design Constraints

- Booking page must support modality selection for this to work end-to-end
- Single-modality doctors are unaffected (modality can be auto-set)
- Transition message should eventually be language-mirrored (A7)

---

## Global Safety Gate

- [x] **Data touched?** No
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** No
- [x] **Retention / deletion impact?** No

---

## Acceptance Criteria

- [x] Multi-modality doctor: patient says "video" in chat → acknowledged but `consultationModality` NOT persisted
- [x] Single-modality doctor: modality auto-set (no change)
- [x] After fee quote, patient says "okay book" → recognized as booking intent
- [x] Transition message mentions "choose mode on the booking page"
- [x] No full modality table shown during booking transition

---

**Last Updated:** 2026-04-14
**Related:** [task-06-context-aware-fee-display.md](./task-06-context-aware-fee-display.md)
