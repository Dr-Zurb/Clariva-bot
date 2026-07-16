# Task rpt-04: Photos per report + imaging kind (photo and/or findings)

> **Filename:** `task-rpt-04-photos-and-imaging.md` in `objective-reports-section/Tasks/`.
> **Links:** batch plan [`../plan-objective-reports-batch.md`](../plan-objective-reports-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-objective-reports.md`](./EXECUTION-ORDER-objective-reports.md). Code paths **repo-relative**.

---

## 📋 Task Overview

Attach imagery where it belongs and add the **imaging** report kind. Reuses the shipped `prescription-attachments` bucket + signed-URL flow (`obj-22`) — **no new bucket, no new RLS**.

1. **Photos per report** — link uploaded attachments to a specific `LabReport` header (`attachmentIds[]` from rpt-02), so "CBC — Apollo" carries its own photo(s) and an ultrasound carries its scan. The section-level media strip (folded in by rpt-01) remains for loose/unlinked media.
2. **Imaging kind** — a `LabReport` with `kind: 'imaging'`: modality chips (X-ray, USG, CT, MRI, ECG, Echo), title/region, date, photo(s) **and/or** a findings/impression note. **Neither photo nor findings is required** (RPT-D7) — a doctor may write findings with no photo, or attach a photo with no note.

**Program / Batch:** objective-reports-section · Wave 4 (parallelisable after rpt-02)
**Plan:** [`../plan-objective-reports-batch.md`](../plan-objective-reports-batch.md)
**Estimated Time:** ~3–4 hours
**Status:** Not started. **Model: Sonnet** — reuses the shipped attachment flow; report-scoped linking + a new kind. No new storage/RLS.

**Change Type:**
- [ ] ✅ **Update existing** — extend the media strip to filter/link by report; add the imaging kind UI. Follow `docs/Work/process/CODE_CHANGE_RULES.md`.

**Current State:** (check existing code first!)
- ✅ **Exists:** `ObjectiveMediaStrip` + `PrescriptionMediaStrip` (upload/signed-thumb/remove) filtered by category; `objective-media.ts` (category constant, MIME/size guards, filter helpers); `prescription-attachment-service.ts` (signed URLs, `objective/` path segment, no per-row FK today); `LabReport.attachmentIds[]` + `kind`/`findings` from rpt-02.
- ⚠️ **Note:** attachments are currently category-tagged by path only (no row/report FK). Linking is done by storing `attachmentIds` on the report header (rpt-02), **not** by a new DB FK — no schema change here.

**Scope Guard:**
- Expected files touched: the media strip (accept a report-scoped filter), the Reports body (per-report photo affordance + imaging card), report-header edit UI.
- **DO NOT** add a new storage bucket, RLS policy, or attachment↔row FK column. **DO NOT** require a photo for imaging (RPT-D7). **DO NOT** build extraction here (rpt-05).

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Photos per report
- [ ] 1.1 Let a report header own attachment ids; render its photos inside the report card via the existing signed-URL thumbnails.
- [ ] 1.2 Keep the section-level (unlinked) media strip for loose uploads; a loose photo can be associated to a report.

### 2. Imaging kind
- [ ] 2.1 Add an "Add imaging" affordance creating a `kind: 'imaging'` report: modality chips + title/region + date.
- [ ] 2.2 Findings/impression note field; photo(s) optional. Save valid with findings-only OR photo-only OR both (RPT-D7).

### 3. Verification gate
- [ ] 3.1 `cd frontend && npx tsc --noEmit && npm run lint`.
- [ ] 3.2 Tests: report-scoped photo filter shows only that report's attachments; imaging saves with findings-only and with photo-only; loose media still round-trips (existing media parity green).

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/objective/ObjectiveMediaStrip.tsx (accept report-scoped filter)
UPDATE: frontend/lib/cockpit/objective-media.ts (report-scoped filter helper, if needed)
UPDATE: Reports body — per-report photo affordance + imaging report card
CREATE: imaging report card component (modality chips + findings + optional photos)
DO NOT TOUCH: prescription-attachment-service storage bucket / RLS; no attachment↔row FK column
```

**When updating existing code:** (MANDATORY)
- [ ] Reuse the shipped upload/signed-URL/remove path; no new bucket or policy.
- [ ] PHI-safe: never log file paths / signed URLs / patient context (matches the strip's existing contract).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Reuse the shipped attachment flow** — link via `attachmentIds` on the report header, not a new FK.
- **Imaging photo optional** (RPT-D7).
- **No new storage/RLS.**

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] ✅ **Data touched?** **Reuses existing** `prescription_attachments` (PHI files) via the shipped service; no new column/bucket/RLS.
- [ ] ✅ **Any PHI in logs?** **No** — never log paths/URLs/patient context.
- [ ] ✅ **External API or AI call?** **No.**
- [ ] ✅ **Retention / deletion impact?** **No new surface** — existing attachment retention/cascade applies.

---

## ✅ Acceptance & Verification Criteria

- [ ] A photo can be linked to and viewed under a specific report; loose media still works.
- [ ] Imaging report saves with findings-only, photo-only, or both.
- [ ] No new bucket/RLS; PHI discipline held; `tsc` + lint + media parity tests green.

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- Requires [`task-rpt-02-lab-report-model-and-fields.md`](./task-rpt-02-lab-report-model-and-fields.md). Photos feed [`task-rpt-05-extraction-and-verify-dialog.md`](./task-rpt-05-extraction-and-verify-dialog.md) (extraction runs on a report photo).

---

**Last Updated:** 2026-07-08
**Pattern:** reuse the shipped attachment bucket; link photos to report headers via `attachmentIds`; add an imaging kind where photo and findings are each optional.
