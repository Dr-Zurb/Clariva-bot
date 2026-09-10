# Hand-off to `patient-health-hub` (REC5-D12)

Written 2026-08-22 in rec-34. `phh` p3 (“Records read”) consumes this; it does not re-implement it.

## What p5 guarantees

- **A registry exists.** `recording_artifact_index` is the write target when a composition finalises (p1). Historical populate after rec-05 was **0 / 14** ended sessions (`noCompositions`). Live “row within 5 minutes of hangup” is **not measured**. Do not treat the charter 5-minute bound as proven.
- **Availability without a per-row Twilio call.** Doctor timeline: `GET /api/v1/patients/:id/consult-timeline` (`patient-consult-timeline-service.ts`). Replay preflight lists compositions from the index (`getRecordingArtifactsForSession` / `getReplayAvailability`).
- **90-day patient self-serve window and video OTP are unchanged** (REC-D25). Reuse `video-replay-otp-service.ts` (PHH-D3). Do not invent a second OTP.
- **Gap metadata exists** (rec-18 player, rec-19 transcript) on a one-artifact-per-kind model. It is **wrong under multi-composition** — p3 owns that fix. Do not re-derive gap arithmetic in `phh`.
- **Replay notification fires both ways**, including support-staff → patient (rec-30). Doctor-facing channel stays **dashboard-only**.

## What p5 does not build

Any patient-facing surface. No preview, stub, or `/my-health` tab. `phh` p3 owns transcripts and replay for patients.

## Integration points (read these; do not reinvent)

| Concern | Path |
|---------|------|
| Registry | `recording_artifact_index` (migration 056); writer in p1 composition webhook |
| Timeline shape (doctor-only today) | `backend/src/services/patient-consult-timeline-service.ts` |
| Availability preflight | `getReplayAvailability` / `getRecordingArtifactsForSession` |
| Mint | `mintReplayUrl` in `backend/src/services/recording-access-service.ts` |
| OTP (PHH-D3) | `backend/src/services/video-replay-otp-service.ts` |

## Caveats

- **Backfill residue:** 14 ended rooms, zero index rows. Path B (`TRANSCRIPT_AUDIO_FALLBACK_ENABLED`) stays on. REC-D19 is not fully done.
- **`ARCHIVAL_HARD_DELETE_ENABLED` is still `false`.** rec-33 runbook exists; counsel on `058` and two production previews are outstanding.
- **Twilio Composition DELETE leaves source Recordings intact** (`_source_recordings=intact`).
- **Program is not Closed.** Founder smokes and charter metrics #1–#4 are unmeasured.

Linked from [`patient-health-hub/README.md`](../../../13-08-2026/patient-health-hub/README.md) anchors table.
