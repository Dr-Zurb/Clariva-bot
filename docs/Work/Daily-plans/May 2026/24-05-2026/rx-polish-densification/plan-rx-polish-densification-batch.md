# Rx-polish densification — R-RX-POLISH/2.1 — 24 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR: **zero Opus tasks** — none reach the structural-refactor / PHI / RLS thresholds. The densification is a per-row two-state UI change in `MedicineRow.tsx`. Three Auto + one Composer 2 Fast (close-out).
>
> **Source plan:** [`plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md) §R-RX-POLISH/2.1 (~line 462) — "Medicine row densification — two-state mode: summary-mode collapse when row is complete + valid; editor expands on tap-to-edit. Resolves the '3 medicines and diagnosis is gone' vertical problem."
>
> **Predecessor batches:**
> - All Phase 2 batches shipped — cockpit-shell-flip + cockpit-chart-extraction + cockpit-ribbon + templates-r-mod + cockpit-middle-investigations + cockpit-middle-rebuild + cockpit-history-pane. Plan pane lives inside cmr-06's `makeMiddleBottomRow` with `<RxPane actionsInFooter>` (so the sticky `<PlanActionFooter>` from cmr-03 owns the Send button); densification is purely below that surface.
> - cmr-01..02 shipped the Assessment / Safety strips; densifying medicine rows is what makes those strips actually useful — three filled medicines no longer push Assessment off-screen.
> - [backend/migrations/](../../../../../backend/migrations/) — **no new migrations**. `prescription_medicines` schema is unchanged; only UI rendering changes.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-rx-polish-densification.md`](./Tasks/EXECUTION-ORDER-rx-polish-densification.md).

---

## Why this batch

After Phase 2 closed, the cockpit has the right structural bones — Assessment strip pinned, Safety strip pinned, sticky action footer — but the **medicine rows themselves are still ~260px tall in their default edit state**. The source-plan success-criterion table (§7) sets the target at **≤ 48px per medicine row in summary state**. A typical visit has 2-4 medicines; at 260px each that's 520-1040px of pure medicine-list real estate, which means even with Assessment pinned, the Plan pane scrolls and the doctor still loses sight of which medicines are higher up.

Concretely, today a complete medicine row shows:
- Drug name autocomplete (full-width input).
- Dosage input (full-width line).
- Route / frequency / duration pickers (three full-width controls, each ~44px tall).
- Free-text instructions textarea (multi-line, ~60px).
- Delete button + drag handle.

All five sub-controls render even when the row is "done" (drug + dosage + frequency + duration all filled with valid values). That's the friction this batch removes.

R-RX-POLISH/2.1 ships:

1. **Two-state `<MedicineRow>` rendering.** Editor-mode (today's full UI; ~260px) is shown when the row is "incomplete" (missing required fields) OR when the doctor has actively tapped/clicked into edit-mode. Summary-mode (compact ~44-48px single line) renders when the row is "complete + valid" and not being edited.
2. **Tap-to-edit.** Clicking anywhere on the summary collapses the previously-edited row (if any) and expands the tapped row into editor-mode. One row in editor-mode at a time; siblings stay summarized.
3. **Auto-collapse on focus-leave.** When the doctor tabs/clicks out of the active editor row, it auto-collapses to summary-mode (if still complete). Pressing `Esc` from any editor input also collapses (matches modal-dismiss expectations).
4. **Visible-from-row affordances on summary.** `Edit` (pencil) + `Delete` (trash) icons remain accessible on summary-mode rows; drag handle stays visible for reordering. No hidden-on-hover affordances (doctors on tablets have no hover).

This batch closes R-RX-POLISH/2.1 with **4 tasks across 3 waves**, **~6-9h wall-clock single-engineer (~1 dev-day)**, **zero new migrations**, **zero Opus tasks**.

**Visible artifact at the close-gate:** `/dashboard/appointments/[id]` with 3 filled medicines now shows ~140-150px of medicine list (3 × ~48px summaries) instead of ~780px (3 × ~260px editor rows). Assessment + Safety + Plan-footer all visible simultaneously without scroll on a 1366×768 monitor.

---

## Decision lock (frozen for batch duration)

**DL-1: "Complete + valid" = drug name AND dosage AND frequency (structured or legacy) AND duration (structured or legacy) all non-empty.** Instructions and route are optional — a row can be complete without them. `drugMasterId` does NOT need to be set (free-text drug names are valid; many doctors prescribe brands not in master). Validity is computed via a pure helper `isMedicineRowComplete(value: MedicineRowValue): boolean` in `frontend/lib/cockpit/medicine-row-state.ts` (new ~30 LOC). Unit-tested in `medicine-row-state.test.ts`.

**DL-2: Summary template line.** Single-line, fixed left-to-right order: `{drug}` · `{dosage}` · `{frequency-short}` · `{duration-short}`. Frequency / duration use the short legacy labels from `lib/medicineCodes.ts` (e.g. "TID", "5d"). Overflow truncates with ellipsis on the drug name only — the trailing fields are short by construction. Max line length ~44 chars at 14px font; tested at 320px container width (fits without wrap).

**DL-3: One editor row at a time.** When a doctor taps row B's summary while row A is in editor-mode, row A collapses (if complete) or stays in editor-mode (if incomplete) and row B expands. Incomplete rows can never be collapsed; they always render as editor — this prevents data loss / silent invalidity. The "active row" state is held in `<PlanSection>` parent (sibling-aware), NOT in each `MedicineRow` (prevents two-truths bugs).

**DL-4: Tap-to-edit hit target = the full row, NOT just an edit icon.** Tablets need big tap targets; the entire summary row is clickable. The `Edit` and `Delete` icons on the summary's right edge use `e.stopPropagation()` so clicking Delete doesn't accidentally expand the row before deletion. Drag handle uses its own `mousedown` capture; clicking the handle starts drag, not edit.

**DL-5: New rows start in editor-mode.** When the doctor presses `[+ Add medicine]`, the new row appends in editor-mode with focus on the drug-name autocomplete. Previously-active row collapses (if complete). This matches the natural flow: doctors don't add a row to leave it empty.

**DL-6: Autosave behavior unchanged.** State transitions (editor ↔ summary) are pure UI; they do NOT trigger `setField` / `setMedicines` calls. The autosave debounce timer ignores them entirely. Verified: editing and then collapsing a row produces exactly ONE save, not two.

**DL-7: Drag-and-drop reorder still works on summary rows.** The existing reorder UX (drag handle on left) operates on the summary row's container, NOT on the editor body. Reorder works in both states; the underlying data array order is the source of truth.

**DL-8: Keyboard navigation in summary mode.** `↑` / `↓` on a focused summary row moves focus between rows. `Enter` / `Space` expands the focused summary to editor. `Esc` collapses the active editor. This is the accessibility contract; matches standard list-row patterns.

**DL-9: Three non-cockpit mounts (DL-3 of the source plan) get the densification for free.** `<PrescriptionForm>` composition root in appointment-detail / in-call mini-panel / post-call summary renders the same `<MedicineRow>` components, so densification ships everywhere `MedicineRow` is used. The two-state behavior is intrinsic to the component, not gated by cockpit context.

**DL-10: Telemetry — single event `cockpit_v2.r_rx_polish_densification_landed`** fires once per session on first `<MedicineRow>` mount in summary-mode (post-batch). Payload: `{ appointmentId, completedRowsCount, editorRowsCount }`. Captures real-world adoption of the summary state.

---

## Phases

### Wave 1 — Validity helper + state machine (1 task, ~1.5h)

- [`task-rxd-01-medicine-row-state-helper.md`](./Tasks/task-rxd-01-medicine-row-state-helper.md) — **XS, Auto** — New `frontend/lib/cockpit/medicine-row-state.ts` (~30 LOC) exporting `isMedicineRowComplete(value: MedicineRowValue): boolean`. New `frontend/lib/cockpit/__tests__/medicine-row-state.test.ts` (~90 LOC) covering all field permutations (empty, partial, complete with structured fields, complete with legacy text, drug-master-id-missing-but-otherwise-complete, etc.).

### Wave 2 — Two-state `<MedicineRow>` + parent active-row tracking (2 tasks, ~5-6h, two sequential lanes)

Wave 2 has two lanes; β depends on α.

- [`task-rxd-02-medicine-row-two-state.md`](./Tasks/task-rxd-02-medicine-row-two-state.md) — **M, Auto** — Modify `frontend/components/consultation/MedicineRow.tsx`. Add an `isEditing: boolean` prop + `onRequestEdit()` / `onRequestCollapse()` callbacks. When `!isEditing && isMedicineRowComplete(value)`, render the compact summary line per DL-2 with Edit + Delete icons + drag handle. When `isEditing || !isMedicineRowComplete(value)`, render today's existing editor UI unchanged. Tap-on-summary fires `onRequestEdit`. `Esc` / `blur-from-editor-to-outside` fires `onRequestCollapse`. Tests in `MedicineRow.test.tsx` (mod or new ~100 LOC).
- [`task-rxd-03-plan-section-active-row.md`](./Tasks/task-rxd-03-plan-section-active-row.md) — **S, Auto** — Modify `frontend/components/cockpit/rx/sections/PlanSection.tsx`. Add `const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);`. Pass `isEditing={activeRowIndex === idx}` + `onRequestEdit={() => setActiveRowIndex(idx)}` + `onRequestCollapse={() => activeRowIndex === idx && setActiveRowIndex(null)}` into each `<MedicineRow>`. On `[+ Add medicine]` click, set the new row's index as active per DL-5. Tests in `PlanSection.test.tsx` (mod or new ~80 LOC) verify one-at-a-time invariant + new-row-active behavior.

### Wave 3 — Verification + close-out (1 task, ~1h)

- [`task-rxd-04-verification-and-close-out.md`](./Tasks/task-rxd-04-verification-and-close-out.md) — **XS, Composer 2 Fast** — Smoke matrix. Wire `trackCockpitV2RRxPolishDensificationLanded` (1 event). Update `COCKPIT.md` with summary-row diagram. Update roadmap (R-RX-POLISH/2.1 → ✅). Capture-inbox: row-favorites (rxf-01 will use the summary's right edge); keyboard-nav polish (DL-8 may need refinement after dogfooding); per-doctor density-default toggle (some doctors may prefer always-expanded).

---

## Cross-cutting acceptance gate (whole batch)

### Structural

- [x] `frontend/lib/cockpit/medicine-row-state.ts` exports `isMedicineRowComplete`.
- [x] `<MedicineRow>` accepts `isEditing` prop + two callbacks; defaults preserve the existing single-state behavior when consumers don't pass them.
- [x] `<PlanSection>` tracks `activeRowIndex` and passes the right prop set per row.
- [x] Three non-cockpit mounts (appointment-detail / in-call mini-panel / post-call summary) all gain densification automatically.

### Behavior

- [x] Filled-and-valid row renders as ~48px summary line; matches DL-2 template.
- [x] Tapping a summary row expands it to editor + collapses the previously-active row (if complete).
- [x] Incomplete row CANNOT be collapsed (DL-3); stays as editor regardless of tap-elsewhere.
- [x] `Esc` inside editor → collapse (DL-8).
- [x] `[+ Add medicine]` → new row inserts as editor + previous row collapses (DL-5).
- [x] Autosave unaffected — editing + collapsing a row fires exactly ONE save (DL-6).
- [x] Drag-reorder works on summary rows (DL-7).
- [x] Keyboard `↑`/`↓`/`Enter`/`Space`/`Esc` navigation works per DL-8.
- [x] Read-only mode (ended visit) shows all rows as summary (un-tappable) regardless of completeness — visual recap, not editable.

### Form parity

- [x] No data loss on summary collapse → re-expand round-trip.
- [x] `drugMasterId` preserved through state transitions.

### Quality

- [x] `pnpm --filter frontend tsc --noEmit` clean.
- [x] `pnpm --filter frontend lint` clean.
- [x] `pnpm --filter frontend test` clean (new helper tests + MedicineRow tests + PlanSection tests).
- [x] Visual regression: at 1366×768 with 3 completed medicines, Assessment + Safety + Plan-footer all visible without scroll.
- [x] Telemetry — `cockpit_v2.r_rx_polish_densification_landed` fires once per session.

### Documentation

- [x] `docs/Reference/product/cockpit/COCKPIT.md` updated.
- [x] `plan-cockpit-v2-execution-roadmap.md` updated — R-RX-POLISH/2.1 → ✅.
- [x] `docs/Work/capture/inbox.md` has 3-4 new lines.

---

## Out-of-scope (rolled forward)

| Item | Where it lands |
|---|---|
| **Per-doctor row-favorite chips on the summary's right edge** | `rx-polish-favorites` (rxf-04) |
| **`Cmd+M` keyboard shortcut to add a medicine** | `rx-polish-shortcuts` (rxs-02) |
| **Inline-edit a single field without full editor expansion** | Phase 4+ (capture-inbox) |
| **Per-doctor "always-expanded" density-default toggle** | Phase 4+ (capture-inbox) |
| **Animated transitions on collapse/expand** | Capture-inbox if dogfooding wants polish |

---

## Cost estimate

| Wave | Tasks | Auto | Composer 2 | Opus | Wall-clock |
|---|---|---|---|---|---|
| 1 | rxd-01 | 1 | 0 | 0 | ~1.5h |
| 2 | rxd-02, rxd-03 | 2 | 0 | 0 | ~5-6h (sequential within wave) |
| 3 | rxd-04 | 0 | 1 | 0 | ~1h |
| **Total** | **4** | **3** | **1** | **0** | **~6-9h (~1 dev-day)** |

---

## References

- Source plan: [`plan-cockpit-v2.md` §R-RX-POLISH/2.1](../../../Product%20plans/plan-cockpit-v2.md).
- Existing component: [`frontend/components/consultation/MedicineRow.tsx`](../../../../../frontend/components/consultation/MedicineRow.tsx).
- Existing helpers: [`frontend/lib/medicineCodes.ts`](../../../../../frontend/lib/medicineCodes.ts).
- Sibling batch: [`rx-polish-favorites`](../rx-polish-favorites/) — consumes the summary's right edge for favorite chips.
