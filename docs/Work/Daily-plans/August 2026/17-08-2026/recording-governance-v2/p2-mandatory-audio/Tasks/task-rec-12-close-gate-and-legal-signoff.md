# Task rec-12: Close gate + REC-D2 legal sign-off

## 17 Aug 2026 — Batch [p2-mandatory-audio](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) — Wave 5 — **S, ~2h**

---

## Task overview

Close the phase: run the verification gate across both workspaces, measure charter success metric #2 (honesty), sync the April plan whose Decision 4 this phase reverses, and — the part no agent can do — **carry the REC-D2 sign-off to completion.**

This task **verifies; it does not build.** If the gate catches something, it goes back to the task that owns it. Fixing it here hides which wave regressed.

REC-D2 is why this task can be started but not finished by an agent. Three inputs are owner-supplied: counsel's written sign-off on the DPDP necessity basis, the final disclosure wording for both surfaces, and the attestation policy version string. Until all three exist, **the branch may sit on `main` but must not be promoted to production.** This task owns that gate and does not close without it.

**Estimated time:** ~2h agent time, plus owner/counsel turnaround that is not agent time.
**Status:** ⏳ **PENDING**
**Hard deps:** [`rec-07`](./task-rec-07-migration-doctor-recording-attestation.md) through [`rec-11`](./task-rec-11-doctor-attestation-service-and-gate.md) all merged.
**Source:** REC-D2; charter §Success metrics #2; batch plan §Acceptance gate (phase); §Reversals.

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — documentation and gate checkboxes only. **No source file is touched.**

**Current State:**
- ✅ **What exists:** the batch plan's phase acceptance gate and its three REC-D2 gate items; the program README's phase table and **Runs** section; the April Plan 02 doc (284 lines) still describing the consent regime as current.
- ❌ **What's missing:** counsel sign-off; owner-approved copy for both surfaces; the owner-approved policy version string; any measurement of metric #2; any reversal marker on Plan 02.
- ⚠️ **Notes:** `frontend/package.json` has **no `type-check` script** (only `lint`, `test`, `build`) — run `tsc --noEmit` directly. The full tree carries pre-existing errors unrelated to this program, so the bar is **no new frontend error attributable to this phase**, not a clean full-tree run. rec-06 and crc-18 both recorded the same.

---

## Model & execution guidance

**Recommended model:** Composer for the mechanical verification, the `rg` sweeps and the doc sync. **Founder** for the sign-off, the copy approval, the version string, and the smoke tests.

The founder half is not delegable. Counsel sign-off is a legal artifact, the disclosure wording is an owner decision, and metric #2 needs a human comparing what a patient was told against what was captured.

**New chat?** **Yes.** Pre-load:

- This task file.
- [`../plan-p2-recording-governance-v2-mandatory-audio-batch.md`](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) — the **🚧 REC-D2 blocker section** and **§Acceptance gate (phase)** in full. The gate is the checklist this task aggregates.
- [`../../plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md) — **REC-D2**, **§Success metrics #2**, **§Reversals** (the Plan 02 Decision 4 row), §Attestation.
- All five sibling tasks' **Done when** lines and their **Notes** sections — rec-07's derived migration number, rec-09's strip-line and fold-forward decisions, rec-10's post-call fall-through finding, rec-11's version string and gate-frequency decisions. Those were written during execution and belong in the closing record.
- [`../../README.md`](../../README.md) — the phase table row and the **Runs** section.
- [`DEFINITION_OF_DONE.md`](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md) — the verification gate this task runs.
- [`plan-02-recording-governance-foundation.md`](../../../../../April%202026/19-04-2026/Plans/plan-02-recording-governance-foundation.md) — **the whole file (284 lines)**, so the reversal marker lands in the right places rather than only at the top.
- `backend/package.json` (`type-check`, `lint`, `test`) and `frontend/package.json` (no `type-check` — see Notes).

**Estimated turns:** 2–3.

---

## ✅ Task breakdown (hierarchical)

### 1. Verification gate ([`DEFINITION_OF_DONE.md`](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md))

- [ ] 1.1 Backend typecheck, lint and tests green
- [ ] 1.2 Frontend lint and tests green; `tsc --noEmit` shows **no new** error attributable to this phase
- [ ] 1.3 **Exactly one** new file in `backend/migrations/` across the whole phase (REC2-D1). `git diff --stat backend/migrations/` shows one addition and **no modification** to any existing migration
- [ ] 1.4 No RLS policy added or changed anywhere in the phase diff; no `auth.uid()` or `auth.jwt()` expression in the new migration (REC2-D4)
- [ ] 1.5 **No column dropped anywhere** (REC-D3 / REC2-D5). Confirm in the live schema that `appointments.recording_consent_decision`, `_at`, `_version` and `consultation_sessions.recording_consent_at_book` all still exist
- [ ] 1.6 No new environment variable; anything added is in `.env.example`
- [ ] 1.7 No test was skipped to make the suite pass. Every test that asserted consent behaviour is updated or deleted

### 2. Removal sweep (the phase's `rg` gates)

- [ ] 2.1 `rg "RecordingConsentCheckbox|RecordingConsentRePitchModal" frontend/` → zero; both files absent from disk
- [ ] 2.2 `rg "recording_consent" backend/src/` → matches only in migration-adjacent comments. No live read, write, route, schema, stage or state field
- [ ] 2.3 `rg "recording-consent" backend/src/ frontend/` → zero route/endpoint matches; both endpoints gone from their route files
- [ ] 2.4 `rg "not being recorded|not-recorded|declined recording" frontend/ backend/src/` → zero **live** matches. The artifact-driven `not-recorded` status rec-10 kept is legitimate; confirm what remains is that and only that, and say so explicitly rather than letting a bare grep result stand in for the judgement
- [ ] 2.5 `rg "getConsentForSession|captureBookingConsent|rePitchOnDecline" backend/` → zero; `recording-consent-service.ts` and `constants/recording-consent.ts` absent from disk
- [ ] 2.6 `rg "SessionStartBanner" frontend/` → zero, including doc-comments

### 3. Compliance sweep

- [ ] 3.1 Review every log line added or changed in the phase for PHI. Doctor ids, session ids, conversation ids, branch codes, policy versions and correlation ids are acceptable. Patient names, phone numbers and dates of birth are not
- [ ] 3.2 **Confirm no consent decision is logged beside any identifier anywhere.** The retired `recording_consent_captured` line paired a decision with an appointment id; verify nothing equivalent survived or was reintroduced
- [ ] 3.3 No `process.env` read outside `config/env.ts`; no try/catch added in a controller; all new external input Zod-validated; every thrown error a typed `AppError`

### 4. Behavioural gate (founder, one pass each)

- [ ] 4.1 A fresh web booking shows recording **disclosure** — no checkbox, no modal, no way to decline
- [ ] 4.2 A fresh Instagram DM booking never asks about recording; the confirmation carries the disclosure
- [ ] 4.3 A conversation persisted at `step: 'recording_consent'` **before** deploy receives the booking link on its next turn — not a dead end, not a funnel restart (REC2-D6). Verify against a real pre-deploy row if one exists; if none does, say so and rely on rec-09's fixture test
- [ ] 4.4 Transcription enqueues and a **patient** stores a snapshot for a session whose appointment has `recording_consent_decision = false` **and** for one at `null`
- [ ] 4.5 No surface tells a doctor or patient a consult "is not being recorded" on consent grounds
- [ ] 4.6 A doctor with no attestation row for the active version cannot start a first consult; the block links to the attestation surface; accepting unblocks it
- [ ] 4.7 The six attestation clauses render **verbatim** from the charter §Attestation
- [ ] 4.8 Video consent still works exactly as before — the escalation request, the patient modal, the grant (REC2-D9). **Only audio consent was retired**

### 5. Charter metric #2 — honesty

The charter's metric: *zero consults where the recording state shown to the patient differs from what is actually captured.*

- [ ] 5.1 State the **baseline**: before this phase, every consult where the patient declined was a mismatch — the patient was told recording was off, Twilio captured audio anyway. Quantify it from `appointments.recording_consent_decision = false` (the columns are retained read-only precisely so this number is still computable). Without the before, the after means nothing
- [ ] 5.2 Measure the **after**: for consults booked post-deploy, the displayed state is "audio is recorded" and audio is recorded, so the expected mismatch count is zero. **Verify rather than assert** — walk at least one real post-deploy consult end to end and confirm what the patient saw matches what exists
- [ ] 5.3 Confirm the historical mismatches are **not retro-corrected.** Those consults really were captured against a stated opt-out; REC-D3 retains the true consent state deliberately. Rewriting them would be a second dishonesty
- [ ] 5.4 Any residual mismatch class is **named and counted**, not rounded to zero. An unexplained gap is a finding
- [ ] 5.5 Write the numbers into the program README's **Runs** section. The README states the program is not Closed until metrics 1 and 2 are measured on production data and written there; **this task delivers metric 2**

### 6. REC-D2 sign-off (founder — the production gate)

- [ ] 6.1 **Counsel has signed off, in writing, on the DPDP necessity basis for REC-D1** (necessity for medical record-keeping under the Telemedicine Practice Guidelines 2020, read against DPDP §6). Record where the sign-off lives. **No agent may author, assert or paraphrase this basis**
- [ ] 6.2 **The owner has supplied final disclosure wording for both surfaces** — the web `/book` page and the Instagram DM booking confirmation
- [ ] 6.3 **The owner has supplied the attestation policy version string.** rec-11 must not have invented one
- [ ] 6.4 Every draft marker planted by rec-08, rec-09 and rec-11 is replaced with approved copy, and **no draft marker remains** anywhere in the shipped constants
- [ ] 6.5 Tick the three gate items in the batch plan's blocker section
- [ ] 6.6 Only now: promote to production. **If any of 6.1–6.4 is outstanding, this task stays open and the phase is not closed.** Code on `main` behind unapproved copy is the expected intermediate state, not a failure

### 7. Doc-drift sync

- [ ] 7.1 Update [`plan-02-recording-governance-foundation.md`](../../../../../April%202026/19-04-2026/Plans/plan-02-recording-governance-foundation.md) to point at this reversal. **Add a superseded marker; do not rewrite the history.** That plan is an accurate record of what was decided in April and why, and it is the evidence trail for the consent values still on disk
  - [ ] 7.1.1 A prominent header note naming this phase, REC-D1 and the charter's §Reversals
  - [ ] 7.1.2 Mark the specific claims now false: the consent checkbox (§Frontend, the `RecordingConsentCheckbox` / `RecordingConsentRePitchModal` / `SessionStartBanner` entries), the "Plans 04/05 consult the consent decision" statements, `captureBookingConsent` / `getConsentForSession` in the service sketch, and the Task 27 row
  - [ ] 7.1.3 State plainly that the **columns are retained read-only** (REC-D3) so a reader does not conclude the data was dropped
  - [ ] 7.1.4 State the reason for the reversal in one line: the opt-out was never honoured in code, because recording rules are applied at room create without consulting consent
- [ ] 7.2 Check whether Plans 04, 05 and the multi-modality master plan carry the same claim. **If they do, note it here and capture it; do not expand this task into a five-document rewrite** — Plan 02 is the one the batch plan scoped
- [ ] 7.3 Fully check the batch plan's phase acceptance gate, with a one-line reason beside anything unchecked
- [ ] 7.4 Mark p2 in the program README's phase table with its shipped status and date, and clear the "blocked on REC-D2" annotation only once §6 is complete
- [ ] 7.5 Fold each sibling's execution-time findings into the closing record: rec-07's derived migration number, rec-09's strip-line and fold-forward decisions, rec-10's post-call fall-through finding, rec-11's gate-frequency and read-failure postures
- [ ] 7.6 Record any contradiction between the charter and what execution found, **plainly and without reconciling it**
- [ ] 7.7 Capture anything found-but-not-fixed to [`inbox.md`](../../../../../../capture/inbox.md)

---

## 📁 Files to create/update

```
docs/…/p2-mandatory-audio/plan-p2-…-batch.md                    UPDATE (gate checkboxes, 3 REC-D2 items)
docs/…/recording-governance-v2/README.md                        UPDATE (phase table + Runs)
docs/…/April 2026/19-04-2026/Plans/plan-02-…-foundation.md       UPDATE (superseded markers only)
docs/…/p2-mandatory-audio/Tasks/task-rec-12-…md                  UPDATE (this file — findings + numbers)
docs/Work/capture/inbox.md                                      UPDATE (if anything is captured)
```

**No source file is touched by this task.**

---

## 🧠 Design constraints (NO IMPLEMENTATION)

- **Verify, do not repair.** A close gate that also fixes is a close gate nobody trusts, and it hides which wave regressed.
- **REC-D2 is not an agent's to resolve.** Do not author the DPDP basis, do not finalise the disclosure wording, do not invent the policy version string. Recording that these are outstanding is the correct agent behaviour; the failure mode this gate exists to prevent is a draft quietly becoming the shipped wording.
- **Do not rewrite April's history.** Mark Plan 02 superseded and say why. It remains the evidence trail for the retained columns.
- **Do not re-litigate REC-D1…REC-D25 or REC2-D1…REC2-D9.** If evidence contradicts one, record the contradiction and surface it — amending the decision lock is an owner action.
- **Metric #2 needs a before and an after.** A bare "zero mismatches" with no baseline is not a measurement.
- **Do not retro-correct historical consent values.** They are true records of what was decided and what happened (REC-D3).
- **This closes p2 only**, not the program. Metric #1 is p1's; #3 and #4 belong to p3 and p4.

---

## 🌍 Global safety gate (MANDATORY)

- [ ] **Data touched?** **No writes.** Read-only queries for metric #2 and the column-existence check.
  - RLS: unchanged, and §1.4 verifies it for the whole phase.
- [ ] **Any PHI in logs?** Must be **No** — §3 is the phase-wide sweep. Metric outputs are counts and percentages only; **never export a per-patient consent list** to compute metric #2.
- [ ] **External API or AI call?** Only the normal consult path during the founder smoke tests. No AI calls.
- [ ] **Retention / deletion impact?** **None added.** This task verifies no column was dropped and no retention behaviour changed.

---

## ✅ Acceptance criteria

### 1. Gate green

- [ ] Both workspaces green on typecheck (frontend via `tsc --noEmit`, judged as no-new-errors), lint and tests. No skipped tests.
- [ ] Exactly one new migration; no existing migration modified; no RLS change; no `auth.uid()` expression.
- [ ] All four retained consent columns still exist in the live schema.
- [ ] Every `rg` sweep in §2 returns its expected result, with the surviving artifact-driven `not-recorded` explicitly accounted for.
- [ ] PHI sweep clean; no consent decision logged beside any identifier.

### 2. Behaviour confirmed

- [ ] Every item in §4 is confirmed by hand, including the pre-deploy fold-forward and the video-consent-survives check.

### 3. Metric #2 recorded

- [ ] The pre-phase mismatch count is quantified and stated **alongside** the post-phase figure.
- [ ] The post-phase figure is verified against at least one real consult, not asserted.
- [ ] Any residual mismatch class is named and counted.
- [ ] The numbers are in the program README's **Runs** section.

### 4. REC-D2 closed — or the phase is not closed

- [ ] Counsel sign-off recorded in writing, with its location noted.
- [ ] Owner-approved disclosure copy live on both surfaces; **no draft marker anywhere**.
- [ ] Owner-approved policy version string in place, demonstrably not agent-authored.
- [ ] All three batch-plan gate items ticked.
- [ ] Production promotion happened **only after** the above. If outstanding, this task remains open and says so.

### 5. Docs synced

- [ ] Plan 02 carries superseded markers on each false claim, with the read-only column retention stated and the one-line reason recorded — and its history intact.
- [ ] Other plans repeating the claim are noted and captured, not rewritten here.
- [ ] The batch plan's phase gate is fully checked; the README phase table is updated.
- [ ] Sibling execution-time findings are folded into the closing record.
- [ ] Any charter contradiction is recorded plainly, not reconciled.

### Out of scope

- **Fixing anything the gate catches.** Route it back to the owning task.
- Writing the DPDP basis, the disclosure copy or the policy version string.
- Metrics #1 (p1), #3 and #4 (p3, p4).
- Marking the **program** Closed — p3, p4 and p5 are outstanding.
- Rewriting Plans 04, 05 or the multi-modality master plan.
- Dropping any retained column, now or as a follow-up.
- Any source change, any migration, any flag or environment change.
- Starting p3, p4 or p5.

---

## Scope Guard

- **Expected files touched: 3–5, documentation only.**
- **DO NOT** modify any source file, any migration, any environment variable or any feature flag.
- **DO NOT** drop or alter a retained consent column, or "tidy up" the historical values.
- **DO NOT** rewrite Plan 02's history — superseded markers only.
- **DO NOT** re-open the decision lock. Record contradictions; do not resolve them.
- **DO NOT** promote to production with an unticked REC-D2 item. That is the one irreversible action in this phase.
- **Cross-layer note:** this task deliberately touches **no layer at all.** It is the only task in a phase that spans backend, frontend and the DM worker that should produce a zero-line source diff. A source edit appearing here means the gate is being used to hide a regression — **STOP and route it back**.

---

## Done when

Both workspaces are green, the phase shipped exactly one migration with no RLS change and no dropped column, and every removal sweep returns clean with the surviving artifact-driven `not-recorded` accounted for. A founder has confirmed the web and DM disclosures, the pre-deploy fold-forward, transcription and patient snapshots for `false` and `null`, the attestation gate with its six verbatim clauses, and that video consent still works. Charter metric #2 is recorded in the program README with its pre-phase baseline beside it and any residual class named. Plan 02 carries superseded markers with its history intact, and every sibling's execution-time finding is in the closing record. And REC-D2 is closed: counsel's sign-off is recorded, the owner's disclosure copy and policy version string are live, no draft marker remains, and production promotion happened only after all three — or this task is still open and says exactly which item is outstanding.

---

## 📝 Notes

- **Verification gate run:** 2026-08-23 mechanical pass — coding for rec-07…11 landed. Backend `tsc --noEmit` green. Rec-11 files lint-clean. Targeted suites green: migration 210, attestation constants/service/controller/gate, voice-transcription, snapshot-storage, post-call-summary, booking-funnel, conversation-state-io, dm-copy (disclosure + snapshots updated), check-in (notification-service mock), create-appointment-desk, frontend onboarding-steps. Full `eslint src` still has pre-existing errors outside this phase (same bar as rec-06). `webhook-worker-characterization` DM cases fail on stale mocks (`logDmLanguageDecision`) — not a consent regression; rec-09 covered by booking-funnel + dm-copy. **This task is not Closed.** Do not tick REC-D2. Do not promote.
- **Metric #2, before:** *not measured.* Needs a production count of `appointments.recording_consent_decision = false`. Columns retained read-only so this is still computable.
- **Metric #2, after:** *not measured.* No post-deploy consult walk. Charter metric #2 remains unmeasured.
- **Counsel sign-off:** **outstanding.** No agent may author or paraphrase the DPDP necessity basis.
- **Owner-approved policy version string:** **outstanding.** rec-11 seeded `DRAFT-REC-D2-UNAPPROVED`. Must not ship.
- **Owner-approved disclosure copy:** **outstanding.** rec-08 / rec-09 landed the same draft sentence on web + DM. Draft markers remain.
- **Production promotion date:** **not promoted.** REC-D2 items 6.1–6.4 are all outstanding.
- **Charter contradictions found:** none from execution. Migration number drift is documented (charter budgeted 196; live is **210**).
- **Sibling findings folded in:**
  - rec-07: migration **210** (head was `209_patients_archived_at.sql`). Charter 196 taken by p3.
  - rec-09: strip-line **kept** (`delete out.recordingConsent` + local stale keys). Fold-forward: `recording_consent` → `awaiting_slot_selection`; send booking link when `bookingLinkSentAt` is unset, else follow-up.
  - rec-10: post-call consent shortcut removed; missing artifact falls through to `getReplayAvailability` (same as prior null/true). `bannerSlot` retained on `LiveConsultPanel`.
  - rec-11: gate on **every** voice + video start; text not gated; fail-closed on read error; checklist skippable.
- **Plan 02:** header already carries a REC-D1 superseded pointer. Full claim-by-claim markers still sit with the founder half of §7.1.
- **`rg` accounting:** `getConsentForSession` / `captureBookingConsent` / `rePitchOnDecline` / `SessionStartBanner` / `getRecordingConsentForSession` are gone. `recording_consent` in `backend/src` is the fold-forward alias + the REC-D3 strip keys in `conversation-state-io.ts`. `not being recorded` / `declined recording` are zero in live copy. Surviving `not-recorded` is the artifact-driven post-call status in `post-call-summary-service.ts` and `CallPostCallSummary.tsx` ("This call was not recorded") — not consent.

---

## 🔗 Related tasks

- Aggregates: [`rec-07`](./task-rec-07-migration-doctor-recording-attestation.md), [`rec-08`](./task-rec-08-retire-web-booking-consent-ask.md), [`rec-09`](./task-rec-09-retire-dm-consent-funnel-stage.md), [`rec-10`](./task-rec-10-remove-downstream-consent-gates.md), [`rec-11`](./task-rec-11-doctor-attestation-service-and-gate.md)
- [Batch plan](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) · [Charter](../../plan-recording-governance-v2-charter.md) · [Program README](../../README.md) · [Execution order](./EXECUTION-ORDER-p2-recording-governance-v2-mandatory-audio.md)
- Reversed plan: [`plan-02-recording-governance-foundation.md`](../../../../../April%202026/19-04-2026/Plans/plan-02-recording-governance-foundation.md)
- Precedent: [`rec-06`](../../p1-artifact-registry/Tasks/task-rec-06-close-gate-p1.md) — p1's close gate

---

**Last Updated:** 2026-08-23
**Pattern:** phase close gate + owner-gated production promotion + reversal doc sync
**Reference:** `Reference/engineering/development/DEFINITION_OF_DONE.md` · `process/PHASED-PLANS-GUIDE.md` §7
