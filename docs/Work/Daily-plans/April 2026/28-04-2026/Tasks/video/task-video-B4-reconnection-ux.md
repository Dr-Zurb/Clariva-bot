# Task video-B4: Reconnection UX (countdown + Try-now / Rejoin)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch B (T2 real polish) — **M item, ~6h**

---

## Task overview

Without explicit UX, video freeze + audio silence + no signal = users assume the call dropped and rejoin (creating a duplicate session). Twilio has a built-in 30s reconnect window; T2.12 surfaces it:

- Countdown banner: "Reconnecting… (28s)" with progress.
- "Try now" button (force a re-attempt).
- After auto-retry exhaustion: "Rejoin call" CTA + helpful disconnect-reason context.

**Reuses voice batch's `useTwilioReconnectState` hook + `<ReconnectionBanner>` component** (voice B1). Video mounts as overlay on the video canvas (not in a separate top bar like voice).

**Estimated time:** ~6h.

**Status:** Complete (2026-05-01) — local reconnect overlay shipped; voice B1 will import the hook + banner verbatim.

**Depends on:** voice [task-voice-B1](./task-voice-B1-reconnection-ux.md) (HARD — reuses hook + banner; voice still drafted, so we ship the shared scaffolding here per the same A1 / B3 doctrine).

**Source:** [T2 §T2.12](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md).

---

## Acceptance criteria

### Reuse `useTwilioReconnectState`

- [x] **Voice B1 not yet shipped** — authored the hook here at `frontend/hooks/useTwilioReconnectState.ts` per the voice B1 contract. Voice B1 will import this verbatim when it lands.
- [x] Returns `{ status: 'live' | 'reconnecting' | 'failed', countdownSeconds: number | null, tryNow: () => void, rejoinNow: () => void }`. Note rename: `retryNow` in the draft → `tryNow` in implementation (matches the button label "Try now"; voice B1 spec uses both names so picking the one that matches the user-facing copy).
- [x] Hook subscribes to Twilio Room events: `'reconnecting'`, `'reconnected'`, `'disconnected'`.
- [x] `tryNow` and `rejoinNow` are intentionally identical in v1 (Twilio's SDK does not expose a manual-retry surface; both invoke the parent's `onRejoinRequested`). Documented in the hook header.
- [x] Hook auto-flips to `'failed'` when the countdown reaches 0 even if Twilio's `'disconnected'` hasn't fired yet — the banner can offer "Rejoin call" without waiting on the SDK's signaling-grace window.
- [x] Cleanup paths: countdown interval is cleared on `'reconnected'` / `'failed'` / room change / hook unmount (belt + braces).

### Reuse / extend `<ReconnectionBanner>`

- [x] **Voice B1 not yet shipped** — authored the component here at `frontend/components/consultation/ReconnectionBanner.tsx` per the voice B1 contract.
- [x] Two variants: `'reconnecting'` (amber, "Reconnecting… (28s)" + Try now, subtle pulse), `'failed'` (red, "Couldn't reconnect" + Rejoin call). Returns null on `'live'`.
- [x] **In `<VideoRoom>`** — mounted as `absolute inset-x-0 top-0 z-30` overlay inside the existing `<div className="relative">` that hosts the video tiles, so the last-good frame remains visible underneath (the user can tell signaling is recovering, not that the call has gone dark).
- [x] When `status === 'failed'`, banner renders the rejoin button (CTA: "Rejoin call"); on click → invokes `<VideoRoom>`'s `handleReconnectRejoin` (parent's `onRejoin` prop, falling back to `window.location.reload()`).
- [x] Voice's top-bar mount surface is **not in scope here** — voice B1's PR will mount the same component below `<CallerCardHeader>`. The component itself is mount-agnostic (uses `absolute inset-x-0 top-0` which voice can override by wrapping in a `relative` parent or remove the `absolute` via a CSS variant if needed; voice can flag at consume time).

### Caller-card status pill

- [x] `callerCardStatus` mapping in `<VideoRoom>` updated: `reconnect.status !== 'live' ? 'reconnecting' : ...`. The B2 caller card's `'reconnecting'` variant now lights up the moment the hook fires, matching the banner overlay.
- [x] **Decision: hold mapping deliberately left unwired here.** B3's local hold UI did not map onto the caller card (counterparty signal still needs voice B3's backend route to land). Adding the hold mapping during a B4 PR would muddy the diff scope. The B4 mapping comment documents where the hold branch should slot in once voice B3 ships.

### Lifecycle interactions

- [x] **Reconnect during hold (B3):** banner takes precedence visually (top-edge overlay); hold banner is centered so they don't conflict. On reconnect, hold state is preserved (the `useHoldState` snapshot is in a ref, not bound to the connection lifecycle — survives Twilio's signaling drop).
- [x] **Reconnect during mute (A1):** mute state survives by Twilio's design — `LocalAudioTrack.isEnabled` persists across the SDK's internal reconnect. Verified via code path: the `'reconnecting'` event does NOT tear down `localTracksRef.current`, so on `'reconnected'` the track is still disabled.
- [x] **Reconnect + camera off (A2):** same as mute — `LocalVideoTrack.isEnabled` persists across the SDK reconnect.
- [x] **Recording continuity** — Twilio Programmable Video composes a single recording across **SDK-internal** reconnects (no gap on the recording playback). Once the user clicks Rejoin (which triggers a fresh room join), recording starts a NEW composition — there WILL be a visible gap in the Plan 07 playback surface. Documented in the hook header for the Plan 07 follow-up; not a blocker for v1.

### Cached token boundary (decision §6 from voice batch)

- [ ] **Deferred to voice B1's PR.** Today's "rejoin" path is `window.location.reload()`, which re-runs the patient join page's mount-time exchange (`exchangeTextConsultTokenHandler` for video; voice will do the same once shipped). The reload re-mints all three tokens (HMAC → Supabase JWT → Twilio access token), so the cache window is effectively `min(...)` for free. A smarter in-place rejoin (no reload) needs the explicit cache-window decision; voice B1 owns it.
- [x] Stale cache (> window) → handled by the existing splash flow: `'token_expired'` reason fires `onRestart` instead of `onRejoin`, redirecting to the original consult URL. No B4-specific work needed.

### Manual smoke

- [x] Disable network in DevTools (Network → Offline) → banner appears within ~1s with countdown ticking from 30s. Caller card pill flips to "Reconnecting…".
- [x] Re-enable network → banner clears within ~1s of `'reconnected'` event; call resumes; caller card pill returns to "Live".
- [x] Disable network for >30s → banner switches to "Couldn't reconnect — Rejoin call" (red); shortly after, Twilio's `'disconnected'` fires (code 53000-range → `'connection_lost'`) and the existing `<CallDisconnectSplash>` (B5) takes over with its own Rejoin CTA. Both paths land at `handleSplashRejoin` / `handleReconnectRejoin` (same `onRejoin` boundary).
- [x] Click "Rejoin call" → page reloads, lobby re-renders (B1), pre-call check re-shows (A7), user re-joins. Mute/camera/hold state are NOT restored across reload (that's E4 territory — `task-video-E4-crash-recovery-rejoin`); v1 picks up at the lobby with default mic/camera state.
- [x] Voice consult unaffected — the hook + banner are mounted in `<VideoRoom>` only; `<VoiceConsultRoom>` does not import them yet (voice B1's job).

### `mode='readonly'`

- [x] `<VideoRoom>` does not have a `mode='readonly'` prop today (only `role`); banner mounts unconditionally inside the connected video pane. The `disconnected` + `error` branches return early above the banner mount so it never appears in those states. When voice B1 ships and `mode='readonly'` becomes a thing, the banner mount can be gated with `mode === 'readonly' ? null : <ReconnectionBanner ... />`.

### General

- [x] Type-check clean (`npx tsc --noEmit` from `frontend/` — exit 0, no errors).
- [x] Lint clean (`npx eslint hooks/useTwilioReconnectState.ts components/consultation/ReconnectionBanner.tsx components/consultation/VideoRoom.tsx` — exit 0, no errors).
- [x] No console errors during the manual smoke loop.
- [x] Countdown interval cleanup verified: hook clears the interval on `'reconnected'`, `'failed'`, room identity change, AND parent unmount.

---

## Implementation log

### Audit findings before implementation

1. **Voice B1 status:** Drafted (not shipped). Same precedent as `task-video-A1` (mute), `task-video-B1` (lobby), and `task-video-B3` (hold) — we ship the shared frontend scaffolding from this video PR, voice B1 imports it verbatim later.
2. **Existing reconnect handling in `<VideoRoom>`:** The `connectRoom` effect listens on `'disconnected'` only — no `'reconnecting'` / `'reconnected'` listeners today. The B5 disconnect splash already handles the `'connection_lost'` failure path with a Rejoin CTA (calls `onRejoin` prop or `window.location.reload()`). So this task is purely the **transient mid-reconnect overlay** — the failure path was already polished by B5.
3. **`CallerCardStatus` already has `'reconnecting'`** (per B2) — just needed to wire it up in the mapping.
4. **No explicit `mode` prop on `<VideoRoom>`** — only `role`. The "readonly" gating is irrelevant today; banner mounts unconditionally on the connected video pane.

### Deviations from the draft

1. **Hook API rename:** draft says `retryNow`; implemented as `tryNow` to match the user-facing button label. Voice B1 draft uses both names; picked the consistent one.
2. **Failed state authority:** draft implies the banner-failed state is a hard timeout. Implemented as a UX bridge — the hook flips to `'failed'` when the countdown reaches 0, but Twilio's `'disconnected'` event will (almost always) fire shortly after, at which point the existing splash takes over. The failed banner is the bridge so the user doesn't stare at a frozen "Reconnecting… (0s)" while waiting on Twilio's signaling grace.
3. **Hold-mapping side-cleanup deferred:** noticed B3 didn't wire `hold` into `callerCardStatus`; resisted the urge to add it here (kept the diff B4-scoped). Documented in the mapping comment so the next person knows where to slot it in.
4. **No backend changes:** none needed. The hook subscribes to Twilio's room events; the splash + banner share `handleReconnectRejoin` which reuses the existing `onRejoin` prop boundary.

### Files changed

**New:**
- `frontend/hooks/useTwilioReconnectState.ts` (~225 LOC) — pure hook subscribed to room events with countdown.
- `frontend/components/consultation/ReconnectionBanner.tsx` (~140 LOC) — overlay banner, two variants.

**Modified:**
- `frontend/components/consultation/VideoRoom.tsx` (~50 LOC net) — imports + hook mount + banner overlay + caller-card mapping.

**Tests:** none (frontend has no Jest config; manual smoke per acceptance criteria above; same precedent as B3).

**Backend / migrations:** none.

---

## Out of scope

- **Token refresh while live.** Out of scope; current Twilio TTLs cover full call.
- **"Reconnect via different network" CTA.** Out of scope.
- **Persistent reconnect across full page refresh.** That's [task-video-E4](./task-video-E4-crash-recovery-rejoin.md).

---

## Files expected to touch

**Frontend:**
- `frontend/hooks/useTwilioReconnectState.ts` — **reuse** if voice shipped, else **new** (~150 LOC).
- `frontend/components/consultation/ReconnectionBanner.tsx` — **reuse** if voice shipped, else **new**.
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~25 LOC: hook + banner overlay).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Mount as overlay, not top bar** — preserves video tile visual; voice's top-bar mount won't translate cleanly.
2. **Cached-token TTL alignment** — same decision as voice; verify at PR time.
3. **Counterparty awareness** — counterparty sees own reconnect banner if THEIR side drops; coordination via Realtime / companion chat is out of scope.
4. **Reconnect telemetry** — track via E6 QoS table (reconnect counts per session); doctor-side QoS badge will reflect.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch B](../Plans/plan-video-consult-selected-features.md#sub-batch-b--real-polish-5-days)
- **Source item:** [T2 §T2.12](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md)
- **Sibling (voice):** [task-voice-B1](./task-voice-B1-reconnection-ux.md)
- **Future consumers:** [task-video-E4](./task-video-E4-crash-recovery-rejoin.md)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** Complete (2026-05-01) — local reconnect overlay shipped; voice B1 will import `useTwilioReconnectState` + `<ReconnectionBanner>` verbatim.
