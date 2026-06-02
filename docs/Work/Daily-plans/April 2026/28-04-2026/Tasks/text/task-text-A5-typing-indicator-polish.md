# Task text-A5: Counterparty typing indicator polish (avatar dot + animated three-dots)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch A (T1 quick wins)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Today the typing indicator is a bare text line (`"Doctor is typing..."`) — functional but visually behind the modern messaging baseline. Every chat product the patient demographic uses (WhatsApp, iMessage, Telegram) renders this as `[avatar dot] [animated three-dot ellipsis]`. Matching that vocabulary makes the surface feel current at zero engineering risk — the broadcast channel + state already exist (`counterpartyTyping`, `typingTimerRef`, presence channel `text-presence:{sessionId}`).

This task swaps the render only. No protocol changes; the existing 1-second-throttle + 3-second-idle broadcast contract stays exactly as it is.

**Estimated time:** ~2 hours.

**Status:** Done.

**Depends on:** None. Independent of every other Sub-batch A task.

**Source plan:** [T1 §T1.7](../../../../Product%20plans/text-consult/plan-t1-text-quick-wins.md)

---

## Acceptance criteria

- [x] **Render block in `TextConsultRoom.tsx`** replaces the bare text with a typing-row component:
  ```tsx
  {counterpartyTyping ? (
    <div className="flex items-center gap-2 px-3 py-1 text-xs text-gray-500" aria-live="polite">
      <Avatar role={counterpartyRole} size="xs" />
      <span className="inline-flex gap-0.5" aria-label={`${counterpartyName} is typing`}>
        <span className="animate-typing-dot">·</span>
        <span className="animate-typing-dot [animation-delay:150ms]">·</span>
        <span className="animate-typing-dot [animation-delay:300ms]">·</span>
      </span>
    </div>
  ) : null}
  ```
- [x] **Avatar component** — reuse the existing `<Avatar>` if one exists (search `frontend/components/` for `Avatar` exports); otherwise a small inline circle with the role's initials (`Dr` / `P`) and the role's brand colour (doctor = blue, patient = gray). Keep it tiny — `size="xs"` ≈ 16 px.
- [x] **Tailwind keyframe `animate-typing-dot` added** to `frontend/tailwind.config.ts`:
  ```ts
  // tailwind.config.ts → theme.extend.keyframes
  'typing-dot': {
    '0%, 100%':  { opacity: '0.3' },
    '50%':       { opacity: '1' },
  },
  // theme.extend.animation
  'typing-dot': 'typing-dot 900ms ease-in-out infinite',
  ```
  The 150ms / 300ms staggers come from the per-element `animation-delay` arbitrary class above.
- [x] **5-second visibility cap.** If no `typing:true` broadcast arrives within 5 s (extending the existing 3 s idle by 2 s of grace), the indicator hides locally even without a `typing:false` broadcast. This guards against a counterparty who closes the tab mid-typing and leaves the dot stuck on. Use a `setTimeout` cleared on each broadcast.
- [x] **No regression on existing broadcast contract** — sender-side throttle (1 s between broadcasts) + idle window (3 s) untouched.
- [x] **Three-host parity** — same render in `standalone`, `panel`, `canvas`. Position above the composer (existing position).
- [x] **`mode='readonly'`** — typing indicator is gone in readonly (presence channel isn't subscribed; this should already be the case but verify).
- [x] Frontend type-check + lint clean. Manual smoke: open two browser windows; type in window 1, watch window 2 show animated dots within 1 s; stop typing, watch the dots disappear within 5 s; close window 1's tab abruptly mid-typing, watch window 2 self-clear after 5 s.

---

## Out of scope

- Per-letter "live transcription" preview (the counterparty sees the message as it's being typed). Privacy + protocol overhead; not warranted.
- "Multiple users typing" treatment. The chat is 2-party (doctor + patient); this surface doesn't apply.
- Sound effect on typing. Out of scope for clinical UI.
- Changing the broadcast protocol. Existing contract is fine.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (render-block swap; new 5 s safety timeout).
- `frontend/tailwind.config.ts` — **extend** (one keyframe + one animation entry).
- `frontend/components/consultation/Avatar.tsx` — **reuse if present**; **new** if not (tiny). If new, keep it strictly `<div>` + initials; no image upload work.

**No backend, no schema.**

---

## Notes / open decisions

1. **Counterparty name source** — `counterpartyName` should already be in `<TextConsultRoom>` props (e.g. `Dr. Sharma` for patient-side, patient name for doctor-side). If it isn't, the `aria-label` can fall back to `'is typing'` without the name; visual indicator is the same either way.
2. **Animation timing** — 900ms total cycle with 150ms per-dot stagger is the standard. Don't tweak unless QA flags it as too fast / slow.
3. **Why `[animation-delay:150ms]` arbitrary class** — Tailwind v3 supports arbitrary CSS values via brackets. If the project is on Tailwind v2, fall back to inline `style={{ animationDelay: '150ms' }}`.
4. **Avatar identity for canvas / panel layouts** — these layouts are already inside a voice / video room with the counterparty's video tile or audio waveform; the typing avatar dot is a small redundancy but cheaper to ship at parity than to special-case.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch A](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T1 §T1.7](../../../../Product%20plans/text-consult/plan-t1-text-quick-wins.md)
- **Existing broadcast contract:** Plan F04 § Typing indicator (1 s throttle / 3 s idle).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done
