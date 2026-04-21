# Plan 07 — Recording read surface: pause/resume, replay player, mutual access notifications, transcript PDF, post-consult chat history

## Ship Decision 4's read-side delivery layer once Plans 04 + 05 produce real artifacts

> **Master plan reference:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 4 (per-session pause/resume with audit + reason + patient-visible indicator; patient self-serve replay 90-day TTL with mutual access notifications; transcript PDF for both parties) **LOCKED**. Decision 1 sub-decision (post-consult chat history both parties indefinite read access via `<TextConsultRoom mode='readonly'>`) **LOCKED**.
>
> **Sequencing index:** [plan-00-multi-modality-implementation-index.md](./plan-00-multi-modality-implementation-index.md). Hard depends on Plans 02 + 04 + 05 (needs both consent doctrine and actual artifacts to replay).

---

## Goal

Land the **read-side** of recording governance + post-consult access:

- Doctor pause/resume button mid-consult (`<RecordingControls>`) writes to `consultation_recording_audit` (Plan 02's table) and broadcasts a patient-visible system message.
- Patient self-serve replay surface: `<RecordingReplayPlayer>` audio-baseline (video toggle in Plan 08), watermarked, stream-only, 90-day TTL, audit-logged.
- Mutual access notifications: doctor replays → patient gets DM; patient replays → doctor gets dashboard notification (audio-vs-video copy differentiation arrives in Plan 08).
- Post-consult chat-history surface: DM link → read-only `<TextConsultRoom mode='readonly'>`.
- Transcript PDF export — server-side render of chat transcript (with audio/voice transcripts merged in for voice/video modalities).
- Account-deletion → patient-side access severance is **already wired** in Plan 02; this plan ensures the replay player honors `signed_url_revocation`.

This plan **does not** ship video-specific replay friction (the audio-only-default + "Show video" toggle + SMS OTP). That's Plan 08.

---

## Companion plans

- [plan-02-recording-governance-foundation.md](./plan-02-recording-governance-foundation.md) — provides every audit table this plan writes to + the consent decision this plan honors.
- [plan-04-text-consultation-supabase.md](./plan-04-text-consultation-supabase.md) — provides `<TextConsultRoom>` that this plan extends with `mode='readonly'`.
- [plan-05-voice-consultation-twilio.md](./plan-05-voice-consultation-twilio.md) — produces the audio Compositions this plan replays.
- [plan-06-companion-text-channel.md](./plan-06-companion-text-channel.md) — provides `emitSystemMessage()` that this plan invokes for recording-paused/resumed events.
- [plan-08-video-recording-escalation.md](./plan-08-video-recording-escalation.md) — extends this plan's `<RecordingReplayPlayer>` with the video-mode toggle + SMS OTP + warning modal.

---

## Audit summary (current code at start of Plan 07)

### What exists at start

| Component | Path | Plan-07 disposition |
|-----------|------|---------------------|
| `consultation_recording_audit` table | Plan 02's migration | **Write target** for pause/resume events |
| `recording_access_audit` table | Plan 02's migration | **Write target** for every replay |
| `signed_url_revocation` table | Plan 02's migration | **Read source** before minting any signed URL |
| `regulatory_retention_policy` + archival worker | Plan 02 | **Read source** for "is this recording still patient-self-serve-accessible" check |
| Existing video recording lifecycle | `backend/src/services/video-session-twilio.ts` (Plan 01 rename) | **Read-only consume** — the recording artifact metadata it produces |
| Voice audio Compositions | Plan 05's `voice-session-twilio.ts` adapter | **Read-only consume** |
| `<TextConsultRoom>` | Plan 04's component | **Extend** with `mode: 'live' | 'readonly'` prop |
| `emitSystemMessage()` | Plan 06's helper | **Consume** to fire recording-paused/resumed system messages |
| Existing prescription-PDF stack | `backend/src/services/prescription-service.ts` (PDF rendering bits) | **Mirror** for transcript PDF rendering |

---

## Tasks (from the master plan)

| # | Master-plan task | Phase | Effort | Risk |
|---|------------------|-------|--------|------|
| 28 | E (Decision 4) — Doctor pause/resume mid-consult + reason audit log | E | ~3h | Low — Plan 02 audit table already exists |
| 29 | E (Decision 4 + 10) — Patient self-serve replay surface (stream-only, watermarked, audit-logged) — **handles audio in Plan 07; Plan 08 extends with video friction** | E | ~5h | Medium — signed-URL minting + watermark + revocation-list check + audit write all in one player surface |
| 30 | E (Decision 4 + 10) — Mutual access notifications (doctor↔patient on every recording replay) — audio-only copy in Plan 07; **audio-vs-video differentiation arrives in Plan 08** | E | ~3h | Low — fan-out helper from Plan 01 + DM copy |
| 31 | E (Decision 1 sub) — Post-consult chat-history surface (DM link → read-only `<TextConsultRoom>`) | E | ~2h | Low — `mode='readonly'` prop on existing component |
| 32 | E (Decision 1 sub) — Transcript PDF export for both parties | E | ~3h | Medium — PDF rendering pipeline; voice/video need to merge audio transcript with chat |

**Suggested order:** 28 (pause/resume — smallest, most visible) → 31 (post-consult chat link — also small) → 29 + 30 in parallel (replay player + mutual notifications go together) → 32 (transcript PDF — depends on chat-history infra).

---

## Service deliverables

### Task 28 — `recording-pause-service.ts`

```ts
// backend/src/services/recording-pause-service.ts (NEW)

export async function pauseRecording(input: {
  sessionId: string;
  doctorId:  string;
  reason:    string;             // ≥5 chars, ≤200 chars
}): Promise<void> {
  // 1. Call provider adapter to pause the actual recording (Twilio Recording Rules API:
  //    audio-only path = remove the audio track from the recording rule temporarily).
  // 2. INSERT consultation_recording_audit row { action: 'recording_paused', reason }.
  // 3. emitSystemMessage({ event: 'recording_paused', body: 'Doctor paused recording at HH:MM. Reason: <reason>' })
  // 4. Realtime broadcast picks it up → both parties see the system row + the persistent
  //    "Recording paused" indicator (frontend reads `consultation_recording_audit` latest row
  //    or subscribes to a derived state channel — pick one in the task file).
}

export async function resumeRecording(input: {
  sessionId: string;
  doctorId:  string;
}): Promise<void>;

export async function getCurrentRecordingState(input: {
  sessionId: string;
}): Promise<{ paused: boolean; pausedAt?: Date; pauseReason?: string; pausedBy?: string }>;
```

### Task 29 — `recording-access-service.ts`

```ts
// backend/src/services/recording-access-service.ts (NEW)

export async function mintReplayUrl(input: {
  sessionId:        string;
  artifactRef:      string;
  requestingUserId: string;
  requestingRole:   'doctor' | 'patient' | 'support_staff';
}): Promise<{ signedUrl: string; expiresAt: Date }> {
  // 1. AuthZ: caller must be a participant of the session OR support_staff with reason logged.
  // 2. Patient access window check:
  //    - Look up regulatory_retention_policy(country, specialty).patient_self_serve_days (default 90)
  //    - If session ended > N days ago AND requestingRole = 'patient' → throw 'beyond_self_serve_window'
  //      (UI tells patient to contact support; support_staff can still mint via this same fn.)
  // 3. Revocation list check:
  //    - signed_url_revocation: if any prefix matches the artifact's URL prefix → throw 'revoked'
  // 4. Mint a stream-only, watermarked signed URL (15 min TTL).
  //    - Watermark: server-side video/audio overlay with patient name + date + 'Confidential — for personal use only'
  //    - For audio-only: spoken-word watermark intro is overkill in v1; rely on the player's UI watermark + audit
  // 5. INSERT recording_access_audit row.
  // 6. Fire mutual access notification (Task 30) — doctor replays → patient DM, patient replays → doctor dashboard event.
  return { signedUrl, expiresAt };
}
```

### Task 30 — Mutual notifications

Two new helpers in `notification-service.ts`:

```ts
export async function notifyPatientOfDoctorReplay(input: {
  sessionId: string;
  patientId: string;
  doctorName: string;
  artifactType: 'audio' | 'transcript';   // Plan 08 will add 'video'
}): Promise<void>;
// Sends DM: "Dr. Sharma reviewed the audio of your consult on {date}. This is normal and audited."

export async function notifyDoctorOfPatientReplay(input: {
  sessionId: string;
  doctorId: string;
  patientName: string;
  artifactType: 'audio' | 'transcript';
}): Promise<void>;
// Surfaces in the doctor's dashboard event feed (no SMS/email noise — they didn't opt in for that).
```

Plan 08 extends both with `artifactType: 'video'` and tweaks the DM copy with a 🎥 indicator.

### Task 31 — Post-consult chat-history surface

```ts
// backend/src/services/notification-service.ts (EXTEND)

export async function sendPostConsultChatHistoryDm(input: {
  sessionId:  string;
  patientId:  string;
  doctorName: string;
  joinUrl:    string;                          // points to read-only TextConsultRoom
}): Promise<void>;
// DM copy: "Your consultation with Dr. Sharma is complete. View the conversation any time:
//   {joinUrl}
//   Available for 90 days; contact support for older history."
```

Frontend: `<TextConsultRoom mode='readonly'>`:
- No composer.
- No live subscription — single SELECT on mount.
- All system messages render (consult-started, recording-paused/resumed, modality-switched, etc.) so the patient sees the full narrative.
- Watermark in header: "Read-only — view of your consultation on {date}".

### Task 32 — Transcript PDF

```ts
// backend/src/services/transcript-pdf-service.ts (NEW)

export async function renderConsultTranscriptPdf(input: {
  sessionId:         string;
  requestingUserId:  string;
  requestingRole:    'doctor' | 'patient';
}): Promise<{ pdfUrl: string }>;

// Composition rules:
//   - Header: clinic letterhead + doctor name + patient name + date + modality
//   - Body: timestamped narrative
//     - kind='text' rows render as "Patient/Doctor (HH:MM): <body>"
//     - kind='attachment' rows render as "Patient/Doctor (HH:MM): [attached: <mime>]"
//     - kind='system' rows render as "[System (HH:MM): <body>]" in italic gray
//   - For voice/video modalities: merge audio transcript (Plan 05's voice-transcription-service.ts output)
//     with chat rows by timestamp. Mark spoken lines with 🎙 prefix.
//   - Footer: legal boilerplate + signed-by-clinic-system signature
//   - Watermark: "Confidential — for personal medical use only"
//
// Reuses prescription-service.ts PDF rendering stack (likely Puppeteer or similar; verify at PR-time).
```

Both doctor and patient can download via a button on:
- Doctor's appointment detail page → "Download transcript" link
- Patient's read-only `<TextConsultRoom>` → "Download transcript" button in header
- Mutual notifications fire on download just like they do on replay

---

## Frontend deliverables

- `frontend/components/consultation/RecordingControls.tsx` (**new** — Task 28) — pause/resume button + reason modal; mounts inside `<LiveConsultPanel>` (Plan 03)
- `frontend/components/consultation/RecordingPausedIndicator.tsx` (**new** — Task 28) — patient-visible badge "🔴 Recording paused" while pause is active
- `frontend/components/consultation/RecordingReplayPlayer.tsx` (**new** — Task 29) — audio + transcript player; stream-only, watermarked; (Plan 08 extends with "Show video" toggle)
- `frontend/components/consultation/TextConsultRoom.tsx` (**extend** Plan 04 with `mode: 'live' | 'readonly'` — Task 31)
- New patient-facing route `frontend/app/c/history/[sessionId]/page.tsx` (or convention-equivalent) for the read-only chat link
- New doctor-side surface on the appointment detail page → "View consult artifacts" expanded section: replay player, transcript download, modality history (Plan 09 will add the modality timeline)
- `frontend/components/consultation/ConsultArtifactsPanel.tsx` (**new** — encapsulates the post-consult artifact surface for both doctor and patient)

---

## Files expected to touch

**Backend:**

- `backend/src/services/recording-pause-service.ts` (**new** — Task 28)
- `backend/src/services/recording-access-service.ts` (**new** — Task 29)
- `backend/src/services/notification-service.ts` (**extend** with mutual replay notifications + post-consult chat DM — Tasks 30 + 31)
- `backend/src/services/transcript-pdf-service.ts` (**new** — Task 32)
- `backend/src/utils/dm-copy.ts` (**extend** with `buildPostConsultChatLinkDm`, `buildRecordingReplayedNotificationDm`, `buildTranscriptDownloadedNotificationDm`)
- `backend/src/routes/api/v1/consultation.ts` (**extend** with `/replay/{sessionId}/audio`, `/transcript/{sessionId}.pdf` endpoints)
- (Possibly) `backend/src/workers/consultation-post-session-worker.ts` — extend to fire the post-consult chat DM at session-end

**Frontend:**

- `RecordingControls.tsx` (new)
- `RecordingPausedIndicator.tsx` (new)
- `RecordingReplayPlayer.tsx` (new — audio baseline)
- `TextConsultRoom.tsx` (extend with `mode='readonly'`)
- `ConsultArtifactsPanel.tsx` (new)
- New patient-facing route page

**Tests:**

- `backend/tests/unit/services/recording-pause-service.test.ts` — pause writes audit + system message + provider call
- `backend/tests/unit/services/recording-access-service.test.ts` — TTL check + revocation check + audit write + mutual notification fire
- `backend/tests/unit/services/transcript-pdf-service.test.ts` — composition rules across kinds
- `backend/tests/integration/recording-replay-end-to-end.test.ts` — patient replay → doctor dashboard event surfaces
- `frontend/__tests__/components/consultation/TextConsultRoom-readonly.test.tsx` — renders without composer

---

## Acceptance criteria

- [ ] **Task 28:** Doctor can pause + resume mid-consult; both parties see the indicator + system message; pause/resume reason captured (≥5 chars enforced); audit table populated.
- [ ] **Task 29:** Patient can replay audio for sessions <90 days old; player streams (no download URL); watermark renders; revoked artifacts 404; audit row written on every play.
- [ ] **Task 30:** Mutual notifications fire on every replay; doctor → patient via DM (audio-only copy in this plan); patient → doctor via dashboard event; copy fixture-tested.
- [ ] **Task 31:** Patient receives DM at consult-end with read-only chat link; tapping it loads `<TextConsultRoom mode='readonly'>` with all system messages preserved.
- [ ] **Task 32:** Transcript PDF renders correctly for text-only, voice (audio transcript merged), and video (audio transcript merged) modalities; doctor + patient can download; download triggers mutual notification.
- [ ] No regression on Plans 01–06 flows.
- [ ] All new code passes `tsc --noEmit` + `eslint` clean; tests green.

---

## Open questions / decisions for during implementation

1. **Pause UI: confirm reason modal vs inline reason input.** Recommendation: modal (≥5 chars enforced with validation; inline is too easy to bypass).
2. **Pause-state UI source-of-truth:** does the frontend subscribe to a Realtime channel for live state, or poll the latest `consultation_recording_audit` row? Recommendation: derive from system messages already in `consultation_messages` (Plan 06) — no extra subscription needed. The latest `recording_paused` without a following `recording_resumed` = currently paused.
3. **Watermark renderer:** server-side overlay or client-side CSS? Server-side is more secure (can't be DOM-removed) but more expensive. Recommendation: client-side CSS for v1 with a clear note in audit that the artifact stream is the same — defense isn't watermark, it's the audit. Real screenshare-stoppers are always defeatable; the deterrent is "we know you watched it".
4. **Patient replay link mechanism:** dedicated patient-portal page, or a magic-link DM each time? Recommendation: magic-link from the post-consult DM (already authenticated via the session JWT pattern from Plan 04).
5. **Transcript PDF for in-progress sessions:** disabled until session ends. Recommendation: yes, gate on `consultation_sessions.status='ended'`.
6. **Long consults (>2 hr) for transcript PDF rendering:** memory + render time. Recommendation: stream-render to disk + return a signed URL; don't hold the full PDF in memory.

---

## Non-goals

- No video-specific replay friction (audio-only-default + "Show video" + SMS OTP). Plan 08.
- No mid-consult modality switching emitter / billing. Plan 09.
- No AI-assisted SOAP / Rx draft from transcript. Plan 10 (deferred).
- No support-staff replay UI. Backend supports it via `requestingRole='support_staff'`; surface lands in a future ops-tools plan.

---

## References

- **Master plan:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 4 LOCKED + Decision 1 sub-decision LOCKED.
- **Plan 02:** every audit table this plan writes to.
- **Plan 04:** `<TextConsultRoom>` extension target.
- **Plan 06:** `emitSystemMessage()` for recording-paused/resumed events.
- **Existing prescription-PDF stack:** `backend/src/services/prescription-service.ts`.

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Drafted; ready for owner review. Hard-blocks on Plans 02 + 04 + 05 + 06.
