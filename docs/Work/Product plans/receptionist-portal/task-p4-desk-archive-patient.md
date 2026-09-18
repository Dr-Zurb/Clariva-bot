# P4 follow-up — Desk archive patient (no delete)

**Status:** Implemented. Apply migration **209** on the app DB before using Archive on Check-in.
**Parent:** [`plan-00-receptionist-portal-roadmap.md`](./plan-00-receptionist-portal-roadmap.md)
**Depends on:** [`task-p4-desk-edit-patient.md`](./task-p4-desk-edit-patient.md) (Edit shipped).

Locked in chat 2026-08-23:

- **No delete.** Archive is a hide. The row stays. Restore clears the stamp.
- Receptionist can find archived people later and restore them.
- Duplicates still go through **merge**, not archive.

---

## What to ship

1. Migration **209** — `patients.archived_at` (+ `archived_by`).
2. `POST /api/v1/patients/:id/archive` and `POST /api/v1/patients/:id/restore`.
3. Check-in: **Archive** on the selected card; **Restore** when the card is archived. Search hides archived unless “Show archived” is on.

---

## Product locks

**Allow archive when** the row has no clinical payload: no prescriptions, no chart rows (allergies / conditions / medications / vitals / problems), no `completed` appointment. Open / arrived / cancelled visits are OK (wrong walk-in already stamped Arrive).

**Refuse archive (409)** when clinical data exists. Copy: `This record has clinical data. Merge it into the right patient instead of archiving.` Never auto-merge.

**Restore** always allowed for a doctor-owned archived row. No extra confirm beyond the button.

**Today / OPD:** do **not** hide today’s appointments when the patient is archived. The visit already happened; the doctor’s board stays honest. Check-in search is the hide.

**Doctor Patients v2:** out of this pass, except list/search must not show archived rows (same filter as desk). Do not add an Archive button on the doctor dashboard.

---

## Scope Guard — DO NOT TOUCH

- `updatePatient()` webhook path. `updatePatientForFrontDesk` stay demographics-only.
- Consent columns, MRN, `doctor_id`, `registered_via`, `created_by`, platform identity.
- `POST /patients/merge`. Applying **207**. Hard delete.
- RLS / `auth.uid()`. `process.env`.
- Logging of names, phones, DOBs, or raw request bodies.

---

## Migration 209

File: `backend/migrations/209_patients_archived_at.sql`

Additive, nullable, no RLS change, no backfill.

```
archived_at TIMESTAMPTZ NULL
archived_by UUID NULL   -- auth user who archived; not PHI
```

Partial index `idx_patients_doctor_archived` on `(doctor_id)` WHERE `archived_at IS NOT NULL`.

Comments: `archived_at` is not PHI (timestamp). Restore = set both columns NULL.

Rollback (document only): drop index, drop columns.

Content-sanity test next to `clinic-staff-migration.test.ts`: file exists, `ADD COLUMN IF NOT EXISTS archived_at`, `ADD COLUMN IF NOT EXISTS archived_by`, no `CREATE POLICY`, documents rollback.

Next number after **208**. Do not reuse 207 (parked merge function).

---

## Backend

### Types

Add `archived_at?: string | null` and `archived_by?: string | null` on backend `Patient` / `PatientSummary` and frontend `Patient` / `PatientSummary` / `DeskPatientCard`.

### Service — `archivePatientForFrontDesk` / `restorePatientForFrontDesk`

Same ownership as `updatePatientForFrontDesk`: `getPatientForDoctor`, then write `.eq('id', id).eq('doctor_id', doctorId)`.

Refuse `[Merged]` / `merged-` / `[Anonymized]` / `revoked-` (`ValidationError`).

**Archive**

1. If already archived → return the row (idempotent).
2. If clinical data exists → `{ kind: 'has_clinical_data' }` (controller → 409, no matches).
3. Else `archived_at = now()`, `archived_by = actorId ?? doctorId`.
4. Audit field names only: `['archived_at', 'archived_by']`.

**Restore**

1. If not archived → return the row (idempotent).
2. Set `archived_at` + `archived_by` to null.
3. Audit `['archived_at', 'archived_by']`.

Clinical-data probe (count heads, no payloads, no PHI in logs):

- `prescriptions` for `patient_id`
- chart tables used by `patient-chart-service` (allergies, conditions, medications, vitals — same names the chart routes use)
- `appointments` where `patient_id` + `status = 'completed'`

One existence check each. Stop at first hit.

### List / match filters

Default: exclude `archived_at IS NOT NULL` in:

- `buildPatientSummariesForDoctor` (alongside the existing `[Merged]` filter)
- `findPossiblePatientMatches` / `findOwnedPatientsByPhoneLast10` so Register and Edit do not collide with an archived twin unless they turn on Show archived

Query flag `includeArchived=true` on `GET /patients` (desk search only). Zod on the existing list query. When set, return archived rows too and include `archived_at` on the summary so the UI can badge them.

`GET /patients/:id` still returns an archived row (card + Restore). Do not 404.

### Routes

Literal paths before `/:id`:

```
POST /:id/archive   allowStaff + authenticateToken + resolveActingDoctor
POST /:id/restore   same
```

Empty body. Zod params = existing `validateGetPatientParams`.

409 body for clinical block:

```
code: ConflictError
message: This record has clinical data. Merge it into the right patient instead of archiving.
details: { reason: 'has_clinical_data' }
```

200 `{ patient }` otherwise.

---

## Frontend

`frontend/lib/desk/api.ts`:

- `archiveDeskPatient(token, id)`
- `restoreDeskPatient(token, id)`
- `searchDeskPatients` / `searchDeskIdentity` take optional `includeArchived`
- `patientToDeskRef` copies `archived_at`

`DeskIntakeClient.tsx`:

1. **Archive** next to Edit (ghost / secondary). Confirm: `Hide this record from search? You can find it under Show archived.` No “delete” word.
2. Success toast `{name} archived`. Clear the card (`resetSearch`). They are gone from the default list.
3. 409 clinical → inline error with that server message. Do not invent merge UI.
4. **Show archived** checkbox under Find a patient. When on, live + explicit search pass `includeArchived`. Badge archived rows (`Archived`).
5. Opening an archived card: hide Arrive / Add to today. Show **Restore** + Search another. Restore toast `{name} restored`, card stays, Arrive comes back.

Do not add Archive to Today.

---

## Tests

- Migration content-sanity (209).
- Service: archive happy path; idempotent; refuse merged; refuse when a completed appointment exists; restore clears stamp; foreign `doctor_id` → Forbidden.
- Controller: 200 archive / restore; 409 `has_clinical_data`; 401 without user.
- List filter: `buildPatientSummariesForDoctor` (or list test) drops archived unless `includeArchived`.
- Frontend: desk api helper tests if you add query-string coverage; no new giant component test required.

---

## Verification

- Apply **209** on the same DB the app uses (founder runs SQL editor / migrate).
- `/desk`: archive a seed with **no** completed visit → disappears from default search → Show archived → Restore → Arrive still works.
- A patient who is only Arrived today (not Seen) **can** archive.
- Do not log the archived name or phone.

---

## Out of this pass

- Delete / anonymize.
- Merge UI.
- Doctor Patients archive chrome.
- Hiding Today / OPD rows.
- Demographics history.
