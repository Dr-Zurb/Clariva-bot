# Plan p3 — Clinic link: photos

## 27 Sep 2026 — Batch `clinic-link` / `p3-photos` (`clk-15..19`)

> **Status:** **Gate walked** 2026-09-27. `clk-15` through `clk-19` are in. No new migration. A live SMS is still unsent because Twilio is not configured; this phase does not send a message.
> **Product plan:** [`plan-clinic-link.md`](../../../../../Product%20plans/plan-clinic-link.md) (CLK-DL-1…12)
> **Prior phase:** [`../p2-visit-prep/`](../p2-visit-prep/)
> **Program:** [`../README.md`](../README.md) · Prefix `clk`
> **Exec order:** [`Tasks/EXECUTION-ORDER-p3-clinic-link-photos.md`](./Tasks/EXECUTION-ORDER-p3-clinic-link-photos.md)

---

## Why this phase

Phase 2 holds the words. This phase lets the same person attach old papers and a medicine strip to that visit. The doctor sees them beside the desk’s documents, labelled as from the patient, before the note starts. Skipping photos still leaves a valid appointment.

The mic check and the share sheet are Phase 4. They are not in this batch.

---

## Decision lock

CLK-DL-1…12 stay locked. Do not re-litigate them here.

This phase uses CLK-DL-11 (photos reuse `visit_documents`) and CLK-DL-12 (the same `kind: 'history-form'` token). `actor_id` for a patient file is `patients.id` (CLK-DL-10). The public page never receives the chart or the desk’s files (HL-DL-8). No face photo, Aadhaar, or insurance card (DVP-DL-8). No auto extract (DVP-Q5). Client downscale keeps the 10 MB server cap (DVP-Q4). The collection notice stays `⟨fill — counsel⟩` (HL-DL-10).

“The visit is opened,” for the patient’s delete, means `appointments.patient_checked_in_at` is set. Do not add a column for that.

---

## What already exists (inspected 2026-09-27)

- `visit_documents` and `visit_document_pages` (migration `233`). Sources `front_desk` | `patient`. Types: `lab_report`, `imaging`, `discharge_summary`, `old_prescription`, `referral_letter`, `other`. `ordered_by` is `us` | `outside`. `actor_id` is `UUID NOT NULL` with no FK. Migration `243` already says a patient source stores `patients.id`.
- Desk files use the private bucket `prescription-attachments` and the prefix `{doctor_id}/desk/{appointment_id}/`. `assertDeskPath` rejects anything else. There is no `{doctor_id}/patient/…` writer.
- `loadWritableAppointment` refuses an upload until `patient_checked_in_at` is set. A patient photo is taken before check-in, so this phase must not call that function.
- Desk page ceiling is 24. Server download ceiling is `ATTACHMENT_DOWNLOAD_MAX_BYTES` (10 MB). Allowed types on the desk path: jpeg, png, webp, pdf.
- Doctor list is `DeskVisitDocumentsStrip`. It already receives `source`. The heading is “From staff” for every row, and Extract is offered on extractable pages.
- Prep token and prep page exist (`clk-10`, `clk-13`). There is no public photo route.
- No new column is required. Latest migration in the repo at this write-up includes `244`. This phase does not add `245`.

---

## Scope Guard — DO NOT TOUCH

- Desk upload, desk path prefix, and the 24-page desk ceiling.
- `extractLabFromBytes` and any extract button on a patient file.
- Promoting a patient file into a prescription attachment.
- Chart tables, the history sidecar, and illness chips.
- A new document type, a new bucket, or a new RLS policy.
- Face, Aadhaar, and insurance capture.
- Camera and mic check, share sheet, follow-up order list (Phase 4).
- A second SMS or a new Instagram stage.
- Collection-notice wording. Leave it `⟨fill — counsel⟩`.
- Logging filenames, file bytes, tokens, names, or phones.

---

## Tasks

| ID | Title | Size | Depends on |
|----|-------|------|------------|
| [`clk-15`](./Tasks/task-clk-15-patient-photo-write.md) | Patient photo stored on the visit | L | Phase 2 gate |
| [`clk-16`](./Tasks/task-clk-16-patient-photo-read-delete.md) | Own photos only; delete before check-in | M | clk-15 |
| [`clk-17`](./Tasks/task-clk-17-prep-photo-control.md) | Camera or file on the prep page | M | clk-16 |
| [`clk-18`](./Tasks/task-clk-18-doctor-patient-group.md) | Doctor group “From the patient”, no extract | S | clk-15 |
| [`clk-19`](./Tasks/task-clk-19-phase-3-gate.md) | Phase 3 gate | M | clk-17, clk-18 |

`clk-16` and `clk-18` both wait on the write. They do not wait on each other. The prep control waits on the public read and delete.

---

## Acceptance gate

- [x] A dummy report photo is on the visit before the doctor starts the note, with `source = patient`, `ordered_by = outside`, and a `{doctor_id}/patient/{appointment_id}/` path.
- [x] The doctor sees it under “From the patient.” Extract is not offered. A desk file stays under the staff group and keeps a `…/desk/…` path.
- [x] A sixth patient file on that visit is refused. A file over 10 MB is refused. A booking token or a join token cannot upload.
- [x] The public read does not include desk files or `file_path`. The patient can remove their own file before check-in, and cannot after `patient_checked_in_at` is set.
- [x] Logs: appointment id and a count only. No filename and no bytes.
- [x] Desk upload behavior is unchanged.
- [x] Typecheck, lint, and the new suites are green.

Walked 2026-09-27 on one dummy visit, then cancelled. The prep page added a dummy image and listed it, then Remove cleared it. Five patient files stored; the sixth was 409. A body over 10 MB was 413. A booking token and a join token were 401. Public GET omitted the desk row and `file_path`. Delete was 200 before check-in, 404 for the desk id, and 409 after `patient_checked_in_at`. The desk object path still contained `/desk/`. The store log had `patient_photo_stored` and did not contain the filename, the name, the reason, or the phone. The consult route itself was not opened; the strip test rendered “From the patient” with no Extract and “From staff” with Extract.

Commands: `npx jest tests/unit/services/public-clinic-photo-service.test.ts` (3 tests). `npx vitest run` on the prep page, the downscale helper, and the strip groups (7 tests). `npx eslint` on the Phase 3 backend and frontend files, exit 0. Backend `npx tsc --noEmit` exit 2 only in pre-existing `* 2.ts` duplicates. Frontend `npx tsc --noEmit` has pre-existing errors and none in the Phase 3 files.

---

**Created:** 2026-09-27.
