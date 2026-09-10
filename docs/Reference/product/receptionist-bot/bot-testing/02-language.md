# 02 — Language (stress pack)

**Checklist home:** [MANUAL_QA_CHECKLIST_DM_BOT.md §2](./MANUAL_QA_CHECKLIST_DM_BOT.md)  
**Resolver:** [`conversation-language.ts`](../../../../backend/src/utils/conversation-language.ts)  
**Turn wiring:** [`run-conversation-turn.ts`](../../../../backend/src/workers/dm/run-conversation-turn.ts)  
**Corpus (unit):** [`language-detection-labels.json`](../../../../backend/tests/fixtures/language-detection-labels.json)  
**Telemetry:** every turn → `dm_language_decision_total` (`alertMarker: dm_language_decision`). Fields: `resolved`, `changed`, `reason`, marker counts, `classifierLanguage`, `classifierAgreed`. **Never** message text (LANG-D9).

| Symbol | Meaning |
|--------|---------|
| **hi-Latn** | Roman Hindi / Hinglish reply language |
| **pa-Latn** | Roman Punjabi reply language |
| **hi / pa** | Native script (Devanagari / Gurmukhi) |
| **en** | English rendering |
| **NULL** | `conversations.language` undecided — still renders English (LANG4-D1) |
| **112** | Emergency safety copy (branch `emergency_safety`) |

**Pass rule:** right **reply language** + log `resolved` matches. For English openers, also check the DB row is **NULL** (not `'en'`).

**Coverage:** harness covers checklist **2.1, 2.2, 2.3, 2.5, 2.10**. Rows below are Meta-client / log smokes. Seeded from the lang-18 corpus + the 2026-08-02 live miss.

> **p6 eng (2026-08-03):** after language is sticky Hinglish, **booking mechanics** (intake, confirm, consent, slot link, payment) and OOB notifications must also follow `resolved` (Roman hi/pa). Deliberate English remains only for `enByPolicy` families (legal consent, public comment reply, practice-name tokens, modality labels). Founder Meta-client smoke still required for the full funnel (`lang-28`).

---

## Policy (quick)

| Rule | Behaviour |
|------|-----------|
| LANG4-D1 | Undecided → render `en`, **do not** persist `'en'`. Column stays `NULL`. |
| LANG-D2 | No snap-back to English once non-`en` is stored. |
| LANG4-D3 | Accumulation: last **3** patient texts while undecided/`en`. |
| LANG4-D4 | Classifier may move **off** English on undecided only; never toward `en`. Markers win. **Amend:** pure-English evidence vetoes sticky `hi-Latn` on wordlist miss (≥1 evidence word). **Amend:** Latin-only text can never adopt native `hi`/`pa` — downgraded to the Latin variant. |
| Acute emergency | Weak non-English is enough to leave English (crisis bar). |

---

## Setup

| # | Check | Pass/Fail |
|---|-------|-----------|
| S0 | Fresh DM thread per block (or confirm idle) | |
| S1 | Logs show `dm_language_decision` / `instagram_dm_routing` | |
| S2 | Can inspect `conversations.language` for the thread | |
| S3 | Corpus unit test green: `npx jest language-detection-corpus` | |

---

## A. 2026-08-02 reproduction (must pass)

**Fresh thread.** Send in order. Every turn: Roman Hindi 112/reaffirm + log `resolved: hi-Latn`.

| # | Input | Expect | Log | Pass/Fail |
|---|-------|--------|-----|-----------|
| A1 | `papa behosh padhe hain floor pe` | **112** hi-Latn | `resolved=hi-Latn`, `changed=true` | |
| A2 | `kuch batao` | reaffirm hi-Latn | `resolved=hi-Latn` | |
| A3 | `kuch to jab tak ambulance ati hai` | reaffirm hi-Latn | `resolved=hi-Latn` | |
| A4 | `papa behosh ho gye` *(fresh thread)* | **112** hi-Latn on **turn 1** | `resolved=hi-Latn`, `reason=markers` (or `accumulated` / `classifier`) | |

---

## B. English still works (LANG4-D1 / p1)

| # | Input | Expect | DB `language` | Log | Pass/Fail |
|---|-------|--------|---------------|-----|-----------|
| B1 | `hey hallo` (fresh) | English greeting | **NULL** | `resolved=en`, `changed=false`, `reason=default` | |
| B2 | Three plain English turns (`hi` → `is the doc available tomorrow?` → `ok thanks`) | English each time | still **NULL** | zero language writes (`changed=false`) | |
| B3 | On English thread: `kitna is the fee?` | English fee path; stays English | unchanged | not `hi-Latn` | |

---

## C. Sticky + contention

| # | Steps | Expect | Pass/Fail |
|---|-------|--------|-----------|
| C1 | `mujhe kal appointment chahiye` → then `ok sounds good what time` | Stays **hi-Latn** (LANG-D2) | |
| C2 | Fresh: `menu tin din to dard hai` | **pa-Latn**, not Hindi | |
| C3 | Fresh: `papa behosh ho gaye hain, mujhe bahut dard hai` | **hi-Latn**, not Punjabi | |
| C4 | Fresh: `menu mujhe dard hai` | **pa-Latn** (exclusive `menu` wins) | |

---

## D. Accumulation (LANG4-D3)

| # | Steps | Expect | Pass/Fail |
|---|-------|--------|-----------|
| D1 | Fresh, three sparse one-marker turns (e.g. `kitna?` → `dard` → `mujhe`) | Switches by turn 3; log `reason=accumulated` | |
| D2 | Same sparse turns on an already `hi-Latn` thread | No disturbance; stays hi-Latn | |

---

## E. Classifier ratchet (LANG4-D4)

| # | Steps | Expect | Pass/Fail |
|---|-------|--------|-----------|
| E1 | Fresh Hinglish the wordlist may miss → still non-`en` | `reason=classifier` **or** markers after spellings | |
| E2 | Clearly English opener (`mild chest discomfort after gym`) | stays English / NULL; **no** sticky `hi-Latn` (EN-evidence veto) | |
| E3 | Force classify failure (if you can) | markers/default still decide | |

---

## F. Script surfaces (spot-check)

| # | Input | Expect `resolved` | Notes | Pass/Fail |
|---|-------|-------------------|-------|-----------|
| F1 | `नमस्ते, अपॉइंटमेंट चाहिए` | `hi` | checklist 2.2 | |
| F2 | `ਮੈਨੂੰ ਅਪਾਇੰਟਮੈਂਟ ਚਾਹੀਦੀ ਹੈ` | `pa` | checklist 2.4 | |
| F3 | Tamil / Telugu booking ask | `other` | deterministic copy English (LANG-D7) | |
| F4 | After hi-Latn thread, send an image | non-text ack in Hindi | checklist 2.7 | |

---

## G. False positives (must stay English)

Send on a **fresh** thread. Expect `resolved=en`, `changed=false`.

| # | Input | Pass/Fail |
|---|-------|-----------|
| G1 | `what font, sans or serif` | |
| G2 | `the girder is safe` | |
| G3 | `the main issue is scheduling` | |
| G4 | `hello how are you doc, blood sugar is high today` | |

---

## H. Telemetry hygiene

| # | Check | Pass/Fail |
|---|-------|-----------|
| H1 | Every turn emits `dm_language_decision` (including no-change) | |
| H2 | No message text / marker word identities in the log line | |
| H3 | `classifierAgreed` present when classifier returned a language | |

---

## I. Full Hinglish booking funnel (lang-28 / p6 gate)

On a **fresh** Instagram thread. Pass = every bot message is Roman Hindi (or intentional English loanwords) — **not** full English sentences. Protected tokens (name, age, phone, ₹, URL, MRN) unchanged.

| # | Patient | Expect | Pass/Fail |
|---|---------|--------|-----------|
| I1 | `mujhe kal appointment chahiye` | Hinglish greeting; `resolved=hi-Latn` | |
| I2 | Intake details (name/age/phone/reason) | Hinglish intake ask | |
| I3 | Confirm | Hinglish confirm; PHI tokens unchanged | |
| I4 | Consent Yes | Hinglish consent extras / next step | |
| I5 | Slot / payment | Hinglish link copy; **URL untouched** | |
| I6 | English control: fresh thread `hey hallo` | English greeting; `language` stays **NULL** | |
| I7 | Abandon Hinglish booking ~1h | Reminder in Hinglish | |
| I8 | Recording-consent ask (if reached) | **English** (LANG6-D4) | |

---

## Scratchpad

| Fail # | Input | `resolved` / `reason` seen | Expected | Notes |
|--------|-------|----------------------------|----------|-------|
| | | | | |

Log defects in [MANUAL_QA §15](./MANUAL_QA_CHECKLIST_DM_BOT.md).

---

**Created:** 2026-08-02 (lang-19).  
**Updated:** 2026-08-03 (lang-28) — p6 funnel expectations.  
**Corpus seed:** 75 reviewed rows across 10 slices — unit floors in `language-detection-corpus.test.ts`; this pack is the live subset.
