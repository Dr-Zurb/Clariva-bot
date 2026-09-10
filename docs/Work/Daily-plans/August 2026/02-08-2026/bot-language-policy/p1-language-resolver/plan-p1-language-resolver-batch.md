# Plan p1 — One language resolver, stored per conversation (batch)

> **Status:** ⏳ Not started.
> **Program:** [`../README.md`](../README.md) · Prefix `lang` · Tasks `lang-01`…`lang-05`
> **One-line intent:** The bot resolves reply language **once per turn** from stored state + new evidence, saves it on the conversation, and tells the LLM what to speak instead of asking it to guess.

---

## Why this phase

The visible bug — English `hey hallo` answered in Hinglish — is not a detector bug. Both detectors return `en` for that string. It is the **LLM** free-styling, because the prompt hands it the decision and its stability guardrail has no history to anchor to on a first turn.

Fixing the prompt alone would be cosmetic. The structural defect is that **language has no memory**: it is recomputed from scratch every turn, by two different regexes plus a model. This phase gives language a single home and a single owner.

**Not in this phase:** migrating the deterministic emitters off `detectSafetyMessageLocale` (p2), localizing `dm-copy.ts` (p3), per-doctor default language (LANG-D8).

---

## Decision lock

Inherit program **LANG-D1…D9**. Phase-specific:

| ID | Decision | Implication |
|----|----------|-------------|
| **LANG1-D1** | The resolver is **pure** — `(stored, userText) → { language, changed, reason }`. No DB, no I/O, no LLM. | Trivially unit-testable; the switching rule is readable in one file. |
| **LANG1-D2** | Resolution happens **once**, early in `runConversationTurn`, **before** control gates. | Emergency/pause replies get the right language too. |
| **LANG1-D3** | The resolved value rides on `DmTurnContext` as `turnLanguage`. Nothing downstream re-detects. | Single source of truth for the whole turn. |
| **LANG1-D4** | Persist **only when changed** (or when previously `NULL`), in the same write path that persists conversation state. | No extra round-trip on the common path. |
| **LANG1-D5** | In p1 the old detectors keep working untouched. Only the **LLM path** switches to the new directive. | Keeps the diff reviewable; p2 does the mechanical migration. |
| **LANG1-D6** | Backfill is **not** required. `language IS NULL` means "undecided" and resolves to English on the next turn. | No data migration risk on 190. |

---

## Scope guard

- **DO NOT** change `detectSafetyMessageLocale` behavior or its callers in p1 (that is `lang-06`).
- **DO NOT** touch `dm-copy.ts` (that is p3).
- **DO NOT** add a per-doctor default setting (LANG-D8).
- **DO NOT** widen the static locale tables to new languages (LANG-D7).
- **DO NOT** log the patient message text that produced a language decision — log the resulting code + `correlationId` only.
- **Opus** for `lang-02` (new migration) and `lang-03` (5+ file refactor on conversation state).

---

## Task list

| Task | Title | Size | Model |
|------|-------|------|-------|
| `lang-01` | `conversation-language.ts` resolver + confidence tiers | M | Sonnet |
| `lang-02` | Migration 190 — `conversations.language` | S | **Opus** |
| `lang-03` | Resolve once per turn, thread through context, persist | M | **Opus** |
| `lang-04` | Replace LLM mirror instruction with explicit directive | S | Sonnet |
| `lang-05` | Close gate p1 | S | Composer / Founder |

---

## Acceptance gate

- [ ] `hey hallo` on a fresh conversation → **English** reply. (The reported bug.)
- [ ] `kitna is the fee?` on an English thread → stays **English** (single marker never switches).
- [ ] `mujhe appointment chahiye kal ke liye` → switches to `hi-Latn` and **stays** there for later English-ish turns.
- [ ] Devanagari message → switches immediately on one message.
- [ ] `conversations.language` is written on first resolution and on every change; unchanged turns do not rewrite it.
- [ ] The response system prompt contains an explicit directive (e.g. `Reply in English.`) and no longer asks the model to pick.
- [ ] Backend typecheck + lint + unit tests green.

---

**Created:** 2026-08-02.
