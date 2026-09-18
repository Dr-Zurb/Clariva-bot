# poa-05 — Skeleton refresh + close gate

> **Model:** Auto  
> **Depends:** poa-02, poa-03, poa-04  
> **Plan:** batch acceptance gate

## Goal

Loading skeleton matches the live Patients layout; batch acceptance checklist is green.

## Work

1. Update `frontend/components/skeletons/patients-list.tsx` (and route skeleton wiring if any) to mirror live UI:
   - Title
   - KPI grid (4 tiles)
   - Sticky-band placeholders: search + chip row + View
   - Table chrome (not obsolete filter-chip-only toolbar)
2. Manual pass vs OPD:
   - Padding / sticky / chips / search clear / empty (force empty with nonsense `q`) / KPI+chip sync / View tags+columns / bulk bar
3. Tick every item in the plan **Acceptance gate**.
4. No opportunistic refactors outside this batch.

## Done when

- Skeleton doesn’t flash removed chrome.
- Plan acceptance checkboxes are all `[x]`.
- No API or migration changes landed in this batch.
