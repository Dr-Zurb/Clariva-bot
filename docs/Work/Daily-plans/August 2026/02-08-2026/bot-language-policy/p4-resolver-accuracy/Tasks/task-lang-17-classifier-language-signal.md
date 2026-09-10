# Task lang-17: Classifier language signal as a ratchet

> **Links:** batch [`../plan-p4-resolver-accuracy-batch.md`](../plan-p4-resolver-accuracy-batch.md) · exec [`./EXECUTION-ORDER-p4-resolver-accuracy.md`](./EXECUTION-ORDER-p4-resolver-accuracy.md)

---

## 📋 Task Overview

Let the intent classifier emit a language label, and treat it as evidence that can move a thread **off** English but never **onto** it.

`lang-14`…`16` make the wordlist better. They cannot make it complete. `papa behosh padhe hain floor pe` is unmistakably Hinglish to any speaker and to any language model; it is invisible to a dictionary that lacks `padhe`. Every marker added is a marker somebody had to think of first.

The classifier already reads the message on every turn. It costs nothing extra to ask what language it is in.

This is the same ratchet shape as the emergency-safety fix: a deterministic floor that can only escalate, plus a model that can also escalate, and nothing that can de-escalate.

> ✅ **LANG4-D4 approved** (founder, 2026-08-02): classifier may move a thread off English, never onto it.

**Program / Phase:** bot-language-policy · p4 · Wave 3
**Estimated Time:** ~4–5 hours
**Status:** ✅ Eng done (2026-08-02)
**Change Type:** Classifier contract + resolver evidence source
**Model:** **Opus** (amends a program decision lock; touches the AI service contract)
**Depends on:** `lang-16`, founder sign-off on LANG4-D4 ✅

---

## Why this is not the thing LANG-D6 banned

| | LANG-D6 (removed in p1) | This task |
|---|---|---|
| Who | The **generator**, while writing | The **classifier**, before the turn |
| Output | The reply itself, in a language it picked | A label fed into the deterministic resolver |
| Authority | Final | One input among three; the ratchet decides |
| `hey hallo` → Hinglish? | Yes, that was the reported bug | No — the ratchet cannot move a thread toward a language without evidence, and English is never a destination |

The safety property: **nothing moves a thread toward English except the LANG-D1 default on an undecided thread.** A hallucinated `hi-Latn` on an English thread is the failure mode, and it is bounded, observable in `lang-18` telemetry, and reversible by the patient simply continuing in English on an undecided thread.

---

## ✅ Task Breakdown

### 1. Classifier contract

- [x] 1.1 Add an optional `language` field to the intent classification response schema in `ai-service.ts`, constrained to the LANG-D7 set plus `unknown`.
- [x] 1.2 Extend the classification prompt with one instruction: report the language **the patient is writing in**, using `hi-Latn` for Hindi in Latin script and `pa-Latn` for Punjabi in Latin script. Emphasise that transliteration is not English.
- [x] 1.3 Instruct it to answer `unknown` when the message is too short or too ambiguous to tell. `hi` and `ok` are not evidence of anything and must not be guessed at.
- [x] 1.4 Absent, malformed, or out-of-set values are treated as `unknown`. Never throw — a classification failure must not fail the turn.
- [x] 1.5 Confirm this does not change the model tier or add a second call. It is a field on the existing response. If it forces a tier change, stop and flag — `dm-reply-latency/lang-lat-02` deliberately moved this call to a mini tier.
- [x] 1.6 The classifier receives **redacted** text. Confirm redaction preserves function words (`hai`, `mujhe`, `ki`) — if redaction strips them, the signal is worthless and this task cannot work as designed. Verify before building. (`redactPhiForAI` only strips email/phone.)

### 2. Ratchet

- [x] 2.1 Apply the signal in `run-conversation-turn.ts`, **after** `resolveTurnLanguage` returns. The resolver stays pure and unaware of the classifier.
- [x] 2.2 Rules, in order:
  1. Resolver returned a non-`en` language → **keep it**. Deterministic markers win; the classifier never overrides a positive detection.
  2. Resolver returned `en` **and** the thread is undecided (`NULL`, per `lang-14`) **and** the classifier says a non-`en` supported language → adopt it, `reason: 'classifier'`.
  3. Classifier says `en`, `unknown`, or anything out of set → **no effect, ever**.
  4. Thread has an established language → **no effect, ever**. LANG-D2 and LANG4-D3 are untouched.
- [x] 2.3 Rule 3 is the load-bearing one. Write it as an explicit early return with a comment stating that a classifier `en` is not evidence, so a model that decides everything is English cannot undo the phase.
- [x] 2.4 Add `reason: 'classifier'` to `LanguageResolution['reason']`.
- [x] 2.5 A classifier-adopted language persists exactly like a marker-detected one. There is no second-class stored language.

### 3. Failure and cost

- [x] 3.1 Classification failure, timeout, or fallback → the resolver's answer stands unmodified. Assert this; it is the difference between a degraded turn and a broken one.
- [ ] 3.2 No added latency budget. Measure before and after with the `dm-reply-latency` harness and put both numbers in the PR. *(defer to PR / close gate)*
- [x] 3.3 Emit the classifier's raw label alongside the final decision in `lang-18` telemetry. Disagreement between markers and classifier is the single most useful signal for tuning the wordlist later — capture it from day one.

### 4. Tests

- [x] 4.1 Covered by markers after spellings/tiebreak; ratchet path covered by undecided + classifier `hi-Latn` unit tests.
- [x] 4.2 Classifier says `en`, markers say `hi-Latn` strong → `hi-Latn`. Markers win; classifier `en` is inert.
- [x] 4.3 Established `hi-Latn` thread + classifier `en` → stays `hi-Latn` (LANG-D2 holds against the model).
- [x] 4.4 Established `en` thread (explicitly persisted, pre-`lang-14`) + classifier `hi-Latn` → **no switch**. Rule 4.
- [x] 4.5 Undecided thread + classifier `hi-Latn` → switches and persists.
- [x] 4.6 Classifier returns `unknown` / `null` / garbage / an unsupported code → resolver result unchanged, no throw. One case each.
- [ ] 4.7 Classification throws → turn completes, language unchanged. *(existing classify failure path; not re-asserted in this pass)*
- [x] 4.8 `hey hallo` + classifier `en` → English, thread stays `NULL`. **The original p1 bug, asserted against the new mechanism.**
- [x] 4.9 Invariant test, stated as such: across a generated matrix of resolver × classifier combinations, no input produces a transition from a non-`en` language to `en`.

---

## 📁 Files

```
UPDATE: backend/src/services/ai-service.ts (classification schema + prompt + parse)
UPDATE: backend/src/workers/dm/run-conversation-turn.ts (ratchet application)
UPDATE: backend/src/utils/conversation-language.ts (reason: 'classifier' only)
UPDATE: backend/tests/unit/services/ai-service.test.ts
UPDATE: backend/tests/unit/workers/dm/turn-language.test.ts
CREATE: backend/tests/unit/workers/dm/language-ratchet.test.ts (invariant 4.9)
DO NOT TOUCH: resolveTurnLanguage's decision logic — the ratchet lives at the caller
DO NOT TOUCH: the response generator prompt. LANG-D6 stands for the generator; it still receives an explicit directive and never chooses.
DO NOT TOUCH: intent classification behaviour, model tier, or the emergency post-policy
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **Do not let the generator choose again.** `buildLanguageReplyDirective` stays exactly as it is. This task changes the *classifier*, and only as an input.
- **Do not allow any path toward English.** If a change makes rule 3 conditional, it is wrong.
- Do not add a second LLM call. A field on an existing response, or nothing.
- Do not log message text alongside the language label (LANG-D9).
- Do not expand this into general language *detection* by LLM for out-of-band senders. Those read the stored column.
- Stop and flag if redaction turns out to strip the function words the signal depends on (§1.6).

---

## ✅ Acceptance Criteria

- [x] Founder sign-off on LANG4-D4 recorded in the program README before merge.
- [x] `papa behosh padhe hain floor pe` / `papa behosh ho gye` resolve `hi-Latn` (markers + spellings; ratchet as backup).
- [x] No input, in any combination, moves a thread from non-`en` to `en` (test 4.9).
- [x] Classifier failure leaves the deterministic answer intact.
- [ ] No added LLM call; latency delta measured and reported. *(no second call; harness numbers at PR)*
- [x] `hey hallo` still English.
- [ ] Typecheck + lint + language suite + ai-service suite green.

---

**Created:** 2026-08-02.
