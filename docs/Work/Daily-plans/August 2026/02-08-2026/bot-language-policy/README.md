# Bot language policy

> The receptionist decides its reply language **once per conversation**, stores it, and every reply-emitter reads that stored value. No emitter detects language on its own. The LLM does not get a vote.

**Task prefix:** `lang`
**Depends on:** existing DM pipeline (`run-conversation-turn.ts` → `handle-turn.ts` → stages). No new channel work.

---

## The problem

A patient wrote `hey hallo` — plain English — and got back:

> *"Hey, hallo! Main Dr Zurb ka assistant hoon. Aapko kis cheez mein help chahiye—appointment book karna hai, availability check karni hai, ya fees/teleconsult ke baare mein poochna hai?"*

Both existing detectors return `en` for that string, so the Hinglish came from the **LLM**, which is currently asked to make the language call itself.

Root causes, in order of severity:

1. **No persisted language.** Nothing on `conversations`, `messages`, or any migration stores what language the thread is in. Every turn re-derives it from the current message text, so the thread can oscillate turn to turn.
2. **Two detectors that disagree.** `detectSafetyMessageLocale` (`en|hi|pa`) and `detectPatientLanguageHint` (`en|hi|hi-Latn|bn|ta|te|ml|kn|or|ur`) use different marker lists and different scopes. `yaar ek goli batado` is Hindi to one and English to the other.
3. **The LLM decides.** `RESPONSE_SYSTEM_PROMPT_BASE` asks the model to mirror the user. Its `LANGUAGE` block gives three vivid Hinglish examples and zero English ones, and its `STABILITY` guardrail is conditioned on *"if the conversation has been in clear English so far"* — which has no anchor on a first turn.
4. **Four localization mechanisms.** Static per-locale tables, `localizeReply` LLM translation, LLM mirroring, and English-only `dm-copy.ts`. A single reply can mix an English fee block, a Roman-Hindi CTA, and an English "Welcome back" prefix.

---

## Execute in order

| Phase | Folder | Theme | Status |
|-------|--------|-------|--------|
| **p1** | [`p1-language-resolver/`](./p1-language-resolver/) | One resolver + `conversations.language` + threading + explicit LLM directive. **Fixes the visible bug.** | ✅ eng done (`lang-01`…`04`; `lang-05` live smoke founder) |
| **p2** | [`p2-retire-second-detector/`](./p2-retire-second-detector/) | All deterministic emitters read the turn language instead of detecting. Delete the second detector. | ✅ eng done (`lang-06`…`08`; IG smoke founder) |
| **p3** | [`p3-dm-copy-localization/`](./p3-dm-copy-localization/) | Localize `dm-copy.ts` — locale dispatch + in-turn/OOB wiring. | ✅ eng done (`lang-09`…`12`; `lang-13` founder smoke open). **LANG3-D4 discharged by p6.** |
| **p4** | [`p4-resolver-accuracy/`](./p4-resolver-accuracy/) | The decision is single but not yet correct. Undecided ≠ English, Punjabi stops short-circuiting Hindi, evidence accumulates, classifier ratchet. | 🟡 Eng done (`lang-14`…`18`); `lang-19` close gate / founder smoke open |
| **p5** | [`p5-copy-coverage/`](./p5-copy-coverage/) | ~55 English literals that never reached `dm-copy.ts`, so p3 could not sweep them. Structural only — no patient-visible change. | 🟡 eng ✅ (`lang-20`…`24`); founder IG English E2E + `test:dm-conversation` open. Exception list: `DM_COPY_ENGLISH_ONLY_EXCEPTIONS`. |
| **p6** | [`p6-translation-arms/`](./p6-translation-arms/) | Discharge LANG3-D4. Every arm that says English because nobody translated it starts saying Hindi or Punjabi. | 🟡 eng ✅ (`lang-25`…`27`); `lang-28` close gate — founder IG smokes + real LANG6-D5 reviewers open |

Each phase is independently shippable. p1 alone stops the flip-flop.

---

## What p1–p3 did not cover

Two gaps found by a full-system audit on 2026-08-02, after a live thread replied in English to `papa behosh padhe hain floor pe`:

**The decision can be wrong (p4).** LANG-D3's ≥2-marker rule was calibrated against false positives — a lone `kitna` must not re-language an English booking. It was never calibrated against false negatives. Three defects compound: the LANG-D1 fallback persists `en` as if it were an observation, so one plain opening message locks the thread; `behosh` sits in the Punjabi list and short-circuits Hindi counting entirely; and evidence never accumulates across turns. `resolveSafetyMessage` takes the resolved language, so a miss puts the **112 escalation** in the wrong language.

**The emission is still English (p5/p6).** p3's gate — *"every `dm-copy` builder is localized or explicitly English-only"* — was met. The gap is its premise: it measures builders that exist. ~55 patient-facing literals live directly in stage handlers and services and were never migrated in. And of the builders that do exist, nearly all use `enAllLocales`, which fills `hi` and `pa` with the English string. A repo-wide search for Devanagari or Gurmukhi in `backend/src` returns **five files**.

The combined effect is a patient getting Hinglish on the LLM, safety, and fee turns, then English at booking, cancellation, and confirmation — a flip-flop in emission, which is the failure the resolver's own header says the module exists to prevent.

---

## Decision lock (program-level)

| ID | Decision | Rationale |
|----|----------|-----------|
| **LANG-D1** | **Default is English** when there is no language signal. | Asymmetric cost. English to a Hinglish patient reads formal but is understood; Hinglish to an English patient reads unprofessional. The default only applies when detection finds nothing — a Hinglish first message is detected on turn 1 and the default never fires. |
| **LANG-D2** | **Sticky, no automatic snap-back.** Once a conversation establishes Hindi/Hinglish/Punjabi it stays there for the rest of the thread. | Hinglish speakers routinely drop full English sentences mid-thread. Snapping back on those is the exact flip-flop we are removing. Reversible if founder disagrees after live use. |
| **LANG-D3** | **Confidence tiers.** Indic script → immediate switch. Roman Hindi/Punjabi needs **≥2 distinct strong markers** → switch. Exactly one marker → **no switch**. | Kills the single-`kitna` flip. A lone fee keyword must never re-language a conversation. |
| **LANG-D4** | **One detector.** `detectSafetyMessageLocale` + `detectPatientLanguageHint` collapse into `backend/src/utils/conversation-language.ts`. Both old exports are deleted by end of p2. | Two disagreeing detectors is the structural defect. |
| **LANG-D5** | Persist on a **dedicated `conversations.language` column**, not `metadata` JSONB. | Queryable, self-documenting, cheap to index later for analytics. `metadata` is already an untyped grab bag. |
| **LANG-D6** | **The LLM never chooses.** The mirror instruction is replaced by an injected per-turn directive derived from the resolved language. | Removes the last non-deterministic language decision. |
| **LANG-D7** | **v1 supported set = `en`, `hi`, `hi-Latn`, `pa`, `pa-Latn`.** Other scripts (Bengali, Tamil, Telugu, Malayalam, Kannada, Odia, Urdu) are **detected and stored** but render deterministic copy in English. | Static tables only have en/hi/pa today. Rendering an all-English reply to a Tamil speaker is consistent and honest; rendering a half-Tamil, half-English reply is not. Follow-up phase can widen the tables. |
| **LANG-D8** | **Per-doctor default language is out of scope.** English is the global default. | Keeps p1 small. Revisit once live data shows clinics that want a Hinglish opener. |
| **LANG-D9** | Language is **not PHI** and may be logged with `correlationId`. Never log the message text that produced it. | Consistent with `.cursor/rules/00-agent-contract.mdc`. |

---

## Task index

| Task | Phase | Title | Model |
|------|-------|-------|-------|
| lang-01 | p1 | `conversation-language.ts` resolver + confidence tiers | Sonnet |
| lang-02 | p1 | Migration 190 — `conversations.language` | **Opus** |
| lang-03 | p1 | Resolve once per turn, thread through context, persist | **Opus** |
| lang-04 | p1 | Replace LLM mirror instruction with explicit directive | Sonnet |
| lang-05 | p1 | Close gate p1 | Composer / Founder |
| lang-06 | p2 | Deterministic emitters read `turnLanguage` (15 call sites) | Sonnet |
| lang-07 | p2 | Delete `detectPatientLanguageHint` + `localizeReply` | Sonnet |
| lang-08 | p2 | Close gate p2 | Composer |
| lang-09 | p3 | `dm-copy.ts` locale dispatch layer + first family | **Opus** |
| lang-10 | p3 | Migrate in-turn callers | Sonnet |
| lang-11 | p3 | Migrate out-of-band senders (DB-read language) | **Opus** |
| lang-12 | p3 | Translate remaining families + punch-list | Sonnet |
| lang-13 | p3 | Close gate p3 | Composer / Founder |
| lang-14 | p4 | Undecided threads stay `NULL` (stop persisting the default) | Sonnet |
| lang-15 | p4 | Punjabi/Hindi marker contention — count both, higher wins | Sonnet |
| lang-16 | p4 | Cross-turn marker accumulation while undecided or `en` | Sonnet |
| lang-17 | p4 | Classifier language signal as a ratchet (amends LANG-D6) | **Opus** |
| lang-18 | p4 | Labelled language corpus + `dm_language_decision_total` | Sonnet |
| lang-19 | p4 | Close gate p4 | Composer / Founder |
| lang-20 | p5 | Cancel / reschedule / status + action-executor | **Opus** |
| lang-21 | p5 | Consent, revocation, and the pause gate | **Opus** |
| lang-22 | p5 | Booking links, staff review, funnel clarifiers | Sonnet |
| lang-23 | p5 | Comment DMs, throttle ack, fallback, OOB stragglers | Sonnet |
| lang-24 | p5 | Close gate p5 | Composer / Founder |
| lang-25 | p6 | Translation strategy decision + mechanism | **Opus** |
| lang-26 | p6 | Booking-critical arms + invert the English-lock tests | Sonnet + reviewer |
| lang-27 | p6 | Notification, out-of-band, and safety-adjacent arms | Sonnet + reviewer |
| lang-28 | p6 | Close gate p6 — and close the program | Composer / Founder |

---

## Open decisions

| Decision | Blocks | Question | Outcome |
|----------|--------|----------|---------|
| **LANG4-D4** | `lang-17` | May the **classifier** emit a language label that can move a thread off English (never onto it)? Amends **LANG-D6** for the classifier only (generator still never chooses). | ✅ **Yes** (founder, 2026-08-02). Shipped in `lang-17`. **Amend 2026-08-03:** English-evidence veto on marker `none` (founder) — pure-English first messages cannot sticky-adopt `hi-Latn`. **Amend 2026-08-04:** veto threshold lowered to **1** evidence word after `severe asthma no inhaler left` rendered Devanagari live (only `severe` hit, under the 2-word bar); plus a **native-script guard** — Latin-only text downgrades a `hi`/`pa` label to `hi-Latn`/`pa-Latn`, since a message with no Devanagari can never justify sticky native Hindi. |
| **LANG6-D2** | `lang-25`, all of p6 | Runtime LLM translation pass, or build-time generation with the output committed? | ✅ **B — build-time** (founder, 2026-08-03). Memo: [`p6-translation-arms/LANG6-D2-DECISION.md`](./p6-translation-arms/LANG6-D2-DECISION.md). Runtime rejected: PHI egress on interpolated builders. |

---

## Scope / risk

Per [`.cursor/rules/00-agent-contract.mdc`](../../../../../../.cursor/rules/00-agent-contract.mdc): `lang-02` is a **new migration** and `lang-03` is a **5+ file refactor** touching conversation state → both **Opus**. `lang-09` rewrites the spine of a 1713-line patient-facing copy file and `lang-11` spans notification/refund/deletion senders → both **Opus**.

For p4–p6: `lang-17` amends a program decision lock and touches the AI service contract; `lang-20` converges two emitters including the LLM tool-result path; `lang-21` touches **consent and revocation**, named explicitly in the contract; `lang-25` settles a **PHI-egress** question → all four **Opus**.

p4 adds **no migration** — `conversations.language` is already nullable and migration 190 already documents `NULL = undecided`. p5 changes no patient-visible text. No PHI columns and no RLS change in any phase; `conversations.language` is a locale code, not patient data.

---

**Created:** 2026-08-02.
**Status:** p1–p6 eng ✅ · LANG3-D4 discharged · `test:dm-language` ✅. **`lang-28` founder Meta funnel** + LANG6-D5 reviewers still open (`lang-05`/`08`/`13`/`19`/`24` smokes too). Policy summary: [`LANGUAGE_POLICY.md`](../../../../Reference/product/receptionist-bot/LANGUAGE_POLICY.md).
**One-liner:** One resolver, one stored value, one directive — English by default, sticky when the patient switches, and correct in the language the patient actually used.
