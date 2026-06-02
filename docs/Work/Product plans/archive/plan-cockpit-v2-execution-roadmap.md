> **🗄️ ARCHIVED — Cockpit v2 program completed 2026-05-24 via [cockpit-v2-decommission](../../Daily-plans/May%202026/24-05-2026/cockpit-v2-decommission/) batch.**
>
> This plan and its roadmap are kept for historical reference. They are no
> longer the source of truth.
>
> Current cockpit work tracked in:
> - **Daily plans** under [`docs/Work/Daily-plans/`](../../Daily-plans/) — search for "cockpit-".
> - **Future cockpit product plan(s)** — TBD when the next major cockpit
>   refactor is scoped.
>
> See [`docs/Reference/product/cockpit/COCKPIT.md`](../../../Reference/product/cockpit/COCKPIT.md) for the
> **current** cockpit reference (DL-5 of the decommission batch promoted
> this to the live single source of truth).

---

### 2026-05-24 — Cockpit v2 program completed, plans archived

- All Phase 2 + Phase 3 R-items shipped.
- Kill-switch + `legacyBuiltInPanes` removed (cvd-02).
- This plan + the source `plan-cockpit-v2.md` archived to `Product plans/archive/`.
- `docs/Reference/product/cockpit/COCKPIT.md` is now the live single source of truth.
- `cockpit_v2.program_completed` telemetry event fires per-session for new-load doctors.
- Soak: 5 days (operator override). Kill-switch escape rate: 0% (no production telemetry store).

# Cockpit v2 — Execution roadmap

> **Purpose:** single source of truth for **execution status** of `plan-cockpit-v2.md`. Read this file before planning any new cockpit-v2 batch — it tells you what's done, what's in flight, what's deferred, the recommended next item, and where the file-overlap landmines live.
>
> **Source product plan:** [`plan-cockpit-v2.md`](./plan-cockpit-v2.md). That file has the canonical R-item specs + decision-locks. **Don't duplicate spec content here** — link to it.
>
> **How to update this file:** when a batch ships (or a batch's plan-doc gets created), update §2 (R-item status) + §3 (batch ledger) + §4 (phase progress) + §5 (next-batch recommendation) inline. Keep it ≤ 600 lines; if it gets longer, archive shipped Phase 1 details to a separate file.
>
> **Last updated:** 2026-05-24 (`cockpit-layout-presets-modality` shipped — R-LAYOUT-UX ✅; migration 112 extends preset JSONB with `layout_tree`; `<PaneContextMenu>` + tree mutation engine + `<PresetPicker>` with built-in modality templates + hidden-pane restore. **Last Phase-3 R-item before decommission.** Phase 3 remaining: `cockpit-v2-decommission` only (gated on 4-week soak from cockpit-shell-flip cutover, earliest 2026-06-16).

---

## 1. TL;DR — What you should know in 30 seconds

- **Phase 1 (Foundation)** shipped 2026-05-17 via the **cockpit-v2** batch (`cv2-01..09`). The recursive shell, layout-tree migrator, `RxFormProvider`, four section components, and the auxiliary-surface contracts are all live. Production page is unchanged — Phase 1 was deliberately gated behind Phase 2 cutover.
- **Phase 2 (Content rebuild)** shipped 2026-05-24 — all six R-items ✅ DONE.
- **Phase 2 R-items shipped:** R-CHART (2026-05-20), R-RIBBON (2026-05-21 via `cockpit-ribbon`), R-MOD-full (2026-05-23 via `templates-r-mod`), R-MIDDLE (2026-05-23 via `cockpit-middle-investigations` + `cockpit-middle-rebuild`), R-HISTORY (2026-05-24 via `cockpit-history-pane`).
- **Phase 3 (Polish + power)** fully planned 2026-05-24 — six batches: 4× rx-polish-* (R-RX-POLISH split into densification / favorites / shortcuts / side-sheet) + `cockpit-layout-presets-modality` (R-LAYOUT-UX) + `cockpit-v2-decommission` (program close-out). All planned same-day; sequencing locked in §6 below; ~16-22 single-engineer days, ~10-12 two-engineer days. Decommission gates on a 4-week soak from cockpit-shell-flip cutover (earliest run 2026-06-16).
- **Recommended next execution start** (per §6): **`cockpit-v2-decommission`** — kill-switch removal + program archive; hard-gated on cvd-01 pre-flight (4-week soak + < 1% escape rate, earliest 2026-06-16). R-LAYOUT-UX shipped 2026-05-24 via `cockpit-layout-presets-modality` (clpm-06 close-out).

---

## 2. R-item status (the live ledger)

| R-item | Phase | Effort | Status | Owning batch | Visible artifact |
|---|---|---|---|---|---|
| **R-SHELL** — Nested pane shell upgrade | 1 | 6-8 days | ✅ **DONE** | [`cockpit-v2`](../Daily-plans/May%202026/17-05-2026/cockpit-v2/) (cv2-01, cv2-02, cv2-03) | Recursive `<PatientProfileShell>`; `PaneDefinition.children` walked; layout-tree v3→v4 migrator |
| **R-RX-FORM** — PrescriptionForm Strangler Fig | 1 | 4-5 days | ✅ **DONE** | [`cockpit-v2`](../Daily-plans/May%202026/17-05-2026/cockpit-v2/) (cv2-04, cv2-05, cv2-06, cv2-07) | `<RxFormProvider>` + 4 section components + migration 103 (SOAP fields expansion) |
| **R-FUTURE-PROOFING** — Aux-surface contracts | 1 | 2 days | ✅ **DONE** | [`cockpit-v2`](../Daily-plans/May%202026/17-05-2026/cockpit-v2/) (cv2-09) | Tab/side-sheet/floating-dock/modal/Cmd+K/AI-slot interfaces in `aux-surfaces.ts`; Cmd+K stub in shell |
| **(N/A)** — Provider lift + production cutover | 2 | 5 days | 🟡 **IN FLIGHT** | [`cockpit-shell-flip`](../Daily-plans/May%202026/19-05-2026/cockpit-shell-flip/) (csf-01..06, planned 2026-05-19) | `/dashboard/appointments/[id]` flips to 8-pane tree; `?v1=1` kill-switch; History + Investigations as tagged placeholders |
| **R-CHART** — Chart pane vertical split | 2 | 2 days | ✅ **DONE** | [`cockpit-chart-extraction`](../Daily-plans/May%202026/20-05-2026/cockpit-chart-extraction/) (cce-01..05, shipped 2026-05-20) | `<SnapshotPane>` + `<HistoryPane>` as separate scrollable leaves; click-to-expand visit cards via cv2-09's side-sheet contract |
| **R-RIBBON** — Patient ribbon strip | 2 | 2 days | ✅ **DONE** | [`cockpit-ribbon`](../Daily-plans/May%202026/21-05-2026/cockpit-ribbon/) (crb-01..04, shipped 2026-05-21) | Always-visible 52px strip above all panes; identity (age · sex · weight), allergies, chronic, 💊 active meds count, 🎯 Treating Dx mirror |
| **R-MOD-full** — Modality templates | 2 | 2-3 days | ✅ **DONE** | [`templates-r-mod`](../Daily-plans/May%202026/21-05-2026/templates-r-mod/) (tmr-01..05, shipped 2026-05-23) | `getTelemedVoiceTemplate` / `getTelemedTextTemplate` / `getReviewTemplate` factories + `mapStateToTemplate(state, modality)` + doctor-settings `cockpit_template_override` (migration 106) |
| **R-MIDDLE** — Middle column rebuild | 2 | 5-6 days | ✅ **DONE** (bottom-left via [`cockpit-middle-investigations`](../Daily-plans/May%202026/21-05-2026/cockpit-middle-investigations/); rest via [`cockpit-middle-rebuild`](../Daily-plans/May%202026/21-05-2026/cockpit-middle-rebuild/)) | cmi-01..03 + cmr-01..07 | `<InvestigationsPane>` + Assessment strip / Safety strip / Plan action footer / BodyZone / narrow-monitor auto-merge all live in all four templates |
| **R-HISTORY** — Right column rebuild | 2 | 3-4 days | ✅ **DONE** | [`cockpit-history-pane`](../Daily-plans/May%202026/21-05-2026/cockpit-history-pane/) (chp-01..05, shipped 2026-05-24) | BMI badge on existing VitalsGrid + General/Systemic exam textareas via delimited serialization + test results textarea inside ObjectiveSection; reserved tab-contract slots on Subjective/Objective panes |
| **R-RX-POLISH** — Rx polish items | 3 | 5-6 days | ✅ **DONE** (all four sub-batches shipped 2026-05-24) | [`rx-polish-densification`](../Daily-plans/May%202026/24-05-2026/rx-polish-densification/) ✅ (rxd-01..04, /2.1) + [`rx-polish-favorites`](../Daily-plans/May%202026/24-05-2026/rx-polish-favorites/) ✅ (rxf-01..07, /2.2 + /2.3, migrations 108+109) + [`rx-polish-shortcuts`](../Daily-plans/May%202026/24-05-2026/rx-polish-shortcuts/) ✅ (rxs-01..04, /3.x) + [`rx-polish-side-sheet`](../Daily-plans/May%202026/24-05-2026/rx-polish-side-sheet/) ✅ (rxss-01..04, /4.x) | Medicine row densification ✅; per-doctor drug autocomplete frequency ranking + favorite chip strip + `rx-favorites` side sheet ✅; Plan-pane shortcuts + Cmd+K + `?` help ✅; Previous-Rx side sheet on Plan zone ✅ |
| **R-LAYOUT-UX** — Split / merge / preset escape hatch | 3 | 3-4 days | ✅ **DONE** | [`cockpit-layout-presets-modality`](../Daily-plans/May%202026/24-05-2026/cockpit-layout-presets-modality/) (clpm-01..06, shipped 2026-05-24) | Right-click `<PaneContextMenu>` (Split H/V, Merge, Collapse, Hide); recursive layout-tree mutation engine (clpm-04 Opus); migration 112 extends 099 preset JSONB with `layout_tree`; built-in modality templates + hidden-pane restore in `<PresetPicker>`; soft cap of 10 sub-panes (toast on 11th). **Last Phase-3 R-item before decommission.** |
| **(N/A)** — Cockpit v2 program close-out | 3 | 1 day | 🟡 **IN FLIGHT** (planned 2026-05-24; gated on 4-week soak + all 5 preceding 24-05 batches shipped) | [`cockpit-v2-decommission`](../Daily-plans/May%202026/24-05-2026/cockpit-v2-decommission/) (cvd-01..03) | Removes `?v1=1` kill-switch + `legacyBuiltInPanes` array; archives `plan-cockpit-v2.md` + roadmap to `Product plans/archive/`; promotes `docs/Reference/product/cockpit/COCKPIT.md` to live single source of truth. Hard pre-flight gate (cvd-01) verifies soak + < 1% escape rate before any deletion. |

**Status legend:** ✅ done · 🟡 in flight · ⏳ deferred · ❌ cancelled.

---

## 3. Batch ledger (chronological)

This is the source of truth for **which daily-plans batch shipped what**. New entries go at the bottom.

| Date | Batch | Status | R-items | Tasks | Notes |
|---|---|---|---|---|---|
| 2026-05-17 | [`cockpit-v2`](../Daily-plans/May%202026/17-05-2026/cockpit-v2/) | ✅ Shipped | R-SHELL, R-RX-FORM, R-FUTURE-PROOFING | cv2-01..09 (9 tasks) | Phase 1 complete. cv2-08 is the verification report (regression baseline). cv2-03's `/v2-tree` smoke route was deleted by cv2-08; the 8-pane structure is mounted only via tests until Phase 2 cutover. |
| 2026-05-19 | [`cockpit-shell-flip`](../Daily-plans/May%202026/19-05-2026/cockpit-shell-flip/) | 🟡 Planned, in flight | partial Phase 2 (provider lift + production cutover; defers R-CHART, R-RIBBON, R-MOD-full, R-MIDDLE, R-HISTORY) | csf-01..06 (6 tasks) | Wave 1 (csf-01 + csf-02) → Wave 2 (csf-03) → Wave 3 (csf-04 + csf-05) → Wave 4 (csf-06). Zero Opus tasks. Zero new migrations. |
| 2026-05-20 | [`cockpit-chart-extraction`](../Daily-plans/May%202026/20-05-2026/cockpit-chart-extraction/) | ✅ Shipped | R-CHART | cce-01..05 (5 tasks) | `<SnapshotPane>` + `<HistoryPane>` split; `<SideSheetHost>` first real consumer; visit-detail side sheet with single-sheet semantic. Dev smoke routes deleted by cce-05. Telemetry: `cockpit_v2.r_chart_landed`. |
| 2026-05-21 | [`cockpit-ribbon`](../Daily-plans/May%202026/21-05-2026/cockpit-ribbon/) | ✅ Shipped | R-RIBBON | crb-01..04 (4 tasks) | Wave 1 (crb-01 ribbon data hook) → Wave 2 (crb-02 PatientRibbon component) → Wave 3 (crb-03 production mount) → Wave 4 (crb-04 verification). Zero Opus tasks. Zero new migrations. Telemetry: `cockpit_v2.r_ribbon_landed`. |
| 2026-05-21 | [`templates-r-mod`](../Daily-plans/May%202026/21-05-2026/templates-r-mod/) | ✅ Shipped 2026-05-23 | R-MOD-full | tmr-01..05 (5 tasks) | Wave 1 (tmr-01 factories + tmr-02 `mapStateToTemplate` + tmr-03 migration `106_doctor_settings_cockpit_template_override.sql`) → Wave 3 (tmr-04 wire-up) → Wave 4 (tmr-05 verification). Telemetry: `cockpit_v2.r_mod_voice_landed` / `r_mod_text_landed` / `r_mod_review_landed`. |
| 2026-05-21 | [`cockpit-middle-investigations`](../Daily-plans/May%202026/21-05-2026/cockpit-middle-investigations/) | ✅ Shipped 2026-05-23 (`b634e47`+) | partial R-MIDDLE (bottom-left only) | cmi-01..03 (3 tasks) | Wave 1 (cmi-01 `<InvestigationsPane>`) → Wave 2 (cmi-02 wire into all four template factories) → Wave 3 (cmi-03 verification). Zero Opus tasks. Zero new migrations. **Last `<PanePlaceholder>` cleared from production.** Telemetry: `cockpit_v2.r_middle_inv_landed`. |
| 2026-05-21 | [`cockpit-middle-rebuild`](../Daily-plans/May%202026/21-05-2026/cockpit-middle-rebuild/) | ✅ Shipped 2026-05-23 (cmr-07 close-out) | R-MIDDLE rest (full R-MIDDLE ✅) | cmr-01..07 (7 tasks) | Wave 1 — five middle-column components. Wave 2 — cmr-06 wires into all four template factories. Wave 3 — cmr-07 verification + docs + 5 telemetry events. Zero Opus tasks. Zero new migrations. Telemetry: `cockpit_v2.r_middle_assessment_landed` / `r_middle_safety_landed` / `r_middle_footer_landed` / `r_middle_body_refactored` / `r_middle_narrow_merge_landed`. |
| 2026-05-24 | [`cockpit-history-pane`](../Daily-plans/May%202026/21-05-2026/cockpit-history-pane/) | ✅ Shipped (`b634e47`+) | R-HISTORY | chp-01..04 (5 tasks; chp-05 source-plan close-out pending) | Wave 1 two parallel lanes: chp-01 BMI badge on existing `<VitalsGrid>` + chp-02 ObjectiveSection enhancements (General/Systemic exam split via delimited serialization in `frontend/lib/cockpit/exam-findings.ts` + test results textarea + legacy `vitalsText` demoted to `<details>`). Wave 2 — chp-03 telemetry useEffect + `tabs: undefined` reservation. Wave 3 — chp-04 per-batch close-out. Wave 4 — chp-05 source-product-plan Phase-2-COMPLETE annotation (pending). Zero Opus tasks. Zero new migrations. Telemetry: `cockpit_v2.r_history_landed`. **Phase 2 of cockpit-v2 ✅ COMPLETE.** |
| 2026-05-24 | [`rx-polish-densification`](../Daily-plans/May%202026/24-05-2026/rx-polish-densification/) | ✅ Shipped | R-RX-POLISH/2.1 | rxd-01..04 (4 tasks) | Wave 1 (rxd-01 `isMedicineRowComplete` helper + tests). Wave 2 (rxd-02 `<MedicineRow>` two-state rendering + rxd-03 `<PlanSection>` active-row tracking via stable `medicineInstanceIds`). Wave 3 (rxd-04 verification + telemetry + docs). Zero Opus tasks. Zero new migrations. Telemetry: `cockpit_v2.r_rx_polish_densification_landed`. **First Phase 3 batch shipped.** |
| 2026-05-24 | [`rx-polish-favorites`](../Daily-plans/May%202026/24-05-2026/rx-polish-favorites/) | ✅ Shipped | R-RX-POLISH/2.2 + /2.3 | rxf-01..07 (7 tasks) | Wave 1 — rxf-01 migration `108_doctor_drug_usage.sql` + rxf-02 `109_doctor_drug_favorites.sql` + rxf-03 send-handler usage-increment. Wave 2 — rxf-04 favorites CRUD + `<FavoritesSideSheet>` + `<FavoritesChipStrip>` + rxf-05 `DrugAutocomplete` personal ranking. Wave 3 — rxf-06 wire chip strip into `<PlanSection>`. Wave 4 — rxf-07 verification + docs + 3 telemetry events. Zero Opus tasks. **Two new migrations 108 + 109.** Telemetry: `cockpit_v2.r_rx_polish_favorites_landed` / `r_rx_polish_favorite_applied` / `r_rx_polish_ranking_landed`. **R-RX-POLISH fully ✅** (all four sub-batches). |
| 2026-05-24 | [`rx-polish-shortcuts`](../Daily-plans/May%202026/24-05-2026/rx-polish-shortcuts/) | ✅ Shipped | R-RX-POLISH/3.x | rxs-01..04 (4 tasks) | Wave 1 (parallel: rxs-01 `usePaneKeyboardShortcuts` hook + rxs-02 command-registry). Wave 2 (rxs-03 wire 4 Plan-pane shortcuts + Cmd+K real palette + shell `data-cockpit-pane-id` attrs). Wave 3 (rxs-04 verification + `<KeyboardHelpDialog>` + `?` key + telemetry). Zero Opus tasks. Zero new migrations. Telemetry: `cockpit_v2.r_rx_polish_shortcut_used` (per-press, not one-shot). |
| 2026-05-24 | [`rx-polish-side-sheet`](../Daily-plans/May%202026/24-05-2026/rx-polish-side-sheet/) | ✅ Shipped | R-RX-POLISH/4.x | rxss-01..04 (4 tasks) | Wave 1 (rxss-01 `usePriorRxList` + `prior-rx-filter` helper). Wave 2 (rxss-02 `<PreviousRxSideSheet>` + `PreviousRxSideSheetAnchor`; `react-window` when &gt; 20 rows). Wave 3 (rxss-03 `rx-diff.ts` + `<PreviousRxPlanTrigger>` in Plan zone; DL-1 popover retained on non-cockpit mounts). Wave 4 (rxss-04 verification + docs + 3 telemetry events). Zero Opus tasks. Zero new migrations. Telemetry: `cockpit_v2.r_rx_polish_side_sheet_opened` / `_filter_changed` / `_applied`. |
| 2026-05-24 | [`cockpit-layout-presets-modality`](../Daily-plans/May%202026/24-05-2026/cockpit-layout-presets-modality/) | ✅ Shipped | R-LAYOUT-UX | clpm-01..06 (6 tasks) | Wave 1 (clpm-01 migration **112** — extends 099 CHECK to permit `layout_tree` alongside legacy `layout`). Wave 2 (clpm-02 tree API client + `layout-presets-builtin.ts` + clpm-03 `<PaneContextMenu>` + shell header wire). Wave 3 (clpm-04 Opus — `layout-tree-mutations.ts` + truth-table tests). Wave 4 (clpm-05 `<PresetPicker>` apply/save/reset/hidden-restore; clpm-06 verification + docs). **One Opus task.** **One new migration 112.** Telemetry: `cockpit_v2.r_layout_ux_context_menu_opened` / `_tree_mutation` / `_preset_saved` / `_preset_applied`. **Last Phase-3 R-item ✅ — only decommission remains.** |
| 2026-06-{day} | [`cockpit-v2-decommission`](../Daily-plans/May%202026/24-05-2026/cockpit-v2-decommission/) | 🟡 Planned (HARD GATE — soak + escape rate) | (none — closes program) | cvd-01..03 (3 tasks) | **MUST be last.** Wave 1 (cvd-01 pre-flight: verify all 5 preceding 24-05 batches shipped + 4-week soak from 2026-05-19 → 2026-06-16 + kill-switch escape rate < 1% over last 7 days; if any fails → HALT). Wave 2 (cvd-02 remove `?v1=1` URL parsing + delete `legacyBuiltInPanes` + `@deprecated` markers on kill-switch helpers + `trackCockpitV2ProgramCompleted` event; cvd-03 move plans to `Product plans/archive/` with banner, promote `docs/Reference/product/cockpit/COCKPIT.md` to live SoT). Zero Opus tasks. Zero new migrations (legacy `layout` shape in 099 preserved per DL-3 — Q3 cleanup batch). Telemetry: `cockpit_v2.program_completed` (one-shot per session). |
| 2026-05-26 | [`cockpit-plan-pane-deduplication`](../Daily-plans/May%202026/26-05-2026/cockpit-plan-pane-deduplication/) | ✅ Shipped | (post-program polish) | ppd-01..05 (5 tasks) | Wave 1 (ppd-01 lift prop chain) → Wave 2 parallel (ppd-02 comp-root SOAP hide + ppd-03 entry-mode/photo hide + ppd-04 templates wire) → Wave 3 (ppd-05 footer audit + close-out). Zero Opus tasks. Zero new migrations. Telemetry: `cockpit_polish.plan_pane_dedup_landed`. Plan column Medicines-only; right column owns Subjective + Objective. |
| 2026-05-26 | [`cockpit-nav-clarity`](../Daily-plans/May%202026/26-05-2026/cockpit-nav-clarity/) | ✅ Shipped | (post-program polish) | cnc-01..05 (5 tasks) | Wave 1 (`cockpitMode` + `<RxSectionNav>` gate) → Wave 2 parallel ("Chart Notes" title, Investigations empty-state, PatientRibbon labels) → Wave 3 (cnc-05 close-out). Zero Opus tasks. Zero new migrations. Telemetry: `cockpit_polish.nav_clarity_landed`. |
| 2026-05-26 | [`cockpit-chart-density`](../Daily-plans/May%202026/26-05-2026/cockpit-chart-density/) | ✅ Shipped | (post-program polish) | ccd-01..04 (4 tasks) | Wave 1 (ccd-01 unified empty-state + ccd-02 Snapshot live-draft + ccd-03 disclosure chevron) → Wave 2 (ccd-04 verification + close-out). Zero Opus tasks. Zero new migrations. Telemetry: `cockpit_polish.chart_density_landed`. |
| 2026-05-26 | [`cockpit-polish-visual`](../Daily-plans/May%202026/26-05-2026/cockpit-polish-visual/) | ✅ Shipped | (post-program polish) | cpv-01..08 (8 tasks) | Wave 1 (AssessmentStrip zero-state + SaveStatusPill copy) → Wave 2 parallel (BMI badge + exam labels) → Wave 3 parallel (PaneHeader unification + color tokens + misc nits) → Wave 4 (cpv-08 verification + close-out). Zero Opus tasks. Zero new migrations. Telemetry: `cockpit_polish.visual_system_landed`. |

**Other in-flight batches (not cockpit-v2 owned, but file-adjacent):**

| Date | Batch | Status | Surface | Files touched | Cockpit overlap? |
|---|---|---|---|---|---|
| 2026-05-18 | [`patients-redesign`](../Daily-plans/May%202026/18-05-2026/patients-redesign/) | 🟡 Planned, in flight | `frontend/app/dashboard/patients-v2/**` + `frontend/components/patients-v2/**` + new `backend/src/services/patient-chart-service.ts` aggregator endpoints | `patients-v2` ESLint zone (separate from cockpit) | None — separate route tree, separate component zone. |

---

## 4. Phase-by-phase progress

### Phase 1 — Foundation ✅ DONE

Shipped 2026-05-17 via the cockpit-v2 batch (cv2-01..09). Phase 1 gate cleared per the cv2-08 verification report.

**What landed:**

- `<PatientProfileShell>` walks recursive `PaneDefinition.children` (cv2-01).
- Layout-tree v3 → v4 migrator with column-width preservation (cv2-02).
- `TELEMED_VIDEO_TEMPLATE` literal + `<PanePlaceholder>` component (cv2-03 — both refactored / consumed by csf-* in Phase 2).
- Migration `103_prescription_soap_fields_expansion.sql` (cv2-04).
- `<RxFormProvider>` + `useRxForm` (cv2-05).
- `<SubjectiveSection>`, `<ObjectiveSection>`, `<AssessmentSection>`, `<PlanSection>` extracted from monolithic `PrescriptionForm` (cv2-06, cv2-07).
- `/v2-tree` smoke route mounted, proved the recursive shell works, then deleted (cv2-03 created → cv2-08 deleted).
- Auxiliary-surface contracts (Tab / SideSheet / FloatingDock / Modal / Cmd+K / AI slot) in `aux-surfaces.ts` (cv2-09).
- Cmd+K placeholder bar bound at the shell level (cv2-09).

**What did NOT land in Phase 1 (deliberate):**

- No production cutover at `/dashboard/appointments/[id]`. `builtInPanes` (legacy 3-pane chart/body/rx) still mounted as the production default. Phase 2's `cockpit-shell-flip` does the cutover.
- No real content in any pane beyond what the existing components already render.

### Phase 2 — Content rebuild ✅ DONE (closed 2026-05-24)

Sequenced as a series of small batches rather than one monolithic batch. **`cockpit-shell-flip` was the foothold**; the remaining five batches each tackled one R-item (or sub-item). All six Phase-2 R-items shipped by 2026-05-24.

**Sequencing (locked 2026-05-21, completed 2026-05-24):**

1. ~~**R-CHART** (`cockpit-chart-extraction`, ~2 days)~~ ✅ **DONE** 2026-05-20.
2. ~~**R-RIBBON** (`cockpit-ribbon`, ~2 days)~~ ✅ **DONE** 2026-05-21. Always-visible 52px patient strip; identity / allergies / chronic / 💊 / 🎯 Treating Dx mirror.
3. ~~**R-MOD-full** (`templates-r-mod`, ~2-3 days)~~ ✅ **DONE** 2026-05-23. Voice/text/review templates + `mapStateToTemplate` + doctor-settings override.
4. ~~**R-MIDDLE bottom-left** (`cockpit-middle-investigations`, ~2 days)~~ ✅ **DONE** 2026-05-23. `<InvestigationsPane>` live in all four templates; last production `<PanePlaceholder>` removed.
5. ~~**R-MIDDLE rest** (`cockpit-middle-rebuild`, ~3-4 days)~~ ✅ **DONE** 2026-05-23. Assessment sticky strip + safety strip + action footer + BodyZone + narrow-monitor auto-merge live in all four templates.
6. ~~**R-HISTORY** (`cockpit-history-pane`, ~3-4 days)~~ ✅ **DONE** 2026-05-24. BMI badge on existing VitalsGrid + General/Systemic exam split via delimited serialization + test results textarea + legacy vitalsText demoted. **Phase 2 closed at 2026-05-24.**

**Phase 2 gate (locks the cutover):**

- All four templates render correctly with real content (R-MOD-full).
- Ribbon `🎯 Treating` live-syncs with Dx field edits within 200ms (R-RIBBON acceptance).
- Modality switching auto-selects template; manual override persists within visit (R-MOD-full).
- Both deferred placeholders (History, Investigations) replaced with real content (R-CHART ✅ + R-MIDDLE bottom-left ✅ — **gate cleared 2026-05-23**).
- `cockpit-shell-flip`'s `?v1=1` kill-switch can be deleted at this gate (Phase 3 close-out).

### Phase 3 — Polish + power 🟡 PLANNED (all 6 batches drafted 2026-05-24)

Phase 3 splits R-RX-POLISH into four sub-batches (densification / favorites / shortcuts / side-sheet), keeps R-LAYOUT-UX as one big batch (`cockpit-layout-presets-modality`), and adds a final program close-out batch (`cockpit-v2-decommission`). All planned in one same-day burst on 2026-05-24 at user request.

**Sequencing (locked 2026-05-24):**

1. ~~**`rx-polish-densification`** (R-RX-POLISH/2.1)~~ ✅ **DONE** 2026-05-24.
2. ~~**`rx-polish-favorites`** (R-RX-POLISH/2.2 + /2.3)~~ ✅ **DONE** 2026-05-24. Migrations 108 + 109; per-doctor drug ranking + favorite chips + side sheet.
3. ~~**`rx-polish-shortcuts`** (R-RX-POLISH/3.x)~~ ✅ **DONE** 2026-05-24. Pane-scoped hotkeys + real Cmd+K palette + `?` help dialog.
4. ~~**`rx-polish-side-sheet`** (R-RX-POLISH/4.x)~~ ✅ **DONE** 2026-05-24. Previous-Rx side sheet on cockpit Plan zone via cv2-09 anchor; popover retained on non-cockpit mounts (DL-1).
5. ~~**`cockpit-layout-presets-modality`** (R-LAYOUT-UX, ~2-3 days)~~ ✅ **DONE** 2026-05-24. Recursive tree mutations + context menu + preset picker. **One Opus task** (clpm-04). Ran before decommission (file overlap on `PatientProfilePage.tsx`).
6. **`cockpit-v2-decommission`** (~half-day, **gated**) — removes kill-switch + archives plans. **MUST be last batch of the cockpit-v2 program**. Hard pre-flight gate (cvd-01) verifies 4-week soak (earliest 2026-06-16) + ≥ 5 preceding batches shipped + < 1% kill-switch escape rate.

**Phase 3 gate (closes the cockpit-v2 program):**

- All four R-RX-POLISH sub-batches shipped (rxd-04, rxf-07, rxs-04, rxss-04 close-outs).
- R-LAYOUT-UX shipped (clpm-06 close-out) ✅ 2026-05-24.
- `cockpit-v2-decommission` pre-flight (cvd-01) PASS → cvd-02 ships kill-switch removal → cvd-03 archives plans.
- `?v1=1` kill-switch + `legacyBuiltInPanes` array deleted (cvd-02).
- `plan-cockpit-v2.md` + `plan-cockpit-v2-execution-roadmap.md` moved to `Product plans/archive/` with banner (cvd-03 / DL-4).
- `docs/Reference/product/cockpit/COCKPIT.md` promoted to "live single source of truth" (cvd-03 / DL-5).
- `cockpit_v2.program_completed` telemetry event firing per session (cvd-02 / DL-8).

---

## 5. How to pick the next batch

Decision rules (apply in order; first one that triggers wins):

1. **Visible-placeholder priority** — if any in-production layout has a `<PanePlaceholder>` tagged with an R-item, prioritise the R-item that fills it. (None in production as of 2026-05-23 — Investigations placeholder cleared by `cockpit-middle-investigations`.)
2. **Conflict-free over conflict-prone** — if two R-items are equal in priority, prefer the one whose file-overlap heatmap (§7) is greener vs the in-flight batches.
3. **Smaller scope first** — when picking between two equally-sized-by-impact items, prefer the smaller (≤ 3 days) batch over the larger (≥ 5 days). Smaller batches close faster, free up context, and reduce merge-conflict surface.
4. **Front-of-pipeline before back** — within a phase, prefer R-items whose successors depend on them. (R-MIDDLE depends on R-MOD-full's auto-switch; R-HISTORY depends on stable Subjective/Objective from csf-03.)
5. **User-visible over chrome-only** — when scope is tied, prefer R-items that change pane content (R-CHART, R-MIDDLE, R-HISTORY) over R-items that add chrome above the panes (R-RIBBON) or add new modality variants (R-MOD-full). Doctors notice content changes immediately; chrome and modality variants are slower-burning wins.

**Today's pick (2026-05-24):** All six remaining Phase-3 items planned in a single same-day burst per user request ("create the phase 3 batch too" → "all six"). Sequencing per dependency rules #4 (front-of-pipeline — `rx-polish-densification` unblocks `rx-polish-favorites`; everything must precede `cockpit-v2-decommission`) + #2 (conflict-free parallelism — `rx-polish-shortcuts` and `rx-polish-side-sheet` are disjoint from the densification/favorites lane and from layout-presets; can run in parallel with any other batch). The decommission batch is the explicit "phase gate enforcer" — its cvd-01 pre-flight hard-gates on the 4-week soak + < 1% escape rate.

**Historical picks:**
- 2026-05-20 — R-CHART won on rules #1 (placeholder), #2 (low overlap), #3 (smallest), and #5 (content). Planned via `cockpit-chart-extraction`.
- 2026-05-21 (first update) — R-RIBBON won on rule #2 (zero overlap with in-flight cce-* and disjoint enough from csf-* to start Wave 1+2 in parallel) and rule #3 (smallest remaining; ~7h total). Planned via `cockpit-ribbon`.
- 2026-05-21 (second update) — All four remaining Phase-2 R-items planned in one burst (user request: "create next batches" → "all four"). Sequencing per rule #4 (templates-r-mod first; unblocks cockpit-middle-rebuild) + rule #2 (parallelizable disjoint files between templates-r-mod / cockpit-middle-investigations / cockpit-history-pane).
- 2026-05-24 — All six Phase-3 batches planned in one burst (user request: "yeah create the phase 3 batch too" → "all six"). Sequencing: rx-polish-densification first (rule #3 smallest + unblocks favorites); rx-polish-favorites stacks on it; rx-polish-shortcuts + rx-polish-side-sheet parallelizable disjoint surfaces; cockpit-layout-presets-modality before decommission (file overlap on `PatientProfilePage.tsx`); cockpit-v2-decommission strictly last (rule #4 — gates Phase 3 GATE).

---

## 6. Recommended ordering (locked 2026-05-24, re-evaluate weekly)

```
[DONE]   cockpit-v2 (Phase 1)                                       2026-05-17
[DONE]   cockpit-shell-flip (Phase 2 foothold)                      2026-05-19
[DONE]   cockpit-chart-extraction (R-CHART)                         2026-05-20
[DONE]   cockpit-ribbon (R-RIBBON)                                  2026-05-21
[DONE]   templates-r-mod (R-MOD-full)                               2026-05-23
[DONE]   cockpit-middle-investigations (R-MIDDLE bottom-left)       2026-05-23
[DONE]   cockpit-middle-rebuild (R-MIDDLE rest)                     2026-05-23
[DONE]   cockpit-history-pane (R-HISTORY)                           2026-05-24  ← Phase 2 GATE
─────── PHASE 2 GATE — Phase 3 unlocks ───────
[DONE]    rx-polish-densification (R-RX-POLISH/2.1)                 2026-05-24
[DONE]    rx-polish-shortcuts (R-RX-POLISH/3.x)                     2026-05-24
[DONE]    rx-polish-favorites (R-RX-POLISH/2.2 + /2.3)              2026-05-24
[DONE]    rx-polish-side-sheet (R-RX-POLISH/4.x)                    2026-05-24
[DONE]    cockpit-layout-presets-modality (R-LAYOUT-UX)              2026-05-24  ← last Phase-3 R-item
─────── 4-week soak from 2026-05-19 → earliest 2026-06-16 ───────
[NEXT]    cockpit-v2-decommission (delete v1 kill-switch + archive) ~half-day   · HARD GATE
─────── PHASE 3 GATE — cockpit-v2 program complete ───────
```

**∥ = parallelizable with the previous step (disjoint files).** Two engineers can compress Phase 3 substantially:
- Engineer A: `rx-polish-densification` → `rx-polish-favorites` → `cockpit-layout-presets-modality` → join at decommission.
- Engineer B: `rx-polish-shortcuts` ∥ `rx-polish-side-sheet` (truly disjoint surfaces — keyboard hooks + command palette vs. side-sheet UI + diff helper); both shippable in parallel by one engineer or sequentially without blocking A.

Both engineers join at `cockpit-v2-decommission`. Sequential single-engineer wall-clock: ~10-12 days (excluding the soak wait, which can run in calendar time alongside other non-cockpit work). Two-engineer wall-clock: ~6-8 days (still excluding soak).

The 4-week soak window between `cockpit-shell-flip`'s production cutover (2026-05-19) and the earliest decommission run (2026-06-16) is a calendar gate, not a work gate — Phase 3 batches 1-5 can ship in any order during that window without affecting the decommission readiness.

---

## 7. File-overlap heatmap (planning landmine map)

Use this when scoping a new batch to spot conflicts with in-flight batches. Rows = files; columns = batches. Cell = `R` (read-only) / `W` (write) / `C` (create) / `D` (delete) / `—` (no touch).

| File | csf-* (cockpit-shell-flip) | cockpit-ribbon (R-RIBBON, shipped) | templates-r-mod (R-MOD-full, shipped) | cockpit-middle-investigations (R-MIDDLE bl, shipped) | cockpit-middle-rebuild (R-MIDDLE rest, shipped) | cockpit-history-pane (R-HISTORY, shipped) |
|---|---|---|---|---|---|---|
| `frontend/lib/patient-profile/templates.tsx` | W (csf-02 + csf-03) | — | W (tmr-01 — 3 new factories + `mapStateToTemplate` consumer + shared helpers extracted) | W (cmi-02 — replace Investigations PanePlaceholder) | W (cmr-06 — wire 5 new components into makeMiddleColumn / makeMiddleBottomRow + container-query setup) | W (chp-03 — `tabs: undefined` reservation on subjective + objective panes across all factories) |
| `frontend/components/patient-profile/PatientProfilePage.tsx` | W (csf-01 + csf-04 + csf-05 + csf-06) | W (mount `<PatientRibbon>` above shell) | W (tmr-04 — consume `mapStateToTemplate`) | — | — | — |
| `frontend/lib/patient-profile/state.ts` (or `derive-cockpit-state.ts`) | — | — | W (tmr-02 — add `mapStateToTemplate(state, modality, override)`) | — | — | — |
| `frontend/components/patient-profile/panes/SubjectivePane.tsx` | C (csf-03) | — | — | — | — | W (chp-03 — docstring comment for tab slot) |
| `frontend/components/patient-profile/panes/ObjectivePane.tsx` | C (csf-03) | — | — | — | — | W (chp-03 — telemetry useEffect + payload computation) |
| `frontend/components/patient-profile/panes/ConsultationBodyPane.tsx` | R (csf-03) | — | — | — | R (cmr-04 wraps via `<BodyZone>`; no direct mod) | — |
| `frontend/components/patient-profile/panes/RxPane.tsx` | R (csf-03) | — | — | — | W (cmr-03 — `actionsInFooter` prop to suppress inline action area) | — |
| `frontend/components/cockpit/rx/RxFormContext.tsx` | W (csf-01) | R (ribbon consumes Treating Dx mirror) | — | — | R (cmr-01 AssessmentStrip subscribes to `fields.diagnosis` + DDx) | R (chp-02 verifies fields; no mod expected) |
| `frontend/components/cockpit/rx/inputs/VitalsGrid.tsx` | — | — | — | — | — | W (chp-01 — add `<BmiBadge>` sub-component) |
| `frontend/components/cockpit/rx/sections/ObjectiveSection.tsx` | — | — | — | — | — | W (chp-02 — split exam textareas + test results + legacy demote) |
| `frontend/components/cockpit/rx/sections/AssessmentSection.tsx` | — | — | — | — | W (cmr-01 — hide Dx/DDx when AssessmentStrip present) | — |
| `frontend/components/consultation/cockpit/PrescriptionFormCompositionRoot.tsx` | — | — | — | W (cmi-01 — extract investigations chip-row into `<InvestigationsPane>`) | — | — |
| `frontend/lib/consultation/derive-cockpit-state.ts` | — | — | (replaced by state.ts above) | — | — | — |
| `frontend/lib/patient-profile/types.ts` | R (csf-02) | — | — | — | — | — |
| `frontend/lib/cockpit/exam-findings.ts` (new) | — | — | — | — | — | C (chp-02 — parseExam + serializeExam helpers) |
| `frontend/components/ehr/SnapshotPanel.tsx` (new) | — | — | — | — | — | — |
| `frontend/components/ehr/HistoryPanel.tsx` (new) | — | — | — | — | — | — |
| `frontend/components/patient-profile/PatientRibbon.tsx` | — | C | — | — | R (cmr-01 — Dx mirror is read by AssessmentStrip; ribbon read-only) | — |
| `frontend/components/patient-profile/panes/InvestigationsPane.tsx` (new) | — | — | — | C (cmi-01) | R (cmr-06 hides at narrow widths via container query) | — |
| `frontend/components/cockpit/middle/AssessmentStrip.tsx` (new) | — | — | — | — | C (cmr-01) | — |
| `frontend/components/cockpit/middle/SafetyStickyStrip.tsx` (new) | — | — | — | — | C (cmr-02) | — |
| `frontend/components/cockpit/middle/PlanActionFooter.tsx` (new) | — | — | — | — | C (cmr-03) | — |
| `frontend/components/cockpit/middle/BodyZone.tsx` (new) | — | — | — | — | C (cmr-04) | — |
| `frontend/components/cockpit/middle/InvestigationsAutoMerge.tsx` (new) | — | — | — | — | C (cmr-05) | — |
| `frontend/app/dashboard/appointments/[id]/page.tsx` | W (csf-05) | — | — | — | — | — |
| `frontend/lib/patient-profile/telemetry.ts` | — | W (1 event) | W (tmr-05 — 4 events) | W (cmi-03 — 1 event) | W (cmr-07 — 5 events) | W (chp-04 — 1 event) |
| `docs/Reference/product/cockpit/COCKPIT.md` | W (csf-06) | W (ribbon section) | W (tmr-05 — modality template section) | W (cmi-03 — Investigations section) | W (cmr-07 — middle-column strips section) | W (chp-04 — right column section) |
| `docs/Work/Product plans/plan-cockpit-v2.md` | — | — | — | — | — | W (chp-05 — Phase-2-COMPLETE annotations on all 6 R-items + Status legend update) |
| `docs/Work/capture/inbox.md` | W (csf-05 + csf-06) | W (Phase 3 follow-ups) | W (tmr-05 follow-ups) | W (cmi-03 follow-ups) | W (cmr-07 follow-ups) | W (chp-04 + chp-05 follow-ups) |
| `backend/migrations/*.sql` | — | — | C (tmr-03 — `104_doctor_settings_cockpit_template_override.sql`, single nullable column on `doctor_settings`) | — | — | — |

**Key takeaways:**

- **`templates.tsx` is the contention hot-spot for the 2026-05-21 burst.** Four batches write to it: tmr-01 (3 new factories), cmi-02 (Investigations replacement), cmr-06 (5-component wire-up), chp-03 (tab slot reservation). Sequencing matters: tmr-01 → cmi-02 (or in parallel; disjoint enough at the leaf level) → cmr-06 (needs both above) → chp-03 (last; documentation-style reservation). If multiple engineers run these in parallel branches, they MUST rebase carefully on `templates.tsx`.
- **`telemetry.ts` is the second hot-spot** — every batch adds 1-5 new events. No conflict in practice because each batch appends new exports; merge resolution is mechanical.
- **`backend/migrations/`** sees ONE new file across all four batches (`104_doctor_settings_cockpit_template_override.sql` from tmr-03). All other batches are zero-migration per their DLs.
- **`frontend/components/cockpit/middle/`** is a brand-new directory created entirely by cmr-01..05 — pure creates, zero conflict risk.
- **`frontend/lib/cockpit/exam-findings.ts`** is a new helper file from chp-02 — pure create, zero conflict.
- **`chp-05` is the only batch that touches `plan-cockpit-v2.md` itself** — Phase-2-COMPLETE source-plan annotation. Must run LAST.

---

## 8. Cross-batch invariants (what every cockpit-v2 batch must preserve)

Any new batch in this roadmap must NOT break the following invariants. They're the "do no harm" gates that span all of Phase 2 + Phase 3.

1. **Three mount surfaces (DL-3 from `plan-cockpit-v2.md`)** — appointment-detail page, in-call mini-panel, post-call summary. PrescriptionForm self-mounts a provider for the latter two; the cockpit case subscribes to the parent provider lifted by csf-01. Verify on every batch's smoke matrix.
2. **Single `<RxFormProvider>` per page** — exactly one provider in the React tree under `PatientProfilePage`. Verify in DevTools.
3. **Single autosave timer per draft row** — the provider's debounce fires once per draft regardless of how many sections call into it. Verify by filling 3 fields and counting save indicator fires.
4. **Walk-in fallback (DL-5 from `plan-cockpit-shell-flip-batch.md`)** — appointments with `patient_id == null` continue to render the legacy 2-pane horizontal body+rx layout until R-MOD-full ships an in-clinic template. Don't accidentally route them through the chart-bearing tree.
5. **Mobile branch unchanged (DL-12 from `plan-cockpit-v2.md`)** — `<lg` viewport renders `MobilePillBar` flow; the 8-pane tree never reaches mobile.
6. **No new Opus-tier work without checking the hard-rules list** — per `AGENT-EXECUTION-EFFICIENCY-GUIDE.md`. If a batch needs Opus, document why in the batch plan.
7. **Doctor presets (cc-08 / cc-10) keep applying** — preset records are layout-tree payloads; new shells silently fall back to defaults if the saved tree doesn't match. Don't break the apply path.
8. **Telemetry events from cv2** — `cockpit_v2.shell_mounted` (cv2-08) + `cockpit_v2.phase2_shell_flipped` (csf-06) continue to fire. New batches add their own `cockpit_v2.<r_item>_landed` event on first mount post-merge.
9. **Auxiliary-surface contracts** — every batch that introduces a side sheet, tab, floating dock, modal, or AI slot uses the cv2-09 `aux-surfaces.ts` interfaces. Don't reinvent. R-CHART is the first batch to exercise the side-sheet contract for real.

---

## 9. References

- **Source plan:** [`plan-cockpit-v2.md`](./plan-cockpit-v2.md) — canonical R-item specs + decision-locks.
- **Phase 1 batch:** [`Daily-plans/May 2026/17-05-2026/cockpit-v2/`](../Daily-plans/May%202026/17-05-2026/cockpit-v2/).
- **Phase 2 foothold batch:** [`Daily-plans/May 2026/19-05-2026/cockpit-shell-flip/`](../Daily-plans/May%202026/19-05-2026/cockpit-shell-flip/).
- **Adjacent in-flight batch:** [`Daily-plans/May 2026/18-05-2026/patients-redesign/`](../Daily-plans/May%202026/18-05-2026/patients-redesign/) — disjoint surface, no overlap.
- **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
- **Wave / lane / shape rules:** [`EXECUTION-ORDER-GUIDELINES.md`](../EXECUTION-ORDER-GUIDELINES.md).

---

## 10. Changelog

- **2026-05-26** — **cpv batch shipped.** AssessmentStrip zero-state, SaveStatusPill copy, BMI badge, examination labels, unified PaneHeader, color tokens, search collapse, pane-icon SoT, problem-list wrap. Telemetry: `cockpit_polish.visual_system_landed`.
- **2026-05-26** — **cnc batch shipped.** Right column "Chart Notes" title, `RxSectionNav` gated in cockpit mode, InvestigationsPane empty-state, PatientRibbon labelled indicators. Telemetry: `cockpit_polish.nav_clarity_landed`.
- **2026-05-26** — **ppd batch shipped.** Plan column dedupes Subjective + Objective + radio + photo via four new lift props. Cockpit Plan pane is now a clean Medicines-only surface; right column owns SOAP documentation.
- **2026-05-26** — **ccd batch shipped.** Chart-rail empty-state unification, snapshot live-draft vitals, uniform disclosure chevron.
- **2026-05-24** — **R-LAYOUT-UX shipped** via `cockpit-layout-presets-modality` (clpm-01..06). Migration **112** extends 099 preset JSONB with `layout_tree`; `<PaneContextMenu>` on pane headers; `layout-tree-mutations.ts` + `layout-node-bridge.ts`; `<PresetPicker>` with four built-in modality templates, custom save (max 5), reset-to-template, hidden-pane restore; soft 10-leaf cap (toast on 11th). Telemetry: `cockpit_v2.r_layout_ux_context_menu_opened` / `_tree_mutation` / `_preset_saved` / `_preset_applied`. **Last Phase-3 R-item ✅ — only `cockpit-v2-decommission` remains** (gated on 4-week soak, earliest 2026-06-16). Next recommended: `cockpit-v2-decommission`.
- **2026-05-24** — **R-RX-POLISH/2.2 + /2.3 shipped** via `rx-polish-favorites` (rxf-01..07). Migrations `108_doctor_drug_usage` + `109_doctor_drug_favorites`; usage increment on Send Rx; `DrugAutocomplete` personal-score-first ranking; `<FavoritesChipStrip>` + `rx-favorites` side sheet wired into `<PlanSection>`. Telemetry: `cockpit_v2.r_rx_polish_favorites_landed` / `r_rx_polish_favorite_applied` / `r_rx_polish_ranking_landed`. **R-RX-POLISH fully ✅** (all four sub-batches). Next recommended: `cockpit-layout-presets-modality`.
- **2026-05-24** — **R-RX-POLISH/4.x shipped** via `rx-polish-side-sheet` (rxss-01..04). `<PreviousRxPlanTrigger>` in Plan zone opens anchor `previous-rx` at 480px; filter chips + medicine search + virtual list &gt; 20 rows; Apply preview with Append/Replace diff; `RxWorkspace` wires confirm into `RxFormContext`. DL-1: `<PreviousRxPopover>` unchanged on appointment-detail header / in-call / post-call. Telemetry: `cockpit_v2.r_rx_polish_side_sheet_opened` / `_filter_changed` / `_applied`. Next recommended: `rx-polish-favorites` or `cockpit-layout-presets-modality`.
- **2026-05-24** — **R-RX-POLISH/3.x shipped** via `rx-polish-shortcuts` (rxs-01..04). `usePaneKeyboardShortcuts` hook + command registry; four Plan-pane bindings (`Ctrl/Cmd+Enter`, `M`, `Shift+T`, `Shift+P`); real Cmd+K palette; `data-cockpit-pane-id` on shell leaves; `<KeyboardHelpDialog>` via `?` and Cmd+K → "Keyboard shortcuts". Telemetry: `cockpit_v2.r_rx_polish_shortcut_used` (per-press). Next recommended: `rx-polish-favorites` or `rx-polish-side-sheet` (∥ disjoint).
- **2026-05-24** — **R-RX-POLISH/2.1 shipped** via `rx-polish-densification` (rxd-01..04). `<MedicineRow>` two-state summary/editor (~48px summary line); `<PlanSection>` tracks one active editor via stable `medicineInstanceIds`; keyboard ↑/↓ between summary rows. Telemetry: `cockpit_v2.r_rx_polish_densification_landed`. **First Phase 3 batch shipped.** Next recommended: `rx-polish-favorites` (stacks on summary row right edge).
- **2026-05-24** — **All six Phase-3 batches planned in one burst** (user request: "yeah create the phase 3 batch too" → "all six"). Status transitions: R-RX-POLISH ⏳ DEFERRED → 🟡 IN FLIGHT (split into four batches: [`rx-polish-densification`](../Daily-plans/May%202026/24-05-2026/rx-polish-densification/) rxd-01..04, [`rx-polish-favorites`](../Daily-plans/May%202026/24-05-2026/rx-polish-favorites/) rxf-01..07 — 2 new migrations 108 + 109, [`rx-polish-shortcuts`](../Daily-plans/May%202026/24-05-2026/rx-polish-shortcuts/) rxs-01..04, [`rx-polish-side-sheet`](../Daily-plans/May%202026/24-05-2026/rx-polish-side-sheet/) rxss-01..04); R-LAYOUT-UX ⏳ → 🟡 via [`cockpit-layout-presets-modality`](../Daily-plans/May%202026/24-05-2026/cockpit-layout-presets-modality/) clpm-01..06 (1 new migration 110, 1 Opus task clpm-04 for the recursive tree-mutation engine); brand-new program close-out batch [`cockpit-v2-decommission`](../Daily-plans/May%202026/24-05-2026/cockpit-v2-decommission/) cvd-01..03 hard-gated on a 4-week soak (earliest 2026-06-16) + < 1% kill-switch escape rate over the last 7 days. All six batches share the 2026-05-24 daily-plans folder + a new day-README listing them. Sequencing: rx-polish-densification first (smallest; unblocks favorites); rx-polish-favorites stacks on it; rx-polish-shortcuts ∥ rx-polish-side-sheet (disjoint, fully parallelizable); cockpit-layout-presets-modality before decommission (file-conflict on `PatientProfilePage.tsx`); cockpit-v2-decommission strictly last (closes the cockpit-v2 program — moves both `plan-cockpit-v2.md` + this roadmap to `Product plans/archive/` with banner, promotes `docs/Reference/product/cockpit/COCKPIT.md` to live SoT). Two-engineer wall-clock estimate ~6-8 days excluding soak. New telemetry events: `cockpit_v2.r_rx_polish_densification_landed`, `_favorites_landed`, `_favorite_applied`, `_ranking_landed`, `_shortcut_used`, `_side_sheet_opened`, `_filter_changed`, `_applied`, `cockpit_v2.r_layout_ux_context_menu_opened`, `_tree_mutation`, `_preset_saved`, `_preset_applied`, `cockpit_v2.program_completed` (one-shot, decommission only). §2 R-item table updated (R-RX-POLISH + R-LAYOUT-UX flipped + new "(N/A) — Cockpit v2 program close-out" row); §3 batch ledger (6 new rows); §4 Phase-3 progress (NOT STARTED → PLANNED with locked sequencing); §5 picks history (today's pick line); §6 recommended ordering (all six batches inlined with `∥` annotations + two-engineer suggestion + soak-window callout); §10 changelog (this entry).
- **2026-05-24** — **R-HISTORY shipped** via `cockpit-history-pane` (chp-01..04). BMI badge live; General + Systemic exam split via delimited serialization; Test results textarea wired; legacy vitalsText demoted. Phase 2 of cockpit-v2 ✅ COMPLETE — six R-items shipped over Phase 2 (R-SHELL flip, R-MOD, R-RIBBON, R-CHART, R-MIDDLE, R-HISTORY). Telemetry: `cockpit_v2.r_history_landed`. Next: first Phase 3 batch (ordering TBD).
- **2026-05-23** — **R-MIDDLE rest shipped** via `cockpit-middle-rebuild` (cmr-01..07). Assessment strip / Safety strip / Plan action footer / BodyZone / narrow-monitor merge all live in all four templates. Full R-MIDDLE now ✅ DONE. Telemetry: `cockpit_v2.r_middle_assessment_landed` / `r_middle_safety_landed` / `r_middle_footer_landed` / `r_middle_body_refactored` / `r_middle_narrow_merge_landed`. Next batch: `cockpit-history-pane`.
- **2026-05-23** — **R-MIDDLE bottom-left shipped** via `cockpit-middle-investigations` (cmi-01..03). `<InvestigationsPane>` live in all four template factories; last production `<PanePlaceholder>` removed. Phase 2 §gate "both deferred placeholders replaced with real content" **cleared** (History via R-CHART ✅, Investigations via this batch). Telemetry: `cockpit_v2.r_middle_inv_landed`. Next batch: `cockpit-middle-rebuild`.
- **2026-05-23** — **R-MOD-full shipped** via `templates-r-mod` (tmr-01..05). Voice / Text / Review templates live; `mapStateToTemplate` dispatcher in `state.ts`; doctor override column in migration `106_doctor_settings_cockpit_template_override.sql`. Telemetry: `cockpit_v2.r_mod_voice_landed` / `r_mod_text_landed` / `r_mod_review_landed`. Next batch: `cockpit-middle-investigations`.
- **2026-05-20** — **R-CHART shipped** via `cockpit-chart-extraction` (cce-01..05). Production tree now mounts `<SnapshotPane>` + `<HistoryPane>` as separate scrollable leaves; `<SideSheetHost>` is the first real consumer of cv2-09's side-sheet contract (visit-detail side sheet, single-sheet semantic). Telemetry event `cockpit_v2.r_chart_landed` added. Dev smoke routes deleted. Next pending batch: `cockpit-ribbon` (R-RIBBON).
- **2026-05-20** — Roadmap created. Phase 1 status set to ✅; cockpit-shell-flip status set to 🟡 (planned, in flight); R-CHART set to ⏳ NEXT recommended. Deferred items (R-RIBBON / R-MOD-full / R-MIDDLE / R-HISTORY / R-RX-POLISH / R-LAYOUT-UX) all set to ⏳ DEFERRED with batch names locked in §6.
- **2026-05-20** — `cockpit-chart-extraction` batch planned (cce-01..05). R-CHART status updated from ⏳ NEXT to 🟡 IN FLIGHT. Batch ledger row added.
- **2026-05-21** — `cockpit-ribbon` batch planned (crb-01..04). R-RIBBON status updated from ⏳ DEFERRED to 🟡 IN FLIGHT. Batch ledger row added. Recommended-next-batch pointer (§5 + §6) advanced to **R-MOD-full** via `templates-r-mod`. §5 picks-history block added.
- **2026-05-21** — **R-RIBBON shipped** via `cockpit-ribbon` (crb-01..04). Production desktop telemed page now renders the 52px patient context ribbon strip between header and pane shell. Slots: identity (age · sex · weight), allergies chips, chronic conditions chips, 💊 active meds count, 🎯 Treating Dx live mirror. Telemetry event `cockpit_v2.r_ribbon_landed` added. Walk-in + mobile + kill-switch negative paths all confirmed. Next pending batch: `templates-r-mod` (R-MOD-full).
- **2026-05-21** — **Four new batches planned in one burst** (user request: "create next batches" → "all four remaining Phase-2 batches"). Status transitions: R-MOD-full ⏳ DEFERRED → 🟡 IN FLIGHT via `templates-r-mod` (tmr-01..05, 5 tasks, 1 new migration `104_doctor_settings_cockpit_template_override.sql`); R-MIDDLE bottom-left ⏳ → 🟡 via `cockpit-middle-investigations` (cmi-01..03, 3 tasks); R-MIDDLE rest ⏳ → 🟡 via `cockpit-middle-rebuild` (cmr-01..07, 7 tasks — largest batch of the day, 5 new middle-column components + narrow-monitor auto-merge); R-HISTORY ⏳ → 🟡 via `cockpit-history-pane` (chp-01..05, 5 tasks, includes BMI badge, exam split via delimited serialization, test results textarea, legacy `vitalsText` demote, and the Phase-2-COMPLETE source-plan annotation in chp-05). All four batches share the 2026-05-21 daily-plans folder. Sequencing: tmr-* first (unblocks cmr-*); cmi-* parallelizable with tmr-*; cmr-* depends on both; chp-* disjoint enough to run in parallel with cmr-* Wave 1. §2 R-item table, §3 batch ledger (4 new rows), §4 Phase-2 progress, §5 picks-history (new "second update" pick), §6 ordering (∥ parallelizable annotations), §7 file-overlap heatmap (refined with new column shape for all four batches) all updated. The Phase-2 GATE will be reached when chp-05 ships and marks `plan-cockpit-v2.md` itself Phase-2-COMPLETE.
