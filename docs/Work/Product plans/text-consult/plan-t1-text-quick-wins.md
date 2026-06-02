# Text T1 — Quick wins (8 items, ~1.5 days)

## Lift the chat from "MVP that works" to "feels like a proper messaging product" in a single short sprint

> **Roadmap reference:** [plan-00-text-consult-roadmap.md](./plan-00-text-consult-roadmap.md). T1 is the first slice.
>
> **Foundation:** [plan-04-text-consultation-supabase.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-04-text-consultation-supabase.md) — the Supabase-Realtime chat these items polish.

---

## Goal

Ship eight UX items that together move every chat from "it works" to "it feels intentional". All eight live inside (or adjacent to) `frontend/components/consultation/TextConsultRoom.tsx`. **Zero backend changes. Zero schema changes. Zero new vendors.** ~1.5 days end-to-end.

Items are scoped to ship in **all three host layouts** (`standalone`, `panel`, `canvas`) without per-host branching unless explicitly noted.

---

## Status

`Drafted` — pre-approved by owner; **all 8 items SELECTED 2026-04-28** for the implementation batch tracked in [plan-text-consult-selected-features.md](../../Daily-plans/April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md). See that file for sub-batch sequencing (T1 maps to Sub-batch A).

---

## What's in scope (all 8 items)

> All 8 items below are marked **`[SELECTED 2026-04-28]`** — see [combined batch plan](../../Daily-plans/April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md) for sequencing into Sub-batch A.

| # | Item | Effort | Touch points |
|---|------|--------|--------------|
| T1.1 | **`[SELECTED 2026-04-28]`** **Jump-to-latest button.** When the user has scrolled up and a new message arrives, show a floating "↓ N new messages" pill above the composer. Tap → smooth-scroll to bottom + clear. Today the chat just stays put — users miss new messages. | S (~2h) | New `<TextChatJumpToLatest>`; `TextConsultRoom.tsx` consumes (`wasAtBottomRef` already exists). |
| T1.2 | **`[SELECTED 2026-04-28]`** **Composer keyboard hints.** Visible inline hint: "Enter to send · Shift+Enter for newline" beneath the composer (small, dismissable). Today users don't know Shift+Enter exists. | XS (~30 min) | `TextConsultRoom.tsx` composer footer. |
| T1.3 | **`[SELECTED 2026-04-28]`** **Send button states polish.** Three visual states: `idle` (gray, disabled when composer empty), `ready` (blue, enabled), `sending` (spinner). Plus a queued indicator when offline ("Will send when back online"). | S (~2h) | `TextConsultRoom.tsx` composer; reuses existing `sending` + `connection` state. |
| T1.4 | **`[SELECTED 2026-04-28]`** **Day separators in the message list.** "Today", "Yesterday", "Mon, 28 Apr" inline labels between bubble groups when the date changes. Today everything is one continuous stream. | S (~2h) | `TextConsultRoom.tsx` render; reuses existing `shouldShowTimestamp` shape. |
| T1.5 | **`[SELECTED 2026-04-28]`** **Delivered ✓ / Seen ✓✓ indicators on own messages.** Use existing presence as the proxy: `delivered` = Realtime INSERT acked; `seen` = counterparty's tab is foregrounded AND scrolled to bottom while message arrives. WhatsApp-style double-check icon. | M (~4h) | `TextConsultRoom.tsx`; new "viewed-bottom" presence broadcast (additive on existing presence channel). |
| T1.6 | **`[SELECTED 2026-04-28]`** **Composer character counter for long messages.** Above ~500 chars, show a small `500 / 4000` counter (soft ceiling). Hard ceiling at 4000 chars (composer caps; backend free). Today the composer happily accepts a 50KB paste with no warning. | XS (~30 min) | `TextConsultRoom.tsx` composer footer. |
| T1.7 | **`[SELECTED 2026-04-28]`** **"Counterparty is typing…" polish.** Replace the bare text with the counterparty's avatar dot + animated three-dots ellipsis. Cap visibility at 5 s without further `typing:true` broadcast (existing typing-broadcast contract is 1 s throttle / 3 s idle — match). | S (~2h) | `TextConsultRoom.tsx`; existing `counterpartyTyping` state. |
| T1.8 | **`[SELECTED 2026-04-28]`** **Failed-send retry polish.** When an INSERT fails (RLS reject / network), today the bubble shows a "retry" CTA. Improve: subtle red left-border on the bubble, "Failed to send · Retry · Discard" inline row, single-tap retry without losing other queued sends. | S (~3h) | `TextConsultRoom.tsx` failed-message render; existing `failed` + `retryBody` state. |

---

## Non-goals (explicitly NOT in T1 — owned by later tiers)

- **Reactions, reply-to, edit, delete, markdown** — T2 items.
- **Suggested replies / templates / AI summary** — T3 items.
- **Post-chat summary or rating** — T4 items.
- **Multi-tab kick / crash-recovery composer draft** — T5 items.
- **Swipe gestures / long-press / image lightbox** — T6 items.
- Any backend, schema, or DM-copy changes.

---

## Why each item is in T1

- **T1.1 jump-to-latest** — the single biggest "this feels MVP" giveaway today. Every other chat product has it. Cheap to add, hard to mis-build.
- **T1.2 keyboard hints** — Shift+Enter is invisible feature today. Patients on mobile don't care, but doctors composing longer replies on desktop hit Enter and accidentally send half-thoughts.
- **T1.3 send-state feedback** — closes the loop on "did my message go?" The queued state in particular is real — Realtime reconnects can take 1-30s on flaky networks; users deserve to see "queued" instead of an empty void.
- **T1.4 day separators** — clinical chats can stretch across days (post-consult follow-up window). Today they read as one undifferentiated stream.
- **T1.5 delivered/seen** — closes the same anxiety loop for the sender. Presence is already wired; we're just deriving a richer signal from existing data.
- **T1.6 char counter** — defensive UX. Patients who paste long lab reports as text (rather than as PDF attachments) trigger oversize messages today; this nudges them toward the attachment path.
- **T1.7 typing polish** — the existing "Doctor is typing..." text feels old-fashioned. The avatar + ellipsis pattern is the universal vocabulary; matching it makes the surface feel current.
- **T1.8 failed-send polish** — RLS rejects (e.g. session ends mid-compose) are real. The current red-text retry is functional but unfriendly; the bordered-bubble pattern reduces user shame and makes the recovery path obvious.

---

## Implementation contract per item

### T1.1 — Jump-to-latest button

```ts
// frontend/components/consultation/TextChatJumpToLatest.tsx (NEW)

interface Props {
  unreadCount: number;       // count of new messages received while wasAtBottom = false
  onJump: () => void;        // smooth-scroll to bottom + reset unread
}

// Renders nothing when unreadCount === 0.
// Renders a floating pill above the composer when unreadCount > 0.
// Floating, not absolute: stays within the message-list area, not the composer.

// In TextConsultRoom.tsx:
//   - When a new INSERT arrives AND wasAtBottomRef.current === false,
//     increment a new `unreadSinceScrollUp` counter.
//   - When user scrolls back to bottom (existing isAtBottom check), reset to 0.
//   - Pass count + onJump to <TextChatJumpToLatest>.
```

### T1.2 — Composer keyboard hints

```tsx
// In TextConsultRoom.tsx — composer footer, dismissable:
<div className="text-[11px] text-gray-400 px-2 py-1 select-none">
  {hintDismissed ? null : (
    <>
      <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for newline
      <button
        type="button"
        onClick={() => { setHintDismissed(true); localStorage.setItem('chat_hint_dismissed_v1', '1'); }}
        className="ml-2 underline"
      >
        Got it
      </button>
    </>
  )}
</div>

// Persist dismissal in localStorage so the hint doesn't re-appear on every reload.
// Hidden in `mode='readonly'` (composer is gone anyway).
```

### T1.3 — Send button states

```ts
// In TextConsultRoom.tsx composer:
type SendButtonState = 'idle' | 'ready' | 'sending' | 'queued';

const sendButtonState: SendButtonState =
  sending          ? 'sending' :
  connection !== 'online' && composer.trim() ? 'queued' :
  composer.trim()  ? 'ready' :
                     'idle';

// Render:
//   idle      → gray, disabled
//   ready     → blue, enabled
//   sending   → spinner inline, disabled (prevents double-send)
//   queued    → blue with clock icon + tooltip "Will send when back online"
```

### T1.4 — Day separators

```ts
// In the message-list render loop:
//   - Track `lastRenderedDate` (YYYY-MM-DD).
//   - Before rendering a bubble whose createdAt's date differs, emit:
//     <div className="text-center text-xs text-gray-500 my-3">
//       {formatDayLabel(message.createdAt)}
//     </div>
//
// formatDayLabel returns:
//   "Today"            (same calendar day)
//   "Yesterday"        (1 day ago)
//   "Mon, 28 Apr"      (older — pinned to en-GB to avoid hydration mismatch,
//                       per the deferred date-locale sweep)
```

### T1.5 — Delivered / seen indicators

```ts
// Two-step:
//
// 1. `delivered` — already implicit; show ✓ as soon as the optimistic
//    bubble reconciles with the server-acked id (existing flow). On
//    failed sends, ✓ stays absent + bubble flips to T1.8 failed state.
//
// 2. `seen` — extend the existing presence channel:
//    - Each side broadcasts `viewed-bottom: { user_id, at }` when:
//        * presence is online, AND
//        * tab is foregrounded (document.visibilityState === 'visible'), AND
//        * scrolled to bottom (wasAtBottomRef.current === true).
//    - On receipt, mark all of THIS-side's messages with createdAt <= at
//      as `seen = true`.
//    - Render: ✓ (delivered) → ✓✓ blue (seen).
//
// Cleanup: tab loses visibility → broadcast `viewed-bottom: null` so seen
// state stops advancing. Not strictly necessary for correctness; nice for
// the "I'm not actually reading" honesty of the indicator.
```

### T1.6 — Composer character counter

```tsx
// In composer footer (right-aligned):
{composer.length >= 500 ? (
  <span
    className={composer.length > 4000 ? 'text-red-600' : 'text-gray-500'}
    aria-live="polite"
  >
    {composer.length} / 4000
  </span>
) : null}

// Hard ceiling at 4000 chars — block send + show inline error
// "Message too long — attach as a file instead" with a one-tap CTA that
// opens the attachment picker pre-filled with a .txt of the composer body.
```

### T1.7 — Typing indicator polish

```tsx
// Replace bare text with a small typing-row:
{counterpartyTyping ? (
  <div className="flex items-center gap-2 px-3 py-1 text-xs text-gray-500">
    <Avatar role={counterpartyRole} size="xs" />
    <span className="inline-flex">
      <span className="animate-typing-dot">.</span>
      <span className="animate-typing-dot delay-150">.</span>
      <span className="animate-typing-dot delay-300">.</span>
    </span>
  </div>
) : null}

// `animate-typing-dot` keyframe in tailwind config — opacity 0.3 → 1 → 0.3
// staggered 150ms per dot. Matches the WhatsApp / Telegram cadence.
```

### T1.8 — Failed-send retry polish

```tsx
// Failed-bubble render (extends existing failed-state branch):
<li className="border-l-2 border-red-300 pl-2">
  <div className="message-bubble">{message.body}</div>
  <div className="mt-1 flex items-center gap-2 text-xs text-red-700">
    <span>Failed to send</span>
    <button onClick={() => retryFailed(message.id)} className="underline">Retry</button>
    <button onClick={() => discardFailed(message.id)} className="underline">Discard</button>
  </div>
</li>

// retryFailed reuses the existing optimistic-send path with the saved retryBody.
// discardFailed removes the bubble from local state (no server call needed since
// the row was never persisted on failure).
```

---

## Acceptance criteria

- [ ] **T1.1** — when scrolled up and a new message arrives, jump-to-latest pill appears within 100 ms; tap smooth-scrolls and clears the pill.
- [ ] **T1.2** — keyboard hint visible until dismissed; dismissal persists across reloads.
- [ ] **T1.3** — send button visibly distinguishes idle / ready / sending / queued; double-tap during `sending` does not double-send.
- [ ] **T1.4** — day-separator labels render correctly across "today / yesterday / older"; survives a fresh load (no hydration mismatch).
- [ ] **T1.5** — own-message ✓ / ✓✓ indicators update within 1 s of the counterparty viewing; degrades gracefully (stays at ✓) when counterparty offline / tab hidden.
- [ ] **T1.6** — char counter appears at 500+ chars; 4000-char hard cap blocks send with the attach-as-file fallback CTA.
- [ ] **T1.7** — typing indicator shows avatar + animated dots; disappears within ≤4 s of last typing broadcast.
- [ ] **T1.8** — failed bubble has clear visual treatment, retry preserves order, discard removes cleanly.
- [ ] All 8 items work in `<TextConsultRoom layout='standalone' | 'panel' | 'canvas'>` at parity.
- [ ] No regression on existing chat flow (optimistic send, reconnect, presence, attachments, typing).
- [ ] `mode='readonly'` unaffected — none of these items render composer-side affordances when composer is removed.
- [ ] Frontend type-check + lint clean.
- [ ] Manual smoke: doctor + patient on different devices for a 5-min chat exercises every T1 item without hitting a console error.

---

## Files expected to touch

**Frontend (only):**

- `frontend/components/consultation/TextConsultRoom.tsx` (**extend**) — every item touches this.
- `frontend/components/consultation/TextChatJumpToLatest.tsx` (**new**, T1.1).
- `frontend/tailwind.config.ts` (**extend**, T1.7) — `animate-typing-dot` keyframe.

**No backend changes. No schema changes. No DM copy changes.**

---

## Open questions / decisions for during implementation

1. **Seen-indicator strictness** (T1.5) — the spec is "tab visible + scrolled to bottom". Should "scrolled to bottom" reset every time the user scrolls up, or only on explicit re-engagement? Recommendation: reset on scroll-up (matches WhatsApp's "you're not actually reading" honesty).
2. **Hint dismissal scope** (T1.2) — local-storage per-device, or per-user (synced)? Recommendation: per-device (cheap; the hint is also cheap).
3. **Composer hard-cap** (T1.6) — 4000 chars or a different number? Recommendation: 4000 (~1 page of dense text); doctors writing longer go through the prescription / discharge-summary surface, not the chat composer.
4. **Day-separator locale** (T1.4) — pin to `en-GB` per the [deferred date-locale sweep](../../deferred/deferred-date-locale-hydration-sweep-2026-04-28.md) to avoid hydration mismatch. Already a known repo-wide concern.
5. **Failed-send discard confirmation** (T1.8) — should "Discard" require confirmation? Recommendation: no — the message never persisted, the user can always retype. Confirmation adds friction with no safety value.

---

## References

- [plan-00-text-consult-roadmap.md](./plan-00-text-consult-roadmap.md)
- [plan-04-text-consultation-supabase.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-04-text-consultation-supabase.md)
- [plan-06-companion-text-channel.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-06-companion-text-channel.md) — three-host parity contract.
- [plan-07-recording-replay-and-history.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-07-recording-replay-and-history.md) — `mode='readonly'` invariant.
- Supabase Realtime — presence + broadcast channels for T1.5 viewed-bottom signal.

---

**Owner:** TBD  
**Created:** 2026-04-28  
**Status:** Drafted; **all 8 items SELECTED 2026-04-28** — implementation tracked in [plan-text-consult-selected-features.md](../../Daily-plans/April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md) (Sub-batch A).
