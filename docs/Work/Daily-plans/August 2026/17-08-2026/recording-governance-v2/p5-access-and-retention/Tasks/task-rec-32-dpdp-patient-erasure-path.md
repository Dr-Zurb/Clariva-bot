# Task rec-32: DPDP patient erasure path

## 17 Aug 2026 — Batch [p5-access-and-retention](../plan-p5-recording-governance-v2-access-and-retention-batch.md) — Wave 4 — **L, ~6h**

---

## 🚩 This is the task most likely to need legal input

Read this section before the overview. The core question is not technical.

A patient exercises DPDP erasure. A clinical-record retention obligation — 3 years general, until age 21 for pediatrics, 7 years for gynecology, 7 years international fallback (`058_regulatory_retention_policy_seed.sql:44-89`) — may outlive that request by years. **Two lawful obligations point in opposite directions, and something has to win.**

REC5-D7 states the program's default: **retention outranks erasure; access is severed immediately; media is deleted at the retention cutoff; the carve-out is recorded rather than implied.** That is a defensible reading and it is what the product already tells patients — `account-deletion-worker.ts:91-98` sets `LEGAL_RETENTION_CITATION = 'DPDP Act 2023 and GDPR Article 9 medical-record retention'` and the explainer DM says so today. **It is not a settled legal conclusion**, and this task must not present it as one.

**What this task must do:** implement REC5-D7's default, define the carve-out precisely, record it per erasure request with the policy that justified it, and **surface the whole thing for founder confirmation before the path is enabled** — not after. If counsel disagrees, the carve-out rule changes and this task's design has to survive that change without a rewrite. Do not hard-code the doctrine; resolve it from `regulatory_retention_policy` the way the archival worker already does.

**What this task must not do:** decide the legal question, edit a retention value (REC5-D8), or ship an erasure path that silently over-retains without telling the patient what happened to their data.

---

## Task overview

REC-D22 also covers the patient-initiated side: **DPDP erasure is not satisfied today.**

`finalizeAccountDeletion` (`account-deletion-worker.ts:459-586`) does four things in criticality order (header L52-69): upserts one `recordings/patient_<uuid>/` prefix into `signed_url_revocation` (**L504-524**), scrubs PII from the patient row (**L528-531**), sends an explainer DM (**L534-539**), and stamps the audit row (**L541-560**). `enumerateArtifactPrefixes` (**L145-147**) returns exactly that one string.

**No media is deleted anywhere in that path.** The revocation prefix only blocks minting — `isRevoked` (`recording-access-service.ts:418-461`) checks it in application code, and **fails open on lookup error** (`:441-447`). The recordings themselves sit on Twilio, intact and retrievable by anyone with service-role access. That is access severance, not erasure, and calling it erasure is the same category of dishonesty as `rec-31`'s false `archival_history` row.

Making this real is also what makes p4's **REC-D10** honest. That decision says "stop halts future capture; it is not deletion; withdrawal of consent is served by a separate erasure path." Today there is no such path, so REC-D10 currently points at nothing.

This task builds the erasure that removes media, subject to the retention carve-out above, consuming [`rec-31`](./task-rec-31-twilio-reaching-hard-delete.md)'s provider-delete capability rather than reimplementing it.

**Estimated time:** ~6h
**Status:** ✅ Shipped (coding) — 2026-08-22. Media destroy gated by `ARCHIVAL_HARD_DELETE_ENABLED` (still `'false'`). Carve-out **surfaced, not confirmed**. Path is not enabled.
**Hard deps:** **[`rec-31`](./task-rec-31-twilio-reaching-hard-delete.md) green and merged** — you consume its provider-delete capability and its `archival_history` reason convention. **[`p1`](../../p1-artifact-registry/) shipped and backfilled** — erasure enumerates registry rows to find media.
**Source:** REC-D22, REC-D10, REC5-D1, REC5-D6, REC5-D7, REC5-D8.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)

---

## Model & execution guidance

**Recommended model:** **Opus.**

This task encodes a conflict-of-obligations rule into an irreversible path that runs alongside a PII scrub, on data whose loss is unrecoverable. The judgement — which obligation wins, how the carve-out is bounded, what the patient is told about the difference between "gone" and "unreachable until 2029" — is a policy decision wearing a code costume. It is also the second of exactly two Opus tasks in this phase (with `rec-31`), and it earns the slot for the same reason `rec-31` does: getting it wrong produces a record that says something untrue about a patient's data.

**New chat?** **Yes.** Pre-load:

- This task (the 🚩 section first) + the [batch plan](../plan-p5-recording-governance-v2-access-and-retention-batch.md) REC5-D7 / REC5-D8 + the [charter](../../plan-recording-governance-v2-charter.md) REC-D22 and REC-D10 rows.
- `backend/src/workers/account-deletion-worker.ts` — **the whole file (598 lines).** The three-entry-point contract **L1-71**, especially the artifact-prefix convention **L41-51** and the failure posture **L52-69**; `LEGAL_RETENTION_CITATION` **L91-98**; `enumerateArtifactPrefixes` **L145-147**; `sendExplainerDm` **L163-260**; `cancelAccountDeletion` **L383-442**; `finalizeAccountDeletion` **L459-586**; `listRevocationsForPatient` **L588-597** and its "v1 recomputes rather than queries" note.
- **[`rec-31`](./task-rec-31-twilio-reaching-hard-delete.md) as merged** — its provider-delete wrapper, its recorded success/404 decision, and its recorded `deletion_reason` convention. You consume all three; you re-derive none.
- `backend/src/services/recording-access-service.ts` — **L387-461.** The revocation bridging comment **L391-403** (it says the worker *should* also write a Twilio-prefixed entry and that this is not wired), `isSessionOrCompositionRevoked` **L404-416**, and `isRevoked`'s **fail-open** behaviour **L441-447**.
- `backend/src/services/regulatory-retention-service.ts` — **the whole file (245 lines).** `resolveRetentionPolicy` **L186**, `ResolveRetentionPolicyResult` **L60**. This is how you resolve the carve-out instead of hard-coding it.
- `backend/src/workers/recording-archival-worker.ts` — **L299-327** (`computeRetentionCutoff`, including the pediatric `retention_until_age` branch), **L376-418** (`scanDeleteCandidates`), and **L671-754** (`maybeCleanupRevocationRow` — its "only delete the revocation row when no other live artifacts remain under that prefix" rule at **L626-633** is directly relevant to you).
- `backend/migrations/054_account_deletion_and_signed_url_revocation.sql` — the `signed_url_revocation` shape and its `url_prefix` uniqueness.
- `backend/migrations/055_regulatory_retention_policy.sql` and `058_regulatory_retention_policy_seed.sql` — **read-only.** 058's header **L15-42** is the owner/legal-review block. **You do not edit a value in either file.**
- `backend/src/utils/dm-copy.ts` — `buildAccountDeletionExplainerDm` and its language resolution. Patient copy changes go through the builder.

**Estimated turns:** 6–8.

---

## Acceptance criteria

### 1. Define the carve-out (do this first, in writing)

- [x] **State the rule precisely in this file**, in a form a non-engineer can check: which erasure requests result in immediate media deletion, which result in access severance plus deferred deletion, and how the boundary is computed.
- [x] The boundary is resolved from `regulatory_retention_policy` via `resolveRetentionPolicy`, **not hard-coded**. If counsel changes a value later, the behaviour must follow without a code change. The pediatric `retention_until_age` branch (`computeRetentionCutoff` **L318-326**, and its conservative "DOB unknown → retention-years wins" rule) applies here too and must not be re-derived differently.
- [x] Decide and record what happens to an artifact **already past** its retention cutoff at erasure time. It should be deletable immediately — but say so, because "erasure request arrives on an old record" is the common case, not the edge case.
- [x] Decide and record what happens when the patient has consults under **different** policies (a pediatric consult and a general one). Per-artifact resolution is the right answer; confirm it and state it, because a per-patient shortcut would over- or under-retain half the record.
- [x] **Surface the carve-out for founder confirmation before the path is enabled.** Record in this file that it was surfaced, and what came back. An unconfirmed carve-out means the code may ship behind a flag but the erasure path is not turned on.

### 2. Erasure that reaches the media

- [x] The erasure path enumerates the patient's **registry rows**, not just a prefix string. `enumerateArtifactPrefixes` returning one convention-derived prefix (**L145-147**) is what makes today's path unable to find Twilio-hosted media at all.
- [x] For each artifact eligible for immediate deletion, media is removed **at the provider**, using `rec-31`'s capability. Verified by a follow-up fetch returning not-found — not by our own log line.
- [x] Each deletion writes an `archival_history` row using `rec-31`'s recorded convention, with a `deletion_reason` that distinguishes **patient-initiated erasure** from **retention expiry**. An auditor must be able to tell why a record is gone; those are different answers to a regulator's question.
- [x] `recording_artifact_index.hard_deleted_at` is stamped only on confirmed provider success (REC5-D6). A failed provider call leaves it NULL and leaves the erasure retryable.
- [x] For artifacts held back by the carve-out: access is severed now, and the artifact remains a normal archival-worker candidate so it is deleted at its cutoff by the existing path. **Do not build a second scheduler.**
- [x] Held-back artifacts are marked such that the deferred deletion is **attributable to the erasure request** when it eventually happens. A deletion two years later that reads as routine retention expiry loses the fact that the patient asked.

### 3. Access severance stays at least as strong as today

- [x] The `signed_url_revocation` prefix write survives. It is the fastest, most reliable block and it must not be traded for media deletion.
- [x] The bridging gap noted at `recording-access-service.ts:391-403` is addressed **or explicitly deferred with a reason.** That comment says revocation writes *should* also emit a Twilio-prefixed entry and that it is not wired; the current check compensates with substring matching (**L452-456**). If you rely on that compensation, say so and prove it covers the URI shapes p1 actually writes.
- [x] `isRevoked`'s **fail-open** behaviour (**L441-447**) is noted in this file. It is a real weakness in an erasure story — a revocation lookup error grants access — but changing it is a live-traffic authZ change with its own blast radius. **Recommend, do not unilaterally flip.** If you do change it, that is the decision to surface.
- [x] `maybeCleanupRevocationRow`'s "last live artifact under the prefix" rule (`recording-archival-worker.ts:626-633, 671-754`) still holds. An erasure that deletes some artifacts must not let the worker drop a revocation row that is still protecting others.

### 4. Preserve the existing worker contract

- [x] The four-step criticality ordering (header **L52-69**) is preserved: revocation → PII scrub → DM → audit stamp. Media deletion is inserted at a stated position with a stated reason. A DM failure must still not roll back severance.
- [x] **Idempotency survives.** Re-running finalize on an already-finalized patient changes nothing and deletes nothing twice (**L494-500**). Add media deletion without breaking this — and note that "already deleted at the provider" interacts with `rec-31`'s 404 decision.
- [x] `cancelAccountDeletion` (**L383-442**) and the grace window still work. **Nothing irreversible happens before the grace cutoff** — that is the whole point of the grace window, and media deletion is the most irreversible step in the system.
- [x] A failure mid-erasure does not stamp `finalized_at` and does not leave the patient half-erased with no retry path. The existing posture bails before stamping on scrub failure (**L526-527**); extend that reasoning, do not weaken it.
- [x] Typed `AppError` subclasses. `process.env` never read directly. No Express types in the worker.

### 5. Tell the patient the truth

- [x] The explainer DM reflects **what actually happened to their data.** If media was deleted, say so. If a retention obligation defers deletion, say that, with the citation and — ideally — the date. `LEGAL_RETENTION_CITATION` (**L91-98**) already exists for exactly this and is deliberately not env-driven; keep that property.
- [x] Copy goes through `buildAccountDeletionExplainerDm` with language resolution. **No inline strings.**
- [x] Copy must not imply that stopping a recording deletes anything (REC-D10), and must not imply full deletion when a carve-out applied. The second is the failure mode that turns a compliance feature into a misrepresentation.
- [x] The DM stays **non-fatal** (**L533**, header L65-66). A courtesy notification must not be able to block severance.

### 6. Observability and compliance

- [x] **No PHI in any log line.** Patient IDs, session IDs, artifact IDs, composition SIDs, policy IDs, counts, prefixes and correlation IDs only. **This path runs alongside a PII scrub, so a log line written here is unusually likely to be the last place a name survives.** Treat it accordingly.
- [x] The erasure audit row records: how many artifacts were enumerated, how many deleted, how many held back, and under which policy each carve-out applied. `account_deletion_audit` already carries `artifact_prefix_count` (**L546**) — extend the existing metadata rather than adding a column (REC5-D1).
- [x] One query answers "what happened to this patient's recordings when they asked for erasure". Write it into this file.

### 7. Tests

- [x] Erasure with no retention obligation outstanding → media deleted at the provider, `hard_deleted_at` stamped, `archival_history` row marked patient-initiated.
- [x] Erasure with a retention obligation outstanding → access severed, media retained, carve-out recorded with its policy ID, DM copy reflects deferral.
- [x] Mixed policies across a patient's consults → per-artifact resolution, not per-patient.
- [x] Pediatric artifact with unknown DOB → the conservative branch wins (never under-retain).
- [x] Provider failure mid-erasure → no `finalized_at` stamp, no false `archival_history` row, retryable.
- [x] Re-running finalize on a finalized patient → no second deletion, no second DM, no new history row.
- [x] Cancel during the grace window → **nothing was deleted.**
- [x] All provider interaction through `twilio-compositions.__setOverridesForTests`. **No live delete in the suite.**

### Out of scope

- **Building the provider-delete capability** — [`rec-31`](./task-rec-31-twilio-reaching-hard-delete.md) owns it. Consume it.
- **Editing any retention value** in `055` or `058` — REC5-D8. Founder + counsel only, and it is a founder task, not an agent task.
- **Flipping `ARCHIVAL_HARD_DELETE_ENABLED`** or writing the activation runbook — [`rec-33`](./task-rec-33-retention-activation-runbook.md).
- The retention-expiry archival path itself — `rec-31` extended it; this task feeds it.
- Doctor-initiated deletion. **REC-D5: a doctor can never delete a recording, ever.** No affordance, no admin bypass, no "support can delete on request" endpoint.
- The PII scrub's internals (`account-deletion-pii-scrub.ts`) beyond keeping its call site and ordering.
- `crc`, consent (p2), pause (p3), escalation (p4), the timeline and player (`rec-28`, `rec-29`).
- The 90-day patient self-serve window and the video OTP gate (REC-D25).
- The `phh` patient hub. An erasure request arriving through a future patient surface still lands in this worker.

---

## Scope Guard

- **Expected files touched: 4–6.** `account-deletion-worker.ts`, `dm-copy.ts` (the explainer builder), possibly a small helper for carve-out resolution, and tests.
- **DO NOT** modify `twilio-compositions.ts`. `rec-31` built the wrapper.
- **DO NOT** modify `regulatory-retention-service.ts` or `computeRetentionCutoff`'s arithmetic. Reuse both.
- **DO NOT** modify `055`, `058`, or any retention number. REC5-D8.
- **DO NOT** modify the hide phase or `patient_self_serve_visible` semantics.
- **DO NOT** flip `isRevoked`'s fail-open behaviour without surfacing it as a separate decision.
- **DO NOT** modify `recording-archival-worker.ts`'s delete loop. If erasure needs it changed, that is a `rec-31` contract failure — **stop and surface**, don't patch.
- **DO NOT** add a doctor-facing or support-facing delete endpoint. REC-D5.
- **DO NOT** delete anything before the grace-window cutoff.
- **DO NOT** write a migration or add a column. `account_deletion_audit`, `archival_history` and `signed_url_revocation` all exist with room in their existing metadata. REC5-D1. **STOP and surface.**

---

## Global safety gate

- **Data touched?** **Yes, destructively, and on PHI.** Deletes media at Twilio; inserts `archival_history`; stamps `recording_artifact_index.hard_deleted_at`; writes `signed_url_revocation`; runs alongside a PII scrub on the `patients` row. RLS on every table involved is unchanged.
- **Any PHI in logs?** **No** — and this is the highest-risk task in the phase for it, because the path exists to remove PHI. IDs, counts, prefixes and policy IDs only.
- **External API call?** Yes — Twilio composition delete via `rec-31`'s wrapper, plus the existing IG-DM / SMS / email explainer cascade. No AI calls. `redactPhiForAI` already guards the stored reason (**L149-157**).
- **Retention / deletion impact?** **Yes — this task is the DPDP erasure path.** Irreversible. Guarded by the grace window, the carve-out rule, refusal-to-stamp-on-failure (REC5-D6), founder confirmation of the carve-out, and the fact that no retention value is editable here (REC5-D8).

---

## Done when

- The carve-out rule is written into this file, resolved from `regulatory_retention_policy` rather than hard-coded, and recorded as surfaced to the founder with the response; an erasure request with no outstanding obligation removes media at the provider, verified against the provider, with an `archival_history` row marked patient-initiated; an erasure request with an outstanding obligation severs access, records the carve-out with its policy ID, and produces explainer copy that matches what actually happened; per-artifact policy resolution and the conservative pediatric branch both hold; cancel during grace deletes nothing; re-running finalize deletes nothing twice; a provider failure leaves the request unfinalized and retryable; the ops query is written into this file; no retention value touched, no migration, no RLS change, no doctor-facing delete affordance, no live provider delete in the suite; backend typecheck, lint and tests green with no PHI in logs.

---

## Related

- Batch plan: [`plan-p5-recording-governance-v2-access-and-retention-batch.md`](../plan-p5-recording-governance-v2-access-and-retention-batch.md) — REC5-D7, REC5-D8; Risk 4
- Charter: [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md) — REC-D22, REC-D10, REC-D5, REC-D2 (the precedent for escalating a legal question)
- Execution order: [`EXECUTION-ORDER-p5-recording-governance-v2-access-and-retention.md`](./EXECUTION-ORDER-p5-recording-governance-v2-access-and-retention.md)
- Hard dependency: [`rec-31`](./task-rec-31-twilio-reaching-hard-delete.md)
- Makes this honest: [`p4 — video escalation control`](../../p4-video-escalation-control/plan-p4-recording-governance-v2-video-escalation-control-batch.md) (REC-D10)
- Activates the retention side: [`rec-33`](./task-rec-33-retention-activation-runbook.md)

---

## Outcome — 2026-08-22

### Carve-out rule (plain language)

This is **REC5-D7's default**, not a counsel-signed conclusion.

1. After the grace window, **access is always severed** (revocation prefixes). That happens even if media cannot be deleted yet.
2. For each consult recording, look up the retention policy for that consult's doctor country + specialty (`resolveRetentionPolicy`). Compute the cutoff with the archival worker's `computeRetentionCutoff` (session end + years, or the later of that and DOB + `retention_until_age` when both exist). **If date of birth is missing, years-only wins** — same conservative branch as the archival worker; we do not invent an age-21 hold.
3. **Cutoff already passed** at finalize time → the recording is eligible for immediate delete (the common case for old consults).
4. **Cutoff still in the future** → keep the file. It stays a normal archival-worker candidate and is deleted at that cutoff. Do not build a second scheduler.
5. **Session has not ended** → hold (`session_not_ended`). Never delete an in-flight consult.
6. A patient with a pediatric consult and a general consult is decided **per recording**, not once for the whole account.
7. Media delete runs only when `ARCHIVAL_HARD_DELETE_ENABLED` is true. Until rec-33 flips that flag, finalize severs access, records the plan, and tells the patient the truth (`severed_only`).

### Founder confirmation (surfaced — no response yet)

**Surfaced 2026-08-22** with this rule. **Response: not received.** The code may ship; the destroy path is not turned on. If counsel reverses REC5-D7, change the hold test (cutoff vs request), not the provider-delete machinery.

### `deletion_reason` (patient-initiated vs retention expiry)

```
patient_erasure_country=<CC>_specialty=<spec>_years=<n>[_untilAge=<n>]_provider=twilio_composition_source_recordings=intact
patient_erasure_country=<CC>_specialty=<spec>_years=<n>[_untilAge=<n>]_provider=supabase_storage
```

Grep `patient_erasure_` vs rec-31's `retention_expired_`.

### Held-back attribution (no archival-worker edit)

`account_deletion_audit.notes` stores JSON: enumerated / deleted / held_back / policy_id / cutoff / artifact_id. The archival worker's later row is still `retention_expired_…` (rec-31 contract, delete loop untouched). Attribution is the erasure audit + this join, not a rewritten later reason.

### Ops query — what happened to this patient's recordings

```sql
SELECT
  a.id AS erasure_audit_id,
  a.patient_id,
  a.finalized_at,
  a.notes,
  h.artifact_id,
  h.deleted_at,
  h.deletion_reason,
  h.policy_id
FROM account_deletion_audit a
LEFT JOIN archival_history h
  ON h.session_id IN (
    SELECT cs.id FROM consultation_sessions cs WHERE cs.patient_id = a.patient_id
  )
WHERE a.patient_id = $1
ORDER BY a.finalized_at DESC NULLS LAST, h.deleted_at DESC NULLS LAST;
```

`notes.erasure.held[].artifact_id` are the carve-outs. Later `archival_history` rows for those IDs are the deferred deletes.

### Access / `isRevoked`

- Legacy `recordings/patient_<uuid>/` prefix still written.
- Each live Twilio row also writes `twilio-composition:<CJ…>` (REC1-D1). `isRevoked` matches via `prefix.includes(compositionSid)`.
- **`isRevoked` still fail-open** on lookup error. Not flipped (live authZ). **Recommend fail-closed** in a later task: a revocation lookup error should deny mint, not grant it.

### Ordering

Revocation → eligible media destroy (flag-gated) → PII scrub → DM (non-fatal, outcome-accurate) → `finalized_at`. Destroy/scrub failure does not stamp. Re-run of a finalized row is a no-op. Cancel during grace never reaches destroy.

### Flag

`ARCHIVAL_HARD_DELETE_ENABLED` default remains `'false'`. Flip is rec-33.

---

**Last Updated:** 2026-08-22.
