# rx-polish-shortcuts — execution order

> Wave matrix for [rx-polish-shortcuts batch plan](../plan-rx-polish-shortcuts-batch.md). 4 tasks across 3 waves.

---

## Visual sequence

```
Wave 1 ─── parallel ──────────────────────┐
  α  rxs-01 (usePaneKeyboardShortcuts hook)
  α  rxs-02 (command-registry)
                                          │
Wave 2 ─── sequential ────────────────────┴─►
  └── rxs-03 (Plan shortcuts + Cmd+K palette + shell pane-id attrs)
                                          │
Wave 3 ─── sequential ────────────────────┴─►
  └── rxs-04 (verify + close-out)
```

---

## Task table

| # | Task | Size | Model | Wave | Depends on | Files touched |
|---|---|---|---|---|---|---|
| 1 | [rxs-01: usePaneKeyboardShortcuts hook](./task-rxs-01-pane-keyboard-shortcuts-hook.md) | S | Auto | 1 | — | `frontend/hooks/usePaneKeyboardShortcuts.ts` (new, ~120 LOC); `frontend/hooks/__tests__/usePaneKeyboardShortcuts.test.tsx` (new) |
| 2 | [rxs-02: Command registry](./task-rxs-02-command-registry.md) | S | Auto | 1 | — | `frontend/lib/patient-profile/command-registry.ts` (new, ~80 LOC); `frontend/lib/patient-profile/__tests__/command-registry.test.ts` (new) |
| 3 | [rxs-03: Plan shortcuts + Cmd+K palette + shell attrs](./task-rxs-03-plan-shortcuts-and-cmdk.md) | M | Auto | 2 | rxs-01, rxs-02 | `frontend/components/patient-profile/Shell.tsx` (mod, +data-attrs); `frontend/components/patient-profile/CommandBar.tsx` (mod, ~real palette); `frontend/components/cockpit/rx/sections/PlanSection.tsx` (mod, +hook call); `frontend/components/cockpit/middle/PlanActionFooter.tsx` (mod, +tooltip hint); package.json may add `cmdk` dependency if not present |
| 4 | [rxs-04: Verification + close-out](./task-rxs-04-verification-and-close-out.md) | XS | Composer 2 Fast | 3 | rxs-03 | `frontend/lib/patient-profile/telemetry.ts` (mod); `frontend/components/patient-profile/KeyboardHelpDialog.tsx` (new, ~50 LOC); `docs/Reference/product/cockpit/COCKPIT.md` (mod); roadmap; capture-inbox |
| **Totals** | **4** | — | **3 Auto · 1 Composer · 0 Opus** | — | — | — |

---

## Critical path

`rxs-01 → rxs-03 → rxs-04`. rxs-02 runs alongside rxs-01 without extending critical path.

Single-engineer wall-clock: ~8-10h.

---

## Wave gates

After Wave 1: hook + registry work in isolation tests.
After Wave 2: end-to-end shortcuts + palette in `/dashboard/appointments/[id]`.
After Wave 3: smoke green; telemetry firing; help dialog live.

---

## Anti-goals

- ❌ Don't bind globally — pane-scoped only (DL-1).
- ❌ Don't make shortcuts user-customisable in v1 (DL-4).
- ❌ Don't ship a custom palette UI — use `cmdk` (or whatever shadcn provides).
- ❌ Don't add shortcuts for Subjective/Objective panes — out of scope; add when dogfooding requests.
