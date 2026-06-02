# 24 May 2026 — daily plan README

> Day overview for batches scheduled to plan or ship on 2026-05-24. This is the **Phase 3 opening day** for cockpit-v2 — six sibling batches planned today cover every Phase 3 R-item (R-RX-POLISH split into four sub-batches + R-LAYOUT-UX + the final cockpit-v2-decommission close-out).

---

## Batches

| Batch | Status | Phase | Owning R-item(s) | Plan doc | Execution order |
|---|---|---|---|---|---|
| `rx-polish-densification` | Planning | Cockpit v2 Phase 3 | R-RX-POLISH/2.1 (Medicine row two-state densification) | [`./rx-polish-densification/plan-rx-polish-densification-batch.md`](./rx-polish-densification/plan-rx-polish-densification-batch.md) | [`./rx-polish-densification/Tasks/EXECUTION-ORDER-rx-polish-densification.md`](./rx-polish-densification/Tasks/EXECUTION-ORDER-rx-polish-densification.md) |
| `rx-polish-favorites` | Planning | Cockpit v2 Phase 3 | R-RX-POLISH/2.2 + 2.3 (Per-doctor drug frequency ranking + per-row favorite chips) | [`./rx-polish-favorites/plan-rx-polish-favorites-batch.md`](./rx-polish-favorites/plan-rx-polish-favorites-batch.md) | [`./rx-polish-favorites/Tasks/EXECUTION-ORDER-rx-polish-favorites.md`](./rx-polish-favorites/Tasks/EXECUTION-ORDER-rx-polish-favorites.md) |
| `rx-polish-shortcuts` | Planning | Cockpit v2 Phase 3 | R-RX-POLISH/3.x (Pane-scoped keyboard shortcuts) | [`./rx-polish-shortcuts/plan-rx-polish-shortcuts-batch.md`](./rx-polish-shortcuts/plan-rx-polish-shortcuts-batch.md) | [`./rx-polish-shortcuts/Tasks/EXECUTION-ORDER-rx-polish-shortcuts.md`](./rx-polish-shortcuts/Tasks/EXECUTION-ORDER-rx-polish-shortcuts.md) |
| `rx-polish-side-sheet` | Shipped | Cockpit v2 Phase 3 | R-RX-POLISH/4.x (Previous-Rx side sheet promotion) | [`./rx-polish-side-sheet/plan-rx-polish-side-sheet-batch.md`](./rx-polish-side-sheet/plan-rx-polish-side-sheet-batch.md) | [`./rx-polish-side-sheet/Tasks/EXECUTION-ORDER-rx-polish-side-sheet.md`](./rx-polish-side-sheet/Tasks/EXECUTION-ORDER-rx-polish-side-sheet.md) |
| `cockpit-layout-presets-modality` | Planning | Cockpit v2 Phase 3 | R-LAYOUT-UX (Right-click split/merge/preset escape hatch + built-in templates in preset picker) | [`./cockpit-layout-presets-modality/plan-cockpit-layout-presets-modality-batch.md`](./cockpit-layout-presets-modality/plan-cockpit-layout-presets-modality-batch.md) | [`./cockpit-layout-presets-modality/Tasks/EXECUTION-ORDER-cockpit-layout-presets-modality.md`](./cockpit-layout-presets-modality/Tasks/EXECUTION-ORDER-cockpit-layout-presets-modality.md) |
| `cockpit-v2-decommission` | Planning | Cockpit v2 Phase 3 close-out | (none — closes the cockpit-v2 program) | [`./cockpit-v2-decommission/plan-cockpit-v2-decommission-batch.md`](./cockpit-v2-decommission/plan-cockpit-v2-decommission-batch.md) | [`./cockpit-v2-decommission/Tasks/EXECUTION-ORDER-cockpit-v2-decommission.md`](./cockpit-v2-decommission/Tasks/EXECUTION-ORDER-cockpit-v2-decommission.md) |

---

## Where this day fits in the cockpit-v2 program

This day plans **every Phase-3 R-item** in the cockpit-v2 chain. After this day's batches ship, the Phase 3 gate from [`plan-cockpit-v2.md` §6](../../../Product%20plans/plan-cockpit-v2.md) is reached and the entire cockpit-v2 program is archivable.

```
2026-05-17  cockpit-v2 (Phase 1)                              ✅ shipped
2026-05-19  cockpit-shell-flip (Phase 2 foothold)             ✅ shipped
2026-05-20  cockpit-chart-extraction (R-CHART)                ✅ shipped
2026-05-21  cockpit-ribbon (R-RIBBON)                         ✅ shipped
2026-05-21  templates-r-mod (R-MOD-full)                      ✅ shipped 2026-05-23
2026-05-21  cockpit-middle-investigations (R-MIDDLE-L)        ✅ shipped 2026-05-23
2026-05-21  cockpit-middle-rebuild (R-MIDDLE rest)            ✅ shipped 2026-05-23
2026-05-21  cockpit-history-pane (R-HISTORY)                  ✅ shipped 2026-05-24
─────── Phase 2 GATE — cleared 2026-05-24 ───────
2026-05-24  rx-polish-densification (R-RX-POLISH/2.1)         ⏳ today's planning
2026-05-24  rx-polish-favorites (R-RX-POLISH/2.2 + 2.3)       ⏳ today's planning
2026-05-24  rx-polish-shortcuts (R-RX-POLISH/3.x)             ⏳ today's planning
2026-05-24  rx-polish-side-sheet (R-RX-POLISH/4.x)            ✅ shipped
2026-05-24  cockpit-layout-presets-modality (R-LAYOUT-UX)     ⏳ today's planning
2026-05-24  cockpit-v2-decommission (kill-switch removal)     ⏳ today's planning
─────── Phase 3 GATE — closes cockpit-v2 program ───────
```

Master tracker: [`docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md`](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md).

---

## Sibling batch ordering (locked 2026-05-24)

Six batches; sequencing locked by dependency rules from `plan-cockpit-v2-execution-roadmap.md` §5.

1. **rx-polish-densification** — independent of all other 24-05 batches. Touches `MedicineRow.tsx` + minor `PlanSection.tsx`. **Start here** — smallest scope (~2 days), clears the biggest UX problem (3 medicines → diagnosis scrolls off).
2. **rx-polish-favorites** — touches `doctor_drug_usage` + `doctor_drug_favorites` tables (new migrations 108 + 109), `DrugAutocomplete.tsx`, and a per-row chip strip in the densified `MedicineRow`. Stacks on `rx-polish-densification` because the favorite-chip slot is the densified summary's adjacent surface. **Disjoint from rx-polish-shortcuts / rx-polish-side-sheet / cockpit-layout-presets-modality** — parallelizable.
3. **rx-polish-shortcuts** — touches `CommandBar.tsx` (Cmd+K real handler) + a new `usePaneKeyboardShortcuts` hook + 4-5 Plan-pane shortcut bindings. **Disjoint from rx-polish-densification / rx-polish-favorites / rx-polish-side-sheet** — parallelizable.
4. **rx-polish-side-sheet** — promotes `PreviousRxPopover` to a side-sheet using the cv2-09 `SideSheetAnchor` contract. Touches `PreviousRxPopover.tsx`, a new `PreviousRxSideSheet.tsx`, the existing `<SideSheetHost>` registration. **Disjoint from rx-polish-densification / rx-polish-favorites / rx-polish-shortcuts** — parallelizable.
5. **cockpit-layout-presets-modality** — touches `PaneContextMenu.tsx` (new), `layout-presets.ts` (new), migration 110 (extends `doctor_settings.cockpit_layout_presets` to layout tree JSON), `PatientProfileShell.tsx` (right-click handler hookup), and the preset picker built into `PatientProfileHeader.tsx`. **Conflict with cockpit-v2-decommission** on `PatientProfilePage.tsx` — execute this BEFORE decommission.
6. **cockpit-v2-decommission** — removes `?v1=1` kill-switch, deletes `legacyBuiltInPanes` array, archives `plan-cockpit-v2.md` + roadmap to `Product plans/archive/`. **MUST be the last batch** — gates on all five preceding batches having shipped AND the 4-week soak window (capture-inbox entry from csf-05) having elapsed.

**Two engineers in parallel:**
- Engineer A: `rx-polish-densification` → `rx-polish-favorites` → `cockpit-layout-presets-modality`.
- Engineer B: `rx-polish-shortcuts` ∥ `rx-polish-side-sheet` (truly disjoint surfaces).
- Join at `cockpit-v2-decommission` after all five preceding batches ship + soak elapses.

Single-engineer wall-clock: ~12-14 days. Two-engineer wall-clock: ~7-9 days.

---

## What's in flight today (other branches)

- **No cockpit batches in flight today** — all Phase 2 has shipped. Today's six batches are pure planning.
- **`patients-redesign`** (planned 2026-05-18, ongoing): pr-01..14. Disjoint surface (`patients-v2/**` route tree). No conflicts with any 24-05-2026 batch.
- **Text-stream batches** (planned 2026-04-28): task-text-* series for the text-consult composer. Disjoint surface (`TextConsultRoom.tsx` + message-bubble components). No conflicts.

---

## Adjacent reading

- **Source product plan:** [`docs/Work/Product plans/plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md) — §R-RX-POLISH (~line 451), §R-LAYOUT-UX (~line 480).
- **Auxiliary surface contracts:** [`frontend/lib/patient-profile/aux-surfaces.ts`](../../../../../frontend/lib/patient-profile/aux-surfaces.ts) — side-sheet contract used by `rx-polish-side-sheet`; floating-dock contract reserved (no consumer in this day's plans).
- **Existing preset migration:** [`backend/migrations/099_doctor_cockpit_layout_presets.sql`](../../../../../backend/migrations/099_doctor_cockpit_layout_presets.sql) — `cockpit-layout-presets-modality` extends this with a new tree-shaped column (migration 110).
- **Cost-aware model strategy:** [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
- **Wave / lane / shape rules:** [`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`](../../../EXECUTION-ORDER-GUIDELINES.md).
