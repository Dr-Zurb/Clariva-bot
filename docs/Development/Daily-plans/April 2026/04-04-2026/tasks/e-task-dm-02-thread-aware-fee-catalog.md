# e-task-dm-02: Thread-aware teleconsult fees and catalog narrowing (NCD / symptoms)

## 2026-04-04

---

## 📋 Task Overview

When a patient already described a **clinical concern** (e.g. blood sugar, diabetes) and then asks **cost**, **how much**, or seems to confirm a visit type, the bot must behave like a **digital receptionist**:

- **Do not** dump the **full** teleconsult catalog when a **single service row** is a strong match (e.g. non-communicable diseases / chronic glucose concern).
- **Do not** lock to **General checkup** solely because the user echoed the phrase “general checkup” while also naming **blood sugar** — resolve ambiguity with catalog matching rules or a **clarifying question**, per product policy.
- **Idle** and **mid-collection** fee paths must take **conversation context**, not only the **latest** user line, when narrowing `pickCatalogServicesMatchingUserText` or equivalent.

**Estimated Time:** 2–4 days  
**Status:** ✅ **Core implementation done** (2026-03-31) — optional: TurnContext (dm-03), manual DM script

**Change Type:**
- [x] **Update existing** — fee DM composition, optional matcher integration, intent/fee routing

**Current State:**
- ✅ `mergeFeeCatalogMatchText`, `pickCatalogServicesForFeeDm`, `formatConsultationFeesForDmWithMeta` — thread-aware narrowing + optional **`feeQuoteMatcherFinalize`** (high-confidence substring or Stage A `high`+`autoFinalize` only).
- ✅ `service-catalog-deterministic-match.ts` — Stage A extracted (no `consultation-fees` ↔ `ai-service` cycle).
- ✅ `composeIdleFeeQuoteDmWithMeta` / `composeMidCollectionFeeQuoteDmWithMeta` + webhook **`buildFeeCatalogMatchThread`** (`redactPhiForAI` on concatenated patient lines + current).
- ✅ Webhook applies **`mergeFeeQuoteMatcherIntoState`** when finalize metadata present (existing `applyMatcherProposalToConversationState`, no new DB columns).
- ⏳ **e-task-dm-03:** canonical TurnContext / memory for chief complaint still optional enhancement.

**Dependencies:** Prefer coordination with **e-task-dm-03** (TurnContext / memory) so fee layer receives one canonical thread summary.

**Reference:**
- [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)
- [AI_RECEPTIONIST_MATCHING_INITIATIVE.md](../../../../../task-management/AI_RECEPTIONIST_MATCHING_INITIATIVE.md)

---

## ✅ Task Breakdown

### 1. Requirements & policy
- [x] 1.1 Encode in implementation: single row when substring **or** Stage A unique hint/high-autoFinalize; full catalog when ambiguous; medium hint = narrow **display** without state finalize — **2026-03-31**
- [x] 1.2 State finalize only when **`feeQuoteMatcherFinalize`** present (high + substring or Stage A high+autoFinalize) — **2026-03-31**

### 2. Context input for fees
- [x] 2.1 Instagram fee branches pass **`catalogMatchText`** from recent patient messages + current line — **2026-03-31**
- [x] 2.2 **`redactPhiForAI`** on merged thread before use in matchers — **2026-03-31**

### 3. Matching integration
- [x] 3.1 **`runDeterministicServiceCatalogMatchStageA`** on merged text after substring pick (no OpenAI on fee path) — **2026-03-31**
- [x] 3.2 Conflicting labels resolved by ARM-02 **`matcher_hints`** (e.g. blood sugar → NCD row beats undifferentiated full menu); tie → full catalog — **2026-03-31**

### 4. Conversation state (coordination)
- [x] 4.1 **`mergeFeeQuoteMatcherIntoState`** + `finalizeSelection: true` when high-confidence finalize returned — **2026-03-31**

### 5. Verification
- [x] 5.1 Unit tests in `consultation-fees.test.ts` (NCD hints + regression) — **2026-03-31**
- [x] 5.2 Regression: no thread → both services listed — **2026-03-31**
- [ ] 5.3 Manual DM test script (optional ops doc)

---

## 📁 Files to Create/Update

**Touched (2026-03-31):**
- `backend/src/utils/service-catalog-deterministic-match.ts` **(new)** — Stage A + `pickSuggestedModality`
- `backend/src/utils/consultation-fees.ts` — `pickCatalogServicesForFeeDm`, thread merge, `*WithMeta` formatters
- `backend/src/utils/dm-reply-composer.ts` — `*WithMeta` composers
- `backend/src/workers/instagram-dm-webhook-handler.ts` — fee branches, `buildFeeCatalogMatchThread`, state merge
- `backend/src/services/service-catalog-matcher.ts` — imports deterministic util; re-exports unchanged API
- `backend/tests/unit/utils/consultation-fees.test.ts`

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Fee amounts and catalog lines must remain **verbatim** from doctor settings / JSON — no invented rupees.
- Thread text used for matching must follow **redaction** and **consent** norms; no PHI in application logs.
- Behavior must remain correct when **OpenAI** is unavailable (deterministic / keyword / hints paths).

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Conversation state JSON only (existing keys); no new columns — **2026-03-31**
- [x] **PHI in logs?** Unchanged; thread used for matching is redacted, not logged here — **2026-03-31**
- [x] **External AI?** Fee narrowing is deterministic (no LLM on this path) — **2026-03-31**

---

## ✅ Acceptance & Verification Criteria

- [x] Blood-sugar context in thread + pricing line → NCD-appropriate **narrow** fee block (unit test) — **2026-03-31**
- [x] Ambiguous multi-label cases fall back to **full** catalog or hint-winner per Stage A (no silent wrong finalize unless high-confidence) — **2026-03-31**
- [x] Unit tests added; task doc updated — **2026-03-31**

---

## 🔗 Related Tasks

- [e-task-dm-03-turncontext-memory-layer.md](./e-task-dm-03-turncontext-memory-layer.md)
- [e-task-ops-01-ncd-catalog-hints.md](./e-task-ops-01-ncd-catalog-hints.md)

---

**Last Updated:** 2026-03-31  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)
