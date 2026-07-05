# Objective tab — Phase 4: exam templates + specialty packs — execution order

> Sibling of [`plan-p4-objective-tab-exam-templates-batch.md`](../plan-p4-objective-tab-exam-templates-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** `obj-16` is the substrate — the `objective_json` payload column + the objective `scope` enum values + types/Zod/service/API/picker variant. It must land first; everything downstream needs the scope set + payload shape frozen. `obj-17` (form-state scoped apply + reusable button + wiring) is the single engine lane. `obj-18` (specialty packs) is a thin consumer of obj-17's apply engine + P3's `normalizeSpecialty`, so it follows obj-17. `obj-19` folds the per-section scopes into the whole-objective bundle and closes the output-parity / apply-round-trip / a11y gate. Linear chain (each task depends on the prior), unlike subjective P6's two parallel lanes — because there is **no server-backed slice** to run in parallel.

---

## Wave plan (4 waves)

```
Wave 1 (substrate — ~2–3h):
  obj-16 (objective_json column + objective scope enum + types/Zod/service/API
          + picker "objective" variant)
        │
        ▼
Wave 2 (~3–4h):
  obj-17 (apply-objective-template.ts engine: save/apply/scopeHasContent
          + reusable ObjectiveSectionTemplateButton + wire vitals/exam/
          per-system/custom-block)
        │
        ▼
Wave 3 (~3–4h):
  obj-18 (objective-specialty-packs.ts static catalog keyed by normalizeSpecialty
          + preview/apply/save affordance, applied through obj-17's engine)
        │
        ▼
Wave 4 (~2–4h):
  obj-19 (whole-objective template upgrade + output-parity / apply-round-trip /
          a11y close-gate + verification)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **obj-16** | S–M | **Opus** | `119_doctor_rx_templates_subjective_json.sql`; `141_doctor_rx_templates_scope.sql`; `rx-template-service.ts` (`listRxTemplates`/`createRxTemplate`/`normalizeSubjective`); `backend/src/types/rx-template.ts` + `frontend/types/rx-template.ts`; `validation.ts` (scope enum + `subjective_json` shape); `frontend/lib/api.ts` (`listRxTemplates`); `TemplatePicker.tsx` (`variant`/`scope`) | Migration `153_doctor_rx_templates_objective_json.sql` (additive JSONB column + extend `scope` CHECK enum); `objective_json` typed shape both sides; Zod validates shape + new scopes; `listRxTemplates(scope)` already filters; picker `variant: "objective"`. Opus per the migration hard rule — downgrade to Auto if your migration policy allows (the change is additive + idempotent). |
| W2.0 | obj-17 | M | Sonnet | `apply-subjective-template.ts` (the engine to mirror); `RxFormContext.tsx` (`examFindings`/`vitals_*`/`testResults`/`objectiveCustomSections` + reducer actions `SET_EXAM_FINDINGS`, vitals setters, `SET_OBJECTIVE_CUSTOM_SECTIONS`); `custom-objective-sections.ts`; `exam-schema.ts`; `ObjectiveSection.tsx` (section headers / `actions` slots); `TemplatePicker.tsx` | `apply-objective-template.ts`: `buildObjectiveTemplateSavePayload(scope, fields)` / `buildObjectiveTemplateApplyActions(scope, template)` / `objectiveScopeHasContent`; reusable `ObjectiveSectionTemplateButton`; wire vitals + structured exam + per-system + custom-block. Pure reducer dispatch (P4-D2) — no server-apply, no config write. |
| W3.0 | obj-18 | M | Sonnet | `objective-default-layout.ts` (`normalizeSpecialty`, `SpecialtyEmphasis`); obj-17's apply engine + button; `exam-schema.ts` (normal one-liners / abnormal chips to seed pack content); `ObjectiveSection` manage/Templates affordance | `objective-specialty-packs.ts`: static starter catalog keyed by `SpecialtyEmphasis` (§E2), each pack = an `objective_json`-shaped bundle; affordance to preview/apply a pack via obj-17's engine and save-as-template; packs layered under doctor overrides + P3 visibility seed (P4-D4). No migration. |
| W4.0 | obj-19 | M | **Opus** | obj-17 engine + obj-18 packs; `RxFormContext.tsx` (`buildRxPayload`); `examDerivationParity.test.tsx` + `objectiveLayoutParity.test.tsx` (the P1/P3 parity-fixture shapes to mirror); `vitalsParity.test.tsx` | Whole-objective `objective_full` save/apply (compose per-section payloads); combined "applying…" state; close-gate: hand-entry vs template-applied → byte-identical `buildRxPayload`; apply→save→reload→re-apply fixed point; a11y sweep; `tsc`/lint/test gate. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| obj-16 | S–M | **Opus** | New migration (additive `objective_json` column + scope enum extension). Honors the workspace migration hard rule + the obj-10 precedent; bounded, idempotent — downgrade to Auto only under an explicit migration policy. |
| obj-17 | M | Sonnet | Mirrors the shipped subjective form-state apply (subj-16) over objective fields + a reusable button + four wiring points; clones an existing path, no server-apply risk. |
| obj-18 | M | Sonnet | A static specialty-pack catalog + a preview/apply/save affordance reusing obj-17's engine and P3's `normalizeSpecialty`; content-heavy but low blast radius. |
| obj-19 | M | **Opus** | Output byte-parity fixtures (hand-entry vs template-applied), apply round-trip fixed point, a11y sweep, verification gate — the parity-risk slice, like obj-15. |

**Caps check:** 2 Opus in Phase 4 (obj-16 migration; obj-19 parity gate); ≤1 Opus per wave. ✓

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p4-objective-tab-exam-templates-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p4-objective-tab-exam-templates-batch.md`](../plan-p4-objective-tab-exam-templates-batch.md).
- Tasks: [`task-obj-16-…`](./task-obj-16-objective-template-scope-foundation.md) · [`task-obj-17-…`](./task-obj-17-form-state-scoped-objective-templates.md) · [`task-obj-18-…`](./task-obj-18-specialty-exam-packs.md) · [`task-obj-19-…`](./task-obj-19-whole-objective-template-and-close-gate.md).
- Subjective precedent (form-state half only): [`../../../03-06-2026/subjective-tab/p6-section-templates/Tasks/EXECUTION-ORDER-p6-subjective-section-templates.md`](../../../03-06-2026/subjective-tab/p6-section-templates/Tasks/EXECUTION-ORDER-p6-subjective-section-templates.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-19. **Status:** ⏳ `Drafted`.
