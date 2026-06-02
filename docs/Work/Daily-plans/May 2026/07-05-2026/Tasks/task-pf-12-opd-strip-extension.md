# Task pf-12: `OpdQueueStrip` STATUS_META + summary

## 07 May 2026 — Batch [Patient seeing flow](../plan-patient-flow-batch.md) — Phase 3, Lane ε step 0 — **S, ~3h**

---

## Task overview

Extend `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx` so completed / missed / skipped / cancelled rows render with sensible meta (icon + colour), and the strip's header subtitle reads `3 done · 1 in consult · 8 waiting` (counts adapt; zero counts elide gracefully). Adds a collapsed `Done today (3) ▾` disclosure when `totalDone > 5`.

Also extracts the canonical `STATUS_META` map so pf-08's queue rail can reuse it (post-this-task, a small Composer follow-up swaps the rail's local map for an import).

**Estimated time:** ~3h. Bulk of the time is the disclosure animation + getting the count copy right across breakpoints.

**Status:** Shipped (2026-05-08).

**Hard deps:** [pf-06](./task-pf-06-opd-snapshot-enum-fix.md) shipped (relies on `done` / `missed` lists).

**Source:** [plan-patient-seeing-flow.md § P4.2](../../../../Product%20plans/plan-patient-seeing-flow.md#p42--opdqueuestrip-status_meta--header-summary).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**. Pattern A.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx`.
- `frontend/hooks/useOpdSnapshot.ts` (post-pf-06).
- The status-helper file in `frontend/lib/ui/` (search for one or extract inline).

**Composer-OK sub-steps:** none for this task. The follow-up where pf-08's queue rail imports the shared map is a 5-min Composer chat after this lands.

**Estimated turns:** 2–3 Sonnet turns.

**Multi-chat coordination:** when this lands, optionally run a 5-min Composer chat to refactor pf-08's local map → import from this file (only if pf-08 already shipped).

---

## Acceptance criteria

### `STATUS_META` extension

- [ ] Extract `STATUS_META` to `frontend/lib/consultation/opd-status-meta.ts` (NEW) — exporting:

  ```ts
  export type OpdStatus =
    | 'waiting' | 'called' | 'in_consultation'
    | 'completed' | 'missed' | 'skipped' | 'cancelled';

  export interface OpdStatusMeta {
    label: string;            // "Done", "In consult", "Waiting", …
    badgeVariant: 'default' | 'outline' | 'destructive' | 'secondary' | 'success-outline';
    icon: LucideIcon;          // ✓ / ● / ○ / ⊘ / etc.
    sortGroup: 1 | 2 | 3;       // 1=active, 2=done, 3=missed (rendering order)
  }

  export const OPD_STATUS_META: Record<OpdStatus, OpdStatusMeta>;
  ```

- [ ] All 7 enum values mapped. Use existing `lucide-react` icons (Clock for waiting, BellRing for called, Mic for in_consultation, Check for completed, X for missed/cancelled, MinusCircle for skipped — adjust to taste).
- [ ] Existing `OpdQueueStrip` imports from this new file (no in-file map duplicated).

### Header summary

- [ ] Above the active list, render a single line:

  ```
  {totalDone > 0 && `${totalDone} done · `}{totalActive} {opd-mode-aware noun} · {totalMissed > 0 && `${totalMissed} no-show`}
  ```

  Examples:
  - `0 done · 8 waiting · 0 no-show` → `8 waiting`
  - `3 done · 1 in consult · 0 no-show` → `3 done · 1 in consult` (active includes the in-consult; pluralisation)
  - `12 done · 0 waiting · 1 no-show` → `12 done · 1 no-show`

  Drop zero counts gracefully — never render `0 ___`.
- [ ] Use tabular-num so digits don't jitter as new realtime updates arrive.

### Done-today disclosure

- [ ] When `totalDone > 0`, render a disclosure below the active list:

  ```
  Done today ({totalDone}) ▾   ← collapsed by default if totalDone > 5
  ```

- [ ] Click → expand → render the `done` rows (greyed: `opacity-60` + `STATUS_META.completed.badgeVariant`).
- [ ] When `totalDone <= 5`, render expanded by default but still inside the collapsible (so the doctor can collapse manually).

### Missed / skipped / cancelled

- [ ] Same disclosure pattern, label `No-show / skipped ({totalMissed})`. Default collapsed when `totalMissed > 3`. Same row styling but with destructive-outline variant.

### General

- [ ] Type-check + lint clean.
- [ ] Realtime: when `useOpdSnapshot` emits new data, summary line and disclosures update without flicker.
- [ ] No regressions on existing active-row rendering.
- [ ] Mobile (`<lg`): summary line still readable; disclosures stack normally.

---

## Out of scope

- **Refactoring the queue rail to import the shared map** — separate Composer follow-up after pf-08 + this both ship.
- **Click on a done row** — for now, no-op or routes to the appointment (matches active row behaviour). No special "review" flow.

---

## Files expected to touch

**New:**
- `frontend/lib/consultation/opd-status-meta.ts` (~80 LOC — pure types + map)

**Modified:**
- `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx` (~120 LOC — summary line + disclosures + import the map)

**Deleted:** none.
**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why extract the meta to its own file.** Two consumers now (`OpdQueueStrip`, `CockpitQueueRail`); a third may emerge in pf-13. One canonical map prevents drift.
2. **Pluralisation of "in consult".** Singular when 1, plural when ≥2 ("3 in consult" reads fine; "1 in consults" doesn't). Hard-code the singular/plural split or use a tiny helper.
3. **Disclosure animation.** Use Tailwind's `data-[state=open]:` patterns (or whatever the codebase's existing accordion uses). Keep it subtle — 150 ms ease.

---

## References

- **Source plan:** [plan-patient-seeing-flow.md § P4.2](../../../../Product%20plans/plan-patient-seeing-flow.md#p42--opdqueuestrip-status_meta--header-summary)
- **Hook providing the data:** [task-pf-06-opd-snapshot-enum-fix.md](./task-pf-06-opd-snapshot-enum-fix.md)
- **Sibling consumer of the same meta:** [task-pf-08-cockpit-queue-rail.md](./task-pf-08-cockpit-queue-rail.md)

---

**Owner:** TBD
**Created:** 2026-05-07
**Status:** Shipped (2026-05-08).
