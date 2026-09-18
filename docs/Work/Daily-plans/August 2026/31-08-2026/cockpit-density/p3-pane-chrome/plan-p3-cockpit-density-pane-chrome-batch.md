# Plan p3 — Cockpit density: pane chrome

## 31 Aug 2026 — Batch `cockpit-density` / `p3-pane-chrome` (`ckd-12..14`)

> **Status:** **Landed** (2026-08-31). Inherits CKD-DL-1…5.
> **Exec order:** [`Tasks/EXECUTION-ORDER-p3-cockpit-density-pane-chrome.md`](./Tasks/EXECUTION-ORDER-p3-cockpit-density-pane-chrome.md)

## Why this phase

Each leaf pays a 40px tab strip *and* a 36px SOAP toolbar. Fold section chrome into `PaneTabStripV3` `trailingActions`. Then unify context-header backgrounds (one surface, one border).

## Tasks

| ID | Title |
|----|-------|
| ckd-12 | Move `SoapTabChromeActions` into the leaf tab strip |
| ckd-13 | Single background + single border for the context header |
| ckd-14 | Phase 3 gate + COCKPIT.md close-out |

## Acceptance gate

- [x] SOAP S/O/A/P expand/collapse/clear/template chrome renders in the leaf tab strip when hosted; isolated section tests keep in-flow fallback.
- [x] Context header is one surface: one `border-b`, one `bg-background` (no stacked `bg-card` / backdrop row).
- [x] `COCKPIT.md` desktop sketch shows SOAP chrome on the tab strip and the unified context surface.

**Created:** 2026-08-31.
