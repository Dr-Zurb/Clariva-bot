# 17 May 2026 — Daily plans

Two batches land (or are landing) on this day. Both are filed in self-contained subfolders with their own plan + `Tasks/` tree. The two batches **touch disjoint code paths** (OPD operational surface vs cockpit / prescription pane); safe to run in parallel chats / branches / engineers.

| Folder | Batch | Status | What it covers |
|---|---|---|---|
| [`opd-per-day-mode/`](./opd-per-day-mode/) | **OPD per-day mode** (pdm-01 … pdm-12) | Drafted 2026-05-17 (active) | Replaces the doctor-global `doctor_settings.opd_mode` flag with a **per-session-day fact** the doctor can flip any number of times. Adds: a new `doctor_opd_session_modes` table (+ audit), a unified `GET /opd/session?date=` endpoint, automatic slot↔queue conversion (overflow-honoured), 5-min-debounced patient notifications, a session-overrun "Needs attention" tray with 24h auto-reschedule fallback, a `mode_schedule` policy (default + weekday + range + date overrides) consumed by the public booking widget, and an in-page mode-switch shortcut on the OPD tab. **~9–10 dev-days, 12 tasks, 6 waves, 1 new migration.** |
| [`cockpit-v2/`](./cockpit-v2/) | **Cockpit v2 — Phase 1 foundation** (cv2-01 … cv2-09) | **Closed 2026-05-18** (cv2-08 gate — see [verification report](./cockpit-v2/Tasks/cv2-08-verification-report.md)) | Phase 1 of the telemed-first 8-pane cockpit rebuild ([`Product plans/plan-cockpit-v2.md`](../../Product%20plans/plan-cockpit-v2.md)). Three R-items: **R-SHELL** activates `PaneDefinition.children` (DL-5 from the ppr batch) so the shell renders a nested vertical+horizontal tree instead of a flat three-column row; **R-RX-FORM** kicks off the Strangler Fig refactor of `PrescriptionForm.tsx` (1,717 LOC) into `<RxFormContext>` + four SOAP section components renderable in any pane, with a backend migration expanding `prescriptions` with the new SOAP fields (`vitals_*`, `examination_findings`, `differential_diagnosis`, `advice`, `follow_up_value/unit`, `referral`, `test_results`) and an `investigations → investigations_orders` rename; **R-FUTURE-PROOFING** lands the contracts (tabs-in-panes, side sheets, floating docks, modals, Cmd+K) that Phases 2–3 will consume. Phase 1 ships the *structural primitives*; Phases 2 and 3 (real medical content, presets, polish) promote to their own dated batches once Phase 1's acceptance gate ticks green. **~12–13 dev-days, 9 tasks, 4 waves, 1 new migration (PHI).** |

## Why this batch follows the slot-hub

The [15-05-2026 opd-slot-hub](../15-05-2026/opd-slot-hub/) batch shipped the slot-mode operational surface on `/dashboard/opd-today`, but it still reads `doctor_settings.opd_mode` to decide which surface to render. Operating on that for a day exposed three concrete problems that the slot-hub batch does **not** fix:

1. **The doctor's toggle silently rewrites patient contracts.** Flipping `opd_mode` changes how the doctor's hub renders existing bookings, how the patient-side snapshot reshapes itself, and whether the slot-join grace gate enforces. Patients who booked under one mode can find themselves served the other — without notification, without consent.
2. **Past dates don't show in the current mode.** A doctor in slot mode opens a previous date that was operating in queue mode → the hub fetches `/slot-session`, gets zero entries, shows "no slots." The queue-mode bookings exist but are invisible until the toggle flips.
3. **There's no way to say "Mondays are slot, Tuesdays are queue."** A real product need; the current single-column model can't express it.

Locked-in chat 2026-05-17, source product plan: [`Product plans/plan-opd-per-day-mode.md`](../../Product%20plans/plan-opd-per-day-mode.md).

## How to start

### If you're picking up `opd-per-day-mode`:

1. Read the [source product plan](../../Product%20plans/plan-opd-per-day-mode.md) once for context — DL-1..DL-16 explain the *why* behind each decision, including the **no-lock philosophy** (doctor can flip any number of times, debounce protects patients from spam) and the **multi-session-per-day deferral** (PD-D1 — captured for a future plan).
2. Read [`opd-per-day-mode/plan-opd-per-day-mode-batch.md`](./opd-per-day-mode/plan-opd-per-day-mode-batch.md) for the per-task breakdown and the cross-cutting acceptance gate.
3. Open [`opd-per-day-mode/Tasks/EXECUTION-ORDER-opd-per-day-mode.md`](./opd-per-day-mode/Tasks/EXECUTION-ORDER-opd-per-day-mode.md) for the wave / lane matrix and model picks.
4. Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) TL;DR rule #1: **plan with Opus, execute with Auto, polish with Composer.** This batch has **two Opus tasks** (pdm-01 — new migration; pdm-04 — conversion algorithm with concurrency + audit) and the rest default to Auto. Pre-load the queue-mode predecessors and the slot-hub batch artefacts aggressively — most surfaces are extensions of existing patterns.
5. **Pre-load the slot-hub artefacts.** The toolbar (`OpdSlotSessionToolbar`), conversion-dialog precedent (none yet, sl-06 is closest), and the unified `OpdTodayClient.tsx` shape from 15-05-2026 are listed in every relevant task's pre-load section.

### If you're picking up `cockpit-v2`:

1. Read the [source product plan](../../Product%20plans/plan-cockpit-v2.md) once for context — the 8-pane telemed-first layout, the 5 "escape hatches" for auxiliary content, and the 9 R-items + 25 Decision Locks. Phase 1 (this batch) covers **R-SHELL + R-RX-FORM + R-FUTURE-PROOFING**; the other six R-items (R-MOD, R-CHART, R-RIBBON, R-MIDDLE, R-HISTORY, R-RX-POLISH, R-LAYOUT-UX) are explicitly **out of scope** for this batch and promote to later batches.
2. Read [`cockpit-v2/plan-cockpit-v2-batch.md`](./cockpit-v2/plan-cockpit-v2-batch.md) for the per-task breakdown, the cross-cutting Phase 1 acceptance gate, and the Strangler-Fig pattern that governs the shell-rebuild approach (side-by-side `/v2-tree` route, the old `/v2` route untouched until the close-gate). `task-cv2-01` is the structural Opus task; everything downstream extends it.
3. Open [`cockpit-v2/Tasks/EXECUTION-ORDER-cockpit-v2.md`](./cockpit-v2/Tasks/EXECUTION-ORDER-cockpit-v2.md) for the wave / lane matrix. Phase 1 has **two Opus tasks** (cv2-01 — recursive shell rewrite; cv2-04 — backend migration touching PHI columns) per the hard-rules list. The wave layout splits them across two waves (one Opus per wave per the EXECUTION-ORDER guidelines §8).
4. **Pre-load the ppr-03 shell artefacts aggressively.** The current `frontend/components/patient-profile/Shell.tsx` (750 LOC) and `frontend/lib/patient-profile/useShellLayout.ts` are the exact files cv2-01 extends. The ppr-08 legacy-seed pattern is the model for cv2-02's localStorage v3 → v4 migration. The 8-pane layout sketch in [`plan-cockpit-v2.md` § The 8-pane default layout](../../Product%20plans/plan-cockpit-v2.md#the-8-pane-default-layout) is the visual reference for cv2-03's Telemed-Video template literal.
5. **Phase 1 ships structural primitives only.** Do NOT extract `<SnapshotPanel>` / `<HistoryPanel>` / `<BodyZone>` / `<AssessmentStrip>` / `<InvestigationsZone>` / `<PlanZone>` / `<SubjectiveZone>` / `<ObjectiveZone>` in this batch — those are R-MIDDLE + R-HISTORY + R-CHART in Phases 2–3. cv2-03's template literal renders **synthetic placeholders** for all 8 sub-pane slots so the shell can be validated end-to-end without dragging Phase 2 content forward.

## Cross-day predecessors

- [Product plans/plan-opd-per-day-mode.md](../../Product%20plans/plan-opd-per-day-mode.md) — source product plan, decision locks DL-1..DL-16, open-question lock PD-Q1..Q8.
- [Daily-plans/May 2026/15-05-2026/opd-slot-hub/](../15-05-2026/opd-slot-hub/) — slot-mode operational surface; this batch consumes its toolbar + filter + list and changes their data source from `doctor_settings.opd_mode` to the new session-day fact.
- [Daily-plans/May 2026/08-05-2026/](../08-05-2026/) — queue-mode hub batch; ditto.
- [Daily-plans/March 2026/2026-03-24/OPD modes/opd-systems-plan.md](../../March%202026/2026-03-24/OPD%20modes/opd-systems-plan.md) — original two-mode product spec; the basis for the `doctor_settings.opd_mode` column this batch demotes to a fallback.
- [backend/migrations/028_opd_modes.sql](../../../../backend/migrations/028_opd_modes.sql) — the schema this batch builds on top of (the `opd_policies` JSONB already exists; only the new session-modes table is a fresh migration).

## Concurrent batches

### Within the day (2026-05-17)

- `opd-per-day-mode/` and `cockpit-v2/` touch **disjoint file trees**:
  - `opd-per-day-mode/` lives entirely under `frontend/components/opd/**`, `backend/src/services/opd/**`, `backend/src/controllers/opd-*`, `backend/src/routes/api/v1/opd.ts`, and the `100_*` + `101_*` + `102_*` migrations.
  - `cockpit-v2/` lives entirely under `frontend/components/patient-profile/**`, `frontend/lib/patient-profile/**`, `frontend/components/consultation/PrescriptionForm.tsx`, the new `frontend/components/cockpit/**` tree, and the `103_*` migration (PHI columns on `prescriptions`).
  - `rg --files frontend/components/opd frontend/components/patient-profile` returns disjoint sets. Two engineers / chats can run them in parallel without merge friction. Single engineer with one chat per batch is also fine — pick whichever batch's bottleneck wave you'd rather hit first.

### Cross-day

- [13-05-2026/patient-profile-shell-rebuild/](../13-05-2026/patient-profile-shell-rebuild/) — the foundation `cockpit-v2/` builds on. **Must be merged first.** `task-cv2-01` extends `frontend/components/patient-profile/Shell.tsx` (shipped by ppr-03), `frontend/lib/patient-profile/types.ts` (shipped by ppr-03 with `children?: PaneDefinition[]` reserved per DL-5), and `useShellLayout` (shipped by ppr-02). If ppr hasn't merged to main yet, stack `cockpit-v2/` on the `feature/patient-profile-shell-rebuild` branch.
- [15-05-2026/opd-slot-hub/](../15-05-2026/opd-slot-hub/) — should be **merged before `opd-per-day-mode` starts**. pdm-03's read-path swap touches files that batch ships (`OpdTodayClient.tsx` slot branch, slot toolbar, slot list). Running the two batches concurrently is risky; stack `opd-per-day-mode` on `opd-slot-hub`'s feature branch if slot-hub hasn't merged to main yet. **Independent of `cockpit-v2/`.**
- [10-05-2026/cockpit-customization/](../10-05-2026/cockpit-customization/) — the preset/layout-presets work whose backend stays untouched by Phase 1 (cv2-09 only extends the type contract; `doctor_cockpit_layout_presets` table and `cc-08/cc-09/cc-10` artefacts are NOT modified). The Phase 2 batch will revisit presets when modality templates need to round-trip through the existing `layout_json` column.
