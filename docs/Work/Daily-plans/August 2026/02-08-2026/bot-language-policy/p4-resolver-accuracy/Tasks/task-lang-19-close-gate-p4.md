# Task lang-19: Close gate p4

> **Links:** batch [`../plan-p4-resolver-accuracy-batch.md`](../plan-p4-resolver-accuracy-batch.md) · exec [`./EXECUTION-ORDER-p4-resolver-accuracy.md`](./EXECUTION-ORDER-p4-resolver-accuracy.md)

---

## 📋 Task Overview

Verify the language *decision* is correct on real Instagram traffic. Reproduce the 2026-08-02 miss and confirm it is gone.

p4 does not change any copy, so a Hinglish thread will still hit English booking mechanics — that is p5/p6 and is **expected** at this gate. What must be right here is which language the bot *decided* on, and that the surfaces already translated (safety, fees, LLM turns) honour it.

**Program / Phase:** bot-language-policy · p4 · Wave 5
**Status:** 🟡 Eng close-out partial — **founder IG smoke open** (pack A–H)
**Model:** Composer / Founder

---

## ✅ Checklist

### Code
- [x] `lang-14`…`lang-16` and `lang-18` done. `lang-17` done; LANG4-D4 = yes (2026-08-02).
- [x] Corpus test green at the per-slice floors; `emergency` and `false-positive` slices zero-miss.
- [x] Typecheck + language suite green (2026-08-02).
- [x] `npm run test:dm-language` — 4/4 scenarios green (2026-08-02), including LANG4-D1 NULL + Roman Hindi 112.
- [x] `npm run test:dm-conversation` — language tag 4/4; full suite **14/15** (2026-08-02). Sole fail: `safety-emergency-en` turn 2 (`emergency appointment` reaffirms 112 after prior escalation — open-crisis gate vs checklist §1.6). Not a language regression; parked in capture inbox.

### The reproduction — replay it exactly
On a **fresh** thread, in order:
- [ ] `papa behosh padhe hain floor pe` → 112 escalation **in Roman Hindi**.
- [ ] `kuch batao` → reaffirm **in Roman Hindi**.
- [ ] `kuch to jab tak ambulance ati hai` → reaffirm **in Roman Hindi**.
- [ ] All three turns log `resolved: 'hi-Latn'` in `dm_language_decision_total`.

Every one of these replied in English on 2026-08-02.

### English still works
- [ ] `hey hallo` on a fresh thread → English greeting. **The original p1 bug.**
- [ ] `conversations.language` is `NULL` after that turn, not `'en'` (LANG4-D1). Check the row directly.
- [ ] `kitna is the fee?` on an English thread → stays English, fee block and CTA included (LANG-D3 / LANG4-D5 still hold).
- [ ] Three plain-English turns → zero language writes.

### Sticky behaviour
- [ ] Open Hinglish (`mujhe kal appointment chahiye`) → Hinglish. Then a plain English sentence → **stays** Hinglish (LANG-D2).
- [ ] Punjabi (`menu tin din to dard hai`) → Punjabi copy, not Hindi.
- [ ] `papa behosh ho gaye hain, mujhe bahut dard hai` → **Hindi**, not Punjabi (LANG4-D2).

### Accumulation
- [ ] Three sparse one-marker Hinglish turns on a fresh thread → switches by the third, `reason: 'accumulated'`.
- [ ] The same three on an established Hinglish thread → no disturbance.

### Ratchet (skip if `lang-17` was cut)
- [ ] A Hinglish message the wordlist misses entirely → still resolves Hinglish via `reason: 'classifier'`.
- [ ] A clearly English message → stays English; no classifier-driven flip.
- [ ] Force a classification failure → language decision still lands from markers.

### Telemetry
- [ ] `dm_language_decision_total` present on every turn, including no-change turns.
- [ ] No message text, and no marker identities, in any log line (LANG-D9).
- [ ] `classifierAgreed` populated where `lang-17` shipped.

### Expected-but-not-fixed-here
- [x] Noted in MANUAL_QA §14 + [02-language.md](../../../../../../Reference/product/receptionist-bot/bot-testing/02-language.md): Hinglish still gets English booking mechanics until p5/p6.
- [ ] Confirm safety copy, fee copy, and LLM turns **do** follow the resolved language. *(founder smoke)*

### Close-out
- [x] Program README: LANG4-D4 = yes; p4 eng done; `lang-19` smoke open.
- [x] Corpus green — no failing rows to inbox.
- [x] Language stress pack: [`02-language.md`](../../../../../../Reference/product/receptionist-bot/bot-testing/02-language.md).
- [x] `RECEPTIONIST_BOT_CONVERSATION_RULES.md` was removed earlier — policy restated in MANUAL_QA §2 + `02-language.md` Policy table (`NULL`, accumulation, ratchet).
- [x] `MANUAL_QA_CHECKLIST_DM_BOT.md` §15 #6 — language-miss closed with date + fix pointer.

---

**Created:** 2026-08-02.
