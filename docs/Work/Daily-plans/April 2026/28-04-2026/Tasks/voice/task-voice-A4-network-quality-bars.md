# Task voice-A4: Network-quality 4-bar indicator

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch A (T1 quick wins) — **S item, ~2h**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

A 4-bar visual signal (think wifi-bars metaphor) showing the user's connection quality on the call. Driven by Twilio's `Room.localParticipant.networkQualityLevel` (0–5 scale) plus periodic `getStats()` for RTT / jitter when the user hovers / taps for detail. Meaningful warning before audio actually degrades.

**Estimated time:** ~2h.

**Status:** Done.

**Depends on:** nothing.

**Source:** [T1 §T1.3](../../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md).

---

## Acceptance criteria

### `useNetworkQuality(room)` hook

- [x] **New hook** at `frontend/hooks/useNetworkQuality.ts`:
  - Input: `room: Twilio.Room | null`.
  - Output: `{ level: 0 | 1 | 2 | 3 | 4 | 5, rtt?: number, jitter?: number, packetLoss?: number }`.
  - Subscribes to `room.localParticipant.on('networkQualityLevelChanged', ...)`.
  - Twilio's 0–5 scale collapses cleanly to 4 bars: 0 = none/red, 1 = 1 bar, 2 = 2 bars, 3–4 = 3 bars, 5 = 4 bars (4-bar UI; 5 levels of source).
  - On detail-toggle, calls `room.getStats()` once per 2s; surfaces RTT / jitter / packet-loss.
- [x] **Cleanup** — unsubscribe on unmount; clear stats interval.

### `<NetworkBars>` component

- [x] **New component** at `frontend/components/consultation/NetworkBars.tsx`:
  - Props: `level: 0–5`, `onClick?: () => void` (toggles a detail tooltip).
  - Visual: 4 vertical bars, ascending heights. Lit-up bars based on `level` (0=none lit; 5=all 4 lit).
  - Color: green at 4–5; yellow at 2–3; red at 0–1.
  - Click/tap → expand a small tooltip showing `RTT 45ms · Jitter 8ms · Loss 0.1%`.

### Mount in `<VoiceConsultRoom>` header

- [x] **Edit** to render `<NetworkBars level={...} onClick={...} />` in the call header next to the duration timer (A1) and mic meter (A3).
- [x] **Three-host parity**.
- [x] **Doctor + patient both** — symmetric.
- [x] **`mode='readonly'`** — DO NOT mount.

### Manual smoke

- [x] On stable wifi: 4 bars green, RTT < 50ms.
- [x] Throttle network in DevTools (Slow 3G): bars drop to 1–2, color changes; tooltip shows higher RTT / packet loss.
- [x] Disconnect briefly: bars go to 0; reconnect → bars recover within ~5s.
- [x] Tooltip dismisses on outside click / second click.

### General

- [x] Type-check + lint clean.
- [x] No memory leak across remount cycles.
- [x] No console warnings about missing Twilio events.

---

## Out of scope

- **Counterparty's network bars.** Not in v1; only the user's own. (Twilio fires `remoteParticipant.networkQualityLevelChanged` too — could surface in a future task; flag.)
- **Persistent QoS history.** Sub-batch C's [task-voice-C2](./task-voice-C2-qos-health-metrics.md) ships the actual QoS table + ingest; A4 is just the UI surface.
- **Audible warnings on poor quality.** Out of scope; visual is enough.

---

## Files expected to touch

**Frontend:**

- `frontend/hooks/useNetworkQuality.ts` — **new** (~70 LOC).
- `frontend/components/consultation/NetworkBars.tsx` — **new** (~70 LOC).
- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edit** (~10 LOC mount).

**Backend / migrations / tests:** none in this task; smoke verifies.

---

## Notes / open decisions

1. **Mapping 5-level Twilio → 4-bar UI** — the metaphor is "signal bars"; 4 is the cultural standard. Mapping above is reasonable; revisit if doctors find it unintuitive.
2. **`getStats()` cost** — it's a Promise per call; running every 2s is fine. Don't run continuously when the tooltip is closed.
3. **Twilio docs** — `networkQualityLevelChanged` is well-documented; the Krisp / RNNoise plugin choice in C9 doesn't affect this signal source.
4. **A4 is read-only signal**; C2 ships the persisted ingest with proper sampling cadence (10s for first minute, then 30s — decision §13). Don't conflate.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch A](../Plans/plan-voice-consult-selected-features.md#sub-batch-a--polished-call-5-days)
- **Source item:** [T1 §T1.3](../../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md)
- **Future consumer:** [task-voice-A8](./task-voice-A8-caller-card-header.md) (caller-card header may absorb the bars into its layout).
- **Sibling concern:** [task-voice-C2](./task-voice-C2-qos-health-metrics.md) (persisted QoS ingest — doesn't depend on this UI).

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** Done.
