# Task rec-09: Retire the Instagram DM consent funnel

## 17 Aug 2026 — Batch [p2-mandatory-audio](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) — Wave 2 · Lane β — **L, ~5h**

---

## Task overview

The Instagram bot asks every booking patient "are you OK with this consult being recorded?", accepts one soft re-pitch on "no", and carries the answer forward into the appointment row. REC-D1 removes the ask. This task deletes the `recording_consent` funnel step, its conversation-state namespace, its two copy families and its booking hand-off, and replaces the ask with a disclosure appended to the booking confirmation.

The reason this task is Opus is not the deletion. It is the **live rows**. `readConversationState` hydrates a persisted `recordingConsent` namespace and `normalizePersistedStep` maps a persisted `step` string onto a closed union — and its fallback for an unrecognised string is `responded`, which drops a patient out of the funnel entirely. Every conversation sitting at `step: 'recording_consent'` at deploy time is a real patient mid-booking. REC2-D6 says they fold forward to `awaiting_slot_selection` and get their booking link. Getting that wrong is a data-correctness failure with a human on the other end of it.

**Estimated time:** ~5h
**Status:** 🔧 Coding landed 2026-08-23 — not Closed (REC-D2 / rec-12 owns production copy)
**Hard deps:** none. Runs in parallel with [`rec-08`](./task-rec-08-retire-web-booking-consent-ask.md) for the whole wave — disjoint files (all `backend/`, no `frontend/`).
**Source:** REC-D1, REC-D2 (copy gate), REC2-D6 (fold-forward), REC2-D7 (copy family), REC2-D9 (video consent survives).

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — removes a persisted state machine step; follow [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:**
  - **The injector — read this first.** `applyRecordingConsentDetourIfNeeded` (`workers/dm/stages/booking-funnel.ts:375–403`) intercepts *any* turn whose next state is `awaiting_slot_selection` with no recorded decision, and detours it to `recording_consent`. It has **two live call sites**: `workers/dm/handle-turn.ts:77` and `booking-funnel.ts:1208`.
  - The stage branch: `booking-funnel.ts:469–512` — ask / re-pitch / capture, plus `resolveRecordingConsentReply` (L262) and `RECORDING_CONSENT_COPY_VERSION` (L50).
  - Two predicates route the step: `booking-funnel-predicate.ts:24–27`, `cancel-reschedule-status-predicate.ts:114`. Plus `run-conversation-turn.ts:763`.
  - Step + namespace types: `types/conversation.ts` — the step doc-comment and union member (L145–154), the stage set entry (L188), `RecordingConsentState` fields (L286–288), the legacy flat-key list (L292–294), the namespace-key union (L352), `mergeRecordingConsent` (L382–387), the state field (L513).
  - Persistence: `types/conversation-state-io.ts` — the strip line (L166), the hydrate (L197–201, L256), the legacy-key deletes (L224, L233–235), the serialize (L283, L296).
  - Copy: `utils/dm-copy.ts` — `buildRecordingConsentAskMessage`, `buildRecordingConsentExplainer` (~L2108–2233) and `RECORDING_CONSENT_COPY_VERSION` (L2233); `utils/locale-arm-manifest.ts:395–406` (the two `enByPolicy` families); `types/dm-instrumentation.ts:83–86` (two branch codes).
  - The booking hand-off: `services/slot-selection-service.ts:708–730` — the fail-open `captureBookingConsent` write, plus its import at L53.
  - `services/interaction-service.ts:1` — one reference.
  - The fold-forward mechanism you will use: `DEPRECATED_SLOT_STEP_ALIASES` (`types/conversation.ts:168–171`), today mapping `confirming_slot` and `selecting_slot` → `awaiting_slot_selection`.
- ❌ **What's missing:** any disclosure in the DM channel. Patients learn about recording only through the consent ask.
- ⚠️ **Notes:** `normalizePersistedStep` (L205–212) returns `'responded'` for any unrecognised string. Deleting `recording_consent` from `CONVERSATION_STAGE_SET` **without** adding the alias silently strands every mid-funnel patient. That single line is the whole reason this task is Opus.

---

## Model & execution guidance

**Recommended model:** **Opus.**

This removes a persisted conversation-state namespace and a member of a closed step union that live database rows currently hold. The failure mode is not a type error — it is a patient who messaged the clinic yesterday, sat at `recording_consent` overnight, and gets a non-sequitur or a funnel restart today. Nothing in typecheck or lint catches that. It also spans the stage router, two predicates, the state I/O seam, the copy layer and a service, so the impact map has to be held in one head at once.

**New chat?** **Yes.** Pre-load, in this order:

- This task file.
- [`../plan-p2-recording-governance-v2-mandatory-audio-batch.md`](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) — **REC2-D6 and REC2-D7 in full**, plus the REC-D2 blocker header.
- [`../../plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md) — REC-D1, and §Attestation clauses 3 and 4 for what the disclosure should lead with.
- [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md) — audit / map-impact / remove-obsolete / update-the-tests.
- `backend/src/types/conversation.ts` — **L140–212 in full** (the step union, the stage set, `DEPRECATED_SLOT_STEP_ALIASES`, `normalizePersistedStep`), then L286–294, L352, L382–387, L513.
- `backend/src/types/conversation-state-io.ts` — **L155–303 in full.** The strip/hydrate/serialize symmetry is the thing you must not break.
- `backend/src/workers/dm/stages/booking-funnel.ts` — **L262–290** (`resolveRecordingConsentReply`), **L375–403** (the injector), **L469–512** (the stage branch), **L1208** (the second injector call).
- `backend/src/workers/dm/handle-turn.ts` — **L15 and L77** (the first injector call).
- `backend/src/workers/dm/stages/booking-funnel-predicate.ts:20–30` and `cancel-reschedule-status-predicate.ts:110–118`.
- `backend/src/services/slot-selection-service.ts` — **L700–735**, the fail-open consent write and where the booking confirmation is produced.
- `backend/src/utils/locale-arm-manifest.ts:390–410` and the two builders in `backend/src/utils/dm-copy.ts` (~L2108–2233).
- `backend/tests/fixtures/conversation-state/legacy/recording-consent.json` — the legacy fixture, and `backend/tests/unit/types/conversation-state-io.test.ts` which consumes it.
- [`REVIEW_WORKFLOW.md`](../../../../../../../../backend/locale-arms/REVIEW_WORKFLOW.md) if the copy-family change needs a manifest review pass.

**Estimated turns:** 6–8.

---

## ✅ Task breakdown (hierarchical)

### 1. Audit and impact map (CODE_CHANGE_RULES step 1 — before any edit)

- [ ] 1.1 Grep `backend/` for every symbol: `recording_consent`, `recordingConsent`, `RECORDING_CONSENT_COPY_VERSION`, `applyRecordingConsentDetourIfNeeded`, `resolveRecordingConsentReply`, `mergeRecordingConsent`, `RecordingConsentState`, `buildRecordingConsentAskMessage`, `buildRecordingConsentExplainer`, `recording_consent_flow`, `recording_consent_injected`, `recording_consent_ask`, `recording_consent_re_pitch`
- [ ] 1.2 Write the file-by-file impact list into this task's Notes before the first edit
- [ ] 1.3 Identify every test that asserts the old behaviour. They are **updated or deleted, not skipped**
- [ ] 1.4 Confirm from the code that nothing outside the DM funnel reads `state.recordingConsent` — the appointment row is the only durable destination

### 2. Fold-forward FIRST (REC2-D6) — land this before deleting the step

- [ ] 2.1 Add `recording_consent` → `awaiting_slot_selection` to `DEPRECATED_SLOT_STEP_ALIASES`, alongside the two existing RBH-06 entries. Same mechanism, same shape, no new machinery
- [ ] 2.2 Remove `recording_consent` from `CONVERSATION_STAGE_SET` and from the `PatientCollectionStep` union **only after** 2.1 is in place, so the alias is what catches the persisted value rather than the `responded` default
- [ ] 2.3 Prove the ordering with a test before moving on: a metadata blob with `step: 'recording_consent'` hydrates to `awaiting_slot_selection`, **not** `responded`
- [ ] 2.4 Decide and record: whether a fold-forward turn re-sends the booking link or relies on the existing `awaiting_slot_selection` handling. Prefer the existing handling — a patient who already has the link should not be re-prompted, and `bookingLinkSentAt` already exists to answer that question
- [ ] 2.5 Confirm a folded-forward conversation with a persisted `recordingConsent` blob does not fail hydration once the namespace type is gone
- [ ] 2.6 Update the legacy fixture and its test to encode the new expectation, keeping the fixture as the regression guard for the fold

### 3. Namespace removal and self-cleaning persistence

- [ ] 3.1 Remove `RecordingConsentState`, its three fields, the legacy flat-key list, the namespace-key union member, `mergeRecordingConsent` and the `recordingConsent` state field from `types/conversation.ts`
- [ ] 3.2 Remove the hydrate, the legacy-key deletes and the serialize entries from `conversation-state-io.ts`
- [ ] 3.3 **Decide the strip line's fate and justify it in Notes.** `stripLegacyFlatKeys` deletes `out.recordingConsent` (L166) on every write. Keeping that one line turns every subsequent write into a quiet cleaner of stale blobs; removing it leaves dead `recordingConsent` objects in `metadata` forever. **Recommendation: keep it, with a comment naming rec-09 and REC-D3**, and record the decision either way. This is a judgement call the phase expects you to make, not a stop
- [ ] 3.4 Verify strip / hydrate / serialize stay symmetric — a round-trip of a state with no consent namespace must be byte-stable

### 4. Delete the ask

- [ ] 4.1 Delete `applyRecordingConsentDetourIfNeeded` and **both** call sites (`handle-turn.ts:77`, `booking-funnel.ts:1208`). Leaving either one detours every booking turn into a step that no longer exists
- [ ] 4.2 Delete the `state.step === 'recording_consent'` branch in `booking-funnel.ts` and `resolveRecordingConsentReply`
- [ ] 4.3 Remove the step from `booking-funnel-predicate.ts`, `cancel-reschedule-status-predicate.ts` and `run-conversation-turn.ts:763`. Re-read each predicate afterwards: removing one clause from a boolean chain can change routing for a neighbouring step
- [ ] 4.4 Delete the two copy builders, the two `recording-consent-*` manifest families and the `lastPromptKind` values `recording_consent_ask` / `recording_consent_re_pitch`
- [ ] 4.5 Remove the two `dm-instrumentation.ts` branch codes. Confirm no dashboard or query depends on them; if one does, that is a finding for Notes, not a reason to keep dead branches
- [ ] 4.6 Remove the `captureBookingConsent` call and import from `slot-selection-service.ts`. **The function itself and its other caller stay** — `recording-consent-service.ts` is rec-10's to delete

### 5. The disclosure (REC2-D7)

- [ ] 5.1 Add one new `enByPolicy` copy family for the disclosure, appended to the **booking confirmation**, replacing the two retired families
- [ ] 5.2 **No locale arms.** LANG6-D4 keeps versioned legal copy English-only; register it accordingly in the manifest and do not generate arms
- [ ] 5.3 Mark the string as **owner-supplied, pending REC-D2 counsel sign-off**, in a comment naming REC-D2 and rec-12. Seed from the charter's REC-D1 framing and label it a draft
- [ ] 5.4 Copy constraints — the wording is the owner's; these are the bounds it must respect:
  - [ ] 5.4.1 States every consult is audio-recorded as part of the medical record
  - [ ] 5.4.2 Asks nothing, offers nothing to accept or decline, and never says "reply YES"
  - [ ] 5.4.3 Leads with the patient's benefit — same access the doctor has, self-serve for 90 days (clause 3), and replays are logged and notified (clause 4)
  - [ ] 5.4.4 Says nothing about video (REC2-D9)
  - [ ] 5.4.5 Promises no download — streaming only (clause 5)
- [ ] 5.5 Add the golden snapshot every public builder in `dm-copy.ts` carries

### 6. Verification

- [ ] 6.1 `npm run type-check` and `npm run lint` green in `backend/`
- [ ] 6.2 Full backend unit suite green, including the DM stage-router and state-io suites
- [ ] 6.3 A DM booking run-through never mentions recording until the confirmation, which carries the disclosure
- [ ] 6.4 A conversation persisted at `step: 'recording_consent'` continues cleanly on its next turn
- [ ] 6.5 `rg "recording_consent|recordingConsent" backend/src/workers backend/src/types backend/src/utils` returns zero results

---

## 📁 Files to create/update

```
backend/src/types/conversation.ts                              UPDATE (alias in, step + namespace out)
backend/src/types/conversation-state-io.ts                     UPDATE (hydrate/serialize out; strip line decision)
backend/src/types/dm-instrumentation.ts                        UPDATE (2 branch codes out)
backend/src/workers/dm/stages/booking-funnel.ts                UPDATE (injector + branch + resolver out)
backend/src/workers/dm/handle-turn.ts                          UPDATE (injector call out)
backend/src/workers/dm/run-conversation-turn.ts                UPDATE (step reference out)
backend/src/workers/dm/stages/booking-funnel-predicate.ts      UPDATE
backend/src/workers/dm/stages/cancel-reschedule-status-predicate.ts  UPDATE
backend/src/utils/dm-copy.ts                                   UPDATE (2 builders out, 1 disclosure in)
backend/src/utils/locale-arm-manifest.ts                       UPDATE (2 families out, 1 in)
backend/src/services/slot-selection-service.ts                 UPDATE (consent write out)
backend/src/services/interaction-service.ts                    UPDATE (1 reference)
backend/tests/… + fixtures/conversation-state/legacy/recording-consent.json   UPDATE
```

**Existing code status:** all files above EXIST. No new source file is expected; the disclosure family belongs in `dm-copy.ts` alongside its siblings.

**When updating existing code:** (MANDATORY)
- [ ] Audit current implementation (files, callers, config) — [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md)
- [ ] Map desired change to concrete changes
- [ ] Remove obsolete code — no commented-out stage branch, no orphan copy builder
- [ ] Update the tests that asserted the old behaviour

---

## 🧠 Design constraints (NO IMPLEMENTATION)

- **Fold-forward before removal.** The alias lands first, the union member goes second. Reversing that order is the one sequencing mistake that reaches patients (REC2-D6).
- **`responded` is not an acceptable landing state** for a mid-funnel row. It drops the patient out of the booking flow.
- **Use the existing alias mechanism.** No new migration, no backfill script, no one-off worker. `DEPRECATED_SLOT_STEP_ALIASES` is precedent and it fits.
- **No migration in this task.** rec-07 owns the phase's only migration (REC2-D1). Conversation state lives in a `metadata` JSON column; folding forward on read needs no DDL. If you conclude otherwise, **STOP and surface**.
- **`recording-consent-service.ts` is not yours.** Remove the *call*; leave the module. rec-10 deletes it in the next wave, and `appointment-controller.ts` still calls it until then.
- **Disclosure, not consent.** If the patient can reply to it and change an outcome, REC-D1 is not satisfied.
- **English-only legal copy (REC2-D7 / LANG6-D4).** Do not generate locale arms for the disclosure family.
- **No PHI and no consent decision in logs** ([`COMPLIANCE.md`](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)). The retired branch codes carried a decision through instrumentation; the replacement carries nothing about a decision, because there is no longer a decision.
- Follow [`STANDARDS.md`](../../../../../../../Reference/engineering/development/STANDARDS.md) and the receptionist state conventions already in `conversation.ts`.

**DO NOT include code or pseudo-code in this task file.** Line references are navigation aids, not a diff.

---

## 🌍 Global safety gate (MANDATORY)

- [ ] **Data touched?** **Yes** — `conversations.metadata` shape changes on write, and the consent write path to `appointments` is removed.
  - [ ] **RLS verified?** Unchanged. No policy, table or column is altered; the DM worker keeps its existing service-role access.
- [ ] **Any PHI in logs?** Must be **No.** Log conversation ids and branch codes only — never the patient's reply text, and never a consent decision.
- [ ] **External API or AI call?** No new one. Instagram send behaviour is unchanged apart from the copy.
- [ ] **Retention / deletion impact?** **No.** `appointments.recording_consent_*` values already written stay exactly as they are (REC-D3 / REC2-D5). This task stops adding new ones from the DM surface.

---

## ✅ Acceptance criteria

### 1. In-flight conversations survive (the headline criterion)

- [ ] A metadata blob persisted with `step: 'recording_consent'` hydrates to `awaiting_slot_selection`.
- [ ] It does **not** hydrate to `responded`, and it does not restart the funnel from `collecting_*`.
- [ ] Such a conversation's next turn moves the patient forward to slot selection with no reference to recording.
- [ ] A persisted `recordingConsent` namespace blob on that row does not break hydration.
- [ ] The fold is covered by a test using the legacy fixture, so a future refactor cannot silently undo it.

### 2. The ask is gone

- [ ] `applyRecordingConsentDetourIfNeeded` no longer exists and **neither** call site remains.
- [ ] The `recording_consent` stage branch, `resolveRecordingConsentReply` and both predicates' clauses are gone.
- [ ] `recording_consent` is absent from `PatientCollectionStep` and `CONVERSATION_STAGE_SET`, and present in `DEPRECATED_SLOT_STEP_ALIASES`.
- [ ] `RecordingConsentState`, its fields, `mergeRecordingConsent` and the namespace-key union member are gone.
- [ ] Both copy builders and both `recording-consent-*` manifest families are gone; both instrumentation branch codes are gone.
- [ ] `slot-selection-service.ts` no longer imports or calls `captureBookingConsent`.
- [ ] No commented-out stage branch, predicate clause or copy builder remains anywhere.

### 3. The disclosure is there

- [ ] The booking confirmation carries the disclosure, registered as one `enByPolicy` family with **no locale arms**.
- [ ] The string lives in one place and is marked owner-supplied, pending REC-D2, naming rec-12.
- [ ] It asks nothing, mentions no video, and promises no download.
- [ ] A golden snapshot covers it.

### 4. Nothing else moved

- [ ] `recording-consent-service.ts`, `constants/recording-consent.ts`, `validation.ts`, both routes and `appointment-controller.ts` are **untouched** (rec-10).
- [ ] No `frontend/` file is touched (rec-08 owns the parallel lane).
- [ ] No migration. No column added, dropped or altered.

### 5. Verification

- [ ] Backend typecheck, lint and the full unit suite are green.
- [ ] Every test that asserted the consent step is updated or deleted — none skipped.

### Out of scope

- `getConsentForSession`, the downstream transcription and snapshot gates, the doctor banner, both HTTP routes, the Zod schema and deleting `recording-consent-service.ts` — **rec-10**.
- The web `/book` checkbox and modal — **rec-08**, parallel lane, `frontend/` only.
- Doctor attestation — **rec-07** / **rec-11**.
- Dropping `appointments.recording_consent_*` or `consultation_sessions.recording_consent_at_book` — forbidden phase-wide (REC-D3 / REC2-D5).
- Video consent, `VideoConsentModal`, escalation — **p4**, and video consent survives (REC2-D9).
- Any other DM funnel step, the language/locale-arm policy itself, or Twilio recording behaviour.

---

## Scope Guard

- **Expected files touched: 12 source + ~4 test/fixture.** The enumeration in *Files to create/update* is exhaustive; the batch plan pre-approved it at planning time. Anything outside it is a **stop**, not an expansion.
- **DO NOT TOUCH:**
  - Any `frontend/` file. rec-08 is live in the parallel lane this wave.
  - `services/recording-consent-service.ts`, `constants/recording-consent.ts`, `utils/validation.ts`, `controllers/appointment-controller.ts`, `controllers/consultation-controller.ts`, `routes/api/v1/appointments.ts`, `routes/api/v1/consultation.ts` — all rec-10's.
  - `services/voice-transcription-service.ts`, `services/snapshot-storage-service.ts`, `services/post-call-summary-service.ts` — rec-10's.
  - Any other member of `PatientCollectionStep`, and any other conversation-state namespace (`booking`, `cancel`, `reschedule`, `serviceMatch`, `triage`, `safety`, `clarification`, `bookingForOther`).
  - `recording-pause-service.ts` (p3), `recording-escalation-service.ts` / `VideoConsentModal.tsx` (p4), `recording_artifact_index` (p1).
  - Twilio recording rules, room create, `twilio-recording-rules.ts`.
- **Cross-layer blast radius:** this task spans the **DM worker, the shared type layer, the state-persistence seam, the copy layer and one service** — five concerns in one commit, because the step cannot be removed from any one of them alone. That breadth is the reason for the enumeration above and the reason it is pre-approved rather than discovered mid-flight (`.cursor/rules/00-agent-contract.mdc`). The type layer is the shared blast surface: `conversation.ts` is imported across the whole DM worker, so a careless union edit surfaces as errors in files this task should never modify. If a type change forces an edit outside the enumeration, **STOP and surface**.
- **Hard stops:** a migration; a backfill script or one-off worker to rewrite live rows; touching `frontend/`; touching video consent; a column drop.

---

## Done when

`recording_consent` is a deprecated alias rather than a live step, and a conversation persisted at that step folds forward to `awaiting_slot_selection` and receives its booking link on the next turn — proven by a test over the legacy fixture. The injector and both its call sites, the stage branch, both predicates' clauses, the state namespace, both copy builders, both manifest families, both instrumentation codes and the `captureBookingConsent` call are all gone from disk, with nothing commented out. The booking confirmation carries a single owner-supplied disclosure family, English-only, marked pending REC-D2. `recording-consent-service.ts` and every `frontend/` file are untouched. No migration. Backend typecheck, lint and the full unit suite are green.

---

## 📝 Notes

- **Impact list from step 1.2:** `conversation.ts` (alias in; step + namespace + lastPromptKinds out); `conversation-state-io.ts` (hydrate/serialize out; strip kept); `dm-instrumentation.ts` (2 branch codes out); `booking-funnel.ts` (injector + branch + resolver out; slot branch sends link when `bookingLinkSentAt` is unset); `handle-turn.ts` (injector call out); `run-conversation-turn.ts` + both predicates + `interaction-service.ts` (step refs out); `dm-copy.ts` (2 builders out, disclosure in); `locale-arm-manifest.ts` (2 families out, 1 in); `booking-link-copy.ts` (appends disclosure — extra file vs enumeration so every confirmation path gets it); `slot-selection-service.ts` (`captureBookingConsent` call out). Tests/fixtures updated. `recording-consent-service.ts` and all `frontend/` untouched.
- **Strip-line decision from step 3.3:** **Kept** `delete out.recordingConsent` plus a local stale-key list (`recordingConsentDecision` / `Version` / `RePitched`). Every subsequent write quietly drops leftover blobs (REC-D3). Namespace is no longer hydrated or serialized.
- **Fold-forward re-prompt decision from step 2.4:** Use existing `awaiting_slot_selection` handling. If `bookingLinkSentAt` is unset (the retired injector cleared it), send the booking link; if it is set, send the follow-up. No new re-prompt kind.
- The injector at `booking-funnel.ts:375` is the load-bearing symbol in this task and is **not** named in the batch plan's symbol table — it is folded into "12 backend files". Surfaced here because removing the stage branch while leaving the injector detours every booking turn into a step that no longer exists.
- Status 2026-08-23: coding landed. Disclosure is **draft**, pending REC-D2 / rec-12. Do not promote to production.

---

## 🔗 Related tasks

- [`task-rec-08-retire-web-booking-consent-ask.md`](./task-rec-08-retire-web-booking-consent-ask.md) — parallel lane; the same reversal on the web surface
- [`task-rec-10-remove-downstream-consent-gates.md`](./task-rec-10-remove-downstream-consent-gates.md) — deletes the service whose call this task removes
- [`task-rec-12-close-gate-and-legal-signoff.md`](./task-rec-12-close-gate-and-legal-signoff.md) — owns the REC-D2 copy promotion gate
- [Batch plan](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) · [Charter](../../plan-recording-governance-v2-charter.md) · [Execution order](./EXECUTION-ORDER-p2-recording-governance-v2-mandatory-audio.md)

---

**Last Updated:** 2026-08-23
**Pattern:** deprecated-step alias fold-forward (`DEPRECATED_SLOT_STEP_ALIASES`, RBH-06) + namespace removal
**Reference:** `process/CODE_CHANGE_RULES.md` · `process/PHASED-PLANS-GUIDE.md` §7
