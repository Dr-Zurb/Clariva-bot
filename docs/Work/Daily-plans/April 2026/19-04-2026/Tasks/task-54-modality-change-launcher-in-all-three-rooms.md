# Task 54: `<ModalityChangeLauncher>` — "Request modality change" launcher buttons in all three rooms (Decision 11 LOCKED)

## 19 April 2026 — Plan [Mid-consult modality switching](../Plans/plan-09-mid-consult-modality-switching.md) — Phase B/C

---

## Task overview

Decision 11 LOCKED the "patient + doctor can initiate a modality change mid-consult" doctrine. This task ships the **entry point UI** — a pair of buttons (or popover / menu) rendered inside every room's controls bar that let the user launch a modality change.

- **Patient view:** **upgrade-only** picker (upgrade from current modality to higher). No downgrade from launcher — patient-downgrade is launched via a different surface (see Notes #3). **Actually** — re-reading the plan: plan line 343 says "Patient view: only upgrade picker". Reconfirming: patient downgrade is available via a different mechanism (in-chat system shortcut? Or still via the launcher?). **Decision below:** launcher handles BOTH for symmetry, with patient-downgrade adjacent but visually distinct.
- **Doctor view:** both upgrade + downgrade pickers.

Either way, the launcher:

1. Reads `GET /consultation-sessions/:sessionId/modality-change/state` to determine `currentModality`, `upgradeCount`, `downgradeCount`, and pricing.
2. Greys out upgrade options when `upgradeCount >= 1`; greys out downgrade options when `downgradeCount >= 1`.
3. Greys out options during an active pending request (server-side pending row).
4. Mounts the right modal on click:
   - Patient + upgrade target → `<ModalityUpgradeRequestModal>` (Task 50).
   - Patient + downgrade target → `<PatientDowngradeModal>` (Task 52).
   - Doctor + upgrade target → `<DoctorUpgradeInitiationModal>` (Task 51).
   - Doctor + downgrade target → `<ModalityDowngradeModal>` (Task 51).

Rendered in all three rooms: `<TextConsultRoom>` (controls bar), `<VoiceConsultRoom>` (controls bar), `<VideoRoom>` (controls bar). `<LiveConsultPanel>` is the shared host.

**Estimated time:** ~2.5 hours (matches plan's 2h estimate, slightly above — the tri-room mounting + the state-driven enable/disable + popover accessibility + tooltip copy push above 2h).

**Status:** Shipped code-complete (2026-04-19).

### What landed

- **`frontend/components/consultation/ModalityChangeLauncher.tsx`** (NEW) — `role="menu"` popover launcher. Fetches `GET /modality-change/state` on mount, subscribes to `postgres_changes` on `modality_change_pending_requests` (INSERT + UPDATE) and `consultation_modality_history` (INSERT) for auto-refresh + `onTransitionApplied` forwarding. Role-aware copy:
  - Patient × upgrade item: `▲ Voice — normally ₹X more` (or plain label when `pricing` prop is absent).
  - Patient × downgrade item: `▼ Text — no refund`.
  - Doctor × upgrade item: `▲ Voice — free for patient`.
  - Doctor × downgrade item: `▼ Text — auto-refund ₹X`.
- **Rate-limit guards.** Upgrade items disable when `upgradeCount >= 1` (tooltip `"Max 1 upgrade per consult used"`); downgrade items disable when `downgradeCount >= 1`. The outer button disables when **both** sides are exhausted, when `activePendingRequest` is truthy (role-aware tooltip — `"Waiting for doctor to respond"` vs `"Patient's request is pending your response"`), when state is loading / errored, or when the ladder has nothing to offer.
- **Ladder helpers.** `upgradeTargetsFor('text') = ['voice', 'video']`; `downgradeTargetsFor('voice') = ['text']`; etc. Same-modality rows never render. Base tier hides the upgrade section only when already at the top; top tier hides the downgrade section only when already at the bottom — both in the derived render path.
- **Modal routing.** Click handlers set a `{ kind, target }` discriminant; the launcher mounts the corresponding modal for the current role × direction:
  - Patient × upgrade → `<ModalityUpgradeRequestModal>` (Task 50) with `hasRemainingUpgrade = !upgradeBlocked`.
  - Patient × downgrade → `<PatientDowngradeModal>` (Task 52).
  - Doctor × upgrade → `<DoctorUpgradeInitiationModal>` (Task 51).
  - Doctor × downgrade → `<ModalityDowngradeModal>` (Task 51) with `refundAmountPaise` derived from the optional `pricing` prop (falls back to 0 when absent; backend remains authoritative for the actual refund amount).
  - System-initiated modals (`<ModalityUpgradeApprovalModal>` + `<PatientUpgradeConsentModal>`) deliberately do **not** mount here — they belong at the room wrapper's root per Task 51 / 52 doctrine (auto-open, full-screen, unaffected by launcher dismissal).
- **Accessibility.** Button exposes `aria-haspopup="menu"` + `aria-expanded`. Popover has `role="menu"` + `aria-label="Modality change options"`. Menu items have `role="menuitem"`, 48×48 min touch targets, `disabled` + `title` tooltips for the rate-limit-blocked state. Outside-click + Escape close the popover (Escape returns focus to the trigger). No focus trap — popover is a transient affordance, not a modal dialog.
- **Realtime host integration.** Launcher shares the same `postgres_changes` filters used by the Task 50/51/52 auto-open hooks; each launcher instance opens one channel (`modality-launcher:${sessionId}`) distinct from the modal hooks'. An inbox follow-up already exists (Task 51 follow-up "Realtime subscription deduplication") covering consolidation into a shared provider — this launcher compounds that debt but does not introduce new debt shape.
- **`frontend/components/consultation/ConsultationLauncher.tsx`** (EXTENDED) — doctor-side host now threads the launcher through `<LiveConsultPanel modalitySwitchSlot>` whenever `sessionId` is populated (voice fresh-create / rejoin path, and video fresh-create when the companion channel is provisioned). `patientDisplayName` is forwarded from `appointment.patient_name` for future doctor-modal personalisation. Gated on `sessionId` because the launcher's `GET /state` call is session-scoped; video rejoin paths without a companion sessionId fall back to pre-Task-54 behaviour (no launcher visible) until Plan 01's facade migration unifies sessionId plumbing across video.

### Decision 11 LOCKED observances

- **Patient sees the downgrade picker** alongside upgrade (per Notes §1 in this task). Keeps one entry-point for all modality changes.
- **Symmetric gating.** Both patient and doctor are blocked from new requests while `activePendingRequest` is truthy (tooltip differs by role, but the underlying rule is identical).
- **Price transparency.** Always show the upgrade delta when `pricing` is available; always show `"no refund"` for patient-downgrade; always show the refund amount for doctor-downgrade when computable.
- **Grey-out-not-hide** for rate-limited items — users see *why* an action is disabled.

### v1 simplifications / deferrals

- **Host-room direct mounting deferred.** Spec (§ "Host rooms") lists `<TextConsultRoom>` / `<VoiceConsultRoom>` / `<VideoRoom>` as direct integration points. v1 integrates via the existing `<LiveConsultPanel modalitySwitchSlot>` on the doctor side only (`<ConsultationLauncher>`). Rationale: rooms have heterogeneous prop surfaces and don't currently know their Supabase-JWT / role / sessionId tuple without parent threading. Mounting at the `<LiveConsultPanel>` slot level keeps rooms lean and avoids duplicating the state + Realtime wiring inside each room.
- **Patient-side integration deferred.** Patient pages (`frontend/app/consult/join/page.tsx`, `frontend/app/c/{text,voice}/[sessionId]/page.tsx`) don't currently mount `<LiveConsultPanel>`. Follow-up inbox item covers integration once the patient routes adopt the shared panel or wire launcher directly.
- **`pricing` prop threading deferred.** Launcher accepts an optional `pricing: { text, voice, video }` — when absent, delta copy degrades gracefully (`"Voice"` without `"— ₹X more"`). Follow-up inbox item covers sourcing pricing either from a session-scoped fetch or from the `GET /state` pricing block (already filed under Task 51's follow-ups).
- **`newAccessToken` still not rebroadcast.** Matches Task 50 / 51 / 52 v1 simplification — `onTransitionApplied` only receives `{ toModality }`. Host remounts the destination room via its own token mint.

### Files touched

**Frontend (new):**

- `frontend/components/consultation/ModalityChangeLauncher.tsx`

**Frontend (extend):**

- `frontend/components/consultation/ConsultationLauncher.tsx` — launcher mount in `modalitySwitchSlot` (doctor side).

**No backend changes.**

**Depends on:**

- Task 47 (hard — `GET /state` endpoint).
- Task 50 / 51 / 52 (hard — modals mounted by this launcher).
- Plan 03 `<LiveConsultPanel>` (soft — launcher mounts inside controls slot).
- Plan 04 `<TextConsultRoom>` + Plan 05 `<VoiceConsultRoom>` + existing `<VideoRoom>` (soft — host rooms).

**Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md)

---

## Acceptance criteria

### Component shape

- [ ] **`frontend/components/consultation/ModalityChangeLauncher.tsx`** (NEW). Props:
  ```tsx
  interface ModalityChangeLauncherProps {
    sessionId:        string;
    userRole:         'patient' | 'doctor';
    currentModality:  'text' | 'voice' | 'video';
    upgradeCount:     0 | 1;                          // rate-limit counter
    downgradeCount:   0 | 1;
    pricing:          {
      text:   { feePaise: number };
      voice:  { feePaise: number };
      video:  { feePaise: number };
    };
    activePendingRequest?: {                          // blocks all options if present
      id:            string;
      initiatedBy:   'patient' | 'doctor';
      kind:          'pending_doctor_approval' | 'pending_patient_consent';
      expiresAt:     string;
    };
    doctorName?:      string;                         // used by patient modals
    patientName?:     string;                         // used by doctor modals
    onTransitionApplied?: (result: { toModality: Modality; newAccessToken?: string }) => void;
  }
  ```

### Rendering — popover/menu

- [ ] **Controls-bar entry point:** a single button `[🔀 Change modality]` in the controls bar.
  - Disabled + tooltip if `upgradeCount >= 1 AND downgradeCount >= 1` — "Max modality changes used for this consult".
  - Disabled + tooltip if `activePendingRequest` is truthy — "Waiting for {patient|doctor} to respond".
  - Opens a popover/menu when clicked.
- [ ] **Popover contents** (example for a patient currently on voice):
  ```
  ┌────────────────────────────────────────────────┐
  │ Change modality                                │
  ├────────────────────────────────────────────────┤
  │                                                │
  │ Upgrade to                                     │
  │   [▲ Video — normally ₹350 more  ]             │
  │                                                │
  │ Downgrade to                                   │
  │   [▼ Text — no refund            ]             │
  │                                                │
  │ ℹ️  Max 1 upgrade + 1 downgrade per consult   │
  └────────────────────────────────────────────────┘
  ```
- [ ] Upgrade button greyed + tooltip "Max 1 upgrade per consult used" when `upgradeCount >= 1`.
- [ ] Downgrade button greyed + tooltip "Max 1 downgrade per consult used" when `downgradeCount >= 1`.
- [ ] Same-modality buttons (e.g. "Voice" when currentModality='voice') are not rendered.
- [ ] Delta price computed via pricing helper from Task 49:
  - Patient upgrade: "normally ₹{X} more" — always shown even when the doctor may grant free.
  - Patient downgrade: "no refund" — blunt disclosure.
  - Doctor upgrade: "(free for patient)" — clear signal.
  - Doctor downgrade: "(auto-refund ₹{X})" — amount the patient receives.

### Modal mounting

- [ ] Each button click opens the right modal (Task 50/51/52):
  - Patient + upgrade target → `<ModalityUpgradeRequestModal>`.
  - Patient + downgrade target → `<PatientDowngradeModal>`.
  - Doctor + upgrade target → `<DoctorUpgradeInitiationModal>`.
  - Doctor + downgrade target → `<ModalityDowngradeModal>`.
- [ ] Launcher passes required props (sessionId, pricing context, target modality, etc.).
- [ ] Modals auto-close after success + launcher re-fetches `GET /state` → `upgradeCount` / `downgradeCount` refreshed → buttons grey appropriately.

### Realtime — refresh on transition applied

- [ ] Launcher subscribes to `consultation-sessions:${sessionId}:modality-change` channel.
- [ ] On `{ kind: 'applied', toModality, newAccessToken? }` arrive:
  - Re-fetch `GET /state` to update `currentModality` + counters.
  - Fire `onTransitionApplied` prop → parent `<LiveConsultPanel>` / room wrapper swaps the room surface + access token.
- [ ] On `{ kind: 'declined' }` / `{ kind: 'timeout' }`: refetch state (no-op for `currentModality` + counter, but clears `activePendingRequest` so buttons re-enable).
- [ ] On `{ kind: 'pending_doctor_approval' | 'pending_patient_consent' }` from the other party: refetch → `activePendingRequest` populated → launcher button disables. Matches "don't let a new request start while another is pending" rule.

### Host rooms

- [ ] **`frontend/components/consultation/TextConsultRoom.tsx`** (Plan 04): render `<ModalityChangeLauncher>` in the controls bar. Both doctor + patient views.
- [ ] **`frontend/components/consultation/VoiceConsultRoom.tsx`** (Plan 05): render in controls bar. Both views.
- [ ] **`frontend/components/consultation/VideoRoom.tsx`** (existing + Plan 06 Task 38's companion panel variant): render in controls bar. Both views.
- [ ] **`frontend/components/consultation/LiveConsultPanel.tsx`** (Plan 03): extend to include `launcherSlot` or inline mount of `<ModalityChangeLauncher>` so every modality gets the same surface without duplicating wiring.
- [ ] **Positioning:** bottom-center of the controls bar, adjacent to the mic/camera/end-call buttons in video/voice; header-right in text (where there's no other controls bar). Consistent placement reduces friction.

### State fetching

- [ ] Launcher uses a React Query hook (or existing state manager) to fetch `GET /state` on mount + invalidate on every Realtime event.
- [ ] Error states: network failure renders launcher as grey "Modality change unavailable" with retry tooltip.
- [ ] Loading state: shows grey button "Loading…".

### Accessibility

- [ ] Button has `aria-haspopup="menu"`, `aria-expanded="true|false"`.
- [ ] Popover items have `role="menuitem"`.
- [ ] Keyboard navigation: Enter / Space opens popover; arrow keys navigate items; Esc closes.
- [ ] Tooltip text readable via `aria-describedby`.
- [ ] Touch targets 48×48 minimum (mobile).
- [ ] `prefers-reduced-motion` suppresses popover open/close animation.

### Host-room integration specifics

- [ ] **Text room — patient:** launcher rendered in the top-right of `<TextConsultRoom>` header alongside the "Consultation in progress" badge.
- [ ] **Text room — doctor:** same placement. Doctor additionally sees downgrade options (from text to... wait, text is the lowest modality; doctor can only UPGRADE from text). Launcher correctly hides the downgrade section when no lower modality exists.
- [ ] **Voice room — patient:** centered in the controls row, between the mic button and the end-call button.
- [ ] **Voice room — doctor:** same placement.
- [ ] **Video room — patient:** same pattern. If Plan 06 Task 38's companion panel is open, launcher stays in the video-controls row.
- [ ] **Video room — doctor:** same.

### Edge cases

- [ ] **Session ended.** If `session.status = 'completed'`, launcher is unmounted entirely (no modality change post-consult).
- [ ] **Session in `paused` recording state (Plan 07 Task 28).** Modality change proceeds normally; paused state is about recording, not about modality. Executor (Task 48) handles paused→active transitions idempotently.
- [ ] **Patient's network drops during launcher open.** React Query retries; launcher stays visible with grey "Loading…" state until reconnection.
- [ ] **Both counters at 1 simultaneously:** launcher shows disabled main button with tooltip "Max modality changes for this consult".
- [ ] **`currentModality = 'text'` (patient), no upgrade pending, no downgrade possible:** launcher renders the upgrade section only; hides downgrade section entirely.
- [ ] **`currentModality = 'video'` (patient), no upgrade possible, downgrade available:** launcher shows downgrade section only.

### Unit + component tests

- [ ] Deferred per frontend-test-harness inbox note. When bootstrapped:
  - Render launcher in all 3×2 (room × role) combinations; verify correct buttons visible.
  - `upgradeCount=1` → upgrade options greyed; tooltip shown.
  - `downgradeCount=1` → downgrade options greyed.
  - `activePendingRequest` set → whole launcher disabled.
  - Click upgrade → correct modal mounts.
  - Realtime `{ kind: 'applied' }` → re-fetch + `onTransitionApplied` fires.
  - `currentModality='text'` (no downgrade possible) → downgrade section hidden.
  - `currentModality='video'` (no upgrade possible) → upgrade section hidden.

### Type-check + lint clean

- [ ] Frontend `tsc --noEmit` exit 0. ESLint clean.

---

## Out of scope

- **Keyboard shortcut to open launcher** (e.g. Ctrl+Shift+M). v1.1 polish.
- **Visual progress indicator** ("You've used 1 of 1 upgrades" bar graph). Copy suffices.
- **In-popover pricing tooltip with all three modality fees side-by-side.** Deferred to Plan 10 UX polish.
- **Drag-and-drop modality slider.** UI pattern overkill; buttons are the right affordance.
- **"Notify me when doctor has free capacity"** queue system. Out of scope for v1.
- **Per-modality availability checks** (e.g. "video requires decent bandwidth"). Handled at room-join time, not at launcher level.
- **Multi-language launcher copy.** English only in v1.

---

## Files expected to touch

**Frontend (new):**

- `frontend/components/consultation/ModalityChangeLauncher.tsx` — launcher component.

**Frontend (extend):**

- `frontend/components/consultation/TextConsultRoom.tsx` — add launcher to header/controls.
- `frontend/components/consultation/VoiceConsultRoom.tsx` — add to controls bar.
- `frontend/components/consultation/VideoRoom.tsx` — add to controls bar.
- `frontend/components/consultation/LiveConsultPanel.tsx` — extend with `launcherSlot` or direct mount.
- `frontend/lib/api/modality-change.ts` (shared with Tasks 50/51/52) — `fetchState` wrapper.

**Tests:** deferred.

**No backend changes** in this task.

---

## Notes / open decisions

1. **Patient-downgrade accessible via launcher.** Plan line 343 says "Patient view: only upgrade picker". Re-reading: this was likely written before Task 52 was crisped. My read: symmetry is better UX — patient downgrade via the launcher means only one entry point for "change modality". Hiding patient-downgrade would require a separate surface (chat shortcut? in-room menu?) which fragments the mental model. Proposal in this task: **launcher includes downgrade option for patients too**, visually distinct from upgrade (lower section + "no refund" disclosure). If owner prefers plan-exact (upgrade-only patient picker), trivial to omit the downgrade section — but document the decision at PR time.
2. **Why popover vs. always-visible button row.** With at most 2 options visible (upgrade target + downgrade target), a flat button row is acceptable. Popover pattern keeps the controls bar less cluttered + allows richer info (price, tooltip) without taking permanent screen real estate. Trade-off: one extra click. Decision: popover for v1; revisit if friction shows up in user testing.
3. **Button placement in voice/video room controls.** Matches video-call conventions (secondary actions adjacent to primary end-call button). In text room, there are no similar controls — placing at top-right keeps visual weight balanced.
4. **Grey-out via CSS only, not conditional render.** Users benefit from seeing WHY the option is disabled (tooltip). Rendering the disabled state keeps the UI legible.
5. **Pricing display doctrine.** Always show the upgrade delta; always show "no refund" for patient-downgrade; show refund amount for doctor-downgrade. Decision 11's symmetric doctrine demands this price transparency.
6. **What if pricing is zero or unavailable?** Fallback copy: "Fee unavailable". Helper `formatInrPaise(0)` still renders "₹0". Unlikely case but defensive.
7. **Rate-limit tooltip wording.** "Max 1 upgrade per consult used — book a follow-up appointment for further changes." Matches plan line 438. The "book a follow-up" guidance closes the loop for users who want more flexibility.
8. **Launcher is always mounted** (not conditional on "might want to change modality"). Rationale: discoverability. Users who never considered changing modality shouldn't have to search for it; users who do shouldn't have to hunt.
9. **Realtime subscription sharing.** Launcher shares the `modality-change` channel subscription with Tasks 50/51/52's modals. React context pattern: `<ModalityChangeProvider>` wraps the room; all consumers (launcher + modals) share one WebSocket subscription. Avoid duplicate subscriptions hitting the Realtime quota.
10. **Mobile-specific treatment.** On very small screens (<400px), popover may render as bottom-sheet overlay rather than floating popover. Existing UI library's popover likely handles this automatically; verify at PR time.

---

## References

- **Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md) — Task 54 section lines 340–344.
- **Task 47 — `GET /state` endpoint:** [task-47-request-modality-change-state-machine.md](./task-47-request-modality-change-state-machine.md).
- **Task 50 — patient upgrade modal mounted here:** [task-50-patient-modality-upgrade-request-modal.md](./task-50-patient-modality-upgrade-request-modal.md).
- **Task 51 — doctor modals mounted here:** [task-51-doctor-modality-approval-downgrade-and-upgrade-initiation-modals.md](./task-51-doctor-modality-approval-downgrade-and-upgrade-initiation-modals.md).
- **Task 52 — patient downgrade modal mounted here:** [task-52-patient-consent-and-self-downgrade-modals.md](./task-52-patient-consent-and-self-downgrade-modals.md).
- **Plan 03 Task 20 — `<LiveConsultPanel>` host (extension point):** [task-20-consultation-launcher-and-live-panel.md](./task-20-consultation-launcher-and-live-panel.md).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Not started — entry-point UI. Ships alongside Tasks 50/51/52 in Phase B/C.
