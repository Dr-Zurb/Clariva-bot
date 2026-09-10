# EXECUTION ORDER — p5 recording-governance-v2 access + retention

> Sibling document of [`plan-p5-recording-governance-v2-access-and-retention-batch.md`](../plan-p5-recording-governance-v2-access-and-retention-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (5 waves)

```
[ ENTRY CONDITION — not a wave, no agent work ]
  p1's acceptance gate green AND rec-05's backfill run in production.
  Four of the seven tasks read recording_artifact_index. Do not open Wave 1 before this.

Wave 1 (Reachability — ~6h, 2 parallel lanes — fully independent):
  Lane α  ──── rec-28 (L, Sonnet)                                   [timeline]
  Lane β  ──── rec-29 (M, Sonnet)                                   [player]

Wave 2 (Notification symmetry — ~3.5h, single lane sequential):
  Lane α  ──── rec-30 (M, Sonnet)

Wave 3 (Deletion reaches the provider — ~6h, single lane sequential):
  Lane α  ──── **rec-31 (L, Opus)**

Wave 4 (Patient erasure — ~6h, single lane sequential):
  Lane α  ──── **rec-32 (L, Opus)**

Wave 5 (Activation + close — ~6.5h agent time + a calendar soak, single lane sequential):
  Lane α  ──── rec-33 (M, Composer / Founder)
  ⏸ [ dry-run soak window ~30 days — founder review, no agent work ]
  Lane α  ──── (continues) ──> rec-34 (M, Sonnet + Founder)
```

**Total wall-clock with parallelism:** ~28h of work, **plus** Wave 5's ~30-day soak window.
**Total agent-time (sequential equivalent):** ~33h.

The **agent-time** bottleneck is Waves 3 → 4: two Opus tasks that cannot be parallelised, because rec-32 consumes rec-31's provider-delete wrapper, its recorded success/404 decision and its `deletion_reason` convention rather than re-deriving any of them. The **calendar** bottleneck is Wave 5's dry-run soak, which is wall-clock waiting rather than work — start it as soon as rec-31 is merged, since the preview is reviewable while the flag is still off.

### Wave 1 lane gate (§5 of the guidelines, all six checked)

1. **Separate chat today, zero peeking?** Yes. rec-28 is a patient-scoped read aggregate plus a pane in the patient-profile shell; rec-29 widens the replay availability and mint contract and rewrites the player's mode handling.
2. **Disjoint files?** Yes, with one exception: **both touch the frontend API client** (`frontend/lib/api.ts` — rec-28 adds a timeline helper, rec-29 widens the replay types). That is a merge conflict on one shared surface, not a logical dependency — the §5 allowance. Run the lanes in separate worktrees and expect to resolve one block of additions.
3. **Does Lane β consume Lane α's output?** No.
4. **Does Lane α consume Lane β's output?** No — **and REC5-D3 is what guarantees it.** The timeline reads `recording_artifact_index` directly for artifact presence rather than asking the replay-availability contract, which is exactly the surface rec-29 is changing. Had rec-28 been built on the availability endpoint, these could not be lanes.
5. **Does any task in this wave consume both lanes?** No. They converge at the wave gate.
6. **Each lane ≥ 1h?** Yes — ~6h and ~5h.

To stay single-threaded, collapse Wave 1 to Shape A (`rec-28 ──> rec-29`) and lose ~5h of wall-clock. Nothing else changes.

---

## Lane-by-lane details

### Wave 1 — Reachability (2 parallel lanes — fully independent)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [rec-28](./task-rec-28-doctor-consult-timeline.md) | L | Sonnet | `patients-v2/[id]/page.tsx` (whole file, delegation at L72–80); `PatientDetailHydrated.tsx`; `CenterPane.tsx:66–82`; `EndedCard.tsx:18–130`; `056_recording_artifact_index.sql` (whole file); `patient-overview-service.ts` (the sibling aggregate to mirror); `recording-archival-worker.ts:256–291` (the read pattern); `recording-track-service.ts:761–820` (what you are deliberately **not** calling) | A pane **inside** the existing patient-profile shell — no new top-level route and no "Recordings" tab (REC-D23, REC5-D2). Zero Twilio calls in the aggregate (REC5-D3), asserted by a test that stubs the seam to throw. Read-only: renders no mint, because a mint notifies the patient. |
| 0 | [rec-29](./task-rec-29-multi-composition-replay-player.md) | M | Sonnet | `RecordingReplayPlayer.tsx` (whole file, 688 lines); `recording-track-service.ts:166–190,706–820`; `recording-access-service.ts:264–323,350–385,720–960`; `ConsultArtifactsPanel.tsx` (whole file); p4 `rec-27`'s recorded composition count from a pause-heavy smoke consult; `rec-18`'s landed marker surface if it shipped | Fully independent of Lane α all wave. Ordering is `startedAt` ascending (REC5-D4); nothing merged, concatenated or silently chosen. **Consumes** p3's `rec-18` gap renderer and writes no gap logic of its own — see the plan's §Coordination boundaries for the land-order and the fallback. |

**Branch suggestion:** one branch per lane, Lane β in a `git worktree` so the two chats do not contend for the working tree.

### Wave 2 — Notification symmetry (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [rec-30](./task-rec-30-symmetric-replay-notification.md) | M | Sonnet | Batch plan **§Surfaced during planning** (non-negotiable — it corrects the charter); `recording-access-service.ts:517–625`; `notification-service.ts:2180–2200,2364–2588,2596–2710`; `dashboard-events-service.ts`; `transcript-pdf-service.ts:875–925` (the **second** call site); `tests/unit/services/notification-service-mutual-replay.test.ts` (whole file); `utils/dm-copy.ts` | **Both directions already ship** — this is coverage and observability, not a build (REC5-D9). The substantive gap is that support-staff replays never reach the patient. Runs after Wave 1 so rec-29's answer on per-segment notification volume is known. Adds **no** suppression path (REC-D24), and authors no attestation copy (p2 owns it). |

### Wave 3 — Deletion reaches the provider (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **[rec-31](./task-rec-31-twilio-reaching-hard-delete.md)** | L | **Opus** | `recording-archival-worker.ts` (whole file, 755 lines — incl. the locking claim at L31–35); `twilio-compositions.ts` (whole file — note there is **no** DELETE wrapper); `storage-service.ts` (whole file, not-found-is-success at L106–121); `057_archival_history.sql` (whole file); `env.ts:556–594`; `admin.ts` (whole file); `regulatory-retention-service.ts` (read-only); **p1 `rec-02`'s recorded `storage_uri` convention** | Irreversible external deletion, and the first of its kind here. Blocks on nothing inside p5, but **if a Twilio-hosted row cannot be distinguished from a Supabase-hosted one by URI alone, stop and surface** — that convention is rec-02's (REC1-D1). New capability goes behind the existing test seam (REC5-D5). Failure never stamps (REC5-D6). Flag stays `false` (REC5-D10). No migration (REC5-D1). |

### Wave 4 — Patient erasure (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **[rec-32](./task-rec-32-dpdp-patient-erasure-path.md)** | L | **Opus** | Its own 🚩 section first; **rec-31 as merged** (wrapper + 404 decision + `deletion_reason` convention); `account-deletion-worker.ts` (whole file, 598 lines); `recording-access-service.ts:387–461` (incl. the bridging comment at L391–403 that says the Twilio-prefixed entry is *not* wired); `regulatory-retention-service.ts` (whole file); `recording-archival-worker.ts:299–327,376–418,671–754`; `054_...sql`; `055_...sql` + `058_...sql` **read-only**; `utils/dm-copy.ts` | Waits on rec-31 — which is why Waves 3 and 4 are not one wave with two lanes. Retention outranks erasure and the carve-out is recorded, not implied (REC5-D7); **the reading itself needs counsel before the destructive half ships** (REC5-D8). Must prove revocation actually blocks — a denial audit row, not merely a revocation row. Patient copy goes through the builder. |

### Wave 5 — Activation + close (single lane sequential, with a calendar pause)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [rec-33](./task-rec-33-retention-activation-runbook.md) | M | Composer / **Founder** | Batch plan REC5-D8 / REC5-D10 + Risk 8; `env.ts:556–594`; `admin.ts` (whole file — `CRON_SECRET` gate, 60-day cap, as-of-future semantics); `recording-archival-worker.ts:334–418,505–537`; `058_regulatory_retention_policy_seed.sql` (whole file, **read-only**); `routes/cron.ts`; rec-31's recorded provider decisions | ~2.5h of document work; the rest is founder wall-clock. The legal confirmation is a **founder** action (REC5-D8). **The agent never flips the flag — not in `.env`, not in `.env.example`, not "temporarily to test" — and never edits `058`** (REC5-D10). A value change lands as a new versioned policy row, which is a migration → STOP and surface. The flip is not a phase gate: p5 may close with the flag still `false`. |
| ⏸ | — | — | — | — | **Dry-run soak ~30 days** (`env.ts:566–571`). Wall-clock, not work. Founder reviews the worker's dry-run against `GET /api/v1/admin/archival-preview`. |
| 1 | [rec-34](./task-rec-34-program-close-gate.md) | M | Sonnet + Founder | Batch plan acceptance gate + charter §Success metrics / §Reversals; [program README](../../README.md); every phase's acceptance gate; rec-30's symmetry audit (evidence for metric 2); rec-33's sign-off line or its recorded decision not to flip; `recording-access-service.ts:254–323` (Path B at L295–320 is the code you may delete) and `:350–369`; April `plan-02` / `plan-07` / `plan-08`; `patient-health-hub/README.md:21–31,40–53`; `DEFINITION_OF_DONE.md` | Closes the **program**, not just the batch. Retires the `consultation_transcripts` fallback **only if** the backfill residue is zero — otherwise records why not. Measures all four charter metrics on production data or records why a metric is not yet measurable. |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| rec-28 | L | Sonnet | Largest by line count and deliberately not Opus: additive, read-only, existing schema, existing shell, nothing irreversible. A long checklist rather than an unsolved design. |
| rec-29 | M | Sonnet | A contract widening from one to many against an ordering rule the service already applies. Its boundaries with p3 and with the OTP gate are handled by scope, not by model tier. |
| rec-30 | M | Sonnet | Mostly reading four call sites and writing down what is actually true. The one genuine decision — the dashboard-only channel carve-out — is escalated, not resolved. |
| **rec-31** | L | **Opus** | Irreversible destructive call to a second external provider, first of its kind in the codebase. Its central question — when may `hard_deleted_at` be stamped when two independently-failable destructive calls are involved, in a table with no provider column — is audit-integrity judgement. It also has to reconcile a documented lock the code does not take. |
| **rec-32** | L | **Opus** | Irreversible, patient-triggered, and must hold statutory erasure and clinical retention in tension with an audit trail that survives the argument. It also reverses a legal position migration 054 states in writing. |
| rec-33 | M | Composer / **Founder** | The decision is not an agent's to make. A model cannot confirm retention law and must not appear to; a confident wrong citation is worse than an unanswered question. The agent's contribution is documentation only. |
| rec-34 | M | Sonnet + Founder | Verification, measurement and doc sync. Its one code deletion is evidence-gated and revertible. The founder owns the smoke tests and the sign-off. |

**Exactly two Opus tasks, in separate waves** — at the ≤1-per-wave / ≤2-per-batch cap in [EXECUTION-ORDER-GUIDELINES.md](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md). Both are irreversible-deletion tasks. Size did not enter the decision: the largest task in the batch, rec-28, runs on Sonnet.

---

## Acceptance gates per wave

**Wave 1 entry**

- [ ] p1's phase gate is fully green.
- [ ] `rec-05`'s backfill has run **in production**, and `SELECT count(*) FROM recording_artifact_index` is non-zero.
- [ ] `ARCHIVAL_HARD_DELETE_ENABLED` is `false`.

**Wave 1**

- [ ] A doctor opening a patient profile sees that patient's consults in one place — date, modality, duration and which artifacts exist — and can click through to the existing `EndedCard` drill-down.
- [ ] No new top-level route and no "Recordings" tab anywhere. `EndedCard.tsx` and `ConsultArtifactsPanel.tsx` are unmodified.
- [ ] The aggregate makes **zero** Twilio calls, proven by stubbing the seam to throw and watching the endpoint still succeed.
- [ ] `hard_deleted_at` rows render per a decision recorded in the task file, and `patient_self_serve_visible` is not used as a doctor-side filter.
- [ ] The timeline triggers no replay mint on render.
- [ ] A session with two audio and two video compositions offers all four as ordered, separately playable segments; each mint writes its own audit row.
- [ ] A single-composition session is behaviourally and visually identical to today (regression lock).
- [ ] Patient video replay still traverses the existing OTP gate and does **not** re-prompt between segments of one consult.
- [ ] Gap markers render per composition, or the marker surface is byte-unchanged with the case recorded in the task file.
- [ ] Both workspaces: typecheck + lint + tests green, with no live Twilio calls in the suite.

**Wave 2**

- [ ] All Wave 1 gates still green.
- [ ] A **support-staff** replay notifies the patient. Doctor and patient replays both still notify the other party, at both call sites (replay **and** transcript download).
- [ ] Every notification skip is observable — a patient with no reachable channel produces a queryable signal rather than silence.
- [ ] The dashboard-only channel carve-out is upheld with a written reason or overturned with founder confirmation. Not left ambiguous.
- [ ] `rg` finds no suppression path: no preference column, no toggle, no digest, no dedupe added to reduce volume.
- [ ] The existing mutual-replay test file is extended rather than duplicated. No migration (REC5-D1).

**Wave 3**

- [ ] All Wave 2 gates still green.
- [ ] Hard delete of a Twilio-hosted artifact **actually removes the composition from Twilio**, verified by a follow-up fetch returning not-found — not by our own log line.
- [ ] **A forced provider failure leaves `hard_deleted_at` NULL, writes no success `archival_history` row, is counted, and retries on the next cron tick** (REC5-D6), proven by test.
- [ ] The success/404 interpretation is decided and written down rather than inherited from Supabase's not-found-is-success rule.
- [ ] The Supabase path is unchanged; a row whose backend cannot be determined is skipped, never guessed.
- [ ] Dry-run makes zero destructive calls and attributes a backend per candidate.
- [ ] The `deletion_reason` convention is extended and documented so rec-32 and ops consume one convention.
- [ ] The worker header's locking claim is either made true or restated to match the re-verify reality, and the choice is recorded in writing.
- [ ] `ARCHIVAL_HARD_DELETE_ENABLED` default in `env.ts:573` is still `'false'`. No migration, no new column, no new env var.

**Wave 4**

- [ ] All Wave 3 gates still green.
- [ ] The erasure-vs-retention rule is written down first, resolved from `regulatory_retention_policy` rather than hard-coded, with the counsel gate named prominently.
- [ ] Artifacts past retention are destroyed through rec-31's wrapper; artifacts under retention are access-revoked, scheduled, and their carve-out recorded with the policy that justified it.
- [ ] **After erasure, a mint attempt is denied and audited as a denial** — the proof is that revocation blocks, not that a revocation row exists.
- [ ] A doctor can still replay a held artifact; the patient cannot.
- [ ] A provider failure leaves the request unfinalized and retryable, with nothing falsely stamped.
- [ ] The patient explainer copy matches what actually happened to the data, through the DM builder.
- [ ] Grace window, idempotency and the existing worker contract are unchanged. No second deletion path. No doctor-facing erase affordance. No retention value edited.

**Wave 5**

- [ ] All Wave 4 gates still green.
- [ ] The dry-run report is human-reviewable and agrees with `GET /api/v1/admin/archival-preview` for the same horizon, and contains no PHI (REC5-D11).
- [ ] Zero undetermined-backend candidates remain in the population.
- [ ] The `058` seed values carry a written, dated, sourced founder/counsel sign-off — **or** the flag stays `false` and that is recorded as the deliberate outcome. A phase that shipped a safe deletion mechanism and correctly declined to arm it is a success.
- [ ] The flip ritual is written down with preconditions, the watch list, rollback, and rollback's limits (a deleted composition does not come back).
- [ ] All four charter metrics measured on production data and written into the program README, or recorded as not-yet-measurable with the reason.
- [ ] The transcript fallback is retired **only if** the backfill residue is zero; the decision and its evidence are recorded either way.
- [ ] April Plans 02 / 07 / 08 point at this program's reversals, and the charter's REC-D24 row is corrected.
- [ ] The `phh` hand-off note exists, states guarantees and caveats, and is linked from the `phh` README (REC5-D12).
- [ ] `git diff --stat backend/migrations/` is empty for the whole phase. No RLS change. No new env var.
- [ ] Founder sign-off on the program's core promise.

---

## Cost estimate

| Wave | Tasks | Sonnet chats | Opus chats | Founder | Wall-clock |
|---|---|---|---|---|---|
| Entry | — | 0 | 0 | — | blocks on p1 |
| 1 | rec-28, rec-29 | 2 | 0 | — | ~6h (parallel) |
| 2 | rec-30 | 1 | 0 | 1 decision | ~3.5h |
| 3 | rec-31 | 0 | 1 | — | ~6h |
| 4 | rec-32 | 0 | 1 | 1 counsel gate | ~6h |
| 5 | rec-33, rec-34 | 1 + 1 (Composer) | 0 | 2 (legal confirmation + sign-off) | ~6.5h + ~30-day soak |

**Fresh chat per task.** Pre-load the task file, the [charter](../../plan-recording-governance-v2-charter.md) decision lock, the [batch plan](../plan-p5-recording-governance-v2-access-and-retention-batch.md)'s REC5-D lock, and the source files at the line ranges listed above. Estimated turns per task: rec-28 6–8 · rec-29 5–7 · rec-30 4–6 · rec-31 6–8 · rec-32 6–8 · rec-33 3–5 · rec-34 4–6.

**Hard stops — surface, do not resolve in-flight:**

- **Any migration.** This phase is specced migration-free (REC5-D1); `054`–`058` already carry the retention, registry, revocation and archival-audit shapes. A task that needs a schema change means the phase was mis-specced.
- **Any RLS policy change** on `recording_artifact_index`, `archival_history`, `signed_url_revocation` or `account_deletion_audit`.
- **Any `FOR UPDATE` / advisory-lock path** in the archival worker — PostgREST cannot express it, so this means an RPC or raw SQL.
- **Any edit to `058_regulatory_retention_policy_seed.sql`** or any retention value (REC5-D8 — founder and counsel only).
- **Any flip of `ARCHIVAL_HARD_DELETE_ENABLED`** outside rec-33's documented founder ritual (REC5-D10).
- **Any patient-facing surface** — `phh` owns it (REC5-D12).
- **Any doctor-facing delete, hide or erase affordance** (REC-D5).
- **Any PHI in a retention or deletion log line** (REC5-D11).

---

## References

- [Batch plan](../plan-p5-recording-governance-v2-access-and-retention-batch.md)
- [Charter](../../plan-recording-governance-v2-charter.md)
- [Program README](../../README.md)
- Prior phases: [p1](../../p1-artifact-registry/plan-p1-recording-governance-v2-artifact-registry-batch.md) · [p2](../../p2-mandatory-audio/plan-p2-recording-governance-v2-mandatory-audio-batch.md) · [p3](../../p3-pause-integrity/plan-p3-recording-governance-v2-pause-integrity-batch.md) · [p4](../../p4-video-escalation-control/plan-p4-recording-governance-v2-video-escalation-control-batch.md)
- Hand-off target: [`patient-health-hub`](../../../../13-08-2026/patient-health-hub/README.md)
- [EXECUTION-ORDER-GUIDELINES.md](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [PHASED-PLANS-GUIDE.md](../../../../../../process/PHASED-PLANS-GUIDE.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- Exec-order precedent imitated: [`crc` p4](../../../../12-08-2026/consult-room-checkin/p4-realtime-and-channel-gaps/Tasks/EXECUTION-ORDER-p4-consult-room-checkin-realtime-and-channel-gaps.md)
