# Task voice-A9: Disconnect-reason splash (post-call)

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch A (T1 quick wins) — **S item, ~3h**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

When a call ends, instead of dumping the user back to the dashboard with no context, show a small splash explaining **why** the call ended. Six recognized reasons:

| `reason` | Patient copy | Doctor copy |
|---|---|---|
| `local` | "You ended the call." | "You ended the call." |
| `remote` | "Dr. Sharma ended the call." | "Patient ended the call." |
| `connection_lost` | "Call disconnected — connection lost." | (same) |
| `timeout` | "Call ended — slot time expired." | (same) |
| `token_expired` | "Session token expired — please rejoin." | (same) |
| `unknown` | "Call ended." | (same) |

Splash shows for ~5s then auto-fades, or click `[Dismiss]` to close immediately. Reused by **task-voice-B5 (T4.25 post-call summary screen)** which renders below this splash.

**Estimated time:** ~3h.

**Status:** Done (2026-05-20).

**Depends on:** nothing.

**Source:** [T2 §T2.16](../../../../Product%20plans/voice-consult/plan-t2-voice-real-polish.md).

---

## Acceptance criteria

### Disconnect-reason classifier

- [x] **`frontend/lib/voice/classify-disconnect.ts`** — re-exports `@/lib/call/classify-disconnect` (shipped by video B5). Pure function:
  ```ts
  type DisconnectReason = 'local' | 'remote' | 'connection_lost' | 'timeout' | 'token_expired' | 'unknown';
  export function classifyDisconnect(input: {
    twilioDisconnectReason?: string;       // from room.on('disconnected', (room, reason) => ...)
    ourLocalEndCalled: boolean;            // true if user clicked end-call locally
    sessionStatus?: 'ended' | 'cancelled'; // server-side state at disconnect time
    tokenExpiredAt?: Date;                 // if last-known token TTL was < now
  }): DisconnectReason;
  ```
  - Branch logic:
    - `ourLocalEndCalled === true` → `'local'`.
    - `twilioDisconnectReason === 'completed'` AND `!ourLocalEndCalled` → `'remote'`.
    - `twilioDisconnectReason === 'connection-lost' | 'transport-failed'` → `'connection_lost'`.
    - `sessionStatus === 'ended'` AND scheduled-end was reached → `'timeout'`.
    - `tokenExpiredAt && tokenExpiredAt < now` → `'token_expired'`.
    - Otherwise → `'unknown'`.
- [x] Unit-test the classifier with all 6 branches + a few combinations (`frontend/lib/call/__tests__/classify-disconnect.test.ts`).

### `<VoicePostCallSplash>` component

- [x] **New component** at `frontend/components/consultation/VoicePostCallSplash.tsx`:
  - Props: `reason: DisconnectReason`, `role: 'doctor' | 'patient'`, `onDismiss: () => void`.
  - Renders the copy table above + an icon (info/warning/error glyph based on severity).
  - Auto-dismiss timer: 5s; cancellable on user interaction (mouse-move / tap inside the splash area).
  - `[Dismiss]` button + `[Rejoin]` button (only for `connection_lost` and `token_expired`).
  - **Rejoin** triggers a re-mint: navigate back to `/c/voice/[sessionId]?t=<hmac>` (or equivalent). For doctor, navigate back to dashboard launch.

### Wire into the disconnect handler

- [x] **Edit `<VoiceConsultRoom>`**:
  - Capture `twilioDisconnectReason` on `room.on('disconnected', ...)`.
  - Track `ourLocalEndCalled` flag (set true in the end-call confirmation handler from A2).
  - Compute `reason = classifyDisconnect(...)`.
  - Render `<VoicePostCallSplash reason={reason} role={role} onDismiss={...} />` in the post-call state.
- [x] **State machine**: splash mounts on `status === 'disconnected'`; legacy placeholder after dismiss. B5 (post-call summary) renders below when it lands.

### Handoff to B5

- [x] `onDisconnectReason` callback on `<VoiceConsultRoom>` lifts classified `reason` for B5.

### Manual smoke

- [ ] End call locally → splash says "You ended the call."
- [ ] Other side ends call → splash says "[Counterparty] ended the call."
- [ ] Throttle network until disconnect → splash says "Call disconnected — connection lost." with [Rejoin] button.
- [ ] Wait for slot expiry (or simulate) → splash says "Call ended — slot time expired."
- [ ] Splash auto-dismisses after 5s (verify with stopwatch).
- [ ] Click [Dismiss] → splash unmounts immediately.
- [ ] Click [Rejoin] (connection_lost case) → navigates back into the call attempt.

### General

- [x] Type-check + lint clean.
- [x] Classifier unit tests green (9 cases).
- [x] No regression on the existing post-call dashboard navigation (dismiss → legacy "Call ended" copy).

---

## Out of scope

- **Post-call summary screen** ([task-voice-B5](./task-voice-B5-post-call-summary.md) — separate task).
- **Recording-link CTA on the splash** ([task-voice-B6](./task-voice-B6-recording-playback-link.md) — surfaces in the summary, not the splash).
- **Telemetry on disconnect reasons.** Out of scope (Sub-batch C's QoS table covers QoS-related disconnects).

---

## Files expected to touch

**Frontend:**

- `frontend/lib/voice/classify-disconnect.ts` — **new** (~50 LOC).
- `frontend/components/consultation/VoicePostCallSplash.tsx` — **new** (~120 LOC).
- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edit** (~30 LOC: classifier wire + splash mount).

**Tests:**

- `frontend/lib/voice/__tests__/classify-disconnect.test.ts` — **new** (~40 LOC).

**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why a classifier function** — disconnect reasoning needs to be deterministic AND testable. Inline branching in the component is fine for v1 but messy by the time B5 also reads `reason`.
2. **Why 5s auto-dismiss** — long enough to read; short enough to not block. Patients tap to dismiss when they're done; doctors usually have moved on already.
3. **`token_expired` rejoin** — re-uses HMAC; user might need to re-authenticate. Acceptable v1; flag if telemetry shows a high token_expired rate.
4. **No splash for ended sessions opened from history** (Plan 07 readonly mode) — only fires on live-session disconnect. Verify in `mode='readonly'` smoke.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch A](../Plans/plan-voice-consult-selected-features.md#sub-batch-a--polished-call-5-days)
- **Source item:** [T2 §T2.16](../../../../Product%20plans/voice-consult/plan-t2-voice-real-polish.md)
- **Consumer:** [task-voice-B5](./task-voice-B5-post-call-summary.md) reads `reason`.

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** Done (2026-05-20); standalone — shipped in Sub-batch A.
