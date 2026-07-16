# Assessment tab — 09 Jul 2026 program

> **Why this exists.** The Cockpit "Assessment" tab is redundant. In the v3 flat-tab registry the `assessment` tab renders nothing but `<AssessmentStrip>` — the same ~60px Working-Dx + DDx bar that is already docked as a glance surface — while the Plan pane still mounts `<AssessmentSection dxLifted>`, which renders only a passive *pointer* back to the strip. So a whole tab (and a second stubbed section) exists for exactly **two** data points: `prescriptions.provisional_diagnosis` (one free-text string) and `prescriptions.differential_diagnosis` (a chip array). There is no clinical reasoning note, no diagnosis structure (certainty / status / severity), and no connection between the visit's diagnosis and the patient's longitudinal problem list (`patient_chronic_conditions` / `patient_problem_list_v`), which lives entirely in a different part of the chart.
>
> **What this program does.** Turn the redundant echo into a real **Assessment editor**: the `assessment` tab becomes the canonical place to reason (the strip stays the docked at-a-glance), and it is built up in phases — (1) **repurpose** the tab (no migration, no data): full editor in the tab, kill the dead pointer, keep the strip as glance; (2) **impression note + acuity** — a short clinical-reasoning narrative and a visit-level trajectory (improving / stable / worsening); (3) **structured diagnoses** — primary/secondary Dx rows carrying certainty, status and severity, with `provisional_diagnosis` TEXT still derived byte-identically; (4) **problem-list linkage** — reconcile a visit Dx with an existing chronic problem or promote a new Dx to a chronic condition, reusing the shipped chart API.
>
> **Builds on (reuse, do not fork):** the flat-tab registry + `PaneDefinition` (`cockpit-tabs.tsx`, `PANE_ICONS.assessment`); the `AssessmentStrip` glance surface + the ribbon 🎯 focus target (`id="diagnosis"`, `PatientRibbon.tsx`); the `RxFormContext` reducer + `buildRxPayload` derive-on-save discipline that already keeps `test_results` / `examination_findings` byte-identical (OBJ-D2); tolerant JSONB + Zod (`test_results_json` / migration 154, `examination_json` / migration 150) as the model pattern; the chronic-conditions chart API (`createPatientCondition` etc., `ProblemOrientedMedicalSection.tsx`, migrations 096 / 129).

---

## The one-sentence goal

> **Stop the Assessment tab being a redundant echo of the strip: make it the canonical Assessment editor, add a clinical-impression note + visit acuity, model diagnoses as structured primary/secondary rows (certainty / status / severity) while keeping `provisional_diagnosis` TEXT byte-identical, and let the doctor reconcile a visit Dx with the longitudinal problem list — shipped in phases where A1 is pure UI cleanup (no migration) and every schema/cross-layer phase is Opus-gated per the agent contract.**

---

## Decision lock (freezes on promotion)

- **ASMT-D1 — Tab = full editor, strip = glance.** The `assessment` tab hosts the full Assessment editor. `AssessmentStrip` stays the docked at-a-glance (primary Dx + DDx) where the shell mounts it. There is no third Assessment surface. The dead `dxLifted` *pointer* branch in `AssessmentSection` is removed.
- **ASMT-D2 — One state, one output substrate.** Strip and tab both read/write the same `RxFormContext` fields; neither owns a private copy. The strip continues to own `id="diagnosis"` (glance input + ribbon 🎯 focus target); the tab editor uses a **distinct** anchor to avoid a duplicate DOM id.
- **ASMT-D3 — Additive + optional; old prescriptions valid.** Every new field is nullable. A mid-call draft with only CC + Dx must still save. No required field, ever.
- **ASMT-D4 — Derivation parity (OBJ-D2 analog).** `provisional_diagnosis` TEXT and `differential_diagnosis` stay the canonical output substrate. When diagnoses become structured (A3), the **primary** Dx label derives into `provisional_diagnosis` so that for equal content the value is **byte-identical** to today; PDF / SMS / snapshot / notification readers are untouched.
  - **ASMT-D4′ (A5 reversal) — DDx folds into the cards.** Originally A3 kept `differential_diagnosis` as a **separate** chip list ("not folded into `diagnoses_json` in v1"). A5 reverses this: `differential` becomes a card role and `differential_diagnosis` is **derived** from cards where `kind==='differential' && certainty!=='excluded'`, byte-identical for equal content. Excluded differentials are retained in `diagnoses_json` but omitted from patient output. The output *shape* is unchanged; only the derivation changes. See [`Tasks/task-asmt-05-differential-role-and-card-entry.md`](./Tasks/task-asmt-05-differential-role-and-card-entry.md).
- **ASMT-D5 — Impression note is clinician reasoning, private by default.** The impression note mirrors `clinical_notes` privacy: it does **not** render on the patient PDF/SMS in v1. Revisit only if product explicitly asks.
- **ASMT-D6 — Problem-list linkage reconciles, never auto-writes.** Marking a visit Dx as an existing chronic problem, or promoting a new Dx to a chronic condition, is always an **explicit** doctor action. Saving a prescription never silently creates/edits a `patient_chronic_conditions` row. Reuses the shipped chart API; no new problem store.
- **ASMT-D7 — No coding vocabulary in v1.** No ICD-10 / SNOMED codes or code search in this program. Dx labels stay free-text (catalog-assisted entry may come later). Deferred, documented.
  - **ASMT-D7′ (A6/A7 reversal) — ICD-11 coding is added, additive + optional.** Originally A3 kept Dx labels free-text with "no coding vocabulary in v1". A6/A7 reverses this: a local seeded **ICD-11 (MMS)** `diagnosis_catalog` powers a catalog autocomplete (A6) and constrains a gated, suggestion-only AI resolver (A7). Coding stays **additive + optional** — `code`/`codeTitle` are nullable, uncoded rows still save (ASMT-D3), and coding **never** alters the derived `provisional_diagnosis` / `differential_diagnosis` TEXT (upholds ASMT-D4/D4′). PHI discipline + no RLS edits (ASMT-D8) and no silent chronic-condition writes (ASMT-D6) are upheld. See [`Tasks/task-asmt-06-icd-coded-diagnosis-entry.md`](./Tasks/task-asmt-06-icd-coded-diagnosis-entry.md). **Vocabulary = ICD-11** (user-approved); flip to ICD-10 only if near-term govt/insurance reporting requires it.
- **ASMT-D8 — PHI discipline; no RLS edits.** New columns are PHI (diagnosis + reasoning) and inherit the existing `prescriptions` RLS (`auth.uid() = doctor_id`, migration 026); no policy edits. Never log Dx / impression text. Migrations idempotent with a documented (not shipped) rollback; 7-year retention per COMPLIANCE.

---

## Phasing (each phase shippable alone)

| Phase | Task | Scope | Migration? | AI/PHI? | Model |
|---|---|---|---|---|---|
| **A1** | `asmt-01` | Repurpose the tab: full Assessment editor in the `assessment` tab, strip stays glance-only, remove the dead `dxLifted` pointer, resolve the duplicate Dx id/anchor | No | No | Sonnet |
| **A2** | `asmt-02` | Impression note + visit acuity: `assessment_note` + `assessment_acuity` columns, tolerant Zod, form wiring, **not** added to patient output (ASMT-D5) | **Yes** | PHI column | **Opus** |
| **A3** | `asmt-03` | Structured diagnoses: `diagnoses_json` (primary/secondary + certainty + status + severity) + tolerant Zod + `provisional_diagnosis` derivation parity | **Yes** | PHI column | **Opus** |
| **A4** | `asmt-04` | Problem-list linkage: reconcile a visit Dx ↔ chronic condition, promote new Dx → chronic condition, reuse chart API | Maybe (no new column) | PHI (cross-layer) | **Opus** |
| **A5** | `asmt-05` | Fold DDx into the cards: `differential` role + `excluded` state + type-to-card entry; derive `differential_diagnosis` from non-excluded differential cards byte-identical; retire `DdxChipList`; reduced differential card | **No** (JSONB enum-agnostic) | PHI (derivation change) | **Opus** |
| **A6** | `asmt-06` (Wave 6) | ICD-11 coding — `diagnosis_catalog` reference table (migration 162) + **full WHO ICD-11 MMS import** (~18k codes, chapters 01–26; migration 163) + server-side `search_diagnosis_catalog` fn (migration 164) + `GET /diagnoses/search` + `DiagnosisAutocomplete`; nullable `code`/`codeTitle` on the row (additive; output byte-identical) | **Yes** (new reference table + full import) | PHI-adjacent (labels PHI; catalog non-PHI) | **Opus** |
| **A7** | `asmt-07` (Wave 7) | Gated AI ICD resolver — `POST /diagnoses/parse`, catalog-constrained, suggestion-only proposal UI | No (endpoint only) | **AI call** + PHI-adjacent | **Opus** |
| **Deferred** | — | AI "suggest whole assessment from S/O" (broad); A&P merge experiment | — | — | later program |

**Agent-contract escalations (called out, not hidden):** `asmt-02` and `asmt-03` each add a new migration + PHI column → **Opus + STOP/flag**. `asmt-04` crosses the visit + chart layers and writes chronic-condition PHI → **Opus + STOP/flag**. `asmt-05` changes the derivation of a patient-facing field (`differential_diagnosis`), is a 5+ file refactor, and reverses ASMT-D4 (no migration) → **Opus + STOP/flag**. `asmt-01` is pure UI/registry (no migration/PHI/RLS) → Sonnet, ship first.

---

## What this program does NOT do (deferred)

| Item | Why / where it lands |
|---|---|
| ~~ICD-10 / SNOMED coding + search~~ | **Reversed (ASMT-D7′).** Now in scope as **ICD-11** coding — catalog autocomplete (A6 / `asmt-06`) + gated AI resolver (A7 / `asmt-07`), mirroring the drug-master picker + complaint parse patterns. |
| AI-generated assessment (broad "suggest whole assessment from S/O") | Belongs to the EHR AI-assist track (`docs/Work/Product plans/ehr/plan-t6-ehr-ai-assist.md`). The narrower **diagnosis-coding** slice is now in scope as A7 (`asmt-07`), behind a verify-before-apply proposal like the complaint/medicine parse services. |
| Merging Assessment into Plan ("A&P") | Considered and rejected for v1 (keeps the 7-tab SOAP shape); can be revisited as a layout experiment later. |
| Putting the impression note on the patient PDF/SMS | ASMT-D5 — private by default; product decision to surface it later. |
| Auto-creating problems from a visit Dx | ASMT-D6 — reconciliation is always explicit. |

---

## Where it will be built (current code)

- **Tab registry / icon / order:** `frontend/lib/patient-profile/v3/cockpit-tabs.tsx` (`assessment` tab ≈ L221–230, `COCKPIT_TAB_ORDER`); `frontend/lib/patient-profile/pane-icons.ts` (`PANE_ICONS.assessment`).
- **Editor + glance surfaces:** `frontend/components/cockpit/rx/sections/AssessmentSection.tsx` (owns the editor; remove `dxLifted` pointer), `frontend/components/cockpit/middle/AssessmentStrip.tsx` (glance, keeps `id="diagnosis"`), `frontend/components/cockpit/rx/inputs/DdxChipList.tsx`.
- **Form state / derivation:** `frontend/components/cockpit/rx/RxFormContext.tsx` (`RxFormFields`, `rxFormReducer`, `buildRxPayload`, `rxFormFieldsFromPrescription`).
- **Types + Zod:** `frontend/types/prescription.ts`, `backend/src/types/prescription.ts`, `backend/src/utils/validation.ts` (`differentialDiagnosis` ≈ L2523; `structuredSoap` input schema).
- **Output readers (must stay byte-identical):** `backend/src/services/prescription-pdf-composer.ts`, `backend/src/templates/prescription-pdf/PrescriptionDocument.tsx`, `backend/src/services/notification-service.ts`, `frontend/components/patient-profile/side-sheets/VisitDetailSideSheet.tsx`.
- **Ribbon focus target:** `frontend/components/patient-profile/PatientRibbon.tsx` (🎯 → `id="diagnosis"`).
- **Problem list (A4):** `patient_chronic_conditions` (migration 129), `patient_problem_list_v` (migration 096), chart API in `frontend/lib/api` (`createPatientCondition` etc.), `frontend/components/ehr/sections/ProblemOrientedMedicalSection.tsx`.
- **Migrations:** `backend/migrations/` (next free number **160**; pattern = `154_prescriptions_test_results_json.sql` / `150_prescriptions_examination_json.sql`). Confirm the next free number at implementation time — cross-program ordering may shift.

---

## Promotion note

If promoted to a formal program, register under `docs/Work/Product plans/ehr/` beside the objective-tab / subjective-tab / objective-reports plans and cross-link. This is the **Assessment ("A") counterpart** to the objective-reports (Objective "O") and subjective-tab (Subjective "S") programs — cite that lineage when promoting.

---

**Created:** 2026-07-09. **Status:** Draft — not committed, not implemented. **Pattern:** kill the redundant echo, make the tab the canonical editor, model diagnoses as derive-on-save structured rows (byte-identical TEXT), reconcile with the longitudinal problem list — schema/cross-layer phases behind Opus gates.
