# Task lang-16: Cross-turn marker accumulation

> **Links:** batch [`../plan-p4-resolver-accuracy-batch.md`](../plan-p4-resolver-accuracy-batch.md) · exec [`./EXECUTION-ORDER-p4-resolver-accuracy.md`](./EXECUTION-ORDER-p4-resolver-accuracy.md)

---

## 📋 Task Overview

Let evidence add up across turns while the thread is still undecided or English.

`resolveTurnLanguage(stored, text)` sees exactly one message, so three consecutive one-marker Hinglish turns never reach `strong` and the thread stays English forever. A human reading the thread would have switched after the second.

Scoped deliberately narrow (LANG4-D3): accumulation only applies while `stored` is `NULL` or `'en'`. Established non-English threads keep the single-turn rule, so a stale turn can never drag a settled language sideways.

First task in the phase that changes the resolver's **signature**, so it touches the caller.

**Program / Phase:** bot-language-policy · p4 · Wave 2
**Estimated Time:** ~3–4 hours
**Status:** ✅ DONE (2026-08-02)
**Change Type:** Resolver signature + caller wiring
**Model:** Sonnet
**Depends on:** `lang-14` (the `NULL` state gates accumulation), `lang-15` (accumulates over the corrected counter)

---

## ✅ Task Breakdown

### 1. Signature

- [ ] 1.1 Add an optional third parameter:

  ```ts
  resolveTurnLanguage(
    stored: ConversationLanguage | null,
    text: string,
    priorPatientTexts?: readonly string[],
  ): LanguageResolution
  ```

  Optional so the ~15 existing call sites keep compiling and the behaviour change lands at one caller.
- [ ] 1.2 Oldest-first ordering, matching `recentMessages` elsewhere in the pipeline. State it in the doc comment — a reversed array silently changes which turns are in the window.
- [ ] 1.3 Keep the function **pure and synchronous**. It receives strings; it does not fetch them. The `lang-01` constraint still holds.
- [ ] 1.4 Add `reason: 'accumulated'` to `LanguageResolution['reason']`. A switch driven by history must be distinguishable from one driven by the current message in logs and tests.

### 2. Accumulation rule

- [ ] 2.1 Only accumulate when `stored == null || stored === 'en'` (LANG4-D3). Otherwise ignore `priorPatientTexts` entirely and take the existing single-turn path.
- [ ] 2.2 Window is the **last 3 patient turns plus the current message**. Export the constant; do not inline the `3`.
- [ ] 2.3 Union the *distinct markers* across the window, then apply `confidenceFromCount` to the union size. Union of markers, not sum of counts — the same word in three messages is still one marker, consistent with the `lang-01` "distinct" rule.
- [ ] 2.4 The current message must contribute **at least one marker** for an accumulated switch to fire. Without this, an unrelated present-tense English question could flip the thread on the strength of history alone.
- [ ] 2.5 Run the `lang-15` contention over the union, not per message. Punjabi-exclusive in any windowed turn makes the union Punjabi.
- [ ] 2.6 A `strong` **current-message** signal still switches immediately, exactly as today. Accumulation only adds a path; it never delays one.

### 3. Caller

- [ ] 3.1 `run-conversation-turn.ts` already loads `recentMessages` before resolution. Confirm the read happens **before** line ~322 — if it does not, move the resolution rather than adding a second query.
- [ ] 3.2 Filter to patient turns only (`sender_type` patient) and map to content strings. Assistant copy is full of Hindi from `safety-messages.ts` — feeding it back in would let the bot's own reply justify its language choice.
- [ ] 3.3 Take the **last 3** after filtering, oldest-first.
- [ ] 3.4 Non-text turns contribute `''`. They should occupy a window slot without contributing markers, not be dropped.
- [ ] 3.5 Do not add a DB round-trip. If `recentMessages` is unavailable at that point, pass nothing and note it — a latency regression here would land straight on the p1 `dm-reply-latency` work.

### 4. Tests

- [ ] 4.1 Three consecutive one-marker Hinglish turns on a `NULL` thread → switches to `hi-Latn` on the third, `reason: 'accumulated'`.
- [ ] 4.2 The same three turns with `stored = 'hi-Latn'` → no change, `reason: 'stored'`. Accumulation is inert on established threads.
- [ ] 4.3 History has two Hinglish markers, current message is plain English → **no switch** (§2.4).
- [ ] 4.4 Current message alone is strong → switches with `reason: 'markers'`, not `'accumulated'`. Ordering of the two paths matters.
- [ ] 4.5 Window boundary: 4 turns back is excluded, 3 back is included. Assert both sides.
- [ ] 4.6 Punjabi-exclusive marker in an earlier turn + Hindi markers in the current → union resolves `pa-Latn` (§2.5).
- [ ] 4.7 Assistant messages in the window are ignored — construct a case where including them would flip the result, and assert it does not.
- [ ] 4.8 Empty `priorPatientTexts` and `undefined` both behave exactly like today. Table-drive against the existing `lang-01` cases so the no-history path is provably unchanged.
- [ ] 4.9 Caller test in `turn-language.test.ts`: patient-only, last 3, oldest-first is what actually reaches the resolver. Assert on the argument, not just the outcome.

---

## 📁 Files

```
UPDATE: backend/src/utils/conversation-language.ts (signature, window constant, accumulation)
UPDATE: backend/src/workers/dm/run-conversation-turn.ts (pass filtered patient history)
UPDATE: backend/tests/unit/utils/conversation-language.test.ts
UPDATE: backend/tests/unit/workers/dm/turn-language.test.ts
DO NOT TOUCH: marker lists (lang-15)
DO NOT TOUCH: LANG-D2 no-snap-back
DO NOT TOUCH: any other resolveTurnLanguage call site — the new param is optional for exactly this reason
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **No new DB query.** Reuse `recentMessages`. If it is not in scope at the resolution point, say so and stop rather than adding a read.
- Accumulation never applies to established non-`en` threads (LANG4-D3). Do not "improve" this to cover language switches between Hindi and Punjabi.
- Do not feed assistant messages into detection under any circumstance (§3.2).
- Do not make the resolver `async`. It is pure by design.
- Never log message text — window size and marker counts only (LANG-D9).

---

## ✅ Acceptance Criteria

- [ ] Three one-marker Hinglish turns escape English; the same turns cannot disturb an established language.
- [ ] An accumulated switch is distinguishable from a single-message switch via `reason`.
- [ ] Assistant copy provably cannot influence detection.
- [ ] No added DB round-trip on the turn path.
- [ ] All `lang-01`/`lang-14`/`lang-15` behaviour unchanged when no history is passed.
- [ ] Typecheck + lint + language suite green.

---

**Created:** 2026-08-02.
