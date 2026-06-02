# Task voice-A2: End-call confirmation modal (with shift-click bypass)

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch A (T1 quick wins) — **XS item, ~45 min**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Today, the end-call button (red phone icon) ends the call immediately on first click — no confirmation. Misclicks happen, especially on mobile where the button sits next to mute. Doctors lose 30s of awkward "sorry, I clicked the wrong thing" rejoin friction. T1.5 ships a confirmation modal with a **shift-click bypass** for the deliberate-shutdown case (decision §1: default focus = `Cancel`).

**Estimated time:** ~45 min.

**Status:** Shipped.

**Depends on:** nothing.

**Source:** [T1 §T1.5](../../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md); [decision §1](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-a-starts).

---

## Acceptance criteria

### `<EndCallConfirmModal>` component

- [x] **New component** at `frontend/components/consultation/EndCallConfirmModal.tsx`:
  - Headline: `"End this call?"`
  - Body: `"Are you sure you want to end the call? Your conversation will not be deleted."`
  - Two buttons: `[Cancel]` (primary) and `[End call]` (destructive — red).
  - Shift-click on the underlying end-call button BYPASSES this modal entirely (deliberate-shutdown shortcut).
  - **Default focus = `Cancel`** (decision §1). Pressing Enter cancels, not confirms — the safe default.
  - Esc closes modal (= Cancel).
- [x] **Animations**: 150ms fade-in / fade-out. No bounce.
- [x] **Three-host parity**: works in `standalone` / `panel` / `canvas` layouts.
- [x] **Mobile**: full-width modal at the bottom (sheet-style); desktop: centered overlay.

### Wire into `<VoiceConsultRoom>`

- [x] **Edit** `frontend/components/consultation/VoiceConsultRoom.tsx`:
  - Find the end-call button click handler.
  - Replace direct `endCall()` with `setConfirmOpen(true)` (unless `event.shiftKey === true`).
  - Mount `<EndCallConfirmModal isOpen={confirmOpen} onCancel={() => setConfirmOpen(false)} onConfirm={endCall} />`.
- [x] **Same handler on doctor + patient** — both sides confirm. The "doctor ends for both parties" semantics are unchanged; the modal just gates the action.
- [x] **`mode='readonly'`** — readonly mounts have no end-call button; nothing to do.

### Manual smoke

- [x] Click end-call → modal appears, focus on Cancel.
- [x] Press Enter → modal closes, call continues.
- [x] Press Esc → modal closes, call continues.
- [x] Click Cancel → modal closes, call continues.
- [x] Click End call → modal closes, call ends.
- [x] **Shift-click end-call** → modal NEVER appears; call ends immediately.
- [x] Mobile: sheet animates up from bottom.
- [x] Desktop: centered overlay with backdrop.

### General

- [x] Type-check + lint clean.
- [x] No focus-trap leak (Tab cycles inside modal while open).

---

## Out of scope

- **Confirmation for the patient side specifically.** Same modal, both sides; no patient-vs-doctor copy variation in v1.
- **"Don't ask again" preference.** Out of scope.
- **End-call telemetry.** Out of scope.
- **Auto-confirm after timeout.** Out of scope; if the user steps away, the call just stays active.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/EndCallConfirmModal.tsx` — **new** (~70 LOC).
- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edit** (~15 LOC: state + mount + shift-key check).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Why default focus = Cancel** — destructive defaults are bad UX. Enter-to-confirm-destruction is a footgun.
2. **Why shift-click bypass** — power users (especially doctors with back-to-back consults) want one-click end. Shift-click is a recognized "do it without asking" pattern (browser tabs, Slack messages).
3. **Doctor copy vs patient copy** — same copy. Differentiating doesn't add value.
4. **Modal vs inline confirmation in the button area** — modal is correct; the button area is small and a confirmation popover there is dismissed too easily.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch A](../Plans/plan-voice-consult-selected-features.md#sub-batch-a--polished-call-5-days)
- **Source item:** [T1 §T1.5](../../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md)
- **Decision:** [§1 — default focus on Cancel](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-a-starts).

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** Shipped (2026-05-19); second-cheapest in Sub-batch A.
