# Task voice-C5: Crash-recovery rejoin (sessionStorage token cache + idempotent backend rejoin)



## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch C (production-grade) — **M item, ~3 days**



---



## Model & execution guidance



**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).



---



## Task overview



Browser crashes mid-call. User reopens the tab. Today: HMAC token + Twilio access token are gone (in-memory); user has to start the join flow over from scratch — and depending on auth state, may have to re-authenticate.



T5.30 caches the last-known good tokens in `sessionStorage` so that on reload, **if** within the cache window AND **NOT** kicked by C4, the tab auto-rejoins seamlessly:



1. Reload → checks sessionStorage for `call-rejoin-${sessionId}` cache (`modality: "voice"`).

2. Validates: cache exists, cache is fresh (within min(HMAC, JWT, Twilio TTLs)), tab not flagged as kicked.

3. If all good: skip pre-call lobby (A6/B2), auto-rejoin Twilio room.

4. Backend ensures the rejoin is idempotent — same tokens reused don't create a second recording / second `consultation_messages` entry.



**Coordination with C4:** if THIS tab was kicked, the cache must NOT auto-rejoin. C4 sets a sessionStorage flag; C5 honors it.



**Estimated time:** ~3 days.



**Status:** Done.



**Depends on:** [task-voice-C4](./task-voice-C4-multi-tab-kick.md) — soft (cache contract).



**Source:** [T5 §T5.30](../../../../Product%20plans/voice-consult/plan-t5-voice-reliability-safety.md).



---



## Acceptance criteria



### sessionStorage cache shape



- [x] **Key:** `call-rejoin-${sessionId}` with `modality: "voice"` (shared foundation from task-video-E4; spec's `voice-rejoin-*` alias not duplicated).

- [x] **Value:**

  ```json

  {

    "hmacToken": "<hmac>",

    "supabaseJwt": "<jwt>",

    "twilioAccessToken": "<token>",

    "cachedAt": <epoch ms>,

    "expiresAt": <min(HMAC, JWT, Twilio) epoch ms>,

    "sessionId": "...",

    "role": "doctor" | "patient"

  }

  ```

- [x] **Set on**: token mint success in the join flow.

- [x] **Cleared on**: explicit end-call (A2 confirmed end), `mode='readonly'`, or expiry.



### `useVoiceRejoinCache(sessionId)` hook



- [x] **New hook** at `frontend/hooks/useVoiceRejoinCache.ts`:

  - Returns `{ tryAutoRejoin: () => Cache | null, write: (cache) => void, clear: () => void }`.

  - `tryAutoRejoin()`:

    - Reads sessionStorage key.

    - Checks: not null, not expired, no `tab-was-kicked-${sessionId}` flag.

    - If all good: returns the cache (caller skips lobby).

    - If any check fails: returns null AND clears the cache (don't try again with a stale entry).



### Wire into the patient voice page



- [x] **Edit `frontend/app/c/voice/[sessionId]/page.tsx`**:

  - On mount, before lobby state: call `tryAutoRejoin()`.

  - If returns cache: skip directly to in-call/holding with the cached tokens.

  - If returns null: normal flow (lobby → mint → connect).

- [x] **`mode='readonly'`** — never auto-rejoin (no readonly voice join route; VoiceConsultRoom readonly mounts never call the hook).



### Doctor side



- [x] **Doctor side**: same caching strategy works. Doctor's "tokens" include the dashboard-derived Supabase session; no HMAC. Cache adapts.



### Backend idempotency



- [x] **Verify** existing backend behavior:

  - Re-using the same Twilio access token on rejoin: does it create a duplicate participant? — **likely no** (Twilio handles by `identity`); test.

  - Re-using the same patient HMAC: does it cause issues with `consultation_messages_insert_live_participants`? — **no** (RLS keys on JWT sub, not HMAC).

  - Re-issuing tokens at expiry: does the existing flow handle gracefully? — verify; flag if not.

- [x] **No backend code change expected** — `consultation-session-service.ts` is already-idempotent contract (per batch plan). Verify, don't refactor.



### Coordination with C4



- [x] **`tab-was-kicked-${sessionId}` flag respected.** Auto-rejoin is suppressed if this flag is set. Take-over flow (C4) clears the flag.

- [x] If user crashes during a kicked-state, the kicked overlay re-renders on reload (no auto-rejoin).



### Manual smoke



- [ ] Patient on call → kill browser → reopen → auto-rejoins to call within 3s, no lobby, no permission prompts.

- [ ] Patient on call → end call normally → reopen URL → cache cleared; lobby shows.

- [ ] Patient open in 2 tabs → tab1 kicked by tab2 (C4) → tab1 reload → does NOT auto-rejoin; lobby shows ("Take back over" semantic).

- [ ] Cache age > min(HMAC TTL, JWT TTL, Twilio TTL) → no auto-rejoin; mint fresh tokens.

- [ ] Doctor crash + reopen → similarly auto-rejoins.

- [ ] Backend idempotency verified: no duplicate `consultation_messages` rows; no duplicate Twilio participants.



### General



- [x] Type-check + lint clean.

- [x] No PHI in cache (cache holds tokens, not message content).

- [x] sessionStorage scoped per-tab → cross-tab cache leakage is impossible.



---



## Out of scope



- **localStorage instead of sessionStorage.** sessionStorage is correct: per-tab; clears on tab close (which is the right behavior).

- **Cross-device cache sync.** Out of scope.

- **Auto-rejoin during pre-lobby crash.** Cache only writes after first successful mint.

- **Backend refactor for idempotency.** Verify existing; don't refactor.



---



## Files expected to touch



**Frontend:**



- `frontend/hooks/useVoiceRejoinCache.ts` — **new** (~120 LOC).

- `frontend/app/c/voice/[sessionId]/page.tsx` — **edit** (~30 LOC: cache check + skip-lobby branch).

- `frontend/app/consult/join/page.tsx` — **edit if video page also uses cache** (~20 LOC). *(Already wired by task-video-E4; no change needed for C5.)*



**Backend:** none (idempotency verified, not introduced).



**Tests:**



- `frontend/hooks/__tests__/useVoiceRejoinCache.test.ts` — **new** (~60 LOC).

- Backend integration test (if missing): rejoin with same Twilio token doesn't duplicate participant.



---



## Notes / open decisions



1. **Why sessionStorage** — per-tab scope; clears on tab close (intended behavior); not synced across tabs (also intended; C4 owns multi-tab).

2. **Cache TTL** — `min(HMAC TTL, JWT TTL, Twilio TTL)` — strict. If any is shorter than expected, cache is short-lived. Acceptable; better to re-mint than to use stale.

3. **Crash detection** — there's no explicit "crash" signal; we just detect on next page load whether a cache exists. If the user navigated away cleanly, the cache is cleared. If they crashed, the cache survives (sessionStorage outlives JS state in modern browsers within tab lifetime).

4. **Backend idempotency assumption** — per batch plan, "T5.30 already-idempotent contract; no functional change". Verify in smoke; if false, escalate.

5. **C4 kick flag** — must read before auto-rejoin. Single sessionStorage check.

6. **Implementation note (2026-05-20):** Voice C5 reuses the modality-agnostic `useCallRejoinCache` foundation from task-video-E4 via a thin `useVoiceRejoinCache` wrapper. Storage key is `call-rejoin-${sessionId}` with `modality: "voice"` gate at read time.



---



## References



- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch C](../Plans/plan-voice-consult-selected-features.md#sub-batch-c--production-grade-17-days)

- **Source item:** [T5 §T5.30](../../../../Product%20plans/voice-consult/plan-t5-voice-reliability-safety.md)

- **Coordinated:** [task-voice-C4](./task-voice-C4-multi-tab-kick.md) (kick flag contract).



---



**Owner:** TBD

**Created:** 2026-04-29

**Status:** Done.


