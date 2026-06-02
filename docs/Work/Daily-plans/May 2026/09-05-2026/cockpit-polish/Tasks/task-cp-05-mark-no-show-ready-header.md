# Task cp-05: Mark-no-show ghost link in `<CockpitHeader>` ready state (pre-call no-show flow)

## 09 May 2026 — Batch [Cockpit polish](../plan-cockpit-polish-batch.md) — Phase 3, Lane ε step 1 (sequenced after cp-09) — **S, ~2h**

---

## Task overview

Today, "Mark no-show" lives only in the **in-call** control bars of `VideoRoom` and `VoiceConsultRoom`. That's a problem: by far the most common no-show flow is *the patient never showed up at all* — the doctor opens the cockpit at appointment time, sees `state === "ready"`, waits 5 min, and needs to mark the visit as a no-show without first starting a session they never intended.

This task adds a **quiet ghost-link** "Mark no-show" to `CockpitHeader`'s `ready` state, **only** when the appointment is actually overdue. Specifically:

- Visible when `appointment_date <= now() + 5 min` (i.e. scheduled time is past, or within 5 min of now). This avoids pre-empting a patient who's running 30 min early.
- For OPD queue mode (no scheduled time), visible whenever the patient is in the active bucket. Queue patients are by definition "expected now-ish".
- Hidden in all other states (`live`, `wrap_up`, `ended`, `terminal`) — those have their own no-show affordances.

The link uses the **same two-step confirm pattern** that `VideoRoom` and `VoiceConsultRoom` use, and calls the cockpit's existing `onMarkNoShow` callback (already plumbed in `ConsultationCockpit.tsx`).

**Estimated time:** ~2h. Tight visual + behavioural spec on top of the cp-09 layout rewrite.

**Status:** Pending.

**Hard deps:** **cp-09** — this task slots the ghost link into the new two-row header layout. cp-09 must ship first (within lane ε) so this task knows where the link goes.

**Source:** [plan-cockpit-polish-batch.md § CP-D5](../plan-cockpit-polish-batch.md#decision-lock-locked-2026-05-09-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** (or stitched after cp-09 inside lane ε if cp-09's chat is small enough). Pre-load:
- This task file.
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (the cp-09 output — read the new ready-state branch).
- `frontend/components/consultation/VideoRoom.tsx` (read the existing two-step confirm pattern for parity).
- `frontend/components/consultation/ConsultationCockpit.tsx` (read `handleMarkNoShow` — already exists; threaded down to rooms).

**Estimated turns:** 2 turns.

---

## Acceptance criteria

### Step 1: visibility predicate

- [ ] Add a helper inside `CockpitHeader.tsx` (or in `frontend/lib/consultation/` if you prefer to share with cp-06):

  ```ts
  /**
   * CP-D5: Mark-no-show is reachable in pre-call only when the appointment
   * is overdue or imminent. Hides the affordance for early arrivals so the
   * doctor doesn't pre-empt a patient who's running 30 min ahead of schedule.
   *
   * Returns true when:
   *  - OPD queue mode + appointment is in the active bucket (always overdue-ish), OR
   *  - scheduled appointment time is within 5 min of now() or in the past.
   */
  function shouldOfferMarkNoShowInReady(
    appt: Appointment,
    isOpdQueueMode: boolean,
    now: Date = new Date(),
  ): boolean;
  ```

- [ ] OPD queue mode detection: read `appt.opd_event_type` (set by the queue-creation path; non-null when in queue mode). If it's non-null, return `true` regardless of `appointment_date`.
- [ ] Otherwise: parse `appt.appointment_date` as ISO-8601, compare with `now + 5 min`. Return `true` if `appointmentTime <= now + 5min`.
- [ ] Defensive: if `appointment_date` is malformed / null, return `true` (better to expose the affordance than hide it for legacy data).

### Step 2: render the link in the `ready` branch

- [ ] In the new two-row layout from cp-09, add a quiet ghost-style link in **row 2** (the secondary metadata row) at the **right end**, after the OPD token chip:

  ```tsx
  {state === "ready" && shouldOfferMarkNoShowInReady(appt, isOpdQueueMode) && (
    <button
      type="button"
      onClick={handleMarkNoShowClick}
      disabled={markNoShowBusy}
      className={cn(
        "ml-auto inline-flex items-center gap-1 rounded text-xs font-medium",
        "text-muted-foreground/80 hover:text-destructive focus:outline-none",
        "focus:ring-2 focus:ring-destructive/40 transition-colors",
        markNoShowBusy && "opacity-60 cursor-progress"
      )}
      aria-label="Mark patient as no-show"
    >
      <UserX className="h-3 w-3" aria-hidden />
      {markNoShowConfirm ? "Confirm no-show?" : "Mark no-show"}
    </button>
  )}
  ```

- [ ] The link's text colour resting state is `text-muted-foreground/80` (quiet); on hover it goes to `text-destructive`. Uses `lucide-react`'s `<UserX>` icon at 12 px.
- [ ] **Two-step confirm:** first click flips internal state `markNoShowConfirm = true` and changes the label to "Confirm no-show?". Second click calls `onMarkNoShow()`. State auto-resets after 4 seconds if no second click.

### Step 3: 2-step confirm logic

- [ ] Mirror the pattern in `VideoRoom.tsx`:

  ```tsx
  const [markNoShowConfirm, setMarkNoShowConfirm] = useState(false);
  const [markNoShowBusy, setMarkNoShowBusy] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMarkNoShowClick = useCallback(async () => {
    if (markNoShowBusy) return;
    if (!markNoShowConfirm) {
      setMarkNoShowConfirm(true);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setMarkNoShowConfirm(false), 4_000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setMarkNoShowBusy(true);
    try {
      await onMarkNoShow?.();
      // success → state changes upstream (appt.status flips to 'no_show'),
      // header re-derives → state goes to 'terminal' → this branch unmounts.
    } catch (err) {
      // surface in the existing inline error band that ConsultationCockpit owns.
      console.error("[CockpitHeader] Mark no-show failed:", err);
    } finally {
      setMarkNoShowBusy(false);
      setMarkNoShowConfirm(false);
    }
  }, [markNoShowConfirm, markNoShowBusy, onMarkNoShow]);

  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);
  ```

- [ ] **Re-use `onMarkNoShow` prop** that `CockpitHeader` already accepts. If the prop is currently optional, **confirm** the cockpit threads it through unconditionally — open `ConsultationCockpit.tsx` and verify (it should — the prop is set up for the in-call rooms).

### Step 4: error surfacing

- [ ] `ConsultationCockpit.tsx` already owns an inline error band for `finishError`. If `onMarkNoShow` throws, surface the same way: set a `markNoShowError` state in the cockpit, render the same `<AlertCircle>` band. Add this state + handler to the cockpit (mirroring `finishError`).

  Defer this to the cockpit-level: in this task, just `await onMarkNoShow?.()` and let the parent component decide where the error goes. (Lane safety: this task only touches `CockpitHeader.tsx`. The error-band addition in `ConsultationCockpit.tsx` is a tiny incremental change but does cross-lane — keep this task scoped to the header. If the cockpit doesn't have the band hooked up, escalate as a follow-up note in the close-gate.)

### Step 5: tests

- [ ] Add a unit test for `shouldOfferMarkNoShowInReady`:

  ```ts
  it('returns true when appointment is overdue', () => {
    expect(shouldOfferMarkNoShowInReady(
      { ...fixture, appointment_date: '2025-01-01T10:00:00Z' },
      false,
      new Date('2025-01-01T10:30:00Z'),
    )).toBe(true);
  });

  it('returns false when appointment is more than 5 min away (slot mode)', () => {
    expect(shouldOfferMarkNoShowInReady(
      { ...fixture, appointment_date: '2025-01-01T10:00:00Z' },
      false,
      new Date('2025-01-01T09:50:00Z'),
    )).toBe(false);
  });

  it('returns true regardless of time in OPD queue mode', () => {
    expect(shouldOfferMarkNoShowInReady(
      { ...fixture, appointment_date: '2025-01-01T18:00:00Z' },
      true,
      new Date('2025-01-01T09:00:00Z'),
    )).toBe(true);
  });
  ```

  Co-locate in `frontend/components/consultation/cockpit/__tests__/CockpitHeader.test.tsx` or a new dedicated test file.

### Type-check + lint

- [ ] Clean.
- [ ] Visual smoke: in dev, force the cockpit into `ready` state via a fixture with `appointment_date = now - 10min`, confirm the link renders. Force `appointment_date = now + 30min`, confirm it's hidden.

---

## Out of scope

- **In-call no-show** — already shipped in `VideoRoom` and `VoiceConsultRoom`. cp-06 (lane γ) adds it to `TextConsultRoom`.
- **Backend changes** — the `postDoctorMarkNoShow` API client and the `POST /opd/appointments/:id/mark-no-show` route already exist (shipped by `oq-09`).
- **Two-row layout** — cp-09 (sequenced before this task in lane ε) ships the layout. This task only adds one button to it.
- **`ConsultationCockpit.tsx` error-band addition** — small incremental change, but to keep lane safety, this task lets errors fall through to the existing `finishError` band path or `console.error`. Add a follow-up close-gate note if the experience is jarring.

---

## Files expected to touch

**Modified:**
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (~80 LOC — visibility predicate + button + 2-step state machine)
- `frontend/components/consultation/cockpit/__tests__/CockpitHeader.test.tsx` (or new test file — ~60 LOC for visibility predicate tests)

**New:** none (helper lives inside CockpitHeader.tsx unless you choose to extract).

---

## Notes / open decisions

1. **Why a ghost link, not a button?** Visual hierarchy. The `ready` state has a primary `Start consult` CTA — the no-show affordance must visibly defer to it. A muted ghost-link in the metadata row signals "secondary destructive action; only use if you need it".
2. **Why not just always show it?** Pre-empts patients running early. A doctor that opens the cockpit at 9:55 for a 10:00 appointment would otherwise see "Mark no-show" 5 min before the patient is even due. Wrong signal.
3. **Why a 5-min grace window before showing it?** Gives the doctor a small overlap zone. At 9:55 (5 min ahead of a 10:00 appointment) the link is visible, which is fine — the doctor is unlikely to hit it accidentally because of the 2-step confirm.
4. **What about appointments that have no `appointment_date` (legacy)?** Defensive: show the link. Worst case the doctor is one accidental click + confirm away from a no-show, which is still gated.
5. **Why 4 seconds for the confirm timeout?** Same as `VideoRoom` and `VoiceConsultRoom`. Long enough that a doctor can read the "Confirm no-show?" copy and decide; short enough that a stale primed state doesn't survive across patients.

---

## References

- **Style precedent (2-step confirm):** `frontend/components/consultation/VideoRoom.tsx § handleMarkNoShowClick`
- **Style precedent (2-step confirm):** `frontend/components/consultation/VoiceConsultRoom.tsx § handleMarkNoShowClick`
- **API client (already shipped):** `frontend/lib/api.ts § postDoctorMarkNoShow`
- **Cockpit-level handler (already wired):** `frontend/components/consultation/ConsultationCockpit.tsx § handleMarkNoShow`
- **Two-row layout this task lands in:** [task-cp-09-cockpit-header-two-row-layout.md](./task-cp-09-cockpit-header-two-row-layout.md)
- **Counterpart task:** [task-cp-06-mark-no-show-text-room.md](./task-cp-06-mark-no-show-text-room.md) — same affordance for in-call text consult.

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Pending
