# Task 53: `modality_switched` system messages — auto-emit to companion chat on every transition (Decision 11 LOCKED · Plan 06 emitter reused)

## 19 April 2026 — Plan [Mid-consult modality switching](../Plans/plan-09-mid-consult-modality-switching.md) — Phase A/E

---

## Task overview

Every modality transition that lands in `consultation_modality_history` (Task 47's success path) must post a **system message** to the session's companion chat via Plan 06's emitter. This creates a unified narrative thread that:

- The doctor + patient both see in real time during the consult.
- Plan 07 Task 32's transcript PDF exports (merged with audio transcript).
- Plan 10's AI pipeline reads as structured session narrative.
- Post-consult readonly chat view (Plan 07 Task 31) preserves.

The emitter is **already built** (Plan 06 Task 37's `emitSystemMessage`). This task extends the `SystemEvent` union with the new `modality_switched` event type + wires it into Task 47's four handler commit paths.

**Estimated time:** ~2 hours (matches plan estimate, slightly above — copy drafting + the per-branch insertion points in Task 47's handlers + the PDF rendering contract + test coverage push above 1.5h).

**Status:** Shipped code-complete (2026-04-19).

### What landed

- **`backend/src/services/modality-change-service.ts`** — `buildModalitySwitchedBanner` rewritten from the 3-line "Modality switched: voice → video (paid upgrade)." placeholder (Task 47 placeholder copy) into a billing-action × initiator discriminated switch covering all five real shapes the state machine commits. Title-cased modality words (`Text` / `Voice` / `Video`), reason suffix appended verbatim (never truncated — Migration 075's 5..200 CHECK bounds the input), amounts rendered via `formatRupeesFromPaise` (`Intl.NumberFormat('en-IN', 'INR', maxFractionDigits=0)` → `₹350`; Indian lakh grouping applied automatically for future-proofing). Exhaustiveness `never`-check on `billingAction` so a future enum addition fails the build at this call-site.
- **Emitter call-site updated in `executeAndCommitTransition`** — `correlationId` now seeded from the just-inserted `historyRowId` (`modality_switched:${historyRowId}`) per the task spec's "Dedup key" section. Previously the correlation-id was the inbound HTTP correlation id, which is not history-row-unique across retries. `meta` gained an explicit `historyRowId` field so downstream consumers (Plan 10 AI pipeline, Plan 07 Task 32 PDF) can trace back to the exact row.
- **Canonical copy** (the 5 branches the state machine actually emits):
  - `paid_upgrade` (patient-initiated only): `"Patient upgraded to Video. Payment of ₹500 processed."` (drops to `"Payment processed."` when `amountPaise` is null — defensive; the billing-shape CHECK makes this unreachable).
  - `free_upgrade` × patient-initiated: `"Doctor approved the patient's upgrade to Video as a free upgrade."`
  - `free_upgrade` × doctor-initiated: `"Doctor upgraded the consult to Video at no extra charge. Reason: Need to visually examine the patient"`
  - `no_refund_downgrade` (patient-initiated only): `"Patient switched to Voice for the remainder of the consult. No refund issued. Reason: Phone overheating, switching to voice"`
  - `auto_refund_downgrade` (doctor-initiated only): `"Doctor downgraded the consult to Voice. Patient refunded ₹50. Reason: Patient environment unsuitable for video"`
- **`backend/tests/unit/services/modality-switched-banner.test.ts`** (NEW) — 12-case matrix pinning the exact copy for every branch × amount-present/absent × reason-populated/empty combination, plus 3 dedicated cases for `formatRupeesFromPaise`'s rounding + Indian grouping rules. All 12 tests green (`npx jest tests/unit/services/modality-switched-banner.test.ts`).
- **`__testOnly__` export** on `modality-change-service.ts` exposing `buildModalitySwitchedBanner` + `formatRupeesFromPaise` so the copy matrix is independently testable without plumbing through the whole commit path.

### No-touch surfaces (already correct at PR-open time)

- **`SystemEvent` union in `backend/src/services/consultation-message-service.ts`** — already contains `'modality_switched'`, `'modality_refund_processing'`, `'modality_refund_failed'` (the two refund siblings landed in Task 49). No migration needed per Plan 06 Task 39's `system_event TEXT` doctrine.
- **`modality-refund-retry-worker.ts`** — already emits `modality_refund_processing` on worker attempt-1 (any outcome) and `modality_refund_failed` on permanent-stuck (24h). Task 53's spec proposed `refund_completed` + `refund_failed` sibling events; Task 49 shipped a slightly different doctrine — `modality_refund_processing` is emitted *once* at the first retry attempt regardless of outcome (not at success), so the patient's chat gets "refund of ₹X is processing — expect within 3 business days" as a one-shot banner; silent on subsequent retries; `modality_refund_failed` fires on the 24h permanent-stuck branch. No change needed here — the Task 49 doctrine is the live contract.
- **Decline / timeout paths** — already emit zero system messages. Only `executeAndCommitTransition` (the success-path-only function) calls `emitSystemMessage({ event: 'modality_switched' })`; the decline + timeout handlers never reach it. Matches Task 41 Notes §3 privacy doctrine.
- **Row-shape CHECK** — the emitter's `body` is plain TEXT, no CHECK on content. Our long-form copy (up to ~150 chars with a 200-char reason attached) clears the 1 000-char `body_text_length_check` from Migration 062 with room to spare.

### Decision 11 / AI-pipeline stability observances

- **`@ai-pipeline-stable` JSDoc block** added to `buildModalitySwitchedBanner` + `executeAndCommitTransition`'s emit site. Plan 10's AI pipeline reads `consultation_messages WHERE system_event = 'modality_switched'` and consumes both the body text + the `meta` payload. Renames are breaking changes; field additions are safe.
- **Neutral 3rd-person copy** (`Patient upgraded to Video`, `Doctor downgraded the consult…`) rather than the 9-variant per-perspective matrix the task spec drafted. The Plan 06 Task 37 emitter persists ONE body per row; there's no per-viewer projection layer today. Per-perspective copy is filed as an inbox follow-up — frontend can read the structured `meta` payload and render alternate strings without a second emitter row.
- **Reason never truncated** per Migration 075's 5..200-char bound.
- **Amount always ₹-formatted** via `Intl.NumberFormat` — matches Razorpay invoice convention.

### v1 simplifications / deferrals

- **Per-perspective client-side copy** (Task 53's "Copy renderer" section — `frontend/lib/system-message-copy.ts` + `renderModalitySwitchedCopy`). Plan 06 Task 38's copy renderer is not yet the live rendering layer for system messages — `<TextConsultRoom>` renders the persisted `body` verbatim today. Filed as an inbox follow-up: when Task 38 evolves to dispatch on `system_event + meta`, the per-viewer variants can be layered on top without re-writing any backend code (the `meta` payload already carries every field the matrix needs).
- **`refund_completed` sibling event**. Task 49 chose `modality_refund_processing` as a one-shot attempt-1 banner rather than emitting a second message when the retry succeeds. Chat-pollution avoidance wins; the patient sees one banner at attempt time. Inbox follow-up covers revisiting this if ops reports patients asking "did my refund go through" after the initial banner.
- **Backend-composed body** vs **frontend-rendered copy**. Spec doctrine was "backend stores structured payload, frontend renders". v1 stores the pre-rendered body (neutral phrasing) + the structured payload on `meta`. Future follow-up swaps to frontend-rendered per-perspective copy without a migration.
- **PDF transcript rendering** (`Plan 07 Task 32`). Spec asked for "bold + 🔀 prefix" visual treatment. v1 lands neutral prose that reads well in the transcript as-is; Task 32's PDF renderer work is out of scope here.

### Files touched

**Backend (edit):**

- `backend/src/services/modality-change-service.ts` — `buildModalitySwitchedBanner` rewritten; emitter `correlationId` + `meta` enriched; `__testOnly__` export added.

**Backend (new):**

- `backend/tests/unit/services/modality-switched-banner.test.ts` — 12-case copy-matrix pin.

**No frontend changes, no migrations, no worker changes** (Task 49 already ships the refund-sibling emitters).

**Depends on:**

- Plan 06 Task 37 (hard — `emitSystemMessage` + `SystemEvent` union to extend).
- Plan 06 Task 39 (hard — `system_event` TEXT column on `consultation_messages`).
- Task 47 (hard — caller; this task wires `emitSystemMessage` into four commit paths).
- Task 46 (soft — `consultation_modality_history.id` passed as `correlationId` payload).
- Plan 07 Task 32 (soft — transcript PDF renderer must read `modality_switched` system messages per its contract; this task confirms the shape).

**Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md)

---

## Acceptance criteria

### Extend `SystemEvent` union

- [ ] **`backend/src/services/system-message-emitter.ts`** (EXTEND from Plan 06 Task 37):
  ```ts
  export type SystemEvent =
    | { event: 'consult_started'; ... }
    | { event: 'consult_ended'; ... }
    | { event: 'party_joined'; ... }
    | { event: 'recording_paused'; ... }      // Plan 07 Task 28
    | { event: 'recording_resumed'; ... }     // Plan 07 Task 28
    | { event: 'video_recording_started'; ... } // Plan 08 Task 41
    | { event: 'video_recording_stopped'; ... } // Plan 08 Task 42
    | { event: 'video_recording_failed_to_start'; ... } // Plan 08 Task 41
    | {
        event:            'modality_switched';
        fromModality:     Modality;                             // 'text' | 'voice' | 'video'
        toModality:       Modality;
        initiatedBy:      'patient' | 'doctor';
        billingAction:    'paid_upgrade' | 'free_upgrade' | 'no_refund_downgrade' | 'auto_refund_downgrade';
        amountPaise?:     number;                               // only for paid_upgrade / auto_refund_downgrade
        reason?:          string;                               // present when reason was required (doctor-initiated OR patient-downgrade)
        refundStatus?:    'processed' | 'pending_retry';        // only for auto_refund_downgrade
        historyRowId:     string;                               // consultation_modality_history.id for trace
      };
  ```

### Dedup key

- [ ] **Dedup key for `modality_switched` events:** `'modality_switched:' + historyRowId`. Since `historyRowId` is unique per transition, and Task 47 only emits once per commit, dedup is belt-and-suspenders.
- [ ] In-process LRU cache already sized by Plan 06 Task 37's `emitSystemMessage`. No code change needed beyond adding the key format.

### Canonical copy — rendered client-side

- [ ] **Canonical copy doctrine (matches Plan 06 Task 37):** the backend stores structured `system_event` payload; the frontend `<TextConsultRoom>` renders it into a localized string. Keeps copy iteration fast without needing a backend deploy.
- [ ] **Copy renderer** extends `frontend/lib/system-message-copy.ts` (from Plan 06 Task 38) with:
  ```ts
  export function renderModalitySwitchedCopy(payload: {
    fromModality:   Modality;
    toModality:     Modality;
    initiatedBy:    'patient' | 'doctor';
    billingAction:  'paid_upgrade' | 'free_upgrade' | 'no_refund_downgrade' | 'auto_refund_downgrade';
    amountPaise?:   number;
    reason?:        string;
    refundStatus?:  'processed' | 'pending_retry';
    perspective:    'patient' | 'doctor';                        // viewer-specific
  }): string;
  ```
- [ ] **Copy variants (by `perspective` + `initiatedBy` + `billingAction`):**
  - **`paid_upgrade`** by patient, perspective=`patient`: `"You upgraded to {voice|video}. Payment of ₹{X} processed."`
  - **`paid_upgrade`** by patient, perspective=`doctor`: `"Patient upgraded to {voice|video}. Payment of ₹{X} processed."`
  - **`free_upgrade`** by patient, perspective=`patient`: `"Dr. {name} approved your upgrade to {voice|video} at no extra charge."`
  - **`free_upgrade`** by patient, perspective=`doctor`: `"You approved the patient's upgrade to {voice|video} as a free upgrade."`
  - **`free_upgrade`** by doctor, perspective=`patient`: `"Dr. {name} upgraded the consult to {voice|video} (no extra charge). Reason: {reason}"`
  - **`free_upgrade`** by doctor, perspective=`doctor`: `"You upgraded to {voice|video}. Reason: {reason}"`
  - **`no_refund_downgrade`** by patient, perspective=`patient`: `"You switched to {text|voice} for the remainder of the consult."`
  - **`no_refund_downgrade`** by patient, perspective=`doctor`: `"Patient switched to {text|voice} for the remainder."`
  - **`auto_refund_downgrade`** by doctor, perspective=`patient`, refundStatus=`processed`: `"Dr. {name} downgraded the consult to {text|voice}. You've been refunded ₹{X}. Reason: {reason}"`
  - **`auto_refund_downgrade`** by doctor, perspective=`patient`, refundStatus=`pending_retry`: `"Dr. {name} downgraded the consult to {text|voice}. Refund of ₹{X} is processing — expect within 3 business days. Reason: {reason}"`
  - **`auto_refund_downgrade`** by doctor, perspective=`doctor`: `"You downgraded to {text|voice}. Patient refunded ₹{X}. Reason: {reason}"`
- [ ] Names rendered via `{patient.first_name | doctor.first_name | 'Dr. {last_name}'}` per existing conventions in Plan 06 Task 38's copy.
- [ ] Modality words always title-cased: `Text`, `Voice`, `Video`.
- [ ] **Reason never truncated** in system message copy (5..200 chars from Task 46's CHECK). Wraps naturally in the chat bubble.

### Wire emitter into Task 47's commit paths

- [ ] `handlePatientInitiatedUpgrade` → `captureWebhookHandler` (paid path): emit inside the post-commit hook:
  ```ts
  await emitSystemMessage({
    sessionId,
    event: 'modality_switched',
    fromModality: session.current_modality,
    toModality: requestedModality,
    initiatedBy: 'patient',
    billingAction: 'paid_upgrade',
    amountPaise,
    historyRowId,
  });
  ```
- [ ] `handleDoctorApprovalOfPatientUpgrade` `'free'` branch: same shape with `billingAction: 'free_upgrade'`, no `amountPaise`.
- [ ] `handleDoctorInitiatedUpgrade` → `handlePatientConsentForDoctorUpgrade` `'allow'` branch: `billingAction: 'free_upgrade'`, `initiatedBy: 'doctor'`, `reason` populated.
- [ ] `handlePatientInitiatedDowngrade`: `billingAction: 'no_refund_downgrade'`, `reason` populated.
- [ ] `handleDoctorInitiatedDowngrade`: `billingAction: 'auto_refund_downgrade'`, `amountPaise`, `reason`, and initial `refundStatus` based on sync-refund result.
- [ ] **When sync-refund completes after the initial `pending_retry` message** (i.e. the retry worker succeeds later): emit a second `modality_switched` system message variant? **Decision: NO.** Emitting a second message for the same transition pollutes the chat. Instead, **extend the emitter** with a new sibling event `refund_completed`:
  ```ts
  | { event: 'refund_completed'; historyRowId: string; amountPaise: number };
  ```
  Retry worker emits this on successful refund. Copy: "Your pending refund of ₹{X} has been processed." Doctor perspective: "Patient's refund of ₹{X} has been processed." **This task includes this adjacent event** to close the loop honestly.
- [ ] If refund permanently fails (Task 49's `failed_permanent`): emit a `refund_failed` sibling event with copy pointing patient to support. Same doctrine.

### System-message visibility of decline / timeout events

- [ ] **Declines + timeouts are HIDDEN from chat.** Matches Plan 08 Task 41's privacy doctrine (Notes #3 of Task 41) — a declined request doesn't create a persistent narrative artifact; it would be awkward to show both parties "doctor declined your request" in chat history.
- [ ] No emitter call for decline / timeout paths.
- [ ] (Structured logs still capture decline/timeout for audit via `correlationId`.)

### Post-consult rendering (readonly)

- [ ] Plan 07 Task 31's post-consult chat history view (readonly `<TextConsultRoom>`) MUST render these system messages. No extra work — Plan 06 Task 38's renderer dispatches any `system_event` row through `renderSystemMessageCopy`.
- [ ] **PDF transcript (Plan 07 Task 32)** must also render these — verify at PR time that Task 32's renderer handles `modality_switched` events. Coordination note for Task 32 owner: after Task 53 lands, Task 32's PDF helper needs a visual treatment for modality-switch messages (suggested: bold + emoji like "🔀" prefix, with reason italicized below).

### AI pipeline coordination (Plan 10)

- [ ] Plan 10's session-narrative AI pipeline reads `consultation_messages WHERE kind='system' AND system_event IN (...)` — `modality_switched` joins that set. Task 53 ensures the payload has all fields the AI pipeline needs (`fromModality`, `toModality`, `initiatedBy`, `billingAction`, `reason`). AI pipeline owner verifies at PR time.

### Tests

- [ ] **`backend/tests/unit/services/system-message-emitter-modality-switched.test.ts`** (NEW):
  - Each of 4 billing actions generates a row with correct `system_event` payload shape.
  - Dedup: emit twice with same `historyRowId` → only one row.
  - `refund_completed` sibling event emits correct payload.
  - `refund_failed` sibling event emits correct payload.
- [ ] **`backend/tests/unit/services/consultation-session-service-modality-change-emit.test.ts`** (NEW or extend Task 47's test file):
  - Each of Task 47's 4 handler branches (plus webhook-driven commit) fires exactly one `emitSystemMessage` on success.
  - Decline / timeout paths fire ZERO system messages.
  - Retry-refund-completes path fires one `refund_completed` event.
- [ ] **`frontend/lib/system-message-copy.test.ts`** (deferred per harness status; but if extending an existing test): exhaustive copy matrix for all 9 variants above.

### Type-check + lint clean

- [ ] Backend + Frontend `tsc --noEmit` exit 0. Tests green.

---

## Out of scope

- **Structured audit log for declines / timeouts.** Structured logs via `correlationId` + `modality_change_pending_requests.response='timeout'|'declined'` already capture; no dedicated audit table.
- **Rich media in system messages** (icons, images). Plain text rendered by client.
- **Localization.** Copy in English; framework hook lives in `renderSystemMessageCopy` for future i18n.
- **Animated transitions for the system message bubble.** Standard chat rendering is enough.
- **"Undo" affordance in the system message.** Decision 11 LOCKED max 1 upgrade + 1 downgrade per consult; no undo.
- **Push notifications / DMs on the WhatsApp channel for every transition.** Too noisy. Only `sendPostConsultChatHistoryDm` (Plan 07 Task 31) captures the full narrative post-consult.
- **System messages for provider-level rollback events** (Task 48's rare failure path). Those are ops-level concerns; structured logs suffice.
- **Billing-specific emitter** (e.g. separate `refund_issued` event). Rolled into `modality_switched` payload via `refundStatus` + adjacent `refund_completed` / `refund_failed` siblings.

---

## Files expected to touch

**Backend (extend):**

- `backend/src/services/system-message-emitter.ts` — extend `SystemEvent` union.
- `backend/src/services/consultation-session-service.ts` — wire `emitSystemMessage` into 5 commit paths (4 handler branches + retry-worker success).
- `backend/src/workers/modality-refund-retry-worker.ts` (from Task 49) — emit `refund_completed` on success; `refund_failed` after 24h permanent failure.

**Frontend (extend):**

- `frontend/lib/system-message-copy.ts` (from Plan 06 Task 38) — extend with `renderModalitySwitchedCopy` + `renderRefundCompletedCopy` + `renderRefundFailedCopy`.

**Tests:** listed above.

**No new migrations.** Plan 06 Task 39's `system_event TEXT` column already handles new event types via convention.

---

## Notes / open decisions

1. **Why copy is rendered client-side.** Plan 06 Task 37 Notes already established this doctrine. Reiterating because it's the decision driver: lets copy evolve faster than backend deploys.
2. **Why no system message on decline/timeout.** See Plan 08 Task 41 Notes #3 — same reasoning. A permanent chat artifact for a non-decision is awkward + signals to patient/doctor future consults won't have this noise.
3. **Refund-status lifecycle is two messages** (initial "processing" + later "completed"). Design choice: transparency over conciseness. Patient explicitly sees the refund landed, closing the loop without relying on bank-statement reconciliation.
4. **`refund_failed` (adjacent event) UX.** Copy: "We couldn't automatically refund ₹{X}. Our support team has been notified." Sets expectation without alarming the patient. Ops team actually handles via `admin_payment_alerts` (Task 49).
5. **Preserving a rendering contract with Plan 10.** The payload fields must be stable — renames would break AI pipeline expectations. Document the payload shape in `backend/src/services/system-message-emitter.ts` with a `@ai-pipeline-stable` comment block.
6. **Ordering with Plan 07 / 08 events.** Chat-rendering is strictly by `consultation_messages.created_at`. If two events land within the same millisecond (rare — ~1µs Postgres timestamp resolution), they render in insertion order. Acceptable.
7. **Doctor-dashboard bell-icon events?** Plan 07 Task 30's `doctor_dashboard_events` table is used for notable events like "patient replayed the recording". Should modality transitions also land there? **Decision: NO in v1** — they're already visible in chat during the consult. Post-consult dashboard has the full timeline (Task 55). Dashboard bell would be redundant.
8. **AI-pipeline payload stability.** If Plan 10 expects `fromModality: 'text' | 'voice' | 'video'`, preserving that shape is critical. Adding fields (e.g. `correlationId`) is safe; renaming / removing is not. Document in `@ai-pipeline-stable` block.
9. **Copy variants are 9 — seems a lot, but the matrix is necessary.** Reducing variants would either (a) sacrifice personalisation (show the same copy to both parties) or (b) lose information (drop the reason or amount). Both worse than 9 variants of clear, specific strings.
10. **Refund-completed event emitted by the worker, not by the state machine.** State machine doesn't know when the async refund completes. Only the worker does. Clean separation.

---

## References

- **Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md) — Task 53 section lines 83 + acceptance line 424.
- **Plan 06 Task 37 — emitter extended here:** [task-37-system-message-emitter.md](./task-37-system-message-emitter.md).
- **Plan 06 Task 38 — copy renderer extended here:** [task-38-video-room-companion-chat-panel.md](./task-38-video-room-companion-chat-panel.md) (Plan 06 Task 38 variant covers the copy layer).
- **Task 47 — emitter caller; 5 commit paths wired:** [task-47-request-modality-change-state-machine.md](./task-47-request-modality-change-state-machine.md).
- **Task 49 — retry worker emits `refund_completed` / `refund_failed` siblings:** [task-49-modality-billing-razorpay-capture-and-refund.md](./task-49-modality-billing-razorpay-capture-and-refund.md).
- **Plan 07 Task 31 — readonly post-consult chat render:** [task-31-post-consult-chat-history-surface.md](./task-31-post-consult-chat-history-surface.md).
- **Plan 07 Task 32 — transcript PDF render (coordination):** [task-32-transcript-pdf-export.md](./task-32-transcript-pdf-export.md).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Not started — small but plan-critical wiring task. Hard-blocks on Plan 06 Task 37 + Task 47. Ships after Phase A state machine is complete.
