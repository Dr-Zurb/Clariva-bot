# Task text-B6: Edit + soft-delete within 60 s (per-bubble menu, ticker re-render, view nulls body)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch B (T2 real polish)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

T2.11 (edit) and T2.12 (soft-delete) are merged into a single task because they share:
- the same 60-second window (RLS-enforced in B1's `consultation_messages_update_recent` policy),
- the same per-bubble menu (the same UI affordance toggles which action runs),
- the same ticker-driven re-render (each bubble independently auto-hides its menu when the 60 s window closes — no global re-render storm).

**Edit:** sender opens menu → "Edit" → bubble flips into an inline-textarea state with the current body pre-loaded → save sends an UPDATE with new `body` + `edited_at = now()`. Bubble re-renders with body + small "edited" tag (tooltip on hover shows the original `created_at`).

**Soft-delete:** sender opens menu → "Delete" → confirm-once toast ("Delete this message? This can't be undone.") → UPDATE sets `deleted_at = now()`. View (B1) returns `body = NULL`; bubble renders `(deleted by Dr. X)` placeholder with the original `sender_role` preserved.

The B1 RLS policy enforces both: `sender = self`, `created_at > now() - 60s`, `session.status = 'live'`. Trying to UPDATE outside the window returns 0 rows (RLS quietly excludes the row); the frontend treats this as a "menu should be hidden by now" race and toasts a friendly error.

**Estimated time:** ~7 hours combined (~3.5h each).

**Status:** Done (2026-05-23).

**Depends on:**
- [task-text-B1](./task-text-B1-t2-chat-polish-migration.md) — hard. UPDATE policy + view + auto-unpin trigger ship there.
- [task-text-B2](./task-text-B2-message-bubble-extract.md) — hard. Per-bubble menu lives in `<MessageBubble>`.

**Soft-blocks:** [task-text-C6](./task-text-C6-hardware-keyboard-shortcuts.md) (`Up arrow` shortcut targets edit-last-own-message; needs the edit path).

**Source plan:** [T2 §T2.11 + §T2.12](../../../../Product%20plans/text-consult/plan-t2-text-real-polish.md)

---

## Acceptance criteria

### Per-bubble menu shell

- [x] **`<MessageBubbleMenu>` new component** at `frontend/components/consultation/MessageBubbleMenu.tsx`:
  ```ts
  interface MessageBubbleMenuProps {
    message: ConsultationMessage;
    isOwn: boolean;
    onStartEdit: () => void;
    onSoftDelete: () => void;
    onStartReply: () => void;          // wires through to B4's replyTo state
    onAddReaction: (anchor: HTMLElement) => void;  // wires to B5's picker
    onTogglePin?: () => void;          // present only if currentUserRole === 'doctor', wires to B7
  }
  ```
- [x] **Menu visibility rules:**
  - `Reply`, `Add reaction` — always visible (own + other; live mode only).
  - `Edit`, `Delete` — only on own messages, only when `now() - message.created_at < 60s`.
  - `Pin` / `Unpin` — only when `currentUserRole === 'doctor'`, regardless of own / other.
- [x] **Hidden in `mode='readonly'`** — entire menu doesn't render.

### 60 s ticker

- [x] **`useExpiringMenu(message)` hook** at `frontend/lib/text/use-expiring-menu.ts`:
  ```ts
  // Returns { canEdit: boolean, secondsRemaining: number }
  // Internally sets a 1-second interval ONLY for messages where created_at < 60s ago,
  // and clears it once the window closes. Bubbles older than 60s never start a timer.
  export function useExpiringMenu(message: ConsultationMessage): { canEdit: boolean; secondsRemaining: number };
  ```
  - Avoid one global ticker that re-renders all bubbles; per-bubble timer only when needed.
  - Clean up on unmount.
- [x] **Visible "60s" countdown** in the menu (e.g. small `(58s)` next to Edit / Delete) — gives the sender a clear signal the window is closing.

### Edit flow

- [x] **`<EditableMessageBubble>` mode** — when the user clicks "Edit", the bubble swaps from rendering `body` to rendering an inline `<textarea>` pre-loaded with the body. Save / Cancel buttons below.
- [x] **Save** — call `supabase.from('consultation_messages').update({ body: newBody, edited_at: new Date().toISOString() }).eq('id', message.id)`.
  - On success: bubble flips back to read mode with new body + `edited_at` populated; subscribed Realtime UPDATE fans out to the counterparty.
  - On 0 rows affected (RLS reject — window closed mid-edit): toast `Edit window closed.`. Bubble flips back to read mode with original body.
- [x] **"edited" tag** — render a tiny `· edited` next to the timestamp when `edited_at !== null`. Tooltip: `Original sent at HH:MM` using `created_at`.
- [x] **Cancel** — discards the textarea; no DB call.
- [x] **Hard cap on edit body length** — same 4000-char cap as A2 (UX). Send blocked above; counter visible same way.
- [x] **No regression on `body` rendering** — markdown-lite (B3) still applies after edit.

### Soft-delete flow

- [x] **Confirm-once toast** — clicking Delete shows `Delete this message? · Delete · Cancel` for 5 s. Tap Delete → fires the UPDATE.
- [x] **`deleted_at` UPDATE** — `update({ deleted_at: new Date().toISOString() })`.
- [x] **View nulls body on Realtime UPDATE event** — the underlying Realtime subscription delivers the raw row (with `body` still populated). Frontend MUST re-apply the same projection client-side: `if (row.deleted_at) row.body = null`. Document this in `frontend/lib/text/text-session-supabase.ts` (the adapter); add a unit test.
- [x] **`(deleted by ...)` placeholder render** — `<MessageBubble>` checks `message.deleted_at !== null` and renders:
  ```tsx
  <div className="italic text-gray-400 text-sm">
    (deleted by {message.sender_role === 'doctor' ? `Dr. ${counterpartyName}` : 'Patient'})
  </div>
  ```
  No body, no reactions row, no quoted-parent (the deleted message can still be a reply target — keep its quote on the reply-side).
- [x] **Auto-unpin verification** — if a pinned message is deleted, the B1 trigger NULLs `pinned_at`/`pinned_by`. Frontend's pinned-banner (B7) updates via Realtime UPDATE. No special handling here.
- [x] **Realtime UPDATE handling** — extend the existing INSERT subscription in `<TextConsultRoom>` to also handle UPDATE events; reconcile with the local `messages` array by id. If the row isn't currently in `messages` (old, off-screen), ignore.

### Across both flows

- [x] **Three-host parity** — works in `standalone` / `panel` / `canvas`.
- [x] **No PHI in console / Sentry.** Edit and delete events log only `{ message_id, action }` — never the body.
- [x] Frontend type-check + lint clean (unit tests: `text-session-supabase`, `use-expiring-menu`; manual two-window smoke pending). Manual smoke (two windows): doctor sends "5mg twice"; opens menu within 60s; clicks Edit; changes to "10mg twice"; saves; both windows show updated body + "· edited" tag; tooltip shows original send time. After 70s, doctor opens menu — no Edit / Delete options visible. Doctor sends another, soft-deletes within 60s; both windows show `(deleted by Dr. X)` placeholder.

---

## Out of scope

- **Edit history.** Only the latest body persists; original body is discarded. This is a deliberate trade-off vs. medical-record audit; if regulators push back, add an `edit_history` JSON column in a future migration.
- **Doctor-edits-patient or vice versa.** Sender-only.
- **Hard delete** (`DELETE FROM ...`). Soft-delete only; the row stays for medical-record retention.
- **"Restore deleted message" within 60s.** Not a feature; once deleted, gone.
- **Edit-after-window via doctor override.** Not a feature.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/MessageBubbleMenu.tsx` — **new** (~80 LOC).
- `frontend/components/consultation/EditableMessageBubble.tsx` — **new** OR inlined in `<MessageBubble>` (~60 LOC).
- `frontend/lib/text/use-expiring-menu.ts` — **new** (~30 LOC + 30 LOC test).
- `frontend/components/consultation/MessageBubble.tsx` — **edit** (consume menu; render `(deleted)` placeholder; render `· edited` tag).
- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (UPDATE Realtime handler; menu callbacks; toast helper).
- `frontend/lib/text/text-session-supabase.ts` — **edit** (apply `body = null` projection on UPDATE events with `deleted_at`).

**No backend, no schema** (B1 ships both).

---

## Notes / open decisions

1. **Why per-bubble timer not a global ticker** — a global 1-second `setInterval` re-renders the entire message list every second; even with `React.memo` it costs. Per-bubble timer only fires for the small subset of bubbles in the 60 s window — typically 1–2 messages.
2. **Why client-side null-on-delete in the adapter** — the Realtime subscription is on the underlying TABLE, not the VIEW. Postgres Realtime has limited view support. Easier to mirror the projection client-side than to migrate to a Logical Replication slot on the view.
3. **Edit-of-attachment messages** — out of scope; if `kind === 'attachment'`, hide Edit. Delete remains.
4. **Concurrent edit race** — two tabs (same sender) edit the same message simultaneously: last write wins. Acceptable; rare.
5. **"edited" tag placement** — next to the timestamp, not next to the body, to avoid disrupting markdown rendering.
6. **Confirm toast vs. modal** — toast is less intrusive for clinical surfaces; user can tap Cancel inline.
7. **Hardware Up-arrow shortcut** (C6) — opens edit on the most recent own message that's still within the 60s window. If no eligible message, no-op. Document the integration point so C6 doesn't have to re-derive eligibility.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch B](../Plans/plan-text-consult-selected-features.md)
- **Source items:** [T2 §T2.11 + §T2.12](../../../../Product%20plans/text-consult/plan-t2-text-real-polish.md)
- **Schema dep:** [task-text-B1](./task-text-B1-t2-chat-polish-migration.md) (`edited_at`, `deleted_at` columns + UPDATE RLS + view + auto-unpin trigger).
- **Render dep:** [task-text-B2](./task-text-B2-message-bubble-extract.md).
- **Soft-blocks:** [task-text-C6](./task-text-C6-hardware-keyboard-shortcuts.md) (`Up arrow` → edit-last).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-23).
