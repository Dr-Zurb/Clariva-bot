# cockpit-history-pane — execution order

> Wave / lane matrix for the [cockpit-history-pane batch plan](../plan-cockpit-history-pane-batch.md). 5 tasks across 4 waves. Wave 1 has two parallel lanes (α, β). Zero Opus turns.
>
> **Reminder:** This batch is named for roadmap continuity (R-HISTORY); its actual surface is the right column (Subjective + Objective). See plan-batch §"Note on naming."

---

## Visual sequence

```
Wave 1 ────────────────── parallel ────────────────────┐
  α (BMI badge on existing VitalsGrid)                 │
    └── chp-01 ───────────────────────────────────────►│
  β (ObjectiveSection enhancements + legacy demote)    │
    └── chp-02 ───────────────────────────────────────►│
                                                       │
Wave 2 ─────────────────── sequential ─────────────────┴►
  └── chp-03 (telemetry useEffect + tab-contract slot reservation)
                                                       │
Wave 3 ─────────────────── sequential ─────────────────┴►
  └── chp-04 (smoke + telemetry wiring + per-batch docs)
                                                       │
Wave 4 ─────────────────── sequential ─────────────────┴►
  └── chp-05 (Phase-2 GATE — update source product plan)
```

---

## Task lane matrix

| # | Task | Size | Model | Auto chats | Composer 2 chats | Opus chats | Depends on | Files touched |
|---|---|---|---|---|---|---|---|---|
| 1α | [chp-01: BMI badge on VitalsGrid](./task-chp-01-vitals-chip-grid.md) | S | Auto | 1/1 | 0/1 | 0/1 | — | `frontend/components/cockpit/rx/inputs/VitalsGrid.tsx` (mod, +~60 LOC for `<BmiBadge>` + computation + layout slot); `frontend/components/cockpit/rx/inputs/__tests__/VitalsGrid.test.tsx` (new, ~80 LOC — covers BMI computation + grid render) |
| 1β | [chp-02: ObjectiveSection enhancements + legacy demote](./task-chp-02-objective-section-enhancements.md) | M | Auto | 1/1 | 0/1 | 0/1 | — | `frontend/components/cockpit/rx/sections/ObjectiveSection.tsx` (mod, +~100 LOC: split exam + test results + collapse legacy vitalsText); `frontend/lib/cockpit/exam-findings.ts` (new, ~60 LOC: `parseExam` + `serializeExam` helpers); `frontend/lib/cockpit/__tests__/exam-findings.test.ts` (new, ~100 LOC: round-trip + legacy-data tests); `frontend/components/cockpit/rx/sections/__tests__/ObjectiveSection.test.tsx` (new or mod, +~60 LOC) |
| 2 | [chp-03: Telemetry hook + tab-contract slot reservation](./task-chp-03-wire-into-objective-pane.md) | S | Auto | 1/1 | 0/1 | 0/1 | chp-01, chp-02 | `frontend/components/patient-profile/panes/ObjectivePane.tsx` (mod, +~15 LOC for useEffect firing telemetry); `frontend/components/patient-profile/panes/SubjectivePane.tsx` (mod, +~5 LOC for parity comment); `frontend/lib/patient-profile/templates.tsx` (mod, +~10 LOC for explicit `tabs: undefined` on the 2 panes) |
| 3 | [chp-04: Verification + per-batch close-out](./task-chp-04-verification-and-close-out.md) | XS | Composer 2 Fast | 0/1 | 1/1 | 0/1 | chp-03 | `frontend/lib/patient-profile/telemetry.ts` (mod, +~25 LOC for 1 event + 1 window flag); `docs/Reference/product/cockpit/COCKPIT.md` (mod); `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` (mod); `docs/Work/capture/inbox.md` (mod) |
| 4 | [chp-05: Phase-2 gate — update source product plan](./task-chp-05-documentation-polish.md) | XS | Composer 2 Fast | 0/1 | 1/1 | 0/1 | chp-04 | `docs/Work/Product plans/plan-cockpit-v2.md` (mod); `docs/Work/capture/inbox.md` (mod) |
| **Totals** | **5** | — | — | **3/5** | **2/5** | **0/5** | — | — |

---

## Critical path

`chp-01 ⫽ chp-02 → chp-03 → chp-04 → chp-05`

(`⫽` = parallel; chp-01 and chp-02 can run simultaneously.)

Wall-clock if running fully sequential: ~10-14h. With Wave 1's parallel lanes (one engineer per lane), critical path shortens to ~7-9h.

---

## Wave gates

### After Wave 1 (chp-01 + chp-02 land)

- [x] `<VitalsGrid>` renders with new `<BmiBadge>` that auto-computes from Wt + Ht.
- [x] `<ObjectiveSection>` renders general + systemic exam textareas, test results textarea, and the legacy vitalsText demoted to a `<details>` disclosure.
- [x] Unit tests pass: `pnpm --filter frontend test inputs/__tests__/VitalsGrid.test.tsx`, `pnpm --filter frontend test lib/cockpit/__tests__/exam-findings.test.ts`, `pnpm --filter frontend test sections/__tests__/ObjectiveSection.test.tsx`.
- [x] tsc / lint / build all clean (unit-test sweep green 2026-05-24).

### After Wave 2 (chp-03 lands)

- [x] `/dashboard/appointments/[id]` renders enhanced Objective pane content (BMI badge live, general + systemic exam textareas, test results textarea, legacy vitals collapsed).
- [x] Telemetry event `cockpit_v2.r_history_landed` fires exactly once per session on first Objective pane mount (verify in DevTools).
- [x] Pane definitions for `subjective` + `objective` carry an explicit `tabs: undefined` (or equivalent) reserving the future tab-contract slot.
- [x] Subjective pane unchanged visually.
- [x] Round-trip persistence — fill all new fields, reload, all values persist (general + systemic correctly split on the way out, joined on the way in via delimiter).

### After Wave 3 (chp-04 lands)

- [x] Cross-cutting smoke matrix from plan-batch passes.
- [x] `cockpit_v2.r_history_landed` telemetry fires exactly once per session.
- [x] COCKPIT.md + roadmap + capture-inbox all updated.

### After Wave 4 (chp-05 lands — final close-gate)

- [x] `plan-cockpit-v2.md` updated — all six Phase-2 R-items marked Shipped; Status legend updated; §6 Phase-2 gate criteria reviewed (all checked or noted as Phase-3-overlap).
- [x] Capture-inbox has a final entry for source-plan archival (a Phase-3 task).
- [ ] (Optional) Opus close-gate turn captured Phase-2-complete validation; verdict noted in commit message.

---

## Files touched (all-batch summary)

**New files (4):**
- `frontend/components/cockpit/rx/inputs/__tests__/VitalsGrid.test.tsx` (~80 LOC).
- `frontend/lib/cockpit/exam-findings.ts` (~60 LOC — parse/serialize helpers).
- `frontend/lib/cockpit/__tests__/exam-findings.test.ts` (~100 LOC).
- `frontend/components/cockpit/rx/sections/__tests__/ObjectiveSection.test.tsx` (if not already present; ~60 LOC if new).

**Modified files (~8):**
- `frontend/components/cockpit/rx/inputs/VitalsGrid.tsx` (~+60 LOC — `<BmiBadge>` + computation).
- `frontend/components/cockpit/rx/sections/ObjectiveSection.tsx` (~+100 LOC — split exam textareas + test results + collapse legacy).
- `frontend/components/patient-profile/panes/ObjectivePane.tsx` (~+15 LOC — telemetry useEffect).
- `frontend/components/patient-profile/panes/SubjectivePane.tsx` (~+5 LOC — parity comment).
- `frontend/lib/patient-profile/templates.tsx` (~+10 LOC — `tabs: undefined` reservation on subjective + objective pane defs).
- `frontend/lib/patient-profile/telemetry.ts` (~+25 LOC — `trackCockpitV2RHistoryLanded`).
- `docs/Reference/product/cockpit/COCKPIT.md` (~+50 LOC).
- `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` (~+10 LOC across §2, §3, §6, §10).
- `docs/Work/Product plans/plan-cockpit-v2.md` (~+15 LOC — Phase-2-complete annotations).
- `docs/Work/capture/inbox.md` (4-5 new lines).

**Total batch:** ~590 LOC across ~12 files; 5 tasks; ~10-14h.

---

## Disjoint-file confirmation

Wave 1 lanes confirmed disjoint:

| File | Lane α (chp-01) | Lane β (chp-02) |
|---|---|---|
| `inputs/VitalsGrid.tsx` | MOD | — |
| `inputs/__tests__/VitalsGrid.test.tsx` | NEW | — |
| `sections/ObjectiveSection.tsx` | — | MOD |
| `lib/cockpit/exam-findings.ts` | — | NEW |
| `lib/cockpit/__tests__/exam-findings.test.ts` | — | NEW |
| `sections/__tests__/ObjectiveSection.test.tsx` | — | NEW or MOD |

Zero overlap. Two engineers (or one engineer in two terminals) can run the lanes in parallel.

---

## Anti-goals (whole batch)

- ❌ Don't add new backend columns. DL-8: backend untouched.
- ❌ Don't make any new field required. DL-3: telemed-first; everything optional.
- ❌ Don't add tab-contract implementations. DL-10: slots reserved (undefined), not implemented.
- ❌ Don't touch walk-in or kill-switch fallbacks. Out of scope for R-HISTORY.
- ❌ Don't change pane IDs. DL-9 preserves saved-layout compatibility.
- ❌ Don't add Opus turns mid-batch. None of these tasks meet the hard-rules threshold per AGENT-EXECUTION-EFFICIENCY-GUIDE.
