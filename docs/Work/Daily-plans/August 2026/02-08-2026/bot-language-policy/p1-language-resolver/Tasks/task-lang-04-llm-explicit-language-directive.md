# Task lang-04: Replace the LLM mirror instruction with an explicit directive

> **Links:** batch [`../plan-p1-language-resolver-batch.md`](../plan-p1-language-resolver-batch.md) · exec [`./EXECUTION-ORDER-p1-language-resolver.md`](./EXECUTION-ORDER-p1-language-resolver.md)

---

## 📋 Task Overview

Stop asking the model to choose a language. Feed it the already-resolved `turnLanguage` as a flat instruction.

This is the task that actually fixes the reported bug. The `hey hallo` → Hinglish reply came from the model, not from detection — both detectors return `en` for that string.

**Program / Phase:** bot-language-policy · p1 · Wave 4
**Estimated Time:** ~2–3 hours
**Status:** ✅ DONE (2026-08-02)
**Change Type:** Prompt change (patient-visible output)
**Model:** Sonnet
**Depends on:** `lang-03` (`turnLanguage` on context)

---

## ✅ Task Breakdown

### 1. Remove the judgment call
- [x] 1.1 In `backend/src/services/ai-service.ts`, delete the `LANGUAGE:` + `STABILITY:` block from `RESPONSE_SYSTEM_PROMPT_BASE`.
- [x] 1.2 In the `HOW YOU WORK` block, drop `No rigid keyword rules are needed for language choice: mirror the user's style.` Keep the rest of that paragraph — it is about facts, not language.
- [x] 1.3 Leave the intent-classifier prompts alone. They classify *regardless* of language and never pick a reply language.

### 2. Inject the directive
- [x] 2.1 In `buildResponseSystemPrompt`, append one line derived from `turnLanguage` via `buildLanguageReplyDirective` (in `conversation-language.ts`).
- [x] 2.2 Flat constraint after it: `Do not switch language mid-reply. Do not translate the practice name, doctor name, or ₹ amounts.`
- [x] 2.3 `turnLanguage` is **required** on `GenerateResponseInput` / `GenerateResponseWithActionsInput`.
- [x] 2.4 Injected once in `run-conversation-turn` wrappers (`Omit<…, 'turnLanguage'>` for stage callers) so every stage path gets it without scattering overrides.

### 3. Secondary LLM copy paths
- [x] 3.1 `DM_REPLY_BRIDGE_SYSTEM` — removed mirror-style instruction; bridge appends the same resolved directive.
- [x] 3.2 `POST_MED_ACK_LOCALIZE_SYSTEM` — uses resolved directive; no longer passes `USER_MESSAGE_REDACTED` as a language hint.
- [x] 3.3 Both remain behind their existing feature flags. Flag defaults unchanged.

### 4. Tests
- [x] 4.1–4.5 Covered in `ai-language-directive.test.ts` (+ post-med expectations in `ai-service.test.ts`).
- [x] 4.6 Updated `resolvePostMedicalPaymentExistenceAck` expectations (`redactionApplied: false`, directive in system prompt).

---

## 📁 Files

```
UPDATE: backend/src/utils/conversation-language.ts   (buildLanguageReplyDirective)
UPDATE: backend/src/services/ai-service.ts
UPDATE: backend/src/workers/dm/run-conversation-turn.ts
UPDATE: backend/src/workers/dm/stage-router.ts
UPDATE: backend/src/workers/dm/stages/idle-fee-triage.ts
UPDATE: backend/tests/unit/services/ai-service.test.ts
CREATE: backend/tests/unit/services/ai-language-directive.test.ts
DO NOT TOUCH: intent classifier prompts
DO NOT TOUCH: deterministic locale tables (p2)
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- Do not "improve" any other part of the system prompt while you are in there. Language lines only — the agent contract forbids opportunistic edits, and this prompt drives every patient reply.
- Do not change feature-flag defaults for the bridge or post-med ack.
- Do not touch the intent classifiers — language-agnostic classification is correct as-is.
- Never log prompt contents containing patient text.

---

## ✅ Acceptance Criteria

- [x] Grep of `ai-service.ts` finds no instruction asking the model to detect, mirror, or choose a language.
- [x] Every LLM reply path receives an explicit directive derived from `turnLanguage`.
- [x] `turnLanguage` is a required parameter on `GenerateResponseInput` — omitting it is a compile error.
- [ ] `hey hallo` on a fresh conversation produces an English reply (verified in `lang-05` live smoke).
- [x] Typecheck + lint + tests green.

---

**Created:** 2026-08-02.
**Closed:** 2026-08-02.
