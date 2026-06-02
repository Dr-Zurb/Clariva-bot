# Video T3 — Clinical workflow (8 items, ~10 days)

## Snapshot capture, freeze-frame annotations, screen share, virtual background, captions, three-way

> **Roadmap reference:** [plan-00-video-consult-roadmap.md](./plan-00-video-consult-roadmap.md). T3 is where video pulls ahead of voice for clinical use — items here are unique to video and provide visual examination + documentation capability that voice fundamentally cannot.

---

## Goal

Add the clinical-workflow features that justify "video over voice" for the doctor's actual practice — visual examination tooling (snapshot, freeze-frame, annotations), shared-context tooling (screen share, three-way), and patient-environment tooling (virtual background for clinic privacy). Several items have hard dependencies on Plan 10 (AI clinical assist) and the platform-wide attachments pipeline.

**~10 dev-days** if shipped in full; most batches will pick the snapshot + freeze-frame + screen-share + virtual-background subset (~6 days) and defer the rest.

---

## Status

`Drafted` — **`[SELECTED 2026-04-29]`** — **full tier** (all 8 items). Dependencies (Plan 10, schema, vendor) unchanged — sequencing at commit-start.

---

## What's in scope (8 items)

> Every row below is **`[SELECTED 2026-04-29]`**.

| # | Item | Effort | Dep |
|---|------|--------|-----|
| T3.19 | **`[SELECTED 2026-04-29]`** **Background-noise suppression** — Krisp / RNNoise. Sibling of voice T3.19; same vendor decision; same per-doctor opt-in. | M (~3 days) | Vendor decision (Krisp budget). |
| T3.20 | **`[SELECTED 2026-04-29]`** **Virtual background / blur** — MediaPipe Selfie Segmentation OR Twilio's official background plugin (`@twilio/video-processors`). Patient picks: `Off` / `Blur` / `Replace with image`. | M (~3 days) | none for blur; image picker for replace. |
| T3.21 | **`[SELECTED 2026-04-29]`** **Snapshot capture** — `<canvas>` frame extraction from remote/own video tile; uploads to signed-URL storage; attaches to clinical record (via `consultation_messages` attachment OR new `clinical_snapshots` table). Both sides can capture; PHI-gated; on-screen "Snapshot taken" notice. | M (~3 days) | Plan 02 / 08 consent (snapshots ARE clinical artifacts). |
| T3.22 | **`[SELECTED 2026-04-29]`** **Freeze-frame + annotations** — pause the remote video on a single frame; doctor draws on top (point/circle/text); annotated frame saved like T3.21. | M (~3 days) | T3.21. |
| T3.23 | **`[SELECTED 2026-04-29]`** **Screen share** — doctor shares screen (lab results, Rx PDF, education); patient shares screen (wound photo, document). New tile in the layout for the share track. | M (~3 days) | Twilio screen-share track support (verify). |
| T3.24 | **`[SELECTED 2026-04-29]`** **In-call quick actions** — buttons for `Send Rx` / `Order labs` / `Schedule follow-up` / `Request consent` rendered in the controls bar; each opens a panel that interfaces with existing services. | L (~5 days) | Existing Rx + scheduling services; rest behind separate plans. |
| T3.25 | **`[SELECTED 2026-04-29]`** **Live captions** — real-time speech-to-text overlay on the video tile (own + remote), via Plan 10's transcription pipeline. Companion chat shows full transcript. | L (~5 days) | **Hard dep on Plan 10.** |
| T3.26 | **`[SELECTED 2026-04-29]`** **Three-way call (interpreter / family member)** — invite a third Twilio participant via per-call invite link; new tile in layout. | L (~5 days) | Schema work (multi-participant RLS); UI complexity. |

---

## Non-goals (explicitly NOT in T3)

- **Vitals input panel** — out of scope (not video-specific; could go in T2 or a separate clinical plan).
- **Doctor-side AI assist surface** — owned by Plan 10.
- **Live language translation** (vs captions) — out of scope.
- **Recording artifact post-processing** (e.g. snapshot from recording) — Plan 07 owns.

---

## Why each item is in T3

- **T3.19 noise suppression** — same value as voice. Doctor in noisy clinic; patient in noisy home. Krisp delivers; per-doctor opt-in respects clinic preferences.
- **T3.20 virtual background** — patients in cluttered/private rooms (kitchen, bedroom) want privacy. Doctors want to project clinic brand consistency. Blur is the v1 minimum; image-replace is the patient-loving v2.
- **T3.21 snapshot** — the clinical-record killer feature. Today: doctor either takes a screenshot themselves (PHI risk; lives in personal device gallery) or asks patient to send a photo (round-trip; 5 min lost). Snapshot-during-call is one-click and lands directly in the chart.
- **T3.22 freeze-frame + annotations** — derm and ortho doctors want to point at a specific spot on the patient's body. Today they describe it verbally ("a bit higher, no, lower…"). Pause + annotate is one minute of work + a permanent visual reference.
- **T3.23 screen share** — bidirectional. Doctor shows: lab results, X-rays, Rx, education slides. Patient shows: wound photos already on phone, insurance docs, prescription bottles. Plan 06 attachment pipeline overlaps but screen-share is realtime; complementary not redundant.
- **T3.24 in-call quick actions** — doctors today open a separate browser tab for Rx / scheduling. In-call quick action panels keep them in flow.
- **T3.25 live captions** — accessibility (hearing-impaired patients), language clarity (non-native speakers), recording-artifact value (searchable transcript).
- **T3.26 three-way** — interpreter for non-native-speaking patient; family member for elderly patient; partner for OB-GYN consults. Real but lower-frequency need.

---

## Implementation contract per item

### T3.19 — Background-noise suppression

- Same Twilio Krisp plugin path as voice T3.19. If voice T3.19 ships first, video reuses the per-doctor toggle UI.
- Decision §9 (voice batch): Krisp behind per-doctor opt-in, defaulted ON. Same decision applies here.

### T3.20 — Virtual background / blur

```
Two plugin options:
  1. @twilio/video-processors (Twilio's official, GaussianBlur + VirtualBackground processors)
  2. MediaPipe Selfie Segmentation + custom canvas pipeline

Recommendation: Twilio's official — supported, performant, GPU-accelerated.

UI:
  <VirtualBackgroundPicker>
    [Off] [Blur (light)] [Blur (heavy)] [Image: clinic backdrop] [Image: neutral]

Per-device persistence (localStorage 'video-bg-preference').
CPU cost note: blur adds 5-15% CPU on a mid-tier laptop; consider auto-disabling
on low-end devices.
```

### T3.21 — Snapshot capture

```
frontend/lib/video/snapshot-capture.ts (NEW)

export async function captureSnapshot(
  videoEl: HTMLVideoElement,
  meta: { sessionId, capturerId, capturerRole, target: 'self' | 'remote' }
): Promise<{ url: string }> {
  // Draw video frame onto canvas
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  canvas.getContext('2d')?.drawImage(videoEl, 0, 0);

  // Convert to Blob
  const blob: Blob = await new Promise(r => canvas.toBlob(b => r(b!), 'image/jpeg', 0.92));

  // Upload to signed-URL storage (consult-attachments bucket)
  const url = await uploadSnapshot(blob, meta);

  // Attach to consultation_messages as a system+attachment row OR
  // insert into new clinical_snapshots table (decision pending)
  await insertSnapshotMessage({ ...meta, url });

  // Companion chat shows: "[👤 Patient] snapshot taken at 12:34"
  return { url };
}

UI:
  - Snapshot button in controls bar.
  - On click: brief flash overlay + "Snapshot taken" toast.
  - On both sides: companion-chat system message + thumbnail attached.
  - PHI gating: snapshot is a clinical artifact; respects Plan 02 consent (if
    patient declined recording, snapshot is BLOCKED unless re-consented).
```

- **Decision needed:** snapshot lives in `consultation_messages` (reuses chat attachment surface) OR new `clinical_snapshots` table (cleaner separation). Recommendation: `consultation_messages` for v1; migrate to dedicated table if snapshot count per consult routinely exceeds ~10.

### T3.22 — Freeze-frame + annotations

```
Two-stage flow:
  1. Doctor clicks "Freeze frame" → captures a snapshot via T3.21 path AND
     pauses the remote video display (keeps streaming under the hood).
  2. <AnnotationCanvas> overlays the frozen image:
     Tools: pen, circle, text, undo, clear.
     Save → re-uploads annotated image; replaces snapshot URL.
  3. Resume → unfreezes display; annotated snapshot remains in chart.

System message in chat: "Dr. Sharma annotated a snapshot at 12:34"
```

- Both sides can freeze; only the freezer can annotate. Other side sees the frozen frame too (Realtime sync).

### T3.23 — Screen share

```ts
const startScreenShare = async () => {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  const screenTrack = new Twilio.LocalVideoTrack(stream.getVideoTracks()[0], {
    name: 'screen',
  });
  await room.localParticipant.publishTrack(screenTrack);
  emitSystemMessage({ system_subtype: 'screen_share_started', metadata: { sharer_id, sharer_role } });
};

// Layout: when ANY participant publishes a track named 'screen', layout
// auto-flips to "screen-sharing" mode:
//   - Screen track full-canvas (left).
//   - Remote camera + self camera as small thumbnails (right).
// On stop: layout reverts to user's preferred T2.14 layout.
```

- Plan 06 enum: `screen_share_started` and `screen_share_stopped` (new system_subtypes).
- Patient-side: same button; same flow. Patient sharing wound photos / docs is a major use case.
- Browser support: `getDisplayMedia` is universally supported on desktop; mobile is limited (Chrome Android 89+ only; iOS Safari = no support; document degradation).

### T3.24 — In-call quick actions

```
Controls-bar dropdown opens a panel for each:

[Rx]      → opens existing Rx-builder in a side panel; on send, attached to
            consultation_messages and to patient's chart.
[Labs]    → opens lab-order panel (Order panel must exist; out of scope to
            build it here).
[Schedule] → opens follow-up scheduling panel; on confirm, creates appointment
             and posts a chat message with the scheduled time.
[Consent] → opens patient-consent request panel (extends Plan 02 / 08).

Effort is large (~5 days) because each panel is a real workflow — not a button.
v1 ship: Rx only (which exists); flag the rest for follow-up plans.
```

### T3.25 — Live captions

```
Hard dep: Plan 10's transcription pipeline must surface partial-utterance
events via Realtime (or WebSocket).

Frontend:
  <CaptionsOverlay>
    - Subscribed to Realtime broadcast of partial transcripts per speaker.
    - Renders bottom-overlay text on each tile (own captions on self tile,
      remote captions on remote tile).
    - Per-speaker debounce: 200 ms.
    - Toggle: Captions on/off in controls bar.
    - Persisted per-device.

Companion chat:
  - Full transcript appended as a system message stream (one row per finalized
    utterance, NOT per partial).

Plan 06 enum: 'caption_chunk' (cross-modality with voice; voice T3.18 also
needs it).

Privacy:
  - Captions can be turned off (default off in v1; opt-in to avoid surprising
    patients).
  - PHI in transcript is a Plan 10 concern.
```

### T3.26 — Three-way call

```
New flow:
  1. Doctor clicks "Invite participant" → enters phone/email of interpreter
     or family member.
  2. Backend mints a one-time HMAC token for that participant; sends them
     a join link.
  3. Third participant joins via the same /consult/join page; treated as
     'observer' or 'participant' role.
  4. Layout flips to gallery (3 tiles).

Schema work:
  - consultation_sessions.additional_participants JSONB (or separate
    consultation_session_participants table)
  - RLS: third participant can read messages but cannot send (or can; decision needed)

UI:
  - Video tiles: 3-up gallery.
  - Caller-card overlay shows all 3 names.
  - Companion chat: 3-way; messages from third participant clearly labeled.

This item is the most-deferred — schema + RLS + UI complexity is real.
```

---

## Acceptance criteria (one block per item)

- [ ] **T3.19** — same as voice T3.19 (which see).
- [ ] **T3.20** — Off / Blur / Replace works on desktop Chrome + Safari + Firefox; patient can pick at any time mid-call; CPU cost documented; degraded gracefully on low-end devices.
- [ ] **T3.21** — snapshot button captures current frame within 200 ms; uploads + attaches to chart + posts system message; both sides can capture; PHI consent gating respected.
- [ ] **T3.22** — freeze pauses the remote display within 500 ms; annotations save with the snapshot; resume restores live video.
- [ ] **T3.23** — screen-share track publishes within 1 s; layout auto-flips; stop reverts; works on desktop; gracefully degrades on iOS Safari (button hidden) with documented fallback (use Plan 06 attachment upload).
- [ ] **T3.24** — Rx panel works end-to-end; other quick actions are flagged TODO with stub UIs.
- [ ] **T3.25** — captions appear within 1.5 s of speech; per-speaker; toggle works; full transcript ends up in chat; OFF by default.
- [ ] **T3.26** — third participant joins via invite link; 3-up layout renders; messaging surface accommodates 3 senders.

---

## Files expected to touch

**Frontend (new):**

- `frontend/components/consultation/VirtualBackgroundPicker.tsx` — T3.20.
- `frontend/components/consultation/SnapshotPreview.tsx` — T3.21.
- `frontend/components/consultation/AnnotationCanvas.tsx` — T3.22.
- `frontend/components/consultation/ScreenShareTile.tsx` — T3.23.
- `frontend/components/consultation/QuickActionsBar.tsx` — T3.24.
- `frontend/components/consultation/CaptionsOverlay.tsx` — T3.25.
- `frontend/components/consultation/InviteParticipantModal.tsx` — T3.26.
- `frontend/lib/video/virtual-background.ts` — T3.20.
- `frontend/lib/video/snapshot-capture.ts` — T3.21 + T3.22.

**Frontend (extend):**

- `frontend/components/consultation/VideoRoom.tsx` — every item touches this; major restructure for T3.23 (screen-share layout) and T3.26 (multi-tile).

**Backend (new):**

- `backend/src/services/snapshot-service.ts` — T3.21 (signed-URL upload + insert).
- `backend/src/services/screen-share-service.ts` — T3.23 (only if backend tracking needed; otherwise frontend-only).
- (Plan 10 owns) caption-streaming infrastructure — T3.25.
- (multi-participant) `backend/src/services/consultation-participant-service.ts` — T3.26.

**Schema:**

- Possibly `clinical_snapshots` table — T3.21 (decision flagged; v1 reuses `consultation_messages`).
- `consultation_sessions.additional_participants` JSONB OR new join table — T3.26.

**Plan 06 enum extensions (multiple new values):**

- `'screen_share_started'`, `'screen_share_stopped'` — T3.23.
- `'snapshot_taken'`, `'snapshot_annotated'` — T3.21 + T3.22.
- `'caption_chunk'` — T3.25 (cross-modality with voice T3.18).
- `'participant_joined'`, `'participant_left'` — T3.26.

**Vendor:**

- `@twilio/video-processors` (frontend, T3.20) — Twilio's official background plugin.
- `@twilio/krisp-audio-plugin` (frontend, T3.19) — same as voice.

---

## Open questions / decisions

1. **Snapshot storage model** — `consultation_messages` attachment vs `clinical_snapshots` table. Recommendation: messages for v1; revisit if snapshot count routinely > 10/consult.
2. **Snapshot consent** — does T3.21 require fresh consent every snapshot, or does the session-level recording consent cover it? Recommendation: session-level consent covers it; surface "Snapshot taken — added to your record" notice for transparency.
3. **Annotation tooling depth** — pen + circle + text in v1; richer (arrow, ruler, color picker) deferred. Recommendation: ship the minimum 3 tools and iterate.
4. **Screen share permission model** — `getDisplayMedia` requires user gesture and OS-level confirmation. No way around it; document.
5. **Captions language** — auto-detect via Plan 10's transcription pipeline OR force `patient.locale`? Recommendation: per-speaker auto-detect; fall back to `patient.locale`.
6. **Three-way RLS** — read-only third participant or full participant? Recommendation: full participant for interpreters; consider read-only mode for observers.
7. **Krisp + Virtual Background CPU stack** — running both on a mid-tier phone may exceed CPU budget; document.

---

## References

- [plan-00-video-consult-roadmap.md](./plan-00-video-consult-roadmap.md)
- [plan-t3-voice-clinical-workflow.md](../voice-consult/plan-t3-voice-clinical-workflow.md) — T3.19 sibling.
- [plan-06-companion-text-channel.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-06-companion-text-channel.md) — system-message enum extensions.
- [plan-02-recording-consent.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-02-recording-consent.md) — snapshot consent gating.
- Plan 10 (AI clinical assist) — captions hard dep.
- `@twilio/video-processors` — virtual background.
- `@twilio/krisp-audio-plugin` — noise suppression.
- W3C `getDisplayMedia` — screen share.

---

**Owner:** TBD
**Created:** 2026-04-29
**Last updated:** 2026-04-29 — all T3 items **`[SELECTED 2026-04-29]`**.
**Status:** Drafted + **`[SELECTED 2026-04-29]`** — full tier (8 / 8 items).
