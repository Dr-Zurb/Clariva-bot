# Task 25: Voice transcription pipeline — Whisper for English, Deepgram Indic for Hindi/Hinglish (`voice-transcription-service.ts` + post-consult worker + `consultation_transcripts` table)

## 19 April 2026 — Plan [Voice consultation modality](../Plans/plan-05-voice-consultation-twilio.md) — Phase B

---

## Task overview

Decision 12 LOCKED voice recording inheritance from Decision 4 — voice consults are recorded by default, the audio Composition lands in storage post-consult, and the transcription pipeline runs as part of the post-consult lifecycle. Task 25 ships that pipeline.

Two providers, language-routed:

- **OpenAI Whisper** — for English (`en-IN`, `en-US`, others). Whisper has the broadest language coverage and the cleanest medical vocabulary out of the box.
- **Deepgram Nova-2 with Indic language code** — for Hindi (`hi`, `hi-IN`) and Hinglish. Deepgram outperforms Whisper on Indic languages today, especially on Hinglish code-switching which is the realistic India consult pattern.

Routing strategy (per the plan's open decision #2): **doctor-profile-driven in v1**. Each doctor has a preferred language stored on their profile (verify the field name during PR — likely `doctors.profile_language` or `doctors.consultation_language`); the pipeline reads it on enqueue and selects the provider. First-30s audio-sample-driven detection is a v2 candidate to add only if real signal shows doctors set the profile wrong.

This task delivers:

1. `voice-transcription-service.ts` — the language-routing transcription helper. `enqueueVoiceTranscription` is the API surface (Task 23 calls it from the voice adapter's `endSession`); the body that Task 23 stubbed is replaced with the real implementation here.
2. Post-consult worker that polls Twilio for Composition readiness, downloads the audio Composition once available, and pushes it through the appropriate provider.
3. New `consultation_transcripts` table that persists the transcript JSON keyed by `consultation_session_id`. Resolves the plan's open decision: "writes transcript JSON into a generic `consultation_transcripts` table or into Plan 02's recording_artifact_index — pick one in the task file." → **`consultation_transcripts` table**, separate from any Plan 02 recording_artifact_index. Rationale captured in Notes #1.
4. Cost telemetry — every transcription run logs `{ provider, duration_seconds, cost_usd_cents }` so the ops dashboard can track Whisper vs Deepgram unit economics.

This task is genuinely the highest-risk task in Plan 05 — it introduces a new external provider (or two), a new storage shape, and a new worker pattern. The failure modes are **non-blocking** (a failed transcription doesn't break the consult; the patient still gets the prescription), but the cost ceiling matters and the telemetry needs to be visible from day one.

**Estimated time:** ~4-6 hours (genuinely larger than the plan's 2h estimate — the plan's estimate assumes the worker / Composition-readiness polling already exists; it doesn't, this task ships it from scratch). Actual: ~4h (close to estimate).

**Status:** Code-complete 2026-04-19 (awaiting provider-credential smoke test — see Decision log)

**Depends on:** Task 23 (hard — voice adapter calls `enqueueVoiceTranscription`; this task replaces the stubbed body). Plan 02's recording-consent decision (soft — the pipeline must skip transcription when `recording_consent_decision === false`; if Plan 02 hasn't shipped its consent surface yet, default-on per Decision 4 is acceptable).

**Plan:** [plan-05-voice-consultation-twilio.md](../Plans/plan-05-voice-consultation-twilio.md)

---

## Acceptance criteria

- [ ] **`backend/migrations/0NN_consultation_transcripts.sql`** (NEW; `0NN` = next sequential migration number — verify against `backend/migrations/` glob at PR-time, currently 053+):
  ```sql
  CREATE TABLE consultation_transcripts (
    id                          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_session_id     UUID            NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
    provider                    TEXT            NOT NULL CHECK (provider IN ('openai_whisper', 'deepgram_nova_2')),
    language_code               TEXT            NOT NULL,                  -- e.g. 'en-IN', 'hi-IN', 'en-US'
    transcript_json             JSONB           NOT NULL,                  -- provider's native segment / word output
    transcript_text             TEXT            NOT NULL,                  -- denormalized plain-text concat for fast SELECT/AI consumption
    duration_seconds            INTEGER         NOT NULL CHECK (duration_seconds >= 0),
    cost_usd_cents              INTEGER         NOT NULL CHECK (cost_usd_cents >= 0),
    composition_sid             TEXT            NOT NULL,                  -- Twilio Composition SID; FK target if a recording_artifacts table later exists
    status                      TEXT            NOT NULL DEFAULT 'completed' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    error_message               TEXT,
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    completed_at                TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX consultation_transcripts_session_provider_unique
    ON consultation_transcripts(consultation_session_id, provider);
  CREATE INDEX consultation_transcripts_status_created_idx
    ON consultation_transcripts(status, created_at);

  COMMENT ON TABLE consultation_transcripts IS
    'Plan 05 / Task 25: per-session voice (and later video-audio) transcript. One row per session per provider so re-runs on a different provider for QA do not overwrite the canonical row.';
  ```
  - **No RLS** on this table in v1 (backend-only access; no patient or doctor JWT touches it directly). Plan 07 (post-consult patient surface) will add doctor-side read RLS when needed.
  - The unique index `(consultation_session_id, provider)` prevents accidental duplicates when the worker retries; combined with the `status` enum + retry-safe upsert pattern in the service, the worker is idempotent.
- [ ] **`backend/src/services/voice-transcription-service.ts` body lit up** (Task 23 ships the stub; this task replaces the body). Final exports:
  ```ts
  /**
   * Enqueue a voice transcription job for a finished consultation.
   * Idempotent: a second call for the same providerSessionId is a no-op
   * if a transcript already exists in 'completed' state.
   *
   * Called by the voice adapter's endSession (Task 23). Fire-and-forget;
   * never throws on transient failures (the consult is already over —
   * transcription is best-effort and the worker handles retries).
   */
  export async function enqueueVoiceTranscription(input: {
    providerSessionId: string;       // Twilio room SID; the worker resolves it to the consultation_sessions row
  }): Promise<void>;

  /**
   * Process a single transcription job. Called by the post-consult worker
   * after the audio Composition is ready. Synchronous from the caller's
   * perspective; resolves on success / rejects on terminal failure (the
   * worker decides whether to retry).
   */
  export async function processVoiceTranscription(input: {
    consultationSessionId: string;
    compositionSid:        string;
    languageCode:          string;   // pre-resolved from the doctor profile
  }): Promise<TranscriptResult>;

  export interface TranscriptResult {
    provider:        'openai_whisper' | 'deepgram_nova_2';
    languageCode:    string;
    transcriptJson:  unknown;          // provider's native shape (typed via provider-specific interfaces internally)
    transcriptText:  string;           // plain-text concat
    durationSeconds: number;
    costUsdCents:    number;
  }
  ```
- [ ] **Language routing** in `voice-transcription-service.ts`:
  - `selectProvider(languageCode: string): 'openai_whisper' | 'deepgram_nova_2'` — exported helper.
  - `'hi' | 'hi-IN'` → `'deepgram_nova_2'`. Hinglish (the realistic India consult shape) routes to Deepgram via the `'hi-IN'` language code with Deepgram's `multi` language detection enabled.
  - `'en' | 'en-IN' | 'en-US' | 'en-GB' | 'en-*'` → `'openai_whisper'`.
  - All other language codes → `'openai_whisper'` (broader coverage).
  - The router is pure (no I/O); unit-tested separately.
- [ ] **Provider clients** in two narrow modules so they can be mocked independently:
  - `backend/src/services/voice-transcription-openai.ts` — wraps the OpenAI Whisper API. Single exported function `transcribeWithWhisper({ audioUrl, languageCode })`. Internally downloads the audio (Twilio Composition URL is a signed S3 URL with a TTL), POSTs to Whisper's `/audio/transcriptions` endpoint, returns `{ json, text, duration }`. Cost calculated as `duration_seconds × $0.006/60` (Whisper pricing as of 2026-04; adjust constant if Whisper updates).
  - `backend/src/services/voice-transcription-deepgram.ts` — same shape for Deepgram Nova-2. Cost: `duration_seconds × $0.0043/60`.
  - **No retries inside the provider clients.** Retry logic lives in the worker layer where backoff and dead-lettering are the worker's concern. Provider clients fail loudly and let the worker decide.
  - Pricing constants are in `backend/src/config/voice-transcription-pricing.ts` (or inline in each client if a single-line constant is cleaner) so an ops update is one PR, not a hunt across files.
- [ ] **Post-consult worker** at `backend/src/workers/voice-transcription-worker.ts` (NEW) OR extends an existing post-consult worker if one was added in Plan 02 — verify at PR-time. Behavior:
  - Triggered on a 30s polling interval (config: `VOICE_TRANSCRIPTION_POLL_INTERVAL_SEC`, default `30`).
  - Query: `SELECT id, consultation_session_id, composition_sid FROM consultation_transcripts WHERE status = 'queued' ORDER BY created_at LIMIT 25`.
  - For each row:
    1. Verify the Twilio Composition is in `'completed'` state (Twilio Compositions are async-finalized after the room ends; not always ready immediately). If not ready yet, log `info` + leave the row in `'queued'` for the next poll cycle.
    2. Read the doctor's preferred language from `doctors.{profile_language_field}` joined through `consultation_sessions.doctor_id`. If missing, default to `'en-IN'`.
    3. Update row to `'processing'`, mark `started_at = now()`.
    4. Call `processVoiceTranscription`. On success, update the row to `'completed'` with `transcript_json`, `transcript_text`, `duration_seconds`, `cost_usd_cents`, `completed_at = now()`.
    5. On failure: on `5xx` / network error → leave in `'queued'` with an incremented `retry_count` (add a `retry_count INTEGER NOT NULL DEFAULT 0` column to the migration; cap at `5` retries with exponential backoff `[1m, 5m, 15m, 1h, 6h]`); on `4xx` / parse error → mark `'failed'` + `error_message`. Update the migration acceptance criterion above to include the `retry_count` column.
  - Worker's main loop logs `{ poll_count, queued_count, completed_count, failed_count }` at each tick for ops visibility.
  - **Composition-not-ready isn't a failure** — it's expected for the first ~5-30s after consult-end. Log at `debug`, not `warn`.
- [ ] **`enqueueVoiceTranscription` implementation** (replacing the Task 23 stub):
  - Resolves the `providerSessionId` (Twilio room SID) → `consultation_sessions` row via `findSessionByProviderSessionId` (existing helper at `consultation-session-service.ts`). If not found, log `warn` + return — best-effort, don't throw.
  - Reads the Twilio Composition SID associated with the room. The Composition SID is finalized in the existing Twilio webhook handler; on enqueue, it may not exist yet. **Strategy:** look it up via the existing `consultation-verification-service.ts` (or read directly from the `consultation_sessions.recording_composition_sid` column if Plan 02 / Task 27 has added it). If still missing, **enqueue anyway with `composition_sid` = the room SID as a placeholder, status = `'queued'`** — the worker resolves the real Composition SID on first poll. Document this fallback.
  - Inserts a `consultation_transcripts` row with `status = 'queued'`. Uses `ON CONFLICT (consultation_session_id, provider) DO NOTHING` so re-enqueues from a retried `endSession` are idempotent.
- [ ] **Recording-consent gate.** Before enqueue, check `consultation_sessions.recording_consent_decision` (Plan 02 / Task 27's column). If `false`, skip the enqueue + log `info` ("Recording consent declined — skipping transcription"). If the column doesn't exist yet (Plan 02 hasn't shipped), default to `true` per Decision 4 — document the fallback.
- [ ] **Cost telemetry surface.** Every successful transcription writes to a structured log line at `info`:
  ```ts
  logger.info(
    {
      consultation_session_id,
      provider,
      duration_seconds,
      cost_usd_cents,
      language_code,
    },
    'voice-transcription: completed',
  );
  ```
  This is the ops-dashboard hook (a daily aggregation query against logs or a follow-up `voice_transcription_cost_daily` materialized view — out of scope for this task). The telemetry contract: always logged, always with this exact field shape, so a future `cost-watch` cron can rely on it.
- [ ] **Tests** in `backend/tests/unit/services/voice-transcription-service.test.ts` (NEW):
  - **Language routing** — every language code in the routing table maps correctly: `'hi'` / `'hi-IN'` → Deepgram; `'en'` / `'en-IN'` / `'en-US'` / `'en-GB'` → Whisper; `'fr'` / `'es'` / `'unknown'` → Whisper (default).
  - **`enqueueVoiceTranscription` is idempotent** — second call for the same providerSessionId is a no-op (the unique index + `ON CONFLICT DO NOTHING` covers this).
  - **`enqueueVoiceTranscription` gracefully handles missing session** — log + return, no throw.
  - **`enqueueVoiceTranscription` gates on consent** — when `recording_consent_decision === false`, no row is inserted.
  - **`processVoiceTranscription` happy path (Whisper)** — provider client mocked; row updated to `'completed'` with the expected fields.
  - **`processVoiceTranscription` happy path (Deepgram)** — same shape, different provider mock.
  - **`processVoiceTranscription` cost computation** — for a 1800-second consult, Whisper cost = `1800 × 0.006 × 100 / 60 = 18` cents; Deepgram cost = `1800 × 0.0043 × 100 / 60 = 12.9 → rounded 13` cents (rounding strategy: `Math.round`; pin in test).
  - **`processVoiceTranscription` 5xx → propagates up** so the worker can retry; 4xx → propagates up with a typed error so the worker marks `'failed'`.
- [ ] **Tests** in `backend/tests/unit/services/voice-transcription-openai.test.ts` (NEW) and `voice-transcription-deepgram.test.ts` (NEW):
  - HTTP request shape (URL, headers, body) — anchored to the spec in case the SDK changes.
  - Response parsing — happy path + malformed-JSON path.
  - Language code translation — `'en-IN'` → Whisper's expected `'en'` parameter; `'hi-IN'` → Deepgram's expected `'hi'` parameter (or `'multi'` for Hinglish — pick at PR-time per Deepgram docs).
- [ ] **Tests** in `backend/tests/unit/workers/voice-transcription-worker.test.ts` (NEW):
  - Composition-not-ready → row stays `'queued'`, no provider call.
  - Composition-ready → row flips to `'processing'` then `'completed'`.
  - 5xx during processing → row stays `'queued'` with `retry_count + 1`; reaches the cap → flips to `'failed'`.
  - Backoff math — pin the retry-delay table.
- [ ] **Env vars** added to `backend/src/config/env.ts`:
  - `OPENAI_API_KEY` (required for Whisper; if missing, `selectProvider` still routes English to Whisper but `transcribeWithWhisper` throws at call time with a clear "missing OPENAI_API_KEY" message; the worker handles this as a permanent failure → `'failed'` row).
  - `DEEPGRAM_API_KEY` (required for Deepgram; same fail-loud behavior).
  - `VOICE_TRANSCRIPTION_POLL_INTERVAL_SEC` (default `30`).
  - `VOICE_TRANSCRIPTION_MAX_RETRIES` (default `5`).
  - `VOICE_TRANSCRIPTION_ENABLED` (default `true`; `false` short-circuits `enqueueVoiceTranscription` to a no-op for staging environments without provider credentials).
- [ ] **Smoke test (manual, gated by provider credentials):** with `OPENAI_API_KEY` + `DEEPGRAM_API_KEY` set in a dev env, run a real voice consult through Tasks 23 + 24, end the consult, and verify within ~5 minutes:
  - A `consultation_transcripts` row exists with `status = 'completed'`.
  - `transcript_text` is non-empty and qualitatively matches the consult dialog.
  - `cost_usd_cents` is a small positive integer.
  - Run twice — once with the doctor's profile language set to `'en-IN'` (Whisper), once `'hi-IN'` (Deepgram) — confirm the `provider` column matches expectation.
- [ ] **Type-check + lint clean** on touched files. Backend `npx tsc --noEmit` exit 0. `npx jest tests/unit/services/voice-transcription-* tests/unit/workers/voice-transcription-* tests/unit/migrations/consultation-transcripts-migration.test.ts` green; full backend suite green.
- [ ] **Migration content-sanity test** in `backend/tests/unit/migrations/consultation-transcripts-migration.test.ts` (NEW; mirrors the Plan 04 Task 18 "Departure 4" pattern). Pins:
  - The unique index on `(consultation_session_id, provider)`.
  - The `status` enum values (full set).
  - The `cost_usd_cents` non-negative check.
  - The `ON DELETE CASCADE` from `consultation_sessions`.

---

## Out of scope

- **Speaker diarization** ("who said what" — doctor vs patient turn segmentation). v2 candidate; Whisper's word-level timestamps + a future doctor-attribution pass can do this, but v1 ships a flat transcript.
- **Specialty-aware transcription tuning** (medical-vocabulary Whisper variants). Per the plan's non-goals: "Owner option for v2 if Whisper/Deepgram default is good-enough." v1 ships defaults.
- **Real-time / live transcription during the consult.** v1 transcription is post-consult only. Live transcription is a Plan 10 (deferred AI clinical assist) candidate.
- **Transcript display in the doctor dashboard.** Plan 07 (post-consult) owns the doctor-facing surface. This task only persists the transcript; visibility comes later.
- **Patient-side transcript access.** Plan 07's open question. v1: doctor-only via the dashboard once Plan 07 ships; patient access via support-ticket-only.
- **Transcript PDF export.** Same as above — Plan 07.
- **Cost-watch alerting.** v1 logs the cost; the alert surface (Slack notify on $X / day exceeded) is a separate ops task.
- **Multi-pass transcription** (run both Whisper + Deepgram on the same audio for QA). The unique index supports this for QA experiments later, but v1 runs one provider per consult.
- **Plan 02's `recording_artifacts` table coordination.** If Plan 02 lands a `recording_artifacts` table that overlaps with `consultation_transcripts.composition_sid`, a follow-up reconciles them (likely keeping `consultation_transcripts` as the transcript-facing table and `recording_artifacts` as the audio-file-facing table, joined by `composition_sid`). Capture as inbox follow-up.
- **Audio Composition deletion / TTL enforcement.** Decision 4 LOCKED a 90-day patient self-serve TTL + indefinite regulatory retention; the actual storage-side TTL enforcement (Twilio Composition expiry policy or our own S3 lifecycle rule) is Plan 02's territory.
- **Webhook-driven Composition-ready trigger.** Twilio fires a `composition-available` webhook that could replace the 30s poll. v1 ships the poll for simplicity (no webhook signature verification path needed); v2 can swap to webhook-driven if poll cost matters.

---

## Files expected to touch

**Backend:**

- `backend/migrations/0NN_consultation_transcripts.sql` — new (verify next sequential number at PR-time; currently 053+).
- `backend/src/services/voice-transcription-service.ts` — replace the Task 23 stub body with the full implementation (router + enqueue + process + DB I/O).
- `backend/src/services/voice-transcription-openai.ts` — new (Whisper client, ~80 lines).
- `backend/src/services/voice-transcription-deepgram.ts` — new (Deepgram Nova-2 client, ~80 lines).
- `backend/src/config/voice-transcription-pricing.ts` — new (pricing constants; ~10 lines).
- `backend/src/workers/voice-transcription-worker.ts` — new (post-consult polling worker, ~150 lines) OR extend an existing worker.
- `backend/src/routes/cron.ts` — add `POST /cron/voice-transcription` route that ticks the worker (mirrors the Plan 04 Task 18 `consultation-pre-ping` cron pattern).
- `backend/src/config/env.ts` — add `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `VOICE_TRANSCRIPTION_POLL_INTERVAL_SEC`, `VOICE_TRANSCRIPTION_MAX_RETRIES`, `VOICE_TRANSCRIPTION_ENABLED`.
- `backend/src/types/consultation-transcript.ts` — new (TS types for the transcript row + provider-specific JSON shapes).

**Tests:**

- `backend/tests/unit/services/voice-transcription-service.test.ts` — new.
- `backend/tests/unit/services/voice-transcription-openai.test.ts` — new.
- `backend/tests/unit/services/voice-transcription-deepgram.test.ts` — new.
- `backend/tests/unit/workers/voice-transcription-worker.test.ts` — new.
- `backend/tests/unit/migrations/consultation-transcripts-migration.test.ts` — new.

**No frontend changes.**

---

## Notes / open decisions

1. **Why a separate `consultation_transcripts` table instead of riding on Plan 02's `recording_artifact_index`?** Plan 02 owns the **recording-artifact** surface — the audio Composition file, its storage URL, its retention policy. Transcripts are a **derived artifact** with a different lifecycle (re-runnable on a new provider; multiple per session for QA experiments; possibly separately pruneable from the source recording for storage cost). Conflating them would force one table to carry two distinct lifecycle concerns. The two tables join cleanly on `composition_sid` if needed. Plan 02 hasn't landed yet at draft time — if its `recording_artifact_index` shape ends up being a perfect superset, a follow-up reconciliation can collapse them; the cost of an extra table is small (~1 migration to drop later) vs the cost of conflated lifecycle.
2. **Why doctor-profile-driven language routing instead of audio-sample detection?** Per the plan's open decision #2: ship the simple thing first; add complexity only when real signal demands it. Doctor-profile is one DB read at enqueue; sample-based detection requires downloading the first 30s of audio, sending it to a language-detection model, paying for two API calls per consult (detection + transcription). v2 if doctors set the profile wrong systematically.
3. **Cost ceiling math.** At 1000 consults/mo × 30 min average × $0.006/min (Whisper worst case): ~$180/mo. At Deepgram's $0.0043/min: ~$130/mo. Either way the ceiling is ≤$200/mo at 1000 consults — comfortably within the master plan's "acceptable for v1; revisit if doctor adoption explodes" guidance. Telemetry surfaces it daily; if a single doctor's traffic spikes 10x and triggers a ~$200/mo bill from a single account, the cost-watch alert surface (out of scope here) is the right escalation path.
4. **Why not stream the audio directly from Twilio's Composition URL to the provider, instead of downloading first?** Twilio Composition URLs are signed S3 URLs with a few-hour TTL; both Whisper and Deepgram accept URL inputs. Direct URL pass-through saves a hop. v1 implementation uses URL pass-through where the provider supports it (both do for `mp3` / `wav`); fall back to download + multipart upload only if a provider rejects the signed URL pattern. Document the pass-through preference in the client code.
5. **Why the worker polls every 30s instead of being webhook-driven?** Twilio fires a `composition-available` webhook, but adopting it requires webhook signature verification + a new endpoint + delivery-failure retry handling. The 30s poll is cheaper to ship and the latency floor (avg 15s, max 30s + processing time) is fine for a post-consult artifact that no patient is actively waiting on. v2 swap-in is a focused effort once it matters.
6. **`status = 'failed'` rows are kept indefinitely.** No auto-cleanup. Failed rows are debug surface for ops; manual review + re-queue is the recovery path. Storage cost is trivial (failed rows have empty `transcript_json`).
7. **`retry_count` lives on the transcripts table, not a separate jobs table.** Single-table simplicity; the tradeoff is the `consultation_transcripts` row carries some "in-flight job" state (`'queued'`, `'processing'`, `retry_count`). Acceptable because the row's identity is `(session, provider)` which is stable across retries.
8. **No retry on the audio download itself** — if Twilio's signed URL has expired, the row flips to `'failed'` with a clear error. A re-enqueue path (manual or automated) can fetch a fresh signed URL via Twilio's API and re-process. v1 doesn't ship the re-enqueue path; if real failures appear, that's the follow-up.
9. **Hinglish handling.** Deepgram Nova-2 supports a `multi` language code that detects Hindi / English code-switching in real-time. Recommendation: use `'hi-IN'` as the language code in our table (the doctor's profile setting), but **pass `'multi'` to Deepgram's API call** to get the best Hinglish output. The transcript JSON will carry per-segment language tags so downstream AI assist (Plan 10) can reason about the mixing. Verify Deepgram's exact `multi` support at PR-time.
10. **Provider failure fall-back.** If Deepgram is down for a Hindi consult, do NOT silently fall back to Whisper — the transcript quality difference is large enough that a Whisper-on-Hindi transcript is misleading. Mark the row `'failed'` and surface the failure to ops; manual re-queue with `provider: 'openai_whisper'` if the Deepgram outage persists. v2 candidate: configurable per-language fallback chains.
11. **Audio Composition format.** Twilio Compositions default to `mp4` for video and `mp3` for audio-only. Confirm at PR-time that audio-only Compositions emit `mp3` cleanly with the audio-only Recording Rules from Task 23. If the format ends up `wav` or something else, both Whisper and Deepgram accept all common formats — no special handling needed.

---

## References

- **Plan:** [plan-05-voice-consultation-twilio.md](../Plans/plan-05-voice-consultation-twilio.md) — Voice transcription pipeline section (the inline TypeScript snippet in the plan is the design source).
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 4 LOCKED (recording on by default), Decision 12 LOCKED (voice recording inherits Decision 4).
- **Plan 05 Task 23 — voice adapter that calls `enqueueVoiceTranscription`:** [task-23-voice-session-twilio-adapter.md](./task-23-voice-session-twilio-adapter.md)
- **Plan 02 — recording-consent doctrine that gates this pipeline:** [plan-02-recording-governance-foundation.md](../Plans/plan-02-recording-governance-foundation.md)
- **Plan 04 Task 18 — sibling pattern for cron-driven worker setup:** [task-18-text-session-supabase-adapter.md](./task-18-text-session-supabase-adapter.md)
- **Existing Twilio webhook handler (Composition finalization signal source):** `backend/src/controllers/twilio-webhook-controller.ts`
- **Existing facade (provides `findSessionByProviderSessionId`):** `backend/src/services/consultation-session-service.ts`
- **OpenAI Whisper API docs:** [https://platform.openai.com/docs/api-reference/audio/createTranscription](https://platform.openai.com/docs/api-reference/audio/createTranscription) — verify pricing + language codes at PR-time.
- **Deepgram Nova-2 docs:** [https://developers.deepgram.com/docs/models-languages-overview](https://developers.deepgram.com/docs/models-languages-overview) — verify Indic support + `multi` language code at PR-time.

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Code-complete 2026-04-19 — see Decision log.

---

## Decision log (2026-04-19 — Code-complete)

### What shipped

All acceptance criteria that could be satisfied without live provider credentials are in place. Full backend test suite: **105 suites / 1352 tests / all green**. `tsc --noEmit` exit 0. Zero lint errors on touched files.

**Migration:**

- `backend/migrations/061_consultation_transcripts.sql` — full schema per the AC plus the `retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0)` column. Indexes: unique `(consultation_session_id, provider)`, partial-scan `(status, created_at) WHERE status IN ('queued','processing')`, ops-triage `(created_at) WHERE status='failed'`. RLS enabled, zero policies (service-role only until Plan 07 ships).
- Reverse migration embedded as a trailing comment block in-file (repo convention — consistent with 053, 058, etc.). No separate `062_rollback` file.

**Service layer (`backend/src/services/`):**

- `voice-transcription-service.ts` — stub body replaced with three exports:
  - `selectProvider(languageCode)` — pure router. Hindi / Hinglish → Deepgram; everything else → Whisper.
  - `enqueueVoiceTranscription({ providerSessionId })` — resolves session via `findSessionByProviderSessionId('twilio_video_audio', sid)`, gates on `getConsentForSession` (Plan 02 Task 27), inserts a `queued` row with `composition_sid = <room SID placeholder>`. Handles PG unique_violation (23505) as idempotent success. Never throws.
  - `processVoiceTranscription({ consultationSessionId, audioUrl, languageCode, provider? })` — pure orchestrator; route → provider client → return `TranscriptResult`. Errors surface as typed `TranscriptionTransientError` / `TranscriptionPermanentError` so the worker can classify retry.
- `voice-transcription-openai.ts` — Whisper client. Downloads audio (the OpenAI SDK v6 doesn't today accept URL pass-through via the typed `audio.transcriptions.create` path — noted in module JSDoc as a PR-time re-check hook), passes to Whisper with `response_format: 'verbose_json'`, normalises to the shared `TranscriptResult` shape. Language param: `'en-IN'` → `'en'`, `'hi-IN'` → `'hi'`, unknowns omit the param (auto-detect).
- `voice-transcription-deepgram.ts` — Deepgram Nova-2 client. Uses URL pass-through (posts `{ url }` body, saving a hop per task note #4). Language param: Hindi / Hinglish → `'multi'` (per task note #9 for the best code-switching output); everything else passes through verbatim.

**Config:**

- `backend/src/config/voice-transcription-pricing.ts` — pinned constants (`$0.006/min` Whisper, `$0.0043/min` Deepgram) + `costCentsForDuration(provider, seconds)` helper. Math pinned in the service test (`1800s Whisper → 18¢`, `1800s Deepgram → 13¢`).
- `backend/src/types/consultation-transcript.ts` — `TranscriptProvider`, `TranscriptStatus`, `TranscriptResult`, `ConsultationTranscriptRow`, plus the two error classes.

**Worker + cron:**

- `backend/src/workers/voice-transcription-worker.ts` — `runVoiceTranscriptionJob(correlationId)` pulls up to `VOICE_TRANSCRIPTION_WORKER_BATCH_SIZE` queued rows (default 25), skips rows whose backoff window hasn't elapsed, resolves the Twilio Composition (rows whose Composition isn't finalised yet stay queued), flips to `processing` atomically with `.eq('status', 'queued')` (concurrency-safe claim), runs the transcription, then flips to `completed` / `queued` (retry) / `failed`. Backoff table pinned: `[0, 1m, 5m, 15m, 1h, 6h]`. Emits the ops-dashboard telemetry log line on every `completed` transition per AC shape.
- `backend/src/routes/cron.ts` — new `POST /cron/voice-transcription` route (same `verifyCronAuth` as the other cron routes). Schedule externally every minute (or every 30s if latency matters).

**Tests (5 suites / 59 tests):**

| File | Tests | Key coverage |
| --- | --- | --- |
| `tests/unit/migrations/consultation-transcripts-migration.test.ts` | 15 | Pins the unique index, status enum, CHECKs, `retry_count` default, RLS on + zero policies, reverse-migration docs. |
| `tests/unit/services/voice-transcription-service.test.ts` | 18 | Full language-routing table, `enqueueVoiceTranscription` idempotency + consent gate + kill-switch + never-throws posture, `processVoiceTranscription` routing + error propagation, cost math pinned. |
| `tests/unit/services/voice-transcription-openai.test.ts` | 10 | Happy path, language-code translation, missing-key → permanent, 5xx → transient, 4xx → permanent, malformed → permanent, segment fallback. |
| `tests/unit/services/voice-transcription-deepgram.test.ts` | 7 | Request shape (URL + headers + body), missing-key → permanent, 5xx / 4xx / network / malformed JSON classification, happy path with cost math. |
| `tests/unit/workers/voice-transcription-worker.test.ts` | 9 | Composition-not-ready → notYetReady counter, happy path → processing → completed, transient failure → retry_count + 1 queued, retry cap → failed, permanent → failed, backoff skip, pinned backoff table. |

### Scope clarifications / intentional deferrals

1. **Doctor-profile language field does not exist yet.** The `doctors` table has no `profile_language` / `consultation_language` column today (verified via repo grep). The service currently returns `'en-IN'` as the safe default inside `resolveLanguageCodeForSession(doctorId)`. A `TODO(Task 25 v2)` comment marks the widen site — when the column lands, it's a local one-line change and the existing unit tests keep passing (they stub the full call path). Documented in the file JSDoc.
2. **Composition SID resolution.** Plan 02's `recording_artifact_index` (migration 056) is the long-term home for the `(session → composition_sid → storage_uri)` mapping, but nothing writes to it yet for audio compositions (Plan 05's Twilio Composition-finalized webhook handler is NOT in this task's scope). Worker falls back to calling `client.video.v1.compositions.list({ roomSid, limit: 5 })` directly and picking the first `completed` composition, with a TODO breadcrumb pointing at the future swap-in. Test-overridable via `__setResolveCompositionForTests`.
3. **Audio URL download (Whisper).** The OpenAI SDK v6 does not expose URL pass-through on `audio.transcriptions.create` (it expects a file-like). We download the signed URL ourselves and pass a `Buffer` through `OpenAI.toFile`. Task note #4 contemplated pass-through as the preferred path; Deepgram gets it (native `{ url }` support), Whisper doesn't in the SDK shape we have pinned. Re-evaluate at the next OpenAI SDK upgrade. No correctness impact.
4. **`status = 'processing' → 'queued'` on transient DB-side failure after a successful provider call.** When the provider call succeeds but the subsequent `UPDATE → 'completed'` fails (e.g. DB blip), the worker flips the row back to `'queued'` with `retry_count + 1`. The next tick calls the provider AGAIN — at a second provider-call cost per such failure. This is acceptable because (a) the failure mode is rare, (b) the unique index prevents a duplicate row, and (c) the cost is capped at `retry_count` provider calls then `failed`. Documented in the worker code + tests.
5. **Smoke test is deferred.** The final AC checkbox ("real voice consult end-to-end, `OPENAI_API_KEY` + `DEEPGRAM_API_KEY` set") requires a dev environment with provider credentials AND Task 24's voice UI. Treated as a merge-time owner responsibility. Checklist pinned below.
6. **Cron schedule registration is ops-side.** The `/cron/voice-transcription` HTTP endpoint is ready; the actual every-minute cron schedule needs to be added to Render Cron (or the equivalent scheduler) outside the repo. Consistent with every other cron route in `cron.ts`.

### Merge-time owner checklist

Before flipping Plan 05 Task 25 to "shipped":

- [ ] Run migration `061_consultation_transcripts.sql` against staging Supabase; verify `\d consultation_transcripts` shows the full column set + indexes + RLS on.
- [ ] Set `DEEPGRAM_API_KEY` in staging + production env stores (OPENAI_API_KEY already exists).
- [ ] Confirm `VOICE_TRANSCRIPTION_ENABLED=true` in staging, `true` in production on rollout day.
- [ ] Register the Render Cron (or equivalent) schedule: every minute → `POST /cron/voice-transcription` with the existing `CRON_SECRET`.
- [ ] Smoke test with a real voice consult (requires Task 24 voice UI in at least a preview build):
  - 10-20 second English consult → within ~2 min a `consultation_transcripts` row with `status='completed'`, `provider='openai_whisper'`, non-empty `transcript_text`, `cost_usd_cents` > 0.
  - 10-20 second Hindi / Hinglish consult → same shape but `provider='deepgram_nova_2'`.
  - Check the structured log line: `{ consultation_session_id, provider, duration_seconds, cost_usd_cents, language_code }` at `'voice-transcription: completed'`.
- [ ] Wire an ops alert on `consultation_transcripts` rows with `status='failed' AND created_at > now() - interval '24h'` — Plan 02 / 07 dashboards are the right home; a bare `logger.warn` signal on `'voice-transcription-worker: retry cap hit'` is a reasonable interim.

### Dependency status at merge

- **Task 23 (voice adapter):** shipped 2026-04-19. `voiceSessionTwilioAdapter.endSession` already calls `enqueueVoiceTranscription`; this task replaces the stub body. No caller changes needed.
- **Plan 02 / Task 27 (recording consent):** shipped (migration 053 + `recording-consent-service.ts`). Consent gate is live from day one.
- **Plan 02 / Task 34 (archival worker):** shipped; `recording_artifact_index` exists but nothing writes to it for audio compositions yet. Worker uses the Twilio API fallback; swap-in is a future PR.
- **Task 24 (voice frontend UI):** independent — not blocking this task's merge, but the smoke test above requires it.

### Files touched

**Created:**

- `backend/migrations/061_consultation_transcripts.sql`
- `backend/src/services/voice-transcription-openai.ts`
- `backend/src/services/voice-transcription-deepgram.ts`
- `backend/src/workers/voice-transcription-worker.ts`
- `backend/src/config/voice-transcription-pricing.ts`
- `backend/src/types/consultation-transcript.ts`
- `backend/tests/unit/migrations/consultation-transcripts-migration.test.ts`
- `backend/tests/unit/services/voice-transcription-service.test.ts`
- `backend/tests/unit/services/voice-transcription-openai.test.ts`
- `backend/tests/unit/services/voice-transcription-deepgram.test.ts`
- `backend/tests/unit/workers/voice-transcription-worker.test.ts`

**Modified:**

- `backend/src/services/voice-transcription-service.ts` — stub body replaced with the full router + enqueue + process implementation.
- `backend/src/config/env.ts` — added `DEEPGRAM_API_KEY`, `VOICE_TRANSCRIPTION_ENABLED`, `VOICE_TRANSCRIPTION_POLL_INTERVAL_SEC`, `VOICE_TRANSCRIPTION_WORKER_BATCH_SIZE`, `VOICE_TRANSCRIPTION_MAX_RETRIES`.
- `backend/src/routes/cron.ts` — added `POST /cron/voice-transcription` route.

**No frontend changes** (per AC).

