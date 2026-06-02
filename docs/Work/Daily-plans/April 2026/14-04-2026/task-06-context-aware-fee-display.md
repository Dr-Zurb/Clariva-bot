# Task A2: Context-Aware Fee Display (Modality Breakdown for Fee Inquiry)
## 2026-04-14 — Sprint 2

---

## Task Overview

Make the fee table DM context-aware: when the patient is asking about fees, show the full per-modality price breakdown (Text: ₹X, Voice: ₹Y, Video: ₹Z). When the context is booking, show a single collapsed price or range.

**Estimated Time:** 3 hours
**Status:** DONE
**Completed:** 2026-04-14

**Change Type:**
- [x] **Update existing** — Change or remove existing code

**Current State:**
- `consultation-fees.ts` ~754–778: `buildServiceCatalogFeeDmResultFromPick` always collapses all modality prices to a single min–max range
- No `showModalityBreakdown` flag or equivalent exists
- `clinicalLedFeeThread` controls **which services** are shown (row selection), not how modalities are formatted
- Previous code (pre-commit b282f5c) showed per-modality lines with `MODALITY_DM_LABEL` — that was removed

**What's missing:**
- A `showModalityBreakdown` parameter on `buildServiceCatalogFeeDmResultFromPick`
- Per-modality line rendering when `true`
- Callers passing the correct flag based on context

**Scope Guard:**
- Expected files touched: 3–4
- `consultation-fees.ts`, `dm-reply-composer.ts`, `instagram-dm-webhook-handler.ts`, `consultation-fees.test.ts`

**Reference:** [scenario-alignment-plan.md](./scenario-alignment-plan.md) § A2
**Scenarios:** [all bot patient scenarios](../../Reference/all%20bot%20patient%20scenarios) § 4, 6

---

## Task Breakdown

### 1. Add `showModalityBreakdown` parameter
- [x] 1.1 Add `showModalityBreakdown?: boolean` to `buildServiceCatalogFeeDmResultFromPick` options/params
- [x] 1.2 Default to `false` (collapsed) for backward compatibility

### 2. Implement per-modality rendering
- [x] 2.1 When `showModalityBreakdown === true` AND service has multiple modalities:
  - Render each enabled modality on its own line: `  - **Text**: ₹80`, `  - **Voice**: ₹120`, `  - **Video**: ₹150`
  - Keep the service label as the header: `**General Consultation** (\`general_consultation\`):`
- [x] 2.2 When `showModalityBreakdown === true` AND service has only one modality:
  - Show single price (same as collapsed — no breakdown needed)
- [x] 2.3 When `showModalityBreakdown === false`: keep current collapsed min–max behavior

### 3. Update all callers
- [x] 3.1 **Fee inquiry paths** (should show breakdown):
  - `composeIdleFeeQuoteDmWithMetaAsync` / idle fee → `showModalityBreakdown: true`
  - Reason-first fee narrow (`runReasonFirstFeeNarrowFromTriage`) → `true`
  - Fee follow-up anaphora → `true`
  - Mid-collection fee → `true`
  - Full fee list escape → `true`
- [x] 3.2 **Booking paths** (should NOT show breakdown):
  - `book_responded` pricing → `false`
  - Fee→Booking transition → `false`
  - Any path where `activeFlow` is transitioning to booking → `false`

### 4. Update tests
- [x] 4.1 `consultation-fees.test.ts`: add test for `showModalityBreakdown: true` — verify per-modality lines present
- [x] 4.2 `consultation-fees.test.ts`: add test for `showModalityBreakdown: false` — verify collapsed single price
- [x] 4.3 Update any existing tests that assert on fee table format

### 5. Verification
- [x] 5.1 `tsc --noEmit` passes
- [x] 5.2 `npm test` passes (all fee tests)
- [x] 5.3 Golden corpus re-run

---

## Files to Create/Update

- `consultation-fees.ts` — MODIFY (add flag + per-modality rendering)
- `dm-reply-composer.ts` — MODIFY (pass flag from context)
- `instagram-dm-webhook-handler.ts` — MODIFY (pass flag at call sites)
- `consultation-fees.test.ts` — MODIFY (new test cases)

---

## Design Constraints

- `clinicalLedFeeThread` must coexist (it controls row selection, this controls modality display)
- Per-modality lines must use the same currency formatting (`formatMinorCurrencyDm`)
- Follow-up policy hints should appear once per service, not per modality
- Must NOT show breakdown when only one modality exists (redundant)

---

## Global Safety Gate

- [x] **Data touched?** No
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** No — deterministic formatting
- [x] **Retention / deletion impact?** No

---

## Acceptance Criteria

- [x] Fee inquiry: "how much is a consultation?" → per-modality breakdown shown (Text/Voice/Video)
- [x] Booking transition: "okay book" → single price or range (no breakdown)
- [x] Single-modality service → single price in both contexts
- [x] All existing fee tests pass
- [x] New tests cover both `true` and `false` flag paths

---

**Last Updated:** 2026-04-14
**Related:** [task-03-booking-modality-transition.md](./task-03-booking-modality-transition.md)
