# cockpit-v2-decommission — execution order

> Wave matrix for the [cockpit-v2-decommission batch plan](../plan-cockpit-v2-decommission-batch.md). 3 tasks across 2 waves. Wave 1 is a HARD GATE — Wave 2 doesn't start until pre-flight passes.

---

## Visual sequence

```
Wave 1 ─► cvd-01 (pre-flight soak + gate audit) ─┐
                                                  │ GATE
                                                  ▼
Wave 2 ─── sequential ───────────────────────────┐
  └── cvd-02 (kill-switch + legacy-panes removal)
                                                  │
  └── cvd-03 (archive plans + final docs)
```

---

## Task table

| # | Task | Size | Model | Wave | Depends on | Files touched |
|---|---|---|---|---|---|---|
| 1 | [cvd-01: Pre-flight soak + gate audit](./task-cvd-01-preflight-soak-audit.md) | XS | Auto | 1 | All Phase 2 + Phase 3 batches shipped; 4-week soak elapsed | `docs/Work/capture/inbox.md` (mod, decision-record line); no code touched |
| 2 | [cvd-02: Remove kill-switch + legacy panes](./task-cvd-02-remove-kill-switch-and-legacy-panes.md) | S | Auto | 2 | cvd-01 PASS | `frontend/components/patient-profile/PatientProfilePage.tsx` (mod, ~-30 LOC); `frontend/lib/patient-profile/templates.tsx` (mod, delete `legacyBuiltInPanes`); `frontend/lib/patient-profile/useShellLayout.ts` (mod if kill-switch-specific code); `frontend/lib/patient-profile/layout.ts` (mod if needed); `frontend/lib/patient-profile/telemetry.ts` (mod, +cockpit_v2_program_completed event) |
| 3 | [cvd-03: Archive plans + final docs](./task-cvd-03-archive-plans-and-final-docs.md) | XS | Composer 2 Fast | 2 | cvd-02 | `docs/Work/Product plans/plan-cockpit-v2.md` → moves to `Product plans/archive/`; `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` → moves to `Product plans/archive/`; `docs/Reference/product/cockpit/COCKPIT.md` (mod); `docs/Work/capture/inbox.md` (mod, +Q3 follow-ups + program-completion summary) |
| **Totals** | **3** | — | **2 Auto · 1 Composer · 0 Opus** | — | — | — |

---

## Critical path

`cvd-01 → cvd-02 → cvd-03`. Single chain; ~3-5h.

---

## Wave gates

### After Wave 1 (HARD GATE)
- [x] All Phase 2 + Phase 3 batches shipped + smoke green.
- [x] 4-week soak elapsed since 2026-05-19. *(operator override 2026-05-24)*
- [x] Kill-switch escape rate < 1% for 7 consecutive days. *(operator override — 0% assumed)*
- [x] Decision record line in `docs/Work/capture/inbox.md`.

**Status: PASS (operator override) — Wave 2 completed 2026-05-24.**

### After Wave 2
- [x] Kill-switch removed; QA confirms `?v1=1` no longer changes layout.
- [x] Plans archived with DL-4 banner.
- [x] COCKPIT.md promoted per DL-5.
- [x] `cockpit_v2.program_completed` event firing.

---

## Anti-goals

- ❌ Don't start Wave 2 before pre-flight passes. Discipline.
- ❌ Don't hard-delete legacy code paths in this batch — `@deprecated` markers only (DL-2). Q3 cleanup batch can hard-delete.
- ❌ Don't drop migration 099's flat-shape — DL-3.
- ❌ Don't remove existing telemetry event names — DL-6.
- ❌ Don't remove deps (cmdk, react-window, etc.) — DL-7.
- ❌ Don't write a victory-lap doc — capture-inbox line is enough.
