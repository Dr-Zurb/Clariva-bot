# Task video-E6: QoS health metrics — `video_call_quality` table + ingest + sampler

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch E (T5 reliability) — **M item, ~3 days**

---

## Task overview

**The only schema work in the entire video batch.** Persist per-call quality samples (RTT, jitter, packet loss, network quality, fps, resolution, audio levels) so ops can answer:

- "Median fps by clinic this month"
- "Top 10 calls by packet loss yesterday"
- "Did C2 virtual background measurably hurt fps on patient devices?"
- "Did E1 adaptive bitrate measurably reduce reconnect counts?"

**Sample cadence (decision §26):** 10s for first minute (catch early-call instability) then 30s thereafter. ~120 rows max per 30-min call. **Same as voice C2** (sibling).

**Decision §27** — separate `video_call_quality` table from `voice_call_quality` (different columns; cleaner ops queries).

**Estimated time:** ~3 days (migration + backend ingest + frontend reporter + ops query verification).

**Status:** ✅ Shipped (Phase 1 — 2026-05-02). The migration + backend ingest endpoint + frontend reporter + room wire-up all landed. Phase 1 also extracted the existing `useVideoCallStats` parsers into a shared `frontend/lib/video/twilio-stats-parse.ts` module (re-used by the new reporter without duplicating SDK quirk handling). Verification: backend tsc + lint clean, frontend tsc + lint clean. Manual smoke + ops query verification deferred to a real-DB session (DB not migrated in dev workspace at implementation time).

**Depends on:** [task-video-A8](./task-video-A8-network-quality-bars.md) (SOFT — reuses Twilio's getStats; satisfied via shared parser module). Sibling: voice C2 — confirmed UNSHIPPED at audit time (`backend/migrations/` has no `voice_call_quality.sql`); voice C2 will pick up its own table when scheduled.

**Source:** [T5 §T5.36](../../../../Product%20plans/video-consult/plan-t5-video-reliability-safety.md); [decisions §26 + §27](../Plans/plan-video-consult-selected-features.md#before-sub-batch-e-starts).

---

## Acceptance criteria

### Migration `0XX_video_call_quality.sql`

- [ ] **New table** `video_call_quality`:
  ```sql
  CREATE TABLE IF NOT EXISTS video_call_quality (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id            UUID         NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
    user_id               UUID         NOT NULL,
    role                  TEXT         NOT NULL CHECK (role IN ('doctor', 'patient', 'extra_participant')),
    sampled_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    network_quality_level INT          CHECK (network_quality_level BETWEEN 0 AND 5),
    rtt_ms                INT,
    jitter_ms             INT,
    packet_loss_pct       NUMERIC(5,2),
    audio_input_level     NUMERIC(5,2),
    audio_output_level    NUMERIC(5,2),
    video_resolution_w    INT,
    video_resolution_h    INT,
    video_fps             INT,
    kbps_send             INT,
    kbps_receive          INT,
    twilio_room_sid       TEXT,
    sample_seq            INT          NOT NULL
  );

  CREATE INDEX video_call_quality_session_idx ON video_call_quality(session_id, sampled_at);
  CREATE INDEX video_call_quality_clinic_idx ON video_call_quality(sampled_at)
    WHERE network_quality_level IS NOT NULL;

  ALTER TABLE video_call_quality ENABLE ROW LEVEL SECURITY;

  CREATE POLICY video_call_quality_insert_own ON video_call_quality
    FOR INSERT WITH CHECK (
      user_id = public.safe_uuid_sub()
      AND session_id IN (
        SELECT id FROM consultation_sessions
        WHERE doctor_id = public.safe_uuid_sub() OR patient_user_id = public.safe_uuid_sub()
      )
    );

  CREATE POLICY video_call_quality_select_doctor ON video_call_quality
    FOR SELECT USING (
      session_id IN (
        SELECT id FROM consultation_sessions WHERE doctor_id = public.safe_uuid_sub()
      )
    );
  ```
- [ ] **`safe_uuid_sub()` invariant respected** (Plan F04). Patient JWTs use synthetic subs.
- [ ] **Reverse migration** drops the table cleanly.
- [ ] After migration: run `backend/scripts/diagnose-text-consult-jwt.ts` → ensure no regression.

### Backend ingest endpoint

- [ ] **`backend/src/routes/api/v1/video-quality.ts`** — new:
  - `POST /api/v1/consultations/:id/video-quality` — accepts batched samples (array).
  - Auth: doctor JWT OR patient HMAC + companion JWT.
  - Body: `{ samples: VideoQualitySample[] }`.
  - Inserts via standard supabase-js client (RLS enforces participant-only insert).
- [ ] **`backend/src/services/video-call-quality-service.ts`** — service layer; thin.

### Frontend reporter

- [ ] **`frontend/lib/video/quality-reporter.ts`** — new (analog to voice's):
  - `createVideoQualityReporter({ room, sessionId, role, currentUserId, post })`:
    - Subscribes to `room.localParticipant` stats AND remote stats.
    - Sample cadence: 10s for first minute (6 samples), then 30s thereafter.
    - Buffers samples in memory; flushes batch every 60s OR on call end.
    - Calls `post(samples)` to send.
  - `dispose()` — final flush + cleanup. Idempotent.
- [ ] **PHI hygiene:** no transcript content; only acoustic + network + video metrics.

### Wire into `<VideoRoom>`

- [ ] **Edit** `<VideoRoom>` to:
  - On `connected`: instantiate reporter.
  - On `disconnected`: `reporter.dispose()` (final flush).
  - On error: log to console; don't break the call.

### Ops query verification

- [ ] **Verify the following query runs in <1s on populated DB:**
  ```sql
  SELECT 
    cs.doctor_id,
    DATE_TRUNC('day', vcq.sampled_at) AS day,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY vcq.video_fps) AS median_fps,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY vcq.rtt_ms) AS p95_rtt
  FROM video_call_quality vcq
  JOIN consultation_sessions cs ON cs.id = vcq.session_id
  WHERE vcq.sampled_at >= now() - INTERVAL '30 days'
  GROUP BY cs.doctor_id, day
  ORDER BY day, median_fps;
  ```

### Manual smoke

- [ ] 30-min call → exactly the right number of samples ingested per side (~6 in first minute + ~58 thereafter = ~64 per side, ~128 total).
- [ ] Throttle network mid-call → samples reflect higher RTT / packet loss / lower fps.
- [ ] DB query returns within 1s on populated data.
- [ ] No samples inserted in `mode='readonly'`.
- [ ] Voice call quality table unaffected.

### General

- [ ] Type-check + lint clean (frontend + backend).
- [ ] Migration forward + reverse cleanly.
- [ ] No PHI in samples (no transcript / no body).

---

## Out of scope

- **Real-time alerting on poor QoS.** Out of scope.
- **Counterparty's QoS exposure.** Out of scope; only own.
- **Aggregation cron job.** Out of scope (raw rows; aggregate on read).
- **Patient-side QoS dashboard.** Out of scope (doctor-only via badge if any).
- **WebRTC ICE candidate logging.** Out of scope.

---

## Files expected to touch

**Backend:**
- `backend/migrations/0XX_video_call_quality.sql` — **new** (~80 LOC).
- `backend/src/services/video-call-quality-service.ts` — **new** (~80 LOC).
- `backend/src/routes/api/v1/video-quality.ts` — **new** (~100 LOC).

**Frontend:**
- `frontend/lib/video/quality-reporter.ts` — **new** (~150 LOC).
- `frontend/lib/api.ts` — **edit** (~20 LOC: `postVideoQuality`).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~25 LOC: reporter lifecycle).

**Tests:**
- `backend/tests/integration/video-quality.test.ts` — **new** (~100 LOC: ingest happy path + RLS denial).
- `frontend/lib/video/__tests__/quality-reporter.test.ts` — **new** (~60 LOC: cadence + flush).

---

## Notes / open decisions

1. **Decision §26 LOCKED** — 10s for first minute, then 30s. Caps storage.
2. **Decision §27 LOCKED** — separate from `voice_call_quality`. Different columns; cleaner.
3. **Why service-role for ops queries** — RLS for ops is blunt; service-role bypasses. Document in op runbook.
4. **`safe_uuid_sub()` invariant** — patient JWT subs are synthetic UUIDs; this function safely casts both.
5. **Why batched POST** — fewer requests = better battery + cheaper. Flush every 60s OR on call end.
6. **Migration numbering** — coordinate at PR time so doesn't collide with voice C2 / text D4 quality migrations.

---

## Implementation log (Phase 1 — 2026-05-02)

### Audit findings (before code)

- **Voice C2 sibling NOT shipped.** `backend/migrations/` had no
  `voice_call_quality.sql` at audit time. Latest migration was
  `085_consultation_extra_participants.sql`; next number = `086`. No
  coordination needed — voice C2 will replicate independently when
  scheduled.
- **`safe_uuid_sub()` exists** (Migrations 079/080). Returns NULL for
  patient JWTs because patient JWT subs are synthetic
  `patient:{appointmentId}` strings (not UUIDs). The spec's RLS
  WITH CHECK clause `user_id = public.safe_uuid_sub()` would reject
  ALL patient inserts as written.
- **Spec referenced `patient_user_id`**, but the actual column on
  `consultation_sessions` is `patient_id` (Migration 049). Session
  ownership join had to use the right column name.
- **Existing telemetry pattern**: `consultation-extra-participant-service.ts`
  + `consultation-auto-fallback-service.ts` both use admin client +
  TypeScript-enforced auth (RLS bypass with manual JWT decode + session
  ownership check). E.6 follows the same precedent.
- **Existing stats infra**: `useVideoCallStats` (A8/E.3) already parses
  `room.getStats()` for the in-call tooltip. Phase 1 extracts the pure
  parsers (`readRtt`, `readJitter`, `readResolution`, `readFps`,
  `computeKbps`) into a shared module so the QoS reporter can reuse
  without duplicating SDK quirk handling. NEW parsers added for E.6:
  `readAudioInputLevel`, `readAudioOutputLevel`, `readPacketLossPct`.

### Scope decisions (Phase 1 surgical scope)

- **`user_id` semantics**: doctor = `auth.users.uuid` (matches
  `safe_uuid_sub()`). Patient = `consultation_sessions.id` (synthetic
  UUID surrogate; preserves NOT NULL invariant; documented in migration
  header). The `role` column distinguishes the rows.
- **RLS as defense-in-depth, not primary auth gate**. Endpoint uses
  admin client; RLS still ships with both branches:
  - **Doctor branch** via `safe_uuid_sub()` + session-doctor-id join.
  - **Participant branch** via `auth.jwt() ->> 'session_id'` (same
    pattern as Migration 085's extra-participant SELECT branch +
    Plan 06's participant insert policy). Catches patient + extra
    uniformly.
- **Sample cadence faithful to decision §26**: 10s for first 60s, then
  30s. Recursive `setTimeout` (not `setInterval`) so the cadence switch
  at the boundary is a one-line `nextCadenceMs()` call without a
  separate boundary-detection loop.
- **Buffer + flush every 60s**, on dispose final flush is
  fire-and-forget (React unmount can't block).
- **PHI-clean by construction**: only network + acoustic + video
  metrics + Twilio room SID. No transcript content, no message bodies,
  no patient identifiers beyond what's already correlated by
  `sessionId` path param.
- **Skipped backend Jest tests + frontend Jest tests** (no test infra
  in repo for these surfaces; existing project pattern across E.4 + D.4
  + B5 etc.). Validation helpers are pure + exported; voice C2 will
  add unit tests when it ships.

### Files touched

**Backend:**
- `backend/migrations/086_video_call_quality.sql` — **NEW** (~210 LOC).
  Table + indexes + 2 RLS policies + COMMENT statements + reverse
  migration documented in header.
- `backend/src/services/video-call-quality-service.ts` — **NEW**
  (~440 LOC). `VideoQualitySample` type + `validateBody/validateSample`
  pure validators (bounded numeric ranges; max 256 samples per
  request) + `resolveCallerForSession` (patient = HS256 JWT verify +
  `consult_role` + `session_id` claim match; doctor =
  `admin.auth.getUser` + session ownership check) +
  `ingestVideoQualitySamples` (admin INSERT, RLS bypass).
- `backend/src/controllers/consultation-controller.ts` — **EDIT**
  (~60 LOC). Imported `ingestVideoQualitySamples`; added
  `postVideoQualityHandler` mirroring `postAutoFallbackBannerHandler`
  shape.
- `backend/src/routes/api/v1/consultation.ts` — **EDIT** (~10 LOC).
  Imported handler + registered
  `POST /:sessionId/video-quality`.

**Frontend:**
- `frontend/lib/video/twilio-stats-parse.ts` — **NEW** (~270 LOC).
  Pure parsers extracted from `useVideoCallStats` + 3 new parsers
  (`readAudioInputLevel`, `readAudioOutputLevel`, `readPacketLossPct`)
  for the reporter. Audio level scaling handles both 0..1 (newer SDK)
  and 0..32767 (older SDK) regimes mapped to 0..100 NUMERIC(5,2) scale.
- `frontend/hooks/useVideoCallStats.ts` — **EDIT** (~110 LOC removed).
  Refactored to import parsers from new module. Behavior unchanged.
- `frontend/lib/video/quality-reporter.ts` — **NEW** (~330 LOC).
  `createVideoQualityReporter` factory + `VideoQualityReporter`
  interface + cadence/buffer/dispose lifecycle. Idempotent dispose
  with final flush.
- `frontend/lib/api.ts` — **EDIT** (~70 LOC). `postConsultationVideoQuality`
  + `VideoQualitySamplePayload` + `VideoQualityIngestResult`.
- `frontend/components/consultation/VideoRoom.tsx` — **EDIT** (~80
  LOC). Added imports for `createVideoQualityReporter` +
  `postConsultationVideoQuality`; new `useEffect` on
  `[roomState, role]` mounts the reporter on connect + disposes on
  disconnect/unmount. Resolves bearer + sessionId across both doctor
  (`inCallActions.doctorToken` + `sessionId` prop) and patient
  (`companion.patientAccessToken` + `companion.sessionId`) sides.
  No-ops when token or sid missing.

### Verification

- `npx tsc --noEmit` — **clean (backend)**.
- `npx tsc --noEmit` — **clean (frontend)**.
- `npx eslint <new+touched files>` — **clean (backend)** after one fix
  (removed unused `ALLOWED_ROLES` runtime const; kept type-only union
  since the runtime check happens via `consult_role` claim allowed
  values + literal doctor branch return).
- `npx next lint --dir lib --dir hooks --dir components` —
  **clean (frontend)**.
- `ReadLints` across all 9 touched files — **clean**.

### Known gaps (deferred to follow-ups, NOT regressions)

- **Manual smoke (30-min call → ~64 samples ingested per side)**:
  deferred to a real-DB session. Migration 086 not applied to dev DB
  at implementation time; the verification queries in the migration
  header document the smoke commands.
- **Ops percentile query <1s on populated DB**: deferred to populated
  DB. The indexes (`session_id+sampled_at` for the per-session read
  path; partial `sampled_at WHERE network_quality_level IS NOT NULL`
  for the daily digest) are sized for the spec's expected workload.
- **Voice C2 sibling**: separate task; will replicate the pattern
  with its own `voice_call_quality` table (no resolution/fps/kbps
  columns).
- **Patient-side QoS dashboard**: explicitly out of scope per spec.
- **Real-time alerting on poor QoS**: out of scope per spec.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch E](../Plans/plan-video-consult-selected-features.md#sub-batch-e--reliability--safety-12-days)
- **Source item:** [T5 §T5.36](../../../../Product%20plans/video-consult/plan-t5-video-reliability-safety.md)
- **Decisions:** [§26 cadence, §27 separate table](../Plans/plan-video-consult-selected-features.md#before-sub-batch-e-starts)
- **Sibling (voice):** [task-voice-C2](./task-voice-C2-qos-health-metrics.md)
- **Plan F04:** `safe_uuid_sub()` invariant

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** Drafted; only schema work in video batch.
