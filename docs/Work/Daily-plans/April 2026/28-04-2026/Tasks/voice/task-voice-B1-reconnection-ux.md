# Task voice-B1: Reconnection UX — countdown banner + "Try now" + "Rejoin call"

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch B (robust call) — **M item, ~6h**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

When Twilio fires `room.on('reconnecting')`, the user sees nothing helpful today — audio just goes silent. T2.15 ships a banner that:

1. Acknowledges the reconnect immediately ("Reconnecting…").
2. Counts down from Twilio's auto-retry window (default ~30s).
3. Offers a `[Try now]` button (forces an early retry).
4. After auto-retry exhaustion, switches to a `[Rejoin call]` button (full re-mint of tokens).

Recording continuity must be verified across reconnect — the doctrine inherited from Plan 07.

**Estimated time:** ~6h.

**Status:** Complete (2026-05-20).

**Depends on:** [task-voice-A8](./task-voice-A8-caller-card-header.md) — soft (status pill flips to "Reconnecting…").

**Source:** [T2 §T2.15](../../../../Product%20plans/voice-consult/plan-t2-voice-real-polish.md); [decision §6](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-b-starts).

---

## Acceptance criteria

### `useTwilioReconnectState(room)` hook

- [x] **New hook** at `frontend/hooks/useTwilioReconnectState.ts` (authored by video B4; voice B1 reuses verbatim):
  - Subscribes to `room.on('reconnecting', ...)` and `room.on('reconnected', ...)` and `room.on('disconnected', ...)`.
  - State machine: `'connected' → 'reconnecting' → ('reconnected' | 'failed')`.
  - On entering `'reconnecting'`: starts a countdown timer (30s default; configurable).
  - Output: `{ status, secondsRemaining, retry: () => void, fullRejoin: () => Promise<void> }`.
  - `retry()` calls Twilio's manual retry path if exposed (or simulates by toggling token).
  - `fullRejoin()` triggers a token re-mint + room re-join — used when auto-retry has expired.

### Token TTL boundary

- [ ] **Cache window = min(HMAC TTL, JWT TTL, Twilio access token TTL)**. Decision §6: verify all three at PR time. Do NOT cache beyond the shortest expiry. *(Deferred — v1 uses `onRejoin` / page reload; no token cache in hook.)*
- [ ] If reconnection takes longer than the cache window, force `fullRejoin()` automatically (don't try to reuse a stale token). *(Deferred with TTL cache.)*

### `<ReconnectionBanner>` component

- [x] **New component** at `frontend/components/consultation/ReconnectionBanner.tsx` (authored by video B4; voice B1 reuses verbatim):
  - Props: `status`, `secondsRemaining`, `onRetry`, `onFullRejoin`.
  - States:
    - `'reconnecting'`: amber banner, "Reconnecting… ({n}s)" with `[Try now]` button (slim, next to text).
    - `'failed'`: red banner, "Couldn't reconnect. [Rejoin call]" — `[Rejoin call]` is the primary action.
    - `'connected'`: hidden (return null).
  - Subtle pulse animation on `'reconnecting'`; static red on `'failed'`.

### Wire into `<VoiceConsultRoom>`

- [x] **Edit** to mount `<ReconnectionBanner>` immediately below `<CallerCardHeader>` (A8) AND pass status into the caller card so its status-pill flips to "Reconnecting…" / "Failed".
- [x] **Don't end the call automatically** on `'failed'` — wait for user action (full rejoin or end call).

### Recording continuity

- [ ] **Verify Twilio recording continues across reconnect** — Twilio handles this; smoke verifies. If recording GAPS appear in the recording playback (Plan 07 surface), file a follow-up.
- [x] **`mode='readonly'`** — banner never mounts.

### Manual smoke

- [ ] Throttle network to "Offline" briefly (5s) → banner appears, countdown starts, audio resumes silently when net returns; banner unmounts within 1s of `reconnected`.
- [ ] Throttle for >30s → banner switches to `'failed'` with `[Rejoin call]`. Click → tokens re-mint, room rejoins; recording continues (no second recording started).
- [ ] Click `[Try now]` mid-reconnect → forces immediate retry attempt.
- [ ] Caller-card status pill matches banner state throughout.

### General

- [x] Type-check + lint clean.
- [x] Hook unit-testable with a mocked Twilio Room (`frontend/hooks/__tests__/useTwilioReconnectState.test.ts`).
- [x] No leak of countdown intervals after unmount.

---

## Out of scope

- **Counterparty's reconnect status.** Out of scope; Twilio doesn't surface this neatly.
- **Audio buffering during reconnect** ("we missed the last 10s, here it is"). Twilio doesn't support; out of scope.
- **End call automatically on failed.** Out of scope; let user decide.

---

## Files expected to touch

**Frontend:**

- `frontend/hooks/useTwilioReconnectState.ts` — **new** (~120 LOC).
- `frontend/components/consultation/ReconnectionBanner.tsx` — **new** (~80 LOC).
- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edit** (~25 LOC mount + status wire).

**Tests:**

- `frontend/hooks/__tests__/useTwilioReconnectState.test.ts` — **new** (~60 LOC; mocked room).

**Backend / migrations:** none.

---

## Notes / open decisions

1. **30s countdown source** — Twilio's default auto-retry window is ~30s; if Twilio adjusts, surface via prop.
2. **Token TTL truth source** — **decision §6 (PR-time):** verify HMAC + JWT + Twilio access-token TTLs and cache to `min(...)`.
3. **`[Try now]` semantics** — even if Twilio doesn't expose a manual retry, we can recreate the room programmatically. Verify which approach Twilio's `twilio-video` SDK supports.
4. **`[Rejoin call]` re-uses HMAC** — patient HMAC token is long-lived (hours); doctor JWT may need refresh; Twilio access token MUST be re-minted. Re-use the existing `requestVoiceToken` flow.
5. **Recording continuity** — Twilio Programmable Video composes a single recording across reconnects automatically. Verify; if not, raise as a Plan 07 concern.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch B](../Plans/plan-voice-consult-selected-features.md#sub-batch-b--robust-call-8-days)
- **Source item:** [T2 §T2.15](../../../../Product%20plans/voice-consult/plan-t2-voice-real-polish.md)
- **Decision:** [§6 — token TTL boundary](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-b-starts)
- **Soft consumer:** [task-voice-A8](./task-voice-A8-caller-card-header.md) status pill.

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** Complete (2026-05-20); first task in Sub-batch B.
