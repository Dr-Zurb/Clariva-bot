# Task pdm-12: polish + `Sunset` headers + docs updates

## 17 May 2026 — Batch [OPD Per-Day Mode](../plan-opd-per-day-mode-batch.md) — Wave 6, Lane α step 2 — **XS, ~2h**

---

## Task overview

The batch's closing pass. No new business logic; just deprecation signalling, support-runbook authoring, and a final acceptance-gate walk-through. Ships:

1. **`Sunset` + `Deprecation` headers** on the two legacy endpoints (`/opd/slot-session` and `/opd/queue-session`) pointing at `/opd/session`. The endpoints continue returning their existing shapes for the deprecation window (target removal: next major release; specific date in the response header).
2. **`docs/Reference/engineering/architecture/CONTRACTS.md` § Patient OPD session snapshot** — add the unified endpoint shape (the discriminated union from pdm-02) and mark the two legacy endpoints as deprecated.
3. **`docs/Reference/engineering/operations/OPD_SUPPORT_RUNBOOK.md`** — new sections:
   - **Conversion semantics** — what happens to existing bookings on each direction (slot→queue lossless, queue→slot overflow). Cross-references DL-4.
   - **Overrun handling** — the 30-min grace + 24h fallback timeline; how to read `appointments.session_overrun_at` for diagnostics; how to manually trigger the cron in dev.
   - **Auditing mode flips** — how to query `doctor_opd_session_mode_changes` for "when did Dr. X flip Tuesday?" support tickets; example queries.
   - **Policy resolution priority** — the DL-9 hierarchy with a worked example.
4. **`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`** — append a one-line summary of how this batch's two-Opus-tasks budget aligned with the guide's recommendations (optional learning loop).
5. **PD-Q4 telemed warning copy** — verify pdm-05's conversion dialog already renders the telemed advisory ("N of the affected bookings are telemed — patients won't know when to join the call until they're paged."). If not, add it.
6. **Final acceptance-gate sweep** — walk through the batch's cross-cutting acceptance gate (the 17-bullet list in `plan-opd-per-day-mode-batch.md`) and confirm every item. File any gaps as follow-ups in `docs/Work/capture/inbox.md`.

**Estimated time:** ~2h (~30 min Sunset headers, ~45 min runbook authoring, ~30 min CONTRACTS update + telemed advisory check, ~15 min final sweep).

**Status:** Pending.

**Hard deps:** all of pdm-01 through pdm-11.

**Source:** [plan-opd-per-day-mode-batch.md § Wave 6](../plan-opd-per-day-mode-batch.md#wave-6--in-page-shortcut--polish-2-tasks-5h-single-sequential-lane) + S1.9 in [Product plans/plan-opd-per-day-mode.md](../../../Product%20plans/plan-opd-per-day-mode.md).

---

## Model & execution guidance

**Recommended model:** **Composer 2 Fast**. Pure-text docs, response-header additions, and a single check on dialog copy. No business logic. Composer's strength matches.

**Per-message escalation rule:** if Composer can't find the runbook file (it may not exist yet), it should *create* `docs/Reference/engineering/operations/OPD_SUPPORT_RUNBOOK.md` from scratch using the structure below. If it stalls on phrasing, escalate that **one message** to Auto.

**Manual-Sonnet fallback:** not needed.

**New chat?** **Same chat as pdm-11 is fine** — the polish wave is a continuous block. Pre-load:

- This task file.
- `backend/src/routes/api/v1/opd.ts` (post-pdm-04+pdm-09 — the legacy endpoints' definitions).
- `docs/Reference/engineering/architecture/CONTRACTS.md` — to find the patient OPD section.
- `docs/Reference/engineering/operations/OPD_SUPPORT_RUNBOOK.md` (or create it).
- Source plan §S1.9, §DL-4, §DL-7, §DL-9.

**Estimated turns:** 2–3 turns (1 Sunset headers + telemed copy check, 1 runbook + contracts, 1 final sweep).

---

## Acceptance criteria

### Step 1 — `Sunset` + `Deprecation` headers on legacy endpoints

- [ ] In `backend/src/routes/api/v1/opd.ts`, wrap the two legacy route handlers to attach the headers. Use the existing middleware pattern if one exists for deprecated routes; otherwise add inline:

  ```ts
  router.get('/slot-session', requireDoctorAuth, (req, res, next) => {
    setSunsetHeaders(res, {
      sunsetDate: '2026-08-01T00:00:00Z', // target removal — verify with the team
      successor: '/api/v1/opd/session?date=YYYY-MM-DD',
      link: 'https://github.com/<org>/clariva-bot/blob/main/docs/Reference/engineering/architecture/CONTRACTS.md#patient-opd-session-snapshot',
    });
    return listDoctorSlotSession(req, res, next); // existing handler
  });

  router.get('/queue-session', requireDoctorAuth, (req, res, next) => {
    setSunsetHeaders(res, {
      sunsetDate: '2026-08-01T00:00:00Z',
      successor: '/api/v1/opd/session?date=YYYY-MM-DD',
      link: 'https://github.com/<org>/clariva-bot/blob/main/docs/Reference/engineering/architecture/CONTRACTS.md#patient-opd-session-snapshot',
    });
    return listDoctorQueueSession(req, res, next);
  });
  ```

- [ ] **Helper:** `setSunsetHeaders` lives in `backend/src/utils/http.ts` (or wherever response helpers live). Create if it doesn't exist:

  ```ts
  // backend/src/utils/http.ts
  export interface SunsetHeaderOptions {
    sunsetDate: string;   // ISO8601 — RFC 8594 specifies HTTP-date, but most clients tolerate ISO8601
    successor: string;    // URL path to the successor endpoint
    link?: string;        // optional documentation URL
  }

  export function setSunsetHeaders(res: Response, opts: SunsetHeaderOptions): void {
    res.setHeader('Sunset', opts.sunsetDate);
    res.setHeader('Deprecation', 'true');
    const links: string[] = [`<${opts.successor}>; rel="successor-version"`];
    if (opts.link) {
      links.push(`<${opts.link}>; rel="deprecation"; type="text/html"`);
    }
    res.setHeader('Link', links.join(', '));
  }
  ```

- [ ] **Sunset date** — propose `2026-08-01` (~3 months out) as the target removal date. Verify with the team before merging; the date can move without breaking the header contract (clients should treat `Sunset` as advisory).
- [ ] **Verify with curl** in a dev environment:

  ```bash
  curl -i -H "Authorization: Bearer <token>" https://localhost:<port>/api/v1/opd/slot-session?date=2026-05-17
  # Expected headers:
  #   Sunset: 2026-08-01T00:00:00Z
  #   Deprecation: true
  #   Link: </api/v1/opd/session?date=YYYY-MM-DD>; rel="successor-version", <https://.../CONTRACTS.md#...>; rel="deprecation"; type="text/html"
  ```

### Step 2 — `docs/Reference/engineering/architecture/CONTRACTS.md`

- [ ] Find the existing "Patient OPD session snapshot" section. If it exists, update it. If not, add it under the appropriate heading.

  ```markdown
  ### Patient OPD session snapshot — `GET /api/v1/opd/session`

  > **Replaces** the legacy `GET /api/v1/opd/slot-session` and `GET /api/v1/opd/queue-session` endpoints (deprecated 2026-05-17; sunset 2026-08-01).
  >
  > See [`Product plans/plan-opd-per-day-mode.md` § DL-11](../../Daily-plans/March%202026/Product%20plans/plan-opd-per-day-mode.md) for the model.

  **Request:**

  ```
  GET /api/v1/opd/session?date=YYYY-MM-DD
  Authorization: Bearer <doctor-token>
  ```

  **Response:** discriminated union on `mode`.

  ```jsonc
  // Slot mode
  {
    "mode": "slot",
    "date": "2026-05-17",
    "entries": [
      {
        "id": "<appointment-uuid>",
        "patient": { "id": "...", "first_name": "...", "last_name": "...", "phone": "..." },
        "service": { "id": "...", "name": "...", "duration_min": 15 },
        "appointment_date": "2026-05-17T10:00:00Z",
        "status": "pending",
        "opd_event_type": null,
        "opd_session_delay_minutes": 0,
        "modality": "in_person"
      }
    ],
    "counts": { "scheduled": 12, "completed": 3, "no_show": 0, "overflow": 0 },
    "snapshotAt": "2026-05-17T10:05:00Z",
    "modeChangeCount": 0
  }

  // Queue mode
  {
    "mode": "queue",
    "date": "2026-05-17",
    "entries": [
      {
        "id": "<appointment-uuid>",
        "token_number": 1,
        "patient": { ... },
        "service": { ... },
        "status": "pending",
        "modality": "in_person"
      }
    ],
    "counts": { "queued": 12, "completed": 3, "no_show": 0 },
    "snapshotAt": "2026-05-17T10:05:00Z",
    "modeChangeCount": 0
  }
  ```

  **`mode` resolution:** the server applies the [DL-9 resolver](../../Daily-plans/March%202026/Product%20plans/plan-opd-per-day-mode.md#dl-9-mode-scheduling-policy):
  1. `doctor_opd_session_modes` fact row for `(doctor_id, date)`, if present.
  2. `opd_policies.mode_schedule.date_overrides` (later in array wins on overlap).
  3. `opd_policies.mode_schedule.date_range_overrides` (later in array wins on overlap).
  4. `opd_policies.mode_schedule.weekly_overrides[weekday]`.
  5. `opd_policies.mode_schedule.default_mode`.
  6. `doctor_settings.opd_mode` (legacy column fallback).
  7. `'slot'` ultimate default.

  **`modeChangeCount`:** how many times this date has been flipped (from `doctor_opd_session_modes.change_count`). UI uses this to render the DL-14 soft nudge after ≥2 flips.

  ### Deprecated endpoints

  - `GET /api/v1/opd/slot-session` — proxies to `/opd/session` and returns the slot-shaped payload only. Emits `Sunset: 2026-08-01T00:00:00Z` header.
  - `GET /api/v1/opd/queue-session` — proxies to `/opd/session` and returns the queue-shaped payload only. Emits `Sunset: 2026-08-01T00:00:00Z` header.

  Clients should migrate to the unified endpoint before the sunset date.
  ```

### Step 3 — `docs/Reference/engineering/operations/OPD_SUPPORT_RUNBOOK.md`

- [ ] If the file doesn't exist, create it:

  ```markdown
  # OPD Support Runbook

  Operational reference for support engineers handling OPD-related tickets in the clariva-bot EHR. Covers mode lifecycle, conversion semantics, overrun handling, and policy resolution.

  > **Source plan:** [`Daily-plans/March 2026/Product plans/plan-opd-per-day-mode.md`](../Daily-plans/March%202026/Product%20plans/plan-opd-per-day-mode.md).
  > **Batch:** [`Daily-plans/May 2026/17-05-2026/opd-per-day-mode/`](../Daily-plans/May%202026/17-05-2026/opd-per-day-mode/).

  ---

  ## 1. Mode lifecycle

  A doctor's OPD operates in one of two modes per day: **slot** (fixed-time appointments) or **queue** (token-numbered walk-ins). The mode is a **per-day fact**, not a doctor-global setting.

  ### Where to look

  - **Today's mode for Dr. X on 2026-05-17:**

    ```sql
    SELECT mode, source, change_count, changed_at
    FROM doctor_opd_session_modes
    WHERE doctor_id = '<uuid>' AND session_date = '2026-05-17';
    ```

  - **If no row exists:** the mode is **resolved on the fly** via the DL-9 policy hierarchy. Read `opd_policies.mode_schedule` and walk through:
    1. `date_overrides` (later in array wins) → 2. `date_range_overrides` (later in array wins) → 3. `weekly_overrides[weekday]` → 4. `default_mode` → 5. `doctor_settings.opd_mode` (legacy) → 6. `'slot'`.

  - **Audit history of flips for a doctor/date:**

    ```sql
    SELECT from_mode, to_mode, affected_apt_count, overflow_count,
           notification_dispatched, triggered_by, notes, created_at
    FROM doctor_opd_session_mode_changes
    WHERE doctor_id = '<uuid>' AND session_date = '2026-05-17'
    ORDER BY created_at DESC;
    ```

  ## 2. Conversion semantics

  When a doctor flips a day's mode with existing bookings, the system **automatically reassigns** all non-terminal (`pending` / `confirmed`) appointments. There is no patient-side action required.

  ### Slot → Queue (lossless)

  1. Sort appointments by `appointment_date ASC`, tiebreaker `created_at ASC`.
  2. Mint `opd_queue_entries` rows with `token_number = 1..N`.
  3. Keep the original `appointment_date` on the appointment row (reverse-flip safety).
  4. Clear slot-specific fields: `opd_session_delay_minutes`, `opd_early_invite_expires_at`, `opd_early_invite_response`.

  **Patient impact:** each affected patient receives the **slot→queue notification** (DL-6 template 1): *"Dr. {name} has changed {date} to queue mode. Your slot at {time} is now token #{n}…"*.

  ### Queue → Slot (may overflow)

  1. Sort appointments by `token_number ASC`.
  2. Compute the slot grid from `slot_interval_minutes` + the doctor's working hours.
  3. Assign first `min(N, slot_capacity)` rows to grid positions in token order.
  4. **Surplus rows** become `opd_event_type = 'return_after_completed'` overflow slots at `session_end + (overflow_index + 1) * slot_interval`.
  5. Delete the original `opd_queue_entries` rows.

  **Patient impact:** regular-grid patients get the **queue→slot regular notification** (DL-6 template 2); overflow patients get the **queue→slot overflow notification** (DL-6 template 3).

  ### Net-zero flips (debounce window)

  If a doctor flips slot→queue→slot within 5 minutes, **no patient receives any notification**. The pending notification batch is cancelled before dispatch.

  ## 3. Overrun handling

  ### Flagging

  A `pending` or `confirmed` appointment that sits past `session_end + 30 min` is flagged `session_overrun_at = now()` by the **flagging cron** (`runOpdOverrunFlaggingCron`, runs every 5 min).

  ### Doctor action (DL-7)

  The OPD-tab tray surfaces flagged rows. Doctor's bulk actions:

  | Action | What it does |
  |---|---|
  | `reschedule_all` (default) | Move every flagged row to next-available, same modality + service. Patients notified. |
  | `reschedule_per_patient` | Same as above, but doctor picks the specific slot per row. |
  | `mark_completed` | Status = `completed`, overrun flag cleared. No reschedule. |
  | `cancel_refund` | Refund issued + status = `cancelled`. Patients notified. |
  | `mark_no_show` | Status = `no_show`, overrun flag cleared. No refund. |

  Per-row overrides supported.

  ### Auto-reschedule fallback (DL-8)

  If the doctor doesn't action a flagged row within **24h**, the **fallback cron** (`runOpdOverrunFallbackCron`, hourly) auto-reschedules it with `triggered_by = 'system_overrun_fallback'`. The patient is notified.

  ### Diagnostics

  - **Why is this row stuck in 'pending' past the session?**

    ```sql
    SELECT id, status, appointment_date, session_overrun_at,
           cancelled_at, cancellation_reason
    FROM appointments
    WHERE id = '<uuid>';
    ```

    - `session_overrun_at IS NOT NULL` → already flagged; waiting on doctor or fallback.
    - `session_overrun_at IS NULL` AND `appointment_date < now() - interval '30 min'` → cron hasn't run yet; check cron health.

  - **Manually trigger the flagging cron (dev / staging only):**

    ```bash
    # Find the worker entry point in backend/src/workers/opd-overrun-cron.ts
    pnpm --filter backend run worker:opd-overrun-flagging
    ```

  ## 4. Policy resolution priority (DL-9)

  Worked example: Dr. X has

  ```jsonc
  {
    "default_mode": "slot",
    "weekly_overrides": { "tue": "queue" },
    "date_range_overrides": [
      { "from": "2026-06-01", "to": "2026-06-15", "mode": "queue" }
    ],
    "date_overrides": [
      { "date": "2026-06-09", "mode": "slot" }
    ]
  }
  ```

  Resolutions:

  | Date | Weekday | Resolved mode | Source |
  |---|---|---|---|
  | 2026-05-19 (Tue) | Tuesday | `queue` | `weekly_overrides.tue` |
  | 2026-05-21 (Thu) | Thursday | `slot` | `default_mode` |
  | 2026-06-05 (Fri) | Friday | `queue` | `date_range_overrides[0]` |
  | 2026-06-09 (Tue) | Tuesday | `slot` | `date_overrides[0]` (beats range + weekly) |

  ## 5. Notification debounce

  All conversion notifications go through a **5-min debounce** (DL-5). A flip schedules the batch for `now + 5 min`; a second flip within that window reschedules to `latest_flip + 5 min`; a third flip continues to slide. **Hard ceiling:** the batch dispatches no later than `first_flip + 30 min`.

  ### Diagnostics

  - **Pending batches:**

    ```sql
    SELECT doctor_id, session_date, first_flip_at, latest_flip_at,
           scheduled_for, latest_flip_mode
    FROM doctor_opd_pending_mode_notifications
    ORDER BY scheduled_for ASC;
    ```

  ## 6. Backwards-compatibility surfaces

  - `GET /api/v1/opd/slot-session` and `GET /api/v1/opd/queue-session` are **deprecated** (Sunset: 2026-08-01). New clients should call `GET /api/v1/opd/session?date=YYYY-MM-DD`.
  - `doctor_settings.opd_mode` column remains a **tertiary fallback** in the resolver. Writes still work but should be considered legacy.

  ---

  ## References

  - [Product plans/plan-opd-per-day-mode.md](../Daily-plans/March%202026/Product%20plans/plan-opd-per-day-mode.md) — DL-1..DL-16.
  - [Daily-plans/May 2026/17-05-2026/opd-per-day-mode/](../Daily-plans/May%202026/17-05-2026/opd-per-day-mode/) — batch tasks pdm-01..pdm-12.
  - [Reference/engineering/architecture/CONTRACTS.md § Patient OPD session snapshot](./CONTRACTS.md#patient-opd-session-snapshot) — endpoint contract.
  ```

- [ ] **Verify the file's location.** If the project keeps reference docs in `docs/Reference/` (looks likely from the `docs/Reference/engineering/architecture/CONTRACTS.md` path used in the batch plan), create there. If a different path, conform.

### Step 4 — PD-Q4 telemed advisory check

- [ ] Open `frontend/components/opd/session-mode/SessionModeConversionDialog.tsx` (pdm-05).
- [ ] **Verify** the dialog renders the telemed advisory in the preview phase when `telemedCount > 0`:

  ```tsx
  {preview.telemedCount > 0 && (
    <Alert>
      <AlertDescription>
        {preview.telemedCount} of the affected bookings are telemed — patients won't know when to join the call until they're paged.
      </AlertDescription>
    </Alert>
  )}
  ```

- [ ] If pdm-05 missed it, add it now (5-line patch). Verify the backend's `previewConvertSession` response includes `telemedCount` (pdm-04 task spec listed it).

### Step 5 — `docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md` retrospective (optional)

- [ ] At the bottom of the guide, under a "Real-world batch retrospectives" section (create if missing), add:

  ```markdown
  ### OPD Per-Day Mode (2026-05-17 batch — 12 tasks)

  - **Opus budget:** 2 of 12 tasks (pdm-01 schema migration, pdm-04 conversion service). Matched the guide's "≤2 Opus per batch" target.
  - **Composer 2 Fast:** 1 of 12 tasks (pdm-12 polish). Pure-text + header additions; Composer's strength.
  - **Auto:** 9 of 12 tasks. Standard read-paths, UI components, cron workers.
  - **Per-message escalations used:** ~3 across the batch (one for `dnd-kit` configuration in pdm-08, one for the per-row override grid state shape in pdm-10).
  - **Lesson:** the two-Opus budget was sufficient. Wave 4's policy resolver was *almost* an Opus candidate (multi-file refactor of booking flows) but stayed under Auto with the well-spec'd task file. A third Opus would have been waste.
  ```

  Skip this step if the guide doesn't already have a retrospectives section and adding one feels off-strategy for this batch.

### Step 6 — Final acceptance-gate sweep

- [ ] Walk through the 17-bullet acceptance gate in [`plan-opd-per-day-mode-batch.md` § Cross-cutting acceptance gate](../plan-opd-per-day-mode-batch.md#cross-cutting-acceptance-gate-whole-batch). For each bullet:
  - [ ] Confirm the implementation exists in pdm-01..pdm-11.
  - [ ] If a gate item is unsatisfied, file a follow-up in `docs/Work/capture/inbox.md`:

    ```markdown
    - [ ] pdm-batch-followup: <gate item>: <what's missing>. See `Daily-plans/May 2026/17-05-2026/opd-per-day-mode/plan-opd-per-day-mode-batch.md`.
    ```

- [ ] Smoke-run the four core paths:
  1. Display follows date, not toggle (pdm-03 — open a past queue-mode date while doctor's column = 'slot' → queue list renders).
  2. Conversion (pdm-04 + pdm-05 — flip a future date with 5 bookings → preview → confirm → 5 reassigned).
  3. Settings policy (pdm-08 — add `weekly_overrides.tue = 'queue'` → next Tuesday's booking widget shows queue UI).
  4. Overrun (pdm-09 + pdm-10 — seed an overrun row → tray appears → bulk-resolve clears it).

### Step 7 — Verification

- [ ] `pnpm --filter backend tsc --noEmit` clean.
- [ ] `pnpm --filter backend lint` clean.
- [ ] `pnpm --filter backend test` clean (full backend suite — no regressions).
- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend test` clean (full frontend suite).
- [ ] **Curl checks:**

  ```bash
  curl -i -H "Authorization: Bearer <doctor-token>" \
    https://localhost:<port>/api/v1/opd/slot-session?date=2026-05-17 | grep -i -E 'sunset|deprecation|link'
  # Expected:
  #   Sunset: 2026-08-01T00:00:00Z
  #   Deprecation: true
  #   Link: </api/v1/opd/session?date=YYYY-MM-DD>; rel="successor-version", ...
  ```

- [ ] **Docs render check:** open `docs/Reference/engineering/architecture/CONTRACTS.md` and `docs/Reference/engineering/operations/OPD_SUPPORT_RUNBOOK.md` in a markdown previewer; verify links resolve, code blocks render, tables align.
- [ ] **`rg` checks:**

  ```bash
  rg "setSunsetHeaders\b" backend/src/
  # Expected: helper definition + 2 uses (slot-session + queue-session).

  rg "/opd/session\b" docs/
  # Expected: documented in CONTRACTS.md and OPD_SUPPORT_RUNBOOK.md.
  ```

- [ ] **Capture any remaining gaps:** append to `docs/Work/capture/inbox.md` per the workspace rule.

### Optional Step 8 — Close-gate Opus turn

- [ ] Per the batch plan's cost-estimate note: open **one** Opus 4.7 Extra High chat with the full Wave 1–6 diff and ask it to grade against the cross-cutting acceptance gate. **Skip** if Step 6's sweep is clean. **Run** if any gate item required a follow-up — Opus can confirm the follow-up doesn't hide a deeper issue.

---

## Out of scope

- **Actually removing the legacy endpoints** — the Sunset header announces the deprecation; the removal happens in a future cleanup batch after the sunset date.
- **`doctor_settings.opd_mode` column removal** — PD-D4 deferred. The column stays.
- **New polish features** — anything beyond the existing in-flight surface lands as a follow-up batch.
- **Localization** — the runbook is en-IN; localization is a cross-app concern.
- **Public booking widget docs** — the booking flow is covered in `docs/Reference/engineering/architecture/CONTRACTS.md` § Public booking; pdm-12 doesn't rewrite that section, only adds a one-liner that the mode is now resolved per target date.
- **Telemetry dashboards** — pdm-11 fires `opd_session.mode_flipped`. Setting up a Grafana / Datadog dashboard is product-ops, not this batch.
- **Release notes / changelog** — handled by whatever PR template the team uses.

---

## Files expected to touch

**New:**

- `docs/Reference/engineering/operations/OPD_SUPPORT_RUNBOOK.md` (~150 LOC — new file).

**Modified:**

- `backend/src/routes/api/v1/opd.ts` (~20 LOC delta — wrap the two legacy routes with `setSunsetHeaders`).
- `backend/src/utils/http.ts` (~25 LOC delta — `setSunsetHeaders` helper if not present).
- `docs/Reference/engineering/architecture/CONTRACTS.md` (~80 LOC delta — unified endpoint section + deprecation note).
- `docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md` (~15 LOC delta — optional retrospective).
- `frontend/components/opd/session-mode/SessionModeConversionDialog.tsx` (~5 LOC delta — telemed advisory if missing).
- `docs/Work/capture/inbox.md` (variable — follow-up items if any).

---

## Notes / open decisions

1. **Sunset date** — `2026-08-01` is a proposal. The team should confirm before merging; the date isn't load-bearing for the batch's success (clients should treat `Sunset` as advisory, not enforced).
2. **Why a runbook now and not in the next batch?** Support tickets will start landing the moment this batch ships. The runbook is the doc the support team will reach for; shipping it together prevents a "we shipped a feature but the support team can't diagnose it" gap.
3. **Why is the retrospective optional?** Some teams want the guide to stay aspirational (rules, not anecdotes). If the team prefers, the retrospective lives in `docs/Work/Daily-plans/May 2026/17-05-2026/opd-per-day-mode/RETROSPECTIVE.md` instead.
4. **What if the telemed advisory is already in pdm-05?** Skip Step 4. The check is a verification, not a re-implementation.
5. **What if the final acceptance-gate sweep finds a regression?** File it in `docs/Work/capture/inbox.md` and decide with the team whether to ship the batch with the known regression or roll back to before that wave. Don't try to fix it inside pdm-12 — the polish task isn't sized for surprise rework.
6. **Why does pdm-12 sit at the very end instead of running in parallel with pdm-11?** The runbook references behaviours from pdm-09, pdm-10, pdm-11. Writing it before they ship risks documenting an aspirational behaviour that didn't materialise. Strictly last.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:**
  - All of pdm-01..pdm-11's affected files (for the acceptance sweep).
- **Source decisions:** [Product plans/plan-opd-per-day-mode.md § S1.9, DL-4, DL-7, DL-9](../../../Product%20plans/plan-opd-per-day-mode.md).
- **Wave gate:** [`EXECUTION-ORDER-opd-per-day-mode.md` § Wave 6 gate](./EXECUTION-ORDER-opd-per-day-mode.md#wave-6-gate-after-pdm-12).
- **Previous task:** [`task-pdm-11-opd-tab-mode-shortcut.md`](./task-pdm-11-opd-tab-mode-shortcut.md).
- **Next task:** _(batch complete — promote a follow-up batch if cleanup remains)_.
- **Final batch checkpoint:** [`plan-opd-per-day-mode-batch.md` § Cross-cutting acceptance gate](../plan-opd-per-day-mode-batch.md#cross-cutting-acceptance-gate-whole-batch).

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
