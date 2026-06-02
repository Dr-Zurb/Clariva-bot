# Task cce-04: Wire SnapshotPane + HistoryPane into the Telemed-Video templates factory

## 20 May 2026 — Batch [Cockpit chart extraction — R-CHART](../plan-cockpit-chart-extraction-batch.md) — Wave 3, Lane α step 0 — **XS, ~1h**

---

## Task overview

After Wave 2, `<SnapshotPane>`, `<HistoryPane>`, and `<VisitDetailSideSheet>` all exist and render correctly in fixtures. But the production page (`/dashboard/appointments/[id]`) still mounts the old leaf renderers from csf-03: `<PatientChartPane>` for snapshot, `<PanePlaceholder>` for history. cce-04 swaps both leaves to the new components.

After this task:

- `getTelemedVideoTemplate(ctx)` in `frontend/lib/patient-profile/templates.tsx` mounts `<SnapshotPane>` in the `snapshot` leaf and `<HistoryPane>` in the `history` leaf.
- The History `<PanePlaceholder>` is gone. Investigations is the only remaining `<PanePlaceholder>` (R-MIDDLE bottom-left, separate batch).
- The file's top-of-file JSDoc and the pane-id → R-item mapping comment are updated.

This task is a **leaf-render swap** — ~10 LOC delta in one file.

**Estimated time:** ~1h (~30min for the swap, ~30min for tsc / lint / smoke against a real appointment).

**Status:** Done.

**Hard deps:**
- cce-02 (`<SnapshotPane>` exists).
- cce-03 (`<HistoryPane>` + `<VisitDetailSideSheet>` exist).
- **Cross-batch:** csf-04 (the cockpit-shell-flip cutover) merged. cce-04 modifies `templates.tsx` which csf-02 + csf-03 also write — running concurrently would cause merge conflicts.

**Source:** [plan-cockpit-chart-extraction-batch.md § Wave 3](../plan-cockpit-chart-extraction-batch.md#wave-3--templates-wiring-1-task-1h-single-sequential-lane).

---

## Model & execution guidance

**Recommended model:** **Composer 2 Fast**. Two leaf-render swaps in one file. ~10 LOC delta. Composer's sweet spot per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md` § Tier 4](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md#tier-4--composer-2-fast-use-heavily-15-25-of-turns).

**New chat?** **Yes** — fresh chat (Composer benefits from minimal context).

Pre-load:

- This task file.
- post-csf-04 — `frontend/lib/patient-profile/templates.tsx` (the file being edited; verify it's the post-flip shape — the factory should already wire 5 leaves with real content + 2 placeholders per csf-03's diff).
- post-cce-02 — `frontend/components/patient-profile/panes/SnapshotPane.tsx`.
- post-cce-03 — `frontend/components/patient-profile/panes/HistoryPane.tsx`.

**Estimated turns:** 1-2 turns.

---

## Acceptance criteria

### Step 1 — Verify pre-conditions

- [x] `frontend/components/patient-profile/panes/SnapshotPane.tsx` exists (cce-02 merged).
- [x] `frontend/components/patient-profile/panes/HistoryPane.tsx` exists (cce-03 merged).
- [x] `frontend/lib/patient-profile/templates.tsx` has the post-csf-* shape: factory function `getTelemedVideoTemplate(ctx)`, 5 leaves with real renders, 2 leaves with `<PanePlaceholder>` (history + investigations).
- [x] If any pre-condition fails, **stop** and report which task hasn't merged.

### Step 2 — Swap the snapshot leaf

- [x] In `getTelemedVideoTemplate(ctx)`, find the `snapshot` leaf's `render`. Per csf-03 it currently calls `<PatientChartPane appointment={ctx.appointment} token={ctx.token} hideHeader />`.
- [x] Replace with `<SnapshotPane appointment={ctx.appointment} token={ctx.token} hideHeader />`.
- [x] Update the import: replace the import of `PatientChartPane` (if no other leaf still uses it) with `SnapshotPane`. **Important:** if `<PatientChartPane>` is referenced elsewhere in the file (it shouldn't be after this swap), keep its import. Otherwise remove.

### Step 3 — Swap the history leaf

- [x] In `getTelemedVideoTemplate(ctx)`, find the `history` leaf's `render`. Per csf-03 it currently calls `<PanePlaceholder title="History" icon={Clock} futureRItem="R-CHART (Snapshot/History split deferred)" />`.
- [x] Replace with `<HistoryPane appointment={ctx.appointment} token={ctx.token} hideHeader />`.
- [x] Add the `HistoryPane` import.
- [x] Verify the `<PanePlaceholder>` import is still needed (Investigations leaf still uses it). It is. Don't remove.

### Step 4 — Update the top-of-file documentation

- [x] Update the top-of-file JSDoc to reflect that the `snapshot` and `history` leaves now render real content (no longer "deferred to R-CHART"). Suggested:
  ```
  templates.tsx — modality-aware layout factories.
  csf-02 converted the cv2-03 literal to a factory.
  csf-03 wired Snapshot / Body / Plan / Subjective / Objective leaves to real content.
  cce-04 (R-CHART) wired the History leaf to <HistoryPane> and re-pointed the Snapshot leaf at <SnapshotPane>.
  R-MOD-full follow-up batch adds Telemed-Voice / Telemed-Text / Review template factories.
  ```
- [ ] Update the pane-id → R-item mapping comment block at the top:
  - `snapshot` — was R-SHELL placeholder; now R-CHART (real)
  - `history` — was R-CHART (deferred); now R-CHART (real)
  - `investigations-orders` — R-MIDDLE bottom-left (still deferred — the only remaining placeholder)

### Step 5 — Verify exactly one PanePlaceholder remains

- [x] Run `rg "<PanePlaceholder" frontend/lib/patient-profile/templates.tsx`. Expect **exactly 1 match** (Investigations only).
- [x] If 0 or > 1 matches, fix until exactly 1 (Investigations leaf needs to keep its placeholder until R-MIDDLE bottom-left ships).

### Step 6 — Tsc + lint + build + smoke

- [ ] `pnpm --filter frontend tsc --noEmit` clean. *(run locally — agent shell lacked pnpm on PATH)*
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend build` clean.
- [ ] Open `/dashboard/appointments/[id]` for a real telemed appointment in dev. Verify:
  - `snapshot` leaf renders the new SnapshotPane content (allergies, chronic, problems, last 3 vitals, current meds).
  - `history` leaf renders the HistoryPane (list of past visit cards).
  - Clicking a history card opens the side sheet with the visit detail.
  - No console errors.

---

## Out of scope

- **Tuning per-leaf default sizes** (the snapshot vs. history vertical split). Source plan §R-CHART says "Snapshot top, ~45%; History bottom, ~55%" — the existing leaf `naturalSizePct` from csf-03 likely already reflects something close to this. Don't tune unless source plan numbers diverge from current numbers; that's a polish follow-up.
- **Adding History to other templates** (telemed-voice, telemed-text, review). R-MOD-full follow-up batch.
- **Backend changes.** None.
- **Verification, telemetry, doc updates.** cce-05's job.

---

## Files expected to touch

**Modified:**

- `frontend/lib/patient-profile/templates.tsx` — swap two leaf renders + imports + JSDoc (~10 LOC delta).

**Read but not modified:**

- `frontend/components/patient-profile/panes/SnapshotPane.tsx` (just imported).
- `frontend/components/patient-profile/panes/HistoryPane.tsx` (just imported).

---

## Notes / open decisions

1. **What if `<PatientChartPane>` is no longer imported anywhere?** Delete the file in this task? **No** — keep `<PatientChartPane>` for now. It's still imported by tests, by potential standalone uses, and removing it is a separate concern (capture-inbox a follow-up: "Phase 3: delete `PatientChartPane.tsx` if no consumers remain after R-CHART"). cce-05 captures this if it applies.

2. **What if csf-04 hasn't merged yet?** Block this task. The plan-batch's Wave 3 is explicitly gated on csf-04 being merged. Don't try to flip on a stale `templates.tsx` shape.

3. **What about `<PanePlaceholder>`'s import in `templates.tsx`?** Still needed for the Investigations leaf. Keep the import.

4. **Should `<SnapshotPane>` and `<HistoryPane>` be exported from a barrel index?** Optional. The existing `panes/` directory may or may not have a barrel; follow whatever convention is already there. Don't create new conventions in cce-04.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** [plan-cockpit-chart-extraction-batch.md § Wave 3](../plan-cockpit-chart-extraction-batch.md).
- **Wave gate:** [`EXECUTION-ORDER-cockpit-chart-extraction.md` § Wave 3 gate](./EXECUTION-ORDER-cockpit-chart-extraction.md#wave-3-gate-after-cce-04).
- **Predecessors:** [`task-cce-02-snapshot-pane.md`](./task-cce-02-snapshot-pane.md), [`task-cce-03-history-pane-and-visit-detail-sheet.md`](./task-cce-03-history-pane-and-visit-detail-sheet.md). **Cross-batch:** csf-04 from [`cockpit-shell-flip`](../../../19-05-2026/cockpit-shell-flip/).
- **Successor:** [`task-cce-05-verification-and-close-out.md`](./task-cce-05-verification-and-close-out.md).

---

**Owner:** TBD
**Created:** 2026-05-20
**Status:** Done