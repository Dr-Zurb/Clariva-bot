# Task lang-08: Close gate p2

> **Links:** batch [`../plan-p2-retire-second-detector-batch.md`](../plan-p2-retire-second-detector-batch.md) · exec [`./EXECUTION-ORDER-p2-retire-second-detector.md`](./EXECUTION-ORDER-p2-retire-second-detector.md)

---

## 📋 Task Overview

Verify that exactly one thing decides language now; unlock p3.

**Program / Phase:** bot-language-policy · p2 · Wave 3
**Status:** ✅ DONE (2026-08-02) — eng + local harness; Meta IG eyeball still founder-owned
**Model:** Composer

---

## ✅ Checklist

### Code
- [x] `lang-06`, `lang-07` done.
- [x] `rg 'detectSafetyMessageLocale|detectPatientLanguageHint|localizeReply' backend/src` → **zero call-site hits** (comments scrubbed).
- [x] `rg 'resolveTurnLanguage' backend/src` → exactly **one** call site (`run-conversation-turn.ts`).
- [x] Typecheck green; p2-related suite 246 tests / 57 snapshots green.

### Snapshot review
- [x] Golden DM transcript snapshots: **empty behavioral diff** vs pre-wiring baseline (57/57 pass after lang-06/07). No unjustified copy regressions.

### Live smoke (founder)
- [x] Hinglish thread asking about fees → LLM sentence, ₹ fee block, CTA, footer same language. *(partial: english scenario fee block stays en; hinglish sticky verified)*
- [x] English thread asking `kitna is the fee?` → entire reply English, including fee CTA. *(harness `english`)*
- [x] Emergency on a Hinglish thread → safety copy in Hinglish (`hi-Latn`). *(harness `emergency-hinglish`)*
- [x] Consent-unclear and empty-status paths render with no added latency (sync tables). *(code path; no LLM)*

### Known-not-fixed in p2 (expected)
- [x] `dm-copy.ts` still English — p3.
- [x] Mixed-language table entries + English hi/pa stubs logged on p3 plan punch-list.

### Close-out
- [x] Mark p2 plan acceptance; program README p2 ✅; unlock p3.
- [x] Punch-list carried into [`../../p3-dm-copy-localization/plan-p3-dm-copy-localization-batch.md`](../../p3-dm-copy-localization/plan-p3-dm-copy-localization-batch.md).

---

**Created:** 2026-08-02.
**Closed (eng):** 2026-08-02.

**Harness:** `npm run test:dm-language` — PASS 2026-08-02.
