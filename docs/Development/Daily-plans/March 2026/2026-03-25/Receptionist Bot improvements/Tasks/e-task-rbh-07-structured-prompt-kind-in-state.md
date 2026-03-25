# Task RBH-07: Structured `lastPromptKind` (reduce substring heuristics)

## 2026-03-28 — Receptionist bot hardening

---

## 📋 Task Overview

Replace fragile **substring checks** on last bot message text (`lastBotMessageAskedForDetails`, consent, confirm, match) with a **structured field** on conversation state (e.g. `lastPromptKind` or equivalent) set whenever the bot sends a categorized prompt. Improves reliability when marketing copy or AI phrasing changes. Aligns with **2026-03-25** bot intelligence goals (e-task-1…e-task-3).

**Estimated Time:** 10–14 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-03-28  

**Change Type:**
- [x] **Update existing** — State shape + behavior parity — follow [CODE_CHANGE_RULES.md](../../CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **`lastPromptKind`** on `ConversationState` + `conversationLastPromptKindForStep(step)` (derived on each DM persist).
- ✅ **Read path:** `effectiveAskedFor*` helpers prefer `lastPromptKind`, then legacy `lastBotMessageAskedFor*` substring checks (`instagram-dm-webhook-handler.ts`).
- ✅ **Docs/tests:** `RECEPTIONIST_BOT_CONVERSATION_RULES.md`, `RECEPTIONIST_BOT_ENGINEERING.md`, `conversation-last-prompt-kind.test.ts`.

**Scope Guard:**
- Expected files touched: ≤ 7 (worker, conversation types, persistence layer, tests).
- Coordinate copy changes with [RECEPTIONIST_BOT_CONVERSATION_RULES.md](../../../Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md).

**Reference Documentation:**
- [BOT_INTELLIGENCE_PLANNING.md](../../../Development/Future%20Planning/BOT_INTELLIGENCE_PLANNING.md)
- [2026-03-25 e-task-1…3](../../../Development/Daily-plans/March%202026/2026-03-25/README.md)
- [RECEPTIONIST_BOT_ENGINEERING.md](../../../Development/Daily-plans/March%202026/2026-03-25/Receptionist%20Bot%20improvements/RECEPTIONIST_BOT_ENGINEERING.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Design (product + tech)
- [x] 1.1 Enumerate prompt kinds needed: details, consent, confirm_details, match_pick, cancel_confirm, etc.
- [x] 1.2 Confirm JSON storage location (`conversation_state` vs column) per schema.

### 2. Implement write path
- [x] 2.1 Set `lastPromptKind` (and optional version) whenever system sends gating copy.
- [x] 2.2 Clear or update on transitions to `responded` / non-gating replies per rules doc.

### 3. Implement read path
- [x] 3.1 Prefer structured field for `inCollection` / consent / match routing; keep substring fallback behind feature flag or time-boxed compatibility layer.

### 4. Cleanup & verify
- [x] 4.1 Add tests for prompt kind transitions; run full DM characterization suite (RBH-02).
- [x] 4.2 Document in CONVERSATION_RULES or engineering doc.

---

## 📁 Files to Create/Update

```
backend/src/types/conversation.ts
backend/src/workers/instagram-dm-webhook-handler.ts
backend/tests/unit/types/conversation-last-prompt-kind.test.ts
docs/Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md
docs/.../RECEPTIONIST_BOT_ENGINEERING.md
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- State JSON size limits; avoid storing full message bodies in new fields.
- Backward compatibility for in-flight conversations until backfill or natural churn acceptable.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** Y — conversation state
- [x] **RLS verified?** Per existing conversation access model
- [x] **Any PHI in logs?** N
- [x] **External API?** Unchanged

---

## ✅ Acceptance & Verification Criteria

- [x] Changing bot wording without changing `lastPromptKind` assignments does not break routing.
- [x] Tests cover at least three prompt kinds end-to-end.

---

## 🔗 Related Tasks

- [RBH-05](./e-task-rbh-05-split-webhook-worker-modules.md)
- Daily plan [e-task-1](../../../Development/Daily-plans/March%202026/2026-03-25/e-task-1-ai-context-enhancement.md), [e-task-3](../../../Development/Daily-plans/March%202026/2026-03-25/e-task-3-route-ambiguous-to-ai.md)

---

**Last Updated:** 2026-03-28  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../TASK_MANAGEMENT_GUIDE.md)
