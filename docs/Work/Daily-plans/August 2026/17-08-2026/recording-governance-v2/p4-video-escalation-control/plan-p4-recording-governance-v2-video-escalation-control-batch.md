# Plan p4 — Video escalation control

## 17 Aug 2026 — Batch `recording-governance-v2` / `p4-video-escalation-control` (rec-21..27) — **L, ~3 dev-days (~21h)**

> **Status:** Code shipped 2026-08-20 (rec-21…26). Migration **197**. rec-27 automated gate recorded 2026-08-20. **Founder smoke + metric #3 not done — p4 is not Closed.**
> **Charter:** [`../plan-recording-governance-v2-charter.md`](../plan-recording-governance-v2-charter.md) (REC-D1…REC-D25 — this phase owns **REC-D6…REC-D12**)
> **Program:** [`../README.md`](../README.md) · Prefix `rec` (continuous numbering across phases)
> **Exec order:** [`Tasks/EXECUTION-ORDER-p4-recording-governance-v2-video-escalation-control.md`](./Tasks/EXECUTION-ORDER-p4-recording-governance-v2-video-escalation-control.md)
> **Migration:** exactly **one** (rec-21, budget 198 — re-derive from the live head)

---

## Why this phase

**Start by reading the code, because the escalation flow is genuinely well built.** Plan 08 Tasks 40–43 shipped a state machine that holds up:

- A **60-second consent window** backed by a durable DB-polling worker (`backend/src/workers/video-escalation-timeout-worker.ts`), not an in-memory timer. The service header (`recording-escalation-service.ts:35-43`) explains why: a pod restart would leave the audit row `pending` forever and strand the doctor UI.
- **`MAX_ATTEMPTS = 2`** per consult and a **5-minute cooldown** after decline/timeout, enforced against a durable Postgres table so a restart can't reset the counter (`recording-escalation-service.ts:264-266`, `:432-480`).
- **Escape deliberately disabled** on the patient consent modal (`VideoConsentModal.tsx:56-58`) so a dismissal can never be read as consent.
- **Preset reason codes** (`visible_symptom`, `document_procedure`, `patient_request`, `other`) with a required clinical note, mirrored by a DB CHECK.
- A **patient revoke path** with an atomic guard, a double-row Twilio ledger, a system message to both parties, and an idempotent `already_audio_only` result (`patientRevokeVideoMidCall`, `:920-1113`).

None of that is being re-litigated. **The problems are all at the edges of the grant** — what a stop costs, how long a grant lasts, what the patient can do short of stopping, how fast the control is, who may start it, and whether the patient understands what they are agreeing to.

### DEFECT 1 — a consensual stop punishes the doctor (REC-D9)

`deriveState` (`recording-escalation-service.ts:766-832`) treats an allow-that-was-later-revoked exactly like a decline. `isRevokedAllow` (`:804-805`) maps to `lastOutcome: 'decline'`, the row counts toward `attemptsUsed` (`attemptsUsed = rows.length`, `:774`), and the 5-minute cooldown is measured **from the original `requested_at`, not from `revoked_at`** (`:803`). The same rule is duplicated in the request-time rate limiter (`isTerminalRevokedAllow`, `:462-472`) and mirrored client-side in `frontend/hooks/useVideoEscalationState.ts:175-201`.

With `MAX_ATTEMPTS = 2`, a patient who shows a rash, stops, and two minutes later wants to show a wound leaves the doctor locked out for the rest of the consult. The rule was written (Plan 08 Task 42, Migration 073 header) on the assumption that a revoke signals discomfort. Under REC-D7, stopping is a **normal, expected control**. REC-D9 splits the counters: decline and timeout keep the existing arithmetic; allow-then-stop costs no attempt and no cooldown, with a 30-second debounce in its place.

### GAP 2 — no auto-revert (REC-D8)

Once allowed, video records until something else ends it. Every other window in this flow is time-bounded — the consent window, the cooldown, even the replay OTP window — but the thing that actually captures video is not.

It is slightly worse than "the doctor can revert". **There is no doctor-facing revert path at all.** `revertToAudioOnlyRecording` has exactly two callers: `patientRevokeVideoMidCall` and Plan 09's modality-transition executor (`modality-transition-executor.ts:510,592`). The doctor never gets to stop video recording they started; the only ways off video today are the patient stopping it, a modality change, or the room ending. So the only bound on a video grant is the patient remembering to stop it.

REC-D8: default **2-minute grant**, visible countdown to both parties, auto-revert to audio-only on expiry, doctor may extend **once**. A doctor-facing manual revert is **not** in this phase's scope — the expiry mechanism supersedes the need for one, and adding a doctor "stop recording" control raises its own question (does it need to be attributed and announced?) that nobody has decided.

### GAP 3 — stop exists, pause does not (REC-D7)

`VideoRecordingIndicator.tsx` gives the patient `[Stop]` plus a confirmation tooltip that calls `revokeVideoRecording`, and that is the **entire** patient surface. There is no pause. REC-D7 requires both, with different guarantees: pause is temporary and resumes **without re-consent** (the patient already consented; they are stepping out of frame) and must **not** create a new `video_escalation_audit` row; stop ends the grant and a restart needs a fresh request.

### GAP 4 — stop has a server round-trip in it (REC-D11)

Today: tap → confirm → `POST /video-escalation/revoke` → Twilio rule flip. That is plausibly 1–3 seconds of continued capture after the patient decided to stop. A control we frame as "yours at any moment" cannot have a network hop in it. REC-D11: kill the local video track client-side **immediately** on confirm, then call the server; the server rule-flip stays the ledger's source of truth.

### GAP 5 — the patient cannot offer video (REC-D12)

`patient_request` already exists as a preset reason, but the flow still requires the doctor to click request and the patient to consent to their own request — a double step that burns one of the doctor's two attempts. REC-D12: a patient offer is **self-consenting** (no modal) and costs **no doctor attempt**.

### GAP 6 — comprehension (REC-D7 / REC-D10)

In a video consult the camera is already streaming. Escalation only changes whether Twilio **stores** it. Patients will not infer that distinction from "Your doctor would like to record video". Compounding it, the consent modal deliberately offers no "turn off my camera" option (`VideoConsentModal.tsx:44-47`), so a patient who declines *saving* has no in-product way to stop *being seen*. Copy must make "already visible vs. being saved" unmissable, and must never imply that stopping deletes anything (REC-D10 — erasure is p5's job).

### REC-D6 — no specialty gate (recorded, not built)

A proposal to gate the escalation button by `doctor_settings.specialty` was discussed on **2026-08-17 and rejected**. It was never built, so there is nothing to remove. It is recorded here so nobody re-proposes it:

- Specialty is a poor proxy for clinical need — GPs see rashes, wounds and jaundice constantly.
- `doctor_settings.specialty` is self-declared, and Indian practice is frequently mixed-scope.
- The real control belongs to the patient, which is what the rest of this phase builds.

Escalation rate per doctor stays a **review signal**, not a block.

---

## Decision lock

### Inherited from the charter — do not re-litigate

| ID | Phase note |
|----|------------|
| REC-D1…REC-D25 | Inherited whole. |
| **REC-D6** | No specialty gate. Nothing to build, nothing to remove — recorded above so it stays decided. |
| **REC-D7** | Patient holds pause **and** stop for video at all times, persistently visible, never behind a menu or a handshake. rec-24 + rec-26. |
| **REC-D8** | Grants are time-bounded: 2-minute default, countdown to both parties, auto-revert, one doctor extension. rec-21 + rec-22. |
| **REC-D9** | A consensual stop costs the doctor nothing. rec-23. |
| **REC-D10** | Stop halts future capture; it is **not** deletion. Copy constraint on rec-24 + rec-26; erasure is p5. |
| **REC-D11** | Client kills the local video track first, then calls the server. rec-24. |
| **REC-D12** | Patient may offer video; self-consenting, no doctor attempt. rec-25. |

### Phase decisions (new — pinned here so tasks don't each re-derive them)

| ID | Decision |
|----|----------|
| **REC4-D1** | **Exactly one migration** (rec-21). Budget number is **198**; head at writing is `195_appointment_start_notify_stamp.sql`. The task re-derives the number from the live folder. The same file must also widen the existing `video_escalation_audit_revoke_reason_check` (Migration 073) to carry the auto-revert reason — that is an additive DROP/ADD CONSTRAINT in the same migration, not a second file. **A second migration file, or any RLS change, is STOP-and-surface.** |
| **REC4-D2** | Grant default **120 s**; a single extension adds **120 s**. Both live as named server constants beside `EXPIRY_SECONDS` / `COOLDOWN_MINUTES` / `MAX_ATTEMPTS`. Countdowns on both clients anchor to the server-assigned expiry timestamp, never to `Date.now() + N` — same clock-skew doctrine the 60 s consent window already follows. |
| **REC4-D3** | Expiry is enforced by a **durable DB-polling worker**, following `video-escalation-timeout-worker.ts` exactly. No `setTimeout`. The service header's rejection of in-memory timers applies verbatim to grant expiry, and the failure mode is worse: a lost timer means video keeps recording. Auto-revert reuses `revertToAudioOnlyRecording`; it must never be reached from a client call. |
| **REC4-D4** | `attemptsUsed` stops being `rows.length`. It becomes a **filtered count of chargeable rows** (doctor-initiated, and terminal-by-decline/timeout or still active/pending). Consequence: the audit read can no longer be capped at `MAX_ATTEMPTS` rows — a consult may now legitimately hold more rows than attempts. **All three** `fetchRecentRowsForSession` callers pass `MAX_ATTEMPTS` as the limit today (`:433`, `:756`, `:955`) and must widen together; the revoke path's own comment at `:952-954` already anticipates needing more than two. The existing `idx_video_escalation_audit_session_time` index covers the wider read. |
| **REC4-D5** | The consensual-stop debounce is **30 s from `revoked_at`** and is surfaced through the **existing `cooldown` state** with an additive `lastOutcome: 'stopped'` value. No new state `kind` — the wire type is consumed by the doctor hook, the button, and the patient hook, and widening a union member is cheaper than adding a variant. The doctor's "requests left" copy must **not** decrement on a stop. |
| **REC4-D6** | **Pause is not revoke.** Pause writes only the new pause state, leaves `revoked_at` NULL, keeps the grant, keeps the derivation at `locked: already_recording_video`, and **never inserts a new `video_escalation_audit` row**. Resume requires no consent and must not route through `requestVideoEscalation`. |
| **REC4-D7** | On both pause and stop the client halts local video **first**, then calls the server. The existing camera control already documents the right primitive: `VideoRoom.tsx:3554-3557` uses Twilio's `disable()` rather than `unpublishTrack` precisely because it stops frames without a ~1 s renegotiation. Two hard consequences to honour: (a) the patient goes camera-off from the doctor's view, so copy must say so; (b) the patient must not be able to re-enable the camera until the server has confirmed the rules are back to audio-only — otherwise a failed flip silently resumes capture. |
| **REC4-D8** | A patient offer sets `preset_reason_code = 'patient_request'` with a **server-authored canonical reason string** that satisfies the existing `char_length(reason) BETWEEN 5 AND 200` CHECK (same technique as the pinned canonical copy in `patientRevokeVideoMidCall` step 5). No patient free text — so no patient-authored content lands in a governance table. |
| **REC4-D9** | Making the doctor's free-text note **optional** alongside the presets is **deferred, not adopted**. `video_escalation_audit.reason` is `NOT NULL CHECK (char_length BETWEEN 5 AND 200)` (Migration 070), so relaxing it needs a second migration, which REC4-D1 forbids. The reason is shown to the patient verbatim, which makes it lower-risk than p3's pause reason — but it is still doctor-typed free text in a governance table. Recorded as a deferred decision for p5 or a follow-up; **do not** implement optional free text in this phase. |
| **REC4-D10** | **No ceiling on consensual re-requests in v1.** Refunding the attempt on a stop means a consult can, in principle, cycle allow → stop → request indefinitely. That is the intended consequence, and the patient consents every single time. Past a threshold (start at 4 grants in one consult) log an operational signal — no block, no banner. Same posture REC-D18 takes for cumulative pause time: let the data decide whether enforcement is ever needed. |

---

## Waves

| Wave | Task | Size | Model | Scope |
|------|------|------|-------|-------|
| 1 | [`rec-21`](./Tasks/task-rec-21-migration-video-grant-bounds.md) | S | **Opus** | Migration: grant bounds + extension stamp + patient video pause state + `revoke_reason` widening; types; content-sanity test |
| 2 | [`rec-23`](./Tasks/task-rec-23-derive-state-counter-split.md) | M | **Opus** | `deriveState` counter split (REC-D9) across all three derivation sites + header doc rewrite |
| 3 | [`rec-22`](./Tasks/task-rec-22-grant-expiry-auto-revert.md) | M | Sonnet | Time-bounded grant, durable expiry worker, auto-revert, one extension |
| 3 | [`rec-25`](./Tasks/task-rec-25-patient-video-offer.md) | M | Sonnet | Patient-initiated offer: self-consenting, no doctor attempt, correct audit shape |
| 4 | [`rec-24`](./Tasks/task-rec-24-patient-video-pause-instant-kill.md) | M | Sonnet | Patient video pause distinct from stop + instant local halt on both |
| 4 | [`rec-26`](./Tasks/task-rec-26-recording-status-surface.md) | M | Sonnet | Consent + indicator copy and one unified recording-status surface |
| 5 | [`rec-27`](./Tasks/task-rec-27-close-gate-p4.md) | S | Sonnet / Founder | Verification gate, charter metric #3, founder smoke |

**Two Opus tasks — at the cap.** rec-21 is Opus because it is a migration (agent hard-rules list). rec-23 is the second because it rewrites a *locked* state-machine derivation that is duplicated in three places, is documented in prose in two file headers and one migration header, and whose failure mode is silent: get it wrong and the doctor is either locked out mid-consult or handed unlimited attempts, with no type error either way. Everything else in the phase is bounded wiring against contracts these two land.

---

## Coordination boundaries

**p3 (pause integrity) owns pause semantics. p4 consumes them.**

p3 owns `recording-pause-service.ts` — its `DEFAULT_KIND` (`:100`), kind resolution across active recording kinds (REC-D13), preset reason codes (REC-D14), patient-initiated **audio** pause (REC-D15), the 5-minute auto-resume (REC-D16), and gap markers in the player and transcript (REC-D17). **p4 must not edit any of it.** In particular, p3 — not p4 — defines what happens to an active *video* grant when someone pauses *audio*.

p4 owns the **video grant**: its lifetime, its own pause/resume, its stop, its counters, its copy.

Sequencing: **run p4 after p3 if you can.** If p3 has already shipped, rec-24 routes its video pause through p3's kind-scoped pause primitive rather than opening a second Twilio-flip path. If p3 has not shipped, rec-24 uses the existing `recording-track-service` rule-flip primitives and leaves `recording-pause-service.ts` untouched, keeping its ledger rows shaped so p3's gap renderer can consume them later. Either way, if rec-24 finds itself wanting to change `DEFAULT_KIND` or p3's kind resolution, that is a **STOP-and-surface**, not a scope expansion.

**p5 (access + retention) owns multi-composition replay.** See the consequence below. p4 does not touch the replay player.

---

## Finding surfaced during planning — a second, unconsented path to video recording

`modality-transition-executor.ts:465-493` (`voice → video`, Plan 09) calls `escalateToFullVideoRecording` **directly**, passing a synthetic `escalationRequestId` of the form `modality_change:<correlationId>`. Its own comment says so plainly: *"without needing a matching `video_escalation_audit` row (there isn't one — Plan 09 writes to `consultation_modality_history` instead)"*.

Two consequences, both real:

1. **Video recording can start with no `video_escalation_audit` row and no consent modal.** That sits badly against attestation clause 6 ("video capture requires explicit patient consent, every single time") and against REC-D7's premise that the patient holds the control.
2. **Everything this phase builds keys off that row.** A modality-change-initiated video recording therefore has no grant expiry, no countdown, no patient pause or stop affordance, and no auto-revert — the exact unbounded state REC-D8 exists to eliminate, reachable by a different door.

**This is out of p4's scope and must not be silently fixed here.** Plan 09's transition semantics and the modality-change consent question belong to whoever owns that program, and answering it is a product decision, not a wiring task. What p4 does:

- rec-22's expiry worker operates on grants that **have** an audit row, and must not crash or mis-handle a session whose video recording has none. It should treat "video is recording but no grant row exists" as an anomaly it **logs and surfaces**, not as a grant to expire.
- rec-27's close gate records whether the anomaly is reachable in practice.
- The decision itself is escalated to the founder as a charter-level question (does REC-D7/D12 extend to modality-change-initiated video?). Do not resolve it inside a task.

---

## Consequence — multiple video compositions per consult

`recording-track-service.ts:18-21` is explicit: a revert closes the in-flight video Composition at t=revert, and a later escalation produces a **second** Composition, not a continuation. Adding pause/resume to video therefore yields **several** video compositions in one consult, on top of the ones an allow → stop → re-request cycle already produces.

The data shape holds: `getRecordingArtifactsForSession` (`:761-820`) already returns `videoCompositions` as a sorted array. The **replay player does not** — `RecordingReplayPlayer.tsx` carries a single `hasVideo: boolean` and mints one signed URL per artifact mode (`ArtifactMode = "audio" | "video"`, `:56`), so it expects to pick one composition.

**This is noted and handed to p5.** p5 owns multi-composition replay. Do not build it here; do not "temporarily" make the player pick the longest or the latest. rec-27's close gate records the number of video compositions a pause-heavy smoke consult produced, so p5 inherits a real number instead of a guess.

---

## Scope guard — DO NOT TOUCH

- The **artifact registry writer** and the composition-finalised webhook (p1).
- **Consent removal** — the booking checkbox, `recording-consent-service.ts`, the doctor attestation (p2).
- **Audio pause semantics** — `recording-pause-service.ts`, `DEFAULT_KIND`, pause reason codes, auto-resume, gap markers (p3).
- The **replay player's multi-composition handling** and every **deletion / erasure** path (p5).
- The **90-day patient self-serve window** and the **video replay OTP gate** (REC-D25).
- **Plan 08 Decision 10's audio-only baseline** — video stays opt-in per instance; the baseline at room create is untouched.
- **Twilio room create / end**, room naming, lazy creation, and the check-in lobby (`crc`).
- **`modality-transition-executor.ts`** and Plan 09's modality-change semantics — including the unconsented `voice → video` escalation described above. Log it, surface it, do not fix it here.
- `EXPIRY_SECONDS = 60` (the consent window), the Escape-disabled behaviour of the consent modal, and the `MAX_ATTEMPTS = 2` ceiling itself — REC-D9 changes **what counts** as an attempt, not the ceiling.
- Any **RLS policy**. `video_escalation_audit`'s participant SELECT policy and its deliberate absence of client-write policies stay exactly as Migration 070 left them. If a step appears to need an RLS change, **STOP** and surface it.
- Any **second migration**. **STOP** and surface it.

---

## Compliance constraints (phase-wide)

- **No PHI in logs.** The escalation `reason` is doctor-typed free text. It is currently never logged — the service logs `presetReasonCode`, `attemptsUsed` and ids only (`:529-540`). Every new log line in this phase keeps that property: codes, ids, timestamps and counts, never `reason`, never a patient name.
- The reason is shown to the patient verbatim, which makes it self-policing in a way p3's pause reason is not — the doctor knows the patient reads it. That lowers the risk; it does not remove it. See REC4-D9.
- Patient-side offers carry **no free text at all** (REC4-D8).
- Copy must never state or imply that stopping deletes anything (REC-D10).

---

## Acceptance gate (phase)

- [ ] A patient who allows, stops, and then wants to show a second thing can be asked again **in the same consult**: the stop consumed no attempt, started no 5-minute cooldown, and the doctor's button re-enables after a 30-second debounce.
- [ ] Decline and timeout behave **exactly as they do today** — one attempt consumed, 5-minute cooldown from `requested_at`, two-strikes lockout.
- [ ] An allowed grant auto-reverts to audio-only at expiry without anyone touching anything; both parties saw a countdown; the doctor could extend it once and only once.
- [ ] Killing the API mid-grant (or the cron) does not leave video recording forever — expiry is durable, not in-memory.
- [ ] The patient can **pause** video and resume it with no second consent prompt, and no new `video_escalation_audit` row is created by a pause/resume cycle.
- [ ] The patient can **stop** video; a restart requires a fresh request.
- [ ] On both pause and stop, local video halts before the network call returns — measured, not asserted (charter metric #3, ≤250 ms).
- [ ] After a stop, the patient cannot re-enable their camera until the server confirms the rules are back to audio-only.
- [ ] A patient can **offer** video with no modal and no doctor attempt consumed; the audit row records the patient as initiator.
- [ ] One surface shows audio state and video state **independently**, so no patient can believe stopping video stopped everything. The `[Stop]` aria-label's existing "audio will continue" instinct is preserved and generalised.
- [ ] Consent copy distinguishes "your camera is already on" from "this saves it", and never implies deletion.
- [ ] A video recording with no grant row (the `voice → video` modality path) is logged as an anomaly and does not break the expiry worker; the charter-level question it raises is written down and escalated, not answered in a task.
- [ ] Exactly one new migration; it applies clean; no RLS shape change.
- [ ] Backend + frontend typecheck, lint and tests green; no PHI in logs; the number of video compositions produced by a pause-heavy consult is recorded for p5.

---

**Created:** 2026-08-17.
