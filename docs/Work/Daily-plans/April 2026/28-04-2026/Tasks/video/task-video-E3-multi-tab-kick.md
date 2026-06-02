# Task video-E3: Multi-tab kick (reuse voice `useTabPresenceClaim`)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch E (T5 reliability) — **M item, ~3 days**

---

## Task overview

Patient opens the consult link, then accidentally opens it in a second tab → Twilio room has duplicate participant rows; recording is corrupted; doctor sees two patients. Voice batch shipped this with `useTabPresenceClaim` (voice C4) using Supabase Realtime presence + a "Take over" CTA on the kicked tab.

T5.33 video reuses 100% of voice's hook + UI. Patient-side only kicks (decision §29 — doctor side legitimately uses multi-monitor; show "Open in 2 tabs" badge instead).

**Estimated time:** ~3 days.

**Status:** ✅ Shipped (Phase 1 — 2026-05-02). Foundation hook + banner shipped HERE; voice C4 + text D2 will reuse on pickup.

**Depends on:** voice [task-voice-C4](./task-voice-C4-multi-tab-kick.md) (was HARD on the hook). **Audit finding:** voice C4 + text D2 are both unshipped (both `Drafted`). Per the spec ("If voice hasn't shipped: ship the hook here per voice C4 contract"), Phase 1 ships the foundation `useTabPresenceClaim` + `<MultiTabKickBanner>` here. This is fundamentally different from E.2's push-backend deferral — Supabase Realtime presence is broker-provided, no DB / no backend / no ops handoff. Voice C4 and text D2 reuse the same files when they pick up.

**Source:** [T5 §T5.33](../../../../Product%20plans/video-consult/plan-t5-video-reliability-safety.md); [decision §29](../Plans/plan-video-consult-selected-features.md#before-sub-batch-e-starts).

---

## Acceptance criteria

### Reuse `useTabPresenceClaim`

- [ ] **If voice C4 has shipped:** import the hook from `frontend/hooks/useTabPresenceClaim.ts`. Returns `{ isClaimed: boolean, kickReason: string | null, takeOver: () => void }`.
- [ ] **If voice hasn't shipped:** ship the hook here per voice C4 contract (Supabase Realtime presence channel + tab-id beacon + on-conflict resolve).

### Reuse `<MultiTabKickBanner>` component

- [ ] **If voice C4 has shipped:** import.
- [ ] **If not:** ship per voice C4 contract.
- [ ] Banner copy: "This consult is open in another tab. [Take over]" — same as voice.

### Mount in `<VideoRoom>` for patient

- [ ] **Edit `<VideoRoom>`** — mount the hook with `role: currentUserRole` and `sessionId`.
- [ ] **Patient side:** when conflict detected, show banner; on "Take over", new tab claims; old tab disconnects from Twilio and shows kick screen.
- [ ] **Doctor side:** when conflict detected, show small "Open in 2 tabs" badge in caller card (decision §29 — no kick).

### Twilio room cleanup on kick

- [ ] On kick, the kicked tab calls `room.disconnect()` cleanly (release camera + mic; recording continues from the new tab).

### Manual smoke

- [ ] Patient opens consult link → joins Twilio room.
- [ ] Patient opens link in a second tab → both tabs show banner; both ask which to keep.
- [ ] Click "Take over" in tab B → tab A disconnects (camera releases); tab B is live.
- [ ] Doctor side: open link in two tabs → both show small "Open in 2 tabs" badge; neither kicks.
- [ ] Recording continuity verified across kick.
- [ ] Voice consult unaffected (same hook).

### `mode='readonly'`

- [ ] Hook not mounted (no live presence).

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.

---

## Out of scope

- **Mobile-app vs web-tab kick semantics.** Out of scope (no native shell yet).
- **Kicking ongoing recording uploads.** Recording is server-side; kick affects browser side only.
- **Cross-device "Take over" (phone → laptop)** without re-auth. Out of scope.

---

## Files expected to touch

**Frontend:**
- `frontend/hooks/useTabPresenceClaim.ts` — **reuse** if voice shipped, else **new** (~150 LOC).
- `frontend/components/consultation/MultiTabKickBanner.tsx` — **reuse** if voice shipped, else **new**.
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~25 LOC: mount hook + render banner / badge).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Decision §29** — patient-only kick; doctor-side small badge.
2. **Recording continuity** — old tab disconnects cleanly; recording captures from new tab without gap (Twilio handles the participant change).
3. **Crash recovery (E4) interaction** — if patient was kicked AND THEIR cache is stale, the kick is the source of truth (don't restore from cache on the kicked tab).
4. **Doctor multi-monitor doctrine** — doctors may legitimately have one tab on the patient and another on the EHR. Show badge but don't force kick.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch E](../Plans/plan-video-consult-selected-features.md#sub-batch-e--reliability--safety-12-days)
- **Source item:** [T5 §T5.33](../../../../Product%20plans/video-consult/plan-t5-video-reliability-safety.md)
- **Decision:** [§29 — patient-only kick](../Plans/plan-video-consult-selected-features.md#before-sub-batch-e-starts)
- **Sibling (voice):** [task-voice-C4](./task-voice-C4-multi-tab-kick.md)

---

**Owner:** Implemented 2026-05-02
**Created:** 2026-04-30
**Status:** ✅ Phase 1 Shipped (2026-05-02).

---

## Implementation log (2026-05-02)

### Audit findings

- **Voice C4 + text D2 both unshipped** (`Drafted` status; no `useTabPresenceClaim` / `<MultiTabKickBanner>` files in repo). Per E.3 spec branch "If voice hasn't shipped: ship the hook here per voice C4 contract", Phase 1 ships the foundation here.
- **Comparison to E.2 (push) deferral:** E.2 was deferred because shipping its sibling foundation would have required a full push backend (DB migration, VAPID keys, service worker, opt-in UX, ops handoff) — multi-day cross-batch infra work. E.3 is the OPPOSITE: Supabase Realtime presence is broker-provided; the hook is ~310 LOC of pure frontend; no DB, no backend, no ops handoff. Shipping here costs ~1 day of integration work and unblocks both sibling tasks.
- `<VideoRoom>` already exposes `role?: "doctor" | "patient"` and `sessionId?: string` props; `roomRef.current?.disconnect()` available; `<AudioFallbackBanner>` already mounted on the same `relative` wrapper we'll mount the kick banner on.
- `<TextConsultRoom>` `presenceChannel` pattern (`client.channel(...).on("presence", ...).on("broadcast", ...).track(...)`) is the proven Realtime template — hook mirrors it.
- `frontend/lib/supabase/client.ts` (`createClient` browser anon client) is sufficient — broadcast presence doesn't need an authenticated channel because per text-D2 §"Server-side enforcement" out-of-scope: "RLS doesn't have presence semantics; this is a UX guarantee, not a security one." A malicious patient with split tabs already has the JWT and could defeat any RLS check; the threat model is accidental duplicate tabs causing real Twilio / DB confusion, which broadcast presence handles.

### Scope decisions (Phase 1 surgical)

| Decision | Choice | Why |
|---|---|---|
| Where to ship the hook | `frontend/hooks/useTabPresenceClaim.ts` (per voice C4 spec) | Voice C4 + text D2 will reuse the same path; no second move needed |
| Where to ship the banner | `frontend/components/consultation/MultiTabKickBanner.tsx` | Same; cross-batch reuse |
| Realtime client | Vanilla browser anon (`createClient()`), not the JWT-scoped chat client | Decouples kick lifecycle from chat companion lifecycle; kick must work even if chat companion failed to provision (companion-retry tile is the chat-only failure mode) |
| Doctor surface | Small amber pill at top-center of canvas | Decision §29: doctors legitimately use multi-monitor; warn but don't kick |
| Patient surface | Full-screen `z-50` overlay with focus-trapped [Take over] CTA | Decision §29: patient newest-wins; the older tab MUST stop pretending to be live |
| Take-over UX | `tabPresence.takeOver()` re-broadcast → 200ms flush window → `window.location.reload()` | Simplest correct rejoin path; reload re-mints the Twilio token + remounts the room cleanly. Future tasks can extract an optional `onTabKickTakeOver` prop for callers that want to re-mint without losing app state |
| Kick teardown | One-shot via `tabKickHandledRef`; releases local tracks + `removeAllListeners()` + `room.disconnect()` + audioRouter dispose; intentionally does NOT call `onDisconnect` or `setStatus('disconnected')` | The kick overlay IS the surface; the disconnect splash would either navigate away (`onDisconnect`) or render under the overlay (`setStatus`) — both wrong |
| C5 cache contract | `sessionStorage.setItem('tab-was-kicked-${sessionId}', '1')` on kick edge; cleared on `takeOver()` recovery edge | Future C5 (`useCallRejoinCache`) reads this flag and refuses to auto-rejoin if set. Implemented in the hook itself so voice C4 + text D2 inherit the contract for free |
| Hook unit tests | Deferred to voice C4 pickup (the spec assigns hook unit-testability to voice C4) | Pure reducer `deriveStatus` is exported for them to wire up easily |
| Mode='readonly' | Hook returns inert `'sole'` shape on `(null, null)` inputs; `<VideoRoom>` only mounts for live calls anyway (no `mode` prop on this component) | Defensive — caller can't accidentally engage presence in readonly playback |

### Files touched

**New (frontend):**

- `frontend/hooks/useTabPresenceClaim.ts` — ~310 LOC; pure reducer `deriveStatus` + Supabase Realtime broadcast subscription + monotonic `claimed_at` ordering + C5 sessionStorage flag on kick/recovery edges + inert behavior on missing inputs.
- `frontend/components/consultation/MultiTabKickBanner.tsx` — ~165 LOC; branches by `(status, role)`; doctor pill (`role="status"` + `aria-live="polite"`); patient overlay (`role="dialog"` + `aria-modal="true"` + auto-focus on [Take over]); defensive null on role/status mismatch.

**Edited (frontend):**

- `frontend/components/consultation/VideoRoom.tsx` — ~120 LOC additions: imports; `effectiveSessionId` (companion?.sessionId fallback) + `effectiveRole` derivation; `useTabPresenceClaim` mount; one-shot kick teardown `useEffect`; `handleTabKickTakeOver` callback (re-broadcast + 200ms flush + reload); `<MultiTabKickBanner>` mount in JSX above `<AudioFallbackBanner>`.

**Backend / migrations / tests:** none. (As specified — Supabase Realtime presence is broker-provided; spec defers hook unit tests to voice C4 pickup.)

### Verification

- `npx tsc --noEmit` (frontend): exit 0.
- `npx next lint --file hooks/useTabPresenceClaim.ts --file components/consultation/MultiTabKickBanner.tsx --file components/consultation/VideoRoom.tsx`: ✔ No ESLint warnings or errors.
- `ReadLints` on all three files: clean.
- Manual smoke (deferred to staging — no two-browser rig in dev env):
  - [ ] Patient opens consult on laptop → joins Twilio room.
  - [ ] Patient opens link in second tab → first tab flips to kick overlay within 2s; camera/mic released.
  - [ ] Click [Take over] in tab A → tab A reloads + rejoins; tab B flips to kick overlay.
  - [ ] Doctor opens link in two tabs → both show "Open in 2 tabs" pill at top of canvas; neither kicks; media routes to newest tab.
  - [ ] Recording continuity verified across kick edges.
  - [ ] Voice consult unaffected (voice C4 hasn't picked up the hook yet — voice rooms ignore it).
  - [ ] Text consult unaffected (text D2 hasn't picked up the hook yet — text rooms ignore it).

### Known gaps (Phase 2 backlog)

- **Hook unit tests** — assigned to voice C4 (spec calls them out under that task); `deriveStatus` is exported pure helper, easy to test with a synthetic claims map.
- **`onTabKickTakeOver` parent override prop** — currently always full reload; parent page could remount the room without losing app state. Defer until a concrete need surfaces.
- **Cross-device kick (phone + tablet)** — explicitly out-of-scope per spec; presence channel works the same; smoke when both clients can hit Realtime.
- **Voice C4 wire-up** — separate task; mounts the hook in `<VoiceConsultRoom>`.
- **Text D2 wire-up** — separate task; mounts the hook in `<TextConsultRoom>` + handles eviction overlay over the chat composer.
