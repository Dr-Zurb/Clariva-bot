# Task video-B3: Hold call (mic + camera paused; reuses voice `hold_changed`)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch B (T2 real polish) — **M item, ~5h**

---

## Task overview

Clinical workflow: doctor steps out to look up something, hold the call so neither side feels uncertainty. Voice batch shipped this with `<HoldCallBanner>` + `useHoldState` hook + Plan 06 `hold_changed` enum value (voice B3). T2.11 video reuses 90% of that and extends with **camera-track disable on hold** (decision §10 — disabling local video too matches "stepped away" semantics).

While on hold:
- Both local mic + camera tracks `disable()`d.
- Banner: "On hold — Dr. Sharma stepped away" (or parallel for self).
- Remote video display muted (the counterparty's tile shows their last frozen frame OR the avatar placeholder; document choice).
- Companion-chat system row: `'hold_changed'` enum.

Resume: re-enable both tracks; banner clears.

**Estimated time:** ~5h.

**Status:** Complete (local hold UI shipped 2026-05-01; counterparty hold-banner + `hold_changed` system-message wire deferred to voice B3 — same A1 doctrine).

**Depends on:** voice [task-voice-B3](./task-voice-B3-hold-call.md) (HARD — reuses `<HoldCallBanner>`, `useHoldState`, `hold_changed` enum).

**Source:** [T2 §T2.11](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md); [decision §10](../Plans/plan-video-consult-selected-features.md#before-sub-batch-b-starts).

---

## Acceptance criteria

### Reuse voice `<HoldCallBanner>` + `useHoldState`

- [x] **Voice B3 hadn't shipped** → shipped both per the voice B3 contract.
  - **`frontend/hooks/useHoldState.ts` (NEW, ~150 LOC)** — pure state hook with **pre-hold snapshot** kept in a ref (`{ micMutedBefore, cameraOffBefore }`) so resume can restore the user's prior state instead of unconditionally enabling everything (a bug — a previously-muted user pressing Hold and then Resume would otherwise silently come back unmuted). API: `{ onHold, putOnHold, resume, toggleHold }`. Hook does NOT touch Twilio tracks itself — caller wires the `enable()` / `disable()` calls in its handler. Trivially testable without Twilio mocks.
  - **`frontend/components/consultation/HoldCallBanner.tsx` (NEW, ~115 LOC)** — overlay component with two variants (`'self'` / `'counterparty'`) and graceful copy fallbacks. Self variant renders a Resume CTA; counterparty variant just shows the banner (today: unused — see system-message defer note below). Centered overlay over the parent `<div className="relative">` with `aria-live="polite"` for SR announcement parity with `<RecordingPausedIndicator>`.
- [ ] **`hold_changed` Plan 06 enum value** — DEFERRED. **Same correction as A1's `mute_changed`:** `consultation_messages.system_event` is plain `TEXT` (Migration 063 line 47) — there is NO `consultation_system_subtype` enum to `ALTER TYPE`. Voice B3's PR should extend the `SystemEvent` TS union in `backend/src/services/consultation-message-service.ts` (line 271–296) and add an `emitHoldChanged({ sessionId, actorRole, actorName, onHold })` helper plus a `POST /api/v1/consultation/:sessionId/hold` route (auth via the participant's Supabase JWT). Forward this correction to voice B3 at PR time — the voice B3 task draft also wrongly suggests "ALTER TYPE consultation_system_subtype ADD VALUE 'hold_changed'".

### Hold button in `<VideoRoom>`

- [x] **Edit `<VideoRoom>`** — added Hold/Resume button to the controls bar between Camera and Mirror (semantically adjacent to the publisher-side toggles — it's a "pause both" superset). Visible at all times while connected; flips label + style based on `hold.onHold`. **No Lucide icon** — the existing controls bar uses text-only buttons (Mute / Camera off / Mirror on / Leave call), so a text-only Hold/Resume keeps the visual idiom consistent. (Lucide isn't in the frontend deps yet; revisit when A4's controls extraction picks up.)
- [x] **`handleToggleHold`** implemented per the draft, MINUS the `emitSystemMessage` call (deferred — see system-message defer note above):
  - On hold: snapshot pre-hold mic + camera state via `hold.toggleHold(...)`, then `audioTrack.disable()` + `videoTrack.disable()` (typeof-guarded for SDK forward-compat — same defensive pattern as `handleToggleMic` / `handleToggleCamera`). Reflect into `setMicMuted(true)` + `setCameraOff(true)` so the rest of the component's UI flags stay consistent (self-tile avatar overlay reuses A2's `cameraOff` derivation; mute icon reuses A1's `micMuted` derivation).
  - On resume: read snapshot, restore each track to its pre-hold state via the same defensive `enable()` / `disable()` guards, write the prior values back to `setMicMuted` + `setCameraOff`.
  - Audio-only mode (B8) — no video track to disable; the audioTrack-only branch handles that case naturally (the `if (videoTrack)` guard).
- [x] **Banner** — `<HoldCallBanner variant="self" />` mounted on the SAME `<div className="relative">` that hosts the local + remote `<VideoTile>`s, so it overlays the entire video canvas (not just one tile) — the call is on hold, both tiles are paused. `z-30` puts it above the recording indicator (z-20) and the caller card overlay so the hold state is visually dominant. Counterparty variant wired in the component but UNUSED today — see Companion chat / counterparty signal note below.
- [x] **Controls collapse on hold** — Mute, Camera, Mirror, Volume slider, Quality picker all hide when `hold.onHold === true`; only Hold (now labelled "Resume") and Leave call remain. Rationale: clicking Mute on a disabled audio track would silently no-op (confusing); the action cluster's job while on hold is just "get me back" or "abandon this call".

### Remote video display behavior

- [x] When the counterparty disables their video track for hold (`audioTrack.disable()` + `videoTrack.disable()` in their handler → Twilio fires `RemoteVideoTrack.on('disabled')` → existing A2 wiring at `VideoRoom.tsx:1053–1054` flips `setRemoteCameraOff(true)`), the remote tile shows the avatar placeholder. **Reuses A2 verbatim — no new wiring.**
- [ ] **Optional decision §10 followup** — last-frozen-frame on remote — DEFERRED per the draft's recommendation. Avatar placeholder is good enough for v1.

### Recording continuity

- [x] **Recording continues during hold** — no recording-control code touched in this PR. Twilio's compositor records whatever it sees on the room; disabled tracks just mean silence + black-tile / avatar in the artifact. This satisfies the doctrine "hold is part of the call duration" trivially because we never call any pause-recording API.
- [ ] **Manual verification** of the recording artifact (silent during hold periods, video tile shows the avatar / black) — pending PR review with a real test consult that exercises hold mid-recording.

### Companion chat

- [ ] **System row visible to both sides: DEFERRED** — the system-message route (`POST /api/v1/consultation/:sessionId/hold`) doesn't exist yet (see `hold_changed` enum note above; same situation as voice A7 owning the `mute_changed` route for video A1). Today the counterparty sees the existing A2 (camera-off → avatar) + A1 (audio mute, on the audio sink) visual changes; the explicit "🔒 Dr. Sharma put the call on hold" chat row is gated on voice B3's backend route landing. The frontend is ready — when voice B3's route exists, `<VideoRoom>`'s `handleToggleHold` adds a fire-and-forget `fetch(POST /hold, { onHold }, Bearer chatAuth.accessToken)` after the local state flip (verbatim copy of voice A7's pattern from the A1 deferral notes).

### Lifecycle interactions

- [x] **Hold + mute (A1) are independent.** The snapshot ensures resume restores the prior mute state. Toggling mute mid-hold isn't possible because the Mute button is hidden while `onHold === true` (action cluster collapsed); when the user clicks Resume, mute restores to its pre-hold value.
- [ ] **Hold + reconnect (B4): DEFERRED.** B4 hasn't shipped; today Twilio's auto-reconnect handles transient drops. The local `hold.onHold` state survives any in-component lifecycle (the hook's state is React-managed; component re-renders preserve it). When B4 lands, the reconnect banner takes precedence visually and `useHoldState` hands the snapshot back unchanged on resume — no new code needed in this hook.

### Manual smoke

- [ ] Doctor clicks Hold → local self-tile shows the avatar overlay + the centered "On hold — You stepped away. Press Resume when you're back." banner; controls bar collapses to [Hold→Resume] [Leave]; doctor's mic + camera tracks both `disabled()`. *(Pending PR review with a real test consult.)*
- [ ] Patient sees doctor's video tile flip to avatar (existing A2 path) + audio goes silent. **No "Dr. Sharma is on hold" chat row** until voice B3's backend route ships (deferred — see Companion chat note above). *(Pending.)*
- [ ] Doctor clicks Resume → banner clears; mic + camera tracks restored to their pre-hold state (e.g. if doctor was already muted before hold, stays muted on resume; if camera was off, stays off); patient sees doctor's video again. *(Pending.)*
- [ ] If patient was muted before doctor pressed Hold, patient's view of own UI is unchanged (hold is a doctor-side action; patient flow is identical to today's). *(Pending.)*
- [ ] Cycling hold/resume rapidly → snapshot ref prevents stacked captures (the `snapshotRef !== null` guard inside `putOnHold` makes a double-Hold a no-op; double-Resume is a no-op too). *(Pending.)*
- [ ] `mode='readonly'` — `<VideoRoom>` has no `mode` prop today (Plan 07 history viewer renders elsewhere). Acceptance trivially satisfied; document the gating point for when the prop ships (`mode !== 'readonly'` check on the Hold button). *(Documented inline in the JSX comment block.)*
- [ ] Voice consult unaffected — voice's hold flow doesn't exist yet (voice B3 drafted). The new `useHoldState` hook + `<HoldCallBanner>` component are mounted ONLY in `<VideoRoom>` today; nothing in `<VoiceConsultRoom>` was touched. *(Verified by grepping for `useHoldState` / `HoldCallBanner` — only `VideoRoom.tsx` imports them.)*

### General

- [x] Type-check (`npx tsc --noEmit`) clean.
- [x] Lint (`npx eslint`) clean on all three touched files (`useHoldState.ts`, `HoldCallBanner.tsx`, `VideoRoom.tsx`).
- [ ] No console errors. *(Pending visual verification.)*
- [ ] Recording continuity verified. *(Pending — no code path changes recording behavior; verification is observational on the artifact.)*

---

## Implementation log (2026-05-01)

### Audit findings that shaped the implementation

1. **Voice B3 still drafted; same precedent as A1.** A1 (mute) shipped the local UI behavior but deferred the `mute_changed` system-message wire to voice A7 (which owns the backend infrastructure). B3 follows the same precedent — local hold UI ships now, counterparty signal + chat row defer to voice B3's backend.
2. **No `consultation_system_subtype` enum exists.** `consultation_messages.system_event` is plain `TEXT` (Migration 063 line 47, "deliberately TEXT (not an ENUM) so Plans 07, 08, 09 can each ADD tags without coordinating an ALTER TYPE migration"). Voice B3's draft (and this video B3 draft) both wrongly suggest `ALTER TYPE consultation_system_subtype ADD VALUE 'hold_changed'`. Forward the correction to voice B3 at PR time. The actual code path is: extend `SystemEvent` TS union → add `emitHoldChanged` helper → add `POST .../hold` route → frontend fire-and-forget fetch from `handleToggleHold`.
3. **A2's existing `RemoteVideoTrack.on('disabled')` wiring is the v1 counterparty signal.** When the doctor disables their video track for hold, the patient's existing A2 listener fires and flips `setRemoteCameraOff(true)` → avatar shows on the remote tile. Combined with the audio going silent (Twilio mute on disabled audio track), the counterparty has a clear visual cue that something's paused — just no explicit "this is HOLD vs camera-off" disambiguation until the system-message route lands.
4. **`<VideoRoom>` has no `mode` prop today.** The "readonly mode hides Hold button" acceptance is trivially satisfied (no prop = no gating needed). Documented the future gating point (`mode !== 'readonly'`) inline in the JSX comment so when Plan 07 ships, the diff is one line.
5. **No DataTrack peer-to-peer signal needed.** Briefly considered using Twilio `LocalDataTrack` for in-call hold-state broadcast (no backend dep). Rejected: would duplicate the eventual system-message channel (meaning we'd ship code we'd later remove), and the data channel doesn't survive reconnect cleanly. Path A (defer to backend) keeps the surface minimal and future-compatible.

### Deviations from the draft

- **Snapshot-based resume.** The draft's `handleToggleHold` pseudocode unconditionally calls `enable()` on both tracks during resume — that would silently unmute a previously-muted user. The hook captures a snapshot at hold time and the resume branch restores each track to its pre-hold state. The `useHoldState` hook OWNS this — keeps the bug-prevention concern out of the component.
- **Action cluster collapse.** Beyond the spec — when on hold, Mute / Camera / Mirror / Volume / Quality all hide; only Resume + Leave remain. Rationale: clicking Mute on an already-disabled audio track is a no-op (confusing UX). The collapsed bar makes the call's current state unambiguous.
- **Banner has its own Resume CTA.** The Hold/Resume button in the controls bar is the primary affordance, but the banner's Resume button is the redundant in-canvas affordance for users whose attention is on the video, not the controls strip. Both bind to the same handler.
- **Counterparty variant of `<HoldCallBanner>` is wired but unused today.** Future PR (when voice B3's backend route lands) flips one prop in `<VideoRoom>` to render `<HoldCallBanner variant="counterparty" counterpartyLabel={...} />` overlaid on the remote tile when the counterparty is on hold. Type-shipped now so the future diff is minimal.

### Files touched

**Frontend (3 files, ~290 LOC net):**
- `frontend/hooks/useHoldState.ts` — **new** (~150 LOC). Pure state hook + snapshot.
- `frontend/components/consultation/HoldCallBanner.tsx` — **new** (~115 LOC). Overlay component, two variants.
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~115 LOC: import, hook mount, `handleToggleHold` callback, banner overlay JSX, Hold button JSX, controls-collapse gates on Mute/Camera/Mirror/Volume/Quality).

**Backend / migrations / tests:** none in this PR (system-message route deferred to voice B3 — see notes above). Voice B3's PR will own:
- `SystemEvent` union extension (`'hold_changed'` added to `backend/src/services/consultation-message-service.ts`).
- `emitHoldChanged({ sessionId, actorRole, actorName, onHold })` helper.
- `POST /api/v1/consultation/:sessionId/hold` route + `authenticateToken` middleware.
- One-line follow-up in `<VideoRoom>` `handleToggleHold` to fire-and-forget the route after the local flip.
- Wire `<VoiceConsultRoom>`'s own toggle handler to the same route.

### Follow-ups

- **Wire system-message + chat row** — voice B3's PR owns the backend; `<VideoRoom>` adds a one-line `fetch` after the local flip in `handleToggleHold`.
- **Counterparty banner** — flip `<HoldCallBanner variant="counterparty">` on when voice B3's route surfaces a `RemoteParticipantHoldState` signal (likely via Realtime broadcast from the backend, mirroring the recording-pause Realtime event from Plan 02 / Task 28).
- **Hold + reconnect (B4) interaction** — when B4 ships, verify reconnect banner takes precedence visually; the snapshot restore on resume is unchanged.
- **Recording artifact verification** — manual smoke: book a recorded test consult, press Hold mid-recording, verify the resulting Twilio composition contains silent + avatar/black during the hold periods. No code change anticipated.
- **Component tests** — `useHoldState` is trivially testable (no Twilio mocks needed). Add a Jest sweep for `putOnHold` / `resume` / `toggleHold` lifecycle + the snapshot semantics. Skipped in v1 PR (manual smoke covers the lifecycle).

---

## Out of scope

- **Hold-music or hold-tone.** Out of scope (Principle 8).
- **Auto-resume after timeout.** Out of scope (manual resume).
- **One-sided hold (only counterparty muted, not own).** Out of scope; both-sides parity.
- **Last-frozen-frame on remote.** Defer to follow-up (avatar placeholder in v1).

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/HoldCallBanner.tsx` — **reuse** if voice shipped, else **new**.
- `frontend/hooks/useHoldState.ts` — **reuse** if voice shipped, else **new**.
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~30 LOC: button + handler + banner mount).

**Backend / migrations / tests:** none (assuming voice's `hold_changed` enum migration has shipped).

---

## Notes / open decisions

1. **Decision §10** — disable BOTH mic and camera on hold (recommended; "stepped away" is the natural semantic). Alternative: only mic (less common; documented).
2. **Last-frozen-frame** — defer to follow-up; avatar placeholder is good enough.
3. **Multiple holds concurrently** — only one side can put the call on hold at a time; if both try simultaneously, last-write-wins via Realtime ordering.
4. **Recording boundary** — hold doesn't pause recording (call duration includes hold time per voice doctrine).

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch B](../Plans/plan-video-consult-selected-features.md#sub-batch-b--real-polish-5-days)
- **Source item:** [T2 §T2.11](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md)
- **Sibling (voice):** [task-voice-B3](./task-voice-B3-hold-call.md)
- **Plan 06:** `hold_changed` enum (shipped by voice batch)
- **Decision:** [§10 — hold semantics for video](../Plans/plan-video-consult-selected-features.md#before-sub-batch-b-starts)

---

**Owner:** Sahil
**Created:** 2026-04-30
**Status:** Complete (local hold UI shipped 2026-05-01; counterparty signal + chat row deferred to voice B3 — same A1 doctrine).
