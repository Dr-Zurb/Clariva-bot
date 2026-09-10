# Task vna-01: In-room consent surface + policy basis

> **Filename:** `task-vna-01-in-room-consent-surface.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).
> **Model: Opus (max thinking). Auto must not run this task.**
> ⛔ **BLOCKED — counsel (`Business/tracks.md` L9).** §0 is expected to STOP. **This task ships no microphone.**

---

## 📋 Task Overview

Establish whether a walk-in patient's consult may be recorded at all, and — if counsel says yes — land the durable record that says *this patient, on this visit, agreed to this exact wording*, plus the precondition that makes arming a microphone impossible without it.

The valuable output of this task may be **a refusal**. `vnt-02` §1 ran the same pre-flight for transcript AI processing, concluded STOP, and wrote it down; that written STOP is now the reason `tracks.md` L9 has a specific question for counsel instead of a vague worry. Do that again here. An agent that reaches "no basis exists" and records it precisely has completed this task correctly.

**Program / Phase:** visit-narrative · Phase 3 (ambient walk-in)
**Batch:** [`plan-p3-visit-narrative-ambient-walkin-batch.md`](../plan-p3-visit-narrative-ambient-walkin-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-visit-narrative-ambient-walkin.md`](./EXECUTION-ORDER-p3-visit-narrative-ambient-walkin.md)
**Estimated Time:** ~6 hours
**Status:** ⛔ **BLOCKED — not started** (unblock conditions 1 + 2)
**Completed:** —

**Change Type:**
- [x] **New feature** — a new consent basis for a case the mandate does not cover
- [x] **Update existing** — reviving a retired consent path (see VNA-Q5)

**Current State:** (checked against the codebase, 2026-08-31)
- ✅ **What exists:** `appointments.recording_consent_decision` / `_at` / `_version` — migration `053_appointments_recording_consent.sql` (Plan 02 Task 27, Decision 4). `NULL` = never asked, `TRUE` = opted in, `FALSE` = declined with the consult still proceeding and recording gated off. `recording_consent_version` is a **snapshot of the wording the patient saw, never overwritten on later bumps** — the migration calls this "the legal-defensibility property" in so many words.
- ❌ **What does NOT exist, despite `053`'s header naming it:** `recording-consent-service.ts`. Recording-governance-v2 removed the consent machinery deliberately — `rec-08` (web-booking consent ask), `rec-09` (DM consent funnel stage), `rec-10` (downstream consent gates). **Only the three columns and one type reference in `backend/src/types/conversation-state-io.ts` survive.** Read those three `rec-*` task files before designing: they record *why* each surface was removed, and reviving a surface without reading its removal rationale is how the same argument gets re-lost.
- ✅ **What exists:** `doctor_recording_attestation` (migration `210`, rec-07 / REC-D4) — append-only per `(doctor_id, policy_version)`, RLS enabled with **zero policies**, service-role reader only, `ON DELETE CASCADE` from `auth.users`. Migration `210`'s header is the model to copy for reasoning about a legal artifact: *"overwriting a v1 acceptance would destroy the evidence that the doctor accepted v1 while running consults under v1."* Its service / controller / route / types are `doctor-recording-attestation-*`.
- ✅ **What exists:** `RECORDING_ATTESTATION_CLAUSES` — six clauses, verbatim, one accept covers all six, not individually checkable.
- ⚠️ **What exists but does not reach here:** the attestation **gate** is asserted only at **voice and video consult start** (`consultation-controller.ts`). It is not asserted for text consults, and it never touches in-clinic check-in or wrap-up. **An in-clinic visit passes through no recording gate at all today** — so the arming predicate (§2) is new territory on that path, not an extension of an existing check.
- ❌ **What's missing — the blocker:** any basis for a microphone in a physical room. Clause 1 binds *"every voice and video consult"*; an in-person visit is neither in this platform's vocabulary (`consultation_modality` is `('text','voice','video')`). Clause 6 is about *video* consent inside a teleconsult. **No clause reaches a third party sitting in the room either** (VNA-D8).
- ❌ **What's missing:** an approved policy version to attach anything to. `RECORDING_ATTESTATION_POLICY_VERSION = 'DRAFT-REC-D2-UNAPPROVED'`, and the file comment says the draft must not ship.
- ⚠️ **Notes:** patient consent `v1.0` was **retired** when REC-D4 made recording a two-sided mandate. `recording-attestation.ts` forbids reusing that string by name. The columns survived the retirement; the basis did not.
- ⚠️ **Notes:** consent for a teleconsult was captured *at booking, by the bot*. A walk-in may have been booked at the desk two minutes ago or not at all. **Where consent is captured is a different question from where it is stored** — and per VNA-Q4 the person who takes it should be the person who arms the mic.

**Scope Guard:**
- Expected files touched: ≤ 6.
- **No microphone code. No `getUserMedia`, no `MediaRecorder`, no upload route.** That is `vna-03`, and it does not start until this task's gate is green.
- No change to `doctor_recording_attestation`, its service, or the teleconsult recording gate.
- No change to the six attestation clauses **unless counsel supplies replacement wording** — clause text is never agent-authored (REC-D2).
- No new AI. No change to Phase 1 / Phase 2 behaviour.
- Any expansion requires explicit approval.

**Reference Documentation:**
- [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md) — VN-DL-9, VN-DL-10
- Batch locks VNA-D1, VNA-D2, VNA-D8; open questions VNA-Q4, VNA-Q5
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md) · [RLS_POLICIES.md](../../../../../../../Reference/engineering/compliance/RLS_POLICIES.md)
- [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md)
- `docs/Work/Business/tracks.md` L9 — the counsel thread this task consumes

---

## ✅ Task Breakdown (Hierarchical)

### 0. Pre-flight — **expected to STOP**
- [ ] 0.1 Read the batch plan's unblock conditions. If condition 1 (counsel) or condition 2 (non-DRAFT policy version) is `⟨fill⟩` → **STOP. Write the finding into the batch plan and this file's Issues section. Do not continue to §1.**
- [ ] 0.2 If a counsel answer exists, check it answers all five numbered questions — recording basis, per-visit vs standing, third parties, what the patient must be told, and decline handling. A partial answer is a partial STOP: implement only what is answered.
- [ ] 0.3 Confirm VNA-Q5 has an owner decision (revive `appointments.recording_consent_*` vs a new table). If `⟨fill⟩` → STOP.
- [ ] 0.4 Confirm the active policy version string is owner-approved, is **not** `DRAFT-*`, and is **not** the retired patient-consent `v1.0`.
- [ ] 0.5 Re-read `053`'s header and `210`'s header before designing anything. Both already argued the hard parts (snapshot-never-overwrite; why overwriting a legal artifact destroys evidence). Inherit that reasoning; do not re-derive it.

### 1. The consent record
- [ ] 1.1 Per the VNA-Q5 decision, land the in-room consent record: which patient, which appointment, which policy version, when, captured by whom.
- [ ] 1.2 The version is a **snapshot**, never rewritten on a later bump. Preserve `053`'s property; do not weaken it.
- [ ] 1.3 Decline handling exactly as counsel answered — stored or not stored. If counsel says a decline must not be stored, the absence of a TRUE decision is the whole mechanism and nothing about the decline is written.
- [ ] 1.4 Third-party-in-room handling per the counsel answer, in mechanism **and** in the copy the patient sees (VNA-D8). Silence here records them by default.
- [ ] 1.5 If a migration is required: additive only, re-runnable, RLS enabled with the `210` posture (service-role only, no policies), reverse documented in-file, next unclaimed number (highest at draft time is `224`).

### 2. The arming precondition
- [ ] 2.1 A single server-side predicate: may this visit be captured? True only when a consent record exists **for the active policy version** with an affirmative decision.
- [ ] 2.2 Enforced **at the route**, not only in the UI (VNA-D2). A client that lies must fail.
- [ ] 2.3 Default is false — absent, stale-version, or `NULL` decisions are all "no". `053`'s header documents the intended conservative `NULL` treatment; the implementation was removed by `rec-10`, so re-derive the semantics from the header and the `rec-10` task file rather than inventing a second convention.
- [ ] 2.4 A stale version snapshot is **not** consent for new wording. Assert this — it is the failure mode that looks like success.

### 3. The capture surface (consent, not audio)
- [ ] 3.1 Where the patient is asked — check-in, or in the room per VNA-Q4. State the choice and why.
- [ ] 3.2 Wording is counsel's, verbatim, in a constants module next to `recording-attestation.ts`. Not paraphrased, not "improved", not reflowed.
- [ ] 3.3 No dark patterns: decline is as easy as accept, and no pre-checked box.

### 4. Verification & Testing
- [ ] 4.1 Arming predicate false when: no record · declined · stale version · `DRAFT-*` version · retired `v1.0`.
- [ ] 4.2 Arming predicate true only for an affirmative record at the active version.
- [ ] 4.3 Route-level enforcement test — a forged client request is rejected.
- [ ] 4.4 `rg -i "MediaRecorder|getUserMedia|SpeechRecognition"` over this task's diff returns **zero**.
- [ ] 4.5 No PII/PHI in logs — identifiers and counts only.
- [ ] 4.6 `npx tsc --noEmit` + lint clean; new tests green; existing recording-gate suites untouched and green.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
MAYBE:  backend/migrations/2NN_<in_room_consent>.sql        (only if VNA-Q5 = (b))
CREATE: backend/src/constants/<in-room consent copy>        (counsel's wording, verbatim)
CREATE: backend/src/services/<in-room consent service>      (the arming predicate — rec-10 removed the old one)
CREATE: the consent capture surface (desk check-in or cockpit)
UPDATE: docs/Reference/engineering/architecture/DB_SCHEMA.md (if a migration lands)
UPDATE: this file + the batch plan (the counsel answer, verbatim)
```

**Existing Code Status:**
- ✅ `backend/migrations/053_appointments_recording_consent.sql` — EXISTS. The columns Phase 3 probably reuses.
- ✅ `backend/migrations/210_doctor_recording_attestation.sql` — EXISTS. **Not modified** — the doctor side is settled.
- ✅ `backend/src/constants/recording-attestation.ts` — EXISTS. Clauses edited **only** with counsel wording.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **A consent record whose wording can change retroactively is not consent.** `053` and `210` both already made this argument; inherit it.
- **The gate is server-side or it is decorative.** VNA-D2.
- **Engineering ships the mechanism, never the wording** (REC-D2). If this task finds itself drafting clause text, it has gone wrong.
- **A decline must cost the patient nothing.** The consult proceeds; only capture is gated off. That is already `053`'s shipped semantics for `FALSE`.
- **Third parties are not a copy problem** (VNA-D8).
- No PHI in logs (COMPLIANCE.md).

**DO NOT include:** code, pseudo-code, function signatures, or DDL in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — consent metadata on a PHI-adjacent row.
  - [ ] **RLS verified?** `210` posture — service-role only, zero policies.
- [ ] **Any PHI in logs?** Must be **no**.
- [ ] **External API or AI call?** **No** — this task has neither.
- [ ] **Retention / deletion impact?** **Yes** — a consent record is a legal artifact with its own retention answer. Get it from counsel; do not choose one.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [ ] The counsel answer is recorded verbatim in the batch plan with a date — **or** the STOP is recorded there with equal precision.
- [ ] The active policy version is non-DRAFT, owner-approved, and not the retired `v1.0`.
- [ ] A walk-in visit cannot be armed for capture without an affirmative consent record at the active version — proven at the route.
- [ ] Stale-version, absent, and declined all evaluate to "no" — three tests.
- [ ] Decline and third-party handling match the counsel answer in mechanism and copy.
- [ ] Zero microphone code in the diff.
- [ ] Type-check + lint clean; new tests green; existing suites green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** Owner asked to start implementation 2026-08-31. §0.1 — unblock conditions 1 (counsel) and 2 (non-DRAFT policy version) are still `⟨fill⟩`. VNA-Q5 is also `⟨fill⟩`. Active version is still `DRAFT-REC-D2-UNAPPROVED`.
**Solution:** STOP. No consent record, no arming predicate, no microphone. Recorded in the batch plan per VNA-D1. The Phase-2 override is not a precedent — that gate was a new hop over text already captured; this one is capture of a person who agreed to nothing.

---

## 📝 Notes

- The most likely wrong turn: seeing `appointments.recording_consent_*` still in the schema and concluding consent is "already handled". The columns are live; the **basis, the ask, the read path, and the gates were all removed** (`rec-08`/`09`/`10`). A `TRUE` sitting in that column from a 2026-04 teleconsult booking is not permission to switch on a microphone in a room — it is a stale answer to a different question, which is exactly why 2.4's stale-version assertion exists.
- The second most likely wrong turn: treating the doctor's attestation as covering the patient. It is explicitly two-sided (REC-D4) — the doctor accepting clauses is not the patient agreeing to them.

---

## 🔗 Related Tasks

- [`task-vna-02-walkin-session-identity.md`](./task-vna-02-walkin-session-identity.md) — next; needs this gate green
- [`task-vna-03-in-room-audio-capture.md`](./task-vna-03-in-room-audio-capture.md) — the only consumer of the arming predicate
- [Phase 2 `vnt-02`](../../p2-transcript-amendment/Tasks/task-vnt-02-extraction-pass.md) — §1 is the precedent for a pre-flight that correctly returns STOP

---

**Last Updated:** 2026-08-31 (§0 STOP — implementation request refused)
**Completed:** —
**Pattern:** Versioned per-visit consent snapshot + server-side arming predicate
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
