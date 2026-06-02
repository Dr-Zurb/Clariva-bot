# Task text-A2: Composer footer — keyboard hints (dismissable) + character counter (500+ display, 4000 hard cap)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch A (T1 quick wins)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Two of the cheapest items in the entire batch live in the same DOM real-estate (the composer footer below the textarea), so they ship as one task to avoid two PRs touching the same JSX block.

**T1.2 — Keyboard hints.** The composer accepts `Shift+Enter` for a newline today (existing `onKeyDown`), but nothing tells the user that. Doctors composing longer replies on desktop hit Enter, accidentally send half-thoughts, and learn the shortcut by accident. Visible inline hint: `<kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for newline · <button>Got it</button>`. Dismissal persists in `localStorage`.

**T1.6 — Character counter.** The composer accepts arbitrary-size paste today; a patient pasting a 50KB lab report as text bypasses the attachment path and inflates `consultation_messages.body`. Soft display at 500 chars (`500 / 4000` counter, gray); hard cap at 4000 chars (red counter, send blocked, inline error with "attach as file instead" CTA that opens the attachment picker pre-filled with a `.txt` of the composer body).

**Estimated time:** ~1 hour combined (~30 min each).

**Status:** Done.

**Depends on:** None. Independent of every other Sub-batch A task.

**Source plan:** [T1 §T1.2 + §T1.6](../../../../Product%20plans/text-consult/plan-t1-text-quick-wins.md)

---

## Acceptance criteria

### T1.2 — Keyboard hints

- [x] **Hint row renders below the composer textarea** (above the existing send button row), with the copy: `Enter to send · Shift+Enter for newline` and a small `Got it` dismiss button.
- [x] **Dismissal persists** via `localStorage.setItem('chat_hint_dismissed_v1', '1')`. Subsequent reloads / new consults / new tabs skip the hint.
- [x] **Hidden in `mode='readonly'`** — composer is gone in readonly anyway, but defensively early-return.
- [x] **Three-host parity** — visible in `standalone` and `panel`; in `canvas` (voice room companion), the hint is hidden by CSS `@media` because the composer is mobile-tablet-narrow and the hint becomes visual noise. Add a `data-host="canvas"` selector on the parent that suppresses the hint via Tailwind `hidden` class.
- [x] **Keyboard `<kbd>` styling** matches existing repo conventions if any (search `<kbd` in `frontend/components/`); if no convention exists, use Tailwind `bg-gray-100 px-1 rounded text-xs`.

### T1.6 — Character counter

- [x] **Counter is hidden when `composer.length < 500`.** No DOM noise for short messages.
- [x] **At 500 ≤ length ≤ 4000:** render right-aligned `{length} / 4000` in `text-gray-500 text-xs`. `aria-live="polite"` so screen readers announce the count.
- [x] **At length > 4000:** counter flips to `text-red-600`. Send button disabled (extends T1.3's send-state machine — coordinate with task-text-A3 if both ship same-day; otherwise add an inline `disabled` guard now and refactor in A3).
- [x] **Inline "attach as file instead" CTA** appears when length > 4000: copy `Message too long — attach as file instead`. Tap → triggers attachment picker (existing `fileInputRef.current?.click()`) with the composer body pre-rendered into a `.txt` file via `new File([composer], 'message.txt', { type: 'text/plain' })` (do NOT auto-send; user reviews + sends through the existing attachment path).
- [x] **No regression on existing send path** — paste-large-then-truncate-to-4000 doesn't crash; backspace below 500 cleanly hides the counter.
- [x] Frontend type-check + lint clean. Manual smoke: type 499 chars (no counter), paste at 500 chars (counter appears), paste at 4001 chars (red counter + send blocked + CTA visible).

---

## Out of scope

- Backend body-size enforcement. The 4000-char cap is a UX guardrail; the DB has no length constraint and shouldn't acquire one (it would block legitimate edge cases like a doctor pasting a discharge summary). Soft cap only.
- Localising the hint copy. English-only in v1.
- A "tour" / coachmark style overlay. The inline hint is enough.
- Counter colour-coding intermediate steps (e.g. yellow at 3000+). Two-state (gray / red) is sufficient.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (composer footer JSX block; new `hintDismissed` state read from `localStorage` on mount; new `composerLength` derivation; CTA wiring through `fileInputRef`).

**No new files. No backend. No schema.**

---

## Notes / open decisions

1. **Why localStorage and not sessionStorage** — the hint is informational; persisting across browser sessions is the user-friendly choice. Per-device, not per-user; that's fine for a one-time tip.
2. **CTA copy** — keep it terse. Avoid imperatives like "You must"; the user is already at a friction point.
3. **Hard-cap interaction with T1.3 send-state** (task-text-A3) — if A3 hasn't shipped yet, add a local `disabled={composer.length > 4000}` on the send button. When A3 lands, refactor: A3's `sendButtonState` derivation should include a `'disabled-too-long'` branch.
4. **Hard cap ALSO blocks the Enter-key send path,** not just the button. Add `if (composer.length > 4000) return;` at the top of `handleSend`.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch A](../Plans/plan-text-consult-selected-features.md)
- **Source items:** [T1 §T1.2 + §T1.6](../../../../Product%20plans/text-consult/plan-t1-text-quick-wins.md)
- **Coordinates with:** [task-text-A3](./task-text-A3-send-button-states.md) (send-state machine; refactor on convergence).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-23).
