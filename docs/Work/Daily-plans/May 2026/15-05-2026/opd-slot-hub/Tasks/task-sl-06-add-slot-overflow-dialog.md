# Task sl-06: Add-slot / overflow dialog (toolbar + per-row triggers)

## 15 May 2026 — Batch [OPD Slot Hub](../plan-opd-slot-hub-batch.md) — Wave 3, Lane α step 0 — **S, ~1.5h**

---

## Task overview

Wire the end-of-session overflow / extra-slot dialog. Surfaced from three places:

1. **Toolbar "Add slot" button** — opens the dialog in default mode (`Extra slot`, time defaults to next round 5-minute mark).
2. **Per-row "Approve overflow"** action on `running_late` rows — opens the dialog in `Overflow` mode with the source row pre-filled as `related_appointment_id`.
3. **Per-row "Convert to overflow"** action on `missed` rows — same pre-fill.
4. **Per-row "Post-consult return"** action on `completed` rows — opens the dialog in `Overflow` mode with `opd_event_type='return_after_completed'`.

The dialog POSTs to the existing `POST /api/v1/appointments` endpoint (the manual-booking path used by the existing booking flow). **No new backend endpoint** — this task is pure frontend.

On success: snapshot refetches; the new row appears under the `Overflow` section (per sl-04's sectioning).

This wave is **Cut 3 — kind-of-work change** per [EXECUTION-ORDER-GUIDELINES § 0.5](../../../../../EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves): incremental polish on an already-shipped surface. Can ship same-day-as-Wave-2 or a few days later without blocking the rest of the batch.

**Estimated time:** ~1.5h (0.75h dialog component + form + validation, 0.5h trigger wiring (toolbar + 3 row actions), 0.25h smoke + verification).

**Status:** Pending (optional — Wave 2 ships the doctor-facing operational hub without this).

**Hard deps:** sl-05 (Wave 2 closed; toolbar + row actions exist with the disabled stubs sl-06 enables).

**Source:** [plan-opd-slot-hub-batch.md § Wave 3](../plan-opd-slot-hub-batch.md#wave-3--add-slot--overflow-dialog-1-task-15h-single-sequential-lane-optional) + `S1.6` and `DL-7` in [Product plans/plan-opd-slot-hub.md](../../../../Product%20plans/plan-opd-slot-hub.md).

---

## Model & execution guidance

**Recommended model:** **Composer 2 Fast** (or Auto). Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) § Tier 4 — Composer 2 is right for "form-and-API plumbing when you already know the fix." Dialog primitives are already in `frontend/components/ui/dialog.tsx`; form validation is straightforward; the optimistic-refetch dance follows existing patterns. At $0.50 / $2.50 per M tokens, Composer 2 is the cheapest pool option. **Not on the hard-rules list:** no security primitives, no PHI handling beyond the existing booking-flow patient-name field, no migration. Auto is also fine if you don't want to switch the picker.

**Per-message escalation rule:** unlikely to be needed — if Composer 2 stalls on a non-trivial decision, escalate that **one message** to Opus 4.7 Extra High; don't switch the whole chat to Sonnet.

**Manual-Sonnet fallback:** only if both Composer 2 and Auto produce visibly worse output (extremely unlikely on this task).

(Composer 2 Fast is also acceptable here — the spec is tight, the dialog has minimal judgement, and the wiring is mechanical. Sonnet's edge: it picks up the existing `Dialog` + `useForm` patterns from one read of the precedent without prompting. Pick whichever pool you prefer; the result is the same.)

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `frontend/components/opd/OpdSlotSessionToolbar.tsx` (post-sl-02 — the trigger lives here; the `addSlotTriggerSlot` prop is the mount point).
- `frontend/components/opd/OpdSlotRowActions.tsx` (post-sl-04 — the disabled "Approve overflow" / "Convert to overflow" / "Post-consult return" items are sl-06's targets).
- `frontend/components/opd/OpdTodayClient.tsx` (post-sl-05 — the parent passes `onOpenAddSlotDialog` to row actions; sl-06 wires the dialog state here).
- `frontend/components/ui/dialog.tsx` (the dialog primitive — verify the API; likely shadcn-style `<Dialog>` / `<DialogTrigger>` / `<DialogContent>`).
- `frontend/lib/api.ts` — find the existing `createAppointment` / `postAppointmentManualBooking` helper. (If neither exists, find whatever helper `frontend/components/booking/` uses — the doctor-side booking flow.)
- `backend/src/types/database.ts` lines 120–210 (`Appointment.opd_event_type` column shape).
- `frontend/components/opd/DoctorOpdSlotActions.tsx` (per-appointment slot actions — for context on the existing per-slot UX patterns).
- Source plan §DL-7 (per-row actions matrix) + §SL-Q4 (overflow as sub-state badge).

**Estimated turns:** 2–3 turns (1 turn dialog component + form + API call, 1 turn trigger wiring across toolbar + 3 row actions, 1 turn verification).

---

## Acceptance criteria

### Step 1 — `AddSlotDialog.tsx`

- [ ] Create `frontend/components/opd/AddSlotDialog.tsx`. Component shape:

  ```tsx
  export type AddSlotDialogMode = "extra-slot" | "overflow";

  export interface AddSlotDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: AddSlotDialogMode;
    /** Slot date as YYYY-MM-DD; defaults to the parent's current sessionDate. */
    sessionDate: string;
    /** For "overflow" mode triggered from a row action — links the new row to the source row. */
    relatedAppointmentId?: string | null;
    token: string;
    /** Refetch snapshot after success. */
    onSuccess: () => void;
  }
  ```

- [ ] **Form fields:**
  - **Mode toggle** (top of dialog body) — segmented control: `[Extra slot] [Overflow]`. Active mode controls which fields are shown + which time defaulting applies. Disabled if `relatedAppointmentId` is set (in which case mode is locked to `Overflow`).
  - **Patient name** (text input, required). Free-text. Defaults blank.
  - **Patient phone** (text input, optional). Defaults blank. Validation: if non-empty, must match `/^\+?[\d\s-]{6,}$/` (lenient).
  - **Time** (`<input type="time">`, required for `extra-slot` mode):
    - `extra-slot` default: round-up next 5-minute mark from `Date.now()` (e.g., 14:32 → 14:35).
    - `overflow` mode: hidden (the backend will compute as session-end + 5 min, OR sl-06 derives it client-side and sends it explicitly — pick whichever the existing manual-booking helper accepts).
  - **Reason for visit** (textarea, optional). Defaults blank.
  - **Notes** (textarea, optional). Defaults blank.

- [ ] **Submit button** label:
  - `extra-slot` → "Add slot at HH:MM".
  - `overflow` → "Add overflow slot".

- [ ] **Cancel button** — closes the dialog, no API call, no state change.

- [ ] **Validation** (client-side, on submit):
  - Patient name required (trimmed length ≥ 1).
  - Time required + parseable (extra-slot mode only).
  - Phone optional but format-validated when present.

- [ ] **API call** on submit:

  ```tsx
  const onSubmit = async () => {
    setSubmitting(true);
    try {
      const scheduledAt = mode === "extra-slot"
        ? combineDateAndTime(sessionDate, timeValue)  // YYYY-MM-DD + HH:MM → ISO
        : await deriveSessionEndPlusFive(sessionDate, token); // helper that reads the snapshot

      await createDoctorAppointment(token, {
        patientName: patientNameValue.trim(),
        patientPhone: patientPhoneValue.trim() || null,
        appointmentDate: scheduledAt,
        reasonForVisit: reasonValue.trim() || null,
        notes: notesValue.trim() || null,
        opdEventType: mode === "overflow" ? "return_after_completed" : "standard",
        relatedAppointmentId: relatedAppointmentId ?? null,
      });

      onSuccess();
      onOpenChange(false);
      trackOpdSlotEvent({
        event: "opd_slot.action",
        kind: mode === "overflow" ? "add_overflow" : "add_extra_slot",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add slot");
    } finally {
      setSubmitting(false);
    }
  };
  ```

  *(`createDoctorAppointment` may already exist under another name. Search `frontend/lib/api.ts` for `appointments` POST helpers; reuse the existing one or thinly wrap if needed.)*

- [ ] **Error handling** — render the error message inline above the submit button.

- [ ] **`deriveSessionEndPlusFive` helper.** Reads the parent's `slotEntries` (passed in or accessed via a callback). Finds `max(scheduledAt)` over all rows whose `slotStatus !== 'cancelled'`, adds 5 min, rounds up to the next 5-minute mark. If the day has no entries: defaults to `now + 5 min` rounded up.

- [ ] **Accessibility:**
  - Dialog has a `<DialogTitle>` ("Add slot" / "Add overflow slot").
  - Dialog has a `<DialogDescription>` explaining the mode (one sentence).
  - Form labels are properly associated with inputs.
  - Submit + cancel are reachable by Tab; Enter submits.
  - On open: focus moves to the patient-name input.

### Step 2 — Wire toolbar trigger

- [ ] In `OpdSlotSessionToolbar.tsx`, **render the `addSlotTriggerSlot`** as a button:

  ```tsx
  // sl-06: parent passes addSlotTriggerSlot=<button onClick={() => openDialog({mode: "extra-slot"})}>...</button>
  // The button content here is local to the toolbar so it can match the toolbar's button styling.
  ```

  Actually, better pattern: **the parent owns the dialog state**, the toolbar exposes a callback prop `onClickAddSlot`. Update the toolbar's props:

  ```tsx
  export interface OpdSlotSessionToolbarProps {
    /* ...existing... */
    /** sl-06: shown as a "+ Add slot" button in the toolbar's right rail. Defaults to undefined (button hidden). */
    onClickAddSlot?: () => void;
  }
  ```

  Render the button only if `onClickAddSlot` is defined:

  ```tsx
  {onClickAddSlot && (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 px-2 text-xs"
      onClick={onClickAddSlot}
    >
      <Plus className="mr-1 h-3.5 w-3.5" />
      Add slot
    </Button>
  )}
  ```

- [ ] Drop the `addSlotTriggerSlot` prop from sl-02 (the named-slot pattern; replace with the simpler callback).

### Step 3 — Wire per-row trigger

- [ ] In `OpdSlotRowActions.tsx` (post-sl-04), **enable** the disabled menu items:
  - `running_late` → enable "Approve overflow"; on click call `onOpenAddSlotDialog?.({ mode: "overflow", relatedAppointmentId: entry.appointmentId })`.
  - `missed` → enable "Convert to overflow"; same call.
  - `completed` → enable "Post-consult return"; same call.

- [ ] Drop the disabled-state tooltips ("Available after sl-06 ships") from these items.

### Step 4 — Wire dialog state in `OpdTodayClient.tsx`

- [ ] Add slot-mode dialog state at the top of `OpdTodayClient`:

  ```tsx
  // ── AddSlotDialog state (sl-06) ────────────────────────────────────────
  const [addSlotDialog, setAddSlotDialog] = useState<{
    open: boolean;
    mode: AddSlotDialogMode;
    relatedAppointmentId: string | null;
  }>({ open: false, mode: "extra-slot", relatedAppointmentId: null });

  const openAddSlotDialog = useCallback(
    (opts?: { mode?: AddSlotDialogMode; relatedAppointmentId?: string | null }) => {
      setAddSlotDialog({
        open: true,
        mode: opts?.mode ?? "extra-slot",
        relatedAppointmentId: opts?.relatedAppointmentId ?? null,
      });
    },
    []
  );
  ```

- [ ] Pass `onClickAddSlot={() => openAddSlotDialog({ mode: "extra-slot" })}` to the toolbar.

- [ ] Pass `onOpenAddSlotDialog={openAddSlotDialog}` through to `OpdSlotList` → `OpdSlotRowActions`.

- [ ] Mount the dialog at the bottom of the slot branch:

  ```tsx
  <AddSlotDialog
    open={addSlotDialog.open}
    onOpenChange={(open) =>
      setAddSlotDialog((prev) => ({ ...prev, open }))
    }
    mode={addSlotDialog.mode}
    sessionDate={sessionDate}
    relatedAppointmentId={addSlotDialog.relatedAppointmentId}
    token={token}
    onSuccess={fetchSlotSnapshot}
  />
  ```

### Step 5 — Verification

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] **Smoke** (logged in as a slot-mode doctor):
  - Toolbar shows "+ Add slot" button. Click → dialog opens. Mode toggle is `[Extra slot]` highlighted. Time defaults to next round 5 minutes. Submit with patient name "Test Patient" → dialog closes; snapshot refetches; new row appears in the list at the chosen time.
  - On a `running_late` row: hover → `⋯` → "Approve overflow" is enabled. Click → dialog opens in `Overflow` mode. Mode toggle is locked. `relatedAppointmentId` (visible only as a hidden form field or a small "Linked to: <patient>" label) is the source row. Submit → new row appears under the `Overflow` section with the `Overflow` badge.
  - On a `missed` row: same flow via "Convert to overflow".
  - On a `completed` row: same flow via "Post-consult return".
  - Validation: submit with empty patient name → inline error "Patient name is required". Submit with invalid phone → inline error.
  - Cancel → dialog closes; no row added; no API call (verify in Network tab).
  - Telemetry: `opd_slot.action` event fires with `kind: "add_overflow"` or `kind: "add_extra_slot"`.
- [ ] **Backend regression** — no change to backend code. Existing manual-booking tests stay green.
- [ ] `rg "AddSlotDialog" frontend/` returns the new component file + the toolbar mount (the parent's `<AddSlotDialog />`) + the row-actions trigger (passes `onOpenAddSlotDialog`). Three+ matches expected.
- [ ] **Backwards-compat:** queue-mode behaviour unchanged. Per-appointment `<DoctorOpdSlotActions>` unchanged.

---

## Out of scope

- **Allowing the dialog to add a slot for a date OTHER than the toolbar's current session date** — defer. v1 always uses `sessionDate`. If a doctor wants to add a slot for tomorrow, they switch the date picker first.
- **Searching for an existing patient by name / phone to attach to the new appointment** — defer. v1 is free-text only (mirrors the existing manual-booking flow). A patient picker is a separate UX problem.
- **Time-collision warning** ("This time overlaps with an existing slot") — defer. Doctors can see the existing rows in the list; if the spec proves wrong, add the warning in a follow-up.
- **Bulk add slot** ("Add 3 slots starting at 14:00, every 10 min") — out of scope.
- **A backend endpoint that infers `appointment_date` from `session-end + 5min`** — backend stays untouched per DL-11. The client-side helper handles the math.
- **Backwards-compat with cancelled / no-show overflow workflows** — sl-06 covers the three triggers in DL-7. Other states (`upcoming` / `grace` / `in_consultation` / `cancelled`) don't get an "add overflow" affordance because the current row is the natural action target, not an overflow.

---

## Files expected to touch

**New:**

- `frontend/components/opd/AddSlotDialog.tsx` (~250 LOC — form + validation + API call + accessibility).

**Modified:**

- `frontend/components/opd/OpdSlotSessionToolbar.tsx` (~20 LOC delta — drop `addSlotTriggerSlot` named-slot prop; add `onClickAddSlot` callback; render the "+ Add slot" button when callback is present).
- `frontend/components/opd/OpdSlotRowActions.tsx` (~20 LOC delta — enable the three previously-disabled menu items; remove their disabled tooltips).
- `frontend/components/opd/OpdTodayClient.tsx` (~30 LOC delta — add dialog state + `openAddSlotDialog` callback + mount the dialog + thread props through).

**Tests:** new tests for the `deriveSessionEndPlusFive` helper deferred to a follow-up if the helper proves error-prone in QA. Existing tests stay green.

---

## Notes / open decisions

1. **Why a single dialog with a mode toggle and not two separate dialogs?** The two modes differ by ~3 fields and one default. A toggle is cheaper than two near-identical components. The mode lock when `relatedAppointmentId` is set keeps the row-action flows clean (you can't accidentally pick the wrong mode).
2. **Why `relatedAppointmentId` as a column on the new row?** Migration 031 already added `appointments.related_appointment_id` for "return / addendum flows" (the column is in `backend/src/types/database.ts` line 178). The overflow row from a Late / Missed source naturally carries the link; doctors can later trace "this overflow was created because Mr. X ran 30 min over".
3. **Why `opd_event_type='return_after_completed'` for overflow?** Migration 031 defined `opd_event_type` as `'standard' | 'return_after_completed'`. Overflow slots are semantically returns / additions to the day; tagging them lets the snapshot's `deriveSlotStatus` route them into the `Overflow` bucket (sl-01 already handles this — DL-3 / sl-01 spec).
4. **Why doesn't the dialog let the doctor pick `opd_event_type` directly?** Defaulting based on mode is enough for v1. If a doctor wants to add a regular slot at the end of the day (not an overflow), they pick `Extra slot` mode. If they want an overflow row, they pick `Overflow` mode. The two modes map 1:1 to the two `opd_event_type` values for new rows.
5. **What if the backend rejects the manual-booking call for an unauthenticated reason?** The dialog renders the error message inline. The doctor can fix the input or cancel. No partial state.
6. **What if the snapshot refetch (`onSuccess` → `fetchSlotSnapshot`) returns the new row before the dialog has fully closed?** Race is benign — the list re-renders with the new row; the dialog closes; the doctor sees the new row appear in the Overflow section. No flicker because the snapshot's `setSlotEntries` updates the visible list directly.
7. **Telemetry — is `kind: "add_overflow"` the right label?** Yes; matches the existing `opd_slot.action` payload contract (`kind` is a string sub-action label). Analytics can group "add_overflow" + "add_extra_slot" by the event for "all add-slot dialog conversions".
8. **Why not a hotkey for "+ Add slot"?** Defer. Hotkeys are a separate UX problem; the visible toolbar button + the row-action menu items are sufficient surface area for v1. Cmd+N or similar can land in a follow-up.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:**
  - `frontend/components/ui/dialog.tsx` — primitive.
  - `frontend/lib/api.ts` — find the existing `createAppointment` helper.
  - `backend/src/types/database.ts` — `Appointment` shape (especially `opd_event_type`, `related_appointment_id`).
  - `frontend/components/opd/DoctorOpdSlotActions.tsx` — context on per-slot UX.
- **Source decisions:** [Product plans/plan-opd-slot-hub.md § DL-7, SL-Q4](../../../../Product%20plans/plan-opd-slot-hub.md).
- **Wave gate:** [`EXECUTION-ORDER-opd-slot-hub.md` § Wave 3 gate](./EXECUTION-ORDER-opd-slot-hub.md#wave-3-gate-after-sl-06).
- **Previous task:** [`task-sl-05-polling-hotkeys-empty-states.md`](./task-sl-05-polling-hotkeys-empty-states.md) — Wave 2 closed.
- **Next task:** none. Batch ends.

---

**Owner:** TBD
**Created:** 2026-05-15
**Status:** Pending (optional — Wave 2 ships the doctor-facing operational hub without this)
 