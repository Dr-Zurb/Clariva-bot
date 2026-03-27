# SFU-02: Care episodes — DB migration & appointment linkage

## 2026-03-28 — P1 data model for follow-up pricing

---

## 📋 Task Overview

Add **`care_episodes`** (or equivalent name) to represent **patient + doctor + service_key** courses of care: **locked price snapshot** (JSON), **`followups_used`**, **`started_at`**, **`status`**, **`max_followups`** copy / policy version. Link **`appointments`** → `episode_id` (nullable FK) and store **`catalog_service_key`** (TEXT) on the appointment for completed-visit matching.

Aligns with PLAN §3.1–3.4 (episode open on **completed** index; snapshot at index completion).

**Estimated Time:** 1–2 days  
**Status:** ✅ **DONE** (schema + types + read helpers; SFU-04 wires create/lifecycle)

**Change Type:**
- [x] **New feature** (tables, columns) + **Update existing** (types, `bookAppointment` input optionally)

**Current State:**
- ✅ **`appointments`**: includes nullable **`episode_id`**, **`catalog_service_key`** (migration **036**); TypeScript `Appointment` in `database.ts` updated.
- ✅ **`care_episodes`** table with RLS, indexes, **`index_appointment_id`** (unique when set).
- ✅ **`care-episode-service.ts`**: `getCareEpisodeById`, `getActiveEpisodeForPatientDoctorService`; **`createCareEpisode`** throws until **SFU-04**.

**Scope Guard:**
- v1: episodes **created/updated only** via services in SFU-04 (not manual SQL).
- **RLS**: service-role workers + doctor dashboard; mirror patterns from `appointments` / `prescriptions`.

**Reference:** PLAN §3.2–3.4; [MIGRATIONS_AND_CHANGE.md](../../../../../../Reference/MIGRATIONS_AND_CHANGE.md)

---

## ✅ Task Breakdown

### 1. Migration
- [x] 1.1 Create `care_episodes` table (all columns + trigger + comments). `index_appointment_id` added **after** `appointments.episode_id` to resolve FK cycle.
- [x] 1.2 `appointments` ADD `episode_id`, `catalog_service_key`.
- [x] 1.3 Indexes: partial `(doctor_id, patient_id, catalog_service_key) WHERE status = 'active'`; `patient_id`; `episode_id` on appointments; partial unique on `index_appointment_id`.

### 2. RLS policies
- [x] 2.1 SELECT/INSERT/UPDATE/DELETE for `auth.uid() = doctor_id` (migration 036). Service role bypass for workers.

### 3. TypeScript
- [x] 3.1 `CareEpisodeRow`, `CareEpisodeStatus` — `backend/src/types/care-episode.ts`.
- [x] 3.2 `care-episode-service.ts` — read helpers + **`createCareEpisode`** stub (throws `InternalError` until SFU-04).

### 4. Documentation
- [x] 4.1 `DB_SCHEMA.md` — `care_episodes` section + appointments columns; **`RLS_POLICIES.md`** — `care_episodes` policies.

### 5. Verification
- [x] 5.1 Migration file reviewed; `tsc --noEmit` passes.

---

## 📁 Files (expected)

```
backend/migrations/036_care_episodes.sql
backend/src/types/care-episode.ts
backend/src/services/care-episode-service.ts
backend/src/types/database.ts  (Appointment: episode_id, catalog_service_key)
docs/Reference/DB_SCHEMA.md
docs/Reference/RLS_POLICIES.md
```

---

**Last Updated:** 2026-03-29
