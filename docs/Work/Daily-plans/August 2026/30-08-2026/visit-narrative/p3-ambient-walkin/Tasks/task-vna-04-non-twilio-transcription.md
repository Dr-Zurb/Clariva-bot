# Task vna-04: Transcription for a non-Twilio audio source

> **Filename:** `task-vna-04-non-twilio-transcription.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).
> **Model: Opus (max thinking). Auto must not run this task.**
> ⛔ **BLOCKED — needs `vna-03` green.** §0 is expected to STOP.

---

## 📋 Task Overview

Teach the transcription path to accept a stored audio object as input, not only a Twilio Composition media URL, and to write the resulting transcript into `consultation_transcripts` without altering that table.

The whole task is a constraint-satisfaction problem against a shipped schema. `consultation_transcripts` was designed around Twilio: `composition_sid` is `TEXT NOT NULL`, and there is a unique index on `(consultation_session_id, provider)` — **one transcript row per session per provider**. Room audio has no composition, and may arrive in more than one segment. Resolve that honestly rather than by inventing a placeholder and hoping.

**Program / Phase:** visit-narrative · Phase 3 (ambient walk-in)
**Batch:** [`plan-p3-visit-narrative-ambient-walkin-batch.md`](../plan-p3-visit-narrative-ambient-walkin-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-visit-narrative-ambient-walkin.md`](./EXECUTION-ORDER-p3-visit-narrative-ambient-walkin.md)
**Estimated Time:** ~6 hours
**Status:** ⛔ **BLOCKED — not started**
**Completed:** —

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — widens the transcription **input** only

**Current State:** (checked against the codebase, 2026-08-31)
- ✅ **What exists:** `voice-transcription-service.ts` + `voice-transcription-worker.ts`. `enqueueVoiceTranscription` inserts a `queued` row; `processVoiceTranscription` does the work. Input today is the **S3 media URL from `compositions(sid).fetch().media_url`**.
- ✅ **What exists:** a placeholder convention already in the code — the service inserts with `composition_sid` = the **room SID** because the composition webhook may not have fired yet, then reconciles. So a placeholder is precedented, but the existing one is Twilio-shaped and reconciles to a real SID. Room audio never will.
- ✅ **What exists:** `061_consultation_transcripts.sql` — `consultation_session_id` FK `NOT NULL` CASCADE, `provider` CHECK (`openai_whisper` | `deepgram_nova_2`), `language_code`, `transcript_json`, `transcript_text`, `duration_seconds`, `cost_usd_cents`, `composition_sid TEXT NOT NULL`, `status` (`queued|processing|completed|failed`), `retry_count`, `error_message`. RLS enabled, service-role only, no policies. **Unique `(consultation_session_id, provider)`.**
- ✅ **What exists:** the retry ladder `[1m, 5m, 15m, 1h, 6h]` (VN-DL-8's basis) and `consultation-transcripts` bucket (`068`).
- ✅ **What exists:** the stored, registered room-audio object from `vna-03`.
- ❌ **What's missing:** any input path that is not a Twilio composition. Any answer for `composition_sid` when there is no composition. Any place to put a second capture segment for one session.
- ⚠️ **Notes — VNA-Q3 is answered here.** Three candidate shapes, all with costs: concatenate segments before insert (**loses per-segment spans, and spans are exactly what `vnt-02` verifies against** — likely disqualifying), relax the unique index (ALTERs a shipped table — Scope Guard says no), or reject a second segment at the route with a clear error. **Rejecting is the honest default**; silently overwriting a prior segment is the one outcome that must not happen.
- ⚠️ **Notes:** `provider` CHECK means room audio goes to Whisper or Deepgram — **never a browser STT API** (VNA-D7). Both are existing processors, so no new processor disclosure is added by this task; the *purpose* still traces back to `vna-01`'s consent wording.

**Scope Guard:**
- Expected files touched: ≤ 6.
- **No ALTER of `consultation_transcripts`.** If the constraints cannot be satisfied without one, **STOP and surface** — that is a schema decision, not an implementation detail.
- **The Twilio composition branch is byte-unchanged.** Review the diff for it explicitly.
- No change to the retry ladder, the worker's scheduling, or `recording_artifact_index`.
- No AI extraction here (`vna-05` reuses `vnt-02`'s route). No streaming STT (VNA-D6).
- Any expansion requires explicit approval.

**Reference Documentation:**
- Batch VNA-Q3, VNA-D5, VNA-D6, VNA-D7
- [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md) — VN-DL-8 (post-hoc), VN-DL-10
- [Phase 2 `vnt-02`](../../p2-transcript-amendment/Tasks/task-vnt-02-extraction-pass.md) — the consumer of `transcript_text` and its spans
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 0. Pre-flight — **expected to STOP**
- [ ] 0.1 `vna-03` gate green (a registered room-audio object exists)? If not → **STOP**.
- [ ] 0.2 Read `061` in full, plus `voice-transcription-service.ts` and its worker, before designing. Write down the exact constraints that bind: `composition_sid NOT NULL`, `UNIQUE (consultation_session_id, provider)`, `provider` CHECK.
- [ ] 0.3 Answer **VNA-Q3 in writing in this file** before touching the insert path.
- [ ] 0.4 Confirm no ALTER of `consultation_transcripts` is needed under that answer. If one is → **STOP and surface**.

### 1. Input widening
- [ ] 1.1 The service accepts a stored-object source in addition to a Twilio composition media URL. One function, two source kinds — not a forked copy of the pipeline.
- [ ] 1.2 The Twilio branch's behaviour is identical, including the room-SID placeholder reconciliation. Prove it by diff review and by the existing suites.
- [ ] 1.3 Provider selection stays inside the existing CHECK. No new provider, no new SDK.
- [ ] 1.4 Source of truth for "where is the audio" is the `recording_artifact_index` URI convention (`'<bucket>/<path>'`), not a second path format.

### 2. The schema constraints
- [ ] 2.1 `composition_sid` for room audio: a documented, self-describing convention that cannot be mistaken for a Twilio SID, recorded in the service **and** in `DB_SCHEMA.md`.
- [ ] 2.2 Per the VNA-Q3 answer, the multi-segment case is **either** supported **or** rejected at the route with a clear error. **A silent overwrite of a prior segment is a defect**, and `vnt-02`'s span verification is why (spans that point into replaced text are worse than no spans).
- [ ] 2.3 Idempotency: re-enqueueing the same object does not create a duplicate row or a duplicate charge.

### 3. Failure paths
- [ ] 3.1 A failed transcription leaves the audio object **registered and governed** (VNA-D4) and the visit usable. Existing `status` + `retry_count` + `error_message` ladder, not a new mechanism.
- [ ] 3.2 A permanently failed transcription is visible to the doctor as "no transcript", never as an empty amendment offer.
- [ ] 3.3 Cost is recorded in `cost_usd_cents` as the Twilio path does — this phase's per-minute spend is new and must be measurable.

### 4. Verification & Testing
- [ ] 4.1 A stored room-audio object produces a `completed` transcript row with a valid provider, with `consultation_transcripts` unaltered.
- [ ] 4.2 The Twilio path is regression-free — existing transcription suites green, diff reviewed.
- [ ] 4.3 Multi-segment behaves exactly as VNA-Q3 answered — asserted, including the no-silent-overwrite case.
- [ ] 4.4 Idempotency test (2.3).
- [ ] 4.5 Failure-path tests (3.1, 3.2).
- [ ] 4.6 No PHI in logs — no transcript text, no audio, no patient identifiers beyond ids.
- [ ] 4.7 `npx tsc --noEmit` + lint clean; suites green.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: backend/src/services/voice-transcription-service.ts     (input widening only)
UPDATE: backend/src/workers/voice-transcription-worker.ts       (only if enqueue shape changes)
UPDATE: docs/Reference/engineering/architecture/DB_SCHEMA.md     (the composition_sid convention)
CREATE: tests — room-audio happy path, Twilio regression, multi-segment, idempotency, failure
```

**Existing Code Status:**
- ✅ `backend/migrations/061_consultation_transcripts.sql` — EXISTS. **Not altered.**
- ✅ `backend/src/services/voice-transcription-service.ts` — EXISTS. Widened, not forked.
- ✅ `backend/migrations/068_consultation_transcripts_bucket.sql` — EXISTS. **Not modified.**

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **One pipeline, two inputs.** A forked copy of the transcription path is how the two drift and one stops getting fixes.
- **A placeholder must be unmistakable.** Anything that could be read as a Twilio SID will eventually be read as one.
- **Silent overwrite is the forbidden outcome** (2.2). Rejecting a second segment is acceptable; losing the first is not.
- **Post-hoc stays post-hoc** (VN-DL-8 / VNA-D6). This task does not shorten the loop or stream.
- **Never a browser STT API** (VNA-D7). Whisper / Deepgram only, inside the existing CHECK.
- No PHI in logs — the transcript text in particular.

**DO NOT include:** code, pseudo-code, function signatures, or DDL in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — writes transcript text (PHI) into `consultation_transcripts`.
  - [ ] **RLS verified?** `061`'s posture unchanged: service-role only, no policies.
- [ ] **Any PHI in logs?** Must be **no**.
- [ ] **External API or AI call?** **Yes** — the existing STT providers, for audio from a new source. No new processor; the new *purpose* is disclosed via `vna-01`'s consent wording.
- [ ] **Retention / deletion impact?** **Yes** — a transcript of a physical consultation. Note the inherited residual: **no production path deletes a `consultation_transcripts` row.** `vna-06` is where that becomes a gate rather than a footnote, because room audio has no teleconsult mandate to justify indefinite retention.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [ ] Room audio produces a transcript row **without altering `consultation_transcripts`**.
- [ ] VNA-Q3 is answered in writing and the code matches the answer.
- [ ] No silent overwrite of a prior segment — asserted.
- [ ] The Twilio composition branch is byte-unchanged; existing suites green.
- [ ] `composition_sid` convention documented in the service and `DB_SCHEMA.md`, and unmistakable for a real SID.
- [ ] Failure and idempotency paths tested.
- [ ] Cost recorded per transcript.
- [ ] Type-check + lint clean.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

⟨fill as executed⟩

---

## 📝 Notes

- `061`'s header explains why transcripts were kept out of `recording_artifact_index`: different lifecycle — derived, re-runnable, independently pruneable. That reasoning is the reason this task can widen an input without touching retention: the **audio** is the governed artifact (`vna-03`), and the transcript is derived from it.
- `061`'s header states the unique index's purpose precisely: it is the **idempotency contract** ("re-enqueue from a retry updates the existing row") and it exists so a **QA re-run on a different provider** — Whisper vs Deepgram on the same session — does not overwrite the canonical row. Provider is the *only* sanctioned reason for a session to hold two transcript rows. **A capture segment is not a provider**, so the schema has no slot for one. Write that down rather than routing around it quietly — a later phase may need the schema decision this task deliberately refuses to make.

---

## 🔗 Related Tasks

- [`task-vna-03-in-room-audio-capture.md`](./task-vna-03-in-room-audio-capture.md) — produces the object
- [`task-vna-05-reuse-phase-2-spine.md`](./task-vna-05-reuse-phase-2-spine.md) — consumes the transcript
- [Phase 2 `vnt-02`](../../p2-transcript-amendment/Tasks/task-vnt-02-extraction-pass.md) — the span contract this transcript must satisfy

---

**Last Updated:** 2026-08-31
**Completed:** —
**Pattern:** One pipeline, two inputs; schema constraints answered, not routed around
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
