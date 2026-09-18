# Task rec-33: Retention activation runbook

## 17 Aug 2026 — Batch [p5-access-and-retention](../plan-p5-recording-governance-v2-access-and-retention-batch.md) — Wave 5 — **M, ~2.5h agent + founder time**

---

## Task overview

**This is mostly a founder and ops task, and it is shaped accordingly.** It writes almost no code. What it produces is a document, a completed review, and a recorded decision — and one of those decisions is not an agent's to make.

The retention system has existed since April 2026 and has never deleted anything. Two reasons: `recording_artifact_index` was empty (p1 fixed that), and `ARCHIVAL_HARD_DELETE_ENABLED` defaults to `'false'` (`env.ts:573-576`). That default is deliberate — the header at **L566-571** says so plainly: *"Shipped as `'false'` in production for the first 30 days post-deploy — the ops runbook … describes the flag-flip ritual once the dry-run output has been stable and the seed policy values have been legal-reviewed."*

That runbook was referenced but never written. This task writes it, performs the first dry-run review against real data, verifies the admin preview surface, and records the state of the one blocking precondition: **counsel confirming `058`'s retention values.**

**The flip itself is not part of this task and is not a phase gate.** It happens on the ops calendar after counsel signs off and the dry-run output has been stable. The phase closes with the flag still `false`.

**Why the legal step is a founder task, not an agent task.** Every value in `058_regulatory_retention_policy_seed.sql` is an owner-must-confirm placeholder, and the migration says so in a shouting block at **L15-21**: *"Every value below is illustrative until owner confirms … Wrong values are a compliance failure in both directions."* The values cite Indian Medical Council Regulations 2002 §1.3.1 (3 yr general baseline), the Limitation Act 1963 for minors (retain to age 21), a 7 yr gynecology practice norm marked "verify per state", and a 7 yr international OECD-median fallback. **Under-retention means we cannot produce records under subpoena. Over-retention is a DPDP data-minimisation problem. And a value set too low deletes clinical records early — irreversibly, with no undo, no soft-delete tier, and no backup path specified anywhere in 055/056/057.** No agent should pick that number.

**Estimated time:** ~2.5h of document work, plus founder time for the legal step and the review.
**Status:** 📝 Runbook shipped 2026-08-22. Founder steps **outstanding** (058 confirmation + production dry-run #1 / #2). Flag still `false`. Not a phase gate.
**Hard deps:** [`rec-31`](./task-rec-31-twilio-reaching-hard-delete.md) and [`rec-32`](./task-rec-32-dpdp-patient-erasure-path.md) green and merged. A runbook for activating a delete path that does not yet reach the provider would document the wrong ritual.
**Source:** REC5-D8, REC5-D10. `env.ts:566-571`. `058` header L15-42.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)

---

## Model & execution guidance

**Recommended model:** **Composer for the document; Founder for every decision inside it.**

There is no meaningful code change here, so a coding-tier model is the wrong tool. Composer can draft the runbook and run the read-only preview calls. The dry-run interpretation, the go/no-go, and the legal confirmation are the founder's — and the task is not done until the founder's part is recorded, not merely requested.

**New chat?** **Yes**, and keep it short. Pre-load:

- This task + the [batch plan](../plan-p5-recording-governance-v2-access-and-retention-batch.md) REC5-D8 / REC5-D10 + Risk 8.
- `backend/src/config/env.ts` — **L556-594.** `ARCHIVAL_HARD_DELETE_ENABLED` **L573-576** (default `'false'`) and its soak narrative **L566-571**; `ARCHIVAL_DRY_RUN_REPORT_DAYS` **L588-594** (default 7, "enough for an ops weekly review cadence").
- `backend/src/routes/api/v1/admin.ts` — **the whole file (130 lines).** The `CRON_SECRET` shared-secret gate **L36-41**, the route **L63-130**, the 60-day `days` cap, and the as-of-future semantics explained at **L57-61**.
- `backend/src/workers/recording-archival-worker.ts` — **L334-418** (`scanHideCandidates`, `scanDeleteCandidates` — what the preview actually renders) and **L505-537** (the dry-run early return, so you can state exactly what dry-run does and does not touch). Plus whatever `rec-31` added to the dry-run output.
- `backend/migrations/058_regulatory_retention_policy_seed.sql` — **the whole file (103 lines), read-only.** The legal-review block **L15-21**, the pediatric rationale **L23-28**, the gynecology caveat **L30-33**, the international fallback **L35-38**, the four seeded rows **L44-89**, and the verification query **L94-102**.
- `backend/src/routes/cron.ts` — the archival cron block, so the runbook says which schedule the flip actually affects.
- [`rec-31`](./task-rec-31-twilio-reaching-hard-delete.md)'s recorded provider decisions and its `deletion_reason` convention.

**Estimated turns:** 3–5.

---

## Acceptance criteria

### 1. The runbook document

- [x] A runbook exists in the repo docs (not only in this task file) that a **second person could execute without asking a question.** That is the bar: if it needs a conversation, it is not a runbook.
- [x] It states what `ARCHIVAL_HARD_DELETE_ENABLED` actually gates: the hard-delete phase only. **The hide phase is never gated by it** (`recording-archival-worker.ts` header L15-21, and the hide phase's own path) and is reversible — support staff can flip `patient_self_serve_visible` back.
- [x] It states plainly which parts are reversible and which are not. Hide: reversible. Hard delete: **irreversible, no undo, no soft-delete tier, no backup path.**
- [x] It lists the preconditions for the flip, all of which must be recorded as met:
  - Counsel has confirmed `058`'s values (criterion 3).
  - Dry-run output has been reviewed and is stable across at least two consecutive reviews.
  - `rec-31` and `rec-32` are shipped, so a deletion actually reaches the provider.
  - `recording_artifact_index` is populated and p1's backfill has completed.
- [x] It gives the **rollback**: set the flag back to `'false'`. And it says what rollback does *not* do — media already deleted is gone. That sentence is the most important one in the document.
- [x] It names the owner of the flip and the review cadence after it.

### 2. First dry-run review, against real data

- [ ] Run the archival dry-run against production and **write down the numbers**: hide-phase candidates, hard-delete-phase candidates, and (from `rec-31`) the Twilio-hosted / Supabase-hosted / unclassifiable split.
- [x] Any **unclassifiable** `storage_uri` count above zero is a **blocker for the flip**, not a footnote. It means the index contains rows the delete path cannot route, and `rec-31` made that a loud failure precisely so it surfaces here. *(Written into the runbook. Count itself is unknown until review #1.)*
- [ ] Verify `GET /api/v1/admin/archival-preview` works against real data at a chosen horizon, and record the horizon and the response shape. Note the 60-day cap and the `CRON_SECRET` auth requirement so the next operator does not fight the endpoint.
- [ ] Sanity-check the numbers against the seeded policies. A 3-year general baseline on a product that started recording in April 2026 should produce **zero** general-medicine delete candidates today. **If it produces a non-zero count, stop** — either a policy value or a session timestamp is wrong, and that is the exact scenario where deletion happens early.
- [ ] Confirm the dry-run mutated nothing, at the database and at the provider. Say how you confirmed it.
- [ ] Record the review date and reviewer. Schedule the second review.

### 3. The founder's legal confirmation (the blocking precondition)

- [x] Present `058`'s four seeded rows to the founder in plain language, with what each would delete and when: `IN/*` 3 yr · `IN/pediatrics` 3 yr **or** until age 21, whichever is later · `IN/gynecology` 7 yr · `*/*` 7 yr. All four carry `patient_self_serve_days = 90`.
- [x] Include each row's `source` citation verbatim and flag the two the migration itself hedges on: gynecology ("Verify per state") and the international fallback ("OECD-median").
- [x] State the consequence of error in both directions, in one sentence each. Under-retention: cannot produce records under subpoena. Over-retention: DPDP data-minimisation exposure and storage cost. **Too low: clinical records destroyed early, unrecoverably.**
- [x] Record the outcome in this file as **confirmed** (with date and who confirmed) or **outstanding** (with a named owner). **Blank fails this task.**
- [x] **No task in this phase changes a value.** If counsel returns different numbers, that is a new migration, which is an Opus-plus-human decision and out of this phase entirely (REC5-D1, REC5-D8). Capture it to `docs/Work/capture/inbox.md` and surface it.
- [x] Note whether the same review should cover the charter's separate **REC-D2** legal gate (the DPDP basis for the audio mandate, owned by [`p2`](../../p2-mandatory-audio/)). Two legal questions, one counsel conversation — worth batching, but they are distinct decisions and must not be conflated in the record.

### 4. What this task does not change

- [x] `ARCHIVAL_HARD_DELETE_ENABLED`'s **default stays `'false'`** in `env.ts:573-576`. No code change.
- [x] No retention value edited in `055` or `058`.
- [x] No worker logic, no route logic, no schema. If the runbook reveals that the flip needs a code change to be safe, **that is a finding to surface**, and it belongs in a new task — not folded in here.
- [x] `.env.example` may gain or clarify a comment pointing at the runbook. Nothing else.

### 5. Observability for the flip

- [x] The runbook states which log events and per-run totals to watch in the first 48 hours after the flip, and what "wrong" looks like: a delete count materially above the last dry-run's candidate count, any unclassifiable-URI failure, or any `archival_history` row whose reason string does not match `rec-31`'s convention.
- [x] It names the abort condition and who has authority to abort.
- [x] **No PHI in anything the runbook asks an operator to paste into a ticket.** Session IDs, artifact IDs, composition SIDs, counts and policy IDs are fine; patient names are not.

### Out of scope

- **Flipping the flag.** That happens on the ops calendar after this task, and it is explicitly **not a phase gate** (REC5-D10). The phase closes with the flag `false`.
- **Changing any retention value.** REC5-D8. A new migration if counsel says so, out of this phase.
- The provider-delete path — [`rec-31`](./task-rec-31-twilio-reaching-hard-delete.md). The erasure path — [`rec-32`](./task-rec-32-dpdp-patient-erasure-path.md).
- Building an ops dashboard UI on top of the preview endpoint.
- Changing the admin endpoint's `CRON_SECRET` auth posture. It is noted as unsuitable for a browser client (`admin.ts:10-14`); improving it is a separate decision.
- The hide phase's timing or the 90-day window (REC-D25).
- `p2`'s REC-D2 legal gate as a deliverable — this task only notes the batching opportunity.
- Program close, metrics, doc drift — [`rec-34`](./task-rec-34-program-close-gate.md).

---

## Scope Guard

- **Expected files touched: 1–3.** One new runbook document under `docs/`, this task file, and at most one comment line in `.env.example` pointing at the runbook.
- **DO NOT** change `ARCHIVAL_HARD_DELETE_ENABLED` or its default.
- **DO NOT** edit `055`, `058`, or any retention value. **REC5-D8.**
- **DO NOT** modify `recording-archival-worker.ts`, `admin.ts`, `cron.ts`, or `env.ts` logic.
- **DO NOT** write a migration.
- **DO NOT** run the worker with the flag on. Dry-run only.
- **DO NOT** record the legal step as done on the basis of an agent's reading of a regulation.

---

## Global safety gate

- **Data touched?** **No writes.** Read-only dry-run scans and read-only preview calls. RLS unchanged.
- **Any PHI in logs?** **No** — and the runbook explicitly instructs operators not to paste PHI into tickets.
- **External API or AI call?** No. Dry-run does not reach the provider, and criterion 2 requires confirming that.
- **Retention / deletion impact?** **This task is the gate in front of the largest deletion impact in the program** — but it performs none of it. It documents the ritual and records whether the precondition is met.

---

## Done when

- A runbook exists in the repo that a second person could execute unaided, stating what the flag gates, what is reversible and what is not, the four preconditions, the rollback and its limits, the owner and the abort condition; the first dry-run review has been performed against production with candidate counts and the provider split written down; zero unclassifiable `storage_uri`s (or the flip is blocked and that is recorded); the admin preview endpoint is verified with its horizon recorded; the founder's counsel-confirmation step for `058` is recorded as confirmed with a date or outstanding with a named owner; `ARCHIVAL_HARD_DELETE_ENABLED` is still `'false'` with its default unchanged; no retention value edited, no migration, no worker logic changed.

---

## Related

- Batch plan: [`plan-p5-recording-governance-v2-access-and-retention-batch.md`](../plan-p5-recording-governance-v2-access-and-retention-batch.md) — REC5-D8, REC5-D10; Risk 8
- Charter: [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md) — REC-D2 is the precedent for a founder-owned legal gate
- Execution order: [`EXECUTION-ORDER-p5-recording-governance-v2-access-and-retention.md`](./EXECUTION-ORDER-p5-recording-governance-v2-access-and-retention.md)
- Hard deps: [`rec-31`](./task-rec-31-twilio-reaching-hard-delete.md), [`rec-32`](./task-rec-32-dpdp-patient-erasure-path.md)
- Other founder-owned legal gate: [`p2 — mandatory audio`](../../p2-mandatory-audio/) (REC-D2)
- Next: [`rec-34`](./task-rec-34-program-close-gate.md)

---

## Outcome — 2026-08-22

**Runbook:** [`docs/Reference/engineering/operations/setup/recording-archival-activation-runbook.md`](../../../../../../Reference/engineering/operations/setup/recording-archival-activation-runbook.md)

**Flag:** `ARCHIVAL_HARD_DELETE_ENABLED` default still `'false'`. Not flipped. Not a phase gate.

**Finding (no code change):** `POST /cron/recording-archival` always runs the **hide** phase for real. Reviews must use `GET /api/v1/admin/archival-preview`. The same flag also enables rec-32 media destroy on the next account-deletion finalize.

**`058` legal confirmation:** **outstanding.** Owner: **founder (Dr Abhishek Sahil).** Presented in runbook §7 (four rows, verbatim `source`, gynecology + OECD hedges, under/over/too-low consequences). REC-D2 (audio mandate) is a separate question that can share the counsel call.

**First production dry-run:** **outstanding.** Owner: **founder.** Agent session had no production credentials and did not call the preview against live data. Horizons to use: `days=0` and `days=7`. Second review target: 7 days after review #1 (placeholder 2026-08-29 if #1 is today).

If counsel returns different retention numbers: **do not edit `058` here.** New migration, Opus + human, out of this phase. Capture to inbox.

---

**Last Updated:** 2026-08-22.
