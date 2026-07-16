# Objective Reports section — 08 Jul 2026 program

> **Why this exists.** The Objective tab currently splits investigations across three top-level sections — `test_results` ("Patient-brought reports"), `point_of_care` ("Point-of-care (in-clinic)"), and `media` ("Media & scans") — even though the first two already share one data substrate (`prescriptions.test_results_json`, discriminated only by a `source` field) and the third is a loose file strip. Doctors don't think in "where was this done"; they think "here are the reports for this visit." The current patient-brought UI is also flat (one name/value/unit row) and has no lab-field intelligence, no reference ranges, and no way to get data off a photo of a lab printout.
>
> **What this program does.** Collapse the three sections into **one "Reports" section**, retire the in-clinic/POC split as a *section* (keep the tolerant `source` field for back-compat), and build the section up properly: (1) **photo mode** — upload lab/scan photos into the existing private attachments bucket; (2) **extract mode** — a multimodal LLM reads a lab photo and prefills structured rows behind a **mandatory verify dialog**; (3) **manual mode** — a researched lab-test library (unit / method / reference range prefilled) plus panels and a custom-test escape hatch; and (4) **imaging** — photo upload and/or a findings note (photo not required).
>
> **Builds on (reuse, do not fork):** the shipped structured-row pipeline `test_results_json` + tolerant Zod (`obj-20`, migration 154); the private `prescription-attachments` bucket with signed URLs + `objective/` category tagging (`obj-22`, `prescription-attachment-service.ts`); the two shipped "AI suggests → doctor verifies" services (`complaint-parse-service.ts`, `medicine-parse-service.ts`) and their tiered OpenAI config (`config/openai.ts`); the static-catalog discipline of `exam-schema.ts` / `test-result-catalog.ts`; the section registry + modality default-layout resolver (`objective-section-order.ts`, `objective-default-layout.ts`).

---

## The one-sentence goal

> **Merge patient-brought + in-clinic + media into a single "Reports" section, model lab results as verifiable panels backed by a researched lab-test library, add photo upload + LLM extraction (verify-before-apply) and an imaging kind with photos and/or findings — shipped in phases where R1 is pure cleanup (no migration) and the schema/AI phases are Opus-gated per the agent contract.**

---

## Decision lock (freezes on promotion)

- **RPT-D1 — One section.** Investigations live in a single top-level Objective section labelled **"Reports"**. `test_results` and `point_of_care` are no longer separate sections. The `media` strip folds into Reports.
- **RPT-D2 — Retire POC as a *section*, not as data.** The `source` field (`patient_report | in_clinic_poc`) stays on the row schema (tolerant Zod, existing rows valid). It is no longer a section split and no longer drives modality auto-hide. POC quick-add chips (glucometer, dipstick, SpO₂) survive as chips inside Reports.
- **RPT-D3 — Reports group rows into panels.** A lab report is a header (`title`, `date`, `labName?`, `attachmentIds[]`, `entryMethod`) grouping structured analyte rows. Ungrouped rows render in an "Other results" bucket so old prescriptions render unchanged.
- **RPT-D4 — Lab-test library is static, versioned TS (v1).** Analytes + panels + units + reference ranges + aliases live in code (like `exam-schema.ts`), not a DB table, for v1. Per-doctor custom tests may persist later (R5).
- **RPT-D5 — Reference ranges are convenience defaults; the printed range wins.** Library ranges are lab/method-dependent and shown as *defaults only*. When extraction reads a printed range off the report, that printed range drives the flag. Auto-flag (value vs range) is always doctor-overridable. Microcopy states ranges vary by lab.
- **RPT-D6 — Extraction never auto-commits (verify-before-apply).** LLM output is a *suggestion*. Nothing enters the form until the doctor confirms in a verify dialog (photo beside editable rows; low-confidence / unmatched / sanity-flagged rows highlighted). Mirrors the complaint/medicine parse contract. Extraction failure degrades to manual entry, never blocks the visit.
- **RPT-D7 — Imaging photo is optional.** The imaging kind supports photo upload **and/or** a findings/impression note. A doctor may record findings with no photo, or a photo with no findings.
- **RPT-D8 — Parity + PHI discipline.** `test_results` TEXT stays derived from rows on save (OBJ-D2) so PDF/SMS/snapshot readers are unchanged. New PHI columns inherit existing `prescriptions` RLS (`auth.uid() = doctor_id`); no RLS edits. Never log lab values / names / patient context (extraction logs model + token counts only, like the shipped parse services). Sending patient lab images to an external model is a consciously-signed-off data-processor step (RPT-D6 task documents it).

---

## Phasing (each phase shippable alone)

| Phase | Task | Scope | Migration? | AI/PHI? | Model |
|---|---|---|---|---|---|
| **R1** | `rpt-01` | Merge sections: retire `point_of_care` UI, one "Reports" section, fold media strip in, merge chip catalogs, simplify modality seeds | No | No | Sonnet |
| **R2** | `rpt-02` | Lab report grouping + widened row schema (ref range, reportId) + `lab_reports_json` column + tolerant Zod + `test_results` derivation parity | **Yes (159)** | PHI column | **Opus** |
| **R2** | `rpt-03` | Lab-test library: analytes/panels/units/ranges/aliases (researched content) + panel scaffolding + custom row | No | No | Sonnet (+ content review) |
| **R3** | `rpt-04` | Photos linked per report + imaging kind (photo and/or findings) | No | PHI files (existing bucket) | Sonnet |
| **R4** | `rpt-05` | Extraction endpoint (vision→JSON, alias match, sanity checks) + mandatory verify dialog | No new column | **AI on PHI images** | **Opus** |
| **R5** | `rpt-06` | Per-doctor custom test library; (later) cross-visit lab trend view | Maybe | No | Sonnet |

**Agent-contract escalations (called out, not hidden):** `rpt-02` = new migration + PHI column → **Opus + STOP/flag**. `rpt-05` = external AI call on PHI images → **Opus + STOP/flag**. `rpt-01`, `rpt-04` also each touch ~5 files but are single-layer; sized per task. See each task's Global Safety Gate.

---

## What this program does NOT do (deferred)

| Item | Why / where it lands |
|---|---|
| DB-backed lab-test catalog | RPT-D4 — static TS for v1; DB only if per-doctor library outgrows it (R5+). |
| Radiology narrative extraction | RPT-D7 — imaging is photo + free findings in v1; structured imaging extraction is far lower value than lab tables. |
| Ordering / requesting tests (the plan side) | This is Objective (results in hand), not Assessment/Plan investigations. |
| Cross-visit lab trends UI | R5 stretch — reuses the existing vitals `TrendChart`; not required for the section rework. |
| Removing the `source` field from the schema | RPT-D2 — kept for back-compat; only the *section* split is removed. |

---

## Where it will be built (current code)

- **Section registry / labels / collapse defaults:** `frontend/lib/cockpit/objective-section-order.ts`, `frontend/components/cockpit/rx/sections/ObjectiveSection.tsx`.
- **Modality default layout (POC hide logic to simplify):** `frontend/lib/cockpit/objective-default-layout.ts`.
- **Row list + card + chips:** `frontend/components/cockpit/rx/objective/TestResultsList.tsx`, `TestResultRow.tsx`, `frontend/lib/cockpit/test-result-catalog.ts`, `frontend/lib/cockpit/test-results.ts`.
- **Row types + Zod:** `frontend/types/prescription.ts`, `backend/src/types/prescription.ts`, `backend/src/utils/validation.ts` (`testResultRowSchema`, `testResultsJsonSchema`).
- **Attachments (photos):** `frontend/components/cockpit/rx/objective/ObjectiveMediaStrip.tsx`, `frontend/lib/cockpit/objective-media.ts`, `backend/src/services/prescription-attachment-service.ts`.
- **AI verify precedent:** `backend/src/services/complaint-parse-service.ts`, `medicine-parse-service.ts`, `backend/src/config/openai.ts`; frontend consumers in `frontend/components/cockpit/rx/subjective/Complaint*.tsx`.
- **Migrations:** `backend/migrations/` (next number **159**; pattern = `154_prescriptions_test_results_json.sql`).

---

## Promotion note

If promoted to a formal program, register under `docs/Work/Product plans/ehr/` beside the objective-tab / subjective-tab plans and cross-link. Until then this daily-plan program is the source of truth. This is a **direct successor to objective-tab Phase 5 (`obj-20..24`, POC/results/media)** — cite that lineage when promoting.

---

**Created:** 2026-07-08. **Status:** Draft — not committed, not implemented. **Pattern:** merge to one section, model results as verifiable library-backed panels, extract-then-verify, phase the migration/AI work behind Opus gates.
