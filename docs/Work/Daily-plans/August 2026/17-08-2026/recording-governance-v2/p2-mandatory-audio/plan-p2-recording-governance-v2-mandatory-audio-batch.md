# Plan p2 — Mandatory audio + doctor attestation

## 17 Aug 2026 — Batch `recording-governance-v2` / `p2-mandatory-audio` (rec-07..12) — **L, ~3 dev-days**

> **Status:** ⏳ Planned 2026-08-17 — **BLOCKED for production on REC-D2 (counsel sign-off).** Code may land; the disclosure copy must not ship to prod until the gate below is signed.
> **Charter:** [`../plan-recording-governance-v2-charter.md`](../plan-recording-governance-v2-charter.md) (REC-D1…REC-D25 — inherited, not re-litigated)
> **Program:** [`../README.md`](../README.md) · Prefix `rec` · Numbering continues from p1 (`rec-01..06`)
> **Exec order:** [`Tasks/EXECUTION-ORDER-p2-recording-governance-v2-mandatory-audio.md`](./Tasks/EXECUTION-ORDER-p2-recording-governance-v2-mandatory-audio.md)

---

## 🚧 Phase-level blocker — REC-D2 (read before starting)

**The DPDP basis for REC-D1 must be signed off by counsel before the disclosure copy reaches production.**

REC-D1 removes a patient consent ask and replaces it with a disclosure. The legal basis is *necessity for medical record-keeping* under the Telemedicine Practice Guidelines 2020, read against DPDP §6. That basis is a legal conclusion. **No agent in this phase may author it, assert it, or write the policy version string that pins it.** Both are owner-approved inputs.

What this means mechanically:

- [ ] **Gate item (founder, tracked in rec-12):** counsel has signed off on the REC-D1 DPDP basis in writing.
- [ ] **Gate item (founder, tracked in rec-12):** the owner has supplied the final disclosure wording for both surfaces (web `/book` page, Instagram DM booking confirmation).
- [ ] **Gate item (founder, tracked in rec-12):** the owner has supplied the attestation **policy version string** (rec-11 must not invent one).

Until all three are ticked:

- rec-08, rec-09 and rec-11 ship the **plumbing** with copy sourced from a single constant per surface, and that constant holds a clearly-marked draft derived from the charter's REC-D1 / §Attestation framing.
- The branch may merge to `main`. It **must not** be promoted to production. rec-12 owns the promotion gate and will not close without the three items above.

The one thing an agent must never do here is quietly turn the draft into the shipped wording. If the copy looks final and the gate is unticked, that is the failure mode this section exists to prevent.

---

## Why this phase

The booking consent checkbox promises the patient a recording opt-out. The code does not honour it.

Twilio recording rules are applied at room create — `consultation-session-service.ts:145` (video, via `startAudioOnlyRecording`) and `voice-session-twilio.ts:183` (voice) — and **neither path calls `getConsentForSession`**. Verified: the only consumers of the consent read are the transcription enqueue gate (`voice-transcription-service.ts:180`), the snapshot patient gate (`snapshot-storage-service.ts:640`), and the doctor-side "patient declined recording" banner route (`consultation-controller.ts:1536`). Declining therefore suppresses the *transcript*, the *snapshots* and a *banner*. The audio is captured either way, and it is captured into the same Twilio composition it would have been captured into if the patient had said yes.

That is the program's largest exposure. Under DPDP §6 consent must be specific and informed for the stated purpose; we state a purpose, offer a choice, and then ignore the answer. Of the three available fixes — honour the opt-out, remove the ask, or keep lying — the charter picks the second (REC-D1): audio recording becomes a disclosed, non-optional part of the medical record, and the doctor signs a six-clause attestation (REC-D4) that makes the mandate two-sided rather than a platform imposition.

Charter success metric #2 — *zero consults where the recording state shown to the patient differs from what is actually captured* — is this phase's whole reason to exist.

---

## Decision lock (phase — inherits the charter)

| ID | Phase decision |
|----|----------------|
| REC-D1…REC-D25 | Inherited from the [charter](../plan-recording-governance-v2-charter.md). **Do not re-litigate.** |
| **REC2-D1** | **Exactly ONE migration in this phase** (rec-07, budget number **196**; head at planning time is `195_appointment_start_notify_stamp.sql`). The number is re-derived from the live folder by the task, not copied from here. A second migration is a **STOP-and-surface**. |
| **REC2-D2** | The attestation table is **append-only per (doctor_id, policy_version)**, not one mutable row per doctor. The gate reads "does a row exist for the currently-active policy version". Rationale: an attestation is a legal artifact; overwriting a doctor's v1.0 acceptance destroys the evidence that they accepted v1.0 while running consults under v1.0 — the exact property REC-D3 preserves on the patient side. |
| **REC2-D3** | **No IP address and no user-agent columns** on the attestation table. `policy_version` + `accepted_at` carry the defensibility (same contract migration 053 uses for `recording_consent_version`); the HTTP access log plus correlation id is already the forensic path. An IP column would add fresh personal data to a governance table with no erasure path. |
| **REC2-D4** | RLS on the attestation table is **enabled with no doctor-facing policy** — service-role writes and reads only, because rec-11's endpoint is the only reader. This deliberately avoids an `auth.uid()`-keyed policy, which is on the hard-rules list. If the executing agent concludes a `SELECT`-own policy is required, that is a **STOP-and-surface**, not a judgement call. |
| **REC2-D5** | **No column drops anywhere in this phase.** `appointments.recording_consent_decision` / `_at` / `_version` (migration 053) stay, read-only, per REC-D3. `consultation_sessions.recording_consent_at_book` (migration 049) also stays. Writes stop; storage does not change. |
| **REC2-D6** | In-flight DM conversations sitting at the `recording_consent` step **fold forward to `awaiting_slot_selection`** via the existing `DEPRECATED_SLOT_STEP_ALIASES` mechanism in `backend/src/types/conversation.ts`. Patients mid-funnel receive the booking link, not a dead end. Falling through to `normalizePersistedStep`'s unknown-string default (`responded`) is **not acceptable** — it drops the patient out of the funnel. |
| **REC2-D7** | The DM disclosure ships as its own **`enByPolicy` copy family** in `locale-arm-manifest.ts`, appended to the booking confirmation, replacing the two retired `recording-consent-*` families. It gets no locale arms — LANG6-D4 keeps versioned legal copy English-only. |
| **REC2-D8** | `getConsentForSession` is **deleted along with the rest of `recording-consent-service.ts`.** After rec-10 there are zero call sites. REC-D3 is a *data*-retention decision, not a *code*-retention one; the historical values stay queryable in SQL, and CODE_CHANGE_RULES requires deleting rather than parking obsolete code. If p5 later needs a "booked under the old consent regime" read, that is a fresh three-line read then. |
| **REC2-D9** | **Video consent survives untouched.** Only *audio* consent is retired. `VideoConsentModal.tsx`, `recording-escalation-service.ts` and the escalation state machine are p4's and are on the DO-NOT-TOUCH list below. |

---

## Blast radius — this phase deletes code across three layers

This is a removal phase, not an additive one. [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md) governs every task: **audit before changing, map impact, remove obsolete code, do not comment out, update the tests that asserted the old behaviour.**

Measured, not estimated. The audio-consent flow touches **31 source files** — 24 under `backend/src/` (224 matching lines) and 7 under `frontend/` (65 matching lines) — plus **14 test files**, **1 test fixture**, and **3 live reference docs**. The load-bearing call sites inside that are few and countable:

| Symbol | Live call sites |
|---|---|
| `captureBookingConsent` | 2 — `slot-selection-service.ts:715` (DM funnel), `appointment-controller.ts:293` (web route) |
| `getConsentForSession` | 3 — `voice-transcription-service.ts:180`, `snapshot-storage-service.ts:640`, `consultation-controller.ts:1536` |
| `rePitchOnDecline` | **0 — already dead code.** Nothing in `backend/src/` calls it; both re-pitch surfaces inline their own copy. |
| HTTP endpoints | 2 — `POST /api/v1/appointments/:id/recording-consent`, `GET /api/v1/consultation/:sessionId/recording-consent` |
| Frontend API wrappers | 2 — `postRecordingConsent`, `getRecordingConsentForSession` (both in `frontend/lib/api.ts`) |
| React components | 3 — `RecordingConsentCheckbox`, `RecordingConsentRePitchModal`, `SessionStartBanner` (all deleted) |
| DM stage / state touch points | 12 backend files (stage handler, 2 predicates, turn runner, handle-turn, interaction-service, 3 type modules, 2 copy modules, slot-selection) |

Per-surface ownership:

| Surface | Files | Owned by |
|---|---|---|
| Web booking ask | `frontend/app/book/page.tsx`, `frontend/components/booking/RecordingConsentCheckbox.tsx` (delete), `frontend/components/booking/RecordingConsentRePitchModal.tsx` (delete), `frontend/lib/api.ts` (`postRecordingConsent`) | rec-08 |
| DM funnel ask | `workers/dm/stages/booking-funnel.ts`, `booking-funnel-predicate.ts`, `cancel-reschedule-status-predicate.ts`, `workers/dm/handle-turn.ts`, `workers/dm/run-conversation-turn.ts`, `services/interaction-service.ts`, `types/conversation.ts`, `types/conversation-state-io.ts`, `types/dm-instrumentation.ts`, `utils/dm-copy.ts`, `utils/locale-arm-manifest.ts`, `services/slot-selection-service.ts` | rec-09 |
| Downstream gates + write path | `services/voice-transcription-service.ts`, `services/snapshot-storage-service.ts`, `services/post-call-summary-service.ts`, `controllers/consultation-controller.ts`, `controllers/appointment-controller.ts`, `routes/api/v1/consultation.ts`, `routes/api/v1/appointments.ts`, `utils/validation.ts`, `services/recording-consent-service.ts` (delete), `constants/recording-consent.ts` (delete), `services/consultation-session-service.ts` (2 lines), `types/consultation-session.ts`, plus frontend `SessionStartBanner.tsx` (delete), `VideoRoom.tsx`, `LiveConsultPanel.tsx` (comment), `lib/api.ts` | rec-10 |
| Attestation (new) | migration + service + controller + route + constants + dashboard page + hook + onboarding checklist + consult-launcher gate | rec-07, rec-11 |

**Every affected task's Scope Guard enumerates its own files.** Per `.cursor/rules/00-agent-contract.mdc` — *"If the task forces you across layers (API + DB + service) or into unrelated files, STOP and surface it before proceeding"* — the enumeration in each task file **is** that surfacing, pre-approved at planning time. Anything outside the enumeration is a stop, not an expansion.

---

## Tasks

| Task | Wave | Size | Model | Ships |
|------|------|------|-------|-------|
| [`rec-07`](./Tasks/task-rec-07-migration-doctor-recording-attestation.md) | 1 | S | **Opus** | Migration for the versioned doctor recording attestation (REC2-D1..D4) + content-sanity test |
| [`rec-08`](./Tasks/task-rec-08-retire-web-booking-consent-ask.md) | 2 | M | Sonnet | Web `/book` consent checkbox + re-pitch modal deleted; disclosure copy in their place |
| [`rec-09`](./Tasks/task-rec-09-retire-dm-consent-funnel-stage.md) | 2 | L | **Opus** | `recording_consent` DM stage, state namespace, re-pitch branch and booking hand-off retired; in-flight conversations fold forward |
| [`rec-10`](./Tasks/task-rec-10-remove-downstream-consent-gates.md) | 3 | L | Sonnet | Consent gates removed from transcription, snapshots, post-call summary, the doctor banner, both routes, the Zod schema and the service |
| [`rec-11`](./Tasks/task-rec-11-doctor-attestation-service-and-gate.md) | 4 | L | Sonnet | Attestation service + endpoint + dashboard page; first consult blocked until the six clauses are accepted |
| [`rec-12`](./Tasks/task-rec-12-close-gate-and-legal-signoff.md) | 5 | S | Composer / **Founder** | Verification gate, REC-D2 sign-off checklist, charter metric #2 measurement, doc-drift sync |

Two Opus tasks — at the cap. rec-07 is mandatory (new migration, hard-rules list). rec-09 earns the second because it removes a **persisted conversation-state namespace** that `readConversationState` hydrates for live rows; getting the fold-forward wrong strands real patients mid-booking. That is a data-correctness problem, not a wiring one.

---

## Scope guard — DO NOT TOUCH

Owned by other phases of this program:

- **Artifact registry** — `recording_artifact_index`, the composition-finalised webhook, the registry writer, the backfill. p1 owns all of it.
- **Pause semantics** — `recording-pause-service.ts`, `DEFAULT_KIND`, reason codes, auto-resume, gap markers. p3.
- **Escalation state machine and the video consent modal** — `recording-escalation-service.ts`, `deriveState`, attempt counters, cooldowns, `VideoConsentModal.tsx`, `VideoRecordingIndicator.tsx`. p4. **Video consent SURVIVES; only audio consent is retired (REC2-D9).**
- **Doctor consult timeline, multi-composition replay, deletion paths, Twilio-reaching hard delete.** p5.

Owned by nobody in this phase:

- **Do not drop any column.** Not `appointments.recording_consent_*` (053), not `consultation_sessions.recording_consent_at_book` (049). REC-D3 / REC2-D5.
- **Do not change the 90-day patient self-serve window or the video replay OTP gate.** REC-D25.
- **Do not touch Twilio recording rules, room create, or `twilio-recording-rules.ts`.** The always-on audio path already behaves correctly — this phase removes the *false promise*, not the recording.
- **Do not add a second migration.** REC2-D1.
- **Do not write an RLS policy keyed on `auth.uid()`.** REC2-D4 — stop and surface.
- **Do not touch the check-in lobby (`crc`), the patient health hub (`phh`), or Twilio room naming.**

---

## Acceptance gate (phase)

- [ ] `rg "RecordingConsentCheckbox|RecordingConsentRePitchModal" frontend/` returns zero results; both component files are gone from disk.
- [ ] `rg "recording_consent" backend/src/` returns matches **only** in migration-adjacent comments — no live read, write, route, schema, stage or state field.
- [ ] `rg "recording-consent" backend/src/ frontend/` returns zero route/endpoint matches; both HTTP endpoints are gone from their route files.
- [ ] A fresh web booking shows recording **disclosure** copy — no checkbox, no re-pitch modal, no way to decline.
- [ ] A fresh Instagram DM booking never asks about recording, and the booking confirmation carries the disclosure.
- [ ] A conversation persisted at `step: 'recording_consent'` before deploy receives the booking link on its next turn (fold-forward per REC2-D6), not a dead end and not a funnel restart.
- [ ] Transcription enqueues and snapshots store for a session whose appointment row has `recording_consent_decision = false` — the historical value no longer gates anything.
- [ ] No surface anywhere tells a doctor or patient that a consult "is not being recorded". `rg "not being recorded|not-recorded|declined recording" frontend/ backend/src/` returns zero live matches.
- [ ] Exactly **one** new file in `backend/migrations/`; `appointments.recording_consent_*` and `consultation_sessions.recording_consent_at_book` all still exist in the schema.
- [ ] A doctor with no attestation row for the active policy version cannot start a first consult; the block links to the attestation surface; accepting unblocks it.
- [ ] The six attestation clauses render **verbatim** from the charter §Attestation.
- [ ] Typecheck + lint + tests green in both workspaces. No PHI in logs; no consent decision logged next to any identifier.
- [ ] **REC-D2:** counsel sign-off recorded, owner-approved disclosure copy in place, owner-approved policy version string in place. **Production promotion is blocked until this line is ticked.**

---

## References

- [Charter](../plan-recording-governance-v2-charter.md) — REC-D1…REC-D25, §Attestation (the six clauses), §Migration budget
- [Program README](../README.md) — phase table, execute-p1-first rule
- [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md) — audit / map-impact / remove-obsolete; central to this phase
- [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) — §3 naming, §7 link depths
- [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) — wave/lane notation, model caps
- [April Plan 02 — recording governance foundation](../../../../April%202026/19-04-2026/Plans/plan-02-recording-governance-foundation.md) — the plan whose Decision 4 this phase reverses; rec-12 syncs it
- `.cursor/rules/00-agent-contract.mdc` — hard rules: migrations, RLS, cross-layer stop-and-surface

---

**Created:** 2026-08-17.
