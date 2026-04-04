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
**Status:** ✅ **IMPLEMENTED** (core slice: turn helper, deflection memory, classify + idle generate context)

**Change Type:**
- [x] **Update existing** — webhook orchestration, context builders, optional `ConversationState` fields

**Current State:**
- ✅ `generateResponse` builds chat **history** from `recentMessages` (capped).
- ✅ `buildClassifyIntentContext` supplies **prior turns** + fee-thread hint + **`post_medical_deflection`** when `lastMedicalDeflectionAt` is in TTL.
- ✅ `buildAiContextForResponse` supplies **`lastBotMessage`** + **`idleDialogueHint`** on idle / responded turns (fee + post-deflection); full collection summary unchanged when in intake.
- ✅ `medical_query` (idle) sets **`lastMedicalDeflectionAt`**; cleared when starting fresh collection.
- ✅ Shared **`buildFeeCatalogMatchText`** in `dm-turn-context.ts` for fee/matcher inputs (`buildDmTurnContext` for consumers that want the full turn package).

**Dependencies:** Strongly coupled with **e-task-dm-02** (fee + matcher inputs).

**Reference:**
- [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)
- [AI_RECEPTIONIST_PLAN.md](../../../../../task-management/AI_RECEPTIONIST_PLAN.md)

---

## ✅ Task Breakdown

### 1. Design (what, not how — details in RECIPES/ARCHITECTURE after approval)
- [x] 1.1 List **all** webhook branches that currently use **only** `text` where thread or state should matter. *(Initial slice: fee paths + classify/generate; inventory in RECIPES.)*
- [x] 1.2 Decide **minimal** state fields — **`lastMedicalDeflectionAt`** + 48h TTL; cleared on collection start.

### 2. Turn assembly
- [x] 2.1 **`backend/src/utils/dm-turn-context.ts`** — `buildFeeCatalogMatchText`, `buildDmTurnContext`.
- [x] 2.2 **Redaction** via `redactPhiForAI` (same as prior inline helper).

### 3. Wire consumers
- [x] 3.1 Fee idle + mid-collection + misclassified book use **`buildFeeCatalogMatchText`**.
- [x] 3.2 Matcher inputs use the same redacted thread string as 3.1.
- [x] 3.3 **`buildAiContextForResponse`** — idle turns get **`lastBotMessage`** + **`idleDialogueHint`**; intake turns unchanged.

### 4. Medical deflection handoff
- [x] 4.1 **`lastMedicalDeflectionAt`** set on idle `medical_query`; classify + generate hints; **no diagnostic text** in metadata.

### 5. Verification
- [x] 5.1 Unit tests: `buildClassifyIntentContext`, `dm-turn-context`, `isRecentMedicalDeflectionWindow`, `generateResponse` idle hint.
- [x] 5.2 No logging changes; state field is timestamp-only.
- [x] 5.3 **RECIPES.md** — Instagram DM context-first paragraph.

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

- [x] Fee deterministic paths use **`buildFeeCatalogMatchText`** (aligned with redacted thread pattern used for classification).
- [x] **Clear** deflection memory: TTL + explicit clear when intake starts (`lastMedicalDeflectionAt: undefined`).
- [ ] Broader branch audit (non-fee paths still on `text` only) — follow-up if product expands “gist” beyond deflection timestamp.

---

## 🔗 Related Tasks

- [e-task-dm-02-thread-aware-fee-catalog.md](./e-task-dm-02-thread-aware-fee-catalog.md)
- [e-task-dm-01-shipped-safety-confirm-consent.md](./e-task-dm-01-shipped-safety-confirm-consent.md)

---

**Last Updated:** 2026-04-04  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)
