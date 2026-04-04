# e-task-dm-02: Thread-aware teleconsult fees and catalog narrowing (NCD / symptoms)

## 2026-04-04

---

## 📋 Task Overview

When a patient already described a **clinical concern** (e.g. blood sugar, diabetes) and then asks **cost**, **how much**, or seems to confirm a visit type, the bot must behave like a **digital receptionist**:

- **Do not** dump the **full** teleconsult catalog when a **single service row** is a strong match (e.g. non-communicable diseases / chronic glucose concern).
- **Do not** lock to **General checkup** solely because the user echoed the phrase “general checkup” while also naming **blood sugar** — resolve ambiguity with catalog matching rules or a **clarifying question**, per product policy.
- **Idle** and **mid-collection** fee paths must take **conversation context**, not only the **latest** user line, when narrowing `pickCatalogServicesMatchingUserText` or equivalent.

**Estimated Time:** 2–4 days  
**Status:** ⏳ **PENDING**

**Change Type:**
- [x] **Update existing** — fee DM composition, optional matcher integration, intent/fee routing

**Current State:**
- ✅ `composeIdleFeeQuoteDm` / `formatServiceCatalogForDm` / `pickCatalogServicesMatchingUserText` in `consultation-fees` (narrow only on label/service_key substrings in **current** `userText`).
- ✅ `matchServiceCatalog` in `service-catalog-matcher` (deterministic + LLM, matcher_hints, catalog allowlist).
- ✅ Instagram webhook: idle fee branch passes **only** current `text` into fee composer.
- ❌ **No** merged “effective clinical thread” string for fee narrowing.
- ❌ **No** caller guarantee that post-`medical_query` turns retain a **state** handle for the prior complaint (see e-task-dm-03).

**Dependencies:** Prefer coordination with **e-task-dm-03** (TurnContext / memory) so fee layer receives one canonical thread summary.

**Reference:**
- [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)
- [AI_RECEPTIONIST_MATCHING_INITIATIVE.md](../../../../../task-management/AI_RECEPTIONIST_MATCHING_INITIATIVE.md)

---

## ✅ Task Breakdown

### 1. Requirements & policy
- [ ] 1.1 Define product rules: when to show **one** service vs **full** menu vs **clarify** (document in task acceptance or product brief).
- [ ] 1.2 Define confidence threshold for auto-selecting catalog row vs asking user (align with ARM-03 / staff review if applicable).

### 2. Context input for fees
- [ ] 2.1 Introduce or consume a **single per-turn context object** (recent patient turns + optional state fields) for **idle** and **mid-collection** fee composition — do not pass **only** the latest message when prior turns contain chief complaint.
- [ ] 2.2 Ensure redaction rules match existing **PHI** handling for any concatenated thread used for matching (not for public logging).

### 3. Matching integration
- [ ] 3.1 When catalog exists, invoke or reuse **service catalog matcher** (or equivalent) using the **effective clinical text**, not label substring alone.
- [ ] 3.2 Handle **conflicting** signals (e.g. “general checkup” + “blood sugar”) per policy in §1.

### 4. Conversation state (coordination)
- [ ] 4.1 Persist **tentative** `service_key` / reason handle on conversation when matcher is **high** confidence, so **book appointment** continues without re-asking visit type unnecessarily.

### 5. Verification
- [ ] 5.1 Unit tests: fee DM shows **subset** when thread mentions NCD-relevant symptoms and matcher agrees.
- [ ] 5.2 Regression: pure “how much” with **no** prior clinical text may still show full catalog or safe default per policy.
- [ ] 5.3 Manual DM test script documented (blood sugar → cost → book).

---

## 📁 Files to Create/Update

**Expected touch points (audit before editing):**
- `backend/src/utils/consultation-fees.ts` — `pickCatalogServicesMatchingUserText`, `formatConsultationFeesForDm` call chain
- `backend/src/utils/dm-reply-composer.ts` — idle / mid-collection composers’ signatures
- `backend/src/workers/instagram-dm-webhook-handler.ts` — fee branches, state updates
- `backend/src/services/service-catalog-matcher.ts` — call sites or exports as needed
- `backend/tests/unit/utils/dm-reply-composer.test.ts` and related

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Fee amounts and catalog lines must remain **verbatim** from doctor settings / JSON — no invented rupees.
- Thread text used for matching must follow **redaction** and **consent** norms; no PHI in application logs.
- Behavior must remain correct when **OpenAI** is unavailable (deterministic / keyword / hints paths).

---

## 🌍 Global Safety Gate

- [ ] **Data touched?** (conversation state fields — verify persistence and RLS if new columns)
- [ ] **PHI in logs?** MUST remain No
- [ ] **External AI?** Y if matcher LLM used — consent + redaction confirmed per existing flows

---

## ✅ Acceptance & Verification Criteria

- [ ] After prior user message describes blood-sugar concern, a short **pricing** follow-up yields **NCD-appropriate** fee presentation per policy (not full menu-only default).
- [ ] Mixed “general checkup” + chronic symptom phrasing does not silently pick wrong row without policy handling.
- [ ] Tests and docs updated per [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md).

---

## 🔗 Related Tasks

- [e-task-dm-03-turncontext-memory-layer.md](./e-task-dm-03-turncontext-memory-layer.md)
- [e-task-ops-01-ncd-catalog-hints.md](./e-task-ops-01-ncd-catalog-hints.md)

---

**Last Updated:** 2026-04-04  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)
