# Task 50: Patient `<ModalityUpgradeRequestModal>` — 6-state machine (request → await approval → checkout / free-join / declined / timeout) (Decision 11 LOCKED)

## 19 April 2026 — Plan [Mid-consult modality switching](../Plans/plan-09-mid-consult-modality-switching.md) — Phase B/C

---

## Task overview

Decision 11 LOCKED the patient-initiated-upgrade friction model. This task ships the patient-side UI orchestrator — a single modal that walks through all 6 visual states:

1. **Request form** — patient confirms the upgrade + optional reason.
2. **Awaiting approval** — 90s countdown while doctor decides.
3. **Doctor approved + paid** — Razorpay Checkout SDK pop.
4. **Doctor approved + free** — success toast + auto-join new modality room.
5. **Doctor declined** — reason surfaced + 5-min cooldown + "Try once more".
6. **Timeout** — no doctor response in 90s → auto-decline + 5-min cooldown.

All state transitions are driven by Supabase Realtime events on `consultation-sessions:${sessionId}:modality-change` (Task 47's broadcast channel). The modal re-hydrates its state via `GET /modality-change/state` on mount (for page-refresh resilience).

**Estimated time:** ~4 hours (above the plan's 3h estimate — the Razorpay Checkout SDK integration + the 6-state FSM + the re-hydration path + `prefers-reduced-motion` polish + accessibility push above 3h).

**Status:** Shipped code-complete on 2026-04-19. Details below.

### Status — 2026-04-19 (shipped code-complete)

**What landed:**

- `frontend/types/modality-change.ts` (NEW) — hand-mirrored discriminated unions that match `backend/src/types/modality-change.ts`. Adds `PendingRequestRow` + `ModalityHistoryRowInsert` projections for the Supabase Realtime `postgres_changes` payloads the hook consumes.
- `frontend/lib/api/modality-change.ts` (NEW) — wrappers for `POST /modality-change/request`, `POST /modality-change/approve`, `POST /modality-change/patient-consent`, and `GET /modality-change/state`. Task 50 itself only calls `/request` + `/state`; `/approve` + `/patient-consent` live here for Task 51/52 reuse.
- `frontend/lib/razorpay-checkout.ts` (NEW) — dynamic loader for `https://checkout.razorpay.com/v1/checkout.js` + typed `openRazorpayCheckout()` helper with `{ status: 'success' | 'dismissed' }` outcomes.
- `frontend/hooks/useModalityUpgradeFSM.ts` (NEW) — the reducer (10 states per spec) + Supabase Realtime subscription + local-timer safety-net. Subscribes to `postgres_changes` UPDATE on `modality_change_pending_requests` and INSERT on `consultation_modality_history` (both RLS-readable by the patient via Migration 075/076 participant-SELECT policies). No backend Broadcast wiring required.
- `frontend/components/consultation/ModalityUpgradeRequestModal.tsx` (NEW) — the modal UI, driven by the FSM hook. Renders all 10 FSM states with `role="dialog"`, aria-live announcements, `prefers-reduced-motion` suppression, INR price formatting, and the 5-min decline/timeout cooldown copy.
- `frontend/.env.example` — added `NEXT_PUBLIC_RAZORPAY_KEY_ID` with a doc-comment explaining the test/live key format and that it's a PUBLIC key (safe to expose).

**v1 simplifications (captured as inbox follow-ups):**

1. **No bespoke backend Broadcast.** The modal observes state transitions via `postgres_changes` on the two RLS-readable tables. Rationale: avoids adding a dedicated Broadcast channel in Task 47 just for the UI; saves round-trip latency vs a custom channel too. If a Broadcast is later added (e.g. for `newAccessToken` push from Task 48's executor), the hook can swap in an additional `.on('broadcast', …)` listener without touching the FSM.
2. **`newAccessToken` not threaded yet.** `onAppliedTransition` fires with only `{ toModality }`. The launcher (Task 54) is expected to remount the appropriate room component which will mint its own access token via the existing per-modality token endpoint. Inbox item: "wire Task 48's rebroadcast to push `newAccessToken` through the modal".
3. **No pending-row→checkout race guard beyond the reducer.** If the doctor approves paid but the billing service hasn't stamped `razorpay_order_id` yet (sub-second window), the mapper returns `null` and waits for the next UPDATE event to fire with both fields populated. Safe because the billing service's stamping is a single UPDATE per Task 49.
4. **`checkout_cancelled` / orphan order cleanup not handled client-side.** If the patient dismisses Razorpay Checkout, the FSM returns to `idle` and leaves the pending row alone. Razorpay auto-expires unused orders after ~15 min. Inbox item: "verify orphan-order cleanup — may require a scheduled job to mark pending rows as 'checkout_cancelled' on Razorpay order-expiry webhook".
5. **No component tests.** Task doc defers until the frontend-test-harness inbox item is resolved. The FSM's reducer is pure + exported, so it's trivially testable once the harness lands.

**Verification:**

- `tsc --noEmit` (frontend) — exit 0.
- `eslint . --ext .ts,.tsx --max-warnings 0` (frontend) — clean.
- No backend changes in this task; no backend test rerun required.

**Depends on:**

- Task 47 (hard — endpoints `POST /modality-change/request` + `GET /modality-change/state` + Realtime broadcast contract).
- Task 49 (hard — Razorpay checkout token shape).
- Plan 04 Task 17 (soft — `<TextConsultRoom>` / launching context; `<ModalityChangeLauncher>` in Task 54 mounts this modal).
- Plan 05 Task 24 (soft — `<VoiceConsultRoom>` launches the same modal).
- Plan 01 existing `<VideoRoom>` (soft — the modal is modality-agnostic; launcher renders it in all three rooms).
- Razorpay Checkout SDK (frontend) — **likely already present** in the codebase for booking-time flow; verify at PR-time.

**Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md)

---

## Acceptance criteria

### Component shape

- [ ] **`frontend/components/consultation/ModalityUpgradeRequestModal.tsx`** (NEW):
  ```tsx
  interface ModalityUpgradeRequestModalProps {
    isOpen:             boolean;
    onClose:            () => void;
    sessionId:          string;
    patientId:          string;
    currentModality:    'text' | 'voice';                       // upgrade target derived from this
    targetModality:     'voice' | 'video';
    remainingAttempts:  1;                                       // only ever 1 per consult; shown for UX certainty
    onAppliedTransition?: (payload: { toModality: Modality; newAccessToken?: string }) => void;
  }
  ```

- [ ] **Internal FSM states** — one `useReducer` drives all six:
  ```ts
  type ModalState =
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'awaiting_approval'; approvalRequestId: string; expiresAt: string }
    | { kind: 'checkout_ready'; razorpayOrderId: string; checkoutToken: string; amountPaise: number }
    | { kind: 'checkout_opened'; razorpayOrderId: string }
    | { kind: 'applying_transition' }                            // server confirmed payment; awaiting transition-applied broadcast
    | { kind: 'applied'; toModality: Modality }                   // brief success state before onClose fires
    | { kind: 'declined'; reason: string; cooldownUntil: string } // 5-min cooldown
    | { kind: 'timeout'; cooldownUntil: string }
    | { kind: 'free_upgrade_approved' }                          // brief success state before onClose fires
    | { kind: 'error'; message: string; retryable: boolean };
  ```

### Visual states

- [ ] **State: `idle` (request form)** — rendered when modal first opens:
  ```
  ┌────────────────────────────────────────────────────┐
  │ Upgrade to {Video}?                                │
  ├────────────────────────────────────────────────────┤
  │                                                    │
  │ You're currently on {Voice}. Upgrading lets you    │
  │ and Dr. Sharma see each other.                     │
  │                                                    │
  │ Video is normally ₹350 more than voice.            │
  │                                                    │
  │ Dr. Sharma will decide whether to charge the       │
  │ difference or grant the upgrade for free.          │
  │                                                    │
  │ Reason (optional):                                  │
  │ ┌────────────────────────────────────────────────┐ │
  │ │ e.g. "I'd like to show a visible symptom."     │ │
  │ │                                         0/200  │ │
  │ └────────────────────────────────────────────────┘ │
  │                                                    │
  │                 [  Cancel  ]   [ Send Request ]    │
  │                                                    │
  └────────────────────────────────────────────────────┘
  ```
  - Price label computed server-side and fetched via `GET /modality-change/state` on mount → included in the response as `pricing: { delta_paise: 35000 }` etc. (Task 47 extends its state endpoint accordingly.)
  - Reason field is **optional** for patient upgrades (matches Task 47 Step 8).
  - `[Send Request]` → POST `/modality-change/request` with `{ requestedModality, initiatedBy: 'patient', reason? }`. Transition `submitting` → `awaiting_approval`.

- [ ] **State: `submitting`** — inline spinner on `[Send Request]`; buttons disabled.

- [ ] **State: `awaiting_approval`**:
  ```
  ┌────────────────────────────────────────────────────┐
  │ Waiting for Dr. Sharma to approve                  │
  ├────────────────────────────────────────────────────┤
  │                                                    │
  │ ⏳ 88 seconds remaining                             │
  │                                                    │
  │ Dr. Sharma is deciding whether to approve the      │
  │ upgrade and whether to charge for it.              │
  │                                                    │
  │ If no response in 90 seconds, the request will     │
  │ auto-decline.                                      │
  │                                                    │
  │                 [  Close  ]                        │
  │                                                    │
  └────────────────────────────────────────────────────┘
  ```
  - `[Close]` closes the modal but **does NOT cancel the request** — mirrors Plan 08 Task 40 Note #2.
  - Countdown timer driven by server `expiresAt` timestamp (NOT client-local 90s — clock-skew protection, same as Plan 08 Task 40 Note #3).
  - Updates at 1s cadence; aria-live announces politely every 10s.

- [ ] **State: `checkout_ready`** — server published `{ kind: 'checkout_ready', checkoutToken, razorpayOrderId, amountPaise }`:
  ```
  ┌────────────────────────────────────────────────────┐
  │ Dr. Sharma approved — ₹350                         │
  ├────────────────────────────────────────────────────┤
  │                                                    │
  │ Ready to pay ₹350 for the video upgrade.           │
  │                                                    │
  │                                                    │
  │         [ Cancel ]   [  Pay ₹350 with Razorpay  ]  │
  │                                                    │
  └────────────────────────────────────────────────────┘
  ```
  - On `[Pay]` click: opens Razorpay Checkout SDK via `new Razorpay(options).open()` with the `checkoutToken`:
    ```ts
    const razorpay = new Razorpay({
      key:         process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      order_id:    razorpayOrderId,
      amount:      amountPaise,
      currency:    'INR',
      name:        'Clariva',
      description: `Upgrade consult to ${targetModality}`,
      handler:     (razorpayResponse) => { /* dispatch to applying_transition state */ },
      modal: {
        ondismiss: () => { /* dispatch back to idle or to 'error' if retryable */ },
      },
      theme: { color: /* match app accent color */ },
    });
    razorpay.open();
    ```
  - Transitions to `checkout_opened` while Razorpay modal is visible.
  - On Razorpay SDK success callback → transition to `applying_transition` (server is now processing webhook; wait for Realtime `transition_applied` event).
  - On Razorpay SDK dismiss → transition to `idle` with a toast "Payment cancelled. Consult stays on {voice}." **Task 47's pending row is already marked `approved_paid` by the doctor; the patient's cancel leaves the order orphaned on Razorpay side — Razorpay auto-expires it**. Captured in inbox.md as "verify orphan-order cleanup — may require a scheduled job to mark pending rows as 'checkout_cancelled' on Razorpay order expiry webhook".

- [ ] **State: `checkout_opened`** — Razorpay modal is live; underlying modal dimmed 80%.

- [ ] **State: `applying_transition`** — spinner overlay "Switching to video…" while backend executes Task 48's transition + fires Realtime `transition_applied`.

- [ ] **State: `applied`** — brief success overlay:
  ```
  ┌────────────────────────────────────────────────────┐
  │ Video upgrade applied                              │
  │                                                    │
  │        ✓ Switching you to video now                │
  │                                                    │
  └────────────────────────────────────────────────────┘
  ```
  - 1.5s auto-close → fire `onAppliedTransition` with `{ toModality, newAccessToken }` → parent (`<ModalityChangeLauncher>`) swaps the room surface. If the Realtime broadcast arrived with `newAccessToken`, pass it through; the launcher re-mounts `<VoiceConsultRoom>` / `<VideoRoom>` with the new token.

- [ ] **State: `free_upgrade_approved`** — same shape as `applied` but copy "Dr. Sharma granted the upgrade for free. Switching to video now."

- [ ] **State: `declined`**:
  ```
  ┌────────────────────────────────────────────────────┐
  │ Dr. Sharma declined                                │
  ├────────────────────────────────────────────────────┤
  │                                                    │
  │ Reason: "Current modality is sufficient for your   │
  │ symptoms."                                         │
  │                                                    │
  │ You can try once more in 4:58.                     │
  │                                                    │
  │                [  Close  ]                         │
  │                                                    │
  └────────────────────────────────────────────────────┘
  ```
  - Cooldown from the `responded_at` timestamp + 5 min.
  - **Important:** Decision 11 LOCKED "max 1 *successful* upgrade per consult" — a declined attempt doesn't consume the per-consult budget (matches Task 47 Notes #7). But there IS a 5-min cooldown between re-attempts. The copy honestly reflects this.
  - On close → modal returns to `idle` after cooldown expires (parent `<ModalityChangeLauncher>` re-enables its button).

- [ ] **State: `timeout`** — same shape as `declined` with copy "Dr. Sharma didn't respond in time. You can try once more in 4:58."

- [ ] **State: `error`** — inline error with `[Close]` and (if `retryable`) `[Retry]`. Covers network failures on the initial `POST /request` and handler callback errors.

### Realtime subscription

- [ ] Mount-time: subscribe to `consultation-sessions:${sessionId}:modality-change` channel on `awaiting_approval` state; tear down on terminal states.
- [ ] Event dispatch table:
  - `{ kind: 'declined', reason }` → state `declined`.
  - `{ kind: 'timeout' }` → state `timeout` (backup client-side timer also transitions at `expiresAt`; whichever fires first; atomic via reducer guard).
  - `{ kind: 'checkout_ready', checkoutToken, razorpayOrderId, amountPaise }` → state `checkout_ready`.
  - `{ kind: 'applied', toModality, newAccessToken? }` → state `applied`.
  - `{ kind: 'free_upgrade_approved', toModality, newAccessToken? }` → state `free_upgrade_approved`.
  - `{ kind: 'rejected', reason: 'provider_failure', refundInitiated: true }` → state `error` with copy "Sorry, we couldn't switch to video due to a technical issue. Your payment is being refunded automatically."

### Re-hydration on mount

- [ ] On mount: call `GET /consultation-sessions/:sessionId/modality-change/state`.
- [ ] If response includes `activePendingRequest`:
  - `activePendingRequest.kind === 'pending_doctor_approval'` (this patient's pending upgrade) + `expiresAt > now()` → initial state `awaiting_approval` with existing `approvalRequestId` + `expiresAt`.
  - `kind === 'approved_paid'` → initial state `checkout_ready` (user refreshed mid-approval; pop checkout).
  - Else → initial state `idle`.
- [ ] Prevents users losing context on page refresh.

### Accessibility + copy

- [ ] `role="dialog"`, focus trap, ESC closes only in `idle` / `declined` / `timeout` / `error` states; NOT in `awaiting_approval` / `applying_transition` / `checkout_opened`.
- [ ] Tap-outside closes in same set of states.
- [ ] Backdrop dimmed 80% (not 100%) so patient sees the consult is still active underneath.
- [ ] Price formatted via `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })`.
- [ ] Countdown color-shifts: 90→30s amber; 30→0 red.
- [ ] Aria-live announces every state transition politely.
- [ ] Large touch targets (48×48 minimum on mobile).
- [ ] `prefers-reduced-motion` suppresses countdown pulse + success-state animation.

### Unit + component tests

- [ ] Deferred per frontend-test-harness inbox note. When bootstrapped:
  - Each of 10 state transitions asserted via reducer-level tests.
  - Countdown sync to server timestamp.
  - Realtime event → state transition.
  - `checkout_opened` state → Razorpay SDK mock invoked with correct options.
  - Re-hydration: mount with pending row → starts in `awaiting_approval`.
  - `onAppliedTransition` called with `toModality` + `newAccessToken` on applied state.
  - Timeout-dispatch race: both server `timeout` event and local timer fire at 90s; only one state transition applies (reducer guard).
  - Cooldown expiration re-enables `[Send Request]` in follow-up tests.

### Type-check + lint clean

- [ ] Frontend `tsc --noEmit` exit 0. ESLint clean.

---

## Out of scope

- **Retry-on-Razorpay-failure inside the modal.** If Razorpay SDK throws, the user sees `error` state + `[Close]`. No automatic retry. The user can close + re-initiate from the launcher.
- **Pre-checkout price confirmation dialog.** The price is displayed in the `idle` form AND again in `checkout_ready` + again in the Razorpay modal itself. Three displays is enough.
- **Patient-side cancel of a pending approval.** Matches Plan 08 Task 40 Note #2 doctrine — no "cancel my request" button during `awaiting_approval`. Decision 11 doesn't mandate this; v1.1.
- **Saved payment method / stored cards.** Decision 11 defers to v2.
- **Localization.** English only in v1.
- **"Show me all historical upgrades" panel in the modal.** Timeline UI is Task 55.
- **Patient-side doctor reason input for their own request.** Not mandatory (Task 47 Step 8 lets it be optional for patient-upgrades). The UI offers the field; doctor has to provide a reason on decline, not the patient on request.

---

## Files expected to touch

**Frontend (new):**

- `frontend/components/consultation/ModalityUpgradeRequestModal.tsx` — the modal.
- `frontend/hooks/useModalityUpgradeFSM.ts` — reducer + Realtime subscription, if co-located split is cleaner.
- `frontend/lib/api/modality-change.ts` (NEW; also consumed by Tasks 51/52/54) — client wrappers for `POST /request`, `GET /state`, `POST /approve`, `POST /patient-consent`.
- `frontend/lib/razorpay-checkout.ts` (NEW or extend existing if a helper exists) — wraps the Razorpay SDK invocation.

**Frontend (extend):**

- `frontend/components/consultation/ModalityChangeLauncher.tsx` — Task 54 mounts this modal (forward reference).

**Tests:** deferred.

**No backend changes** in Task 50.

---

## Notes / open decisions

1. **Why "Try once more" copy on decline.** Matches plan line 276. The 5-min cooldown is **per-consult**, not across consults. The budget reset doctrine is: successful upgrade counts toward the 1-per-consult limit; declines don't. Frontend re-fetches `modality-change/state` after cooldown expires to refresh the parent launcher's enable state.
2. **Why Razorpay SDK in-app vs redirect.** Decision 11's payment friction acceptance hinges on "friction is tolerable because the rest is good" — a redirect would compound the friction (patient loses consult context). In-app modal maintains session continuity.
3. **Countdown sync on `expiresAt` timestamp.** Mirrors Plan 08 Task 40 Note #3. Server-truth prevents the modal saying "0s" while the server still accepts responses (or vice versa).
4. **Orphaned Razorpay orders from mid-checkout dismiss.** Razorpay auto-expires unused orders after ~15 minutes (verify API version). The pending row in `modality_change_pending_requests` can be cleaned up by Task 47's timeout worker if a `checkout_cancelled` response arrives from a Razorpay order-expiry webhook (new webhook branch — Task 49 could add; captured in inbox.md).
5. **`applying_transition` state duration.** In the happy path, backend webhook → transition executor → history commit → Realtime broadcast takes ~1-3s. If >10s, fall through to `error` state with "Something went wrong. Please contact support." Timeout set client-side at 15s.
6. **Price formatting locale.** `en-IN` INR currency. Matches existing booking UI conventions (verify at PR).
7. **Modal re-mount preservation.** If the patient unmounts the modal (tap-close on idle state), the request hasn't been sent — clean reset. If unmounted during `awaiting_approval`, the pending row persists server-side; re-mounting via the launcher rehydrates via `GET /state`.
8. **Double-submit prevention.** `submitting` state disables `[Send Request]`; network failure → `error` state with `[Retry]` re-enables it. Server rejects duplicate requests with `PendingRequestExistsError` — defence-in-depth.
9. **Razorpay webhook latency in `applying_transition`.** Typical < 2s. Spinner copy "Switching to video…" sets expectation; 15s hard timeout catches stuck webhooks.
10. **Declined state doesn't show the doctor's reason if the doctor left it blank.** Task 47's decline endpoint requires `declineReason: string` (≥5 chars) — Task 51's doctor modal enforces. So the reason field is always populated. Fallback copy "No reason given" is defensive but unreachable.

---

## References

- **Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md) — Task 50 section lines 255–280.
- **Task 47 — endpoints + Realtime channels:** [task-47-request-modality-change-state-machine.md](./task-47-request-modality-change-state-machine.md).
- **Task 49 — Razorpay checkout token shape:** [task-49-modality-billing-razorpay-capture-and-refund.md](./task-49-modality-billing-razorpay-capture-and-refund.md).
- **Task 51 — doctor counterpart modals:** [task-51-doctor-modality-approval-downgrade-and-upgrade-initiation-modals.md](./task-51-doctor-modality-approval-downgrade-and-upgrade-initiation-modals.md).
- **Task 52 — patient consent + self-downgrade modals (adjacent):** [task-52-patient-consent-and-self-downgrade-modals.md](./task-52-patient-consent-and-self-downgrade-modals.md).
- **Task 54 — launcher that mounts this modal:** [task-54-modality-change-launcher-in-all-three-rooms.md](./task-54-modality-change-launcher-in-all-three-rooms.md).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Not started — patient-side UI orchestrator for the upgrade flow. Ships alongside Tasks 51/52/54 in Phase B/C after Phase A backend lands.
