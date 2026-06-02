# Task pdm-06: Notification debounce table + drainer cron + 3 DL-6 copy templates

## 17 May 2026 — Batch [OPD Per-Day Mode](../plan-opd-per-day-mode-batch.md) — Wave 3, Lane α step 0 — **M, ~7h**

---

## Task overview

When a doctor flips a day's mode, the affected patients must be notified — but only **once**, even if the doctor flips multiple times in quick succession (DL-5 5-min debounce). This task ships:

1. **Migration `101_opd_pending_mode_notifications.sql`** — new table holding one upsertable row per `(doctor_id, session_date)` with `scheduled_for`, `payload_json`, `first_flip_at`, `latest_flip_at`. Row deleted when dispatched, OR when net-zero flip is detected (slot→queue→slot inside the debounce window with the same final mode as the starting mode).
2. **Conversion service ↔ batch row** — pdm-04's `convertSessionDayMode` already writes a debounce upsert (gated). This task **un-gates** that write by ensuring the table exists; conversion service then writes unconditionally.
3. **Worker / cron drainer** — `drainOpdPendingModeNotifications()` runs every 60s. Selects rows where `now() >= scheduled_for` OR `now() >= first_flip_at + 30 min` (the hard ceiling). For each row, loads the affected patients, picks the right DL-6 template per patient (regular-grid vs overflow vs slot→queue), dispatches via the existing patient notification primitive, flips the audit row's `notification_dispatched = true`, deletes the pending row.
4. **DL-6 copy templates** — three string templates in `backend/src/services/opd/opd-mode-conversion-templates.ts`. Locale-aware via the existing notification primitive's i18n hooks.
5. **Net-zero flip detection** — when an incoming conversion's `toMode === pending_row.first_flip_mode`, delete the pending row instead of upserting. (i.e., the doctor flipped back; nothing to tell the patient.)
6. **Tests** — debounce window timing (3 fixtures: single flip, flip-flop inside 5 min, flip-flop after 5 min), 30-min ceiling, net-zero detection, template selection per affected appointment.

**Estimated time:** ~7h (1h schema + types, 1.5h conversion-service hook adjustments, 2h drainer + template-selection logic, 1.5h fixtures + integration tests, 1h verification + manual smoke).

**Status:** Pending.

**Hard deps:** pdm-04 (conversion service exists, calls into this table). The schema in this task **completes** the pdm-04 feature-flag dependency.

**Source:** [plan-opd-per-day-mode-batch.md § Wave 3](../plan-opd-per-day-mode-batch.md#wave-3--notifications-1-task-7h-single-sequential-lane) + `S1.5` and `DL-5` + `DL-6` + `PD-Q2` in [Product plans/plan-opd-per-day-mode.md](../../../Product%20plans/plan-opd-per-day-mode.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). The hardest piece — the 5-min debounce + 30-min ceiling — is fully specified in DL-5 and PD-Q2; nothing to invent. Migration is small (one table, no RLS subtleties beyond service-role-only writes), template strings are locked verbatim, and the drainer cron pattern presumably has a precedent in the codebase. **Not on the hard-rules list** (no PHI columns, no auth/RLS redesign — the table is service-role-only writable, never read by patients).

**Per-message escalation rule:** if Auto stalls on net-zero detection or on the 30-min ceiling query, escalate that **one message** to Opus 4.7 Extra High.

**Manual-Sonnet fallback:** only if A/B-testing.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `backend/migrations/100_opd_session_modes.sql` (post-pdm-01 — sibling shape).
- `backend/migrations/099_doctor_cockpit_layout_presets.sql` (newest formatting conventions).
- `backend/src/services/opd/opd-mode-conversion-service.ts` (post-pdm-04 — calls into the debounce table).
- `backend/src/services/notification-service.ts` OR `backend/src/services/patient-notification-service.ts` (whichever the project's primitive is — Glob `backend/src/services/*notification*.ts` to find).
- `backend/src/workers/` directory listing — find existing cron entry-point pattern.
- Source plan §DL-5, §DL-6, §PD-Q2, §risk-register row 2 (30-min ceiling).

**Estimated turns:** 4–5 turns (1 migration, 1 drainer logic, 1 templates + selection, 1 tests, 1 verification).

---

## Acceptance criteria

### Step 1 — Migration `101_opd_pending_mode_notifications.sql`

- [ ] Create the file in the style of `100_opd_session_modes.sql`:

  ```sql
  -- ============================================================================
  -- OPD per-day mode: pending notification batch (pdm-06)
  -- ============================================================================
  -- Migration: 101_opd_pending_mode_notifications.sql
  -- Date: 2026-05-17
  -- Description:
  --   One upsertable row per (doctor_id, session_date) holding the to-be-dispatched
  --   mode-change notification batch. Drained by a 60s cron worker.
  --
  --   Debounce: row's scheduled_for is set to now() + 5 min on each flip. A flip
  --   within 5 min overwrites scheduled_for (debouncing the previous batch).
  --   Net-zero flip (slot→queue→slot inside the window with the same final mode
  --   as first_flip_mode) deletes the row.
  --
  --   Hard ceiling: first_flip_at + 30 min — drainer dispatches the latest-state
  --   batch regardless of further flips after the ceiling.
  --
  -- RLS: service-role only. Patients and doctors do not read this table directly.
  -- ============================================================================

  CREATE TABLE IF NOT EXISTS doctor_opd_pending_mode_notifications (
    doctor_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_date        DATE NOT NULL,
    first_flip_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    latest_flip_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    scheduled_for       TIMESTAMPTZ NOT NULL,
    first_flip_mode     TEXT NOT NULL
      CONSTRAINT doctor_opd_pending_mode_notifications_first_flip_mode_check CHECK (first_flip_mode IN ('slot', 'queue')),
    latest_flip_mode    TEXT NOT NULL
      CONSTRAINT doctor_opd_pending_mode_notifications_latest_flip_mode_check CHECK (latest_flip_mode IN ('slot', 'queue')),
    payload_json        JSONB NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (doctor_id, session_date)
  );

  CREATE INDEX IF NOT EXISTS idx_doctor_opd_pending_mode_notifications_scheduled
    ON doctor_opd_pending_mode_notifications (scheduled_for);
  CREATE INDEX IF NOT EXISTS idx_doctor_opd_pending_mode_notifications_first_flip
    ON doctor_opd_pending_mode_notifications (first_flip_at);

  COMMENT ON TABLE doctor_opd_pending_mode_notifications IS
    'Debounced mode-change notification batch (pdm-06). One row per (doctor, session_date). '
    'Drained by cron every 60s. Net-zero flip deletes the row.';
  COMMENT ON COLUMN doctor_opd_pending_mode_notifications.first_flip_at IS
    'Timestamp of the first flip in this debounce window. Used for the 30-min ceiling.';
  COMMENT ON COLUMN doctor_opd_pending_mode_notifications.first_flip_mode IS
    'Mode the day was in BEFORE the first flip. Net-zero detection: if next flip targets this mode, delete the row.';
  COMMENT ON COLUMN doctor_opd_pending_mode_notifications.payload_json IS
    'JSON: { from_mode, to_mode, affected_apt_count, overflow_count, correlation_id }. Recomputed on each flip.';

  -- RLS: service-role only. No doctor / patient access.
  ALTER TABLE doctor_opd_pending_mode_notifications ENABLE ROW LEVEL SECURITY;
  -- No policies created: only the service role bypasses RLS (and the worker uses the admin client).
  -- This is intentional: notifications are an internal queue, not user-facing data.

  -- updated_at trigger
  DROP TRIGGER IF EXISTS doctor_opd_pending_mode_notifications_updated_at ON doctor_opd_pending_mode_notifications;
  CREATE TRIGGER doctor_opd_pending_mode_notifications_updated_at
    BEFORE UPDATE ON doctor_opd_pending_mode_notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  ```

- [ ] **Why no RLS policies?** Because no role except the service role should ever read or write this table. Doctors don't need to see their own pending notifications (they see the audit table for "did this fire?"). Patients have no business with internal queue state.

### Step 2 — `pdm-04`'s conversion service: un-gate the upsert

- [ ] In `backend/src/services/opd/opd-mode-conversion-service.ts` (post-pdm-04), find the section that conditionally writes to `doctor_opd_pending_mode_notifications` (the feature-flag block from pdm-04). Replace it with an unconditional upsert:

  ```ts
  // Inside convertSessionDayMode, after the fact + audit writes, before transaction commit:
  const isNetZero = currentFact?.mode === toMode
    ? false // No-op flip; we don't write a debounce row at all (caller short-circuits before this).
    : await detectNetZeroFlip(tx, doctorId, date, toMode);

  if (isNetZero) {
    await tx
      .from('doctor_opd_pending_mode_notifications')
      .delete()
      .eq('doctor_id', doctorId)
      .eq('session_date', date);
  } else {
    await tx
      .from('doctor_opd_pending_mode_notifications')
      .upsert(
        {
          doctor_id: doctorId,
          session_date: date,
          // first_flip_at: keep existing on conflict (don't overwrite); only set on insert
          latest_flip_at: new Date().toISOString(),
          scheduled_for: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          first_flip_mode: (currentFact?.mode ?? toMode) as OpdMode,
          latest_flip_mode: toMode,
          payload_json: {
            from_mode: currentFact?.mode ?? null,
            to_mode: toMode,
            affected_apt_count: assignments.length,
            overflow_count: queueToSlotResult?.overflowCount ?? 0,
            correlation_id: options.correlationId,
          },
        },
        {
          onConflict: 'doctor_id,session_date',
          // Postgres doesn't have a "only set first_flip_at on insert" via Supabase's upsert helper.
          // The cleanest path is: SELECT existing row first; if it exists, manual UPDATE preserving first_flip_at.
          // See detectNetZeroFlip's pattern for the structure.
          ignoreDuplicates: false,
        },
      );
  }
  ```

- [ ] **`detectNetZeroFlip` helper** in the conversion service file:

  ```ts
  /**
   * Net-zero detection: returns true when the upcoming flip targets the same mode
   * the day was in BEFORE the first flip in the current debounce window. In that
   * case, the pending row should be deleted (nothing to tell the patient).
   */
  async function detectNetZeroFlip(
    tx: SupabaseAdmin,
    doctorId: string,
    date: string,
    incomingToMode: OpdMode,
  ): Promise<boolean> {
    const { data: pending } = await tx
      .from('doctor_opd_pending_mode_notifications')
      .select('first_flip_mode')
      .eq('doctor_id', doctorId)
      .eq('session_date', date)
      .maybeSingle();

    if (!pending) return false;
    return pending.first_flip_mode === incomingToMode;
  }
  ```

- [ ] **`first_flip_at` preservation on upsert**: Supabase's `.upsert(..., { onConflict })` overwrites ALL columns by default. To preserve `first_flip_at` across re-flips, do a manual two-step:

  ```ts
  const { data: existing } = await tx
    .from('doctor_opd_pending_mode_notifications')
    .select('first_flip_at, first_flip_mode')
    .eq('doctor_id', doctorId)
    .eq('session_date', date)
    .maybeSingle();

  if (existing) {
    // Update; preserve first_flip_at + first_flip_mode.
    await tx
      .from('doctor_opd_pending_mode_notifications')
      .update({
        latest_flip_at: new Date().toISOString(),
        scheduled_for: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        latest_flip_mode: toMode,
        payload_json: { /* ... */ },
      })
      .eq('doctor_id', doctorId)
      .eq('session_date', date);
  } else {
    // Insert; this is the first flip.
    await tx
      .from('doctor_opd_pending_mode_notifications')
      .insert({
        doctor_id: doctorId,
        session_date: date,
        first_flip_at: new Date().toISOString(),
        latest_flip_at: new Date().toISOString(),
        scheduled_for: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        first_flip_mode: (currentFact?.mode ?? toMode),  // the mode BEFORE this flip
        latest_flip_mode: toMode,
        payload_json: { /* ... */ },
      });
  }
  ```

  *(If the project uses a Postgres function for the merge, prefer that for atomicity. Two-step is acceptable inside the existing transaction; the advisory lock from pdm-04 prevents concurrent writes from the same key.)*

### Step 3 — Worker entry point + drainer

- [ ] **Find the existing cron pattern.** Inspect `backend/src/workers/` (or `backend/src/jobs/`) to identify how cron jobs are registered. Typical patterns:
  - A `setInterval` registered in `backend/src/index.ts` on startup.
  - A `node-cron` instance.
  - A platform-managed scheduler (Render / Railway cron, Supabase scheduled functions, etc.).

  Use the existing pattern; do not introduce a new scheduler.

- [ ] **Create `backend/src/workers/opd-mode-notifications-cron.ts`:**

  ```ts
  import { getSupabaseAdminClient } from '../config/database';
  import { drainOpdPendingModeNotifications } from '../services/opd/opd-mode-notifications-service';

  export async function runOpdModeNotificationsCron() {
    const supabase = getSupabaseAdminClient();
    if (!supabase) return;
    try {
      const summary = await drainOpdPendingModeNotifications(supabase);
      if (summary.dispatched > 0) {
        console.info(`[opd-mode-notifications-cron] dispatched ${summary.dispatched} batches, skipped ${summary.skipped}`);
      }
    } catch (err) {
      console.error('[opd-mode-notifications-cron] drainer failed:', err);
    }
  }

  // Register on startup (mirror the existing cron pattern for the project).
  ```

- [ ] **Register the cron** in `backend/src/index.ts` (or wherever the existing workers are wired). Run every 60s:

  ```ts
  setInterval(() => { void runOpdModeNotificationsCron(); }, 60 * 1000);
  ```

  Or via the project's `node-cron` syntax: `cron.schedule('* * * * *', runOpdModeNotificationsCron);`. Verify in the existing worker files.

### Step 4 — `drainOpdPendingModeNotifications` service

- [ ] Create `backend/src/services/opd/opd-mode-notifications-service.ts`:

  ```ts
  import type { SupabaseAdmin } from '../../utils/supabase-admin';
  import { notifyConversionAffectedPatients } from './opd-mode-notification-dispatcher';

  export interface DrainSummary {
    dispatched: number;
    skipped: number;
  }

  /**
   * Drain the pending notification batch table. Called every 60s by the cron.
   *
   * Selects rows that meet either condition:
   *   1. now() >= scheduled_for (the normal 5-min debounce elapsed)
   *   2. now() >= first_flip_at + 30 min (the hard ceiling — dispatch regardless)
   *
   * For each row:
   *   - Load the affected patients (appointments on the doctor's session_date).
   *   - Pick the right DL-6 template per patient (regular vs overflow vs slot→queue).
   *   - Dispatch via notifyConversionAffectedPatients (uses the existing patient
   *     notification primitive — SMS / Instagram DM / push).
   *   - Flip the latest doctor_opd_session_mode_changes row's notification_dispatched = true.
   *   - Delete the pending row.
   */
  export async function drainOpdPendingModeNotifications(
    supabase: SupabaseAdmin,
  ): Promise<DrainSummary> {
    const now = new Date().toISOString();
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: rows, error } = await supabase
      .from('doctor_opd_pending_mode_notifications')
      .select('doctor_id, session_date, first_flip_at, scheduled_for, latest_flip_mode, payload_json')
      .or(`scheduled_for.lte.${now},first_flip_at.lte.${thirtyMinAgo}`);

    if (error) {
      console.error('[drainOpdPendingModeNotifications] select failed:', error);
      return { dispatched: 0, skipped: 0 };
    }

    let dispatched = 0;
    let skipped = 0;

    for (const row of rows ?? []) {
      try {
        await notifyConversionAffectedPatients(supabase, {
          doctorId: row.doctor_id,
          sessionDate: row.session_date,
          latestMode: row.latest_flip_mode,
          payloadJson: row.payload_json,
        });

        // Mark the corresponding audit row as dispatched.
        const correlationId = row.payload_json?.correlation_id;
        if (correlationId) {
          await supabase
            .from('doctor_opd_session_mode_changes')
            .update({ notification_dispatched: true })
            .eq('correlation_id', correlationId);
        }

        // Delete the pending row.
        await supabase
          .from('doctor_opd_pending_mode_notifications')
          .delete()
          .eq('doctor_id', row.doctor_id)
          .eq('session_date', row.session_date);

        dispatched += 1;
      } catch (err) {
        console.error('[drainOpdPendingModeNotifications] dispatch failed for', row.doctor_id, row.session_date, err);
        skipped += 1;
        // Don't delete the row on failure; it will be retried on the next cron tick.
        // If the same row fails 10 times in a row, log loudly (TODO: dead-letter queue).
      }
    }

    return { dispatched, skipped };
  }
  ```

### Step 5 — DL-6 copy templates

- [ ] Create `backend/src/services/opd/opd-mode-conversion-templates.ts`:

  ```ts
  import type { OpdMode } from '../../types/doctor-settings';

  export interface TemplateVars {
    doctorName: string;
    date: string;            // formatted in doctor's TZ
    time?: string;           // for slot mode targets — the assigned slot start, formatted
    tokenNumber?: number;    // for queue mode targets
    eta?: string;            // for queue mode targets — formatted ETA from start
    rescheduleUrl: string;
    isOverflow?: boolean;    // for queue → slot targets
  }

  /**
   * DL-6 template 1: slot → queue (any patient).
   * "Dr. {name} has changed {date} to queue mode. Your slot at {time} is now token #{n}.
   *  Estimated wait: ~{eta} min from session start. [Reschedule]"
   */
  export function slotToQueueTemplate(vars: TemplateVars): string {
    const eta = vars.eta ?? 'TBD';
    return `Dr. ${vars.doctorName} has changed ${vars.date} to queue mode. ` +
           `Your slot at ${vars.time} is now token #${vars.tokenNumber}. ` +
           `Estimated wait: ~${eta} min from session start. ` +
           `Reschedule: ${vars.rescheduleUrl}`;
  }

  /**
   * DL-6 template 2: queue → slot (regular-grid patient).
   * "Dr. {name} has changed {date} to slot mode. Your token #{n} is now a fixed
   *  appointment at {time}. Please plan to arrive by {time-5min}. [Reschedule]"
   */
  export function queueToSlotRegularTemplate(vars: TemplateVars): string {
    const arrivalTime = formatArriveBy(vars.time);
    return `Dr. ${vars.doctorName} has changed ${vars.date} to slot mode. ` +
           `Your token #${vars.tokenNumber} is now a fixed appointment at ${vars.time}. ` +
           `Please plan to arrive by ${arrivalTime}. ` +
           `Reschedule: ${vars.rescheduleUrl}`;
  }

  /**
   * DL-6 template 3: queue → slot (overflow patient).
   * "Dr. {name} has reorganised {date}. Your token #{n} is now an overflow slot at
   *  end of session (estimated {time}). You'll be seen after all scheduled patients.
   *  [Reschedule]"
   */
  export function queueToSlotOverflowTemplate(vars: TemplateVars): string {
    return `Dr. ${vars.doctorName} has reorganised ${vars.date}. ` +
           `Your token #${vars.tokenNumber} is now an overflow slot at end of session (estimated ${vars.time}). ` +
           `You'll be seen after all scheduled patients. ` +
           `Reschedule: ${vars.rescheduleUrl}`;
  }

  /**
   * Pick the right template for a given affected appointment.
   * Pure function; no side effects.
   */
  export function pickTemplate(
    latestMode: OpdMode,
    previousMode: OpdMode | null,
    isOverflow: boolean,
  ): 'slot_to_queue' | 'queue_to_slot_regular' | 'queue_to_slot_overflow' {
    if (latestMode === 'queue') return 'slot_to_queue';
    // latestMode === 'slot'; previousMode was queue
    return isOverflow ? 'queue_to_slot_overflow' : 'queue_to_slot_regular';
  }

  function formatArriveBy(time: string | undefined): string {
    if (!time) return 'TBD';
    // Subtract 5 min — implementation depends on the project's date/time utils.
    // ...
    return time; // placeholder; real implementation in this task
  }
  ```

- [ ] **The templates are stable English placeholders.** PD-D6 defers per-doctor / per-locale customisation. The existing notification primitive's i18n hooks should wrap these strings if the project supports multiple locales; for now, English is the only target.

### Step 6 — `notifyConversionAffectedPatients` dispatcher

- [ ] Create `backend/src/services/opd/opd-mode-notification-dispatcher.ts`:

  ```ts
  import type { SupabaseAdmin } from '../../utils/supabase-admin';
  import type { OpdMode } from '../../types/doctor-settings';
  import { sendPatientNotification } from '../notification-service'; // or whatever the project's primitive is
  import {
    slotToQueueTemplate,
    queueToSlotRegularTemplate,
    queueToSlotOverflowTemplate,
    pickTemplate,
  } from './opd-mode-conversion-templates';

  export interface NotifyParams {
    doctorId: string;
    sessionDate: string;
    latestMode: OpdMode;
    payloadJson: Record<string, unknown>;
  }

  export async function notifyConversionAffectedPatients(
    supabase: SupabaseAdmin,
    params: NotifyParams,
  ) {
    const { doctorId, sessionDate, latestMode, payloadJson } = params;
    const previousMode = (payloadJson.from_mode ?? null) as OpdMode | null;

    // Load doctor info (name + TZ).
    const { data: doctor } = await supabase
      .from('doctors')
      .select('id, full_name, timezone, reschedule_url_template')
      .eq('id', doctorId)
      .maybeSingle();
    if (!doctor) return; // doctor record vanished; nothing to do

    // Load affected patients.
    const { data: appointments } = await supabase
      .from('appointments')
      .select(`
        id, patient_id, appointment_date, opd_event_type, status,
        opd_queue_entries (token_number),
        patients (full_name, phone_e164)
      `)
      .eq('doctor_id', doctorId)
      .eq('appointment_date::date', sessionDate) // adjust syntax to project conventions
      .in('status', ['pending', 'confirmed']);

    for (const apt of appointments ?? []) {
      const isOverflow = apt.opd_event_type === 'return_after_completed';
      const template = pickTemplate(latestMode, previousMode, isOverflow);

      const vars = {
        doctorName: doctor.full_name,
        date: formatInDoctorTZ(sessionDate, doctor.timezone),
        time: latestMode === 'slot' ? formatTimeInDoctorTZ(apt.appointment_date, doctor.timezone) : undefined,
        tokenNumber: apt.opd_queue_entries?.[0]?.token_number ?? undefined,
        eta: latestMode === 'queue' ? estimateEta(apt) : undefined,
        rescheduleUrl: buildRescheduleUrl(doctor.reschedule_url_template, apt.id),
        isOverflow,
      };

      const body =
        template === 'slot_to_queue' ? slotToQueueTemplate(vars) :
        template === 'queue_to_slot_regular' ? queueToSlotRegularTemplate(vars) :
        queueToSlotOverflowTemplate(vars);

      await sendPatientNotification({
        patientId: apt.patient_id,
        patientPhone: apt.patients?.phone_e164,
        body,
        channel: 'sms', // or whatever the project's default is; instagram fallback handled by the primitive
        correlationId: payloadJson.correlation_id as string | undefined,
      });
    }
  }
  ```

  *(Adjust query syntax, table names, and helper imports to match the project. The structure is fixed; the field names follow whatever convention exists.)*

### Step 7 — Tests

- [ ] **Unit tests** for the template selectors:

  Create `backend/tests/unit/services/opd-mode-conversion-templates.test.ts`:

  - `pickTemplate('queue', 'slot', false)` → `'slot_to_queue'`.
  - `pickTemplate('slot', 'queue', false)` → `'queue_to_slot_regular'`.
  - `pickTemplate('slot', 'queue', true)` → `'queue_to_slot_overflow'`.
  - Snapshot-test each template output with a fixed `vars` object (locks the exact copy).

- [ ] **Integration tests** for the drainer:

  Create `backend/tests/integration/services/opd-mode-notifications-service.test.ts`:

  1. **Single flip, debounce elapsed** — write a pending row with `scheduled_for = now() - 1s`. Run drainer. Assert: dispatch called with the right templates; pending row deleted; audit row's `notification_dispatched = true`.
  2. **Single flip, debounce NOT elapsed** — `scheduled_for = now() + 4 min`. Run drainer. Assert: no dispatch; pending row still present.
  3. **30-min ceiling** — pending row with `first_flip_at = now() - 31 min` and `scheduled_for = now() + 5 min` (the doctor flipped at minute 25 again). Run drainer. Assert: dispatch fires regardless of `scheduled_for`.
  4. **Net-zero flip** — write a pending row with `first_flip_mode = 'slot', latest_flip_mode = 'queue'`. Then call the conversion service to flip back to `'slot'`. Assert: pending row is deleted (net-zero detected). Run drainer. Assert: no dispatch happens.
  5. **Dispatcher idempotency** — same patient appears in 2 conversion windows. Each dispatch is a separate SMS; no deduplication required (it's the doctor's choice to flip multiple times).

### Step 8 — Verification

- [ ] `pnpm --filter backend tsc --noEmit` clean.
- [ ] `pnpm --filter backend lint` clean.
- [ ] `pnpm --filter backend test -- opd-mode-notification` all green.
- [ ] **Cron registration smoke** — start the backend; verify the cron registers a 60s job. Logs should show `[opd-mode-notifications-cron] dispatched 0 batches, skipped 0` (silent unless dispatches happen).
- [ ] **End-to-end smoke (manual):**
  1. Flip a fixture day with 2 patients. Verify a pending row exists in `doctor_opd_pending_mode_notifications`.
  2. Wait 6 minutes (or fast-forward `scheduled_for` to the past in the DB).
  3. Wait for the next cron tick (≤ 60s).
  4. Verify: 2 SMS / IG messages sent (check the notification log table or the mocked notification primitive); pending row is gone; audit row's `notification_dispatched = true`.

---

## Out of scope

- **Reschedule deep-link handling** — the templates include `Reschedule: <url>` but the URL is built from the doctor's existing `reschedule_url_template`. Wiring a new public reschedule endpoint is a separate batch.
- **Per-locale templates** — PD-D6 deferred. English-only in this batch.
- **Doctor-customisable copy** — PD-D6 deferred.
- **Dead-letter queue for failed dispatches** — log loudly + retry next tick; no dedicated table for repeatedly-failing rows.
- **Real-time WebSocket push notification** — out of scope; SMS / IG / push via existing primitive.
- **Notification preview UI** — doctors don't get to preview the exact wording (the templates are project-wide); pdm-08's `<ModeScheduleEditor>` doesn't surface them.

---

## Files expected to touch

**New:**

- `backend/migrations/101_opd_pending_mode_notifications.sql` (~50 LOC).
- `backend/src/services/opd/opd-mode-notifications-service.ts` (~80 LOC — drainer).
- `backend/src/services/opd/opd-mode-conversion-templates.ts` (~80 LOC — 3 templates + picker).
- `backend/src/services/opd/opd-mode-notification-dispatcher.ts` (~100 LOC — affected-patient loader + dispatch).
- `backend/src/workers/opd-mode-notifications-cron.ts` (~30 LOC — cron entry).
- `backend/tests/unit/services/opd-mode-conversion-templates.test.ts` (~80 LOC).
- `backend/tests/integration/services/opd-mode-notifications-service.test.ts` (~200 LOC — 5 fixtures).

**Modified:**

- `backend/src/services/opd/opd-mode-conversion-service.ts` (~40 LOC delta — un-gate the upsert, add `detectNetZeroFlip` helper).
- `backend/src/index.ts` (~3 LOC delta — register the cron entry).
- `backend/src/types/database.ts` (regenerated — adds `doctor_opd_pending_mode_notifications` table row).

---

## Notes / open decisions

1. **Why not RLS the pending table at all?** Because the service role is the only writer / reader. RLS without a policy with `ENABLE ROW LEVEL SECURITY` denies all access by default — which is what we want for everyone except service role. The `ALTER TABLE … ENABLE ROW LEVEL SECURITY` line locks it.
2. **Why `scheduled_for` as a timestamp instead of `first_flip_at + interval`?** Two reasons. (a) The 30-min ceiling needs `first_flip_at` separately; keeping both columns is clearer than a derived expression. (b) `scheduled_for` is the cron's primary filter — having it indexed is cheap.
3. **What if the drainer is paused for > 30 min (e.g., a deploy)?** When it resumes, every pending row with `first_flip_at + 30 min < now()` dispatches in one batch. The 30-min ceiling is a guarantee against starvation, not a strict SLA.
4. **What if the same patient is on 2 different doctors who both flip the same day?** Two separate notifications. Each `(doctor, date)` is a separate batch. Acceptable — doctors are independent.
5. **What if the patient has multiple appointments on the same day with the same doctor (rare but possible)?** Each appointment gets its own template render; the patient may receive multiple SMS. Deduplication would require knowing the patient's notification preferences — out of scope.
6. **How does the dispatcher format dates in the doctor's TZ?** Use the existing `formatInDoctorTZ` helper (verify it exists in `backend/src/utils/dates.ts` or similar). If it doesn't exist, build a simple wrapper around `Intl.DateTimeFormat` with the doctor's IANA TZ string from `doctors.timezone`.
7. **What if `doctor.timezone` is null?** Default to `'Asia/Kolkata'` (the project's primary TZ per existing precedents). Document the fallback.
8. **`notification_dispatched = true` flips after dispatch** — but the dispatch could partially fail (some SMS sent, some failed). Should `notification_dispatched` be `true` only if **all** patients were notified? Pragmatic answer: flip to `true` after the for-loop completes regardless of per-message failures. The dispatcher logs per-failure; support can diagnose specific patients via the notification log. The audit-level boolean tracks "did we attempt the dispatch?", not "did every patient receive it?".

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:**
  - `backend/migrations/100_opd_session_modes.sql` — sibling table shape.
  - `backend/src/services/notification-service.ts` (or the project's patient-notification primitive — verify the actual name).
- **Source decisions:** [Product plans/plan-opd-per-day-mode.md § DL-5, DL-6, PD-Q2](../../../Product%20plans/plan-opd-per-day-mode.md).
- **Wave gate:** [`EXECUTION-ORDER-opd-per-day-mode.md` § Wave 3 gate](./EXECUTION-ORDER-opd-per-day-mode.md#wave-3-gate-after-pdm-06).
- **Previous task:** [`task-pdm-05-conversion-preview-dialog.md`](./task-pdm-05-conversion-preview-dialog.md).
- **Next task:** [`task-pdm-07-mode-policy-resolver-and-booking-integration.md`](./task-pdm-07-mode-policy-resolver-and-booking-integration.md).

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
