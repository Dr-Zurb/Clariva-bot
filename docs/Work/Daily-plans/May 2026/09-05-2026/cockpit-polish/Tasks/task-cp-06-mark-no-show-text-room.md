# Task cp-06: Mark-no-show button in `<TextConsultRoom>` (in-call parity with video / voice)

## 09 May 2026 — Batch [Cockpit polish](../plan-cockpit-polish-batch.md) — Phase 3, Lane γ step 0 — **S, ~2h**

---

## Task overview

`VideoRoom.tsx` and `VoiceConsultRoom.tsx` both expose an in-call "Mark no-show" button next to "End call". `TextConsultRoom.tsx` does not — it accepts an `onEnd` prop but no `onMarkNoShow` prop, so a doctor in a text consult who realises the patient never engaged has no in-room affordance to flag the visit correctly. They have to leave the cockpit, navigate to the appointment detail page, and use the page-level no-show action.

This task adds a destructive-ghost button to `TextConsultRoom`'s footer (next to "End chat") with the **same two-step confirm pattern** used in the other rooms, and threads an `onMarkNoShow` prop through `ConsultationLauncher.tsx` to make it available.

**Estimated time:** ~2h. Mostly mechanical clone of the video/voice room pattern; the main subtlety is figuring out where in the text room's footer the button goes (text room has a different layout than the call rooms).

**Status:** Pending.

**Hard deps:** none. **Lane safety:** lane γ owns `TextConsultRoom.tsx` exclusively. `ConsultationLauncher.tsx` is touched by this task only for a 1-line prop forward (no other lane writes to it).

**Source:** [plan-cockpit-polish-batch.md § CP-D5](../plan-cockpit-polish-batch.md#decision-lock-locked-2026-05-09-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/components/consultation/TextConsultRoom.tsx` (the file to extend — focus on the footer / control bar).
- `frontend/components/consultation/VideoRoom.tsx` (read-only — clone the 2-step confirm pattern + button styling).
- `frontend/components/consultation/VoiceConsultRoom.tsx` (read-only — same pattern, simpler styling for non-video).
- `frontend/components/consultation/ConsultationLauncher.tsx` (find where `onMarkNoShow` is passed to `<VideoRoom>` and `<VoiceConsultRoom>`).
- `frontend/components/consultation/ConsultationCockpit.tsx` (read-only — confirm `handleMarkNoShow` is already in scope and routed).

**Estimated turns:** 2 turns.

---

## Acceptance criteria

### Step 1: extend `TextConsultRoom`'s prop interface

- [ ] Add `onMarkNoShow?: () => Promise<void> | void;` to the existing prop interface. Keep optional so older callers don't break.

  ```ts
  interface TextConsultRoomProps {
    // ... existing props
    onEnd?: () => void;
    onMarkNoShow?: () => Promise<void> | void;  // ← new
    // ... existing props
  }
  ```

### Step 2: 2-step confirm state inside the component

- [ ] Add the same state block used in `VideoRoom`:

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
    } catch (err) {
      console.error("[TextConsultRoom] Mark no-show failed:", err);
    } finally {
      setMarkNoShowBusy(false);
      setMarkNoShowConfirm(false);
    }
  }, [markNoShowConfirm, markNoShowBusy, onMarkNoShow]);

  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);
  ```

### Step 3: render the button in the footer

- [ ] In the text room's footer / control bar, add the button **next to** the "End chat" button. The exact location depends on the existing footer layout — it should be a sibling, **left** of "End chat" with a small visual gap (`ml-auto` on End-chat, button group on the right).

  ```tsx
  <div className="flex items-center gap-2 border-t border-border bg-background px-4 py-3">
    {/* ... existing left-side controls ... */}

    {/* CP-D5: in-call mark-no-show parity with video / voice rooms */}
    {onMarkNoShow && (
      <button
        type="button"
        onClick={handleMarkNoShowClick}
        disabled={markNoShowBusy}
        className={cn(
          "ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium",
          "border-destructive/40 text-destructive hover:bg-destructive/5",
          "focus:outline-none focus:ring-2 focus:ring-destructive/40",
          markNoShowBusy && "opacity-60 cursor-progress"
        )}
        aria-label="Mark patient as no-show"
      >
        <UserX className="h-3.5 w-3.5" aria-hidden />
        {markNoShowConfirm ? "Confirm no-show?" : "Mark no-show"}
      </button>
    )}

    <button
      type="button"
      onClick={onEnd}
      className="..."  // existing End chat button
    >
      End chat
    </button>
  </div>
  ```

- [ ] Use the **destructive-ghost** style (border `border-destructive/40`, text `text-destructive`, hover `hover:bg-destructive/5`) — same as the video/voice room pattern.

### Step 4: thread the prop in `ConsultationLauncher.tsx`

- [ ] Find where `<TextConsultRoom>` is mounted (search for `<TextConsultRoom`). The launcher already passes `onMarkNoShow` to `<VideoRoom>` and `<VoiceConsultRoom>`. Add the same prop to the `<TextConsultRoom>` mount:

  ```tsx
  <TextConsultRoom
    // ... existing props
    onEnd={handleTextEnd}
    onMarkNoShow={onMarkNoShow}   // ← new (mirror video/voice path)
  />
  ```

- [ ] If `ConsultationLauncher` does not already accept `onMarkNoShow` as one of its top-level props (it should — the cockpit threads it through for video/voice), confirm and don't change the launcher's external signature. Just forward what's there.

### Step 5: tests

- [ ] If existing TextConsultRoom unit tests exist, add an interaction test:

  ```ts
  it('renders Mark-no-show button when onMarkNoShow prop is provided and uses 2-step confirm', async () => {
    const onMarkNoShow = vi.fn();
    render(<TextConsultRoom {...baseProps} onMarkNoShow={onMarkNoShow} />);
    const btn = screen.getByRole('button', { name: /mark patient as no-show/i });
    expect(btn).toHaveTextContent(/mark no-show/i);
    fireEvent.click(btn);
    expect(btn).toHaveTextContent(/confirm no-show/i);
    expect(onMarkNoShow).not.toHaveBeenCalled();
    fireEvent.click(btn);
    await waitFor(() => expect(onMarkNoShow).toHaveBeenCalledTimes(1));
  });

  it('hides Mark-no-show button when onMarkNoShow prop is absent', () => {
    render(<TextConsultRoom {...baseProps} onMarkNoShow={undefined} />);
    expect(screen.queryByRole('button', { name: /mark.*no-show/i })).toBeNull();
  });
  ```

  If no test infrastructure exists for `TextConsultRoom`, document this in the close-gate and add visual verification only.

### Type-check + lint

- [ ] Clean.
- [ ] Visual smoke: enter a text consult, verify the button renders next to "End chat", click once → label changes, click again → calls the no-show endpoint, appointment status flips to `no_show`, cockpit transitions to `terminal` state.

---

## Out of scope

- **Pre-call header no-show** — that's `cp-05` (lane ε). This task only handles the in-call text-room.
- **VideoRoom / VoiceConsultRoom changes** — they already work; don't touch them.
- **Backend changes** — `postDoctorMarkNoShow` already exists.
- **`onMarkNoShow` prop type changes at the cockpit level** — already threaded through video/voice path; reuse exactly.

---

## Files expected to touch

**Modified:**
- `frontend/components/consultation/TextConsultRoom.tsx` (~70 LOC — prop + state + button)
- `frontend/components/consultation/ConsultationLauncher.tsx` (1 LOC — prop forward)

**New:** none (or one test file if not already present).

---

## Notes / open decisions

1. **Why ghost-destructive, not solid-destructive?** End-chat is the destructive primary action in this footer. Mark-no-show is destructive **secondary**. Ghost styling visually defers without disappearing.
2. **Why "left of End chat" specifically?** Text room layout has `End chat` typically right-aligned. Putting Mark-no-show immediately left puts the two destructive actions in a single visual cluster, which matches the video/voice pattern.
3. **What if the user has typed a draft message but the patient never showed up?** Mark-no-show is a hard transition — appointment status → `no_show`, cockpit state → `terminal`. The draft message is lost. This matches the video/voice room behaviour (you can't have a "soft" no-show that preserves chat state). Document this in the close-gate as expected behaviour.
4. **Why do we need a button at all if the patient is "not engaging"?** The "patient never engaged" case is real in text consults — the doctor sends "Hi, I'm here" and the patient doesn't reply for 30 min. Today the doctor would type "End chat" and end the session normally, then have to navigate elsewhere to flag the visit as no-show. With this button, it's one in-room action.
5. **How does the cockpit know to flip to `terminal`?** The `onMarkNoShow` callback (already plumbed at cockpit level) calls `postDoctorMarkNoShow(appt.id)` which the backend response then drives `setAppt(updated)`. The new appointment status `no_show` re-derives the cockpit state to `terminal`, the room unmounts, and the `<TerminalCard>` takes over. Confirm by manual smoke.

---

## References

- **Style precedent (2-step confirm + button):** `frontend/components/consultation/VideoRoom.tsx`
- **Style precedent (simpler styling):** `frontend/components/consultation/VoiceConsultRoom.tsx`
- **API client:** `frontend/lib/api.ts § postDoctorMarkNoShow`
- **Cockpit-level handler:** `frontend/components/consultation/ConsultationCockpit.tsx § handleMarkNoShow`
- **Counterpart task:** [task-cp-05-mark-no-show-ready-header.md](./task-cp-05-mark-no-show-ready-header.md) — pre-call ghost link in CockpitHeader.

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Pending
