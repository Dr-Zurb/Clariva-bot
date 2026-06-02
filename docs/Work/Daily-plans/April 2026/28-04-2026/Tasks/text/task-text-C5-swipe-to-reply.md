# Task text-C5: Swipe-to-reply gesture (drag right ~60 px + spring-back)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch C (T6 mobile native)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

WhatsApp's signature interaction: touch-drag a message bubble to the right ~60 px → triggers reply mode (B4's `replyTo` state). If released before threshold, the bubble springs back. If released past threshold, fires reply + spring-back. A small reply icon appears behind the bubble during the drag, growing from 0 to full opacity as the threshold approaches.

Desktop ignores this gesture (mouse drag = text selection); right-click stays the path.

**Estimated time:** ~5 hours.

**Status:** Done.

**Depends on:** [task-text-B4](./task-text-B4-reply-to-message.md) — hard. The `replyTo` state + `setReplyTo` callback ship there.

**Source plan:** [T6 §T6.36](../../../../Product%20plans/text-consult/plan-t6-text-mobile-native.md)

---

## Acceptance criteria

- [x] **`useSwipeToReply` hook** at `frontend/lib/gestures/use-swipe-to-reply.ts`:
  ```ts
  interface UseSwipeToReplyOptions {
    onTrigger: () => void;
    thresholdPx?: number;     // defaults 60
    maxDragPx?: number;       // defaults 80 (clamp; bubble stops moving past this)
  }
  // Returns { handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }, dragOffset: number }
  ```
- [x] **Implementation correctness:**
  - Touch-only — early-return if `e.pointerType !== 'touch'` (skips mouse and pen).
  - Tracks horizontal drag delta from `pointerdown` start.
  - Updates `dragOffset` on every move, clamped to `[0, maxDragPx]` (no left-drag, no overscroll).
  - On `pointerup`:
    - If `dragOffset >= thresholdPx`, fire `onTrigger()`.
    - Animate `dragOffset` back to 0 (200 ms ease-out CSS transition).
  - Cancels cleanly on `pointercancel` and on vertical movement > 20 px (treat as scroll).
- [x] **`<MessageBubble>` consumes the hook:**
  ```tsx
  const { handlers, dragOffset } = useSwipeToReply({
    onTrigger: () => onStartReply?.(message),
  });
  return (
    <li {...handlers} style={{ transform: `translateX(${dragOffset}px)`, transition: dragging ? 'none' : 'transform 200ms ease-out' }}>
      ...
      <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2" style={{ opacity: dragOffset / 60 }}>
        ↩
      </div>
    </li>
  );
  ```
- [x] **Reply-icon position varies by sender** — own messages (right-aligned) have the reply icon appear to their LEFT during right-drag; counterparty messages (left-aligned) work the same way (icon to left of bubble). Both feel "the icon is what you're swiping toward".

  Wait — re-evaluate: in WhatsApp the icon appears in the gap that opens up during drag. Since drag is right-ward, the gap opens on the LEFT of the bubble for both sender and receiver. Stick with icon-on-left.
- [x] **No regression on tap-jump (B4)** — quoted-parent tap still works (it's a tap, not a drag).
- [x] **No regression on long-press (C4)** — a long-press without movement should still fire B5's reaction picker.
- [x] **No regression on vertical scroll** — touching a bubble and dragging vertically scrolls the message list; horizontal hint with vertical movement should cancel cleanly.
- [x] **`onStartReply` is the parent callback** — same one B4 added to `<MessageBubble>`'s prop surface. Triggering it sets `replyTo` and switches the composer into reply mode.
- [x] **Three-host parity** — works in `standalone` / `panel` / `canvas`.
- [x] **`mode='readonly'`** — `onStartReply` undefined; the gesture does nothing (still fires the spring-back animation, harmless).
- [x] **Mouse / pen pointers ignored** — verified via the `pointerType` check.
- [x] Frontend type-check + lint clean. Manual smoke (mobile): swipe a bubble right ~60 px → reply mode opens with quoted parent in composer; release without crossing threshold → bubble springs back, no reply mode; vertical scroll on a bubble → list scrolls, no reply mode.

---

## Out of scope

- **Swipe-LEFT for any other action** (delete / forward). One gesture, one action.
- **Configurable swipe-threshold via settings.** 60 px is the WhatsApp standard; not exposed.
- **Spring physics** (overshoot before settling). CSS ease-out is enough.
- **Sound on threshold cross.** Haptic-only (defer to a future iteration if requested).
- **Desktop swipe via trackpad gesture.** Out of scope; right-click stays the path.

---

## Files expected to touch

**Frontend:**

- `frontend/lib/gestures/use-swipe-to-reply.ts` — **new** (~60 LOC + 40 LOC test).
- `frontend/components/consultation/MessageBubble.tsx` — **edit** (consume hook; render reply-icon overlay; apply transform style).

**No backend, no schema.**

---

## Notes / open decisions

1. **`pointerType !== 'touch'` early-return** — keeps the gesture mobile-only and avoids interfering with desktop text selection.
2. **Why CSS transition instead of JS animation library** — single-axis 200 ms transition is well-supported and adds zero JS overhead. Frame-perfect.
3. **Vertical-cancellation threshold** — 20 px is forgiving; a real horizontal swipe rarely has more than ~10 px vertical noise.
4. **Haptic on threshold cross** — could add `navigator.vibrate(15)` when the user passes 60 px (haptic confirmation that the gesture will fire on release). Mark as a nice-to-have; ship without if time-constrained.
5. **Reply-icon visual** — `↩` Unicode char or a small `lucide-react` `Reply` icon. Pick whichever the project already uses for consistency.
6. **Browser support** — Pointer Events are universally supported on iOS 13+ / Android 7+. Safe.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch C](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T6 §T6.36](../../../../Product%20plans/text-consult/plan-t6-text-mobile-native.md)
- **Hard dep:** [task-text-B4](./task-text-B4-reply-to-message.md) (`replyTo` state + `setReplyTo`).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-24).
