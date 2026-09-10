# Plan p6 — Translation arms (batch)

> **Status:** 🟡 LANG6-D2=B. `lang-25`…`27`✅ eng · transitional all-English helper removed · `lang-28` eng/docs checkpoint ✅ · founder IG funnel + LANG6-D5 reviewers open.
> **Program:** [`../README.md`](../README.md) · Prefix `lang` · Tasks `lang-25`…`lang-28`
> **One-line intent:** Unwind LANG3-D4. Every arm that says English because nobody translated it starts saying Hindi or Punjabi.
> **Decision memo:** [`LANG6-D2-DECISION.md`](./LANG6-D2-DECISION.md) · **Review workflow:** [`../../../../../../backend/locale-arms/REVIEW_WORKFLOW.md`](../../../../../../backend/locale-arms/REVIEW_WORKFLOW.md)

---

## Why this phase

p3 built the locale dispatch. p5 brought every remaining string into it. Neither produced a single word of Hindi.

The whole surface is still English, and it is codified:

```44:47:backend/src/utils/dm-copy.ts
/** LANG3-D4: ship English for all static locales until human-reviewed arms land. */
function enAllLocales<T>(en: T): Readonly<Record<StaticMessageLocale, T>> {
  return { en, hi: en, pa: en };
}
```

A repo-wide search for Devanagari or Gurmukhi in `backend/src` returns **five files**: `safety-messages.ts`, `complaint-clarification.ts`, `consultation-fees.ts`, `dm-reply-composer.ts`, and prompt examples in `ai-service.ts`. Everything else — the entire booking funnel, confirmations, cancellations, notifications, prescriptions, refunds — renders English regardless of the resolved language.

### The tests currently enforce English

This is the part that will surprise whoever starts p6:

```97:104:backend/tests/unit/utils/dm-copy-locale-invariants.test.ts
  it('confirm-details en / hi / pa render byte-identical (LANG3-D4)', () => {
    const en = buildConfirmDetailsMessage({ collected: FULL_FIXTURE, language: 'en' });
    const hi = buildConfirmDetailsMessage({ collected: FULL_FIXTURE, language: 'hi' });
    const pa = buildConfirmDetailsMessage({ collected: FULL_FIXTURE, language: 'pa' });
    expect(hi).toBe(en);
    expect(pa).toBe(en);
```

And the English-sentinel guard skips any arm that matches English:

```194:198:backend/tests/unit/utils/dm-copy-locale-invariants.test.ts
      if (text === enPeer) continue;

      for (const sentinel of ENGLISH_SENTINELS) {
        expect(text).not.toContain(sentinel);
```

These are honest assertions — they are named after LANG3-D4 and they document the deferral accurately. But they mean **the first real Hindi arm turns the suite red**, and the failure will look like a mistake rather than progress. Inverting them is a task in this phase (`lang-26` §1), not an accident to discover mid-diff.

### What LANG3-D4 actually decided

> *"Untranslated arms **ship English** and are tracked, never machine-translated inline. Medical-adjacent copy. A confidently wrong Hindi consent string is worse than an English one."*

That reasoning was right and still is. p6 does not overturn it — it satisfies it, by producing translations that **have** been reviewed. The bar was never "no machine translation", it was "no unreviewed string reaching a patient."

---

## The open strategy question

The founder chose an **LLM translation pass, cached**, over hand-filling static tables. An objection surfaced after that choice and has to be resolved before any code:

**A send-time translation pass sends PHI to the model.** Deterministic copy interpolates patient names, ages, phone numbers, and MRNs — `buildConfirmDetailsMessage` and `buildPaymentConfirmationMessage` most obviously. Translating a rendered string means those values leave the system on every booking turn.

Two shapes satisfy "the LLM does the translating":

| | **A — Runtime pass** (as chosen) | **B — Build-time generation** (counter-proposal) |
|---|---|---|
| When | On send, per message | Once, offline; output committed |
| Cache | Runtime store, keyed on masked template | The source file. Cache never expires. |
| PHI | Rendered values leave the system unless masked perfectly | **Never** — templates only, no patient data exists at generation time |
| Latency | +500–1500 ms on cache miss | Zero |
| Review | Reviewing a live model is reviewing a distribution | Diffable in a PR; a Hindi speaker reads exactly what ships |
| Snapshots | Non-deterministic; must be stubbed | Deterministic, unchanged mechanism |
| Failure | Needs an English fallback path | Cannot fail at runtime |
| New copy | Translated automatically | Needs a regeneration step |

B's only real cost is the last row, and `lang-25` §4 makes that a scripted step with a CI guard.

**`lang-25` locks this.** Everything downstream is written to be strategy-agnostic — `lang-26` and `lang-27` describe *which families get translated and to what standard*, not *by what mechanism*.

---

## Decision lock

Inherit **LANG-D1…D9**, **LANG3-D1…D7**, **LANG4-D1…D6**, **LANG5-D1…D7**. Phase-specific:

| ID | Decision | Rationale |
|----|----------|-----------|
| **LANG6-D1** | **LANG3-D4 is satisfied, not repealed.** No unreviewed string reaches a patient. A family with no reviewed translation keeps shipping English. | The original reasoning holds. p6 changes how translations are produced, not the bar they must clear. |
| **LANG6-D2** | **B — build-time generation** (2026-08-03). Drafts offline → human review → committed arms. Runtime pass rejected (PHI egress). | See [`LANG6-D2-DECISION.md`](./LANG6-D2-DECISION.md). |
| **LANG6-D3** | **No PHI reaches a translation service, under either strategy.** Under A, mask every interpolation before the call and re-insert after; the `phi: true` registry from LANG5-D3 is the input. Under B, the question does not arise. | Non-negotiable regardless of which option wins. |
| **LANG6-D4** | **LANG3-D7 stands.** Recording consent, the versioned consent body, and account-deletion explainers remain English pending counsel. | Unchanged. Legal text is not a translation problem. |
| **LANG6-D5** | **Every shipped non-`en` arm is reviewed by a human who speaks the language.** Model output is a draft. | Verbatim from LANG3-D4 §5.1, restated because it is the thing most likely to slip under delivery pressure. |
| **LANG6-D6** | **Register: warm clinic receptionist.** Conversational Hindi, not formal or literary. `hi-Latn` matches how patients actually type. Clinical terms patients use in English stay in English inside a Hindi sentence. | Follows `lang-12` §5.3 and the existing `consultation-fees` Roman-Hindi strings, which are the register reference. |
| **LANG6-D7** | **`hi` and `hi-Latn` are translated separately**, not transliterated from one another. Same for `pa`/`pa-Latn`. | Devanagari Hindi and the Hinglish patients type are different registers. Mechanical transliteration produces text that reads like neither. |
| **LANG6-D8** | **Byte-identical arms must be intentional.** Any family still English in `hi`/`pa` after p6 carries an explicit marker and a reason. | Distinguishes "reviewed and deliberately English" from "nobody got to it" — the ambiguity that made this gap invisible for three phases. |

---

## Scope guard

- **DO NOT** translate legal or versioned consent text (LANG6-D4).
- **DO NOT** ship a machine translation nobody has read (LANG6-D5).
- **DO NOT** translate ₹ amounts, dates, URLs, MRNs, phone numbers, or doctor/practice names (LANG3-D6).
- **DO NOT** convert numerals to another numbering system.
- **DO NOT** reword an English arm while adding translations. English copy changes are a separate, visible task.
- **DO NOT** invent Hindi medical terminology. If patients say the English word, keep the English word.
- **DO NOT** add languages beyond `en`/`hi`/`pa` (LANG-D7).
- **DO NOT** let PHI reach a translation service (LANG6-D3).
- Resolver behaviour is p4. String coverage is p5. Neither belongs here.

---

## Task list

| Task | Title | Size | Model |
|------|-------|------|-------|
| `lang-25` | Translation strategy decision + mechanism | M | **Opus** |
| `lang-26` | Booking-critical arms + invert the English-lock tests | L | Sonnet + human reviewer |
| `lang-27` | Notification, out-of-band, and safety-adjacent arms | L | Sonnet + human reviewer |
| `lang-28` | Close gate p6 — and close the program | S | Composer / Founder |

`lang-25` is **Opus**: it settles a PHI-egress question and reverses a standing decision.

`lang-26` and `lang-27` are **reviewer-bound, not engineer-bound.** Sequence them around the reviewer's availability, not the other way round.

---

## Acceptance gate

- [ ] A booking conducted entirely in Hinglish is Hinglish from greeting to payment confirmation. **The promise p3's gate made and could not keep.**
- [ ] An abandoned-booking reminder hours later arrives in the thread's language.
- [ ] Every non-`en` arm is either a reviewed translation or explicitly marked English with a reason (LANG6-D8).
- [ ] No PHI has been sent to a translation service, provable from the mechanism (LANG6-D3).
- [ ] Legal and versioned consent copy still English (LANG6-D4).
- [ ] ₹ amounts, dates, URLs, MRNs, and names byte-identical across locales.
- [ ] No reply mixes two languages within itself.
- [ ] Typecheck + lint + tests green.

---

**Created:** 2026-08-02.
