# Task RBH-15: Multilingual safety — medical deflection & emergency in user language

## 2026-03-28 — Receptionist bot product quality

---

## 📋 Task Overview

**Problem:** `medical_query` and `emergency` paths use **fixed English** strings (`MEDICAL_QUERY_RESPONSE`, `EMERGENCY_RESPONSE` in `ai-service.ts`). Users writing **Punjabi / other languages** get English deflection; **trust and comprehension** suffer. **Emergency regex** (`isEmergency`) is English-centric — Punjabi chest pain / syncope may classify as **`medical_query`** and receive the wrong template (scheduling assistant line).

**Goal:** Safe, **non-diagnostic** responses in the **user’s language** (at minimum: **English, Hindi, Punjabi-Gurmukhi/Latin transliteration** per launch scope); **improve emergency detection** for common Indic phrases without blasting false positives.

**Estimated Time:** 2–4 days  
**Status:** ✅ **DONE** (2026-03-28)  
**Completed:** `safety-messages.ts`, worker + classify wiring, tests, docs/checklist.

**Change Type:**
- [x] **Update existing** — `ai-service.ts`, `instagram-dm-webhook-handler.ts`; rule map (no LLM for MVP)

**Current State:**
- ✅ **`resolveSafetyMessage(kind, userText)`** — en / hi / pa via script + Latin cues; Roman Hindi/Punjabi variants when no native script.
- ✅ **`isEmergencyUserMessage`** — EN + Devanagari + Gurmukhi + transliteration; **`emergency appointment` / `urgent appointment`** excluded.
- ✅ **Worker:** Emergency branch **before** `medical_query`; combines pattern + `intent === emergency`.

**Scope Guard:**
- **No** clinical diagnosis or treatment advice; emergency message = **go to ER / call local emergency number** + **112/108** for India context.

**Reference:**
- Code: `backend/src/utils/safety-messages.ts`, `ai-service.ts` (`isEmergencyUserMessage` in classify path), `instagram-dm-webhook-handler.ts`
- [COMPLIANCE.md](../../../../../../Reference/COMPLIANCE.md) — PHI, no medical advice

---

## ✅ Task Breakdown (Hierarchical)

### 1. Scope languages
- [x] 1.1 Confirm **MVP list** (e.g. en, hi, pa) and scripts (Latin vs Gurmukhi).
- [x] 1.2 Choose strategy: **static string table** (aligned **RBH-12** — no extra LLM).

### 2. Emergency detection
- [x] 2.1 Expand **`isEmergencyUserMessage`** with curated **non-English** keywords/phrases (chest pain, breathless, fainted, unconscious — per language).
- [ ] 2.2 Consider **second-stage** tiny classifier for edge cases (optional; deferred).
- [x] 2.3 **Emergency wins** over `medical_query` when patterns match (worker order + classify fast-path).

### 3. Medical_query template
- [x] 3.1 Localized **deflection** (“scheduling assistant / not medical advice / see doctor”) — no free-form first-aid.
- [x] 3.2 Wire **`resolveSafetyMessage`** from worker instead of raw constants for DM.

### 4. Verification
- [ ] 4.1 Manual tests: Punjabi headache → deflection in **Punjabi**; Punjabi chest pain → **emergency** in **Punjabi**; English unchanged.
- [x] 4.2 Unit tests: phrase fixtures for `isEmergencyUserMessage` / resolver (`safety-messages.test.ts`).

---

## 📁 Files to Create/Update (expected)

```
backend/src/utils/safety-messages.ts (new)
backend/src/services/ai-service.ts
backend/src/workers/instagram-dm-webhook-handler.ts
backend/tests/unit/utils/safety-messages.test.ts
docs/Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md
docs/Development/.../MANUAL_TEST_CHECKLIST_INSTAGRAM_BOT.md — §1 language + emergency rows
```

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** N / minimal
- [x] **Any PHI in logs?** N
- [x] **External API?** N (this task)

---

## 🔗 Related Tasks

- **RBH-14** — context (fainting after emergency thread).
- **RBH-12** — latency (no new hop).

---

**Last Updated:** 2026-03-28  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../TASK_MANAGEMENT_GUIDE.md)
