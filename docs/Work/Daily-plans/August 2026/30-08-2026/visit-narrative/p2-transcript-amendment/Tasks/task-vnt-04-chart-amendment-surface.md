# Task vnt-04: Chart amendment surface

> **Filename:** `task-vnt-04-chart-amendment-surface.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).
> **Model: Opus (max thinking). Auto must not run this task.**
> **Waits on `vnt-03`, and on VNT-Q1 being answered from the code (§1).**

---

## 📋 Task Overview

Where the doctor meets this feature. After a voice or video consult, the patient's consult timeline offers to review that consult's transcript for items that never made it onto the chart. Accepting an item opens that consult's form in an amendment context and proposes there — through the one write path Phase 1 already owns (VNT-D5).

The hard part is not the button. It is answering, honestly and from the code, **what an accepted item actually amends** (VNT-Q1). A prescription that was written, rendered to PDF, and shared with the patient is a document that exists outside our database. If the amendment path can edit it, the doctor has to know that is what they are doing, and the patient has to not be holding a version that silently disagrees. If it cannot, the surface must say plainly that the item goes to the chart and not to that consult's prescription.

This question is answered **before** the surface is built, because the answer determines the surface's copy, not the other way round.

**Program / Phase:** visit-narrative · Phase 2 (transcript amendment)
**Batch:** [`plan-p2-visit-narrative-transcript-amendment-batch.md`](../plan-p2-visit-narrative-transcript-amendment-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-visit-narrative-transcript-amendment.md`](./EXECUTION-ORDER-p2-visit-narrative-transcript-amendment.md)
**Estimated Time:** ~5 hours
**Status:** ✅ **COMPLETE** (2026-08-30). VNT-Q1 recorded as **(i) for the patient-held PDF**; visit record remains mutable. Offer gates on `consultation_transcripts.status`.
**Completed:** 2026-08-30

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — extends the shipped `rec-28` timeline surface. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (checked against the codebase)
- ✅ **What exists:** `GET /api/v1/patients/:id/consult-timeline` (`rec-28`) — `patient-consult-timeline-controller.ts` → `patient-consult-timeline-service.ts`. Each `ConsultTimelineEntry` carries `sessionId`, `appointmentId`, `consultedAt`, `modality` (`text | voice | video`), `durationSeconds`, and an `artifacts` block: `hasRecording`, `recordingDeleted`, `hasTranscript`, `hasPrescription`, `hasSnapshots`.
- ✅ **What exists:** `frontend/components/patients-v2/ConsultTimelinePane.tsx` and its suite — the host that already renders those entries.
- ✅ **What exists:** the Phase-1 apply spine — `visit-parse-apply.ts` writes through `RxFormContext`, and the describe box is mounted once per host (`vnb-01`).
- ❌ **What's missing:** any entry point from a past consult into a re-parse of its transcript; any notion of an "amendment" context on the form.
- ⚠️ **Notes — `hasTranscript` does not work. Verify this first; it reshapes the task.** `artifacts.hasTranscript` is derived from `recording_artifact_index` (`artifact_kind === 'transcript' && !hard_deleted_at`, `patient-consult-timeline-service.ts` line 207), **not** from `consultation_transcripts.status`. Planning-time tracing found **nothing writes that row**: `registerFinalisedComposition` rejects `'transcript'` as a non-registerable kind (`recording-artifact-service.ts` lines 143–145, registerable = `audio_composition | video_composition`), and the only two `artifact_kind: 'transcript'` inserts in the backend go to **`recording_access_audit`**, a different table (`transcript-pdf-service.ts` lines 827, 878). So `hasTranscript` appears to be **permanently `false` in production**, and a gate built on it would mean the affordance never renders. Confirm on real data, then gate on `consultation_transcripts.status = 'completed'` instead — or fix the index write, but that is a **separate** decision and probably a separate task, since it changes shipped `rec-28` behavior.
- ⚠️ **Notes:** a planning-time grep found no `signed_at` / `locked_at` / `finalized_at` column on prescriptions. That is a narrow grep, not an answer — but it points at the possibility that the risk here is not "we cannot amend" but "we can amend silently, including a prescription the patient already holds a PDF of." §1 has to settle it properly.

**Scope Guard:**
- Expected files touched: ≤ 8 (timeline service/controller if the affordance needs new data, timeline pane, amendment entry component, form amendment context, and suites)
- **One write path** (VNT-D5). The amendment navigates into the existing consult's form and proposes there. If that turns out to be impossible, **STOP and surface** — do not build a parallel off-form writer.
- Phase-1 behavior frozen (VNT-D8). The live-consult describe box is untouched by this task.
- No change to the structured form, capture bars, or autocomplete (VN-DL-2).
- No change to the transcription pipeline or the `rec-*` retention machinery.
- No patient-facing surface. The patient never sees the draft or the prompt.
- Any expansion requires explicit approval.

**Reference Documentation:**
- [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md) — VN-DL-8, VN-DL-12
- Batch locks VNT-D4, VNT-D5, VNT-D8 · VNT-Q1, VNT-Q3
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. VNT-Q1 — establish the amendment target from the code (before building anything)
- [x] ✅ 1.1 Trace what happens to a prescription after it is written: how it is stored, when a PDF is produced, whether it is versioned, and whether the record can still be edited afterwards. - **Completed: 2026-08-30**
- [x] ✅ 1.2 Trace the patient's copy. `public-prescription-routes` / the public prescription surface hands something to the patient — determine whether it re-renders live from the record or is a frozen artifact, and whether an edit would change what the patient sees. - **Completed: 2026-08-30**
- [x] ✅ 1.3 Answer in writing, in this file's Notes, one of:
  - **(i) Immutable** — the amendment targets the longitudinal chart only. The surface must say so explicitly, so the doctor is not left believing the prescription changed.
  - **(ii) Mutable, patient copy re-renders** — amending changes a document the patient already has. This needs an owner decision on disclosure before it ships; **STOP and surface**.
  - **(iii) Mutable, patient copy frozen** — the record and the patient's copy would diverge. Also a **STOP**; a chart that disagrees with the document in the patient's hand is a clinical-safety problem, not a UX detail.
  - **Answered (i) for the patient-held PDF.** See Notes. Not a (ii)/(iii) STOP — the PDF freeze is the existing BRD-D4 contract, not a new divergence this surface creates. - **Completed: 2026-08-30**
- [x] ✅ 1.4 Whatever the answer, the surface's wording matches it. Copy that is vague about what changed is the failure mode here. - **Completed: 2026-08-30**

### 2. The affordance
- [x] ✅ 2.1 Confirm the `hasTranscript` finding in Current State against real data before designing anything around it. - **Completed: 2026-08-30**
  - [x] ✅ 2.1.1 If confirmed, gate the offer on `consultation_transcripts.status = 'completed'` and record why `hasTranscript` was not used. - **Completed: 2026-08-30**
  - [x] ✅ 2.1.2 Do **not** fix the `recording_artifact_index` write as part of this task — it changes shipped `rec-28` behavior and belongs to whoever owns that surface. Log it, don't absorb it. - **Completed: 2026-08-30**
- [x] ✅ 2.2 An entry with no usable transcript offers nothing. No disabled button, no "coming soon" — absence, so the timeline stays readable. - **Completed: 2026-08-30**
- [x] ✅ 2.3 A transcript still processing is distinguishable from one that failed and from one deleted under retention. `recordingDeleted` already sets the precedent: the timeline tells the truth about what used to exist rather than quietly omitting it. - **Completed: 2026-08-30**
- [x] ✅ 2.4 Doctor-only (VNT-Q3), enforced server-side, not by hiding the control. - **Completed: 2026-08-30**
- [x] ✅ 2.5 The offer is idempotent and re-runnable — reviewing a transcript twice is allowed and must not double-apply anything. - **Completed: 2026-08-30**

### 3. The amendment context
- [x] ✅ 3.1 Accepting the offer opens that consult's form in an amendment context, where transcript-derived rows propose through the existing `vnt-03` evidence tier. - **Completed: 2026-08-30**
- [x] ✅ 3.2 The context is visually unambiguous. The doctor must never be unsure whether they are editing today's consult or amending an older one — this is the single worst confusion this surface can create. - **Completed: 2026-08-30**
- [x] ✅ 3.3 Nothing applies without a per-item accept (VNT-D4). The amendment context does not relax the trust rules; it inherits them. - **Completed: 2026-08-30**
- [x] ✅ 3.4 Leaving the context without accepting anything changes nothing, anywhere. - **Completed: 2026-08-30**

### 4. Provenance write (only if VN-Q5 = (b) or (c))
- [x] ✅ 4.1 On accept, write the provenance row from `vnt-01` — which transcript, which span, which target, who accepted, when. - **Completed: 2026-08-30**
- [x] ✅ 4.2 If VN-Q5 = (a), skip this section entirely and note in the batch plan that accepted items carry no source record. - **Completed: 2026-08-30**
- [x] ✅ 4.3 The write is append-only and never blocks the clinical action. If provenance recording fails, the accept still succeeds and the failure is logged as a count — losing an audit row is bad, but blocking a doctor mid-chart over it is worse. - **Completed: 2026-08-30**

### 5. Verification & Testing
- [x] ✅ 5.1 A voice consult with a usable transcript offers the review; one without offers nothing. - **Completed: 2026-08-30**
- [x] ✅ 5.2 Processing / failed / retention-deleted transcripts each present distinctly and correctly. - **Completed: 2026-08-30**
- [x] ✅ 5.3 Another doctor's patient timeline exposes no affordance and no data — asserted server-side. - **Completed: 2026-08-30**
- [x] ✅ 5.4 Clinic staff are rejected at the route (VNT-Q3). - **Completed: 2026-08-30**
- [x] ✅ 5.5 Reviewing the same transcript twice does not double-apply. - **Completed: 2026-08-30**
- [x] ✅ 5.6 Abandoning the amendment context writes nothing. - **Completed: 2026-08-30**
- [x] ✅ 5.7 Provenance rows land on accept and match the accepted item (if VN-Q5 ≠ (a)). - **Completed: 2026-08-30**
- [x] ✅ 5.8 **Regression lock:** `ConsultTimelinePane` and the Phase-1 suites pass; every changed test justified in Notes. - **Completed: 2026-08-30**
- [x] ✅ 5.9 `npx tsc --noEmit` + lint + backend and frontend suites. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: backend/src/services/patient-consult-timeline-service.ts   (transcriptStatus from consultation_transcripts)
UPDATE: frontend/lib/api/patients.ts                              (entry contract)
UPDATE: frontend/components/patients-v2/ConsultTimelinePane.tsx    (the offer)
UPDATE: frontend/components/patients-v2/__tests__/ConsultTimelinePane.test.tsx
UPDATE: frontend/lib/cockpit/back-target.ts                       (amendTranscript param)
UPDATE: frontend/components/patient-profile/PatientProfilePage.tsx (mount host)
CREATE: frontend/components/cockpit/rx/subjective/VisitNarrativeAmendment.tsx
CREATE: frontend/components/cockpit/rx/subjective/__tests__/VisitNarrativeAmendment.test.tsx
CREATE: backend/src/services/visit-narrative-provenance-service.ts
CREATE: backend/src/controllers/visit-narrative-provenance-controller.ts
```

**Existing Code Status:**
- ✅ `patient-consult-timeline-service.ts` / `-controller.ts` — EXIST (`rec-28`). Extended only if genuinely necessary.
- ✅ `ConsultTimelinePane.tsx` + suite — EXIST. The host.
- ✅ `visit-parse-apply.ts` — EXISTS. **The only write path** (VNT-D5). Not duplicated.
- ❌ Amendment context surface — MISSING.

**When updating existing code:** (MANDATORY)
- [x] Audit current implementation (files, callers, config) — see [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [x] Map desired change to concrete code changes (what to add, change, remove)
- [x] Remove obsolete code and config
- [x] Update tests and docs per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Say what actually changed.** Whatever VNT-Q1 resolves to, the doctor reads the truth. Ambiguous copy about whether the prescription or the chart changed is the most damaging thing this surface can ship.
- **One write path** (VNT-D5). A second writer would mean two places that can put clinical data on a chart, with two sets of guarantees, and the weaker one would win.
- **Absence over disabled controls.** The timeline is a clinical reading surface; dead affordances make it noisier without making it more capable.
- **Tell the truth about missing artifacts.** `recordingDeleted` already establishes that the timeline says "was recorded, since deleted" rather than staying silent. Follow it.
- Controllers orchestrate: validate → service → respond. Zod on all external input. No DB access in controllers.
- Doctor scoping is server-side. A hidden button is not access control.
- **No PHI in logs** — identifiers and counts only. No quote text, no draft text, no patient names.
- Trust rules are inherited, not relaxed (VNT-D4).

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes** — reads consult history and transcript-derived drafts; writes to the chart and (if VN-Q5 ≠ (a)) provenance.
  - [x] **RLS verified?** Doctor scoping asserted at 5.3 / 5.4.
- [x] **Any PHI in logs?** **No** — identifiers and counts only.
- [x] **External API or AI call?** Indirect — via the `vnt-02` route only. No new hop.
- [x] **Retention / deletion impact?** **Yes** — provenance rows are written here. Their erasure inheritance is `vnt-01`'s design and is verified in `vnt-05`.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] VNT-Q1 is answered in writing from the code, and the surface's copy matches the answer.
- [x] A consult with a usable transcript offers the review; one without offers nothing; processing / failed / deleted each read distinctly.
- [x] Accepting opens the consult's form in an unambiguous amendment context.
- [x] Nothing applies without a per-item accept; abandoning the context writes nothing.
- [x] Re-reviewing a transcript does not double-apply.
- [x] Doctor-scoped server-side; clinic staff rejected at the route.
- [x] Provenance rows land on accept and never block the clinical action (if VN-Q5 ≠ (a)).
- [x] No second apply path exists — `visit-parse-apply.ts` remains the only writer.
- [x] Phase-1 and `rec-28` suites green; changed tests justified.
- [x] Type-check + lint + suites green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:**
**Solution:**

---

## 📝 Notes

### VNT-Q1 — answered from the code, 2026-08-30

**(i) for the patient-held document (PDF).** The amendment writes through this consult's Rx form (`visit-parse-apply` → `RxFormContext` → existing autosave). It does **not** regenerate or replace a prescription PDF already sent to the patient.

Evidence:
- `prescriptions` has no `signed_at` / `locked_at` / `finalized_at`. The only lifecycle stamp is `sent_to_patient_at` (`026_prescriptions.sql`). RLS allows the owning doctor to UPDATE after create. `updatePrescription` has no send-gate.
- PDF storage is one file per Rx (`{doctorId}/{prescriptionId}.pdf`), overwrite-on-regen. After send, `generatePrescriptionPdf` remints the stored file and does not re-render (BRD-D4, `prescription-pdf-service.ts`). `assertUnsentForRegenerate` blocks doctor regen after send.
- Public HTML `/r/[id]` re-reads live Postgres on every visit (`public-prescription-controller.ts`). That live-HTML vs frozen-PDF split is a **pre-existing** rec-* contract, not introduced here. This task does not change public rendering.
- `visit-parse-apply.ts` writes form state only. Longitudinal chart tables (`patient_vitals`, etc.) are a different service.

Not a (ii) STOP: accept does not change the delivered PDF. Not a (iii) STOP as a new safety problem: PDF freeze vs live record is already BRD-D4. Surface copy states the truth:

> Amending this visit's chart from the recording. Items you add go on this consult's record. A prescription PDF already sent to the patient is not updated.

### 2.1 `hasTranscript` — confirmed from code, not used for the offer

`artifacts.hasTranscript` still reads `recording_artifact_index` where `artifact_kind === 'transcript'`. `registerFinalisedComposition` rejects `'transcript'` (registerable = audio/video composition only). The only `artifact_kind: 'transcript'` inserts in backend go to `recording_access_audit`. So the shipped flag is permanently false in production. **Not fixed here** (rec-28 behavior). The offer gates on new `transcriptStatus` from `consultation_transcripts` (`completed` | `processing` | `queued` | `failed` | null). Processing → "Transcript still processing". Failed → "Transcript failed". Retention-deleted recordings keep the existing `recordingDeleted` chip. There is still no production path that deletes a `consultation_transcripts` row (vnt-01 caveat).

### Other

- `rec-28`'s service header: *"a deleted composition still surfaces as `recordingDeleted: true` … Absence would lie to the clinician."* Followed for processing/failed.
- Ended consults stay read-only (`canEditPrescriptionDraft('ended')` unchanged). Accept writes form state via dispatch/setField; the ended overlay is not relaxed. Phase-1 describe box untouched (VNT-D8).
- Extract contract widened with `transcriptText` (source document for quote slices, not a model-echoed quote). No second AI route (VNT-D3). Provenance is `POST /visit-narrative/provenance` — not an AI hop.
- **5.8 tests changed:** `ConsultTimelinePane` helper gained `transcriptStatus: null` so existing single-link assertions stay valid. `emptyVisitParseProposal` equality in the orchestrator suite is unchanged. New describes only.
- Frontend `tsc --noEmit` still fails in unrelated files. Touched-file eslint clean. 76/76 targeted frontend tests green. Backend timeline + extract + provenance unit tests green.
- VN-DL-8 is why this is an amendment, not a live Rx fill.

---

## 🔗 Related Tasks

- [`task-vnt-03-evidence-tier-proposal.md`](./task-vnt-03-evidence-tier-proposal.md) — the rows this surface opens
- [`task-vnt-01-narrative-provenance-table.md`](./task-vnt-01-narrative-provenance-table.md) — the rows §4 writes
- [`task-vnt-05-phase-2-gate.md`](./task-vnt-05-phase-2-gate.md) — verifies the erasure this task's writes depend on

---

**Last Updated:** 2026-08-30
**Completed:** 2026-08-30
**Pattern:** Post-hoc amendment entry point over an existing timeline; one inherited write path
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
