# Task rec-02: `recording-artifact-service` — the registry writer

## 17 Aug 2026 — Batch [p1-artifact-registry](../plan-p1-recording-governance-v2-artifact-registry-batch.md) — Wave 1 — **L, ~5h**

---

## Task overview

`recording_artifact_index` has existed since migration 056 (2026-04-19) and has never had a writer. Every reference in `backend/src/` is a read or an update. This task builds the one module that inserts into it — the keystone primitive the rest of the program depends on.

The service registers a finalised Twilio Composition as an artifact row, for both `audio_composition` and `video_composition` kinds, populating `storage_uri`, `bytes` and the `patient_self_serve_visible` default. It is called by the webhook ([`rec-01`](./task-rec-01-composition-status-webhook.md)), and later by the backfill ([`rec-05`](./task-rec-05-artifact-index-backfill.md)). It must be safe to call twice with the same composition.

Nothing calls it when this task closes. That is intentional — Wave 1's gate is "the writer works and is tested in isolation", so the webhook in Wave 2 lands against a locked, proven contract.

**Estimated time:** ~5h
**Status:** ✅ Implemented 2026-08-18 — Wave 1 contract locked. Nothing calls the writer yet (intentional).
**Hard deps:** none. This is the first task in the batch.
**Source:** REC-D19, REC-D20, REC1-D1, REC1-D2, REC1-D6, REC1-D7.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)

---

## Model & execution guidance

**Recommended model:** **Opus.**

Two reasons, and the second is the real one. First, this is a new service module that every subsequent task and every subsequent phase reads — a wrong contract here is expensive to unwind. Second, the `storage_uri` convention it picks (REC1-D1) is a compliance-adjacent decision: get it wrong and the archival worker can later stamp `hard_deleted_at` and write an `archival_history` row for media that still exists on Twilio. A deletion record that is false is exactly the dishonesty REC-D22 exists to prevent. That judgement is not a wiring decision.

**New chat?** **Yes.** Pre-load:

- This task + the [batch plan](../plan-p1-recording-governance-v2-artifact-registry-batch.md) decision lock + the [charter](../../plan-recording-governance-v2-charter.md) REC-D19/D20/D22 rows.
- `backend/migrations/056_recording_artifact_index.sql` — **the whole file (137 lines).** The column list is L48–90; the `UNIQUE (session_id, artifact_kind, storage_uri)` constraint is **L89** and is the idempotency mechanism. The header comment L26–45 explains why `storage_uri` is opaque.
- `backend/src/services/recording-access-service.ts` — **L264–323** (`resolveAudioArtifact`, the Path A reader this must satisfy) and **L371–385** (`extractCompositionSid` — the exact parser your `storage_uri` has to survive).
- `backend/src/services/twilio-compositions.ts` — `CompositionMetadata` L57–67, `getComputedTwilioMediaUrl` L109–120, `listCompositionsForRoom` L211–279, `fetchCompositionMetadata` L292–334 (this is where `sizeBytes` for the `bytes` column comes from), `__setOverridesForTests` L134–146 (your test seam).
- `backend/src/services/storage-service.ts` — **L11–21** (the `<bucket>/<path>` convention), **L46–74** (`parseStorageUri`, which throws on malformed input), **L76–133** (`deleteObject` — read this to understand the hazard in REC1-D7).
- `backend/src/workers/recording-archival-worker.ts` — **L256–291** (`selectLiveArtifactRows`, the scan your rows will start appearing in) and **L545–624** (the hard-delete loop, so you can see precisely what a Twilio-flavoured `storage_uri` would do if the flag were ever flipped).
- One nearby service for structure — `backend/src/services/recording-track-service.ts` is the closest sibling in this domain.

**Estimated turns:** 5–7.

---

## Acceptance criteria

### 1. The `storage_uri` convention (REC1-D1) — decide this first

- [ ] A single convention is chosen for Twilio-hosted compositions and **written into this task file as a stated outcome**, not left implicit in the code. Every later task reads it from here.
- [ ] The chosen string is **deterministic per composition SID** — the same SID always yields a byte-identical `storage_uri`. This is what makes REC1-D2's UNIQUE-constraint idempotency work.
- [ ] `extractCompositionSid` (`recording-access-service.ts:378–385`) recovers the SID from it **without modification to that function.**
- [ ] The convention is evaluated against `parseStorageUri` (`storage-service.ts:46–74`) and the outcome is documented: either it parses into a plausible `<bucket>/<path>`, or it does not. Both are acceptable answers — what is not acceptable is choosing without checking.
- [ ] **The hazard is recorded in writing** (REC1-D7): whatever convention is chosen, `deleteObject` would attempt a **Supabase Storage** deletion for media that lives on **Twilio**. Note in this file what the archival worker would do with these rows if `ARCHIVAL_HARD_DELETE_ENABLED` were flipped to `true`, and state plainly that reaching Twilio is p5 / REC-D22 and out of scope here.
- [ ] The convention does not collide with the existing `recordings/patient_<uuid>/…` Supabase convention used by real storage objects. A reader must be able to tell a Twilio-backed row from a Supabase-backed row by looking at `storage_uri` alone.

### 2. Registering an artifact

- [ ] One exported entry point registers a finalised composition for a session. Input is at minimum the session, the composition SID and the artifact kind.
- [ ] Both `audio_composition` and `video_composition` kinds are supported by the same entry point. Kind is validated against the known set — an unknown kind is rejected, not silently written (the column is free text by design, per 056 L22–24, so validation is the service's job).
- [ ] `bytes` is populated from Twilio's composition metadata where available and left `NULL` where not. `NULL` is explicitly acceptable (056 L40–42) — a missing size must never fail the insert.
- [ ] `patient_self_serve_visible` is written at its documented default of `TRUE`. p1 does not compute visibility; the archival worker owns the later flip.
- [ ] `patient_self_serve_hidden_at` and `hard_deleted_at` are left `NULL`. This service never writes them — they belong to the archival worker.
- [ ] A composition that is not in Twilio's `completed` state is **not** registered. An artifact row is a promise that the media is playable; registering an `enqueued` or `processing` composition breaks that promise and would hand `resolveAudioArtifact` a SID that fails downstream.
- [ ] The `session_id` is verified to exist before insert. The FK is `ON DELETE RESTRICT` (056 L55) and a bad session reference should surface as a typed error, not a raw Postgres FK violation.

### 3. Idempotency (REC1-D2)

- [ ] Registering the same composition SID twice results in **exactly one row**. This is the single most important behaviour in the task.
- [ ] Idempotency is achieved through the existing `UNIQUE (session_id, artifact_kind, storage_uri)` constraint (056 L89) — **no new index, no new column, no application-level lock, and no migration.**
- [ ] A duplicate registration is a **success, not an error.** The webhook will retry, the poll will race it, and the backfill will overlap live traffic; all three must be able to call this and move on.
- [ ] The caller can distinguish "created" from "already existed" in the return value, because rec-01 and rec-05 both need to count them separately.

### 4. Errors, logging and layering

- [ ] Failures throw typed `AppError` subclasses. No raw `Error`, anywhere.
- [ ] `process.env` is never read directly — configuration comes from `config/env.ts`.
- [ ] No Express types are imported. This is a service; it must be callable from a webhook, a worker and a script.
- [ ] **No PHI in any log line.** Composition SIDs, room SIDs, session IDs, artifact kinds, byte counts and correlation IDs are all fine. Patient names, phone numbers and dates of birth are not, and neither is a raw request or a full Twilio payload dump.
- [ ] Every log line carries a correlation ID supplied by the caller.

### 5. Tests

- [ ] Registering a fresh composition writes a row with the expected kind, `storage_uri`, `bytes` and `patient_self_serve_visible`.
- [ ] Registering the same SID twice writes one row and reports the second call as already-existing.
- [ ] A non-`completed` composition is not registered.
- [ ] A missing `bytes` from Twilio still writes the row.
- [ ] An unknown artifact kind is rejected.
- [ ] **A round-trip test:** a row written by this service is resolvable by `resolveAudioArtifact`'s Path A and returns `source: 'index'`. This is the contract rec-04 will depend on — prove it here, in Wave 1, rather than discovering it in Wave 3.
- [ ] Twilio is stubbed via `twilio-compositions.__setOverridesForTests` (L138–146). No live Twilio calls in the suite.

### Out of scope

- Calling this service from anywhere. The webhook is [`rec-01`](./task-rec-01-composition-status-webhook.md); the backfill is [`rec-05`](./task-rec-05-artifact-index-backfill.md).
- Changing `resolveAudioArtifact` or `resolveVideoArtifact` — that is [`rec-04`](./task-rec-04-replay-resolves-from-index.md). Read them; do not edit them.
- Creating Compositions in Twilio, or deciding how they come to exist. That question is [`rec-01`](./task-rec-01-composition-status-webhook.md) step 0.
- `transcript` and `chat_export` artifact kinds. 056 anticipates them; p1 does not write them.
- Anything about deletion reaching Twilio (REC-D22 — p5).
- Retention policy, hide-phase timing, or the archival worker's behaviour.
- Consent (p2), pause (p3), escalation (p4).

---

## Scope Guard

- **Expected files touched: 2–3.** One new service module, its test file, and — only if genuinely required — one barrel/export line. Nothing else.
- **DO NOT** modify `recording-access-service.ts`. If your `storage_uri` convention does not survive `extractCompositionSid` as it stands, **change your convention, not that function** (rec-04 owns that file).
- **DO NOT** modify `recording-archival-worker.ts`, `storage-service.ts`, or `twilio-compositions.ts`.
- **DO NOT** touch `voice-transcription-service.ts` or `voice-transcription-worker.ts` — the poll stays exactly as it is (REC1-D4).
- **DO NOT** write a migration. `recording_artifact_index` has every column this needs. If you conclude otherwise, **STOP and surface it** — that is a hard-rules item and a signal the phase was mis-specced, not something to resolve in-flight.
- **DO NOT** change `ARCHIVAL_HARD_DELETE_ENABLED` or its default.
- **DO NOT** add a new environment variable. If you believe one is needed, surface it rather than adding it.

---

## Global safety gate

- **Data touched?** Yes — inserts into `recording_artifact_index`. RLS on that table is service-role only (056 L117) and **is not changed by this task.**
- **Any PHI in logs?** **No.** SIDs and session IDs only.
- **External API call?** Yes — Twilio composition metadata reads. No AI calls. No new PHI leaves the system.
- **Retention / deletion impact?** **Yes, and it is the headline risk.** This task is what gives the archival worker its first-ever candidates. The hide phase will begin acting on backfilled rows; the hard-delete phase stays dry-run via `ARCHIVAL_HARD_DELETE_ENABLED=false` (`env.ts:573`). See criterion 1 and REC1-D7.

---

## Done when

- A finalised composition can be registered as an `audio_composition` or `video_composition` row with `storage_uri`, `bytes` and `patient_self_serve_visible` populated; registering the same SID twice leaves exactly one row and reports the duplicate as success; a row written by this service resolves through `resolveAudioArtifact` Path A with `source: 'index'`; the `storage_uri` convention and its archival-worker hazard are written down in this file; no migration, no RLS change, no new env var; backend typecheck + lint + tests green.

---

## Related

- Batch plan: [`plan-p1-recording-governance-v2-artifact-registry-batch.md`](../plan-p1-recording-governance-v2-artifact-registry-batch.md)
- Charter: [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)
- Execution order: [`EXECUTION-ORDER-p1-recording-governance-v2-artifact-registry.md`](./EXECUTION-ORDER-p1-recording-governance-v2-artifact-registry.md)
- Consumers: [`rec-01`](./task-rec-01-composition-status-webhook.md) (webhook), [`rec-03`](./task-rec-03-video-consult-artifact-parity.md) (video parity), [`rec-05`](./task-rec-05-artifact-index-backfill.md) (backfill)
- Reader that must keep working: [`rec-04`](./task-rec-04-replay-resolves-from-index.md)

---

## Outcome — `storage_uri` convention (REC1-D1)

Locked 2026-08-18 in `backend/src/services/recording-artifact-service.ts`:

```
twilio-composition:<CompositionSid>
```

Example: `twilio-composition:CJaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`

| Check | Result |
|---|---|
| Deterministic per SID | Same SID always yields a byte-identical string (`buildTwilioCompositionStorageUri`). |
| Survives `extractCompositionSid` unmodified | The existing `/(CJ[a-zA-Z0-9]{10,})/` regex recovers the SID. |
| `parseStorageUri` | **Does not parse.** The URI has no slash, so `parseStorageUri` throws `ValidationError`. |
| Distinct from Supabase objects | Prefix `twilio-composition:` plus no slash; real storage objects look like `recordings/patient_<uuid>/…`. |

**REC1-D7 hazard.** If `ARCHIVAL_HARD_DELETE_ENABLED` were flipped to `true` today, `deleteObject` would throw `ValidationError` on these rows. The archival worker's per-row `catch` logs and continues **without** stamping `hard_deleted_at` or writing `archival_history`. That is the safer failure: the index stays honest, and the media on Twilio is untouched. A Media-URL convention (`https://video.twilio.com/v1/Compositions/<sid>/Media`) would have parsed as bucket `https:` and a Supabase "not found" would have been treated as success — a deletion record that is a lie. Reaching Twilio is p5 / REC-D22.

Entry point: `registerFinalisedComposition`. Return `{ created, artifactId, storageUri, bytes }` so rec-01 and rec-05 can count created vs already-existed separately.

---

**Last Updated:** 2026-08-18.
