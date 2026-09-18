# inb-01 — Title, shells, sticky band, rail polish

> **Model:** Auto  
> **Depends:** —  
> **Plan:** [plan-inbox-ui-align-batch.md](../plan-inbox-ui-align-batch.md) · INB-D1–D4, D8

## Goal

Inbox outer chrome matches OPD/Patients title + list shell family; toolbar sticks; rail stays.

## Work

1. `page.tsx`: `h1` → `text-2xl font-semibold text-foreground`; keep subtitle.
2. `InboxClient.tsx`: list / detail / Needs review shells → `rounded-lg border border-border/50 shadow-sm`.
3. Wrap toolbar in sticky band classes from OPD/Patients.
4. Soften rail inactive/zero-count styling toward chip family; keep vertical rail.

## Out of scope

Search, empty dashed blocks, skeleton (later tasks).

## Done when

- Title token matches OPD.
- Shells are `rounded-lg` family.
- Toolbar sticky under nav while scrolling.
