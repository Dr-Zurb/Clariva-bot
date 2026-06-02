# Task B1+B4: Emergency State Cleanup + Consent Re-prompt on Unclear
## 2026-04-14 — Sprint 1

---

## Task Overview

Two small, related fixes in `instagram-dm-webhook-handler.ts`:
1. **B1:** Emergency branch should also clear `lastMedicalDeflectionAt` (currently only clears `reasonFirstTriagePhase` and `postMedicalConsultFeeAckSent`).
2. **B4:** When consent classifier returns `unclear`, re-prompt consent instead of proceeding to booking link.

**Estimated Time:** 45 minutes
**Status:** DONE
**Completed:** 2026-04-14

**Change Type:**
- [x] **Update existing** — Change or remove existing code

**Current State:**
- **B1:** Emergency branch ~1537–1538 clears `reasonFirstTriagePhase` and `postMedicalConsultFeeAckSent`, but NOT `lastMedicalDeflectionAt`. This means post-emergency follow-ups may still see the "post medical deflection" classifier goal, which is stale.
- **B4:** Consent flow ~2318–2320 treats `unclear` same as `granted` → proceeds to slot link. Spec says unclear should re-prompt.

**Scope Guard:**
- Expected files touched: 1
- `instagram-dm-webhook-handler.ts`

**Reference:** [scenario-alignment-plan.md](./scenario-alignment-plan.md) § B1, B4
**Scenarios:** [all bot patient scenarios](../../Reference/all%20bot%20patient%20scenarios) § 2, 11

---

## Task Breakdown

### 1. B1 — Clear `lastMedicalDeflectionAt` on emergency
- [x] 1.1 In the emergency branch state update (line 1539), added `lastMedicalDeflectionAt: undefined` — **Completed: 2026-04-14**
- [x] 1.2 Verified `lastMedicalDeflectionAt` is `string | undefined` in `ConversationState` type — **Completed: 2026-04-14**

### 2. B4 — Consent `unclear` → re-prompt
- [x] 2.1 Found consent handler at line 2318 (`hasExtrasOrGranted` condition) — **Completed: 2026-04-14**
- [x] 2.2 Changed `consentResult === 'granted' || consentResult === 'unclear'` → `consentResult === 'granted'` only — **Completed: 2026-04-14**
- [x] 2.3 `else` fallthrough (line 2449–2453) now keeps `step: 'consent'` — **Completed: 2026-04-14**
- [x] 2.4 Added re-prompt: "I didn't catch that — please reply **Yes** to consent and continue, or **No** to cancel." — **Completed: 2026-04-14**

### 3. Verification
- [x] 3.1 `tsc --noEmit` passes (zero errors) — **Completed: 2026-04-14**
- [x] 3.2 Verified: emergency clears `lastMedicalDeflectionAt` matching all other state-reset locations — **Completed: 2026-04-14**
- [x] 3.3 Verified: unclear consent hits re-prompt path, step stays `consent` — **Completed: 2026-04-14**

---

## Files to Create/Update

- `instagram-dm-webhook-handler.ts` — MODIFY (two small changes)

---

## Design Constraints

- B1 change must not break existing emergency→resume flow
- B4 re-prompt text should eventually be language-mirrored (A7), English OK for now

---

## Global Safety Gate

- [x] **Data touched?** No
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** No
- [x] **Retention / deletion impact?** No

---

## Acceptance Criteria

- [x] Emergency fires → `lastMedicalDeflectionAt` is cleared
- [x] Consent: unrelated/unclear message → consent re-prompted, step stays `consent`
- [x] Consent: clear "yes" → proceeds normally (no regression — `granted` path unchanged)
- [x] Consent: clear "no" → denied normally (no regression — `denied` path unchanged)

---

**Last Updated:** 2026-04-14
