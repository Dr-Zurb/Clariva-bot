# Task ppr-15e: Live-consult guard + ppr-11 matrix update

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 4.5, Lane α step 4 — **S, ~45min**

---

## Task overview

Two small things to close out the toggle-bar redesign cleanly:

1. **Live-consult guard.** When the doctor toggles OFF the Consultation pane while a consult is active (text room open / call connected), show a confirmation dialog before hiding. Per the user's clarified soft concern: warn only on Consultation, only when active, only on the toggle-bar click path (not on hotkey or preset apply).

2. **ppr-11 matrix + failure log update.** Mark the six collapse-related failure log entries (cells 4-9) as **resolved by ppr-15** rather than carrying them as open work. Update Matrix B (column permutations now apply to the toggle bar's order — same matrix, new mechanic) and Matrix C (collapse cascades — REPLACED by toggle cascades). Strip out checkboxes that no longer apply (chevron direction, all-strips state, drag-to-collapse lock). Add a small "Toggle bar" matrix section.

After ppr-15e: Wave 4.5 is closed. The toggle-bar redesign ships as part of the same single PR (or stack) and ppr-11 can re-run from a clean baseline.

**Estimated time:** ~45min.

**Status:** Pending.

**Hard deps:** ppr-15a, ppr-15b, ppr-15c (shell now mounts the toggle bar), ppr-15d (presets + hotkeys updated).

**Source:** Mid-batch amendment soft concern #1, ppr-11 cleanup.

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx) — for the `onBeforeHide` wiring + state to detect "consult active".
- [`frontend/components/patient-profile/PaneToggleBar.tsx`](../../../../../../frontend/components/patient-profile/PaneToggleBar.tsx) — confirms the prop signature.
- [`frontend/components/ui/alert-dialog.tsx`](../../../../../../frontend/components/ui/alert-dialog.tsx) — for the confirmation dialog primitive.
- [`docs/Work/Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild/Tasks/task-ppr-11-parity-qa-matrix.md`](./task-ppr-11-parity-qa-matrix.md) — the matrix file being updated.

**Estimated turns:** 2-3 turns.

---

## Acceptance criteria

### Phase 1 — Detect "consult is active"

- [ ] In [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx), determine whether the consult pane is in an active state. Reasonable signals (any one is enough — pick the cheapest):
  - The appointment's `status === "live"` from props.
  - The video / voice connection state from the existing consult-room context (if accessible from this level).
  - A simple `appointment.status` check is the recommended path — it's already on the page and matches the existing "Confirm cancel" semantic in v1.

  ```ts
  const isConsultActive = appointment.status === "live";
  ```

- [ ] If detection requires reading from a context that lives DEEP inside the `<ConsultationBodyPane>`, expose a small `useIsConsultActive()` hook that reads from there and returns a boolean. Keep the wiring narrow.

### Phase 2 — `onBeforeHide` callback

- [ ] In `<PatientProfilePage>`, add a callback that the toggle bar invokes before hiding any pane:

  ```tsx
  const [pendingHide, setPendingHide] = useState<string | null>(null);

  const handleBeforeHide = useCallback((paneId: string): boolean | undefined => {
    if (paneId !== "body") return undefined;       // not Consultation → allow
    if (!isConsultActive) return undefined;        // not active → allow
    setPendingHide(paneId);                        // open the dialog
    return false;                                  // cancel this toggle event
  }, [isConsultActive]);
  ```

- [ ] Pass `onBeforeHide={handleBeforeHide}` to `<PaneToggleBar>`.

### Phase 3 — Confirmation dialog

- [ ] Add an `<AlertDialog>` (using the existing design-system primitive) controlled by `pendingHide !== null`:

  ```tsx
  <AlertDialog open={pendingHide !== null} onOpenChange={(open) => !open && setPendingHide(null)}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Hide the Consultation panel?</AlertDialogTitle>
        <AlertDialogDescription>
          The consultation is currently active. Hiding the panel will not end the consult,
          but you will lose the controls for it until you toggle the panel back on.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={() => setPendingHide(null)}>Keep visible</AlertDialogCancel>
        <AlertDialogAction
          onClick={() => {
            const id = pendingHide;
            setPendingHide(null);
            if (id) shellRef.current?.setPaneHidden(id, true);
          }}
        >
          Hide anyway
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  ```

- [ ] Acceptance: clicking "Keep visible" closes the dialog, no state change. Clicking "Hide anyway" hides the Consultation pane.

- [ ] **The guard does NOT fire on the hotkey or preset path** (per ppr-15d note). Both call `setPaneHidden` directly via the shell handle, bypassing `<PaneToggleBar>`'s `onBeforeHide`. Documented behaviour, not a bug.

### Phase 4 — ppr-11 matrix + failure log update

In [`task-ppr-11-parity-qa-matrix.md`](./task-ppr-11-parity-qa-matrix.md):

- [ ] **Failure log:** Update entries 4 through 9 (the collapse system bugs):
  - Set `Fix landed` to `Yes — superseded by ppr-15 (toggle-bar redesign). The strip+chevron model is gone; these failure modes are structurally impossible.`
  - Strike the symptom row through with HTML `<s>...</s>` to make obsolescence visually obvious.
  - Add one new row at the bottom of the failure log:
    | # | Cell | Symptom | Originating task | Fix landed |
    |---|---|---|---|---|
    | 10 | Collapse system as a whole | Bugs 4-9 root-caused to a flawed strip+chevron+absorber+spacer model. Replaced wholesale by toggle-bar visibility model. | ppr-15 (a-e) | Yes — see ppr-15 task files. |

- [ ] **Matrix B (Column permutations).** Keep the matrix; replace the column header "Collapsed strip" with "Hidden via toggle bar". The reorder semantics (drag column header OR drag toggle icon) are the same — both fire `reorderPane` on the shell.

- [ ] **Matrix C (Collapse cascades).** REPLACE entirely with a "Toggle cascades" matrix:

  ```markdown
  ### Matrix C — Toggle cascades

  | Starting state (all visible) → end state | Toggle bar order intact? | All visible panes sum to 100%? | Empty state when all 3 hidden? |
  |---|---|---|---|
  | Hide Rx | [ ] [ ] | [ ] [ ] | n/a |
  | Hide Body | [ ] [ ] | [ ] [ ] | n/a |
  | Hide Chart | [ ] [ ] | [ ] [ ] | n/a |
  | Hide Rx → Hide Body | [ ] [ ] | [ ] [ ] | n/a |
  | Hide Rx → Hide Body → Hide Chart | [ ] [ ] | n/a (no visible panes) | [ ] [ ] |
  | Hide all → Show Chart | [ ] [ ] | [ ] [ ] | n/a |
  | Hide all → Show all (Cmd+1, Cmd+2, Cmd+3) | [ ] [ ] | [ ] [ ] | n/a |
  ```

- [ ] **Matrix D (Drag reorder).** Add one column to the existing table: "Toggle bar icons reorder in lockstep". Two checkboxes per row.

- [ ] **Matrix E (Preset apply).** Update column headers to add "Hidden bits applied". Existing rows already capture sizes; add the new behaviour.

- [ ] **Matrix G (Hotkeys).** Add three new rows: `Cmd/Ctrl+1`, `Cmd/Ctrl+2`, `Cmd/Ctrl+3` (toggle pane visibility). Update `[` and `]` row descriptions to "hide leftmost / rightmost".

- [ ] **Add Matrix H — Toggle bar:**

  ```markdown
  ### Matrix H — Toggle bar

  | Action | Visible state ARIA correct? | Toggle bar drag reorders columns? | Empty-state shows on all-hidden? |
  |---|---|---|---|
  | Click Chart pill (visible → hidden) | [ ] [ ] | n/a | n/a |
  | Click Chart pill (hidden → visible) | [ ] [ ] | n/a | n/a |
  | Drag Chart icon onto Rx icon | n/a | [ ] [ ] | n/a |
  | Hide all 3 panes via toggle bar | [ ] [ ] | n/a | [ ] [ ] |
  | Click Body pill while consult is `live` | warning dialog appears [ ] [ ] | n/a | n/a |
  | Click Body pill while consult is `live`, choose "Keep visible" | pane stays visible [ ] [ ] | n/a | n/a |
  | Click Body pill while consult is `live`, choose "Hide anyway" | pane hides [ ] [ ] | n/a | n/a |
  ```

- [ ] **Update the matrix's introductory paragraph** to mention that the toggle-bar redesign (ppr-15) replaced the strip-collapse model. One line is enough.

### Phase 5 — Add to capture/inbox

- [ ] Append to [`docs/Work/capture/inbox.md`](../../../../../capture/inbox.md):

  ```markdown
  - [ ] After 6 months in production, drop the v2→v3 storage migration branch in `validateLayout` (introduced in ppr-15a) since browsers will all have rolled over by then.
  - [ ] Consider extending the live-consult guard (ppr-15e) to the hotkey / preset paths if user-test feedback flags accidental hides during live calls.
  - [ ] Once a 4th pane lands, wire Q10's icon-only-on-overflow strategy in `<PaneToggleBar>` (TODO comment in the file).
  ```

### Phase 6 — Tests

- [ ] In `frontend/components/patient-profile/__tests__/PatientProfilePage.test.tsx` (or create a small new test file `PatientProfilePage.live-consult-guard.test.tsx`):
  1. **No guard when consult is `ready`.** Mount with `appointment.status = "ready"`. Click body pill. Assert pane hides immediately, no dialog rendered.
  2. **Guard fires when consult is `live` AND clicking body pill.** Mount with `appointment.status = "live"`. Click body pill. Assert dialog appears with the "Consultation is currently active" copy. Pane is still visible.
  3. **"Keep visible" closes dialog without hiding.** Click "Keep visible". Assert dialog closes; pane still visible.
  4. **"Hide anyway" hides the pane.** Click "Hide anyway". Assert dialog closes; pane is now hidden.
  5. **Guard does NOT fire on Chart or Rx pills, even when live.** Mount live. Click chart pill. Assert pane hides immediately.
  6. **Guard does NOT fire on hotkey or preset path.** Mount live. Press `]` (hide rightmost — Body if it's last). Assert pane hides immediately, no dialog. (This documents the deliberate carve-out.)

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend vitest run components/patient-profile/__tests__/PatientProfilePage` — all green.

### Manual smoke

- [ ] Open a `ready` appointment on `/v2`. Click the Consultation pill → it hides immediately, no dialog.
- [ ] Toggle it back on. Move the appointment to `live` (start the consult).
- [ ] Click the Consultation pill → dialog appears. Click "Keep visible" → dialog closes, pane stays.
- [ ] Click the Consultation pill again → dialog appears. Click "Hide anyway" → dialog closes, pane hides.
- [ ] Bring it back via `Cmd+2` → no dialog (deliberate; hotkey bypass is fine).
- [ ] Apply Triage preset (`Cmd+Shift+1`) while live → no dialog (deliberate; preset bypass is fine).

---

## Out of scope

- **Guard on hotkey / preset paths.** Per design — keep simpler for now; revisit if user feedback says otherwise.
- **Guarding on Voice / Video state independently.** `appointment.status === "live"` covers all modalities. If a doctor manually paused the call but the appointment is still `live`, they'll see the dialog — that's fine, "consult is active" is conservative.
- **Toast on toggle (no dialog, just a snackbar).** Considered; rejected. The dialog is louder, and only fires on a single high-stakes action. A toast might be missed.
- **Persisting the dialog's "don't show again" preference.** Out of scope. Dialog is short and infrequent.

---

## Files expected to touch

**Modified:**
- `frontend/components/patient-profile/PatientProfilePage.tsx` (~+50 LOC for state + dialog + onBeforeHide)
- `docs/Work/Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild/Tasks/task-ppr-11-parity-qa-matrix.md` (matrix + failure log edits)
- `docs/Work/capture/inbox.md` (~+3 lines)
- `frontend/components/patient-profile/__tests__/PatientProfilePage.test.tsx` OR new test file (~6 cases, ~150 LOC)

**New:** possibly `frontend/components/patient-profile/__tests__/PatientProfilePage.live-consult-guard.test.tsx` if isolating the cases is cleaner.

**Tests:** ~6 new cases.

---

## Notes / open decisions

1. **Why detect via `appointment.status === "live"` and not via consult-room internal state?** Cheaper, no new wiring, matches the existing "Cancel during live" guard semantics. If a future call state diverges from `appointment.status` (e.g. patient drops mid-consult, status stays `live` but actually nothing's happening), revisit.
2. **Why hard-code the pane id `"body"` for the guard?** The Consultation pane's id is stable across the batch. Future panes (e.g. AI chat) won't get this guard by default — that's intentional; only Consultation is "in-progress" in the consult sense.
3. **Why no guard on Chart / Rx?** Doctor can review chart later; can re-open Rx later. No live action being interrupted. Consultation is the only "you are losing the controls for an active action" pane.
4. **Why update ppr-11 instead of starting a new ppr-16-style QA pass?** ppr-11 is the parity-QA file; the toggle-bar redesign IS the parity work for cells B/C/D/E/G. Updating in place keeps the QA artefact authoritative.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** Mid-batch amendment soft concern #1 (live-consult warning); ppr-11 cleanup.
- **Dialog precedent:** existing v1 cancel-during-live dialog (search `frontend/components/consultation/` for `AlertDialog` if needed for visual parity).
- **End of Wave 4.5.** Next: re-run ppr-11's QA matrix from a clean baseline, then proceed to ppr-12 → ppr-13 → ppr-14 (unchanged).

---

**Owner:** TBD
**Created:** 2026-05-13
**Status:** Pending
