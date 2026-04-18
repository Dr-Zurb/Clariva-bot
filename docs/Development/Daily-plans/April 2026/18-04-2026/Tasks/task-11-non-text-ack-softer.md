# Task 11: Softer non-text acknowledgement
## 18 April 2026 — Plan "Patient DM copy polish", P3

---

## Task Overview

When a patient sends an attachment, sticker, or reaction, the bot replies with (webhook handler line ~1233):

```
I can only process text messages right now. Please type your request and I'll help you.
```

Problem (from 2026-04-17 audit): "I can only process text" sounds technical. The patient doesn't care what the bot can *process* — they care that their message didn't land and want to know what to do.

**Fix:** warmer framing + specific naming of the unsupported inputs.

**Target shape:**

```
I can't read images or voice notes yet — could you type your message instead? I'll take it from there.
```

**Estimated Time:** 30 min (trivial) — but relies on Task 01 being done so the string lives in `dm-copy.ts`.  
**Status:** Done (2026-04-18)  
**Depends on:** [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md) (which already relocates this exact string to `dm-copy.ts`)  
**Plan:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)

### Implementation Plan (high level)

1. Task 01 already moved the constant into `dm-copy.ts` as `buildNonTextAckMessage()`. This task only changes what that builder returns.
2. Update the returned string to the target shape.
3. Update the corresponding snapshot (Task 01 seeded one; this task updates it intentionally — snapshots are expected to change, not surprise).

**Scope trade-offs:**
- We deliberately name "images or voice notes" rather than the more accurate but technical "attachments, stickers, and reactions". Stickers and reactions don't trigger a patient's expectation of a response the way an image or voice note does; the copy focuses on the frustration vector.
- No localization in this task. English only. If localized variants are needed later, that's a follow-up.
- Don't add an emoji. This is an error-adjacent message; patients don't need a pleasantry.

### Change Type

- [x] **Update existing** — string inside `dm-copy.ts` (relocated by Task 01)

### Current State

- After Task 01 ships: `backend/src/utils/dm-copy.ts` exports `buildNonTextAckMessage()` returning the current string.
- If Task 01 hasn't shipped yet when this task is worked, do Task 01's relocation *and* this copy change together. In that case this task supersedes Task 01's "seed with current string" step.

### Scope Guard

- Expected files touched: 1 (the builder in `dm-copy.ts`) + its snapshot.
- Do NOT change when the ack fires, the suppression logic, the audit log, or anything else.

### Reference Documentation

- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)
- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md)

---

## Task Breakdown

### 1. Update string

- [x] 1.1 Updated `buildNonTextAckMessage` in `backend/src/utils/dm-copy.ts` to return the target shape verbatim. Also rewrote the JSDoc above the function to record the rationale (bot-framed "I can only process text messages right now" → patient-framed "I can't read images or voice notes yet …") and the deliberate design constraints (English-only, no markdown, no emoji, no localization, stickers/reactions intentionally unnamed) so a future reviewer doesn't relitigate the decision.
- [x] 1.2 No signature change. The single caller in `backend/src/workers/instagram-dm-webhook-handler.ts:1253` still reads `const nonTextAck = buildNonTextAckMessage();` — no handler-side edit needed.

### 2. Snapshot

- [x] 2.1 Ran `npx jest tests/unit/utils/dm-copy.snap.test.ts -u` — snapshot file reports "1 snapshot updated, 56 passed, 57 total". Reviewed the diff: the `dm-copy snapshots nonTextAck / default 1` entry is now the new target string exactly (`"I can't read images or voice notes yet — could you type your message instead? I'll take it from there."`).
- [x] 2.2 Committed the updated `.snap` alongside the source edit — single-commit-able because the snapshot diff IS the intentional copy change.

### 3. Verification

- [x] 3.1 `tsc --noEmit` clean.
- [x] 3.2 Full suite: **80 suites / 955 tests / 57 snapshots** green (net +2 tests vs. post-Task-10 baseline — the 2 new invariants; 1 snapshot updated in place so snap count is unchanged). Zero regressions. ESLint clean on both touched files.
- [ ] 3.3 Staging smoke deferred to PR-5 rollout: send an image DM (bot should reply with new copy), voice note (same), sticker (same). All three trigger the same ack.

### 4. Invariants (added beyond the original task spec)

- [x] 4.1 New `buildNonTextAckMessage invariants (Task 11)` block in `dm-copy.snap.test.ts` guarding the *shape* independently of the exact wording: single line only (no `\n`), no markdown bolding (no `**`), no emoji (explicit Unicode-range negative assertion covering symbols + pictographs), names "images" + "voice notes", and contains the word "type" (so we always tell the patient what to do). Plus a "drops legacy wording" guard that forbids the `process text messages` phrase resurfacing via a future copy-paste. Rationale: the snapshot diff alone would catch wording drift, but an intentional replacement edit regenerates the snapshot — these invariants make shape regressions (someone adding a `**bold**` or an emoji) fail loudly in review.

---

## Files to Create/Update

```
backend/src/utils/dm-copy.ts                                   — UPDATED (string only)
backend/tests/unit/utils/__snapshots__/dm-copy.snap.test.ts.snap — UPDATED (1 entry regenerated)
```

---

## Design Constraints

- **Single line**, single paragraph — this is a quick ack, not a conversation.
- **No bold**, no markdown, no emoji.
- **Warmth over accuracy.** "Images or voice notes" covers the two inputs a patient might expect us to handle; stickers and reactions are deliberately unnamed (patients rarely expect a response to a sticker).

---

## Global Safety Gate

- [x] **Data touched?** No — copy-only edit inside one helper.
- [x] **Any PHI in logs?** No.
- [x] **External API or AI call?** No (existing Instagram Send, unchanged).
- [x] **Retention / deletion impact?** None.

---

## Acceptance & Verification Criteria

- [x] `buildNonTextAckMessage()` returns the target string.
- [x] Snapshot updated (1 updated in place).
- [x] `tsc --noEmit` clean; full suite green (955 tests / 57 snaps).
- [ ] Staging smoke deferred to PR-5 rollout.

---

## Related Tasks

- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md) — prerequisite (relocates the string).

---

**Last Updated:** 2026-04-18  
**Pattern:** Tiny copy polish on an error-adjacent message  
**Reference:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)
