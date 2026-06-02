# Task cp-04: Drop both follow-up-Rx surfaces (RxWorkspace stub button + CockpitHeader ended-state CTA)

## 09 May 2026 — Batch [Cockpit polish](../plan-cockpit-polish-batch.md) — Phase 2, Lane β step 1 — **XS, ~30m**

---

## Task overview

Two surfaces in the cockpit's `ended` state today promise a "create a follow-up Rx for this episode" flow that doesn't exist end-to-end:

1. **`<RxWorkspace>`** renders a dashed-border `+ Add follow-up Rx` button below the read-only Rx form when `state === "ended"`. The `onClick` only `console.warn`s with a TODO marker (β-5). No backend flow. No state change.
2. **`<CockpitHeader>`** renders **`Send follow-up Rx`** as the **primary** CTA in the `ended` state, mapped via `cockpit-state.ts`'s `ctaForState() → action: "draft-followup"`. The action is also stubbed end-to-end.

Per CP-D4: both surfaces are removed. A doctor that needs another Rx for the same patient navigates to `/dashboard/patients/:id` and starts a new prescription there. (The episode-link infrastructure shipped in migration `095_prescriptions_episode_link.sql` stays in place; this task only retires the UI affordance.)

**Estimated time:** ~30 min. Three small edits across two files + one test update.

**Status:** Pending.

**Hard deps:** none. **Lane safety:** lane ε (cp-09) rewrites `CockpitHeader.tsx`'s layout but doesn't conflict with this task's edit to `cockpit-state.ts` (which is the **upstream** config that the new layout will read). Sequence within lane β: cp-03 → cp-04. The two tasks touch disjoint files.

**Source:** [plan-cockpit-polish-batch.md § CP-D4](../plan-cockpit-polish-batch.md#decision-lock-locked-2026-05-09-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Composer 2 Fast** for the file edits; **Sonnet 4.6** if you want the test updated in the same chat.

**New chat?** **Yes** (or stitched after cp-03 if cp-03's chat hasn't grown too large). Pre-load:
- This task file.
- `frontend/components/consultation/cockpit/RxWorkspace.tsx` (the section around lines 147–172 — the dashed button block).
- `frontend/lib/consultation/cockpit-state.ts` (the `ctaForState` switch and the `CockpitCtaAction` type).
- `frontend/lib/consultation/__tests__/cockpit-state.test.ts` (the test for the `ended` state's CTA).

**Estimated turns:** 1 turn.

---

## Acceptance criteria

### Step 1: drop the dashed button in `RxWorkspace.tsx`

- [ ] Delete the entire block at lines ~147–172:

  ```tsx
  {/* "+ Add follow-up Rx" — shown below the read-only form when ... */}
  {state === "ended" && (
    <div className="border-t border-border bg-background px-4 py-3">
      ...
      <button ... >Add follow-up Rx</button>
    </div>
  )}
  ```

- [ ] Remove the now-unused `PlusCircle` import (line ~30) **only if** it's no longer used anywhere else in the file. Run `rg "PlusCircle" RxWorkspace.tsx` after the edit; remove if zero remaining usages.
- [ ] Update the JSDoc TODO list at the top of the file: remove the `TODO β-5: "Add follow-up Rx" creates a new Rx draft for the episode.` bullet (lines ~26–27). The other TODO bullets stay.

### Step 2: retire the CTA in `cockpit-state.ts`

- [ ] In the `CockpitCtaAction` union (line ~88), remove `"draft-followup"`:

  ```ts
  // BEFORE
  export type CockpitCtaAction =
    | "start-call"
    | "join-call"
    | "end"
    | "wrap-up"
    | "draft-followup"  // ← remove
    | "reschedule";

  // AFTER
  export type CockpitCtaAction =
    | "start-call"
    | "join-call"
    | "end"
    | "wrap-up"
    | "reschedule";
  ```

- [ ] In `ctaForState()` (the switch around line 270), update the `ended` case:

  ```ts
  // BEFORE
  case "ended":
    return { label: "Send follow-up Rx", action: "draft-followup" };

  // AFTER
  case "ended":
    // CP-D4: no primary CTA in the ended state. Auto-advance flow
    // (NextPatientCountdown / EndOfDayCard) drives the next action.
    // For another Rx, doctor navigates to /dashboard/patients/:id.
    return null;
  ```

- [ ] Update the function signature if it's currently typed as non-nullable:

  ```ts
  export function ctaForState(state: CockpitState): {
    label: string;
    action: CockpitCtaAction;
  } | null;
  ```

  All other callers must already handle `null` (the `terminal` state already returns a CTA, but the **ready** state when no consult is possible — defensive — may need updates; verify by reading every consumer).

### Step 3: update consumers that read the CTA

- [ ] In `frontend/components/consultation/cockpit/CockpitHeader.tsx`, find every reference to `ctaForState`. The `handlePrimaryClick` switch will have a `case "draft-followup":` arm — **remove** it. After this edit:

  ```ts
  switch (cta.action) {
    case "start-call": ...
    case "join-call": ...
    case "end": ...
    case "wrap-up": ...
    // case "draft-followup" ← removed in cp-04
    case "reschedule": ...
  }
  ```

- [ ] If any conditional render is `{cta && <Button>...}`, that already guards `null` and needs no change. If it's `{cta.label}` directly (assumes non-null), wrap with `{cta && (...)}`.
- [ ] **Lane note:** lane ε (cp-09) rewrites this whole component's layout. To keep lanes parallel-safe, make this edit **as small as possible** — don't restructure anything around it; just remove the dead arm and the `null` guard. cp-09 will pick up the cleaned-up code as its starting point.

### Step 4: update tests

- [ ] In `frontend/lib/consultation/__tests__/cockpit-state.test.ts`, find the test for the `ended` state's CTA:

  ```ts
  // BEFORE
  it('returns Send follow-up Rx for ended state', () => {
    expect(ctaForState('ended')).toEqual({
      label: 'Send follow-up Rx',
      action: 'draft-followup',
    });
  });

  // AFTER
  it('returns null for ended state (CP-D4: no follow-up-Rx CTA)', () => {
    expect(ctaForState('ended')).toBeNull();
  });
  ```

- [ ] Run `npx jest lib/consultation/__tests__/cockpit-state.test.ts` (or whatever test runner is wired) and confirm it passes.

### Type-check + lint

- [ ] `cd frontend && npx tsc --noEmit` — clean.
- [ ] `cd frontend && npx next lint` — no new errors.
- [ ] `rg "draft-followup" frontend/` → **zero matches.**
- [ ] `rg "Add follow-up Rx" frontend/` → **zero matches** (outside of historical task files in `docs/`).
- [ ] `rg "Send follow-up Rx" frontend/` → **zero matches** (outside of historical task files in `docs/`).

---

## Out of scope

- **Migration `095_prescriptions_episode_link.sql`** — stays applied. The episode-link infrastructure is sound; only the UI surfaces are retired.
- **Backend `prescriptions` route changes** — none. The route accepts the `episode_id` foreign key as before.
- **`PreviousRxPopover`** — already provides a "view previous prescriptions for this episode" surface. Unchanged.
- **A "create new Rx" button on the patient page** — that already exists at `/dashboard/patients/:id`. A doctor that needs another Rx uses that.
- **Rewriting `<CockpitHeader>` layout** — that's cp-09 in lane ε. This task only deletes the dead arm.

---

## Files expected to touch

**Modified:**
- `frontend/components/consultation/cockpit/RxWorkspace.tsx` (~30 LOC removed: dashed button block + JSDoc bullet + maybe `PlusCircle` import)
- `frontend/lib/consultation/cockpit-state.ts` (~5 LOC changed: union member removed + `ended` case returns `null`)
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (~5 LOC removed: `case "draft-followup":` arm + null-guard if needed)
- `frontend/lib/consultation/__tests__/cockpit-state.test.ts` (one test update)

**New:** none.

**Deleted:** none (no full file goes away in this task).

---

## Notes / open decisions

1. **Why return `null` instead of a quieter "Re-open Rx" CTA?** Discussed with the user 2026-05-09: the user wants the surface gone, not redesigned. `NextPatientCountdown` (or `EndOfDayCard`) takes over the visual focus immediately after `Send Rx & finish`; there's no real estate left for a primary CTA on the header.
2. **What if a doctor was actively using `Send follow-up Rx` today?** The action was a stub — clicking it triggered `draft-followup` which was unwired. So nobody's relying on the working version of this CTA, only the *appearance* of one. The removal is net-positive.
3. **Telemetry impact?** If `frontend/lib/telemetry.ts` (or wherever) tracks `cockpit.cta_clicked` events and `draft-followup` is one of the action names, drop the union member in the telemetry types as well. A `rg "draft-followup"` sweep will catch this.
4. **Why is this only XS effort?** The diffs are tiny but they touch the cockpit-state config — the central nervous system of the cockpit's CTA wiring. Get the test green first, then the type-check, then verify all four cockpit states (`ready` / `live` / `wrap_up` / `ended` / `terminal`) still render their correct CTAs by toggling through them in dev.

---

## References

- **Buggy stub buttons:**
  - `frontend/components/consultation/cockpit/RxWorkspace.tsx` lines ~147–172
  - `frontend/lib/consultation/cockpit-state.ts` line ~273 (`ctaForState('ended')`)
- **CTA consumer:** `frontend/components/consultation/cockpit/CockpitHeader.tsx § handlePrimaryClick`
- **Test:** `frontend/lib/consultation/__tests__/cockpit-state.test.ts`
- **Episode-link migration (kept):** `backend/migrations/095_prescriptions_episode_link.sql`
- **Replacement workflow:** doctor navigates to `/dashboard/patients/:id` → `+ New prescription` button.

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Pending
