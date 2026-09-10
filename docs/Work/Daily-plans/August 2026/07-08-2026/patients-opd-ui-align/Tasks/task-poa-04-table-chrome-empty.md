# poa-04 — Table chrome + empty/error hierarchy

> **Model:** Auto  
> **Depends:** poa-01  
> **Plan:** POA-D6, D7

## Goal

Patients table container/header/empty states feel like the same design system as OPD queue table.

## Work

1. In `PatientsTable.tsx` (scroll container + header cells):
   - Container: `rounded-lg border border-border/50 shadow-sm` (replace flatter `rounded-md border` if present).
   - Sticky `TableHead`: `bg-muted/60 backdrop-blur` (drop hard `bg-background` + hairline shadow if it fights the new look).
   - Header label styling: `text-xs font-semibold uppercase tracking-wide text-muted-foreground` where it doesn’t break sort buttons.
2. Empty state (no rows / filter miss):
   - Prefer a dashed block: `rounded-lg border border-dashed … bg-muted/10 p-8|p-12` with **title**, short description, and **Clear filter** when filters active.
   - Can sit inside the scroll region or replace the lonely `h-24` cell — pick the cleaner layout.
3. Error state: keep destructive bordered Retry; add a short title line if missing (“Couldn’t load patients”) for hierarchy parity.
4. Do not change column set, bulk checkboxes, quick-peek, or pagination behavior.

## Out of scope

Mobile card list, OPD status bars, backend.

## Done when

- Table visually family-matches OPD at a glance.
- Empty filter state shows title + action, not only muted one-liner in a cell.
- Sticky headers still work inside the scroll container.
