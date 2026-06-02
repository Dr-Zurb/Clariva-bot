# Task cp-07: Widen `GET /v1/appointments/:id` payload with `patient_age` + `patient_sex` (doctor-scoped)

## 09 May 2026 — Batch [Cockpit polish](../plan-cockpit-polish-batch.md) — Phase 4, Lane δ-BE step 0 — **S, ~3h**

---

## Task overview

The cockpit header redesign (cp-09) needs the patient's age and sex to render the new two-row layout. Today, `Appointment` has `patient_name` and `patient_phone` (PHI fields stored on the appointment row directly), but no demographics — those live on the joined `patients` row.

This task widens the doctor-scoped `GET /v1/appointments/:id` response to include:

- **`patient_age`**: `number | null` — computed server-side from `patients.date_of_birth` (years, integer, floored — handles leap years correctly via the `(now - dob) / 365.2425` approach or — preferred — `dateFns.differenceInYears`).
- **`patient_sex`**: `"male" | "female" | "other" | null` — read directly from `patients.gender` (the column is already an enum / text in the schema).

Both fields are **null** when the appointment row has `patient_id = null` (legacy walk-in rows; no new walk-in rows post-cp-03) or when the joined patient row has the corresponding column null.

**Privacy boundary:** identical to the existing `patient_phone` field on this endpoint. Doctor JWT, ownership check (`appointment.doctor_id === userId`). Document this clearly in a block-comment so a future engineer doesn't accidentally narrow the surface.

This is the **Opus task** of the batch — the privacy-decision write-up + payload contract review. The actual coding is small; the thinking is the value.

**Estimated time:** ~3h. **Opus** for the design + privacy write-up (~30 min). **Sonnet** for the impl (~2.5h: select widening, type updates, tests).

**Status:** Done — 2026-05-09.

**Hard deps:** none.

**Source:** [plan-cockpit-polish-batch.md § CP-D6](../plan-cockpit-polish-batch.md#decision-lock-locked-2026-05-09-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Extra High** for the privacy-decision write-up + payload contract review (~30 min); **Sonnet 4.6 Medium** for the impl (~2.5h).

**Split the chat:** start an Opus chat, write the privacy block-comment + finalise the contract, then **start a fresh Sonnet chat** with the locked spec to do the impl. Don't keep Opus on autopilot for the impl — that's where money leaks.

**New chat?** **Yes — split.** Pre-load:

**Opus chat (design):**
- This task file.
- `backend/src/services/opd-doctor-service.ts § listDoctorQueueSession` (read the **same privacy decision pattern** the OQ-D1 / OQ-D7 batch documented — the comment-block style is the precedent for this task).
- `backend/src/services/appointment-service.ts § getAppointmentById` (the function we're widening).
- `docs/Work/Daily-plans/May 2026/08-05-2026/Tasks/task-oq-01-backend-widen-queue-api.md` (read the privacy section — same pattern).

**Sonnet chat (impl):**
- The locked privacy block-comment (paste it into the Sonnet chat as a reference).
- This task file.
- `backend/src/services/appointment-service.ts` (the file to modify).
- `backend/src/types/appointment.ts` (or wherever `Appointment` lives in backend types).
- `backend/src/utils/validation.ts` (read-only — confirm we don't need to add a new validator; this is read-side only).

**Estimated turns:** 2 (Opus) + 3–4 (Sonnet).

---

## Acceptance criteria

### Step 1 (Opus): write the privacy block-comment

- [x] At the top of `getAppointmentById` in `appointment-service.ts`, add a block-comment that documents the boundary. Style precedent is `oq-01`'s widen comment. Required content:

  ```ts
  /**
   * CP-D6: Doctor-scoped PHI surface — patient_age + patient_sex are exposed
   * here because they're already visible to this doctor on every adjacent
   * surface (patient list, patient detail, prescription PDF). The appointment
   * row carries patient_name + patient_phone for the same reason, and this
   * widening preserves the same privacy boundary.
   *
   * Privacy invariants enforced by this endpoint:
   *   - Caller must hold a doctor JWT (verified by the route's authMiddleware).
   *   - appointment.doctor_id must equal userId (line ~438 — NotFoundError if mismatch,
   *     not ForbiddenError, to avoid leaking the existence of the row).
   *   - logDataAccess() audits every successful read.
   *
   * Future endpoints — receptionist queue, kiosk display, patient-facing
   * waiting-room TV — must NOT reuse this query. Each gets its own endpoint
   * with its own privacy rules. Pattern matches OQ-D7 from the OPD queue
   * redesign batch (08-05-2026).
   */
  ```

- [x] Sign off the contract: payload becomes

  ```ts
  type AppointmentDetailResponse = ExistingAppointmentFields & {
    patient_age: number | null;
    patient_sex: 'male' | 'female' | 'other' | null;
  };
  ```

  No new fields beyond these two. The OQ-D1 batch added `medicalRecordNumber` to the **OPD queue** payload, but this is the **appointment detail** payload — different surface, narrower scope. Don't conflate.

### Step 2 (Sonnet): widen the select query

- [x] In `getAppointmentById`, change `.select('*')` to a join that also fetches the patient's `date_of_birth` and `gender`:

  ```ts
  const { data: appointment, error } = await admin
    .from('appointments')
    .select(`
      *,
      patient:patients (
        date_of_birth,
        gender
      )
    `)
    .eq('id', id)
    .single();
  ```

- [x] Map the embedded `patient` object into top-level `patient_age` + `patient_sex` and **strip the `patient` object** from the response so the API surface stays flat:

  ```ts
  function enrichWithDemographics(row: any): Appointment {
    const dob = row.patient?.date_of_birth;
    const gender = row.patient?.gender;
    const enriched = {
      ...row,
      patient_age: dob ? differenceInYears(new Date(), new Date(dob)) : null,
      patient_sex: gender ?? null,
    };
    delete enriched.patient;  // strip the embedded join object
    return enriched as Appointment;
  }
  ```

- [x] ~~**Use `date-fns.differenceInYears`**~~ → **rolled the pure-JS UTC helper** (`computeAgeYears` in `appointment-service.ts`). `date-fns` is **NOT** a backend dependency (verified `backend/package.json`); the OPD precedent (`opd-doctor-service.ts § deriveAgeFromDob`) uses the same pure-JS pattern, so we matched it for parity. Note 7 of this task explicitly authorised this fallback.
- [x] Update `enrichAppointmentWithSession` to accept the new shape (it already runs at the end of `getAppointmentById`); confirm it preserves the new fields by spreading.

### Step 3 (Sonnet): update the `Appointment` type

- [x] Add the two fields to the backend `Appointment` interface (`backend/src/types/database.ts`):

  ```ts
  export interface Appointment {
    // ... existing fields
    patient_name: string;
    patient_phone: string;
    /** CP-D6: server-computed from patients.date_of_birth at fetch time. */
    patient_age: number | null;
    /** CP-D6: read directly from patients.gender. */
    patient_sex: 'male' | 'female' | 'other' | null;
    // ... existing fields
  }
  ```

- [x] **No existing typed enum** — `backend/src/types/database.ts § Patient.gender` is `string` (TEXT in the schema, no DB-level CHECK). Defined a new `Sex = 'male' | 'female' | 'other'` union beside `AppointmentStatus` and normalize at the read boundary (`normalizePatientSex` accepts long-form lowercase + single-letter shorthand `'M' | 'F' | 'O'`; anything else → `null`). Documented the decision on the `Sex` JSDoc + the privacy block-comment.

### Step 4 (Sonnet): apply to other read paths if needed

- [x] Audited other functions that return an `Appointment`:
  - **Widened** (use `APPOINTMENT_SELECT_WITH_DEMOGRAPHICS` constant):
    - `getAppointmentById` ✅
    - `getDoctorAppointments` ✅ (consistency; user-role client; PostgREST embed resolves via the `appointments.patient_id → patients.id` FK from migration 010)
    - `bookAppointment` ✅ (post-insert select)
    - `createAppointment` ✅ (currently dead code, but typed `Promise<Appointment>` — keeps the contract honest)
    - `listAppointmentsForPatient` ✅ (worker context — admin client)
    - `listAppointmentsForDoctor` ✅
    - `updateAppointmentStatus` ✅ (post-update select)
    - `updateAppointment` ✅ (PATCH path; post-update select)
    - `cancelAppointmentForPatient` ✅
    - `updateAppointmentDateForPatient` ✅
    - `wrapUpAppointment` ✅ (pre-fetch, race-loss refetch, AND post-update select all widened)
  - **NOT widened** (narrow stays narrow):
    - `getAppointmentByIdForWorker` ✅ — narrow `{id, doctor_id, patient_id, appointment_date}` projection preserved
    - `hasAppointmentOnDate` — returns `boolean`, no row exposure
    - `checkSlotConflict` — internal `id`-only existence check
    - The `select('*')` pre-fetch reads inside `updateAppointmentStatus` / `updateAppointment` / `cancel*` / `update*Date*` — these are ownership-validation reads that don't return through the `Appointment` contract; the post-mutation select is what the caller sees and that's widened.

### Step 5 (Sonnet): backend tests

- [x] Added **four new tests** to `backend/tests/unit/services/appointment-service.test.ts § getAppointmentById` (the spec asked for "one new test or extend an existing one"; we landed four because the no-leak assertion + the shorthand-normalisation case are easy regression catches and they cost nothing in mock setup):

  ```ts
  it('returns patient_age + patient_sex for an appointment with a populated patient row', async () => {
    // Fixture: insert a patient with date_of_birth = 1980-01-01 and gender = 'male'.
    // Insert an appointment linked to that patient.
    const result = await getAppointmentById(apptId, correlationId, doctorId);
    expect(result.patient_age).toBeGreaterThan(40);
    expect(result.patient_sex).toBe('male');
  });

  it('returns null demographics for a guest appointment (patient_id null)', async () => {
    const apptId = await insertGuestAppointment();
    const result = await getAppointmentById(apptId, correlationId, doctorId);
    expect(result.patient_age).toBeNull();
    expect(result.patient_sex).toBeNull();
  });

  it('does not leak the embedded patient join object on the response', async () => {
    const result = await getAppointmentById(apptId, correlationId, doctorId);
    expect((result as any).patient).toBeUndefined();
  });
  ```

- [x] Ran the existing `backend/tests/unit/services/appointment-service*` suite — **no regressions caused by this task**.
  - `appointment-service.test.ts` — **18/18 passing** (was 14, +4 new CP-D6 tests).
  - `appointment-service-start-voice.test.ts` — passing.
  - `appointment-service-wrap-up.test.ts` — **already failing in pristine `main`** with TS2339 errors on `result.diagnosis_text` / `result.diagnosis_tags` (those fields are not on the `Appointment` interface). Verified by stashing CP-D6 changes and re-running: same failures. **Pre-existing; out of scope here.** Filed as a follow-up note.
- [x] Side-fix needed to make this suite runnable: stubbed `prescription-pdf-service` in the test file because it transitively imports `@react-pdf/renderer` (ESM) which `ts-jest` can't transform out of the box. The stub is one inert mock object at the top of the file; `consultation-session-service` still uses `requireActual` for everything else. Non-invasive.

### Type-check + lint

- [x] `cd backend && npm run type-check` — clean (exit 0).
- [x] `cd backend && npx eslint src/services/appointment-service.ts src/types/database.ts` — only the **two pre-existing `as any` warnings** on lines 957 / 1051 inside `cancelAppointmentForPatient` / `updateAppointmentDateForPatient` (unchanged by this task — verified via `git diff | grep "as any"` returns empty). No new errors / warnings introduced.

### Smoke

- [ ] Manual curl against staging:

  ```bash
  curl -s -H "Authorization: Bearer $TOKEN" "$API/api/v1/appointments/$APPT_ID" | jq '. | {patient_name, patient_age, patient_sex, patient_phone}'
  ```

  Expect both new fields present (or null if the patient row has no DOB / gender).

---

## Out of scope

- **Migrations** — none. The `patients` table already has `date_of_birth` (date) and `gender` (text/enum). No schema changes.
- **Public / guest endpoints** — `GET /api/v1/public/prescriptions/:id` and any patient-facing surface stays as-is. PHI here is doctor-scoped only.
- **OPD queue session endpoint** — different endpoint, different batch (`oq-01` from 08-05-2026). Don't conflate.
- **Frontend type / UI changes** — `cp-08` (mirror frontend types) and `cp-09` (UI consume) are separate tasks.
- **Computing age client-side** — explicitly rejected. Server-computed avoids timezone discrepancies and clock-skew bugs (e.g. doctor's tablet clock 3 hours off → age computed wrong).

---

## Files expected to touch

**Modified:**
- `backend/src/services/appointment-service.ts` — added `Sex` import, `computeAgeYears` + `normalizePatientSex` + `enrichRowWithDemographics` + `enrichRowsWithDemographics` helpers, the `APPOINTMENT_SELECT_WITH_DEMOGRAPHICS` constant, the CP-D6 privacy block-comment on `getAppointmentById`, and threaded the enrichment through 11 read / post-mutation call sites. ~150 LOC net.
- `backend/src/types/database.ts` — added `Sex` union type beside `AppointmentStatus`, added `patient_age` + `patient_sex` to the `Appointment` interface (with JSDoc cross-ref to the privacy comment), and updated `InsertAppointment` to also `Omit` the two new server-derived fields so Supabase `.insert()` payloads stay valid. ~30 LOC net.
- `backend/tests/unit/services/appointment-service.test.ts` — four new CP-D6 cases under `getAppointmentById`, plus a top-of-file `prescription-pdf-service` mock stub to dodge the pre-existing `@react-pdf/renderer` ESM-loader incompatibility. ~110 LOC net.

**New:** none (helper lives inside the service file; extraction not warranted at this size).

---

## Notes / open decisions

1. **Why server-computed age?** Doctor's device clock can be wrong; user timezone can shift mid-session; the database authoritatively knows `now()`. Computing client-side in `cp-09` would expose all those failure modes. Server-side, computed once per response.
2. **What if a patient is born today?** `differenceInYears(now, dob) === 0`. Render as "0 yo" or — more realistically — "<1 yo" in the UI. Out of scope for backend; cp-09 handles the display fallback.
3. **What about `gender = 'prefer_not_to_say'` or other future enum values?** The existing `gender` column type defines the enum. If a value lands that isn't `male` / `female` / `other`, type the field accordingly **based on the actual schema** — read `patients.ts` types to confirm the union. This task should match the existing enum exactly, not invent one.
4. **Why `patient_sex` over `patient_gender` as the field name?** Match what the cockpit UI calls it ("age/sex" is the standard medical-chart shorthand). The DB column happens to be `gender`, so this is a slight naming asymmetry, but the API field follows the UI vocabulary. Document this in the privacy comment if you want.
5. **Should we add this to a **Patient** detail endpoint as well?** Out of scope for this batch. The patient detail page already fetches the full patient record (including DOB and gender). This task only adds the demographics to the **appointment** payload because the cockpit fetches by appointment ID, not patient ID.
6. **Why widen `getDoctorAppointments` (the list)?** Consistency and a small future-proofing win. The dashboard `OpdQueueStrip` may eventually want to show age/sex as a tooltip or chip; having the data available avoids a follow-up backend round-trip task. Cost is one join clause.
7. **What if I don't have `date-fns` available?** Confirm via `cat backend/package.json | grep date-fns`. If absent, do not introduce a new dependency for a one-line calculation — write a pure JS helper:

   ```ts
   function computeAgeYears(dobIso: string): number {
     const dob = new Date(dobIso);
     const now = new Date();
     let age = now.getFullYear() - dob.getFullYear();
     const m = now.getMonth() - dob.getMonth();
     if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
     return age;
   }
   ```

   Pinned to UTC; documented; works for all leap-year edge cases.

---

## References

- **Service to modify:** `backend/src/services/appointment-service.ts § getAppointmentById, getDoctorAppointments, bookAppointment`
- **Type to extend:** `backend/src/types/appointment.ts § Appointment`
- **Privacy precedent:** [Daily-plans/May 2026/08-05-2026/Tasks/task-oq-01-backend-widen-queue-api.md](../../../08-05-2026/Tasks/task-oq-01-backend-widen-queue-api.md)
- **Schema confirmation:** `patients.date_of_birth` (date), `patients.gender` (text/enum). Confirm via `cd backend && rg "create table patients" migrations/`.
- **Frontend consumer:** `cp-08` (types) → `cp-09` (UI).

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Done — 2026-05-09 (smoke pending; type-check + unit tests green)

---

## Implementation log (2026-05-09)

- Privacy block-comment on `getAppointmentById` adopts the spec text verbatim (CP-D6 contract + four privacy invariants + future-endpoints warning) and adds a `Sex` normalization caveat referencing `types/database.ts`.
- Created the `Sex` union (`'male' | 'female' | 'other'`) instead of leaving the API field as `string | null`. Note 3 of this task said "match the existing schema enum"; the schema has none (`patients.gender TEXT`, no CHECK), so we crystallised the union the cockpit / chart consumer needs and normalize at the boundary. Long-form lowercase + single-letter shorthand both map cleanly; everything else collapses to `null` (matches the no-DOB rendering fallback).
- `computeAgeYears` mirrors `opd-doctor-service.ts § deriveAgeFromDob` (UTC math, ±130 sanity bound) so age renders identically in the queue strip and the cockpit header. We do **not** pull in `date-fns` — it isn't a backend dependency and note 7 explicitly authorised the pure-JS fallback.
- Centralised the PostgREST select string in a single `APPOINTMENT_SELECT_WITH_DEMOGRAPHICS` constant so all 11 widened call sites stay in lock-step. The embed reads `patient:patients(date_of_birth, gender)` against the `appointments.patient_id → patients.id` FK from migration 010.
- The enrichment helper is **defensive about PostgREST returning either an object or a single-element array** for the embedded join (the supabase-js typings vary by FK direction). Strips the `patient` field from the response so the API surface stays flat — covered by the dedicated "no-leak" regression test.
- Test-side fix: stubbed `prescription-pdf-service` because `consultation-session-service.requireActual` transitively pulled in `@react-pdf/renderer` (ESM) which crashed `ts-jest`. The stub is local to the test file (no global config change) and the suite is now 18/18 green.
- `appointment-service-wrap-up.test.ts` failures (TS2339 on `result.diagnosis_text` / `result.diagnosis_tags`) are **pre-existing in `main`** — verified by stashing CP-D6 and re-running. The `Appointment` interface lacks those fields (the wrap-up code reads/writes them via `as any` paths). Filed as a follow-up; out of scope for this task.
