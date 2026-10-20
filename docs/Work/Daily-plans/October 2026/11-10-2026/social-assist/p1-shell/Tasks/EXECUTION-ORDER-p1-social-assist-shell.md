# Execution order — p1 shell

> Sibling document of [`plan-p1-social-assist-shell-batch.md`](../plan-p1-social-assist-shell-batch.md). The plan covers what and why. This doc covers who-runs-what-when and which model.

The user decides model switches. The picks below are shorthand only.

```
Wave 1 (Shell — ~3h, single lane sequential):
  Lane α  ──── soc-01 (S, Sonnet) ──> soc-02 (S, Sonnet)
```

**Wall-clock:** ~3h.
**Agent-time:** ~3h.

### Wave 1 — Shell

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-01 | S | Sonnet | `Sidebar.tsx`, `frontend/app/dashboard/insights/page.tsx` | One nav row. Empty tabs. No API. |
| 1 | soc-02 | S | Sonnet | Phase 1 gate in the batch plan | Browser pass of the clinic sidebar and the new page. |

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| soc-01 | S | Sonnet | One nav item and one page. The pattern already exists. |
| soc-02 | S | Sonnet | Gate. No new design. |

## Acceptance gates

### Wave 1

- [x] Social is the last sidebar row and opens `/dashboard/social`. — 2026-10-15
- [x] Content, Schedule, and Analytics switch, and Content is first. — 2026-10-15
- [x] The five clinic rows are unchanged. — 2026-10-15
- [x] This walk added no migration and no new API. — 2026-10-15
