# inb-02 — Toolbar controls, search, empty states

> **Model:** Auto  
> **Depends:** inb-01  
> **Plan:** [plan-inbox-ui-align-batch.md](../plan-inbox-ui-align-batch.md) · INB-D5–D7

## Goal

Toolbar uses shadcn primitives; search matches OPD/Patients chrome; empties use dashed blocks.

## Work

1. Channel → `Select`; date trigger → `Button`; Focus on leads → `Checkbox`.
2. Add debounced search (`md:w-72`, clear-X, `/` focus) filtering loaded rows client-side.
3. List empty + detail empty → dashed centered pattern; Clear filters when filters/search active.

## Out of scope

Server-side `q=` search; URL filter sync.

## Done when

- Controls are shadcn where practical.
- Search + clear + `/` work on loaded rows.
- Empty states match OPD/Patients dashed pattern.
