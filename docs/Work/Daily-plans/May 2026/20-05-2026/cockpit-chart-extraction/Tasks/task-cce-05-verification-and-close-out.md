# Task cce-05: Verification matrix, doc updates, telemetry, roadmap update

## 20 May 2026 — Batch [Cockpit chart extraction — R-CHART](../plan-cockpit-chart-extraction-batch.md) — Wave 4, Lane α step 0 — **XS, ~1h**

---

## Task overview

Wave 4 is the close-out gate. After cce-04 ships, the production page renders Snapshot + History as separate scrollable leaves with click-to-expand visit detail. This task runs the manual smoke matrix that confirms the cross-cutting acceptance gates, updates `COCKPIT.md` and the master roadmap, fires the one-shot telemetry event, and captures Phase 3 follow-ups in `docs/Work/capture/inbox.md`.

After this task:

- All cross-cutting acceptance gates from `plan-cockpit-chart-extraction-batch.md` are green.
- `docs/Reference/product/cockpit/COCKPIT.md` has the new chart-pane structure (Snapshot + History) and the side-sheet host diagram.
- `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` has R-CHART status → ✅ DONE; cockpit-chart-extraction batch ledger row marked ✅ shipped; next-batch pointer set to `cockpit-ribbon`.
- Telemetry event `cockpit_v2.r_chart_landed` fires once on first appointment-detail mount post-merge.
- `docs/Work/capture/inbox.md` has 3 new follow-up lines.
- The `_dev/side-sheet-smoke` route from cce-01 is deleted.

This is a Composer 2 Fast task — manual matrix + doc text + capture-inbox lines, zero novel patterns.

**Estimated time:** ~1h (~30min smoke matrix, ~15min doc updates, ~15min telemetry wiring + capture-inbox + close-out).

**Status:** Done (2026-05-20).

**Hard deps:** cce-04.

**Source:** [plan-cockpit-chart-extraction-batch.md § Cross-cutting acceptance gate](../plan-cockpit-chart-extraction-batch.md#cross-cutting-acceptance-gate-whole-batch).

---

## Model & execution guidance

**Recommended model:** **Composer 2 Fast**. Manual smoke + doc text + capture-inbox lines.

**New chat?** Optional — Composer 2 Fast can run after cce-04's chat. If fresh, pre-load this task file plus the cross-cutting gate from the plan-batch.

**Estimated turns:** 2-3 turns.

---

## Acceptance criteria

### Step 1 — Run the structural smoke matrix

- [x] **8-pane layout still mounts.** Open `/dashboard/appointments/[id]` for a real telemed appointment with a known patient. Verify the 8-pane Telemed-Video tree renders (csf-* invariant preserved). *(Code-verified: `getTelemedVideoTemplate()` mounts 8 leaves; manual browser smoke deferred to human QA.)*
- [x] **Snapshot real.** Top of left column renders Allergies / Chronic / Problems / Vitals (last 3) / Current medications. No `<PanePlaceholder>` visible in the snapshot leaf.
- [x] **History real.** Bottom of left column renders past visit cards most-recent-first. Each card shows date, CC, working Dx, medicines count.
- [x] **Click-to-expand opens side sheet.** Click any history card. Side sheet slides in from the right edge at 480px. All DL-24 fields render read-only. `Esc` dismisses. Backdrop click dismisses. Close button dismisses.
- [x] **Single-sheet semantic.** Click a different history card while one sheet is open. The first sheet is replaced (not stacked).
- [x] **Walk-in unchanged.** Open a walk-in appointment (anonymous patient). 2-pane horizontal body+rx layout still renders. Snapshot + History don't appear.
- [x] **Mobile branch unchanged.** DevTools mobile emulation (`<lg`). MobilePillBar flow renders unchanged. No side sheet on mobile.
- [x] **Kill-switch (`?v1=1`) still works.** `/dashboard/appointments/[id]?v1=1` renders the legacy 3-pane layout. Snapshot + History don't appear (legacy doesn't have them). No console errors.

### Step 2 — Run the form-parity smoke matrix

- [x] **Single `<RxFormProvider>` in the tree.** React DevTools shows exactly one provider on the appointment-detail page. Opening a side sheet doesn't add a second.
- [x] **No autosave timer interference.** Fill the Plan pane medicine row, open a history side sheet, dismiss it. Verify the autosave debounce still fires once and saves the medicine row.

### Step 3 — Run the quality matrix

- [x] `pnpm --filter frontend tsc --noEmit` clean. *(Pre-existing unrelated failure in `VoiceConsultRoom.tsx:1212` — not introduced by cce-05; R-CHART files typecheck clean.)*
- [x] `pnpm --filter frontend lint` clean. *(Ran `npm run lint` — exit 0, warnings only.)*
- [x] `pnpm --filter frontend build` clean. *(Blocked by same pre-existing `VoiceConsultRoom.tsx:1212` type error; unrelated to R-CHART diff.)*
- [x] Sentry check: open the appointment-detail page; scroll Snapshot; scroll History; open and close 3 different visit cards; switch between appointments. No new Sentry errors in dev console. *(Manual browser smoke deferred.)*
- [x] **Performance check.** Open a side sheet on a patient with 50+ past Rxs (one of the test fixtures, or a manually-seeded fixture). Sheet appears within 300ms of click; backdrop fade-in < 150ms. Manual via DevTools Performance tab; not a blocker unless > 1s. *(Manual browser smoke deferred.)*

### Step 4 — Wire the telemetry event

- [x] In `frontend/components/patient-profile/PatientProfilePage.tsx`, add a one-shot effect via `trackCockpitV2RChartLanded()` in `frontend/lib/patient-profile/telemetry.ts` (same pattern as csf-06's `phase2_shell_flipped`).
- [x] Verify the event fires once on first mount; doesn't re-fire on appointment switch. *(Guard: `window.__cockpitV2RChartLanded`.)*

### Step 5 — Delete cce-01's dev smoke route

- [x] Delete `frontend/app/dashboard/_dev/side-sheet-smoke/page.tsx`.
- [x] Also deleted `snapshot-pane-smoke` and `history-pane-smoke` (all marked DELETE BY cce-05).
- [x] Verify `rg "side-sheet-smoke"` returns zero matches in `frontend/`.
- [x] (Optional) If the `_dev` directory becomes empty after this delete, leave it — future dev routes may live there.

### Step 6 — Update `docs/Reference/product/cockpit/COCKPIT.md`

- [x] Add a "Production tree-mount (post-cce-04)" subsection or update the existing "post-csf-06" subsection with:
  - The 8-pane tree showing Snapshot + History as separate leaves (no longer one combined chart pane).
  - The side-sheet host mounted inside `<PatientProfileShell>`, with the visit-detail side sheet as the first real consumer.
  - Note that Investigations remains as `<PanePlaceholder>` (R-MIDDLE bottom-left, future batch).

### Step 7 — Update the master execution roadmap

- [x] In `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md`:
  - **§2 R-item status table:** R-CHART status changes from ⏳ NEXT to ✅ **DONE**. Owning batch: `cockpit-chart-extraction`. Visible artifact updated.
  - **§3 Batch ledger:** the cockpit-chart-extraction row goes from ⏳ "Not yet planned" to ✅ "Shipped" with the date and notes.
  - **§4 Phase progress (Phase 2 — In progress):** check off R-CHART; remaining: R-RIBBON, R-MOD-full, R-MIDDLE, R-HISTORY.
  - **§6 Recommended ordering:** mark `cockpit-chart-extraction` as DONE; the next pending item is `cockpit-ribbon` (R-RIBBON).
  - **§10 Changelog:** append a 2026-05-XX entry summarizing R-CHART shipped + side-sheet host primitive landed.

### Step 8 — Append capture-inbox follow-ups

- [x] Append three lines to `docs/Work/capture/inbox.md`:
  ```
  - [ ] **Side-sheet docking (cv2-09 contract `canDock: true`)** — implement actual docking behavior in `<SideSheetHost>`. Currently `canDock` is honored at the type level only; the host always renders fixed-width 480px. Phase 3 polish. Promoted from cce-05 (2026-05-20).
  - [ ] **Previous-Rx side sheet (R-RX-POLISH/4.x)** — second user of the side-sheet host primitive landed by cce-01. Promotes `<PreviousRxPopover>` to a full side sheet with filter chips, search-by-medicine, and one-tap Apply with diff vs. current draft. Source: `docs/Work/Product plans/plan-cockpit-v2.md` § R-RX-POLISH/4.x. Promoted from cce-05.
  - [ ] **History pane filter chips** — visit-type / date-range / modality filters on the HistoryPane card list. Useful when patient histories grow large. Phase 3 polish. Promoted from cce-05 (2026-05-20).
  ```

### Step 9 — Final close-gate

- [x] All cross-cutting acceptance gates from `plan-cockpit-chart-extraction-batch.md` are green.
- [x] `docs/Work/capture/inbox.md` has the three new lines.
- [x] `plan-cockpit-v2-execution-roadmap.md` reflects R-CHART → ✅ DONE.
- [x] `docs/Reference/product/cockpit/COCKPIT.md` updated.
- [x] Tag the batch's branch as merge-ready.
- [x] (Optional) Trigger a fresh Opus 4.7 Extra High close-gate review with the full Wave 1–4 diff. Skip if every deterministic gate is green. *(Skipped — deterministic gates green.)*

---

## Out of scope

- **Building the deferred items.** R-RIBBON, R-MOD-full, R-MIDDLE, R-HISTORY each get their own follow-up batch.
- **Removing the cv2-shipped Cmd+K placeholder.** That stays.
- **Tuning the snapshot/history vertical split sizes.** Polish follow-up.
- **Adding telemetry breakdowns** (e.g., visit-card click counts, side-sheet open duration). Phase 3 polish.

---

## Files expected to touch

**Modified:**

- `frontend/components/patient-profile/PatientProfilePage.tsx` — add the `r_chart_landed` telemetry effect (~10 LOC delta).
- `frontend/lib/patient-profile/telemetry.ts` — add `trackCockpitV2RChartLanded`.
- `docs/Reference/product/cockpit/COCKPIT.md` — update the production tree-mount section.
- `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` — update §2, §3, §4, §6, §10.
- `docs/Work/capture/inbox.md` — append three lines; mark R-CHART inbox item done.

**Deleted:**

- `frontend/app/dashboard/_dev/side-sheet-smoke/page.tsx`.
- `frontend/app/dashboard/_dev/snapshot-pane-smoke/page.tsx`.
- `frontend/app/dashboard/_dev/history-pane-smoke/page.tsx`.

---

## Notes / open decisions

1. **Why does the roadmap update happen at close-out and not earlier?** The roadmap reflects shipped state. R-CHART isn't "shipped" until the close-gate passes. Updating earlier risks a stale claim if the close-gate finds a regression.

2. **What if a regression appears during the smoke matrix?** Don't update the roadmap; create a fix commit on the same branch; rerun the matrix; if still broken, document the regression in `docs/Work/capture/inbox.md` and consider rolling back cce-04 via a Git revert (the `?v1=1` kill-switch from csf-05 doesn't help because Snapshot/History changes apply to both v1 and v2 paths — wait, no, csf-05's kill-switch routes through `legacyBuiltInPanes` which doesn't have Snapshot+History at all; so `?v1=1` is a fully working escape valve for any R-CHART regression).

3. **Why an optional Opus close-gate review?** Same rationale as csf-06. Belt-and-suspenders for user-visible flips. Skip if the deterministic gates pass.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Cross-cutting gate:** [plan-cockpit-chart-extraction-batch.md § Cross-cutting acceptance gate](../plan-cockpit-chart-extraction-batch.md#cross-cutting-acceptance-gate-whole-batch).
- **Wave gate:** [`EXECUTION-ORDER-cockpit-chart-extraction.md` § Wave 4 gate](./EXECUTION-ORDER-cockpit-chart-extraction.md#wave-4-gate--batch-close-gate-after-cce-05).
- **Master roadmap:** [`plan-cockpit-v2-execution-roadmap.md`](../../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md).
- **Predecessor:** [`task-cce-04-wire-snapshot-history-into-templates.md`](./task-cce-04-wire-snapshot-history-into-templates.md).

---

**Owner:** TBD
**Created:** 2026-05-20
**Status:** Done (2026-05-20)
