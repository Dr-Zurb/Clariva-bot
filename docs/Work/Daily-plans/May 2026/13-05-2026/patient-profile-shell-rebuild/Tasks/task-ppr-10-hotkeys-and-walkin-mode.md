# Task ppr-10: Hotkeys + walk-in mode

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 3, Lane α step 2 — **S, ~2h**

---

## Task overview

Wire the keyboard shortcuts that v1 ships today (`useCockpitHotkeys`) into the v2 shell, and confirm the walk-in mode (ppr-07's panes-filter) plays nicely with the hotkeys + the new layout state.

Specifically:

- `[` → collapse / expand the LEFT slot (pane at `paneOrder[0]`).
- `]` → collapse / expand the RIGHT slot (pane at `paneOrder[paneOrder.length - 1]`).
- `Cmd/Ctrl+Shift+1/2/3` → apply built-in presets (Triage / Consult / Document) via ppr-09's `applyPreset`.
- `Cmd/Ctrl+Enter` → send Rx (existing handler on `<RxWorkspace>`).
- `Cmd/Ctrl+Shift+Enter` → open wrap-up dialog (existing handler).
- `Esc` → close the currently-open modal (Save preset / Manage presets / Wrap-up).

ppr-10 introduces no new shortcuts. It just **routes the existing hotkey table to the new layout-state setters**.

**Estimated time:** ~2h.

**Status:** Pending.

**Hard deps:** ppr-07 (panes wired), ppr-09 (preset apply available).

**Source:** R3.4 + R3.5 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** Optional — can stitch onto ppr-09's chat. Pre-load:
- This task file.
- `frontend/hooks/useCockpitHotkeys.ts` (the existing hook — we either rename/port or wrap with adapters).
- `frontend/lib/patient-profile/useShellLayout.ts` (ppr-02 — the new setters).
- `frontend/components/patient-profile/PatientProfilePage.tsx` (ppr-07 + ppr-09 — where we mount the hook).

**Estimated turns:** 2–3 turns.

---

## Acceptance criteria

### Option A: New hook `useShellHotkeys`

- [ ] Create `frontend/hooks/useShellHotkeys.ts` mirroring `useCockpitHotkeys` but with slot-positional setters:

  ```ts
  export interface UseShellHotkeysOptions {
    paneOrder: string[];
    paneState: Record<string, { sizePct: number; collapsed: boolean }>;
    setPaneCollapsed: (id: string, collapsed: boolean) => void;
    applyPreset: (presetId: string) => boolean;
    onSendRx: () => void;
    onOpenWrapUp: () => void;
  }

  export function useShellHotkeys(opts: UseShellHotkeysOptions): void { ... }
  ```

- [ ] Implementation: same global keydown listener as `useCockpitHotkeys`, but:
  - `[` resolves to `paneOrder[0]` (left slot pane id) and toggles its `collapsed` bit via `setPaneCollapsed`.
  - `]` resolves to `paneOrder[paneOrder.length - 1]` (right slot pane id) and toggles its `collapsed` bit.
  - `Cmd/Ctrl+Shift+1` → `applyPreset("built-in:triage")`.
  - `Cmd/Ctrl+Shift+2` → `applyPreset("built-in:consult")`.
  - `Cmd/Ctrl+Shift+3` → `applyPreset("built-in:document")`.
  - `Cmd/Ctrl+Enter` → `onSendRx()`.
  - `Cmd/Ctrl+Shift+Enter` → `onOpenWrapUp()`.
  - All other modifier combinations are no-ops (don't `preventDefault`).
- [ ] **Walk-in safety:** when `paneOrder.length === 2` (walk-in mode), `[` still collapses the left pane (now `body`), `]` still collapses the right pane (now `rx`). The `Cmd/Ctrl+Shift+1` hotkey for Triage still works — `applyPreset` on a 2-pane state respects the 2-pane shape (the helper filters the preset's pane state to match the current panes).

### Option B (alternative): Adapt `useCockpitHotkeys`

If the existing `useCockpitHotkeys` is small enough (<100 LOC) and its current callers can be migrated cleanly, ppr-13 will rename it to `useShellHotkeys`. ppr-10 might bypass the new file and just supply different callbacks.

**Decision:** Option A. Keeping a separate file simplifies ppr-13's rename pass (one fewer file to rename — `useCockpitHotkeys` becomes a v1-only hook and gets deleted in ppr-14 along with `ConsultationCockpit`). The duplication is short-lived.

### Mount in `<PatientProfilePage>`

- [ ] Add `useShellHotkeys` to `<PatientProfilePage>`, threading:
  - `paneOrder` + `paneState` + `setPaneCollapsed` from the `useShellLayout` instance.
  - `applyPreset` from `usePatientProfilePresets` (ppr-09).
  - `onSendRx` from a ref to the Rx workspace's send handler.
  - `onOpenWrapUp` from the wrap-up dialog's open handler.

### Walk-in mode verification

- [ ] Open a walk-in appointment (no `patient_id`) on `/v2`.
- [ ] Confirm:
  - Two panes render (body + rx).
  - `[` collapses the body pane; pressing again expands.
  - `]` collapses the rx pane; pressing again expands.
  - `Cmd/Ctrl+Shift+1` (Triage preset) attempts to apply. **Expected outcome:** the preset is built for 3 panes (chart-body-rx with chart wide and rx collapsed). Applying it to a 2-pane shell either falls back to "Consult" (balanced 2-pane) OR refuses with a soft toast "Triage requires the chart column". **Pick one in this task and document.** (Recommendation: fall back to the closest 2-pane preset — Consult — and toast "Adjusted for walk-in".)
  - `Cmd/Ctrl+Enter` still sends Rx.

### Tests

- [ ] Unit tests at `frontend/hooks/__tests__/useShellHotkeys.test.ts`:
  - `[` fires `setPaneCollapsed(paneOrder[0], true)` on first press, `setPaneCollapsed(paneOrder[0], false)` on second press.
  - `]` symmetric for the right slot.
  - `Cmd+Shift+1` calls `applyPreset("built-in:triage")`.
  - `Cmd+Enter` calls `onSendRx`.
  - Modifier-less keypresses don't trigger anything.
  - 2-pane (walk-in) order still maps `[` to slot 0 and `]` to slot 1.
- [ ] `pnpm --filter frontend tsc --noEmit` clean. `pnpm --filter frontend lint` clean.

### Manual smoke

- [ ] On `/v2` (3-pane): `[` collapses chart. `]` collapses rx. `Cmd/Ctrl+Shift+1` applies Triage. `Cmd/Ctrl+Shift+2` Consult. `Cmd/Ctrl+Shift+3` Document.
- [ ] Reorder so body is on the left. `[` collapses body. `]` collapses rx. (Position-based, not type-based — the desired DL-6 behaviour.)
- [ ] On a walk-in: `[` collapses body. `]` collapses rx. `Cmd/Ctrl+Shift+1` applies the walk-in fallback (toast appears).

---

## Out of scope

- **Adding new hotkeys** (e.g. `Cmd+1` for chart focus, etc.). Out of v1.
- **Hotkey rebinding UI.** No customisation in v1.
- **Renaming `useCockpitHotkeys`.** ppr-13.
- **Deleting `useCockpitHotkeys`.** ppr-14.

---

## Files expected to touch

**New:**
- `frontend/hooks/useShellHotkeys.ts` (~120 LOC).
- `frontend/hooks/__tests__/useShellHotkeys.test.ts` (~140 LOC).

**Modified:**
- `frontend/components/patient-profile/PatientProfilePage.tsx` (+15 LOC — mount the hook).

**Tests:** none removed.

---

## Notes / open decisions

1. **Walk-in preset fallback decision (documented above):** apply the **closest matching 2-pane layout**, toast "Adjusted for walk-in". Alternative is "refuse with toast"; we pick the friendly path because the doctor's hotkey muscle memory shouldn't be punished for the chart's absence.
2. **Why no Esc handler in `useShellHotkeys`?** Esc-to-close modals is owned by the modal components themselves (shadcn `<Dialog>` has built-in Esc handling). The hook doesn't need to duplicate it.
3. **Why does the hook receive `paneState` even though it only writes `collapsed`?** To toggle, the hook needs to read the current `collapsed` value first. Could be done with a ref instead; passing `paneState` is cleaner.

---

## References

- **Affected files:**
  - new `frontend/hooks/useShellHotkeys.ts`
  - new `frontend/hooks/__tests__/useShellHotkeys.test.ts`
  - mod `frontend/components/patient-profile/PatientProfilePage.tsx`
- **Source decision:** R3.4 + R3.5 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).
- **Pattern source:** `frontend/hooks/useCockpitHotkeys.ts`.
- **Next task:** [`task-ppr-11-parity-qa-matrix.md`](./task-ppr-11-parity-qa-matrix.md) — fresh chat.

---

**Owner:** TBD
**Created:** 2026-05-13
**Status:** Pending
