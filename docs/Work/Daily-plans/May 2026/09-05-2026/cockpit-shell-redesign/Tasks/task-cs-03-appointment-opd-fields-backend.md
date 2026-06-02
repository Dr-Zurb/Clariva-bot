# Task cs-03: Widen `getAppointmentById` + `getDoctorAppointments` with `opd_event_type` + `opd_token_number`

## 09 May 2026 — Batch [Cockpit shell redesign](../plan-cockpit-shell-redesign-batch.md) — Phase A, Lane β step 0 — **S, ~2h**

---

## Task overview

`<CockpitHeader>` shows `#?` instead of the real OPD token number for queue-mode appointments. The cockpit reads the appointment via `GET /v1/appointments/:id`, which returns the `appointments` row plus a few joined patient fields — but **does not** expose `opd_event_type` or `opd_token_number`. Those fields live on `opd_queue_entries`, joined to the appointment by `opd_queue_entries.appointment_id = appointments.id`.

Today the cockpit *does* know which session token to display (the OPD snapshot it fetches separately includes it), but the snapshot keys by `appointment_id`, and the cockpit currently only re-derives token info when the snapshot updates. On first paint, before the snapshot resolves, `<CockpitHeader>` falls back to `?`.

The clean fix is to expose the two OPD fields on the appointment payload itself, so the cockpit can paint correctly on first render without waiting for the snapshot. Mirrors **exactly** the pattern from [`cp-07`](../../cockpit-polish/Tasks/task-cp-07-appointment-demographics-backend.md) (which added `patient_age` + `patient_sex` to the same query).

**Estimated time:** ~2h.

**Status:** Pending.

**Hard deps:** none — `opd_queue_entries` table exists since `046_opd_queue.sql`.

**Source:** [plan-cockpit-shell-redesign-batch.md § CS-D6](../plan-cockpit-shell-redesign-batch.md#decision-lock-locked-2026-05-09-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat. Pre-load:
- This task file.
- `backend/src/services/appointment-service.ts` (the `getAppointmentById` and `getDoctorAppointments` functions).
- `backend/src/types/database.ts` (where `AppointmentRow` is defined).
- `backend/src/types/appointment.ts` (the API response shape).
- The cp-07 PR (the precedent). Diff via git or open the task file.
- `backend/migrations/046_opd_queue.sql` (read-only — confirm `opd_queue_entries` schema).

**Estimated turns:** 2–3 turns (impl + test).

---

## Acceptance criteria

### SQL widening on `getAppointmentById`

- [ ] In `backend/src/services/appointment-service.ts § getAppointmentById`, find the SELECT statement that already does `LEFT JOIN patients p ON p.id = a.patient_id` (post cp-07).

- [ ] Add a second LEFT JOIN onto `opd_queue_entries`:

  ```sql
  LEFT JOIN opd_queue_entries oqe
    ON oqe.appointment_id = a.id
   AND oqe.doctor_id = a.doctor_id
  ```

  - **Why join on both columns?** Defense in depth. `opd_queue_entries.appointment_id` is unique per row, but the `doctor_id` predicate prevents a malformed row from another doctor's session leaking into the result. Cheap; the index `(doctor_id, opd_session_date)` covers the predicate.

- [ ] Add the two columns to the SELECT list:

  ```sql
  oqe.event_type   AS opd_event_type,
  oqe.token_number AS opd_token_number
  ```

  Both nullable — non-OPD-queue appointments (text-only, video, scheduled-mode) have no `opd_queue_entries` row, so the LEFT JOIN returns NULL.

### Same widening on `getDoctorAppointments`

- [ ] In the same file, `getDoctorAppointments` (the list endpoint) gets the same two columns and the same `LEFT JOIN` predicate. The doctor's appointment list page (the one that links into the cockpit) gets the OPD token in its row data — useful for downstream UIs.

  **Verify** this function exists and is the right one (grep for `SELECT … FROM appointments` in `appointment-service.ts`). If there are multiple list endpoints (filtered, paginated, etc.), update **only** the doctor-scoped ones — patient-facing list endpoints stay narrow.

### Type mirror in `database.ts`

- [ ] In `backend/src/types/database.ts`, find the `AppointmentRow` type. Add the two fields:

  ```ts
  opd_event_type: 'group' | 'token' | null;
  opd_token_number: number | null;
  ```

  - The literal union for `event_type` matches the `opd_queue_entries.event_type` column's CHECK constraint (per `046_opd_queue.sql`). Confirm by reading the migration.

### Type mirror in `appointment.ts`

- [ ] In `backend/src/types/appointment.ts` (the API response shape — distinct from the DB row), add the two fields to the response interface:

  ```ts
  opd_event_type?: 'group' | 'token' | null;
  opd_token_number?: number | null;
  ```

  - Optional + nullable: `?` because older API consumers might not have updated yet, `| null` because the LEFT JOIN can return null. Same shape as the cp-07 `patient_age` / `patient_sex` fields.

### Tests

- [ ] **Add a unit test** in `backend/tests/unit/services/appointment-service.test.ts` (or extend the existing one) covering:
  - `getAppointmentById(id)` for an appointment with an `opd_queue_entries` row returns `opd_event_type === 'token'` (or `'group'`) and `opd_token_number === <expected>`.
  - `getAppointmentById(id)` for an appointment WITHOUT an `opd_queue_entries` row returns both fields as `null` (not `undefined`).
  - `getDoctorAppointments({ doctor_id })` returns the OPD fields per row, with NULL for non-OPD rows.
- [ ] Existing tests pass.
- [ ] `pnpm --filter backend lint` clean.

### No migration needed

- [ ] **Verify** `opd_queue_entries.appointment_id` already has an index. If not, this LEFT JOIN will scan the whole table. From `046_opd_queue.sql`:
  - `CREATE INDEX idx_opd_queue_entries_appointment_id ON opd_queue_entries (appointment_id);` should exist.
  - If it doesn't, **abort and file a migration task** before merging this. The query would degrade list-endpoint perf otherwise.

### Observability sanity

- [ ] Run the cockpit list page in dev with `EXPLAIN ANALYZE` enabled (or just inspect the query log). The new LEFT JOIN should add ~0.1ms per row at the index-only scan tier. If it adds >5ms, something's off — re-check the index.

---

## Out of scope

- **Frontend type mirror** — that's `cs-04`. This task is backend-only.
- **Other appointment endpoints** (e.g. patient-facing GET, public booking confirmation) — those should NOT expose OPD internal fields. Don't widen them.
- **`opd_queue_entries.event_type` literal expansion.** If the schema gains new event types in future, that's a separate migration; the union type just needs a corresponding type-side update.
- **Pre-fetching the OPD snapshot** — orthogonal optimization. This task makes the *appointment* payload self-sufficient.

---

## Files expected to touch

**Modified:**
- `backend/src/services/appointment-service.ts` (~10 LOC — two SQL widenings)
- `backend/src/types/database.ts` (+2 lines on `AppointmentRow`)
- `backend/src/types/appointment.ts` (+2 lines on the API response interface)
- `backend/tests/unit/services/appointment-service.test.ts` (~30 LOC — three new it-blocks)

**New:** none.
**Migrations:** none — `opd_queue_entries` already exists with the right shape and indexes.

---

## Notes / open decisions

1. **Why not denormalize `opd_token_number` onto `appointments` directly?** That would couple two domain tables (`appointments` are scheduled events; `opd_queue_entries` are session-day queue-state events). Denormalization makes inserts and rescheduling brittle. LEFT JOIN at read time is the right tradeoff.
2. **What about multiple `opd_queue_entries` rows for one appointment?** Possible if a patient is re-queued (e.g. doctor calls them, they don't show, the front desk re-queues them later in the session). The `opd_queue_entries` table doesn't enforce one-row-per-appointment uniqueness today. **For this task, accept the latest row** — add `ORDER BY oqe.created_at DESC LIMIT 1` to the LEFT JOIN if multi-row is observed. Most likely behaviour today is one row per appointment-session pair, in which case ORDER BY isn't needed.
3. **Cache invalidation.** The frontend cockpit refetches `getAppointmentById` whenever the OPD snapshot updates (existing behaviour). After cs-03, the snapshot fetch is *still* needed for the prev/next chips, but the per-appointment cockpit no longer depends on it for token display. Latency-wise, a small win — the cockpit paints token immediately on first render.
4. **Authorization.** No new authz surface. The doctor-scoped endpoints already enforce `doctor_id = ctx.user.id`; appointment-id-based access stays patient-scoped or doctor-scoped per existing rules.

---

## References

- **Precedent (must read):** [Daily-plans/May 2026/09-05-2026/cockpit-polish/Tasks/task-cp-07-appointment-demographics-backend.md](../../cockpit-polish/Tasks/task-cp-07-appointment-demographics-backend.md) — same pattern, different fields.
- **Schema source:** `backend/migrations/046_opd_queue.sql` (read-only).
- **Affected functions:**
  - `backend/src/services/appointment-service.ts § getAppointmentById`
  - `backend/src/services/appointment-service.ts § getDoctorAppointments`
- **Stitched follow-up:** [`task-cs-04-appointment-opd-fields-frontend.md`](./task-cs-04-appointment-opd-fields-frontend.md) — frontend type mirror + `<CockpitHeader>` consumer change. Same chat, same PR.

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Shipped 2026-05-09 — **post-ship correction applied 2026-05-10** (see Errata below).

---

## Errata (added 2026-05-10)

The original spec above contains **two factual mistakes** that propagated into the implementation and bricked the cockpit (every appointment read 4xx'd as "Appointment not found"). Documenting here so the same misreading doesn't cascade into a future task.

### Mistake 1 — Phantom migration

The spec repeatedly cites `backend/migrations/046_opd_queue.sql` as the schema source for `opd_queue_entries`. **That file does not exist.** The actual schema is in `backend/migrations/028_opd_modes.sql` — slot 046 is `046_patient_mrn_after_payment.sql`, completely unrelated.

The schema-source line in the *Hard deps* and *References* sections, and the bullet under *No migration needed*, all need to read `028_opd_modes.sql`.

### Mistake 2 — Non-existent column

The spec instructs the implementer to add this to the SELECT:

```sql
oqe.event_type   AS opd_event_type,
oqe.token_number AS opd_token_number
```

…and the type mirror in `database.ts`:

```ts
opd_event_type: 'group' | 'token' | null;
```

`opd_queue_entries.event_type` **does not exist**. Migration 028's table definition is:

```sql
id, doctor_id, appointment_id, session_date, token_number, position, status, created_at, updated_at
```

No `event_type`. No literal-union check constraint to mirror. The author of this spec appears to have conflated `opd_queue_entries.event_type` (imagined) with `appointments.opd_event_type` (real, migration 031, but with a totally different `'standard' | 'return_after_completed'` semantic — visit type, not queue type).

The implementation faithfully followed the spec, producing this PostgREST embed in `appointment-service.ts § APPOINTMENT_SELECT_WITH_DEMOGRAPHICS`:

```ts
`*, patient:patients(date_of_birth, gender), opd_queue_entry:opd_queue_entries(event_type, token_number)`
```

PostgREST 4xx'd on every read with column-not-found. `getAppointmentById`'s `if (error || !appointment)` branch fired and threw `NotFoundError('Appointment not found')`, breaking the cockpit, the appointment list, wrap-up, book, status update, and reschedule — every read path that routes through this constant.

The unit tests added for this task **passed all the way through ship** because they mock the supabase client's response shape directly and never round-trip through PostgREST.

### Mistake 3 — Misread cardinality

The *Notes / open decisions* section worries about "multiple `opd_queue_entries` rows for one appointment" and recommends `ORDER BY oqe.created_at DESC LIMIT 1` if multi-row is observed. Migration 028 actually enforces `CONSTRAINT opd_queue_entries_one_per_appointment UNIQUE (appointment_id)` — there can only ever be 0 or 1 row per appointment. The defensive multi-row handling in `enrichRowWithDemographics` is harmless but can be simplified.

### Resolution shipped 2026-05-10

Rather than add a migration to introduce the `event_type` column the spec invented, the fix kept the API-level contract (`opd_queue_event_type: 'token' | 'group' | null`) and **projected it from row presence**: row exists → `'token'` (since the schema only supports token-style queue entries today), row absent → `null`. This preserves the frontend's `isOpdQueueMode = opdEventType != null` and `opdEventType === 'token'` chip-render guards without any FE change.

Files touched in the fix:

- `backend/src/services/appointment-service.ts` — dropped `event_type` from the embed in `APPOINTMENT_SELECT_WITH_DEMOGRAPHICS`; updated `enrichRowWithDemographics` to project `opd_queue_event_type` from the joined-row presence; updated the `EmbeddedOpdQueueJoin` JSDoc with a forward-pointer for if/when "group" semantics ever land.
- `backend/src/types/database.ts` — refreshed the JSDoc on `opd_queue_event_type` to document that it's projected from row presence (not a real column).
- `backend/tests/unit/services/appointment-service.test.ts` — updated the two CS-03 mock fixtures to drop `event_type` from the embedded join object; added a comment explaining the prior bug so future agents don't re-introduce it.

### Lesson for future task specs

- **Verify cited migration files exist** before writing a spec around them. `ls backend/migrations/0NN_*.sql` is one shell command.
- **Verify cited columns exist** in those migrations. `rg "event_type" backend/migrations/028_opd_modes.sql` is one ripgrep.
- **Mocked unit tests are not enough** for SELECT-shape regressions. See [`docs/Work/capture/improvements`](../../../../../capture/improvements) for the follow-up to add an integration-test pass against a real Supabase test DB.
