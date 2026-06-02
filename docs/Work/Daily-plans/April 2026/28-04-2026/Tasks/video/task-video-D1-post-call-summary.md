# Task video-D1: Post-call summary screen (extends voice `<CallPostCallSummary>`)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch D (T4 post-call) — **M item, ~1.5 days**

---

## Task overview

When the call ends today, both sides see B5's disconnect splash and then... nothing useful. T4.27 ships a structured summary screen visible to both parties:

```
┌─────────────────────────────────────┐
│ Consult ended · 24 minutes          │
│ With Dr. Sharma (Cardiology)        │
├─────────────────────────────────────┤
│ ✓ Recording saved (audio + video)   │
│ ✓ 3 attachments                     │
│ ✓ 2 snapshots taken                 │
│ ✓ Prescription sent                 │
│                                     │
│ [View prescription] [Book follow-up] │
│ [Listen to recording] [Done]        │
└─────────────────────────────────────┘
```

**Coordinate with voice batch** (decision §18) — voice's `<VoicePostCallSummary>` is the same surface; rename to `<CallPostCallSummary>` with `modality: 'voice' | 'video'` variant + extend backend aggregator with video-specific fields (snapshotsCount, recordingHasVideo, peakResolution).

**Estimated time:** ~1.5 days.

**Status:** ✅ **Shipped (2026-05-01)** — Phase 1: video-only modality-aware backend aggregator + frontend component + dual mount (post-call inline + doctor history detail). Voice mount + patient route deferred (see "Audit + scope decision (2026-05-01)" below).

**Depends on:** voice [task-voice-B5](./task-voice-B5-post-call-summary.md) (HARD — extend) — **NOT shipped at execution time;** built greenfield as `<CallPostCallSummary>` with `modality: 'text' | 'voice' | 'video'` from day one so voice can integrate trivially when B5 ships. [task-video-B5](./task-video-B5-disconnect-reason-splash.md) (SOFT — splash mounts BEFORE summary) — **shipped;** integrated.

**Source:** [T4 §T4.27](../../../../Product%20plans/video-consult/plan-t4-video-post-call.md); [decision §18](../Plans/plan-video-consult-selected-features.md#before-sub-batch-d-starts).

---

## Audit + scope decision (2026-05-01)

Execution-time audit found the HARD dep (voice B5 = `<VoicePostCallSummary>`) is **not shipped** in this codebase. There is no existing post-call summary component to rename; D.1 had to build the surface greenfield. Rather than block D.1 indefinitely on voice batch progress, we shipped a modality-aware video-only Phase 1 with the following discipline:

1. **Component is named `<CallPostCallSummary>` from day one** (not `<VideoPostCallSummary>`) — accepts `mountContext: 'post-call' | 'history-detail'` and renders modality-aware UI (snapshots row only for `modality === 'video'`). When voice B5 ships, voice mounts the same component with no rename.
2. **Backend DTO `PostCallSummaryDto` is modality-aware from day one** — `modality: 'text' | 'voice' | 'video'`, `recording.hasVideo` boolean, `snapshotsCount` always present (zero for non-video). No backend changes needed when voice integrates.
3. **Endpoint is `GET /api/v1/consultation/:sessionId/post-call-summary`** — accepts BOTH a doctor's Supabase JWT (verified via `admin.auth.getUser`) AND a scoped patient/extra_participant JWT (verified by matching `session_id` claim). Single endpoint serves all modalities and both caller roles.
4. **Mounted in TWO surfaces (Phase 1):**
   - `<VideoRoom>` after `<CallDisconnectSplash>` dismisses (`mountContext='post-call'`, with "Done" button).
   - `frontend/app/dashboard/appointments/[id]/page.tsx` for doctor history (`mountContext='history-detail'`, no "Done" button).
5. **Out of Phase 1 (deferred — non-blocking, fold into voice batch):**
   - Voice modality mount (waits for B5 to ship `<VoiceRoom>`'s ended phase).
   - Patient-facing route (e.g. `/c/post-call/[appointmentId]`). The current implementation already supports patient JWTs at the API; once a patient post-call surface exists, mounting `<CallPostCallSummary mountContext='post-call'>` there is trivial. This unblocks D4 (patient rating) when product confirms the patient surface.
   - Deep-link CTAs to recording (Plan 07 not shipped) and prescription (deferred to keep Phase 1 atomic; just shows "Sent" / "None sent" pill for now).
   - Peak resolution from E6 (E6 not shipped).

---

## Acceptance criteria

### Build greenfield `<CallPostCallSummary>` (modality-aware from day one)

- [x] **Greenfield component** at `frontend/components/consultation/CallPostCallSummary.tsx` — `modality: 'text' | 'voice' | 'video'` from the DTO; rename-from-voice path skipped (voice B5 not shipped at execution time).
- [x] **Video-specific fields** rendered conditionally (modality === 'video'):
  - `snapshotsCount` (counted via `consultation_messages` where `system_event = 'snapshot_taken'` for this session — single SQL count call) — rendered.
  - `recording.hasVideo` (derived from `getReplayAvailability().hasVideo`) — rendered as part of recording label ("Audio + video recording", "Audio recording", etc.).
  - `peakResolution` — **deferred** (E6 not shipped); omitted from DTO + UI.

### Backend aggregator (greenfield in this task; voice will reuse)

- [x] **Created `backend/src/services/post-call-summary-service.ts`** — single aggregator that:
  - Loads `consultation_sessions` row (validates session exists; returns 404 if not).
  - Counts attachments (`consultation_messages` where `kind = 'attachment'`).
  - Counts snapshots (`consultation_messages` where `system_event = 'snapshot_taken'`).
  - Checks for prescription (`prescriptions` where `consultation_session_id = :id`); returns `prescriptionSent: boolean` + optional `prescriptionId`.
  - Resolves recording status via `getReplayAvailability` (same path B6 / D2 use); maps to `'available' | 'processing' | 'not-recorded' | 'not-available'`.
  - Computes duration from `started_at` / `ended_at`.
  - Resolves counterparty name (patient name from `appointments.patient_name` for doctor caller; doctor name from `auth.users.raw_user_meta_data.full_name` via `admin.auth.admin.getUserById` for patient caller — fallback to email username, then literal "Doctor").
- [x] **Endpoint:** `GET /api/v1/consultation/:sessionId/post-call-summary` — Phase 1 owns the route (voice will reuse).
- [x] **Auth:** route accepts BOTH a doctor's Supabase JWT (verified via `admin.auth.getUser`) AND a scoped patient/extra_participant JWT (verified by matching `session_id` claim — same model as recording playback).

### Mount in `<VideoRoom>` after disconnect

- [x] **Edited `<VideoRoom>`** — `disconnected` status now renders `<CallDisconnectSplash>`; when user dismisses the splash (`splashDismissed = true`), `<CallPostCallSummary mountContext='post-call'>` mounts in the same surface using the existing `recordingSessionId` + `recordingToken` (which is the same scoped JWT the recording flow uses).
- [x] **Reachable from doctor's `dashboard/appointments/[id]`** — `<CallPostCallSummary mountContext='history-detail'>` mounts at the top of the post-consult artifact section for ended sessions.

### CTAs (per source plan) — Phase 1 scope

- [ ] `[View prescription]` → deep-links to existing prescription detail page. **Deferred** (Phase 2). Phase 1 shows "Sent" / "None sent" pill only.
- [ ] `[Book follow-up]` → deep-links to scheduling. **Deferred** (Phase 2 / scheduling integration).
- [ ] `[Listen to recording]` → deep-links to Plan 07 replay. **Deferred** (Plan 07 not shipped). Phase 1 shows recording status pill only.
- [x] `[Done]` → mountContext='post-call' shows "Done" button; click flips `summaryDismissed = true` and reverts `<VideoRoom>` to a generic "Call ended" footer. mountContext='history-detail' renders WITHOUT a Done button (history view is durable; user navigates away normally).

### Manual smoke (deferred to integration testing window)

- [ ] Doctor + patient on different devices: call ends → both see summary within 2s. (Patient surface deferred; only doctor-side post-call mount is live in Phase 1.)
- [ ] Snapshots count is correct (matches C3 captures during the call).
- [ ] Prescription sent in-call shows up as a row.
- [ ] Recording link opens Plan 07 replay (when shipped).
- [x] Summary reachable from `dashboard/appointments/[id]` after the call ends (doctor side).
- [ ] Voice consult parallel summary still renders correctly (modality variant). — **N/A**: voice B5 not shipped; voice mount is the integration point.

### `mode='readonly'`

- [x] Summary IS the readonly post-call view; renders inert (no destructive actions). "Done" button only dismisses; "history-detail" mount has no actions at all.

### General

- [x] Type-check + lint clean (backend tsc clean, backend eslint clean, frontend tsc clean, frontend eslint clean on touched files).
- [x] No console errors (component handles loading / error / success states explicitly).
- [x] No regression on voice post-call summary (voice surface does not exist yet; nothing to regress).
- [x] **24 unit tests** in `backend/tests/unit/services/post-call-summary-service.test.ts` covering validation gate (4), auth (8: patient match/mismatch, extra_participant match/mismatch, doctor match/mismatch, malformed token, doctor-not-on-session), and aggregation (12: duration, attachment+snapshot counts, prescription presence/absence + id, recording-status matrix incl. text-modality / no-consent / processing / not-found / replay-throws, counterparty resolution incl. metadata.full_name / metadata.name / email-username / fallback).

---

## Out of scope

- **Auto-email summary to patient.** Out of scope.
- **Editable summary.** Out of scope; summary is computed from session state.
- **Patient-side rating prompt mounted INSIDE summary.** That's [task-video-D4](./task-video-D4-patient-rating.md) (separate component; mounted alongside).
- **AI-generated summary text.** Out of scope (Plan 10).

---

## Files actually touched (Phase 1, 2026-05-01)

**Frontend:**
- `frontend/components/consultation/CallPostCallSummary.tsx` — **NEW** (~210 LOC; greenfield; modality-aware; mount-context-aware).
- `frontend/components/consultation/VideoRoom.tsx` — edited (`+8` lines: import + summary state + render branch in `disconnected` phase).
- `frontend/app/dashboard/appointments/[id]/page.tsx` — edited (`+10` lines: import + mount block at top of post-consult artifacts).
- `frontend/lib/api.ts` — added `PostCallSummary` interface + `getPostCallSummary()` helper (~80 LOC).

**Backend:**
- `backend/src/services/post-call-summary-service.ts` — **NEW** (~410 LOC; aggregator + dual-branch caller resolver + counterparty resolver).
- `backend/src/controllers/consultation-controller.ts` — added `getPostCallSummaryHandler` (~30 LOC).
- `backend/src/routes/api/v1/consultation.ts` — registered `GET /:sessionId/post-call-summary` route (~6 lines).

**Tests:**
- `backend/tests/unit/services/post-call-summary-service.test.ts` — **NEW** (~720 LOC; 24 tests; green).

**Migrations:** none — uses existing tables (`consultation_sessions`, `consultation_messages`, `prescriptions`, `appointments`, `auth.users`).

---

## Notes / open decisions

1. **Decision §18** — rename voice's `<VoicePostCallSummary>` → `<CallPostCallSummary>` with modality variant. Coordinate ownership at PR time.
2. **Mount as splash + as detail view** — single component; pass an `inSplashMode` prop (smaller, dismissable) vs `inDetailMode` (full).
3. **Snapshot count source** — query `consultation_messages` for the session where `system_subtype = 'snapshot_taken'`. Cheap.
4. **Recording presence** — derived from session metadata; existing voice path handles audio-only; extend `recording_has_video` boolean.
5. **Plan 07 dep softness** — recording link is hidden if Plan 07 hasn't shipped or recording wasn't enabled.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch D](../Plans/plan-video-consult-selected-features.md#sub-batch-d--post-call-3-days)
- **Source item:** [T4 §T4.27](../../../../Product%20plans/video-consult/plan-t4-video-post-call.md)
- **Sibling (voice):** [task-voice-B5](./task-voice-B5-post-call-summary.md)
- **Decision:** [§18 — component rename](../Plans/plan-video-consult-selected-features.md#before-sub-batch-d-starts)
- **Coordination:** [task-video-B5](./task-video-B5-disconnect-reason-splash.md), [task-video-D2](./task-video-D2-recording-transcript-playback.md), [task-video-D4](./task-video-D4-patient-rating.md)

---

**Owner:** TBD
**Created:** 2026-04-30
**Shipped:** 2026-05-01 (Phase 1 — video-only modality-aware backend + frontend + dual mount).
**Status:** ✅ Shipped (Phase 1). Voice mount + patient route + deep-link CTAs deferred to Phase 2 / voice batch / when product confirms patient post-call surface (see "Audit + scope decision (2026-05-01)").
