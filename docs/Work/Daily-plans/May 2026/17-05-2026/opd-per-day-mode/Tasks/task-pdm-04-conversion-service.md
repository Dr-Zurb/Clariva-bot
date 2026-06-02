# Task pdm-04: `convertSessionDayMode` orchestrator + slot↔queue algorithms + advisory lock

## 17 May 2026 — Batch [OPD Per-Day Mode](../plan-opd-per-day-mode-batch.md) — Wave 2, Lane α step 0 — **M–L, ~6h**

---

## Task overview

The conversion engine. Ships:

1. **`backend/src/services/opd/opd-mode-conversion-service.ts` (new file, ~350 LOC).** Orchestrator `convertSessionDayMode(doctorId, date, toMode, opts)` + two pure helpers `applySlotToQueue(...)` / `applyQueueToSlot(...)` exposed for unit tests. Single transaction; advisory lock via `pg_advisory_xact_lock` keyed on a deterministic hash of `(doctor_id, session_date)`.
2. **Slot → queue algorithm (lossless).** Sort non-terminal appointments by `appointment_date ASC, created_at ASC`, mint `opd_queue_entries` with `token_number = 1..N` in that order. Keep `appointment_date` on the appointment row (don't collapse to session start) so a reverse-flip stays lossless. Clear slot-only state (`opd_session_delay_minutes`, `opd_early_invite_expires_at`, `opd_early_invite_response`).
3. **Queue → slot algorithm (may overflow).** Sort by `token_number ASC`, compute the day's slot grid from `slot_interval_minutes` + working hours, assign first `min(N, slot_capacity)` rows to grid positions in token order. Surplus rows get `opd_event_type = 'return_after_completed'` + `appointment_date = session_end + (overflow_index + 1) * slot_interval`. Delete the corresponding `opd_queue_entries` rows.
4. **Fact + audit writes.** Upsert `doctor_opd_session_modes` (mode, increment `change_count`, set `changed_at = now()`). Insert `doctor_opd_session_mode_changes` row with full diagnostics + `correlation_id`.
5. **Notification batch upsert.** Write to `doctor_opd_pending_mode_notifications` (table comes from pdm-06; this task writes to it but is gated behind a feature flag if pdm-06 hasn't merged yet — see §S5 below).
6. **Two new endpoints:** `POST /api/v1/opd/session/preview-convert` (non-mutating, runs the conversion in a transaction and rolls back, returns counts) + `POST /api/v1/opd/session/convert` (mutating, calls the orchestrator). Both gated by doctor-only auth + `(doctor_id, session_date)` ownership.
7. **5 fixture days per direction** (10 total) for unit tests of the pure helpers; integration tests for the orchestrator with the advisory lock and audit-row contract.

**Estimated time:** ~6h (1h algorithm design lock-in with Opus reasoning, 2h orchestrator + helpers, 1h fixtures + tests, 1h endpoints + controllers, 30min advisory-lock test, 30min verification).

**Status:** Done.

**Hard deps:** pdm-01 (fact + audit tables exist), pdm-02 (resolver + unified endpoint + payload types). pdm-06 is **not** a hard dep — this task writes to the notifications table only if it exists (feature flag).

**Source:** [plan-opd-per-day-mode-batch.md § Wave 2](../plan-opd-per-day-mode-batch.md#wave-2--conversion-service--preview-ux-2-tasks-10h-single-sequential-lane) + `S1.3` and `DL-3` + `DL-4` + `DL-13` + `PD-Q5` in [Product plans/plan-opd-per-day-mode.md](../../../Product%20plans/plan-opd-per-day-mode.md).

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Extra High** (manually picked). Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md` § "When to escalate to Opus"](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md#when-to-escalate-to-opus-the-hard-rules):

> 5. You're at the close-gate of a sub-batch reviewing the full diff.

…and the related § "Tier 1 — Opus 4.7 Extra High" criteria:

> **Cross-cutting refactors** — anything that touches 5+ files or rewrites a service surface.
> **Security-sensitive code** — anything touching … audit logging path.

This task hits both. The conversion service touches:

1. `backend/src/services/opd/opd-mode-conversion-service.ts` (new)
2. `backend/src/services/appointment-service.ts` (queue entry CRUD imports)
3. `backend/src/routes/api/v1/opd.ts` (2 new routes)
4. `backend/src/controllers/opd-doctor-controller.ts` (2 new controllers)
5. `backend/src/services/opd-doctor-service.ts` (slot-grid computation borrowed; possibly extracted into a shared helper)
6. `backend/migrations/100_opd_session_modes.sql` (post-pdm-01; this task **reads** it)
7. Fixture files for tests

Plus concurrency (`pg_advisory_xact_lock`), audit-log writes, payment-flow race interaction, and the DL-4 algorithms (which are spec'd but have subtle edge cases: overflow ordering, slot-grid computation when working hours have gaps, what to do with `pending_payment` substate rows, etc.).

**Auto would happily ship a service that compiles and runs.** The failure modes — orphan `opd_queue_entries` rows from a half-applied transaction, lost overflow patients because the slot grid was computed wrong, audit rows written with `change_count` off by one — are all silent in dev and catastrophic in prod. This is exactly the work Opus exists for.

**Per-message escalation rule:** N/A — start on Opus.

**Fallback if stuck:** if Opus debates the advisory-lock key derivation for too long, settle on:

```ts
// Two 32-bit integers from the UUID + the date. Postgres pg_advisory_xact_lock(int4, int4).
// Hash the doctor_id UUID to int32, hash the session_date to int32.
const lockKey1 = hashUuidToInt32(doctorId);
const lockKey2 = hashDateToInt32(date);
await tx.unsafe(`SELECT pg_advisory_xact_lock($1, $2)`, [lockKey1, lockKey2]);
```

…and document the hash collision risk (≤ 1 in 2^64 per lock pair — acceptable for this surface area).

**New chat?** **Yes** — fresh Opus chat. Pre-load:

- This task file.
- `backend/src/services/appointment-service.ts` — **specifically lines 380–460** where `opd_queue_entries` rows are created today. The conversion service replicates the queue-entry-write contract.
- `backend/src/services/opd-doctor-service.ts` — the queue snapshot service; the **slot-grid computation** logic (lines that compute `slot_interval_minutes`, working-hour boundaries) is the same logic queue→slot needs. Identify whether to extract into a shared helper or import directly.
- `backend/src/services/opd-slot-session-service.ts` (shipped 15-05) — slot status derivation; the conversion service needs the slot grid structure.
- `backend/src/services/opd/opd-mode-service.ts` (post-pdm-02) — `resolveSessionDayMode` (read the current fact row to determine `from_mode`).
- `backend/src/services/opd-session-service.ts` (post-pdm-02) — `loadOpdSessionPayload` (used by the preview endpoint to snapshot the post-conversion state).
- `backend/src/types/doctor-settings.ts` — `OpdMode`.
- `backend/migrations/100_opd_session_modes.sql` (post-pdm-01) — fact + audit table shapes.
- `backend/migrations/028_opd_modes.sql` — `opd_queue_entries` schema + RLS.
- `backend/migrations/030_opd_session_delay.sql` — `opd_session_delay_minutes` field (cleared by slot→queue).
- `backend/migrations/029_opd_early_invite.sql` — `opd_early_invite_*` fields (cleared by slot→queue).
- `backend/migrations/031_appointments_opd_edge_cases.sql` — `opd_event_type` enum (used by queue→slot overflow).
- Source plan §DL-3, §DL-4, §DL-13, §PD-Q5, §risk-register row 1 (mid-payment-flow race).

**Estimated turns:** 6–8 turns (1 algorithm design lock, 2 service implementation, 1 fixtures + unit tests, 1 endpoints, 1 advisory lock + concurrency test, 1 Opus close-review).

---

## Acceptance criteria

### Step 1 — `applySlotToQueue` pure helper

- [ ] **Signature:**

  ```ts
  export interface SlotAppointmentInput {
    id: string;
    appointmentDate: string;       // ISO datetime — the original slot time
    createdAt: string;             // ISO datetime — for tiebreak
    status: 'pending' | 'confirmed';
    // Slot-only state that needs clearing:
    opdSessionDelayMinutes: number | null;
    opdEarlyInviteExpiresAt: string | null;
    opdEarlyInviteResponse: string | null;
  }

  export interface QueueAssignment {
    appointmentId: string;
    tokenNumber: number;
    // Slot-only fields to clear (already represented as null in the result):
    clearFields: ('opd_session_delay_minutes' | 'opd_early_invite_expires_at' | 'opd_early_invite_response')[];
  }

  export interface SlotToQueueResult {
    assignments: QueueAssignment[];
    notificationCount: number;   // = assignments.length (one per affected patient)
  }

  export function applySlotToQueue(
    appointments: SlotAppointmentInput[],
  ): SlotToQueueResult;
  ```

- [ ] **Algorithm** (DL-4):

  ```ts
  function applySlotToQueue(appointments: SlotAppointmentInput[]): SlotToQueueResult {
    const sorted = [...appointments].sort((a, b) => {
      const dateDiff = new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime();
      if (dateDiff !== 0) return dateDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const assignments: QueueAssignment[] = sorted.map((apt, index) => ({
      appointmentId: apt.id,
      tokenNumber: index + 1,
      clearFields: [
        'opd_session_delay_minutes',
        'opd_early_invite_expires_at',
        'opd_early_invite_response',
      ],
    }));

    return {
      assignments,
      notificationCount: assignments.length,
    };
  }
  ```

- [ ] **Idempotency note** — if `appointments` is empty, returns `{ assignments: [], notificationCount: 0 }`. Caller is responsible for skipping the conversion entirely if there's nothing to do.

### Step 2 — `applyQueueToSlot` pure helper

- [ ] **Signature:**

  ```ts
  export interface QueueAppointmentInput {
    id: string;
    appointmentDate: string;       // ISO datetime — last known time
    tokenNumber: number;
    status: 'pending' | 'confirmed';
  }

  export interface SlotGrid {
    sessionStartIso: string;       // ISO datetime — first slot's start
    sessionEndIso: string;         // ISO datetime — exclusive boundary (no slot starts at or after this)
    intervalMinutes: number;
    // Array of slot start ISO datetimes inside [sessionStart, sessionEnd).
    // Pre-computed by the caller (typically from doctor-availability-service).
    slots: string[];
  }

  export interface SlotAssignment {
    appointmentId: string;
    newAppointmentDate: string;    // ISO datetime
    isOverflow: boolean;
    opdEventType: 'standard' | 'return_after_completed';
  }

  export interface QueueToSlotResult {
    assignments: SlotAssignment[];
    overflowCount: number;
    notificationCount: number;     // = assignments.length
  }

  export function applyQueueToSlot(
    appointments: QueueAppointmentInput[],
    grid: SlotGrid,
  ): QueueToSlotResult;
  ```

- [ ] **Algorithm** (DL-4):

  ```ts
  function applyQueueToSlot(appointments: QueueAppointmentInput[], grid: SlotGrid): QueueToSlotResult {
    const sorted = [...appointments].sort((a, b) => a.tokenNumber - b.tokenNumber);
    const capacity = grid.slots.length;
    const assignments: SlotAssignment[] = [];
    let overflowCount = 0;

    sorted.forEach((apt, index) => {
      if (index < capacity) {
        assignments.push({
          appointmentId: apt.id,
          newAppointmentDate: grid.slots[index],
          isOverflow: false,
          opdEventType: 'standard',
        });
      } else {
        const overflowIndex = index - capacity;
        const sessionEnd = new Date(grid.sessionEndIso).getTime();
        const overflowDate = new Date(sessionEnd + (overflowIndex + 1) * grid.intervalMinutes * 60 * 1000);
        assignments.push({
          appointmentId: apt.id,
          newAppointmentDate: overflowDate.toISOString(),
          isOverflow: true,
          opdEventType: 'return_after_completed',
        });
        overflowCount += 1;
      }
    });

    return { assignments, overflowCount, notificationCount: assignments.length };
  }
  ```

- [ ] **Slot grid input contract** — `grid.slots` is the pre-computed list of slot start ISO datetimes from the doctor-availability service. The helper does NOT compute the grid itself; that's the orchestrator's job (which can borrow from existing logic in `opd-slot-session-service.ts` or `opd-doctor-service.ts`).

- [ ] **Empty-grid case** — if `grid.slots.length === 0` (e.g., the doctor has no working hours that day), every queue appointment lands in overflow with sequential `overflow_index` starting at 0. Document this in a code comment.

### Step 3 — `convertSessionDayMode` orchestrator

- [ ] **Signature:**

  ```ts
  export interface ConvertSessionDayModeOptions {
    correlationId: string;          // Caller-provided UUID for tracing (audit row + notification batch link)
    triggeredBy: 'doctor' | 'system_policy' | 'system_overrun_fallback';
    notes?: string;
    dryRun?: boolean;               // Used by the preview endpoint
  }

  export interface ConvertSessionDayModeResult {
    fromMode: OpdMode | null;       // null on first materialisation
    toMode: OpdMode;
    affected: number;
    overflowCount: number;
    notificationCount: number;
    changeCount: number;            // post-conversion change_count (for DL-14 nudge)
    snapshotAfter: OpdSessionPayload;
  }

  export async function convertSessionDayMode(
    supabase: SupabaseAdmin,
    doctorId: string,
    date: string,                   // YYYY-MM-DD
    toMode: OpdMode,
    options: ConvertSessionDayModeOptions,
  ): Promise<ConvertSessionDayModeResult>;
  ```

- [ ] **Behaviour:**

  1. **Open a transaction.** `supabase.rpc('pg_advisory_xact_lock', { key1: hashUuid32(doctorId), key2: hashDate32(date) })` — blocks until the lock is granted. If another conversion holds the lock, this transaction waits. (Postgres advisory locks are FIFO; max wait is the other transaction's runtime, ~1–2s.)
  2. **Read current state** inside the transaction:
     - Current `doctor_opd_session_modes` row (may be null).
     - All non-terminal appointments for `(doctor_id, appointment_date::date = date AND status IN ('pending', 'confirmed'))`.
       - **Excludes** `pending_payment` substates (if your project uses a `payment_status` column, filter on that too — confirm with `backend/src/services/appointment-service.ts` what the canonical filter is for "non-terminal, non-mid-payment" rows).
     - Existing `opd_queue_entries` rows for the date (for queue→slot deletion).
     - Slot grid for the date (computed via shared helper; see §Step 6).
  3. **Idempotency check** — if `from_mode === toMode`, return `{ affected: 0, overflowCount: 0, notificationCount: 0, changeCount: fact?.change_count ?? 0, ... }` without writing anything (still inside the transaction so the lock is released cleanly).
  4. **Algorithm dispatch:**
     - If `toMode === 'queue'`: call `applySlotToQueue(appointments)` → write `opd_queue_entries` rows (delete any existing for the day first to avoid orphan rows from a partial prior queue mode) → UPDATE appointments to clear slot-only fields.
     - If `toMode === 'slot'`: call `applyQueueToSlot(appointments, grid)` → UPDATE each appointment with `appointment_date = assignment.newAppointmentDate, opd_event_type = assignment.opdEventType` → DELETE `opd_queue_entries` rows for the day.
  5. **Upsert `doctor_opd_session_modes`:**

     ```ts
     await tx
       .from('doctor_opd_session_modes')
       .upsert({
         doctor_id: doctorId,
         session_date: date,
         mode: toMode,
         source: options.triggeredBy === 'doctor' ? 'doctor' : 'policy_default',
         change_count: (currentFact?.change_count ?? 0) + (currentFact ? 1 : 0),
         changed_at: new Date().toISOString(),
       });
     ```

     **`change_count` semantics:** increments only on actual flips (`currentFact ? 1 : 0` ensures first materialisation doesn't count as a flip). First materialisation has `change_count = 0`.
  6. **Insert `doctor_opd_session_mode_changes`** (one row per flip — even idempotent skips do NOT write an audit row):

     ```ts
     await tx
       .from('doctor_opd_session_mode_changes')
       .insert({
         doctor_id: doctorId,
         session_date: date,
         from_mode: currentFact?.mode ?? null,
         to_mode: toMode,
         affected_apt_count: assignments.length,
         overflow_count: queueToSlotResult?.overflowCount ?? 0,
         notification_dispatched: false,        // pdm-06 flips this to true on actual dispatch
         triggered_by: options.triggeredBy,
         correlation_id: options.correlationId,
         notes: options.notes ?? null,
       });
     ```

  7. **Notification batch upsert (gated)** — if the `doctor_opd_pending_mode_notifications` table exists (probe via `information_schema.tables`; cache the check), upsert one row with `scheduled_for = now() + 5 minutes` and `payload_json = { fromMode, toMode, affected, overflowCount, correlationId }`. If the table doesn't exist (pdm-06 hasn't merged yet), **skip silently** and log a debug-level message. This avoids a hard dep on pdm-06 while still wiring the dispatch path.

     Alternative: use an environment flag `OPD_NOTIFICATION_BATCH_ENABLED` defaulting to `false`. pdm-06 enables it. Either approach works; pick one and document it.

  8. **If `options.dryRun`** — roll back the transaction; otherwise commit.

  9. **Snapshot after** — call `loadOpdSessionPayload(supabase, doctorId, date)` (pdm-02 export) to capture the post-conversion state for the result. This call happens **after** the transaction commits (or in a fresh transaction for the dry-run path that uses `forceMode = toMode` to simulate).

- [ ] **Error handling:**

  - **Lock acquisition timeout** (rare; default `lock_timeout` is unlimited) — bubble up as `ServiceUnavailableError` with a `Retry-After` hint.
  - **Concurrent flip on another connection** — the lock guarantees serialisation. Other waiters re-read the fact row after acquiring the lock; if they discover `from_mode === their_target_mode`, they hit the idempotency check and return cleanly.
  - **Algorithm exception** (e.g., empty appointments — should not throw, returns empty result) — caught at the orchestrator level, logged, transaction rolled back, re-thrown.

### Step 4 — `POST /opd/session/convert` endpoint

- [ ] **Route:**

  ```ts
  router.post('/session/convert', requireDoctorAuth, postConvertSession);
  ```

- [ ] **Controller:**

  ```ts
  export async function postConvertSession(req: AuthedRequest, res: Response) {
    const doctorId = req.user.id;
    const { date, toMode, notes } = req.body;

    // Validation
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Body `date` (YYYY-MM-DD) is required.' });
    }
    if (toMode !== 'slot' && toMode !== 'queue') {
      return res.status(400).json({ error: 'Body `toMode` must be "slot" or "queue".' });
    }

    // DL-15 — past dates are mode-pinned
    if (date < todayInDoctorTZ(req.user)) {
      return res.status(403).json({ error: 'Past dates cannot be reconfigured.' });
    }

    const correlationId = randomUUID();

    try {
      const result = await convertSessionDayMode(
        supabaseAdmin,
        doctorId,
        date,
        toMode,
        { correlationId, triggeredBy: 'doctor', notes },
      );
      return res.json(result);
    } catch (err) {
      if (err instanceof AdvisoryLockTimeoutError) {
        res.set('Retry-After', '2');
        return res.status(409).json({
          error: 'Doctor is reorganising this session, try again in a moment.',
        });
      }
      throw err;
    }
  }
  ```

- [ ] **DL-15 past-date guard** — server-side check in addition to the frontend's disabled state. Past dates return 403 with a stable error code (e.g., `error_code: 'PAST_DATE_PINNED'` in the JSON) so the frontend can render the DL-15 tooltip when the API rejects.

### Step 5 — `POST /opd/session/preview-convert` endpoint

- [ ] **Route:** `router.post('/session/preview-convert', requireDoctorAuth, postPreviewConvertSession);`

- [ ] **Controller:** same body schema as `/convert`. Calls `convertSessionDayMode(..., { dryRun: true })`. Returns the same `ConvertSessionDayModeResult` shape (without committing). The `snapshotAfter` field is the simulated post-conversion snapshot.

- [ ] **Response includes `telemedCount`** — count of affected appointments where the booking modality is telemed (`appointment.modality IN ('video', 'voice', 'chat')` or whatever the project's enum is). PD-Q4 advisory is driven by this field; the dialog UI (pdm-05) shows the warning when `telemedCount > 0`.

  Add to the orchestrator's result type:

  ```ts
  export interface ConvertSessionDayModeResult {
    // ... existing fields ...
    telemedCount: number;
  }
  ```

  Populate by `appointments.filter(a => isTelemedModality(a.modality)).length`.

### Step 6 — Slot-grid computation (shared helper)

- [ ] **Identify the existing slot-grid logic.** Likely lives in `backend/src/services/opd-doctor-service.ts` or `backend/src/services/doctor-availability-service.ts`. The queue snapshot computes "what slots would exist today if this day were slot mode" for display purposes; that same computation is the input to `applyQueueToSlot`.

- [ ] **Extract or reuse.** Two options:

  - **Option A (preferred):** if the slot-grid computation is already a callable function, import and reuse it in the conversion service. Document the import.
  - **Option B (fallback):** copy the computation logic inline into the conversion service. Document a follow-up TODO to extract it.

  Pick one based on what the existing code looks like (the Opus chat must verify which during implementation).

- [ ] **Working-hour gaps.** If a doctor's working hours have a gap (e.g., 9–11 AM + 3–5 PM with a 4-hour break), the grid is the **union** of slot starts inside both windows. Document with a test fixture (one of the 5 queue→slot fixtures should have a working-hour gap).

### Step 7 — Test fixtures (5 per direction)

- [ ] Create `backend/tests/unit/services/opd-mode-conversion-service.test.ts`. Fixtures cover:

  **Slot → queue (5 fixtures):**

  1. **Empty** — zero appointments. Expect `{ affected: 0, notificationCount: 0 }`. Verifies the empty short-circuit.
  2. **All-pending, sorted** — 3 appointments at 10:00 / 10:30 / 11:00, all `status: 'pending'`. Expect tokens 1 / 2 / 3 in order.
  3. **Tiebreak by `created_at`** — 2 appointments at 10:00 with different `created_at`; the earlier-created one gets token 1.
  4. **Mixed status** — 4 appointments, 2 `pending` + 1 `confirmed` + 1 `completed`. Only the 3 non-terminal ones get tokens.
  5. **With slot-only state to clear** — 1 appointment with `opd_session_delay_minutes = 10` and `opd_early_invite_response = 'accepted'`. Verify both fields are nullified in the assignment's `clearFields`.

  **Queue → slot (5 fixtures):**

  1. **Empty** — zero queue entries. Expect `{ affected: 0 }`.
  2. **Equal capacity** — 5 queue entries, 5-slot grid. Expect 5 grid-mounted, 0 overflow.
  3. **Overflow by 2** — 7 queue entries, 5-slot grid. Expect 5 grid-mounted + 2 overflow at `sessionEnd + 1*interval` and `sessionEnd + 2*interval`.
  4. **Overflow with non-contiguous grid (working-hour gap)** — 6 queue entries; grid has 2 slots morning + 2 slots afternoon (4 capacity). Expect 4 grid + 2 overflow.
  5. **All overflow** — 3 queue entries, 0-slot grid (doctor has no working hours that day). Expect 0 grid + 3 overflow starting at `sessionEnd + 1*interval`.

- [ ] Each fixture is a `.test.ts` block calling the **pure helper directly** (not the orchestrator). Pure-helper coverage is the load-bearing test; the orchestrator gets one integration test in Step 8.

- [ ] **Snapshot the assignment shapes** so future refactors that change the algorithm break the test loudly.

### Step 8 — Orchestrator integration test (advisory lock + audit row)

- [ ] **Integration test** `backend/tests/integration/services/opd-mode-conversion-service.test.ts`:

  1. **Happy path** — set up a fixture doctor + 3 slot appointments → call `convertSessionDayMode(toMode: 'queue')` → assert: 3 `opd_queue_entries` rows exist; `doctor_opd_session_modes` row has `mode='queue', change_count=0` (first materialisation); `doctor_opd_session_mode_changes` has 1 row with `from_mode=null, to_mode='queue', triggered_by='doctor'`.
  2. **Flip back** — flip the same day to `'slot'` → assert: 0 queue entries; fact row's `change_count=1`; audit table has 2 rows.
  3. **Concurrency** — `Promise.all([convertSessionDayMode(...), convertSessionDayMode(...)])` with the same `(doctorId, date, toMode)` → both succeed (idempotent on second call); audit table has 1 row (the second call hits the idempotency check inside the lock and writes no audit row).
  4. **Cross-mode concurrency** — two concurrent conversions with **different** target modes → first wins; second observes the result and either idempotents-out (if matching) or applies the second flip on top.
  5. **Dry run** — `convertSessionDayMode(..., { dryRun: true })` → assert: NO rows written to `doctor_opd_session_modes`, `doctor_opd_session_mode_changes`, or `opd_queue_entries`. The result snapshot reflects the *simulated* post-conversion state.

### Step 9 — Verification (deterministic)

- [ ] `pnpm --filter backend tsc --noEmit` clean.
- [ ] `pnpm --filter backend lint` clean.
- [ ] `pnpm --filter backend test -- opd-mode-conversion` all green (unit + integration).
- [ ] **Manual smoke** via `curl`:

  ```bash
  # Preview
  curl -X POST -H "Authorization: Bearer $DOCTOR_JWT" \
       -H "Content-Type: application/json" \
       -d '{"date":"2026-05-18","toMode":"queue"}' \
       http://localhost:3000/api/v1/opd/session/preview-convert | jq .
  # Expected: { affected, overflowCount: 0, telemedCount, notificationCount, snapshotAfter: { mode: 'queue', ... }, ... }
  # No DB changes (check doctor_opd_session_modes — no new row).

  # Convert
  curl -X POST -H "Authorization: Bearer $DOCTOR_JWT" \
       -H "Content-Type: application/json" \
       -d '{"date":"2026-05-18","toMode":"queue"}' \
       http://localhost:3000/api/v1/opd/session/convert | jq .
  # Expected: same shape; one new row in doctor_opd_session_modes; one row in doctor_opd_session_mode_changes.

  # Idempotent re-call
  curl -X POST ... '{"date":"2026-05-18","toMode":"queue"}' /convert
  # Expected: { affected: 0, ... }; no new audit row.
  ```

- [ ] **Past-date rejection:**

  ```bash
  curl -X POST ... '{"date":"2026-01-01","toMode":"slot"}' /convert
  # Expected: 403 { error: 'Past dates cannot be reconfigured.', error_code: 'PAST_DATE_PINNED' }
  ```

- [ ] **No regression** in existing OPD tests.

---

## Out of scope

- **The preview/convert dialog UX** — pdm-05. This task ships the endpoints; pdm-05 ships the UI.
- **Notification dispatch** — pdm-06. This task writes to `doctor_opd_pending_mode_notifications` if the table exists; pdm-06 ships the table + cron worker.
- **OPD-tab pill dropdown** — pdm-11. The endpoints exist but no UI calls them in this task.
- **Soft nudge after 2+ flips** — pdm-11 reads `change_count` from the snapshot payload (extended in pdm-02 + this task's `convertSessionDayMode` result).
- **`source = 'system_overrun_fallback'`** — defined in pdm-01 but unused in this task. pdm-09's 24h auto-reschedule fallback may write this in a future variant; not in scope.
- **Public booking flow integration** — pdm-07. The booking flow uses the resolver (pdm-07) to decide which mode a new booking lands in; doesn't call the conversion service.
- **`OPD_NOTIFICATION_BATCH_ENABLED` flag** — task chooses the implementation (env flag vs table-existence probe). Just one approach.

---

## Files expected to touch

**New:**

- `backend/src/services/opd/opd-mode-conversion-service.ts` (~350 LOC — orchestrator + helpers).
- `backend/tests/unit/services/opd-mode-conversion-service.test.ts` (~250 LOC — 10 fixtures).
- `backend/tests/integration/services/opd-mode-conversion-service.test.ts` (~150 LOC — 5 integration tests).

**Modified:**

- `backend/src/routes/api/v1/opd.ts` (~5 LOC delta — 2 new routes).
- `backend/src/controllers/opd-doctor-controller.ts` (~80 LOC delta — 2 new controllers + past-date guard).
- `backend/src/services/opd-doctor-service.ts` (~0–30 LOC delta — only if extracting the slot-grid computation into a shared helper).
- `backend/src/types/opd-session.ts` (~10 LOC delta — `ConvertSessionDayModeResult` type if exported).
- `backend/src/utils/errors.ts` (~5 LOC delta — `AdvisoryLockTimeoutError` if not already present).

**Tests:** the two new test files cover the conversion engine end-to-end at unit + integration levels.

---

## Notes / open decisions

1. **Why advisory lock instead of `SELECT … FOR UPDATE`?** Two reasons. (a) The conversion touches multiple tables (appointments, queue_entries, fact, audit); a row-level lock on the fact row doesn't transitively guard the appointment writes. (b) Advisory locks are cheap and span the transaction; we don't have to design our own lock-row table.
2. **Why hash the UUID to int32 instead of `pg_advisory_xact_lock(bigint)`?** Postgres advisory locks accept either `(bigint)` or `(int4, int4)`. The two-int variant lets us pack `(doctor_id_hash, session_date_hash)` semantically; the bigint variant would need a custom hash combining both, which adds collision risk for distant (doctor, date) pairs. Either works; the two-int variant is slightly clearer.
3. **What about the payment-flow race (risk register row 1)?** The conversion's `status IN ('pending', 'confirmed')` filter excludes `pending_payment` substates. New bookings landing during the conversion either (a) hit the advisory lock and wait (if the booking controller acquires the same lock — verify with the booking-controller path), or (b) land safely because they don't conflict with the rows the conversion is touching. The risk-register entry says payment webhook handlers are already idempotent under both modes; this task verifies that claim by running a fixture that simulates a webhook arriving mid-conversion.
4. **Why not write to `doctor_opd_pending_mode_notifications` unconditionally?** Because pdm-06 owns that table's migration. If pdm-04 ships and pdm-06 is delayed, an unconditional write would fail with `relation does not exist`. The feature-flag pattern decouples the dependency.
5. **Why is `change_count` incremented even on cross-flip (slot→queue→slot returning to original mode)?** Because the doctor made two flips and the audit table records both. `change_count` is the count of materialised flips, not "distinct modes seen". DL-14's nudge fires correctly because the count tracks doctor actions.
6. **`telemedCount` is computed inside the orchestrator. Could pdm-05 compute it client-side?** No — the orchestrator already has the appointments loaded; recomputing client-side would mean another round-trip just for the count. Computing once on the server is efficient.
7. **What if the doctor has no working hours configured for the date?** `applyQueueToSlot` with `grid.slots.length === 0` puts every appointment in overflow. That's defensible: the doctor hasn't said they're working, but they have bookings; treating them as overflow is "the patient still has an appointment, but at the end of an empty session" which the doctor can then explicitly cancel via the overrun tray. Document this in the conversion preview's copy.
8. **`opd_event_type` enum** — verify with `backend/migrations/031_appointments_opd_edge_cases.sql` that `'return_after_completed'` is a valid value. If the enum is named differently (e.g., `opd_event_type_enum`), use the correct identifier. Don't invent a value.
9. **Should the orchestrator emit a telemetry event itself?** Defer to pdm-11. The orchestrator returns enough data in `ConvertSessionDayModeResult` for the calling controller / UI to emit telemetry; centralising telemetry at the UI layer is the existing project convention.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:**
  - `backend/src/services/appointment-service.ts` lines 380–460 — `opd_queue_entries` creation precedent.
  - `backend/src/services/opd-doctor-service.ts` — slot-grid computation for queue→slot.
  - `backend/src/services/opd-slot-session-service.ts` — slot status derivation.
  - `backend/src/services/opd/opd-mode-service.ts` (post-pdm-02) — `resolveSessionDayMode` for reading current fact.
  - `backend/migrations/100_opd_session_modes.sql` — fact + audit table shapes.
  - `backend/migrations/031_appointments_opd_edge_cases.sql` — `opd_event_type` enum values.
- **Source decisions:** [Product plans/plan-opd-per-day-mode.md § DL-3, DL-4, DL-13, PD-Q5](../../../Product%20plans/plan-opd-per-day-mode.md).
- **Wave gate:** [`EXECUTION-ORDER-opd-per-day-mode.md` § Wave 2 gate](./EXECUTION-ORDER-opd-per-day-mode.md#wave-2-gate-after-pdm-05).
- **Previous task:** [`task-pdm-03-read-path-swap.md`](./task-pdm-03-read-path-swap.md).
- **Next task:** [`task-pdm-05-conversion-preview-dialog.md`](./task-pdm-05-conversion-preview-dialog.md) — fresh chat (Auto).

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Done (2026-05-17)
