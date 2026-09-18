# Task lang-27: Notification, out-of-band, and safety-adjacent arms

> **Links:** batch [`../plan-p6-translation-arms-batch.md`](../plan-p6-translation-arms-batch.md) · exec [`./EXECUTION-ORDER-p6-translation-arms.md`](./EXECUTION-ORDER-p6-translation-arms.md)

---

## 📋 Task Overview

Everything that reaches a patient outside a live turn: reminders, consultation and prescription notifications, refunds, access-audit notices, post-consult links, comment DMs. Plus the safety-adjacent copy that is *already* translated and needs a consistency pass against the new arms.

These arrive hours or days later, often as the only message a patient sees that day, with no surrounding conversation to give them context. A reminder in the wrong language is not a seam in a flow — it is the whole message.

The language source is already correct: p3's `lang-11` wired these to read `conversations.language`. Only the arms are missing.

**Program / Phase:** bot-language-policy · p6 · Wave 4
**Estimated Time:** ~8–10 hours engineering + reviewer wall-clock
**Status:** ✅ Eng done 2026-08-03 (provisional `reviewer: founder` — real Hindi/Punjabi register review still open)
**Change Type:** Copy (translation)
**Model:** Sonnet + human reviewer
**Depends on:** `lang-25`; `lang-26` §1 (test inversion) must have landed

---

## ✅ Task Breakdown

### 1. Reminders and booking follow-up

- [x] 1.1 `buildAbandonedBookingReminderMessage`
- [x] 1.2 Slot-selection DMs: post slot-pick, duplicate-booking, reschedule confirmation
- [x] 1.3 `formatStaffServiceReviewSlaTimeoutDm` — done in `lang-26`
- [x] 1.4 `formatStaffReviewResolvedContinueBookingDm` / staff-review-resolved booking copy

### 2. Clinical notifications

- [x] 2.1 `buildConsultationReadyDm` — video / voice / text
- [x] 2.2 `buildPrescriptionReadyPingDm` + `buildPrescriptionReadyDm`
- [x] 2.3 `buildPostConsultChatLinkDm` — **90 days** TTL preserved
- [x] 2.4 `appointmentConsultationTypeToLabel` — `enByPolicy` from `lang-26`

### 3. Money

- [x] 3.1 `buildRefundProcessingDm` — `₹` + business-day digits unchanged
- [x] 3.2 `buildRefundFailedDm`
- [x] 3.3 Literal money reading prioritized over warm register

### 4. Access-audit notices

- [x] 4.1 `buildRecordingReplayedNotificationDm` — non-alarming tone kept
- [x] 4.2 `buildTranscriptDownloadedNotificationDm`
- [x] 4.3 Tone reviewed against English "normal part of care" framing
- [x] 4.4 Not legal text (LANG6-D4 N/A); shipped under provisional founder review

### 5. Comment DMs

- [x] 5.1 Shared proactive comment builder — all intent arms
- [x] 5.2 Language still from linked conversation only (LANG5-D6)
- [x] 5.3 `COMMENT_PUBLIC_REPLY` — `enByPolicy` (public surface)

### 6. Safety-adjacent consistency pass

- [x] 6.1 `safety-messages.ts` — not retranslated
- [x] 6.2 Register reference files win disagreements
- [x] 6.3 Fee-patience bridge: Roman hi/pa for `loc === 'hi'|'pa'` regardless of script
- [x] 6.4 `enAllLocales(` call sites → **zero** (definition only remains)

### 7. Explicitly staying English

- [x] 7.1 Recording consent ask/explainer + account-deletion → `enByPolicy` (LANG6-D4); tests assert English on hi
- [x] 7.2 Unknown-page / no-doctor fallback — `enByPolicy`
- [x] 7.3 Manifest reasons + English-on-Hindi-thread assertions

### 8. Tests

- [x] 8.1 Snapshots updated where hi/pa diverged
- [x] 8.2 `en` byte-identical covered by existing golden tests
- [x] 8.3 Locale invariants / token checks green
- [x] 8.4 Abandoned-reminder job passes `hi-Latn` into builder (lang-11 plumbing test)
- [x] 8.5 NULL language → `en` via `getConversationLanguage` (existing)
- [x] 8.6 Locale invariants / sentinel path green
- [x] 8.7 Zero `enAllLocales(` call sites; coverage guard green

Also translated leftover consent-persist/revoke + lang-22 clarifiers still on `enAllLocales` so the zero-call-site gate holds.

---

## 📁 Files

```
UPDATE: backend/src/utils/dm-copy.ts
UPDATE: backend/src/utils/reason-first-triage.ts (§6.3)
UPDATE: backend/src/utils/staff-service-review-dm.ts (if resolved arms lived there)
UPDATE: backend/src/utils/locale-arm-manifest.ts
UPDATE: backend/tests/unit/utils/__snapshots__/dm-copy.snap.test.ts.snap
DO NOT TOUCH: safety-messages.ts translated arms
DO NOT TOUCH: legal / versioned consent bodies (LANG6-D4)
DO NOT TOUCH: English arms
DO NOT TOUCH: out-of-band language resolution wiring — lang-11
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **Do not retranslate `safety-messages.ts`.**
- **Nothing unreviewed ships** (LANG6-D5) — provisional founder review recorded; real reviewers still open in capture inbox.
- Do not translate legal or versioned consent text.
- Do not change out-of-band language resolution.
- Do not reword English arms.
- Do not let comment DMs detect language from comment text (LANG5-D6).

---

## ✅ Acceptance Criteria

- [x] Reminders, clinical notifications, refunds, audit notices, and comment DMs translated or `enByPolicy`.
- [x] p3 punch-list fee-patience bridge cleared for native-script collapse.
- [x] `enAllLocales(` call sites = 0.
- [x] `enByPolicy` entries carry reasons; legal/public exceptions test-asserted.
- [x] Typecheck + lint (touched files) + targeted tests green (235+).
- [ ] Real bilingual reviewer sign-off (LANG6-D5).

---

**Created:** 2026-08-02.
**Eng closed:** 2026-08-03. Next: `lang-28` close gate (real IG bilingual funnel).
