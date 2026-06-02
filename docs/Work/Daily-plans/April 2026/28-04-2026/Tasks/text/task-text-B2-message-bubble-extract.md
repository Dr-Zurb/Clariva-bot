# Task text-B2: Extract `<MessageBubble>` from inline JSX in `TextConsultRoom.tsx`

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch B (T2 real polish) — **refactor precondition**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

`TextConsultRoom.tsx` renders message bubbles inline today (~150 LOC of nested JSX inside the message-list `.map`). Sub-batch B's eight T2 frontend items each add per-bubble affordances:

- B3 — markdown-lite renderer (replaces the body text node)
- B4 — quoted-parent preview (above the body)
- B5 — reactions row (below the body) + long-press / right-click handler
- B6 — per-bubble menu (edit / delete) + "(deleted by ...)" placeholder
- B7 — "📌 pinned" badge (above the body)
- B8 — multi-attachment grid

Adding all of those into the existing inline JSX would push the parent component past 2000 LOC and make per-bubble state (hover, menu-open, reaction-picker-open) a nightmare to manage at the parent level. Extracting now — before any T2 frontend item lands — keeps each subsequent task small and surgical.

This task is a **pure refactor**: the rendered output must be byte-identical to today's. No new features, no behaviour change. Once it lands, B3–B7 each touch only `<MessageBubble>` (or sibling small components like `<ReactionPicker>`, `<QuotedParentPreview>`).

**Estimated time:** ~3 hours (extract, snapshot test against current render, manual smoke).

**Status:** Done.

**Depends on:** [task-text-B1](./task-text-B1-t2-chat-polish-migration.md) is **NOT** a hard dep — B2 can ship in parallel with B1 since this task touches no schema. Sequence after B1 only because PRs touching the same room file should land serially.

**Hard-blocks:** B3 / B4 / B5 / B6 / B7 / B8 (every T2 frontend item lands inside `<MessageBubble>`).

**Source plan:** [T2 frontend prep](../../../../Product%20plans/text-consult/plan-t2-text-real-polish.md) (refactor precondition, not a tier item per se).

---

## Acceptance criteria

- [x] **New file `frontend/components/consultation/MessageBubble.tsx`** with the contract:
  ```ts
  export interface MessageBubbleProps {
    message: ConsultationMessage;          // existing type from frontend/lib/text/types.ts
    currentUserId: string;
    currentUserRole: 'doctor' | 'patient';
    layout: 'standalone' | 'panel' | 'canvas';
    mode: 'live' | 'readonly';
    onRetryFailed?: (localId: string) => void;
    onDiscardFailed?: (localId: string) => void;
    // Future hooks (added by B3–B8 — leave commented stubs now to signal the boundary):
    // onOpenReactionPicker?: (messageId: string, anchor: HTMLElement) => void;
    // onStartReply?: (message: ConsultationMessage) => void;
    // onStartEdit?: (message: ConsultationMessage) => void;
    // onSoftDelete?: (messageId: string) => void;
    // onTogglePin?: (messageId: string) => void;
  }
  ```
- [x] **`<MessageBubble>` renders byte-identical output to today's inline JSX.** Every `className`, every aria-attr, every conditional branch. The diff at this stage is purely structural (move the JSX from inline `.map` to the new component).
- [x] **`TextConsultRoom.tsx` consumes `<MessageBubble>`** in the message-list `.map`:
  ```tsx
  {messages.map((m) => (
    <MessageBubble
      key={m.id ?? m.local_id}
      message={m}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
      layout={layout}
      mode={mode}
      onRetryFailed={retryFailed}
      onDiscardFailed={discardFailed}
    />
  ))}
  ```
- [x] **All hooks that need to live at the parent stay at the parent** — scroll-position tracking, presence broadcasts, INSERT subscriptions, etc. Only the per-bubble RENDER moves.
- [x] **No regression** in any of the affordances already shipped (A1 jump-to-latest still fires on INSERT; A6 failed-bubble retry still works; A7 ✓✓ still renders correctly).
- [x] **Three-host parity preserved** — render is identical in `standalone`, `panel`, `canvas`. No new per-layout branching introduced.
- [x] **`mode='readonly'` behaviour preserved** — readonly views still hide the affordances they hid before; nothing new shows up.
- [x] **Snapshot test** at `frontend/components/consultation/__tests__/MessageBubble.test.tsx`:
  - Renders a doctor's text message — snapshot.
  - Renders a patient's text message — snapshot.
  - Renders a system message (`kind === 'system'`) — snapshot.
  - Renders an attachment message — snapshot.
  - Renders a failed-send bubble — snapshot.
  - Renders in `mode='readonly'` — snapshot (no affordance, just the bubble + body).
- [x] Frontend type-check + lint clean. Manual smoke: open standalone + panel + canvas; verify pixel-identical to pre-refactor.

---

## Out of scope

- **Adding any new affordance.** This is a pure refactor; no T2 features land here.
- **Changing the `ConsultationMessage` type.** B1 added the new columns to the row shape; the type may already include them as optional. If it doesn't, add them as optional in this task (touching the type without using the columns is a separate consideration — extending an interface is fine, that's not a "feature").
- **Performance optimisations** (`React.memo`, virtualization). Memo could help but isn't necessary at <100 messages; D3 owns virtualization.
- **Extracting sibling components** like `<ReactionPicker>`, `<QuotedParentPreview>`. Each subsequent task creates them as needed.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/MessageBubble.tsx` — **new** (~150 LOC; move from inline JSX).
- `frontend/components/consultation/__tests__/MessageBubble.test.tsx` — **new** (~80 LOC; 6 snapshots).
- `frontend/components/consultation/TextConsultRoom.tsx` — **edit** (delete the inline JSX block, replace with the `<MessageBubble>` consumption above).
- `frontend/lib/text/types.ts` (or wherever `ConsultationMessage` lives) — **extend if needed** to make the new B1 columns (optional) available on the type; render path doesn't use them yet.

**No backend, no schema.**

---

## Notes / open decisions

1. **Why now and not "as needed by each B item"** — sequencing each T2 task to refactor-then-add would create six redundant refactor passes and six round-trip reviews. One refactor + six clean adds is cheaper to ship and review.
2. **Snapshot test brittleness** — snapshots break on every B-task PR (which is the point — they force the reviewer to confirm the new render is intentional). Don't lose patience and remove them; update snapshots in each B-task PR.
3. **`onOpenReactionPicker` / `onStartReply` etc. as commented stubs** — signal the boundary so the next T2 task developer doesn't have to re-think the callback shape. Use commented stubs (don't add empty optional callbacks today) to keep the type surface clean.
4. **Naming** — `<MessageBubble>` is the convention used in the source plans; stick with it. Don't rename to `<ChatBubble>` or `<MessageRow>`.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch B](../Plans/plan-text-consult-selected-features.md)
- **Hard-blocks downstream:** B3 / B4 / B5 / B6 / B7 / B8 (every T2 frontend item).
- **Refactor of:** existing inline JSX block in `frontend/components/consultation/TextConsultRoom.tsx` (~150 LOC inside the `.map`).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done; **refactor precondition for B3–B8**. Shipped 2026-05-23.
