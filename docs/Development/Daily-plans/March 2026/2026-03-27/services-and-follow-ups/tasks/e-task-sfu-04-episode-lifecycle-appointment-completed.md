# SFU-04: Episode lifecycle — hook on appointment `completed`

## 2026-03-28 — Open episode + snapshot on index; increment on follow-up complete

---

## 📋 Task Overview

Wire **care episode** state transitions to **appointment status updates**:

1. When an appointment transitions to **`completed`** and is the **index** for `(patient, doctor, catalog_service_key)` (no active episode): **create** episode, set **`price_snapshot_json`** from **current catalog** at completion time, set `eligibility_ends_at` from policy window, attach `episode_id` + `catalog_service_key` to appointment.
2. When **`completed`** and appointment was already a **follow-up** in an active episode: **increment** `followups_used` (idempotent — use completion event id or DB constraint).
3. **Cancel** before cutoff: **do not** increment (handled by “only completed counts”).
4. **Interim fallback (PLAN §8.2):** if product lacks reliable `completed` event, optional feature flag to open episode on **payment captured** — **not implemented**; document only until trigger is final.

**Estimated Time:** 1 day (+ buffer for edge cases)  
**Status:** ✅ **DONE**

**Change Type:**
- [x] **Update existing** — `appointment-service.ts` (`updateAppointmentStatus` / `updateAppointment`), `consultation-verification-service.ts` (`tryMarkVerified`), `care-episode-service.ts`

**Current State:**
- ✅ **`syncCareEpisodeLifecycleOnAppointmentCompleted`** — atomic claim on `appointments.care_episode_completion_processed_at` (migration **037**); create index episode + snapshot or increment follow-ups; structured log `care_episode_transition`.
- ✅ **Choke points:** `updateAppointmentStatus`, `updateAppointment` (when `status → completed`), `tryMarkVerified` after verified + completed.
- ✅ **Skip** when `patient_id` or `catalog_service_key` missing (legacy).
- ✅ **`exhausted`** when `followups_used` reaches `max_followups` after increment.
- ⏳ **Payment-captured fallback** — deferred (flag not added).

**Reference:** PLAN §3.1 episode open trigger; §3.6 idempotency.

---

## ✅ Task Breakdown

### 1. Identify single choke point
- [x] 1.1 **Three** call sites wired to one helper: doctor PATCH status, doctor PATCH partial status, Twilio `tryMarkVerified` → completed.

### 2. Implement handler
- [x] 2.1 Non-`completed` transitions: no episode work.
- [x] 2.2 Require `catalog_service_key` + `patient_id`; else skip.
- [x] 2.3 **Index:** `planCareEpisodeOnCompletedVisit` → `create_index` when no active episode / first completion.
- [x] 2.4 **Follow-up:** `episode_id` or active episode with different `index_appointment_id` → increment in DB.
- [x] 2.5 **`exhausted`** when `followups_used + 1 >= max_followups` (PLAN: N discounted visits after index).

### 3. Idempotency
- [x] 3.1 **`care_episode_completion_processed_at`** claim-then-work; on failure clear processed flag + `care_episode_transition_failed` log.

### 4. Tests
- [x] 4.1 `care-episode-lifecycle.test.ts` — planner + `buildEpisodePriceSnapshotJson`; existing appointment / verification tests updated; care-episode sync mocked where needed.

### 5. Observability
- [x] 5.1 `logger.info` / `warn` / `error` with `event: 'care_episode_transition'` / `care_episode_transition_failed`, `appointment_id`, `episode_id`, `action`.

---

## 📁 Files (expected)

```
backend/migrations/037_appointment_care_episode_completion.sql
backend/src/types/database.ts
backend/src/services/care-episode-service.ts
backend/src/services/appointment-service.ts
backend/src/services/consultation-verification-service.ts
backend/tests/unit/services/care-episode-lifecycle.test.ts
backend/tests/unit/services/consultation-verification-service.test.ts
backend/tests/unit/services/appointment-service.test.ts
docs/Reference/DB_SCHEMA.md
```

---

**Last Updated:** 2026-03-29
