# Task lang-15: Punjabi/Hindi marker contention

> **Links:** batch [`../plan-p4-resolver-accuracy-batch.md`](../plan-p4-resolver-accuracy-batch.md) · exec [`./EXECUTION-ORDER-p4-resolver-accuracy.md`](./EXECUTION-ORDER-p4-resolver-accuracy.md)

---

## 📋 Task Overview

Count both Latin languages in full and let the higher count win, instead of returning on the first Punjabi hit.

Today a single shared token ends detection:

```229:238:backend/src/utils/conversation-language.ts
  const paCount = paWords.size + paPhrases.size;
  if (paCount > 0) {
    return { language: 'pa-Latn', confidence: confidenceFromCount(paCount) };
  }

  const hiWords = collectWordMarkers(lower, HI_LATN_WORDS);
```

`behosh`, `meri`, and `mera` are in `PA_LATN_WORDS` and are also ordinary Hindi. So `papa behosh ho gaye hain, mujhe bahut dard hai` scores 1 Punjabi — weak, no switch — when the Hindi count is 4. A shared token both suppresses a strong signal and mislabels the language.

`lang-01` ported this precedence faithfully from `safety-messages.ts`. It was a tiebreak there. Here it short-circuits an alternative that was never computed.

**Program / Phase:** bot-language-policy · p4 · Wave 1
**Estimated Time:** ~3 hours
**Status:** ✅ DONE (2026-08-02)
**Change Type:** Detection logic + marker list restructure
**Model:** Sonnet
**Depends on:** nothing (conflicts with `lang-14` in the test file if run in parallel)

---

## ✅ Task Breakdown

### 1. Split the Punjabi markers

- [ ] 1.1 Split `PA_LATN_WORDS` into two exported-for-test constants:
  - `PA_LATN_EXCLUSIVE_WORDS` — Punjabi and not idiomatic Hindi: `naal`, `vich`, `menu`, `punjabi`, `chhati`, `chhaati`.
  - `PA_LATN_SHARED_WORDS` — used in both: `meri`, `mera`, `behosh`, `behoshi`.
- [ ] 1.2 Have a Punjabi speaker confirm the split before merge. If nobody is available, put a token in **shared** — shared is the safe default because it lets counting decide, whereas a wrong "exclusive" silently hands the thread to Punjabi.
- [ ] 1.3 `meri` / `mera` are already in **both** `PA_LATN_WORDS` and `HI_LATN_WORDS` today. After the split they live in `PA_LATN_SHARED_WORDS` and stay in `HI_LATN_WORDS`. Add a comment: a shared marker counts once for each language, which is the point.
- [ ] 1.4 Leave `PA_LATN_PHRASES` intact — multi-token phrases (`menu tin`, `meri chhati`) are already disambiguating and count as exclusive.

### 2. Rewrite the contention

- [ ] 2.1 Always compute both counts before deciding. No early return between them.
- [ ] 2.2 Decision, in order:
  1. `paExclusive > 0` → Punjabi, confidence from **total** pa count (exclusive + shared + phrases).
  2. Otherwise higher total count wins.
  3. Exact tie → Punjabi (preserves LANG4-D2's tiebreak and the original precedence).
  4. Both zero → `en` / `none`.
- [ ] 2.3 Confidence is computed from the **winner's** total, not the delta. `behosh ... hain` is Hindi-2 vs Punjabi-1 → `hi-Latn` `strong`.
- [ ] 2.4 Keep script tier ahead of all of this, untouched. Gurmukhi → `pa`, Devanagari → `hi`, always strong.
- [ ] 2.5 Keep `confidenceFromCount` as-is. LANG-D3's ≥2 threshold is not being changed here (LANG4-D5).

### 3. Marker list gaps

- [ ] 3.1 Add the high-frequency Hinglish tokens absent today, drawn from the reproduction and the `lang-18` corpus: `padhe`, `padha`, `gaye`, `gaya`, `raha`, `rahe`, `rahi`, `gir`, `gira`, `bachao`, `jaldi`, `madad`, `behoshi`, `uth`, `bula`.
- [ ] 3.2 Each addition needs a false-positive check against English. `gir`, `raha`, and `uth` are the risky ones — `\b` bounded, they should be safe, but assert it. `bula` must not match "bulate"/"bulb"; confirm the boundary behaviour.
- [ ] 3.3 **Do not** add English loanwords (`appointment`, `doctor`, `book`, `fee`). The `lang-01` §2.3 note explains why and it still holds.
- [ ] 3.4 Cap the additions at this list. Wholesale expansion is what `lang-17` exists to make unnecessary — resist growing the dictionary as a substitute.

### 4. Tests

- [ ] 4.1 `papa behosh padhe hain floor pe`, `stored = null` → `hi-Latn` `strong`. **The live reproduction; assert it explicitly.**
- [ ] 4.2 `papa behosh ho gaye hain, mujhe bahut dard hai` → `hi-Latn`, not `pa-Latn`.
- [ ] 4.3 `menu tin din to dard hai` → `pa-Latn`. Exclusive marker still wins despite Hindi tokens present.
- [ ] 4.4 `meri chhati vich dard` → `pa-Latn` (exclusive `vich` + phrase).
- [ ] 4.5 A bare shared marker only, e.g. `meri tabiyat` → counting decides; assert the resulting language and confidence rather than assuming.
- [ ] 4.6 Exact tie → Punjabi. Construct the case deliberately and comment which tokens produce the tie.
- [ ] 4.7 Every marker added in §3.1 gets a row in the table-driven test.
- [ ] 4.8 False-positive regressions from `lang-01` still pass: `is the doc available` → `en`; `what font, sans or serif` → `en`.
- [ ] 4.9 Gurmukhi → `pa` and Devanagari → `hi` unaffected by the restructure.
- [ ] 4.10 Assert the two lists are disjoint — a token in both `PA_LATN_EXCLUSIVE_WORDS` and `HI_LATN_WORDS` is a contradiction and should fail the build.

---

## 📁 Files

```
UPDATE: backend/src/utils/conversation-language.ts (marker lists + detectLanguageSignal contention)
UPDATE: backend/tests/unit/utils/conversation-language.test.ts
DO NOT TOUCH: resolveTurnLanguage stickiness rules (lang-14 / lang-16)
DO NOT TOUCH: confidenceFromCount thresholds (LANG4-D5)
DO NOT TOUCH: script-tier ranges
DO NOT TOUCH: backend/src/utils/safety-messages.ts — its locale detection was deleted in p2; this is now the only detector
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- Do not change the ≥2-marker threshold. Widening detection and loosening the threshold in one diff makes a regression impossible to attribute.
- Do not add languages beyond the LANG-D7 set.
- Do not turn the marker lists into a general Hindi dictionary. §3.1 is the whole budget for this task.
- Do not reorder or rename anything in `resolveTurnLanguage` — this task ends at `detectLanguageSignal`.

---

## ✅ Acceptance Criteria

- [ ] `papa behosh padhe hain floor pe` → `hi-Latn` `strong`.
- [ ] No message can be classified Punjabi on a shared marker alone when Hindi scores higher.
- [ ] Genuine Punjabi (`menu tin din to`, `meri chhati vich dard`) still resolves `pa-Latn`.
- [ ] Exclusive and Hindi lists proven disjoint by a test.
- [ ] All `lang-01` false-positive guards still pass.
- [ ] Typecheck + lint + language suite green.

---

**Created:** 2026-08-02.
