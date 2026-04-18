# Task 02: `buildConfirmDetailsMessage` multi-line layout
## 18 April 2026 — Plan "Patient DM copy polish", P0

---

## Task Overview

The current `buildConfirmDetailsMessage` (`backend/src/services/collection-service.ts` lines 283–297) renders the patient's captured details as a **single comma-chained sentence**:

```
Let me confirm: **Abhishek**, **35**, **male**, **8264602737**, reason: headache, Email: not provided. Is this correct? Reply Yes to see available slots, or tell me what to change.
```

Problems (from 2026-04-17 audit):
1. Values are bold but labels aren't — the eye can't find "phone" vs "age" quickly.
2. `reason:` and `Email:` are lowercase inline labels; all other fields have no labels at all.
3. The CTA ("Reply Yes …") is in the same paragraph as the read-back, so patients answer the whole sentence.
4. Long reason text makes the comma list nearly unreadable.

Fix: render as a labeled multi-line block, isolate the CTA on its own line after a blank line.

**Target shape (from audit):**

```
Here's what I have so far:

**Name:** Abhishek
**Age:** 35
**Gender:** Male
**Mobile:** 8264602737
**Reason:** headache
**Email:** not provided

Is everything correct? Reply **Yes** to see available slots, or tell me what to change.
```

**Estimated Time:** 1.5–2 hours (mostly tests)  
**Status:** Done (2026-04-18)  
**Depends on:** [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md) ✅  
**Plan:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)

### Implementation Plan (high level)

1. Move `buildConfirmDetailsMessage` from `backend/src/services/collection-service.ts` into `backend/src/utils/dm-copy.ts` (per Task 01 pattern). Keep a re-export in `collection-service.ts` so existing imports (webhook handler, tests) don't churn.
2. Rewrite the body to produce the target shape above. Missing values: `Not provided` (Title Case, consistent with current `not provided` but capitalized as a proper value since it's now in a label column). Age formatting unchanged.
3. Bold **labels** (`**Name:**`), keep values unbolded — this inverts today's emphasis so the patient's eye lands on the field name first. Rationale: patients scanning for "is my phone right?" look for "Mobile", not for their own number.
4. Gender: normalize to Title Case (`Male` / `Female` / `Other`) so it reads as a value not a system enum.
5. Isolate CTA on its own paragraph: `\n\n` before the final line; bold the `**Yes**`.
6. Add a golden-snapshot covering at least 4 cases: all-fields-present, all-fields-present-with-long-reason, missing-email, missing-reason-and-email.

**Scope trade-offs:**
- No locale variants — English only (the message today is English only). Task captures `docs/capture/inbox.md` if we ever need a Hindi/Punjabi confirm-details variant.
- No emoji. Deliberate: confirm-details is a semi-formal read-back; emojis risk undermining the "double-check me" intent.
- No new fields displayed (e.g. address, DOB). Out of scope.

### Change Type

- [x] **Update existing** — `collection-service.ts` confirm-details builder
- [x] **Create new** — snapshot entries in `dm-copy.snap.test.ts`

### Current State

- `backend/src/services/collection-service.ts` — `buildConfirmDetailsMessage` defined at lines 283–297 (single-line comma format).
- Callers: `backend/src/workers/instagram-dm-webhook-handler.ts` (2 sites at ~line 2902 and ~line 3065 per audit); also referenced from tests.
- Existing tests: `backend/tests/unit/services/collection-service.test.ts` — may assert on the current string shape; update or replace with a snapshot reference.

### Scope Guard

- Expected files touched: 3 (`dm-copy.ts` addition, `collection-service.ts` re-export, snapshot test + any brittle assertions).
- Do NOT change which fields are asked for. Do NOT change the order fields are collected. Layout only.

### Reference Documentation

- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)
- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md) — required harness

---

## Task Breakdown

### 1. Relocate + rewrite builder

- [x] 1.1 Added `buildConfirmDetailsMessage(collected: CollectedPatientData): string` to `backend/src/utils/dm-copy.ts` with a local `titleCaseWord` helper (no shared util — keeps `dm-copy.ts` free of transitive deps).
- [x] 1.2 In `collection-service.ts`, replaced the inline definition with `export { buildConfirmDetailsMessage } from '../utils/dm-copy';`. All existing imports (webhook handler + `webhook-worker-characterization.test.ts` jest mock) resolve unchanged.
- [x] 1.3 `rg "buildConfirmDetailsMessage"` — callers: `instagram-dm-webhook-handler.ts:82, 2903, 3066` (unchanged) and the jest mock at `webhook-worker-characterization.test.ts:160` (still resolves via the re-export).

### 2. Tests

- [x] 2.1 Added 7 snapshot cases to `dm-copy.snap.test.ts`:
  - `confirm-details / all fields`
  - `confirm-details / long reason stays on one line`
  - `confirm-details / missing email`
  - `confirm-details / missing reason and email`
  - `confirm-details / gender mixed case normalizes to Title Case` (input `'MALE'` → `Male`)
  - `confirm-details / female gender (lowercase input)` (input `'female'` → `Female`)
  - `confirm-details / whitespace-only reason becomes Not provided` (guard on `.trim().length > 0`)
- [x] 2.2 Ran `jest -u`, reviewed each `.snap` entry against the target shape — all 7 match verbatim (labels bold, values plain, reason/email always present, CTA isolated by a blank line with `**Yes**` bold). Snap committed.
- [x] 2.3 `collection-service.test.ts` does not assert the old `Let me confirm: …` format. The only other reference is a `jest.mock(…, { buildConfirmDetailsMessage: jest.fn() })` in `webhook-worker-characterization.test.ts` — mock survives the re-export unchanged. No brittle assertions to update.

### 3. Verification

- [x] 3.1 `npx tsc --noEmit` clean in `backend/`.
- [x] 3.2 `npx jest tests/unit/services/collection-service.test.ts` passes (characterization tests untouched).
- [x] 3.3 `npx jest tests/unit/utils/dm-copy.snap.test.ts` — 8 tests / 8 snapshots pass.
- [x] 3.4 Full unit suite: **80 suites / 844 tests / 8 snapshots** pass. Before Task 02: 837 tests / 1 snapshot. Delta: +7 tests (= +7 new snapshot cases). Webhook handler flows that call `buildConfirmDetailsMessage` all green.
- [ ] 3.5 Manual DM preview in staging still pending — not blocking since the snapshot + flow tests cover the string shape; owner should visual-check once staging has a bot deploy.

---

## Files to Create/Update

```
backend/src/utils/dm-copy.ts                                   — UPDATED (add buildConfirmDetailsMessage)
backend/src/services/collection-service.ts                     — UPDATED (replace body with re-export)
backend/tests/unit/utils/dm-copy.snap.test.ts                  — UPDATED (4–5 new snapshot cases)
backend/tests/unit/utils/__snapshots__/dm-copy.snap.test.ts.snap — UPDATED (auto-generated)
backend/tests/unit/services/collection-service.test.ts         — UPDATED (remove brittle string assertions if present)
```

---

## Design Constraints

- **Label-first emphasis.** Bold the label, not the value. Single exception: the CTA word `**Yes**`.
- **Missing fields read as "Not provided"** (Title Case) in the value column. Never omit the line entirely — the patient needs to see that the field is still unset so they can offer it.
- **Reason and Email always appear**, even when missing, because they're optional by design today and the patient should always have the chance to fill them in. Other fields (Name/Age/Gender/Mobile) are only rendered if captured (unreachable state otherwise — confirm_details only fires when required fields are present).
- **No trailing whitespace in lines**; join with `\n`.
- **CTA always last line**, preceded by a blank line.

---

## Global Safety Gate

- [x] **Data touched?** Read-only — renders already-captured data back to the same patient.
- [x] **Any PHI in logs?** No new logging.
- [x] **External API or AI call?** No.
- [x] **Retention / deletion impact?** None.

---

## Acceptance & Verification Criteria

- [x] `buildConfirmDetailsMessage` lives in `dm-copy.ts` and produces the target shape shown in "Task Overview".
- [x] `collection-service.ts` re-exports it; no caller changes import paths.
- [x] 7 snapshot cases committed covering full / long-reason / missing-email / missing-reason+email / gender normalization (mixed-case + lowercase female) / whitespace-only reason.
- [x] `tsc --noEmit` clean; full unit suite green (80 suites / 844 tests / 8 snapshots).
- [ ] Manual DM preview (or screenshot) matches the target shape — pending staging deploy.

---

## Related Tasks

- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md) — prerequisite.
- [Task 03](./task-03-intake-request-helper.md) — sibling P0; combines naturally into PR 2 per the plan rollout.

---

**Last Updated:** 2026-04-18  
**Pattern:** Copy layout rewrite with golden snapshot  
**Reference:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)
