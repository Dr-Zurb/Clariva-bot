# Task voice-C2: QoS health metrics — `voice_call_quality` table + 30s sampling + ingest

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch C (production-grade) — **M item, ~3 days (incl. migration)**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

**The only schema work in the entire voice batch.** Persist per-call quality samples (RTT, jitter, packet loss, network quality level, `audioInputLevel`, `audioOutputLevel`) so ops can answer:

- "Median RTT by clinic this month"
- "Top 10 calls by packet loss yesterday"
- "Has T3.19 noise suppression measurably improved patient-side audio level?"

**Sample cadence (decision §13):** 10s for the first minute (catch early-call instability) then 30s thereafter. ~120 rows max per 30-min call.

**Estimated time:** ~3 days (migration ~1h; backend ingest endpoint ~6h; frontend reporter ~6h; testing + ops query verification ~1 day).

**Status:** Done (2026-05-20).

**Depends on:** [task-voice-A4](./task-voice-A4-network-quality-bars.md) — soft (reuses Twilio's getStats).

**Source:** [T5 §T5.33](../../../../Product%20plans/voice-consult/plan-t5-voice-reliability-safety.md); [decision §13](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-c-starts).

---

## Acceptance criteria

### Migration `105_voice_call_quality.sql`

- [x] **New table** `voice_call_quality`:
  ```sql
  CREATE TABLE IF NOT EXISTS voice_call_quality (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id            UUID         NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
    user_id               UUID         NOT NULL,
    role                  TEXT         NOT NULL CHECK (role IN ('doctor', 'patient')),
    sampled_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    network_quality_level INT          CHECK (network_quality_level BETWEEN 0 AND 5),
    rtt_ms                INT,
    jitter_ms             INT,
    packet_loss_pct       NUMERIC(5,2),
    audio_input_level     NUMERIC(5,2),
    audio_output_level    NUMERIC(5,2),
    twilio_room_sid       TEXT,
    sample_seq            INT          NOT NULL  -- 0-indexed sample # within this user-session
  );

  CREATE INDEX IF NOT EXISTS voice_call_quality_session_idx ON voice_call_quality(session_id, sampled_at);
  CREATE INDEX IF NOT EXISTS voice_call_quality_clinic_idx ON voice_call_quality(sampled_at)
    WHERE network_quality_level IS NOT NULL;

  ALTER TABLE voice_call_quality ENABLE ROW LEVEL SECURITY;

  -- Insert: only the participant themselves (own role / own user_id) can insert
  CREATE POLICY voice_call_quality_insert_own ON voice_call_quality
    FOR INSERT
    WITH CHECK (
      user_id = public.safe_uuid_sub()
      AND session_id IN (
        SELECT id FROM consultation_sessions
        WHERE doctor_id = public.safe_uuid_sub() OR patient_user_id = public.safe_uuid_sub()
      )
    );

  -- Select: doctors can read their own session rows; ops via service role only
  CREATE POLICY voice_call_quality_select_doctor ON voice_call_quality
    FOR SELECT
    USING (
      session_id IN (
        SELECT id FROM consultation_sessions WHERE doctor_id = public.safe_uuid_sub()
      )
    );
  ```
- [x] **`safe_uuid_sub()` invariant** respected (Plan F04). Patient JWTs use synthetic subs; safe_uuid_sub handles both.
- [x] **Reverse migration** drops the table cleanly. (Documented inline in the migration footer; same idempotent DROP-IF-EXISTS shape used by the video sibling Migration 086.)

### Backend ingest endpoint

- [x] **Backend route** — registered as `POST /api/v1/consultation/:sessionId/voice-quality` on `backend/src/routes/api/v1/consultation.ts` (mirrors video sibling Migration 086 / E6 placement instead of a standalone `voice-quality.ts` — consistent with the rest of the consultation-scoped endpoints):
  - Accepts batched samples (array of QoS rows).
  - Auth: doctor JWT OR patient HMAC + companion JWT (same as text-token; service layer routes on `consult_role` claim).
  - Body: `{ samples: VoiceQualitySample[] }` where `VoiceQualitySample` matches the table columns.
  - Inserts via admin client (RLS bypass; defense-in-depth RLS policies remain on the table — same precedent as `consultation-extra-participant-service.ts` / video-quality service).
- [x] **`backend/src/services/voice-call-quality-service.ts`** — service layer with `validateSample`, `validateBody`, `resolveCallerForSession`, `ingestVoiceQualitySamples`. Mirrors the video sibling line-for-line minus the video-only columns.

### Frontend reporter

- [x] **`frontend/lib/voice/quality-reporter.ts`** — new:
  - `createVoiceQualityReporter({ room, sessionId, role, poster })`:
    - Reads `room.getStats()` + `room.localParticipant.networkQualityLevel` per tick.
    - Sample cadence: 10s for first minute (6 samples), then 30s thereafter.
    - Buffers samples in memory; flushes batch every 60s OR on call end.
    - Calls `poster(samples)` to send; restores on POST failure.
  - `dispose()` — final flush + cleanup. Idempotent.
  - Reuses `frontend/lib/video/twilio-stats-parse.ts` parsers (audio metrics are identical regardless of whether a video track is also published).
- [x] **PHI hygiene:** no transcript content; only acoustic + network metrics.

### Wire into `<VoiceConsultRoom>`

- [x] **Edit** to:
  - On call connected (and once chat / recording auth is ready): instantiate `createVoiceQualityReporter({...})`.
  - On call disconnected (effect cleanup or component unmount): `reporter.dispose()` (final flush).
  - On error: dev-mode `console.warn`; never break the call.

### Doctor-only QoS badge in caller-card (optional v1)

- [ ] **Deferred follow-up:** decision §13 leaves this optional; table + endpoint already support it. Will land as a small follow-up task if/when the doctor caller-card grows the badge.

### Ops query verification

- [ ] **(Operator-time)** Verify the following query runs in <1s on a populated DB:
  ```sql
  SELECT 
    cs.doctor_id,
    DATE_TRUNC('day', vcq.sampled_at) AS day,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY vcq.rtt_ms) AS median_rtt
  FROM voice_call_quality vcq
  JOIN consultation_sessions cs ON cs.id = vcq.session_id
  WHERE vcq.sampled_at >= now() - INTERVAL '30 days'
  GROUP BY cs.doctor_id, day
  ORDER BY day, median_rtt;
  ```
- [ ] **(Operator-time)** If slow, add the appropriate index (the migration includes a baseline; flag for op-time tuning).

### Manual smoke

- [ ] **(Operator-time)** 30-min call → exactly the right number of samples ingested per side (~6 in first minute + ~58 thereafter = ~64 per side, ~128 total).
- [ ] **(Operator-time)** Throttle network mid-call → samples reflect higher RTT / packet loss.
- [ ] **(Operator-time)** DB query above returns within 1s on populated data.
- [x] No samples inserted in `mode='readonly'` — the reporter mount effect early-returns when `isReadonly` is true.

### General

- [x] Type-check + lint clean (frontend + backend) — backend `tsc --noEmit` clean; frontend `tsc --noEmit` introduces zero new errors (the single pre-existing `as const` error in `VoiceConsultRoom.tsx` is unrelated to this task).
- [x] Migration forward + reverse cleanly — idempotent `CREATE TABLE/INDEX/POLICY IF NOT EXISTS` + drop-and-recreate policies; reverse migration documented in the migration footer.
- [x] No PHI in samples (no transcript / no body) — sample shape is acoustic + network only; explicit docstring in the reporter.

---

## Out of scope

- **Real-time alerting on poor QoS.** Out of scope.
- **Counterparty's QoS.** Out of scope; only own.
- **Aggregation cron job.** Out of scope (raw rows; aggregate on read).
- **Patient-side QoS dashboard.** Decision §13: doctor-only for v1.
- **WebRTC ICE candidate logging.** Out of scope.

---

## Files expected to touch

**Backend:**

- `backend/migrations/105_voice_call_quality.sql` — **new** (~240 LOC w/ documentation).
- `backend/src/services/voice-call-quality-service.ts` — **new** (~430 LOC, mirrors video sibling).
- `backend/src/controllers/consultation-controller.ts` — **edit** (~30 LOC: `postVoiceQualityHandler`).
- `backend/src/routes/api/v1/consultation.ts` — **edit** (~10 LOC: register `POST /:sessionId/voice-quality`). Note: spec called for a separate `voice-quality.ts` file, but registering on the consultation router matches the video sibling and the existing voice routes (`/start-voice`, `/:sessionId/voice-token`).

**Frontend:**

- `frontend/lib/voice/quality-reporter.ts` — **new** (~290 LOC, reuses `lib/video/twilio-stats-parse.ts`).
- `frontend/lib/api.ts` — **edit** (~70 LOC: `postConsultationVoiceQuality` + envelope types).
- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edit** (~85 LOC: reporter lifecycle effect + imports).

**Tests:**

- `backend/tests/unit/services/voice-call-quality-service.test.ts` — **new** (22 cases: validation matrix). Passes.
- `backend/tests/integration/api/voice-quality.test.ts` — **new** (skip-gated under `VOICE_QUALITY_INTEGRATION_TEST=1`; doctor-branch happy path + 401/400 cases).
- `frontend/lib/voice/__tests__/quality-reporter.test.ts` — **new** (8 cases: cadence + flush + retry + dispose-idempotency). Passes.

---

## Notes / open decisions

1. **Decision §13 LOCKED** — 10s for first minute, then 30s. ~120 rows per 30-min call. Caps storage.
2. **Why service-role for ops queries** — RLS for ops is blunt; service-role bypasses. Document in op runbook.
3. **`safe_uuid_sub()` invariant** — patient JWT subs are synthetic UUIDs; this function safely casts both.
4. **Why batched POST** — fewer requests = better battery + cheaper. Flush every 60s OR on call end.
5. **No video columns** — voice-only batch. Video can extend with `video_resolution_avg`, `frames_dropped_pct` etc. later.
6. **Doctor-only QoS badge** — flagged as optional; full UI in a follow-up if needed.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch C](../Plans/plan-voice-consult-selected-features.md#sub-batch-c--production-grade-17-days)
- **Source item:** [T5 §T5.33](../../../../Product%20plans/voice-consult/plan-t5-voice-reliability-safety.md)
- **Decision:** [§13 — sample cadence](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-c-starts).
- **Sibling:** text consult D4 (chat quality telemetry) — same pattern, different table.

---

**Owner:** TBD
**Created:** 2026-04-29
**Completed:** 2026-05-20
**Status:** Done — code complete + unit tests green. Operator-time items (manual smoke, ops query <1s on populated DB, optional doctor-side QoS badge) remain checklisted for the operator pass / a follow-up.
