# Task lang-01: `conversation-language.ts` resolver + confidence tiers

> **Links:** batch [`../plan-p1-language-resolver-batch.md`](../plan-p1-language-resolver-batch.md) · exec [`./EXECUTION-ORDER-p1-language-resolver.md`](./EXECUTION-ORDER-p1-language-resolver.md)

---

## 📋 Task Overview

Create the **single** language decision function for the receptionist. Pure, synchronous, no I/O. It takes the conversation's stored language plus the new patient message and returns the language for this turn.

This is the file that replaces two competing regex detectors and one LLM judgment call.

**Program / Phase:** bot-language-policy · p1 · Wave 1
**Estimated Time:** ~3–4 hours
**Status:** ✅ DONE (2026-08-02)
**Change Type:** New util (no DB, no network)
**Model:** Sonnet
**Depends on:** nothing

---

## ✅ Task Breakdown

### 1. Types
- [x] 1.1 `export type ConversationLanguage = 'en' | 'hi' | 'hi-Latn' | 'pa' | 'pa-Latn' | 'other'`.
  - `'other'` covers LANG-D7 scripts (bn/ta/te/ml/kn/or/ur) — detected, stored, but rendered as English by deterministic copy.
- [x] 1.2 `export type LanguageSignal = { language: ConversationLanguage; confidence: 'strong' | 'weak' | 'none' }`.
- [x] 1.3 `export type LanguageResolution = { language: ConversationLanguage; changed: boolean; reason: 'stored' | 'default' | 'script' | 'markers' }`.
  - `reason` exists for log lines and test assertions. It is not patient data.

### 2. Signal detection
- [x] 2.1 `detectLanguageSignal(text: string): LanguageSignal`.
- [x] 2.2 **Script tier (`strong`)** — any Devanagari `\u0900-\u097F` → `hi`; Gurmukhi `\u0A00-\u0A7F` → `pa`. Port the remaining script ranges from `localize-reply.ts:28-36` and map them all to `'other'`.
- [x] 2.3 **Roman marker tier** — merge the two existing marker lists:
  - Punjabi markers from `safety-messages.ts:59-64` (`menu`, `naal`, `vich`, `chhati`, `behosh`, …) → `pa-Latn`.
  - Hindi markers from `safety-messages.ts:66-75` **union** the narrower list in `localize-reply.ts:38-39` → `hi-Latn`.
  - Punjabi is checked **before** Hindi (preserves existing precedence).
  - Note: English loanwords from localize-reply's AND-heuristic (`appointment`, `doctor`, `book`) omitted so English booking messages do not flip under ≥2-marker rule.
- [x] 2.4 **Confidence from distinct marker count:** ≥2 distinct markers → `strong`; exactly 1 → `weak`; 0 → `none` with language `en`.
  - "Distinct" means two *different* markers, not the same word twice. `kitna kitna` is one marker.
- [x] 2.5 Preserve the documented false-positive guards from `safety-messages.ts:45-47` — English `doc` is not Hindi, `sans` is not `saans`. Add a regression test for each.

### 3. Resolution (the sticky rule)
- [x] 3.1 `resolveTurnLanguage(stored: ConversationLanguage | null, text: string): LanguageResolution`.
- [x] 3.2 Rules, in order:
  1. `signal = detectLanguageSignal(text)`
  2. If `stored == null` → `signal.confidence === 'strong' ? signal.language : 'en'`; `changed = true`; `reason = 'script' | 'markers' | 'default'`.
  3. If `signal.confidence === 'strong'` and `signal.language !== stored` → switch. `changed = true`.
  4. Otherwise → keep `stored`. `changed = false`, `reason = 'stored'`.
- [x] 3.3 **No automatic snap-back (LANG-D2).** There is no "strong English" signal, so a non-English conversation never returns to English on its own. Write this as a comment stating the constraint — it is a deliberate product rule, not an oversight.
- [x] 3.4 Empty / whitespace-only / non-text messages → always `reason: 'stored'`, never a switch. (`stored=null` + empty → `en` / `default`.)

### 4. Tests
- [x] 4.1 `hey hallo`, `stored = null` → `en`. **This is the reported bug; assert it explicitly.**
- [x] 4.2 `kitna is the fee?`, `stored = 'en'` → stays `en` (one marker = weak).
- [x] 4.3 `mujhe kal appointment chahiye`, `stored = 'en'` → `hi-Latn` (≥2 markers).
- [x] 4.4 Devanagari message, `stored = 'en'` → `hi` on a single message.
- [x] 4.5 `stored = 'hi-Latn'` + a plain English message → stays `hi-Latn` (LANG-D2).
- [x] 4.6 Gurmukhi → `pa`; Roman Punjabi (`menu tin din to`) → `pa-Latn` and not `hi-Latn`.
- [x] 4.7 Tamil/Bengali script → `'other'`, `changed = true`.
- [x] 4.8 False positives: `is the doc available` → `en`; `what font, sans or serif` → `en`.
- [x] 4.9 Same marker repeated → still `weak`, no switch.
- [x] 4.10 Table-drive 4.1–4.9 so adding a marker later is a one-line test change.

---

## 📁 Files

```
CREATE: backend/src/utils/conversation-language.ts
CREATE: backend/tests/unit/utils/conversation-language.test.ts
DO NOT TOUCH: backend/src/utils/safety-messages.ts (p2 · lang-06)
DO NOT TOUCH: backend/src/utils/localize-reply.ts (p2 · lang-07)
DO NOT TOUCH: any caller — this task adds a module, it does not wire it
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **Additive only.** No existing file changes in this task. Nothing imports the new module yet.
- No DB access, no OpenAI call, no `async`. If you reach for either, stop — that belongs in `lang-03`.
- Never read `process.env` — use `config/env.ts` (not expected to be needed here).
- Do not delete the old detectors yet. p2 removes them once callers move.

---

## ✅ Acceptance Criteria

- [x] `resolveTurnLanguage` is the only exported decision function; `detectLanguageSignal` is exported for tests.
- [x] Every rule in LANG-D1/D2/D3/D7 has at least one test.
- [x] Marker lists are a superset of both existing detectors — no marker is silently dropped in the merge. (English loanwords `appointment`/`doctor`/`book` from localize-reply's AND-heuristic omitted by design — see §2.3 note.)
- [x] Pure and synchronous. No imports from `services/`.
- [x] Typecheck + lint + tests green. (24 tests pass; `tsc --noEmit` clean; eslint on src file clean.)

---

**Created:** 2026-08-02.
**Closed:** 2026-08-02.
