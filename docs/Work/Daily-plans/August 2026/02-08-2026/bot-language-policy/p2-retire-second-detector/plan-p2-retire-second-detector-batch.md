# Plan p2 — Every emitter reads the turn language (batch)

> **Status:** ✅ DONE (2026-08-02) — eng gate; live IG smoke still founder-owned.
> **Program:** [`../README.md`](../README.md) · Prefix `lang` · Tasks `lang-06`…`lang-08`
> **One-line intent:** Delete both legacy detectors. Deterministic copy stops sniffing the raw message and reads `ctx.turnLanguage` instead.

---

## Why this phase

p1 gave the conversation a single stored language and pointed the LLM at it. But the **deterministic** copy layer still runs its own detector on the raw message text, 15 call sites across 5 files:

| File | `detectSafetyMessageLocale` call sites |
|------|---|
| `backend/src/utils/reason-first-triage.ts` | 7 (`:233, :419, :495, :523, :613, :672, :679`) |
| `backend/src/utils/consultation-fees.ts` | 3 (`:704, :1214, :1285`) |
| `backend/src/utils/complaint-clarification.ts` | 2 (`:136, :198`) |
| `backend/src/utils/dm-reply-composer.ts` | 1 (`:324`) |
| `backend/src/utils/safety-messages.ts` | 1 (`:82`, inside `resolveSafetyMessage`) |

Plus `detectPatientLanguageHint` behind `localizeReply`, at 2 call sites (`booking-funnel.ts:691`, `cancel-reschedule-status.ts:203`).

Until these move, a single reply can still contain an LLM sentence in English and a fee CTA in Roman Hindi, because they consulted different oracles about the same message.

**Not in this phase:** `dm-copy.ts` localization (p3), widening the static tables beyond en/hi/pa (LANG-D7).

---

## Decision lock

Inherit program **LANG-D1…D9**. Phase-specific:

| ID | Decision | Implication |
|----|----------|-------------|
| **LANG2-D1** | Emitters take `language: ConversationLanguage` as an **explicit parameter**. No module-level or ambient lookup. | Keeps them pure and snapshot-testable. |
| **LANG2-D2** | The static tables keep their `en | hi | pa` shape. A small mapper collapses the resolver's 6 codes onto them: `hi-Latn → hi`, `pa-Latn → pa`, `other → en`. | Table rewriting is p3+ work; this phase is a wiring change only. |
| **LANG2-D3** | `detectSafetyMessageLocale` and `detectPatientLanguageHint` are **deleted**, not deprecated. | A leftover export gets re-imported six months later. |
| **LANG2-D4** | `localizeReply`'s LLM translation call is **removed entirely**, not re-pointed. Its 2 call sites get proper locale-table strings. | An extra OpenAI round-trip to translate a template we could just write is latency and cost for nothing. |
| **LANG2-D5** | Output must be **byte-identical** for any message where old and new detection agree. Only genuine disagreements may change. | Makes the golden snapshots a real safety net. |

---

## Scope guard

- **DO NOT** change any locale table's wording. Wiring only.
- **DO NOT** touch `dm-copy.ts` (p3).
- **DO NOT** add languages to the tables (LANG-D7).
- **DO NOT** leave a deprecated alias for either deleted detector.
- Mixed-language leftovers such as the `hi` variant of `formatReasonFirstAskMoreQuestion` opening with English *"Thanks for sharing."* (`reason-first-triage.ts:404-408`) are **noted but not fixed** here — log them for p3.

---

## Task list

| Task | Title | Size | Model |
|------|-------|------|-------|
| `lang-06` | Deterministic emitters read `turnLanguage` | L | Sonnet |
| `lang-07` | Delete `detectPatientLanguageHint` + `localizeReply` | M | Sonnet |
| `lang-08` | Close gate p2 | S | Composer |

---

## Acceptance gate

- [x] `rg 'detectSafetyMessageLocale|detectPatientLanguageHint|localizeReply' backend/src` returns **nothing**.
- [x] Every emitter takes language as a parameter; none reads raw message text to decide locale.
- [x] A single reply never mixes languages across its server-composed blocks (eng: same `turnLanguage`).
- [x] Golden DM snapshots unchanged (57/57 pass; empty behavioral diff).
- [x] Typecheck + lint + tests green (p2 suite).
- [ ] Live IG smoke (founder) — see `task-lang-08`.

---

**Created:** 2026-08-02.
