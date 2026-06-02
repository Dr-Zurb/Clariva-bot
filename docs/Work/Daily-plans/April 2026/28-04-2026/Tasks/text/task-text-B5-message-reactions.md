# Task text-B5: Message reactions (`<ReactionPicker>` + Realtime channel + aggregated badges)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch B (T2 real polish)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Five-emoji reactions on any non-system message: 👍 / ❤️ / ✓ / ❓ / 😮. Locked to that set in the B1 migration via a CHECK constraint. Tap an existing aggregated badge to toggle your own reaction; long-press / right-click opens the `<ReactionPicker>` to add a new emoji.

This task ships the picker, the per-bubble badge row, the optimistic insert + delete path, and the Realtime subscription that fans-out reactions to the other side. The DB shape (table, RLS, publication) ships in B1.

**Estimated time:** ~6 hours.

**Status:** Done (2026-05-23).

**Depends on:**
- [task-text-B1](./task-text-B1-t2-chat-polish-migration.md) — hard. `consultation_message_reactions` table + RLS + Realtime publication ship there.
- [task-text-B2](./task-text-B2-message-bubble-extract.md) — hard. Renders inside `<MessageBubble>`.

**Soft-blocks:** [task-text-C4](./task-text-C4-long-press-reactions.md) (mobile gesture targets the picker).

**Source plan:** [T2 §T2.9](../../../../Product%20plans/text-consult/plan-t2-text-real-polish.md)

---

## Acceptance criteria

- [x] **`<ReactionPicker>` new component** at `frontend/components/consultation/ReactionPicker.tsx`:
  ```ts
  interface ReactionPickerProps {
    messageId: string;
    anchor: HTMLElement | null;       // for positioning (popover above the bubble)
    open: boolean;
    onClose: () => void;
    onPick: (emoji: ReactionEmoji) => void;
  }
  ```
  Renders 5 buttons in a horizontal row with hover states. Closes on outside-click + on emoji pick. Use a small popover library if one's already in the project (search `Popover`/`@headlessui` in `frontend/components/`); otherwise hand-roll with `position: absolute` + click-outside hook.
- [x] **Per-bubble badge row** below the body — renders one badge per distinct emoji that has ≥1 reaction:
  ```tsx
  <div className="flex gap-1 mt-1">
    {Object.entries(aggregatedReactions).map(([emoji, users]) => (
      <button
        key={emoji}
        onClick={() => toggleReaction(messageId, emoji)}
        className={`px-1.5 py-0.5 text-xs rounded-full border ${
          users.includes(currentUserId) ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200'
        }`}
        aria-label={`${emoji}, ${users.length} reaction${users.length === 1 ? '' : 's'}`}
        title={users.map(u => userNameById(u)).join(', ')}
      >
        {emoji} {users.length}
      </button>
    ))}
  </div>
  ```
- [x] **`aggregatedReactions` derivation** — pure function over the local reactions array:
  ```ts
  function aggregateReactions(rows: Reaction[]): Record<string, string[]> {
    return rows.reduce((acc, r) => {
      (acc[r.emoji] ||= []).push(r.user_id);
      return acc;
    }, {} as Record<string, string[]>);
  }
  ```
- [x] **Toggle semantics** — `toggleReaction(messageId, emoji)`:
  - If `currentUserId` already reacted with that emoji → DELETE the row (`from('consultation_message_reactions').delete().eq('message_id', messageId).eq('user_id', currentUserId).eq('emoji', emoji)`).
  - Otherwise → INSERT (`{ message_id, user_id: currentUserId, emoji }`).
  - Optimistic local update first; on Supabase error, revert and toast.
- [x] **Realtime subscription** to `consultation_message_reactions` (filtered by `message_id IN visibleMessageIds`):
  ```ts
  supabase
    .channel(`reactions:${sessionId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'consultation_message_reactions',
    }, (payload) => mergeReactionEvent(payload))
    .subscribe();
  ```
  Filtering by `session_id` requires a JOIN; in practice subscribe to all events and filter client-side by `messageId ∈ messages` (cheap; reactions are rare events).
- [x] **Reactions storage** — local `reactionsByMessageId: Record<string, Reaction[]>` state in `<TextConsultRoom>`. Initial load via a `select('*').in('message_id', visibleMessageIds)` on mount. Merge live events into this state.
- [x] **`<MessageBubble>` consumes** `reactions` (filtered to its own message id) + `onOpenPicker` (parent-injected callback). The picker itself is rendered at the parent level (one picker, one anchor, opens / closes for whichever bubble triggered it).
- [x] **Long-press / right-click → picker** — `<MessageBubble>` listens for `oncontextmenu` (right-click) and `onPointerDown` with a 300 ms timeout (long-press). Both call `onOpenPicker(messageId, anchorElement)` on the parent. C4 will refine the long-press behaviour (vibration); this task ships the basic timeout.
- [x] **System messages excluded** — `kind === 'system'` bubbles don't render the badge row and don't open the picker.
- [x] **Three-host parity** — works in `standalone` / `panel` / `canvas`. Picker positioning honours viewport edges.
- [x] **`mode='readonly'`** — badge row renders (preserves history); picker is gone (no mutation in readonly).
- [x] **No PHI in reaction logs** — reaction row contents (`message_id`, `user_id`, `emoji`) are not PHI; logging is fine. Don't log adjacent message body.
- [x] Frontend type-check + lint clean. Manual smoke (two windows): doctor reacts 👍 to a message; patient sees the badge appear within 1 s; patient reacts 👍 too; badge updates to "👍 2" with both names in tooltip; doctor taps badge to remove their reaction; badge updates to "👍 1".

---

## Out of scope

- **Custom emoji.** Locked to the 5 in B1's CHECK constraint.
- **Skin-tone variants.** N/A for this set.
- **Reaction notification** ("Dr. X reacted to your message"). Plan 06's `kind = 'reaction_added'` system message is OPTIONAL and not in scope here; can be added later if telemetry shows it's wanted.
- **Reaction analytics** (most-used emoji per doctor). Out of scope.
- **Animation on badge appear / count tick.** A simple fade-in (200 ms) is fine; no spring physics.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/ReactionPicker.tsx` — **new** (~70 LOC).
- `frontend/components/consultation/MessageBubble.tsx` — **edit** (badge row JSX; long-press + right-click handlers; new `reactions` + `onOpenPicker` props).
- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (Realtime subscription; `reactionsByMessageId` state; `toggleReaction` handler; picker mounting + anchor management; initial load).
- `frontend/lib/text/aggregate-reactions.ts` — **new** (~10 LOC; pure helper + tests).

**No backend, no schema** (B1 ships both).

---

## Notes / open decisions

1. **Why subscribe to all reaction events instead of session-filtered** — Supabase `postgres_changes` filters by single columns; filtering by `session_id` would require a server-side trigger or JOIN view. Reactions are rare events; client-side filter is fine. If volume grows, add a `session_id` denormalised column to `consultation_message_reactions` in a future migration.
2. **Click-outside hook** — search `useClickOutside` in `frontend/lib/`; reuse if exists. Otherwise inline.
3. **Picker anchor** — store the bubble's DOM node ref; pass to `<ReactionPicker>` for `getBoundingClientRect`-based positioning. Position above the bubble; flip below if no room above.
4. **Optimistic-revert on error** — keep the rollback simple: snapshot the pre-toggle state, mutate optimistically, revert + toast on error. No retry loop.
5. **Race on UNIQUE constraint** — two simultaneous tabs (same user) toggling the same emoji can hit the `(message_id, user_id, emoji)` UNIQUE. Treat the second INSERT's 23505 error as a no-op (the reaction already exists from the other tab); don't toast.
6. **Tooltip content** — `users.map(u => userNameById(u)).join(', ')`. `userNameById` for the current user is "You"; for the counterparty, the existing `counterpartyName` prop. Doctor names visible to patients in v1; consider privacy implications later.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch B](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T2 §T2.9](../../../../Product%20plans/text-consult/plan-t2-text-real-polish.md)
- **Schema dep:** [task-text-B1](./task-text-B1-t2-chat-polish-migration.md) (table + RLS + publication).
- **Render dep:** [task-text-B2](./task-text-B2-message-bubble-extract.md).
- **Soft-blocks:** [task-text-C4](./task-text-C4-long-press-reactions.md) (mobile long-press refinement).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-23).
