# Cockpit history pane — R-HISTORY (Subjective + Objective content) — 21 May 2026 batch plan

> **Note on naming:** This batch is named `cockpit-history-pane` for roadmap-continuity (the entry in `plan-cockpit-v2-execution-roadmap.md` §6 uses that label), but its actual scope is the **Right column rebuild** — Subjective + Objective panes — NOT the History pane (which shipped via R-CHART / cockpit-chart-extraction). The naming is preserved to match the roadmap's existing ID; capture-inbox a follow-up to rename if it confuses future readers.
>
> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR rule #1: **plan with Opus, execute with Auto, polish with Composer**. This batch has **zero Opus tasks** — none reach the hard-rules thresholds (no PHI columns added, no RLS redesign, no novel security; all DL-24 fields already shipped via cv2-04 / migration 103). Three tasks are Auto; two are Composer 2 Fast (chp-04 the verification close-out + chp-05 a documentation polish task).
>
> **Source plan:** [`Product plans/plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md) §R-HISTORY (line ~375). R-HISTORY is the **sixth and final** Phase-2 R-item per the [execution roadmap](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md) §6 ordering.
>
> **Predecessor batches:**
> - [Daily-plans/May 2026/19-05-2026/cockpit-shell-flip](../../19-05-2026/cockpit-shell-flip/) — csf-03 wired Subjective / Objective panes as thin wrappers around the cv2-06 SubjectiveSection / ObjectiveSection. This batch enriches both with the DL-24 fields' UI inputs (vitals chip-grid, examination_findings, test_results).
> - [Daily-plans/May 2026/17-05-2026/cockpit-v2](../../17-05-2026/cockpit-v2/) — cv2-04's migration 103 added the DL-24 fields (vitals_*, examinationFindings, differentialDiagnosis, advice, followUp*, referral, testResults) to `prescription_drafts`. cv2-05 typed every field in `RxFormFields`. cv2-06 / cv2-07 split PrescriptionForm into sections but **didn't yet ship the UI inputs for the new fields** (cv2-07 was Phase 1's "no UI yet — cv2-07 adds inputs" note). This batch finally adds those inputs.
> - [Daily-plans/May 2026/21-05-2026/cockpit-middle-rebuild](../cockpit-middle-rebuild/) — sibling batch; touches the middle column. **No conflict** — this batch only touches `SubjectivePane.tsx` + `ObjectivePane.tsx` + their section components + new input primitives. Different files, parallel-safe.
> - [backend/migrations/](../../../../../backend/migrations/) — **no new migrations**. All DL-24 fields already exist in migration 103.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-cockpit-history-pane.md`](./Tasks/EXECUTION-ORDER-cockpit-history-pane.md).

---

## Why this batch

After `cockpit-shell-flip`, the right column has Subjective + Objective as separate panes (split 50/50 by default). Each pane mounts its respective section component (cv2-06's `<SubjectiveSection>` / `<ObjectiveSection>`):

**What already exists (pre-batch state):**

- **`SubjectiveSection`** — CC (chief complaint) input + HOPI (history of present illness) textarea. That's it.
- **`ObjectiveSection`** — legacy `vitalsText` free-text input + `<VitalsGrid>` (7 structured vitals inputs already implemented) + `examinationFindings` textarea (single combined field). The `<VitalsGrid>` was built in cv2-07 with all 7 numeric inputs (BP-sys/BP-dia/HR/Temp/SpO2/Wt/Ht) wired to structured `vitalsBp*` / `vitalsHr` / `vitalsTempC` / `vitalsSpo2` / `vitalsWtKg` / `vitalsHtCm` fields.
- **`RxFormContext`** — already declares `examinationFindings`, `testResults`, `differentialDiagnosis`, `advice`, `followUp*`, `referral` per DL-24.

**What's missing for R-HISTORY (per source plan §R-HISTORY "What" block):**

- **BMI badge** on the vitals grid. Source plan: "Vitals chip-grid (BP / HR / Temp / SpO2 / Wt / Ht / BMI auto)." BMI auto-computed from Wt + Ht, display-only.
- **General exam vs Systemic exam split.** Source plan: "General exam textarea, Systemic exam textarea." Currently a single combined `examinationFindings` textarea.
- **Test results textarea** (for patient-brought results, separate from `investigations_orders`). The `fields.testResults` field exists but has no UI input today.
- **Legacy `vitalsText` cleanup.** The legacy free-text vitals input is a holdover from before structured fields existed; visible deprecation.
- **Reserved tab-contract slots** on both panes (`tabs?: PaneTabDefinition[]`) per source plan acceptance "Tab-contract slots reserved (R-FUTURE-PROOFING) for: future Labs tab in Objective, future photo thumbnail strip in Subjective."

The clinical justification: telemed-first means doctors get vitals verbally (BP from at-home cuff, weight from bathroom scale) — typing is friction. Auto-computing BMI from Wt + Ht is a small but high-value automation. The general/systemic exam split is what every paper EHR has; collapsing them into one textarea forces doctors to free-form what should be two labeled fields. The test-results split (separate from ordered investigations) matches how doctors actually work — they see a printout the patient brought in, separate from tests they're ordering today.

R-HISTORY ships, given the existing surface:

1. **Enhanced `<VitalsGrid>`** — add a BMI badge that derives from Wt + Ht. Display-only, no backend column (DL-2). Optionally rename to `<VitalsChipGrid>` for naming alignment with source plan; default plan is to keep the existing name `VitalsGrid` to minimize diff.
2. **Enhanced `<ObjectiveSection>`** — split `examinationFindings` into General + Systemic via delimiter serialization (DL-8 says no backend change). Add Test results textarea. Demote legacy `vitalsText` to collapsed "Show legacy free-text vitals" disclosure or remove from UI entirely (data persists in DB).
3. **Enhanced `<SubjectivePane>`** — CC + HOPI preserved; reserved tab-contract slot on the pane definition (no visual change in v1; future Labs / Photo tabs implement against this contract).
4. **Enhanced `<ObjectivePane>`** — same tab-contract slot reservation. Internal layout follows the section's enhancements.

This batch closes R-HISTORY with **5 tasks across 4 waves**, **~10-14h wall-clock single-engineer (~2 dev-days, with partial parallelism in Wave 1)**, **zero new migrations** (DL-8), **zero Opus tasks**. The visible artifact at the close-gate is `/dashboard/appointments/[id]` rendering: BMI badge live on Wt + Ht entry; two examination textareas (general + systemic) round-tripping via delimited serialization; test-results textarea round-tripping; full DL-24 field set persistable with no regression to existing autosave.

**After this batch ships, Phase 2 of cockpit-v2 is COMPLETE.** Source plan §6 Phase-2 gate items are all cleared; Phase 3 (R-RX-POLISH + R-LAYOUT-UX) opens for planning.

---

## Decision lock (frozen for batch duration)

These match the planning conversation locked 2026-05-21. Re-opening any belongs in a new batch.

**DL-1: Enhance the existing `VitalsGrid` component** at `frontend/components/cockpit/rx/inputs/VitalsGrid.tsx` rather than creating a parallel `VitalsChipGrid`. Add a BMI badge as a new sub-component (`BmiBadge`) that derives from `fields.vitalsWtKg` + `fields.vitalsHtCm`. The existing 7 numeric inputs (BP sys / dia, HR, Temp, SpO2, Wt, Ht) stay as-is; their wiring + ranges + null-handling are preserved. Capture-inbox a future rename to `VitalsChipGrid` for naming alignment if the team wants it.

**DL-2: BMI is computed client-side, not stored.** Source plan §R-HISTORY ("BMI auto from Wt + Ht"). No backend column. Derivation: `bmi = weightKg / ((heightCm / 100) ** 2)`. Render with 1-decimal precision. Display only — not an input. Renders as a small badge below the grid (or in the BP cell's empty space — see chp-01 layout decision).

**DL-3: Vitals fields all optional per V2-Q6.** No required-field gate. Empty fields persist as null, not 0. Already established by `VitalsGrid`'s existing null-handling (line 35-42 of the existing file).

**DL-4: Subjective pane keeps CC + HOPI inputs unchanged.** No structural change to the section. The reserved tab-contract slot lives on the pane definition (`PaneDefinition.tabs?: PaneTabDefinition[]`) — not on the section component. v1 leaves it undefined. Source: cv2-09's `aux-surfaces.ts` contract.

**DL-5: Objective section gets the general/systemic split + test results textarea + legacy vitals demotion.** Final field order, top to bottom:
1. `<VitalsGrid>` (existing, with new BMI badge from DL-1).
2. General examination textarea (label: "General examination"). Backed by the first half of `fields.examinationFindings` (delimited serialization — see DL-6).
3. Systemic examination textarea (label: "Systemic examination"). Backed by the second half of `fields.examinationFindings`.
4. Test results textarea (label: "Test results (patient-brought)"). Backed by `fields.testResults`.
5. Legacy `vitalsText` — demoted to a collapsed `<details>` disclosure ("Show legacy free-text vitals"). Existing data still visible / editable; no longer a primary input. Capture-inbox an NLP backfill migration that lifts structured fields out of legacy text (out of scope; Phase 3+).

**DL-6: General + Systemic exam round-trip via delimiter on the single `examinationFindings` field.** Per DL-8 (no backend change), the two UI textareas serialize to the single DB column as:

```
{general text...}
\n--- SYSTEMIC ---\n
{systemic text...}
```

If the delimiter is missing on read (legacy data), the entire field populates the General textarea and Systemic is empty. Two helper functions `parseExam(combined: string): { general: string; systemic: string }` and `serializeExam(general: string, systemic: string): string` live alongside `ObjectiveSection.tsx`. They're pure and unit-tested in chp-02. Edge cases: a literal `--- SYSTEMIC ---` inside the general field is escaped at serialize time; capture-inbox an enhancement to make the delimiter more robust if doctors paste odd content.

**DL-7 (formerly DL-7): Read-only mode in `ended` / `terminal` states.** Same gate as elsewhere — uses `canEditPrescriptionDraft(state)`. Inputs render disabled; values still visible.

**DL-6: Read-only mode in `ended` / `terminal` states.** Same gate as elsewhere — uses `canEditPrescriptionDraft(state)`. Inputs render disabled; values still visible.

**DL-8: Single autosave timer preserved.** Every new input writes to `RxFormContext` via `setField`. The existing single-debounce autosave fires once regardless of which input was edited. Verified by the cross-pane edit smoke test (Subjective CC + Objective vitals + Objective general exam in one debounce → one save).

**DL-9: Backend untouched.** All DL-24 fields exist from cv2-04 / migration 103. Endpoints already serialize them. Zero backend touches in this batch.

**DL-10: Layout-tree pane ids unchanged.** Subjective / Objective pane ids stay `subjective` / `objective`. Saved layouts continue to work.

**DL-11: Tab-contract slots reserved but NOT implemented.** Per source plan §R-HISTORY acceptance + cv2-09's `aux-surfaces.ts` contract. Phase 1 ships `tabs: undefined` per pane; this batch leaves them undefined. Future plans (e.g., a Labs tab in Objective) implement the contract.

**DL-12: Telemetry — single event `cockpit_v2.r_history_landed`** fires once per session on first Objective pane mount. Payload includes `{ vitals_filled_count, has_general_exam, has_systemic_exam, has_test_results, has_bmi }`.

---

## Phases

### Wave 1 — BMI badge + ObjectiveSection field additions (2 tasks, ~5-7h, two parallel lanes)

Wave 1 has two lanes: lane α adds a BMI badge to the existing `VitalsGrid`; lane β rewires `ObjectiveSection` to split exam + add test results + demote legacy vitals. Disjoint files (different files in `inputs/` vs `sections/`) — parallel-safe.

**Lane α (BMI badge on existing VitalsGrid):**

- [`task-chp-01-vitals-chip-grid.md`](./Tasks/task-chp-01-vitals-chip-grid.md) — **S, Auto** — Modify `frontend/components/cockpit/rx/inputs/VitalsGrid.tsx`. Add a `<BmiBadge>` sub-component (in the same file) that subscribes to `fields.vitalsWtKg` + `fields.vitalsHtCm` and renders the derived BMI to 1-decimal precision when both present. New unit-test file `frontend/components/cockpit/rx/inputs/__tests__/VitalsGrid.test.tsx` (or extends existing if present) covers: BMI shows when both present; empty when either missing; correct value for canonical inputs.

**Lane β (ObjectiveSection enhancements + legacy demotion):**

- [`task-chp-02-objective-section-enhancements.md`](./Tasks/task-chp-02-objective-section-enhancements.md) — **M, Auto** — Modify `frontend/components/cockpit/rx/sections/ObjectiveSection.tsx`: (a) replace the single `examinationFindings` textarea with two textareas (General + Systemic), backed by delimited serialization helpers in `frontend/lib/cockpit/exam-findings.ts` (new ~60 LOC file with `parseExam` / `serializeExam` + unit tests); (b) add a new `testResults` textarea (label: "Test results (patient-brought)"); (c) demote the legacy `vitalsText` input into a collapsed `<details>` block ("Show legacy free-text vitals"); (d) final field order matches DL-5. New unit tests in `frontend/lib/cockpit/__tests__/exam-findings.test.ts` cover all parse/serialize round-trips including missing-delimiter (legacy) inputs.

### Wave 2 — Pane wiring + tab-contract slot reservation (1 task, ~2h, single sequential lane)

- [`task-chp-03-wire-into-objective-pane.md`](./Tasks/task-chp-03-wire-into-objective-pane.md) — **S, Auto** — Touch `frontend/components/patient-profile/panes/ObjectivePane.tsx` + `frontend/components/patient-profile/panes/SubjectivePane.tsx`: add the telemetry-firing `useEffect` to ObjectivePane (calls `trackCockpitV2RHistoryLanded` on first mount). Also touch `frontend/lib/patient-profile/templates.tsx` to add `tabs: undefined` to the Subjective + Objective pane definitions (an explicit reservation that documents the contract). No functional UI change on Subjective pane; ObjectivePane unchanged structurally — the new content already lives inside the section component from chp-02.

### Wave 3 — Verification + close-out (1 task, ~1.5h, single sequential lane)

- [`task-chp-04-verification-and-close-out.md`](./Tasks/task-chp-04-verification-and-close-out.md) — **XS, Composer 2 Fast** — Run smoke matrix per cross-cutting gate. tsc + lint + build + test sweep. Wire telemetry event `cockpit_v2.r_history_landed` (one-shot per session). Update `docs/Reference/product/cockpit/COCKPIT.md` with the new right-column structure. Update [`plan-cockpit-v2-execution-roadmap.md`](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md): **R-HISTORY → ✅ DONE**; **Phase 2 COMPLETE** annotations; batch ledger entry; recommended-ordering pointer to Phase 3 (first batch likely `rx-polish-densification`); §10 changelog. Capture-inbox follow-ups: photo-thumbnail-strip slot implementation (V2-D7); Labs tab implementation (DL-10); structured-from-legacy-text backfill (DL-5 follow-up); legacy `vitalsText` deprecation cleanup once dashboards no longer surface it; rename this batch's folder to `cockpit-right-column-rebuild` (capture-inbox per the naming note above).

### Wave 4 — Documentation polish (1 task, ~1h, single sequential lane)

- [`task-chp-05-documentation-polish.md`](./Tasks/task-chp-05-documentation-polish.md) — **XS, Composer 2 Fast** — Phase-2 GATE close-out. Update `plan-cockpit-v2.md` itself (the source product plan) — mark all six Phase-2 R-items as `Shipped`. Update the "Status legend" line at the top of the plan if needed. Verify the source plan's §"after this plan ships" §6 acceptance criteria 1-5 are all met (they should be, post the batch chain shipping):
  - 1. **8 default sub-panes in a nested tree** ✅ (csf-* + R-CHART + cockpit-middle-investigations + this batch).
  - 2. **4 modality-aware default templates** ✅ (templates-r-mod).
  - 3. **A patient ribbon** ✅ (cockpit-ribbon).
  - 4. **The Rx pane no longer exists as a single column** ✅ (cv2-06 + this batch's distribution).
  - 5. **All the polish items from `plan-cockpit-rx-pane.md` still ship** — Phase 3 still open; document as in-flight.
  - 6. **Future auxiliary surfaces are contracted but not built** ✅ (cv2-09).

  Update the source plan's §"Promotes to a daily-plans batch when Phase 1 R-items have Decision: ticked" status to `Phase 2 shipped`. Capture-inbox the actual final closure cleanup (delete the source plan or move to `archive/`) — that's a Phase-3 close-out task, not this one.

---

## Cross-cutting acceptance gate (whole batch)

These items must all be green before the batch is considered closed.

### Structural

- [ ] **`<VitalsChipGrid>` exports** from new file at `frontend/components/cockpit/rx/inputs/VitalsChipGrid.tsx`.
- [ ] **7 vitals inputs render**: BP-sys / BP-dia / HR / Temp / SpO2 / Wt / Ht. Each accepts numeric input (or null).
- [ ] **BMI badge auto-computes** when Wt + Ht both present. Empty when either missing.
- [ ] **General exam textarea + Systemic exam textarea + Test results textarea render** in ObjectiveSection.
- [ ] **Objective pane structure** (top to bottom): VitalsChipGrid → CC-like content via ObjectiveSection (Vitals legacy fallback hidden) → General exam → Systemic exam → Test results.
- [ ] **Subjective pane structure**: CC + HOPI textareas unchanged; reserved tab-contract slot (no UI change visible).
- [ ] **Walk-in unchanged** — right column doesn't render in walk-in's legacy 2-pane fallback.
- [ ] **Kill-switch `?v1=1` unchanged** — legacy 3-pane layout doesn't include the new fields.

### Behavior

- [ ] **Vitals chip-grid edits** update `RxFormContext` fields correctly (vitalsBpSystolic, vitalsBpDiastolic, vitalsHr, vitalsTempC, vitalsSpo2, vitalsWtKg, vitalsHtCm).
- [ ] **Null vs zero** — empty input persists as null, not 0. Verified by clearing a previously-filled field and reloading.
- [ ] **BMI computation** — Wt 70kg + Ht 175cm → 22.9. Wt only → BMI empty. Ht only → BMI empty.
- [ ] **General + Systemic exam textareas persist** to `fields.examinationFindings` (or whichever field-pair was chosen in chp-02).
- [ ] **Test results textarea persists** to `fields.testResults`.
- [ ] **Read-only in ended / terminal states** — all new inputs disabled; values still visible.
- [ ] **Cross-pane edit autosave** — edit Subjective CC + Objective vitals + Objective general exam in one debounce window; one save fires.

### Form parity

- [ ] **Single `<RxFormProvider>`** in the tree — verify in React DevTools.
- [ ] **All DL-24 fields round-trip** — fill all new fields, reload, all values persist.
- [ ] **Existing autosave behavior unchanged** — 1.5s debounce, single SaveStatus pill, no double-saves.

### Quality

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend build` clean.
- [ ] `pnpm --filter frontend test` clean. (New tests for VitalsChipGrid + ObjectiveSection enhancements pass.)
- [ ] No new Sentry errors in a 5-min smoke session.
- [ ] Telemetry — `cockpit_v2.r_history_landed` fires exactly once per session on first Objective pane mount.

### Documentation

- [ ] `docs/Reference/product/cockpit/COCKPIT.md` updated with the new right-column structure.
- [ ] **`plan-cockpit-v2.md` updated** — all six Phase-2 R-items marked Shipped; Status legend reflects Phase-2 closure.
- [ ] `plan-cockpit-v2-execution-roadmap.md` updated — R-HISTORY ✅ DONE; **Phase 2 COMPLETE** annotation; batch ledger entry; recommended-ordering pointer to Phase 3; §10 changelog row appended.
- [ ] `docs/Work/capture/inbox.md` has 4-5 new lines.

---

## Out-of-scope (rolled forward to follow-up batches)

| Out-of-scope item | Where it lands |
|---|---|
| **Photo thumbnail strip in Subjective** — V2-D7 from source plan | Future plan; uses cv2-09's tab-contract slot (reserved here, implementation deferred) |
| **Labs tab in Objective** — DL-10 from this batch + source plan §R-HISTORY | Future plan; tab-contract slot reserved (DL-10) |
| **Lab results browser side-sheet** — V2-D4 | Future plan; cv2-09's side-sheet contract is ready |
| **Structured-from-legacy-text vitals backfill** (NLP migration of `vitalsText` → structured fields) | Phase 3 or later chore (capture-inbox) |
| **Vitals trend chart** (historical vital readings over visits) — adjacent to Snapshot | Future plan; could attach to SnapshotPane via tab contract |
| **Vitals chip-grid mobile redesign** — DL-12 from cv2 plan locks mobile to MobilePillBar | Mobile redesign plan (deferred) |
| **Cross-doctor / clinic-wide vitals template sharing** — adjacent to V2-D20 from source plan | Future plan |

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 — lane α | chp-01 | 1/1 | 0/1 | 0/1 | ~2-3h |
| Wave 1 — lane β | chp-02 | 1/1 | 0/1 | 0/1 | ~3-4h (parallel with α) |
| Wave 2 | chp-03 | 1/1 | 0/1 | 0/1 | ~2h |
| Wave 3 | chp-04 | 0/1 | 1/1 | 0/1 | ~1.5h |
| Wave 4 | chp-05 | 0/1 | 1/1 | 0/1 | ~1h |
| **Total** | **5** | **3** | **2** | **0** | **~10-14h (~2 dev-days, ~7-9h with parallel Wave 1)** |

Token estimate (rough): ~180k input / ~110k output across the batch. Total batch spend: ~$10-14.

**One optional Opus close-gate turn after chp-05** budgeted on top — this batch closes the entire Phase 2 of cockpit-v2, so the close-gate review is recommended. Skip if every cross-cutting gate passes cleanly.

---

## Sequencing notes (the why behind the waves)

The 4-wave shape:

- **Wave 1's two lanes are disjoint.** Lane α touches `frontend/components/cockpit/rx/inputs/VitalsChipGrid.tsx` (new file); lane β touches `frontend/components/cockpit/rx/sections/ObjectiveSection.tsx` (existing file). Two engineers can run them in parallel.
- **Wave 1 → Wave 2 is a Cut 1 (dependency cliff).** Without chp-01 + chp-02's components, chp-03 has nothing to mount.
- **Wave 2 → Wave 3 is a Cut 2 (artifact change).** End of Wave 2: panes render new fields; end of Wave 3: docs updated + telemetry firing.
- **Wave 3 → Wave 4 is a Cut 3 (kind-of-work change).** Wave 3 = QA + per-batch docs. Wave 4 = SOURCE PLAN updates (different artifact — the product plan itself, not the daily-plans batch docs).

**Why split Wave 3 / Wave 4?** Wave 3's close-out is per-batch (telemetry + COCKPIT.md + roadmap + capture-inbox). Wave 4 specifically touches `plan-cockpit-v2.md` (the source product plan) to mark Phase 2 complete. The two updates have different stakeholders (engineering vs product / planning) and different review concerns; splitting prevents stuffing too much into one task.

**Cross-batch dependencies:** chp-03 (Wave 2) is conflict-free with `cockpit-middle-rebuild`'s Wave 1 / Wave 2 (disjoint files). Wave 4's update to the source product plan is also conflict-free — that file isn't touched by any other in-flight batch.

**Why no Opus tasks?** Per AGENT-EXECUTION-EFFICIENCY-GUIDE hard-rules list, none of these tasks reach the L-size structural-refactor / PHI / RLS / novel security thresholds. The chip-grid is a 7-input form primitive; the section enhancements are 3 new textareas + a wired chip-grid; the wire-up is mechanical. Per-message escalation to Opus on chp-01 only if Auto stalls on the BMI computation edge cases (negative weight, height < 30cm, etc. — but those are input-validation concerns, not architecture).

**Optional close-gate Opus turn** — recommended because this batch closes Phase 2 of the entire cockpit-v2 product plan. Worth one ~10k-token review pass to confirm:
1. All 6 R-items of Phase 2 are genuinely shipped.
2. The Phase 2 gate criteria from source plan §6 are all met.
3. The Phase 3 next-batch pointer in the roadmap is correct.

---

## References

- [Product plans/plan-cockpit-v2.md §R-HISTORY](../../../Product%20plans/plan-cockpit-v2.md) — source product spec.
- [Product plans/plan-cockpit-v2-execution-roadmap.md](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md) — master tracker; R-HISTORY is the §6 final-Phase-2 entry.
- [Daily-plans/May 2026/17-05-2026/cockpit-v2/](../../17-05-2026/cockpit-v2/) — predecessor; cv2-04 migration 103 added the DL-24 columns this batch finally surfaces as UI.
- [Daily-plans/May 2026/19-05-2026/cockpit-shell-flip/](../../19-05-2026/cockpit-shell-flip/) — predecessor; csf-03 wired SubjectivePane / ObjectivePane wrappers.
- [Daily-plans/May 2026/21-05-2026/cockpit-middle-rebuild/](../cockpit-middle-rebuild/) — sibling Phase-2 batch; disjoint surface, parallel-safe.
- [frontend/components/cockpit/rx/RxFormContext.tsx](../../../../../frontend/components/cockpit/rx/RxFormContext.tsx) — already types the 7 vitals_* fields + examinationFindings + testResults; this batch builds the UI inputs.
- [frontend/components/cockpit/rx/sections/ObjectiveSection.tsx](../../../../../frontend/components/cockpit/rx/sections/ObjectiveSection.tsx) — chp-02 enhances.
- [frontend/components/patient-profile/panes/ObjectivePane.tsx](../../../../../frontend/components/patient-profile/panes/ObjectivePane.tsx) — chp-03 mounts the chip-grid.
- [docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
- Sibling: [`Tasks/EXECUTION-ORDER-cockpit-history-pane.md`](./Tasks/EXECUTION-ORDER-cockpit-history-pane.md) — wave / lane matrix.
