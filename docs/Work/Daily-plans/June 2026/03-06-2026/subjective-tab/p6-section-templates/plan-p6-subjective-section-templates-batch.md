# Subjective tab — Phase 6: section templates (scoped per-subsection + whole-section) — 17 Jun 2026 batch plan

> **Phase 6 of the Subjective-tab program.** Phase 2 (`subj-08`) shipped one **whole-subjective** preset (the `Presets` button) reusing `doctor_rx_templates` + `TemplatePicker`. Phase 6 generalises that into **scoped templates**: every subsection gets its *own* Templates button that saves/applies **only that subsection's data**, plus the whole-subjective template is upgraded to also carry **PMH conditions/meds**. The hard part is that two subsections (**Past medical history**, **Allergies**) are **server-backed chart data**, not RxForm state — so their apply is *create-rows-on-chart*, not a reducer dispatch.
>
> **Source plan:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) — extends **ST.8** (subjective presets). Inherits **ST-D1..ST-D7** + the Phase-1/2 decision lock (complaints array, derived `cc`/`hopi`, per-doctor templates).
>
> **Prefix note:** tasks are `subj-15..18`, continuing the program numbering.
>
> **Builds on:** Phase 2 ([`../p2-fast-entry/`](../p2-fast-entry/)) — the shipped subjective-preset infra this phase scopes: [`119_doctor_rx_templates_subjective_json.sql`](../../../../../../../backend/migrations/119_doctor_rx_templates_subjective_json.sql), [`apply-subjective-template.ts`](../../../../../../../frontend/lib/cockpit/apply-subjective-template.ts), [`SubjectivePresetButton.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SubjectivePresetButton.tsx), [`TemplatePicker.tsx`](../../../../../../../frontend/components/ehr/TemplatePicker.tsx). And the server chart write paths: [`createPatientCondition`/`createPatientMedication`/`createPatientAllergy`](../../../../../../../frontend/lib/api.ts).
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). subj-15/16 are Auto (substrate + form-state apply that clones shipped subj-08). subj-17 (server-apply, dedup, partial-failure) is the Opus-grade slice; subj-18 (full orchestration) is Sonnet.
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p6-subjective-section-templates.md`](./Tasks/EXECUTION-ORDER-p6-subjective-section-templates.md).

---

## What Phase 6 does (one sentence)

> **Add a `scope` to `doctor_rx_templates` so each subjective subsection (chief complaints, past surgical, family, social, past medical, allergies) gets its own scoped Templates button that saves/applies only its own data — form-state scopes via the Phase-1 reducer, server-backed scopes (PMH/allergies) via chart-row creates — and upgrade the whole-subjective template to also include PMH.**

---

## Scope (confirmed with doctor, 2026-06-17)

| Subsection | Data source | Save reads from | Apply mechanism | Scope value |
|---|---|---|---|---|
| Chief complaints | RxForm state | `fields.complaints` | reducer dispatch | `chief_complaints` |
| Past surgical history | RxForm state | `fields.pastSurgicalHistory*` | reducer dispatch | `past_surgical` |
| Family history | RxForm state | `fields.familyHistory*` | reducer dispatch | `family_history` |
| Social / personal history | RxForm state | `fields.socialHistory*` | reducer dispatch | `social_history` |
| **Past medical history** | **server chart** | patient conditions + meds | **create chart rows (dedup)** | `past_medical` |
| **Allergies** | **server chart** | patient allergies | **create chart rows (dedup)** | `allergies` |
| **Whole subjective** | mixed | all of the above **incl. PMH** | reducer **+** chart creates | `subjective_full` |

**Excluded from `subjective_full`:** allergies (its own scoped button only) — per the doctor's choice to add only PMH to the full bundle. Revisit if requested.

---

## Decision lock (frozen for this phase)

- **P6-D1 — one table, add a `scope` discriminator.** Reuse `doctor_rx_templates` + `TemplatePicker`; do **not** build per-section tables. `scope` filters the picker list and tags new rows.
- **P6-D2 — scoped apply is surgical.** A `chief_complaints` template touches *only* complaints; a `past_medical` template touches *only* PMH chart rows. Never cross-write other subsections.
- **P6-D3 — server-backed apply is create-with-dedup.** PMH/allergy apply **creates** chart rows for the patient (name-based dedup against existing rows; skip duplicates). It never deletes/replaces existing chart data.
- **P6-D4 — form-state stays array/structured (ST-D1).** Scoped form templates fill the `complaints` array / structured history, not raw text; `cc`/`hopi` stay derived.
- **P6-D5 — per-doctor (T2-D2).** All scopes share the existing doctor-scoped RLS on `doctor_rx_templates`; no clinic sharing.
- **P6-D6 — "Templates" everywhere.** Rename the global `Presets` label → `Templates`; all scoped buttons read "Templates".

---

## What this phase does NOT do (deferred)

| Item | Why / lands |
|---|---|
| Allergies inside the whole-subjective (`subjective_full`) bundle | Deferred — doctor chose PMH-only for full. Trivial to add later (same path as PMH). |
| Clinic-wide / shared templates | Deferred (T2-D2). |
| Replace-mode apply (overwrite existing chart rows) | Out — apply is additive create-with-dedup only (P6-D3). |
| Template management UI (rename/reorder/folder) | Out — reuse picker's existing list + save-current. |

---

## Cross-cutting acceptance gate (whole phase)

- [ ] Migration `141_doctor_rx_templates_scope.sql` runs idempotently; `scope` defaults to `subjective_full` for existing rows; CHECK enum covers all 7 scopes; doctor-scoped RLS unchanged.
- [ ] `listRxTemplates` accepts an optional `scope` filter; the picker only lists templates of its own scope.
- [ ] Each form-state subsection (chief complaints, PSH, family, social) has a Templates button that saves only its data and applies only its data via the reducer — other subsections untouched.
- [ ] PMH Templates button saves the patient's current PMH conditions/meds and applies a template by **creating** chart rows (name-deduped against existing); allergies likewise.
- [ ] Server-apply is optimistic, handles partial failure (some rows fail) without losing the rest, and resyncs from server on error.
- [ ] Whole-subjective template now also captures + applies PMH; existing complaints/PSH/family/social behaviour unchanged; full apply shows one combined "applying…" state.
- [ ] Global button + all scoped buttons read **"Templates"**.
- [ ] `cd frontend; npx tsc --noEmit` + `npm run lint` clean; backend + frontend suites green.

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| Phase 2 | Fast entry incl. one whole-subjective preset (ST.6–ST.8) | ✅ Done (2026-06-03) |
| **Phase 6** | **Scoped per-subsection templates + PMH/allergy server-apply + full-template upgrade** | ⏳ Planned (subj-15..18) |

---

## Cost estimate

| Wave | Tasks | Sonnet / Auto | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | subj-15 (scope foundation) | 1 (Auto) | 0 | ~2–3h |
| Wave 2 | subj-16 (form-state scopes + button + wiring) | 1 (Sonnet) | 0 | ~3–4h |
| Wave 3 | subj-17 (PMH + allergy server-apply) | 0 | 1 (Opus) | ~4–6h |
| Wave 4 | subj-18 (whole-subjective upgrade) | 1 (Sonnet) | 0 | ~2–3h |
| **Total** | **4** | **3** | **1** | **~11–16h agent-time** |

---

## Sequencing notes

- **subj-15 first (substrate).** It lands the `scope` column + types + validation + the `listRxTemplates(scope)` filter + the picker `scope` prop. Everything downstream needs it.
- **subj-16 next (form-state).** Generalises `apply-subjective-template.ts` into scoped save/apply helpers, builds the reusable `SubjectiveSectionTemplateButton`, and wires the four pure-form-state subsections. Low risk — clones the shipped subj-08 path.
- **subj-17 (server-backed).** The heavy slice: `pmh_json` + `allergies_json` columns, create-on-apply with name dedup, optimistic UI + partial-failure recovery, wire PMH + allergy buttons. Independent of subj-16's UI but depends on subj-15.
- **subj-18 last (full upgrade).** Folds PMH capture/apply into `subjective_full` (reuses subj-17's PMH apply path) and renames `Presets` → `Templates`. Must run after both subj-16 and subj-17.

---

## References

- **Source:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) — ST.8 (presets) being generalised.
- **Shipped infra extended:** [`119_doctor_rx_templates_subjective_json.sql`](../../../../../../../backend/migrations/119_doctor_rx_templates_subjective_json.sql) · [`rx-template-service.ts`](../../../../../../../backend/src/services/rx-template-service.ts) · [`apply-subjective-template.ts`](../../../../../../../frontend/lib/cockpit/apply-subjective-template.ts) · [`SubjectivePresetButton.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SubjectivePresetButton.tsx) · [`TemplatePicker.tsx`](../../../../../../../frontend/components/ehr/TemplatePicker.tsx).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`TASK_MANAGEMENT_GUIDE.md`](../../../../../process/TASK_MANAGEMENT_GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).
- Sibling: [`Tasks/EXECUTION-ORDER-p6-subjective-section-templates.md`](./Tasks/EXECUTION-ORDER-p6-subjective-section-templates.md).

---

**Created:** 2026-06-17.  
**Status:** ⏳ `Planned` (2026-06-17) — Phase 6 of the Subjective-tab program; scoped templates slice.  
**Next phase:** none planned — completes the templating story.
