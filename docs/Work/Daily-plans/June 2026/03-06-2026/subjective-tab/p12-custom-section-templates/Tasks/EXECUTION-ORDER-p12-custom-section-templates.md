# Subjective tab — Phase 12: custom-section templates + delete safeguards — execution order

> Sibling of [`plan-p12-custom-section-templates-batch.md`](../plan-p12-custom-section-templates-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** `subj-39` is the load-bearing slice — widen the `doctor_rx_templates` scope enum to add `custom_block` and extend `subjective_json` with `customSubsections`, threading types/validation/service/normaliser on both sides plus the picker's scope labels/summary. It runs first and **Opus**, because it carries a migration (hard-rules STOP) and a storage-shape change the whole phase rests on. `subj-40` clones the Phase-6 `SubjectiveSectionTemplateButton` into a custom-section save/apply button that reads the live block and fills/creates a block, surfacing the section's own templates first. `subj-41` folds custom sections into `subjective_full` (merge-by-id) and adds the guarded delete-confirmation dialog. `subj-42` wires the opt-in archive cascade, proves tolerant reconciliation + view-only output parity, and closes the gate. Strictly linear — each slice consumes the previous.

---

## Wave plan (4 waves, linear)

```
Wave 1 (scope + storage substrate — ~3–4h):
  subj-39 (migration 149: widen scope CHECK enum to add custom_block;
           extend subjective_json with customSubsections (FE+BE types,
           validation, service normaliser); picker scope labels +
           templateHasScopedContent/summary for custom_block. No buttons,
           no apply logic.)  [Opus — migration STOP + cross-layer storage]
        │
        ▼
Wave 2 (per-section save/apply — ~3–4h):
  subj-40 (apply-subjective-template.ts: scoped save reads the live
           custom block; apply fills/creates a block. CustomSectionTemplateButton
           on each custom-block header; picker surfaces section's own
           templates first by stable id.)
        │
        ▼
Wave 3 (full template + delete dialog — ~3–4h):
  subj-41 (subjective_full capture/apply of customSubsections merge-by-id;
           delete-confirmation dialog on handleRemoveCustomSection
           enumerating data loss + doctor-default removal + linked
           custom_block count + subjective_full embed count, opt-in archive.)
        │
        ▼
Wave 4 (cascade + gate — ~2–3h):
  subj-42 (opt-in archive loop via archiveRxTemplate; tolerant
           reconciliation on stale/absent id; round-trip + full-template +
           output-parity tests; verification gate; status updates)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **subj-39** | M | **Opus** | `141_doctor_rx_templates_scope.sql` (enum precedent); `backend/src/types/rx-template.ts` (`RxTemplateScope`, `RxTemplateSubjective`); `backend/src/utils/validation.ts` (scope enum, subjective schema); `backend/src/services/rx-template-service.ts` (`normalize*`, list/create/get); `frontend/types/rx-template.ts`; `frontend/components/ehr/TemplatePicker.tsx` (`SCOPE_PICKER_LABELS`, `templateHasScopedContent`, `formatTemplateSummary`); `frontend/lib/cockpit/custom-subsections.ts` (`CustomSubsection` shape) | Add `custom_block` to the scope enum (migration `149_…`, additive CHECK swap). Add `customSubsections?` to `subjective_json` shape FE+BE; validate tolerantly. Picker: scope label + content predicate + summary for `custom_block`. **No buttons, no apply.** Migration = hard-rules STOP → Opus. |
| W2.0 | subj-40 | M | Sonnet | subj-39 substrate; `SubjectiveSectionTemplateButton.tsx` (clone target); `apply-subjective-template.ts` (`buildScopedTemplateSavePayload`, scoped apply); `CustomSubsectionBlock` / `SubjectiveSection.tsx` (header mount point); `custom-subsections.ts` (block read/seed) | Scoped save snapshots the one live custom block into `subjective_json.customSubsections`. Apply fills the matching block (by id) or creates it. New `CustomSectionTemplateButton` on each custom header; picker prioritises the section's own-id templates. |
| W3.0 | subj-41 | M | Sonnet | subj-40 path; `apply-subjective-template.ts` (`subjective_full` capture/apply); `SubjectiveSection.tsx` (`handleRemoveCustomSection` from Phase-11 delete control); `SectionManagerMenu.tsx` (delete trigger); a confirm-dialog primitive | `subjective_full` save captures custom sections; apply merges by id (overwrite same-id, create absent). Delete dialog enumerates consequences + counts (from `listRxTemplates(custom_block)` + `listRxTemplates(subjective_full)`), opt-in archive checkbox, cancel = no-op. |
| W4.0 | **subj-42** | S–M | Auto | subj-41 wiring; `archiveRxTemplate`; tests across `apply-subjective-template` + `SubjectiveSection.*.test.tsx` + `rx-template-service` + `visibility-output-parity.test.ts`; `buildRxPayload` | Loop `archiveRxTemplate` on opt-in. Prove: round-trip save→apply; full-template carries custom sections; tolerant drop of stale id; `buildRxPayload` byte-identical. Run gate, update status. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| subj-39 | M | **Opus** | Carries a migration (hard-rules STOP) + a storage-shape change threaded across 6+ files on both layers; the whole phase rests on it. Risk concentrated here. |
| subj-40 | M | Sonnet | Clones the shipped Phase-6 scoped save/apply button onto custom blocks; bounded by `apply-subjective-template.ts` + one new button. No migration. |
| subj-41 | M | Sonnet | Orchestration: full-template merge-by-id + a multi-state delete dialog with client-side counts. Bounded, no schema. |
| subj-42 | S–M | Auto | Cascade loop + tests + verification; no output-parity fixture risk (view-only by construction). |

**Caps check:** 1 Opus in Phase 12 (subj-39, the migration + storage slice). ✓

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p12-custom-section-templates-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p12-custom-section-templates-batch.md`](../plan-p12-custom-section-templates-batch.md).
- Tasks: [`task-subj-39-…`](./task-subj-39-custom-template-scope-foundation.md) · [`task-subj-40-…`](./task-subj-40-custom-section-template-button.md) · [`task-subj-41-…`](./task-subj-41-full-template-and-delete-warning.md) · [`task-subj-42-…`](./task-subj-42-integration-and-verification.md).
- Phase 6 (template substrate): [`../../p6-section-templates/plan-p6-subjective-section-templates-batch.md`](../../p6-section-templates/plan-p6-subjective-section-templates-batch.md).
- Phase 11 (predecessor — stable id): [`../../p11-custom-section-visibility/plan-p11-custom-section-visibility-batch.md`](../../p11-custom-section-visibility/plan-p11-custom-section-visibility-batch.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md) · [`MIGRATIONS_AND_CHANGE.md`](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md).

---

**Created:** 2026-06-18. **Status:** ✅ Done (subj-39..42).
