# Task rec-31: Twilio-reaching hard delete

## 17 Aug 2026 — Batch [p5-access-and-retention](../plan-p5-recording-governance-v2-access-and-retention-batch.md) — Wave 3 — **L, ~6h**

---

## Task overview

REC-D22: **hard delete must reach Twilio.** Today it does not, and the consequence is worse than "deletion doesn't work".

The archival worker's hard-delete phase (`recording-archival-worker.ts:505-661`) calls `deleteObject(candidate.storageUri)` at **L574**. That resolves to `storage-service.ts:92-133`, which parses `<bucket>/<path>` and removes an object from **Supabase Storage**. The primary media is **Twilio-hosted Compositions**. So the worker deletes something that isn't there, then writes an `archival_history` row (**L578**) and stamps `hard_deleted_at` (**L608**) — and the recording is still on Twilio, fully retrievable.

`archival_history` is *the regulator-facing answer to "why is this patient's recording no longer retrievable?"* (057 L10-12). A row in it that describes a deletion which did not happen is not a bug in a cleanup job; it is a false compliance record. This is exactly the dishonesty REC-D22 exists to prevent, and p1's `rec-02` flagged it as REC1-D7 when it populated the index that arms this path.

This task extends the delete phase to call Twilio's Composition delete for Twilio-hosted `storage_uri`s, while keeping the audit trail and the failure posture intact. **Twilio exposes `DELETE /v1/Compositions/{sid}`, and a separate Recordings resource** — which of those this task needs is criterion 1.

**Deletion is irreversible.** There is no soft-delete tier, no undo, and no backup path specified anywhere in 055/056/057. Treat every criterion below as load-bearing.

**Estimated time:** ~6h
**Status:** ✅ Shipped (coding) — 2026-08-20. Flag stays `'false'`. No live Twilio delete. Not p5 Closed.
**Hard deps:** **[`p1`](../../p1-artifact-registry/) shipped and backfilled** — this phase acts on registry candidates, and p1's `rec-02` recorded the `storage_uri` convention that tells you which rows are Twilio-hosted. Read that recorded convention; do not re-derive it.
**Source:** REC-D22, REC5-D1, REC5-D5, REC5-D6, REC5-D10. p1's REC1-D7.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)

---

## Model & execution guidance

**Recommended model:** **Opus.**

Three reasons, and the third is why it is not merely "large".

First, this task performs **irreversible destruction of clinical records** against a second, previously-untouched external provider. Second, it must decide **how a provider outcome is audited in a table that has no column for it** — `archival_history` (057) carries no `provider` and no `provider_status`, and REC5-D1 forbids adding one, so the encoding has to ride `deletion_reason`'s string convention (057 L57-62) in a way ops and `rec-32` can both consume. Third, it inherits a **documented guarantee the code does not provide**: the worker's header at L31-32 claims *"Row-level lock (`FOR UPDATE ... SKIP LOCKED`) before the storage call so concurrent cron runs cannot both delete the same object"*, and the code at L551-556 does a PostgREST re-read with `.is('hard_deleted_at', null).maybeSingle()`, which **cannot express `FOR UPDATE`**. Reconciling a safety claim with a weaker reality, on an irreversible path, is a judgement call — not a wiring decision.

**New chat?** **Yes.** Pre-load:

- This task + the [batch plan](../plan-p5-recording-governance-v2-access-and-retention-batch.md) decision lock (REC5-D1, D5, D6, D10) + the [charter](../../plan-recording-governance-v2-charter.md) REC-D22 row + p1's REC1-D7 hazard note.
- `backend/src/workers/recording-archival-worker.ts` — **the whole file (755 lines).** Non-negotiable: the header's two-phase contract **L1-65** including the locking claim at **L31-35** and the dry-run contract at **L37-50**; `selectLiveArtifactRows` **L256-291**; `scanDeleteCandidates` **L376-418**; the delete loop **L505-661** (re-verify **L551-572**, delete **L574**, history insert **L578-606**, stamp **L608-624**, revocation cleanup **L634**, the catch that refuses the stamp **L638-647**); `buildDeletionReason` **L663-669**; `maybeCleanupRevocationRow` **L671-754**.
- `backend/src/services/twilio-compositions.ts` — **the whole file (431 lines).** It has `listCompositionsForRoom` (**L211**), `fetchCompositionMetadata` (**L292**), `mintCompositionSignedUrl` (**L352**), `getComputedTwilioMediaUrl` (**L114**) and **no DELETE wrapper of any kind.** The test seam is `__setOverridesForTests` (**L134-146**) — your new capability goes behind it (REC5-D5). Note `TwilioCompositionStatus` already includes `'deleted'` (**L50-55**).
- `backend/src/services/storage-service.ts` — **the whole file (133 lines).** `parseStorageUri` **L46-74** (throws on malformed); `deleteObject` **L76-133**, especially the **not-found-is-success** rule at **L106-121**. Do not generalise that rule to Twilio without stating why it applies.
- `backend/migrations/057_archival_history.sql` — **the whole file (93 lines).** The column list **L34-68**; the `deletion_reason` convention **L57-62**; "never pruned" **L26-31**. This is where REC5-D1 bites.
- `backend/src/config/env.ts` — **L556-594.** `ARCHIVAL_HARD_DELETE_ENABLED` at **L573-576** (default `'false'`) and the soak/flip narrative at **L566-571**; `ARCHIVAL_DRY_RUN_REPORT_DAYS` at **L588-594**.
- `backend/src/routes/api/v1/admin.ts` — **the whole file (130 lines).** The preview route reuses `scanDeleteCandidates`; anything you change about candidate shape shows up here.
- `backend/src/services/regulatory-retention-service.ts` — `resolveRetentionPolicy` (**L186**) and `ResolveRetentionPolicyResult` (**L60**). Read-only.
- p1 `rec-02`'s recorded **`storage_uri` convention** (REC1-D1). This is how you tell a Twilio-hosted row from a Supabase-hosted one.

**Estimated turns:** 6–8.

---

## Acceptance criteria

### 1. Establish the provider surface (do this before writing the delete path)

- [x] Determine which Twilio resource actually holds the media this program registers: **Compositions** (`DELETE /v1/Compositions/{sid}`), **Recordings** (the separate per-track resource), or both. p1 registers composition SIDs (`CJ…`), so Compositions is the expected answer — **confirm it and write the answer into this file**, including whether deleting a Composition leaves the underlying Recordings intact and billable.
- [x] If underlying Recordings survive a Composition delete, say so explicitly and state whether removing them is in scope for REC-D22's "erasure can actually remove the file" or a follow-up. **Do not silently leave media behind that the audit row claims was deleted** — that reproduces the exact failure this task exists to fix. If it is a follow-up, capture it to `docs/Work/capture/inbox.md` and note it in `archival_history`'s reason string.
- [x] Decide and record **which provider responses count as success.** A 404 in particular is ambiguous: "already deleted" or "wrong SID". `storage-service.ts:106-121` treats not-found as success for Supabase; state whether the same reasoning holds here and why. This decision determines whether a typo in a `storage_uri` reads as a completed deletion.
- [x] Record what is **not** reversible. Once written, this line is the thing a future reader needs most.

### 2. The provider delete capability (REC5-D5)

- [x] A composition-delete wrapper is added to `twilio-compositions.ts`, matching its three siblings' shape: typed errors, `NotFoundError` on 404, `InternalError` otherwise, no Express types.
- [x] It goes behind `__setOverridesForTests` (**L138-146**) so the suite never issues a live delete. **A test that really deletes a production composition is unrecoverable.**
- [x] `process.env` is never read directly; credentials come through `config/env.ts` exactly as `requireCredentials` (**L94-103**) does.
- [x] The wrapper logs the composition SID and outcome. **Never the media URL, never a payload dump.**

### 3. Routing — which artifacts go where

- [x] The delete phase decides per candidate whether the `storage_uri` is **Twilio-hosted** or **Supabase-hosted**, using p1's recorded convention (REC1-D1). Not by guessing, not by regex-hunting for `CJ` unless that *is* the recorded convention.
- [x] A Supabase-hosted `storage_uri` still routes to `deleteObject` with **behaviour unchanged.** Real storage objects exist under `recordings/patient_<uuid>/…` and this task must not break them.
- [x] An `storage_uri` that matches **neither** convention is a hard failure that logs loudly and **does not stamp `hard_deleted_at`.** An unclassifiable URI signals an index-population bug upstream; treating it as "nothing to delete" would silently write a false deletion record — `parseStorageUri`'s throw-on-malformed posture (`storage-service.ts:41-44`) is the precedent.
- [x] Both paths converge on the same audit and stamp sequence. There must be exactly one place that writes `archival_history` and exactly one that stamps `hard_deleted_at`.

### 4. Failure posture (REC5-D6) — the criterion that must not bend

- [x] **A failed provider call does NOT stamp `hard_deleted_at`.** The existing catch at **L638-647** already achieves this for Supabase by logging and continuing; the provider call must sit inside the same protection.
- [x] **A failed provider call writes no success `archival_history` row.** If a failed attempt is recorded at all, it must be unmistakably distinguishable from a completed deletion by its `deletion_reason` — an auditor scanning the table must never read a failure as a deletion.
- [x] The next cron tick **retries** the failed candidate, because `hard_deleted_at IS NULL` still matches it. Prove this with a test: force a provider failure, assert no stamp, re-run, assert the retry.
- [x] A **partial** failure is handled explicitly: provider delete succeeds but the history insert fails, or the history insert succeeds but the stamp fails. The existing code has opinions on both (**L590-606** for history, **L614-624** for the stamp) — restate them for the provider case rather than inheriting them by accident. Note that provider-succeeded-then-stamp-failed means a **retry will call delete on an already-deleted composition**, which is exactly why criterion 1's 404 decision matters.
- [x] One candidate's failure never aborts the run. Per-row failures are counted and reported, matching the cron pattern.

### 5. Audit trail (REC5-D1)

- [x] Every completed deletion writes exactly **one** `archival_history` row.
- [x] The row records **which provider was reached**, encoded in `deletion_reason` using an extension of the existing grep-friendly convention (`buildDeletionReason` **L663-669**, 057 L57-62). **No new column, no new table, no migration.**
- [x] The convention is **written into this file** as a stated outcome. `rec-32` and ops both consume it; a second convention invented later is a data-quality problem in an append-only table that is never pruned.
- [x] `policy_id`, `session_id`, `artifact_kind`, `storage_uri` and `bytes` keep their existing meanings. Nothing about the pre-existing shape changes.
- [x] No existing `archival_history` row is UPDATEd or DELETEd. The table is append-only (057 L26-31).

### 6. Locking discipline — resolve the header's claim

- [x] The worker header's `FOR UPDATE ... SKIP LOCKED` claim (**L31-35**) is reconciled with reality. **Two acceptable outcomes, and you must pick one and say which:**
  - **(a)** Implement real row-level locking so the claim becomes true. This means an RPC or a raw-SQL path, because PostgREST cannot express `FOR UPDATE`. **If this requires a new database function or any RLS consideration, STOP and surface it** — that is a hard-rules item and not something to add mid-task.
  - **(b)** Keep the existing re-verify-SELECT defence and **rewrite the header** to describe what the code actually does, including the residual race window.
- [x] Whichever you choose, the concurrency property must be stated precisely: what happens when two cron ticks reach the same candidate simultaneously, and whether double provider-delete is possible. If it is possible, criterion 1's 404 decision is what makes it harmless — connect the two explicitly.
- [x] The re-verify-before-destroy step (**L551-572**) survives in some form. Never call a provider delete on a candidate list read minutes earlier without re-checking `hard_deleted_at IS NULL`.

### 7. Dry-run first, and the flag stays off (REC5-D10)

- [x] **Dry-run mutates nothing, including at the provider.** This is the single most important behavioural guarantee in the task. A dry-run that issues a real `DELETE` is an unrecoverable incident.
- [x] Dry-run output reports the provider split — how many candidates are Twilio-hosted, how many Supabase-hosted, how many unclassifiable. Ops cannot review a flip they cannot see the shape of.
- [x] `ARCHIVAL_HARD_DELETE_ENABLED` stays `'false'` and **its default in `env.ts:573-576` is not changed.** Do not flip it. Do not "just test with it on".
- [x] The hide phase (**L424-499**) is untouched. It is reversible, it is deliberately not gated by the flag, and it is not this task's business.
- [x] `GET /api/v1/admin/archival-preview` still works and reflects any candidate-shape change.

### 8. Observability

- [x] **No PHI in any log line.** Session IDs, artifact IDs, composition SIDs, storage URIs, artifact kinds, byte counts, policy IDs and correlation IDs only. No patient names, phones or DOBs.
- [x] A log line exists that answers "was this composition deleted at the provider, and did we record it" without reading the database.
- [x] Per-run totals distinguish provider deletions from storage deletions.

### 9. Tests

- [x] Twilio-hosted candidate → provider delete called, one `archival_history` row with the provider recorded, `hard_deleted_at` stamped.
- [x] Supabase-hosted candidate → `deleteObject` called, behaviour byte-identical to today.
- [x] Unclassifiable `storage_uri` → loud failure, **no stamp**, no success history row.
- [x] Forced provider failure → no stamp, no success history row, retried on the next run.
- [x] Provider-succeeded-then-stamp-failed → the documented outcome, and a re-run behaves per criterion 1's 404 decision.
- [x] Dry-run → **zero** provider calls (assert on the mock), zero mutations, correct split reported.
- [x] All provider interaction through `__setOverridesForTests`. **No live Twilio call anywhere in the suite.**

### Out of scope

- **Patient-initiated erasure** — [`rec-32`](./task-rec-32-dpdp-patient-erasure-path.md) consumes the capability this task builds. Do not build the erasure path here.
- **Flipping the flag or writing the runbook** — [`rec-33`](./task-rec-33-retention-activation-runbook.md).
- **Any retention value in `058`** — REC5-D8, founder + counsel only.
- The hide phase, `patient_self_serve_visible`, and the 90-day window.
- `maybeCleanupRevocationRow`'s "last one under the prefix" logic (**L671-754**) — read it, because `rec-32` will care, but do not change it here.
- Encrypted compositions (a charter non-goal).
- Registry writes (p1), consent (p2), pause (p3), escalation (p4).
- The consult timeline and the player — [`rec-28`](./task-rec-28-doctor-consult-timeline.md), [`rec-29`](./task-rec-29-multi-composition-replay-player.md).
- **Any doctor-facing delete affordance.** REC-D5, permanently.

---

## Scope Guard

- **Expected files touched: 4–6.** `twilio-compositions.ts` (one new wrapper + its override type), `recording-archival-worker.ts` (routing, audit string, header), and their tests. Possibly one env entry if criterion 1 requires it — surface it before adding.
- **DO NOT** modify `storage-service.ts`. The Supabase path is correct for Supabase objects.
- **DO NOT** modify `regulatory-retention-service.ts` or any retention arithmetic (`computeRetentionCutoff` **L310-327**).
- **DO NOT** modify the hide phase.
- **DO NOT** modify `account-deletion-worker.ts`. **`rec-32`.**
- **DO NOT** modify `recording-access-service.ts` or the revocation check.
- **DO NOT** change `ARCHIVAL_HARD_DELETE_ENABLED` or its default.
- **DO NOT** write a migration or add a column to `archival_history`. REC5-D1. **STOP and surface** if you conclude you need one — that would mean the phase was mis-specced, and it is an Opus-plus-human decision, not an in-flight one.
- **DO NOT** add an RLS policy. If real locking (criterion 6a) appears to need a database function or an RLS consideration, **STOP and surface.**
- **DO NOT** run the worker with the flag on against production data.

---

## Global safety gate

- **Data touched?** **Yes, destructively.** Deletes media at Twilio; inserts `archival_history`; stamps `recording_artifact_index.hard_deleted_at`. RLS on both tables is service-role only (056 L117, 057 L79) and **is not changed.**
- **Any PHI in logs?** **No.** SIDs, URIs, IDs, counts and correlation IDs only.
- **External API call?** **Yes — a new destructive Twilio surface.** This is the reason the task is Opus. All test-suite interaction is mocked through `__setOverridesForTests`.
- **Retention / deletion impact?** **Yes — this is the task.** Irreversible. Guarded by dry-run-first, re-verify-before-destroy, refusal-to-stamp-on-failure (REC5-D6), and `ARCHIVAL_HARD_DELETE_ENABLED = false` throughout (REC5-D10). A wrong retention value would delete clinical records early and unrecoverably — which is why the value itself is out of scope (REC5-D8).

---

## Done when

- The provider surface question is answered in writing, including which responses count as success and whether underlying Recordings survive; a Twilio-hosted artifact's hard delete removes the composition at Twilio, verified by a follow-up fetch returning not-found; Supabase-hosted artifacts behave exactly as before; an unclassifiable URI fails loudly without stamping; a forced provider failure leaves `hard_deleted_at` NULL, writes no success `archival_history` row, and retries next tick; every deletion writes one `archival_history` row recording the provider via the documented `deletion_reason` convention, written into this file; the locking claim is either implemented or restated, with the choice stated; dry-run issues zero provider calls and reports the provider split; `ARCHIVAL_HARD_DELETE_ENABLED` is still `false` with its default unchanged; no migration, no RLS change, no live Twilio delete in the suite; backend typecheck, lint and tests green.

---

## Related

- Batch plan: [`plan-p5-recording-governance-v2-access-and-retention-batch.md`](../plan-p5-recording-governance-v2-access-and-retention-batch.md) — REC5-D1, D5, D6, D10; Risks 2, 3, 7
- Charter: [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md) — REC-D22, REC-D5
- Execution order: [`EXECUTION-ORDER-p5-recording-governance-v2-access-and-retention.md`](./EXECUTION-ORDER-p5-recording-governance-v2-access-and-retention.md)
- Flagged this hazard when it armed the path: [`p1 — artifact registry`](../../p1-artifact-registry/plan-p1-recording-governance-v2-artifact-registry-batch.md) (REC1-D7, Risk 2)
- Consumer: [`rec-32`](./task-rec-32-dpdp-patient-erasure-path.md)
- Activates this: [`rec-33`](./task-rec-33-retention-activation-runbook.md)

---

## Outcome — 2026-08-20

### Provider surface (criterion 1)

The media this program registers is the **Composition** (`CJ…`, REC1-D1 `twilio-composition:<sid>`). Hard delete calls Twilio `DELETE /v1/Compositions/{sid}` via `deleteComposition` in `twilio-compositions.ts`. It does **not** call the Recordings resource.

Twilio's Composition DELETE removes the **composed media file** and sets composition status `deleted`. Metadata is retained ~30 days. **Source Recordings (per-track `RT…` / Recordings resource) survive and remain billable.** Removing them is **out of scope for rec-31** — captured to `docs/Work/capture/inbox.md`. The audit string records this so the row cannot be read as full-provider erasure: `_source_recordings=intact`.

### Success responses

| Twilio response | Wrapper | Worker |
|---|---|---|
| 2xx / SDK `remove()` resolves | success | success (`providerOutcome: 'deleted'`) |
| 404 | `NotFoundError` (same as fetch/mint siblings) | **success** (`providerOutcome: 'already_absent'`) |
| anything else | `InternalError` | failure: no stamp, no success `archival_history`, retry next tick |

404 is treated as success at the **worker** layer, not the wrapper. Same end-state reasoning as `storage-service.ts` not-found-is-success: the composed media is gone, which is the desired state. This is required for (1) stamp-failed retry and (2) the residual double-delete race under locking choice **(b)**. Residual: a well-formed but wrong SID in the index would also 404-as-success. Mitigated because SIDs are written by rec-02 from Twilio, unclassifiable URIs fail loudly, and `https://` Media URLs are unclassifiable (not false-Supabase).

**Not reversible:** once Composition DELETE succeeds, the composed media file cannot be recovered. There is no soft-delete, no undo, and no backup path in 055/056/057. Source Recordings may still exist until a follow-up deletes them.

### `deletion_reason` convention (REC5-D1 — rec-32 and ops consume this)

```
retention_expired_country=<CC>_specialty=<spec>_years=<n>[_untilAge=<n>]_provider=twilio_composition_source_recordings=intact
retention_expired_country=<CC>_specialty=<spec>_years=<n>[_untilAge=<n>]_provider=supabase_storage
```

Grep: `_provider=twilio_composition` vs `_provider=supabase_storage`. No new column.

### Locking — choice **(b)**

Kept the re-verify SELECT (`hard_deleted_at IS NULL`) immediately before destroy. Header rewritten: there is no `FOR UPDATE … SKIP LOCKED` (PostgREST cannot express it; an RPC would be a migration, REC5-D1). Two cron ticks can both pass re-verify and both call the provider. Double provider-delete is possible; Twilio 404-as-success makes it harmless. Stamp is conditional, so at most one run counts `deleted`. Both may INSERT `archival_history` (existing append-only duplicate trade-off).

### Partial failure (restated, not inherited by accident)

- Destroy throws → catch, **no** history, **no** stamp, retry.
- Destroy succeeds, history insert fails → log, **still stamp** (leaving the index un-stamped would retry provider delete forever). Duplicate history on a later path is the append-only trade-off.
- Destroy succeeds, stamp fails → continue without counting deleted. Next tick retries; Twilio 404 = success; a second history row is possible.

### Flag

`ARCHIVAL_HARD_DELETE_ENABLED` default remains `'false'`. Proven in dry-run + mock seam. Flip is rec-33.

---

**Last Updated:** 2026-08-20.
