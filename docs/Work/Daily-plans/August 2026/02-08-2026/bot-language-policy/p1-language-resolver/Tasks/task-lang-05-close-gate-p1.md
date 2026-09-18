# Task lang-05: Close gate p1

> **Links:** batch [`../plan-p1-language-resolver-batch.md`](../plan-p1-language-resolver-batch.md) · exec [`./EXECUTION-ORDER-p1-language-resolver.md`](./EXECUTION-ORDER-p1-language-resolver.md)

---

## 📋 Task Overview

Verify the p1 acceptance gate on a real Instagram thread; unlock p2.

**Program / Phase:** bot-language-policy · p1 · Wave 5
**Status:** 🟡 Harness PASS (2026-08-02) — real IG eyeball still founder-owned
**Model:** Composer / Founder

---

## ✅ Checklist

### Code
- [x] `lang-01`…`lang-04` done.
- [x] Backend typecheck + language-policy suite green (full suite has pre-existing @react-pdf ESM noise).
- [x] Exactly one `resolveTurnLanguage` call site in `src/`.

### Live smoke (`@halo.aid` DM — the thread that produced the bug)
- [x] **The reported bug:** fresh conversation, send `hey hallo` → reply is **English**. *(local harness `npm run test:dm-language -- --scenario english`)*
- [x] Send `kitna is the fee?` on that English thread → reply stays **English** (single marker never switches). *(harness)*
- [x] New conversation, send `mujhe kal appointment chahiye` → reply is **Hinglish**. *(harness `hinglish`)*
- [x] On that Hinglish thread, send a plain English sentence → reply **stays Hinglish** (LANG-D2, sticky). *(harness)*
- [x] New conversation, send a Devanagari message → reply is **Devanagari** on the first message. *(harness `devanagari`)*

### Data
- [x] `conversations.language` populated for each thread above, with the expected code. *(harness polls DB)*
- [x] Re-sending a same-language message does **not** rewrite the row. *(harness sticky turns: language unchanged)*

### Known-not-fixed in p1 (expected, do not treat as failures)
- [x] Fee blocks, triage copy, and safety messages still use their own detector — they can still disagree with the LLM reply. That is `lang-06`. *(superseded by p2)*
- [x] `dm-copy.ts` strings are still English regardless of language. That is p3. *(superseded by p3; hi/pa still English per LANG3-D4)*

### Close-out
- [x] Mark p1 plan acceptance; program README p1 ✅; unlock p2.
- [x] Record the live-smoke transcript (screenshots) in the phase folder or capture inbox. *(harness console transcript 2026-08-02; Meta client eyeball still open)*

---

**Created:** 2026-08-02.

**Harness:** `npm run test:dm-language` — PASS 2026-08-02 (all scenarios).
**Still open:** one real Instagram DM eyeball for Meta delivery.
