# Task voice-A6: Pre-call mic check screen

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch A (T1 quick wins) — **S item, ~3h**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Before the call connects, show a screen where the patient/doctor can:

1. See their mic level (reuses `<MicMeterBar>` from A3).
2. Pick their output device (reuses `<AudioOutputPicker>` / `<SpeakerEarpieceToggle>` from A5).
3. Verify the device works ("Test sound" button plays a 1s chime through the selected output).
4. Click "Join call" to proceed; or "Skip" to bypass (telemetered — decision §2).

This becomes the foundation that **task-voice-B2 (T2.9 pre-call lobby)** extends with clinic branding + countdown.

**Estimated time:** ~3h.

**Status:** Done (2026-05-19).

**Depends on:** [task-voice-A3](./task-voice-A3-mic-level-meter.md), [task-voice-A5](./task-voice-A5-audio-output-device-picker.md) — soft (consumes their components).

**Source:** [T1 §T1.2](../../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md); [decision §2](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-a-starts).

---

## Acceptance criteria

### `<VoiceConsultPreCall>` component

- [x] **New component** at `frontend/components/consultation/VoiceConsultPreCall.tsx`:
  - Headline: `"Quick mic check"` + subline `"Make sure you can hear and be heard before joining."`
  - Section 1 — Microphone:
    - `<MicMeterBar mode='horizontal' stream={micStream} />` (A3).
    - Hint: `"Speak normally — you should see the bar move."`
    - If no mic permission: button to request → `getUserMedia({ audio: true })`. On denial: error message with link to OS settings docs.
  - Section 2 — Speaker / output:
    - Mobile: `<SpeakerEarpieceToggle />` (A5).
    - Desktop: `<AudioOutputPicker />` (A5).
    - Button: `[Test sound]` → plays `/audio/precall-test-chime.mp3` (1s, soft) through the selected output.
  - Two buttons at bottom: `[Join call]` (primary) and `[Skip mic check]` (ghost).

### Telemetry (decision §2)

- [x] **Telemetered events:**
  - `precall_mic_check_shown` (impression).
  - `precall_mic_permission_granted` / `precall_mic_permission_denied`.
  - `precall_test_sound_played`.
  - `precall_skip_clicked` / `precall_join_clicked`.
- [x] Use whatever telemetry sink the rest of the frontend uses today (likely `track(eventName, props)`); if no sink, console.log with a `[telemetry]` prefix and TODO to wire later.
- [x] Goal: **track skip rate vs permission-grant rate** so we can decide whether to make the screen mandatory in v2.

### Wire into the patient voice page (and B2 will extend this)

- [x] **Edit `frontend/app/c/voice/[sessionId]/page.tsx`**:
  - Mount `<VoiceConsultPreCall onJoin={proceedToCall} onSkip={proceedToCall} />` BEFORE `<VoiceConsultRoom>`.
  - State machine: `precall` → `connecting` → `in-call`. PreCall is the new initial state.
  - The HMAC + companion exchange happens during `connecting`, not `precall` (don't pre-emptively burn tokens).

### Doctor side

- [x] **Doctor side gets the same pre-call screen** by default. Decision: doctors with back-to-back consults will skip; that's expected.
- [x] Mounted from doctor dashboard's call-launch path (find current launch flow; verify mount point).

### Asset

- [x] **`frontend/public/audio/precall-test-chime.mp3`** — 1s soft chime. Source: any royalty-free chime asset; same recording used will likely also serve for the patient-joined chime in [task-voice-C1](./task-voice-C1-audible-ringtone.md).

### Manual smoke

- [x] First load → permission prompt; granting shows live mic bar.
- [x] Denying → error tile with retry (re-prompt) link.
- [x] Click Test sound → chime plays through selected output.
- [x] Switch output device → next chime plays through new device.
- [x] Click Join → screen unmounts, connecting state begins.
- [x] Click Skip → same; telemetry fires.
- [x] Doctor side: same screen, same flow.

### General

- [x] Type-check + lint clean.
- [x] No console errors when permission is denied (graceful).
- [x] PWA install: works on Android Chrome PWA.

---

## Out of scope

- **Clinic branding + countdown** ([task-voice-B2](./task-voice-B2-precall-lobby.md) extends with both).
- **Live transcript preview** (T3, deferred).
- **Camera check.** Voice-only batch; video pre-call is a future task.
- **Network speed test** ("we'll test your bandwidth"). Out of scope; A4 network bars during call cover this reactively.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/VoiceConsultPreCall.tsx` — **new** (~150 LOC).
- `frontend/app/c/voice/[sessionId]/page.tsx` — **edit** (~30 LOC: state machine + mount).
- `frontend/public/audio/precall-test-chime.mp3` — **new asset** (~30 KB).
- Doctor-side voice launch path — **edit** (find at PR time; ~20 LOC mount).

**Tests:** none in this task; smoke verifies.

**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why pre-call before token exchange** — burning the JWT/Twilio access tokens before the user has even confirmed they want to join is wasteful and clutters logs. PreCall is purely client-side; tokens fetched on Join click.
2. **Why telemetry now** — decision §2 says yes; we need the data to decide v2 mandatory-vs-optional.
3. **iOS PWA mic permission** — must be triggered from a user gesture (the explicit click on the permission-request button). Already true; verify in smoke.
4. **B2 extends, doesn't replace** — B2 wraps `<VoiceConsultPreCall>` with a clinic-logo + countdown header. Don't pre-bake B2 here.
5. **Test chime asset** — keep it short (≤1s) and soft (Principle 8: no PSTN sounds).

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch A](../Plans/plan-voice-consult-selected-features.md#sub-batch-a--polished-call-5-days)
- **Source item:** [T1 §T1.2](../../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md)
- **Decision:** [§2 — telemeter skip rate](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-a-starts).
- **Soft deps:** [task-voice-A3](./task-voice-A3-mic-level-meter.md), [task-voice-A5](./task-voice-A5-audio-output-device-picker.md).
- **Extends:** [task-voice-B2](./task-voice-B2-precall-lobby.md) — adds branding + countdown.

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** Done (2026-05-19).
