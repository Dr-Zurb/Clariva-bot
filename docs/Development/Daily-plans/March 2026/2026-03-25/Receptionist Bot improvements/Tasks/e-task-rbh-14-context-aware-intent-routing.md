# Task RBH-14: Context-aware intent — stop single-turn keyword routing

## 2026-03-28 — Receptionist bot product quality

---

## 📋 Task Overview

**Problem:** `classifyIntent` in `ai-service.ts` sends **only the latest user message** to the model (no dialogue history). Short replies like **“general consultation please”** after a **fee** question get classified as **`book_appointment`** because of isolated keywords. The worker then executes **booking** branches before “full context” `generateResponse` can correct course.

**Goal:** Routing respects **prior turns**: fee vs book vs status; reduce **keyword → wrong flow** errors.

**Estimated Time:** 2–4 days  
**Status:** ✅ **DONE** (2026-03-28)  
**Completed:** Multi-turn classify payload, fee-thread post-policy, handler reorder, unit tests, docs.

**Change Type:**
- [x] **Update existing** — `classifyIntent` signature or wrapper; worker policy layer; optional state fields

**Current State:**
- ✅ **What exists:** `recentMessages` loaded for `generateResponse`; `lastPromptKind` / `activeFlow` (RBH-07/13); **`classifyIntent`** optional **`classifyContext`** (redacted prior turns + `fee_quote` goal); **`applyIntentPostClassificationPolicy`** after classify.
- ✅ **Intent cache:** Skipped when context is present (same surface string can differ by thread).

**Scope Guard:**
- Do not send raw PHI in prompts beyond existing redaction rules; audit stays metadata-only.

**Reference:**
- Code: `backend/src/services/ai-service.ts` (`classifyIntent`, `buildClassifyIntentContext`, `applyIntentPostClassificationPolicy`), `instagram-dm-webhook-handler.ts`
- **RBH-13** — fee flow consumer

---

## ✅ Task Breakdown (Hierarchical)

### 1. Design
- [x] 1.1 Document **state machine** overlay: “active goal” vs `step` (booking) — or extend `lastPromptKind` with `fee_inquiry`, `pricing_options`, etc.
- [x] 1.2 Define **override rules**: e.g. if `lastPromptKind === fee_*` and user message matches short consultation labels OR pricing AND model says book → downgrade to `ask_question`.

### 2. Implementation options (pick one or combine)
- [x] 2.1 **Option A:** Pass **last N redacted turns** (user+assistant) into `classifyIntent` user message or structured prefix.
- [x] 2.2 **Post-classify policy step**: if model says `book_appointment` but state says fee-thread → downgrade when message is fee/consultation follow-up (not explicit book / not intake blob).
- [ ] 2.3 **Option C:** Small second LLM “router” only when confidence low (cost/latency trade-off — coordinate with **RBH-12**). *Deferred.*

### 3. Prompt / tests
- [x] 3.1 Update `SYSTEM_PROMPT` examples for multi-turn fee → “general” → still not booking.
- [x] 3.2 Unit tests: golden transcripts (redacted fixtures) for routing outcomes.

### 4. Verification
- [ ] 4.1 Manual checklist rows §2–§3 expanded with multi-turn scripts.
- [ ] 4.2 No regression on collection / consent / slot flows. *(Manual)*

---

## 📁 Files to Create/Update (expected)

```
backend/src/services/ai-service.ts
backend/src/types/conversation.ts (consumer only — no schema change required)
backend/src/utils/consultation-fees.ts (isConsultationTypePricingFollowUp)
backend/src/workers/instagram-dm-webhook-handler.ts
backend/tests/unit/services/ai-service.test.ts
backend/tests/unit/services/intent-routing-policy.test.ts
docs/Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md
```

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** Y (state / prompts)
- [x] **Any PHI in logs?** N
- [x] **External API?** Y — OpenAI

---

## 🔗 Related Tasks

- **RBH-13** — structured fees (consumer of routing).
- **RBH-12** — latency; more classify tokens when transcript attached (bounded).
- **RBH-07** — `lastPromptKind`.

---

**Last Updated:** 2026-03-28  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../TASK_MANAGEMENT_GUIDE.md)
