# Task pdm-02: `resolveSessionDayMode` helper + unified `GET /opd/session` endpoint

## 17 May 2026 — Batch [OPD Per-Day Mode](../plan-opd-per-day-mode-batch.md) — Wave 1, Lane α step 1 — **M, ~3.5h**

---

## Task overview

With the fact table in place (pdm-01), introduce **one** authoritative read path for the OPD hub data:

1. **`resolveSessionDayMode(doctorId, date)` helper.** Extends `backend/src/services/opd/opd-mode-service.ts`. Reads the fact table (`doctor_opd_session_modes`) first; falls back to the policy resolver (a stub for now — pdm-07 fills it in) → falls back to `doctor_settings.opd_mode` (the legacy column, now demoted to a tertiary fallback). Returns `'slot' | 'queue'` plus a `source` tag for debugging.
2. **Unified `GET /api/v1/opd/session?date=YYYY-MM-DD` endpoint.** Resolves the mode for the date, fans out to `listDoctorSlotSession(...)` (shipped 15-05) or `listDoctorQueueSession(...)`, returns a discriminated-union payload `{ mode, entries, counts, snapshotAt, date, modeChangeCount }`.
3. **Legacy endpoints (`/opd/slot-session`, `/opd/queue-session`) keep working** for the deprecation window — they're rewritten to call the unified handler internally, then re-shape the response back to the existing shape. Existing frontend consumers don't notice.
4. **Frontend types + API helper.** `OpdSessionPayload` discriminated union, `getDoctorOpdSession(token, date)` helper. Doesn't get **wired** in this task — pdm-03 does the read-path swap.

**Estimated time:** ~3.5h (1h backend service + 1h endpoint plumbing + 30min legacy proxy + 30min types + 30min verification).

**Status:** Pending.

**Hard deps:** pdm-01 (fact table exists; types regenerated).

**Source:** [plan-opd-per-day-mode-batch.md § Wave 1](../plan-opd-per-day-mode-batch.md#wave-1--data-foundation-3-tasks-10h-single-sequential-lane) + `S1.1` and `DL-1` + `DL-11` in [Product plans/plan-opd-per-day-mode.md](../../../Product%20plans/plan-opd-per-day-mode.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) TL;DR rule #1 — Auto is the execution default. This task is well-spec'd backend plumbing: one new helper function, one new route, one re-shape function for the legacy endpoints. The hardest decision (the resolver's fallback chain) is already locked in DL-1; nothing to invent. **Not on the hard-rules list.**

**Per-message escalation rule:** if Auto stalls on the discriminated-union typing in `OpdSessionPayload` (TypeScript narrowing on `mode` discriminator can occasionally confuse models), escalate that **one message** to Opus 4.7 Extra High.

**Manual-Sonnet fallback:** only if A/B-testing.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `backend/src/services/opd/opd-mode-service.ts` (the file being extended — only ~25 LOC today).
- `backend/src/services/opd-doctor-service.ts` (contains `listDoctorQueueSession` — the queue snapshot's return shape).
- `backend/src/services/opd-slot-session-service.ts` (contains `listDoctorSlotSession`, shipped 15-05 — the slot snapshot's return shape).
- `backend/src/routes/api/v1/opd.ts` (where the new route lands; also where the two legacy routes live).
- `backend/src/controllers/opd-doctor-controller.ts` (the existing slot / queue controllers — model for the new unified controller).
- `backend/src/services/doctor-settings-service.ts` (`getDoctorSettings` — used by the tertiary fallback).
- `backend/migrations/100_opd_session_modes.sql` (post-pdm-01 — the schema this task reads from).
- `frontend/lib/api.ts` (where `getDoctorOpdSession` API helper is added; precedent: `getDoctorOpdSlotSession`, `getDoctorOpdQueueSession`).
- `frontend/types/opd-doctor.ts` (the existing slot / queue type unions; this task adds the discriminated union that wraps them).
- `frontend/types/opd-session.ts` (post-pdm-01 — the stub file this task extends).
- Source plan §DL-1, §DL-11.

**Estimated turns:** 3–4 turns (1 backend helper + types, 1 endpoint + controller + legacy proxy, 1 frontend types + API helper, 1 verification).

---

## Acceptance criteria

### Step 1 — Extend `opd-mode-service.ts` with `resolveSessionDayMode`

- [ ] In `backend/src/services/opd/opd-mode-service.ts`, **add** (don't replace) two exports:

  ```ts
  import type { SupabaseAdmin } from '../../utils/supabase-admin';
  import type { OpdMode } from '../../types/doctor-settings';
  import { getDoctorSettings } from '../doctor-settings-service';
  import { resolveOpdModeFromSettings } from './opd-mode-service';
  // (Existing exports above this block.)

  export type OpdSessionDayModeSource =
    | 'fact'              // doctor_opd_session_modes row
    | 'policy'            // resolveModePolicyForDate (pdm-07; stub for now)
    | 'doctor_settings'   // doctor_settings.opd_mode (tertiary fallback)
    | 'default';          // 'slot' as ultimate fallback

  export interface ResolveSessionDayModeResult {
    mode: OpdMode;
    source: OpdSessionDayModeSource;
    /** Number of recorded flips for the date (0 if source !== 'fact'). */
    changeCount: number;
  }

  /**
   * Resolve the operating mode for a (doctor, session_date).
   *
   * Order of precedence (DL-1, DL-9):
   *   1. doctor_opd_session_modes row (the fact)
   *   2. mode_schedule policy (pdm-07 — stubbed here, returns null)
   *   3. doctor_settings.opd_mode (legacy column, tertiary fallback)
   *   4. 'slot' (ultimate default)
   *
   * Pure read; never writes. Materialisation (DL-10) happens elsewhere
   * (pdm-04 conversion service, pdm-07 first-booking policy default).
   */
  export async function resolveSessionDayMode(
    supabase: SupabaseAdmin,
    doctorId: string,
    date: string, // ISO YYYY-MM-DD
  ): Promise<ResolveSessionDayModeResult> {
    // 1) Fact lookup
    const { data: factRow, error: factError } = await supabase
      .from('doctor_opd_session_modes')
      .select('mode, change_count')
      .eq('doctor_id', doctorId)
      .eq('session_date', date)
      .maybeSingle();

    if (factError) {
      // Logged; fall through to next priority. Don't throw — the resolver
      // must remain available even if the fact table read fails.
      console.error('[resolveSessionDayMode] fact read failed:', factError);
    }
    if (factRow) {
      return {
        mode: factRow.mode as OpdMode,
        source: 'fact',
        changeCount: factRow.change_count ?? 0,
      };
    }

    // 2) Policy lookup — pdm-07 fills in. Stubbed to null for pdm-02.
    //    DO NOT inline a policy read here; the function signature below
    //    is the contract pdm-07 must satisfy.
    const policyMode = await resolveModePolicyForDateStub(supabase, doctorId, date);
    if (policyMode) {
      return { mode: policyMode, source: 'policy', changeCount: 0 };
    }

    // 3) doctor_settings.opd_mode (legacy)
    const settings = await getDoctorSettings(doctorId);
    if (settings?.opd_mode === 'queue' || settings?.opd_mode === 'slot') {
      return {
        mode: settings.opd_mode as OpdMode,
        source: 'doctor_settings',
        changeCount: 0,
      };
    }

    // 4) Ultimate default
    return { mode: 'slot', source: 'default', changeCount: 0 };
  }

  /**
   * Stub for pdm-07's policy resolver. Always returns null in pdm-02; pdm-07
   * replaces this implementation with the DL-9 hierarchy resolver.
   *
   * Keep the function signature exactly: (supabase, doctorId, date) => Promise<OpdMode | null>.
   */
  async function resolveModePolicyForDateStub(
    _supabase: SupabaseAdmin,
    _doctorId: string,
    _date: string,
  ): Promise<OpdMode | null> {
    return null;
  }
  ```

  **Why a stub instead of waiting for pdm-07?** The unified endpoint needs the resolver to exist now; the stub is the shape pdm-07 fills in. The stub returns `null` so the cascade falls through to `doctor_settings.opd_mode`, preserving today's behaviour for non-materialised dates until pdm-07 ships.

- [ ] **Keep `resolveOpdModeFromSettings` and `getDoctorOpdMode` exports unchanged.** Future tasks may consume them; this task is additive only.

### Step 2 — Define `OpdSessionPayload` types (backend + frontend)

- [ ] **Backend** — `backend/src/types/opd-session.ts` (new):

  ```ts
  // Discriminated union for the unified /opd/session endpoint.
  // pdm-02: defines the contract; pdm-04 extends with conversion endpoints.

  import type { SlotSessionRow, SlotSessionCounts } from './opd-slot-session';
  import type { QueueSessionRow, QueueSessionCounts } from './opd-queue-session';
  // (If those type files don't exist with those exact names, import from wherever
  // listDoctorSlotSession / listDoctorQueueSession's return shape is defined.)

  export interface OpdSessionPayloadBase {
    date: string;          // ISO YYYY-MM-DD
    snapshotAt: string;    // ISO datetime
    modeSource: 'fact' | 'policy' | 'doctor_settings' | 'default';
    modeChangeCount: number;
  }

  export interface OpdSlotSessionPayload extends OpdSessionPayloadBase {
    mode: 'slot';
    entries: SlotSessionRow[];
    counts: SlotSessionCounts;
  }

  export interface OpdQueueSessionPayload extends OpdSessionPayloadBase {
    mode: 'queue';
    entries: QueueSessionRow[];
    counts: QueueSessionCounts;
  }

  export type OpdSessionPayload = OpdSlotSessionPayload | OpdQueueSessionPayload;
  ```

- [ ] **Frontend** — extend `frontend/types/opd-session.ts` (post-pdm-01 stub) with the same shape:

  ```ts
  // (Keep the pdm-01 type stubs at the top.)
  import type { SlotSessionRow, SlotSessionCounts } from './opd-doctor';
  import type { QueueSessionRow, QueueSessionCounts } from './opd-doctor';
  // (Mirror the backend's exact source files where the row / counts types live.
  // If the frontend keeps them in opd-doctor.ts, import from there; otherwise
  // adjust the path.)

  export interface OpdSessionPayloadBase {
    date: string;
    snapshotAt: string;
    modeSource: 'fact' | 'policy' | 'doctor_settings' | 'default';
    modeChangeCount: number;
  }

  export interface OpdSlotSessionPayload extends OpdSessionPayloadBase {
    mode: 'slot';
    entries: SlotSessionRow[];
    counts: SlotSessionCounts;
  }

  export interface OpdQueueSessionPayload extends OpdSessionPayloadBase {
    mode: 'queue';
    entries: QueueSessionRow[];
    counts: QueueSessionCounts;
  }

  export type OpdSessionPayload = OpdSlotSessionPayload | OpdQueueSessionPayload;
  ```

### Step 3 — `GET /api/v1/opd/session` endpoint

- [ ] **Controller** — extend `backend/src/controllers/opd-doctor-controller.ts` with a new handler:

  ```ts
  export async function getOpdSession(req: AuthedRequest, res: Response) {
    const doctorId = req.user.id; // standard auth-middleware-injected doctor JWT
    const { date } = req.query;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Query param `date` (YYYY-MM-DD) is required.' });
    }

    const resolved = await resolveSessionDayMode(supabaseAdmin, doctorId, date);

    if (resolved.mode === 'slot') {
      const slot = await listDoctorSlotSession(doctorId, date);
      const payload: OpdSlotSessionPayload = {
        mode: 'slot',
        date,
        snapshotAt: slot.snapshotAt,
        modeSource: resolved.source,
        modeChangeCount: resolved.changeCount,
        entries: slot.entries,
        counts: slot.counts,
      };
      return res.json(payload);
    }

    // queue
    const queue = await listDoctorQueueSession(doctorId, date);
    const payload: OpdQueueSessionPayload = {
      mode: 'queue',
      date,
      snapshotAt: queue.snapshotAt,
      modeSource: resolved.source,
      modeChangeCount: resolved.changeCount,
      entries: queue.entries,
      counts: queue.counts,
    };
    return res.json(payload);
  }
  ```

  *(Exact imports + middleware patterns must mirror the existing `getOpdSlotSession` / `getOpdQueueSession` handlers in the same file. The pre-load includes that file for a reason.)*

- [ ] **Route** — extend `backend/src/routes/api/v1/opd.ts`:

  ```ts
  // (Keep existing routes above this.)
  router.get('/session', requireDoctorAuth, getOpdSession);
  ```

  Mount it before the legacy `/slot-session` and `/queue-session` routes so the route table reads top-down with the canonical endpoint first.

### Step 4 — Legacy endpoint compatibility shims

- [ ] **Goal:** `/opd/slot-session?date=…` and `/opd/queue-session?date=…` continue to return their existing payloads byte-identical, but their implementation now calls the unified path internally so future schema changes don't have to be made in three places.

- [ ] **Strategy:** the existing handlers (`getOpdSlotSession`, `getOpdQueueSession`) keep their controllers; their bodies are rewritten to:

  1. Call `getOpdSession(req, ...)` internally (or, more correctly, factor out a `loadOpdSessionPayload(doctorId, date)` service function that both controllers + the new unified controller share).
  2. **Forced-mode override**: pass an optional `forceMode: 'slot' | 'queue'` parameter so the legacy endpoints retain their old "render this mode regardless of the fact" semantics. The fact-aware behaviour is only the unified endpoint's default.
  3. Reshape the response to the legacy shape (drop the `mode`, `modeSource`, `modeChangeCount` fields; keep `entries`, `counts`, `snapshotAt`).

  ```ts
  // backend/src/services/opd-session-service.ts (new file)
  export async function loadOpdSessionPayload(
    supabase: SupabaseAdmin,
    doctorId: string,
    date: string,
    options?: { forceMode?: OpdMode },
  ): Promise<OpdSessionPayload> {
    const resolvedMode = options?.forceMode
      ? { mode: options.forceMode, source: 'fact' as const, changeCount: 0 }
      : await resolveSessionDayMode(supabase, doctorId, date);

    // ... rest mirrors the unified controller's fan-out logic ...
  }
  ```

  This is the right factoring: one service function, three thin controllers (slot / queue / session) calling it with different `forceMode` defaults.

- [ ] **Deprecation headers (set, not removed yet):**

  ```ts
  res.set('Sunset', new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString()); // 90 days out
  res.set('Deprecation', 'true');
  res.set('Link', '</api/v1/opd/session>; rel="successor-version"');
  ```

  Set on **both** legacy endpoints. pdm-12 finalises the `Sunset` date to a calendar date once the batch is closer to merging.

### Step 5 — Frontend API helper

- [ ] In `frontend/lib/api.ts`, **add** `getDoctorOpdSession`:

  ```ts
  import type { OpdSessionPayload } from '../types/opd-session';

  export async function getDoctorOpdSession(
    token: string,
    date: string,
  ): Promise<{ data: OpdSessionPayload }> {
    const res = await fetch(`${API_BASE}/api/v1/opd/session?date=${encodeURIComponent(date)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new ApiError(res.status, await res.text());
    }
    return { data: (await res.json()) as OpdSessionPayload };
  }
  ```

  *(Mirror the existing `getDoctorOpdSlotSession` / `getDoctorOpdQueueSession` helpers' exact patterns — error handling, headers, response wrapping. The pre-load lists these for that reason.)*

- [ ] **Leave the legacy helpers (`getDoctorOpdSlotSession`, `getDoctorOpdQueueSession`) in place.** Don't remove them in this task — pdm-03's read-path swap is the right point to drop the now-unused legacy helpers from frontend code.

### Step 6 — Verification (deterministic)

- [ ] **Type-check:**

  ```bash
  pnpm --filter backend tsc --noEmit
  pnpm --filter frontend tsc --noEmit
  ```

  Both clean. The discriminated union should narrow on `payload.mode === 'slot'` vs `'queue'` correctly — TypeScript should report `payload.entries: SlotSessionRow[]` after the narrowing.

- [ ] **Lint:**

  ```bash
  pnpm --filter backend lint
  pnpm --filter frontend lint
  ```

  Both clean.

- [ ] **Endpoint smoke** — start the backend, hit the new endpoint with a doctor JWT:

  ```bash
  curl -H "Authorization: Bearer $DOCTOR_JWT" \
       "http://localhost:3000/api/v1/opd/session?date=2026-05-17" | jq .

  # Expected: { "mode": "slot" | "queue", "date": "2026-05-17", "snapshotAt": "...", "modeSource": "fact" | "doctor_settings" | "default", "modeChangeCount": <number>, "entries": [...], "counts": {...} }
  ```

  Run against:
  - A date with a `doctor_opd_session_modes` fact row → `modeSource: 'fact'`.
  - A date with no fact row, doctor has `opd_mode = 'queue'` → `modeSource: 'doctor_settings'`, `mode: 'queue'`.
  - A date with no fact row, doctor has no settings → `modeSource: 'default'`, `mode: 'slot'`.

- [ ] **Legacy endpoints byte-identical** — diff the response shapes:

  ```bash
  curl -H "Authorization: Bearer $DOCTOR_JWT" \
       "http://localhost:3000/api/v1/opd/slot-session?date=2026-05-17" | jq . > /tmp/legacy-slot.json
  # Compare to the pre-pdm-02 response shape (capture before applying this task).
  diff /tmp/legacy-slot.json /tmp/legacy-slot-pre-pdm-02.json
  # Expected: zero diff (modulo timestamps).
  ```

- [ ] **Sunset headers present:**

  ```bash
  curl -i -H "Authorization: Bearer $DOCTOR_JWT" \
       "http://localhost:3000/api/v1/opd/slot-session?date=2026-05-17" | head -20

  # Expected lines:
  #   Sunset: <UTC date 90 days from now>
  #   Deprecation: true
  #   Link: </api/v1/opd/session>; rel="successor-version"
  ```

  Same for `/opd/queue-session`.

- [ ] **Auth gate** — request without JWT → 401. Cross-doctor probe (Dr. A's JWT requesting Dr. B's data) → not possible via this endpoint shape (the doctor ID comes from the JWT, not the query; verify the controller doesn't accept a `doctor_id` query param).

- [ ] **No regression** — existing OPD tests still pass:

  ```bash
  pnpm --filter backend test -- opd
  pnpm --filter backend test -- snapshot
  ```

- [ ] **`rg` checks** — confirm no surprise rewrites:

  - `rg "getDoctorOpdSlotSession\b" frontend/` returns the helper definition + any callsites that **haven't been swapped yet** (pdm-03's job).
  - `rg "getDoctorOpdQueueSession\b" frontend/` returns the helper definition + any unswapped callsites.
  - `rg "resolveSessionDayMode" backend/` returns the definition + the new controller's import + the new service function's import. No other callsites yet.

---

## Out of scope

- **Read-path swap** — pdm-03. `OpdTodayClient.tsx`, `opd-snapshot-service.ts`, `assertSlotJoinAllowedForPatient` still call the legacy paths after this task. That's intentional — keep the swap separate for clean review.
- **Policy resolver** — pdm-07. The `resolveModePolicyForDateStub` is a placeholder; pdm-07 fills it in.
- **Conversion endpoints** — pdm-04 adds `POST /opd/session/convert` and `POST /opd/session/preview-convert`.
- **Overrun endpoints** — pdm-09 adds `POST /opd/session/overrun/bulk-resolve` and the overrun count on the snapshot payload (a small extension to this task's payload shape, done at the snapshot-service level, not here).
- **Removing the legacy endpoints** — PD-D4 (deferred). They stay live with `Sunset` headers; pdm-12 sets the final `Sunset` calendar date.
- **Frontend `getDoctorOpdSession` consumers** — pdm-03 wires `OpdTodayClient.tsx` to use it.
- **Backwards-compatibility tests for legacy endpoint shapes** — the `diff /tmp/legacy-slot.json …` smoke is the verification; no automated regression test added in this task (the shape is locked by callsite type-checks).

---

## Files expected to touch

**New:**

- `backend/src/types/opd-session.ts` (~50 LOC — discriminated union types).
- `backend/src/services/opd-session-service.ts` (~80 LOC — `loadOpdSessionPayload` shared service).

**Modified:**

- `backend/src/services/opd/opd-mode-service.ts` (~80 LOC delta — `resolveSessionDayMode` + `resolveModePolicyForDateStub`; existing exports preserved).
- `backend/src/routes/api/v1/opd.ts` (~5 LOC delta — new `/session` route + Sunset headers wiring on legacy routes).
- `backend/src/controllers/opd-doctor-controller.ts` (~60 LOC delta — new `getOpdSession` handler; legacy handlers rewritten to call `loadOpdSessionPayload` with `forceMode`).
- `frontend/types/opd-session.ts` (~50 LOC delta — extends the pdm-01 stub).
- `frontend/lib/api.ts` (~25 LOC delta — new `getDoctorOpdSession` helper).

**Tests:** no new test files in this task. Endpoint smoke + legacy shape diff cover it. Conversion-specific tests live in pdm-04.

---

## Notes / open decisions

1. **Why a stub for `resolveModePolicyForDate` instead of waiting for pdm-07?** Two reasons. (a) The resolver needs to be available now so pdm-03's read-path swap doesn't have to wait two more tasks. (b) The stub returns `null`, which makes the cascade fall through to `doctor_settings.opd_mode` — preserving today's behaviour for non-materialised dates. When pdm-07 lands, the stub function body is replaced; no other code changes.
2. **Why a `forceMode` parameter on `loadOpdSessionPayload`?** The legacy endpoints (`/slot-session`, `/queue-session`) historically didn't consult anything — they just returned slot or queue data. Switching them to fact-aware behaviour during the deprecation window is risky (might break clients that rely on the legacy contract). `forceMode` preserves "legacy = forced; canonical = fact-aware" cleanly.
3. **Why include `modeSource` in the payload?** Two consumers: (a) debugging support — a doctor support ticket can include the source tag from a screenshot to diagnose "why is this date in queue mode when I'm in slot mode?". (b) pdm-08's `<TestDateWidget>` reads it directly in the future. Adding it now costs ~10 bytes per response.
4. **Could the resolver be called twice when the legacy endpoints proxy through it?** Yes — once when the legacy controller calls `loadOpdSessionPayload` (which calls `resolveSessionDayMode`), then again if the same request later needs the source. In practice, both legacy endpoints pass `forceMode`, so the resolver call is skipped entirely. The cost is one resolver call per unified request, max.
5. **What if the `date` query param is malformed (e.g., `2026-13-99`)?** The regex `^\d{4}-\d{2}-\d{2}$` accepts impossible dates like `2026-02-30`. The Supabase query then returns an empty result (Postgres treats `'2026-02-30'::date` as an error). Wrap the date conversion in a try/catch and return 400 on parse failure. Document in the controller.
6. **Should the `Sunset` date be a fixed calendar date or relative (`now + 90 days`)?** Fixed is correct (the `Sunset` header should be the same value on every response so clients can cache it). Use a constant exported from a config file (`backend/src/config/deprecations.ts`) with the calendar date `2026-08-15`. pdm-12 confirms the date.
7. **Why split out `loadOpdSessionPayload` into its own service file?** The pdm-04 conversion service also needs to load the post-conversion snapshot for the audit row; sharing the service prevents drift. The new file has one export and ~80 LOC — small enough to merit dedicated home.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:**
  - `backend/src/services/opd-doctor-service.ts` — `listDoctorQueueSession` return shape.
  - `backend/src/services/opd-slot-session-service.ts` — `listDoctorSlotSession` return shape (shipped 15-05).
  - `backend/src/services/doctor-settings-service.ts` — `getDoctorSettings` lookup.
- **Source decisions:** [Product plans/plan-opd-per-day-mode.md § DL-1, DL-11](../../../Product%20plans/plan-opd-per-day-mode.md).
- **Wave gate:** [`EXECUTION-ORDER-opd-per-day-mode.md` § Wave 1 gate](./EXECUTION-ORDER-opd-per-day-mode.md#wave-1-gate-after-pdm-03).
- **Previous task:** [`task-pdm-01-session-modes-schema-migration.md`](./task-pdm-01-session-modes-schema-migration.md) — must be merged or green on the same branch.
- **Next task:** [`task-pdm-03-read-path-swap.md`](./task-pdm-03-read-path-swap.md) — fresh chat. Consumes the unified endpoint shipped by this task.

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
