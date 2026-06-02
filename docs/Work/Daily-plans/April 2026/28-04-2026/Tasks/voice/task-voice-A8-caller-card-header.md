# Task voice-A8: Caller-card header (replaces minimal pill)

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch A (T1 quick wins) — **S item, ~4h**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

The current `<VoiceConsultRoom>` header is a minimal pill: practice name + status. T2.10 ships a richer **caller-card header** that consolidates:

- Counterparty name + role + avatar (doctor's name + practice on patient side; patient's name on doctor side).
- Duration timer (consumes [task-voice-A1](./task-voice-A1-duration-timer.md)).
- Network bars (consumes [task-voice-A4](./task-voice-A4-network-quality-bars.md)).
- Status pill ("Live" / "Hold" / "Reconnecting…" — Hold + Reconnecting from Sub-batch B).

This is the **single source-of-truth header** for voice calls; existing pill is removed.

**Estimated time:** ~4h.

**Status:** Done.

**Depends on:** [task-voice-A1](./task-voice-A1-duration-timer.md), [task-voice-A4](./task-voice-A4-network-quality-bars.md) — soft (consumes their hooks/components).

**Source:** [T2 §T2.10](../../../../Product%20plans/voice-consult/plan-t2-voice-real-polish.md).

---

## Acceptance criteria

### `<CallerCardHeader>` component

- [x] **New component** at `frontend/components/consultation/CallerCardHeader.tsx`:
  - Props:
    - `counterparty: { name: string, role: 'doctor' | 'patient', avatarUrl?: string, practiceName?: string }`.
    - `connectedAt: Date | null`.
    - `room: Twilio.Room | null` (passes to `useNetworkQuality`).
    - `status: 'live' | 'hold' | 'reconnecting' | 'connecting'` (string-literal; Sub-batch B will add `hold` and `reconnecting` consumers).
  - Renders:
    - **Left:** avatar (44px on mobile, 56px on desktop) — falls back to initials if `avatarUrl` missing.
    - **Center:** name (large), role (small), practice name if doctor (smallest gray).
    - **Right:** status pill + duration chip + network bars stacked.
  - Status pill colors: live=green, hold=amber, reconnecting=red-pulsing, connecting=gray.
- [x] **Three-host parity:** layouts:
  - `standalone` (mobile): full-width card at top of screen, sticky.
  - `panel` (desktop split-with-chat): horizontal bar above the chat panel.
  - `canvas` (canvas fallback): centered card on the canvas overlay.

### Counterparty data source

- [x] **Doctor side**: counterparty = patient. Pull from existing patient-info hook (likely `usePatientInfo(sessionId)`); fall back to `"Patient"` if name unavailable.
- [x] **Patient side**: counterparty = doctor. Pull `practiceName` from the existing companion-token response (already returns `practiceName`); doctor display name from same source or fallback to `"Your doctor"`.
- [x] **Avatar source**: doctor avatars typically live in `doctor_settings.avatar_url`; patient avatars may not exist (use initials fallback).

### Replace existing pill

- [x] **Edit `<VoiceConsultRoom>`** — remove the existing minimal pill rendering; mount `<CallerCardHeader>` in its place.
- [x] **`mode='readonly'`** — render the card with `status='ended'` (new variant; gray pill saying "Ended"), no live duration timer (use static duration), no network bars.

### Manual smoke

- [ ] Doctor side: card shows patient's name + initials avatar + duration + bars + Live pill.
- [ ] Patient side: card shows doctor's name + practice + avatar + duration + bars + Live pill.
- [ ] Mobile + desktop layouts both render correctly without overflow.
- [ ] When B1 (reconnect) lands, status flips to "Reconnecting…" with red pulse.
- [ ] When B3 (hold) lands, status flips to "On hold" with amber.
- [ ] Readonly: gray "Ended" pill, no animations.

### General

- [x] Type-check + lint clean.
- [x] No layout shifts when the status pill changes width (use min-width).
- [x] Existing tests pass (no header-related tests likely; verify).

---

## Out of scope

- **Counterparty's network bars.** Out of scope; only own.
- **Recording-in-progress badge** in the card. Plan 07 owns; not in this batch.
- **Click-to-expand patient details** on doctor side. Out of scope; doctor uses dashboard for that.
- **Avatar upload UI.** Out of scope; reuse whatever exists.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/CallerCardHeader.tsx` — **new** (~180 LOC including responsive layout + initials fallback).
- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edit** (~25 LOC: remove pill, mount card, pass props).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Why `status` as a string-literal prop vs derived from internal state** — caller passes the status; the card just renders. Keeps the card pure and B1/B3 wire their own status into it.
2. **Avatar fallback** — initials on a colored background (hash the name to a color). No remote image fetching needed.
3. **Mobile sticky vs scrolling** — sticky. Doctor's name + duration are reference info during the call.
4. **What if the patient has no name** — use `"Patient"` literally; never expose phone number / email.
5. **B1, B3 wire `status`** — A8 ships with status constrained to `'live' | 'connecting'`; B1 adds `'reconnecting'`; B3 adds `'hold'`. Type the prop with all four from day one to avoid type-prop churn.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch A](../Plans/plan-voice-consult-selected-features.md#sub-batch-a--polished-call-5-days)
- **Source item:** [T2 §T2.10](../../../../Product%20plans/voice-consult/plan-t2-voice-real-polish.md)
- **Soft deps:** [task-voice-A1](./task-voice-A1-duration-timer.md), [task-voice-A4](./task-voice-A4-network-quality-bars.md).
- **Future status consumers:** [task-voice-B1](./task-voice-B1-reconnection-ux.md), [task-voice-B3](./task-voice-B3-hold-call.md).

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** Done (2026-05-20).
