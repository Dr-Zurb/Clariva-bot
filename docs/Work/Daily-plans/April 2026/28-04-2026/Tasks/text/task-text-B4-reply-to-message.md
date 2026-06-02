# Task text-B4: Reply-to-message (composer reply-affordance + `<QuotedParentPreview>` + scroll-to-parent)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch B (T2 real polish)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

WhatsApp-style one-level reply: tap a "Reply" affordance on any message → composer enters reply-mode showing the quoted parent above the textarea → on send, the new message persists with `reply_to_id = parent.id`. The new bubble renders with a small quoted-parent preview above its body. Tapping the quoted preview smooth-scrolls to the parent in the message list and briefly highlights it (200 ms ring flash).

**One level only.** A reply to a reply renders the immediate parent's quote (not a recursive chain). Keeps the visual density bounded.

**Estimated time:** ~6 hours.

**Status:** Done (2026-05-23).

**Depends on:**
- [task-text-B1](./task-text-B1-t2-chat-polish-migration.md) — hard. `reply_to_id` column ships there.
- [task-text-B2](./task-text-B2-message-bubble-extract.md) — hard. Renders inside `<MessageBubble>`.
- [task-text-B3](./task-text-B3-markdown-lite-renderer.md) — soft. `compact: true` rendering of the quoted parent body for inline-style consistency.

**Soft-blocks:** [task-text-C5](./task-text-C5-swipe-to-reply.md) (mobile gesture targets this composer-mode entry).

**Source plan:** [T2 §T2.10](../../../../Product%20plans/text-consult/plan-t2-text-real-polish.md)

---

## Acceptance criteria

- [x] **Per-bubble "Reply" affordance** — desktop hover OR right-click menu (B5 ships the menu shell; this task adds the Reply item). On mobile (no hover), the affordance is a small icon in the per-bubble menu opened by the long-press handler (C4 ships the long-press; this task assumes a tap-on-icon trigger as fallback for now).
- [x] **`replyTo` state in `<TextConsultRoom>`** — holds either `null` (composer in normal mode) or `{ id, sender_role, body, sender_name }` (composer in reply-mode). Set by clicking Reply on a bubble.
- [x] **Composer reply-banner** — when `replyTo !== null`, render above the textarea:
  ```tsx
  <div className="flex items-start gap-2 px-3 py-1.5 border-l-2 border-blue-500 bg-blue-50 text-xs">
    <div className="flex-1 min-w-0">
      <div className="font-medium">Replying to {replyTo.sender_name}</div>
      <div className="truncate text-gray-600">
        {renderMarkdownLite(replyTo.body, { compact: true })}
      </div>
    </div>
    <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">×</button>
  </div>
  ```
- [x] **`sendMessage` extended** — when `replyTo` is set, INSERT row with `reply_to_id = replyTo.id`. Clear `replyTo` after successful optimistic enqueue.
- [x] **`<QuotedParentPreview>` new component** at `frontend/components/consultation/QuotedParentPreview.tsx`:
  ```ts
  interface QuotedParentPreviewProps {
    parent: ConsultationMessage | null;     // null when reply_to_id resolves to nothing (deleted parent)
    onJumpToParent: () => void;             // smooth-scroll handler
  }
  ```
  Render: small box above the body inside `<MessageBubble>`. Sender name + 1-line truncated body (rendered through `renderMarkdownLite(parent.body, { compact: true })`). Tappable.
- [x] **`<MessageBubble>` consumes `<QuotedParentPreview>`** when `message.reply_to_id` is set:
  ```tsx
  {message.reply_to_id ? (
    <QuotedParentPreview
      parent={lookupMessageById(message.reply_to_id)}
      onJumpToParent={() => scrollToMessage(message.reply_to_id, { highlight: true })}
    />
  ) : null}
  ```
  `lookupMessageById` is a parent-injected helper (closure over `messages` array). Pass it via context or as a prop on `<MessageBubble>` (prefer prop to keep the component pure).
- [x] **`scrollToMessage(id, { highlight: true })` helper** in `<TextConsultRoom>`:
  - Finds the bubble's DOM ref by `data-message-id={id}`.
  - `scrollIntoView({ behavior: 'smooth', block: 'center' })`.
  - Adds class `ring-2 ring-blue-400` for 200 ms via `setTimeout` then removes it.
- [x] **Deleted parent fallback** — if `lookupMessageById(reply_to_id)` returns `undefined` (parent soft-deleted via B6 or hard-deleted via archival), `<QuotedParentPreview parent={null}>` renders `Replied to a deleted message` in italics; not tappable.
- [x] **Realtime UPDATE handling** — when an UPDATE event arrives that mutates `body` or `deleted_at` on a message that's a parent of any visible reply, the existing reconcile path naturally re-renders all consumers because `messages` state changes; no separate plumbing needed. Verify in manual smoke.
- [x] **Three-host parity** — quoted-parent + reply-banner render in `standalone` / `panel` / `canvas`.
- [x] **`mode='readonly'`** — quoted-parent renders (history view should preserve thread context); composer reply-banner doesn't (composer is gone).
- [x] Frontend type-check + lint clean. Manual smoke: doctor sends "Take 5mg twice a day"; patient hovers, clicks Reply; reply-banner shows quoted parent; patient types "Got it" + sends; new bubble appears with quoted-parent preview; patient taps quoted preview → scrolls + highlights doctor's message.

---

## Out of scope

- **Multi-level reply chains.** One level only.
- **"Reply privately"** semantics. 2-party chat — irrelevant.
- **Quote-collapse** (only show the parent on hover). Always-visible quote per the source plan.
- **Server-side enforcement** that `reply_to_id` references the same `session_id` as the reply. The B1 RLS policy gates writes to the same session anyway; the FK is enough.
- **Cross-batch reply** (reply to a message from a previous consult). `reply_to_id` is FK-constrained to `consultation_messages` regardless of session, so technically possible — but the composer can only reference messages currently in `messages` (current session). Don't add cross-session reply UX.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/QuotedParentPreview.tsx` — **new** (~40 LOC).
- `frontend/components/consultation/MessageBubble.tsx` — **edit** (consume `<QuotedParentPreview>`; receive `lookupMessageById` prop).
- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (`replyTo` state; reply-banner JSX; `sendMessage` `reply_to_id` wiring; `scrollToMessage` helper; `lookupMessageById` helper).

**No backend, no schema** (B1 already shipped both).

---

## Notes / open decisions

1. **Why prop over context for `lookupMessageById`** — `<MessageBubble>` is rendered in a tight loop; passing a closure-stable prop is fine and easier to reason about than introducing a new context.
2. **Highlight duration** — 200 ms is intentionally short; longer feels distracting. Spring physics not needed.
3. **Block-quote inside reply preview** — `compact: true` (B3) means lists collapse to plain text; that's fine for previews. The full parent renders normally in its own bubble.
4. **`scrollIntoView` behaviour** — `block: 'center'` puts the parent in the middle of the viewport, which is the most user-friendly position. `block: 'start'` would put it at the top, hidden behind the day-separator / pinned banner.
5. **Long-press fallback for desktop** — desktop users get hover; right-click is the secondary path. Mobile depends on C4 long-press; ship a "Reply" icon in B5's per-bubble menu in the meantime so mobile isn't blocked on C4.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch B](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T2 §T2.10](../../../../Product%20plans/text-consult/plan-t2-text-real-polish.md)
- **Schema dep:** [task-text-B1](./task-text-B1-t2-chat-polish-migration.md) (`reply_to_id` column).
- **Render dep:** [task-text-B2](./task-text-B2-message-bubble-extract.md), [task-text-B3](./task-text-B3-markdown-lite-renderer.md).
- **Soft-blocks:** [task-text-C5](./task-text-C5-swipe-to-reply.md) (gesture trigger).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-23).
