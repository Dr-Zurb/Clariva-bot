# Task rec-05: Backfill the artifact index

## 17 Aug 2026 — Batch [p1-artifact-registry](../plan-p1-recording-governance-v2-artifact-registry-batch.md) — Wave 4 — **M, ~4h**

---

## Task overview

Waves 1–3 register compositions from now on. Every consult that has already ended still has nothing in the registry — no replay row for video, and no candidate for the archival worker.

This task is the one-off script that walks ended sessions, lists their Twilio compositions, and writes registry rows through [`rec-02`](./task-rec-02-artifact-registry-writer.md)'s writer. It is idempotent, resumable, batched, and dry-run first.

It also closes two conditions the rest of the program is waiting on: it is the retirement gate for the `consultation_transcripts` fallback (REC1-D5), and it is what finally gives the nightly archival worker a non-zero candidate count — the worker has scanned an empty table since April.

**Estimated time:** ~4h
**Status:** ✅ Apply recorded 2026-08-18 — no-op (`created: 0`). Historical rooms have no compositions.
**Hard deps:** [`rec-04`](./task-rec-04-replay-resolves-from-index.md) merged. Backfilling before replay reads the index would produce rows nobody consumes and would make a bad dry-run harder to interpret.
**Source:** REC-D19, REC-D20, REC1-D2, REC1-D5, REC1-D7.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet.

A well-understood batch-walker over a locked writer contract, following an existing repo pattern. The care required is operational — dry-run discipline, batching, honest counters — rather than architectural.

**New chat?** **Yes.** Pre-load:

- This task + the [batch plan](../plan-p1-recording-governance-v2-artifact-registry-batch.md) (**§Risks rows 2 and 3 especially**) + [`rec-02`](./task-rec-02-artifact-registry-writer.md)'s writer contract.
- `backend/scripts/backfill-perdoctor-patient-identity.ts` — **the whole file (36 lines).** This is the house pattern: a thin script that parses `--dry-run`, delegates to a service module, prints `[dry-run]`/`[done]` with stats, and exits non-zero on failure. Follow it.
- `backend/package.json` — the `scripts` block. Every operational script is registered as `node -r dotenv/config -r ts-node/register scripts/<name>.ts`. Match that convention if you add an entry.
- `backend/src/services/twilio-compositions.ts` — **`listCompositionsForRoom` L211–279.** Note the **20-composition cap** and its warning at L245–250, and `RoomCompositionSummary` L170–178 (`includeAudio` / `includeVideo` / `status`).
- `backend/src/services/recording-track-service.ts` — **L741–820**, in particular the audio/video bucketing rule at L794–806. Use the same rule; do not invent a second one.
- `backend/src/workers/recording-archival-worker.ts` — **L256–291** (`selectLiveArtifactRows`: `hard_deleted_at IS NULL` joined to `consultation_sessions.actual_ended_at`) so you can predict exactly what your new rows do to the next cron run. Also skim **L420–499**, the hide phase, which is **not** gated by the hard-delete flag.
- `backend/src/config/env.ts` — **L573**, `ARCHIVAL_HARD_DELETE_ENABLED` and its `false` default.
- `backend/src/routes/cron.ts` — **L463–502**, so you can describe the archival cron's behaviour in your dry-run report.

**Estimated turns:** 4–6.

---

## Acceptance criteria

### 1. Script shape and conventions

- [x] Lives in `backend/scripts/`, following the `backfill-perdoctor-patient-identity.ts` pattern: a thin entry point that parses arguments and delegates the real work to a service module.
- [x] `--dry-run` is a supported flag and the **safe default posture** — a run with no arguments must not mutate anything. Getting this backwards on a clinical-record table is the failure mode worth engineering against.
- [x] Prints a structured summary on completion: sessions scanned, compositions found, rows that would be or were created, rows already present, skipped-with-reason, failures.
- [x] Exits non-zero on failure so it is usable from an operator's shell without reading every line of output.
- [x] A header comment states usage, the idempotency guarantee, and that it is safe to re-run — matching the existing script's header.
- [x] `config/env.ts` is the only configuration source. **Never `process.env` directly.**
- [x] Registered in `backend/package.json` scripts following the existing `node -r dotenv/config -r ts-node/register` convention, if a registered entry point is warranted.

No-args is dry-run. `--apply` is required to write. `--dry-run` wins if both are passed.

### 2. Correct selection

- [x] Walks **ended** sessions — the archival worker's own criterion is `consultation_sessions.actual_ended_at IS NOT NULL` (`recording-archival-worker.ts:290`); use the same one so the two agree about what "ended" means.
- [x] Covers **both voice and video** sessions. Video is the population with zero coverage today and is the entire point of REC-D20.
- [x] Sessions with no `providerSessionId` (no Twilio room) are skipped cleanly and counted, not treated as failures.
- [x] Sessions whose room yields no compositions are skipped and counted. This is an expected outcome, not an error.
- [x] Only `completed` compositions are registered — same rule as rec-02. A `failed` or in-flight composition never becomes a row.
- [x] Audio and video compositions are bucketed by the **existing** `includeVideo` / `includeAudio` rule (`recording-track-service.ts:794–806`).

### 3. Idempotency, resumability, batching

- [x] **Re-running the script changes nothing.** This rides rec-02's REC1-D2 UNIQUE-constraint idempotency; do not build a second mechanism.
- [x] An already-registered composition is counted as "already present" and is not an error.
- [x] **Resumable.** An interrupted run — killed, timed out, rate-limited — can be re-run and picks up without redoing completed work and without duplicating anything.
- [x] **Batched**, with a bounded batch size. `listCompositionsForRoom` is one Twilio API call per session; a full-history walk must not hammer Twilio or exhaust memory.
- [x] Twilio rate limits and transient failures are handled per-session: log, count, continue. **One bad session must never abort the run.**
- [x] Optional bounds (a session-count limit and/or a date range) so an operator can start small on production before committing to the full walk.

### 4. The dry-run report has to be decision-grade

The dry-run is not a formality — it is the last checkpoint before this phase starts changing what the archival worker does.

- [x] Reports how many rows **would** be created, split by artifact kind and by modality (voice vs video).
- [x] **Reports how many of those rows would be immediately hide-eligible** — that is, sessions already past their 90-day patient self-serve window. The archival worker's hide phase is **not** gated by `ARCHIVAL_HARD_DELETE_ENABLED` (`recording-archival-worker.ts:420–499`), so those rows will be flipped to `patient_self_serve_visible = false` on the very next nightly run. **That must be a decision made with a number in front of it, not a surprise the morning after.** (Batch plan §Risks row 3.)
- [x] Reports how many rows would become **hard-delete candidates**, alongside an explicit restatement that `ARCHIVAL_HARD_DELETE_ENABLED` is `false` (`env.ts:573`) and stays `false` in p1 (REC1-D7).
- [x] Reports how many ended sessions would **still** have no artifact after the backfill, and why. This number is the denominator for charter success metric #1 and rec-06 needs it.
- [x] The report contains **no PHI** — counts, session IDs, SIDs and kinds only. No patient names, no phone numbers.

### 5. Execution discipline

- [x] Dry-run is executed **first**, and its output is recorded in this task file.
- [x] The real run happens only after the dry-run numbers have been read and accepted.
- [x] Post-run, the counts are verified against the database and recorded here.
- [ ] The archival worker's next run is expected to report a non-zero candidate count for the first time. Note the before and after — it is the cleanest available evidence that the retention system has stopped being a no-op.

Archival candidate count stays **0** — there are no index rows to scan. Not a worker bug. Re-check after the first post-hook consult produces a `CJ…`.

## Dry-run report — 2026-08-18T03:32:53Z (`rec-05-backfill-1787023973981`)

Command: `npm run backfill:artifact-index` (no `--apply`).

| Metric | Count |
|---|---|
| Sessions scanned (ended voice + video) | **14** |
| Compositions found | **0** |
| Rows that would be created | **0** (audio 0 / video 0) |
| Already present | 0 |
| Failures | 0 |
| Immediately hide-eligible (90-day window) | **0** |
| Hard-delete candidates (3-year floor, no DOB) | **0** |
| Still unresolvable after backfill | **14** — all `noCompositions` |
| `ARCHIVAL_HARD_DELETE_ENABLED` | **false** (REC1-D7, unchanged) |

This matches rec-01 step 0: the account had no Composition Hook until 2026-08-18, and `GET /v1/Compositions` is empty. Historical rooms have raw `RT…` recordings only. Backfill cannot invent `CJ…` SIDs. Charter metric #1 denominator for **historical** consults is **14 / 14 unreachable**. Future rooms that end after hook `HKbe336c348bce4c81907f6a3c55844a82` should compose and land via rec-01; this script will pick up any that the webhook missed.

Hide phase will not flip anything on the next cron — there are no new rows. Archival worker candidate count stays **0** until a composition exists.

## Apply report — 2026-08-18T10:57:24Z (`rec-05-backfill-1787050644363`)

Command: `npm run backfill:artifact-index -- --apply`.

Same counts as dry-run. `created: 0`, `alreadyPresent: 0`, `failures: 0`. Re-run is a no-op. No `recording_artifact_index` rows were inserted. `ARCHIVAL_HARD_DELETE_ENABLED` still `false`.

### Out of scope

- **Deleting the `consultation_transcripts` fallback.** This task satisfies the *condition* for retirement (REC1-D5); the removal itself is p5.
- Changing the archival worker, its scan, its phases, or its schedule.
- Flipping `ARCHIVAL_HARD_DELETE_ENABLED`. It stays `false`. Do not flip it to "see what happens".
- Reaching Twilio for deletion (REC-D22 — p5).
- Backfilling `transcript` or `chat_export` artifact kinds.
- Retention policy rows, `regulatory_retention_policy`, or the seed values.
- Any frontend change.
- Consent (p2), pause (p3), escalation (p4).

---

## Scope Guard

- **Expected files touched: 2–4.** One script, one service module holding the walk logic, its test file, and optionally one `package.json` script entry.
- **DO NOT** modify rec-02's writer. The backfill is a **consumer**. If the writer needs a change to serve it, **stop and surface it.**
- **DO NOT** modify `recording-archival-worker.ts`, `recording-access-service.ts`, or `twilio-compositions.ts`.
- **DO NOT** change `ARCHIVAL_HARD_DELETE_ENABLED`, its default, or any retention policy row.
- **DO NOT** write raw SQL against `recording_artifact_index`. Every insert goes through rec-02's writer so idempotency and the `storage_uri` convention stay in one place.
- **DO NOT** write a migration. **STOP and surface** if you believe you need one.
- **DO NOT** run the non-dry-run path against production before the dry-run output has been reviewed.

---

## Global safety gate

- **Data touched?** **Yes — bulk inserts into `recording_artifact_index` across historical clinical sessions.** This is the largest data-touching action in the phase. **RLS unchanged** (service-role only). All writes go through rec-02's writer.
- **Any PHI in logs?** **No.** Counts, session IDs, room SIDs, composition SIDs and artifact kinds only. The dry-run report is explicitly PHI-free (criterion 4).
- **External API call?** Yes — Twilio composition listing, one call per session, batched and rate-limit tolerant. No AI calls.
- **Retention / deletion impact?** **Yes — this is the task that activates retention.** The hide phase begins acting on backfilled rows at the next nightly run; the hard-delete phase stays dry-run behind the `false` flag. Criterion 4 exists so this is quantified before it happens.

---

## Done when

- The script runs dry-run by default, reports creations by kind and modality plus immediately-hide-eligible and still-unresolvable counts, and its output is recorded in this file; the real run has been executed and verified; re-running it creates nothing; an interrupted run resumes cleanly; every insert went through rec-02's writer; the archival worker reports a non-zero candidate count where it previously reported zero; `ARCHIVAL_HARD_DELETE_ENABLED` is still `false`; no migration; backend typecheck + lint + tests green.

---

## Related

- Batch plan: [`plan-p1-recording-governance-v2-artifact-registry-batch.md`](../plan-p1-recording-governance-v2-artifact-registry-batch.md)
- Charter: [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)
- Execution order: [`EXECUTION-ORDER-p1-recording-governance-v2-artifact-registry.md`](./EXECUTION-ORDER-p1-recording-governance-v2-artifact-registry.md)
- Depends on: [`rec-04`](./task-rec-04-replay-resolves-from-index.md), [`rec-02`](./task-rec-02-artifact-registry-writer.md)
- Feeds: [`rec-06`](./task-rec-06-close-gate-p1.md) (metric #1 denominator)

---

**Last Updated:** 2026-08-18. Dry-run + apply recorded. Both no-ops (`created: 0`).
