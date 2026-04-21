# Task 51: Doctor `<ModalityUpgradeApprovalModal>` + `<DoctorUpgradeInitiationModal>` + `<ModalityDowngradeModal>` — three doctor-side decision UIs (Decision 11 LOCKED)

## 19 April 2026 — Plan [Mid-consult modality switching](../Plans/plan-09-mid-consult-modality-switching.md) — Phase B/C

---

## Task overview

Three doctor-side modals handle three of the four quadrants in Decision 11's matrix:

1. **`<ModalityUpgradeApprovalModal>`** — pops automatically via Realtime when a patient requests an upgrade. Doctor picks `[Accept (charge ₹X)]` (default, highlighted), `[Accept (free)]`, or `[Decline (reason)]`. 90s countdown; auto-decline on timeout.
2. **`<DoctorUpgradeInitiationModal>`** — launched from `<ModalityChangeLauncher>` (Task 54) when doctor wants to upgrade. Reason-captured (preset + free-text ≥5). Submit → patient consent flow (Task 52).
3. **`<ModalityDowngradeModal>`** — launched from the launcher when doctor wants to downgrade. Reason-captured. On submit → immediate transition + auto-refund (via Task 47's state machine + Task 49's billing).

All three share the same reason-capture UX pattern (preset radio + free-text), the same price-display helper, and the same Realtime-driven state transitions.

**Estimated time:** ~4 hours (above the plan's 3h estimate — three modals + shared reason-capture component + price-display helper + Realtime event wiring + accessibility polish push above 3h).

**Status:** Shipped code-complete (2026-04-19). Three doctor-side modals + shared reason-capture + pricing helper + `postgres_changes`-driven auto-open hook all landed. See the "Status: what landed" section at the bottom for details, v1 simplifications, and deferred items.

**Depends on:**

- Task 47 (hard — endpoints `POST /modality-change/request` + `POST /modality-change/approve` + Realtime broadcast contract).
- Task 49 (hard — pricing helper for displaying the delta).
- Task 50 (soft — shared modal component patterns + `frontend/lib/api/modality-change.ts`).

**Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md)

---

## Acceptance criteria

### Shared reason-capture component

- [ ] **`frontend/components/consultation/ModalityReasonCapture.tsx`** (NEW) — reused by all three modals + Task 52:
  ```tsx
  type ReasonVariant =
    | 'doctor_upgrade'       // presets: visible_symptom | need_to_hear_voice | patient_request | other
    | 'doctor_downgrade'     // presets: network_or_equipment | case_doesnt_need_modality | patient_environment | other
    | 'doctor_decline'       // presets: same as doctor_downgrade minus case_doesnt_need + optional free text
    | 'patient_downgrade';   // optional reason; presets: none (free text optional)

  interface ModalityReasonCaptureProps {
    variant:          ReasonVariant;
    value:            { presetCode?: string; freeText: string };
    onChange:         (next: typeof value) => void;
    error?:           string;
    disabled?:        boolean;
  }
  ```
- [ ] **Validation centralised** in the component:
  - `doctor_upgrade` / `doctor_downgrade`: free-text required 5..200 chars; preset required.
  - `doctor_decline`: free-text required 5..200 chars; preset optional.
  - `patient_downgrade`: free-text optional (5..200 if provided); preset optional.
- [ ] Character counter + inline error rendering.
- [ ] Matches Plan 08 Task 40's reason-capture UX doctrine (free-text required even when preset is selected, to capture clinical specificity for audit trail) — **reconfirmed for Plan 09**.

### `<ModalityUpgradeApprovalModal>` — patient-requested upgrade (doctor side)

- [ ] **`frontend/components/consultation/ModalityUpgradeApprovalModal.tsx`** (NEW). Props:
  ```tsx
  interface ModalityUpgradeApprovalModalProps {
    isOpen:             boolean;
    onClose:            () => void;
    approvalRequestId:  string;
    sessionId:          string;
    patientId:          string;
    patientName:        string;
    requestedModality:  'voice' | 'video';
    patientReason?:     string;                   // patient's optional context from Task 50
    deltaPaise:         number;                   // server-computed, displayed as ₹X
    expiresAt:          string;                   // 90s from request
    onDecision?:        (decision: 'paid' | 'free' | 'decline') => void;
  }
  ```
- [ ] **Layout:**
  ```
  ┌─────────────────────────────────────────────────┐
  │ Patient requests upgrade to VIDEO               │
  ├─────────────────────────────────────────────────┤
  │                                                 │
  │ 82 seconds remaining to respond                 │
  │                                                 │
  │ Priya wants to upgrade from voice to video.     │
  │                                                 │
  │ Their reason (optional):                        │
  │ "I'd like to show a visible symptom."           │
  │ (blank when patient didn't provide)             │
  │                                                 │
  │ Standard difference: ₹350                       │
  │                                                 │
  │  [ Accept (charge ₹350) ]  ← default highlighted│
  │  [ Accept (free) ]                              │
  │  [ Decline (reason required) ]                  │
  │                                                 │
  └─────────────────────────────────────────────────┘
  ```
- [ ] **Interactions:**
  - `[ Accept (charge ₹350) ]` — single click → POST `/modality-change/approve` with `{ approvalRequestId, decision: 'paid', amountPaise: deltaPaise }`. Transition to `submitting` → `done` (onClose after 1.5s success message).
  - `[ Accept (free) ]` — single click → POST with `{ decision: 'free' }`.
  - `[ Decline (reason required) ]` — opens decline sub-flow:
    ```
    Below the buttons inline (no secondary modal pop):
    
    ┌─────────────────────────────────────────────┐
    │ Why are you declining?                      │
    │                                             │
    │ Reason:                                     │
    │   ( ) Case doesn't need voice/video         │
    │   ( ) Network or equipment issue            │
    │   ( ) Patient's environment not suitable    │
    │   (•) Other (elaborate)                     │
    │                                             │
    │ ┌─────────────────────────────────────────┐ │
    │ │ Describe the clinical reason…           │ │
    │ │                                  12/200 │ │
    │ └─────────────────────────────────────────┘ │
    │                                             │
    │                [ Cancel ]   [ Submit ]      │
    └─────────────────────────────────────────────┘
    ```
    - `[Submit]` enabled only when ≥5 chars. POST `/approve` with `{ decision: 'decline', declineReason }`.
    - `[Cancel]` reverts to the three-CTA top-level view.
- [ ] **Realtime mount:** subscribes to `consultation-sessions:${sessionId}:modality-change` channel; opens automatically on `{ kind: 'pending_doctor_approval', ... }` event. Closes automatically if:
  - `{ kind: 'timeout' }` arrives (patient's 90s expired server-side) — modal closes + toast "Patient request expired".
  - `{ kind: 'cancelled' }` arrives (rare; only if Plan 10 later adds patient-cancel).
- [ ] **Countdown:** 90s driven by server `expiresAt`. Same timestamp-sync pattern as Task 50.
- [ ] **Default focus:** `[ Accept (charge ₹X) ]` is the default highlighted + initially focused action, per Decision 11 LOCKED "paid = default". Rationale: nudges toward paid-for upgrades (doctor's time is billable), but the free option is one click away.
- [ ] **Full-screen on mobile** (covers video canvas); centered on desktop; backdrop 80% dim; ESC / tap-outside disabled until decision or timeout — matches Plan 08 Task 41's doctrine for high-stakes modals.
- [ ] **Can be dismissed by `[Close]`** only when state is `idle` (before any CTA clicked) — doctor can choose to ignore without deciding, and the 90s timeout will fire on server side. Doctor's UI shows a banner afterwards "Patient request expired; you didn't respond".

### `<DoctorUpgradeInitiationModal>`

- [ ] **`frontend/components/consultation/DoctorUpgradeInitiationModal.tsx`** (NEW). Props:
  ```tsx
  interface DoctorUpgradeInitiationModalProps {
    isOpen:          boolean;
    onClose:         () => void;
    sessionId:       string;
    doctorId:        string;
    currentModality: 'text' | 'voice';
    targetModality:  'voice' | 'video';
    onSubmitted?:    (result: { consentRequestId: string; consentExpiresAt: string }) => void;
  }
  ```
- [ ] **Layout:**
  ```
  ┌─────────────────────────────────────────────────┐
  │ Upgrade to VIDEO at no extra cost?              │
  ├─────────────────────────────────────────────────┤
  │                                                 │
  │ The patient will be asked to consent. This will │
  │ be at no extra cost to them.                    │
  │                                                 │
  │ Reason:                                         │
  │   ( ) Need to see visible symptom               │
  │   ( ) Need to hear voice (if from text)         │
  │   ( ) Patient request                           │
  │   (•) Other (elaborate)                         │
  │                                                 │
  │ [ModalityReasonCapture free-text field]         │
  │                                                 │
  │                [ Cancel ]   [ Request ]         │
  └─────────────────────────────────────────────────┘
  ```
- [ ] Preset "Need to hear voice" only visible when `currentModality='text'` (doesn't make sense for voice→video).
- [ ] `[Request]` disabled until `ModalityReasonCapture` reports valid.
- [ ] `[Request]` → POST `/modality-change/request` with `{ initiatedBy: 'doctor', requestedModality: targetModality, reason, presetReasonCode }`.
- [ ] On 200: returns `{ consentRequestId, consentExpiresAt }`. Modal transitions to a waiting view:
  ```
  ┌─────────────────────────────────────────────────┐
  │ Waiting for patient to consent                  │
  ├─────────────────────────────────────────────────┤
  │                                                 │
  │ ⏳ 58 seconds remaining                          │
  │                                                 │
  │ The patient has been asked to consent to the    │
  │ video upgrade. They have 60 seconds to respond. │
  │                                                 │
  │                 [  Close  ]                     │
  └─────────────────────────────────────────────────┘
  ```
  - `[Close]` closes the modal but does NOT cancel the request (same pattern as Plan 08 Task 40).
  - Realtime events drive the close + follow-up state:
    - `{ kind: 'applied', toModality }` → modal closes + toast "Patient agreed — switching to video".
    - `{ kind: 'declined' }` → modal closes + banner "Patient declined; you can try again in 5 min".
    - `{ kind: 'timeout' }` → modal closes + banner "Patient didn't respond; you can try again in 5 min".

### `<ModalityDowngradeModal>`

- [ ] **`frontend/components/consultation/ModalityDowngradeModal.tsx`** (NEW). Props:
  ```tsx
  interface ModalityDowngradeModalProps {
    isOpen:          boolean;
    onClose:         () => void;
    sessionId:       string;
    doctorId:        string;
    currentModality: 'voice' | 'video';
    targetModality:  'text' | 'voice';
    refundAmountPaise: number;                   // server-computed delta
    onSubmitted?:    (result: { applied: true; toModality: Modality }) => void;
  }
  ```
- [ ] **Layout:**
  ```
  ┌─────────────────────────────────────────────────┐
  │ Downgrade to VOICE?                             │
  ├─────────────────────────────────────────────────┤
  │                                                 │
  │ Patient will be refunded ₹350 (difference)      │
  │ automatically.                                  │
  │                                                 │
  │ Reason for downgrade:                           │
  │   ( ) My network/equipment issue                │
  │   ( ) Case doesn't need current modality        │
  │   ( ) Patient's environment                     │
  │   (•) Other (elaborate)                         │
  │                                                 │
  │ [ModalityReasonCapture free-text field]         │
  │                                                 │
  │                [ Cancel ]   [ Downgrade ]       │
  └─────────────────────────────────────────────────┘
  ```
- [ ] `[Downgrade]` disabled until reason valid (5..200 + preset).
- [ ] On click: POST `/modality-change/request` with `{ initiatedBy: 'doctor', requestedModality: targetModality, reason, presetReasonCode }`.
- [ ] Response `{ kind: 'applied' }` immediately (no consent from patient needed for doctor-downgrade). Modal transitions to success view with "Downgrade applied. Refund of ₹350 is processing."
- [ ] 2s auto-close → fire `onSubmitted`.
- [ ] **If refund failed sync** (server returns `{ kind: 'applied', refundStatus: 'pending_retry' }`), success copy adds "Refund is pending — we'll notify the patient once it completes." Transparency builds trust (matches Decision 11 resilience copy).

### Shared price-display helper

- [ ] **`frontend/lib/modality-pricing-display.ts`** (NEW):
  ```ts
  export function formatInrPaise(paise: number): string;
  // 35000 → "₹350"

  export async function fetchModalityPricing(sessionId: string): Promise<{
    text:   { feePaise: number };
    voice:  { feePaise: number };
    video:  { feePaise: number };
    upgradeDeltaPaiseFromCurrent: Record<Modality, number>;
    downgradeDeltaPaiseFromCurrent: Record<Modality, number>;
  }>;
  // Calls GET /modality-change/state which now returns a `pricing` block.
  ```
- [ ] Shared by Tasks 50/51/52/54/55.

### Realtime coordination

- [ ] All three modals listen to `consultation-sessions:${sessionId}:modality-change`. State transitions driven by events enumerated in Task 47.
- [ ] `<ModalityUpgradeApprovalModal>` has a special **auto-open-on-event** behaviour — it mounts at `<DoctorVideoRoomWrapper>` (or equivalent) top level and opens itself when `{ kind: 'pending_doctor_approval' }` arrives. Other two modals are launcher-invoked.

### Accessibility + copy

- [ ] All three modals: `role="dialog"`, focus trap, large touch targets.
- [ ] Price strings formatted with `Intl.NumberFormat`.
- [ ] Error states clearly labelled with `aria-invalid`.
- [ ] Preset radio groups: arrow-key navigation per WCAG.
- [ ] `prefers-reduced-motion` suppresses countdown pulse.
- [ ] Copy reviewed: no jargon, blame-neutral, price-transparent.

### Unit + component tests

- [ ] Deferred per frontend-test-harness inbox note. When bootstrapped, exhaustive coverage per modal per state transition.

### Type-check + lint clean

- [ ] Frontend `tsc --noEmit` exit 0. ESLint clean.

---

## Out of scope

- **Batch-decide ("accept all pending requests")** — there's only ever 0 or 1 pending request per consult.
- **Edit-in-place for the decline reason before submit.** Decline flow is a sub-step of the approval modal; if doctor wants to reconsider, `[Cancel]` returns to the top-level CTAs.
- **Custom price override** by the doctor (e.g. "charge ₹500 instead of ₹350"). Decision 11 LOCKED: `amountPaise` always comes from `service_offerings_json` delta. v1 no custom pricing.
- **Doctor-side "remind me later" snooze on the approval modal.** 90s is 90s; no snooze.
- **Rich-text or attachment support in reason fields.** Plain text only.
- **Live translation of patient's reason.** English only in v1.
- **Auto-apply of previous session's preset.** Each consult starts fresh.

---

## Files expected to touch

**Frontend (new):**

- `frontend/components/consultation/ModalityUpgradeApprovalModal.tsx`.
- `frontend/components/consultation/DoctorUpgradeInitiationModal.tsx`.
- `frontend/components/consultation/ModalityDowngradeModal.tsx`.
- `frontend/components/consultation/ModalityReasonCapture.tsx` — shared.
- `frontend/lib/modality-pricing-display.ts` — shared.

**Frontend (extend):**

- `frontend/components/consultation/ModalityChangeLauncher.tsx` (Task 54) — mounts `<DoctorUpgradeInitiationModal>` / `<ModalityDowngradeModal>`.
- Root doctor-room wrappers (whichever component mounts `<VideoRoom>` for the doctor) — mount `<ModalityUpgradeApprovalModal>` at top level with Realtime subscription.
- `frontend/lib/api/modality-change.ts` — shared with Task 50; confirm shape.

**Tests:** deferred.

**No backend changes** in this task.

---

## Notes / open decisions

1. **Why the decline sub-flow is inline, not a secondary modal.** A secondary modal pop would cover the patient's consult for 2 clicks; inline keeps the flow in one sheet of paper. Matches the UX doctrine "high-stakes decisions shown as a single tree, not a stack".
2. **Default highlight on `[Accept (charge ₹X)]`.** Decision 11 LOCKED language "doctor decides paid (default) vs free". The default nudges toward paid (doctor's time is billable); the free option is adjacent + one-click-away — not buried.
3. **Doctor upgrade initiation reason matches Plan 08 Task 40's reason-capture UX.** Same preset-pattern + required free-text even on presets. Builds audit trail for clinical justification.
4. **Why no "undo" button on downgrade success.** Decision 11 LOCKED: max 1 downgrade per consult. Undoing would be a second downgrade+upgrade and hits the rate limit. Patient unhappy with the downgrade → separate appointment.
5. **Refund-pending copy on downgrade.** Transparency about the refund status is key to trust. Even when refund retries, the patient sees "Refund is processing" — never "Refund completed" until Razorpay confirms.
6. **Doctor-side approval timeout window is 90s.** Matches plan line 265 + Decision 11. Rationale: doctors mid-consult shouldn't be blocked on a modal; 90s lets them finish a sentence + decide.
7. **Refund amount is server-computed; doctor can't see "free refund" option.** Decision 11 LOCKED: doctor-downgrade = always auto-refund. No "decline to refund" option. Protects patient against arbitrary doctor decisions.
8. **Realtime event delivery is best-effort.** Same doctrine as Plan 08 Task 41 Notes #5 — if event delivery drops, `GET /modality-change/state` re-fetches on focus / mount.
9. **Multi-tab doctor scenarios.** If the doctor has two browser tabs open to the same consult, only the first tab's approval-modal closes on decision; the second tab's modal receives its own Realtime `{ kind: 'applied' / 'declined' }` event and closes. No double-dispatch (server's `approvalRequestId` is single-use).
10. **If the doctor resurrects a stale tab during the 90s window.** `<ModalityUpgradeApprovalModal>` re-hydrates via `GET /state` on mount + continues the countdown from the server-side `expiresAt`.

---

## References

- **Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md) — Task 51 section lines 282–315.
- **Task 47 — state machine + endpoints:** [task-47-request-modality-change-state-machine.md](./task-47-request-modality-change-state-machine.md).
- **Task 49 — pricing helper + refund status:** [task-49-modality-billing-razorpay-capture-and-refund.md](./task-49-modality-billing-razorpay-capture-and-refund.md).
- **Task 50 — patient counterpart:** [task-50-patient-modality-upgrade-request-modal.md](./task-50-patient-modality-upgrade-request-modal.md).
- **Task 52 — patient consent counterpart for doctor-initiated upgrades:** [task-52-patient-consent-and-self-downgrade-modals.md](./task-52-patient-consent-and-self-downgrade-modals.md).
- **Task 54 — launcher that mounts these modals:** [task-54-modality-change-launcher-in-all-three-rooms.md](./task-54-modality-change-launcher-in-all-three-rooms.md).
- **Plan 08 Task 40 — reason-capture UX doctrine mirrored here:** [task-40-doctor-video-escalation-button-and-reason-modal.md](./task-40-doctor-video-escalation-button-and-reason-modal.md).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Shipped code-complete 2026-04-19 — doctor-side decision UIs. Ships alongside Tasks 50/52/54 in Phase B/C after Phase A backend lands.

---

## Status: what landed (2026-04-19)

**Five frontend files created, zero backend changes, `tsc --noEmit` + `eslint` clean on all touched files.**

### Files landed

- **`frontend/components/consultation/ModalityReasonCapture.tsx`** — shared reason-capture input with four validation variants (`doctor_upgrade`, `doctor_downgrade`, `doctor_decline`, `patient_downgrade`). Exports `validateModalityReason()` so callers can gate submit buttons without re-implementing the rules. `patient_downgrade` variant rendered here for Task 52 consumption (free-text optional, preset list empty).
- **`frontend/lib/modality-pricing-display.ts`** — `formatInrPaise(paise)` via `Intl.NumberFormat('en-IN', 'INR')` with zero fractional digits (`35000 → ₹350`). Also exports `fetchModalityPricing(token, sessionId)` which hits `GET /modality-change/state` and projects the optional `pricing` block; returns `null` when the block isn't present (backend extension is an inbox follow-up — v1 callers pass `deltaPaise` / `refundAmountPaise` as props).
- **`frontend/hooks/useDoctorPendingUpgradeApproval.ts`** — postgres_changes-driven auto-open driver for `<ModalityUpgradeApprovalModal>`. Subscribes to `modality_change_pending_requests` INSERT events (filtered by session), probes `GET /state` on mount for stale-tab resilience, and clears its local state on terminal UPDATE so the modal closes automatically. Mirrors `usePatientVideoConsentRequest` almost verbatim.
- **`frontend/components/consultation/ModalityUpgradeApprovalModal.tsx`** — three-CTA approval modal with inline decline sub-flow (no secondary modal). 90s countdown with colour-shift at 30s. Default focus on `[Accept (charge ₹X)]`. Dismiss only when `idle` / terminal (prevents accidental dismissal mid-decision).
- **`frontend/components/consultation/DoctorUpgradeInitiationModal.tsx`** — doctor-initiated upgrade request with the two-phase form → waiting-for-consent flow. Realtime UPDATE events on the pending row close the modal and emit `onApplied` / `onDeclinedOrTimedOut`. `[Close]` does NOT cancel the in-flight request (matches Plan 08 Task 40 doctrine).
- **`frontend/components/consultation/ModalityDowngradeModal.tsx`** — doctor-initiated downgrade. Single-step: reason capture → POST → immediate `applied` response. Displays refund amount and auto-closes after 2s with `onSubmitted({ applied: true, toModality })`.

### Decision 11 doctrine observances

1. **Paid = default** — the charge CTA is the highlighted initially-focused action on the approval modal. Free is one-click-adjacent, not buried.
2. **Required free-text on every doctor-action preset** — enforced centrally in `validateModalityReason()`. Preset tags are metadata; the free-text captures clinical specificity for audit.
3. **Decline = inline sub-flow, not a secondary modal** — keeps the flow "a single tree, not a stack" (UX doctrine from Plan 08 Task 40).
4. **Doctor-initiated upgrade is always free** — no Razorpay checkout in this modal; the state machine applies as soon as patient consents.
5. **Doctor-initiated downgrade is unconditional auto-refund** — no "decline to refund" option, per Decision 11 LOCKED protection of patients against arbitrary doctor decisions.
6. **90s approval / 60s consent windows** — both drive off server-side `expiresAt` / `consentExpiresAt` timestamps with client countdown + local safety-net timeouts.

### v1 simplifications + deferred items (all filed in `docs/capture/inbox.md`)

1. **No `refundStatus` surfaced on doctor-downgrade success.** The backend `applied` response doesn't yet include a `refundStatus: 'initiated' | 'pending_retry'` flag — so the modal always shows "Refund is processing". When Task 47's state machine + Task 49's billing start reporting refund status, tighten the copy to "Refund is pending — we'll notify the patient once it completes."
2. **No `pricing` block in `GET /modality-change/state`.** `fetchModalityPricing()` is wired but returns `null` today — the modals accept `deltaPaise` / `refundAmountPaise` via props from the launcher (Task 54). When the backend extension lands, launcher can lean on the helper instead of computing pricing client-side.
3. **Component tests deferred.** Consistent with Task 50's deferral pending the frontend-test-harness bootstrap inbox note. Target once Testing Library + Vitest scaffolding is shipped.
4. **Realtime channel scoping.** Both the approval and initiation modals subscribe to `postgres_changes` on `modality_change_pending_requests` filtered by `session_id`. The doctor-upgrade-initiation channel further filters in-hook by `row.id === consentRequestId` so concurrent sessions don't cross-wire. No backend-level broadcast channel needed — all state transitions derive from DB UPDATEs the patient's / doctor's RLS-scoped SELECT can already see.
5. **Multi-tab behaviour**: approval hook probes `/state` on mount so a resurrected stale tab re-hydrates the pending row; the 90s countdown continues from server-side `expires_at`. Successful decisions propagate via the `approvalRequestId` update, closing any other tabs automatically.

### What's NOT in this task

- `<ModalityChangeLauncher>` (Task 54) mounts these modals and wires them to the doctor room; Task 51's modals are mounting-agnostic.
- Patient-side consent UI for the doctor-initiated upgrade (Task 52).
- Patient-side self-downgrade UI (Task 52, uses `ModalityReasonCapture variant="patient_downgrade"`).
- Backend endpoints (Task 47) and pricing helper (Task 49) — already shipped.
