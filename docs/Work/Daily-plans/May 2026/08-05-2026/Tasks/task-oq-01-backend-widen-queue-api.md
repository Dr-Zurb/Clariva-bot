# Task oq-01: Widen `DoctorQueueSessionRow` API; drop initials masking

## 08 May 2026 — Batch [OPD queue redesign](../plan-opd-queue-redesign-batch.md) — Phase 1, Lane α step 0 — **S, ~4h**

---

## Task overview

The doctor's `/v1/opd/queue-session` endpoint currently returns a deliberately-masked `patientLabel` (initials only) plus a thin set of identifiers. The original `e-task-opd-06` spec applied the "initials only" rule uniformly to "queue rows", treating doctor-scoped queue rows as equivalent to a patient-facing waiting-room display — a misapplied PHI rule on a surface where the doctor sees full PHI everywhere else (appointment detail, patient profile, cockpit, prescription, transcript).

This task **widens the row payload** to expose the same PHI the doctor is already authorized to see on adjacent surfaces, and **deletes** `patientLabelFromName`. It also documents the privacy boundary on the type so future engineers don't reapply the masking rule (per **OQ-D7**: any future receptionist / kiosk / waiting-room display must use a different endpoint with its own privacy contract).

**Estimated time:** ~4h. ~30min Opus contract review + privacy decision write-up, ~3h Sonnet impl + tests, ~30min smoke.

**Status:** Drafted.

**Hard deps:** none.

**Source:** [plan-opd-queue-redesign-batch.md § OQ-D1, OQ-D7](../plan-opd-queue-redesign-batch.md#decision-lock-locked-2026-05-08-copied-here-for-stability). Supersedes [e-task-opd-06 § 1.1](../../../Daily-plans/March%202026/2026-03-24/OPD%20modes/e-task-opd-06-frontend-doctor-dashboard-opd-controls.md).

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Extra High** for the contract design + privacy decision write-up, then **Sonnet 4.6 Medium** to type the file out.

**Why Opus once:** the privacy decision is the high-leverage part of this batch. We need a clear, durable doc on the type that documents the doctor-only contract — easy to get right with Opus, easy to get vague with Sonnet.

**New chat? Yes — split:**

1. **Opus contract review (~30min, Plan Mode):**
   - Pre-load: this task file + `backend/src/services/opd-doctor-service.ts` (full file) + `backend/src/types/database.ts` § `Appointment` + § `Patient` + § `OpdQueueEntryStatus`.
   - Ask: *"Review and lock the widened `DoctorQueueSessionRow` shape per the spec below. Confirm RLS on `appointments` and `patients` is satisfied via existing ownership-validation paths (no new RLS work needed). Draft the privacy comment block that goes on the type — must explain (a) why this surface returns full PHI, (b) that any non-doctor surface needs a different endpoint, (c) reference OQ-D1 / OQ-D7."*
   - Lock the type shape and the privacy doc-block.

2. **Sonnet impl chat (~3h):**
   - Pre-load: this task file + the locked type from step 1 + the existing `listDoctorQueueSession` function.
   - Implement, run unit tests, smoke locally.

**Composer-OK sub-steps:** none — this is a privacy-sensitive contract change.

**Estimated turns:** 1 Opus design + 3–4 Sonnet impl turns.

---

## Acceptance criteria

### Type shape (locked in Opus chat)

- [ ] `backend/src/services/opd-doctor-service.ts` § `DoctorQueueSessionRow` is rewritten to:

  ```ts
  /**
   * Doctor-only OPD queue row.
   *
   * **Privacy contract (OQ-D1, OQ-D7):**
   * This row is returned ONLY to the authenticated doctor whose `doctor_id` matches
   * the queried session, gated by `authenticateToken` middleware + ownership validation.
   * The doctor is already authorized to see full PHI on all adjacent surfaces
   * (appointment detail, patient profile, cockpit, prescription). Initials masking
   * was a misapplied PHI rule (e-task-opd-06 § 1.1) and is removed by OQ-D1.
   *
   * Any future patient-facing, receptionist, or kiosk surface that needs queue
   * data MUST consume a different endpoint with its own filtered payload.
   * DO NOT reuse this shape on non-doctor surfaces.
   */
  export interface DoctorQueueSessionRow {
    entryId: string;
    appointmentId: string;
    tokenNumber: number;
    position: number;
    queueStatus: OpdQueueEntryStatus;
    sessionDate: string;            // YYYY-MM-DD
    queueCreatedAt: string;         // ISO; for waited-time computation

    // Patient identity (PHI — doctor-scoped)
    patientName: string;            // full name from appointments.patient_name
    medicalRecordNumber: string | null; // from patients.medical_record_number; null pre-first-payment
    patientPhone: string;           // appointments.patient_phone, e.g. "+91 98765 43210"

    // Patient demographics (optional; null when patient row is absent or unset)
    age: number | null;             // patients.age (preferred) or derived from date_of_birth
    gender: string | null;          // patients.gender ("F" | "M" | "O" | …) — pass through

    // Visit details
    appointmentStatus: string;      // unchanged — pass through appointment status
    scheduledAt: string;            // ISO; replaces `appointmentDate`
    reasonForVisit: string | null;  // appointments.reason_for_visit
    serviceLabel: string | null;    // human-readable service name (catalog lookup); null if catalog miss
    catalogServiceKey: string | null;// raw key from appointments.catalog_service_key
    consultationType: string | null;// 'text' | 'voice' | 'video' | 'in_clinic' | null

    // Episode / return-flow markers
    episodeId: string | null;       // appointments.episode_id
    opdEventType: 'standard' | 'return_after_completed' | null;
  }
  ```

  **The old `patientLabel` field is removed entirely. The old `appointmentDate` field is renamed to `scheduledAt` for clarity (it's an ISO timestamp, not a date).**

- [ ] `patientLabelFromName` helper function is **deleted** from `opd-doctor-service.ts`.

### Service implementation

- [ ] `listDoctorQueueSession` updates the `appointments` `select` to include the additional columns:

  ```ts
  .select(
    'id, patient_id, patient_name, patient_phone, appointment_date, status, ' +
    'reason_for_visit, consultation_type, catalog_service_key, ' +
    'episode_id, opd_event_type'
  )
  ```

- [ ] When `patient_id` is non-null on the appointment, batch-fetch the matching patients in **one** call (build a `Set<string>` of unique IDs from `apts`, single `.in('id', ids)` query):

  ```ts
  .from('patients')
  .select('id, medical_record_number, age, date_of_birth, gender')
  ```

  And derive `age` as `patient.age ?? deriveAgeFromDob(patient.date_of_birth)` where the helper computes whole-years from the ISO `date_of_birth` (or returns `null` when DOB is also null). Gracefully handle `patient_id = null` rows — set `medicalRecordNumber`, `age`, `gender` to `null`.

- [ ] `serviceLabel` resolution: if `catalog_service_key` is non-null, look up the human-readable name. **If a catalog lookup helper already exists** (search `rg "catalog.*service.*name|catalog_service.*label" backend/src`), use it; otherwise simply pass `catalog_service_key` as the label and add a TODO referencing this task. **Do NOT add a new catalog table or migration in this task.**

- [ ] No N+1: total queries per request stays at **3** (queue entries → appointments → patients), regardless of row count.

- [ ] Existing ownership / RLS paths are unchanged — `doctor_id` filter on `opd_queue_entries` was the gate; nothing widens the data exposure beyond the doctor's own session.

### Controller / route

- [ ] **No controller changes** expected — `getOpdQueueSessionHandler` already passes `data.entries` through unchanged. Verify and skip.
- [ ] **No route changes** — `GET /api/v1/opd/queue-session?date=…` keeps the same URL, method, and auth.

### Tests

- [ ] Update existing service unit test (`backend/tests/unit/services/opd-doctor-service.test.ts` if it exists; otherwise create one) to cover:
  - Row contains all new fields.
  - `medicalRecordNumber`, `age`, `gender` are `null` when `patient_id` is `null`.
  - `age` is derived from `date_of_birth` when `patients.age` is `null`.
  - `episodeId` and `opdEventType` round-trip from the appointments row.
  - **Smoke (manual):** `curl -s -H "Authorization: Bearer $TOKEN" "$API/api/v1/opd/queue-session?date=$(date +%F)" | jq '.data.entries[0]'` → returns the widened shape.

### Type cleanup follow-on (note for oq-02)

- [ ] After this task ships, `frontend/types/opd-doctor.ts` becomes stale (still references `patientLabel`). **Do NOT touch it from this task** — `oq-02` owns the frontend type sync. Just leave a comment in the PR description: *"Frontend will type-error until oq-02 lands; that's by design."*

---

## Out of scope

- **Frontend type updates** — `oq-02`.
- **Frontend rendering** — `oq-03` and beyond.
- **Migration / schema change** — there is none. All data is already in `appointments` + `patients`.
- **A separate patient-facing endpoint** — explicitly out (OQ-D7 documents the boundary; building the alternate endpoint is a future product surface).
- **`/v1/opd/queue-session` query-shape changes** — same URL, same params, same auth. Only the response payload widens.

---

## Files expected to touch

**New:** none.

**Modified:**
- `backend/src/services/opd-doctor-service.ts` (~80 LOC delta — type rewrite + service body widen + tests)
- `backend/tests/unit/services/opd-doctor-service.test.ts` if it exists; otherwise CREATE alongside the service.

**Deleted:**
- The function `patientLabelFromName` inside `opd-doctor-service.ts` (the symbol, not the file).

**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why no migration.** `medical_record_number`, `age`, `date_of_birth`, `gender`, `reason_for_visit`, `episode_id`, `opd_event_type`, `catalog_service_key`, `consultation_type` all already exist (`migration 015` — patient `age`, `migration 018` — `medical_record_number`, `migration 031` — `episode_id`/`opd_event_type`, `migration 036` — `catalog_service_key`). This task is purely a service-layer widening.
2. **Why `scheduledAt` instead of `appointmentDate`.** The existing field name is misleading — it's an ISO timestamp, not a date. Renaming is a clean break since this batch will rewrite every consumer in `oq-02` / `oq-03`.
3. **`age` source priority.** `patients.age` (explicit, doctor-entered) wins over `date_of_birth` (inferred). When both are null, leave `age = null` and let the row render `—`.
4. **Catalog name lookup.** First check whether `backend/src/services/catalog-service.ts` (or similar) has a `getServiceLabel(key) → string | null` helper. If yes, use it. If no, the row uses the raw key as the label and the row component (`oq-03`) renders it as-is. Adding a real catalog name lookup is **out of scope** here.
5. **Privacy review.** The widened payload contains nothing the doctor can't already see on `/dashboard/appointments/:id` for the same appointment, on `/dashboard/patients/:id` for the same patient, or on the cockpit. The privacy posture is unchanged; only the masking-by-default on this one endpoint is removed.

---

## References

- **Source plan:** [plan-opd-queue-redesign-batch.md § OQ-D1, OQ-D7](../plan-opd-queue-redesign-batch.md)
- **Surface this task widens:** `backend/src/services/opd-doctor-service.ts § listDoctorQueueSession`
- **Original (now superseded) initials rule:** [e-task-opd-06 § 1.1](../../../Daily-plans/March%202026/2026-03-24/OPD%20modes/e-task-opd-06-frontend-doctor-dashboard-opd-controls.md)
- **Database types referenced:** `backend/src/types/database.ts § Appointment` (line ~102), § `Patient` (line ~284), § `OpdQueueEntryStatus` (line ~437)

---

**Owner:** TBD
**Created:** 2026-05-08
**Status:** Drafted
