# Task sl-01: Slot session snapshot endpoint (backend)

## 15 May 2026 — Batch [OPD Slot Hub](../plan-opd-slot-hub-batch.md) — Wave 1, Lane α step 0 — **M, ~4h**

---

## Task overview

Land the backend endpoint that the slot-mode hub UI consumes. Mirror the queue-mode predecessor `listDoctorQueueSession` in `backend/src/services/opd-doctor-service.ts` for query budget, ownership semantics, and PHI-handling pattern. Server-derive `slotStatus` per [DL-3](../../../../Product%20plans/plan-opd-slot-hub.md#decision-locks-dl-1--dl-12) so the chip counts the doctor sees match what the patient sees on their own snapshot.

**Endpoint:** `GET /api/v1/opd/slot-session?date=YYYY-MM-DD`

**Response shape (success):**

```ts
{
  data: {
    entries: SlotSessionRow[],
    counts: {
      all: number;
      upcoming: number;       // includes 'grace'
      running_late: number;
      in_consultation: number;
      completed: number;
      missed: number;
      cancelled: number;      // not surfaced as a chip; URL-only
      overflow: number;       // sub-state badge; not a chip
    },
    snapshotAt: string;       // ISO; client uses this for the "now" divider
    date: string;             // echoes the YYYY-MM-DD input
  }
}
```

Per [DL-11](../../../../Product%20plans/plan-opd-slot-hub.md#decision-locks-dl-1--dl-12): **no DB migration**. Every input field already exists.

**Estimated time:** ~4h (1h types + service skeleton, 1.5h derivation logic + unit tests, 0.5h route + controller + validator, 0.5h frontend types + API helper, 0.5h smoke + verification).

**Status:** Pending.

**Hard deps:** none.

**Source:** [plan-opd-slot-hub-batch.md § Wave 1](../plan-opd-slot-hub-batch.md#wave-1--backend-foundation-1-task-4h-single-sequential-lane) + `S1.1` and `DL-2` / `DL-3` / `DL-10` / `DL-11` in [Product plans/plan-opd-slot-hub.md](../../../../Product%20plans/plan-opd-slot-hub.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) TL;DR rule #1 — Auto is the execution default; it draws from the cheaper Auto+Composer pool ($1.25 / $6.00 per M tokens) and matches Sonnet 4.5/4.6 quality on bounded, well-spec'd backend work like this. **Not on the hard-rules list:** no `auth.uid()` change, no RLS policy change, no PHI column added, no new migration, no audit-log path. Reuses existing doctor-scoped ownership patterns from `listDoctorQueueSession`.

**Per-message escalation rule:** if Auto stalls on a single message (asks the same clarifying question twice, or ships code that fails type-check on a non-obvious error), escalate that **one message** to Opus 4.7 Extra High via the per-message picker. Don't switch the whole chat to manual Sonnet — that drains the API pool for no quality gain.

**Manual-Sonnet fallback:** Sonnet 4.6 Medium is fine if you specifically want to A/B-test against Auto or repro a deterministic bug against a pinned model.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `backend/src/services/opd-doctor-service.ts` (the entire file — `listDoctorQueueSession` is the precedent for query budget, RLS, and row enrichment).
- `backend/src/services/opd-snapshot-service.ts` (lines 1–120 — the patient-side snapshot precedent; note how it reads `appointments`, joins `consultation_sessions`, computes derived states).
- `backend/src/services/opd/opd-policy-service.ts` (`getSlotJoinGraceMinutes` is the grace-window helper sl-01 calls; `DEFAULT_SLOT_JOIN_GRACE_MINUTES = 15` is the default).
- `backend/src/routes/api/v1/opd.ts` (the route file we add `GET /slot-session` to).
- `backend/src/controllers/opd-doctor-controller.ts` (`getOpdQueueSessionHandler` is the controller pattern to mirror).
- `backend/src/utils/validation.ts` lines 720–740 (`validateOpdQueueSessionQuery` + the Zod schema pattern — sl-01 adds `validateOpdSlotSessionQuery` next to it).
- `backend/src/types/database.ts` lines 120–210 (the `Appointment` row shape — every `opd_*` column we need lives here).
- `backend/tests/unit/services/` (the test directory — mirror the `opd-doctor-service` tests' fixture pattern).
- Source plan §DL-2, §DL-3, §DL-10, §DL-11.

**Estimated turns:** 4–6 turns (1 turn types + service skeleton, 1–2 turns derivation logic, 1 turn tests, 1 turn route + controller + validator, 1 turn frontend helper + types + smoke).

---

## Acceptance criteria

### Step 1 — Types

- [ ] **Backend types.** Create `backend/src/types/opd-slot-session.ts`:

  ```ts
  /**
   * Doctor-only OPD slot session row (sl-01).
   *
   * **Privacy contract:** identical to DoctorQueueSessionRow — returned only to
   * the authenticated doctor whose `doctor_id` matches the queried session.
   * Doctor is already authorized to see full PHI on adjacent surfaces.
   */
  export type SlotStatus =
    | 'upcoming'
    | 'grace'
    | 'running_late'
    | 'in_consultation'
    | 'completed'
    | 'missed'
    | 'cancelled'
    | 'overflow';

  export interface SlotSessionRow {
    appointmentId: string;
    /** Position in the day's chronological order (1-based, after sort by appointment_date). */
    position: number;
    /** Server-derived from appointments.status + appointment_date + consultation_sessions.status + grace policy. */
    slotStatus: SlotStatus;
    /** Original DB status — for UI affordances that need raw appointment.status (e.g., 'pending' vs 'confirmed'). */
    appointmentStatus: string;
    /** Slot start time. ISO string in UTC; client renders in doctor TZ. */
    scheduledAt: string;
    /** Slot duration in minutes if known (consultation_type-derived); null otherwise. */
    durationMinutes: number | null;

    // Patient identity (PHI — doctor-scoped)
    patientName: string;
    medicalRecordNumber: string | null;
    patientPhone: string;

    // Demographics (optional)
    age: number | null;
    gender: string | null;

    // Visit details
    reasonForVisit: string | null;
    serviceLabel: string | null;
    catalogServiceKey: string | null;
    consultationType: string | null;

    // Slot-specific state
    /** From appointments.opd_session_delay_minutes (mig 030). */
    delayMinutes: number | null;
    /** ISO; from appointments.opd_early_invite_expires_at (mig 029). null when no offer. */
    earlyInviteExpiresAt: string | null;
    /** From appointments.opd_early_invite_response (mig 029). */
    earlyInviteResponse: 'accepted' | 'declined' | null;

    // Episode / return-flow markers
    episodeId: string | null;
    /** From appointments.opd_event_type (mig 031). */
    opdEventType: 'standard' | 'return_after_completed' | null;

    // Inline-expand panel fields
    patientId: string | null;
    patientNote: string | null;
  }

  export interface SlotSessionCounts {
    all: number;
    upcoming: number;        // includes 'grace'
    running_late: number;
    in_consultation: number;
    completed: number;
    missed: number;
    cancelled: number;
    overflow: number;
  }

  export interface SlotSessionPayload {
    entries: SlotSessionRow[];
    counts: SlotSessionCounts;
    snapshotAt: string;       // ISO
    date: string;             // YYYY-MM-DD echo
  }
  ```

- [ ] **Frontend types.** Append to `frontend/types/opd-doctor.ts`:

  ```ts
  // ── Slot session (sl-01) ───────────────────────────────────────────────────

  export type SlotStatus =
    | 'upcoming'
    | 'grace'
    | 'running_late'
    | 'in_consultation'
    | 'completed'
    | 'missed'
    | 'cancelled'
    | 'overflow';

  export interface SlotSessionRow {
    /* identical fields to backend SlotSessionRow — copy them verbatim */
  }

  export interface SlotSessionCounts {
    /* identical to backend */
  }
  ```

  Yes, the duplication is intentional — backend and frontend type files don't share imports across the workspace boundary.

### Step 2 — Pure derivation function (`deriveSlotStatus`)

- [ ] Create `backend/src/services/opd/opd-slot-status.ts` (a small, pure module so it's easy to unit-test):

  ```ts
  import type { SlotStatus } from '../../types/opd-slot-session';

  export interface DeriveSlotStatusInput {
    appointmentStatus: string;          // 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | ...
    scheduledAtMs: number;              // appointment_date.getTime() (UTC epoch ms)
    nowMs: number;                      // request-scoped Date.now()
    graceMinutes: number;               // from getSlotJoinGraceMinutes(settings)
    consultationLive: boolean;          // join: consultation_sessions.status = 'live' for this appt
    opdEventType: 'standard' | 'return_after_completed' | null;
    /** True iff this appointment was created after the day's last originally-booked slot. */
    isAppendedAfterDay: boolean;
  }

  /**
   * Server-derived slotStatus (DL-3, sl-01).
   *
   * Order of precedence (first match wins):
   *   1. cancelled
   *   2. completed
   *   3. in_consultation       (consultation_sessions.status = 'live')
   *   4. missed                (appointments.status = 'no_show')
   *   5. overflow              (opd_event_type = 'return_after_completed' OR appended after day)
   *   6. upcoming              (now < scheduledAt - graceMinutes)
   *   7. grace                 (now within ±graceMinutes of scheduledAt, no live consult)
   *   8. running_late          (now > scheduledAt + graceMinutes, no live consult, not no_show)
   */
  export function deriveSlotStatus(input: DeriveSlotStatusInput): SlotStatus {
    if (input.appointmentStatus === 'cancelled') return 'cancelled';
    if (input.appointmentStatus === 'completed') return 'completed';
    if (input.consultationLive) return 'in_consultation';
    if (input.appointmentStatus === 'no_show') return 'missed';
    if (input.opdEventType === 'return_after_completed' || input.isAppendedAfterDay) {
      return 'overflow';
    }

    const graceMs = input.graceMinutes * 60_000;
    const startsIn = input.scheduledAtMs - input.nowMs;

    if (startsIn > graceMs) return 'upcoming';
    if (startsIn >= -graceMs) return 'grace';
    return 'running_late';
  }
  ```

- [ ] **Important precedence note** — overflow is checked **after** in-consultation and missed because an overflow row that's currently in consult should still show `in_consultation`; an overflow that no-shows should still show `missed`. Overflow is the **fallback identity** for rows that aren't otherwise terminal.

### Step 3 — Service: `listDoctorSlotSession`

- [ ] Create `backend/src/services/opd-slot-session-service.ts`. Mirror `listDoctorQueueSession`'s 3-query budget:

  1. `appointments` — single `.select(...)` with `.eq('doctor_id', doctorId)` filter on the day's UTC range (or the doctor's local-day boundary if the queue precedent does that — match it). Order by `appointment_date ASC`.
  2. `patients` — single `.in('id', aptIds)` to enrich demographics (age, gender, MRN). Optional skip if no appointment row has a `patient_id`.
  3. `consultation_sessions` — single `.in('appointment_id', aptIds)` filtered by `status = 'live'` to identify in-consultation rows.

- [ ] Optional 4th query (only when needed):
  4. `doctor_settings` — single row, only fetched when at least one row carries a `catalog_service_key` so label-less sessions stay on the 3-query happy path. Use `getActiveServiceCatalog()` helper if it's already available (queue precedent does this).

- [ ] After the queries, compute:
  - `graceMinutes` once per request via `getSlotJoinGraceMinutes(settings)`. Default to 15 if no settings.
  - For each appointment row, compute `consultationLive = sessions.has(appt.id)`, `isAppendedAfterDay` (timestamp on the appointment's `created_at` is later than the latest *other* appointment's `appointment_date` for the same doctor + day — derive once per request, then mark each row).
  - Call `deriveSlotStatus()` to get `slotStatus`.
  - Compute `position` from the chronological order (1-based).
  - Compute `counts` per status bucket. **`upcoming` count includes `grace` rows** per DL-4.

- [ ] Return `SlotSessionPayload` shape.

- [ ] **JSDoc** on the function describing the privacy contract (mirror queue precedent's wording).

### Step 4 — Validator

- [ ] In `backend/src/utils/validation.ts`, near `validateOpdQueueSessionQuery` (around line 727), add a sibling `validateOpdSlotSessionQuery`. Same Zod schema (a single `date: YYYY-MM-DD` field) — likely you can refactor `opdQueueSessionQuerySchema` into a shared `opdSessionDateQuerySchema` exported once and consumed by both validators. Keep the original validator name for backward compatibility (it's exported elsewhere).

### Step 5 — Controller + route

- [ ] In `backend/src/controllers/opd-doctor-controller.ts`, add a sibling handler `getOpdSlotSessionHandler` next to `getOpdQueueSessionHandler` (~line 31). Mirror it byte-for-byte except for the service call:

  ```ts
  export const getOpdSlotSessionHandler = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }
    const correlationId = req.correlationId || 'unknown';
    const { date } = validateOpdSlotSessionQuery(req.query as Record<string, string | undefined>);
    const payload = await listDoctorSlotSession(userId, date, correlationId);
    res.status(200).json(successResponse(payload, req));
  });
  ```

- [ ] In `backend/src/routes/api/v1/opd.ts`, add the route immediately after `'/queue-session'`:

  ```ts
  router.get('/slot-session', authenticateToken, getOpdSlotSessionHandler);
  ```

- [ ] Update the route file's import block to include `getOpdSlotSessionHandler`.

### Step 6 — Frontend API helper

- [ ] In `frontend/lib/api.ts`, near `getDoctorOpdQueueSession` (around line 464), add the slot helper:

  ```ts
  export interface DoctorOpdSlotSessionData {
    entries: SlotSessionRow[];
    counts: SlotSessionCounts;
    snapshotAt: string;
    date: string;
  }

  /**
   * Doctor-only — slot-mode session snapshot. Server-derives slotStatus + counts
   * so the chip counts match what the patient sees on their own snapshot.
   */
  export async function getDoctorOpdSlotSession(
    token: string,
    date: string
  ): Promise<ApiSuccess<DoctorOpdSlotSessionData>> {
    const params = new URLSearchParams({ date });
    return request<DoctorOpdSlotSessionData>(
      `/api/v1/opd/slot-session?${params.toString()}`,
      { token }
    );
  }
  ```

- [ ] Import `SlotSessionRow` + `SlotSessionCounts` from `@/types/opd-doctor`.

### Step 7 — Unit tests

- [ ] Create `backend/tests/unit/services/opd-slot-status.test.ts` — pure derivation, fastest tests:

  ```ts
  import { deriveSlotStatus } from '../../../src/services/opd/opd-slot-status';

  describe('deriveSlotStatus', () => {
    const baseInput = {
      graceMinutes: 15,
      nowMs: new Date('2026-05-15T10:00:00Z').getTime(),
      consultationLive: false,
      opdEventType: null,
      isAppendedAfterDay: false,
    } as const;

    test('returns "cancelled" when appointment status is cancelled', () => { /* ... */ });
    test('returns "completed" when appointment status is completed', () => { /* ... */ });
    test('returns "in_consultation" when consultation_sessions row is live', () => { /* ... */ });
    test('returns "missed" when appointment status is no_show', () => { /* ... */ });
    test('returns "overflow" for return_after_completed event type', () => { /* ... */ });
    test('returns "overflow" for appointments appended after the day', () => { /* ... */ });
    test('returns "upcoming" when slot starts > grace minutes from now', () => { /* ... */ });
    test('returns "grace" when slot starts within ±grace minutes of now', () => { /* ... */ });
    test('returns "running_late" when slot started > grace minutes ago', () => { /* ... */ });
    test('precedence: in_consultation beats overflow', () => { /* opdEventType=return_after_completed + consultationLive=true → in_consultation */ });
    test('precedence: missed beats overflow', () => { /* opdEventType=return_after_completed + appointmentStatus=no_show → missed */ });
  });
  ```

- [ ] Create `backend/tests/unit/services/opd-slot-session-service.test.ts` — service-level tests with mocked Supabase client (mirror the queue-mode service test file's mock setup). Cover at minimum:
  - Empty appointments list → `entries: [], counts: { all: 0, ... }`.
  - One appointment per status bucket → counts match; `entries` has correct `slotStatus`.
  - `position` is 1-based and chronological.
  - `counts.upcoming` includes `grace` rows (DL-4).
  - PHI passes through untouched (patient name, phone) — same precedent as queue.

### Step 8 — Smoke + verification

- [ ] `pnpm --filter backend tsc --noEmit` clean.
- [ ] `pnpm --filter backend lint` clean.
- [ ] `pnpm --filter backend test -- opd-slot` — all green.
- [ ] `pnpm --filter frontend tsc --noEmit` clean (the new types + helper compile).
- [ ] Restart the backend dev server. With a logged-in doctor's bearer token:
  ```bash
  curl -H "Authorization: Bearer <token>" \
    "http://localhost:3001/api/v1/opd/slot-session?date=$(date -I)" | jq .
  ```
  Expect `200` with `{ data: { entries: [...], counts: {...}, snapshotAt: "...", date: "..." } }`.
- [ ] Unauthenticated `curl -i "http://localhost:3001/api/v1/opd/slot-session?date=2026-05-15"` → `401`.
- [ ] **Cross-doctor probe.** Bearer token A querying with `date=` returns only doctor A's appointments — never doctor B's. (RLS / `.eq('doctor_id', userId)` ownership filter.)
- [ ] Verify by visually scanning the `entries` payload: every `slotStatus` matches what you'd manually compute from the row's `appointmentStatus` + `appointment_date` + the live consultation rows.

---

## Out of scope

- **Frontend hub UI** — that's sl-02..sl-05 (Wave 2). sl-01 only ships the data layer + frontend types/helper.
- **DB migration** — DL-11 forbids. Every field needed already exists on `appointments` (mig 029, 030, 031, 036) and `doctor_settings` (mig 028).
- **Settings UI for `slot_join_grace_minutes`** — captured in source plan as a follow-up. The default (15) and JSONB override are sufficient for sl-01.
- **Patient-side slot snapshot updates** — `backend/src/services/opd-snapshot-service.ts` is the patient-side endpoint and is unchanged. sl-01's endpoint is doctor-scoped.
- **Renaming `getDoctorOpdQueueSession` → `getDoctorOpdSession`** — defer; the queue helper keeps its name.
- **Cancelled-row chip** — DL-4 keeps `cancelled` URL-only (no chip). sl-01's counts include it for completeness; the chip is sl-03's call.

---

## Files expected to touch

**New:**

- `backend/src/types/opd-slot-session.ts` (~70 LOC).
- `backend/src/services/opd/opd-slot-status.ts` (~50 LOC, pure module).
- `backend/src/services/opd-slot-session-service.ts` (~200 LOC).
- `backend/tests/unit/services/opd-slot-status.test.ts` (~120 LOC).
- `backend/tests/unit/services/opd-slot-session-service.test.ts` (~150 LOC).

**Modified:**

- `backend/src/utils/validation.ts` (~10 LOC delta — add `validateOpdSlotSessionQuery` + maybe extract `opdSessionDateQuerySchema`).
- `backend/src/controllers/opd-doctor-controller.ts` (~12 LOC delta — add `getOpdSlotSessionHandler`).
- `backend/src/routes/api/v1/opd.ts` (~3 LOC delta — add the route line + import).
- `frontend/types/opd-doctor.ts` (~70 LOC delta — add slot types).
- `frontend/lib/api.ts` (~25 LOC delta — add `getDoctorOpdSlotSession` helper near line 464).

**Tests:** the two new files above. Existing OPD tests remain green.

---

## Notes / open decisions

1. **Why a separate `opd-slot-session-service.ts` and not extend `opd-doctor-service.ts`?** The queue service file is already ~430 LOC and tightly scoped to queue-row enrichment. A separate slot-service file keeps the two modes' enrichment paths from drifting into a tangled if/else inside one function. Both files live under `backend/src/services/`; both are called by `opd-doctor-controller.ts`.
2. **Why pure `opd-slot-status.ts` for derivation?** Status derivation is the most-tested logic in the batch. Pure module = pure tests = no Supabase mocks needed. The service file owns I/O; the status file owns rules.
3. **Why include `cancelled` in counts when it's not a chip?** Two reasons: (a) the URL filter accepts `?status=cancelled` (DL-4 fallback to URL-only), and (b) the count makes audit / debug easier. Cost is one extra integer in the payload.
4. **What if `consultation_sessions` is huge?** The `.in('appointment_id', aptIds).eq('status', 'live')` query is bounded by the day's appointments (typically < 30 per session) and the `live` filter. Index already exists on `(appointment_id, status)` per migration 035 — verify before merging.
5. **`isAppendedAfterDay` derivation** — for the first cut, derive it as: this appointment's `created_at > max(appointment_date) of any other appointment in the same doctor+day where created_at is older than this row's created_at`. Edge cases (e.g., the first appointment of a day created mid-day after the day's last slot was deleted) are rare; if a doctor reports false positives, tighten in a follow-up.
6. **Why frontend types duplicate backend types?** Workspace boundary — the `backend/` and `frontend/` packages don't share a types module. Yes, drift is a risk; the convention in this repo is to copy verbatim and rely on `tsc` integration tests at the API boundary (which sl-04 implicitly does by consuming both shapes). A future "shared types" effort is captured in `docs/Work/capture/inbox.md`.
7. **Query budget caveat** — if `getActiveServiceCatalog()` adds a 4th query, that's still O(1) per request (one row, one query, regardless of N appointments). The total query budget is **3 + (1 if catalog needed) = 4** per request. Document this in the JSDoc on the service function.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:**
  - `backend/src/services/opd-doctor-service.ts` — the precedent.
  - `backend/src/services/opd/opd-policy-service.ts` — `getSlotJoinGraceMinutes`.
  - `backend/src/services/opd-snapshot-service.ts` — patient-side snapshot pattern.
- **Source decisions:** [Product plans/plan-opd-slot-hub.md § DL-2, DL-3, DL-10, DL-11](../../../../Product%20plans/plan-opd-slot-hub.md).
- **Wave gate:** [`EXECUTION-ORDER-opd-slot-hub.md` § Wave 1 gate](./EXECUTION-ORDER-opd-slot-hub.md#wave-1-gate-after-sl-01).
- **Next task:** [`task-sl-02-slot-session-toolbar.md`](./task-sl-02-slot-session-toolbar.md) — fresh chat (frontend, different files).

---

**Owner:** TBD
**Created:** 2026-05-15
**Status:** Pending
