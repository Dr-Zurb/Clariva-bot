# Assessment tab — 09 Jul 2026 program plan

> **Program plan.** Removes the redundancy in the Cockpit "Assessment" surface (a whole tab that just re-renders the Working-Dx strip, plus a dead pointer section in Plan) and rebuilds it into a real Assessment editor: a clinical-impression note + visit acuity, structured primary/secondary diagnoses (certainty / status / severity), and reconciliation with the longitudinal problem list. Phased so A1 ships as pure UI cleanup (no migration) and the schema/cross-layer phases sit behind Opus gates per the agent contract.
>
> **Overview + decisions:** [`README.md`](./README.md) (decision locks `ASMT-D1..D8`).
>
> **Builds on (reuse, do not fork):** the flat-tab `PaneDefinition` registry (`cockpit-tabs.tsx`); the `AssessmentStrip` glance + ribbon 🎯 focus target; the `RxFormContext` derive-on-save discipline that keeps `test_results` / `examination_findings` byte-identical (OBJ-D2); tolerant JSONB + Zod (`test_results_json` / migration 154, `examination_json` / migration 150); the chronic-conditions chart API (`ProblemOrientedMedicalSection.tsx`, migrations 096 / 129).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-assessment-tab.md`](./Tasks/EXECUTION-ORDER-assessment-tab.md).

---

## What this program does (one sentence)

> **Make the Assessment tab the canonical Assessment editor instead of a redundant echo of the strip, add a private clinical-impression note + visit acuity, model diagnoses as structured primary/secondary rows (certainty / status / severity) with `provisional_diagnosis` TEXT derived byte-identical, and let the doctor reconcile a visit Dx with the chronic problem list — with every migration/cross-layer phase Opus-gated and no RLS edits.**

---

## Scope

| Surface | Change | Mechanism | Task |
|---|---|---|---|
| Tab registry | `assessment` tab renders the full editor, not the bare strip | `cockpit-tabs.tsx` (assessment `render`) | `asmt-01` |
| Editor / glance split | strip stays glance (keeps `id="diagnosis"`); tab editor uses a distinct anchor; remove dead `dxLifted` pointer | `AssessmentSection.tsx`, `AssessmentStrip.tsx` | `asmt-01` |
| Impression + acuity | `assessment_note` + `assessment_acuity` columns; form fields; **private** (not on patient output) | `prescription.ts` types (FE+BE), migration 160, `validation.ts`, `RxFormContext.tsx` | `asmt-02` |
| Structured diagnoses | `diagnoses_json` (primary/secondary + certainty + status + severity); tolerant Zod | `prescription.ts` types, migration 161, `validation.ts`, reducer/actions | `asmt-03` |
| Derivation parity | primary Dx label still derives into `provisional_diagnosis`; DDx unchanged | `buildRxPayload` in `RxFormContext.tsx` | `asmt-03` |
| Problem-list linkage | reconcile visit Dx ↔ chronic condition; promote new Dx → chronic condition | `diagnoses_json` link field (no new column) + chart API | `asmt-04` |
| DDx fold + card entry | `differential` role + `excluded` state; type-to-card entry; `differential_diagnosis` derived from non-excluded differential cards; retire `DdxChipList` | `DiagnosisKind`/`DiagnosisCertainty` (+enum values, no migration), `diagnoses.ts`, `RxFormContext.tsx`, `DiagnosisRowsList.tsx` | `asmt-05` |
| ICD-11 coding (catalog) | nullable `code`/`codeTitle` on the row; `diagnosis_catalog` reference table + **full WHO ICD-11 MMS import (~18k codes)** + server-side search fn + `GET /diagnoses/search`; `DiagnosisAutocomplete`; code chip on the card; **output byte-identical** (ASMT-D4/D4′) | `prescription.ts` types (FE+BE), migrations 162/163/164, `validation.ts`, `diagnosis-catalog-service`/controller/route, `DiagnosisAutocomplete.tsx`, `DiagnosisRowsList.tsx` | `asmt-06` |
| ICD-11 coding (AI resolver) | `POST /diagnoses/parse` gated, catalog-constrained; suggestion-only verify-before-apply proposal | AI service + controller/route + proposal UI | `asmt-07` |
| Verification | tsc/lint/test parity; `provisional_diagnosis` + `differential_diagnosis` byte-identical; PHI discipline | tests + QA notes per task | all |

**Out of scope:** broad AI-generated assessment ("suggest whole assessment from S/O"); A&P tab merge; surfacing the impression note on patient output; auto-creating problems from a visit Dx. **No longer out of scope (ASMT-D7′):** ICD-11 coding + search is now A6 (`asmt-06`, catalog autocomplete) and A7 (`asmt-07`, gated AI resolver). See [`README.md` → deferred](./README.md#what-this-program-does-not-do-deferred).

---

## Decision lock

Frozen in [`README.md` → Decision lock](./README.md#decision-lock-freezes-on-promotion): **ASMT-D1** tab = full editor, strip = glance · **ASMT-D2** one state, one output substrate (strip keeps `id="diagnosis"`) · **ASMT-D3** additive + optional, old prescriptions valid · **ASMT-D4** `provisional_diagnosis` derivation byte-identical (OBJ-D2 analog) · **ASMT-D4′** (A5) DDx folds into the cards — `differential_diagnosis` derived from non-excluded `differential` cards, byte-identical; excluded differentials kept but omitted from patient output · **ASMT-D5** impression note private (not on patient PDF/SMS) · **ASMT-D6** problem linkage reconciles, never auto-writes · **ASMT-D7** no coding vocabulary in v1 · **ASMT-D7′** (A6/A7) ICD-11 coding added — nullable `code`/`codeTitle` via seeded `diagnosis_catalog` autocomplete + gated AI resolver; additive + optional, output byte-identical (upholds D3/D4/D4′) · **ASMT-D8** PHI discipline, no RLS edits, idempotent migration + documented rollback.

---

## Cross-cutting acceptance gate (whole program)

The program is green only when **all** hold:

- [ ] The `assessment` tab renders the full Assessment editor; the strip stays a glance surface; there is no duplicate `id="diagnosis"` in the DOM and the ribbon 🎯 still focuses the Dx. _(asmt-01)_
- [ ] The dead `AssessmentSection dxLifted` pointer branch is gone; Plan still hides its own Dx. _(asmt-01)_
- [ ] A clinical-impression note + visit acuity can be entered, save/reload round-trips, and **neither appears on the patient PDF/SMS** (ASMT-D5). _(asmt-02)_
- [ ] Diagnoses can be added as primary/secondary rows with certainty / status / severity; a legacy single free-text Dx still loads and edits. _(asmt-03)_
- [ ] `provisional_diagnosis` TEXT is **byte-identical** to today for the same primary-Dx content; PDF / SMS / snapshot / notification output unchanged. _(asmt-03)_
- [ ] A visit Dx can be linked to an existing chronic condition, or promoted to a new one, only via an explicit action; saving a prescription never auto-writes a condition. _(asmt-04)_
- [ ] No PHI in logs; new columns reuse existing `prescriptions` RLS with **no policy edits**; each migration idempotent with a documented rollback. _(asmt-02, asmt-03)_
- [ ] `cd frontend && npx tsc --noEmit && npm run lint && npm test` and (where BE touched) `cd backend && npm run type-check && npm test` clean for the slice (pre-existing unrelated failures routed, not introduced). _(all)_

---

## Tasks

| Task | Title | Size | Model |
|---|---|---|---|
| `asmt-01` | Repurpose the tab: full editor in the `assessment` tab, strip stays glance, remove dead pointer, fix duplicate Dx id | M | Sonnet |
| `asmt-02` | Impression note + visit acuity (`assessment_note` + `assessment_acuity`) + tolerant Zod + form wiring (private) | M–L | **Opus** (migration + PHI column) |
| `asmt-03` | Structured diagnoses (`diagnoses_json`: primary/secondary + certainty + status + severity) + Zod + `provisional_diagnosis` derivation parity | L | **Opus** (migration + PHI column) |
| `asmt-04` | Problem-list linkage (reconcile visit Dx ↔ chronic condition, promote new Dx) reusing chart API | M–L | **Opus** (cross-layer + chronic-condition PHI) |
| `asmt-05` | Fold DDx into the cards (`differential` role + `excluded` state + type-to-card entry) + `differential_diagnosis` derivation parity; retire `DdxChipList` | L | **Opus** (patient-facing derivation change + 5+ file refactor; reverses ASMT-D4; no migration) |
| `asmt-06` | ICD-11 catalog coding: `diagnosis_catalog` table + **full WHO ICD-11 MMS import (~18k codes)** + server-side search fn, `GET /diagnoses/search`, `DiagnosisAutocomplete`, nullable `code`/`codeTitle` (additive; output byte-identical) | L | **Opus** (new migrations + multi-file cross-layer; reverses ASMT-D7; PHI-adjacent) |
| `asmt-07` | Gated AI ICD resolver: `POST /diagnoses/parse`, catalog-constrained, suggestion-only proposal UI | M–L | **Opus** (new AI endpoint + PHI-adjacent) |

---

## Cost estimate

| Wave | Tasks | Auto/Sonnet | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | asmt-01 (repurpose tab) | 1 | 0 | ~3–4h |
| Wave 2 | asmt-02 (impression + acuity) | 0 | 1 | ~4–6h |
| Wave 3 | asmt-03 (structured diagnoses) | 0 | 1 | ~5–7h |
| Wave 4 | asmt-04 (problem-list linkage) | 0 | 1 | ~4–6h |
| Wave 5 | asmt-05 (DDx fold + card entry) | 0 | 1 | ~5–7h |
| Wave 6 | asmt-06 (ICD-11 catalog coding) | 0 | 1 | ~5–7h |
| Wave 7 | asmt-07 (gated AI ICD resolver) | 0 | 1 | ~4–6h |
| **Total** | **7** | **1** | **6** | **~30–43h agent-time** |

**Caps check:** ≤1 Opus per wave ✓. **Program Opus count = 6** (asmt-02 migration/PHI, asmt-03 migration/PHI, asmt-04 cross-layer/PHI, asmt-05 patient-facing derivation + 5+ file refactor, asmt-06 migration + cross-layer, asmt-07 AI endpoint) — all agent-contract escalations, flagged in-task. If A2 + A3 run back-to-back, their two migrations MAY be combined into one file at implementation time (still Opus, still one STOP/flag) — noted in each task. A5 adds **no** migration; A6 adds a **new reference table** (`diagnosis_catalog`), not a `prescriptions` column; A7 adds **no** migration.

---

## Sequencing notes

- **asmt-01 first (pure cleanup, no migration).** It removes the visible redundancy and fixes the duplicate-Dx-id / dead-pointer mess independently of any schema work, so it ships the win immediately. Low blast radius → Sonnet. Do it before anything structural.
- **asmt-02 next (simplest substrate).** The impression note is the biggest missing clinical value and is a flat column pair; landing it early gives the tab real content before the diagnosis model is reworked. Migration + PHI ⇒ **Opus + STOP/flag**.
- **asmt-03 (the diagnosis model).** Upgrading the single free-text Dx to structured rows is the largest change and the one that must prove `provisional_diagnosis` derivation byte-identical. Depends on asmt-01's editor being in the tab. Migration + PHI ⇒ **Opus + STOP/flag**.
- **asmt-04 next.** Problem-list linkage needs the structured Dx row (asmt-03) as the natural place to hold the link, and crosses the visit + chart layers (writes chronic-condition PHI). ⇒ **Opus + STOP/flag**. Reconciliation is always explicit (ASMT-D6).
- **asmt-05 last (of the original 5).** Folding the DDx chip list into the cards (`differential` role + `excluded` state + type-to-card entry) depends on the structured card model (asmt-03) and leaves the problem-link block (asmt-04) on primary/secondary cards only. It changes how the patient-facing `differential_diagnosis` is derived and is a 5+ file refactor that reverses ASMT-D4 ⇒ **Opus + STOP/flag**. **No migration** — migration 161's JSONB column has no `kind`/`certainty` CHECK, so the enum additions are app-layer.
- **asmt-06 (ICD-11 catalog coding).** Adds nullable `code`/`codeTitle` to the diagnosis row, backed by a seeded `diagnosis_catalog` reference table + `GET /diagnoses/search` + a `DiagnosisAutocomplete` that mirrors `ComplaintAutocomplete`. Depends on the structured card model (asmt-03/05) as the place to hang the code. Coding is **additive + optional** (ASMT-D3) and **never** alters derived `provisional_diagnosis` / `differential_diagnosis` TEXT (ASMT-D4/D4′). Reverses ASMT-D7 (per ASMT-D7′). Adds a **new reference table** (non-PHI, globally readable) — not a `prescriptions` column — and touches API + DB + service layers ⇒ **Opus + STOP/flag**. **Vocabulary = ICD-11** (user-approved). **Seed = full WHO ICD-11 MMS import (~18k codes, chapters 01–26; extension/functioning chapters X+V excluded).** Migration 162 = table + curated vernacular-synonym seed; migration 163 = generated full import (idempotent, keyed on `lower(code)`, so 162's synonyms survive); migration 164 = the `search_diagnosis_catalog` SQL function (the fetch-all TS ranking can't scale past PostgREST's 1000-row read, so the DB narrows to a ranked candidate set and the service refines it). Generator + provenance: `backend/scripts/generate-diagnosis-catalog-seed.js`.
- **asmt-07 (gated AI ICD resolver, last).** Adds `POST /diagnoses/parse` that maps free-text Dx → catalog terms, catalog-**constrained** and **suggestion-only** (verify-before-apply, mirroring the complaint/medicine parse services). Depends on asmt-06's catalog + row shape. New AI endpoint + PHI-adjacent input ⇒ **Opus + STOP/flag**. **No migration.**

---

## References

- **Overview / decisions:** [`README.md`](./README.md).
- **Sibling programs (S/O counterparts):** `../objective-reports-section/` (Objective "O"); `docs/Work/Product plans/ehr/subjective-tab/` (Subjective "S").
- **Derive-on-save precedent:** `frontend/components/cockpit/rx/RxFormContext.tsx` (`buildRxPayload`); `frontend/lib/cockpit/test-results.ts`; migrations `154_prescriptions_test_results_json.sql`, `150_prescriptions_examination_json.sql`.
- **Problem list:** `backend/migrations/096_patient_problem_list_view.sql`, `129_patient_chronic_conditions_status.sql`; `frontend/components/ehr/sections/ProblemOrientedMedicalSection.tsx`.
- **Process:** `docs/Work/process/PHASED-PLANS-GUIDE.md` · `EXECUTION-ORDER-GUIDELINES.md` · `CODE_CHANGE_RULES.md`. **DoD:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`. **Agent contract:** `.cursor/rules/00-agent-contract.mdc`.

---

**Created:** 2026-07-09. **Status:** Draft — not committed, not implemented.
