# Task rec-34: Program close gate — metrics, doc drift, hand-off

## 17 Aug 2026 — Batch [p5-access-and-retention](../plan-p5-recording-governance-v2-access-and-retention-batch.md) — Wave 5 — **M, ~4h**

---

## Task overview

This is the last task of the last phase, so it closes the **program**, not just the batch. Four jobs:

1. **Verify** every phase gate and this phase's gate, for real.
2. **Measure** all four charter success metrics on production data and write them into [`../../README.md`](../../README.md). The program README says explicitly: *"Do not mark this program Closed until metrics 1 and 2 are measured on production data and written here."*
3. **Sync the doc drift.** April Plans 02 / 07 / 08 still describe behaviour this program reversed. A reader landing on Plan 02 Decision 4 today learns the wrong thing.
4. **Hand off to [`patient-health-hub`](../../../../13-08-2026/patient-health-hub/README.md)** with a precise statement of what p5 guarantees, so `phh` builds against a contract rather than an assumption.

Plus one code action the program owes: **retiring the `consultation_transcripts` fallback** (REC-D19), which p1 deliberately deferred here (p1's REC1-D5: *"Retiring it is a p5 action, not a p1 action"*) — and it is gated on evidence, not on this task's convenience.

**Estimated time:** ~4h agent, plus founder smoke time.
**Status:** ⏸ Mechanical close recorded 2026-08-22. **Program is not Closed** — founder smoke, metrics #1–#4, rec-33 flip, and p1–p4 close gates remain open.
**Hard deps:** rec-28..33 complete. All prior phase gates green.
**Source:** REC-D19 (completion), all four charter success metrics, REC5-D12.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)

---

## Model & execution guidance

**Recommended model:** **Auto / Sonnet** for verification, measurement and doc sync; **Founder** for the smoke tests in criterion 2 and the sign-off in criterion 6.

Not Opus: nothing here is a new design. The one code deletion (the transcript fallback) is small, evidence-gated, and reversible by revert — unlike everything in rec-31/32.

**New chat?** **Yes.** Pre-load:

- This task + the [batch plan](../plan-p5-recording-governance-v2-access-and-retention-batch.md) acceptance gate + the [charter](../../plan-recording-governance-v2-charter.md) §Success metrics and §Reversals.
- [`../../README.md`](../../README.md) — the phase table and the **Runs: none recorded** line you are replacing.
- Every phase batch plan's acceptance gate: [`p1`](../../p1-artifact-registry/plan-p1-recording-governance-v2-artifact-registry-batch.md), [`p2`](../../p2-mandatory-audio/plan-p2-recording-governance-v2-mandatory-audio-batch.md), [`p3`](../../p3-pause-integrity/plan-p3-recording-governance-v2-pause-integrity-batch.md), [`p4`](../../p4-video-escalation-control/plan-p4-recording-governance-v2-video-escalation-control-batch.md).
- [`rec-30`](./task-rec-30-symmetric-replay-notification.md) — its four-axis symmetry audit is your evidence for metric 2.
- [`rec-33`](./task-rec-33-retention-activation-runbook.md) — its sign-off line (or its recorded decision not to flip).
- `backend/src/services/recording-access-service.ts` — **L254–323** (`resolveAudioArtifact`: Path A the index, **Path B the transcript fallback at L295–320** — the code you may delete) and **L350–369** (`resolveVideoArtifact`, after [`rec-04`](../../p1-artifact-registry/Tasks/task-rec-04-replay-resolves-from-index.md)).
- The April docs you will edit: [`plan-02`](../../../../../April%202026/19-04-2026/Plans/plan-02-recording-governance-foundation.md) (Decision 4), [`plan-07`](../../../../../April%202026/19-04-2026/Plans/plan-07-recording-replay-and-history.md), [`plan-08`](../../../../../April%202026/19-04-2026/Plans/plan-08-video-recording-escalation.md) (Decision 10 kept, revoke arithmetic reversed).
- [`patient-health-hub/README.md`](../../../../13-08-2026/patient-health-hub/README.md) — **L21–31** (phase table; p3 "Records read" is the consumer) and **L40–53** (its anchors table, where your hand-off note belongs).
- `docs/Reference/engineering/development/DEFINITION_OF_DONE.md` — the verification gate you are running.

**Estimated turns:** 4–6.

---

## Acceptance criteria

### 1. Full verification

- [x] 1.1 Backend and frontend typecheck, lint and test suites all green. Both workspaces, actually run, output recorded. **See Verification below — frontend `tsc` is pre-existing red; p5 tests green.**
- [x] 1.2 **`git diff --stat backend/migrations/` for this phase is empty.** p5 was specced migration-free (REC5-D1); prove it rather than assuming it.
- [x] 1.3 No RLS policy changed in this phase.
- [x] 1.4 No new environment variable added in this phase.
- [x] 1.5 No PHI in any log line added by rec-28..33. Grep the diffs for name / phone / DOB / reason-text interpolation, not just for the word "log".
- [ ] 1.6 Every phase gate (p1..p4) re-confirmed still green. A regression introduced in p5 that breaks p3's gap markers is p5's problem to find here. **Automated gates unchanged. None Closed — founder smokes + metrics still open. Not re-marked.**
- [ ] 1.7 The p5 phase gate in the batch plan is fully checked, with the two "either/or" items (rec-33's flip, the transcript retirement) resolved one way and the choice recorded. **Either/or recorded (flag not flipped; Path B kept). Full gate is not green — see batch plan honesty pass.**
- [x] 1.8 **`ARCHIVAL_HARD_DELETE_ENABLED`'s default in `env.ts:573` is still `'false'`.** Production may override it via rec-33's ritual; the repo default does not change, ever.

### 2. Measure all four charter metrics on production data

Each needs a number and a method, not an adjective.

- [ ] 2.1 **Metric 1 — Reachability.** Percentage of ended voice **and video** consults with a playable artifact resolvable from `recording_artifact_index` within 5 minutes of the call ending. Baseline: video was **0%**. State the measurement window and sample size. **Historical 0/14. Live 5-min not measured.**
- [ ] 2.2 **Metric 2 — Honesty.** Count of consults where the recording state shown to the patient differed from what was captured. Target zero. Evidence comes from p2's disclosure work and [`rec-30`](./task-rec-30-symmetric-replay-notification.md)'s symmetry audit — **cite them; do not re-derive them.** **No production count. Cite p2 (blocked REC-D2) + rec-30.**
- [ ] 2.3 **Metric 3 — Patient control latency.** Video capture stops within 250 ms of the patient confirming, independent of server round-trip. Founder-measured by stopwatch or client trace on a real consult; p4 owns the behaviour, this task owns the number. **Marks exist. Not measured on a phone.**
- [ ] 2.4 **Metric 4 — Gap visibility.** Every paused window appears in both the player timeline and the transcript, with actor and reason code. Measured on a real consult containing at least one pause — and, given [`rec-29`](./task-rec-29-multi-composition-replay-player.md), ideally one that spans a composition boundary. **Code shipped. Not measured on a real pause consult.**
- [ ] 2.5 **Founder smoke, end to end, on a real consult:** a video consult with an escalation, a revert, a second escalation and a pause; then find it from the patient's profile timeline, play every segment, see the gaps, confirm the patient got the replay DM, and confirm the doctor's dashboard shows the reverse event.
- [x] 2.6 **All four numbers are written into [`../../README.md`](../../README.md)** under `Runs`, replacing "none recorded", with dates and method. **Written as not-yet-measurable.**
- [x] 2.7 If a metric **cannot** be measured yet — insufficient production volume, no video consult with two escalations — **say so with the reason.** An unmeasured metric recorded honestly is a valid close state; a metric asserted without measurement is not.

### 3. Complete REC-D19 — retire the transcript fallback, if and only if the evidence allows

- [x] 3.1 Query production: how many **ended** sessions have **no** `recording_artifact_index` row? That residue is the population Path B is still carrying. **rec-05: 14 / 14 have no index row (`noCompositions`). Live post-hook residue unmeasured.**
- [ ] 3.2 **If the residue is zero**, delete Path B (`recording-access-service.ts:295–320`) along with any flag or comment p1 left behind (p1's REC1-D5), and remove the now-dead `extractCompositionSid` branches only if they are genuinely unreachable. **Skipped — residue not zero.**
- [x] 3.3 **If the residue is non-zero, do not delete it.** Record the count, the reason (which sessions, why the backfill missed them), and leave Path B in place. Removing a fallback that is still load-bearing breaks replay for real consults — the exact finding-#1 failure this program exists to fix, re-introduced at the finish line.
- [x] 3.4 Either way, the decision and its evidence are written into this file **and** into the README, because a future reader will otherwise assume REC-D19 is fully done.
- [ ] 3.5 If deleted: replay still works for every session that has an index row, proven by the existing test suite plus one live check. **N/A — not deleted.**

### 4. Doc-drift sync

- [x] 4.1 [`plan-02`](../../../../../April%202026/19-04-2026/Plans/plan-02-recording-governance-foundation.md) — **Decision 4** (recording-on-by-default with a patient consent checkbox and a re-pitch on decline) is superseded by **REC-D1**. Add a pointer at the decision, not only at the top of the file: someone lands on the decision via search, not via the header.
- [x] 4.2 [`plan-08`](../../../../../April%202026/19-04-2026/Plans/plan-08-video-recording-escalation.md) — **Decision 10 is KEPT and reinforced** (say so explicitly; an unqualified "superseded" banner here would be wrong). **Task 42's revoke-shares-cooldown arithmetic is reversed by REC-D9.**
- [x] 4.3 [`plan-07`](../../../../../April%202026/19-04-2026/Plans/plan-07-recording-replay-and-history.md) — pause kind-scoping fixed (REC-D13), gap rendering added (REC-D17), the durable doctor surface added (REC-D23), and **Task 30's mutual-replay notification hardened rather than replaced** — it already built both directions (see rec-30). Do not tell a reader Task 30 was incomplete in a way it was not.
- [x] 4.4 Pointers are **one line each, at the affected decision**, linking to this program's charter. Do not rewrite the April plans, do not delete their history, and do not restate the reversal in full — the charter's §Reversals table is the single source.
- [x] 4.5 The charter's own **REC-D24 row is corrected** to reflect that the reverse notification direction already existed (batch plan §Surfaced #1, rec-30 axis 1). This is the one charter edit this task is allowed to make, because leaving a known-false statement in the decision lock is worse than editing it.
- [x] 4.6 The `17-08-2026` day README lists this program (if it does not already).
- [x] 4.7 Program README phase table shows all five phases with final status and links.

### 5. Hand-off to `phh` (REC5-D12)

- [x] 5.1 A short hand-off note states exactly **what p5 guarantees** to `phh`: an artifact registry that is populated within N minutes of a consult ending; per-session availability resolvable without a Twilio call; the 90-day patient self-serve window and the video OTP gate unchanged (REC-D25); gap metadata available; and a replay notification that fires in both directions. **Honest: 5-minute populate is not proven.**
- [x] 5.2 It states **what p5 does not build**: any patient-facing surface. `phh` p3 ("Records read") owns transcripts and replay for patients.
- [x] 5.3 It names the **integration points** `phh` should read rather than reinvent: the artifact registry, the availability preflight, the mint path, and the OTP primitive `phh` already plans to reuse (PHH-D3).
- [x] 5.4 It states the **caveats honestly**: the backfill residue from 3.1, whether `ARCHIVAL_HARD_DELETE_ENABLED` is on, and the support-staff notification carve-out's resolution from rec-30.
- [x] 5.5 The note is linked from [`patient-health-hub/README.md`](../../../../13-08-2026/patient-health-hub/README.md) so `phh` finds it without knowing this program's folder layout.
- [x] 5.6 **No patient-facing surface is built here.** Not a preview, not a stub, not a "while I was in there".

### 6. Close

- [x] 6.1 The program README's status moves off "Charter locked; all 5 phases planned" to its true state, with the metric numbers behind it. **True state: p5 coding shipped, program not Closed.**
- [x] 6.2 Anything discovered and not fixed is captured to `docs/Work/capture/inbox.md` as a one-line item with a path or ID — not left in this task file where nobody will look again.
- [ ] 6.3 **Founder sign-off** that the program's core promise holds: audio is an honest disclosed mandate, video is the patient's at every moment, and the record is honest about its own gaps.

### Out of scope

- **Building anything new.** If a gate fails, fix it in the task that owns it or capture it. Do not absorb new work into the close gate.
- **Flipping `ARCHIVAL_HARD_DELETE_ENABLED`** — [`rec-33`](./task-rec-33-retention-activation-runbook.md), founder-owned. This task records the outcome.
- **Editing `058` seed values** (REC5-D10).
- **Rewriting the April plans.** One-line pointers only (4.4).
- **Editing the charter beyond the REC-D24 correction in 4.5.**
- **Any `phh` implementation** (REC5-D12).
- **Any migration.** If the close gate finds something that needs one, capture it as p6-or-later work.

---

## Scope Guard

- **Expected files touched: 6–9.** Program README, this task file, the three April plan docs (one line each), the charter (REC-D24 row only), the `phh` README (one link), the day README, the capture inbox, and — only if criterion 3.2's evidence allows — `recording-access-service.ts` plus its test file.
- **DO NOT** delete Path B unless 3.1's residue is **zero**. This is the single highest-risk line in the task.
- **DO NOT** rewrite April plan content beyond adding pointers.
- **DO NOT** edit the charter except the REC-D24 row (4.5).
- **DO NOT** flip any flag or edit any migration.
- **DO NOT** claim a metric you did not measure. "Not measurable yet, because X" is an acceptable entry; a number without a method is not.
- **DO NOT** start new feature work discovered during verification.

---

## Global safety gate

- **Data touched?** Read-only production queries for the metrics and the backfill-residue count. One possible code deletion (Path B). **No writes, no RLS change.**
- **Any PHI in logs?** **No.** Metric queries return counts and percentages, not rows. Do not paste sample patient data into the README — it is a document people share.
- **External API or AI call?** No new ones.
- **Retention / deletion impact?** This task **records** whether deletion was armed (rec-33's outcome). It arms nothing itself.

---

## Done when

- All four charter metrics are measured on production data with dates and methods and written into the program README (or recorded as not-yet-measurable with the reason); every phase gate p1..p5 is re-confirmed green; `git diff --stat backend/migrations/` is empty for p5 and no RLS or env var changed; the transcript fallback is retired **only** if the backfill residue is zero, and the decision plus evidence is recorded either way; April Plans 02 / 07 / 08 carry one-line pointers at the affected decisions and the charter's REC-D24 row is corrected; the `phh` hand-off note exists, states guarantees and caveats, and is linked from the `phh` README; leftovers are captured to the inbox; founder has signed off.

---

## Related

- Batch plan: [`plan-p5-recording-governance-v2-access-and-retention-batch.md`](../plan-p5-recording-governance-v2-access-and-retention-batch.md)
- Charter: [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md) — §Success metrics, §Reversals
- Program README: [`README.md`](../../README.md) — the `Runs` section this task fills in
- Execution order: [`EXECUTION-ORDER-p5-recording-governance-v2-access-and-retention.md`](./EXECUTION-ORDER-p5-recording-governance-v2-access-and-retention.md)
- Evidence for metric 2: [`rec-30`](./task-rec-30-symmetric-replay-notification.md)
- Outcome recorded from: [`rec-33`](./task-rec-33-retention-activation-runbook.md)
- Deferred here by: [`p1`](../../p1-artifact-registry/plan-p1-recording-governance-v2-artifact-registry-batch.md) REC1-D5 (transcript-fallback retirement)
- Hand-off target: [`patient-health-hub`](../../../../13-08-2026/patient-health-hub/README.md)
- Docs to sync: [`plan-02`](../../../../../April%202026/19-04-2026/Plans/plan-02-recording-governance-foundation.md) · [`plan-07`](../../../../../April%202026/19-04-2026/Plans/plan-07-recording-replay-and-history.md) · [`plan-08`](../../../../../April%202026/19-04-2026/Plans/plan-08-video-recording-escalation.md)

---

## Verification (2026-08-22)

### 1.1 both workspaces

| Workspace | Command | Result |
|---|---|---|
| backend | `npm run type-check` | green |
| backend | eslint on erasure / archival / compositions / timeline / account-deletion | green (no findings) |
| backend | Jest: `recording-erasure-service`, `account-deletion-worker`, `recording-archival-worker`, `twilio-compositions` | **4 suites / 61 tests passed** |
| frontend | `npx tsc --noEmit` | **98 errors**, all pre-existing (`lib/cockpit/social-history*`, `subjective-section-*`, `vital-confidence`, etc.). None in rec-28..33 files. Not fixed here. |
| frontend | `npx next lint --dir components/patients-v2 --dir components/consultation` | exit 0; pre-existing warnings only |
| frontend | Vitest `ConsultTimelinePane` + `RecordingReplayPlayer.multi-composition` | **2 files / 10 tests passed** |

### 1.2–1.4 / 1.8

- `git diff --stat HEAD -- backend/migrations/` empty of tracked p5 files. Untracked `187`–`197` exist; `196` is p3, `197` is p4; none are p5.
- No RLS write policy in rec-28..33.
- No new p5 env var. `env.ts` is dirty vs HEAD with unrelated keys (OpenAI classify, Facebook, check-in, pre-visit). `ARCHIVAL_HARD_DELETE_ENABLED` default still `'false'` at L573–576. `.env.example` gained rec-33 comments only.

### 1.5 PHI

Logs in `recording-erasure-service.ts` and `patient-consult-timeline-service.ts` carry `correlationId`, artifact/session/patient/doctor IDs, storage host / composition SID, counts. No name / phone / DOB / reason-text interpolation.

### Path B decision (3.1 / 3.3 / 3.4)

**Keep.** Historical residue **0 / 14 = 0%** (`noCompositions` — rooms have `RT…` tracks, no `CJ…`). Live 5-minute reachability unmeasured. Comment at `recording-access-service.ts` Path B updated to record this; flag left `true`. REC-D19 is not fully done.

### rec-33 outcome

Flag **not flipped**. Runbook shipped. `058` counsel + production preview #1 / #2 outstanding.

---

**Last Updated:** 2026-08-22.
