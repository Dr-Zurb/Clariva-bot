# Task text-C4: Long-press for reactions (300 ms + `navigator.vibrate(15)`)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch C (T6 mobile native)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

B5 already shipped a baseline long-press-to-open-picker handler in `<MessageBubble>` (300 ms timeout). This task refines it for production-grade mobile feel:

- Add `navigator.vibrate(15)` haptic feedback when the long-press fires (only if the browser supports it; gracefully no-op if not).
- Suppress text-selection / context-menu during the long-press (mobile Safari + Android Chrome both have annoying default behaviours here).
- Cancel cleanly on movement (>10 px touch drift = treat as scroll, not a long-press).
- Position the picker near the touch point, not at a fixed corner.

**Estimated time:** ~3 hours.

**Status:** Done.

**Depends on:** [task-text-B5](./task-text-B5-message-reactions.md) — hard. Reaction picker + base long-press timer ship there.

**Source plan:** [T6 §T6.37](../../../../Product%20plans/text-consult/plan-t6-text-mobile-native.md)

---

## Acceptance criteria

- [x] **`useLongPress` hook** at `frontend/lib/gestures/use-long-press.ts`:
  ```ts
  interface UseLongPressOptions {
    onLongPress: (anchor: HTMLElement) => void;
    durationMs?: number;       // defaults 300
    moveTolerancePx?: number;  // defaults 10
    haptic?: boolean;          // defaults true; calls navigator.vibrate(15) on fire
  }
  // Returns { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } event handlers
  ```
- [x] **Implementation correctness:**
  - Sets a `setTimeout` on `pointerdown`; clears on `pointerup` / `pointercancel` / movement > tolerance.
  - On fire, calls `onLongPress(eventTargetElement)` AND `navigator.vibrate?.(15)` if `haptic` is true and the API exists.
  - Calls `e.preventDefault()` on the firing `pointerdown` to suppress mobile-Safari text selection.
- [x] **Replaces the inline long-press logic in `<MessageBubble>`** (added by B5) with the hook. Functional equivalence verified.
- [x] **Picker anchor positioning** — `<ReactionPicker>` (B5) currently anchors at the bubble's `getBoundingClientRect`. Update it to accept an alternate `coords?: { x: number; y: number }` prop; long-press passes the touch coords. Picker positions itself above the touch point with viewport-edge clamping.
- [x] **Right-click on desktop** still goes through the `oncontextmenu` path (B5's existing behaviour) — this task doesn't touch that path.
- [x] **No regression on tap-to-jump** for quoted-parent (B4) — a fast tap (<300 ms) on a bubble shouldn't fire long-press. Verify with manual smoke.
- [x] **No regression on scroll** — touching a bubble and scrolling the message list shouldn't fire long-press. Movement tolerance handles this.
- [x] **Three-host parity** — works in `standalone` / `panel` / `canvas`.
- [x] **`mode='readonly'`** — long-press is wired through B5's `onOpenPicker`; if the picker isn't reachable in readonly (per B5's `mode` gating), long-press is effectively a no-op.
- [x] Frontend type-check + lint clean. Manual smoke (mobile): long-press a bubble; subtle haptic + picker opens at touch point; release after picking → reaction lands. Drag a bubble during long-press window → no picker opens.

---

## Out of scope

- **Long-press for OTHER actions** (reply, edit, etc.). The per-bubble menu is the surface for those (B6's `<MessageBubbleMenu>`); long-press is reserved for reaction picker only on mobile.
- **Custom haptic patterns.** A single 15 ms vibrate is sufficient.
- **Visual feedback during the 300 ms hold** (e.g. growing ring). Premature; tactile feedback is enough.
- **Configurable hold duration.** 300 ms is the WhatsApp standard; don't expose as a setting.

---

## Files expected to touch

**Frontend:**

- `frontend/lib/gestures/use-long-press.ts` — **new** (~50 LOC + 30 LOC test).
- `frontend/components/consultation/MessageBubble.tsx` — **edit** (replace inline long-press logic with hook).
- `frontend/components/consultation/ReactionPicker.tsx` — **edit** (accept optional `coords` prop for touch-point anchoring).

**No backend, no schema.**

---

## Notes / open decisions

1. **PointerEvent vs Touch/MouseEvent** — pointer events unify both; supported everywhere modern. Use `onPointerDown` etc.
2. **`preventDefault` on `pointerdown`** — suppresses long-press text selection on iOS. Side effect: also suppresses native scrollbars-by-pointer-down; acceptable trade-off because the bubble isn't a scroll container.
3. **Movement tolerance** — 10 px is loose enough for thumb tremor, tight enough to detect deliberate scroll.
4. **`navigator.vibrate` permission** — no permission required on Android; iOS has historically not implemented `vibrate` at all (silently no-op). Don't surface a permission UI; the haptic is a polish, not a feature.
5. **Why 300 ms** — sweet spot between "tap" (<200 ms typical) and "hold" (>500 ms feels sluggish). Matches WhatsApp / iMessage.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch C](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T6 §T6.37](../../../../Product%20plans/text-consult/plan-t6-text-mobile-native.md)
- **Hard dep:** [task-text-B5](./task-text-B5-message-reactions.md) (`<ReactionPicker>` + base long-press).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done
