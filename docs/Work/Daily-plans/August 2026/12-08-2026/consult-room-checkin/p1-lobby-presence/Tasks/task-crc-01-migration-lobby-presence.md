# Task crc-01: Migration 193 — lobby presence columns

## 12 Aug 2026 — Batch [p1-lobby-presence](../plan-p1-consult-room-checkin-lobby-presence-batch.md) — Wave 1 — **S, ~1h**

---

## Task overview

Store patient lobby presence on `appointments` so check-in works **before** a `consultation_sessions` row exists (CRC-D3).

**Estimated time:** ~1h  
**Status:** ⏳ Pending  
**Hard deps:** none — next migration after `192_appointment_booking_origin.sql` is **193**.  
**Source:** CRC-D3, CRC-D8, CRC-D13, CRC1-D1, CRC1-D4.

---

## Model & execution guidance

**Recommended model:** **Opus** (new migration — agent hard-rules list).

**New chat?** **Yes.** Pre-load:

- This task file.
- [`../../plan-consult-room-checkin-charter.md`](../../plan-consult-room-checkin-charter.md)
- [`../plan-p1-consult-room-checkin-lobby-presence-batch.md`](../plan-p1-consult-room-checkin-lobby-presence-batch.md)
- `backend/migrations/192_appointment_booking_origin.sql` (header / rollback style)
- `docs/Reference/engineering/development/MIGRATIONS_AND_CHANGE.md`
- Confirm latest migration: `ls backend/migrations/ | sort | tail`

**Estimated turns:** 1–2.

---

## Acceptance criteria

### Migration file

- [ ] Create `backend/migrations/193_appointment_lobby_presence.sql` with header matching 192 (date, batch `consult-room-checkin` / crc-01, description, RLS/PHI note, rollback).

- [ ] Additive columns on `appointments`:

  ```sql
  patient_checked_in_at        TIMESTAMPTZ NULL
  patient_lobby_last_seen_at   TIMESTAMPTZ NULL
  patient_checkin_notified_at  TIMESTAMPTZ NULL
  ```

- [ ] Comments: operational lobby presence / notification dedupe; not PHI; patient auth remains HMAC (no RLS change).

- [ ] No backfill required (all null = never checked in / never notified).

### Types + test

- [ ] Extend `AppointmentRow` (or equivalent) in `backend/src/types/database.ts`.

- [ ] Content-sanity unit test `backend/tests/unit/migrations/193-appointment-lobby-presence-migration.test.ts` (match 187–192 convention).

### Out of scope

- Heartbeat API (crc-02).
- Cron / DM (crc-03).
- Frontend.
- RLS policies.

---

## Scope Guard

- Expected files touched: ≤ 4 (`193_…sql`, `database.ts`, migration test, optionally `.env.example` only if env lands here — prefer crc-03 for env).
- Any expansion requires explicit approval.

---

## Done when

- Migration applies clean; columns nullable; no RLS/PHI; content-sanity green.
