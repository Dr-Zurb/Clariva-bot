# Task osm-01: Migration 192 — `appointments.booking_origin`

## 11 Aug 2026 — Batch [opd-status-model](../plan-opd-status-model-batch.md) — Wave 1 — **S, ~1h**

---

## Task overview

Provenance for OPD rows is currently *inferred* via `computeAppendedAfterDayById` (created_at vs day's other slots). That heuristic falsely tags same-day evening bookings as Overflow. Store origin at creation instead.

**Estimated time:** ~1h.

**Status:** Pending.

**Hard deps:** none — next migration number after `191_patient_tags_array.sql` is **192**.

**Source:** plan OSM-D4, OSM-D8, OSM-D9.

---

## Model & execution guidance

**Recommended model:** **Opus** (new migration — hard-rules list).

**New chat?** **Yes.** Pre-load:

- This task file.
- [`../plan-opd-status-model-batch.md`](../plan-opd-status-model-batch.md) decision lock.
- `backend/migrations/191_patient_tags_array.sql` (header / rollback style).
- `docs/Reference/engineering/development/MIGRATIONS_AND_CHANGE.md`.
- Confirm latest migration number with `ls backend/migrations/ | sort | tail`.

**Estimated turns:** 1–2 (migration + content-sanity test).

---

## Acceptance criteria

### Migration file

- [ ] Create `backend/migrations/192_appointment_booking_origin.sql` with header block matching 191 (date, batch `opd-status-model` / osm-01, description, "not on hard-rules list" for RLS/PHI, documented rollback).

- [ ] Additive column:

  ```sql
  ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS booking_origin TEXT NOT NULL DEFAULT 'booked';
  ```

- [ ] CHECK constraint over exactly:

  `('booked', 'walk_in', 'overflow', 'return_after_completed', 'rebooked')`

- [ ] Comment: operational label; not PHI; set at appointment creation / mode conversion write paths (osm-04).

### Backfill (OSM-D9 — strict)

- [ ] Backfill **only** known-good signal:

  ```sql
  UPDATE appointments
  SET booking_origin = 'return_after_completed'
  WHERE opd_event_type = 'return_after_completed'
    AND booking_origin = 'booked';
  ```

- [ ] **Do not** backfill from `isAppendedAfterDay` / created_at heuristics. Persisting that result would launder a bug into the schema.

### Types + test

- [ ] Extend `AppointmentRow` (or equivalent) in `backend/src/types/database.ts` with `booking_origin?: …` (match repo practice for optional new columns).

- [ ] Content-sanity unit test under `backend/tests/unit/migrations/192-appointment-booking-origin-migration.test.ts` matching the 187–191 convention (file exists, contains ADD COLUMN / CHECK / backfill predicates, documents rollback).

### Out of scope

- Derivation rewrite (osm-02).
- Write-path stamping (osm-04).
- Frontend.
- Dropping `opd_event_type` (stays; complementary signal for now).

---

## Done when

- Migration applies clean on fresh + existing DB (or content-sanity + documented apply path).
- Default for new rows is `'booked'`.
- Return-after-completed rows backfill; heuristic Overflow rows do **not**.
- No RLS / PHI column introduced.
