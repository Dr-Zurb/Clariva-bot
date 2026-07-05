# Objective tab — Phase 5: point-of-care results + media — execution order

> Sibling of [`plan-p5-objective-tab-poc-results-media-batch.md`](../plan-p5-objective-tab-poc-results-media-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** `obj-20` is the substrate — the `test_results_json` PHI column + the row shape + Zod + reducer + the **derive-on-save** contract. It must land first; everything downstream needs the row shape + derived contract frozen. `obj-21` (structured row UI + section registration) is the structured-entry lane. `obj-22` (objective media) is the one independent surface — it reuses shipped attachment storage and depends only on the section host, so it *could* run in parallel with obj-21/23 if a second runner is available. `obj-23` (templates + packs + modality emphasis) is a thin consumer of P4's apply engine + P3's seed, so it follows obj-21. `obj-24` closes the derived-text byte-parity / media round-trip / a11y gate. Mostly a linear chain (like P4), with obj-22 as the one parallelizable branch.

---

## Wave plan (5 waves; obj-22 optionally parallel)

```
Wave 1 (substrate — ~2–3h):
  obj-20 (154_prescriptions_test_results_json.sql + test_results_json shape
          + Zod + reducer + derived test_results contract)
        │
        ▼
Wave 2 (~3–4h):
  obj-21 (TestResultRow UI: name/value/unit/date/interpretation/source
          + register patient-brought + in-clinic-POC Objective sections)
        │
        ├───────────────► (optional parallel runner)
        ▼                  Wave 3' (~3–4h):
Wave 4 (~3–4h):              obj-22 (objective media strip via
  obj-23 (test_results/                prescription_attachments + context tag
          point_of_care                + read-only mode)
          template scopes
          + POC packs
          + modality emphasis)
        │                          │
        └──────────────┬───────────┘
                       ▼
Wave 5 (~2–4h):
  obj-24 (derived test_results byte-parity + media round-trip +
          modality view-only + a11y + verification gate)
```

> If running single-threaded, the order is **obj-20 → 21 → 22 → 23 → 24** (the batch plan's wave numbering). obj-22 is only *optionally* parallel.

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **obj-20** | S–M | **Opus** | `150_prescriptions_examination_json.sql` (the column+CHECK to clone); `buildRxPayload` + `rxFormFieldsFromPrescription` in `RxFormContext.tsx` (the `examination_json`→`examination_findings` derive/hydrate pattern); `exam-findings.ts` (the derive/serialize helper to mirror); `backend/src/types/prescription.ts` + `frontend/types/prescription.ts`; `validation.ts` (prescription update schema) | Migration `154_prescriptions_test_results_json.sql` (additive JSONB array + `jsonb_typeof = 'array'` CHECK + **PHI** comment); the result-row type both sides; Zod row shape; reducer actions (`SET_TEST_RESULTS`/`ADD_TEST_RESULT`/`UPDATE_TEST_RESULT`/`REMOVE_TEST_RESULT` — finalize set in obj-20); `buildRxPayload` derives `test_results` text; legacy passthrough. Opus per the migration + PHI hard rule. |
| W2.0 | obj-21 | M | Sonnet | obj-20's row shape + reducer; `ExamSystemCard`/`ExamSystemList` (the structured-card pattern to clone); `exam-schema.ts` (chip-palette pattern for name/interpretation chips); `objective-section-order.ts` + `ObjectiveSection.tsx` (registry + section host); `CustomObjectiveSectionsField.tsx` | `TestResultRow` card (name/value/unit/date/interpretation chip/source toggle); register `test_results` (structured) + `point_of_care` sections in the P3 registry so reorder/collapse/visibility apply; keep the `test_results` textarea as the escape hatch (OBJ-D7). Pure reducer dispatch. |
| W3.0 *(opt. parallel)* | obj-22 | M | **Opus** | `027_prescription_attachments_bucket.sql` + the attachment upload path (`prescription_attachments` API + storage helper); `PrescriptionAttachment` type + how `rxFormFieldsFromPrescription` reads `prescription_attachments`; `ObjectiveSection.tsx` (section host); any existing attachment/upload UI to reuse | Objective media strip (wound/rash/ECG/report scan) via the **shipped** attachments storage + a context/category tag to mark objective media; render + round-trip on reload; read-only in `disabled` mode. **No new bucket, no new RLS policy** — verify the existing prescription-scoped policy covers the tag. Opus: storage + PHI media + RLS. |
| W4.0 | obj-23 | M | Sonnet | P4's `apply-objective-template.ts` (the scope save/apply engine to extend); `doctor_rx_templates` scope enum (add `test_results`/`point_of_care`); `objective-specialty-packs.ts` (pack catalog to extend); `objective-default-layout.ts` (`resolveDefaultLayout`/modality seed) | Add the result scopes to the template engine + picker; POC specialty starter packs; wire modality default emphasis onto P3's view-only seed (content emphasis only, never derived output). Thin consumer — Sonnet. |
| W5.0 | obj-24 | M | **Opus** | obj-20 derived contract + obj-21/22/23 surfaces; `examDerivationParity.test.tsx` + `objectiveLayoutParity.test.tsx` + `objectiveTemplateParity.test.tsx` (the P1/P3/P4 parity-fixture shapes to mirror); `buildRxPayload` | Derived `test_results` byte-parity (hand-entry vs structured); legacy-row passthrough; media attachment round-trip; modality-emphasis-is-view-only; a11y sweep; `tsc`/lint/test gate. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| obj-20 | S–M | **Opus** | New migration on a **PHI** column (`test_results_json`) + the derived-text contract. Honors the workspace migration/PHI hard rule + the obj-01 precedent; bounded + idempotent (one JSONB array column) — downgrade to Auto only under an explicit migration policy. |
| obj-21 | M | Sonnet | Clones the shipped structured-exam card + registry registration over a new row type; no schema risk, no server-apply. |
| obj-22 | M | **Opus** | Touches storage + PHI media + the attachment RLS path. Reuse-not-widen makes it bounded, but the safety surface is Opus-grade. |
| obj-23 | M | Sonnet | Extends P4's scope engine + specialty-pack catalog + P3's seed; content-heavy, low blast radius. |
| obj-24 | M | **Opus** | Derived-text byte-parity fixtures + media round-trip + modality view-only + verification — the parity-risk slice, like obj-04/obj-15/obj-19. |

**Caps check:** ≤1 Opus per wave ✓. **Phase Opus count = 3** (obj-20 migration/PHI; obj-22 storage/RLS; obj-24 parity gate) — one above P4. See the batch plan's Opus-density flag: split media (obj-22) out to hold ≤2 if required.

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p5-objective-tab-poc-results-media-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p5-objective-tab-poc-results-media-batch.md`](../plan-p5-objective-tab-poc-results-media-batch.md).
- Tasks: [`task-obj-20-…`](./task-obj-20-structured-test-results-foundation.md) · [`task-obj-21-…`](./task-obj-21-structured-poc-result-rows.md) · [`task-obj-22-…`](./task-obj-22-objective-media-attachments.md) · [`task-obj-23-…`](./task-obj-23-result-templates-packs-modality.md) · [`task-obj-24-…`](./task-obj-24-poc-results-close-gate.md).
- Pattern precedents: P1 [`EXECUTION-ORDER-p1-…`](../../p1-structured-exam/Tasks/EXECUTION-ORDER-p1-objective-tab-structured-exam.md); P4 [`EXECUTION-ORDER-p4-…`](../../p4-exam-templates/Tasks/EXECUTION-ORDER-p4-objective-tab-exam-templates.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-19. **Status:** 🗒 `Drafted`.
