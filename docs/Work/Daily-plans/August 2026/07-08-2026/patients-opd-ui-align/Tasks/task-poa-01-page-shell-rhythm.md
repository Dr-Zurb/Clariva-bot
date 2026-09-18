# poa-01 — Page shell rhythm + title

> **Model:** Auto  
> **Depends:** —  
> **Plan:** [plan-patients-opd-ui-align-batch.md](../plan-patients-opd-ui-align-batch.md) · POA-D2, D9

## Goal

Patients page uses the same outer rhythm as OPD: normal `main` padding, no bleed, consistent title token.

## Work

1. In `PatientsV2Page.tsx`, remove `-m-4 md:-m-6` (and matching compensatory outer padding if redundant). Keep an internal `flex flex-col gap-3` (or match OPD’s `mt-4` + `gap-3`) so KPI → toolbar → table stack cleanly.
2. Preserve contained table scroll if needed: `flex-1 min-h-0` on the list region only — do not reintroduce full-page negative margins.
3. Page `<h1>`: `text-2xl font-semibold text-foreground` (OPD parity).
4. Visual check: Patients and OPD side-by-side — left edge of content aligns; no double-padding or clipped sticky later.

## Out of scope

Sticky band, chips, table chrome (later tasks).

## Done when

- No negative-margin bleed on Patients.
- Title classes match OPD.
- KPI / toolbar / table still lay out without horizontal jump.
