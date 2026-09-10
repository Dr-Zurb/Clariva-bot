# Plan p1 — Artifact registry

## 17 Aug 2026 — Batch `recording-governance-v2` / `p1-artifact-registry` (rec-01..06) — **L, ~3 dev-days**

> **Status:** ⏳ Planned 2026-08-17. No code yet.
> **Charter:** [`../plan-recording-governance-v2-charter.md`](../plan-recording-governance-v2-charter.md) (REC-D1…REC-D25 — inherited, never re-litigated)
> **Program:** [`../README.md`](../README.md)
> **Exec order:** [`Tasks/EXECUTION-ORDER-p1-recording-governance-v2-artifact-registry.md`](./Tasks/EXECUTION-ORDER-p1-recording-governance-v2-artifact-registry.md)
> **Prefix note:** this program uses one task prefix, `rec`, numbered continuously across all five phases. p1 owns `rec-01..06`; p2 starts at `rec-07`.

---

## Why this phase

**A video consult records audio to Twilio, and then neither the doctor nor the patient can play it back.** That is the whole of finding #1, and it is the reason this phase executes before every other phase in the program.

The mechanism, verified against the code on 2026-08-17:

1. `resolveAudioArtifact` (`backend/src/services/recording-access-service.ts:264`) resolves a session's audio in two hops. **Path A** reads `recording_artifact_index` (L275–293). **Path B** falls back to the newest non-failed `consultation_transcripts.composition_sid` (L297–320).
2. **Nothing in `backend/src/` ever INSERTs into `recording_artifact_index`.** Every single reference is a read or an update — `recording-archival-worker.ts` (L265, L466, L552, L609, L712), `recording-access-service.ts` (L276), and file comments in `voice-transcription-service.ts:41`, `storage-service.ts:26`, `env.ts:561`, `voice-transcription-worker.ts:42,134`. Path A therefore returns nothing, for every session, always.
3. The only caller of `enqueueVoiceTranscription` is the **voice** adapter (`voice-session-twilio.ts:192`), and it resolves the session by provider `'twilio_video_audio'` (`voice-transcription-service.ts:157`). A video session — provider `'twilio_video'` — never gets a `consultation_transcripts` row, so it has no Path B either.

Voice replay works today **only because the transcription table accidentally doubles as the artifact registry.** Video replay has no path at all.

The second consequence is quieter and worse. The nightly archival worker scans `recording_artifact_index` (`recording-archival-worker.ts:256–291`) and finds zero rows, so the hide phase, the retention window and the hard-delete phase are **all no-ops** — independent of `ARCHIVAL_HARD_DELETE_ENABLED`, which defaults `false` at `backend/src/config/env.ts:573`. We have a retention system that has never had a candidate to act on.

This phase gives the registry a writer, points replay at it, and backfills what already exists.

---

## Verified current state (grep-checked 2026-08-17)

| Anchor | Where | What is actually true |
|---|---|---|
| Audio artifact resolution | `recording-access-service.ts:264–323` | Path A (index) L275–293; Path B (transcripts) L297–320. Path B only accepts SIDs starting `CJ` (L313) — `RM…` room SIDs are treated as "worker hasn't resolved it yet". |
| Video artifact resolution | `recording-access-service.ts:350–369` | **No index lookup at all.** Goes straight to the live Twilio list via `getRecordingArtifactsForSession`, filters for `status === 'completed'`. |
| SID extraction from `storage_uri` | `recording-access-service.ts:378–385` | Accepts a bare `CJ…` string, else regex-matches `(CJ[a-zA-Z0-9]{10,})` anywhere in the URI. |
| Registry schema | `backend/migrations/056_recording_artifact_index.sql` | Columns: `id`, `session_id` (FK, ON DELETE RESTRICT), `artifact_kind` (free text), `storage_uri` (**NOT NULL**), `bytes` (nullable BIGINT), `patient_self_serve_visible` (NOT NULL, default TRUE), `patient_self_serve_hidden_at`, `hard_deleted_at`, `created_at`. **`UNIQUE (session_id, artifact_kind, storage_uri)`** (L89). RLS enabled, service-role only. |
| Composition polling | `voice-transcription-worker.ts:142–187` | `compositions.list({ roomSid, limit: 5 })`, picks `status === 'completed'`, builds `https://video.twilio.com/v1/Compositions/<sid>/Media`. The TODO at **L133–135** asks for exactly the webhook this phase builds. |
| Twilio composition adapter | `twilio-compositions.ts` | `listCompositionsForRoom` (L211, by **room** SID, limit 20), `fetchCompositionMetadata` (L292, returns `status` / `durationSec` / `sizeBytes` / `mediaUrlPrefix`), `mintCompositionSignedUrl` (L352), `getComputedTwilioMediaUrl` (L114, pure). All three are mockable via `__setOverridesForTests` (L138). |
| Existing Twilio webhook | `backend/src/routes/webhooks.ts:40` → `twilio-webhook-controller.ts:27–48` | `POST /webhooks/twilio/room-status`. Responds 200 immediately, processes in `setImmediate`. **It performs no signature verification of any kind.** |
| Archival worker | `recording-archival-worker.ts:256–291` (scan), `:505–624` (hard delete) | Hard-delete calls `deleteObject(candidate.storageUri)` → `parseStorageUri` → **Supabase Storage** `.remove()`, then writes `archival_history` and stamps `hard_deleted_at`. |
| Storage URI convention | `storage-service.ts:11–21`, `:46–74` | `<bucket>/<path>`, split on the first slash. `parseStorageUri` throws `ValidationError` on a malformed URI. |
| Cron patterns | `routes/cron.ts:463–502` (archival), `:504–547` (transcription) | Both are `verifyCronAuth` → run job → 200 with totals. Per-row failures counted in the payload, not thrown. |
| Hard-delete kill switch | `env.ts:573` | `ARCHIVAL_HARD_DELETE_ENABLED`, default `'false'`. Hide phase is never gated by it. |
| Webhook base URL | `env.ts:252` | `WEBHOOK_BASE_URL` already exists (optional, URL-validated). Use it; do not add a second base-URL variable. |

---

## ⚠️ Surfaced during planning — nothing in this repo creates a Composition

This is the one thing a reader must not skip, because it is not what the phase brief assumed.

`rg` across the entire repository for `compositions.create`, `Compositions.create`, `CompositionHook`, `composition hook` and `StatusCallback` (composition context) returns **no composition-creation call site anywhere** — not in `backend/src/`, not in `backend/scripts/`, not in the migrations, not in the docs. The only Composition surfaces that exist in code are `list`, `fetch` and the `/Media` signed-URL mint. `video-session-twilio.ts` contains no composition logic at all.

Twilio does not create Compositions on its own. They come from either an explicit `POST /v1/Compositions` call or an account-level **Composition Hook** configured outside the codebase. Since neither exists in the repo, exactly one of these is true:

- **(a)** A Composition Hook is configured in the Twilio console. Compositions exist; the finalise callback must be mounted **on the hook**, not on a per-composition create call — because there is no create call to mount it on.
- **(b)** No hook is configured. **No Compositions are ever produced**, `compositions.list` always returns empty, the transcription worker's rows sit queued forever, `composition_sid` never advances past its `RM…` placeholder, and **voice replay is broken in production too** — not just video.

The phase brief's instruction to "mount the callback URL on composition creation" therefore has no code call site to attach to today. **Resolving (a) vs (b) is step 0 of [`rec-01`](./Tasks/task-rec-01-composition-status-webhook.md) and gates the entire batch.** If the answer is (b), the phase premise changes materially — the charter's "voice replay works today by accident" would be wrong — and rec-01 **stops and surfaces** rather than inventing a composition-creation path on its own.

This is a five-minute check in the Twilio console (Video → Composition Hooks, or `GET /v1/CompositionHooks`). It must happen before any code is written.

**Resolved 2026-08-18:** first check was **(b)** (0 hooks, 0 compositions). Founder chose an account-level audio-only Composition Hook rather than in-code `compositions.create`. Hook `HKbe336c348bce4c81907f6a3c55844a82` (`haloaid-consult-audio`) now exists; rec-01 webhook is mounted on it. See [`rec-01`](./Tasks/task-rec-01-composition-status-webhook.md) step 0. Charter §1 is still wrong for **historical** consults (no `CJ…` SIDs); future rooms should compose.

---

## Decision lock (phase-local — charter REC-D1…D25 inherited on top)

| ID | Decision |
|----|----------|
| REC-D19, REC-D20, REC-D21 | Inherited verbatim. The index is canonical; video consults reach parity; finalise arrives by webhook with the poll retained as fallback. |
| **REC1-D1** | **`storage_uri` for Twilio-hosted compositions embeds the Composition SID and is deterministic per SID** — the same composition always produces byte-identical `storage_uri`. It must satisfy `extractCompositionSid` (`recording-access-service.ts:378–385`) unchanged. rec-02 picks the exact string and records it in the task file as an outcome; every other task consumes that choice rather than re-deriving it. |
| **REC1-D2** | **Idempotency rides the existing `UNIQUE (session_id, artifact_kind, storage_uri)` constraint** (056 L89). Because REC1-D1 makes `storage_uri` deterministic, the same composition SID arriving twice — webhook retry, poll-and-webhook race, backfill overlapping live traffic — collapses to one row. No new index, no new column, no application-level lock. |
| **REC1-D3** | **The composition-status webhook verifies its sender before doing any work.** The existing room-status webhook does not verify anything (`twilio-webhook-controller.ts:27–48`); this phase does not fix that endpoint (out of scope) but **must not copy its posture** into the new one. |
| **REC1-D4** | **The poll stays.** `voice-transcription-worker.ts:142–187` keeps its Twilio path as the fallback REC-D21 requires. The webhook is an accelerator, not a replacement, and p1 does not delete the poll. |
| **REC1-D5** | **Path B (`consultation_transcripts`) is retained behind an explicit flag and comment until the backfill (rec-05) has run in production.** Retiring it is a p5 action, not a p1 action. Deleting it in this phase would break replay for every session the backfill has not yet reached. |
| **REC1-D6** | **Video sessions get artifact rows for their AUDIO composition.** Video-track transcription is a charter non-goal and stays a non-goal. Where a video composition also exists it is registered as `video_composition`; it is never fed to a transcription provider. |
| **REC1-D7** | **This phase must not create a false-deletion path.** Populating the index turns the archival worker from "zero candidates" into "real candidates", and its hard-delete phase deletes from **Supabase Storage** while this media lives on **Twilio**. Reaching Twilio is REC-D22 and belongs to p5. p1 leaves `ARCHIVAL_HARD_DELETE_ENABLED` at `false` and rec-02 records the hazard explicitly. See §Risks. |
| **REC1-D8** | **This phase is migration-free.** `recording_artifact_index` shipped in 056 with every column p1 needs. |

---

## Waves

| Wave | Task | Size · Model | Scope |
|------|------|--------------|-------|
| 1 | [`rec-02`](./Tasks/task-rec-02-artifact-registry-writer.md) | **L · Opus** | `recording-artifact-service` — the single writer. Insert-on-finalise, idempotent, both composition kinds. Locks REC1-D1. |
| 2 | [`rec-01`](./Tasks/task-rec-01-composition-status-webhook.md) | **L · Opus** | Composition-status webhook: new route, sender verification, idempotent dispatch, correlation IDs, callback URL mounted. |
| 3 | [`rec-03`](./Tasks/task-rec-03-video-consult-artifact-parity.md) → [`rec-04`](./Tasks/task-rec-04-replay-resolves-from-index.md) | M · Sonnet ×2 | Video consults reach registry parity (REC-D20); replay prefers the index and the video 404 is fixed (REC-D19). |
| 4 | [`rec-05`](./Tasks/task-rec-05-artifact-index-backfill.md) | M · Sonnet | Backfill script over ended sessions. Dry-run first, batched, resumable, idempotent. |
| 5 | [`rec-06`](./Tasks/task-rec-06-close-gate-p1.md) | S · Composer / Founder | Verification gate, charter metric #1 measured, founder smoke on a real video consult. |

Two Opus tasks — at the ≤2-per-batch cap, one per wave. rec-01 is Opus because it is a new external-facing authentication surface. rec-02 is the justified second: it is the keystone primitive every later phase reads, and its REC1-D1 choice is what decides whether the archival worker can later record a deletion that did not happen (REC1-D7). Both are on the hard-rules list in [`00-agent-contract.mdc`](../../../../../../../.cursor/rules/00-agent-contract.mdc).

---

## Scope guard — DO NOT TOUCH

- **Consent capture or removal** — the booking checkbox, `recording-consent-service.ts`, the consent gate at `voice-transcription-service.ts:178–200`. **p2 owns it.** Registry rows are written regardless of consent state in p1; do not add or remove a consent branch here.
- **Pause semantics** — `recording-pause-service.ts`, `DEFAULT_KIND`, gap rendering. **p3.**
- **The escalation state machine** — `recording-escalation-service.ts`, `deriveState`, attempt counters, cooldowns. **p4.**
- **The doctor timeline UI and every deletion path** — `EndedCard.tsx`, the consult timeline, Twilio-reaching hard delete (REC-D22). **p5.**
- **The 90-day patient self-serve window** and the **video replay OTP gate** (REC-D25, `recording-access-service.ts:784–806`).
- **Twilio room create / end** — `video-session-twilio.ts`, `consultation-session-service.ts:115–166`, room naming, lazy creation.
- **The `crc` check-in lobby** — check-in columns, heartbeat, lobby polling, OPD board tags.
- **The existing `POST /webhooks/twilio/room-status` endpoint.** Its missing signature verification is real and worth fixing, but fixing it is not this phase (see §Risks).
- **`ARCHIVAL_HARD_DELETE_ENABLED`.** It stays `false`. Do not flip it, do not change its default, do not "test" with it on.
- **Any migration, any RLS policy, any PHI column.** This phase is **migration-free** (REC1-D8). `recording_artifact_index` already exists with every column p1 needs. **If a task appears to need a schema change, STOP and surface it** — do not write migration 196 here. Per [`00-agent-contract.mdc`](../../../../../../../.cursor/rules/00-agent-contract.mdc) that is an Opus-only, human-confirmed decision, and p1 needing one would mean the phase was mis-specced.

---

## Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | **No composition-creation call site exists** (see §Surfaced above). If no Composition Hook is configured, there is nothing to register and voice replay is broken too. | rec-01 step 0 resolves it in the Twilio console before any code. Answer (b) → **stop and surface**; the charter's problem statement needs correcting before the batch continues. |
| 2 | **Populating the index arms the archival worker's hard-delete phase against the wrong storage backend.** `deleteObject` (`storage-service.ts:92`) parses `<bucket>/<path>` and deletes from Supabase; the media is on Twilio. If the flag were ever flipped, the worker would write `archival_history` and stamp `hard_deleted_at` for media that still exists — a deletion record that is a lie, which is precisely the dishonesty REC-D22 exists to prevent. | REC1-D7: flag stays `false` (`env.ts:573` default). rec-02 records the hazard in its task file and rec-06 asserts the flag is still `false` at close. Reaching Twilio is p5's REC-D22 work. |
| 3 | **The hide phase is not gated by the flag** and will start flipping `patient_self_serve_visible` on backfilled rows older than 90 days as soon as they exist. | This is correct behaviour, not a bug — but it is a behaviour change that starts the moment rec-05 runs. rec-05's dry-run must report how many backfilled rows would immediately be hide-eligible so it is a decision, not a surprise. |
| 4 | **Webhook and poll race on the same composition.** Both can resolve the same SID within seconds. | REC1-D2 — the UNIQUE tuple absorbs it. rec-02's tests must cover the double-write explicitly. |
| 5 | **Retiring Path B too early** would break replay for un-backfilled sessions. | REC1-D5 — Path B stays behind an explicit flag and comment; retirement is p5. |
| 6 | **The existing room-status webhook remains unauthenticated** after this phase. | Out of scope by decision, not by oversight. rec-01 notes it and captures it to the inbox for a follow-up; the new endpoint does not inherit the posture (REC1-D3). |

---

## Acceptance gate (phase)

- [x] How Compositions come into existence is **documented as a written answer** in rec-01, not left implicit.
- [x] A composition finalising causes exactly one `recording_artifact_index` row to appear, with `storage_uri`, `bytes` and `patient_self_serve_visible` populated.
- [x] The same composition SID delivered twice still produces exactly one row.
- [x] A **video** consult that has ended has an `audio_composition` row — the parity REC-D20 requires.
- [x] `resolveAudioArtifact` returns `source: 'index'` for any session with a registry row; Path B still resolves sessions that have none.
- [x] `resolveVideoArtifact` consults the index before calling Twilio.
- [ ] **A doctor and a patient can both replay a video consult end-to-end.** This is the finding-#1 fix and the phase does not close without it.
- [x] Backfill runs dry-run first, reports counts, then runs for real; re-running it changes nothing.
- [ ] The archival worker's next run reports a non-zero candidate count where it previously reported zero.
- [x] `ARCHIVAL_HARD_DELETE_ENABLED` is still `false`.
- [ ] Charter success metric #1 (reachability) measured on real ended sessions and written into the program README.
- [x] No migration was written. No RLS policy changed. `git diff --stat backend/migrations/` is empty.
- [x] Typecheck + lint + tests green in both workspaces; no PHI in any new log line.

Unchecked reasons (2026-08-18): founder smoke not run (doctor+patient replay). Archival candidates still 0 — no `CJ…` compositions exist historically. Metric #1 historical is **0/14** (explained in program README Runs); live 5-minute figure unmeasured. Composition-finalise → one row is unit-tested via rec-02/rec-01; not yet seen on a live room. Video audio-row parity is the inherited hook + webhook (rec-03); historical video still has no row. p1 lint/tests are the p1 file set; full-repo eslint has unrelated pre-existing errors.

---

**Created:** 2026-08-17.
