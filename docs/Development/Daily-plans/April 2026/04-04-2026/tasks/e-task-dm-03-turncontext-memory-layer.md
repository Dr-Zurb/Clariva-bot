# e-task-dm-03: Context-first DM pipeline — TurnContext and conversation memory

## 2026-04-04

---

## 📋 Task Overview

Reduce the feeling that the bot **forgets the thread**: many **LLM** paths receive `recentMessages`, while **deterministic** branches (fees, some routing) historically used **only** the current `text`. **`buildAiContextForResponse`** also returns **minimal** context when the user is **not** in intake-related steps, so structured hints disappear during idle / pricing / post-safety-reply turns.

This task defines a **context-first** approach:

1. **Assemble once per inbound message:** a canonical **turn context** (recent turns, step, prompt kind, collected summary when relevant, **optional** durable “gist” fields on conversation state).
2. **Feed** intent classification, fee composition, catalog matching, booking, and link/slot rules from **that** package — **context before branch rules**.
3. **Persist** small, policy-safe handles after key turns (e.g. after `medical_query` detection, store a **non-diagnostic** routing phrase for the next user message so pricing can narrow services without re-reading full history if needed — exact fields subject to design review).

**Estimated Time:** 3–5 days  
**Status:** ⏳ **PENDING**

**Change Type:**
- [x] **Update existing** — webhook orchestration, context builders, optional `ConversationState` fields

**Current State:**
- ✅ `generateResponse` builds chat **history** from `recentMessages` (capped).
- ✅ `buildClassifyIntentContext` supplies **prior turns** + fee-thread hint for classification.
- ⚠️ `buildAiContextForResponse` **short-circuits** to `{}` outside collection/consent/confirm/match steps.
- ⚠️ `medical_query` path updates intent + `responded` but does **not** attach a durable routing handle for follow-up pricing/booking.
- ❌ No single **TurnContext** type or helper consumed by all branches.

**Dependencies:** Strongly coupled with **e-task-dm-02** (fee + matcher inputs).

**Reference:**
- [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)
- [AI_RECEPTIONIST_PLAN.md](../../../../../task-management/AI_RECEPTIONIST_PLAN.md)

---

## ✅ Task Breakdown

### 1. Design (what, not how — details in RECIPES/ARCHITECTURE after approval)
- [ ] 1.1 List **all** webhook branches that currently use **only** `text` where thread or state should matter.
- [ ] 1.2 Decide **minimal** state fields for “conversation gist” (chief complaint handle, tentative service, dialogue goal) and **retention rules** (TTL, clear on book complete, privacy review).

### 2. Turn assembly
- [ ] 2.1 Implement **one** per-message assembly entry point used by the Instagram DM worker (name and module TBD in implementation phase).
- [ ] 2.2 Ensure **redaction** parity with existing AI and logging rules.

### 3. Wire consumers
- [ ] 3.1 Pass assembly output into **fee** paths (idle + mid-collection).
- [ ] 3.2 Pass into **catalog matcher** when narrowing or booking.
- [ ] 3.3 Extend **buildAiContextForResponse** (or successor) so **idle / fee_quote / responded** turns still receive **last bot ask** + **missing** cues when product requires — without duplicating PHI in prompts.

### 4. Medical deflection handoff
- [ ] 4.1 After `medical_query` template reply, update state with **routing-safe** summary for next turns (coordinate with compliance — no diagnostic content in state if policy forbids).

### 5. Verification
- [ ] 5.1 Regression tests: multi-turn “symptom mention → short follow-up” still routes correctly.
- [ ] 5.2 Logs: no PHI leaks; correlation IDs only on metadata events.
- [ ] 5.3 Update **RECIPES** / troubleshooting doc for “context-first” DM behavior.

---

## 📁 Files to Create/Update

**Likely affected (audit first):**
- `backend/src/workers/instagram-dm-webhook-handler.ts`
- `backend/src/services/ai-service.ts` — context construction alignment
- `backend/src/types/conversation.ts` — state shape (if new fields)
- `backend/src/services/conversation-service.ts` — persist / migrate if DB columns added
- Fee + matcher modules per e-task-dm-02

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Context-first** does not mean **longer** prompts everywhere — respect token caps and cost.
- Any **persistent** text on conversation rows must satisfy **privacy** and **clinical safety** policy (scheduling assistant only; no unsupervised diagnosis in stored fields).
- Slot / payment **URLs** remain server-generated; LLM must not be sole source of links.

---

## 🌍 Global Safety Gate

- [ ] **Data touched?** Y if new conversation columns — RLS + migration review
- [ ] **PHI in logs?** MUST be No
- [ ] **External AI?** Y — existing consent/redaction paths apply

---

## ✅ Acceptance & Verification Criteria

- [ ] Deterministic paths that should “remember” the thread demonstrably use the **same** context package as classification/matcher inputs in acceptance scenarios.
- [ ] Documented **clear** behavior when user clears topic or starts a new request.
- [ ] Definition of done per [DEFINITION_OF_DONE.md](../../../../../Reference/DEFINITION_OF_DONE.md) if referenced in repo.

---

## 🔗 Related Tasks

- [e-task-dm-02-thread-aware-fee-catalog.md](./e-task-dm-02-thread-aware-fee-catalog.md)
- [e-task-dm-01-shipped-safety-confirm-consent.md](./e-task-dm-01-shipped-safety-confirm-consent.md)

---

**Last Updated:** 2026-04-04  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)
