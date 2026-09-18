# Plan p3 — Ambient walk-in capture

## 31 Aug 2026 — Batch `visit-narrative` / `p3-ambient-walkin` (`vna-01..06`) — **XL, ~33h · Opus throughout**

> **Status:** **DRAFTED — NOT PROMOTED.** This file is a specification, not a commitment. **No task in this phase may be executed** until the unblock conditions below are answered. VN-DL-9 is a product-plan lock: an in-clinic microphone is *"own program, consent surface, outside counsel"* (`Business/tracks.md` L9). Drafting the plan is allowed; merging capture code is not.
> **The Phase-2 override is not a precedent here.** On 2026-08-30 the owner overrode `vnt-02` §1 — a **ship** gate on text that had *already been captured under a disclosed recording mandate*. This phase's gate is different in kind: it gates whether audio of a person who agreed to nothing may be captured **at all**. See VNA-D1.
> **Product plan:** [`plan-visit-narrative.md`](../../../../../Product%20plans/plan-visit-narrative.md) (VN-DL-8, 9, 10, 11, 12 — this phase is the one the program deferred)
> **Prior phases:** [`../p1-one-box/`](../p1-one-box/) (shipped) · [`../p2-transcript-amendment/`](../p2-transcript-amendment/) (gate-green; production ship still blocked on attestation). This phase **reuses** Phase 2's extract route, proposal, amendment surface, and provenance table. It does not rebuild them.
> **Program:** [`../README.md`](../README.md) · Prefix `vna`
> **Exec order:** [`Tasks/EXECUTION-ORDER-p3-visit-narrative-ambient-walkin.md`](./Tasks/EXECUTION-ORDER-p3-visit-narrative-ambient-walkin.md)

---

## Why this phase exists (and why it is the one we deferred)

Phase 1 made one box take anything the doctor **types or dictates**. Phase 2 taught the chart to read the **teleconsult transcript** the platform already pays for. Both moved a doctor's own words, or words already captured under a disclosed recording mandate, into structured fields.

The majority of this clinic's consults are neither. They are **walk-ins** — a patient physically in the room, no Twilio room, no recording, no transcript, and a doctor typing while trying to listen. That is the intake source with the most clinical value and, not coincidentally, the only one that requires putting a microphone in a physical consulting room.

The engineering here is smaller than it looks and the consent problem is bigger than it looks. Once a walk-in visit has a transcript, **every downstream part already exists** — `vnt-02`'s span-verified extract route, `vnt-03`'s evidence-tier proposal with its verbatim quote, `vnt-04`'s amendment surface, `vnt-01`'s provenance table. This phase is an **intake source**, not a second brain (VNA-D5). What it actually has to build is: consent, audio capture, an identity for a visit that has no session row, and a transcription path for audio that never went through Twilio.

Three of those four are hard-rules surfaces. The fourth is a consent surface that is not an engineering decision at all.

---

## Unblock conditions

All four must be true before `vna-01` starts. **None of them is an agent decision, and three are not even owner decisions alone.**

### 1. L9 counsel answer — in-clinic ambient audio (the phase gate)

`Business/tracks.md` L9 already carries this thread. What counsel has to answer, specifically — vague approval is not usable:

1. **May a walk-in patient's consult be audio-recorded at all**, under DPDP, with what form of consent (written / verbal-logged / on-screen), captured by whom, and retained where?
2. **Does consent have to be per-visit**, or can it be per-patient-standing? If standing, what is the withdrawal path and what happens to audio already captured?
3. **Third parties in the room.** An attendant, parent, spouse, or interpreter is captured too and is not the data principal. Does their presence require separate consent, or does it forbid capture? (VNA-D8)
4. **What must the patient be told** at the point of capture — that it is recorded, that it is transcribed, that a model reads the transcript to draft chart entries, how long it is kept, and how to have it erased? Clause wording is counsel's, not ours (REC-D2).
5. **Does a decline have to be unrecorded?** "Patient refused recording" is itself a data point about a person. Is storing it lawful, and is storing it wise? (Note there is already precedent in the schema — see below — so the honest question is whether that precedent extends to a physical room.)

> ⚠️ **The existing attestation does not reach this.** `backend/src/constants/recording-attestation.ts` has six clauses. Clause 1 — *"Every voice and video consult is audio-recorded. You cannot disable this."* — is scoped to **voice and video consults**, which in this platform's vocabulary means a Twilio session. An in-person visit is neither. Clause 6 covers *video* consent. **No clause reaches a microphone in a physical room**, and the policy version is still `RECORDING_ATTESTATION_POLICY_VERSION = 'DRAFT-REC-D2-UNAPPROVED'` with a file comment saying the draft must not ship. That is two separate blockers: no basis, and no approved policy string to attach one to.
>
> ✅ **The right shape was already designed once.** `backend/migrations/053_appointments_recording_consent.sql` (Plan 02 Task 27, Decision 4) put a **per-appointment patient consent record** on `appointments`: `recording_consent_decision BOOLEAN` (NULL = never asked, TRUE = opted in, FALSE = declined), `recording_consent_at`, and `recording_consent_version` — a snapshot of the wording the patient actually saw, explicitly *"never overwritten on later version bumps (that's the legal-defensibility property)"*. Per that header, `FALSE` means *the consult proceeds and recording does not start* — exactly the shape an in-room decline needs. It also answers question 5 partially: **storing a decline already had a design.**
>
> ⚠️ **And it was dismantled on purpose — read this before assuming it can be switched back on.** When REC-D4 made audio a two-sided mandate, recording-governance-v2 removed the consent machinery deliberately, task by task: `rec-08` retired the web-booking consent ask, `rec-09` retired the DM consent funnel stage, `rec-10` removed the downstream consent gates. Patient consent `v1.0` was retired with them, and `recording-attestation.ts` forbids reusing that string by name. **What survives is the three columns and a single type reference in `conversation-state-io.ts` — the read service `053`'s header names does not exist in the codebase, and neither capture surface does.** So reviving consent means rebuilding the ask, the read path, and the gate; only the schema and the reasoning survive. That is why `vna-01` is Opus and why counsel — not this plan — decides. See VNA-Q5.

**Answer:** ⟨fill — counsel, date⟩

> **Refused 2026-08-31.** Owner asked to "start implementation". Unblock conditions 1–4 are still `⟨fill⟩`. Per VNA-D1 this is a STOP, not an override: the Phase-2 skip was a ship gate on text already captured under a disclosed mandate; this gate is whether a person who agreed to nothing may be recorded at all. No `vna-*` code was written.

### 2. A non-DRAFT policy version (REC-D2)

Phase 2's production-ship blocker is a **subset** of this one. Nothing here can attach a consent record to a policy version while the only version string in the codebase announces itself as unapproved.

**Answer:** ⟨fill — owner/counsel, date⟩

### 3. VNA-Q1 — session identity for a walk-in (owner **STOP**)

Not a compliance question, but it gates the same first task, and it is the finding most likely to be missed by someone estimating this phase from the outside. See Open questions below.

**Decision:** ⟨fill — owner, date⟩

### 4. Fork question — is this a phase or its own program?

VN-DL-9 says *"own program"*. The product plan's phase table says *Phase 3 of visit-narrative*. Both are in the repo and they disagree. This draft is written as a phase, in the program folder, because that is what the live phase table reserves — but at ~33h across six Opus tasks, a new PHI intake path, a new bucket, a consent surface, and a migration that touches a shipped ENUM, **this is program-sized work wearing a phase's clothes.**

Recommendation (a recommendation, not a decision): **promote it as its own program** (`ambient-capture`, prefix `vna` retained) with this file as its charter, and leave the visit-narrative phase table pointing across. Reason: the consent surface, the audio pipeline, and the retention posture have nothing to do with "one box parses text" and will outlive this program. If it stays a phase, nothing breaks — the folder layout is already correct either way.

**Decision:** ⟨fill — owner, date⟩

---

## Decision lock (phase — inherits the product plan)

| ID | Phase decision |
|----|----------------|
| VN-DL-1…13 | Inherited. **Do not re-litigate.** |
| **VNA-D1** | **Counsel gates the phase, not the ship.** Phase 2's compliance STOP was about a *new processor hop over text already lawfully captured*; the owner could override it and did. This gate is about **creating** PHI from a person who agreed to nothing. No capture code merges — not behind a flag, not "for dev only", not "just the upload route" — before unblock condition 1 has a recorded answer. An agent asked to start anyway must **STOP and surface**, and record the refusal in this file. |
| **VNA-D2** | **The mic never arms itself.** Capture requires an explicit per-visit action, after consent is recorded. Default state is disarmed. A visible, non-dismissible indicator is on for the entire time the mic is live. No "remember this clinic", no auto-arm on room entry, no arming from a settings toggle. If the indicator is not visible, capture stops. |
| **VNA-D3** | **One capture, one appointment.** The capture is bound to a single appointment id at arm time. Navigating away, ending the visit, or hitting the duration cap **hard-stops** it. Audio from patient A reaching patient B's chart is a **P0**, and a mic left running between two patients in the same room is the single most likely way it happens. |
| **VNA-D4** | **Room audio is governed by the existing `rec-*` machinery, or it does not ship.** Every captured object registers in `recording_artifact_index` and inherits archival, hard-delete, and the DPDP erasure path. **A parallel retention world for room audio is a STOP** — that is precisely how PHI ends up ungoverned. Note the coupling this creates: `recording_artifact_index.session_id` is `NOT NULL REFERENCES consultation_sessions(id)`, which is why VNA-Q1 is a gate and not a detail. |
| **VNA-D5** | **No new AI. No second brain.** The transcript re-enters `vnt-02`'s route, prompt, and service **unchanged**. VNT-D3 ("exactly one new AI route / prompt / service") holds program-wide, and this phase does not get an exception. A summariser, a "structure the whole visit" prompt, or a second extraction service is a STOP. |
| **VNA-D6** | **Still post-hoc (VN-DL-8 holds).** No streaming STT, no live field-filling while the patient talks. The transcript arrives after the visit and lands as the same **chart amendment** Phase 2 built. A real-time scribe is a different product with a different risk profile; it is not this. |
| **VNA-D7** | **Never the Web Speech API (VN-DL-10).** Chrome's `SpeechRecognition` ships audio to Google. Defensible for the doctor dictating alone; a third-party processor the moment a patient is in the room. Patient-present audio goes to the platform's own providers only (`consultation_transcripts.provider` is `CHECK (provider IN ('openai_whisper','deepgram_nova_2'))`). `frontend/lib/text/use-speech-recognition.ts` must remain unreachable from any capture path — asserted by test, not by intent. |
| **VNA-D8** | **Third parties are in scope, not an afterthought.** An attendant, parent, or interpreter in the room is captured and is not the data principal. Their handling is part of unblock condition 1, and the surface copy has to reflect whatever the answer is. Silence here is not neutrality; it is a decision to record them. |

---

## Open questions (phase) — verify, do not assume

### VNA-Q1 — How does a walk-in visit acquire session identity? (owner **STOP**)

Phase 2's entire spine is keyed on a `consultation_sessions` row. A walk-in does not have one, and cannot today:

- `backend/migrations/049_consultation_sessions.sql` defines `CREATE TYPE consultation_modality AS ENUM ('text', 'voice', 'video')` — **no `in_person`**. `consultation_sessions.modality` is that ENUM, `NOT NULL`.
- `consultation_transcripts.consultation_session_id` is `NOT NULL REFERENCES consultation_sessions(id)`.
- `recording_artifact_index.session_id` is `NOT NULL REFERENCES consultation_sessions(id) ON DELETE RESTRICT` — so retention governance (VNA-D4) needs the same row.
- `vnt-02`'s extract route takes a `consultationSessionId`; `vnt-04`'s timeline offer reads `transcriptStatus` off it.
- Note `backend/migrations/199_billing_usage_ledger.sql` already writes `modality TEXT NOT NULL CHECK (modality IN ('video','voice','text','in_person'))` — the *billing* layer already has a name for an in-person visit. The *session* layer does not.

| Option | Shape | Cost |
|---|---|---|
| **(a) Widen the ENUM** ← *recommended* | `ALTER TYPE consultation_modality ADD VALUE 'in_person'`, then create a session row for a walk-in visit. Phase 2's spine, `recording_artifact_index`, archival, and erasure all work **unchanged**. | **Irreversible** — Postgres cannot drop an ENUM value. Every `switch`/`match` on modality across the codebase silently gains an unhandled case. Also needs a **new `provider` string**: `provider` is `NOT NULL` and the registered values are `twilio_video`, `twilio_video_audio`, `supabase_realtime` — none of which describes a microphone in a room. `scheduled_start_at` / `expected_end_at` are `NOT NULL` too. Requires grepping every modality branch **before** the ALTER, not after. |
| **(b) New anchor table** | Ambient captures + transcripts keyed on `appointment_id` instead. Additive, reversible. | Forks the read path — the extract route, the timeline offer, and the provenance FK all grow a second key. And `recording_artifact_index` still cannot hold the artifact, so VNA-D4 either fails or you build the parallel retention world it forbids. |
| **(c) Synthetic session** | Create a `voice` session row that never had a Twilio room. | Cheapest to write, worst to live with: every report, metric, and audit that counts "voice consults" is now wrong, silently and forever. |

**Recommendation:** **(a)**, with the ENUM's irreversibility accepted with eyes open and a mandatory pre-ALTER grep of every modality branch. Reason: (b) and (c) both end by either duplicating or corrupting the machinery that already governs recorded audio, and VNA-D4 says that machinery is not optional.

**Decision:** ⟨fill — owner, date⟩

### VNA-Q2 — Is ambient a distinct source, or does it reuse `transcript`?

VN-DL-11 fixed the telemetry sources as `typed | dictated | transcript`; `vnt-05` shipped `transcript` with an offered-vs-accepted denominator. VN-DL-12 gave transcript-derived rows provenance and a verbatim quote.

Room audio *is* a transcript, so reuse is defensible and free. But a clinician auditing a chart entry a year later has a real interest in knowing whether the patient's words were captured **over a teleconsult they booked** or **by a microphone in the room** — those are different consent bases. Default: **reuse `transcript` for telemetry** (VN-DL-11's list stays closed), **distinguish in provenance** (`visit_narrative_provenance` already stores a transcript id; whether it needs a capture-source column is `vna-05`'s call). Verify against the shipped table before deciding — do not add a column speculatively.

### VNA-Q3 — Multi-segment capture vs the unique index

`061_consultation_transcripts.sql` declares a unique index on `(consultation_session_id, provider)` — **one transcript row per session per provider**. A walk-in capture that is paused and resumed, or split across two arm/disarm cycles, has no place to put the second segment. Options: concatenate before insert (loses per-segment spans, and spans are what VNT-D2 verifies against), relax the index (touches a shipped table), or model segments separately. `composition_sid` is also `TEXT NOT NULL` with no Twilio composition to name — the transcription service already stuffs a placeholder (the room SID) on insert, so a placeholder convention exists, but it is a Twilio-shaped one.

### VNA-Q4 — Who may arm the mic?

Mirror `VNT-Q3` (doctor only) and make it explicit at the route rather than incidental. Clinic staff exist in the auth model (`allowStaff`, `resolveActingDoctor`). Front-desk arming is plausible for workflow and worse for consent — the person who takes consent should be the person who arms.

### VNA-Q5 — Revive `appointments.recording_consent_*`, or add an in-room consent record?

| Option | Shape | Cost |
|---|---|---|
| **(a) Revive the existing columns** ← *recommended* | New non-retired `RECORDING_CONSENT_VERSION`, reuse `recording_consent_decision / _at / _version` on the appointment row for in-person visits. The arming gate reads *decision IS TRUE **and** version = the active one*. | Overloads three columns with two different consent bases (teleconsult mandate vs in-room capture) — mitigated by the version snapshot, which *is* the discriminator and was designed to be. **The saving is only the schema:** `rec-08`/`09`/`10` removed the ask, the read path, and the gates, so all three get rebuilt either way. |
| **(b) New in-room consent table** | Separate table, separate policy version, no ambiguity about which basis a row represents. | A second consent surface to keep in sync, a second thing to remember during erasure, and it discards a column set whose "never overwritten" property was already argued for and shipped. |

**Recommendation:** **(a)**. The columns' documented purpose — *snapshot the exact wording this patient saw, never rewrite it* — is precisely the legal-defensibility property in-room capture needs, and the version string already distinguishes bases. **Hard constraint either way: the retired patient-consent `v1.0` string must not be reused** (`recording-attestation.ts` forbids it by name), and the new string is owner/counsel-approved, never agent-authored (REC-D2).

**Where consent is captured is a separate question from where it is stored.** For a teleconsult the bot asked at booking. A walk-in may be booked at the desk minutes earlier or not at all, so the capture surface is check-in or the room itself — and per VNA-Q4 the person who takes it should be the person who arms the mic.

---

## Scope Guard — DO NOT TOUCH

- **Any capture code before unblock condition 1** (VNA-D1). This is the whole point of the phase being Drafted.
- Phase-1 typed / dictated behaviour and Phase-2 transcript behaviour. Their suites are the regression lock (VNT-D8 extends here).
- The Twilio path: room creation, recording rules, Composition hooks, `voice-transcription-worker.ts`'s existing composition branch. This phase **adds** an input; it does not re-plumb the one that works.
- `recording_artifact_index`, `archival_history`, the retention / hard-delete workers, and the `rec-*` erasure machinery — **consumed, not modified** (VNA-D4).
- A second AI route, prompt, or service (VNA-D5). A second apply path (VNT-D5 still holds).
- Streaming / live STT (VNA-D6). Speaker diarisation (still deferred program-wide).
- `frontend/lib/text/use-speech-recognition.ts` (VNA-D7) — not extended, not reused, not reachable.
- The structured form (VN-DL-2). Still byte-identical, still not this program.
- Text-consult message ingestion. Still the lowest-value source.

---

## Tasks

**No task file may be executed while this plan is Drafted.** Each one opens with a §0 pre-flight that is expected to STOP.

| ID | Title | Size | Model |
|----|-------|------|-------|
| [`vna-01`](./Tasks/task-vna-01-in-room-consent-surface.md) | In-room consent surface + policy basis (**the gate**) | L | **Opus** — blocked on counsel |
| [`vna-02`](./Tasks/task-vna-02-walkin-session-identity.md) | Session identity for a walk-in visit (migration) | L | **Opus** — blocked on VNA-Q1 |
| [`vna-03`](./Tasks/task-vna-03-in-room-audio-capture.md) | In-room audio capture + upload + retention registration | L | **Opus** |
| [`vna-04`](./Tasks/task-vna-04-non-twilio-transcription.md) | Transcription for a non-Twilio audio source | L | **Opus** |
| [`vna-05`](./Tasks/task-vna-05-reuse-phase-2-spine.md) | Reuse the Phase-2 spine (no new AI) | M | **Opus** |
| [`vna-06`](./Tasks/task-vna-06-phase-3-gate.md) | Erasure, consent-absence tests + Phase 3 gate | M | **Opus** |

**Opus cap deliberately exceeded.** [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) §8 caps Opus at two per batch. Every task here touches consent, stored PHI, a migration, or a new audio intake path. This is not an under-tightened spec; it is a phase that should arguably be its own program (unblock condition 4). If cost binds, `vna-05` and `vna-06` are the downgrade candidates and that is an **owner** decision.

---

## Acceptance gate

- [ ] Unblock conditions 1–4 answered in writing in this file, with dates. **No engineering box below may be ticked before this one.**
- [ ] A walk-in visit cannot be recorded without a consent record that references a **non-DRAFT** policy version — asserted by test, at the route, not only in the UI.
- [ ] Default state is disarmed. The mic cannot arm from a settings toggle, a saved preference, or page load (VNA-D2) — asserted by test.
- [ ] While capture is live, a non-dismissible indicator is visible. Hiding it stops capture.
- [ ] A capture is bound to one appointment id; navigation away, visit end, and the duration cap each hard-stop it (VNA-D3) — three separate tests. **A test proves audio captured under appointment A can never be attached to appointment B.**
- [ ] Every captured object appears in `recording_artifact_index` and is reachable by the existing archival + erasure workers (VNA-D4). No new retention table, no new deletion worker — grepped.
- [ ] A patient erasure request removes room audio and its transcript by the **existing** DPDP path.
- [ ] `use-speech-recognition.ts` is unreachable from any capture path (VNA-D7) — asserted by test, and by grep of the capture module's import graph.
- [ ] The transcript enters `vnt-02`'s extract route unchanged. **Zero new AI routes, prompts, or services** — grepped (VNA-D5).
- [ ] The amendment surface, the verbatim quote, per-item accept, and provenance behave exactly as Phase 2 shipped them, with no new auto-apply path (VNT-D4 / VNT-D5).
- [ ] A declined or absent consent leaves **no** audio object, no transcript row, and no partial upload — asserted by test.
- [ ] Phase-1 and Phase-2 suites pass untouched. Type-check + lint clean. New backend + frontend suites green.
- [ ] Telemetry stays counts-only (VN-DL-11); VNA-Q2 answered as executed.

---

## Risk register (phase)

| Risk | Severity | Mitigation |
|------|---|------------|
| A patient is recorded who never agreed to it | **H** | VNA-D1 (counsel gates the phase) + VNA-D2 (consent precedes arming; disarmed by default). The gate is on merging capture, not on shipping it. |
| Audio from one patient lands on another patient's chart | **H** | VNA-D3 — bound to one appointment id, hard-stop on navigate / end / cap, and a test that the cross-attachment is impossible rather than merely unlikely. |
| Room audio becomes PHI outside the retention + erasure machinery | **H** | VNA-D4 — `recording_artifact_index` registration is part of the capture task's gate, not a follow-up. A parallel retention world is a STOP. |
| A third party in the room is recorded with no basis | **H** | VNA-D8 + unblock condition 1 question 3. Not deferrable to "the copy team". |
| *"The box already exists"* used to justify shipping the mic | **H** | VN-DL-9 + this plan's Drafted status. The Phase-2 override is explicitly not a precedent (VNA-D1). |
| Chrome `SpeechRecognition` used because it is five lines | **H** | VNA-D7 — patient-present audio never touches a browser STT API. Import-graph assertion, not a code comment. |
| The `ENUM` ALTER is irreversible and silently widens every modality branch | **M** | VNA-Q1 — pre-ALTER grep of every modality `switch` is a hard step in `vna-02`, before the SQL. |
| `composition_sid NOT NULL` + `UNIQUE (session, provider)` force a placeholder or a fork | **M** | VNA-Q3 — answered in `vna-04` from the shipped schema, before writing the insert path. |
| Consent theatre — a checkbox nobody reads, which is worse than nothing | **M** | Copy is counsel's (REC-D2). Engineering ships the mechanism and the record, never the wording. |
| The **retired** patient-consent `v1.0` string is reused because the columns are still there | **H** | VNA-Q5 — `recording-attestation.ts` forbids it by name. `vna-01`'s gate asserts the active version is neither `v1.0` nor a `DRAFT-*` string. An old version snapshot means a patient consented to wording that no longer describes what happens. |
| Doctor forgets to disarm; a 90-minute file lands | **M** | Duration cap + auto-stop (VNA-D3). Cap is a constant, not a setting. |
| Genuinely new per-minute audio spend | **M** | The product plan already flags Phase 3 as where new audio spend appears (Phases 1–2 rode sunk transcription). Duration cap + mini tier + the `cost_usd_cents` precedent on `consultation_transcripts`. |
| Phase reuses Phase 2's spine but drifts its trust model | **M** | VNA-D5 + VNT-D4 / VNT-D5 — no auto-apply, no bulk accept, one writer. Phase-2 suites are the lock. |
| Scope creep into a live scribe | **M** | VNA-D6 — post-hoc only. A real-time surface is a different product plan. |

---

## Residuals inherited from Phase 2 (still open — this phase does not fix them)

- Migration **224 unapplied** on dev; `vnt-01` §4.1–4.4 are operator residuals.
- Attestation STOP still blocks Phase 2's **production** ship (`tracks.md` L9). This phase's unblock condition 2 is the same string.
- `hasTranscript` on `recording_artifact_index` is permanently false — `registerFinalisedComposition` rejects `artifact_kind='transcript'` (rec-28). Phase 2 routed around it via `consultation_transcripts.status`; this phase inherits that workaround, it does not repair it.
- Transcript prune/erasure is **inert** — no production path deletes a `consultation_transcripts` row. VNA-D4's erasure gate is where that becomes a real problem rather than a documented one, because room audio has no teleconsult mandate to justify indefinite retention.
- No live voice-consult smoke of the Phase-2 amendment surface. A walk-in smoke cannot substitute for it.

---

**Created:** 2026-08-31.
**Last Updated:** 2026-08-31 (drafted; not promoted; implementation request refused — VNA-D1)
