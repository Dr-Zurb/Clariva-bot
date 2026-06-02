# Task voice-A1: Call duration timer in header (`mm:ss`)



## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch A (T1 quick wins) — **XS item, ~30 min**



---



## Model & execution guidance



**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).



---



## Task overview



The call header shows the practice name + minimal pill today; doctors and patients have no objective signal of how long they've been on the call. T1.1 ships an `mm:ss` (or `h:mm:ss` after 60 min) timer that ticks once per second from the moment the call enters `connected` state.



The timer **also feeds task-voice-A8 (caller-card header)** as one of its rendered elements, so this task ships the hook + standalone display; A8 reuses the hook in the new card.



**Estimated time:** ~30 min.



**Status:** Shipped (2026-05-19).



**Depends on:** nothing (frontend-only, in-place upgrade of the header).



**Source:** [T1 §T1.1](../../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md).



---



## Acceptance criteria



### `useCallDuration(connectedAt)` hook



- [x] **New hook** at `frontend/hooks/useCallDuration.ts`:

  - Input: `connectedAt: Date | null` (the moment Twilio fired `participant-connected` or `room-connected`, whichever is the source-of-truth in `<VoiceConsultRoom>`).

  - Output: `formatted: string` (e.g. `'00:42'`, `'12:03'`, `'1:05:30'`), `seconds: number`.

  - Internally uses a `setInterval(1000)` started on `connectedAt` non-null; cleared on unmount or `connectedAt` reset to `null`.

  - Format: under 1 hour = `mm:ss`; 1 hour or more = `h:mm:ss` (no padding on hours).

- [x] **Pause behavior on call lifecycle:**

  - `connectedAt = null` → display nothing (don't show `00:00`).

  - Call enters reconnecting state (Sub-batch B's T2.15) → timer KEEPS counting (recording continuity is the doctrine; timer reflects real-time).

  - Call enters hold state (Sub-batch B's T2.11) → timer KEEPS counting (hold is part of the call duration).

- [x] **No drift correction needed for v1** — `setInterval(1000)` is fine for a ~hour-long call. If drift becomes visible, swap to `Date.now() - connectedAt` recomputation; not in scope.



### Render in `<VoiceConsultRoom>` header



- [x] **Edit `frontend/components/consultation/VoiceConsultRoom.tsx`** — header section currently renders the practice name pill. Add the timer chip immediately after the pill, e.g. `[Dr. Sharma's Practice] · 12:03`.

- [x] **Three-host parity** — works in `standalone` (mobile patient), `panel` (doctor split-with-chat), `canvas` (canvas fallback). Same chip, same styling.

- [x] **`mode='readonly'`** — when room is mounted readonly (Plan 07 history viewer), do NOT mount the live timer. Replace with a static "Duration: mm:ss" derived from session start/end times if available.



### Manual smoke



- [ ] Doctor + patient on different devices: timer starts within ~1s of both being connected; both sides show ~the same value (within ±2s).

- [ ] Refresh patient page mid-call → timer resumes from `connectedAt` (re-derived from Twilio state); doesn't reset to `00:00`.

- [ ] At 59:59 → 1:00:00 transition (use `connectedAt = now() - 59m59s` to fast-forward locally for verification).



### General



- [x] Type-check + lint clean.

- [ ] No console errors / no setInterval leak (verify in React DevTools — hook unmounts cleanly when `<VoiceConsultRoom>` unmounts).



---



## Out of scope



- **Persisting `connectedAt` to the backend** for cross-tab sync. Not needed; Twilio re-derives on reconnect.

- **Audible duration callouts** ("you've been on for 30 minutes"). Out of scope; doctors find this annoying.

- **Auto-end at slot expiry.** That's T2.12 (deferred from this batch entirely).

- **Visual emphasis after long calls** (red text after 60 min). Out of scope; clinical pace varies.



---



## Files expected to touch



**Frontend:**



- `frontend/hooks/useCallDuration.ts` — **new** (~40 LOC).

- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edit** (~10 LOC: import hook + render chip).



**Backend / migrations / tests:** none.



---



## Implementation notes (2026-05-19)



- `useCallDuration` was already shipped as a pull-forward from video task-A3; voice A1 wired it into `<VoiceConsultRoom>`.

- `connectedAt` is seeded once on Twilio `room.connected` via `setConnectedAt((prev) => prev ?? new Date())` — same doctrine as `<VideoRoom>`.

- Exported `formatCallDurationSeconds()` from the hook for readonly static labels.

- Patient standalone route passes `practiceName` from the voice-token exchange.

- Readonly path: `mode='readonly'` + optional `sessionStartedAt` / `sessionEndedAt` → static `Duration: mm:ss` (no live hook tick).



---



## Notes / open decisions



1. **Why a hook, not a component** — A8 (caller-card header) consumes the same data; a hook is the right unit.

2. **`connectedAt` source** — read from the existing Twilio room state in `<VoiceConsultRoom>`. If the room doesn't currently expose `connectedAt`, derive from the `participantConnected` callback timestamp and stash in a `useState`.

3. **Format threshold** — `mm:ss` until 60 min, then `h:mm:ss`. No leading-zero on hours (1:05:30 not 01:05:30).

4. **Doctor + patient drift** — both compute locally from their own `connectedAt`; small drift is acceptable. Don't sync via Realtime.



---



## References



- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch A](../Plans/plan-voice-consult-selected-features.md#sub-batch-a--polished-call-5-days)

- **Source item:** [T1 §T1.1](../../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md)

- **Consumer:** [task-voice-A8](./task-voice-A8-caller-card-header.md) reuses the hook.



---



**Owner:** TBD

**Created:** 2026-04-29

**Status:** Shipped (2026-05-19); manual smoke items remain for QA.


