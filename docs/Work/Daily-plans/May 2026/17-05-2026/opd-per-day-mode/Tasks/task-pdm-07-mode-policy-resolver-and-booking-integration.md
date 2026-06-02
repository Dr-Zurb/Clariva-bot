# Task pdm-07: Mode-policy resolver + public booking widget integration

## 17 May 2026 — Batch [OPD Per-Day Mode](../plan-opd-per-day-mode-batch.md) — Wave 4, Lane α step 0 — **M, ~6h**

---

## Task overview

Ship the policy half of the resolver hierarchy + reroute the public booking flow through it. Concretely:

1. **`resolveModePolicyForDate(supabase, doctorId, date) → OpdMode | null`** — implements the DL-9 hierarchy inside the existing `mode_schedule` JSONB stored under `doctor_settings.opd_policies.mode_schedule`. Returns `null` when no policy rule matches (cascade continues to `doctor_settings.opd_mode` per pdm-02's resolver).
2. **`resolveModePolicyForDateRange(supabase, doctorId, from, to) → Record<date, OpdMode | null>`** — bulk variant. One DB read of `doctor_settings.opd_policies`, then iterate dates in JS. Drives the public booking widget's 30-day picker.
3. **JSONB validator** — accepts the schema in DL-9, rejects `to`-less ranges. Past-dated rules are accepted (PD-Q8); the visible warning lives in pdm-08's settings UI, not in the validator.
4. **Replace `resolveModePolicyForDateStub` in pdm-02's resolver** with the real implementation.
5. **Public booking flow rewiring** — `backend/src/controllers/booking-controller.ts` (or wherever the public booking endpoint lives) calls `resolveModePolicyForDate(date)` for the **target booking date** instead of `getDoctorOpdMode(doctorId)`. Same change in `backend/src/services/slot-selection-service.ts`.
6. **New public endpoint `GET /api/v1/public/doctors/:id/mode-schedule?from=&to=`** — returns the bulk resolver map for the booking widget's date picker. No auth (matches the existing public booking endpoints' shape).
7. **Materialisation on first booking** — when a new appointment lands on a date with no existing fact row, write a `doctor_opd_session_modes` row with `source: 'policy_default'` and `mode: resolveModePolicyForDate(date)` (falling back to `doctor_settings.opd_mode` if the resolver returns null, then `'slot'` as the ultimate default). This closes DL-10.

**Estimated time:** ~6h (1.5h resolver implementation + validator, 1h tests, 1h booking-flow rewiring, 1h public endpoint + controller, 30min materialisation hook in appointment-service, 1h verification).

**Status:** Pending.

**Hard deps:** pdm-02 (the stub function exists; replacing it is the contract).

**Source:** [plan-opd-per-day-mode-batch.md § Wave 4](../plan-opd-per-day-mode-batch.md#wave-4--mode-scheduling-policy--booking-widget-integration-2-tasks-14h-single-sequential-lane) + `S1.6` and `DL-9` + `DL-10` + `DL-16` + `PD-Q8` in [Product plans/plan-opd-per-day-mode.md](../../../Product%20plans/plan-opd-per-day-mode.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) TL;DR rule #1. The resolver hierarchy is fully specified in DL-9; nothing to invent. Validator is a 30-LOC schema check. Booking-flow rewiring is a one-line substitution at known callsites. **Not on the hard-rules list** (no PHI, no RLS changes, no audit-log path).

**Per-message escalation rule:** if Auto stalls on the date-range expansion for `resolveModePolicyForDateRange` (date arithmetic across DST boundaries can confuse models), escalate that **one message** to Opus 4.7 Extra High.

**Manual-Sonnet fallback:** only if A/B-testing.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `backend/src/services/opd/opd-mode-service.ts` (post-pdm-02 — where the resolver lands; the stub is the contract).
- `backend/src/services/doctor-settings-service.ts` (`getDoctorSettings` — used to load the JSONB).
- `backend/src/types/doctor-settings.ts` (`OpdMode` type + `opd_policies` shape).
- `backend/src/utils/validation.ts` (project's validator helpers — Zod or hand-rolled).
- `backend/src/controllers/booking-controller.ts` (the public booking flow that needs rewiring).
- `backend/src/services/slot-selection-service.ts` (the slot-selection service that consults `opdMode`).
- `backend/src/services/appointment-service.ts` (the `createAppointment` path — where the materialisation hook lands).
- `backend/src/routes/api/v1/public.ts` (or wherever the public booking endpoints are registered — the new mode-schedule endpoint mounts here).
- Source plan §DL-9, §DL-10, §DL-16, §PD-Q8, §risk register row 7 (bulk resolver).

**Estimated turns:** 4–6 turns (1 resolver + bulk + validator, 1 booking-flow rewiring, 1 public endpoint + materialisation, 1 tests, 1 verification).

---

## Acceptance criteria

### Step 1 — `ModeSchedule` JSONB type definition

- [ ] Add to `backend/src/types/doctor-settings.ts` (or wherever `OpdMode` lives):

  ```ts
  export interface ModeScheduleWeeklyOverrides {
    mon?: OpdMode;
    tue?: OpdMode;
    wed?: OpdMode;
    thu?: OpdMode;
    fri?: OpdMode;
    sat?: OpdMode;
    sun?: OpdMode;
  }

  export interface ModeScheduleDateRangeOverride {
    /** YYYY-MM-DD, inclusive */
    from: string;
    /** YYYY-MM-DD, inclusive — required per DL-9 (no open-ended ranges) */
    to: string;
    mode: OpdMode;
  }

  export interface ModeScheduleDateOverride {
    /** YYYY-MM-DD */
    date: string;
    mode: OpdMode;
  }

  export interface ModeSchedule {
    /** Ultimate fallback for unmatched dates */
    default_mode?: OpdMode;
    /** Day-of-week defaults (in doctor's TZ) */
    weekly_overrides?: ModeScheduleWeeklyOverrides;
    /** Inclusive date-range rules, drag-to-reorder; LATER entry wins on overlap */
    date_range_overrides?: ModeScheduleDateRangeOverride[];
    /** Single-date rules, drag-to-reorder; LATER entry wins on overlap */
    date_overrides?: ModeScheduleDateOverride[];
  }

  // Extend OpdPoliciesShape (or similar existing type — verify name)
  export interface OpdPoliciesShape {
    slot_join_grace_minutes?: number;
    reschedule_payment_policy?: 'forfeit' | 'transfer_entitlement';
    queue_reinsert_default?: 'end_of_queue' | 'after_current';
    mode_schedule?: ModeSchedule;
    // ... other existing keys
  }
  ```

  *(If `OpdPoliciesShape` doesn't exist as a named type — i.e., `opd_policies` is typed as `Record<string, unknown>` in places — define `ModeSchedule` and reference it via a narrowing helper. The `opd-policy-service.ts` `policiesObject(settings)` precedent is the model.)*

### Step 2 — `resolveModePolicyForDate` implementation

- [ ] In `backend/src/services/opd/opd-mode-service.ts`, **replace the stub from pdm-02** with the real implementation:

  ```ts
  import type { ModeSchedule, ModeScheduleDateRangeOverride, ModeScheduleDateOverride, OpdMode } from '../../types/doctor-settings';
  import { getDoctorSettings, getDoctorTimezone } from '../doctor-settings-service';

  /**
   * Resolve the mode dictated by doctor_settings.opd_policies.mode_schedule
   * for a given (doctor, date). Returns null if no rule matches; caller
   * (resolveSessionDayMode) cascades to doctor_settings.opd_mode then 'slot'.
   *
   * Order of precedence (DL-9):
   *   1. date_overrides (last-in-array wins on duplicate match)
   *   2. date_range_overrides (last-in-array wins on overlap match)
   *   3. weekly_overrides[weekday-in-doctor-TZ]
   *   4. default_mode
   *   5. null (no policy applies)
   */
  export async function resolveModePolicyForDate(
    supabase: SupabaseAdmin,
    doctorId: string,
    date: string, // YYYY-MM-DD
  ): Promise<OpdMode | null> {
    const settings = await getDoctorSettings(doctorId);
    const policies = settings?.opd_policies as Record<string, unknown> | null | undefined;
    const schedule = (policies?.mode_schedule ?? null) as ModeSchedule | null;
    if (!schedule) return null;

    // 1. date_overrides — last-in-array wins
    if (schedule.date_overrides) {
      const matches = schedule.date_overrides.filter((o) => o.date === date);
      if (matches.length > 0) {
        return matches[matches.length - 1].mode;
      }
    }

    // 2. date_range_overrides — last-in-array wins, inclusive bounds
    if (schedule.date_range_overrides) {
      const matches = schedule.date_range_overrides.filter(
        (r) => r.from <= date && date <= r.to,
      );
      if (matches.length > 0) {
        return matches[matches.length - 1].mode;
      }
    }

    // 3. weekly_overrides — doctor TZ
    if (schedule.weekly_overrides) {
      const timezone = await getDoctorTimezone(doctorId);
      const weekday = getWeekdayInTz(date, timezone); // 'mon' | 'tue' | ...
      const weekdayMode = schedule.weekly_overrides[weekday];
      if (weekdayMode) return weekdayMode;
    }

    // 4. default_mode
    if (schedule.default_mode) {
      return schedule.default_mode;
    }

    return null;
  }

  function getWeekdayInTz(date: string, tz: string): 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' {
    // Compute the weekday at noon local time on the given date (noon avoids DST edges).
    const dt = new Date(`${date}T12:00:00`); // ISO parse in UTC
    const formatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz });
    const short = formatter.format(dt).toLowerCase().slice(0, 3);
    // Maps 'mon' / 'tue' / etc. directly; defensive throw on unknown
    if (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(short)) {
      return short as 'mon';
    }
    throw new Error(`Unexpected weekday short form: ${short}`);
  }
  ```

- [ ] **Wire `resolveModePolicyForDate` into `resolveSessionDayMode`** (replacing the stub):

  ```ts
  // In resolveSessionDayMode, replace the stub call with:
  const policyMode = await resolveModePolicyForDate(supabase, doctorId, date);
  if (policyMode) {
    return { mode: policyMode, source: 'policy', changeCount: 0 };
  }
  ```

  Remove the `resolveModePolicyForDateStub` function entirely.

### Step 3 — `resolveModePolicyForDateRange` bulk variant

- [ ] Add to the same file:

  ```ts
  /**
   * Bulk variant: returns a map from YYYY-MM-DD to resolved mode (or null) for
   * each date in [from, to] inclusive. One settings read; iterate in JS.
   *
   * Used by the public booking widget's date picker (DL-16) to render the
   * mode for each pickable date.
   */
  export async function resolveModePolicyForDateRange(
    supabase: SupabaseAdmin,
    doctorId: string,
    fromDate: string,
    toDate: string,
  ): Promise<Record<string, OpdMode | null>> {
    if (fromDate > toDate) {
      throw new Error(`resolveModePolicyForDateRange: from (${fromDate}) > to (${toDate})`);
    }

    const settings = await getDoctorSettings(doctorId);
    const policies = settings?.opd_policies as Record<string, unknown> | null | undefined;
    const schedule = (policies?.mode_schedule ?? null) as ModeSchedule | null;
    const timezone = await getDoctorTimezone(doctorId);

    const result: Record<string, OpdMode | null> = {};
    let cursor = new Date(`${fromDate}T12:00:00Z`);
    const end = new Date(`${toDate}T12:00:00Z`);

    while (cursor <= end) {
      const ymd = cursor.toISOString().slice(0, 10);
      result[ymd] = resolveOneDate(schedule, ymd, timezone);
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }

    return result;
  }

  // Pure helper, also useful for the materialisation path (Step 6).
  export function resolveOneDate(schedule: ModeSchedule | null, date: string, timezone: string): OpdMode | null {
    if (!schedule) return null;

    if (schedule.date_overrides) {
      const matches = schedule.date_overrides.filter((o) => o.date === date);
      if (matches.length > 0) return matches[matches.length - 1].mode;
    }
    if (schedule.date_range_overrides) {
      const matches = schedule.date_range_overrides.filter((r) => r.from <= date && date <= r.to);
      if (matches.length > 0) return matches[matches.length - 1].mode;
    }
    if (schedule.weekly_overrides) {
      const weekday = getWeekdayInTz(date, timezone);
      const weekdayMode = schedule.weekly_overrides[weekday];
      if (weekdayMode) return weekdayMode;
    }
    if (schedule.default_mode) return schedule.default_mode;
    return null;
  }
  ```

- [ ] **Range cap** — refuse `from-to` ranges longer than 60 days to prevent abuse:

  ```ts
  const daySpan = (new Date(toDate).getTime() - new Date(fromDate).getTime()) / (24 * 60 * 60 * 1000);
  if (daySpan > 60) {
    throw new ValidationError('mode-schedule range cannot exceed 60 days');
  }
  ```

### Step 4 — JSONB validator

- [ ] Add to `backend/src/utils/validation.ts` (or wherever the existing settings validators live):

  ```ts
  export function validateModeSchedule(input: unknown): { ok: true; value: ModeSchedule } | { ok: false; error: string } {
    if (input === null || input === undefined) return { ok: true, value: {} };
    if (typeof input !== 'object' || Array.isArray(input)) {
      return { ok: false, error: 'mode_schedule must be an object' };
    }
    const obj = input as Record<string, unknown>;

    // default_mode
    if (obj.default_mode !== undefined && obj.default_mode !== 'slot' && obj.default_mode !== 'queue') {
      return { ok: false, error: 'default_mode must be "slot" or "queue"' };
    }

    // weekly_overrides
    if (obj.weekly_overrides !== undefined) {
      if (typeof obj.weekly_overrides !== 'object' || Array.isArray(obj.weekly_overrides)) {
        return { ok: false, error: 'weekly_overrides must be an object' };
      }
      const wd = obj.weekly_overrides as Record<string, unknown>;
      for (const key of Object.keys(wd)) {
        if (!['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(key)) {
          return { ok: false, error: `weekly_overrides has unknown key: ${key}` };
        }
        if (wd[key] !== 'slot' && wd[key] !== 'queue') {
          return { ok: false, error: `weekly_overrides[${key}] must be "slot" or "queue"` };
        }
      }
    }

    // date_range_overrides — `to` REQUIRED per DL-9
    if (obj.date_range_overrides !== undefined) {
      if (!Array.isArray(obj.date_range_overrides)) {
        return { ok: false, error: 'date_range_overrides must be an array' };
      }
      for (let i = 0; i < obj.date_range_overrides.length; i += 1) {
        const r = obj.date_range_overrides[i] as Record<string, unknown>;
        if (typeof r.from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.from)) {
          return { ok: false, error: `date_range_overrides[${i}].from must be YYYY-MM-DD` };
        }
        if (typeof r.to !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.to)) {
          return { ok: false, error: `date_range_overrides[${i}].to is required (DL-9: no open-ended ranges; use default_mode for forever-from-X)` };
        }
        if (r.from > r.to) {
          return { ok: false, error: `date_range_overrides[${i}].from > .to` };
        }
        if (r.mode !== 'slot' && r.mode !== 'queue') {
          return { ok: false, error: `date_range_overrides[${i}].mode must be "slot" or "queue"` };
        }
      }
    }

    // date_overrides
    if (obj.date_overrides !== undefined) {
      if (!Array.isArray(obj.date_overrides)) {
        return { ok: false, error: 'date_overrides must be an array' };
      }
      for (let i = 0; i < obj.date_overrides.length; i += 1) {
        const d = obj.date_overrides[i] as Record<string, unknown>;
        if (typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) {
          return { ok: false, error: `date_overrides[${i}].date must be YYYY-MM-DD` };
        }
        if (d.mode !== 'slot' && d.mode !== 'queue') {
          return { ok: false, error: `date_overrides[${i}].mode must be "slot" or "queue"` };
        }
      }
    }

    return { ok: true, value: obj as ModeSchedule };
  }
  ```

- [ ] **Wire the validator into the settings PUT endpoint.** In `backend/src/routes/api/v1/settings/doctor.ts` (or the equivalent), find the handler that accepts `opd_policies` updates. Validate the incoming `mode_schedule` sub-object and reject with 400 if invalid.

  *(If today's settings PUT accepts `opd_policies` as opaque JSON, this task adds the first structured validation. pdm-08's UI calls the endpoint with valid shapes; the validator is the safety net for direct API consumers.)*

- [ ] **PD-Q8 — past-dated rules are accepted.** The validator does NOT check `date >= today` — that's the editor's job to advise about, not block. The advisory line lives in pdm-08.

### Step 5 — Public endpoint `GET /api/v1/public/doctors/:id/mode-schedule`

- [ ] **Route:** in `backend/src/routes/api/v1/public.ts` (or wherever public booking endpoints live):

  ```ts
  router.get('/doctors/:id/mode-schedule', getPublicDoctorModeSchedule);
  ```

  No auth required. The bulk resolver doesn't expose anything sensitive (just `{ '2026-05-20': 'slot', '2026-05-21': 'queue', ... }`).

- [ ] **Controller:**

  ```ts
  export async function getPublicDoctorModeSchedule(req: Request, res: Response) {
    const { id } = req.params;
    const { from, to } = req.query;
    if (typeof from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      return res.status(400).json({ error: 'Query param `from` (YYYY-MM-DD) is required.' });
    }
    if (typeof to !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({ error: 'Query param `to` (YYYY-MM-DD) is required.' });
    }

    try {
      const map = await resolveModePolicyForDateRange(supabaseAdmin, id, from, to);
      return res.json({ doctorId: id, from, to, modeByDate: map });
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
  }
  ```

- [ ] **Rate-limit** (defensive — public endpoint): if the project has a rate-limiter (likely; check `backend/src/middleware/rate-limit.ts`), wire it on this route with a generous limit (e.g., 30 req/min per IP). If no project-wide rate-limiter exists, document the gap for a future security batch.

### Step 6 — Materialisation hook in `appointment-service.ts`

- [ ] **Find the `createAppointment` path** (or the equivalent — possibly `confirmAppointmentBooking`). It's the path that runs after payment confirmation lands a booking. Add a post-write step that materialises the fact row if it doesn't exist:

  ```ts
  // After the appointment row is created:
  const sessionDate = appointment.appointment_date.slice(0, 10);

  // Idempotent: only insert if no fact row exists.
  const { data: existing } = await supabase
    .from('doctor_opd_session_modes')
    .select('mode')
    .eq('doctor_id', appointment.doctor_id)
    .eq('session_date', sessionDate)
    .maybeSingle();

  if (!existing) {
    const resolved = await resolveSessionDayMode(supabase, appointment.doctor_id, sessionDate);
    // resolved.mode is the right mode regardless of which fallback fired.
    await supabase
      .from('doctor_opd_session_modes')
      .insert({
        doctor_id: appointment.doctor_id,
        session_date: sessionDate,
        mode: resolved.mode,
        source: 'policy_default',
        change_count: 0,
        changed_at: new Date().toISOString(),
      })
      .onConflict('doctor_id,session_date').doNothing(); // race-safe; concurrent first-booking writes don't break
  }
  ```

  **Why call `resolveSessionDayMode` (not just `resolveModePolicyForDate`)?** Because we want the canonical cascade — the function already handles "policy → doctor_settings → 'slot'" correctly. The materialisation writes whichever the cascade lands on.

- [ ] **Verify this doesn't cause issues when a booking arrives mid-conversion.** pdm-04's advisory lock guards the conversion transaction; the booking write isn't gated by that lock (it's a separate path). However, the booking arrives via the booking controller, which can OPTIONALLY also acquire the lock to serialise — discuss in the Opus chat. Pragmatic: don't acquire the lock from the booking path; the materialisation is idempotent (the `ON CONFLICT DO NOTHING` handles the race), so the worst case is a stale `mode` value briefly, corrected on the next read.

### Step 7 — Booking-flow rewiring

- [ ] In `backend/src/controllers/booking-controller.ts` (and `backend/src/services/slot-selection-service.ts` if it also reads mode), find every callsite of `getDoctorOpdMode(doctorId)` and replace with `resolveSessionDayMode(supabase, doctorId, targetBookingDate)`:

  ```ts
  // Before:
  const opdMode = await getDoctorOpdMode(doctorId);
  if (opdMode === 'slot') { /* ... show slot grid ... */ }

  // After:
  const resolved = await resolveSessionDayMode(supabaseAdmin, doctorId, targetBookingDate);
  if (resolved.mode === 'slot') { /* ... show slot grid ... */ }
  ```

  - `targetBookingDate` is whatever the booking endpoint receives as the user-selected date. If the booking endpoint accepts a date range (e.g., for a slot list), use the bulk resolver instead and key by date.

- [ ] **Grep verification:**

  ```bash
  rg "getDoctorOpdMode\b" backend/src/controllers/booking-controller.ts backend/src/services/slot-selection-service.ts
  # Expected: zero matches (or only one if a non-booking code path still legitimately uses it).
  ```

  Document any retained callsites in the PR description.

### Step 8 — Tests

- [ ] **Unit tests for `resolveOneDate` (pure)** in `backend/tests/unit/services/opd-mode-policy-resolver.test.ts`:

  Cover all six DL-9 hierarchy levels:

  1. `date_overrides` match → returns its mode.
  2. `date_overrides` duplicate matches → returns last-in-array mode.
  3. `date_range_overrides` match (no date_override) → returns its mode.
  4. `date_range_overrides` overlap (two ranges cover the same date) → returns last-in-array mode.
  5. `weekly_overrides[weekday]` match (no overrides) → returns weekday mode.
  6. `default_mode` only → returns it.
  7. Empty schedule → returns `null`.
  8. `date_override` + `weekly_override` for same date → `date_override` wins.

- [ ] **Validator tests** in `backend/tests/unit/utils/validate-mode-schedule.test.ts`:

  - Empty object → ok.
  - `default_mode: 'invalid'` → error.
  - `date_range_overrides` with missing `to` → error referencing DL-9.
  - `date_range_overrides` with `from > to` → error.
  - `date_overrides` with invalid date format → error.
  - Past-dated `date_override` → ok (PD-Q8: validator does NOT block).

- [ ] **Bulk resolver tests** in `backend/tests/unit/services/opd-mode-policy-resolver.test.ts`:

  - 7-day range with `weekly_overrides.tue = 'queue'` → result map has `'queue'` on Tuesday, `null` on other days.
  - 60-day range → succeeds.
  - 61-day range → throws `ValidationError`.

- [ ] **Integration test for the public endpoint** in `backend/tests/integration/api/public-doctor-mode-schedule.test.ts`:

  - Doctor with `weekly_overrides.tue = 'queue'` → `GET /doctors/:id/mode-schedule?from=2026-05-18&to=2026-05-24` returns `{ '2026-05-19': 'queue', /* other days null */ }`.
  - No `mode_schedule` policy → all dates return `null`.
  - 61-day range → 400 error.

### Step 9 — Verification

- [ ] `pnpm --filter backend tsc --noEmit` clean.
- [ ] `pnpm --filter backend lint` clean.
- [ ] `pnpm --filter backend test -- opd-mode-policy-resolver` all green.
- [ ] `pnpm --filter backend test -- validate-mode-schedule` all green.
- [ ] **Public booking smoke** — as an unauthenticated user, hit the booking flow for a doctor with `weekly_overrides.tue = 'queue'`. Pick a future Tuesday. Verify the response renders the queue token-request shape, not the slot grid.
- [ ] **Materialisation smoke** — book an appointment for a doctor on a future date with no fact row. Verify `doctor_opd_session_modes` has a new row with `source: 'policy_default'` after the booking.
- [ ] **`rg` checks:**

  ```bash
  rg "resolveModePolicyForDate(\b|\()" backend/src/services/opd/
  # Expected: definition + bulk variant + 1 internal use in resolveSessionDayMode.

  rg "resolveModePolicyForDateStub" backend/src/
  # Expected: zero matches — the stub is gone.

  rg "getDoctorOpdMode\b" backend/src/controllers/booking-controller.ts backend/src/services/slot-selection-service.ts
  # Expected: zero matches.

  rg "resolveSessionDayMode" backend/src/controllers/booking-controller.ts
  # Expected: at least one match.
  ```

---

## Out of scope

- **Settings UI** — pdm-08. The validator exists; the editor is the next task.
- **Calendar viz of upcoming modes** — PD-D3 deferred.
- **RRULE-style recurrence** — PD-D7 deferred.
- **Per-service mode constraints** — PD-D5 deferred.
- **Patient-facing display of "this doctor is in queue mode today"** — outside the booking flow; existing patient UI doesn't need this surface.
- **Caching the resolver result** — at this scale, one settings read per booking is fine. If the booking widget's 30-day picker becomes a hot path, cache `getDoctorSettings(doctorId)` for ~60s.
- **Removing `getDoctorOpdMode` from the codebase** — keep it; it still serves non-booking callsites (if any). PD-D4 covers final cleanup.

---

## Files expected to touch

**New:**

- `backend/tests/unit/services/opd-mode-policy-resolver.test.ts` (~200 LOC — 8 hierarchy cases + bulk).
- `backend/tests/unit/utils/validate-mode-schedule.test.ts` (~80 LOC — 6 cases).
- `backend/tests/integration/api/public-doctor-mode-schedule.test.ts` (~80 LOC — 3 cases).

**Modified:**

- `backend/src/services/opd/opd-mode-service.ts` (~150 LOC delta — `resolveModePolicyForDate` + `resolveModePolicyForDateRange` + `resolveOneDate` + `getWeekdayInTz`; remove stub).
- `backend/src/types/doctor-settings.ts` (~40 LOC delta — `ModeSchedule` types).
- `backend/src/utils/validation.ts` (~80 LOC delta — `validateModeSchedule`).
- `backend/src/controllers/booking-controller.ts` (~5–15 LOC delta — replace `getDoctorOpdMode` with `resolveSessionDayMode`; date-aware).
- `backend/src/services/slot-selection-service.ts` (~5–15 LOC delta — same swap).
- `backend/src/services/appointment-service.ts` (~25 LOC delta — materialisation hook on appointment creation).
- `backend/src/routes/api/v1/public.ts` (~3 LOC delta — new mode-schedule route).
- `backend/src/controllers/public-doctor-controller.ts` (new file? or extend existing — depends on the project; ~50 LOC).
- `backend/src/routes/api/v1/settings/doctor.ts` (~10 LOC delta — wire `validateModeSchedule` into the PUT handler).

---

## Notes / open decisions

1. **Why "last-in-array wins" for overlaps?** DL-9. The settings UI (pdm-08) exposes drag-to-reorder; the doctor's mental model is "the rule I dragged to the bottom is the one that wins on conflict". No `updated_at` per entry needed.
2. **Why is `weekly_overrides` keyed by `mon`/`tue` instead of `0`/`1`?** Human-readable in the JSONB blob (which support agents read directly). Strings are also stable across Node's Date / Intl APIs.
3. **TZ handling — what if the doctor moves countries?** `doctors.timezone` is the source of truth; if it changes, future resolves use the new TZ. Historical fact rows (already materialised) are pinned to the mode they were materialised with — they don't retroactively change.
4. **What if `doctor_settings.opd_policies` is null entirely?** `policies?.mode_schedule` is null, schedule is null, resolver returns null, cascade falls through to `doctor_settings.opd_mode`. Today's behaviour preserved.
5. **What if a doctor has `default_mode = 'slot'` AND `doctor_settings.opd_mode = 'queue'`?** The resolver returns `'slot'` (policy beats column). The risk-register entry "drift between column and policy" addresses this via pdm-08's one-time mirror on first edit. Acceptable.
6. **What if the booking widget asks for a 1-year range?** Rejected with 400 (60-day cap). The widget should paginate.
7. **PD-Q8 — why doesn't the validator reject past-dated rules?** Because PD-Q8 says: *"The rule still saves and still applies forward — we only correct the doctor's mental model, not their input."* The settings editor (pdm-08) renders the advisory; the validator stays input-honest.
8. **What if a doctor types `2026-13-99` as a date override?** The regex `/^\d{4}-\d{2}-\d{2}$/` accepts impossible dates; Postgres / `new Date(...)` would parse them as invalid. Add a defensive `new Date(d.date).toString() === 'Invalid Date'` check? Defer: the regex catches 99% of typos, and the resolver's date-comparison logic doesn't crash on impossible dates (string compare is well-defined). Document the small gap.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:**
  - `backend/src/services/opd/opd-mode-service.ts` (post-pdm-02 stub).
  - `backend/src/services/doctor-settings-service.ts` — `getDoctorSettings`, `getDoctorTimezone`.
- **Source decisions:** [Product plans/plan-opd-per-day-mode.md § DL-9, DL-10, DL-16, PD-Q8](../../../Product%20plans/plan-opd-per-day-mode.md).
- **Wave gate:** [`EXECUTION-ORDER-opd-per-day-mode.md` § Wave 4 gate](./EXECUTION-ORDER-opd-per-day-mode.md#wave-4-gate-after-pdm-08).
- **Previous task:** [`task-pdm-06-notifications-debounce-dispatch.md`](./task-pdm-06-notifications-debounce-dispatch.md).
- **Next task:** [`task-pdm-08-mode-schedule-settings-ui.md`](./task-pdm-08-mode-schedule-settings-ui.md) — fresh chat (Auto).

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
