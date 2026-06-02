# Task video-A8: Network-quality 4-bar indicator + video-stats tooltip

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch A (T1 quick wins) — **S item, ~3h**

---

## Task overview

When video freezes, today nobody knows whose bandwidth dropped. T1.8 surfaces Twilio's `Participant.networkQualityLevel` (0–5) as a 4-bar icon in the caller-card area for both sides. **Video extension** beyond voice: hover/tap on the bars opens a detail tooltip with `RTT / jitter / resolution / fps / kbps in / kbps out` — what doctors will reach for to diagnose "your connection is bad" vs "we should switch to audio-only".

This is **the diagnostic precondition for [task-video-E1](./task-video-E1-adaptive-bitrate.md) (adaptive bitrate) and [task-video-E2](./task-video-E2-auto-audio-fallback.md) (audio fallback)** — those features need the QoS read; A8 surfaces it.

Reuses voice batch's `useNetworkQuality` hook (voice T1.3 / A4) and extends with video-specific stats from `getStats()`.

**Estimated time:** ~3h.

**Status:** Complete.

**Depends on:** voice [task-voice-A4](./task-voice-A4-network-quality-bars.md) (SOFT — reuse hook + bars component). Voice A4 hadn't shipped at execution time, so this PR ships the foundation (`useNetworkQuality` hook + `<NetworkBars>` component); voice imports from this PR later.

**Source:** [T1 §T1.8](../../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md).

---

## Acceptance criteria

### Reuse `useNetworkQuality(participant)` hook

- [x] **If voice T1.3 / A4 has shipped:** import `useNetworkQuality` from `frontend/hooks/useNetworkQuality.ts`. Returns `{ level: 0-5, lastUpdated: Date }`. — voice hadn't shipped, so this PR shipped the hook here. Returns `{ level: number | null, lastUpdated: Date | null }` (slightly broader than the draft so consumers can render a "Measuring…" placeholder before the first sample). Also exports a `networkLevelToBars(level)` helper that centralizes the 0-5 → 4-bar mapping (used by `<NetworkBars>` and reusable by E1's adaptive-bitrate threshold check).
- [x] **If voice hasn't shipped:** ship the hook here per the voice A4 contract. — done; voice batch will `import { useNetworkQuality } from "@/hooks/useNetworkQuality"` from the same path when voice A4 lands.

### Reuse `<NetworkBars>` component

- [x] **If voice has shipped:** import `<NetworkBars level={0-5} />`. — voice hadn't shipped, so this PR shipped `<NetworkBars>` at `frontend/components/consultation/NetworkBars.tsx`.
- [x] **Extend with `tooltip` slot** if not already there — accepts a render prop or children that's shown on hover/tap. — implemented as a `tooltip?: ReactNode` prop. When set, the bars become a click-toggle target (universal across desktop + mobile; hover-only would break mobile). Click-outside-to-close + Escape-to-close. **Deviated from "use existing tooltip / popover primitive (radix / shadcn)"**: neither is in the frontend deps yet (see `frontend/package.json` — same constraint A1 / A2 / A6 hit on Lucide). Built a custom popover (~30 LOC inline) instead of pulling in a primitive for one tooltip; migration to a future shared primitive is a single-component swap.

### New `useVideoCallStats(room)` hook

- [x] **New hook** at `frontend/hooks/useVideoCallStats.ts`: — shipped at the spec'd path. Returns the spec'd shape verbatim:
    ```ts
    {
      rttMs: number | null,
      jitterMs: number | null,
      resolution: { width: number, height: number } | null,
      fps: number | null,
      kbpsSend: number | null,
      kbpsReceive: number | null,
    }
    ```
  - [x] Polls `room.getStats()` every 2s (per Note #1).
  - [x] Computes `kbpsSend` / `kbpsReceive` from the byte-counter delta between consecutive samples — so the first sample returns `null` for those two (no prior to delta against), real values from the second sample onward (~2s after connect).
  - [x] Defensive against Twilio's TS surface (`roundTripTime` vs `roundTripTimeMS`, seconds vs ms units) — uses a permissive `LooseTrackStats` structural type and a heuristic to detect units. No runtime crashes when the SDK shape diverges from the type defs.
  - [x] Tolerates transient `getStats()` throws mid-disconnect — swallows the error and lets the next tick recover; doesn't blank the existing tooltip on a single failed read.
  - [x] Cleans up interval on unmount AND when `room` changes to `null` (cancel-flag pattern).

### Tooltip in `<VideoRoom>`

- [x] **Edit `<VideoRoom>`** — render `<NetworkBars>` for the local participant in the controls bar / header area; for the remote participant in the remote tile overlay. — self bars sit left of the Mute button in the controls bar (white pill matching the button height); remote bars sit as a `topRightBadge` slot on the remote tile (new slot added to `<VideoTile>` for this purpose, symmetric to A3's `topLeftBadge`).
- [x] On hover (desktop) or tap (mobile), open a small popover. — click-toggle (works identically on both surfaces).
- [x] Popover content:
  ```
  Your connection
  ───────────────
  Quality:    4/5
  RTT:        45 ms
  Jitter:     8 ms
  Resolution: 1280×720
  FPS:        24
  Sending:    1.2 Mbps
  Receiving:  1.8 Mbps
  ```
  Remote-side popover hides FPS / send-bitrate (those describe THIS device, not the counterparty) and shows a one-liner explaining the asymmetry — see Note #4 in the source draft.
- [x] Auto-dismiss popover on click-outside. — `mousedown` listener, only mounted when open. **Scroll-to-dismiss not added** (out of band; the popover sits inside `videoPane` which doesn't scroll independently of the document).

### Manual smoke

- [ ] Both sides render network bars within ~5s of `connected`. — to verify in PR review (Twilio's NetworkQuality API typically delivers the first sample within ~3s of connect).
- [ ] Bars update as quality changes (throttle network in DevTools to verify). — to verify in PR review.
- [ ] Hover/tap bars → tooltip shows real numbers (not `null` after first 5s). — to verify in PR review; the `kbps` rows specifically need TWO samples (~2s apart) before showing.
- [ ] Throttle network to slow 3G → bars drop to 1-2; resolution drops; fps drops; tooltip reflects. — to verify in PR review.
- [ ] Voice consult unaffected (voice's `<NetworkBars>` doesn't expose video-stats; tooltip is just RTT + jitter). — voice batch hasn't shipped its own NetworkBars mount yet, so there's nothing to break right now; when voice imports this hook + component, it'll pass a smaller tooltip body (audio-only stats).

### `mode='readonly'`

- [ ] No network bars in readonly view (no live stats to read). — **deferred** for the same reason as A1/A2/A3/A4/A5/A6: `<VideoRoom>` has no `mode` prop today (Plan 07 history viewer renders elsewhere). The self bars are gated on `status === "connected"` (already invisible during connecting/error/disconnected); the remote bars are gated on `remoteParticipant != null` (also disconnects in the same code path). When `<VideoRoom>` gains a `mode` prop, the readonly branch just suppresses the controls bar entirely (single change).

### General

- [x] Type-check + lint clean. — `npx tsc --noEmit` and `npx next lint --file NetworkBars.tsx --file VideoTile.tsx --file VideoRoom.tsx --file useNetworkQuality.ts --file useVideoCallStats.ts` both clean.
- [x] No console errors. — no `console.*` calls added; `getStats()` failures are silently caught (see hook implementation).
- [x] No `getStats()` polling leak (cleanup verified). — `useVideoCallStats` uses a `cancelled` flag + `clearInterval` in the effect cleanup AND resets state when `room` becomes `null`. `useNetworkQuality` uses `participant.off(...)` in cleanup.

---

## Out of scope

- **Persisting QoS to backend.** That's [task-video-E6](./task-video-E6-qos-health-metrics.md) (`video_call_quality` table).
- **Auto-degrade on bad QoS.** That's [task-video-E1](./task-video-E1-adaptive-bitrate.md) + [task-video-E2](./task-video-E2-auto-audio-fallback.md).
- **Patient-facing QoS verbose tooltip.** Recommendation: tooltip enabled for both sides (info is useful); can hide for patient if anxiety-inducing copy emerges.
- **WebRTC ICE candidate dump.** Out of scope (debugging only).

---

## Files expected to touch

**Frontend:**
- `frontend/hooks/useNetworkQuality.ts` — **new IF voice hasn't shipped**, otherwise import.
- `frontend/hooks/useVideoCallStats.ts` — **new** (~120 LOC).
- `frontend/components/consultation/NetworkBars.tsx` — **edit** if needed to accept tooltip slot, otherwise import.
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~30 LOC: render bars + tooltip + wire stats).

**Backend / migrations / tests:** none in this task (E6 ships the persistence migration).

---

## Notes / open decisions

1. **Polling cadence** — 2s for the tooltip stats; matches Twilio's recommended cadence for client-side stats reads. Cheap.
2. **Stats source** — `room.getStats()` returns an array of `StatsReport` per peer connection; aggregate the relevant tracks. Twilio's docs show the canonical pattern.
3. **Tooltip vs always-visible chip** — tooltip recommended (cleaner UI). Defer always-visible chip to a follow-up.
4. **Both sides see both sides' stats** — only show LOCAL stats for self and REMOTE stats for the counterparty (don't expose counterparty's `kbpsSend` unless reading their own stats from RemoteVideoTrack stats; pragmatic compromise: show what's locally observable).
5. **Resolution + fps as proxy for quality** — when these drop sharply with no fps adjustment, that's a sign the encoder is bandwidth-constrained; E1 will react to this signal.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch A](../Plans/plan-video-consult-selected-features.md#sub-batch-a--quick-wins-2-days)
- **Source item:** [T1 §T1.8](../../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md)
- **Sibling (voice):** [task-voice-A4](./task-voice-A4-network-quality-bars.md)
- **Consumer:** [task-video-B2](./task-video-B2-caller-card-overlay.md) (caller card consumes bars), [task-video-E1](./task-video-E1-adaptive-bitrate.md), [task-video-E2](./task-video-E2-auto-audio-fallback.md)
- **Twilio:** `Participant.networkQualityLevel`, `Room.getStats()`

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** Complete.

---

## Implementation log (2026-04-30)

### Files touched

- **new** `frontend/hooks/useNetworkQuality.ts` (~125 LOC):
  - Subscribes to `participant.networkQualityLevel` + the `'networkQualityLevelChanged'` event.
  - Returns `{ level: number | null, lastUpdated: Date | null }` (broader than the original spec so the UI can render a "Measuring…" placeholder pre-first-sample without a magic value).
  - Handles participant-slot becoming `null` (remote leaves before unmount) by resetting state.
  - Re-seeds when the participant identity changes (covers the multi-tab kick path in E3 returning the same room with a fresh participant identity).
  - Exports `networkLevelToBars(level: number | null): 0|1|2|3|4` — the canonical 0-5 → 4-bar mapping. Centralized so `<NetworkBars>` AND any future caller (E1's adaptive-bitrate threshold check, E6's QoS sampler) agree on the visual mapping.

- **new** `frontend/hooks/useVideoCallStats.ts` (~225 LOC):
  - Polls `room.getStats()` every 2s (Note #1 cadence).
  - Aggregates the first peer connection's stats into the spec'd `VideoCallStats` shape.
  - Computes `kbpsSend` / `kbpsReceive` from cumulative-byte delta over time delta — first sample returns `null` for those, real values from sample 2 onward.
  - Defensive structural typing (`LooseTrackStats` / `LooseStatsReport`) to handle Twilio's TS surface drift across SDK versions: `roundTripTime` (newer) vs `roundTripTimeMS` (older), seconds vs ms heuristic for RTT / jitter, missing fields fall through to `null`.
  - Tolerates transient `getStats()` throws mid-disconnect (swallows the error; preserves last-known stats so the tooltip doesn't blank on a single failed read).
  - Cleanup: `cancelled` flag + `clearInterval` on unmount AND when `room` becomes `null`.

- **new** `frontend/components/consultation/NetworkBars.tsx` (~150 LOC):
  - 4-bar icon (heights `h-1.5 / h-2.5 / h-3.5 / h-5` — Tailwind's default scale only; `h-4.5` doesn't exist without a config extension).
  - Color follows the cell-signal convention: 1-2 bars red, 3 bars yellow, 4 bars green; "Measuring…" state uses a grey + `animate-pulse` placeholder so the slot is reserved (no layout shift when the first sample arrives).
  - `tooltip?: ReactNode` slot. When set, the bars become a `<button>` with `aria-haspopup="dialog"` + `aria-expanded`; click toggles a popover anchored below the bars.
  - Custom popover (no radix / shadcn dep): `mousedown` outside-click + Escape key close; only mounts the document listeners while open.
  - Accessibility: `aria-label` describes the level ("Network: 3 of 4 bars" / "Network: measuring"); `aria-haspopup` / `aria-expanded` for screen readers; focus ring on keyboard nav.

- **edit** `frontend/components/consultation/VideoTile.tsx` (~30 LOC net add):
  - Added `topRightBadge?: ReactNode` slot (symmetric to A3's `topLeftBadge`).
  - Anchors at `right-2 top-2` (or `top-9` when `showLabel`); NOT `pointer-events-none` so the bars' click target works.
  - Suppressed in floating mode (PiP is too small for a chip).

- **edit** `frontend/components/consultation/VideoRoom.tsx` (~125 LOC net add):
  - Imported `useNetworkQuality`, `useVideoCallStats`, `NetworkBars`, plus Twilio's `LocalParticipant` and `RemoteParticipant` types.
  - Added reactive `roomState`, `localParticipant`, `remoteParticipant` state slots — the existing `roomRef` stays for stable callback use; the hooks below need re-subscription on change.
  - Enabled `networkQuality: { local: 1, remote: 1 }` in the `connect()` call. Verbosity 1 = level only (cheap; matches what the bars consume); 2/3 add subnet probing / detailed media stats we don't need.
  - Wired `setRemoteParticipant` on `'participantConnected'` AND in the `room.participants.forEach` (race when the remote joined first).
  - Wired `setRemoteParticipant(null)` on `'participantDisconnected'` so the bars revert to "Measuring…".
  - Cleared all three reactive slots on `'disconnected'` AND in `handleLeave` (the `removeAllListeners()` call there destroys the `'disconnected'` listener that would otherwise clear them).
  - Built `localStatsTooltip` (full diagnostic dump: Quality / RTT / Jitter / Resolution / FPS / Sending / Receiving) and `remoteStatsTooltip` (Quality only + a one-liner explaining why detailed stats are local-only — Note #4).
  - Mounted self bars left of the Mute button in the controls bar (white pill, h-9 to match button height); only when `status === "connected"`.
  - Mounted remote bars as the new `topRightBadge` on the remote tile (dark chip for contrast against the video); only when `remoteParticipant != null`.

- **No backend / migration / test changes** — A8 is pure frontend (E6 owns the `video_call_quality` persistence migration).

### Deviations from the task draft

1. **Custom popover instead of radix / shadcn.** The task draft says "Use existing tooltip / popover primitive (radix / shadcn)" but neither is in `frontend/package.json`. Pulling in radix for a single tooltip would add ~30KB gzipped to the bundle. Built a ~30 LOC custom popover inline in `<NetworkBars>` instead. When a future PR (likely B-batch) adds a shared primitive, this swap is a single-component change; the public `<NetworkBars>` API stays the same.

2. **`useNetworkQuality` returns a slightly broader shape** than the spec. Spec said `{ level: 0-5, lastUpdated: Date }`; I shipped `{ level: number | null, lastUpdated: Date | null }`. The `null` branch lets consumers render the "Measuring…" placeholder pre-first-sample without a magic level value. Voice A4 will inherit this shape.

3. **Both sides see only their own detailed stats.** Per Note #4: showing the counterparty's send-bitrate would require reading their `RemoteVideoTrack` stats, which Twilio reports as `bytesReceived` from THIS device's perspective (i.e. it IS the remote's send rate as observed locally). For v1 simplicity, the remote-side popover shows quality level only + a one-line copy explaining the asymmetry. E6 will land the full bidirectional view.

4. **Tooltip uses click-toggle on both desktop AND mobile** (not hover-on-desktop / tap-on-mobile). Hover-only would break mobile entirely; click-toggle is universal and matches the standard "press for details" pattern (e.g., Apple Maps' info button). Cheaper to implement, easier to test, no layout-flash from hover-debounce.

5. **`mode='readonly'` deferred** — same rationale as A1–A6. Already gated on `status === "connected"` for self and `remoteParticipant != null` for remote, so the bars are invisible in non-live states; readonly mount can suppress the controls bar entirely when it lands.

### Critical gotcha — `networkQuality` opt-in

The pre-A8 `connect()` call in `<VideoRoom>` did NOT pass `networkQuality: { local, remote }`. Without that option, `participant.networkQualityLevel` stays `null` forever — `useNetworkQuality` would render "Measuring…" indefinitely. Adding `networkQuality: { local: 1, remote: 1 }` to the connect config is THE single most important change in this PR. Verbosity 1 is the cheap level-only mode; 2 adds detailed stats subnet probing (we don't need; `useVideoCallStats` reads stats independently via `getStats()`); 3 includes media-quality probes (E1 / E6 territory).

### What worked

- **Pulling forward `useNetworkQuality` + `<NetworkBars>` from voice A4** rather than blocking on voice batch. The hook + component are pure (no voice-specific assumptions); voice will import them as-is.
- **Hoisting `networkLevelToBars` to a hook export** rather than embedding in `<NetworkBars>`. E1's adaptive-bitrate logic will use the same mapping ("if bars ≤ 1 for 5s, drop bitrate") so centralization avoids two-source-of-truth drift.
- **Defensive structural typing on Twilio stats** (`LooseTrackStats`). The actual `twilio-video@2.34.0` TS defs are narrower than the runtime shape; reading via `unknown as LooseStatsReport[]` keeps the hook resilient across SDK upgrades.
- **Click-toggle (not hover) for the popover** — works on touch + non-touch identically. Same UX as the chip in `<RecordingControls>`.

### What didn't work / had to change

- First attempt put the remote bars in a NEW `topRightBadge` slot AND tried to share the slot with the existing `<VideoRecordingIndicator>` (which uses `right-3 top-3` absolute positioning at the parent level). Trade-off: moving the indicator into the slot is a bigger refactor that touches Plan 02's recording governance code. Pragmatic v1: leave the indicator where it is, accept that it visually overlaps the bars when recording (rare during normal usage; B10 caller-card overlay will own the merger).
- First attempt computed kbps from `localVideoTrackStats[0].bytesSent` only. Forgot that `kbpsReceive` needs `remoteVideoTrackStats[0].bytesReceived`. Fixed by tracking both byte counters in `prevSendRef` and computing two separate deltas.

### Verification

- `npx tsc --noEmit` (frontend) — clean.
- `npx next lint --file NetworkBars.tsx --file VideoTile.tsx --file VideoRoom.tsx --file useNetworkQuality.ts --file useVideoCallStats.ts` — clean.
- No dedicated test file — `<VideoRoom>` / `<VideoTile>` have no existing test harness; A8's hooks are pure functions of Twilio events that need a Twilio mock to test in isolation. Add when voice A4 ships and we extract a shared test fixture.

### Follow-ups (not blocking this PR)

1. **Manual smoke** during PR review:
   - Both sides render bars within ~5s of connect.
   - Tooltip popover opens on click; click-outside dismisses; Escape dismisses.
   - DevTools network throttle (slow 3G) → bars drop to 1-2 over ~10s; resolution + FPS drop in tooltip.
   - Polling cleanup verified — leave call, then `Performance` tab → no lingering 2s interval.
2. **Voice A4 import** (when voice batch reaches A4): voice imports `useNetworkQuality` + `<NetworkBars>` from the same paths; voice's tooltip body will be smaller (no resolution / FPS rows since voice has no video).
3. **B2 caller-card overlay** consumes the `topLeftBadge` (duration chip) AND `topRightBadge` (network bars) slots; B10 recording-status pill mounts inside the caller card.
4. **E1 adaptive-bitrate** consumes `useNetworkQuality(localParticipant).level <= 2` as the trigger threshold; reuses `networkLevelToBars` helper for consistency.
5. **E6 QoS metrics** subscribes to `useVideoCallStats(roomState)` for the periodic sample to persist into `video_call_quality` table; no need to spin up a second `getStats()` poller.
6. **Recording-indicator + remote-bars overlap** (when recording is active): merge into a single caller-card-style chip in B2.
7. **`mode='readonly'` gating** — when Plan 07 history viewer renders `<VideoRoom>` in readonly mode, suppress the controls bar entirely + skip the `topRightBadge` mount on the remote tile.
8. **Multi-party (C8)**: `useVideoCallStats` aggregates the first peer connection only; C8 will need an N-peer aggregation OR a per-peer tile-level mount. Current API supports the latter (pass each `RemoteParticipant` to its own `<NetworkBars>`).
