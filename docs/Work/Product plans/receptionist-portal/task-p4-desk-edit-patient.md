# P4 follow-up — Desk edit patient (no delete)

**Status:** Implemented 2026-08-23. Edit only. No delete.
**Parent:** [`plan-00-receptionist-portal-roadmap.md`](./plan-00-receptionist-portal-roadmap.md)
**Decision:** Receptionist can **edit** demographics. They cannot **delete**. Duplicate rows go through **merge**. Junk rows (later) get archive, not delete.

Locked in chat 2026-08-23:

- No `DELETE /patients/:id`. Compliance already anonymizes (`[Merged]`, `[Anonymized]`) and never hard-deletes PHI (`updatePatient` merge comment; `COMPLIANCE.md` retention overrides deletion).
- No demographics history table in this pass (that is a new migration — separate ask).
- Do not apply migration `207` in this pass unless merge UI is also in scope. This task is **edit only**.

---

## What to ship

`PATCH /api/v1/patients/:id` + Check-in **Edit** on the selected patient card. Same fields as Register. Same 409 possible-duplicates prompt when the new mobile (or alt) hits another owned patient.

---

## Scope Guard — DO NOT TOUCH

- `updatePatient()` in `patient-service.ts` — webhook/consent path. Do not add `doctorId` to it. Add a **new** `updatePatientForFrontDesk`.
- Consent columns, `medical_record_number`, `doctor_id`, `registered_via`, `created_by`, `platform`, `platform_external_id`.
- `POST /patients/merge`, doctor Patients UI, archive/hide.
- New migration. RLS. `process.env`.
- Logging of names, phones, DOBs, or raw request bodies.

---

## Backend

### Route

In `backend/src/routes/api/v1/patients.ts`, **after** `/merge` and **before** `/:id` GET is already ordered. Add:

```
PATCH /:id  allowStaff + authenticateToken + resolveActingDoctor
```

### Controller

Copy `createPatientHandler` in `patient-controller.ts`:

1. Zod-validate params (`validateGetPatientParams`) and body (`validateUpdateFrontDeskPatientBody`).
2. `requireResolvedDoctor(req)`.
3. Service. If `possible_duplicates` → 409 + `details.matches` + `confirmRequired` (same JSON as create).
4. Else 200 `{ patient }`.

No try/catch. No DB in the controller.

### Validation

New schema next to `createFrontDeskPatientBodySchema` in `validation.ts`. Same fields and age/DOB refine as create, plus:

- `confirmNew?: boolean` — same meaning as create: “yes, keep this record, I know there are matches.”
- All identity fields required the same way as Register (name, 10-digit mobile, age or DOB, gender, guardian name + relation). Partial PATCH is **out** — the desk form always submits a full card.

### Service — `updatePatientForFrontDesk(doctorId, patientId, data, correlationId, actorId?)`

1. Ownership: reuse the same three checks as `getPatientForDoctor` (conversation **or** appointment **or** `patients.doctor_id`). Else `ForbiddenError`. 404 if the row is gone.
2. Refuse `[Merged]` / `merged-` phones and `[Anonymized]` / `revoked-` phones (`ValidationError`).
3. Derive DOB/age years exactly like `createPatientForFrontDesk`.
4. Unless `confirmNew`:
   - `findPossiblePatientMatches` + `findOwnedPatientsByPhoneLast10` on new phone and alt.
   - Drop the **current** `patientId` from the match list.
   - If any remain → `{ kind: 'possible_duplicates', matches }` (never auto-merge).
5. `admin.from('patients').update({...allowlist}).eq('id', patientId).eq('doctor_id', doctorId)` — still require `doctor_id` match on the write even if access was via appointment (prevents editing a patient owned by another doctor that this clinic only has an old apt with). If that is too tight vs `getPatientForDoctor`, **stop and ask** — do not guess.
6. Audit: `logDataModification(correlationId, actorId ?? doctorId, 'update', 'patient', patientId, changedFieldNames, onBehalf)`. Field **names** only.

Allowlist columns: `name`, `phone`, `age`, `date_of_birth`, `gender`, `guardian_name`, `guardian_relation`, `alt_phone`, `address`.

### Tests

- `backend/tests/unit/services/create-patient-front-desk.test.ts` pattern: new file `update-patient-front-desk.test.ts`.
  - Happy path updates name + guardian.
  - 409 when another owned patient shares the new phone (current id excluded).
  - `confirmNew` proceeds.
  - Foreign `doctor_id` → Forbidden.
  - Merged row refused.
- Controller/route: staff JWT can PATCH; unauthenticated 401.
- Do not log fixtures that look like real PHI in assertions beyond existing seed style (`desk.seed.*`).

---

## Frontend

`frontend/lib/desk/api.ts`: `updateDeskPatient(token, id, body)` → `PATCH /api/v1/patients/:id`. Reuse `parseDuplicateMatches`.

`DeskIntakeClient.tsx` — selected patient card (right pane / mobile full screen):

1. **Edit** next to Arrive now / Search another.
2. Click Edit → left form (or the same card) fills from the selected patient. Register button becomes **Save**. Cancel returns to the card without writing.
3. Submit → PATCH. 409 → same “Possible existing patient / Create new anyway” UI but copy for edit: **Keep this record** (do not create a second patient).
4. Success → toast `{name} updated`, refresh the card from the response, clear the form if that is current check-in behaviour after register.
5. Do not invent a delete control.

Reuse existing age/guardian/phone validation helpers. Do not expand `DeskIntakeClient` with a second form component unless the file is already unreadable — prefer one form, `mode: 'register' | 'edit'`.

---

## Verification

- Backend: typecheck + lint + the new unit tests + existing `create-patient-front-desk` and `patient-matching` still green.
- Frontend: desk unit tests + eslint on touched files.
- Browser: `/desk` — pick Kirti Sharma → Edit → change relative → Save → card and Find-a-patient row show the new relative. Change mobile to another seeded phone → 409, not a silent overwrite.

---

## Out of this pass

- Delete / archive.
- Merge UI (inbox already has “duplicates home for receptionist”).
- Applying `207_merge_patients_function.sql`.
- `patient_demographics_history`.
- Doctor Patients v2 edit.
