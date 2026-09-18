# Patients list — contained scroll + full phone (batch)

> **Status:** Done 2026-08-06.  
> **Intent:** Keep Patients chrome fixed; scroll only the table. Show full phone numbers in rows.

## Decisions

| ID | Decision |
|---|---|
| **PLS-D1** | Title + KPI strip + search/View stay fixed; table body scrolls inside a flex region. |
| **PLS-D2** | Sticky `thead` inside the table scroll container; footer (count / pagination) stays below the scroll region (not scrolling away). |
| **PLS-D3** | Page size remains 50; no infinite scroll. |
| **PLS-D4** | Doctor list shows **full phone** (no mask/reveal). Call icon kept. |
| **PLS-D5** | Prefer page-local layout (`h-full` / flex) without breaking other dashboard pages’ main scroll. |

## Implementation notes

- `PatientsV2Page`: column flex fill of `main`; chrome `shrink-0`; table `flex-1 min-h-0`.
- `DashboardShell` `main`: `flex flex-col` so child `h-full`/`flex-1` works; keep `overflow-hidden` on main when child fills, or patients page uses `min-h-0 flex-1`.
- `PatientsTable`: outer flex column; scrollable bordered region; sticky header; avoid double `overflow` from `ui/table` wrapper.
- HoverCard: use portal (Radix default) so peek isn’t clipped — verify after layout change.
