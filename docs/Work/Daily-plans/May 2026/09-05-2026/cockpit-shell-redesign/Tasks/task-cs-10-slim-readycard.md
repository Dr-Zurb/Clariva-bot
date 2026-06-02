# Task cs-10: Slim `<ReadyCard>` to a single primary CTA + a small "Switch modality" link

## 09 May 2026 — Batch [Cockpit shell redesign](../plan-cockpit-shell-redesign-batch.md) — Phase C, Lane β — **S, ~1.5h**

---

## Task overview

`<ReadyCard>` renders in the cockpit's `ready` state — the appointment is past its scheduled start time and the patient hasn't joined yet (or hasn't been called yet for an in-clinic visit). Today it shows three competing CTAs:

1. **`Start consult`** (primary)
2. **`Switch to voice`** / **`Switch to video`** / **`Switch to in-clinic`** (modality-flip — secondary, but visually similar to primary)
3. **`Mark as no-show`** (was added by cp-05 — now moved to the kebab menu via cs-02, so this CTA can be removed from `<ReadyCard>` if it's still rendering it directly)

The user's design direction (from the cockpit-polish + cockpit-shell-redesign reviews): one primary action, optional secondary affordance below as a text link, no third CTA.

cs-10 reduces `<ReadyCard>` to:

- **Primary CTA**: `Start consult` — the dominant action.
- **Text link** below: `Switch modality` — collapses the three modality-flip buttons into a single link that opens a small dropdown / popover with the alternative modalities.
- **No `Mark no-show`** in this card — it's available from the kebab menu (cs-02) and the `m` hotkey. ReadyCard no longer renders it.

**Estimated time:** ~1.5h.

**Status:** Done.

**Hard deps:** [`cs-02`](./task-cs-02-mark-no-show-kebab.md) — moves the no-show button so the card doesn't need it.

**Source:** [plan-cockpit-shell-redesign-batch.md § Phase C](../plan-cockpit-shell-redesign-batch.md#phase-c--polish-3-tasks-3h-3-parallel-lanes).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat. Pre-load:
- This task file.
- `frontend/components/consultation/cockpit/ReadyCard.tsx` (the file being slimmed).
- `frontend/lib/consultation/cockpit-state.ts` (read-only — confirm the `ready` state's contract).
- `frontend/components/ui/dropdown-menu.tsx` or popover (whichever shadcn primitive we use for the modality picker).

**Estimated turns:** 2 turns.

---

## Acceptance criteria

### Single primary CTA + secondary text link

- [ ] `<ReadyCard>` renders one prominent button:

  ```tsx
  <Button size="lg" onClick={onStartConsult}>
    {modality === 'video' ? 'Start video consult' : modality === 'voice' ? 'Start voice call' : modality === 'text' ? 'Start chat' : 'Mark patient called'}
  </Button>
  ```

  - The label adapts to the appointment's primary modality. The four modality strings cover video / voice / text / in-clinic.
  - **Single button**, full-width or at least visually dominant in the card.

- [ ] Below the button, a small text link:

  ```tsx
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className="text-sm text-muted-foreground hover:underline">
        Switch modality
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      {modality !== 'video' && <DropdownMenuItem onSelect={() => onSwitchTo('video')}>Switch to video</DropdownMenuItem>}
      {modality !== 'voice' && <DropdownMenuItem onSelect={() => onSwitchTo('voice')}>Switch to voice</DropdownMenuItem>}
      {modality !== 'text'  && <DropdownMenuItem onSelect={() => onSwitchTo('text')}>Switch to chat</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>
  ```

  - Use the existing shadcn `DropdownMenu` primitive (we already use it for the kebab in cs-02).
  - The current modality is excluded from the menu (no "Switch to video" if modality is already video).

- [ ] `Mark no-show` is **NOT rendered** by `<ReadyCard>`. Remove any direct invocation. The action is available via the kebab menu (cs-02) and the `m` hotkey.

### Visual treatment

- [ ] The card itself stays the existing centered, light-bg card. Just the *content* of the card slims.
- [ ] Above the CTA, keep the existing patient-status copy ("Patient hasn't joined yet" / "Waiting on the patient"). cs-10 doesn't redesign the copy.

### Tests

- [ ] If `ready-card.test.tsx` exists, update:
  - Asserts one `Start consult` button is rendered.
  - Asserts a `Switch modality` link is rendered, opens a dropdown with the *other* modalities.
  - Asserts `Mark no-show` is NOT rendered.
- [ ] No regression on `cockpit-state.test.ts`.

### Manual verification

- [ ] Cockpit `ready` state for a video appointment → button reads "Start video consult". Dropdown offers voice + chat.
- [ ] Cockpit `ready` state for a chat appointment → button reads "Start chat". Dropdown offers video + voice.
- [ ] No `Mark no-show` button anywhere on the card.

---

## Out of scope

- **Animation / transitions** — the slim is a structural change; visual motion polish is a separate task.
- **The `idle` state's CTAs** — different card, out of scope.
- **The `inCall` state's controls** — out of scope.
- **The kebab menu (where Mark no-show lives now)** — that's cs-02.
- **The actual modality switch implementation** — `onSwitchTo()` already exists (or is the same prop ReadyCard takes today). cs-10 is rearranging UI, not changing handlers.

---

## Files expected to touch

**Modified:**
- `frontend/components/consultation/cockpit/ReadyCard.tsx` (~30 LOC delta — collapse 3 buttons to 1 + dropdown link).
- `frontend/components/consultation/cockpit/__tests__/ReadyCard.test.tsx` (if exists; ~20 LOC delta).

**New:** none.

---

## Notes / open decisions

1. **Why a text-link "Switch modality" and not a secondary outline button?** Visual hierarchy. The doctor's primary intent is "start the consult" — secondary actions deserve less visual weight. Text links communicate "this is optional / less common" without competing.
2. **When would a doctor want to switch modality at the `ready` state?** Common case: scheduled as video, but patient's mic doesn't work — switch to chat. Or scheduled as voice, but the doctor wants to verify a visual finding — switch to video. The flow is real but rare.
3. **Why not show a tooltip on the disabled menu item ("Already on video" → grayed)?** We exclude the current modality entirely instead. Cleaner — fewer items, no confusion about why one is greyed.
4. **What if the appointment has only one modality enabled (e.g. doctor settings disable video)?** The dropdown filters out modalities the doctor doesn't support. If only one modality remains and it equals the current modality, the `Switch modality` link can be hidden entirely. Stretch goal.

---

## References

- **Affected file:** `frontend/components/consultation/cockpit/ReadyCard.tsx`.
- **Predecessor:** [`task-cs-02-mark-no-show-kebab.md`](./task-cs-02-mark-no-show-kebab.md) — moves the no-show CTA out of `<ReadyCard>`.
- **shadcn dropdown:** `frontend/components/ui/dropdown-menu.tsx`.

---

**Owner:** TBD
**Created:** 2026-05-09
**Completed:** 2026-05-10
**Status:** Done
