# e-task-arm-03: Conversation state — match confidence & staff-review linkage

## 2026-04-02 — Metadata for routing & booking token behavior

---

## 📋 Task Overview

Extend **conversation state** (stored in `conversations.metadata` per existing patterns — **no PHI** in metadata values that echo patient text; use **field names / IDs / enums** only where possible) to carry:

- **Matcher output**: proposed `catalogServiceKey`, optional modality, **`match_confidence`** (`high` | `medium` | `low` or agreed enum), optional **machine-readable reason codes** for logging.
- **Staff review linkage**: identifier or status that ties the conversation to a **pending review** entity (created in e-task-arm-06) — e.g. review request id, `pending_staff_review: boolean`, **`staff_review_deadline`** ISO timestamp for SLA display in internal tools only.

Ensure **Instagram worker** persistence paths (`getConversationState` / save helpers) **merge** new keys without dropping existing SFU fields (`catalogServiceKey`, `consultationModality`, etc.).

**Estimated Time:** 0.5–1 day  
**Status:** ✅ **DONE** — types, helpers, DM matcher (**ARM-04**), staff APIs (**ARM-06/07**), `/book` hints (**ARM-09**).

**Change Type:**
- [x] **Update existing** — `ConversationState` interface; persist/merge in DM worker + any Redis/memory rules

**Current State:**
- ✅ `backend/src/types/conversation.ts` defines `catalogServiceKey`, `catalogServiceId`, `consultationModality`, `reasonForVisit`, steps.
- ✅ **ARM-03:** `serviceCatalogMatchConfidence`, `serviceCatalogMatchReasonCodes`, `matcherProposedCatalogServiceKey` / `Id` / `ConsultationModality`, `pendingStaffServiceReview`, `staffServiceReviewRequestId`, `staffServiceReviewDeadlineAt`, `serviceSelectionFinalized`; `SERVICE_CATALOG_MATCH_REASON_CODES`; helpers `applyMatcherProposalToConversationState`, `applyFinalCatalogServiceSelection`; tests in `backend/tests/unit/types/conversation-state-arm03.test.ts`.
- ✅ Call sites: Instagram matcher, staff confirm/reassign paths, `slot-page-info` / payment gate (**ARM-09/10/11**).

**Reference:**
- Plan §2, §4, §5
- COMPLIANCE: metadata must not store free-text PHI

---

## ✅ Task Breakdown

### 1. Types & documentation
- [x] 1.1 Extend **`ConversationState`** with new optional fields; document each in file header (what is allowed vs forbidden).
- [x] 1.2 Define **enum / union** for confidence in one shared type module to avoid drift between worker, APIs, and dashboard.

### 2. Persistence
- [x] 1.3 Audit **all** code paths that read/write conversation metadata; ensure new keys round-trip (worker, slot flow, booking token creation).  
      **Note:** `updateConversationState` **replaces** `conversations.metadata` with the object passed in; safe round-trip depends on read-modify-write of full state (`getConversationState` → mutate → `updateConversationState`). Instagram DM handler loads full state at start of processing; slot-selection passes merged `newState`. No code change required for ARM-03 field names once writers use the helpers.
- [x] 1.4 **Redaction**: ARM-03 fields are IDs/enums/timestamps only; no patient echo in metadata. Spot-check complete; periodic audit per COMPLIANCE.

### 3. Clear semantics
- [x] 1.5 Distinguish **AI proposal** vs **staff-confirmed** service key if product needs both for audit (names like `matcherProposedCatalogServiceKey` vs `catalogServiceKey` final — exact naming in implementation).
- [x] 1.6 When staff confirms, **transition** flags so `slot-page-info` and **e-task-arm-09** can expose **final** selection only — use `applyFinalCatalogServiceSelection` from staff path (ARM-06).

**Verification:**
- [x] 3.1 Unit tests: `backend/tests/unit/types/conversation-state-arm03.test.ts` (serialize round-trip via `JSON.stringify` / `parse`).

---

## 📁 Files (expected)

```
backend/src/types/conversation.ts                    — ✅ ARM-03 fields + helpers
backend/tests/unit/types/conversation-state-arm03.test.ts
backend/src/workers/instagram-dm-webhook-handler.ts   — ✅ matcher + staff-review integration (ARM-04/05/06)
backend/src/services/conversation-service.ts          — updateConversationState (full replace; document R-M-W)
```

---

## 🧠 Design Constraints

- **No PHI** in `conversations.metadata` — IDs and enums only for new fields; **reason_for_visit** stays in appropriate PHI stores per existing architecture.
- ARM-06 may add **foreign key** from review row → `conversation_id`; state holds **bidirectional** reference if needed.

---

## 🌍 Global Safety Gate

- [x] **PHI in metadata?** MUST remain **No** for new fields (IDs, enums, ISO timestamps only)
- [x] **Data touched?** Y — conversation rows (same `metadata` column; shape extended in types only until ARM-04/06 write)

---

## ✅ Acceptance Criteria

- Types and persistence aligned; worker merges safely.
- Logging compliance reviewed.
- Downstream tasks (ARM-04–06, ARM-09) can depend on this contract.

---

## 🔗 Related

- [e-task-arm-05](./e-task-arm-05-dm-flow-high-vs-pending-staff.md)
- [e-task-arm-06](./e-task-arm-06-pending-review-persistence-and-apis.md)
- [e-task-arm-09](./e-task-arm-09-slot-page-info-and-book-prefill.md)

---

**Last Updated:** 2026-03-31
