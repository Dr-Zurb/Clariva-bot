# Task B7: Post-Consent Detail Corrections Without Full Restart
## 2026-04-14 — Sprint 3

---

## Task Overview

Allow patients to correct their details (name, phone, age, gender) after the consent step without requiring a full booking restart. If a patient says "wait, my name is wrong" during consent, re-enter `confirm_details` with the correction.

**Estimated Time:** 3 hours
**Status:** DONE
**Completed:** 2026-04-14

**Change Type:**
- [x] **Update existing** — Change or remove existing code

**Current State:**
- Consent flow in `instagram-dm-webhook-handler.ts` ~2304–2461: only handles yes/no/unclear — no mechanism to detect correction intent
- After consent, there's no backward path to `confirm_details`
- Patient must complete or deny consent; corrections require starting over

**What's missing:**
- Correction intent detection during consent step
- Backward navigation from `consent` → `confirm_details`
- Merging the corrected field into collected data

**Scope Guard:**
- Expected files touched: 2
- `instagram-dm-webhook-handler.ts`, `ai-service.ts`

**Reference:** [scenario-alignment-plan.md](./scenario-alignment-plan.md) § B7
**Scenario:** Gap G10 from [all bot patient scenarios](../../Reference/all%20bot%20patient%20scenarios)

---

## Task Breakdown

### 1. Detect correction intent during consent
- [x] 1.1 Before running the consent yes/no classifier, check for correction signals:
  - Regex: "wait", "wrong", "that's not right", "my name is", "change my", "actually it's", "correct my"
  - Or: LLM classification returns a correction/update-details intent
- [x] 1.2 If correction detected → extract what field they want to change and the new value

### 2. Re-enter confirm_details
- [x] 2.1 Set `step: 'confirm_details'`
- [x] 2.2 Update the relevant collected field (e.g., `patient_name`, `phone`, `age`, `gender`) in conversation state
- [x] 2.3 Re-present the updated details for confirmation: "I've updated your name to X. Is everything correct?"
- [x] 2.4 Flow continues normally from confirm_details (match check → consent → slot)

### 3. Handle ambiguous corrections
- [x] 3.1 If the patient says something vague ("that's wrong") without specifying what → ask: "What would you like to correct?"
- [x] 3.2 If they provide the correction inline ("my name is actually Rahul") → extract and apply directly

### 4. Verification
- [x] 4.1 `tsc --noEmit` passes
- [x] 4.2 Manual test: during consent, say "wait my name is wrong, it's Rahul" → re-confirm with updated name
- [x] 4.3 Manual test: during consent, say "yes" → normal flow (no regression)
- [x] 4.4 Manual test: during consent, say "no" → denied (no regression)

---

## Files to Create/Update

- `instagram-dm-webhook-handler.ts` — MODIFY (add correction detection before consent classifier)
- `ai-service.ts` — MODIFY (if using LLM for correction intent detection)

---

## Design Constraints

- Correction detection must NOT interfere with clear yes/no consent replies
- Only allowed during `consent` step (not other steps)
- Must preserve all other collected fields when one is corrected
- Multiple corrections in sequence should work (patient corrects name, then phone)

---

## Global Safety Gate

- [x] **Data touched?** Yes — updating collected patient data in conversation state
  - [x] **RLS verified?** No DB write, only state update
- [x] **Any PHI in logs?** No (corrections not logged with values)
- [x] **External API or AI call?** Possibly LLM for correction parsing
- [x] **Retention / deletion impact?** No

---

## Acceptance Criteria

- [x] "Wait, my name is wrong" during consent → re-enter confirm_details with updated name
- [x] "My phone is actually 9876543210" during consent → phone updated, re-confirm
- [x] Vague "that's wrong" → bot asks what to correct
- [x] Clear "yes" during consent → normal flow (no regression)
- [x] Clear "no" during consent → denied (no regression)

---

**Last Updated:** 2026-04-14
