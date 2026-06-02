# Video T4 — Post-call (4 items, ~3 days)

## Post-call summary, recording + transcript playback, snapshot review, patient rating

> **Roadmap reference:** [plan-00-video-consult-roadmap.md](./plan-00-video-consult-roadmap.md). T4 closes the loop after the call ends. Most items are siblings of voice T4 with video-specific additions (snapshots gallery, video-playback player).

---

## Goal

After a video consult ends, both sides should:

- See a clean summary of what happened (duration, outcome, recording status, snapshots, Rx, follow-up).
- Be able to replay the consult recording (with transcript when Plan 10 ships).
- (Doctor) review and confirm-attach the snapshots taken during the call to the clinical record.
- (Patient) rate the consult and leave optional feedback.

**~3 dev-days.** Most items reuse voice T4 components with `modality='video'` variant.

---

## Status

`Drafted` — **`[SELECTED 2026-04-29]`** — **full tier** (all 4 items). T4.29 remains gated on T3.21 at implementation time.

---

## What's in scope (4 items)

> Every row below is **`[SELECTED 2026-04-29]`**.

| # | Item | Effort | Dep |
|---|------|--------|-----|
| T4.27 | **`[SELECTED 2026-04-29]`** **Post-call summary screen** — duration · disconnect reason · recording status · attachments + snapshots count · Rx sent badge · CTAs (Listen / Watch / Book follow-up). Sibling of voice T4.25; same backend aggregation endpoint extended with video fields. | M (~1.5 days) | A9 (or voice A9) disconnect classifier; T3.21 snapshots count if shipped. |
| T4.28 | **`[SELECTED 2026-04-29]`** **Recording + transcript playback** — video player (HTML5 `<video controls>`) with optional transcript sidebar (when Plan 10 ships). Reuses voice T4.28 player path; extends with video-track support + transcript scroll-sync. | M (~1 day) | Plan 07 (recording infrastructure); Plan 10 (transcript) — both soft. |
| T4.29 | **`[SELECTED 2026-04-29]`** **Snapshot review-and-attach (doctor only)** — gallery view of all snapshots taken during the call; doctor can keep / discard / annotate-more / attach-to-EHR-section. | M (~1 day) | T3.21 snapshot capture must have shipped. |
| T4.30 | **`[SELECTED 2026-04-29]`** **Patient rating + free-text feedback** — 1–5 stars + optional text; persists to existing service-reviews surface. Sibling of voice T4.26 (deferred there); ship here if/when service-reviews integration is required. | S (~4h) | Existing service-reviews surface. |

---

## Non-goals (explicitly NOT in T4)

- **Auto-emailed summary to patient.** Out of scope; could be a follow-up.
- **Doctor SOAP-note draft.** Owned by Plan 10.
- **Recording editing / clipping.** Plan 07 owns.
- **Recording sharing with third parties.** Out of scope.
- **Patient-facing transcript editing.** Out of scope.

---

## Why each item is in T4

- **T4.27 summary** — without it, the call ends and both sides are dumped to the dashboard with no context. Summary closes the loop; references are findable in `/appointments/:id` for the patient and in the doctor's chart.
- **T4.28 recording + transcript playback** — Plan 07 + 10 ship the data; T4.28 surfaces it. Doctors review-and-correct; patients re-watch instructions.
- **T4.29 snapshot review** — snapshots taken during the rush of a call need a calm review pass. Doctor decides which go in the chart and which were exploratory.
- **T4.30 rating** — service-reviews already exists for clinic ratings; this routes per-consult feedback to the right surface for QA.

---

## Implementation contract per item

### T4.27 — Post-call summary screen

```
Reuse voice T4.25 / B5 backend aggregation:
  GET /api/v1/consultations/:id/post-call-summary

Extend the DTO to include video-specific fields:
  - snapshotsCount: number      (from consultation_messages where snapshot)
  - recordingHasVideo: boolean  (from recordings.has_video flag, Plan 07)
  - peakResolution: string      (from video_call_quality, T5.36)

Frontend: <CallPostCallSummary modality='video'>
  - Same component as voice (rename voice's <VoicePostCallSummary> →
    <CallPostCallSummary> with modality variant).
  - Adds snapshot thumbnail strip when modality === 'video' && snapshotsCount > 0.
  - "Watch recording" CTA (vs voice's "Listen") when video recording available.

Mount in two places (decision §8 from voice batch):
  - Post-call splash (after T2.13 disconnect splash).
  - History detail at /appointments/:id.
```

### T4.28 — Recording + transcript playback

```
Reuse voice B6 <RecordingPlaybackPlayer>:
  - <audio> element if recording is audio-only.
  - <video> element if recording has video.

Extension: transcript sidebar (when Plan 10 ships):
  - Right sidebar: scrollable list of utterances with timestamps.
  - Click an utterance → seeks the video player to that timestamp.
  - Active utterance highlighted as playback progresses (scroll-sync).

Doctor download: same as voice (download MP4 file; filename pattern).
Patient: stream-only (no download).
```

### T4.29 — Snapshot review-and-attach (doctor only)

```
New <SnapshotReviewPanel>:
  - Lists all snapshots from the consult in a grid.
  - For each: thumbnail · timestamp · "captured by" (doctor/patient) · annotations.
  - Actions per snapshot:
    [Keep] — confirms it's part of the chart.
    [Discard] — soft-deletes (kept for audit; hidden from chart).
    [Annotate more] — opens T3.22 annotation canvas.
    [Add to section…] — picks an EHR section to attach to (problem list, exam, plan).

Mounted on:
  - Post-call summary (T4.27) for the doctor side.
  - Chart-view at /patients/:id/consults/:sessionId for retrospective review.

Patient side: no snapshot review surface in v1 (snapshots are clinical records).
```

### T4.30 — Patient rating + feedback

```
Renders inside post-call summary (patient mount):
  - 1–5 stars under "How was your consult?"
  - Optional textarea: "What worked well? What could improve?"
  - Submit → POSTs to existing service-reviews service.
  - Skip → also acceptable; no nag.

Doctor side: receives no inline notification of patient rating; visible in
service-reviews dashboard.

Decision: rating is per-consult, attached to the appointment_id. Feeds into
clinic average rating but doesn't expose individual scores to other patients.
```

---

## Acceptance criteria

- [ ] **T4.27** — summary appears after disconnect splash; shows correct duration, snapshots count, recording status; reachable from `/appointments/:id` for both sides.
- [ ] **T4.28** — video recording plays end-to-end with controls; transcript sidebar (if Plan 10 shipped) scroll-syncs; doctor can download; patient can only stream.
- [ ] **T4.29** — doctor sees all snapshots in a grid; keep/discard/annotate-more works; "Add to section" persists to EHR.
- [ ] **T4.30** — patient can rate + leave feedback; persisted to service-reviews; submission acknowledged with thank-you.
- [ ] No regression on voice post-call summary (shared component must work for both modalities).
- [ ] Frontend type-check + lint clean.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/CallPostCallSummary.tsx` — **rename voice's `<VoicePostCallSummary>`** + add modality variant.
- `frontend/components/consultation/RecordingPlaybackPlayer.tsx` — **extend voice B6** with video-track + transcript sidebar.
- `frontend/components/consultation/SnapshotReviewPanel.tsx` — **new**, T4.29.
- `frontend/components/consultation/PatientRatingForm.tsx` — **new**, T4.30.
- `frontend/lib/api.ts` — **extend** with snapshot list + EHR-attach endpoints.

**Backend:**

- `backend/src/services/post-call-summary-service.ts` — **extend** voice's with video fields (snapshots count, peak resolution).
- `backend/src/routes/api/v1/snapshots.ts` — **new**, T4.29 (list / discard / attach).
- (Plan 10 owns) transcript playback API — T4.28 sidebar.
- (existing service-reviews) — T4.30 reuses.

**Schema:**

- `clinical_snapshots.discarded_at TIMESTAMPTZ NULL` if T3.21 went with the dedicated table; otherwise `consultation_messages.snapshot_status` as a metadata field.

**No new migrations specific to T4** (extends T3.21 schema if T3.21 added one).

---

## Open questions / decisions

1. **Combined component for voice + video summary** — recommended; rename `<VoicePostCallSummary>` to `<CallPostCallSummary>` with modality variant. Coordinate with voice batch ownership.
2. **Snapshot "Add to section" UX** — radio-list of EHR sections vs free-text section name? Recommendation: radio-list of canonical sections (Subjective, Objective, Assessment, Plan, Attachments).
3. **Patient rating — is it required?** Skipping is acceptable.
4. **Recording auto-fetch on summary mount?** — yes, but degraded if Plan 07 not shipped (placeholder).
5. **Snapshot patient visibility** — patients can see snapshots they took; cannot see snapshots doctor took (clinical-record). Decision flagged.

---

## References

- [plan-00-video-consult-roadmap.md](./plan-00-video-consult-roadmap.md)
- [plan-t4-voice-post-call.md](../voice-consult/plan-t4-voice-post-call.md) — siblings T4.25 + T4.28.
- [plan-07-recording-replay-and-history.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-07-recording-replay-and-history.md) — recording playback dep.
- Plan 10 (AI clinical assist) — transcript dep for T4.28 sidebar.
- Existing service-reviews service — T4.30.

---

**Owner:** TBD
**Created:** 2026-04-29
**Last updated:** 2026-04-29 — all T4 items **`[SELECTED 2026-04-29]`**.
**Status:** Drafted + **`[SELECTED 2026-04-29]`** — full tier (4 / 4 items).
