# Task lang-13: Close gate p3

> **Links:** batch [`../plan-p3-dm-copy-localization-batch.md`](../plan-p3-dm-copy-localization-batch.md) · exec [`./EXECUTION-ORDER-p3-dm-copy-localization.md`](./EXECUTION-ORDER-p3-dm-copy-localization.md)

---

## 📋 Task Overview

Verify the whole program end to end: one language decision, obeyed by every surface, in-turn and out-of-band. Close `bot-language-policy`.

**Program / Phase:** bot-language-policy · p3 · Wave 5
**Status:** 🟡 Eng + local harness PASS (2026-08-02) — Meta IG eyeball still open
**Model:** Composer / Founder

---

## ✅ Checklist

### Code
- [x] `lang-09`…`lang-12` done.
- [x] Every `dm-copy` builder is localized or explicitly English-only with a stated reason.
- [x] Typecheck green. Language-policy suite green (300 tests). Full backend suite still has pre-existing `@react-pdf/renderer` ESM failures (unrelated).
- [x] `detectSafetyMessageLocale|detectPatientLanguageHint|localizeReply` → zero matches under `backend/`.

### Full-funnel live smoke — English
- [x] `hey hallo` → English greeting. **The original reported bug, still fixed after three phases.** *(harness)*
- [ ] Complete a booking: intake ask → confirm details → consent → slot link → payment confirmation. Every message English.
- [x] Ask `kitna is the fee?` mid-funnel → reply stays English, including the fee block and CTA. *(harness english)*

### Full-funnel live smoke — Hinglish
- [x] Open with `mujhe kal appointment chahiye` → Hinglish greeting (**LLM** arm — sticky language + directive). *(harness hinglish)*
- [ ] Complete the same booking end to end. **Note (LANG3-D4):** `dm-copy` hi/pa arms still ship **English** until human review (capture inbox). Expect LLM turns in Hinglish + booking mechanics in English until translations land. Gate is **partial** for this row.
- [x] Send a plain English sentence mid-funnel → thread **stays** Hinglish (LANG-D2) for LLM replies / stored language. *(harness)*
- [ ] Send a non-text message (image) → ack language follows stored thread language (currently English copy for all locales until hi/pa translated).

### Out-of-band
- [ ] Abandon a Hinglish booking → reminder uses stored language (English body until hi/pa translated).
- [ ] Trigger a prescription-ready or consultation-ready notification on a Hinglish thread → same.
- [ ] Account-deletion explainer arrives in **English** even on a Hinglish thread (LANG3-D7, expected).

### Invariants
- [x] ₹ amounts, dates, MRNs, URLs, doctor and practice names identical across languages (unit invariants + refund test).
- [x] No reply mixes two languages within itself — harness replies clean; askMore mixed opener cleared in lang-12.

### Close-out
- [x] Mark p3 plan acceptance (eng); program README p3 eng ✅ / smoke open.
- [x] Program README status updated (eng complete; founder smoke open).
- [x] Untranslated arms + follow-ups in `docs/Work/capture/inbox.md`.
- [x] Updated [`RECEPTIONIST_BOT_CONVERSATION_RULES.md`](../../../../../../../Reference/product/receptionist-bot/RECEPTIONIST_BOT_CONVERSATION_RULES.md) language section — sticky policy + locale-aware `dm-copy`.
- [x] Deferred items noted: per-doctor default language (LANG-D8); non-en/hi/pa scripts render English (LANG-D7); human hi/pa `dm-copy` (LANG3-D4).

---

**Created:** 2026-08-02.
**Eng closed:** 2026-08-02.
**Founder smoke:** still open (also covers leftover `lang-05` / `lang-08` IG checks).

**Harness:** `npm run test:dm-language` — PASS 2026-08-02 (4/4).
**Still open:** full booking funnel on real IG; human hi/pa dm-copy (LANG3-D4).
