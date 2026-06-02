# Task text-A3: Send button states polish (idle / ready / sending / queued)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch A (T1 quick wins)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Today's send button is binary (enabled / disabled) with no signal for "queued because we're reconnecting" or "sending right now". On flaky networks Realtime can take 1–30 s to reconnect, during which optimistic sends sit in a queued state with no visual treatment. Users tap Send, see no feedback, tap Send again, and end up double-sending or panicking that the message was lost.

This task introduces a four-state machine driven by existing `sending` and `connection` state in `TextConsultRoom.tsx`:

| State | Trigger | Visual |
|-------|---------|--------|
| `idle` | composer empty | gray fill, disabled |
| `ready` | composer non-empty + `connection === 'online'` | blue fill, enabled |
| `sending` | optimistic send in flight | spinner inline, disabled (prevents double-tap) |
| `queued` | composer non-empty + `connection !== 'online'` | blue fill with clock icon + tooltip "Will send when back online" |

**Estimated time:** ~2 hours.

**Status:** Done.

**Depends on:** None (uses existing `sending` + `connection` state). Coordinates with [task-text-A2](./task-text-A2-composer-footer-hints-and-counter.md) (4000-char hard cap adds the `'disabled-too-long'` branch — wired in this task).

**Source plan:** [T1 §T1.3](../../../../Product%20plans/text-consult/plan-t1-text-quick-wins.md)

---

## Acceptance criteria

- [x] **`SendButtonState` type defined** in `TextConsultRoom.tsx` (or extracted to a small helper if A2 has already shipped):
  ```ts
  type SendButtonState = 'idle' | 'ready' | 'sending' | 'queued' | 'disabled-too-long';

  function deriveSendButtonState({
    composerTrim, sending, connection, charCountOverCap,
  }: {
    composerTrim: string;
    sending: boolean;
    connection: ConnectionStatus;   // existing 'online' | 'reconnecting' | 'offline'
    charCountOverCap: boolean;      // from A2's char-counter guard; false if A2 hasn't shipped
  }): SendButtonState {
    if (charCountOverCap) return 'disabled-too-long';
    if (sending) return 'sending';
    if (!composerTrim) return 'idle';
    if (connection !== 'online') return 'queued';
    return 'ready';
  }
  ```
- [x] **Visual rendering** — each state has a distinct treatment:
  - `idle` — `bg-gray-200 text-gray-400`, button disabled, label "Send" or send-icon-only.
  - `ready` — `bg-blue-600 text-white hover:bg-blue-700`, enabled.
  - `sending` — `bg-blue-600 text-white`, disabled, inline `<Spinner size="xs" />` replacing the icon. `aria-busy="true"`.
  - `queued` — `bg-blue-600 text-white opacity-80`, enabled (tap re-attempts existing optimistic flow), small clock-icon overlay; `title="Will send when back online"`.
  - `disabled-too-long` — `bg-red-100 text-red-600`, disabled (A2 owns the inline error message; this state just visually pairs).
- [x] **`sending` state prevents double-send.** Today the existing `sending` flag should already gate `handleSend`; verify and pin it (`if (sending) return;` at top of `handleSend`).
- [x] **Queued state is honest.** When `connection !== 'online'`, tapping Send should still call `handleSend` — the existing optimistic path enqueues a pending bubble that resolves on reconnect. The button label / icon signal is the only change; behaviour matches today.
- [x] **Three-host parity** — works in `standalone`, `panel`, `canvas`. The clock icon overlay should not break the narrow-width layout in `canvas`.
- [x] **`mode='readonly'`** — composer + button are gone in readonly. Defensively skip the derivation (no work to do).
- [x] Frontend type-check + lint clean. Manual smoke: simulate `connection='offline'` (DevTools network panel: throttle to Offline) → button visibly switches to queued state with clock icon; tap → bubble appears with pending state; restore network → bubble resolves.

---

## Out of scope

- Adding a new `connection` state. Reuse the existing one.
- Animating the spinner / clock-icon transitions. State changes can hard-flip; no easing required.
- A queue-depth indicator ("3 messages queued"). One queued bubble is fine; multiple queued bubbles would benefit from this but should ship separately if requested.
- Mobile haptic on send. T6 mobile-native (Sub-batch C) doesn't include this; if it surfaces, it's a separate decision.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (send button JSX block; new `sendButtonState` derivation; per-state class application).

**Optional new file** if the derivation grows beyond ~10 lines:

- `frontend/components/consultation/sendButtonState.ts` — pure function + type. Extract only if it makes the call site cleaner.

**No backend, no schema.**

---

## Notes / open decisions

1. **Spinner component** — reuse the existing repo spinner (search `<Spinner` in `frontend/components/`); if none exists, an inline SVG-with-animate-spin Tailwind class is fine.
2. **Clock icon** — reuse the lucide-react / heroicons set already in the project (search `Clock` import). Don't add a new icon library.
3. **Tooltip implementation** — `title` HTML attribute is sufficient; don't add a tooltip library for one tooltip.
4. **Coordinate with A2** — both ship to the composer. If A3 ships first: A2 adds the `'disabled-too-long'` branch via the same machine. If A2 ships first: A3 wires the existing `composerLength > 4000` boolean into `charCountOverCap` cleanly.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch A](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T1 §T1.3](../../../../Product%20plans/text-consult/plan-t1-text-quick-wins.md)
- **Coordinates with:** [task-text-A2](./task-text-A2-composer-footer-hints-and-counter.md) (4000-char cap → `'disabled-too-long'` state).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done.
