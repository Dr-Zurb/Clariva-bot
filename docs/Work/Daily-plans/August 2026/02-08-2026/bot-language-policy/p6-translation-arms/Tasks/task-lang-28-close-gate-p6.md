# Task lang-28: Close gate p6 — and close the program

> **Links:** batch [`../plan-p6-translation-arms-batch.md`](../plan-p6-translation-arms-batch.md) · exec [`./EXECUTION-ORDER-p6-translation-arms.md`](./EXECUTION-ORDER-p6-translation-arms.md)

---

## 📋 Task Overview

The gate p3 wrote and could not keep: **complete a booking entirely in Hinglish and never see English.**

Also the program gate. Six phases from one screenshot of `hey hallo` answered in Hinglish, through a resolver, a stored column, a directive, a copy layer, an accuracy fix, a coverage sweep, and a translation set. This closes `bot-language-policy`.

**Program / Phase:** bot-language-policy · p6 · Wave 5
**Status:** 🟡 Eng/docs gates largely done 2026-08-03 — **founder Meta-client smokes still open**
**Model:** Composer / Founder

---

## ✅ Checklist

### Code
- [x] `lang-25`…`lang-27` eng done (2026-08-03). Real LANG6-D5 reviewers still open.
- [x] Transitional all-English helper **removed** from `dm-copy.ts` (lang-28). Sweep asserts symbol absent.
- [x] Coverage guard green: every enrolled family translated or `enByPolicy` with a reason.
- [x] Every `enByPolicy` family has English-on-hi assertion (`dm-copy-en-by-policy.test.ts`).
- [x] `en` arms covered by lang-20…23 byte-identical tests (no separate archived baseline found).
- [x] Targeted copy suites + tsc + eslint (touched) green. Full monorepo suite not re-run end-to-end.
- [x] `npm run test:dm-language` → **PASS 4/4** (2026-08-03).
- [ ] `npm run test:dm-conversation` → 14/15 (2026-08-03); sole fail is known `safety-emergency-en` / §1.6 (capture inbox) — **not a language miss**. Re-run with `TEST_DM_LOG` for branch asserts.

### The Hinglish booking — the gate
On a fresh Instagram thread, entirely in Hinglish — see [02-language §I](../../../../../../Reference/product/receptionist-bot/bot-testing/02-language.md):
- [ ] `mujhe kal appointment chahiye` → Hinglish greeting.
- [ ] Intake ask → Hinglish.
- [ ] Confirm details → Hinglish, PHI unchanged.
- [ ] Consent prompt → Hinglish.
- [ ] Slot link → Hinglish copy, **URL untouched**.
- [ ] Payment confirmation → Hinglish, ₹ / date / MRN unchanged.
- [ ] **Not one English message in the whole flow.**

### The English booking — unchanged
- [ ] `hey hallo` → English greeting. **Harness: english baseline PASS.**
- [ ] Complete the same booking in English. Every message byte-identical to pre-p6.
- [ ] `conversations.language` stays `NULL` throughout (LANG4-D1). **Harness: PASS on greeting.**

### Sparse Hinglish — the p4 reproduction
- [ ] `papa behosh padhe hain floor pe` → 112 escalation **in Roman Hindi**. **Harness: emergency-hinglish PASS.**
- [ ] `kuch batao` → reaffirm in Roman Hindi.
- [ ] Then `theek hai, appointment chahiye` → booking resumes **in Hinglish**.

### Punjabi
- [ ] `menu tin din to dard hai` → Punjabi, not Hindi.
- [ ] Complete a booking in Punjabi, or confirm `pa` arms stay under provisional founder review until a Punjabi register reviewer signs (LANG6-D5 / LANG6-D8).

### Out-of-band
- [ ] Abandon a Hinglish booking → reminder arrives in Hinglish.
- [ ] Prescription-ready or consultation-ready on a Hinglish thread → Hinglish.
- [ ] Refund DM on a Hinglish thread → Hinglish, ₹ unchanged.
- [ ] Account-deletion explainer → **English** (LANG6-D4). **Unit: PASS.**
- [ ] Recording-consent ask → **English** (LANG6-D4). **Unit: PASS.**

### Invariants
- [ ] No reply mixes two languages within itself (composed: link+nudge, intake+intro, welcome-back+LLM).
- [x] ₹ / dates / MRNs / URLs / practice names — locale invariant suite.
- [x] Doctor custom pause message untranslated (LANG5-D4) — lang-21 test.
- [x] Comment DM language from linked conversation only (LANG5-D6) — lang-23 test.

### PHI
- [x] Strategy B — no PHI to translation services (structural).
- [x] PHI registry present (`DM_COPY_PHI_REGISTRY`).

### Program close-out
- [x] Program README: p6 eng status updated; LANG3-D4 noted discharged.
- [x] LANG6-D2 recorded (B); LANG4-D4 recorded (yes).
- [x] LANG3-D4 marked discharged in p3 plan.
- [x] [`LANGUAGE_POLICY.md`](../../../../../../Reference/product/receptionist-bot/LANGUAGE_POLICY.md) replaces deleted conversation-rules language section.
- [x] `02-language.md` §I p6 funnel expectations.
- [x] `MANUAL_QA_CHECKLIST_DM_BOT.md` language deferrals updated post-p6.
- [x] `OBSERVABILITY.md` — `dm_language_decision_total` already documented.
- [x] Capture inbox: reviewers + lang-28 founder smokes + deferred LANG-D7/D8/LANG6-D4.

### Deferred, stated plainly
- [x] LANG-D7 — other scripts render English (documented).
- [x] LANG-D8 — per-doctor default out of scope (documented).
- [x] LANG6-D4 — legal consent English pending counsel (documented + `enByPolicy`).

---

**Created:** 2026-08-02.
**Eng/docs checkpoint:** 2026-08-03. Program closes when founder Meta-client rows above are ticked.
