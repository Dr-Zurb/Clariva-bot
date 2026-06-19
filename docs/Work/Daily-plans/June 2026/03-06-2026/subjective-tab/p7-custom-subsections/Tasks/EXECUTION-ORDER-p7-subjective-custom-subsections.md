# Subjective tab — Phase 7: custom subsections — execution order

> Sibling of [`plan-p7-subjective-custom-subsections-batch.md`](../plan-p7-subjective-custom-subsections-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** `subj-19` lands the data model + form-state field + save/hydrate substrate and runs first. `subj-20` (editor UI) and `subj-21` (per-doctor default + seed-on-empty) both depend on subj-19's shape but touch disjoint surfaces — they run as two parallel lanes. `subj-22` (PDF/SMS/snapshot output + whole-program close-gate) renders the derived mirror and asserts byte-parity, so it runs **after** the shape and seeding are stable.

---

## Wave plan (3 waves)

```
Wave 1 (substrate — ~2–3h):
  subj-19 (custom_subsections JSONB on prescriptions + RxForm field +
           reducer + save/hydrate + derived TEXT mirror + Zod)

        │
        ├──────────────────────────────┐
        ▼                              ▼
Wave 2 (~3–4h)                  Wave 2 (~3–4h)
  subj-20 (editor UI:             subj-21 (doctor_settings default
   add/rename/reorder/remove        column + API + seed-on-empty on
   section + one nested level)      fresh visit + "save as default")
   [Lane α]                         [Lane β]
        │                              │
        └──────────────┬───────────────┘
                       ▼
Wave 3 (~3–5h):
  subj-22 (PDF/SMS/snapshot output + close-gate: cc/hopi byte-parity)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **subj-19** | M | Sonnet | `116_prescriptions_subjective_expansion.sql` + `125`/`126`/`127`; `backend/src/types/prescription.ts` (`SubjectiveInput`, `Prescription`); `validation.ts` (`subjectiveFieldsSchema`); `prescription-service.ts` (create/update field mapping); `frontend/types/prescription.ts`; `RxFormContext.tsx` (`RxFormFields`, reducer, `buildRxPayload`, `rxFormFieldsFromPrescription`) | Migration `144_prescriptions_custom_subsections.sql` (`JSONB DEFAULT '[]'`, `jsonb_typeof='array'` CHECK); `customSubsections` on types both sides + `SubjectiveInput`; Zod tree schema (depth 2, count/length caps); reducer actions (add/update/remove/reorder for section + child); save in `buildRxPayload`; hydrate in `rxFormFieldsFromPrescription`; derived TEXT mirror on save. |
| W2.α | subj-20 | M | Sonnet | `SubjectiveSection.tsx` (free-text notes block — mount point); `CollapsibleContainer.tsx`; an existing structured field for UX parity (`FamilyHistoryField.tsx` / `PastSurgicalHistoryField.tsx`); `field-styles.ts`; subj-19 form-state field + actions | `CustomSubsectionsField` mounted below free-text notes; add/rename/reorder/remove section + one level of sub-subsection; hard depth cap (no "add child" on a child); a11y + keyboard; respects `disabled`. |
| W2.β | subj-21 | M | Sonnet | `doctor_settings` migrations (`099`/`112` `cockpit_layout_presets`); `doctor-settings-service.ts`; `doctor-settings.ts` types; the doctor-settings route/controller; subj-19 shape + `rxFormFieldsFromPrescription` (seed hook point) | Migration `145_doctor_settings_subjective_custom_subsections.sql`; service get/set for the per-doctor default; GET/PATCH API; **seed-on-empty** when a fresh visit hydrates with no custom subsections (never clobber); "Save current as my default sections" action. |
| W3.0 | **subj-22** | M | **Opus** | `prescription-pdf-composer.ts`; `PrescriptionDocument.tsx` + `types.ts`; the SMS/snapshot text builders; subj-10 close-gate fixtures; subj-19 derived mirror | Render custom subsections as an ordered clinical block in PDF + SMS/snapshot (omit empty); whole-program close-gate — assert `cc`/`hopi` derive byte-identically and existing fields unchanged; a11y/integration sweep. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| subj-19 | M | Sonnet | Additive column + a recursive (depth-2) Zod schema + reducer actions + round-trip; clones the shipped structured-history pattern but the tree shape + caps need care. |
| subj-20 | M | Sonnet | Dynamic add/reorder/nest UI; bounded by the existing structured-field components and `CollapsibleContainer`. |
| subj-21 | M | Sonnet | Per-doctor JSONB default + API + a seed-on-empty hook; clones `cockpit_layout_presets`; the only subtlety is "never re-seed a saved visit". |
| subj-22 | M | **Opus** | Patient-facing output across PDF/SMS/snapshot **plus** the whole-program byte-parity close-gate — highest blast radius (compliance + downstream artifacts). |

**Caps check:** 1 Opus in Phase 7 (subj-22, the output + close-gate slice). ✓

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p7-subjective-custom-subsections-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p7-subjective-custom-subsections-batch.md`](../plan-p7-subjective-custom-subsections-batch.md).
- Tasks: [`task-subj-19-…`](./task-subj-19-data-model-custom-subsections.md) · [`task-subj-20-…`](./task-subj-20-custom-subsections-editor-ui.md) · [`task-subj-21-…`](./task-subj-21-doctor-default-subsections.md) · [`task-subj-22-…`](./task-subj-22-output-and-close-gate.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-17. **Status:** ⏳ `Planned`.
