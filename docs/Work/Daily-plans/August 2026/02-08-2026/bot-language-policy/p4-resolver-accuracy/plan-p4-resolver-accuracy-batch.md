# Plan p4 — Resolver accuracy (batch)

> **Status:** 🔵 Not started.
> **Program:** [`../README.md`](../README.md) · Prefix `lang` · Tasks `lang-14`…`lang-19`
> **One-line intent:** p1 made the language decision *single*. p4 makes it *correct* — a Hinglish patient is recognised as Hinglish on the message they actually sent.

---

## Why this phase

p1 removed the flip-flop by making one resolver own the decision and persisting it. The decision it makes is still wrong for a large class of real messages.

Live reproduction on the founder's Instagram thread, 2026-08-02:

| Turn | Patient | Reply | Correct? |
|------|---------|-------|----------|
| 1 | `papa behosh padhe hain floor pe` | English 112 escalation | ❌ |
| 2 | `kuch batao` | English reaffirm | ❌ |
| 3 | `khoon ki ulti ho rahi hai` *(fresh thread)* | Roman Hindi 112 escalation | ✅ |

Same patient, same language, opposite outcomes. Three independent defects produce this.

### 1. The default is persisted as if it were a decision

```264:274:backend/src/utils/conversation-language.ts
  if (stored == null) {
    if (signal.confidence === 'strong') {
      return { language: signal.language, changed: true, reason: ... };
    }
    return { language: 'en', changed: true, reason: 'default' };
  }
```

Note `changed: true` on the default path. The caller persists on `changed`:

```327:329:backend/src/workers/dm/run-conversation-turn.ts
  const languagePersist = languageResolution.changed
    ? { language: turnLanguage }
    : undefined;
```

So an opening message without two markers writes `language = 'en'` to the row, and from that moment the thread is "established English" and needs a strong signal to escape. `en` set by LANG-D1 fallback is indistinguishable from `en` observed with confidence — but migration 190 already reserves the vocabulary to tell them apart:

> `'Resolved reply language for this thread (lang-02). NULL = undecided → English.'`

The column can express "undecided". The resolver never uses it.

### 2. Punjabi short-circuits Hindi counting

```229:238:backend/src/utils/conversation-language.ts
  const paCount = paWords.size + paPhrases.size;
  if (paCount > 0) {
    return { language: 'pa-Latn', confidence: confidenceFromCount(paCount) };
  }

  const hiWords = collectWordMarkers(lower, HI_LATN_WORDS);
```

`behosh`, `meri`, and `mera` sit in `PA_LATN_WORDS` but are ordinary Hindi. Any message containing one returns immediately and Hindi is never counted. `papa behosh ho gaye hain, mujhe bahut dard hai` scores **1 Punjabi** (weak → no switch) when it would have scored **4 Hindi** (strong → switch). One ambiguous token suppresses an overwhelming signal, and can also route a Hindi speaker to Punjabi copy.

The `lang-01` note *"Punjabi is checked before Hindi (preserves existing precedence)"* faithfully ported precedence from `safety-messages.ts` — where it was a two-way tiebreak, not a short-circuit over an uncounted alternative.

### 3. Evidence does not accumulate

`resolveTurnLanguage(stored, text)` sees one message. Three consecutive one-marker Hinglish turns never reach `strong`. A human reading the thread would have switched after the second.

### The structural point

LANG-D3's ≥2-marker rule was calibrated against *false positives* — a lone `kitna` must not re-language an English booking. It was never calibrated against **false negatives**, and the marker list is the only thing standing between a patient and a reply in a language they may not read. `padhe`, `gaye`, `raha`, `gir`, `bachao`, `jaldi`, and `madad` are all absent. No hand-maintained wordlist will ever be complete.

This is the same shape as the emergency-regex problem solved earlier the same day: a deterministic pattern list as the *sole* decider in a system that already has a language model reading every message. The fix has the same shape too — a ratchet (`lang-17`).

### Why it matters more than it looks

`resolveSafetyMessage(kind, turnLanguage)` takes the resolved language. A resolver miss puts the **112 escalation** in the wrong language. Of every surface that inherits this defect, that is the one that cannot be allowed to.

---

## Decision lock

Inherit program **LANG-D1…D9**. Phase-specific:

| ID | Decision | Rationale |
|----|----------|-----------|
| **LANG4-D1** | **`NULL` means undecided and is not overwritten by the LANG-D1 fallback.** The turn still *replies* in English; it just does not persist that as the thread's language. | Restores the distinction migration 190 already documents. Makes LANG-D1 a rendering default rather than a sticky commitment. This alone fixes turns 1–2 of the reproduction. |
| **LANG4-D2** | **Both Latin languages are counted in full; the higher count wins.** Punjabi wins on any Punjabi-**exclusive** marker. Exact **shared-only** tie → **Hindi** (flipped 2026-08-02 after live English-112 miss on `behosh`). | Exclusive tokens still protect genuine Punjabi; shared-only ties were shipping weak Punjabi → English 112 to Hindi speakers. |
| **LANG4-D3** | **Markers accumulate across the last 3 patient turns**, but only while the thread is `NULL` or `en`. Established non-`en` threads keep the single-turn rule. | Accumulation exists to escape the English default, which is where the misses are. Applying it to established threads would let stale turns drag a settled language sideways. |
| **LANG4-D4** | **The classifier may supply a language signal, and it is a ratchet: it can move the thread off English, never onto it.** | ✅ Approved 2026-08-02. Amends LANG-D6 for the classifier only. |
| **LANG4-D5** | **`weak` still never switches an established non-`en` language.** LANG-D3 is unchanged for that case. | The `kitna` guard is doing real work. p4 loosens the English exit, not the general threshold. |
| **LANG4-D6** | Every decision emits `dm_language_decision_total` with the inputs that produced it. Marker **counts** and reason, never the text (LANG-D9). | Today a wrong language is invisible in logs until a human eyeballs a screenshot. |

### LANG4-D4 amends LANG-D6 — read this before `lang-17`

LANG-D6 says *"The LLM never chooses."* That decision was made against a real failure: `RESPONSE_SYSTEM_PROMPT_BASE` asked the **generator** to mirror the patient, and it produced Hinglish for `hey hallo`.

LANG4-D4 is a different mechanism and worth stating precisely:

| | LANG-D6 (removed) | LANG4-D4 (proposed) |
|---|---|---|
| Who | The **generator**, mid-reply | The **classifier**, before the turn |
| What | Picks the language it writes in | Emits a label into the resolver |
| Authority | Final and unreviewable | One input; deterministic ratchet decides |
| Can produce Hinglish for `hey hallo`? | Yes — it did | No — ratchet only moves *off* English, and `hey hallo` has no signal to move it |

The invariant that makes this safe: **nothing can move a thread toward English except the LANG-D1 default on an undecided thread.** A hallucinated `hi-Latn` on an English thread is the cost; the reproduction above is the benefit. If the founder prefers to hold LANG-D6 as written, `lang-17` is cut and `lang-14`…`16` still fix turns 1–2 — ship them and re-open this later with corpus data from `lang-18`.

---

## Scope guard

- **DO NOT** touch `dm-copy.ts` or any copy table. p4 changes *which language is chosen*, never *what any string says*. Copy is p5/p6.
- **DO NOT** weaken LANG-D2. No snap-back to English remains absolute; p4 makes it easier to *leave* English, never to return.
- **DO NOT** widen the supported set beyond `en`/`hi`/`hi-Latn`/`pa`/`pa-Latn`/`other` (LANG-D7).
- **DO NOT** add a migration. `conversations.language` is already nullable with the right CHECK; p4 uses the `NULL` state that already exists.
- **DO NOT** log message text. Counts, reasons, and locale codes only (LANG-D9).
- Marker-list additions belong in `lang-15` only, driven by the `lang-18` corpus — not sprinkled opportunistically across tasks.

---

## Task list

| Task | Title | Size | Model |
|------|-------|------|-------|
| `lang-14` | Undecided threads stay `NULL` (stop persisting the default) | S | Sonnet |
| `lang-15` | Punjabi/Hindi marker contention — count both, higher wins | M | Sonnet |
| `lang-16` | Cross-turn marker accumulation while undecided or `en` | M | Sonnet |
| `lang-17` | Classifier language signal as a ratchet (amends LANG-D6) | M | **Opus** |
| `lang-18` | Labelled language corpus + `dm_language_decision_total` | M | Sonnet |
| `lang-19` | Close gate p4 | S | Composer / Founder |

---

## Acceptance gate

- [ ] `papa behosh padhe hain floor pe` on a fresh thread → `hi-Latn`, and the **112 copy is Roman Hindi**.
- [ ] The full three-turn reproduction above replies in Hinglish on every turn.
- [ ] `papa behosh ho gaye hain, mujhe bahut dard hai` → `hi-Latn`, not `pa-Latn`.
- [ ] `hey hallo` → English, and `conversations.language` stays `NULL`. **The original p1 bug, still fixed.**
- [ ] `menu tin din to dard hai` → `pa-Latn`. Genuine Punjabi still wins.
- [ ] An established `hi-Latn` thread receiving plain English stays `hi-Latn` (LANG-D2).
- [ ] Corpus from `lang-18` ≥ 95% correct, with **zero** English-shown-to-non-English-speaker misses in the emergency slice.
- [ ] Typecheck + lint + tests green.

---

**Created:** 2026-08-02.
