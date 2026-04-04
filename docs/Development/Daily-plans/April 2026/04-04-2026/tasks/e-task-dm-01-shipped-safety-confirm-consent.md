# e-task-dm-01: DM safety copy, confirm routing, consentExtras, collection gate (shipped + follow-ups)

## 2026-04-04

---

## 📋 Task Overview

Track **shipped** backend work from early April 2026 that improves Instagram DM behavior:

- **Medical `medical_query` replies** no longer tell patients to “call the clinic”; copy steers to **teleconsult via chat** (localized EN / HI / PA, including Roman scripts).
- **Detail confirmation:** broadened detection of bot “confirm details / reply yes” wording so short **yes** does not fall through to ambiguous **collection → LLM** when the last assistant message was a confirm prompt.
- **Collection branch** skips when **effectiveAskedForConfirm** + short affirmative so **`confirm_details`** handles the turn.
- **Consent:** replies parsed as **unclear** but meaning “skip extras” (e.g. *nothing*, *no thanks*) now proceed to **persist + slot link** instead of LLM-only fallback.

Follow-up work: strengthen automated tests and fix brittle mocks so characterization tests reflect current AI service exports.

**Estimated Time:** Follow-ups 0.5–1 day  
**Status:** ✅ **Core behavior shipped** — follow-ups ✅ **DONE** (2026-03-31)

**Change Type:**
- [x] **Update existing** — `safety-messages`, `instagram-dm-webhook-handler`, `consent` branch behavior, tests (partial)

**Current State:**
- ✅ Ship commits on `main` (e.g. safety + routing + capture docs in separate commit).
- ✅ `backend/src/utils/safety-messages.ts` — medical_query strings without clinic call.
- ✅ `backend/src/workers/instagram-dm-webhook-handler.ts` — `lastBotMessageAskedForConfirm`, collecting_all guard, `hasExtrasOrGranted` for consent.
- ✅ `webhook-worker-characterization.test.ts` — `intentSignalsFeeOrPricing` wired via `jest.requireActual` on `ai-service`; confirm → consent + unclear consent → URL covered.

**Reference:**
- [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

## ✅ Task Breakdown

### 1. Shipped (verification only)
- [x] 1.1 Medical safety copy reviewed in EN + localized paths — **Completed: 2026-04-04**
- [x] 1.2 Confirm-yes path reaches `confirm_details` when last bot asked AI-style confirm — **Completed: 2026-04-04**
- [x] 1.3 Consent “skip extras” proceeds to booking link path — **Completed: 2026-04-04**

### 2. Follow-ups (recommended)
- [x] 2.1 Repair **webhook worker unit test mocks** so imports match `ai-service` exports (fee / intent helpers). — **2026-03-31**
- [x] 2.2 Add characterization coverage: **confirm-yes → consent**; **consent unclear (skip-extras) → booking URL**; existing **consent granted → URL**. — **2026-03-31**
- [x] 2.3 Document branches in **RECIPES** (section 19, ARM-04): confirm / consent unclear / `jest` mock note. — **2026-03-31**

---

## 📁 Files to Create/Update

**Shipped (reference):**
- ✅ `backend/src/utils/safety-messages.ts`
- ✅ `backend/src/workers/instagram-dm-webhook-handler.ts`
- ✅ `backend/tests/unit/utils/safety-messages.test.ts`

**Follow-ups:**
- ✅ `backend/tests/unit/workers/webhook-worker-characterization.test.ts` — `intentSignalsFeeOrPricing` + confirm / consent scenarios

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N for follow-up docs/tests; Y for shipped code (conversation state only in logic paths).
- [x] **PHI in logs?** Must remain absent — existing redaction paths apply.
- [x] **External AI?** Y for LLM branches unrelated to these deterministic fixes; no change to redaction contract expected in follow-ups.

---

## ✅ Acceptance & Verification Criteria

- [x] Safety copy does not reference clinic phone for medical_query deflection (product requirement).
- [x] Characterization / webhook tests green after mock updates (`webhook-worker-characterization.test.ts`).
- [x] Tests assert booking URL on consent granted and on consent unclear (skip-extras) paths.

---

## 🔗 Related Tasks

- [e-task-dm-02-thread-aware-fee-catalog.md](./e-task-dm-02-thread-aware-fee-catalog.md)
- [e-task-dm-03-turncontext-memory-layer.md](./e-task-dm-03-turncontext-memory-layer.md)

---

**Last Updated:** 2026-03-31  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)
