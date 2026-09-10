# Program — Recording governance v2

> **Prefix:** `rec`
> **Started:** 2026-08-17
> **Status:** p1 code shipped 2026-08-18; **p1 not Closed**. p3 code shipped 2026-08-19; **p3 not Closed** (founder smoke + metric #4). p2 coding landed 2026-08-23; **p2 not Closed** (REC-D2: counsel, owner-approved copy, owner-approved version string). p4 code shipped 2026-08-20; **p4 not Closed** (founder smoke + metric #3). p5 coding shipped 2026-08-22; **p5 not Closed** (founder smoke + metrics #1–#4). **Program is not Closed.**
> **One-line intent:** Audio recording becomes an honest, disclosed mandate; video stays the patient's at every moment; and the artifact registry everything depends on finally gets a writer.

---

## Why

Plans 02, 07 and 08 (April 2026) built a genuinely good recording system — consent capture, a double-row audit ledger, pause/resume, video escalation with a durable timeout worker, replay with signed URLs, a retention policy table, and an archival worker. Most of it works.

Four wires were never connected, and two product decisions turned out to be wrong.

**The wires:**

1. Nothing writes `recording_artifact_index`. Every reference in `backend/src/` is a read or an update. The table is empty, so a **video consult's audio recording cannot be found by our own app** — and the archival worker has no candidates, making retention and deletion no-ops.
2. Pause is hardcoded to `kind: 'audio'`, so pausing during a video recording stops the audio and leaves the video rolling.
3. Pause and escalation reasons are free text in governance tables — a doctor pausing for a sensitive disclosure writes the protected content into the audit row.
4. Hard delete never reaches Twilio, where the media actually lives.

**The decisions:**

5. The booking consent checkbox promises an opt-out that the code does not honour. Recording rules are applied at room create without consulting it.
6. A patient stopping video is treated exactly like a decline — it burns an escalation attempt and starts a 5-minute cooldown, punishing the doctor for the patient exercising a control we want them to feel free to use.

---

## Phase table

| Phase | Folder | Status | Ships |
|-------|--------|--------|-------|
| **p1** Artifact registry | [`p1-artifact-registry/`](./p1-artifact-registry/) | ⏸ Shipped 2026-08-18 — close gate open | Writer + verified webhook + index-first replay + backfill script. Historical reachability still 0%. Founder smoke not done. |
| **p2** Mandatory audio + attestation | [`p2-mandatory-audio/`](./p2-mandatory-audio/) | ⏸ Coding landed 2026-08-23 — **not Closed**; still **blocked on REC-D2** (counsel + owner copy + owner version string). Draft disclosure + `DRAFT-REC-D2-UNAPPROVED`. Do not promote. | Consent checkbox retired for a disclosure; consent gates removed from transcription + snapshots; versioned doctor attestation before first consult; patient-facing recording policy |
| **p3** Pause integrity | [`p3-pause-integrity/`](./p3-pause-integrity/) | ⏸ Shipped 2026-08-19 — close gate open | Pause covers every active kind; preset reason codes; auto-resume with countdown; patient-initiated audio pause; gap markers in player + transcript; orphan-row reconciliation. Founder smoke + metric #4 not measured. |
| **p4** Video escalation control | [`p4-video-escalation-control/`](./p4-video-escalation-control/) | ⏸ Code shipped 2026-08-20 — close gate open | Time-bounded grants with auto-revert; consensual stop costs no attempt; patient video pause + instant local halt; patient offer; unified status surface. Founder smoke + metric #3 not measured. |
| **p5** Access + retention | [`p5-access-and-retention/`](./p5-access-and-retention/) | ⏸ Coding shipped 2026-08-22 — close gate open | Doctor consult timeline; multi-composition replay; symmetric replay notification; Twilio-reaching deletion; DPDP erasure plan; retention runbook. Flag still `false`. Path B kept. Founder smoke + metrics not measured. |

**Execute p1 first, and do not reorder it.** Every other phase reads or writes the registry it builds. p2 is the only phase with an external blocker (counsel sign-off on REC-D2); p3, p4 and p5 can proceed while it waits.

All phases inherit the [charter decision lock](./plan-recording-governance-v2-charter.md). Do not re-litigate REC-D1…REC-D25 inside a phase.

---

## Three migrations, all Opus

Budget at charter time (head was `195_…`). **Each task re-derived from the live folder.** Actual numbers:

| Number | Phase | File / note |
|---|---|---|
| 196 | **p3** (not p2) | `196_recording_pause_reason_codes_and_auto_resume_stamps.sql` |
| 197 | **p4** (budgeted 198) | `197_video_escalation_grant_bounds_and_pause.sql` — **the only p4 migration** |
| **210** | **p2** (budgeted 196) | `210_doctor_recording_attestation.sql` — **the only p2 migration**. Charter 196 was taken by p3; live head at write was 209. |

p2 / p4 each consumed their one file. A second p2 or p4 migration is a gate failure. REC-D2 still blocks **production** promotion of p2 (draft copy + draft version string).

Per [`00-agent-contract.mdc`](../../../../../.cursor/rules/00-agent-contract.mdc): migrations, PHI columns and RLS are hard-stop items. Any task that discovers it needs a fourth migration stops and surfaces it rather than writing one.

p1 and p5 are specced to be **migration-free** — `recording_artifact_index` (056), `archival_history` (057) and `regulatory_retention_policy` (055) already carry everything they need. If either appears to need a schema change, that is a signal to stop.

---

## Relationship to prior plans

| Prior plan | Where | This program |
|---|---|---|
| Plan 02 — recording governance foundation | [`19-04-2026/Plans/plan-02-…`](../../../April%202026/19-04-2026/Plans/plan-02-recording-governance-foundation.md) | Reverses Decision 4's consent model (REC-D1); finally populates the registry it designed (REC-D19) |
| Plan 05 — voice consultation | [`19-04-2026/Plans/plan-05-…`](../../../April%202026/19-04-2026/Plans/plan-05-voice-consultation-twilio.md) | Retires the transcript-table fallback that voice replay accidentally depends on |
| Plan 07 — recording replay + history | [`19-04-2026/Plans/plan-07-…`](../../../April%202026/19-04-2026/Plans/plan-07-recording-replay-and-history.md) | Fixes pause kind-scoping; adds gap rendering; adds the durable doctor surface |
| Plan 08 — video recording escalation | [`19-04-2026/Plans/plan-08-…`](../../../April%202026/19-04-2026/Plans/plan-08-video-recording-escalation.md) | Keeps Decision 10; reverses the revoke-equals-decline arithmetic (REC-D9) |
| `patient-health-hub` (`phh`) | [`13-08-2026/patient-health-hub/`](../../13-08-2026/patient-health-hub/README.md) | Consumes p1's registry and p5's timeline. Do not duplicate the patient-side surface here. |

---

## Success metrics (from charter)

1. **Reachability** — 100% of ended voice and video consults have a playable artifact resolvable from the index within 5 minutes. Video consults are at 0% today.
2. **Honesty** — zero consults where the recording state shown to the patient differs from what is captured.
3. **Patient control latency** — video capture stops within 250 ms of the patient confirming, independent of server round-trip.
4. **Gap visibility** — every paused window appears in both player and transcript with actor and reason code.

**Runs**

### 2026-08-18 — p1 mechanical close (rec-06)

**Charter contradiction (do not paper over):** Charter problem §1 said *“Voice replay works today by accident.”* rec-01 step 0 was **(b)** on the live account: 0 Composition Hooks, 0 Compositions. Voice replay did **not** work. Path B can only mint from a `CJ…` SID; none existed. An audio-only hook `HKbe336c348bce4c81907f6a3c55844a82` (`haloaid-consult-audio`) was created the same day. That is account config, not `compositions.create` in repo.

**rec-03 finding:** Video rooms inherit that hook and rec-01’s `twilio_video` lookup. No extra video wiring. A blanket video hook was not added (it would fail on audio-only rooms).

**Metric #1 — reachability (historical, after rec-05 apply `rec-05-backfill-1787050644363`)**

| Population | Before p1 | After backfill | Why |
|---|---|---|---|
| Ended voice + video sessions | 0% from index (table empty) | **0 / 14 = 0%** | Every room: `noCompositions`. Raw `RT…` tracks exist; no `CJ…`. |
| Ended video only | 0% (charter baseline) | **0%** | Same hole. |

Hide-eligible new rows: 0. Hard-delete candidates: 0. `ARCHIVAL_HARD_DELETE_ENABLED`: **false**. Archival worker candidates: still **0** (nothing to scan).

**Metric #1 — live (post-hook):** *not measured.* Needs a real consult after the hook + webhook deploy, then time-to-index-row (charter bound: 5 minutes).

**Founder smoke:** not run. p1 is not Closed.

Inbox already holds: room-status unsigned webhook; rec-01 live composition smoke.

### 2026-08-19 — p3 mechanical close (rec-20)

**rec-17 step 0 — patient credential:** Voice, video and text patients hold a scoped consult JWT. Doctors hold a Supabase access token. `authenticateToken` rejects the scoped JWT. Pause/resume/state use dual-bearer `resolveRecordingCaller`. Patient actor = `consultation_sessions.id` when no `auth.users` id.

**rec-18 step 0 — composition cardinality:** One audio composition per room (hook `HKbe336c348bce4c81907f6a3c55844a82` at room-complete). Pause creates new Recording SIDs, not compositions. REC3-D8 stands. The comment at `twilio-compositions.ts:165-169` is stale as a composition-cardinality claim.

**Metric #4 — gap visibility:** *not measured.* Needs a real consult with **at least two** pauses, then independent checks on the player (rec-18) and the exported transcript (rec-19), actor + reason code on each gap. One pause cannot catch the media-time error.

**Orphan sweep (first real tick):** *not run.* Route: `POST /cron/recording-orphan-reconcile` every 60s. Record scanned / closedCompleted / closedFailed / closedIndeterminate / raced here after the first production tick.

**Founder smoke:** not run. p3 is not Closed.

### 2026-08-20 — p4 mechanical close (rec-27)

**Migration:** **197** only. No 198.

**REC-D6 — no specialty gate (decision, not a build).** Discussed 2026-08-17 and rejected. Never implemented, so there is nothing to remove. Reasoning: specialty is a poor proxy for clinical need (GPs see rashes, wounds, jaundice constantly); `doctor_settings.specialty` is self-declared and Indian practice is frequently mixed-scope; the real control is the patient's, which is what p4 built. Replacement review signal: **escalation rate per doctor** — no dashboard in this program (inbox).

**p3 / p4 pause boundary as landed.** p3 shipped first (2026-08-19) and owns audio pause (`recording-pause-service.ts`, every live kind, REC-D13). rec-24 did **not** call `pauseRecording()` for video — that would halt audio. Video pause is grant-scoped (`video_paused_at` on the existing `video_escalation_audit` row; zero new rows). No p3 drift.

**Metric #3 — patient control latency (≤250 ms, independent of the server):** *not measured on a device.* Marks were split 2026-08-20: confirm at the handler's first line, halt after `LocalVideoTrack.disable()`. Measure: `rec24-confirm-to-halt-pause|stop`. Max / 5-run table / device / network / doctor-side frame count: empty until the founder walk.

**Video compositions from a pause-heavy consult:** *not counted.* Hand to p5 when the smoke produces a real number. `getRecordingArtifactsForSession` already returns `videoCompositions[]`; `RecordingReplayPlayer` still picks one.

**Unconsented `voice → video`:** still live at `modality-transition-executor.ts` `executeVoiceToVideo` (~L474). No audit row → no consent, no attempts, no grant expiry. Worker logs the anomaly and does not revert. Charter question, not a p4 fix.

**Founder smoke:** not run. p4 is not Closed. Program is not Closed.

### 2026-08-22 — p5 mechanical close (rec-34)

**Do not mark this program Closed.** Founder e2e (rec-34 §2.5) not run. p1 / p3 / p4 close gates remain open. p2 still blocked on REC-D2.

**rec-33 outcome — flag not flipped.** Runbook exists at [`recording-archival-activation-runbook.md`](../../../../Reference/engineering/operations/setup/recording-archival-activation-runbook.md). Counsel confirmation of `058` outstanding. Production preview #1 and #2 outstanding. Repo default `ARCHIVAL_HARD_DELETE_ENABLED` still `'false'`. Hide on `POST /cron/recording-archival` is always real — reviews use `GET /api/v1/admin/archival-preview` only.

**Path B kept (REC-D19 incomplete).** Residue is not zero. rec-05 historical apply: **0 / 14 = 0%** (`noCompositions`). Live 5-minute reachability: *not measured*. `TRANSCRIPT_AUDIO_FALLBACK_ENABLED` stays `true` in `recording-access-service.ts`. Deleting Path B now would re-break replay for those rooms.

**p5 either/or (both recorded, neither flipped):**

| Item | Choice |
|---|---|
| rec-33 flag flip | **Not flipped.** Outstanding legal + two dry-runs. |
| Path B retirement | **Kept.** Residue non-zero / live unknown. |

**Metric #1 — reachability:** historical **0 / 14 = 0%** (same as rec-06). Live post-hook 5-minute window: *not measured* — no production consult timed from hangup to index row.

**Metric #2 — honesty:** *not measured as a production count.* Cite p2 (blocked on REC-D2 — disclosure copy has not shipped) and rec-30's symmetry audit (support-staff → patient; skips in `audit_logs`; dashboard-only doctor channel upheld). No count of mismatched UI vs capture.

**Metric #3 — patient control latency:** marks exist (`rec24-confirm-to-halt-pause|stop`). *Not measured on a phone.* Same empty table as rec-27.

**Metric #4 — gap visibility:** rec-18 / rec-19 shipped. *Not measured* on a real pause consult. rec-18 arithmetic is still one-artifact-per-kind — wrong under multiplicity (rec-29 STOP-and-surfaced).

**Migration / env:** p5 wrote **no** migration (`git diff --stat HEAD -- backend/migrations/` empty of p5 files; untracked `196` is p3, `197` is p4). No new env var. No RLS write policy.

**`phh` hand-off:** [`p5-access-and-retention/PHH-HAND-OFF.md`](./p5-access-and-retention/PHH-HAND-OFF.md). Linked from the `phh` README anchors table.

**Founder smoke:** not run. p5 is not Closed. Program is not Closed.

---

### 2026-08-23 — p2 coding landed (rec-07…11); rec-12 not Closed

**Do not mark p2 or this program Closed.** REC-D2 is outstanding: no counsel sign-off, no owner-approved disclosure wording, no owner-approved attestation version string. Draft copy is live in code. `RECORDING_ATTESTATION_POLICY_VERSION` is `DRAFT-REC-D2-UNAPPROVED`. **Do not promote to production.**

**Migration:** **210** only. No second p2 migration. RLS on, zero policies, no `auth.uid` expression.

**Metric #2 — honesty:** *not measured.* Pre-phase `recording_consent_decision = false` count not queried. Post-deploy consult walk not run. Historical consent values are not retro-corrected (REC-D3).

**Mechanical verification (2026-08-23):** backend type-check green. Rec-11 unit + rec-09/10 targeted suites green (see rec-12 Notes). Full backend lint still has pre-existing errors outside p2. Founder smoke (rec-12 §4) not run. rec-12 stays open.

**Created:** 2026-08-17. Updated 2026-08-23.
