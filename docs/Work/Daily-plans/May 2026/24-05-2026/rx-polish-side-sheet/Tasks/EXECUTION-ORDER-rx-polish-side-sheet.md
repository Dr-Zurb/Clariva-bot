# rx-polish-side-sheet — execution order

> Wave matrix for [rx-polish-side-sheet batch plan](../plan-rx-polish-side-sheet-batch.md). 4 tasks across 4 waves. No parallel lanes (each wave gates the next).

---

## Visual sequence

```
Wave 1 ─► rxss-01 (data hook + filter helper)
            │
Wave 2 ─►   └► rxss-02 (PreviousRxSideSheet component)
              │
Wave 3 ─►     └► rxss-03 (wire + Apply with diff)
                │
Wave 4 ─►       └► rxss-04 (verify + close-out)
```

---

## Task table

| # | Task | Size | Model | Wave | Depends on | Files touched |
|---|---|---|---|---|---|---|
| 1 | [rxss-01: usePriorRxList + filter helper](./task-rxss-01-prior-rx-list-hook.md) | S | Auto | 1 | — | `frontend/hooks/usePriorRxList.ts` (new); `frontend/lib/cockpit/prior-rx-filter.ts` (new); `frontend/lib/cockpit/__tests__/prior-rx-filter.test.ts` (new) |
| 2 | [rxss-02: PreviousRxSideSheet component](./task-rxss-02-previous-rx-side-sheet.md) | M | Auto | 2 | rxss-01 | `frontend/components/cockpit/rx/previous/PreviousRxSideSheet.tsx` (new, ~250 LOC); `frontend/components/cockpit/rx/previous/__tests__/PreviousRxSideSheet.test.tsx` (new); package.json may add `react-window` |
| 3 | [rxss-03: Wire + Apply with diff](./task-rxss-03-wire-and-apply-with-diff.md) | S-M | Auto | 3 | rxss-02 | `frontend/lib/cockpit/rx-diff.ts` (new); `frontend/lib/cockpit/__tests__/rx-diff.test.ts` (new); `frontend/components/consultation/cockpit/RxWorkspace.tsx` (or wherever popover is triggered today — mod, swap to side-sheet); `frontend/components/cockpit/rx/RxFormContext.tsx` (mod if `fromPrescriptionId` not already in shape) |
| 4 | [rxss-04: Verification + close-out](./task-rxss-04-verification-and-close-out.md) | XS | Composer 2 Fast | 4 | rxss-03 | `frontend/lib/patient-profile/telemetry.ts` (mod); COCKPIT.md; roadmap; capture-inbox |
| **Totals** | **4** | — | **3 Auto · 1 Composer · 0 Opus** | — | — | — |

---

## Critical path

`rxss-01 → rxss-02 → rxss-03 → rxss-04`. Single chain; ~10-14h.

---

## Wave gates

After Wave 1: helper tests pass; hook returns filtered list.
After Wave 2: side sheet renders standalone in storybook / dev fixture.
After Wave 3: cockpit Plan-zone trigger opens side sheet; Apply works end-to-end.
After Wave 4: smoke green; telemetry firing; docs. **✅ Wave 4 complete (rxss-04, 2026-05-24).**

---

## Anti-goals

- ❌ Don't remove the popover from non-cockpit mounts (DL-1).
- ❌ Don't add doctor preferences for width (DL-3).
- ❌ Don't multi-select chips (DL-4).
- ❌ Don't add fuzzy search in v1 (DL-9).
