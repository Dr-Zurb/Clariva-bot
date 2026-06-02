# Rx-polish previous-Rx side-sheet — R-RX-POLISH/4.x — 24 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). **Zero Opus tasks.** Three Auto + one Composer 2 Fast close-out.
>
> **Source plan:** [`plan-cockpit-v2.md` §R-RX-POLISH/4.x](../../../Product%20plans/plan-cockpit-v2.md) — "Previous-Rx side sheet (DL-8) — promotes `PreviousRxPopover` to a side sheet using R-FUTURE-PROOFING contract; filter chips, search-by-medicine, one-tap Apply with diff vs. current draft."
>
> **Predecessor batches:** All Phase 2 + cv2-09 (`SideSheetAnchor` contract). **Disjoint from rx-polish-densification / rx-polish-favorites / rx-polish-shortcuts / cockpit-layout-presets-modality** — fully parallelizable.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-rx-polish-side-sheet.md`](./Tasks/EXECUTION-ORDER-rx-polish-side-sheet.md).

---

## Why this batch

`PreviousRxPopover` (cockpit-5, ~2026-05-something) currently shows the last 3 prior prescriptions in a small popover. It has three structural problems that limit clinical utility:

1. **Scroll-limited to 3 rows.** Doctors with chronic-disease patients need to see 10+ prior Rxes to compare medication evolution over time.
2. **No filter / search.** Finding "the last time I prescribed Amlodipine" requires scrolling all of history.
3. **No structured Apply.** The "Copy medicines" button is a TODO (per the source file header comment). Doctors can't actually re-use a prior Rx without manually retyping.

R-RX-POLISH/4.x promotes this surface to a **side sheet** using cv2-09's `SideSheetAnchor` contract:

- **Full list with virtual scroll** (no 3-row cap).
- **Filter chips:** "All", "Active condition", "Last 30 days", "Same diagnosis".
- **Search-by-medicine:** type "amox" → filters to Rxes containing Amoxicillin.
- **One-tap Apply with diff:** click Apply on a prior Rx → preview side-by-side diff against current draft → confirm → medicines appended (or replaced, doctor's choice) to draft.

The side sheet is the FIRST real consumer of cv2-09's `SideSheetAnchor` contract. Its existence is also a proof of the contract working for a real feature (cv2-09 stipulates this in its acceptance criteria).

This batch closes R-RX-POLISH/4.x with **4 tasks across 3 waves**, **~10-14h wall-clock single-engineer (~1.5-2 dev-days)**, **zero migrations**, **zero Opus tasks**.

---

## Decision lock

**DL-1: Side sheet replaces the popover; popover is removed.** No "open the popover" path remains. The chip on the cockpit (likely top of the Plan zone) still triggers — but now opens the side sheet via `sideSheet.open('previous-rx')`. Backward-compat for non-cockpit mounts (appointment-detail, in-call mini-panel): the popover IS retained ONLY in those mounts; cockpit-only switch.

**DL-2: Anchor id = `"previous-rx"`.** Stable; matches the convention in cv2-09's example.

**DL-3: Default width 480px (cv2-09 DL-4 default).** Doctor preferences NOT persisted in v1 (capture-inbox).

**DL-4: Filter chips are exclusive (radio behavior, not multi-select).** Default chip is "All". Selecting another chip narrows; switching chips replaces filter. Search box is INDEPENDENT of chip — chip + search compose (AND).

**DL-5: "Same diagnosis" chip uses the current draft's `provisionalDiagnosis`.** Matches prior Rxes whose `diagnosis` field equals or contains the current Dx (case-insensitive). Empty current-Dx → chip disabled.

**DL-6: "Active condition" chip uses the patient's chart `conditions` list.** Matches prior Rxes whose `diagnosis` matches any active condition. Empty conditions → chip disabled.

**DL-7: Apply flow has TWO modes — Replace vs Append.** Default = Append (low destructive risk). Doctor can switch via a small toggle at top of the diff preview. Diff preview shows: current draft on left, proposed final on right (after Append/Replace). Highlight rows that are new (Append) or existing (Replace overwrites).

**DL-8: Apply mode tracks `fromPrescriptionId`.** When the doctor confirms, the resulting draft `RxFormContext` has `fromPrescriptionId = priorRx.id` so audit logs can trace re-use. Existing `RxFormContext` already declares this field; if not, this batch adds it.

**DL-9: Search uses substring match on medicine names.** No fuzzy / tokenization — keep it simple. Doctors type a 3-4 character prefix; substring match handles brand/generic by including both columns when populated.

**DL-10: Virtual scroll if > 20 prior Rxes.** Use `react-window` (or whatever the project already has — check for existing virtual scroll usage; if none, `react-window` is fine as a new dep ~ smallish). Skip virtualization at < 20 rows (premature optimization).

**DL-11: Telemetry — three events.**
- `cockpit_v2.r_rx_polish_side_sheet_opened` (per open; `{ priorRxCount }`).
- `cockpit_v2.r_rx_polish_side_sheet_filter_changed` (per chip + search-character; `{ chip, hasSearch }`).
- `cockpit_v2.r_rx_polish_side_sheet_applied` (per Apply confirm; `{ priorRxId, mode: "append" | "replace", medicineCount }`).

---

## Phases

### Wave 1 — Data hook + filter logic (1 task, ~3h)

- [`task-rxss-01-prior-rx-list-hook.md`](./Tasks/task-rxss-01-prior-rx-list-hook.md) — **S, Auto** — New `frontend/hooks/usePriorRxList.ts` (~80 LOC). Wraps the existing `listPrescriptionsByPatient` API + applies chip + search filters client-side. Pure helper `filterPriorRxList(rxes, { chip, search, currentDx, conditions })` extracted to a separate file with unit tests.

### Wave 2 — Side sheet component (1 task, ~5-6h)

- [`task-rxss-02-previous-rx-side-sheet.md`](./Tasks/task-rxss-02-previous-rx-side-sheet.md) — **M, Auto** — New `frontend/components/cockpit/rx/previous/PreviousRxSideSheet.tsx`. Registers via cv2-09's `SideSheetAnchor` at mount. Renders header + filter chips + search box + virtualized list + diff-preview overlay on Apply. Reuses existing `PreviousRxRow` rendering from `PreviousRxPopover` if extractable; otherwise inlines.

### Wave 3 — Wire + Apply with diff (1 task, ~3-4h)

- [`task-rxss-03-wire-and-apply-with-diff.md`](./Tasks/task-rxss-03-wire-and-apply-with-diff.md) — **S-M, Auto** — Replace the popover trigger in cockpit mounts with side-sheet open: find the existing `<PreviousRxPopover>` trigger in Plan-zone / RxWorkspace and swap to `sideSheet.open('previous-rx')`. Build the diff-preview helper `frontend/lib/cockpit/rx-diff.ts` (computes added/removed/unchanged medicine rows between two `MedicineRowValue[]`). Implement Apply confirm → `RxFormContext.setMedicines(...)` + `setField('fromPrescriptionId', priorRx.id)`.

### Wave 4 — Verification + close-out (1 task, ~1h)

- [`task-rxss-04-verification-and-close-out.md`](./Tasks/task-rxss-04-verification-and-close-out.md) — **XS, Composer 2 Fast** — Smoke, 3 telemetry events, COCKPIT.md, roadmap, capture-inbox.

---

## Cross-cutting acceptance gate

### Structural
- [ ] `usePriorRxList` + `filterPriorRxList` exported.
- [ ] `<PreviousRxSideSheet>` registers via `SideSheetAnchor` contract.
- [ ] Cockpit Plan-zone trigger opens the side sheet (not popover).
- [ ] Non-cockpit mounts still use popover (DL-1).

### Behavior
- [ ] Side sheet lists all prior Rxes (no 3-cap).
- [ ] Chips filter correctly (All / Active condition / Last 30 days / Same diagnosis).
- [ ] Search + chip compose with AND.
- [ ] "Same diagnosis" / "Active condition" chips disable when their data is empty.
- [ ] Apply opens diff preview; doctor can switch Append/Replace mode.
- [ ] Apply confirm writes medicines + `fromPrescriptionId` to draft.
- [ ] Virtual scroll kicks in at > 20 rows.
- [ ] ESC closes (cv2-09 default).

### Quality
- [ ] tsc / lint / test / build clean.
- [ ] 3 telemetry events firing.

### Documentation
- [ ] COCKPIT.md updated.
- [ ] Roadmap: R-RX-POLISH/4.x → ✅.
- [ ] Capture-inbox.

---

## Cost estimate

| Wave | Tasks | Auto | Composer | Opus | Wall-clock |
|---|---|---|---|---|---|
| 1 | rxss-01 | 1 | 0 | 0 | ~3h |
| 2 | rxss-02 | 1 | 0 | 0 | ~5-6h |
| 3 | rxss-03 | 1 | 0 | 0 | ~3-4h |
| 4 | rxss-04 | 0 | 1 | 0 | ~1h |
| **Total** | **4** | **3** | **1** | **0** | **~10-14h** |

---

## References

- Source plan §R-RX-POLISH/4.x.
- Existing popover: [`frontend/components/consultation/cockpit/PreviousRxPopover.tsx`](../../../../../frontend/components/consultation/cockpit/PreviousRxPopover.tsx).
- Side-sheet contract: [`frontend/lib/patient-profile/aux-surfaces.ts`](../../../../../frontend/lib/patient-profile/aux-surfaces.ts) §SideSheetAnchor.
- Existing API: `listPrescriptionsByPatient` in `frontend/lib/api`.
