# Assessment tab — execution order

> Sibling of [`plan-assessment-tab-batch.md`](../plan-assessment-tab-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** `docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`

> **Shape.** `asmt-01` is the visible win and pure cleanup — the `assessment` tab renders the real editor instead of the bare strip, the dead `dxLifted` pointer is removed, and the duplicate `id="diagnosis"` is resolved; no migration → ship it first, alone. `asmt-02` adds the clinical-impression note + visit acuity (one migration, two flat PHI columns) and is an agent-contract escalation → **Opus + STOP/flag**. `asmt-03` reworks the single free-text Dx into a structured `diagnoses_json` row model and must prove `provisional_diagnosis` derivation byte-identical — the second migration/PHI escalation → **Opus + STOP/flag**. `asmt-04` reconciles a visit Dx with the chronic problem list, crossing the visit + chart layers and writing chronic-condition PHI → **Opus + STOP/flag**. `asmt-05` folds the separate DDx chip list into the cards (`differential` role + `excluded` state + type-to-card entry), deriving patient-facing `differential_diagnosis` from non-excluded differential cards byte-identically — **no migration**, but a patient-facing derivation change + 5+ file refactor that **reverses ASMT-D4** → **Opus + STOP/flag**. `asmt-06` adds **ICD-11 coding** — a seeded `diagnosis_catalog` reference table + `GET /diagnoses/search` + a `DiagnosisAutocomplete` that hangs nullable `code`/`codeTitle` on the row (additive + optional, output byte-identical); a new migration + multi-file cross-layer change that **reverses ASMT-D7** → **Opus + STOP/flag**. `asmt-07` adds the gated, catalog-constrained, suggestion-only **AI ICD resolver** (`POST /diagnoses/parse`) — new AI endpoint, no migration → **Opus + STOP/flag**. Strictly linear (each phase builds on the last).

---

## Wave plan (7 waves)

```
Wave 1 (cleanup — ~3–4h, NO migration):
  asmt-01 (assessment tab renders full editor; strip stays glance;
           remove dead dxLifted pointer; fix duplicate Dx id/anchor;
           keep Plan's dxLifted hide + ribbon 🎯 target)
        │
        ▼
Wave 2 (substrate — ~4–6h, MIGRATION + PHI → Opus + STOP/flag):
  asmt-02 (assessment_note + assessment_acuity columns; migration 160;
           tolerant Zod FE+BE; form wiring; PRIVATE — not on patient output)
        │
        ▼
Wave 3 (~5–7h, MIGRATION + PHI → Opus + STOP/flag):
  asmt-03 (diagnoses_json: primary/secondary + certainty + status + severity;
           migration 161; tolerant Zod; provisional_diagnosis derivation
           byte-identical; DDx unchanged)
        │
        ▼
Wave 4 (~4–6h, CROSS-LAYER + chronic-condition PHI → Opus + STOP/flag):
  asmt-04 (link visit Dx ↔ chronic condition; promote new Dx → condition;
           reuse chart API; reconciliation always explicit)
        │
        ▼
Wave 5 (~5–7h, NO migration; patient-facing derivation + 5+ file refactor →
        Opus + STOP/flag; reverses ASMT-D4):
  asmt-05 (fold DDx into the cards: differential role + excluded state +
           type-to-card entry; derive differential_diagnosis from non-excluded
           differential cards byte-identical; retire DdxChipList; reduced
           differential card)
        │
        ▼
Wave 6 (~5–7h, MIGRATIONS (new reference table + full import) + cross-layer →
        Opus + STOP/flag; reverses ASMT-D7):
  asmt-06 (ICD-11 coding: diagnosis_catalog table + curated vernacular seed
           (migration 162) + FULL WHO ICD-11 MMS import ~18k codes
           (migration 163) + search_diagnosis_catalog SQL fn (migration 164),
           non-PHI, read policy; GET /diagnoses/search; DiagnosisAutocomplete;
           nullable code/codeTitle on the row; code chip on the card;
           output byte-identical (D3/D4/D4′))
        │
        ▼
Wave 7 (~4–6h, NO migration; new AI endpoint + PHI-adjacent →
        Opus + STOP/flag):
  asmt-07 (gated AI ICD resolver: POST /diagnoses/parse, catalog-constrained,
           suggestion-only verify-before-apply proposal UI)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **asmt-01** | M | Sonnet | `frontend/lib/patient-profile/v3/cockpit-tabs.tsx` (assessment tab ≈ L221–230); `AssessmentSection.tsx` (`dxLifted` branch L30–48); `AssessmentStrip.tsx` (`id="diagnosis"`); `DdxChipList.tsx`; `PatientRibbon.tsx` (🎯 → `id="diagnosis"`); `cockpit-tabs.test.tsx`; `AssessmentSection.test.tsx`; `AssessmentStrip.test.tsx` | Make the tab render the full `AssessmentSection` editor; keep the strip as glance (still owns `id="diagnosis"`); give the tab editor a **distinct** anchor (no duplicate DOM id); delete the dead `dxLifted` pointer branch (Plan keeps hiding its own Dx). **No migration, no data change.** Prove the ribbon 🎯 still focuses the strip Dx and no test asserts the old pointer copy. |
| W2.0 | **asmt-02** | M–L | **Opus** | asmt-01 output; `frontend/types/prescription.ts` + `backend/src/types/prescription.ts` (`Prescription`, `StructuredSoapInput`); `backend/src/utils/validation.ts` (structuredSoap schema ≈ `differentialDiagnosis` L2523); `RxFormContext.tsx` (`RxFormFields`, `rxFormFieldsFromPrescription`, `buildRxPayload`); migration pattern `154_/150_`; PDF/SMS readers (to prove they DON'T change) | **STOP/flag first (migration + PHI column).** Add `assessment_note` TEXT + `assessment_acuity` (enum-ish: `improving`/`stable`/`worsening`) as nullable columns (migration **160**, idempotent, documented rollback, no RLS). Widen tolerant Zod; wire two fields through hydrate → reducer → payload. **ASMT-D5:** neither field is added to the patient PDF/SMS derivation. |
| W3.0 | **asmt-03** | L | **Opus** | asmt-02 output; the two `prescription.ts` type files; `validation.ts`; `RxFormContext.tsx` (`buildRxPayload` `provisionalDiagnosis` derive ≈ L1191, reducer DDx actions); `test-results.ts` (derive-on-save precedent); output readers listed in README | **STOP/flag first (migration + PHI column).** Add `diagnoses_json` JSONB: rows `{ id, label, kind: 'primary'|'secondary', certainty: 'provisional'|'rule_out'|'confirmed', status: 'new'|'ongoing'|'resolved', severity?, note? }` (migration **161**). Tolerant Zod (drop bad rows). **Derivation parity:** primary-row label → `provisional_diagnosis` byte-identical for equal content; a legacy single free-text Dx hydrates into one primary row; DDx stays `differential_diagnosis`. |
| W4.0 | **asmt-04** | M–L | **Opus** | asmt-03 `diagnoses_json` row shape; `backend/migrations/129_patient_chronic_conditions_status.sql`, `096_patient_problem_list_view.sql`; chart API `createPatientCondition`/`updatePatientCondition` in `frontend/lib/api`; `ProblemOrientedMedicalSection.tsx` (commit/promote flow) | **STOP/flag first (cross-layer + chronic-condition PHI).** Add an optional `conditionId` link on the diagnosis row (lives in `diagnoses_json` → **no new column**) + a **verify-style** promote action reusing the shipped chart API. Reconciliation is always explicit (ASMT-D6); saving a prescription never auto-creates a condition. Confirm whether a migration is truly avoidable before writing code. |
| W5.0 | **asmt-05** | L | **Opus** | asmt-03/04 output; the two `prescription.ts` type files (`DiagnosisKind`/`DiagnosisCertainty` L22-31); `validation.ts` (`DIAGNOSIS_KIND_VALUES`/`DIAGNOSIS_CERTAINTY_VALUES` L1716-1717); `diagnoses.ts` (helpers); `RxFormContext.tsx` (hydrate L1029-1040, `buildRxPayload` L1246-1253, reducer); `DiagnosisRowsList.tsx`; `DdxChipList.tsx`; `AssessmentStrip.tsx` (DDx glance); migration 161 (confirm no `kind`/`certainty` CHECK); output readers (prove shape unchanged) | **STOP/flag first (patient-facing derivation change + 5+ file refactor; reverses ASMT-D4).** Add `differential` to `DiagnosisKind` + `excluded` to `DiagnosisCertainty` (**no migration** — SQL only checks `jsonb_typeof=array`). Fold the `DdxChipList` into the cards; type-Enter drops a card; reduced differential card (label + Considering/Excluded + note). **Derivation parity:** `differential_diagnosis` derived from `kind==='differential' && certainty!=='excluded'` cards, byte-identical for equal content; excluded differentials kept in `diagnoses_json` but omitted from patient output; legacy DDx hydrates into differential cards. `provisional_diagnosis` unchanged. |
| W6.0 | **asmt-06** | L | **Opus** | asmt-03/05 row shape; the two `prescription.ts` type files (`DiagnosisRow`); `validation.ts` (`diagnosisRowSchema`); `complaint-master-service.ts` + `complaint-master.ts` API client + `ComplaintAutocomplete.tsx` (mirror pattern); `diagnoses.ts` route mount; migration pattern `154_/150_`; `RxFormContext.tsx` (hydrate/`buildRxPayload`, prove output byte-identical) | **STOP/flag first (new migrations + multi-file cross-layer; reverses ASMT-D7 per ASMT-D7′).** Add nullable `code`/`codeTitle` to the diagnosis row (additive; uncoded rows still save, ASMT-D3). Create `diagnosis_catalog` (migration **162**, table + curated vernacular-synonym seed, non-PHI, `read_all` policy, idempotent, documented rollback). Load the **full WHO ICD-11 MMS (~18k codes, chapters 01–26; X+V excluded)** via generated migration **163** (idempotent on `lower(code)` so 162's synonyms survive; generator `backend/scripts/generate-diagnosis-catalog-seed.js`). Add server-side `search_diagnosis_catalog` fn (migration **164**) — the TS fetch-all ranking can't pass PostgREST's 1000-row read cap, so the DB returns a ranked candidate set and the service refines it. Add `diagnosis-catalog-service` + `GET /api/v1/diagnoses/search` + `DiagnosisAutocomplete` (mirror `ComplaintAutocomplete`) + a code chip on the card. **Coding NEVER alters derived `provisional_diagnosis` / `differential_diagnosis` TEXT (ASMT-D4/D4′).** **Vocabulary = ICD-11** (user-approved). |
| W7.0 | **asmt-07** | M–L | **Opus** | asmt-06 catalog + row shape; complaint/medicine **parse** services + verify-before-apply proposal UIs (mirror pattern); `config/env.ts` (AI keys); `diagnoses.ts` route mount | **STOP/flag first (new AI endpoint + PHI-adjacent).** Add `POST /api/v1/diagnoses/parse` that maps free-text Dx → `diagnosis_catalog` terms, **catalog-constrained** (never invents codes) and **suggestion-only** (doctor confirms before apply). No migration. Never log Dx text; reuse the shipped parse-service + proposal-dialog pattern. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| asmt-01 | M | Sonnet | Tab-registry + component wiring across ~4 single-layer files; no migration, no data. Blast radius contained by the assessment/tab test suites. |
| asmt-02 | M–L | **Opus** | New migration + new PHI columns + cross-stack Zod/form wiring → agent-contract migration/PHI escalation. |
| asmt-03 | L | **Opus** | New migration + new PHI column + a derive-on-save parity contract on a patient-facing field → migration/PHI escalation with the highest correctness risk. |
| asmt-04 | M–L | **Opus** | Cross-layer write into `patient_chronic_conditions` (chart PHI) driven from the visit form → agent-contract escalation (touches PHI beyond `prescriptions`). |
| asmt-05 | L | **Opus** | Changes derivation of a patient-facing field (`differential_diagnosis`) + a 5+ file cross-stack refactor + reverses a decision lock (ASMT-D4) → agent-contract escalation. No migration (JSONB enum-agnostic), but the highest DDx-parity correctness risk. |
| asmt-06 | L | **Opus** | New migration (`diagnosis_catalog`) + multi-file cross-layer change (DB + API + service + FE) + reverses a decision lock (ASMT-D7) → agent-contract escalation. Catalog is non-PHI; row labels are PHI. |
| asmt-07 | M–L | **Opus** | New AI endpoint (`POST /diagnoses/parse`) taking PHI-adjacent free-text → agent-contract escalation. Catalog-constrained + suggestion-only; no migration. |

**Caps check:** ≤1 Opus per wave ✓. **Program Opus count = 6** (asmt-02, asmt-03, asmt-04, asmt-05, asmt-06, asmt-07). All STOP/flag before writing per `.cursor/rules/00-agent-contract.mdc`.

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-assessment-tab-batch.md#cross-cutting-acceptance-gate-whole-program).

---

## References

- Batch plan: [`plan-assessment-tab-batch.md`](../plan-assessment-tab-batch.md) · overview [`README.md`](../README.md).
- Tasks: [`task-asmt-01`](./task-asmt-01-repurpose-tab.md) · [`task-asmt-02`](./task-asmt-02-impression-and-acuity.md) · [`task-asmt-03`](./task-asmt-03-structured-diagnoses.md) · [`task-asmt-04`](./task-asmt-04-problem-list-linkage.md) · [`task-asmt-05`](./task-asmt-05-differential-role-and-card-entry.md) · [`task-asmt-06`](./task-asmt-06-icd-coded-diagnosis-entry.md) · `task-asmt-07` (gated AI ICD resolver — planned).
- Process: `docs/Work/process/EXECUTION-ORDER-GUIDELINES.md` · `CODE_CHANGE_RULES.md`. Agent contract: `.cursor/rules/00-agent-contract.mdc`.

---

**Created:** 2026-07-09. **Status:** Draft — not committed, not implemented.
