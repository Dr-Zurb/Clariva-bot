# Task lang-22: Booking links, staff review, funnel clarifiers

> **Links:** batch [`../plan-p5-copy-coverage-batch.md`](../plan-p5-copy-coverage-batch.md) · exec [`./EXECUTION-ORDER-p5-copy-coverage.md`](./EXECUTION-ORDER-p5-copy-coverage.md)

---

## 📋 Task Overview

The bulk of the phase: ~18 strings across `booking-link-copy.ts`, `staff-service-review-dm.ts`, and the clarifier literals scattered through `booking-funnel.ts`, `service-match.ts`, and `booking-entry.ts`.

Largest string count, lowest risk per string. Two whole modules — `booking-link-copy.ts` and `staff-service-review-dm.ts` — have **no `language` parameter at all**, so p3's sweep could not have reached them. The booking link in particular is emitted from at least six call sites across three stages, which is why it is a module rather than a literal, and why it was easy to miss.

The clarifier literals are the ones a patient hits between an LLM turn and a confirmation — the most visible seam in the flip-flop.

**Program / Phase:** bot-language-policy · p5 · Wave 3
**Estimated Time:** ~6–8 hours
**Status:** ✅ Done (eng)
**Change Type:** Copy migration (no behaviour change)
**Model:** Sonnet
**Depends on:** `lang-20` (pattern settled). Do **not** run in parallel with `lang-23` — both add builders to the same file and snapshot.

---

## ✅ Task Breakdown

### 1. `booking-link-copy.ts`

- [x] 1.1 Add `language` to every exported function's input, following LANG3-D1 (typed object, not positional).
- [x] 1.2 Families: primary booking link, reschedule link, reschedule choice link, awaiting-slot-selection nudge.
- [x] 1.3 Each family already branches on **queue mode vs slot mode**. Preserve that branch inside each locale arm — do not flatten two modes into one string while adding a locale dimension.
- [x] 1.4 URLs are never localized (LANG3-D6). Assert it.
- [x] 1.5 Update every call site. Expect six or more across `booking-funnel.ts`, `booking-entry.ts`, `cancel-reschedule-status.ts`, and `action-executor-service.ts` — grep, do not enumerate from memory.
- [x] 1.6 `action-executor-service.ts` uses `formatRescheduleChoiceLinkDm` (lang-20 §3.4 landed).

### 2. `staff-service-review-dm.ts`

- [x] 2.1 `formatAwaitingStaffServiceConfirmationDm` and `formatStaffServiceReviewStillPendingDm` take `language`.
- [x] 2.2 `formatStaffReviewResolvedContinueBookingDm` left as-is (already localized).
- [x] 2.3 Practice name is interpolated and never translated (LANG3-D6).
- [x] 2.4 Call sites in stages pass `ctx.turnLanguage` / ready-path `language`.
- [x] 2.5 SLA timeout DM (`service-staff-review-service`) uses `getConversationLanguage` + `formatStaffServiceReviewSlaTimeoutDm` (LANG3-D3).

### 3. Funnel clarifiers — `booking-funnel.ts`

- [x] 3.1 Self-book and relation follow-up nudges — `buildBookForOtherSelfNudgeMessage` / `buildBookForRelationNudgeMessage` (LANG5-D7).
- [x] 3.2 Consent book-for-other retry intro.
- [x] 3.3 Consent persist failure.
- [x] 3.4 Book-for-other intake intro override and confirm-details fallback intro.
- [x] 3.5 Slot selection → book for other.
- [x] 3.6 Patient match confirmation — `phi: true` (LANG5-D3).
- [x] 3.7 `formatReturningFollowUpConfirmMessage` / `buildReturningFollowUpOffer` take language.
- [x] 3.8 Composed intro + intake body verified single-language in tests.

### 4. Funnel clarifiers — `service-match.ts` and `booking-entry.ts`

- [x] 4.1 `service-match.ts`: follow-up unclear, match-confirm + self-book nudge, match-confirm unclear.
- [x] 4.2 Nudges share §3.1 builders (LANG5-D7).
- [x] 4.3 `booking-entry.ts`: teleconsult channel pick, book-for-other dual intro, book-for-them intro.
- [x] 4.4 Returning follow-up confirm single builder.

### 5. Tests

- [x] 5.1 Byte-identical `en` for migrated strings (`dm-copy-lang-22.test.ts`).
- [x] 5.2 Per-locale golden snapshots for new builders.
- [x] 5.3 Booking link: queue mode and slot mode preserved per locale.
- [x] 5.4 URL and practice-name invariance across locales.
- [x] 5.5 Deduplicated nudges render from shared builders.
- [x] 5.6 Composed intro override renders single-language end to end.
- [x] 5.7 Existing `booking-funnel`, `service-match`, and `booking-entry` tests pass.

---

## 📁 Files

```
UPDATE: backend/src/utils/booking-link-copy.ts (add language to 4 families)
UPDATE: backend/src/utils/staff-service-review-dm.ts (2 formatters + SLA timeout)
UPDATE: backend/src/utils/dm-copy.ts (lang-22 clarifier builders)
UPDATE: backend/src/workers/dm/stages/booking-funnel.ts
UPDATE: backend/src/workers/dm/stages/service-match.ts
UPDATE: backend/src/workers/dm/stages/booking-entry.ts
UPDATE: backend/src/workers/dm/booking-entry-ready-path.ts
UPDATE: backend/src/workers/dm/returning-followup-offer.ts
UPDATE: backend/src/services/service-staff-review-service.ts (SLA timeout DM, OOB language)
UPDATE: backend/tests/unit/utils/dm-copy.snap.test.ts
UPDATE: backend/tests/unit/utils/dm-copy-lang-22.test.ts
DO NOT TOUCH: formatStaffReviewResolvedContinueBookingDm (already localized)
DO NOT TOUCH: recording-consent builders (LANG3-D7)
DO NOT TOUCH: booking funnel step transitions, slot logic, or match scoring
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **No English text changes**, including "harmonising" the three near-identical self-book nudges. Pick one wording, state in the PR which call sites changed by how many characters, and keep it to that.
- **No translation.** English in all arms.
- Do not change queue-mode/slot-mode branching (§1.3).
- Do not touch funnel state transitions, slot selection, or service matching.
- Do not run this in parallel with `lang-23`.

---

## ✅ Acceptance Criteria

- [x] `booking-link-copy.ts` and `staff-service-review-dm.ts` both take `language` on every exported function.
- [x] Zero patient-facing English literals left in the three stage files.
- [x] Duplicated nudges collapsed to one builder each.
- [x] `en` byte-identical (no documented nudge harmonisation needed — wording preserved).
- [x] Name-interpolating match-confirmation builders marked `phi: true`.
- [x] Composed messages render single-language.
- [x] Typecheck + lint (touched files) + tests green.

---

**Created:** 2026-08-02.
**Completed:** 2026-08-02.
