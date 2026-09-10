# Task lang-18: Labelled corpus + decision telemetry

> **Links:** batch [`../plan-p4-resolver-accuracy-batch.md`](../plan-p4-resolver-accuracy-batch.md) · exec [`./EXECUTION-ORDER-p4-resolver-accuracy.md`](./EXECUTION-ORDER-p4-resolver-accuracy.md)

---

## 📋 Task Overview

Two artefacts that make language accuracy measurable instead of anecdotal:

1. A labelled corpus of real-shaped patient messages with expected languages, run as a scored test.
2. `dm_language_decision_total` — a per-turn log of what decided the language and why.

Both defects in this phase were found by a human noticing a screenshot. That does not scale, and it did not catch the Punjabi short-circuit at all — that one has been live since `lang-01` and nobody saw it.

`backend/tests/fixtures/intent-classification-labels.json` is the precedent; follow its shape.

**Program / Phase:** bot-language-policy · p4 · Wave 4
**Estimated Time:** ~4 hours
**Status:** ✅ DONE (2026-08-02)
**Change Type:** Test fixture + observability
**Model:** Sonnet
**Depends on:** `lang-15` (corpus scores against the corrected counter). Start early — waves 2–3 are judged by this.

---

## ✅ Task Breakdown

### 1. Corpus

- [ ] 1.1 `backend/tests/fixtures/language-detection-labels.json`. Each row: `id`, `text`, `expected` (`ConversationLanguage`), `storedBefore` (`ConversationLanguage | null`), `slice`, `note`.
- [ ] 1.2 **Synthetic only.** Real patient DMs are PHI and must never enter a fixture. Write messages in the shapes patients use — do not paste from live threads, screenshots, or logs.
- [ ] 1.3 Slices, ~15–25 rows each:
  - `english` — plain English, including short openers (`hey hallo`, `hi`, `is doc available`).
  - `hinglish-obvious` — 3+ markers.
  - `hinglish-sparse` — 1–2 markers. **The failure class this phase exists for**; include `papa behosh padhe hain floor pe`.
  - `punjabi` — exclusive markers, phrases, Gurmukhi.
  - `contention` — shared markers with both languages present (`lang-15`).
  - `devanagari` / `gurmukhi` — script tier.
  - `other-script` — Bengali, Tamil, Urdu → `other`.
  - `false-positive` — English that historically tripped detection (`doc`, `sans`, `mein` inside an English word).
  - `emergency` — acute messages across every language. **Highest stakes; a miss here is a 112 message in a language the patient may not read.**
- [ ] 1.4 Every row labelled by a human who reads the language. Where nobody is available, mark `"reviewed": false` and exclude it from scoring rather than guessing.
- [ ] 1.5 Include `storedBefore` variants for the sticky cases — the same text resolves differently on a `NULL` thread versus an established one, and that is exactly what the reproduction showed.

### 2. Scored test

- [ ] 2.1 `backend/tests/unit/utils/language-detection-corpus.test.ts` runs every reviewed row through `resolveTurnLanguage`.
- [ ] 2.2 Assert a **per-slice** accuracy floor, not a single global number. A global 95% hides a slice at 40%.
- [ ] 2.3 `emergency` slice: **zero** misses where a non-English speaker would receive English. Hard failure, not a threshold.
- [ ] 2.4 `false-positive` slice: zero English messages classified non-English.
- [ ] 2.5 On failure, print the failing rows as a table — `id`, text, expected, actual, reason. A bare percentage is not actionable.
- [ ] 2.6 Overall floor 95%, per LANG4 acceptance. Set it as a named constant with a comment on why that number.

### 3. Telemetry

- [ ] 3.1 `logDmLanguageDecision` in `webhook-metrics.ts`, following the `logDmEmergencySafetyDecision` pattern.
- [ ] 3.2 Fields: `correlationId`, `storedBefore`, `resolved`, `changed`, `reason`, `hiMarkerCount`, `paMarkerCount`, `paExclusiveCount`, `accumulationWindowSize`, `classifierLanguage` (`lang-17`), `classifierAgreed`.
- [ ] 3.3 **Counts and codes only. Never the text, never the markers themselves** (LANG-D9). A marker list is a partial reconstruction of the message.
- [ ] 3.4 Emit on **every** turn, including no-change turns. A thread stuck on the wrong language is silent by definition — the no-change turns are the ones you need.
- [ ] 3.5 Call it in `run-conversation-turn.ts` next to the existing `conversation_language_resolved` log, and fold that log into this one rather than emitting both.
- [ ] 3.6 Unit-test the emitter like the other metrics helpers, including that no text field can be passed.

### 4. Documentation

- [ ] 4.1 Add `dm_language_decision_total` to `docs/Reference/engineering/operations/OBSERVABILITY.md` beside the other DM metrics.
- [ ] 4.2 Alert recipe: sustained `resolved: 'en'` with `hiMarkerCount >= 1` across many turns means the threshold or the wordlist is wrong in production.
- [ ] 4.3 Second recipe (`lang-17`): `classifierAgreed: false` rate climbing means the wordlist is drifting from reality — that is the signal to revisit markers.
- [ ] 4.4 Note in the bot-testing pack how to read these lines during a manual language smoke.

---

## 📁 Files

```
CREATE: backend/tests/fixtures/language-detection-labels.json
CREATE: backend/tests/unit/utils/language-detection-corpus.test.ts
UPDATE: backend/src/services/webhook-metrics.ts (logDmLanguageDecision)
UPDATE: backend/src/workers/dm/run-conversation-turn.ts (call site; fold in the old log)
UPDATE: backend/tests/unit/services/webhook-metrics.test.ts
UPDATE: docs/Reference/engineering/operations/OBSERVABILITY.md
DO NOT TOUCH: detection logic — this task measures, it does not fix
DO NOT TOUCH: backend/tests/fixtures/intent-classification-labels.json
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **No real patient text.** Synthetic messages only, in every slice, without exception.
- Do not change detection to make the corpus pass. Failing rows are the deliverable of this task; fixing them is `lang-15`'s. Record failures and hand them over.
- Do not log message text or marker identities (LANG-D9).
- Do not lower a threshold to get green. Raise a failure to the founder instead.

---

## ✅ Acceptance Criteria

- [ ] Corpus covers all nine slices, human-reviewed, entirely synthetic.
- [ ] Per-slice floors enforced; `emergency` and `false-positive` slices are zero-miss.
- [ ] Failure output names the failing rows.
- [ ] `dm_language_decision_total` on every turn, counts only.
- [ ] OBSERVABILITY.md documents the metric and two alert recipes.
- [ ] Typecheck + lint + tests green.

---

**Created:** 2026-08-02.
