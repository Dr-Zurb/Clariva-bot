# Plan 05 — Voice consultation modality (Twilio Video audio-only + `<VoiceConsultRoom>` + transcription + booking copy)

## Ship voice as "video with the camera off" via Twilio Video — global day one, zero PSTN

> **Master plan reference:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 2 (voice = WebRTC-only via Twilio Video audio mode; no PSTN in v1) **LOCKED**. Decision 3 (RESOLVED-BY-DECISION-2 — no PSTN flow style needed). Principle 8 (voice booking copy must explicitly say "audio only, no phone call — tap link to join") **LOCKED**. Principle 2 ("code global, start India") **LOCKED**.
>
> **Sequencing index:** [plan-00-multi-modality-implementation-index.md](./plan-00-multi-modality-implementation-index.md). Hard depends on Plans 01 + 02 + 03. Ships after Plan 04 (text proves the lifecycle, voice repeats it).

---

## Goal

Land voice as a first-class modality on the Plan 01 facade by **wrapping the existing Twilio Video infrastructure with `audioOnly: true`** — no new vendor, no PSTN, no per-country phone-number rental. After this plan ships:

- A patient who books a voice consult gets an IG DM ping (with the explicit Principle 8 disambiguation: "audio only, no phone call") at the consult start time.
- Tapping the link opens `<VoiceConsultRoom>` (mute / speaker / end controls; no camera).
- The doctor opens the same room from `<LiveConsultPanel>` (Plan 03's host) → primary `[Start voice consultation]`.
- Twilio Video room is provisioned with audio-only constraints; existing recording lifecycle from `video-session-twilio.ts` (Plan 01's rename) fires for audio.
- Post-consult, the audio Composition flows into a transcription pipeline: Whisper for English, Deepgram Indic for Hindi / Hinglish — feeds Plan 10's eventual AI assist.
- Voice-specific booking copy + DM copy disambiguates "link, not phone call" per Principle 8.

This plan **does not** ship the companion text panel inside the voice room — that's Plan 06. In v1 between Plan 05 and Plan 06 landing, the voice room shows audio controls only.

---

## Companion plans

- [plan-01-foundation-consultation-sessions.md](./plan-01-foundation-consultation-sessions.md) — Plan 01's renamed `video-session-twilio.ts` is what this plan thinly wraps.
- [plan-02-recording-governance-foundation.md](./plan-02-recording-governance-foundation.md) — voice recording inherits Decision 4 (Decision 12 LOCKED, no fork).
- [plan-03-doctor-modality-launcher.md](./plan-03-doctor-modality-launcher.md) — `<VoiceConsultRoom>` mounts inside `<LiveConsultPanel>` when modality === 'voice'.
- [plan-04-text-consultation-supabase.md](./plan-04-text-consultation-supabase.md) — Plan 04 ships first as the simpler of the two non-video modalities; this plan reuses Plan 04's `consultation-message-service.ts` once Plan 06 ties the companion chat in.
- [plan-06-companion-text-channel.md](./plan-06-companion-text-channel.md) — extends `<VoiceConsultRoom>` to fill the main canvas with the companion chat panel (since voice has no video to look at).

---

## Architectural choice (already locked)

Decision 2 LOCKED voice on **Twilio Video audio-only mode**, NOT Twilio Programmable Voice / Exotel / any PSTN provider. Recap of why:

- **Global day one.** PSTN means per-country phone-number rental + KYC + carrier rates. WebRTC is the same SDK in India / US / UAE / Nigeria / Brazil at flat per-minute cost.
- **Cost.** ~$120/mo at 1000 consults vs ~₹50k (~$600) just for India PSTN.
- **Reuse.** Twilio Video infrastructure already exists; voice = the same room with `video: false`. Adapter is ~150 lines instead of a 600+ line PSTN integration.
- **Decision 11 payoff.** voice↔video switching mid-consult is "enable the camera track on the existing room" — same SID, no recreation, recording continuous.

Trade-off accepted: patient must keep the browser tab open with screen on. Mitigated by:
- Principle 8 booking + DM copy explicitly says *"audio only, no phone call — tap link to join"*.
- `keep-screen-awake` API call when in active voice consult.
- Disconnect-toast + reconnect logic (~same as the existing `<VideoRoom>`).
- Doctor-side "patient hasn't joined" surface with one-tap "resend link" via SMS+email.

PSTN fallback can be added per-region in v2+ behind the same `voice-session-*.ts` adapter interface in ~3 days. The trigger to add it is real telemetry showing >5% call-quality complaints in a region.

---

## Audit summary (current code)

### What exists today

| Component | Path | Plan-05 disposition |
|-----------|------|---------------------|
| Plan 01's `video-session-twilio.ts` (renamed from `consultation-room-service.ts`) | `backend/src/services/video-session-twilio.ts` | **Wrap** — `voice-session-twilio.ts` is a thin facade that calls `videoSessionTwilioAdapter.createSession({ ..., audioOnly: true })` |
| Plan 01's `consultation-session-service.ts` facade | `backend/src/services/consultation-session-service.ts` | **Consume** — register `voice` adapter |
| Plan 01's `sendConsultationReadyToPatient` fan-out | `backend/src/services/notification-service.ts` | **Consume** — fire at session-ready time with voice variant of DM copy |
| Existing Twilio Video webhooks | `backend/src/controllers/twilio-webhook-controller.ts` | **Read-only consume** — Video webhooks already cover audio-only rooms; no extension needed for v1. Only needs work if/when PSTN fallback is added in v2. |
| Existing prescription delivery flow | (existing services) | **Consume** — voice consults end with the same prescription delivery as video / text |
| Existing DM copy builders | `backend/src/utils/dm-copy.ts` | **Extend** — add voice variants of `buildConsultationReadyDm` + booking-time `buildPaymentConfirmationMessage` with Principle 8 disambiguation |

### What's missing (this plan delivers)

| Gap | Why |
|-----|-----|
| No `voice-session-twilio.ts` adapter | Plan 01's facade needs an implementation for `modality === 'voice'`. Audio-only-mode needs an explicit entry point even though it shares Twilio Video infra. |
| No `<VoiceConsultRoom>` UI | Audio-only doesn't reuse `<VideoRoom>` (no video tile, different controls layout). |
| No transcription pipeline | Audio recordings feed Plan 10's eventual AI clinical assist; transcription must run as part of the post-consult lifecycle now to seed the data model. |
| No voice-specific booking + DM copy | Without Principle 8 copy, patients in India will expect a phone call → support tickets. |

---

## Tasks (from the master plan)

| # | Master-plan task | Phase | Effort | Risk |
|---|------------------|-------|--------|------|
| 23 | B.1 — Backend `voice-session-twilio.ts` adapter (Twilio Video audio-only wrapper, Decision 2 LOCKED) | B | ~2h | Low — thin wrapper around existing Plan 01 video adapter |
| (24 — split out) | B.2 — Frontend `<VoiceConsultRoom>` audio-only UI, **without** companion chat panel (added by Plan 06) | B | ~2h | Low |
| 25 | B.4 — Voice transcription path: Whisper for English, Deepgram Indic for Hindi/Hinglish | B | ~2h | Medium — new external pipeline; budget cap matters |
| 26 | B.5 / C.5 — Voice-specific booking + DM copy with Principle 8 "audio only, no phone call" disambiguation | B | ~1h | Low — copy + builder additions |

> **Note on master-plan Task 24:** the master-plan task description bundles "audio-only UI **+** companion text panel auto-opened" (per Decision 9). For sequencing reasons we **split** Task 24: this plan ships the audio-only UI; Plan 06 ships the companion chat panel that fills the main canvas. The split is documented in Plan 06.

**Suggested order:** 23 (adapter first) → 26 (copy in parallel) → 24-split (`<VoiceConsultRoom>` UI; depends on adapter for join-token flow) → 25 (transcription pipeline; can land after the first voice consult ships).

---

## Adapter contract (Task 23)

```ts
// backend/src/services/voice-session-twilio.ts (NEW)

import { videoSessionTwilioAdapter } from './video-session-twilio'; // Plan 01 rename
import type { ConsultationSessionAdapter } from './consultation-session-service';

export const voiceSessionTwilioAdapter: ConsultationSessionAdapter = {
  async createSession(input) {
    // Defer to the Twilio Video adapter with audioOnly constraints.
    const session = await videoSessionTwilioAdapter.createSession({
      ...input,
      audioOnly: true,                                // Twilio Video room with no video tracks published
      recordingTracks: 'audio',                       // Decision 12 inherits Decision 4 — record audio
      provider: 'twilio_video',                        // same provider; modality differs
    });

    // Fire fan-out using the voice variant of the DM copy (Principle 8 disambiguation).
    await sendConsultationReadyToPatient({
      appointmentId: input.appointmentId,
      patientId:     input.patientId,
      modality:      'voice',
      joinUrl:       session.joinUrl,
    });

    return session;
  },

  async endSession(sessionId) {
    // Defer to video adapter; recording finalization fires the audio Composition.
    await videoSessionTwilioAdapter.endSession(sessionId);
    // Enqueue voice transcription (Task 25) once the audio Composition is ready.
    await enqueueVoiceTranscription({ sessionId });
  },

  async getJoinToken(sessionId, role) {
    // Defer; returns a Twilio Video access token that the frontend uses with audio-only constraints.
    return videoSessionTwilioAdapter.getJoinToken(sessionId, role);
  },

  // Plan 06 extends this adapter with provisionCompanionChannel() at session-create time.
};
```

The adapter is intentionally thin. The bulk of the lift is in `videoSessionTwilioAdapter` (which already exists from today's video flow).

---

## Frontend `<VoiceConsultRoom>` (Task 24-split)

```
frontend/components/consultation/VoiceConsultRoom.tsx (NEW)

Props:
  - sessionId: string
  - currentUserRole: 'doctor' | 'patient'

Layout (mobile-first):
  ┌─────────────────────────────────┐
  │ Header                           │
  │ Dr. Sharma · 🎙 Voice consult    │
  │ ● Patient connected · 02:34      │
  ├─────────────────────────────────┤
  │ Big visual indicator             │
  │   - audio waveform / ring        │
  │   - "Recording 🔴" indicator     │
  │     (when consent === true)      │
  │   - or "Not recording" badge     │
  │     (when consent === false)     │
  │                                  │
  │     [Plan 06 will add the        │
  │      companion text panel here]  │
  ├─────────────────────────────────┤
  │ Controls                         │
  │  [🎙 Mute] [🔊 Speaker] [📞 End] │
  └─────────────────────────────────┘

Behavior:
  - Uses Twilio Video JS SDK with publishOnly = audio
  - keep-screen-awake API while consent is live
  - Auto-reconnect on network drop
  - "Patient hasn't joined" doctor-side surface for the first 3 minutes
    with [Resend link via SMS] [Resend link via IG DM] buttons
    that call notification-service helpers
```

The intentional empty visual region in the middle is so Plan 06 can drop the companion text panel in without re-laying-out the room. In v1 (between Plan 05 and Plan 06 landing), it's just a visual breathing area.

---

## Voice transcription pipeline (Task 25)

```ts
// backend/src/services/voice-transcription-service.ts (NEW)

// Triggered by the post-consult worker after the audio Composition is ready.
// Routing:
//   - Detect language from doctor's profile.language preference + first 30s sample
//   - Route 'en-IN' / 'en-US' → OpenAI Whisper
//   - Route 'hi' / 'hi-IN' / Hinglish → Deepgram Nova-2 with Indic language code
//   - Route others → Whisper (broader language coverage)
// Output: writes transcript JSON into a generic `consultation_transcripts` table or
//          into Plan 02's recording_artifact_index — pick one in the task file.

export async function enqueueVoiceTranscription(input: { sessionId: string }): Promise<void>;
export async function processVoiceTranscription(input: { sessionId: string }): Promise<TranscriptResult>;
```

**Cost cap:** transcription cost is ~$0.006/min (Whisper) or ~$0.0043/min (Deepgram Nova-2). At 30 min average consult and 1000 consults/mo, this is ~$130–180/mo. Acceptable for v1; revisit if doctor adoption explodes.

---

## DM + booking copy (Task 26 — Principle 8 disambiguation)

Extend `backend/src/utils/dm-copy.ts`:

```ts
// EXISTING (Plan 04 added):
//   buildConsultationReadyDm({ modality: 'text' | 'voice' | 'video', ... })
// 
// Voice variant copy (LOCKED — Principle 8):
//   "Your voice consultation with Dr. {doctorName} is starting at {time}.
//    
//    👉 This is an internet voice call (audio only) — NOT a phone call.
//    Tap the link below to join from this device.
//    
//    {joinUrl}
//    
//    The link works for the next {minutes} min. If you can't open it, reply here."
//
// (Existing builder gets a switch on input.modality to render this branch.)

// Booking-time payment-confirmation copy ALSO needs Principle 8 disambiguation
// so patients aren't surprised days before:
//
// In buildPaymentConfirmationMessage() voice branch:
//   "Booking confirmed — voice consult with Dr. {doctorName} on {date} at {time}.
//    Note: voice consults happen via a web link from your browser (audio only).
//    We'll text + IG-DM the join link 5 min before."
```

Both builders are updated in this single task so the messaging is consistent across the booking → reminder → consult-ready arc.

---

## Lifecycle wiring (where Plans 01 + 02 + 03 + 05 join up)

**Booking time:**

1. Patient books `consultation_type='voice'` via IG DM.
2. Booking-confirmation step uses Task 26's voice variant of `buildPaymentConfirmationMessage` (Principle 8 disambiguation).
3. Plan 02's recording-consent capture fires.
4. `appointments` confirmed.

**Pre-consult (5 min before scheduled_start_at):**

1. Cron / scheduler identifies the appointment.
2. Calls `consultation-session-service.ts#createSession({ modality: 'voice', ... })`.
3. Facade dispatches to `voiceSessionTwilioAdapter.createSession()`.
4. Adapter delegates to `videoSessionTwilioAdapter.createSession({ audioOnly: true, recordingTracks: 'audio' })`.
5. Twilio Video room created; recording rules set to audio-only.
6. Adapter fires `sendConsultationReadyToPatient` with modality='voice' → fan-out SMS + email + IG DM with voice-variant copy.

**Consult time:**

1. Patient taps the IG DM link → `<VoiceConsultRoom>` loads.
2. Doctor opens appointment detail page → `<ConsultationLauncher>` (Plan 03) → primary `[Start voice consultation]` → `<VoiceConsultRoom>` mounts inside `<LiveConsultPanel>`.
3. Twilio Video room joined by both, audio only (camera tracks not published).
4. If Plan 02's consent decision was `false`, `<SessionStartBanner>` renders ("Patient declined recording. Take detailed clinical notes.") and audio is **not** recorded; otherwise recording fires.
5. (Plan 06 will add the companion chat panel; in this plan, there's just a visual breathing area.)

**Consult end:**

1. Doctor clicks `[End consultation]`.
2. `consultation-session-service.ts#endSession()` → adapter delegates to video adapter → Twilio room closes → Composition finalization fires.
3. Adapter enqueues voice transcription (Task 25).
4. Doctor writes prescription.
5. `sendPrescriptionReadyToPatient` fires → fan-out IG + SMS + email.
6. Plan 07 (when it ships) sends "view your consult" DM with replay link (audio + transcript).

---

## Files expected to touch

**Backend:**

- `backend/src/services/voice-session-twilio.ts` (**new**) — thin wrapper
- `backend/src/services/consultation-session-service.ts` (**extend** to register voice adapter)
- `backend/src/services/voice-transcription-service.ts` (**new**) — Task 25
- `backend/src/workers/consultation-post-session-worker.ts` (**new** OR extend) — fires transcription enqueue after audio Composition ready
- `backend/src/utils/dm-copy.ts` (**extend** voice variants for `buildConsultationReadyDm` + `buildPaymentConfirmationMessage`)
- (Possibly) `backend/src/controllers/twilio-webhook-controller.ts` — only if existing Video webhook handler needs a branch for audio-only Composition vs full Composition. Verify at PR-time; likely no change needed.

**Frontend:**

- `frontend/components/consultation/VoiceConsultRoom.tsx` (**new**) — audio-only UI
- `frontend/components/consultation/LiveConsultPanel.tsx` (**extend** from Plan 03 to wire voice branch)
- New patient-facing route `frontend/app/c/voice/[sessionId]/page.tsx` (or whatever the patient-facing route convention is) — the URL the IG-DM ping points to
- (Possibly) `frontend/components/consultation/PatientJoinLink.tsx` — extend with voice-modality URL shape (was started in Plan 03)

**Tests:**

- `backend/tests/unit/services/voice-session-twilio.test.ts` — adapter thin-wrapper behavior
- `backend/tests/unit/services/voice-transcription-service.test.ts` — language routing + provider selection
- `backend/tests/unit/utils/dm-copy-voice-variant.test.ts` — Principle 8 copy fixtures
- `frontend/__tests__/components/consultation/VoiceConsultRoom.test.tsx`

---

## Acceptance criteria

- [ ] **Task 23:** Voice adapter registered behind facade; smoke test creates voice session end-to-end via `consultation-session-service.ts#createSession({ modality: 'voice' })`.
- [ ] **Task 24-split:** `<VoiceConsultRoom>` renders mute / speaker / end controls; doctor + patient can join the same Twilio Video room with audio only and hear each other on at least Chrome (desktop + Android) and Safari (desktop + iOS); `keep-screen-awake` fires when in active session.
- [ ] **Task 25:** Voice transcription pipeline routes English → Whisper, Hindi/Hinglish → Deepgram; transcript persisted; cost telemetry surfaces in ops dashboard.
- [ ] **Task 26:** Booking confirmation + DM ping include Principle 8 disambiguation ("audio only, no phone call"); fixture tests pin the exact copy.
- [ ] **End-to-end smoke:** book voice consult → IG DM with disambiguation → patient taps link → audio room loads → both hear each other → end → transcription runs → prescription delivered.
- [ ] No regression on existing video flow.
- [ ] Backend + frontend type-check + lint clean.

---

## Open questions / decisions for during implementation

1. **Twilio Video audio-only configuration specifics.** Two ways to enforce audio-only: (a) backend recording rule blocks video tracks; (b) frontend simply doesn't request camera. Recommendation: do both — defense in depth — backend rule prevents accidental video recording even if a custom client tries to publish video.
2. **Language detection for transcription routing.** Naive route is `doctor.profile.language`. Better is the first-30s sample. Recommendation: ship doctor-profile routing in v1; add sample-based detection only if doctors set the profile wrong (real signal needed first).
3. **`<VoiceConsultRoom>` waveform vs static avatar.** Real-time waveform is a small extra dep + CPU. Recommendation: ship a simple animated ring around the doctor avatar (Apple-style). Saves the waveform decision until v2.
4. **What to surface when patient hasn't joined after 3 min.** Two-button surface: `[Resend link via SMS]` (Twilio SMS — already exists) + `[Resend link via IG DM]` (existing IG send). Don't add WhatsApp here per master-plan WhatsApp-deferral lock.
5. **Audio Composition vs Track-level recording.** Twilio Video Recording supports either. Recommendation: Composition (single audio file per consult) — simpler downstream pipeline, smaller storage, cleaner transcript input.

---

## Non-goals

- No PSTN fallback. Decision 2 LOCKED defers to v2+.
- No companion text panel inside `<VoiceConsultRoom>`. Plan 06 owns that.
- No SOAP/Rx draft from voice transcript. Plan 10 (deferred).
- No voice → video upgrade mid-call. Plan 09 owns that and depends on this plan + the existing video room.
- No specialty-aware transcription tuning (medical-vocabulary models). Owner option for v2 if Whisper/Deepgram default is good-enough.

---

## References

- **Master plan:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 2 LOCKED + Decision 12 LOCKED + Principle 8 LOCKED.
- **Plan 01:** facade contract; renamed `video-session-twilio.ts` is what we wrap.
- **Plan 02:** consent doctrine — `recording_consent_decision` is checked before recording fires.
- **Plan 03:** `<LiveConsultPanel>` host where `<VoiceConsultRoom>` mounts.
- **Plan 04:** ships before this for risk reasons (text is the simpler delivery path); this plan reuses Plan 04's `consultation-message-service.ts` indirectly via Plan 06.
- **Twilio Video audio-only mode docs:** verify exact API at PR-time (audio-only is a publish-side constraint, not a special API).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Drafted; ready for owner review. Hard-blocks on Plans 01 + 02 + 03; soft-blocks on Plan 04 landing first (sequencing for risk reasons; not technical).
