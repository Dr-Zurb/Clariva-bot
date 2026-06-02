# Task pdm-03: Read-path swap — date-driven mode at all three callsites

## 17 May 2026 — Batch [OPD Per-Day Mode](../plan-opd-per-day-mode-batch.md) — Wave 1, Lane α step 2 — **M, ~3h**

---

## Task overview

The visible bug fix. Three callsites currently read `doctor_settings.opd_mode` (via `resolveOpdModeFromSettings(settings)`) to decide how to render or gate a booking. Each is now swapped to call `resolveSessionDayMode(supabaseAdmin, doctorId, date)` (shipped in pdm-02) **for the date of the booking or selected date** — not for the doctor's current toggle:

1. **`OpdTodayClient.tsx` (doctor hub).** Replaces the existing slot-or-queue branch selector with a single call to `getDoctorOpdSession(token, date)` and renders the toolbar / list shape from `response.mode`. The slot-hub toolbar/filter/list (shipped 15-05) and the queue-hub equivalents survive untouched — only the data source changes.
2. **`opd-snapshot-service.ts` (patient-side snapshot).** Reads `resolveSessionDayMode(admin, appointment.doctor_id, appointment.appointment_date::date)` for the row's date instead of the doctor's current mode. The patient sees their appointment in the mode it was booked under.
3. **`assertSlotJoinAllowedForPatient` (slot-join grace gate).** Same swap. A queue-mode booking joins freely; a slot-mode booking is time-windowed by the grace policy — and this is now decided per-row, not by the doctor's current toggle.

After this task, flipping `doctor_settings.opd_mode` no longer changes the rendering of any existing booking. The DL-1 contract — *"the mode follows the date, not the doctor's current toggle"* — is enforced.

**Estimated time:** ~3h (1h `OpdTodayClient.tsx` refactor + 30min `opd-snapshot-service.ts` + 30min `opd-policy-service.ts` (grace gate) + 30min `useDoctorDayPipeline.ts` audit + 30min verification, smoke, regression test).

**Status:** Pending.

**Hard deps:** pdm-02 (unified endpoint + `resolveSessionDayMode` exists; `getDoctorOpdSession` frontend helper exists; `OpdSessionPayload` discriminated union is defined).

**Source:** [plan-opd-per-day-mode-batch.md § Wave 1](../plan-opd-per-day-mode-batch.md#wave-1--data-foundation-3-tasks-10h-single-sequential-lane) + `S1.2` in [Product plans/plan-opd-per-day-mode.md](../../../Product%20plans/plan-opd-per-day-mode.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) TL;DR rule #1. This is a read-path swap across three known files — mechanical: replace one helper call with another. The risk is subtle (forgetting a callsite or missing a related grep pattern), so this task spec lists every grep pattern that must return zero / one matches after the swap. **Not on the hard-rules list.**

**Per-message escalation rule:** if Auto stalls on `OpdTodayClient.tsx`'s branching refactor (it's a 600+ line file with complex state — discriminated union narrowing on `payload.mode` can confuse a model), escalate that **one message** to Opus 4.7 Extra High.

**Manual-Sonnet fallback:** only if A/B-testing.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `frontend/components/opd/OpdTodayClient.tsx` (the entire file — pdm-03's largest change lives here).
- `backend/src/services/opd-snapshot-service.ts` (patient-side snapshot — second swap site).
- `backend/src/services/opd/opd-policy-service.ts` (`assertSlotJoinAllowedForPatient` — third swap site, ~110 LOC total).
- `backend/src/services/opd/opd-mode-service.ts` (post-pdm-02 — the `resolveSessionDayMode` helper to use everywhere).
- `frontend/lib/api.ts` (post-pdm-02 — the `getDoctorOpdSession` helper to consume).
- `frontend/types/opd-session.ts` (post-pdm-02 — the discriminated union).
- `frontend/hooks/useDoctorDayPipeline.ts` (the unified queue/slot adapter — verify it correctly reads the new payload's `mode` discriminator).
- Source plan §DL-1, §DL-11.

**Estimated turns:** 4–5 turns (1 `OpdTodayClient` refactor, 1 snapshot-service swap, 1 grace-gate swap, 1 grep-and-test sweep, 1 mobile smoke).

---

## Acceptance criteria

### Step 1 — `OpdTodayClient.tsx` swap

This is the biggest change. The existing file branches on the doctor's `opd_mode` and renders a slot-mode subtree or a queue-mode subtree. After this task, it branches on the **payload's `mode` discriminator** from `getDoctorOpdSession`.

- [ ] **Find the existing mode-resolution code.** Today (pre-pdm-03), the file likely has:

  ```ts
  // Somewhere near the top of the component:
  const opdMode = useOpdMode(); // or props.opdMode, or a useEffect that calls getDoctorOpdMode
  ```

  Replace this with a single payload fetch:

  ```ts
  const [sessionPayload, setSessionPayload] = useState<OpdSessionPayload | null>(null);

  useEffect(() => {
    if (!sessionDate) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getDoctorOpdSession(token, sessionDate);
        if (!cancelled) {
          setSessionPayload(data);
        }
      } catch (err) {
        // The slot-hub / queue-hub branches handle their own banner via the
        // stale-while-revalidate pattern shipped in sl-05; here we just keep
        // the previous payload (null on first load) and let the inner
        // surfaces show their empty-state.
        console.error('[OpdTodayClient] /opd/session fetch failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [token, sessionDate]);

  const mode = sessionPayload?.mode ?? null; // null while loading
  ```

- [ ] **Replace the branching logic.** Today it's something like:

  ```tsx
  {opdMode === 'queue' ? <QueueModeBranch ... /> : <SlotModeBranch ... />}
  ```

  Becomes:

  ```tsx
  {mode === null ? (
    <SessionLoadingSkeleton />
  ) : sessionPayload.mode === 'queue' ? (
    <QueueModeBranch
      entries={sessionPayload.entries}
      counts={sessionPayload.counts}
      snapshotAt={sessionPayload.snapshotAt}
      modeChangeCount={sessionPayload.modeChangeCount}
      // ... other props mirrored from existing usage
    />
  ) : (
    <SlotModeBranch
      entries={sessionPayload.entries}
      counts={sessionPayload.counts}
      snapshotAt={sessionPayload.snapshotAt}
      modeChangeCount={sessionPayload.modeChangeCount}
      // ... other props mirrored
    />
  )}
  ```

  *(The exact branch component names + prop signatures depend on the post-slot-hub state of the file. Mirror them; don't rename.)*

  **Critical: TypeScript narrowing must work.** Inside the `'queue'` branch, `sessionPayload.entries` is `QueueSessionRow[]`; inside the `'slot'` branch, it's `SlotSessionRow[]`. The discriminated union does this automatically — no `as` casts.

- [ ] **Remove the now-dead `useOpdMode()` / `getDoctorOpdMode()` callsite.** `rg "getDoctorOpdMode\b" frontend/components/opd/OpdTodayClient.tsx` should return zero matches after the swap.

- [ ] **Remove the now-dead legacy fetch calls.** The previous code likely called `getDoctorOpdSlotSession` or `getDoctorOpdQueueSession` directly inside the branch subtrees. Audit them — they should now consume the payload from the parent's prop instead. If they still need to refetch (e.g., for polling), they should call `getDoctorOpdSession` (the unified helper) — not the legacy split helpers.

  `rg "getDoctorOpdSlotSession\b|getDoctorOpdQueueSession\b" frontend/components/opd/` after the swap should return only the helper definitions in `frontend/lib/api.ts` (still defined but unused inside `OpdTodayClient.tsx`).

- [ ] **Polling preservation.** The slot-hub batch (sl-05) ships a 30s polling pattern with `visibilitychange` pause. Verify it still works:

  - The polling `setInterval` callback should call `getDoctorOpdSession(token, sessionDate)` (the unified helper), not the legacy slot/queue helper.
  - `visibilitychange` listener should still suspend polling when the tab is hidden.
  - The "Last updated Xs ago" freshness indicator reads from `sessionPayload.snapshotAt`.

- [ ] **Mode badge / pill behaviour.** The toolbar's mode pill currently reads from the global `opdMode`. After this task, it should read from `sessionPayload.mode`. pdm-11 will make the pill a dropdown; today (pdm-03) it's still a static badge — but its **value** comes from the payload, not from the doctor's settings.

  ```tsx
  <OpdModeBadge mode={sessionPayload.mode} />  // not opdMode={settings.opd_mode}
  ```

### Step 2 — `opd-snapshot-service.ts` swap (patient-side)

- [ ] **Find the existing mode resolution.** Today (pre-pdm-03), the file likely has:

  ```ts
  // Near the snapshot-building function:
  const settings = await getDoctorSettings(appointment.doctor_id);
  const opdMode = resolveOpdModeFromSettings(settings);

  if (opdMode === 'queue') {
    // ... build queue-shaped snapshot
  } else {
    // ... build slot-shaped snapshot
  }
  ```

  Replace with:

  ```ts
  const sessionDayMode = await resolveSessionDayMode(
    supabaseAdmin,
    appointment.doctor_id,
    appointment.appointment_date.slice(0, 10), // YYYY-MM-DD from the appointment's date
  );

  if (sessionDayMode.mode === 'queue') {
    // ... build queue-shaped snapshot (no change in body)
  } else {
    // ... build slot-shaped snapshot (no change in body)
  }
  ```

- [ ] **Preserve the snapshot's existing shape.** The snapshot payload's existing fields are a stable contract with the patient frontend; this task only changes the **decision** of which shape to build, not the shape itself.

- [ ] **`appointment.appointment_date` is a timestamp** (ISO datetime including time). The fact-table key is a date (YYYY-MM-DD). The `.slice(0, 10)` extraction is sufficient because `appointment_date` is normalised to UTC in writes; verify with one fixture (a 23:30 IST appointment whose UTC date differs from its local date — the doctor's local date is the relevant one). If this is non-trivial, prefer the existing `getDoctorTimezone(doctor_id)` + `formatInDoctorTZ(appointment_date)` helpers (verify they exist; if not, do the simple slice and document the caveat).

- [ ] **Remove the now-dead `resolveOpdModeFromSettings` callsite** from this file. `rg "resolveOpdModeFromSettings" backend/src/services/opd-snapshot-service.ts` returns zero matches after the swap.

### Step 3 — `opd-policy-service.ts` (`assertSlotJoinAllowedForPatient`) swap

- [ ] **Existing code** (lines 64–110 of `opd-policy-service.ts`):

  ```ts
  const settings = await getDoctorSettings(apt.doctor_id as string);
  const opdMode = resolveOpdModeFromSettings(settings);
  if (opdMode === 'queue') {
    return;
  }
  ```

  becomes:

  ```ts
  const sessionDayMode = await resolveSessionDayMode(
    admin,
    apt.doctor_id as string,
    (apt.appointment_date as string).slice(0, 10),
  );
  if (sessionDayMode.mode === 'queue') {
    return;
  }
  // ... existing slot-mode grace check below unchanged
  ```

- [ ] **`getSlotJoinGraceMinutes(settings)` stays.** The grace minutes come from `opd_policies.slot_join_grace_minutes` (a doctor-level setting, not a per-date one). DL-10 doesn't move grace settings to the fact row.

- [ ] **Remove the now-dead `resolveOpdModeFromSettings` callsite** from this file. `rg "resolveOpdModeFromSettings" backend/src/services/opd/opd-policy-service.ts` returns zero matches after the swap (the `getSlotJoinGraceMinutes(settings)` call survives because it doesn't go through `resolveOpdModeFromSettings`).

### Step 4 — Audit `useDoctorDayPipeline.ts`

- [ ] **`frontend/hooks/useDoctorDayPipeline.ts`** is the unified queue/slot adapter. Verify it currently branches on a mode prop / argument; it should continue to do so. If it accepts a payload object, the discriminator field name must be `mode` (matching the new `OpdSessionPayload` discriminator).

- [ ] If `useDoctorDayPipeline` reads from `doctor_settings.opd_mode` anywhere (directly or via a hook), refactor it to accept the mode as a parameter or read it from the payload. The hook should be mode-agnostic; the caller provides the discriminator.

- [ ] **Snapshot test stability.** If the hook has snapshot tests, they should remain green (no behaviour change, only the data source above the hook changes).

### Step 5 — Verification (deterministic)

- [ ] **Type-check + lint:**

  ```bash
  pnpm --filter frontend tsc --noEmit
  pnpm --filter backend tsc --noEmit
  pnpm --filter frontend lint
  pnpm --filter backend lint
  ```

  All clean.

- [ ] **Grep sweep** — the swap is complete only if:

  ```bash
  rg "doctor_settings\.opd_mode|opd_mode\s*=\s*['\"]" backend/src/services/opd-snapshot-service.ts backend/src/services/opd/opd-policy-service.ts frontend/components/opd/OpdTodayClient.tsx
  # Expected: zero matches.

  rg "resolveOpdModeFromSettings" backend/src/services/opd-snapshot-service.ts backend/src/services/opd/opd-policy-service.ts
  # Expected: zero matches.

  rg "resolveSessionDayMode" backend/src/services/opd-snapshot-service.ts backend/src/services/opd/opd-policy-service.ts
  # Expected: one match each.

  rg "getDoctorOpdSession\b" frontend/components/opd/OpdTodayClient.tsx
  # Expected: at least one match (the initial fetch + the polling refetch).

  rg "getDoctorOpdSlotSession\b|getDoctorOpdQueueSession\b" frontend/components/opd/OpdTodayClient.tsx
  # Expected: zero matches.
  ```

- [ ] **Visible bug fix smoke** — the test the user originally reported:

  1. Find or create a doctor with `doctor_settings.opd_mode = 'slot'`.
  2. Manually insert a `doctor_opd_session_modes` row for a past date (e.g., yesterday) with `mode = 'queue'`. *(In production this would be the backfill; in dev, the SQL is one line.)*
  3. Insert 2 fake `opd_queue_entries` rows for that doctor + date.
  4. Open `/dashboard/opd-today` as that doctor, navigate to yesterday.
  5. **Expected:** the queue list renders, showing the 2 token-bearing patients. Toolbar pill says "Queue".
  6. **Pre-pdm-03 behaviour (regression check):** without this task, the same UI would show the slot empty-state ("no slots booked").

- [ ] **Reverse smoke** — doctor with `opd_mode = 'queue'`, past date with `mode = 'slot'` fact + slot bookings → slot list renders.

- [ ] **Today smoke** — doctor with no `doctor_opd_session_modes` row for today, `opd_mode = 'slot'` → unified endpoint resolves `source: 'doctor_settings'`, returns slot mode, slot list renders. Toggle doctor to `opd_mode = 'queue'` → next refetch shows queue list. *(The toggle is allowed to change the rendering only on dates that haven't been materialised.)*

- [ ] **Patient snapshot smoke** — a patient with a queue-booked appointment opens their snapshot:

  - **Pre-pdm-03 (broken):** if the doctor has since flipped to slot mode, the snapshot shows slot-shaped UI (wrong).
  - **Post-pdm-03 (correct):** the snapshot uses the fact-table mode for the appointment's date → queue-shaped UI persists.

- [ ] **Grace gate smoke** — a patient with a queue-booked appointment 60 minutes after the scheduled time tries to join:

  - **Pre-pdm-03:** if the doctor has since flipped to slot mode, the grace gate enforces (rejects join because grace expired).
  - **Post-pdm-03:** the gate reads the fact-table mode for the appointment's date → queue → no grace enforcement → join allowed.

- [ ] **No regression in existing test suites:**

  ```bash
  pnpm --filter frontend test -- OpdTodayClient
  pnpm --filter backend test -- snapshot
  pnpm --filter backend test -- opd-policy
  ```

  All green. If any existing test asserts a specific mode-resolution shape, update it to the new shape (with PR note).

- [ ] **Slot-hub UI byte-identical** — open `/dashboard/opd-today` in slot mode on today; the 15-05-2026 slot-hub batch's surfaces (toolbar / filter / list / row actions) render identically to before. Same goes for queue mode (08-05-2026 batch's surfaces).

---

## Out of scope

- **Conversion flow** — pdm-04 onwards. Doctor still has no way to flip a single day's mode; only the global `doctor_settings.opd_mode` toggle exists, and now it only affects non-materialised dates.
- **Policy resolver implementation** — pdm-07. The `resolveModePolicyForDateStub` from pdm-02 stays in place; nothing in this task triggers materialisation via policy.
- **OPD-tab mode shortcut** — pdm-11. The pill stays a static badge.
- **Overrun tray** — pdm-09 + pdm-10. The snapshot payload from pdm-02 doesn't include `overrunCount` yet; pdm-09 adds it.
- **Removing the legacy `getDoctorOpdSlotSession` / `getDoctorOpdQueueSession` helpers from `frontend/lib/api.ts`** — defer. They still satisfy non-OPD-hub callers (if any). pdm-12 does the final sweep.
- **Removing `getDoctorOpdMode` from the backend** — defer. The function still serves the `doctor_settings.opd_mode` write path; only its read use in the three swap sites is being removed.

---

## Files expected to touch

**New:** none.

**Modified:**

- `frontend/components/opd/OpdTodayClient.tsx` (~60–100 LOC delta — biggest single-file change in the task; fetch swap + branching swap + polling refit).
- `backend/src/services/opd-snapshot-service.ts` (~15 LOC delta — one mode-resolution swap; rest of the snapshot-building code untouched).
- `backend/src/services/opd/opd-policy-service.ts` (~10 LOC delta — `assertSlotJoinAllowedForPatient` mode-resolution swap).
- `frontend/hooks/useDoctorDayPipeline.ts` (~10–30 LOC delta — only if it currently reads `opd_mode` from settings; otherwise unchanged).

**Tests:** existing tests for the three swap sites must continue to pass. If snapshot tests fail due to fixture data not having a `doctor_opd_session_modes` row, **update the fixture** (add a row in test setup) — don't loosen the test.

---

## Notes / open decisions

1. **Why is `useDoctorDayPipeline` only "audited" not refactored?** The hook is already mode-agnostic by design (per its post-08-05-2026 / 15-05-2026 shipping shape) — it takes mode as a parameter. The audit is a defensive check that it didn't accidentally pick up a `getDoctorOpdMode()` call somewhere. If it did, the refactor is one-line; if not, no change.
2. **Why pull the date from `appointment.appointment_date.slice(0, 10)` and not via a TZ-aware helper?** The doctor's TZ matters for *which date counts as today*, but for fact-table lookup, the appointment's stored UTC date is the right key — that's how the backfill (pdm-01) classified it. The slice is correct **as long as `appointment_date` is stored as ISO datetime with explicit TZ**, which it is. If a future audit reveals a TZ bug, fix it once at the snapshot layer; this task uses the same slice the backfill used.
3. **What if the fact table doesn't have a row for a given booking (e.g., a booking made on a future date before pdm-07's policy-default code path runs)?** `resolveSessionDayMode` falls through to `doctor_settings.opd_mode` per its cascade — same as today's behaviour for that date. The bug fix is for **past** dates (where backfill materialised every touched day) and for **flipped** future dates (where pdm-04 conversion writes a fact row). Brand-new future dates with no booking yet still behave as today.
4. **Could polling create a stampede if every 30s the unified endpoint calls the resolver?** The resolver is one indexed lookup on `(doctor_id, session_date)` (PK hit). Per-doctor polling tops out at 2 RPS; nominal load. The `listDoctorSlotSession` / `listDoctorQueueSession` call below it is the bigger cost.
5. **What if `setSessionPayload` runs after the component unmounts?** The cancelled-flag pattern in the `useEffect` guards against this. The slot-hub batch already established this pattern; mirror it exactly.
6. **`OpdSessionPayload` includes `modeSource` and `modeChangeCount`. Does this task use them?** Not yet — pdm-11 reads `modeChangeCount` for the DL-14 nudge; debugging UIs may read `modeSource`. This task accepts the fields and ignores them; future tasks consume them.
7. **`OpdTodayClient.tsx` may have ESLint rules about `useEffect` deps.** Be explicit about `[token, sessionDate]` deps to prevent re-fetches when other props change. The polling effect should likely be a separate `useEffect` with its own dep array including `mode` (to swap interval semantics if needed).

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:**
  - `backend/src/services/opd/opd-mode-service.ts` (post-pdm-02) — `resolveSessionDayMode` API.
  - `frontend/types/opd-session.ts` (post-pdm-02) — discriminated union shape.
  - `frontend/lib/api.ts` (post-pdm-02) — `getDoctorOpdSession` API helper.
- **Source decisions:** [Product plans/plan-opd-per-day-mode.md § DL-1, DL-11](../../../Product%20plans/plan-opd-per-day-mode.md).
- **Wave gate:** [`EXECUTION-ORDER-opd-per-day-mode.md` § Wave 1 gate](./EXECUTION-ORDER-opd-per-day-mode.md#wave-1-gate-after-pdm-03).
- **Previous task:** [`task-pdm-02-unified-session-endpoint.md`](./task-pdm-02-unified-session-endpoint.md) — must be merged or green on the same branch.
- **Next task:** [`task-pdm-04-conversion-service.md`](./task-pdm-04-conversion-service.md) — fresh Opus chat (the conversion algorithm).

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
