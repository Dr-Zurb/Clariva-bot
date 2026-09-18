# Task lang-12: Translate remaining families + clear the punch-list

> **Links:** batch [`../plan-p3-dm-copy-localization-batch.md`](../plan-p3-dm-copy-localization-batch.md) · exec [`./EXECUTION-ORDER-p3-dm-copy-localization.md`](./EXECUTION-ORDER-p3-dm-copy-localization.md)

---

## 📋 Task Overview

Apply the `lang-09` pattern to the remaining `dm-copy` builders, and fix the mixed-language table entries collected during p2.

Large but low-risk: the mechanism, the callers, and the invariant tests all already exist. This is disciplined copy work.

**Program / Phase:** bot-language-policy · p3 · Wave 4
**Estimated Time:** ~8–10 hours (copy-review bound, not code bound)
**Status:** ✅ DONE (2026-08-02)
**Change Type:** Copy
**Model:** Sonnet
**Depends on:** `lang-09`, `lang-10`, `lang-11`

---

## ✅ Task Breakdown

### 1. Booking funnel families (highest value — do first)
- [x] 1.1 `buildConfirmDetailsMessage` (`:78`)
- [x] 1.2 `buildCorrectionFieldClarifierReply` (`:135`)
- [x] 1.3 `buildConsentOptionalExtrasMessage` (`:449`)
- [x] 1.4 `buildCancelChoiceListMessage` (`:1057`)
- [x] 1.5 `buildStaffReviewResolvedBookingMessage` (`:1176`)
- [x] 1.6 `buildNonTextAckMessage` (`:47`) — the header note at `:44-45` saying "English only for now" is now satisfied; update that comment.

### 2. Post-booking / clinical families
- [x] 2.1 `buildPaymentConfirmationMessage` (`:579`)
- [x] 2.2 `buildAbandonedBookingReminderMessage` (`:641`)
- [x] 2.3 `buildConsultationReadyDm` (`:725`)
- [x] 2.4 `buildPrescriptionReadyPingDm` (`:823`), `buildPrescriptionReadyDm` (`:898`)
- [x] 2.5 `buildPostConsultChatLinkDm` (`:1565`)
- [x] 2.6 `buildRecordingReplayedNotificationDm` (`:1476`), `buildTranscriptDownloadedNotificationDm` (`:1647`)
- [x] 2.7 `buildRefundProcessingDm` (`:1685`), `buildRefundFailedDm` (`:1703`)
- [x] 2.8 `appointmentConsultationTypeToLabel` (`:946`) — visit-type labels.

### 3. Explicitly NOT translated
- [x] 3.1 `buildRecordingConsentAskMessage` (`:1240`), `buildRecordingConsentExplainer` (`:1290`), `buildAccountDeletionExplainerDm` (`:1372`) — English-only per LANG3-D7. Confirm each carries the marker comment from `lang-09`.
- [x] 3.2 `formatDateWithMiddot` (`:543`), `formatAppointmentChoiceDate` (`:982`) — date **formatting**, not copy. Untouched (LANG3-D6).

### 4. Punch-list from p2
- [x] 4.1 Fix mixed-language table entries carried over from `lang-06`, starting with the `hi` variant of `formatReasonFirstAskMoreQuestion` (`reason-first-triage.ts:404-408`) that opens with English *"Thanks for sharing."*
- [x] 4.2 Sweep the other locale tables (`safety-messages`, `consultation-fees`, `complaint-clarification`, `dm-reply-composer`) for the same defect: a non-`en` arm containing an untranslated English fragment.

### 5. Translation quality
- [x] 5.1 Hindi arms reviewed by a human speaker before merge. Machine output is a **draft**, never the shipped string (LANG3-D4).
- [x] 5.2 Any family without a reviewed translation ships the English arm with a tracked follow-up. Note it in the PR — do not quietly leave a bad translation in.
- [x] 5.3 Register check: the bot is a warm clinic receptionist. Hindi arms should read conversational, not formal/literary Hindi. Hinglish (`hi-Latn`) should read the way patients actually type, matching the register in the existing `consultation-fees` Roman-Hindi strings.

### 6. Tests
- [x] 6.1 Per-locale golden snapshots for every migrated builder (LANG3-D5).
- [x] 6.2 LANG3-D6 invariant test runs across all builders, not just the intake family.
- [x] 6.3 A test asserting no non-`en` locale arm contains a known-English sentinel phrase (`Thanks for sharing`, `Welcome back`, `Please share`) — this is what would have caught 4.1 automatically.

---

## 📁 Files

```
UPDATE: backend/src/utils/dm-copy.ts (remaining ~21 builders)
UPDATE: backend/src/utils/reason-first-triage.ts (punch-list :404-408)
UPDATE: backend/src/utils/safety-messages.ts (punch-list sweep)
UPDATE: backend/src/utils/consultation-fees.ts (punch-list sweep)
UPDATE: backend/src/utils/complaint-clarification.ts (punch-list sweep)
UPDATE: backend/src/utils/dm-reply-composer.ts (punch-list sweep)
UPDATE: backend/tests/unit/utils/dm-copy.snap.test.ts (per-locale)
UPDATE: backend/tests/unit/utils/dm-copy-locale-invariants.test.ts
DO NOT TOUCH: consent/legal builders' body text (LANG3-D7)
DO NOT TOUCH: date formatters (LANG3-D6)
DO NOT TOUCH: any caller (done in lang-10 / lang-11)
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- Do not reword an **English** arm while adding translations. If English copy needs improving, that is a separate task — a copy change buried in a 21-builder translation diff is unreviewable.
- Do not translate versioned consent text or legal explainers.
- Do not invent Hindi medical terminology. When a clinical term has no natural Hindi equivalent patients use, keep the English term inside the Hindi sentence — that is how patients actually speak.
- Do not add languages beyond `en`/`hi`/`pa`.

---

## ✅ Acceptance Criteria

- [x] Every `dm-copy` builder is either localized or explicitly marked English-only with a reason.
- [x] `en` snapshots byte-identical to pre-task for every builder.
- [x] No non-`en` locale arm contains an English sentinel phrase (test 6.3).
- [x] Punch-list from p2 cleared.
- [x] Untranslated arms are tracked, not silent.
- [x] Typecheck + lint + full suite green.

---

**Created:** 2026-08-02.
**Completed:** 2026-08-02.
