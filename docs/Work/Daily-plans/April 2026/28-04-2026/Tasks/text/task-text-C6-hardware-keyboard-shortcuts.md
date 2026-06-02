# Task text-C6: Hardware-keyboard shortcuts (Esc clear / ↑ edit-last / Cmd+Enter force-send)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch C (T6 mobile native)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Doctors on tablets with hardware keyboards (iPad Pro + Magic Keyboard, Surface, Chromebooks) want power-user shortcuts. This task adds three:

- **`Esc`** — when composer has content, clears it (with implicit save to `useComposerDraft` from D1, so it can be restored). When composer is empty AND `replyTo` is set (from B4), cancels the reply mode. Also closes any open menus / pickers.
- **`↑` Up arrow** — when composer is empty, opens the most recent OWN message that's still within the 60s edit window (B6) for editing. If no eligible message, no-op.
- **`Cmd+Enter` / `Ctrl+Enter`** — force-send even if the message is "queued" (network reconnecting). Bypasses the queued-state UX from A3; the optimistic send still resolves on reconnect, but this signals the user explicitly wants the bubble in the pending list NOW (versus a polite wait).

This task also extends the T1.2 keyboard hint (A2) to mention these shortcuts when a hardware keyboard is detected.

**Estimated time:** ~3 hours.

**Status:** Done (2026-05-24).

**Depends on:** [task-text-B6](./task-text-B6-edit-and-soft-delete-window.md) — hard. The `↑` shortcut targets edit-last-own-message; needs the edit path. Soft-deps on [task-text-A2](./task-text-A2-composer-footer-hints-and-counter.md) (extend the hint copy) and [task-text-A3](./task-text-A3-send-button-states.md) (force-send needs the queued state to mean something).

**Source plan:** [T6 §T6.38](../../../../Product%20plans/text-consult/plan-t6-text-mobile-native.md)

---

## Acceptance criteria

- [x] **`useComposerHotkeys` hook** at `frontend/lib/text/use-composer-hotkeys.ts`:
  ```ts
  interface UseComposerHotkeysOptions {
    composerEl: HTMLTextAreaElement | null;
    composerEmpty: boolean;
    replyToActive: boolean;
    menuOpen: boolean;
    onClear: () => void;
    onCancelReply: () => void;
    onEditLastOwn: () => void;
    onForceSend: () => void;
    onCloseMenus: () => void;
  }
  ```
  Implementation note: shipped with an additional `menuOpen: boolean` flag so the host owns per-bubble menu visibility derivation (reaction picker, lightbox, camera preview, delete-confirm toast, inline edit) without the hook reaching into multiple React states.
- [x] **Keydown handler scoped to the composer** — `addEventListener('keydown')` on the composer textarea (resolved via a callback ref → `useState` so the subscription rebinds once the textarea mounts). Other inputs (locale select, file picker, dictation mic) keep their own key handling.
- [x] **Esc behaviour** (in priority order):
  1. If a per-bubble menu / picker is open → close it (`onCloseMenus`); `e.preventDefault()`.
  2. Else if composer has content → clear (`onClear`).
  3. Else if `replyToActive` → cancel reply (`onCancelReply`).
  4. Else → no-op (Esc bubbles to ancestor modal-close behaviour).
- [x] **Up arrow behaviour:**
  - `composerEmpty` + Up → fires `onEditLastOwn`; host uses `findLastEditableOwnMessage` (`frontend/lib/text/edit-message-eligibility.ts`, already shipped with B6) to resolve the most recent own non-deleted text message inside the 60s window and `setEditingMessageId(target.id)`. No-ops gracefully when no eligible message exists.
  - Up with composer content → handler bails before `preventDefault`, so the textarea's default cursor-up movement is preserved.
- [x] **Cmd+Enter / Ctrl+Enter behaviour:**
  - Hotkey hook calls `onForceSend` regardless of `connection` state; `handleComposerKeyDown` now skips `Enter` when `metaKey`/`ctrlKey` is held so the React synthetic handler doesn't double-fire alongside the native listener.
  - `onForceSend` calls `handleSend({ forceQueue: true })`. The send helper accepts a `forceQueue` flag; today's send path always creates the optimistic pending bubble regardless of connection (the "queued" state lives purely in the send-button UX), so no behavioural branch is needed today — the flag is preserved on the API for the eventual bubble-level "queued" overlay.
  - At `connection === 'online'`, identical to plain Enter.
- [x] **`<TextConsultRoom>` consumes the hook** with handlers:
  - `onEditLastOwn` → `handleEditLastOwn` (uses `findLastEditableOwnMessage` against `messagesRef.current` so the latest snapshot is always queried, not a stale render closure).
  - `onForceSend` → `handleForceSend` → `handleSend({ forceQueue: true })`.
  - `onCloseMenus` → `closeAllPerBubbleMenus` (clears reaction picker, lightbox, camera preview, delete-confirm toast, and inline edit mode in priority order).
  - `onCancelReply` → `setReplyTo(null)`; `onClear` → `setComposer('')` plus `setPartialTranscript('')` so a live dictation overlay is also torn down.
- [x] **Hint extension (A2)** — when `matchMedia('(pointer: fine)').matches`, the dismissable hint appends `Esc to clear · ↑ to edit last` (with `<kbd>` chips matching the existing Enter / Shift+Enter chips). Touch-only devices keep the A2 hint verbatim. Detection is reactive to plug/unplug via `matchMedia` `change` events; an SSR-safe guard preserves the dismissed-by-default state on the server.
- [x] **Three-host parity** — hook is layout-agnostic; mounted unconditionally on the same composer textarea used by `standalone` / `panel` / `canvas`.
- [x] **`mode='readonly'`** — hook receives `composerEl: null` when `mode !== 'live'`; subscription never binds. The composer DOM is already not rendered in readonly (Plan 07 · Task 31), so the callback ref also stays null.
- [x] **No interference with browser shortcuts** — only `Escape`, `ArrowUp` (when composer empty), and `Enter` with a single `metaKey`/`ctrlKey` modifier are consumed. `Cmd+W` / `Cmd+R` / `Cmd+T` etc. never match and bubble to the browser.
- [x] Frontend type-check + lint clean (new files only — pre-existing unrelated errors in `VoiceConsultRoom.tsx` / `PatientRibbon.tsx` / `share-target-bridge.ts` were not introduced by this task). Unit test: `frontend/lib/text/__tests__/use-composer-hotkeys.test.ts` covers Esc precedence (menus → clear → reply → no-op), Up gating on `composerEmpty`, `metaKey` + `ctrlKey` force-send, no double-fire on plain Enter, and listener cleanup on unmount. Manual smoke pending hardware-keyboard hardware (covered by unit-level acceptance per `text-C6` scope).

---

## Out of scope

- **Cmd+K / Cmd+/** for search or command palette. Out of scope.
- **`/` slash commands** for quick-templates (T3 territory; T3 is not in this batch).
- **Tab / Shift+Tab** for moving focus between picker / textarea. Default browser tab behaviour is fine.
- **Configurable shortcuts via settings.** Hard-coded for v1.
- **`Cmd+Z` undo for clear.** D1's `useComposerDraft` provides crash recovery; explicit undo is out of scope here.

---

## Files expected to touch

**Frontend:**

- `frontend/lib/text/use-composer-hotkeys.ts` — **new** (~70 LOC + 50 LOC test).
- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (mount the hook; provide handlers; extend send helper with `forceQueue` flag; extend hint string when `matchMedia('(pointer: fine)')`).

**No backend, no schema.**

---

## Notes / open decisions

1. **Why on the composer element, not window** — listening on window causes the shortcuts to fire when the user's focus is in (e.g.) the locale-select dropdown or the dictation mic button. Composer-scoped is more correct.
2. **Hardware-keyboard detection** — `matchMedia('(pointer: fine)')` is the standard heuristic. iPad Pro with Magic Keyboard reports `fine`; iPhone reports `coarse`. Imperfect but good enough.
3. **`forceQueue` send helper flag** — additive to the existing send helper. When false (default), uses A3's `sendButtonState`; when true, skips the "queued" derivation.
4. **Up-arrow cursor conflict** — only fires when composer is empty. If composer has content, Up moves the cursor up a line; expected behaviour preserved.
5. **Browser-default Esc handling** — most browsers ignore Esc inside textareas; safe to take it.
6. **Future `Tab` to switch between message-list (search) and composer** — out of scope but document as a candidate next iteration.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch C](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T6 §T6.38](../../../../Product%20plans/text-consult/plan-t6-text-mobile-native.md)
- **Hard dep:** [task-text-B6](./task-text-B6-edit-and-soft-delete-window.md) (edit path for `↑`).
- **Soft-deps:** [task-text-A2](./task-text-A2-composer-footer-hints-and-counter.md), [task-text-A3](./task-text-A3-send-button-states.md), [task-text-D1](./task-text-D1-composer-draft-crash-recovery.md).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-24).
