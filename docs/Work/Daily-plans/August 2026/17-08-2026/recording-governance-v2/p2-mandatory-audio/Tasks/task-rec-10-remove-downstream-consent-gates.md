# Task rec-10: Remove the downstream consent gates

## 17 Aug 2026 — Batch [p2-mandatory-audio](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) — Wave 3 — **L, ~5h**

---

## Task overview

rec-08 and rec-09 removed the ask. This task removes everything that read the answer, and the module that stored it.

Three consumers gate on `getConsentForSession`: the transcription enqueue, the patient snapshot path, and the doctor-side "patient declined recording" banner. A fourth reads `consultation_sessions.recording_consent_at_book` to render a "not recorded" pill after the call. All four are now describing a decision no patient will ever make again, so all four go — along with both HTTP endpoints, the Zod schema, and `recording-consent-service.ts` itself (REC2-D8).

**One of these is not cleanup.** `snapshot-storage-service.ts:640–647` throws `ForbiddenError` for a patient whenever `consent.decision !== true`. Once rec-08 and rec-09 stop writing consent, every new appointment carries `decision = null` — so **patient snapshot upload is broken for every new booking from the moment Wave 2 lands until this task removes the gate.** Wave 3 is not optional polish; see the ordering hazard below.

**Estimated time:** ~5h
**Status:** coding landed 2026-08-23 — not Closed (verification + rec-12 still open)
**Hard deps:** **[`rec-09`](./task-rec-09-retire-dm-consent-funnel-stage.md) merged** (it removes `dm-copy.ts`'s import of `constants/recording-consent.ts`, without which this task cannot delete that file) and **[`rec-08`](./task-rec-08-retire-web-booking-consent-ask.md) merged** (it removes the only caller of `POST /:id/recording-consent`).
**Source:** REC-D1, REC-D3, REC2-D5, REC2-D8, REC2-D9.

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — deletes a service, two endpoints and four gates; follow [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:**
  - **Gate 1 — transcription.** `services/voice-transcription-service.ts:178–200`: reads consent, returns early when `decision === false`, wrapped in a try/catch that logs and continues on error (default-on). Import at L64.
  - **Gate 2 — snapshots.** `services/snapshot-storage-service.ts:640–647`: `consent.decision !== true` → `ForbiddenError` for `caller.role === 'patient'`. The doctor branch deliberately bypasses it (comment L628–639). The error text tells the patient to "Tap the consent banner", a banner this task deletes. Import at L61.
  - **Gate 3 — doctor banner.** `getRecordingConsentForSessionHandler` (`controllers/consultation-controller.ts:1516–1548`, doc-comment from ~L1500), its route (`routes/api/v1/consultation.ts:181–184`), the frontend wrapper `getRecordingConsentForSession` (`frontend/lib/api.ts:1510–1530`) and `SessionStartBanner.tsx` (86 lines, mounted at `VideoRoom.tsx:4954`, imported L22, described L352; referenced in a `LiveConsultPanel.tsx:10` doc-comment). Import at L27.
  - **Gate 4 — post-call pill.** `services/post-call-summary-service.ts` reads `recording_consent_at_book` in the row type (L211), the select (L252) and the `not-recorded` shortcut (L504–514). A second `not-recorded` return at L550 is **artifact-driven, not consent-driven — it stays.**
  - **The write endpoint.** `postRecordingConsentHandler` (`controllers/appointment-controller.ts:235–301`, doc-comment from ~L220) with its dual doctor-or-booking-token authorization, its route (`routes/api/v1/appointments.ts:38–41`), and `captureBookingConsent` at L293.
  - **The schema.** `recordingConsentBodySchema`, `RecordingConsentBody` and `validateRecordingConsentBody` (`utils/validation.ts:495–520`).
  - **The service.** `services/recording-consent-service.ts` (309 lines) — `captureBookingConsent`, `rePitchOnDecline`, `getConsentForSession`, plus a constants re-export at L309. And `constants/recording-consent.ts` (34 lines).
  - **The at-book write.** `services/consultation-session-service.ts:667` (row type) and `:735` (`recording_consent_at_book: input.recordingConsentAtBook ?? null`), fed by `types/consultation-session.ts:72`.
- ❌ **What's missing:** nothing to build. This task is subtraction, with one copy adjustment to the post-call summary.
- ⚠️ **Notes:** `rePitchOnDecline` has **zero callers** in `backend/src/` — verified dead code, deleted with the module. `captureBookingConsent` logs `decision` and `consentVersion` next to `appointmentId` (`recording-consent-service.ts:140–148`), which is precisely the "consent decision beside an identifier" the phase forbids; deleting the module resolves an existing logging violation rather than creating work.

---

## Model & execution guidance

**Recommended model:** Sonnet.

Large but mechanical. Every call site is enumerated below and verified, the decisions are already locked (REC2-D8 settles the `getConsentForSession` question), and there is no new primitive, no state machine and no schema change. The volume is the difficulty, not the reasoning. Work gate by gate and re-run typecheck after each — the compiler is the impact map for a deletion of this shape.

**New chat?** **Yes.** Pre-load:

- This task file.
- [`../plan-p2-recording-governance-v2-mandatory-audio-batch.md`](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) — **REC2-D5 and REC2-D8**, the symbol/call-site table, and the DO-NOT-TOUCH list.
- [`../../plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md) — REC-D1, **REC-D3** (columns stay read-only), REC-D25.
- [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md) — especially "Avoid Leaving Dead Code" and "update the tests that asserted the old behaviour".
- `backend/src/services/recording-consent-service.ts` — **the whole file (309 lines)** before deleting it. Its header documents the NULL-handling semantics every gate below inherited; you need that context to remove them correctly.
- `backend/src/services/voice-transcription-service.ts` — L28–40 (header claim), L64, **L178–200**.
- `backend/src/services/snapshot-storage-service.ts` — L40–50, L61, **L620–660**. Read the doctor-branch comment; it explains why only the patient branch is gated.
- `backend/src/services/post-call-summary-service.ts` — **L60–80** (the `not-recorded` status contract), L205–215, L245–260, **L495–560**.
- `backend/src/controllers/consultation-controller.ts` — L27, **L1495–1550**.
- `backend/src/controllers/appointment-controller.ts` — L40, **L218–302**.
- `backend/src/utils/validation.ts` — **L490–525**.
- `backend/src/services/consultation-session-service.ts` — L660–670 and L725–740.
- `frontend/components/consultation/SessionStartBanner.tsx` (whole file), `frontend/components/consultation/VideoRoom.tsx` L22, L345–360, L4950–4960, `frontend/lib/api.ts` L1505–1535.
- [`DEFINITION_OF_DONE.md`](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

**Estimated turns:** 6–8.

---

## ⚠️ Ordering hazard — read before scheduling

`snapshot-storage-service.ts:642` denies a patient snapshot unless `consent.decision === true`. After Wave 2 nothing writes `true` ever again, so every new appointment sits at `null` and every patient snapshot attempt returns `ForbiddenError` — with an error string pointing at a banner that no longer exists.

- This is **pre-existing** for bookings that were never asked (reschedules, non-DM paths already sit at `null`), so it is a widening of an existing gap rather than a new bug. It becomes **universal for new bookings** the moment Wave 2 merges.
- The batch plan's phase gate frames this only as "snapshots store for a session whose appointment row has `recording_consent_decision = false`", which understates it. Both `false` **and `null`** must store after this task.
- **Consequence for scheduling:** Wave 2 and Wave 3 should land in the same release. If Wave 2 ships to production alone, patient snapshot upload is dark until Wave 3 follows. Recorded in the execution order as a release-coupling note.

---

## ✅ Task breakdown (hierarchical)

### 1. Audit (before any edit)

- [ ] 1.1 Grep `backend/src` and `frontend/` for `getConsentForSession`, `captureBookingConsent`, `rePitchOnDecline`, `RECORDING_CONSENT_VERSION`, `RECORDING_CONSENT_BODY_V1`, `recordingConsentBodySchema`, `validateRecordingConsentBody`, `postRecordingConsentHandler`, `getRecordingConsentForSessionHandler`, `getRecordingConsentForSession`, `SessionStartBanner`, `recording_consent_at_book`, `recordingConsentAtBook`
- [ ] 1.2 Confirm rec-08 and rec-09 are merged — `dm-copy.ts` must no longer import `constants/recording-consent.ts`, and `frontend/lib/api.ts` must no longer export `postRecordingConsent`. If either still does, **stop and wait**; deleting the constants module with a live importer breaks the build
- [ ] 1.3 Write the impact list and the list of affected tests into Notes

### 2. Gate 1 — transcription enqueue

- [ ] 2.1 Remove the consent read, the early return, the surrounding try/catch and the import
- [ ] 2.2 Renumber or reflow the remaining numbered step comments so the sequence stays readable
- [ ] 2.3 Update the file header, which currently documents the consent gate and cites Decision 4
- [ ] 2.4 Update the tests asserting "declined → no enqueue" to assert enqueue happens regardless

### 3. Gate 2 — patient snapshots

- [ ] 3.1 Remove the consent read, the patient-branch `ForbiddenError` and the import
- [ ] 3.2 Remove the long doctor-branch comment explaining the asymmetry — with no gate there is no asymmetry to explain. Do not leave it as history
- [ ] 3.3 Confirm the remaining authorization (caller role, session membership) is untouched. **Removing the consent gate must not remove an authZ check** — re-read the function to be certain what each guard was doing
- [ ] 3.4 Update the file header's consent references
- [ ] 3.5 Tests: a patient snapshot succeeds with `decision = null` **and** with `decision = false`

### 4. Gate 3 — the doctor banner and both endpoints

- [ ] 4.1 Delete `getRecordingConsentForSessionHandler` and its doc-comment; remove its route and its import
- [ ] 4.2 Delete `postRecordingConsentHandler` and its doc-comment; remove its route and its import. Check whether `verifyBookingToken` and any Supabase/error imports it used are still needed by the rest of the controller — remove only those that are now unused
- [ ] 4.3 Delete `recordingConsentBodySchema`, `RecordingConsentBody` and `validateRecordingConsentBody`, plus the section banner comment if it becomes empty
- [ ] 4.4 Delete `frontend/components/consultation/SessionStartBanner.tsx` from disk
- [ ] 4.5 Remove its mount, import and doc-comment reference from `VideoRoom.tsx`. If the `bannerSlot` prop it filled now has no provider, follow the prop through `LiveConsultPanel.tsx` and remove it only if it is genuinely unused — a shared slot may have other consumers
- [ ] 4.6 Update the `LiveConsultPanel.tsx:10` doc-comment so it no longer advertises a deleted component
- [ ] 4.7 Remove `getRecordingConsentForSession` and its response type from `frontend/lib/api.ts`
- [ ] 4.8 Confirm no route file still references either handler and both endpoints 404

### 5. Gate 4 — the post-call "not recorded" pill

- [ ] 5.1 Remove `recording_consent_at_book` from the row type and the select list in `post-call-summary-service.ts`
- [ ] 5.2 Remove the consent-driven `not-recorded` shortcut (L504–514). **Keep the artifact-driven `not-recorded` return at L550** — a consult with no artifact genuinely was not recorded, and that is honest
- [ ] 5.3 **Note the pre-existing oddity you will meet:** the outer condition at L504–507 also tests `!session.recording_artifact_ref`, but the inner block only returns for `=== false`, so a session with a missing artifact and null/true consent enters the branch and falls through without returning. Removing the consent half must not change behaviour for the artifact half. Record what you found in Notes
- [ ] 5.4 Update the `RecordingAvailability` doc-comment at L60–80, which describes `not-recorded` as "no consent"
- [ ] 5.5 Stop writing `recording_consent_at_book`: remove the field from the insert in `consultation-session-service.ts:735`, its row type at L667, and `recordingConsentAtBook` from `types/consultation-session.ts:72`. **The column itself stays** (REC2-D5) — this is a write-path removal only

### 6. Delete the service and constants (REC2-D8)

- [ ] 6.1 Delete `backend/src/services/recording-consent-service.ts` from disk
- [ ] 6.2 Delete `backend/src/constants/recording-consent.ts` from disk, only after confirming zero importers
- [ ] 6.3 Delete `backend/tests/unit/services/recording-consent-service.test.ts`
- [ ] 6.4 Confirm no barrel file or index re-exports either module

### 7. Verification

- [ ] 7.1 `npm run type-check` and `npm run lint` green in `backend/` and `frontend/`
- [ ] 7.2 Full test suites green in both workspaces; every test that asserted a consent gate is updated or deleted, none skipped
- [ ] 7.3 `rg "recording_consent" backend/src/` returns matches only in migration-adjacent comments — no live read, write, route, schema or field
- [ ] 7.4 `rg "not being recorded|declined recording" frontend/ backend/src/` returns zero live matches
- [ ] 7.5 Manual smoke: a voice consult produces a transcript; a patient uploads a snapshot; the post-call summary shows a recording, not a "not recorded" pill

---

## 📁 Files to create/update

```
backend/src/services/recording-consent-service.ts        DELETE (309 lines)
backend/src/constants/recording-consent.ts               DELETE (34 lines)
backend/tests/unit/services/recording-consent-service.test.ts   DELETE
frontend/components/consultation/SessionStartBanner.tsx  DELETE (86 lines)
backend/src/services/voice-transcription-service.ts      UPDATE (gate 1)
backend/src/services/snapshot-storage-service.ts         UPDATE (gate 2)
backend/src/services/post-call-summary-service.ts        UPDATE (gate 4)
backend/src/services/consultation-session-service.ts     UPDATE (stop at-book write)
backend/src/types/consultation-session.ts                UPDATE (drop input field)
backend/src/controllers/consultation-controller.ts        UPDATE (handler out)
backend/src/controllers/appointment-controller.ts         UPDATE (handler out)
backend/src/routes/api/v1/consultation.ts                UPDATE (route out)
backend/src/routes/api/v1/appointments.ts                UPDATE (route out)
backend/src/utils/validation.ts                          UPDATE (schema out)
frontend/components/consultation/VideoRoom.tsx           UPDATE (mount out)
frontend/components/consultation/LiveConsultPanel.tsx    UPDATE (doc-comment only)
frontend/lib/api.ts                                      UPDATE (wrapper out)
backend/tests/… (≈8 suites)                              UPDATE
```

**When updating existing code:** (MANDATORY)
- [ ] Audit current implementation (files, callers, config) — [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md)
- [ ] Map desired change to concrete changes
- [ ] Remove obsolete code — no commented-out gates, no orphan imports, no unreferenced error strings
- [ ] Update tests and the headers/doc-comments that describe the removed behaviour

---

## 🧠 Design constraints (NO IMPLEMENTATION)

- **`getConsentForSession` does not survive — and here is the justification the phase owes.** REC-D3 keeps the *columns*; REC2-D8 deletes the *code*. After this task the function has zero call sites, and [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md) requires removing obsolete code rather than parking it for a hypothetical reader. The historical values remain fully queryable in SQL, which is what "read-only retention" means — a retained column does not imply a retained TypeScript accessor. If p5 later wants a "booked under the old consent regime" indicator, that is a fresh read written against the requirement of the day, not a 309-line module kept alive on speculation. Keeping it would also keep a `recording_consent_captured` log line that pairs a decision with an appointment id.
- **Do not drop, alter or stop reading the columns in SQL.** `appointments.recording_consent_decision` / `_at` / `_version` (053) and `consultation_sessions.recording_consent_at_book` (049) all stay. Writes stop; storage does not change (REC-D3 / REC2-D5).
- **No migration.** REC2-D1 gives the phase exactly one, and rec-07 has it. A second is a **STOP-and-surface**.
- **Removing a gate must not remove an authorization check.** The snapshot and banner paths interleave consent with authZ. Read each guard and keep every one that answers "is this caller allowed here".
- **Honesty over silence (charter metric #2).** No surface may claim a consult "is not being recorded" on the basis of consent. The artifact-driven `not-recorded` state stays, because a missing artifact is a true statement about the record.
- **Video consent survives (REC2-D9).** `VideoConsentModal.tsx`, `VideoRecordingIndicator.tsx` and the escalation service are p4's.
- **No PHI, and no consent decision beside any identifier** ([`COMPLIANCE.md`](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)). Do not port any removed log line to a new home.
- Controllers orchestrate only; no DB access moves into a controller as a side effect of deleting a service ([`STANDARDS.md`](../../../../../../../Reference/engineering/development/STANDARDS.md)).

**DO NOT include code or pseudo-code in this task file.**

---

## 🌍 Global safety gate (MANDATORY)

- [ ] **Data touched?** **Yes** — two write paths removed (`appointments.recording_consent_*`, `consultation_sessions.recording_consent_at_book`) and four read paths removed. **No schema change.**
  - [ ] **RLS verified?** Unchanged — no table, policy or column is altered.
- [ ] **Any PHI in logs?** Must be **No.** Several removed lines logged a decision beside an appointment id; none may be reintroduced anywhere.
- [ ] **External API or AI call?** **No.** Transcription still calls its provider — this task removes only the gate in front of the enqueue.
- [ ] **Retention / deletion impact?** **No.** Existing values are preserved read-only. Removing the transcription gate means more sessions produce transcripts, which is the intended outcome of the mandate and is already inside the existing retention policy.

---

## ✅ Acceptance criteria

### 1. The gates are gone

- [ ] Transcription enqueues for a session whose appointment has `recording_consent_decision = false`, and for `null`.
- [ ] A **patient** stores a snapshot with `decision = null` and with `decision = false`. No `ForbiddenError`, and the "Tap the consent banner" string exists nowhere.
- [ ] The post-call summary never returns `not-recorded` on consent grounds; the artifact-driven `not-recorded` path still works.
- [ ] Nothing writes `recording_consent_decision`, `_at`, `_version` or `recording_consent_at_book`.

### 2. The endpoints and the banner are gone

- [ ] `GET /api/v1/consultation/:sessionId/recording-consent` and `POST /api/v1/appointments/:id/recording-consent` are absent from their route files and 404.
- [ ] `rg "recordingConsentBodySchema|validateRecordingConsentBody" backend/src/` returns zero results.
- [ ] `SessionStartBanner.tsx` is absent from disk; `rg "SessionStartBanner" frontend/` returns zero results including doc-comments.
- [ ] `rg "getRecordingConsentForSession" frontend/ backend/src/` returns zero results.

### 3. The service is gone

- [ ] `recording-consent-service.ts` and `constants/recording-consent.ts` are absent from disk.
- [ ] `rg "getConsentForSession|captureBookingConsent|rePitchOnDecline" backend/` returns zero results.
- [ ] `rg "RECORDING_CONSENT_VERSION|RECORDING_CONSENT_BODY_V1" backend/` returns zero results.
- [ ] No commented-out gate, orphan import or unreachable branch remains in any touched file.

### 4. The columns are intact

- [ ] `appointments.recording_consent_decision`, `_at`, `_version` and `consultation_sessions.recording_consent_at_book` all still exist in the schema.
- [ ] No new file in `backend/migrations/`.
- [ ] `053_appointments_recording_consent.sql` and `049_consultation_sessions.sql` are byte-identical.

### 5. Verification

- [ ] Backend and frontend typecheck, lint and test suites all green.
- [ ] Every test that asserted a consent gate is updated or deleted; none skipped.
- [ ] File headers and doc-comments no longer describe consent behaviour that no longer exists.

### Out of scope

- The web checkbox and modal — **rec-08** (merged).
- The DM stage, conversation-state namespace and DM copy — **rec-09** (merged).
- Doctor attestation — **rec-07** / **rec-11**.
- Dropping any column, or a migration of any kind.
- Video consent, the escalation state machine, `VideoConsentModal`, `VideoRecordingIndicator` — **p4** (REC2-D9).
- Pause semantics — **p3**. Artifact registry — **p1**.
- Twilio recording rules, room create, `twilio-recording-rules.ts`. The always-on audio path is already correct; this phase removes the false promise, not the recording.
- Redesigning the post-call summary or the video room layout beyond removing the banner.

---

## Scope Guard

- **Expected files touched: 17 source (4 deletions, 13 edits) + ~8 test suites.** The enumeration in *Files to create/update* is exhaustive and pre-approved by the batch plan. Anything beyond it is a **stop**, not an expansion.
- **DO NOT TOUCH:**
  - `backend/migrations/` — no new file, no edit to `053` or `049`.
  - `frontend/components/consultation/VideoConsentModal.tsx`, `VideoRecordingIndicator.tsx`; `services/recording-escalation-service.ts` (p4).
  - `services/recording-pause-service.ts`, `DEFAULT_KIND`, reason codes (p3).
  - `recording_artifact_index`, `recording-access-service.ts`, `recording-track-service.ts`, `twilio-compositions.ts`, `recording-archival-worker.ts` (p1 / p5).
  - `services/consultation-session-service.ts` beyond the two `recording_consent_at_book` lines — **do not touch line 145 or anything about `startAudioOnlyRecording`**.
  - `services/voice-session-twilio.ts`, `twilio-recording-rules.ts`.
  - The 90-day patient self-serve window and the video replay OTP gate (REC-D25).
  - The DM worker and conversation state (rec-09's, already merged — do not re-open).
- **Cross-layer blast radius:** this is the widest task in the phase — **two controllers, two route files, four services, two shared type/util modules, three frontend files and one deleted service**, spanning HTTP surface, service layer, persistence write paths and UI. Two public endpoints disappear. The breadth is why every call site is enumerated rather than discovered, per `.cursor/rules/00-agent-contract.mdc`. Deleting a service consumed by four callers means the compiler is your safety net: run typecheck after each gate rather than at the end, and treat any error in a file **not** listed above as a stop.
- **Hard stops:** any migration; any column drop; any change to Twilio recording rules or room create; any change to video consent; removing an authorization check while removing a consent check.

---

## Done when

All four consent gates are gone — transcription enqueues and patients store snapshots for `null` and `false` alike, the post-call summary reports `not-recorded` only on artifact grounds, and the doctor banner is deleted from disk. Both HTTP endpoints are removed from their route files and 404, the Zod schema is gone, and `recording-consent-service.ts` and `constants/recording-consent.ts` are deleted with zero remaining references to `getConsentForSession`, `captureBookingConsent` or `rePitchOnDecline`. Nothing writes any `recording_consent_*` column, and every one of those columns still exists in the schema with no new migration. Headers and doc-comments describing the retired behaviour are updated, every affected test is updated or deleted rather than skipped, and both workspaces are green on typecheck, lint and tests.

---

## 📝 Notes

- **Impact list from step 1.3:** Gate 1 `voice-transcription-service.ts` (consent read / early-return / try-catch / import). Gate 2 `snapshot-storage-service.ts` (patient `ForbiddenError` when `decision !== true`; remaining authZ kept). Gate 3: `getRecordingConsentForSessionHandler` + route; `postRecordingConsentHandler` + route; Zod `recordingConsentBodySchema` / `validateRecordingConsentBody`; `SessionStartBanner.tsx` deleted and unmounted from `VideoRoom.tsx`; `getRecordingConsentForSession` removed from `frontend/lib/api.ts`. Gate 4: consent-driven `not-recorded` shortcut in `post-call-summary-service.ts`; stopped writing `recording_consent_at_book` in `consultation-session-service.ts` and dropped `recordingConsentAtBook` from `CreateSessionInput` (column stays). Deleted `recording-consent-service.ts`, `constants/recording-consent.ts`, and the service unit test. Tests updated: voice-transcription, snapshot-storage (patient store for historical `false`/`null` via `mountPatientSnapshotAdmin()`), post-call-summary, check-in, create-appointment-desk, controller mocks of the deleted module.
- **Post-call summary fall-through finding from step 5.3:** The old outer `if` also tested `!recording_artifact_ref` but only returned `not-recorded` when consent was `=== false`. After removing the consent half, a missing artifact falls through to `getReplayAvailability` — the same path null/true consent already took. Artifact-driven `not-recorded` (~`artifact_not_found`) is unchanged.
- **`bannerSlot` prop disposition from step 4.5:** VideoRoom no longer mounts `SessionStartBanner`. `LiveConsultPanel` still accepts `bannerSlot` for other consumers; only the SessionStartBanner mention in its comment was removed.
- Verified at planning time: `rePitchOnDecline` had **zero** call sites in `backend/src/`. It was dead before this phase began; the batch plan's symbol table records the same.

---

## 🔗 Related tasks

- [`task-rec-08-retire-web-booking-consent-ask.md`](./task-rec-08-retire-web-booking-consent-ask.md) — hard dep; removed the endpoint's only caller
- [`task-rec-09-retire-dm-consent-funnel-stage.md`](./task-rec-09-retire-dm-consent-funnel-stage.md) — hard dep; released the constants module
- [`task-rec-12-close-gate-and-legal-signoff.md`](./task-rec-12-close-gate-and-legal-signoff.md) — verifies the phase-wide `rg` gates this task must satisfy
- [Batch plan](../plan-p2-recording-governance-v2-mandatory-audio-batch.md) · [Charter](../../plan-recording-governance-v2-charter.md) · [Execution order](./EXECUTION-ORDER-p2-recording-governance-v2-mandatory-audio.md)

---

**Last Updated:** 2026-08-23
**Pattern:** gate removal + service deletion with columns retained read-only (REC-D3 / REC2-D8)
**Reference:** `process/CODE_CHANGE_RULES.md` · `process/PHASED-PLANS-GUIDE.md` §7
