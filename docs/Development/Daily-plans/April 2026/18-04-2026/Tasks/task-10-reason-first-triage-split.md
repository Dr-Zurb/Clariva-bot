# Task 10: Reason-first triage — copy split
## 18 April 2026 — Plan "Patient DM copy polish", P3

---

## Task Overview

`backend/src/utils/reason-first-triage.ts:429` returns (in the "snippet is blank" branch):

```
**Is there anything else** you'd like the doctor to address at this visit? Reply **nothing else** if what you shared is the full picture — then we can help with **booking** or **fees** next.
```

Problem: one sentence carries three jobs — the question, the escape hatch (`nothing else`), and the next-step preview (`booking / fees`). It works, but scan-reading it on a phone requires a re-read.

**Fix (from 2026-04-17 audit):** 2-line split — question on its own line, escape-hatch + next-step on the line below.

**Target shape (blank-snippet branch):**

```
**Is there anything else** you'd like the doctor to address at this visit?

If that's the full picture, reply **nothing else** and we'll move to **booking** or **fees**.
```

**Target shape (snippet-has-content branch):** the function has two other sub-branches (with/without newlines in the captured snippet). Each ends with the same "Is there anything else…" question. Apply the same 2-line split to both.

From the file structure, the three sub-branches sit inside `clinicalDeflectionAskMoreEnglish(snippet)` and produce:
- blank snippet → just the question + next-step in one sentence
- snippet with `\n` → "So far we've noted: …" block + the question
- snippet without `\n` → "So far we've noted: **…**." + the question

All three end with the same "Is there anything else …" sentence. This task rewrites that sentence into two lines across all three branches.

Localized variants (`hi`, `pa`, Roman `hi`, Roman `pa`) also exist (`askMoreHi()`, `askMorePa()` and their latin counterparts). Apply the same 2-line split in each locale.

**Estimated Time:** 2 hours  
**Status:** Done (2026-04-18)  
**Depends on:** [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md)  
**Plan:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)

> **Implementation note (2026-04-18):** The task doc originally anticipated 5 locale leaves
> (`en`, `hi` Devanagari, `pa` Gurmukhi, Roman `hi`, Roman `pa`) → 15 snapshots. In practice
> `detectSafetyMessageLocale` (`backend/src/utils/safety-messages.ts`) collapses Roman-Hi /
> Roman-Pa into `hi` / `pa`, and the existing strings in `reason-first-triage.ts` are already
> transliterated (Hinglish / Roman-Gurmukhi) — so the Roman and Devanagari/Gurmukhi inputs
> route through the same leaf helper. The real target is **3 sub-branches × 3 leaves = 9
> snapshots**, which is what shipped. If the future moves to separate Roman leaves, bump the
> snapshot count then.

### Implementation Plan (high level)

1. Keep the file structure. Edit each locale's `askMore*` helper so its returned string splits the "Is there anything else? …" sentence into two paragraphs separated by `\n\n`.
2. Preserve the three sub-branches (blank / has `\n` / plain snippet) — only rewrite the tail sentence, not the snippet-display block above it.
3. Snapshot every locale × every sub-branch combination.

**Scope trade-offs:**
- Don't extract these builders into `dm-copy.ts` in this task. `reason-first-triage.ts` is tightly coupled to locale detection and is already a "copy module". Relocating would double the diff. If future tasks move it, that's a refactor task of its own.
- Don't change the English wording beyond the paragraph split. The audit-recommended target shape preserves the exact words.
- Don't introduce emojis or bullets — this triage message is a conversational nudge; structure-lite is the point.

### Change Type

- [x] **Update existing** — `reason-first-triage.ts` (English + 4 locale variants)

### Current State

- `backend/src/utils/reason-first-triage.ts` — ~660 lines. `clinicalDeflectionAskMoreEnglish(snippet)` owns the English tail; siblings own localized versions.
- The broader `askMore*` wrappers at lines 417–423 dispatch by locale; leaf builders own the actual string. Edit the leaves.

### Scope Guard

- Expected files touched: 1 + tests.
- Do NOT change gating (when the message fires) or change the snippet-detection logic.

### Reference Documentation

- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)
- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md)

---

## Task Breakdown

### 1. English leaf — blank-snippet branch

- [x] 1.1 Rewrote `clinicalDeflectionAskMoreEnglish` blank branch to:
  ```
  **Is there anything else** you'd like the doctor to address at this visit?

  If that's the full picture, reply **nothing else** and we'll move to **booking** or **fees**.
  ```

### 2. English leaf — `\n`-bearing snippet branch

- [x] 2.1 Kept `**So far we've noted:**\n\n{s}\n\n` header. Tail now:
  ```
  **Is there anything else** you'd like the doctor to address?

  If that covers it, reply **nothing else** and we'll move to **booking** or **fees**.
  ```

### 3. English leaf — single-line snippet branch

- [x] 3.1 Kept `**So far we've noted:** **{s}**.\n\n` header and applied the same split tail as §2.

### 4. Localized leaves

- [x] 4.1 Applied the 2-paragraph split in `clinicalDeflectionAskMoreHi` and `clinicalDeflectionAskMorePa`, preserving each locale's existing Hinglish / Roman-Gurmukhi wording byte-for-byte — only `\n\n` was inserted after the question mark (and, where applicable, the `phir …` escape-hatch sentence was moved to its own paragraph). **No separate Roman-script leaf exists** in this file (see top-of-doc implementation note); the Hi / Pa leaves already serve both Devanagari/Gurmukhi and Roman inputs via `detectSafetyMessageLocale`.

### 5. Tests

- [x] 5.1 Added 9 snapshot cases to `backend/tests/unit/utils/dm-copy.snap.test.ts` under the shared `cases` array (3 sub-branches × 3 leaves), using `formatClinicalReasonAskMoreAfterDeflection(userText, snippet)` as the public entry point. Snapshots live in `backend/tests/unit/utils/__snapshots__/dm-copy.snap.test.ts.snap` (keys prefixed `triage / …`).
- [x] 5.2 No prior unit tests asserted on the exact pre-split strings (verified via search — only the source file itself contained the old copy), so nothing needed migration. 6 new invariant tests (`formatClinicalReasonAskMoreAfterDeflection invariants (Task 10)`) now assert: (a) every branch contains the `?\n\n` break, (b) all bold phrases (`**Is there anything else**` / `**Kya aur kuch**` / `**Hor kuj**`, `**nothing else**`, `**booking**`, `**fees**`) are preserved, (c) the snippet-header prefix is intact, and (d) a regression guard forbids the legacy single-line tail (`Reply **nothing else** if … — then we can/we'll … booking|fees`).

### 6. Verification

- [x] 6.1 `tsc --noEmit` clean.
- [x] 6.2 Full unit suite: **953 tests across 80 suites, 57 snapshots, zero regressions** (net +15 tests, +9 snaps vs. post-Task-09 baseline). Lint clean on both touched files.
- [ ] 6.3 Staging smoke deferred — the deflection → ask_more path is the prerequisite. Cover English + one Roman locale (e.g. Hinglish) when PR-5 ships.

---

## Files to Create/Update

```
backend/src/utils/reason-first-triage.ts                       — UPDATED (5 locale leaf helpers)
backend/tests/unit/utils/reason-first-triage.test.ts           — UPDATED (snapshot coverage)
backend/tests/unit/utils/__snapshots__/reason-first-triage.test.ts.snap — UPDATED
```

---

## Design Constraints

- **Exactly one blank line** between the question and the escape-hatch sentence.
- **Preserve every bold phrase** (`**Is there anything else**`, `**nothing else**`, `**booking**`, `**fees**`).
- **Snippet-header blocks are untouched.** The only edit is the tail sentence split.
- **Localized wording stays byte-for-byte identical** except for the inserted `\n\n`.

---

## Global Safety Gate

- [x] **Data touched?** No — copy-only edit inside 3 leaf functions.
- [x] **Any PHI in logs?** No new logging.
- [x] **External API or AI call?** No.
- [x] **Retention / deletion impact?** None.

---

## Acceptance & Verification Criteria

- [x] All 3 locale leaf helpers (`clinicalDeflectionAskMore{English,Hi,Pa}`) produce the 2-paragraph shape across every sub-branch. (Scope corrected from "5 locales" to "3 locales" — see top-of-doc note.)
- [x] 9 snapshot cases committed (3 sub-branches × 3 leaves) under `dm-copy snapshots triage / …` keys.
- [x] `tsc --noEmit` clean; full unit suite green (953 tests, 57 snaps, zero regressions).
- [ ] Staging smoke deferred to PR-5 rollout.

---

## Related Tasks

- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md) — prerequisite.

---

**Last Updated:** 2026-04-18  
**Pattern:** Paragraph-split copy edit preserving every existing phrase  
**Reference:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)
