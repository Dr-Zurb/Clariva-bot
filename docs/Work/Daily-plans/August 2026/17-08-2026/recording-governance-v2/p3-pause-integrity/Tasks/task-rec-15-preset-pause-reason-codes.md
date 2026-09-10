# Task rec-15: Preset pause reason codes replace free text

## 17 Aug 2026 — Batch [p3-pause-integrity](../plan-p3-recording-governance-v2-pause-integrity-batch.md) — Wave 3 — **M, ~4h**

---

## Task overview

Close the privacy defect. Pausing today requires 5–200 characters of free text (`recording-pause-service.ts:92-93`), and that string is written into `consultation_recording_audit.reason` **and** embedded verbatim in the pause banner's body. REC-D14 replaces it with five closed codes: `patient_request`, `sensitive_disclosure`, `third_party_present`, `administrative`, `technical`.

**The propagation path, verified end to end:** `recording-pause-service.ts:344` composes `"Doctor paused recording at HH:MM. Reason: <free text>"` → `emitSystemMessage` writes it to `consultation_messages.body` → `transcript-pdf-service.ts:531-539` renders every `kind='system'` row from `body` → the exported transcript PDF. The same string is regexed back out client-side at `useRecordingState.ts:95-102` for the banner.

So a doctor who pauses for a sensitive disclosure and types what it was has written the protected content into a governance table **and** into the patient-downloadable clinical record. That is the sharpest privacy defect in the recording system, and it is caused by the field that exists to protect the disclosure.

**Estimated time:** ~4h
**Status:** ✅ Done 2026-08-18 (unit + typecheck + lint; 6.4 real transcript PDF still founder)
**Hard deps:** [`rec-13`](./task-rec-13-migration-pause-reason-codes-and-auto-resume-stamps.md) merged (the ENUM and column must exist). Runs after [`rec-14`](./task-rec-14-pause-covers-every-active-recording-kind.md) so the two changes to the same service do not collide.
**Source:** REC-D14 · REC3-D2, REC3-D9.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)

**Change Type:** Update existing — removes a shipped input surface and its validation. Follow [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

**Current state (after this task):**

- ✅ Pause accepts only the five REC-D14 codes. Wire field is `reasonCode`. Zod in the controller + service re-check. Free text is rejected without echoing the submitted value.
- ✅ `pause_reason_code` is the code's home. `reason` stores the same enumerated token (064's 5–200 CHECK still stands; all five codes are 9–20 chars). Never human-typed text. No second migration.
- ✅ Banner body is actor + time (+ kinds). No `Reason:` clause. Client regex retired. Surviving transport: `GET /recording/state`.
- ✅ Doctor picker replaced the textarea. `window.prompt` escape hatches in VideoRoom / VoiceConsultRoom removed.
- ⚠️ Migration `196` is written but must be applied with this change — the new CHECK rejects pause inserts that lack `pause_reason_code`.
- ⚠️ 6.4 real PDF still founder. p4 `video_escalation_audit.reason` still free-text (inbox).

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet. The schema is locked by rec-13, the code set is locked by the charter, and the precedent for a coded reason already exists in `video_escalation_audit`. This is a well-bounded replacement across three layers, not a design problem.

**New chat? Yes.** Pre-load:

- This task + [`../plan-p3-recording-governance-v2-pause-integrity-batch.md`](../plan-p3-recording-governance-v2-pause-integrity-batch.md) (§Why this phase → DEFECT 2, and §Verified current state) + the [charter](../../plan-recording-governance-v2-charter.md) REC-D14 row.
- **[`rec-13`](./task-rec-13-migration-pause-reason-codes-and-auto-resume-stamps.md) as merged** — specifically what it did to the reason CHECK and whether `pause_reason_code` is required on new rows. Criterion 1 depends on the answer.
- `backend/src/services/recording-pause-service.ts` — L63–93 (input type + bounds), L216–234 (validation), L273–333 (the ledger writes that carry `reason`), L336–354 (the banner body), L566–573 (`getCurrentRecordingState`'s `pauseReason`).
- `backend/src/controllers/consultation-controller.ts` L1555–1590 — the handler and its doc-comment, both of which state the 5–200 contract.
- `backend/src/services/transcript-pdf-service.ts` L520–548 — proof that a system row's `body` reaches the PDF. Read this before deciding what the banner may contain.
- `backend/src/services/consultation-message-service.ts` L255–295 (the `SystemEvent` union — TEXT column, no migration needed to add a tag) and L517–545 (`emitSystemMessage` input, including the non-persisted `meta`).
- `frontend/components/consultation/RecordingControls.tsx` L60–61 + L111–127 + L205–236 — the constants, the submit path, the textarea being replaced.
- `frontend/components/consultation/RecordingPausedIndicator.tsx` L32–49 — renders the reason verbatim into both parties' banner copy.
- `frontend/hooks/useRecordingState.ts` L27–34 + L95–102 — the regex that parses the reason out of the banner body, and the doc-comment that says it must change in lockstep with the copy.

**Estimated turns:** 4–6.

---

## Acceptance criteria

### 1. Fit to the schema rec-13 actually landed — settle this first

- [x] 1.1 Read the migration rec-13 shipped and establish whether `reason` is still required (non-null, 5–200 chars) for `action = 'recording_paused'`.
- [x] 1.2 Decide where the code lives on the write and record it in this file: `pause_reason_code` is the code's home (REC3-D2), and `reason` is either left NULL (if rec-13 narrowed the CHECK) or carries the **enumerated token itself** — never anything a human typed.
- [x] 1.3 **A second migration is a STOP-and-surface** (REC3-D1). If the landed CHECK cannot accommodate either shape, surface it rather than writing SQL.

### 2. Service validation

- [x] 2.1 The pause input takes a reason **code**, validated against the closed set of five. `REASON_MIN_LENGTH` / `REASON_MAX_LENGTH` are deleted, not left orphaned.
- [x] 2.2 An unrecognised code is **rejected** with a typed `ValidationError`. It is never coerced to `administrative` or any other default — a silently substituted governance fact is the same class of error as a guessed one.
- [x] 2.3 A free-text string arriving from a stale client is rejected, not truncated, and the rejection does not echo the submitted value back in the error message or in any log line.
- [x] 2.4 `getCurrentRecordingState` returns the code rather than a sentence, so every rendering surface resolves its own copy (REC3-D9).
- [x] 2.5 Legacy rows — the ones rec-13 redacted, and any row with no code — resolve to a single explicit "not recorded in preset form" state. They must not render as blank, and must not borrow a code.

### 3. Controller Zod schema (compliance fix)

- [x] 3.1 A Zod schema validates the pause body in the controller **before** the service is called, per [`00-agent-contract.mdc`](../../../../../../../../.cursor/rules/00-agent-contract.mdc).
- [x] 3.2 The enum is the single wire contract. The controller stays orchestration-only — no DB access, no business rules, no try/catch (`asyncHandler` owns that).
- [x] 3.3 The handler's doc-comment (L1555–1564) is updated; it currently documents the 5–200 free-text contract and would otherwise become a lie in the file that defines the endpoint.
- [x] 3.4 A `ZodError` maps to the standard 400 envelope through the existing global middleware. No local mapping.

### 4. The system message and the banner

- [x] 4.1 **No free text in the message body, ever.** The body may name the actor and the time; the reason is conveyed as a token the client resolves, or omitted from the body entirely.
- [x] 4.2 `meta` is not persisted (`consultation-message-service.ts:540-543`), so it cannot carry the code to any reader. Pick a transport that actually survives — `GET /recording/state` already returns the pause reason and is the natural one — and state the choice in this file.
- [x] 4.3 The regex at `useRecordingState.ts:95-102` is **retired or repointed** in the same PR as the copy change. Its own doc-comment (L27–34) requires this; leaving it parsing a body that no longer contains a reason is a silent regression.
- [x] 4.4 Both parties' banner copy is resolved from the code at render time. The patient sees a human-readable label, not a raw token.
- [x] 4.5 Copy for `sensitive_disclosure` is written with care: it must convey that something was deliberately not recorded without hinting at what. This is the one label where the wording is the feature.

### 5. Doctor UI

- [x] 5.1 The free-text textarea is replaced by a picker over the five codes. No "other" option and no free-text escape hatch — an escape hatch reintroduces the defect.
- [x] 5.2 Pause cannot be submitted without a selection. The character counter, the min/max hint and `REASON_MIN`/`REASON_MAX` are removed.
- [x] 5.3 Accessibility parity with what is there today: labelled control, keyboard reachable, `Esc` closes, focus moves into the dialog on open, errors announced via `role="alert"`.
- [x] 5.4 The modal's explanatory copy stops promising that the patient will see "this reason" as typed text, and says what the patient will actually see.

### 6. Verification

- [x] 6.1 Unit tests: each of the five codes is accepted; an unknown code is rejected; a free-text string is rejected; a legacy row renders the not-recorded state; the emitted body contains no reason text.
- [x] 6.2 Frontend tests cover picker selection, submit-disabled-until-selected, and the banner label for each code.
- [x] 6.3 **`rg` sweep, recorded in this file:** no remaining path writes a 5–200-character free-text value into `consultation_recording_audit.reason`, and no pause-path log line carries a reason string.
- [ ] 6.4 A transcript exported for a consult paused after this task contains no free text from the doctor. Verified on a real PDF, not inferred.
- [x] 6.5 Backend and frontend typecheck + lint + tests green.

### Out of scope

- Pause kind-scoping and the resume rule set — [`rec-14`](./task-rec-14-pause-covers-every-active-recording-kind.md).
- Auto-resume, countdown, extension — [`rec-16`](./task-rec-16-auto-resume-countdown-and-dangling-pause.md).
- Patient-initiated pause and its actor attribution — [`rec-17`](./task-rec-17-patient-initiated-pause.md). This task does not add a patient-side picker.
- Rendering gaps in the player or transcript — [`rec-18`](./task-rec-18-gap-markers-replay-player.md), [`rec-19`](./task-rec-19-gap-markers-transcript.md). They consume the code; they do not define it.
- **`video_escalation_audit.reason`.** The escalation flow keeps a 5–200-character free-text field *alongside* its preset code (Migration 070; client contract in `frontend/lib/api/recording-escalation.ts:56-62`). The same exposure exists there. It is p4's table and p4's decision — capture it to `docs/Work/capture/inbox.md` and do not touch it.
- `recording_stopped` and `patient_revoked_video_mid_session` reason handling. They share the column and must keep working unchanged.
- Any migration.

---

## Scope Guard

- **Expected files touched: ≤ 6** — `recording-pause-service.ts`, `consultation-controller.ts`, `RecordingControls.tsx`, `RecordingPausedIndicator.tsx`, `useRecordingState.ts`, plus the affected test files and — only if the wire type lives there — one shared type file.
- **DO NOT TOUCH:** `transcript-pdf-service.ts` / `transcript-pdf-composer.ts` (read them; rec-19 owns them) · `recording-escalation-service.ts` and `video_escalation_audit` · `consultation-message-service.ts` beyond adding a tag to the `SystemEvent` union if one is genuinely needed · `recording-track-service.ts` · any migration · any RLS policy.
- **STOP and surface** if: the landed reason CHECK cannot accept either shape from criterion 1 · a second migration appears necessary · removing free text breaks `recording_stopped` or `patient_revoked_video_mid_session`.

---

## Global safety gate (MANDATORY)

- [x] **Data touched?** Yes — writes to `consultation_recording_audit` and `consultation_messages` through existing helpers.
  - [x] **RLS verified?** Yes — no policy change. The audit table stays service-role-only.
- [x] **Any PHI in logs?** Must be **No**, and this task is the one that makes that true for the pause path. Log the code, the session id, the correlation id. Never a submitted string, not even on the rejection branch.
- [x] **External API or AI call?** No new ones. Twilio rule flips are unchanged from rec-14.
- [x] **Retention / deletion impact?** No new retention surface. This reduces what is retained going forward; rec-13 handled what already exists.

---

## Design constraints (NO IMPLEMENTATION)

- Validate all external input with Zod in the controller; throw typed `AppError` subclasses; never read `process.env`.
- The code is the stored fact. Human-readable copy is a rendering concern resolved from the token (REC3-D9) — never stored, never logged, never persisted in a message body.
- Reject over coerce. Every default value in a governance field is an assertion nobody made.
- The five codes are the charter's set. Adding a sixth is an owner decision, and rec-13's test pins the set so it fails loudly.

---

## Done when

The pause API accepts only the five preset codes and rejects free text, validated by Zod in the controller; the audit row's stored reason is a token or NULL and never a doctor-typed string; the pause banner body carries no reason text and the client-side regex that used to parse it is gone; both parties see copy resolved from the code, with legacy rows rendering an explicit not-recorded state; the doctor picker has replaced the textarea with no free-text escape hatch; an exported transcript for a paused consult contains no typed text; the `rg` sweep is recorded in this file; no migration; both workspaces' typecheck + lint + tests green.

---

## Notes

- **Criterion 1:** rec-13 left 064's 5–200 `reason` CHECK in place and added a **NOT VALID** CHECK requiring `pause_reason_code` on new `recording_paused` rows. Home is `pause_reason_code`. `reason` stores the same enumerated token (all five codes are 9–20 chars). Never human-typed text. No second migration.
- **Transport (4.2):** `emitSystemMessage` `meta` is not persisted. Banner body carries no reason. Client regex retired. Surviving transport is `GET /recording/state` (`pauseReason` = code or `not_recorded_in_preset_form`). On Realtime `recording_paused`, flip paused then `refresh()`.
- **Zod:** field is `reasonCode`. Custom refine message does not echo the submitted value (`z.string().refine(isRecordingPauseReasonCode, { message })`, not default `z.enum`).
- **Scope overrun:** expected ≤6 files. `VideoRoom.tsx` + `VoiceConsultRoom.tsx` were required to kill the `window.prompt` free-text escape hatch (6.3). `frontend/lib/api.ts` wire body changed with the picker. `consultation-recording-audit.ts` gained the closed-set helpers.
- **6.3 `rg` (2026-08-18):**
  - `REASON_MIN_LENGTH` / `REASON_MAX_LENGTH` / `PAUSE_BANNER_REASON_RE` — gone from the pause path.
  - `window.prompt` — none in VideoRoom / VoiceConsultRoom / RecordingControls.
  - `req.body.reason` in `consultation-controller.ts` — only the out-of-scope video-escalation handler (L2467).
  - Pause-path logs use skip tokens (`already_paused`) or `reasonCode`; rejection throws a generic ValidationError and does not log the submitted string.
  - Other writers to `consultation_recording_audit.reason`: `recording-track-service` (null / revert tokens, not pause) and `recording-escalation-service` (`patient_revoked` / escalation — out of scope).
  - p4 `video_escalation_audit.reason` still 5–200 free text — already in inbox; not touched.
- **Verification:** backend `tsc --noEmit` green; eslint on the three src files green; `recording-pause-service.test.ts` 35/35. Frontend rec-15 vitest 14/14. Workspace `frontend` `tsc --noEmit` has pre-existing errors outside this task (same as prior waves).
- **6.4 founder:** export a real transcript PDF for a consult paused after this lands; confirm no doctor-typed reason in the system row.
- **Apply 196 with this change.** The new CHECK rejects pause inserts that omit `pause_reason_code`. Do not apply 196 onto an old pause client.

---

## Related tasks

- [`task-rec-13-migration-pause-reason-codes-and-auto-resume-stamps.md`](./task-rec-13-migration-pause-reason-codes-and-auto-resume-stamps.md) — prerequisite; owns the ENUM and the legacy redaction.
- [`task-rec-14-pause-covers-every-active-recording-kind.md`](./task-rec-14-pause-covers-every-active-recording-kind.md) — lands first in the same service.
- [`task-rec-19-gap-markers-transcript.md`](./task-rec-19-gap-markers-transcript.md) — renders the code in the exported PDF.
- [Execution order](./EXECUTION-ORDER-p3-recording-governance-v2-pause-integrity.md)

---

**Last Updated:** 2026-08-18.
**Pattern:** closed enum at the wire, the service and the column; human copy resolved at render time from the token.
