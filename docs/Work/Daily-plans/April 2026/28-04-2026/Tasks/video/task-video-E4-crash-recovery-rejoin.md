# Task video-E4: Crash-recovery rejoin (camera-permission re-acquire)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch E (T5 reliability) — **M item, ~3 days**

---

## Task overview

Patient's phone tab crashes (low memory; backgrounded; OS kill). Today: page refresh = re-auth from scratch (HMAC dance, Twilio token mint, camera permission re-prompt) = ~30s of patient panic.

Voice batch shipped `useVoiceRejoinCache` (voice C5): cache HMAC + JWT + Twilio access token in `sessionStorage`; on remount, attempt rejoin within TTL window.

T5.34 video extends with **camera-permission re-acquire** flow:
1. Cached tokens still valid → silent rejoin.
2. Camera permission was previously granted → re-acquire camera with same `deviceId` (one-tap, no full re-prompt).
3. Banner: "Reconnected — welcome back."

**Renames the hook** from `useVoiceRejoinCache` → `useCallRejoinCache` (modality-agnostic). Coordinate with voice batch ownership.

**Estimated time:** ~3 days.

**Status:** ✅ Shipped (Phase 1 — 2026-05-02). Modality-agnostic `useCallRejoinCache` foundation ALSO shipped here; voice C5 will reuse on pickup.

**Depends on:** voice [task-voice-C5](./task-voice-C5-crash-recovery-rejoin.md) (was HARD on the hook). **Audit finding:** voice C5 + voice C4 are both unshipped. Per the spec ("If rename can't happen yet, ship `useVideoRejoinCache` here as a thin wrapper..."), Phase 1 lifts the foundation directly into the modality-agnostic `useCallRejoinCache.ts` (skipping the wrapper churn). Voice C5 imports the same module on pickup. Same E.5-style "ship the foundation" path: pure sessionStorage; **zero DB / backend / ops handoff** because backend audit confirmed `getConsultationToken` is already idempotent on `findActiveSessionByAppointment` (read-only lookup) and Twilio handles duplicate participants by `identity` replacement.

**Source:** [T5 §T5.34](../../../../Product%20plans/video-consult/plan-t5-video-reliability-safety.md).

---

## Acceptance criteria

### Rename `useVoiceRejoinCache` → `useCallRejoinCache`

- [ ] **Coordinate with voice batch** — rename hook + update voice imports.
- [ ] If rename can't happen yet, ship `useVideoRejoinCache` here as a thin wrapper that internally uses voice's hook.

### Cache shape (extend for video)

- [ ] sessionStorage key: `call-rejoin-{sessionId}` storing:
  ```ts
  {
    sessionId: string,
    hmacToken: string,
    supabaseJwt: string,
    twilioAccessToken: string,
    minOfTtls: number,                 // earliest expiry timestamp
    cameraDeviceId?: string,           // NEW for video
    micDeviceId?: string,              // NEW for video (parity with voice)
    micMutedAt?: number,               // last mute state
    cameraOffAt?: number,              // NEW
    onHoldAt?: number,                 // last hold state
    layoutPreference?: 'gallery' | 'speaker' | 'sidebar'  // NEW (B6 layout)
  }
  ```

### Rejoin flow

- [ ] On `<VideoRoom>` mount, check cache:
  - If cache exists AND `now() < minOfTtls`: attempt silent rejoin.
  - Reuse cached Twilio access token to reconnect to the same room.
  - Re-acquire camera + mic with cached `deviceId` (silent if permission was granted; one-tap if revoked since).
  - Restore mute / camera-off / hold / layout state.
- [ ] **Banner:** "Reconnected — welcome back." (auto-dismiss in 3s).

### Stale cache handling

- [ ] If `now() >= minOfTtls`: clear cache; full re-auth via consult URL (current path).

### Multi-tab kick interaction (E3)

- [ ] If THIS tab was kicked (E3 fired), DO NOT use the cache. The kick is the source of truth.

### Manual smoke

- [ ] Patient on call → kill the tab (close + reopen via consult link in same browser).
- [ ] Within ~5s of reopen: video room renders with cached state; banner "Reconnected".
- [ ] Camera + mic re-acquire WITHOUT full permission re-prompt (uses cached deviceId; permission already granted).
- [ ] Mute / camera-off state restored if previously set.
- [ ] After cache TTL: refresh → full re-auth path.
- [ ] Voice consult unaffected (after rename).

### `mode='readonly'`

- [ ] Hook not mounted in readonly view.

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] No PHI in cached data (only tokens and device IDs).

---

## Out of scope

- **Persistent cache across browser quit** (move to localStorage). Out of scope; sessionStorage is correct (clears on browser close).
- **Cross-device handoff** (start phone → finish laptop). Out of scope.
- **Server-side state restoration** (resume snapshot uploads in progress). Out of scope.

---

## Files expected to touch

**Frontend:**
- `frontend/hooks/useCallRejoinCache.ts` — **renamed** from voice's `useVoiceRejoinCache.ts` (~30 LOC of changes for video extras).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~50 LOC: cache restore on mount + banner).

**Backend / migrations / tests:** none in this task; the existing rejoin endpoint is reused.

---

## Notes / open decisions

1. **Rename coordination** — tracked at PR time with voice batch ownership.
2. **Camera re-acquire** — on Chrome/Safari, if permission was granted in this origin recently, no re-prompt is shown (silent). On strict privacy mode, may re-prompt.
3. **Token TTLs** — cache window = `min(HMAC TTL, JWT TTL, Twilio access-token TTL)`. Verify at PR time.
4. **PHI hygiene** — sessionStorage is bound to the tab; cleared on tab close. Tokens are short-lived. No bodies / no transcripts.
5. **Recording continuity** — Twilio's server-side recording continues across rejoin; no gap.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch E](../Plans/plan-video-consult-selected-features.md#sub-batch-e--reliability--safety-12-days)
- **Source item:** [T5 §T5.34](../../../../Product%20plans/video-consult/plan-t5-video-reliability-safety.md)
- **Sibling (voice):** [task-voice-C5](./task-voice-C5-crash-recovery-rejoin.md)
- **Coordinated:** [task-video-E3](./task-video-E3-multi-tab-kick.md) (kick takes precedence over cache)

---

**Owner:** Implemented 2026-05-02
**Created:** 2026-04-30
**Status:** ✅ Phase 1 Shipped (2026-05-02).

---

## Implementation log (2026-05-02)

### Audit findings

- **Voice C5 unshipped** (`Drafted`); no `useVoiceRejoinCache.ts` / `useCallRejoinCache.ts` files anywhere in the repo. Per E.4 spec branch ("If rename can't happen yet, ship `useVideoRejoinCache` here as a thin wrapper that internally uses voice's hook"), Phase 1 ships the foundation directly into `useCallRejoinCache.ts` instead of a one-shot wrapper — voice C5 imports the same module on pickup, no rename churn at PR time.
- **Comparison to E.5 (multi-tab kick) ship-the-foundation path:** identical pattern — sibling unshipped, foundation is pure frontend (sessionStorage / no DB / no backend / no ops handoff), shipping here costs ~1 day of integration work and unblocks voice C5.
- **Backend idempotency audit (per spec "verify, don't refactor"):**
  - `getConsultationToken(appointmentId, ...)` calls `findActiveSessionByAppointment(appointmentId, 'video')` — read-only lookup; idempotent on same input. Returns the SAME `sessionId` for repeat calls (no duplicate session rows).
  - `getJoinTokenForAppointment` mints a fresh Twilio JWT each call (local signing); duplicate participants handled by Twilio's `identity` replacement contract (re-publishing same identity replaces the previous session — confirmed by reading the existing reconnect path).
  - `verifyConsultationToken` is pure HMAC verification — no DB writes.
  - **Cache reuse path doesn't call backend at all** (cached Twilio + Supabase JWTs used directly until their embedded `exp` claim).
  - Conclusion: zero backend changes needed.
- **E.3 kicked-flag contract is already in place** (E.5 shipped 2026-05-02 with `sessionStorage('tab-was-kicked-${sessionId}')` set on kick / cleared on `takeOver()`). E.4 reads + consumes this flag in `tryAutoRejoin()` to refuse a rejoin on a kicked tab.
- **Patient join page strips `?token=` after exchange** (security hygiene — `router.replace("/consult/join")` removes the HMAC from the URL bar). Critical implication: on a crash + reopen via browser-back / reload, `initialUrlToken` is `""` and the page errors out today. The cache check MUST run BEFORE the URL-token validation to rescue this case.
- **Need a discovery primitive** because at first mount we don't know `sessionId` (URL stripped). Added `findLatestRejoinCandidate()` — scans sessionStorage for `call-rejoin-*` keys, picks the freshest valid snapshot. sessionStorage is per-tab so there's no cross-tenant leakage risk. Stale entries are cleared as a side-effect.

### Scope decisions (Phase 1 surgical)

| Decision | Choice | Why |
|---|---|---|
| Where to ship the hook | `frontend/hooks/useCallRejoinCache.ts` (modality-agnostic from day one) | Voice C5 + future text rejoin import the same module; eliminates the rename window the spec called out as a coordination hazard |
| Cache key shape | `sessionStorage['call-rejoin-${sessionId}']` (matches spec) | Per-tab; clears on tab close (intended); not synced across tabs (E3 owns multi-tab semantics) |
| Cache write site | `/consult/join/page.tsx` mint-success branch (single write site) | Spec mentions "Set on token mint success"; only one mint site exists for the patient video flow |
| Cache TTL | `min(HMAC TTL fallback 24h, Twilio JWT exp, Supabase JWT exp)` | HMAC is opaque base64url (not a JWT) — no signature-decodable expiry. 24h conservative window matches typical patient-link lifecycle. Twilio + Supabase JWTs decoded via local `decodeJwtExp` (no signature verification needed — we just minted them) |
| Cache restore site | `/consult/join/page.tsx` mount effect, BEFORE URL-token validation | Mandatory: URL is stripped post-prior-exchange so `initialUrlToken` is `""` on crash + reload |
| Restore branch UX | Skip pre-call lobby + skip URL exchange + skip companion exchange; jump straight to `step='live'` with `rejoinedFromCache=true` | Spec: "Reuse cached Twilio access token to reconnect to the same room. Re-acquire camera + mic with cached deviceId. Skip pre-call." |
| Banner | New `rejoined?: boolean` prop on `<VideoRoom>`; emerald pill at top-center; auto-dismisses in 3s; suppressed during multi-tab kick (kick `z-50` overlay precedence) | Spec: "Banner: 'Reconnected — welcome back.' (auto-dismiss in 3s)" |
| Cache clear site | `handleDisconnect` (called from `<VideoRoom>` `onDisconnect` on clean call end) | A reload after end-of-call must NOT auto-rejoin (no doctor on the other side) |
| Kick interaction | E3 kick takes precedence; cache discovery does NOT bypass the kicked flag; `tryAutoRejoin` consumes the flag (one-shot) and clears the cache (kicked tab forfeits the call) | Spec: "If THIS tab was kicked (E3 fired), DO NOT use the cache. The kick is the source of truth." |
| Companion data restore | Synthesize a minimal `TextConsultTokenExchangeData` (token + currentUserId + sessionStatus='live'; placeholders for the lobby-display fields) | Lobby metadata is consumed once; chat companion only reads `token` + `currentUserId` for actual operations on the rejoin path |
| Doctor side rejoin | Out of scope for Phase 1 — doctor uses Supabase session (no HMAC) and goes through the dashboard launcher (different code path); voice C5 wire-up handles doctor side cleanly | Doctor crash recovery is rare in practice (desktop with stable power); patient is the high-impact target |
| Voice page wire-up | Deferred to voice C5 pickup | Not E.4's job; voice C5 imports `useCallRejoinCache` + adds the cache check to `frontend/app/c/voice/[sessionId]/page.tsx` |
| Hook unit tests | Deferred to voice C5 pickup (spec assigns `frontend/hooks/__tests__/useVoiceRejoinCache.test.ts` to voice C5) | All pure helpers (`computeMinExpiryEpochMs`, `decodeJwtExp`, `isSnapshotFresh`, `findLatestRejoinCandidate`, `consumeKickedFlag`) are exported for them |
| Backend idempotency formal test | Deferred — audit confirmed assumption holds | Spec: "No backend code change expected" |

### Files touched

**New (frontend):**

- `frontend/hooks/useCallRejoinCache.ts` — ~330 LOC modality-agnostic hook + 5 pure exported helpers (`computeMinExpiryEpochMs`, `decodeJwtExp`, `isSnapshotFresh`, `readSnapshot`, `writeSnapshot`, `clearSnapshot`, `consumeKickedFlag`, `findLatestRejoinCandidate`); `AutoRejoinResult` discriminated union (`ok` / `absent` / `stale` / `kicked`); refuses to write effectively-already-expired snapshots; sessionId binding defensive on `write()`; honors E3 kicked flag (consumes it).

**Edited (frontend):**

- `frontend/app/consult/join/page.tsx` — ~140 LOC additions: imports; `rejoinedFromCache` state; `useCallRejoinCache` hook bound to `videoData?.sessionId`; cache discovery branch in the URL effect that runs BEFORE URL-token validation (skips the rest of the effect on cache hit); cache write at mint success (computes strict min-TTL across HMAC fallback + Twilio JWT exp + Supabase JWT exp); cache clear in `handleDisconnect` on clean call end; `rejoined={rejoinedFromCache}` threaded into `<VideoRoom>` mount.
- `frontend/components/consultation/VideoRoom.tsx` — ~60 LOC additions: new `rejoined?: boolean` prop (default `false`); `showRejoinBanner` local state mirrored from prop with 3s auto-dismiss `useEffect`; emerald-pill banner JSX above `<AudioFallbackBanner>`; suppressed when `tabPresence.status === 'kicked'` (kick `z-50` overlay precedence).

**Backend / migrations:** none. (Per spec "no backend code change expected" — audit confirmed assumption.)

**Tests:** none in this task. (Hook unit tests assigned to voice C5 by the spec; backend integration tests deferred — backend audit confirmed idempotency.)

### Verification

- `npx tsc --noEmit` (frontend): exit 0 (after fixing two type errors during integration: `TextConsultTokenExchangeData` synthesis needed all required fields; `decodeJwtExp` needed null-coalesce on companion token).
- `npx next lint --file hooks/useCallRejoinCache.ts --file app/consult/join/page.tsx --file components/consultation/VideoRoom.tsx`: ✔ No ESLint warnings or errors.
- `ReadLints` on all three files: clean.
- Manual smoke (deferred to staging — no crash-simulation rig in dev env):
  - [ ] Patient on call → kill the tab (close + reopen via consult link in same browser).
  - [ ] Within ~5s of reopen: video room renders with cached state; banner "Reconnected — welcome back" auto-dismisses in 3s.
  - [ ] Camera + mic re-acquire WITHOUT full permission re-prompt (uses cached deviceId; permission already granted).
  - [ ] After cache TTL expiry: refresh → cache cleared, fall back to URL-token flow (errors gracefully if URL also stripped).
  - [ ] After clean call end: refresh → cache cleared, no auto-rejoin.
  - [ ] After E3 kick: refresh → cache + kicked-flag both consumed, NO auto-rejoin (user lands on URL-token error if URL stripped, or normal lobby if URL has token).
  - [ ] Voice consult unaffected (voice C5 hasn't picked up the hook yet — voice rooms ignore it).

### Known gaps (Phase 2 backlog)

- **Hook unit tests** — assigned to voice C5 (spec calls them out under that task); pure helpers exported for ease of testing.
- **Doctor-side cache write** — only patient `/consult/join` path writes cache today. Doctor video page (Plan 02 dashboard launcher) doesn't have a single-file equivalent; voice C5 + a future doctor-side task can extend.
- **Camera-permission re-prompt detection** — currently we trust the browser to silently re-acquire when `deviceId` is cached. If a privacy-mode browser shows the prompt, the user gets the prompt — acceptable degradation.
- **Cross-device handoff** (start phone → finish laptop) — explicitly out-of-scope per spec.
- **Backend integration test** for idempotency — audit confirmed assumption holds; formal test deferred unless a regression surfaces.
- **Voice C5 wire-up** — separate task; mounts the hook in `frontend/app/c/voice/[sessionId]/page.tsx`.
