# e-task-dm-05: Close the “silent assignment” gap — two outcomes only, no patient tier menu

## 2026-04-04 (scoped); execution TBD

---

## 📋 Task Overview

**e-task-dm-04** shipped reason-first triage and narrow quotes when the matcher returns **exactly one** catalog row, plus **competing visit-type buckets** → staff defer when **both** NCD-style and acute/general signals appear in the merged thread. In practice, patients still see **multi-row teleconsult menus** or **LLM paraphrases** that ask them to pick a category/modality, because:

1. **Competing-buckets** is narrower than “clinical thread + multi-row catalog” — a strong single-bucket signal (e.g. blood sugar only) still allows **multiple** `pickCatalogServicesForFeeDm` rows or **`ai_open_response`** with a full catalog in the system prompt.
2. **Short fee follow-ups** (“what is it?” after a payment ack) may **not** hit `signalsFeePricing` → **`fee_deterministic_idle`** is skipped → **`generateResponse`** lists tiers.
3. **Product copy** does not yet consistently promise: *we match your reason to the right visit type; you do not choose fee options in chat.*

This task **solidifies** the product rule: **after reason is in play**, patient-facing outcomes are only **(A)** one aligned fee surface (single row / modalities) **or** **(B)** staff confirmation + SLA — **not** a third path where the model or markdown shows “pick General vs NCD vs Other.”

**Estimated Time:** 4–8 days (policy + handler + composer + AI flags + tests + staging)

**Status:** ⏳ **PENDING**

**Change Type:**

- [ ] **Update existing** — `instagram-dm-webhook-handler.ts`, `consultation-fees.ts`, `reason-first-triage.ts`, `ai-service.ts`, `dm-reply-composer.ts` (as needed), types/instrumentation, unit + routing fixtures
- [ ] **Documentation** — [SILENT_FEE_ASSIGNMENT_POLICY.md](../../../../../task-management/SILENT_FEE_ASSIGNMENT_POLICY.md), branch inventory / RECIPES if branches change

**Dependencies:**

- **e-task-dm-04** — reason-first phases, defer hooks, narrow intro when one row.
- **e-task-dm-02** — thread-aware `catalogMatchText` / merge patterns.
- **e-task-arm-01 … e-task-arm-11** — staff review / placeholder row (reuse defer copy patterns).

**Reference:**

- [SILENT_FEE_ASSIGNMENT_POLICY.md](../../../../../task-management/SILENT_FEE_ASSIGNMENT_POLICY.md)
- [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)
- [e-task-dm-04](./e-task-dm-04-reason-first-triage-silent-assignment.md)

---

## 🎯 Product principles (extends e-task-dm-04)

1. **Two outcomes after reason-first or clinical-led fee interest:** show **one** fee story for the **server-assigned** (or high-confidence) row **or** **staff defer** messaging — no multi-tier patient choice.
2. **Explicit promise (microcopy):** at least one deterministic line in the triage/fee journey that states the practice **matches** the described concern to the correct visit type and **does not** ask patients to pick fee tiers in chat (localized variants EN / HI / PA per existing patterns).
3. **No third path via LLM:** `ai_open_response` must not be the backdoor for catalog listing when the thread is **clinical-led** or **`postMedicalConsultFeeAckSent`** / **`reasonFirstTriagePhase`** / deflection window indicates fee continuation; route to composer or staff.
4. **Anaphora:** fee-related follow-ups that lack pricing keywords but clearly continue a fee/payment turn (context from last bot message + thread) must still hit **deterministic fee** or **staff** logic — not unrestricted `generateResponse` with full catalog.
5. **Optional (later phase):** a **distinct** user intent for “show all consultation types / full price list” (non-clinical or explicit opt-in) may remain — must not hijack the default clinical-first path.

---

## ✅ Task breakdown

### 1. Policy & detection (server-side)

- [ ] **1.1** Define **`clinicalLedFeeThread`** (name TBD): e.g. `recentPatientThreadHasClinicalReason` **or** `lastMedicalDeflectionAt` in window **or** `reasonFirstTriagePhase` active **or** `postMedicalConsultFeeAckSent` with ongoing fee dialogue — document edge cases in policy doc.
- [ ] **1.2** Define **`feeFollowUpAnaphora`**: short turns (“what is it?”, “how much for that?”, “the fee?”) when last bot turn mentioned payment/fee/consultation cost — regex + last-bot heuristics; avoid false positives on unrelated “what is it?”.
- [ ] **1.3** Define when **`silentAssignmentStrict`** (or extend `competingVisitTypeBuckets`) applies to **LLM** `buildResponseSystemPrompt` / `GenerateResponseContext`: clinical-led + multi-row catalog **or** any turn where deterministic path would refuse tier menus.

### 2. Composer & matcher (`consultation-fees.ts`)

- [ ] **2.1** When **`clinicalLedFeeThread`** (injected flag from caller) **and** `pickCatalogServicesForFeeDm` would return **>1** visible row **and** staff defer is not already triggered: **prefer** (order TBD in design): Stage-A / NCD pick / single-row heuristic → else **reuse** staff-placeholder defer (same patient copy family as `formatCompetingVisitTypeDeferToStaffDm` or shared helper) with reason codes distinguishing “ambiguous visit type” vs “competing buckets.”
- [ ] **2.2** Ensure **pure** pricing with **no** clinical thread still allows full catalog where product allows (regression vs e-task-dm-04 §1.2 escape).
- [ ] **2.3** Unit tests: blood-sugar-only thread + multi-row catalog → **no** three-row markdown body (either one row or staff defer).

### 3. Webhook routing (`instagram-dm-webhook-handler.ts`)

- [ ] **3.1** Compute thread flags once per turn (TurnContext / local helper): clinical-led, fee anaphora, post-medical ack chain.
- [ ] **3.2** **Before** `ai_open_response`, if **fee anaphora** or **pricing** with clinical-led: force **`fee_deterministic_idle`** (or staff branch) with `catalogMatchText` — do not fall through to LLM with full catalog.
- [ ] **3.3** Pass **`clinicalLedFeeThread`** (or equivalent) into `composeIdleFeeQuoteDmWithMeta` / mid-collection composer when applicable.
- [ ] **3.4** Extend **`DmHandlerBranch`** / logging for new sub-branches (e.g. `fee_deterministic_idle_clinical_strict`, `fee_anaphora_routed`).

### 4. Microcopy (`reason-first-triage.ts`, fee defer helpers, optionally triage intros)

- [ ] **4.1** Add **one** patient-visible **promise line** (EN + HI + PA) aligned with [SILENT_FEE_ASSIGNMENT_POLICY.md](../../../../../task-management/SILENT_FEE_ASSIGNMENT_POLICY.md) — wire into ask-more bridge, post-medical ack follow-up, or narrow-fee intro (product picks least noisy placement).
- [ ] **4.2** Confirm staff-defer templates stay consistent (“no payment yet”, SLA) across competing-buckets and new ambiguous-bucket path.

### 5. AI layer (`ai-service.ts`)

- [ ] **5.1** When **`silentAssignmentStrict`** (or extended flag) is true: mirror **competing** prompt behavior — **no** verbatim multi-row catalog; directive to defer to practice confirmation; no “tell me which category.”
- [ ] **5.2** **`buildAiContextForResponse`:** set flag from same thread signals as §1 (avoid drift from webhook).

### 6. Optional: full list escape (separate thin task or §6 only)

- [ ] **6.1** Document **explicit** “list all prices” intent (existing `userWantsExplicitFullFeeList` + classifier) as the **only** patient-triggered full catalog; verify it **does not** apply during active `reasonFirstTriagePhase` unless product waives.
- [ ] **6.2** Optional UI/runbook note for practices that want transparency-first (out of scope for coded enforcement unless product asks).

### 7. Verification

- [ ] **7.1** Unit: `reason-first-triage`, `consultation-fees`, `intentSignalsFeeOrPricing` / anaphora helper; golden DM transcript: symptom → deflection → “so i pay?” / “what is it?” → **no** multi-tier menu from LLM path.
- [ ] **7.2** Staging: screenshot transcript matches policy doc acceptance checklist.
- [ ] **7.3** `npm run type-check`; regression **pure** “how much is video?” without clinical thread still acceptable.

---

## 📁 Files likely touched

| Area | Path(s) |
|------|---------|
| DM orchestration | `backend/src/workers/instagram-dm-webhook-handler.ts` |
| Fee / catalog | `backend/src/utils/consultation-fees.ts` |
| Reason-first copy | `backend/src/utils/reason-first-triage.ts` |
| Turn context | `backend/src/utils/dm-turn-context.ts` (if flags centralized) |
| AI | `backend/src/services/ai-service.ts` |
| Types | `backend/src/types/conversation.ts`, `dm-instrumentation.ts` |
| Tests | `backend/tests/unit/utils/`, worker/routing fixtures |
| Docs | `docs/task-management/SILENT_FEE_ASSIGNMENT_POLICY.md`; Reference branch inventory |

---

## 🌍 Global safety gate

- [ ] **PHI in logs:** unchanged; no raw thread logging in new helpers.
- [ ] **Clinical safety:** copy must not diagnose; assignment remains scheduling/fee routing only.
- [ ] **Staff SLA:** reuse existing `staffServiceReviewSlaHours` messaging.

---

## ✅ Acceptance criteria

- [ ] Clinical-led threads (per §1.1) **never** receive a patient-facing **multi-row tier picker** from deterministic **or** default LLM path; outcome is **narrow fee** or **staff wait** copy.
- [ ] Fee **anaphora** follow-ups route to fee logic without requiring keywords like “pay” on every turn.
- [ ] At least one **promise line** (§4.1) ships in deterministic UX.
- [ ] Policy doc and daily README link this task; instrumentation allows ops to verify branch mix.

---

## 🔗 Related tasks

- [e-task-dm-04](./e-task-dm-04-reason-first-triage-silent-assignment.md)
- [e-task-dm-02](./e-task-dm-02-thread-aware-fee-catalog.md)
- [e-task-dm-03](./e-task-dm-03-turncontext-memory-layer.md)

---

**Last updated:** 2026-03-31
