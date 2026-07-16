# Objective Reports section — execution order

> Sibling of [`plan-objective-reports-batch.md`](../plan-objective-reports-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** `docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`

> **Shape.** `rpt-01` is the visible win and pure cleanup — merge the three investigation sections into one "Reports" section, retire the POC *section*, simplify the modality seeds; no migration → ship it first, alone. `rpt-02` lays the structured substrate (grouped report model + reference-range fields + `lab_reports_json` migration) and is an agent-contract escalation (migration + PHI) → **Opus + STOP/flag**. `rpt-03` fills the researched lab-test library (needs a clinical review pass on units/ranges). `rpt-04` reuses the shipped attachment bucket for per-report photos + the imaging kind. `rpt-05` adds extraction + the mandatory verify dialog and is the second escalation (external AI on PHI images) → **Opus + STOP/flag**. `rpt-06` is optional per-doctor library + trend polish. Mostly linear; `rpt-04` can parallelise after `rpt-02`.

---

## Wave plan (6 waves)

```
Wave 1 (cleanup — ~3–4h, NO migration):
  rpt-01 (retire point_of_care section; relabel test_results → "Reports";
          fold media strip in; merge chip catalogs; simplify modality seeds)
        │
        ▼
Wave 2 (substrate — ~4–6h, MIGRATION + PHI → Opus + STOP/flag):
  rpt-02 (lab report grouping model; reference-range row fields;
          migration 159 lab_reports_json; tolerant Zod FE+BE;
          test_results TEXT derivation byte-identical)
        │
        ├───────────────► Wave 4 (parallelisable after rpt-02):
        │                   rpt-04 (photos per report + imaging kind)
        ▼
Wave 3 (~4–6h + content research):
  rpt-03 (researched lab-test library: analytes/panels/units/ranges/aliases;
          panel scaffolding; custom row)
        │
        ▼
Wave 5 (~5–8h, EXTERNAL AI on PHI → Opus + STOP/flag):
  rpt-05 (vision→JSON extraction; alias match vs library; sanity checks;
          mandatory verify dialog — never auto-commit)
        │
        ▼
Wave 6 (~3–4h, OPTIONAL):
  rpt-06 (per-doctor custom test library; optional lab trend view)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **rpt-01** | M | Sonnet | `objective-section-order.ts` (ids/labels/order); `ObjectiveSection.tsx` (`sectionBody`, collapse defaults, L568–582); `objective-default-layout.ts` (modality hide sets); `TestResultsList.tsx`; `test-result-catalog.ts`; the `objectiveResultsParity` + `objectiveTemplateParity` suites | Merge to one "Reports" section; retire `point_of_care`; fold media in; merge chips. **No migration, no data change.** Prove `test_results` derivation parity + no broken stored layouts. Decide fate of existing `point_of_care`-scoped saved templates (remap vs orphan). |
| W2.0 | **rpt-02** | L | **Opus** | rpt-01 output; `frontend/types/prescription.ts` + `backend/src/types/prescription.ts` (`TestResultRow`); `backend/src/utils/validation.ts` (`testResultRowSchema`, `testResultsJsonSchema`); `test-results.ts` derivation; migration `154_prescriptions_test_results_json.sql` (pattern) | **STOP/flag first (migration + PHI column).** Add report grouping (`reportId`) + range fields (`refLow/refHigh/refText`) to the row; add `lab_reports_json` column (migration 159, idempotent, documented rollback, no RLS edits); widen tolerant Zod (drop-bad-rows discipline); keep `test_results` TEXT byte-identical for the same content. |
| W3.0 | rpt-03 | M–L | Sonnet | rpt-02 field shape; `test-result-catalog.ts`; `exam-schema.ts` (static-catalog discipline) | Build the lab-test library module (analytes + aliases + units + default ranges + panels) + panel scaffolding + custom-row path. **Units/ranges/aliases need a clinical review pass** before the defaults are trusted (RPT-D5) — treat content as reviewed data, not agent guesswork. |
| W4.0 | rpt-04 | M | Sonnet | rpt-02 report headers; `ObjectiveMediaStrip.tsx`; `objective-media.ts`; `prescription-attachment-service.ts` (category/`objective/` tagging) | Link attachments to a report header (`attachmentIds[]`); add the imaging kind with photo **and/or** findings note (RPT-D7 — neither required). Reuse the shipped bucket + signed-URL flow; no new bucket/RLS. Parallelisable after rpt-02. |
| W5.0 | **rpt-05** | L | **Opus** | rpt-02 model; rpt-03 library (alias match); rpt-04 photos; `complaint-parse-service.ts` + `medicine-parse-service.ts` (verify-before-apply pattern); `config/openai.ts` (tiered models) | **STOP/flag first (external AI on PHI images).** New extract endpoint: sign photo URL → vision model with strict JSON schema → match `rawName` to library via aliases → sanity checks (numeric/unit/physiologic bounds) → **verify dialog** (photo beside editable rows; flagged rows highlighted). Nothing commits without confirm; failure → manual entry. Log model + token counts only. |
| W6.0 | rpt-06 | M | Sonnet | rpt-03 library; `doctor_settings` custom patterns (e.g. `157_doctor_settings_vitals_custom.sql`); vitals `TrendChart` (for optional trend view) | **Optional.** Persist per-doctor custom tests to their picker; optionally add a cross-visit lab trend view reusing the vitals trend component. Droppable without touching the core section. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| rpt-01 | M | Sonnet | Section-registry + layout + chip-catalog edits across ~5 single-layer files; no migration, no data. Blast radius contained by parity suites. |
| rpt-02 | L | **Opus** | New migration + new PHI column + widened cross-stack Zod → agent-contract migration/PHI escalation. |
| rpt-03 | M–L | Sonnet | Static-catalog wiring + panel scaffolding; the risk is content correctness (human review), not code complexity. |
| rpt-04 | M | Sonnet | Reuses the shipped attachment flow; report-scoped linking + imaging kind. No new bucket/RLS. |
| rpt-05 | L | **Opus** | External AI call on PHI images + hallucination-guard verify UX → agent-contract AI/PHI escalation. |
| rpt-06 | M | Sonnet | Additive per-doctor persistence + optional trend reuse; low risk. |

**Caps check:** ≤1 Opus per wave ✓. **Program Opus count = 2** (rpt-02, rpt-05). Both STOP/flag before writing per `.cursor/rules/00-agent-contract.mdc`.

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-objective-reports-batch.md#cross-cutting-acceptance-gate-whole-program).

---

## References

- Batch plan: [`plan-objective-reports-batch.md`](../plan-objective-reports-batch.md) · overview [`README.md`](../README.md).
- Tasks: [`task-rpt-01`](./task-rpt-01-merge-reports-section.md) · [`task-rpt-02`](./task-rpt-02-lab-report-model-and-fields.md) · [`task-rpt-03`](./task-rpt-03-lab-test-library.md) · [`task-rpt-04`](./task-rpt-04-photos-and-imaging.md) · [`task-rpt-05`](./task-rpt-05-extraction-and-verify-dialog.md) · [`task-rpt-06`](./task-rpt-06-custom-test-library.md).
- Process: `docs/Work/process/EXECUTION-ORDER-GUIDELINES.md` · `CODE_CHANGE_RULES.md`. Agent contract: `.cursor/rules/00-agent-contract.mdc`.

---

**Created:** 2026-07-08. **Status:** Draft — not committed, not implemented.
