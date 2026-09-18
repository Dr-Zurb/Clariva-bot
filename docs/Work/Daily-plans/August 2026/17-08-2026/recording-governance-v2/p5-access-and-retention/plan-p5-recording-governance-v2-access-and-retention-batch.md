# Plan p5 — Access + retention

## 17 Aug 2026 — Batch `recording-governance-v2` / `p5-access-and-retention` (rec-28..34) — **L, ~4 dev-days (~33h agent time, ~28h wall-clock with Wave 1 parallelised)**

> **Status:** ⏳ Planned 2026-08-17. No code yet.
> **Charter:** [`../plan-recording-governance-v2-charter.md`](../plan-recording-governance-v2-charter.md) (REC-D1…REC-D25 — inherited, never re-litigated)
> **Program:** [`../README.md`](../README.md)
> **Exec order:** [`Tasks/EXECUTION-ORDER-p5-recording-governance-v2-access-and-retention.md`](./Tasks/EXECUTION-ORDER-p5-recording-governance-v2-access-and-retention.md)
> **Owns:** REC-D22, REC-D23, REC-D24, REC-D25 (upheld unchanged), and the retirement half of REC-D19.
> **Migration:** **none.** This phase is migration-free — see REC5-D1.
> **Prefix note:** one task prefix, `rec`, numbered continuously across all five phases. p5 owns `rec-28..34` and closes the program.

---

## ⛔ Blocking dependency — p1 must have shipped AND backfilled

Every task in this phase reads `recording_artifact_index`. That table is **empty today** and stays empty until [`p1`](../p1-artifact-registry/) lands its writer (`rec-02`), its webhook (`rec-01`) and its backfill (`rec-05`).

Concretely: rec-28's timeline renders from registry rows, rec-31's delete phase acts on registry candidates, and rec-32's erasure enumerates registry rows to find the media it must remove. Run p5 against an unpopulated index and **all three look like they work** — the timeline renders empty states, the worker reports zero candidates, and erasure finds nothing to erase. The tests pass, the smoke passes, and nothing is verified.

**Do not start Wave 1 until p1's backfill has run in production and `SELECT count(*) FROM recording_artifact_index` is non-zero.** rec-34's close gate re-asserts it.

p3 and p4 are softer dependencies — see §Coordination boundaries.

---

## Why this phase

Three of the program's promises are currently unkeepable, and one surface exists but cannot be reached.

**Deletion does not delete.** The archival worker's hard-delete phase calls `deleteObject` (`recording-archival-worker.ts:574`), which parses `<bucket>/<path>` and removes an object from **Supabase Storage** (`storage-service.ts:92-133`). The primary media is **Twilio-hosted Compositions**. So even with `ARCHIVAL_HARD_DELETE_ENABLED` flipped to `true`, the worker would write an `archival_history` row, stamp `hard_deleted_at`, and the recordings would still be there. That is worse than not deleting: it is a deletion record that is false, and `archival_history` is the regulator-facing answer to "why is this recording no longer retrievable?" (057 L10-12).

**DPDP erasure is not satisfied.** `finalizeAccountDeletion` (`account-deletion-worker.ts:459-586`) writes one `recordings/patient_<uuid>/` prefix into `signed_url_revocation`, scrubs PII from the patient row, sends an explainer DM and stamps the audit. It never deletes media. The revocation prefix blocks minting — `isRevoked` (`recording-access-service.ts:418-461`) — and nothing more. REC-D22 closes this, and doing so is also what makes p4's REC-D10 ("stop halts capture; it is not deletion; erasure is served separately") an honest sentence rather than a deflection.

**The doctor surface is durable but not navigable.** This needs stating precisely, because the easy version of it is wrong. Opening any completed appointment renders the cockpit `ended` state (`CenterPane.tsx:76-82`), which mounts `EndedCard`, which mounts `ConsultArtifactsPanel` with the replay player (`EndedCard.tsx:122-127`). **Recordings ARE reachable per appointment, and not only immediately post-call.** What does not exist is any patient-level or cross-consult view: the doctor must already know which appointment to open. REC-D23 fixes the navigation, not the surface.

**The player expects one composition per mode.** `RecordingReplayPlayer.tsx` carries a single `hasVideo: boolean` (`:83`) and `ArtifactMode = "audio" | "video"` (`:56`), minting one signed URL per mode. `getRecordingArtifactsForSession` already returns **arrays** (`recording-track-service.ts:761-820`, sorted `startedAt` ascending). p4's revert/re-escalate cycle and p3's pause work both produce genuine multiplicity; p4's batch plan hands the replay side to this phase explicitly.

---

## Verified current state (grep-checked 2026-08-17)

| Anchor | Where | What is actually true |
|---|---|---|
| Doctor post-consult surface | `CenterPane.tsx:76-82`, `EndedCard.tsx:122-127` | `ended` / `wrap_up` → `EndedCard` → `ConsultArtifactsPanel` → player. Durable per appointment. **Missing: any patient-level or cross-consult entry point.** |
| Patient profile shell | `patients-v2/[id]/page.tsx:72-80` | Delegates to `PatientDetailHydrated`. The timeline belongs as a pane in this shell, not as a new top-level route. |
| Artifact listing | `recording-track-service.ts:761-820` | Returns `audioCompositions` / `videoCompositions` as **arrays**, sorted `startedAt` ascending, 60 s per-session cache. Twilio-live, not registry-backed. |
| Replay player | `RecordingReplayPlayer.tsx:56,83,182-236,475` | One `hasVideo` boolean, one URL per `ArtifactMode`. No concept of N compositions anywhere in the component. |
| Replay mint | `recording-access-service.ts:720-960` | Resolves exactly **one** artifact per call (`:809-812`), fetches metadata, writes the granted audit row **before** minting (`:892-918`), then fires notification. |
| Replay notification — both directions | `recording-access-service.ts:552-620` | **Both already exist and are wired.** `doctor` → `notifyPatientOfDoctorReplay` (`:573`); `patient` **and** `support_staff` → `notifyDoctorOfPatientReplay` (`:593`). See §Surfaced. |
| Patient-side channels | `notification-service.ts:2364-2588` | IG-DM + SMS via `Promise.allSettled`; idempotent on `recordingAccessAuditId` through `audit_logs`. Six `skipped(...)` exits: `admin_client_unavailable`, `already_notified`, `session_not_found`, `no_patient_on_session`, `session_not_ended`, `no_channels`. |
| Doctor-side channels | `notification-service.ts:2596-2710` | **Dashboard event only.** Header L2596-2598: *"NO DM / SMS / email — Decision 4 carves out doctor-facing replay notifications as dashboard-only."* |
| Support-staff coverage | `recording-access-service.ts:538-543` | A support-staff replay notifies the **doctor** and deliberately **not** the patient. |
| Archival delete phase | `recording-archival-worker.ts:505-661` | Re-verify SELECT (`:551-556`) → `deleteObject` (`:574`) → `archival_history` insert (`:578`) → `hard_deleted_at` stamp (`:608`) → revocation cleanup (`:634`). A throw from `deleteObject` is caught at `:638`, logged, and **the stamp is skipped** — the correct posture already. |
| Locking — doc vs code | header L31-32 vs `:551-556` | The header claims *"Row-level lock (`FOR UPDATE ... SKIP LOCKED`)"*. **The code does not do that.** It re-reads through PostgREST with `.is('hard_deleted_at', null).maybeSingle()`, which cannot express `FOR UPDATE`. rec-31 must resolve or restate this, not inherit the claim. |
| Storage delete | `storage-service.ts:46-133` | `parseStorageUri` throws `ValidationError` on a malformed `<bucket>/<path>`; `deleteObject` treats not-found as success (`:110-117`). |
| Twilio composition adapter | `twilio-compositions.ts` — whole file, 431 lines | `listCompositionsForRoom` (`:211`), `fetchCompositionMetadata` (`:292`), `mintCompositionSignedUrl` (`:352`), `getComputedTwilioMediaUrl` (`:114`). **There is no DELETE wrapper of any kind.** Test seam `__setOverridesForTests` (`:138`). |
| Erasure today | `account-deletion-worker.ts:145-147,502-524` | `enumerateArtifactPrefixes` returns exactly one string: `recordings/patient_<uuid>/`. Finalize upserts it into `signed_url_revocation`, scrubs PII, DMs, stamps. **No media deletion anywhere in the path.** |
| What the erasure DM already promises | `account-deletion-worker.ts:91-98` | `LEGAL_RETENTION_CITATION = 'DPDP Act 2023 and GDPR Article 9 medical-record retention'`. The explainer already tells the patient a retention carve-out exists; the mechanism to honour it does not. |
| Revocation matching | `recording-access-service.ts:418-461` | Application-code prefix check against the Twilio media URL, the bare SID, and substring containment. **Fail-open** on lookup error (`:441-447`). |
| Retention seed | `058_regulatory_retention_policy_seed.sql:44-89` | Four rows: `IN/*` 3 yr · `IN/pediatrics` 3 yr + until age 21 · `IN/gynecology` 7 yr · `*/*` 7 yr. All `patient_self_serve_days = 90`. Header L15-21 is an explicit **owner/legal review required before merge** block. |
| Archival audit shape | `057_archival_history.sql:34-68` | `artifact_id`, `session_id`, `artifact_kind`, `storage_uri`, `bytes`, `deleted_at`, `deletion_reason` (TEXT, grep-friendly convention L57-62), `policy_id`. **No provider column and no provider-status column.** Never pruned. |
| Admin preview | `routes/api/v1/admin.ts:63-130` | `GET /api/v1/admin/archival-preview?days=N`, `CRON_SECRET` shared-secret gate (`:36-41`), reuses `scanHideCandidates` / `scanDeleteCandidates` with a future `asOf`. |
| Kill switch | `env.ts:573-576` | `ARCHIVAL_HARD_DELETE_ENABLED`, default `'false'`. Header L566-571 already describes the 30-day soak and the flag-flip ritual rec-33 formalises. |

---

## ⚠️ Surfaced during planning — the reverse replay notification already exists

REC-D24 reads: *"`notifyPatientOfDoctorReplay` exists; the reverse and the non-suppressibility do not."* **The first half of that is wrong and rec-30 must be scoped against what is actually there.**

`notifyDoctorOfPatientReplay` exists at `notification-service.ts:2612`, is wired at `recording-access-service.ts:593` for both `patient` and `support_staff` callers, is wired again in `transcript-pdf-service.ts:906`, has its own storage table (migration `066_doctor_dashboard_events.sql`, widened by `074`), and has unit coverage in `tests/unit/services/notification-service-mutual-replay.test.ts`. Both directions fire today.

What is actually asymmetric is narrower and more interesting than "the reverse is missing":

1. **Channel reach is asymmetric by decision, not by omission.** The patient is reached out-of-band (IG-DM + SMS). The doctor gets a `doctor_dashboard_events` row they see on next dashboard load. The header comment at `:2596-2598` says this is a deliberate Decision 4 carve-out. Whether REC-D24's "symmetric" overturns that carve-out is a **product decision rec-30 must state and get confirmed** — it is not a wiring detail, and dashboard-only may well be the right answer for a doctor who is in the dashboard all day.
2. **There is a real coverage hole: support-staff replays never reach the patient.** `recording-access-service.ts:538-543` routes support-staff replays to the doctor and deliberately not to the patient, reasoning that support escalations are internal tooling. Under REC-D24 and attestation clause 4 ("your replays are logged and the patient is notified"), a third party opening the patient's recording is exactly the case the patient most needs to hear about. **This is the substantive gap in the phase.**
3. **"Non-suppressible" has no opt-out to remove.** There is no user-facing notification preference on this path. What exists is a set of silent-failure exits — six `skipped(...)` branches on the patient side, plus the fire-and-forget `void Promise.resolve().then(...)` wrapper at `recording-access-service.ts:931` that makes a total failure invisible to the caller. `no_channels` in particular means a patient with neither a phone nor an IG thread is simply never told, and nothing anywhere records that they weren't.

So rec-30 is **not** "add the missing direction". It is: close the support-staff hole, make the silent-skip paths observable, and get a decision on the channel carve-out. The task file says so in those terms. Do not let an executor spend an afternoon rebuilding a function that already ships.

---

## Decision lock (phase-local — charter REC-D1…D25 inherited on top)

| ID | Decision |
|----|----------|
| REC-D22, REC-D23, REC-D24, REC-D25 | Inherited. Deletion reaches Twilio; the doctor's durable home is a consult timeline on the patient profile; replay notification is symmetric and non-suppressible; the 90-day patient window and the video OTP gate are unchanged and not re-litigated. |
| **REC5-D1** | **This phase is migration-free.** `055` (retention policy), `056` (registry) and `057` (archival audit) already carry every shape p5 needs. In particular `archival_history` has **no provider column** — the provider-delete outcome rides `deletion_reason`'s grep-friendly string convention (057 L57-62), which is what that column is for. **Any apparent schema need is STOP-and-surface**, not migration 199. |
| **REC5-D2** | **The doctor surface exists and is durable; only navigation is missing.** rec-28 adds a patient-level entry point and leaves `EndedCard` as the drill-down. No task in this phase restructures `EndedCard` or `ConsultArtifactsPanel`. Any plan text or commit message claiming "recordings are unreachable for the doctor" is wrong and must be corrected, not repeated. |
| **REC5-D3** | **The timeline reads p1's registry and never calls Twilio per row.** Artifact presence comes from `recording_artifact_index`; live composition metadata is a drill-down concern. A timeline that calls `listCompositionsForRoom` once per row is N Twilio round-trips on a page load and will not survive a patient with 20 consults. |
| **REC5-D4** | **Multiple compositions are listed, ordered and separately mintable — never merged and never silently reduced.** Ordering is `startedAt` ascending, matching `getRecordingArtifactsForSession` (`:808-811`). No concatenation, no "pick the longest", no "pick the latest". A consult that produced three video legs shows three. |
| **REC5-D5** | **Provider deletion is a new capability in `twilio-compositions.ts`**, because no DELETE wrapper exists there today. It goes behind the same `__setOverridesForTests` seam (`:138`) as its three siblings so the suite never issues a live delete. |
| **REC5-D6** | **A failed provider delete must not stamp `hard_deleted_at` and must not write a success `archival_history` row.** The worker's existing posture already does this for Supabase failures (`:638-647`); rec-31 extends it to the provider call and **may not relax it**. A retry on the next cron tick is the correct outcome. |
| **REC5-D7** | **A clinical-record retention obligation outranks an erasure request, and the carve-out is recorded rather than implied.** Where the retention window outlives the erasure request: access is severed immediately, media is deleted at the retention cutoff, and the erasure audit row records that a carve-out applied and under which policy. The explainer DM already tells the patient this (`account-deletion-worker.ts:97-98`); rec-32 makes the mechanism match the copy. |
| **REC5-D8** | **Confirming `058`'s seed retention values with counsel is a founder task, never an agent task.** No task in this phase edits a retention number, a `retention_until_age`, or a `patient_self_serve_days`. A wrong value is a compliance failure in both directions and one of them destroys clinical records early. |
| **REC5-D9** | **"Symmetric" is about coverage and reach, not about the existence of a second function.** Both directions already fire. rec-30 closes the support-staff coverage hole and makes silent skips observable; the dashboard-only channel carve-out is a decision it states and surfaces, not one it quietly overturns. |
| **REC5-D10** | **`ARCHIVAL_HARD_DELETE_ENABLED` stays `false` through every coding task in this phase.** rec-31 and rec-32 are proven in dry-run and in tests against the mock seam. The flip is rec-33's ops ritual, gated on REC5-D8's legal confirmation, and it happens on the ops calendar — **not as a phase gate.** |
| **REC5-D11** | **Retention and deletion logs carry identifiers only, never PHI.** Session IDs, artifact IDs, composition SIDs, room SIDs, artifact kinds, byte counts, policy IDs, reason codes and correlation IDs are permitted. Names, phone numbers and dates of birth are not. This is stated as a decision rather than left to the general rule because rec-32 runs alongside a PII scrub, which makes a log line written there unusually likely to be the last place a name survives. |
| **REC5-D12** | **p5 guarantees the artifact; [`phh`](../../../13-08-2026/patient-health-hub/README.md) presents it to patients.** rec-28's timeline is a *doctor* surface. No task in this phase adds a patient-facing route, a patient hub token, or a patient-side tab, and rec-34's hand-off note tells `phh` what shape to consume rather than building it here. |

---

## Waves

| Wave | Task | Size · Model | Ships |
|------|------|--------------|-------|
| 1 | [`rec-28`](./Tasks/task-rec-28-doctor-consult-timeline.md) ∥ [`rec-29`](./Tasks/task-rec-29-multi-composition-replay-player.md) — **two parallel lanes** | L · Sonnet, M · Sonnet | Consult timeline on the patient profile reading the registry (REC-D23); replay player handles N audio and N video compositions (REC5-D4) |
| 2 | [`rec-30`](./Tasks/task-rec-30-symmetric-replay-notification.md) | M · Sonnet | Support-staff replays reach the patient; silent-skip paths become observable; channel carve-out decided (REC-D24) |
| 3 | [`rec-31`](./Tasks/task-rec-31-twilio-reaching-hard-delete.md) | L · **Opus** | Archival delete phase reaches Twilio for Twilio-hosted `storage_uri`s, with audit and lock discipline intact (REC-D22) |
| 4 | [`rec-32`](./Tasks/task-rec-32-dpdp-patient-erasure-path.md) | L · **Opus** | Real DPDP erasure that removes media, with the retention carve-out defined and recorded (REC-D22, REC5-D7) |
| 5 | [`rec-33`](./Tasks/task-rec-33-retention-activation-runbook.md) → [`rec-34`](./Tasks/task-rec-34-program-close-gate.md) | M · Composer / **Founder**, M · Sonnet + Founder | Activation runbook + first dry-run review + founder legal gate; then program close, four metrics, doc-drift sync, `phh` hand-off |

**Wave 1 runs as two independent lanes.** rec-28 is a patient-scoped aggregate behind the existing `visits` tab; rec-29 widens the replay availability and mint contract and the player. Neither consumes the other's output, and REC5-D3 is what keeps them apart — because the timeline reads the registry directly rather than the replay-availability contract, it never touches the surface rec-29 is changing. The one shared file is `frontend/lib/api.ts`, which both append to: a merge conflict, not a dependency. Run them in separate worktrees. The [exec order](./Tasks/EXECUTION-ORDER-p5-recording-governance-v2-access-and-retention.md) records the full lane gate; collapsing Wave 1 to a single sequential lane costs ~5h of wall-clock and changes nothing else.

**Two Opus tasks — at the ≤2-per-batch cap, one per wave.** rec-31 and rec-32 are the two because they are the only tasks in the phase that perform **irreversible destruction of clinical records** and the only ones whose failure mode is a written audit trail that lies. rec-31 decides how a provider deletion is recorded in a table that has no column for it (REC5-D1) and must resolve the locking claim the worker's header makes but its code does not honour. rec-32 decides which of two legal obligations wins when they conflict, which is a policy judgement wearing a code costume. Everything else in the phase is bounded work against contracts these two and p1 land: rec-28 and rec-29 are UI and read-path against a registry whose shape is already fixed, rec-30 is coverage and observability on an existing fan-out, and rec-33/rec-34 are ops and verification.

**Not Opus:** rec-28, despite being L. It is a read-only aggregate plus a new pane in an existing shell, with no destructive path and no policy decision. Size is not the criterion; irreversibility and unresolved judgement are.

---

## Coordination boundaries

**p1 is a hard dependency.** See the blocking-dependency section above.

**p3's `rec-18` and this phase's rec-29 both edit the replay player.** `rec-18` ([p3 batch plan](../p3-pause-integrity/plan-p3-recording-governance-v2-pause-integrity-batch.md), Wave 5, M · Auto) puts pause-gap markers on the replay timeline in **media time** (REC3-D8: a gap's position is its wall-clock offset from artifact start minus the cumulative duration of earlier gaps). rec-29 makes the player address N compositions instead of one.

**Land rec-18 first, and rec-29 composes on top of it.** The ordering is not arbitrary: rec-18's media-time arithmetic is per-artifact, and it is far easier to lift a working single-artifact gap calculation into a per-composition loop than to retrofit multiplicity-aware arithmetic into a player that has just learned to hold arrays. If rec-18 has **not** shipped when rec-29 runs, rec-29 ships the multi-composition selector and leaves the gap-marker surface exactly as it finds it, structured so a per-artifact marker set drops in per composition rather than once per player. Either way: **rec-29 must not implement gap markers, and rec-18's media-time arithmetic is not rec-29's to change.** If rec-29 concludes rec-18's arithmetic is wrong under multiplicity, that is a STOP-and-surface, not a fix.

**p4 produces the multiplicity; p5 renders it.** p4's batch plan (`§Consequence — multiple video compositions per consult`) hands this to p5 explicitly and records the composition count from a pause-heavy smoke consult in rec-27's close gate. Read that number before sizing rec-29's UI; do not guess.

**p2 owns the attestation text.** Clause 4 ("your replays are logged and the patient is notified") is p2's to write. rec-30 wires the behaviour that clause promises and does not author or edit attestation copy.

---

## Scope guard — DO NOT TOUCH

- **The registry writer and the composition-finalised webhook** — `recording_artifact_index` writes, `recording-artifact-service`, the webhook route. **p1.** p5 reads the registry; it never writes a registry row outside rec-31's `hard_deleted_at` stamp and rec-32's erasure path.
- **Consent removal** — the booking checkbox, `recording-consent-service.ts`, `RecordingConsentCheckbox.tsx`, the doctor attestation and its copy. **p2.**
- **Pause semantics** — `recording-pause-service.ts`, `DEFAULT_KIND`, preset reason codes, auto-resume, and **rec-18's gap-marker arithmetic**. **p3.**
- **The escalation state machine** — `recording-escalation-service.ts`, `deriveState`, attempt counters, cooldowns, the consent modal, grant bounds. **p4.**
- **The 90-day patient self-serve window** and its arithmetic, and **the video replay OTP gate** — `video-replay-otp-service.ts`, `VideoReplayOtpModal.tsx`, the 30-day verification window, `recording-access-service.ts:784-806`. REC-D25, unchanged.
- **The `phh` patient-facing surface** — `/my-health`, `/my-visit`, the patient hub token, patient-side tabs. [`patient-health-hub`](../../../13-08-2026/patient-health-hub/README.md) owns the patient's durable home. **p5 guarantees the artifact; `phh` presents it to patients.** rec-28 is a *doctor* surface. Do not build a patient timeline here, and do not add a patient-facing route.
- **`EndedCard.tsx` and `ConsultArtifactsPanel.tsx` structure** — REC5-D2. rec-28 links to them; rec-29 changes only the player they mount.
- **`058`'s retention values** — REC5-D8. Founder + counsel only.
- **`ARCHIVAL_HARD_DELETE_ENABLED`'s default** — REC5-D10. It stays `'false'` in `env.ts`. rec-33 documents the flip ritual; no task changes the default.
- **`archival_history` rows that already exist** — the table is append-only and never pruned (057 L26-31). No task UPDATEs or DELETEs a row in it.
- **Twilio room create / end**, room naming, lazy creation, and the `crc` check-in lobby.
- **Any migration, any RLS policy, any PHI column.** REC5-D1. **STOP and surface.**

---

## Compliance constraints (phase-wide)

- **No PHI in retention or deletion logs.** Session IDs, artifact IDs, composition SIDs, room SIDs, artifact kinds, byte counts, policy IDs, reason codes and correlation IDs are all fine. Patient names, phone numbers and dates of birth are not — and note that rec-32's path runs alongside a PII scrub, so a log line written there is unusually likely to be the last place a name survives.
- **`doctor_dashboard_events` payloads already carry `patient_display_name`** (`notification-service.ts:2677`). That is a stored payload on an existing surface, not a log line, and rec-30 does not widen it. Do not copy it into a log.
- **Deletion is irreversible.** Every deletion task in this phase requires: dry-run first, a re-verify-before-destroy step, an `archival_history` row, and explicit refusal to stamp `hard_deleted_at` on provider failure (REC5-D6).
- **A wrong retention value deletes clinical records early, and that is unrecoverable.** There is no undo, no soft-delete tier, and no backup path specified anywhere in 055/057. This is why REC5-D8 exists and why rec-33 is shaped as a founder task rather than an agent task.
- Copy must never imply that stopping a recording deletes anything (REC-D10, p4's constraint, restated here because rec-30 and rec-32 both write patient-facing copy).

---

## Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | **p5 runs against an empty registry and every task silently passes.** Empty timeline, zero delete candidates, nothing to erase. | The blocking-dependency section is the gate. rec-34 asserts a non-zero registry count and that the timeline rendered real rows for a real patient. |
| 2 | **The worker's header claims row locking it does not perform.** An executor reading only the header will believe the concurrency defence is stronger than it is. | Recorded in §Verified current state. rec-31 must either implement real locking or restate the header to match the re-verify-SELECT reality, and must say in writing which it chose. |
| 3 | **`archival_history` has nowhere structured to record which provider a deletion reached.** The temptation is migration 199. | REC5-D1: `deletion_reason` is the designed place for exactly this (057 L57-62). rec-31 extends the string convention and documents it in its task file so rec-32 and ops consume one convention. |
| 4 | **rec-32 makes a legal call an agent should not make.** "Retention outlives erasure" is a defensible reading, not a settled one. | REC5-D7 states the default; rec-32 is flagged as **the task most likely to need legal input** and must surface its carve-out for founder confirmation before the path is enabled, not after. |
| 5 | **rec-29 and p3's rec-18 collide in `RecordingReplayPlayer.tsx`.** | §Coordination boundaries fixes the order and the fallback. Neither task may edit the other's arithmetic; a conflict is STOP-and-surface. |
| 6 | **rec-28 grows into the `phh` patient hub.** A consult timeline is exactly the surface `phh` p3 also wants. | Scope guard is explicit: rec-28 is doctor-only, no patient route, no patient token. rec-34's hand-off note tells `phh` what shape to consume. |
| 7 | **Twilio delete is not reversible and not idempotent in the way Supabase's is.** `deleteObject` treats not-found as success (`storage-service.ts:110-117`); a Twilio 404 may mean "already deleted" or "wrong SID". | rec-31 must decide and document which Twilio responses count as success, and must not generalise Supabase's not-found-is-success rule without stating why it applies. |
| 8 | **Flipping the flag before counsel confirms `058` deletes real records under placeholder values.** | REC5-D8 + REC5-D10. rec-33 makes the legal confirmation a hard precondition of the flip, and the flip is not a phase gate — the phase can close with the flag still `false`. |

---

## Acceptance gate (phase)

- [ ] `SELECT count(*) FROM recording_artifact_index` is non-zero before Wave 1 starts, and rec-34 re-asserts it at close. **Wave 1 empty-index override (user).** rec-34 re-assert: historical **0 / 14**; live count unmeasured.
- [ ] A doctor opening a patient profile sees that patient's consults in one place — date, modality, duration, and which artifacts exist — and can click through to the existing `EndedCard` drill-down. No Twilio call is made per timeline row. **Code shipped (rec-28).** Founder visual outstanding.
- [ ] A consult that produced three video compositions offers all three in the player, in `startedAt` order, each separately playable. None is hidden, merged, or silently chosen. **Code shipped (rec-29).** Founder visual + rec-27 composition count outstanding.
- [ ] p3's gap markers still render correctly on each composition (or, if rec-18 has not shipped, the marker surface is unchanged and structured to accept a per-composition marker set). **rec-18 shipped; arithmetic still one-artifact-per-kind — wrong under multiplicity (STOP-and-surfaced).**
- [x] A **support-staff** replay notifies the patient. A doctor replay and a patient replay both still notify the other party. **rec-30.**
- [x] Every notification skip is observable — a patient with no reachable channel produces a recorded, queryable signal rather than silence. **rec-30 → `audit_logs`.**
- [x] The dashboard-only channel carve-out for doctor-facing notifications is either upheld with a written reason or overturned with founder confirmation. Not left ambiguous. **Upheld (rec-30). Charter REC-D24 corrected 2026-08-22.**
- [ ] Hard delete of a Twilio-hosted artifact **actually removes the composition from Twilio**, verified by a follow-up fetch returning not-found — not by our own log line. **Unit-tested (rec-31). No live Twilio delete.**
- [x] A forced provider failure leaves `hard_deleted_at` NULL, writes no success `archival_history` row, and is retried on the next cron tick. **Unit-tested (rec-31 / rec-32).**
- [ ] A DPDP erasure request removes media, not just a revocation prefix. Where a retention obligation outlives the request, the carve-out is recorded with its policy ID and the patient's explainer copy matches what actually happened. **Coded (rec-32). Counsel on REC5-D7 outstanding. Destroy still flag-gated `false`.**
- [ ] The activation runbook exists, the first dry-run review has been performed and its candidate counts written down, and the founder's legal-confirmation step for `058` is recorded as done or explicitly outstanding. **Runbook exists (rec-33). Dry-runs + `058` confirmation outstanding.**
- [x] `ARCHIVAL_HARD_DELETE_ENABLED` is still `false` in `env.ts` and its default is unchanged.
- [ ] All four charter success metrics measured on production data and written into the program README. **Written 2026-08-22 as not-yet-measurable, with reasons. Not Closed.**
- [x] April Plans 02, 07 and 08 point at this program's reversals; the `phh` hand-off note is written.
- [x] No migration was written and no RLS policy changed. `git diff --stat backend/migrations/` is empty. **p5-empty. Untracked `196`/`197` are p3/p4.**
- [ ] Typecheck + lint + tests green in both workspaces; no PHI in any new log line. **Backend tsc + eslint + 61 Jest green. Frontend Vitest 10/10 green; `tsc` 98 pre-existing errors (cockpit), none in p5 files. Lint exit 0 with pre-existing warnings.**

**Either/or (rec-34):** rec-33 flag **not flipped**. Path B **kept** (residue 0/14; live unmeasured).

---

**Created:** 2026-08-17. Updated 2026-08-22 (rec-34 honesty pass).
