# Task voice-C4: Multi-tab / multi-device kick (Supabase Realtime presence)

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch C (production-grade) — **M item, ~3 days**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

A user opens the same call session in two browser tabs (or a tab + a phone). Twilio media-server semantics get confused; recording can split; mute/hold state goes inconsistent. T5.29 fixes this with **newest-wins kick semantics** via Supabase Realtime presence:

1. Each tab joining a session broadcasts a presence claim with its `tab_id` + `joined_at`.
2. When a newer tab claims, all older tabs are **kicked** — call ends locally, banner shows "Opened in another window. This window has been disconnected."
3. **Decision §10:** kick has explicit confirm UX on the kicked tab — they get a "Click to take back over" button.

**Multi-tab semantics differ by role (decision §22 inheritance from text batch):**

- **Patient: kick.** Patients legitimately have one device.
- **Doctor: warn but DON'T kick** — doctors use multi-monitor setups. Show a small "Open in 2 tabs" badge (cross-batch consistency with text-consult D2).

Coordination with [task-voice-C5](./task-voice-C5-crash-recovery-rejoin.md) — the rejoin cache must respect kick (if THIS tab was kicked, don't auto-rejoin from cache).

**Estimated time:** ~3 days.

**Status:** Done.

**Depends on:** nothing hard. Coordinate with C5.

**Source:** [T5 §T5.29](../../../../Product%20plans/voice-consult/plan-t5-voice-reliability-safety.md); [decision §10](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-c-starts).

---

## Acceptance criteria

### `useTabPresenceClaim(sessionId, role)` hook

- [x] **New hook** at `frontend/hooks/useTabPresenceClaim.ts` (similar shape to text consult D2's hook; consider extracting shared if both batches in flight):
  - Generates `tab_id = crypto.randomUUID()` on mount.
  - Joins a Supabase Realtime channel `consult-tab-presence-${sessionId}` with payload `{ tab_id, role, joined_at: Date.now() }`.
  - Watches presence-state changes:
    - **If role === 'patient'** AND another `tab_id` for same `role` has `joined_at > self.joined_at`: this tab is kicked.
    - **If role === 'doctor'** AND another doctor tab is present: surface a "open in 2 tabs" banner; do NOT kick.
  - Returns `{ status: 'sole' | 'multi-tab-warned' | 'kicked', otherTabsCount: number, takeOver: () => void }`.
  - `takeOver()` (kicked tab) — re-broadcasts a fresh claim with new `joined_at = Date.now()`; flips the OTHER tab into kicked state. Used by the "Click to take back over" button.

### `<MultiTabKickBanner>` component

- [x] **New component** at `frontend/components/consultation/MultiTabKickBanner.tsx`:
  - Props: `status`, `otherTabsCount`, `onTakeOver`.
  - Renders:
    - `'sole'` → null.
    - `'multi-tab-warned'` (doctor) → small bar at top: "Open in N tabs. Audio routes to the most-recent tab."
    - `'kicked'` (patient) → full-screen overlay: "Opened in another window. This window has been disconnected. [Take back over]" — clicking calls `onTakeOver`.

### Wire into `<VoiceConsultRoom>`

- [x] **Edit** to mount the banner; on transitioning to `'kicked'`:
  - Twilio room `disconnect()` immediately.
  - Mute outputs (defensive).
  - Mark the session as kicked in sessionStorage (so C5 crash-recovery doesn't auto-rejoin — see C5 contract).
- [x] On `'sole'` from kicked: nothing automatic — user clicks `[Take back over]` if they want.

### Coordination with C5 (crash-recovery)

- [x] **Cache invariant:** if `useTabPresenceClaim` reports `'kicked'`, the C5 cache must NOT be reused by THIS tab on rejoin. C5 reads a "this tab was kicked" flag (via sessionStorage `tab-was-kicked-${sessionId}`) and refuses to auto-rejoin if set. Take-over flow clears the flag.

### Manual smoke

- [ ] Patient opens same session in 2 tabs → second tab works; first tab gets full-screen kick overlay.
- [ ] Click `[Take back over]` on kicked tab → flips: kicked tab takes over; other tab becomes kicked.
- [ ] Doctor opens same session in 2 tabs → both work; both see "Open in 2 tabs" badge; no kick.
- [ ] Tab that was kicked + browser refreshed → C5 does NOT auto-rejoin from cache; user must explicitly rejoin.
- [ ] Network blip → presence channel reconnects; status normalizes within 5s.

### General

- [x] Type-check + lint clean.
- [ ] No console errors.
- [x] Hook unit-testable with mocked Supabase Realtime.

---

## Out of scope

- **Cross-device kick** (patient on phone + tablet). Same logic applies if both speak Realtime; verify in smoke.
- **Per-call lock** (patient can never open this session again from any device). Out of scope; too aggressive.
- **Kick reason audit** — out of scope; presence channel is ephemeral.

---

## Files expected to touch

**Frontend:**

- `frontend/hooks/useTabPresenceClaim.ts` — **new** (~150 LOC; or extracted shared with text D2 if available).
- `frontend/components/consultation/MultiTabKickBanner.tsx` — **new** (~100 LOC).
- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edit** (~30 LOC: hook mount + banner + Twilio disconnect on kick).

**Backend / migrations:** none (Supabase Realtime presence is broker-provided).

**Tests:** smoke + hook unit test.

---

## Notes / open decisions

1. **Decision §10 LOCKED** — newest wins, but kicked tab gets explicit "Take back over" confirm to prevent accidental ping-pong.
2. **Why role-asymmetric** — patient/doctor multi-tab semantics differ in legitimate use; cross-batch consistency with text-consult D2.
3. **Presence channel** — separate from voice/chat channels; lightweight ephemeral state.
4. **C5 cache contract** — kicked tabs must not auto-rejoin. Use sessionStorage flag.
5. **`useTabPresenceClaim` shared with text** — if text D2 ships first, refactor to a single shared hook. If voice C4 ships first, write the hook generic enough that text D2 reuses.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch C](../Plans/plan-voice-consult-selected-features.md#sub-batch-c--production-grade-17-days)
- **Source item:** [T5 §T5.29](../../../../Product%20plans/voice-consult/plan-t5-voice-reliability-safety.md)
- **Decision:** [§10 — newest wins + confirm](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-c-starts)
- **Cross-batch share:** [task-text-D2](./task-text-D2-multi-tab-kick.md) (same hook).
- **Coordinated:** [task-voice-C5](./task-voice-C5-crash-recovery-rejoin.md) (cache contract).

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** Done.
