# Task 04: Split consent / optional-notes / CTA into three paragraphs
## 18 April 2026 — Plan "Patient DM copy polish", P1

---

## Task Overview

`backend/src/workers/instagram-dm-webhook-handler.ts` lines 1783–1785 stuff **three distinct asks** into one paragraph:

```
Thanks, {name}. We'll use {phoneDisplay} to confirm your appointment by call or text. Got it! Any special notes for the doctor — like allergies, medications, or preferences? (optional) Or just say Yes to continue.
```

Problems (from 2026-04-17 audit):
1. Mixes a consent question ("Do I have your consent / Yes to continue?") + an open-ended optional question ("Any special notes?") + a CTA into one bubble. Patients don't know which to answer.
2. "Got it!" mid-sentence, next to a follow-up question, reads jarring.
3. The someone-else-booking branch one line above has the same shape but without the "notes" ask — worth keeping parallel structure.

Fix: render as three short paragraphs — **acknowledge**, **optional question**, **CTA** — separated by blank lines.

**Target shape (self-booking):**

```
Thanks, **Abhishek**.
We'll use **8264602737** to confirm your appointment by call or text.

Any notes for the doctor? _(allergies, current medicines, anything else — optional)_

Reply **Yes** when you're ready to pick a time.
```

**Target shape (booking for someone else):**

```
Thanks.
We'll use **8264602737** to confirm the appointment for **{name}**.

Do I have your consent to use these details to schedule?

Reply **Yes** to continue.
```

**Estimated Time:** 1–1.5 hours  
**Status:** Done (2026-04-18)  
**Depends on:** [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md)  
**Plan:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)

### Implementation Plan (high level)

1. Add `buildConsentOptionalExtrasMessage(input)` to `dm-copy.ts`:
   ```ts
   export interface ConsentMessageInput {
     patientName?: string;          // undefined for booking-for-someone-else branch
     phoneDisplay: string;
     bookingForSomeoneElse: boolean;
     bookingForName?: string;       // required when bookingForSomeoneElse
   }
   ```
2. Output: three paragraphs (three chunks separated by `\n\n`) matching the target shape.
3. Replace the two inline strings in `instagram-dm-webhook-handler.ts` (the ternary at lines 1783–1785) with a single call.
4. Preserve the existing `lastPromptKind: 'consent_optional_extras'` signal for the self-booking branch — the classifier uses it.
5. Snapshot both branches.

**Scope trade-offs:**
- The optional "notes" question for the self-booking branch stays open-ended. Don't try to structure it (allergies vs. medications vs. preferences) — the free-text response continues to be handled by existing downstream logic that attaches the note to `preConsultationNotes`.
- Don't change the "Yes" detection logic. The CTA word stays `Yes`.
- Don't localize. English only for now.
- Don't add an emoji here. Consent is a soft-legal moment; emojis undermine it.

### Change Type

- [x] **Create new** — `buildConsentOptionalExtrasMessage` in `dm-copy.ts`
- [x] **Update existing** — 1 ternary in `instagram-dm-webhook-handler.ts` (lines 1783–1785)

### Current State (pre-refactor, for context)

- **Two** ternaries carried the same copy — lines 1785–1786 and 3070–3071 in `backend/src/workers/instagram-dm-webhook-handler.ts`. Both swapped to the helper.
- `lastPromptKind: 'consent_optional_extras'` state signal is set for the self-booking branch only — preserved across this refactor.
- Upstream detector (`isOptionalExtrasConsentPrompt` in `backend/src/utils/booking-consent-context.ts`) also needed a new clause for the new copy pattern, with the previous "special notes" rule kept as a backward-compat fallback for conversations already mid-flight when the rollout ships.

### Scope Guard

- Expected files touched: 2 + tests.
- Do NOT change which branches are entered (no handler-logic edits).

### Reference Documentation

- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)
- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md)

---

## Task Breakdown

### 1. Helper

- [x] 1.1 Implemented. First paragraph is a 2-liner (Thanks greeting on line 1; "We'll use X to confirm…" on line 2). Empty/`'there'` sentinel `patientName` renders plain `"Thanks."` in the self branch instead of the old `"Thanks, there."` — a minor side-cleanup confirmed via snapshot `consent / self / "there" sentinel treated as missing name`.
- [x] 1.2 Second paragraph depends on branch:
  - Self: `Any notes for the doctor? _(allergies, current medicines, anything else — optional)_`
  - Other: `Do I have your consent to use these details to schedule?`
- [x] 1.3 Third paragraph (CTA):
  - Self: `Reply **Yes** when you're ready to pick a time.`
  - Other: `Reply **Yes** to continue.`
- [x] 1.4 Guard rails: throws when `bookingForSomeoneElse === true && !bookingForName?.trim()`. At the two call sites we defensively pass `collected?.name?.trim() ?? name` (where `name` still carries the legacy `'there'` fallback) — the throw therefore only fires if both resolve empty, which is truly unreachable; callers that bypass that legacy fallback still get the guard rail.

### 2. Wire

- [x] 2.1 Replaced **both** ternaries (lines 1785–1786 and 3070–3071) with the helper call. Pattern used at both sites:
  ```ts
  const resolvedName = collected?.name?.trim() || undefined;
  replyText = buildConsentOptionalExtrasMessage({
    patientName: state.bookingForSomeoneElse ? undefined : resolvedName,
    phoneDisplay,
    bookingForSomeoneElse: !!state.bookingForSomeoneElse,
    bookingForName: state.bookingForSomeoneElse ? (resolvedName ?? name) : undefined,
  });
  ```
  The `?? name` fallback keeps today's behavior intact for the pathological "name captured but blank" case (renders literal "for **there**") rather than crashing the handler.
- [x] 2.2 `lastPromptKind` logic untouched — both sites still set `'consent_optional_extras'` only on the self branch.
- [x] 2.3 Upstream detector updated: `isOptionalExtrasConsentPrompt` in `backend/src/utils/booking-consent-context.ts` now primarily matches the new copy (`'notes for the doctor' && ('optional' || 'ready to pick a time')`) with the previous "special notes" and "anything else" rules kept as backward-compat fallbacks.
- [x] 2.4 Related prompt-rule in `backend/src/services/ai-service.ts:1377` refreshed so the LLM's consent-classifier rule references the new copy phrasing.

### 3. Tests

- [x] 3.1 Snapshots (6 cases shipped, up from the originally-scoped 3):
  - consent / self / happy path (name + bolded phone)
  - consent / self / missing patientName → plain "Thanks."
  - consent / self / "there" sentinel treated as missing name (bonus clarity on the legacy fallback)
  - consent / self / missing phone falls back to "your number"
  - consent / someone-else / happy path
  - consent / someone-else / phone fallback + multi-word bookingForName
- [x] 3.2 Unit-invariant tests for the builder:
  - throws on `bookingForSomeoneElse && !bookingForName`
  - throws on `bookingForSomeoneElse && bookingForName: '   '` (whitespace-only)
  - rendered message always ends with `Reply **Yes** …` on its own line (self + other)
  - rendered message is always exactly three paragraphs (two `\n\n` separators)
- [x] 3.3 Detector regression test added to `backend/tests/unit/utils/booking-consent-context.test.ts` — `isOptionalExtrasConsentPrompt` must return `true` for the new multi-paragraph copy (new test) AND the previous "special notes" single-line copy (existing test, kept for in-flight conversations). Webhook characterization test at `webhook-worker-characterization.test.ts:462` uses the regex `/special notes|allergies|Anything else|extras/i` — still matches the new copy (contains both "allergies" and "Anything else"), so no change needed there.

### 4. Verification

- [x] 4.1 `tsc --noEmit` clean.
- [x] 4.2 Full unit suite green — 869/869 tests across 80 suites (was 858 before Task 04; +11 = +6 snapshot, +4 consent invariants, +1 new detector regression test).
- [x] 4.3 ESLint clean on all six touched files.
- [ ] 4.4 Manual DM smoke deferred until staging rollout (requires live Instagram webhook).

---

## Files to Create/Update

```
backend/src/utils/dm-copy.ts                                   — UPDATED (add buildConsentOptionalExtrasMessage)
backend/src/workers/instagram-dm-webhook-handler.ts            — UPDATED (replace ternary at 1783–1785)
backend/tests/unit/utils/dm-copy.snap.test.ts                  — UPDATED (3 snapshots + 1 unit test)
backend/tests/unit/utils/__snapshots__/dm-copy.snap.test.ts.snap — UPDATED
```

---

## Design Constraints

- **Exactly three paragraphs.** Two `\n\n` separators, nothing more nothing less.
- **Bold values** (`**Abhishek**`, `**8264602737**`, `**{name}**`, `**Yes**`) — the rest stays plain.
- **No emoji.**
- **"Reply Yes" is always the final line** and always bolds `Yes`.
- **Someone-else branch stays shorter** — we don't ask "any notes" because we haven't asked that question for someone-else bookings today; adding it here would be new behavior, not copy polish.

---

## Global Safety Gate

- [x] **Data touched?** Read-only. Helper reads the already-captured `name`, `phone`, and `state.bookingForSomeoneElse`.
- [x] **Any PHI in logs?** No new logging.
- [x] **External API or AI call?** No. The `ai-service.ts` prompt-rule refresh at line 1377 changes only the quoted example inside an existing system prompt — does not add a new call or alter an existing call's parameters structurally.
- [x] **Retention / deletion impact?** None.

---

## Acceptance & Verification Criteria

- [x] `buildConsentOptionalExtrasMessage` exists in `dm-copy.ts` and handles both branches (self + someone-else), with helper-level throws on missing `bookingForName` and graceful handling of missing/`'there'` `patientName` on the self branch.
- [x] Both ternaries (lines 1785–1786 **and** 3070–3071) are gone — helper is the sole renderer.
- [x] 6 snapshot cases + 4 unit-invariant tests + 1 new detector-regression test committed.
- [x] `tsc --noEmit` clean; full suite green (869/869).
- [ ] Manual DM smoke in staging — deferred to rollout.

---

## Related Tasks

- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md) — prerequisite.
- [Task 03](./task-03-intake-request-helper.md) — sibling flow; the intake helper feeds the consent step.

---

**Last Updated:** 2026-04-18  
**Pattern:** Split stacked questions into one-per-paragraph  
**Reference:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)
