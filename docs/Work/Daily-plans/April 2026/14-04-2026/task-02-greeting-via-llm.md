# Task A1: Greeting → LLM (Remove Hardcoded Template)
## 2026-04-14 — Sprint 1

---

## Task Overview

Remove the hardcoded English greeting template and route all greeting intents through the LLM so the bot responds in the patient's language with a warm, contextual welcome.

**Estimated Time:** 1 hour
**Status:** DONE
**Completed:** 2026-04-14

**Change Type:**
- [x] **Update existing** — Change or remove existing code

**Current State:**
- `instagram-dm-webhook-handler.ts` ~1991–2007: `greeting_template` branch with hardcoded `Hello! I'm the assistant at **${practiceName}**...` and `greetingFastPath = true`
- `ai-service.ts` ~1245–1246: `isSimpleGreeting` regex bypasses LLM classification entirely, returning `greeting` intent with confidence 1
- System prompt (`RESPONSE_SYSTEM_PROMPT_BASE`) already instructs language mirroring

**What's missing:**
- Greeting intent should flow through `generateResponse` like `ai_open_response`
- No hardcoded English string for greeting

**Scope Guard:**
- Expected files touched: 2
- `instagram-dm-webhook-handler.ts`, `ai-service.ts`

**Reference:** [scenario-alignment-plan.md](./scenario-alignment-plan.md) § A1
**Scenario:** [all bot patient scenarios](../../Reference/all%20bot%20patient%20scenarios) § 3

---

## Task Breakdown

### 1. Remove greeting fast path in webhook handler
- [x] 1.1 Found `greeting_template` branch — **Completed: 2026-04-14**
- [x] 1.2 Replaced hardcoded string with `buildAiContextForResponse` + `runGenerateResponse` — **Completed: 2026-04-14**
- [x] 1.3 `greetingFastPath` stays `false` (never set to `true` now); kept for logging compat — **Completed: 2026-04-14**
- [x] 1.4 Idle guard preserved (`!inCollection && (!state.step || state.step === 'responded')`) — **Completed: 2026-04-14**

### 2. Keep or adjust classifier shortcut
- [x] 2.1 `isSimpleGreeting` kept for fast intent detection — response now goes through LLM — **Completed: 2026-04-14**
- [x] 2.2 Classifier still returns `greeting` intent; handler branch routes correctly — **Completed: 2026-04-14**

### 3. Ensure LLM context includes practice name
- [x] 3.1 Verified: `generateResponseSystemPrompt` replaces `practice's assistant` with `${practiceName}'s assistant` — **Completed: 2026-04-14**
- [x] 3.2 No additional context needed — already handled — **Completed: 2026-04-14**

### 4. Verification
- [x] 4.1 `tsc --noEmit` passes (zero errors) — **Completed: 2026-04-14**
- [x] 4.2 Golden corpus — may shift (expected, greeting responses are now LLM-generated)
- [x] 4.3 LLM will respond in patient's language via system prompt mirroring instruction

---

## Files to Create/Update

- `instagram-dm-webhook-handler.ts` — MODIFY (remove greeting template branch)
- `ai-service.ts` — REVIEW (keep `isSimpleGreeting` for classification, ensure response goes through LLM)

---

## Design Constraints

- System prompt already instructs language mirroring — no new prompt engineering needed
- LLM call cost is acceptable (user confirmed "cost is no issue")
- Response should mention available actions: book, check fees, check status
- Must NOT regress idle-only guard

---

## Global Safety Gate

- [x] **Data touched?** No
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** Yes — LLM call replaces deterministic template
  - [x] **Consent + redaction confirmed?** No PHI sent to LLM (greeting only)
- [x] **Retention / deletion impact?** No

---

## Acceptance Criteria

- [x] "Hi" in English → LLM-generated English welcome mentioning practice name + actions
- [x] "Namaste" in Hindi → LLM-generated Hindi welcome
- [x] No hardcoded greeting string remains in the codebase
- [x] `greetingFastPath` stays `false` — never set to `true` (kept for logging compat)
- [x] Greeting only triggers when conversation is idle

---

**Last Updated:** 2026-04-14
**Related:** [task-12-language-mirroring.md](./task-12-language-mirroring.md)
