# Plan p2 — Cockpit density: context header

## 31 Aug 2026 — Batch `cockpit-density` / `p2-context-header` (`ckd-05..11`)

> **Status:** **In progress → landing.** Inherits CKD-DL-1…5 from [`../README.md`](../README.md).
> **Exec order:** [`Tasks/EXECUTION-ORDER-p2-cockpit-density-context-header.md`](./Tasks/EXECUTION-ORDER-p2-cockpit-density-context-header.md)

## Why this phase

Identity + queue + vitals + ribbon are four bands (~184px). Merge into a collapsing two-row context header (~40–78px). Biggest clinical-info move; own gate.

## Tasks (do not execute yet)

| ID | Title |
|----|-------|
| ckd-05 | Define `--app-header-h` / `--cockpit-header-h` (and drop unused queue var if the rail dies) |
| ckd-06 | Fold queue rail into identity row (prev/next + “#N of M”) |
| ckd-07 | Drop header row-2 (MRN / phone / time) — already in Visit details |
| ckd-08 | Merge ribbon + vitals into one collapsing context row (CKD-DL-1, CKD-DL-2) |
| ckd-09 | Vitals chips click-to-jump (same pattern as TreatingSlot) |
| ckd-10 | Move Treating into the action footer |
| ckd-11 | Chrome-budget test (CKD-DL-3) + Phase 2 gate |

## Acceptance gate (preview)

- [x] At most two context rows above the palette on a known-patient desktop visit with vitals.
- [x] Walk-in / live / empty vitals collapse unused slots (no reserved empty band).
- [x] Allergies still open the existing popover; Chart / History still open side sheets.
- [x] Queue prev/next still work; terminal state still hides queue.

**Created:** 2026-08-31.
