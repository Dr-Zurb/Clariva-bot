# Task 01: `dm-copy.ts` helper + golden-snapshot test harness
## 18 April 2026 — Plan "Patient DM copy polish", Prereq

---

## Task Overview

Patient-facing DM strings are scattered across at least 5 files today (`instagram-dm-webhook-handler.ts`, `collection-service.ts`, `notification-service.ts`, `abandoned-booking-reminder.ts`, `staff-service-review-dm.ts`, `reason-first-triage.ts`, `complaint-clarification.ts`). Every copy edit risks drift and most have zero tests on the *rendered* output (only tests on the *logic* that selects them).

This task:

1. Creates `backend/src/utils/dm-copy.ts` as the **single home** for patient-facing DM string builders.
2. Adds a **golden-snapshot** test harness at `backend/tests/unit/utils/dm-copy.snap.test.ts` that renders every string with a representative set of inputs and compares to `.snap` files. Future copy edits show up as a diff in review, not a surprise in prod.

**No user-visible change in this task.** This is pure refactor + tests. Tasks 02–11 migrate their strings into `dm-copy.ts` as they ship.

**Estimated Time:** 2–3 hours  
**Status:** Done (2026-04-18)  
**Depends on:** —  
**Plan:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)

### Implementation Plan (high level)

1. Create `backend/src/utils/dm-copy.ts`. Keep it string-only: pure functions that take typed inputs and return `string`. No I/O, no logger, no `await`.
2. Seed it with 1–2 trivially migrated helpers (e.g. move `nonTextAck` constant from the webhook handler as `buildNonTextAckMessage()` returning a string — zero semantic change so we can assert the refactor is safe). This proves the migration pattern for later tasks.
3. Create `backend/tests/unit/utils/dm-copy.snap.test.ts`. Use Jest's built-in `toMatchSnapshot()` (already available — confirm with a quick `grep` for existing snapshot tests). Write fixture tables: each test case is `{ name, input, builder }` and the test body calls `expect(builder(input)).toMatchSnapshot()`.
4. Seed the snapshot file with the migrated helpers from step 2 so the harness has at least 1 real snapshot.
5. Add a short section to `docs/Reference/AI_BOT_BUILDING_PHILOSOPHY.md` (or the closest existing dev-doc) pointing at `dm-copy.ts` as the canonical location for patient copy going forward — one paragraph, not an essay.

**Scope trade-offs / deliberate omissions:**
- Do **not** migrate all existing strings in this task. That's what Tasks 02–11 are for, each owning its own migration plus its own snapshot entries.
- Do **not** introduce a templating library (no i18next, no gettext). Plain template literals + typed inputs are sufficient — adding a library is a separate decision.
- Do **not** wire locale dispatch here. `safety-messages.ts` already owns that pattern for the handful of messages that need it; `dm-copy.ts` remains English-only unless a migrating task explicitly brings localized variants with it.

### Change Type

- [x] **Create new** — `dm-copy.ts` + `dm-copy.snap.test.ts`
- [x] **Update existing** — small: move `nonTextAck` constant out of `instagram-dm-webhook-handler.ts` into the new module (replace the inline string with an import). Task 11 will later *change* its copy; this task only *relocates* it.

### Scope Guard

- Expected files touched: 3 (1 new module, 1 new test, 1 callsite replacement in the webhook handler).
- Any task that wants to add more strings to `dm-copy.ts` should do so in its own task file, not here.

### Reference Documentation

- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)
- Existing snapshot example: `backend/tests/unit/utils/safety-messages.test.ts` (if present) — models the locale-dispatch + rendered-string pattern we want.

---

## Task Breakdown

### 1. Create `dm-copy.ts`

- [x] 1.1 New file `backend/src/utils/dm-copy.ts`. Top-of-file docblock states: single source of truth for patient-facing DM strings; pure functions only; no I/O; migrations arrive via Plan "Patient DM copy polish" Tasks 02–11.
- [x] 1.2 Export `buildNonTextAckMessage(): string` returning the exact current string from `instagram-dm-webhook-handler.ts` line 1233. No copy change.
- [x] 1.3 Replace the inline constant in `instagram-dm-webhook-handler.ts` with `const nonTextAck = buildNonTextAckMessage();`. Keep the local name to minimize diff noise.

### 2. Snapshot harness

- [x] 2.1 New file `backend/tests/unit/utils/dm-copy.snap.test.ts`.
- [x] 2.2 Table-driven structure:
  ```ts
  type SnapCase = { name: string; render: () => string };
  const cases: SnapCase[] = [
    { name: 'nonTextAck / default', render: () => buildNonTextAckMessage() },
  ];
  describe('dm-copy snapshots', () => {
    for (const c of cases) {
      it(c.name, () => { expect(c.render()).toMatchSnapshot(); });
    }
  });
  ```
- [x] 2.3 Run `jest -u` once to generate the `.snap` file. Verify the snapshot file is checked in under `backend/tests/unit/utils/__snapshots__/dm-copy.snap.test.ts.snap`.
- [x] 2.4 Re-run without `-u` to confirm the test passes against the committed snapshot.

### 3. Docs

- [x] 3.1 Added a short "Patient-facing DM copy (single source of truth)" subsection to `docs/Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md` (below "Fixed Response Templates"). `AGENTS.md` / `CLAUDE.md` in this repo are the Task Master boilerplate — `RECEPTIONIST_BOT_CONVERSATION_RULES.md` is the DM-specific dev doc already linked from `AI_BOT_BUILDING_PHILOSOPHY.md`, so it's the right reader surface.
- [x] 3.2 Update `docs/capture/inbox.md` with a completion entry.

### 4. Verification

- [x] 4.1 `npx tsc --noEmit` clean in `backend/`.
- [x] 4.2 `npx jest tests/unit/utils/dm-copy.snap.test.ts` passes — 1 snapshot, 1 test.
- [x] 4.3 Full unit suite (`npm test`) green — 80 suites, 837 tests, 1 snapshot. Was 836 tests before this task (the new snapshot is the +1).
- [x] 4.4 ESLint clean on `backend/src/utils/dm-copy.ts`. `instagram-dm-webhook-handler.ts` warnings at lines 1356 / 1507 / 1521 / 2300 / 2919 are pre-existing (I touched only the import list near line 139 and the `nonTextAck` literal at line 1233). The parser-project error reported on `dm-copy.snap.test.ts` reproduces on the pre-existing `safety-messages.test.ts` — repo-wide ESLint config quirk, not introduced here.

---

## Files to Create/Update

```
backend/src/utils/dm-copy.ts                                   — CREATED
backend/tests/unit/utils/dm-copy.snap.test.ts                  — CREATED
backend/tests/unit/utils/__snapshots__/dm-copy.snap.test.ts.snap — CREATED (Jest auto-generated)
backend/src/workers/instagram-dm-webhook-handler.ts            — UPDATED (line ~1233: use buildNonTextAckMessage())
docs/capture/inbox.md                                          — UPDATED (log completion + follow-up)
```

---

## Design Constraints

- **No behavior change.** This task must be a visual no-op for every patient.
- **Pure functions only.** `dm-copy.ts` must not import loggers, DB clients, or anything async. Input → string.
- **Typed inputs.** Each builder takes a small typed object (not positional strings). Example: `buildConfirmDetailsMessage(collected: CollectedPatientData)`, not `(name: string, age: number, …)`.
- **Snapshot discipline.** Any change to a rendered string must update the snapshot in the same commit. Reviewers should see the before/after diff in the `.snap` file.
- **No new dependencies.** Jest's built-in snapshots are enough.

---

## Global Safety Gate

- [x] **Data touched?** No — refactor only, no reads, no writes.
- [x] **Any PHI in logs?** No — pure string builders.
- [x] **External API or AI call?** No.
- [x] **Retention / deletion impact?** None.

---

## Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] `backend/src/utils/dm-copy.ts` exists and exports `buildNonTextAckMessage()`.
- [x] `instagram-dm-webhook-handler.ts` imports from it instead of inlining the string.
- [x] `backend/tests/unit/utils/dm-copy.snap.test.ts` passes with the committed `.snap` file.
- [x] Full unit suite + `tsc --noEmit` green.
- [x] A short note in a dev doc points future tasks at this module.

---

## Related Tasks

- This is the prerequisite for every other task in this plan. Tasks 02–11 each add one or more builders to `dm-copy.ts` and one or more snapshot entries.

---

**Last Updated:** 2026-04-18  
**Pattern:** Centralize + snapshot — foundation refactor for copy edits  
**Reference:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)
