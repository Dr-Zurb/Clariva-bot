# Task cp-03: Remove the walk-in fast-path feature (digital-only product direction)

## 09 May 2026 — Batch [Cockpit polish](../plan-cockpit-polish-batch.md) — Phase 2, Lane β step 0 — **S, ~3h**

---

## Task overview

The walk-in fast path was added in `task-pf-16-walkin-fast-path.md` (07-05-2026 batch) as a 1-field "create an instant appointment with `patient_id = null`" affordance for offline-OPD walk-ins. The user direction on 2026-05-09 is to **remove this entirely** — Clariva is a digital-first / teleconsult product, and the modal mints rows that bypass the standard onboarding flow (patient row → consent → appointment booking).

This task deletes the walk-in surface end-to-end on the frontend. There is **no backend route** dedicated to walk-ins (the modal calls the standard `createAppointment`); only frontend cleanup is needed.

**Estimated time:** ~3h (mostly the careful sweep across 3 mount points + the comment debt in `MobilePillBar.tsx`).

**Status:** Pending.

**Hard deps:** none. **Lane safety:** `CockpitQueueRail.tsx` is rewritten by cp-02 (lane α), which already removes the rail's walk-in mount as part of its rewrite. **Do not touch `CockpitQueueRail.tsx` in this task.** This task focuses on the modal file delete, the `NowNextCard` mount, and comment cleanup.

**Source:** [plan-cockpit-polish-batch.md § CP-D1](../plan-cockpit-polish-batch.md#decision-lock-locked-2026-05-09-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium** (Composer 2 also OK for the file-delete sub-step).

**New chat?** **Yes** — fresh chat (don't carry cp-02's context). Pre-load:
- This task file.
- `frontend/components/dashboard/WalkInQuickModal.tsx` (the file to delete — open it to confirm there are no consumers outside the two known mount points).
- `frontend/components/dashboard/cockpit/NowNextCard.tsx` (read the walk-in section).
- `frontend/components/consultation/cockpit/MobilePillBar.tsx` (read the two walk-in comments).
- `frontend/lib/api.ts` § `createAppointment` (read-only — confirm we don't need to remove anything from the API surface; the function is general-purpose).

**Estimated turns:** 1–2 turns.

---

## Acceptance criteria

### Step 1: delete the modal file

- [ ] `git rm frontend/components/dashboard/WalkInQuickModal.tsx`. The file should no longer exist in the working tree.

### Step 2: clean `NowNextCard.tsx`

- [ ] Remove the import `import { WalkInQuickModal } from "@/components/dashboard/WalkInQuickModal";` (line ~18).
- [ ] Remove the `walkInOpen` state (`useState`) and any setters.
- [ ] Remove the trigger that opens the walk-in modal (a button somewhere in the empty / next-up state — search for `setWalkInOpen(true)`).
- [ ] Remove the `<WalkInQuickModal ... />` mount at the bottom of the component (lines ~396–403).
- [ ] If the empty state previously rendered "Or [Walk-in patient]" alongside another CTA, the empty-state copy collapses to just the other CTA (e.g. "Open patient list" or "Add appointment"). Don't leave an "or" hanging.
- [ ] After this edit, `rg "[Ww]alk[ -]?[Ii]n" frontend/components/dashboard/cockpit/NowNextCard.tsx` → no matches.

### Step 3: clean comment debt in `MobilePillBar.tsx`

The file mentions walk-ins in two comments that describe a behavioural rule (hide Chart pill when `patient_id` is null because that was the walk-in case):

- Line ~17: `*   - Chart pill hidden when \`!showChart\` (walk-in, no patient_id).`
- Line ~46: `/** False for walk-in appointments (no patient_id). Hides the Chart pill. */`

- [ ] Update both comments to drop the walk-in reference. The behaviour itself stays (hide Chart pill when `patient_id` is null — it's still defensive against legacy walk-in rows already in the DB) but the **comment rationale** changes:

  ```ts
  /** False when the appointment has no patient_id (legacy guest rows). Hides the Chart pill. */
  ```

  And matching update in the JSDoc at the top of the file. **Don't change the prop name** (`showChart`) or behaviour.

### Step 4: verify nothing else imports the modal

- [ ] `rg "WalkInQuickModal" frontend/` → **zero matches.**
- [ ] `rg "WalkInQuickModalProps" frontend/` → **zero matches.**
- [ ] `rg "from \"@/components/dashboard/WalkInQuickModal\"" frontend/` → **zero matches.**

### Step 5: superseded-task marker on the historical task file

- [ ] Open `docs/Work/Daily-plans/May 2026/07-05-2026/Tasks/task-pf-16-walkin-fast-path.md` and **prepend a one-line banner** at the very top:

  ```md
  > **⚠️ SUPERSEDED 2026-05-09 by [CP-D1](../plan-cockpit-polish-batch.md#decision-lock-locked-2026-05-09-copied-here-for-stability).** Walk-in feature removed; Clariva is digital-first.
  ```

  Don't delete the rest of the file — it's the historical record of what got built. Just flag it.

### Type-check + lint + tests

- [ ] `cd frontend && npx tsc --noEmit` — clean.
- [ ] `cd frontend && npx next lint` — no new errors (pre-existing warnings are fine).
- [ ] If a snapshot test of `NowNextCard` exists, update its snapshot to match the new empty-state.

---

## Out of scope

- **Backend changes** — there's no walk-in-specific backend route. `createAppointment` stays as-is (it's used by `AddAppointmentModal` and other normal flows).
- **DB cleanup of historical walk-in rows** — rows with `patient_id = null` from past walk-ins stay in the DB. No migration. No backfill. They keep working in the appointment list / detail surfaces; only new walk-ins are blocked (by removing the UI affordance).
- **`CockpitQueueRail.tsx`** — rewritten by cp-02 in lane α; that task removes the rail-side walk-in mount.
- **Validation rules in `backend/src/utils/validation.ts`** — these may have lenient handling for `patient_id = null` (because of historical walk-ins). Don't tighten them; that's defensive backend behaviour and isn't in scope.
- **Re-introducing walk-in later** — out of scope. When/if a real offline-OPD use case arrives, design a proper flow (real patient row + consent + appointment) and book a separate batch.

---

## Files expected to touch

**Deleted:**
- `frontend/components/dashboard/WalkInQuickModal.tsx`

**Modified:**
- `frontend/components/dashboard/cockpit/NowNextCard.tsx` (~30 LOC removed)
- `frontend/components/consultation/cockpit/MobilePillBar.tsx` (2 comments updated)
- `docs/Work/Daily-plans/May 2026/07-05-2026/Tasks/task-pf-16-walkin-fast-path.md` (1-line banner prepend)

**New:** none.

**Tests:**
- Snapshot updates only (if any exist).

---

## Notes / open decisions

1. **Why not also remove the `patient_id = null` defensive paths?** Existing rows in the DB still have that value (historical walk-in appointments). Removing defensive paths would break the appointment-detail / list surfaces for those rows. The defensive paths are net-zero cost and serve as legacy-data robustness. Keep them.
2. **What about `AddAppointmentModal.tsx`?** It contains the word "walk-in" only because it imports the same `createAppointment` function. The grep match in `frontend/components/appointments/AddAppointmentModal.tsx` is incidental (probably a copy-pasted comment). Verify and clean only if it's a comment that explicitly says "walk-in flow" — leave any copy that just says "appointment" alone.
3. **Banner on the historical task file** — important. Future engineers reading the 07-05-2026 batch will otherwise wonder why the walk-in modal isn't in the codebase. The banner gives them the link to the decision.
4. **Why not also retire the `--data-walkin-event` telemetry / log fields if any?** A `rg "walk_in" backend/src/` returns zero matches in service code, only test fixtures (unrelated). No telemetry to retire on the backend.

---

## References

- **File to delete:** `frontend/components/dashboard/WalkInQuickModal.tsx`
- **Mount points to clean:** `frontend/components/dashboard/cockpit/NowNextCard.tsx` (lines ~18, ~396–403 + state hooks)
- **Comment debt to clean:** `frontend/components/consultation/cockpit/MobilePillBar.tsx` (lines ~17, ~46)
- **Superseded by this task:** [Daily-plans/May 2026/07-05-2026/Tasks/task-pf-16-walkin-fast-path.md](../../../07-05-2026/Tasks/task-pf-16-walkin-fast-path.md)
- **Lane α counterpart:** cp-02 removes the rail-side mount in `CockpitQueueRail.tsx`.

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Pending
