# Subjective tab — Phase 6: section templates — execution order

> Sibling of [`plan-p6-subjective-section-templates-batch.md`](../plan-p6-subjective-section-templates-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** `subj-15` lands the `scope` substrate and runs first. `subj-16` (form-state scopes) and `subj-17` (server-backed scopes) both depend on subj-15 but are disjoint from each other — they can run as two parallel lanes. `subj-18` (full-template upgrade) folds PMH apply into the whole-subjective bundle, so it runs **after both** subj-16 and subj-17.

---

## Wave plan (4 waves)

```
Wave 1 (substrate — ~2–3h):
  subj-15 (scope column + types + validation + listRxTemplates(scope) + picker scope prop)

        │
        ├──────────────────────────────┐
        ▼                              ▼
Wave 2 (~3–4h)                  Wave 3 (~4–6h)
  subj-16 (form-state scopes      subj-17 (PMH + allergy
   + reusable button + wire        server-apply: pmh_json/
   chief/PSH/family/social)        allergies_json + create-
   [Lane α]                        on-apply + dedup) [Lane β]
        │                              │
        └──────────────┬───────────────┘
                       ▼
Wave 4 (~2–3h):
  subj-18 (whole-subjective upgrade: include PMH + rename Presets→Templates)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **subj-15** | S | Auto | `119_doctor_rx_templates_subjective_json.sql`; `rx-template-service.ts` (`listRxTemplates`/`createRxTemplate`); `backend/src/types/rx-template.ts` + `frontend/types/rx-template.ts`; `validation.ts`; `frontend/lib/api.ts` (`listRxTemplates`); `TemplatePicker.tsx` (`variant`) | Migration `141_doctor_rx_templates_scope.sql` (enum + default `subjective_full`); `scope` on types both sides; validation enum; `listRxTemplates(scope?)` filter (BE + FE); `scope` prop on the picker. |
| W2.α | subj-16 | M | Sonnet | `apply-subjective-template.ts`; `carry-forward-subjective.ts`; `SubjectivePresetButton.tsx`; `ComplaintList` + `PastSurgicalHistoryField` + family/social field containers; `HistorySubsection.tsx` (header `actions` slot) | Generalise apply helpers to `buildScopedTemplateSavePayload(scope, fields)` / `buildScopedTemplateApplyActions(scope, template)` / `scopeHasContent`; reusable `SubjectiveSectionTemplateButton`; wire the four form-state subsections. |
| W2.β | **subj-17** | L | **Opus** | `patient-chart-controller.ts`/`patient-chart-service.ts`; `createPatientCondition`/`createPatientMedication`/`createPatientAllergy` (`frontend/lib/api.ts`); `ProblemOrientedMedicalSection.tsx`; `AllergiesSection.tsx`; `use-stable-med-key.ts` | Migration `142_doctor_rx_templates_pmh_json.sql` + `143_doctor_rx_templates_allergies_json.sql`; `usePmhTemplateApply` / `useAllergyTemplateApply` (create rows, name-dedup, optimistic, partial-failure resync); wire PMH + allergy Templates buttons. |
| W4.0 | subj-18 | M | Sonnet | subj-16 helpers + subj-17 PMH apply path; `SubjectivePresetButton.tsx`; `SubjectiveSection.tsx` | Extend `subjective_full` save/apply to also capture + apply PMH (reuse subj-17 PMH path); combined "applying…" state; rename `Presets` → `Templates`. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| subj-15 | S | Auto | One additive column + enum + a list filter + a prop — bounded, no logic risk. |
| subj-16 | M | Sonnet | Refactor of shipped subj-08 helpers into scoped variants + a reusable button + four wiring points; clones an existing path. |
| subj-17 | L | **Opus** | Server-apply with name-dedup, optimistic UI, multi-row create, and partial-failure recovery across two chart surfaces — the genuinely novel, high-blast-radius slice. |
| subj-18 | M | Sonnet | Compose subj-16 + subj-17 into the full bundle + a label rename; logic is mostly reuse + orchestration. |

**Caps check:** 1 Opus in Phase 6 (subj-17, the server-apply slice). ✓

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p6-subjective-section-templates-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p6-subjective-section-templates-batch.md`](../plan-p6-subjective-section-templates-batch.md).
- Tasks: [`task-subj-15-…`](./task-subj-15-template-scope-foundation.md) · [`task-subj-16-…`](./task-subj-16-form-state-scoped-templates.md) · [`task-subj-17-…`](./task-subj-17-server-backed-scoped-templates.md) · [`task-subj-18-…`](./task-subj-18-whole-subjective-template-upgrade.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-17. **Status:** ⏳ `Planned`.
