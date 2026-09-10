# inb-03 — Skeleton, page error, close gate

> **Model:** Auto  
> **Depends:** inb-02  
> **Plan:** [plan-inbox-ui-align-batch.md](../plan-inbox-ui-align-batch.md) · INB-D9–D10

## Goal

Loading/error polish matches dashboard list hubs; verify batch.

## Work

1. Add `frontend/components/skeletons/inbox.tsx` + `app/dashboard/inbox/loading.tsx`.
2. Page fetch error → `Alert` destructive + Try again link to `/dashboard/inbox`.
3. Run frontend typecheck/lint for touched files; smoke Inbox in browser if available.

## Done when

- Route skeleton mirrors rail + toolbar + dual pane.
- Error uses Alert family.
- Batch acceptance gate checked off.
