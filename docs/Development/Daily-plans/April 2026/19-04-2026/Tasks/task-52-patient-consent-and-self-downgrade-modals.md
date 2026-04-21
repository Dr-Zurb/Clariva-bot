# Task 52: Patient `<PatientUpgradeConsentModal>` (60s consent for doctor-initiated upgrades) + `<PatientDowngradeModal>` (self-initiated downgrade, no refund) (Decision 11 LOCKED)

## 19 April 2026 — Plan [Mid-consult modality switching](../Plans/plan-09-mid-consult-modality-switching.md) — Phase B/C

---

## Task overview

Two patient-side modals covering the remaining two quadrants in Decision 11's matrix:

1. **`<PatientUpgradeConsentModal>`** — pops via Realtime when doctor initiates an upgrade. 60s countdown (matches Plan 08 Task 41's consent window). Cannot be dismissed implicitly. `[Decline]` / `[Allow]` CTAs. On `[Allow]` → Task 47 executes the free upgrade.

2. **`<PatientDowngradeModal>`** — launched from `<ModalityChangeLauncher>` (Task 54) when the patient wants to downgrade themselves. Explicit "no refund will be issued" copy. Optional reason capture.

Both modals are low-risk compared to Task 50 — they're confirmation dialogs with clear outcomes, no billing side-effects on the patient side.

**Estimated time:** ~2.5 hours (matches plan estimate, slightly above). Lower than Task 50/51 because the state machines are much simpler (binary decisions).

**Status:** Shipped code-complete (2026-04-19). Both modals + the patient-side auto-open hook all landed. See "Status: what landed" at the bottom.

**Depends on:**

- Task 47 (hard — endpoints + Realtime events).
- Task 49 (soft — pricing display shared via `formatInrPaise`).
- Task 51 (soft — shared `ModalityReasonCapture` component used for the patient-downgrade optional reason).
- Task 50 (soft — shared `frontend/lib/api/modality-change.ts`).

**Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md)

---

## Acceptance criteria

### `<PatientUpgradeConsentModal>`

- [ ] **`frontend/components/consultation/PatientUpgradeConsentModal.tsx`** (NEW). Props:
  ```tsx
  interface PatientUpgradeConsentModalProps {
    isOpen:          boolean;
    consentRequestId: string;
    sessionId:        string;
    patientId:        string;
    doctorName:       string;
    currentModality:  'text' | 'voice';
    targetModality:   'voice' | 'video';
    doctorReason:     string;                     // always present; Task 51 enforces
    expiresAt:        string;                     // 60s from request
    onDecision?:      (decision: 'allow' | 'decline') => void;
  }
  ```
- [ ] **Layout (full-screen mobile-first, same doctrine as Plan 08 Task 41):**
  ```
  ┌────────────────────────────────────────────────────┐
  │                                                    │
  │                     CONSENT NEEDED                 │
  │                                                    │
  │            Dr. Sharma wants to upgrade to          │
  │                      VIDEO                         │
  │                                                    │
  │           No extra charge                          │
  │                                                    │
  │   Reason: "I'd like to see a visible symptom       │
  │   more clearly."                                   │
  │                                                    │
  │                                                    │
  │              ⏳ 56 seconds                          │
  │                                                    │
  │                                                    │
  │       [ Decline ]         [ Allow ]                │
  │                                                    │
  │                                                    │
  │   If you do nothing, this will auto-decline        │
  │   after 60 seconds.                                │
  │                                                    │
  └────────────────────────────────────────────────────┘
  ```
- [ ] **Cannot be dismissed implicitly:** no ESC, no tap-outside, no `[Close]` button. Only `[Decline]`, `[Allow]`, or server-side timeout.
- [ ] `[Decline]` → POST `/modality-change/patient-consent` with `{ consentRequestId, decision: 'decline' }` → 200 → modal closes.
- [ ] `[Allow]` → POST with `{ decision: 'allow' }` → 200 → transition to `applying` spinner "Switching to video…" → Realtime `{ kind: 'applied', newAccessToken }` fires → parent `<ModalityChangeLauncher>` / `<LiveConsultPanel>` re-mounts the right room with the new access token.
- [ ] Server-side timeout at 60s: Task 47's timeout worker broadcasts `{ kind: 'timeout' }` → modal closes with toast "Request expired".
- [ ] **Auto-open-on-Realtime-event pattern.** Like `<ModalityUpgradeApprovalModal>` on the doctor side, this modal lives at a high level in the patient's room wrapper and opens automatically when `{ kind: 'pending_patient_consent', consentRequestId, targetModality, doctorReason, expiresAt }` arrives on the channel.
- [ ] Countdown synced to `expiresAt` server timestamp. Amber at 30s, red at 10s.
- [ ] High-contrast + large touch targets (64×64 minimum for `[Decline]` / `[Allow]` — bigger than normal due to consent's importance).
- [ ] `prefers-reduced-motion` suppresses countdown pulse.
- [ ] `aria-live="assertive"` for the countdown (assertive because user action is required).

### `<PatientDowngradeModal>`

- [ ] **`frontend/components/consultation/PatientDowngradeModal.tsx`** (NEW). Props:
  ```tsx
  interface PatientDowngradeModalProps {
    isOpen:          boolean;
    onClose:         () => void;
    sessionId:       string;
    patientId:       string;
    currentModality: 'voice' | 'video';
    targetModality:  'text' | 'voice';
    onSubmitted?:    (result: { applied: true; toModality: Modality }) => void;
  }
  ```
- [ ] **Layout (centered modal, dismissable):**
  ```
  ┌─────────────────────────────────────────────────┐
  │ Switch to TEXT for the rest of the consult?     │
  ├─────────────────────────────────────────────────┤
  │                                                 │
  │ You'll lose video and voice for this consult.   │
  │ Companion chat stays available.                 │
  │                                                 │
  │ No refund will be issued — you're choosing to   │
  │ use less of what you booked.                    │
  │                                                 │
  │ Reason (optional):                              │
  │ ┌─────────────────────────────────────────────┐ │
  │ │ Why are you switching?                      │ │
  │ │                                       0/200 │ │
  │ └─────────────────────────────────────────────┘ │
  │                                                 │
  │                [ Cancel ]   [ Switch ]          │
  │                                                 │
  └─────────────────────────────────────────────────┘
  ```
- [ ] Uses `<ModalityReasonCapture variant="patient_downgrade">` (optional text, no presets) from Task 51.
- [ ] `[Switch]` is **not** style-accented (unlike the paid-default green button in Task 51) — patient-downgrade is a cost-to-patient action (losing already-paid-for modality); no nudge. Neutral style.
- [ ] On submit: POST `/modality-change/request` with `{ initiatedBy: 'patient', requestedModality: targetModality, reason: optional }`.
- [ ] Response `{ kind: 'applied' }` immediately (no doctor approval needed per Decision 11) → success view "Switched to text. Enjoy the rest of your consult." → 1.5s auto-close → `onSubmitted` fires.
- [ ] ESC / tap-outside / `[Cancel]` dismissable normally (matches low-stakes modal doctrine).
- [ ] `[Switch]` button disabled briefly during submission to prevent double-fire.

### Copy precision

- [ ] **Consent modal copy vs. the plan spec (lines 317–329):** plan's "Reason" display is in the middle of the modal, above the decision CTAs — this task honours that ordering for proper information hierarchy.
- [ ] **Downgrade modal "no refund" disclosure prominent.** Plan line 335 requires this — the copy in this task places it in the primary information slot, not hidden in fine print.
- [ ] **"Companion chat stays available"** clause on the downgrade modal — important to reduce anxiety ("am I losing everything?"). Matches Plan 06's companion-chat doctrine.
- [ ] All copy in English; localization deferred.

### Realtime coordination

- [ ] `<PatientUpgradeConsentModal>` is mounted at the patient's root room component (`app/c/voice/[sessionId]/page.tsx` / `<TextConsultRoom>` wrapper / `<VideoRoom>` patient-side wrapper) with a Realtime subscription. Opens on `{ kind: 'pending_patient_consent' }`.
- [ ] `<PatientDowngradeModal>` is launched by `<ModalityChangeLauncher>` (Task 54); doesn't auto-mount on Realtime events.

### Accessibility

- [ ] Both modals `role="alertdialog"` (consent) / `role="dialog"` (downgrade), with appropriate `aria-labelledby` + `aria-describedby`.
- [ ] Focus trap active.
- [ ] Consent modal's `[Decline]` is the focus-default on open — conservative default if patient taps Enter accidentally.
- [ ] Downgrade modal's `[Cancel]` is focus-default for the same reason.
- [ ] High-contrast mode verified (Windows High Contrast / CSS `forced-colors`).

### Unit + component tests

- [ ] Deferred per frontend-test-harness inbox note. When bootstrapped:
  - Consent modal: auto-opens on `pending_patient_consent` event; auto-closes on `timeout` event; `[Decline]` / `[Allow]` dispatch correct POST; countdown syncs to `expiresAt`; ESC does NOT close.
  - Downgrade modal: `[Cancel]` closes; `[Switch]` posts; success state auto-closes after 1.5s; reason field is optional (submit with empty reason succeeds).

### Type-check + lint clean

- [ ] Frontend `tsc --noEmit` exit 0. ESLint clean.

---

## Out of scope

- **Patient-side cancel of the consent modal via a minimized/hidden state.** Plan 08 Task 41 already decided consent modals are must-answer-or-timeout; same doctrine here.
- **Optional-allow-with-reason on consent modal.** Plan 08 Task 41 decided no reason-capture on patient consent. Same here.
- **"Allow with camera off"** special case. Decision 11 doesn't allow this — upgrade means the camera is available; whether the patient publishes is a `<VideoRoom>`-level concern, not a modality-switch concern.
- **"Sound / vibration alert"** on consent modal open. v1 relies on visual prominence + full-screen. Alerting-via-sound is a Plan 10+ UX consideration (matches Plan 08 Task 41's Note #10).
- **Patient-side reason presets for downgrade.** Optional-only free-text, no presets. Simpler UX for a low-stakes action.
- **Patient-downgrade with post-hoc refund request surface.** Decision 11 LOCKED: patient-downgrade → no refund. No "ask for refund" button.
- **Multi-lingual copy.** English only.

---

## Files expected to touch

**Frontend (new):**

- `frontend/components/consultation/PatientUpgradeConsentModal.tsx`.
- `frontend/components/consultation/PatientDowngradeModal.tsx`.

**Frontend (extend):**

- `frontend/components/consultation/ModalityChangeLauncher.tsx` (Task 54) — mounts `<PatientDowngradeModal>`.
- Patient root room wrappers (`app/c/text/[id]/page.tsx` / `app/c/voice/[id]/page.tsx` / `app/c/video/[id]/page.tsx`) — mount `<PatientUpgradeConsentModal>` at top level with Realtime subscription.
- `frontend/lib/api/modality-change.ts` (shared) — `consent()` wrapper.

**Tests:** deferred.

**No backend changes** in this task.

---

## Notes / open decisions

1. **Why `alertdialog` vs `dialog` for consent.** WAI-ARIA: `alertdialog` is for dialogs that convey important info requiring immediate user response + focus trap — exactly our 60s consent. Screen readers give it stronger priority.
2. **Why 60s not 90s for patient consent.** Matches Plan 08 Task 41's video-escalation consent — consistent UX across similar patient-facing consent flows. Doctor's 90s window is longer because doctors are clinical decision-makers who may need to think; patients are making a simple "yes / no" on UI continuity.
3. **Why `[Decline]` is focus-default on consent.** Conservative defaulting: if the patient taps Enter by reflex, the safe action is decline (preserves current state). Doctor-side approval modal's default is `[Accept (charge)]` — different defaulting because the doctor's default intent is typically "approve with payment".
4. **Why downgrade "switch" button isn't styled primary.** Visual language shouldn't nudge patients toward losing their already-paid-for modality. Neutral style.
5. **Consent modal lives at root of patient's room wrapper, not inside `<ModalityChangeLauncher>`.** The launcher is for *user-initiated* actions; consent is a *system-initiated* modal (doctor initiated the upgrade, patient is being asked to consent). Mounting at root ensures the modal shows regardless of which room the patient is in (text / voice / video).
6. **"Companion chat stays available" copy on downgrade.** Important to reduce the anxiety of "what am I losing?". Plan 06's doctrine is companion chat always stays.
7. **Downgrade success state.** 1.5s auto-close + toast vs. dedicated success panel. Short enough not to interrupt the consult; long enough for the patient to confirm the action landed.
8. **Patient trying to downgrade to current modality.** Launcher (Task 54) prevents this by greying out the option. Defence-in-depth: if a user somehow invokes the modal with `targetModality === currentModality`, modal shows an error state with close button (no server call).
9. **Realtime channel coordination with Plan 08.** Both Plan 08 (video escalation) and Plan 09 (modality change) publish on session-scoped channels. If both modals could open simultaneously (extremely rare race), both are scoped to different event types and both can coexist — but visually the patient would see one covering the other. Acceptable edge case.
10. **`onSubmitted` callback fires after Realtime `applied` event arrives, not after the HTTP 200.** For the consent modal path, the HTTP 200 only confirms the server received consent; the actual transition landing comes from the `{ kind: 'applied' }` Realtime event. Avoids "switched to video" success state showing before the room is actually swapped in.

---

## References

- **Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md) — Task 52 section lines 317–338.
- **Task 47 — endpoints + Realtime events:** [task-47-request-modality-change-state-machine.md](./task-47-request-modality-change-state-machine.md).
- **Task 51 — shared `ModalityReasonCapture`:** [task-51-doctor-modality-approval-downgrade-and-upgrade-initiation-modals.md](./task-51-doctor-modality-approval-downgrade-and-upgrade-initiation-modals.md).
- **Task 50 — adjacent patient modal, shared API client:** [task-50-patient-modality-upgrade-request-modal.md](./task-50-patient-modality-upgrade-request-modal.md).
- **Task 54 — launcher that mounts `<PatientDowngradeModal>`:** [task-54-modality-change-launcher-in-all-three-rooms.md](./task-54-modality-change-launcher-in-all-three-rooms.md).
- **Plan 08 Task 41 — consent modal UX doctrine mirrored here:** [task-41-patient-video-consent-modal-and-escalation-service.md](./task-41-patient-video-consent-modal-and-escalation-service.md).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Shipped code-complete 2026-04-19 — low-risk patient-side modals. Ships alongside Tasks 50/51/54 in Phase B/C.

---

## Status: what landed (2026-04-19)

**Three frontend files created, zero backend changes, `tsc --noEmit` + `eslint` clean on all touched files.**

### Files landed

- **`frontend/hooks/usePatientPendingUpgradeConsent.ts`** — patient-side auto-open driver. Mirrors Task 51's `useDoctorPendingUpgradeApproval` — `postgres_changes` INSERT subscription on `modality_change_pending_requests` filtered by `session_id`, narrowed in-hook to rows where `initiated_by='doctor'` + upgrade direction. `GET /state` probe on mount re-hydrates stale tabs via Migration 076's participant-SELECT RLS policy (falls back to an enriched row `SELECT` for reason / preset when the HTTP projection masks them). Terminal UPDATE events (`allowed` / `declined` / `timeout` / `provider_failure`) fire `onResolved` and clear local state so the modal auto-closes.
- **`frontend/components/consultation/PatientUpgradeConsentModal.tsx`** — high-stakes `role="alertdialog"` full-screen consent surface. Cannot be dismissed implicitly — ESC is actively `preventDefault`'d, there's no backdrop click-through, no close button. Only `[Decline]`, `[Allow]`, or server-side 60s timeout. `[Decline]` is the focus-default (conservative — Enter-reflex → safe action). `[Allow]` posts, reads the synchronous `applied` result from Task 47's state machine, transitions to a brief "Switching to {modality}…" spinner, then fires `onAccepted({ toModality })` so the parent launcher can remount the destination room. Countdown colour-shifts at 30s (amber) / 10s (red) with an animate-pulse that suppresses under `prefers-reduced-motion`. `aria-live="assertive"` on the countdown. 64×64 minimum touch targets for both CTAs.
- **`frontend/components/consultation/PatientDowngradeModal.tsx`** — patient-initiated self-downgrade with "No refund will be issued" disclosure in the primary info slot (amber-backgrounded, not hidden in fine print — Plan line 335). "Companion chat stays available" reassurance copy (Plan 06 doctrine — reduces "what am I losing?" anxiety). Reuses `<ModalityReasonCapture variant="patient_downgrade">` from Task 51 (optional free-text, no presets). `[Switch]` button is deliberately NEUTRAL-styled (gray, no primary accent) — visual language shouldn't nudge patients toward losing their already-paid-for modality. `[Cancel]` is focus-default. Success state auto-closes 1.5s after `onSubmitted({ applied: true, toModality })` fires. Defence-in-depth: if invoked with `targetModality === currentModality`, renders an inline error with a Close button instead of submitting.

### Decision 11 doctrine observances

1. **Cannot dismiss consent implicitly** — consent modal has no ESC handler, no tap-outside close, no close button. Only `[Decline]` / `[Allow]` / server-side 60s timeout. Matches Plan 08 Task 41 doctrine for must-answer modals.
2. **`[Decline]` focus-default on consent, `[Cancel]` focus-default on downgrade** — both are the conservative choices.
3. **60s consent window** — matches Plan 08 Task 41's patient video-escalation consent window (doctor gets 90s because they're clinical decision-makers; patient is making a simple "yes/no" on UI continuity).
4. **Patient-downgrade is unconditional no-refund** — Decision 11 LOCKED. Copy calls this out prominently; no "ask for refund" follow-up surface (out of scope per task).
5. **Patient-downgrade `[Switch]` is neutral-styled, not accent-colored** — no nudge.
6. **`role="alertdialog"` on consent, `role="dialog"` on downgrade** — WAI-ARIA priority matches the action's stakes.

### v1 simplifications + deferred items (all filed in `docs/capture/inbox.md`)

1. **`newAccessToken` not threaded to the consent modal.** Same simplification as Task 50 — the `onAccepted` callback only passes `{ toModality }`; the parent launcher (Task 54) is expected to remount the destination room and fetch its own fresh token. Task 48's commit-side rebroadcast of `newAccessToken` is an existing inbox follow-up.
2. **No Realtime `applied` confirmation wait.** Task 52's Notes §10 recommended firing `onAccepted` only after the `{ kind: 'applied' }` Realtime event arrives (not after HTTP 200). In v1 we fire on HTTP 200 because Task 47's state machine applies synchronously during the consent POST — the HTTP response already carries `{ kind: 'applied', toModality }`. If future async paths change that (e.g. a webhook-driven apply), we'll need to subscribe to `consultation_modality_history` INSERT for confirmation before calling `onAccepted`.
3. **Component tests deferred.** Consistent with Tasks 50/51 — blocked on the existing frontend-test-harness inbox item.
4. **No dedicated `onDismiss` wiring for the consent modal.** By design — the consent modal has no dismiss path. Parent components should unmount it by setting `isOpen={false}` in response to `onAccepted` / `onDeclined` / `onTimeout` (or the hook's `onResolved` clearing `pending`).
5. **Launcher-level rate-limit greyout for the downgrade modal.** Launcher (Task 54) is responsible for disabling the downgrade CTA when `downgradeCount >= 1`. The modal itself trusts the launcher's gate and falls back to a rejected response from the state machine.

### What's NOT in this task

- `<ModalityChangeLauncher>` (Task 54) that mounts `<PatientDowngradeModal>` and consumes the `usePatientPendingUpgradeConsent` hook to mount `<PatientUpgradeConsentModal>` at room-wrapper level.
- Patient-side refund-pending status surfaces (out of scope — patient-downgrade is no-refund).
- Localization of copy.
- Sound / vibration alert on consent modal open (out of scope per spec).
