# Task pdm-09: session-overrun flagging cron + `bulkResolveSessionOverrun` + 24h fallback worker

## 17 May 2026 — Batch [OPD Per-Day Mode](../plan-opd-per-day-mode-batch.md) — Wave 5, Lane α step 1 — **M, ~6h**

---

## Task overview

Backend foundations for DL-7 + DL-8. Ships:

1. **Tiny DDL migration `102_appointments_session_overrun.sql`** — adds `appointments.session_overrun_at TIMESTAMPTZ NULL` (the lock-in choice — *not* derived-on-read; see step 0 rationale).
2. **Flagging cron worker (`runOpdOverrunFlaggingCron`)** — every 5 min, finds `pending|confirmed` rows whose date is in the past AND whose `session_end + 30 min < now()`. Sets `session_overrun_at = now()` (idempotent: only updates rows where the column is currently NULL).
3. **`bulkResolveSessionOverrun(supabase, doctorId, date, action, perRowOverrides)`** — implements the five DL-7 actions:
   - `reschedule_all` (default) — uses the existing reschedule primitive to move each row to next-available same-modality-same-service.
   - `reschedule_per_patient` — same primitive, but the caller passes a specific target per row in `perRowOverrides`.
   - `mark_completed` — sets `status='completed'`, clears `session_overrun_at`, writes a system note.
   - `cancel_refund` — sets `status='cancelled'`, calls the refund primitive, writes a system note.
   - `mark_no_show` — sets `status='no_show'`, clears `session_overrun_at`, writes a system note.
4. **24h auto-reschedule fallback worker (`runOpdOverrunFallbackCron`)** — runs hourly. Selects rows where `session_overrun_at + 24h < now()` AND `status IN ('pending', 'confirmed')` AND `session_overrun_at IS NOT NULL` — i.e., overrun rows the doctor didn't action. Calls `reschedule_all` with `triggered_by = 'system_overrun_fallback'`.
5. **New routes:**
   - `POST /api/v1/opd/session/overrun/bulk-resolve` (doctor-only) — accepts `{ date, action, perRowOverrides? }`, returns `{ resolved: number, results: PerRowResult[] }`.
   - `GET /api/v1/opd/session/overrun?date=YYYY-MM-DD` (doctor-only, doctor+today scope) — returns the list of overrun rows for a date for the UI tray (pdm-10).
6. **Telemetry events** — `opd_overrun.flagged`, `opd_overrun.bulk_resolved`, `opd_overrun.fallback_rescheduled`.

**Estimated time:** ~6h (~30 min migration + RLS, ~1h flagging cron, ~2.5h bulk-resolve orchestrator + 5 actions, ~30 min fallback cron, ~30 min routes + auth, ~1h tests, ~30 min verification).

**Status:** Pending.

**Hard deps:** pdm-01 (auth + RLS conventions, doctor_id FK pattern), pdm-04 (advisory-lock pattern reused for the bulk-resolve race window). Read-only on the conversion service.

**Source:** [plan-opd-per-day-mode-batch.md § Wave 5](../plan-opd-per-day-mode-batch.md#wave-5--session-overrun-handling-2-tasks-10h-single-sequential-lane) + `DL-7` + `DL-8` in [Product plans/plan-opd-per-day-mode.md](../../../Product%20plans/plan-opd-per-day-mode.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). Service surface is multi-file but every primitive is well-spec'd by precedent (cron, reschedule, refund, status update). **Not on the hard-rules list** — the DDL is a one-column add with no RLS redesign; the cron workers mirror an existing scheduling pattern; the 5 actions are straightforward.

**Per-message escalation rule:** if Auto gets confused about the **idempotency boundary** between the flagging cron and the fallback cron (they're both reading the same flag column), escalate that **one message** to Opus 4.7 Extra High. Same for any concurrency concern (PD-Q5-style advisory lock around the bulk-resolve when multiple browser tabs submit simultaneously).

**Manual-Sonnet fallback:** only if A/B-testing.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `backend/migrations/100_opd_session_modes.sql` (post-pdm-01 — use this migration's structure as the template).
- `backend/src/workers/opd-cron.ts` (or whatever the project's cron host is — verify with `rg "node-cron|setInterval.*sweep|registerCron"` over backend/src).
- `backend/src/services/reschedule-service.ts` (or whatever the project calls it — verify with `rg "rescheduleAppointment\b|moveToNextAvailable"`).
- `backend/src/services/refund-service.ts` (verify with `rg "refundAppointment\b|createRefund"`).
- `backend/src/services/appointment-service.ts` — verify the column list on `appointments`, the `status` enum values, the `working_hours` JSONB structure.
- `backend/src/services/opd/opd-mode-conversion-service.ts` (post-pdm-04 — re-use its advisory-lock helper).
- `backend/src/routes/api/v1/opd.ts` (post-pdm-04 — append the two new routes).
- `backend/src/controllers/opd-doctor-controller.ts` — same controller file the bulk-resolve handler lands in.
- Source plan §DL-7, §DL-8.

**Estimated turns:** 6–8 turns (1 DDL migration, 1 flagging cron, 2 bulk-resolve + 5 actions, 1 fallback cron, 1 routes, 1 tests, 1 verification).

---

## Acceptance criteria

### Step 0 — Lock the design choice: column vs derived-on-read

**Decision (locked in this task):** add a real `appointments.session_overrun_at TIMESTAMPTZ NULL` column. **Why not derived-on-read:**

1. The UI tray and the fallback cron both need to know **when** the row became overrun (the `session_overrun_at + 24h` fallback boundary). A derived value would have to recompute `session_end + 30 min` per row per read; the column captures the moment exactly once.
2. The fallback cron's query needs an indexable predicate. `WHERE session_overrun_at < now() - interval '24h'` is index-friendly; a derived expression is not.
3. The audit trail benefits: support can query "how long did this row sit in overrun before being actioned?" in one column lookup.
4. The cost is one nullable TIMESTAMPTZ — negligible.

Locked.

### Step 1 — DDL migration

- [ ] Create `backend/migrations/102_appointments_session_overrun.sql`:

  ```sql
  -- 102_appointments_session_overrun.sql
  -- Adds `session_overrun_at` to appointments for DL-7 / DL-8 (OPD per-day mode batch).
  -- Set when the flagging cron determines a pending|confirmed row sat past session_end + 30 min.
  -- Cleared when the row is rescheduled, completed, cancelled, or marked no_show.

  ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS session_overrun_at TIMESTAMPTZ NULL;

  COMMENT ON COLUMN appointments.session_overrun_at IS
    'Set by runOpdOverrunFlaggingCron when status IN (''pending'', ''confirmed'') and now() > session_end + 30 min. Cleared on resolve.';

  -- Index for the flagging cron (find rows that need flagging) and the fallback cron (find rows that need rescheduling).
  CREATE INDEX IF NOT EXISTS idx_appointments_session_overrun_at
    ON appointments (session_overrun_at)
    WHERE session_overrun_at IS NOT NULL;

  -- Partial index for the flagging cron's eligibility predicate.
  CREATE INDEX IF NOT EXISTS idx_appointments_overrun_candidates
    ON appointments (doctor_id, appointment_date)
    WHERE status IN ('pending', 'confirmed') AND session_overrun_at IS NULL;
  ```

- [ ] **RLS pass-through:** the `appointments` table already has RLS (verify; `028_opd_modes.sql` and earlier migrations would have set it up). Adding a column doesn't change RLS; doctors who can read their own appointments can read this column.
- [ ] **Audit:** add a row to `docs/Work/Daily-plans/May 2026/17-05-2026/opd-per-day-mode/README.md`'s migration log (or the batch README equivalent). _Optional but recommended._
- [ ] **Smoke:** `pnpm --filter backend test -- migrations/102` or `pnpm db:migrate` should apply cleanly. Then `psql -c "\\d appointments"` shows the new column + indices.

### Step 2 — Flagging cron worker

- [ ] Add `backend/src/workers/opd-overrun-cron.ts`:

  ```ts
  import type { SupabaseClient } from '@supabase/supabase-js';
  import { logger } from '@/utils/logger';
  import { recordTelemetry } from '@/services/telemetry-service';

  export interface OverrunFlaggingCronResult {
    candidatesScanned: number;
    flagged: number;
    errors: number;
  }

  /**
   * Runs every 5 min. Finds pending|confirmed appointments past their session_end + 30 min
   * and stamps `session_overrun_at = now()` on rows where it's currently NULL.
   *
   * Uses the appointment's resolved session_end (computed from doctor's working_hours JSONB +
   * appointment_date). For doctors without a working_hours entry, falls back to a clinic-level
   * default (look at the existing source of truth for session_end — likely
   * `backend/src/services/opd/opd-session-service.ts` or `working-hours-service.ts`).
   */
  export async function runOpdOverrunFlaggingCron(
    supabase: SupabaseClient,
  ): Promise<OverrunFlaggingCronResult> {
    const startedAt = Date.now();
    const result: OverrunFlaggingCronResult = { candidatesScanned: 0, flagged: 0, errors: 0 };

    // 1. Find candidates: doctor + date pairs in the past with at least one pending|confirmed
    //    row not yet flagged. Group by (doctor_id, appointment_date) to compute session_end once.
    const { data: candidates, error: candidatesErr } = await supabase
      .from('appointments')
      .select('id, doctor_id, appointment_date')
      .in('status', ['pending', 'confirmed'])
      .is('session_overrun_at', null)
      .lt('appointment_date', new Date().toISOString().split('T')[0]);

    if (candidatesErr) {
      logger.error({ err: candidatesErr }, 'overrun-flagging-cron: candidate query failed');
      result.errors++;
      return result;
    }

    result.candidatesScanned = candidates?.length ?? 0;
    if (!candidates || candidates.length === 0) {
      logger.info({ elapsed_ms: Date.now() - startedAt, ...result }, 'overrun-flagging-cron: done (no candidates)');
      return result;
    }

    // 2. Group by (doctor_id, date) and compute session_end per group.
    const grouped = new Map<string, { doctorId: string; date: string; aptIds: string[] }>();
    for (const apt of candidates) {
      const key = `${apt.doctor_id}::${apt.appointment_date}`;
      if (!grouped.has(key)) {
        grouped.set(key, { doctorId: apt.doctor_id, date: apt.appointment_date, aptIds: [] });
      }
      grouped.get(key)!.aptIds.push(apt.id);
    }

    // 3. For each group, resolve session_end. Flag rows where now() > session_end + 30 min.
    for (const group of grouped.values()) {
      const sessionEnd = await resolveSessionEndForDate(supabase, group.doctorId, group.date);
      if (!sessionEnd) {
        // Doctor has no working_hours for this weekday — be conservative, flag as overrun
        // (since the date is already in the past with pending|confirmed rows, the doctor
        // clearly didn't see them within their schedule). Alternatively, skip; we choose flag.
        await flagRows(supabase, group.aptIds, result);
        continue;
      }

      const thirtyMinAfterEnd = new Date(sessionEnd.getTime() + 30 * 60 * 1000);
      if (Date.now() > thirtyMinAfterEnd.getTime()) {
        await flagRows(supabase, group.aptIds, result);
      }
    }

    logger.info({ elapsed_ms: Date.now() - startedAt, ...result }, 'overrun-flagging-cron: done');
    await recordTelemetry('opd_overrun.flagged_batch', { count: result.flagged });
    return result;
  }

  async function flagRows(supabase: SupabaseClient, aptIds: string[], result: OverrunFlaggingCronResult) {
    const { error } = await supabase
      .from('appointments')
      .update({ session_overrun_at: new Date().toISOString() })
      .in('id', aptIds)
      .is('session_overrun_at', null); // idempotent guard
    if (error) {
      logger.error({ err: error, aptIds }, 'overrun-flagging-cron: flag failed');
      result.errors++;
    } else {
      result.flagged += aptIds.length;
      for (const id of aptIds) {
        await recordTelemetry('opd_overrun.flagged', { appointment_id: id });
      }
    }
  }

  async function resolveSessionEndForDate(
    supabase: SupabaseClient,
    doctorId: string,
    date: string,
  ): Promise<Date | null> {
    // Delegate to the existing working-hours service. Returns null if doctor has no
    // session that day.
    // ...wire to backend/src/services/working-hours-service.ts (or equivalent).
    return null; // PLACEHOLDER: pdm-09 wires this through.
  }
  ```

- [ ] Register the cron in the project's cron host (`backend/src/workers/index.ts` or `backend/src/cron.ts`):

  ```ts
  registerCron('opd-overrun-flagging', '*/5 * * * *', () => runOpdOverrunFlaggingCron(supabaseAdmin));
  ```

  Verify with `rg "registerCron|node-cron|setInterval.*Cron"` to find the project's pattern.

- [ ] **Idempotency:** every UPDATE has `.is('session_overrun_at', null)` so re-running mid-flight doesn't overwrite a stamp. The flagging cron is safe to run more often than every 5 min.

### Step 3 — `bulkResolveSessionOverrun` orchestrator

- [ ] Add `backend/src/services/opd/opd-overrun-service.ts`:

  ```ts
  import type { SupabaseClient } from '@supabase/supabase-js';
  import { acquireSessionDayAdvisoryLock } from '@/services/opd/opd-mode-conversion-service'; // re-used from pdm-04
  import { rescheduleAppointmentToNextAvailable } from '@/services/reschedule-service';
  import { refundAppointment } from '@/services/refund-service';
  import { recordTelemetry } from '@/services/telemetry-service';

  export type OverrunAction =
    | 'reschedule_all'
    | 'reschedule_per_patient'
    | 'mark_completed'
    | 'cancel_refund'
    | 'mark_no_show';

  export interface PerRowOverride {
    appointmentId: string;
    /** override action for this specific row */
    action: OverrunAction;
    /** target slot for `reschedule_per_patient` (ISO datetime). Ignored for other actions. */
    rescheduleTo?: string;
  }

  export interface BulkResolveSessionOverrunOptions {
    triggeredBy: 'doctor' | 'system_overrun_fallback';
    /** Used in the telemetry / audit notes. */
    correlationId?: string;
  }

  export interface PerRowResult {
    appointmentId: string;
    action: OverrunAction;
    status: 'success' | 'skipped' | 'error';
    message?: string;
  }

  export interface BulkResolveSessionOverrunResult {
    resolved: number;
    results: PerRowResult[];
  }

  export async function bulkResolveSessionOverrun(
    supabase: SupabaseClient,
    doctorId: string,
    date: string, // YYYY-MM-DD
    action: OverrunAction,
    perRowOverrides: PerRowOverride[] | undefined,
    options: BulkResolveSessionOverrunOptions,
  ): Promise<BulkResolveSessionOverrunResult> {
    return acquireSessionDayAdvisoryLock(supabase, doctorId, date, async () => {
      // 1. Fetch all overrun rows for this doctor + date.
      const { data: rows, error } = await supabase
        .from('appointments')
        .select('id, status, opd_event_type, patient_id, service_id, appointment_date, modality')
        .eq('doctor_id', doctorId)
        .eq('appointment_date', date)
        .in('status', ['pending', 'confirmed'])
        .not('session_overrun_at', 'is', null);

      if (error || !rows) {
        throw new Error(`bulkResolveSessionOverrun: fetch failed: ${error?.message}`);
      }

      const result: BulkResolveSessionOverrunResult = { resolved: 0, results: [] };
      const overrideMap = new Map<string, PerRowOverride>(
        (perRowOverrides ?? []).map((o) => [o.appointmentId, o]),
      );

      for (const row of rows) {
        const override = overrideMap.get(row.id);
        const effectiveAction = override?.action ?? action;
        const rowResult = await applyOverrunAction(
          supabase,
          row,
          effectiveAction,
          override?.rescheduleTo,
          options,
        );
        result.results.push(rowResult);
        if (rowResult.status === 'success') result.resolved++;
      }

      await recordTelemetry('opd_overrun.bulk_resolved', {
        doctor_id: doctorId,
        date,
        action,
        resolved: result.resolved,
        total: rows.length,
        triggered_by: options.triggeredBy,
      });

      return result;
    });
  }

  async function applyOverrunAction(
    supabase: SupabaseClient,
    row: { id: string; patient_id: string; service_id: string; modality: string; appointment_date: string },
    action: OverrunAction,
    rescheduleTo: string | undefined,
    options: BulkResolveSessionOverrunOptions,
  ): Promise<PerRowResult> {
    try {
      switch (action) {
        case 'reschedule_all': {
          await rescheduleAppointmentToNextAvailable(supabase, row.id, {
            triggeredBy: options.triggeredBy,
            reason: 'session_overrun',
            correlationId: options.correlationId,
          });
          // The reschedule primitive should clear session_overrun_at on the old row
          // (because the appointment now has a new date). Verify in step 4.
          return { appointmentId: row.id, action, status: 'success' };
        }
        case 'reschedule_per_patient': {
          if (!rescheduleTo) {
            return { appointmentId: row.id, action, status: 'skipped', message: 'rescheduleTo missing' };
          }
          await rescheduleAppointmentToSpecificSlot(supabase, row.id, rescheduleTo, {
            triggeredBy: options.triggeredBy,
            reason: 'session_overrun',
          });
          return { appointmentId: row.id, action, status: 'success' };
        }
        case 'mark_completed': {
          const { error } = await supabase
            .from('appointments')
            .update({
              status: 'completed',
              session_overrun_at: null,
              admin_notes: `Marked completed by doctor after session overrun (${options.triggeredBy})`,
            })
            .eq('id', row.id);
          if (error) throw error;
          return { appointmentId: row.id, action, status: 'success' };
        }
        case 'cancel_refund': {
          // Refund first, then cancel — so a refund failure leaves the appointment in
          // a recoverable state. The refund primitive is idempotent.
          await refundAppointment(supabase, row.id, { reason: 'session_overrun_no_refund_due', correlationId: options.correlationId });
          const { error } = await supabase
            .from('appointments')
            .update({
              status: 'cancelled',
              cancelled_at: new Date().toISOString(),
              cancellation_reason: 'session_overrun',
              session_overrun_at: null,
            })
            .eq('id', row.id);
          if (error) throw error;
          return { appointmentId: row.id, action, status: 'success' };
        }
        case 'mark_no_show': {
          const { error } = await supabase
            .from('appointments')
            .update({
              status: 'no_show',
              session_overrun_at: null,
              admin_notes: `Marked no-show after session overrun (${options.triggeredBy})`,
            })
            .eq('id', row.id);
          if (error) throw error;
          return { appointmentId: row.id, action, status: 'success' };
        }
      }
    } catch (err) {
      return {
        appointmentId: row.id,
        action,
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
  ```

- [ ] **Race against the flagging cron:** if the cron stamps `session_overrun_at = now()` *during* a bulk-resolve, we want to ignore newly-flagged rows. The advisory lock ensures we fetched a snapshot at lock-acquire time and proceed only on that snapshot. New flags landing during the bulk-resolve will be picked up in the next tray load.

- [ ] **Audit:** every bulk-resolve writes telemetry. Don't add a dedicated audit table — the `appointments.admin_notes` field captures the per-row outcome; correlation ID lets support trace it.

### Step 4 — Reschedule primitive: clears overrun flag on success

- [ ] **Verify** the existing reschedule service clears `session_overrun_at` when it moves an appointment to a new date. If not, add the clear:

  ```ts
  // In rescheduleAppointmentToNextAvailable / rescheduleAppointmentToSpecificSlot:
  await supabase
    .from('appointments')
    .update({
      appointment_date: newDate,
      // ... existing fields ...
      session_overrun_at: null, // pdm-09: clear overrun flag on reschedule
    })
    .eq('id', appointmentId);
  ```

- [ ] If the reschedule primitive *creates* a new row (transactional INSERT + cancel original), the new row obviously won't have the flag set; verify the original row's `session_overrun_at` is cleared as part of the cancel.

### Step 5 — 24h auto-reschedule fallback worker

- [ ] In the same `opd-overrun-cron.ts` file:

  ```ts
  export interface OverrunFallbackCronResult {
    candidatesScanned: number;
    rescheduled: number;
    errors: number;
  }

  /**
   * Runs hourly. Picks up overrun rows the doctor didn't action within 24h.
   * For each: invokes bulkResolveSessionOverrun with action='reschedule_all' and
   * triggeredBy='system_overrun_fallback'.
   */
  export async function runOpdOverrunFallbackCron(
    supabase: SupabaseClient,
  ): Promise<OverrunFallbackCronResult> {
    const startedAt = Date.now();
    const result: OverrunFallbackCronResult = { candidatesScanned: 0, rescheduled: 0, errors: 0 };

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: candidates, error } = await supabase
      .from('appointments')
      .select('doctor_id, appointment_date')
      .in('status', ['pending', 'confirmed'])
      .not('session_overrun_at', 'is', null)
      .lt('session_overrun_at', twentyFourHoursAgo);

    if (error) {
      logger.error({ err: error }, 'overrun-fallback-cron: query failed');
      result.errors++;
      return result;
    }

    result.candidatesScanned = candidates?.length ?? 0;
    if (!candidates || candidates.length === 0) {
      logger.info({ elapsed_ms: Date.now() - startedAt, ...result }, 'overrun-fallback-cron: done (no candidates)');
      return result;
    }

    // Group by (doctor_id, date). bulkResolveSessionOverrun expects a (doctor, date) pair
    // and resolves all overrun rows for that pair in one transaction.
    const grouped = new Set<string>();
    for (const c of candidates) {
      grouped.add(`${c.doctor_id}::${c.appointment_date}`);
    }

    for (const key of grouped) {
      const [doctorId, date] = key.split('::');
      try {
        const bulkResult = await bulkResolveSessionOverrun(
          supabase,
          doctorId,
          date,
          'reschedule_all',
          undefined,
          { triggeredBy: 'system_overrun_fallback', correlationId: `fallback-${key}-${Date.now()}` },
        );
        result.rescheduled += bulkResult.resolved;
        await recordTelemetry('opd_overrun.fallback_rescheduled', {
          doctor_id: doctorId,
          date,
          count: bulkResult.resolved,
        });
      } catch (err) {
        result.errors++;
        logger.error({ err, doctorId, date }, 'overrun-fallback-cron: bulk-resolve failed');
      }
    }

    logger.info({ elapsed_ms: Date.now() - startedAt, ...result }, 'overrun-fallback-cron: done');
    return result;
  }
  ```

- [ ] Register the fallback cron hourly:

  ```ts
  registerCron('opd-overrun-fallback', '0 * * * *', () => runOpdOverrunFallbackCron(supabaseAdmin));
  ```

- [ ] **Why hourly, not every 5 min?** The 24h boundary is the only event of interest; running every 5 min just thrashes the query for the 95% of the hour where nothing has crossed it. Hourly is enough to keep the boundary tight (max 1h overshoot beyond 24h).

### Step 6 — Routes

- [ ] In `backend/src/routes/api/v1/opd.ts` (post-pdm-04):

  ```ts
  router.get('/session/overrun', requireDoctorAuth, getOpdSessionOverrun);
  router.post('/session/overrun/bulk-resolve', requireDoctorAuth, postOpdSessionOverrunBulkResolve);
  ```

- [ ] In `backend/src/controllers/opd-doctor-controller.ts`:

  ```ts
  export async function getOpdSessionOverrun(req: AuthedRequest, res: Response) {
    const doctorId = req.user.id;
    const { date } = req.query;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Query param `date` (YYYY-MM-DD) is required.' });
    }
    const { data: rows, error } = await supabaseAdmin
      .from('appointments')
      .select(`
        id, status, appointment_date, opd_event_type, modality,
        patients(id, first_name, last_name, phone),
        services(id, name, duration_min)
      `)
      .eq('doctor_id', doctorId)
      .eq('appointment_date', date)
      .in('status', ['pending', 'confirmed'])
      .not('session_overrun_at', 'is', null)
      .order('appointment_date', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ date, count: rows?.length ?? 0, rows: rows ?? [] });
  }

  export async function postOpdSessionOverrunBulkResolve(req: AuthedRequest, res: Response) {
    const doctorId = req.user.id;
    const { date, action, perRowOverrides } = req.body;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Body field `date` (YYYY-MM-DD) is required.' });
    }
    if (!isOverrunAction(action)) {
      return res.status(400).json({ error: `Invalid action: ${action}` });
    }
    try {
      const result = await bulkResolveSessionOverrun(
        supabaseAdmin,
        doctorId,
        date,
        action,
        perRowOverrides,
        { triggeredBy: 'doctor', correlationId: req.headers['x-correlation-id'] as string | undefined },
      );
      return res.json(result);
    } catch (err) {
      logger.error({ err, doctorId, date, action }, 'bulkResolveSessionOverrun failed');
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Bulk-resolve failed.' });
    }
  }
  ```

- [ ] `isOverrunAction` is a tiny type-guard:

  ```ts
  function isOverrunAction(v: unknown): v is OverrunAction {
    return ['reschedule_all', 'reschedule_per_patient', 'mark_completed', 'cancel_refund', 'mark_no_show'].includes(v as string);
  }
  ```

### Step 7 — Tests

- [ ] `backend/tests/unit/services/opd/opd-overrun-service.test.ts`:

  - `bulkResolveSessionOverrun` with each of the 5 actions, on a 3-row fixture:
    - `reschedule_all` → 3 calls to `rescheduleAppointmentToNextAvailable`.
    - `reschedule_per_patient` with 1 override → 1 specific reschedule + 2 errors (`rescheduleTo` missing).
    - `mark_completed` → 3 rows updated to `status='completed'`, `session_overrun_at=null`.
    - `cancel_refund` → 3 refund calls + 3 status updates.
    - `mark_no_show` → 3 rows updated to `status='no_show'`.
  - Per-row override mixing actions: 2 rows `mark_completed`, 1 row `cancel_refund` → 2 completions + 1 cancel.
  - Empty overrun set → `{ resolved: 0, results: [] }` (no errors).
  - Failure path: mock the reschedule primitive to throw → `result.status === 'error'` with the message.

- [ ] `backend/tests/unit/workers/opd-overrun-cron.test.ts`:

  - **Flagging cron:**
    - 0 candidates → `{ candidatesScanned: 0, flagged: 0, errors: 0 }`.
    - 5 candidates, all past `session_end + 30 min` → `{ flagged: 5 }`.
    - 5 candidates, 3 past `session_end + 30 min` and 2 within grace → `{ flagged: 3 }`.
    - Re-run on the same data → `{ flagged: 0 }` (idempotency).
  - **Fallback cron:**
    - 0 candidates → `{ rescheduled: 0 }`.
    - 3 rows past 24h boundary → `{ rescheduled: 3 }` (mocks `bulkResolveSessionOverrun`).
    - 3 rows where 1 fails → `{ rescheduled: 2, errors: 1 }`.

- [ ] `backend/tests/integration/api/opd-overrun.test.ts` (optional but recommended):

  - `GET /api/v1/opd/session/overrun?date=...` returns the doctor's overrun rows.
  - `POST /api/v1/opd/session/overrun/bulk-resolve` with `{ action: 'reschedule_all' }` rescheduled all rows.
  - Auth: another doctor's token gets 0 rows back (RLS).

### Step 8 — Verification

- [ ] `pnpm --filter backend tsc --noEmit` clean.
- [ ] `pnpm --filter backend lint` clean.
- [ ] `pnpm --filter backend test -- overrun` all green.
- [ ] **Manual smoke (against a dev DB):**
  1. Seed a doctor with 5 `pending` appointments for yesterday with `appointment_date = yesterday`.
  2. Manually invoke `runOpdOverrunFlaggingCron(supabaseAdmin)` → 5 rows get `session_overrun_at` set.
  3. `curl GET /api/v1/opd/session/overrun?date=<yesterday>` → returns 5 rows.
  4. `curl POST /api/v1/opd/session/overrun/bulk-resolve` with `{ date, action: 'reschedule_all' }` → 5 rows rescheduled, response shape correct.
  5. Verify the original 5 rows now have `appointment_date` updated and `session_overrun_at = null`.
- [ ] **24h fallback dry-run:**
  1. Manually set `session_overrun_at` on 3 rows to 25h ago.
  2. Invoke `runOpdOverrunFallbackCron(supabaseAdmin)` → 3 rows auto-rescheduled with `triggeredBy='system_overrun_fallback'` telemetry.

---

## Out of scope

- **Frontend tray UI** — pdm-10 mounts the tray and the bulk-action dialog.
- **7-day editable window after fallback hardens** (final clause of DL-8) — defer; the auto-rescheduled appointment is a normal appointment that the patient can reschedule via the standard flow. A future polish task can add the "system_overrun_fallback" hint in the patient UI so they know the rescheduled time was system-chosen.
- **Refund partial / no-refund** — `cancel_refund` action calls the refund primitive unconditionally. If the doctor wants a no-refund cancel, the existing cancel flow already supports that (separate UI path; not via this batch).
- **Cancellation reason taxonomy** — `cancellation_reason='session_overrun'` is hard-coded here; if the project has a typed enum, conform to it.
- **Patient notification on each action** — the reschedule primitive should already notify the patient; the cancel primitive should too. pdm-09 doesn't add its own notifications.
- **`session_overrun_at` index cleanup migration** — the partial indexes added in step 1 are fine for now; revisit if the table grows past 10M rows.
- **Per-service overrun grace window override** — currently `session_end + 30 min` is a global constant. Deferred.

---

## Files expected to touch

**New:**

- `backend/migrations/102_appointments_session_overrun.sql` (~20 LOC).
- `backend/src/workers/opd-overrun-cron.ts` (~180 LOC — both crons).
- `backend/src/services/opd/opd-overrun-service.ts` (~250 LOC — orchestrator + 5 actions).
- `backend/tests/unit/services/opd/opd-overrun-service.test.ts` (~200 LOC).
- `backend/tests/unit/workers/opd-overrun-cron.test.ts` (~120 LOC).
- `backend/tests/integration/api/opd-overrun.test.ts` (~100 LOC).

**Modified:**

- `backend/src/routes/api/v1/opd.ts` (~6 LOC delta — two new routes).
- `backend/src/controllers/opd-doctor-controller.ts` (~80 LOC delta — `getOpdSessionOverrun` + `postOpdSessionOverrunBulkResolve`).
- `backend/src/services/reschedule-service.ts` (~5 LOC delta if it doesn't already clear `session_overrun_at`).
- `backend/src/workers/index.ts` (or equivalent cron-host) (~5 LOC delta — register two crons).
- `backend/src/types/database.ts` (~3 LOC delta — add `session_overrun_at` to `AppointmentRow`).

---

## Notes / open decisions

1. **Why a real column over derived-on-read?** Step 0 lays out the rationale. The 24h fallback predicate (`session_overrun_at + 24h < now()`) needs to be indexable.
2. **Why is the fallback cron hourly instead of every 5 min?** The 24h boundary is the only event of interest. Hourly keeps the boundary within 1h precision, which is far below the noise floor (the doctor's perception is "rescheduled the next day", not "rescheduled at 24h00m00s").
3. **What if the doctor opens the tray on a day with 200 overrun rows?** The tray query returns all 200 rows; bulk-resolve processes them sequentially in one advisory-lock transaction. Conservative estimate: 200 reschedules × 50ms each = 10s. Acceptable for a doctor-initiated bulk action. If perf becomes an issue, parallelize within the lock (but the reschedule primitive may not be safe for concurrent calls; verify).
4. **What if the cron flags a row that the doctor is actively viewing in the bulk-action dialog?** The dialog's view is a snapshot at fetch time. The doctor's bulk-resolve only affects rows currently flagged at the moment the action fires (the orchestrator re-fetches inside the advisory lock). Stale views are tolerated.
5. **Why does `reschedule_per_patient` skip rows without `rescheduleTo`?** The doctor's UI (pdm-10) is expected to validate per-row inputs before submit. If a row arrives without `rescheduleTo`, it's a UI bug — skipping (not erroring) gives the doctor partial success on the other rows and a clear "needs more info" signal for the missing-target row.
6. **What about cancellation refunds when the original payment isn't refundable?** The refund primitive handles this — it's a no-op for already-refunded or unrefundable rows. `cancel_refund` becomes "cancel and best-effort refund" in practice.
7. **Why not write to `doctor_opd_session_mode_changes` audit table?** That table is specifically for **mode flips**, not for appointment status changes. The appointment audit lives in `appointments.admin_notes` + `cancelled_at` / `cancellation_reason` (existing); the telemetry events capture the bulk-resolve event.
8. **Why partial indexes?** The `appointments` table is large; full indexes on `session_overrun_at` would be expensive. The partial indexes (`WHERE session_overrun_at IS NOT NULL` and the candidates predicate) keep the index small (~0.1% of the table).

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:**
  - `backend/src/services/opd/opd-mode-conversion-service.ts` (post-pdm-04) — `acquireSessionDayAdvisoryLock` is reused.
  - `backend/src/services/reschedule-service.ts` — reschedule primitive.
  - `backend/src/services/refund-service.ts` — refund primitive.
  - `backend/src/services/working-hours-service.ts` (or equivalent) — `session_end` resolver.
- **Source decisions:** [Product plans/plan-opd-per-day-mode.md § DL-7, DL-8, Risk register row 9](../../../Product%20plans/plan-opd-per-day-mode.md).
- **Wave gate:** [`EXECUTION-ORDER-opd-per-day-mode.md` § Wave 5 gate](./EXECUTION-ORDER-opd-per-day-mode.md#wave-5-gate-after-pdm-10).
- **Previous task:** [`task-pdm-08-mode-schedule-settings-ui.md`](./task-pdm-08-mode-schedule-settings-ui.md).
- **Next task:** [`task-pdm-10-overrun-tray-ui.md`](./task-pdm-10-overrun-tray-ui.md).

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
