# Task lang-07: Delete `detectPatientLanguageHint` + `localizeReply`

> **Links:** batch [`../plan-p2-retire-second-detector-batch.md`](../plan-p2-retire-second-detector-batch.md) · exec [`./EXECUTION-ORDER-p2-retire-second-detector.md`](./EXECUTION-ORDER-p2-retire-second-detector.md)

---

## 📋 Task Overview

Remove the second detector and the LLM template-translation helper it feeds. Both call sites get real locale-table strings instead of a runtime OpenAI translation.

`localizeReply` spends a whole model round-trip translating a template we could simply write in three languages — and it can fail, silently falling back to English mid-conversation, which is itself a source of the flip-flop the user reported.

**Program / Phase:** bot-language-policy · p2 · Wave 2
**Estimated Time:** ~3–4 hours
**Status:** ✅ DONE (2026-08-02)
**Change Type:** Deletion + copy addition
**Model:** Sonnet
**Depends on:** p1 closed (needs `ctx.turnLanguage`)

---

## ✅ Task Breakdown

### 1. Inventory the two strings
- [x] Consent-unclear: `I didn't catch that — please reply **Yes** to consent and continue, or **No** to cancel.`
- [x] Status-empty: `You don't have any upcoming appointments. Say 'book appointment' to schedule one.`
- [x] Neither used `{{placeholders}}` (empty vars map).

### 2. Write real copy
- [x] `resolveConsentUnclearMessage` in `booking-consent-context.ts`
- [x] `resolveNoUpcomingAppointmentsMessage` in `dm-appointment-status.ts`
- [x] hi/pa arms ship **English** intentionally pending human review (capture inbox follow-up).

### 3. Delete
- [x] Call sites use `toStaticLocale` via the resolvers + `ctx.turnLanguage`
- [x] Deleted `backend/src/utils/localize-reply.ts`
- [x] Dead imports removed; no alias/re-export

### 4. Tests
- [x] `tests/unit/utils/lang-07-static-locale-copy.test.ts` — all languages, zero OpenAI calls, bold markers preserved

---

## ✅ Acceptance Criteria

- [x] `localize-reply.ts` no longer exists
- [x] No `localizeReply` / `detectPatientLanguageHint` call sites (comments only)
- [x] Both paths are sync table lookups
- [x] Untranslated arms explicitly English + capture inbox follow-up
- [x] Typecheck + tests green

---

**Created:** 2026-08-02.
**Closed:** 2026-08-02.
