# Task voice-0B: Wire patient-side video page to the companion-chat exchange

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch 0 (P0 hotfix) — **S item, ~3h**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

The voice patient page (`frontend/app/c/voice/[sessionId]/page.tsx`) already attempts the companion-chat exchange today; it just fails because of the backend bug 0A fixes. Once 0A lands, the voice page works.

**The video patient page is a separate gap.** `frontend/app/consult/join/page.tsx` mounts `<VideoRoom>` with NO `companion` prop and never calls `requestTextSessionToken`. So even with 0A's fix in place, video patients still get a dead canvas — the parallel exchange isn't even attempted.

This task **mirrors the voice page's exchange pattern onto the video page** so video patients get the same companion-chat experience.

**Estimated time:** ~3h.

**Status:** **Complete** (2026-04-30) with two **scope deviations** vs the original draft (see [Implementation log](#implementation-log-2026-04-30) — both unavoidable). **P0 — ship after 0A so the exchange actually succeeds.** Awaiting PR + merge.

**Depends on:** [task-voice-0A](./task-voice-0A-relax-modality-guard.md) — hard. Without 0A, this exchange would still 400 for video sessions.

**Source:** [Sub-batch 0 / P0.B](../Plans/plan-voice-consult-selected-features.md#items-in-sub-batch-0); [decision §0b](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-0-starts).

---

## Acceptance criteria

### Mirror the voice-page exchange pattern

- [x] **Reference implementation:** `frontend/app/c/voice/[sessionId]/page.tsx` lines ~130–139 — that's the parallel-exchange pattern (`Promise.all([requestVoiceToken, requestTextSessionToken])`) the video page must replicate. **Note:** the video URL has no `sessionId` (legacy `/consult/join?token=`), so the actual implementation is **sequential** (`getConsultationTokenForPatient` → then `requestTextSessionToken(sessionId, hmac)`). See [Deviation #1](#deviation-1--exchange-is-sequential-not-parallel).
- [x] **Edit `frontend/app/consult/join/page.tsx`:**
  - [x] Add a call to `requestTextSessionToken(sessionId, hmacToken)` after the video-token request resolves (sessionId from the new backend response, not from the URL — see [Deviation #2](#deviation-2--small-backend-extension-was-required)).
  - [x] On both succeed: pass `companion={{ sessionId, patientAccessToken, patientCurrentUserId, onPatientTokenRefresh }}` into `<VideoRoom>` — **the actual prop shape `<VoiceConsultRoom>` uses**, not the `{ token, currentUserId, expiresAt, practiceName }` shape the draft wrote (the draft was wrong; verified against `frontend/components/consultation/VoiceConsultRoom.tsx` lines 73–87 and the patient call site `frontend/app/c/voice/[sessionId]/page.tsx` lines 354–362).
  - [x] On the companion-token fetch failing while the video-token fetch succeeds: STILL mount `<VideoRoom>` with `companion={{ sessionId }}` (no patient creds) → `<VideoRoom>`'s existing `chatAuth` resolution falls into `unavailable`, which renders the inline "Chat unavailable" tile that's already in the room (Plan 06 Task 38). Same copy as 0C will standardize on the voice page.
  - [x] On both failing: existing error UI (`status === 'error'` branch, unchanged).

### Pass-through to `<VideoRoom>`

- [x] **`<VideoRoom>` already had a `companion` prop** from Plan 06 Task 38 — but it was structurally **doctor-only** (uses `createClient().auth.getSession()` to fetch the doctor's dashboard Supabase session). The component literally documented "Patient-side mounts of `<VideoRoom>` with `companion` aren't a v1 surface" (line 142–146 pre-edit). **Voice-0B promotes patient-side mounts to a v1 surface.** Mirrored `<VoiceConsultRoom>`'s pattern exactly:
  - Extended the `companion` prop with `patientAccessToken?`, `patientCurrentUserId?`, `onPatientTokenRefresh?` fields (matches `<VoiceConsultRoom>`).
  - Branched the `chatAuth` `useEffect`: if patient creds are present, set `chatAuth = ready` directly (no Supabase round-trip); else fall through to the doctor-side Supabase session fetch (which becomes the patient-fallback "Chat unavailable" path on devices without a Supabase session).
  - Branched `handleChatTokenRefresh`: if `companion.onPatientTokenRefresh` is set, delegate to it (patient HMAC re-exchange); else use `sb.auth.refreshSession()` (doctor flow).
  - Updated the `chatAuth` doc-comment block (lines ~136–157) to reflect the dual-branch reality.
  - Followup flagged: extract a shared `useCompanionChatAuth(companion, role)` hook to dedupe between `<VideoRoom>` + `<VoiceConsultRoom>`. Out of scope for voice-0B; the duplication is small and stable.
- [x] **Layout parity** — `<VideoRoom>`'s existing two-pane / tab-switcher layout from Plan 06 Task 38 is preserved. The patient mount uses the same render path; only the `chatAuth` resolution differs.

### Patient-side video — error UX (decision §0b: inline tile recommended)

- [x] When companion exchange fails but video succeeds, the page passes `companion={{ sessionId }}` (no patient creds) → `<VideoRoom>`'s `chatAuth` resolves to `unavailable`. The existing tile (Plan 06 Task 38, `VideoRoom.tsx` lines ~537–555 post-edit) renders with the patient-friendly copy `"Couldn't load chat for this consult. Please refresh the page to retry."` (added in this task; doctor copy `"No active Supabase session on this device."` is preserved for doctor-role mounts). 0C will reuse this same inline-tile pattern on the voice page; we did NOT pre-extract a shared component (deferred to 0C / a follow-up).

### Doctor-side video regression check

- [x] **Doctor-side video** still resolves `chatAuth` via `createClient().auth.getSession()` because the patient-creds branch only triggers when `patientAccessToken && patientCurrentUserId` are both set, which happens exclusively on the patient join page. Verified by reading: the only callers of `<VideoRoom>` are (a) the doctor dashboard's `<ConsultationLauncher>` (passes `companion={{ sessionId, patientToken? }}` — no patient creds → doctor branch), and (b) the patient `/consult/join` page (this task's edit — passes patient creds → patient branch). No other call sites. Type-check + regression suite (128 tests passed) confirm no doctor-side breakage.

### Manual smoke

- [ ] Patient phone hits `/consult/join?token=<hmac>` for a video session → DevTools shows `GET /api/v1/consultation/token` returning 200 with `{ token, roomName, sessionId }`, then `POST /:sessionId/text-token` returning 200 with `{ token, currentUserId }`.
- [ ] Patient phone canvas / panel renders the chat panel, NOT the chat-unavailable tile.
- [ ] Send a message from doctor laptop → arrives on patient phone within Realtime SLA.
- [ ] Send a message from patient phone → arrives on doctor laptop.
- [ ] Force the companion exchange to fail (e.g. break `/text-token` route) → patient sees the inline "Chat unavailable" tile; the video call still connects + works.

> Manual smokes intentionally left unchecked — they require a deployed environment with a live patient device + doctor dashboard. Owner to run during PR review on the dev tunnel set up in `docs/Work/Daily-plans/April 2026/23-04-2026/dev-environment-fast-iteration-setup.md`.

### General

- [x] Type-check + lint clean. Backend `npm run type-check` exit 0; frontend `npx tsc --noEmit` exit 0; `npx eslint src/services/appointment-service.ts src/controllers/consultation-controller.ts` reports 0 errors (2 pre-existing `any` warnings on lines 781/875 are outside the edit range); `npx next lint` reports `✔ No ESLint warnings or errors` for the changed frontend files.
- [x] No console errors expected from `<VideoRoom>` mount — the patient-creds branch sets `chatAuth = ready` synchronously, no async race; the doctor branch is unchanged from prior working code.
- [x] Existing video-call flow untouched — the `useEffect` that connects to Twilio depends only on `[accessToken, roomName, role]` (line 364 post-edit), none of which I changed. The 128 backend regression tests cover the controller path that issues the Twilio token.

---

## Out of scope

- **Backend changes.** All in [task-voice-0A](./task-voice-0A-relax-modality-guard.md).
- **Voice page changes.** Voice page already does the exchange; once 0A lands, it works. Voice page error UX polish lives in [task-voice-0C](./task-voice-0C-companion-error-surfacing.md).
- **Doctor-side video.** Already works.
- **Refactoring `<VoiceConsultRoom>` and `<VideoRoom>` to share a single `<CompanionChatPanel>`** — out of scope; flag a follow-up if duplication is large.
- **HMAC re-derivation.** Reuse the same HMAC the page already verified for the video-token; no new mint.

---

## Files expected to touch

**Frontend (touched):**

- `frontend/app/consult/join/page.tsx` — **rewritten** (~70 LOC net: sequential exchange, URL hygiene, companion pass-through, recording-token wiring, `Suspense` shell preserved).
- `frontend/components/consultation/VideoRoom.tsx` — **edited** (~70 LOC net: extended `companion` prop with patient-side fields, branched `chatAuth` resolution + `handleChatTokenRefresh`, added patient-friendly fallback copy, refreshed the doc-comment block).
- `frontend/lib/api.ts` — **edited** (~9 LOC net: extended `GetConsultationTokenData` with optional `sessionId`).

**Backend (touched — see [Deviation #2](#deviation-2--small-backend-extension-was-required)):**

- `backend/src/services/appointment-service.ts` — **edited** (~12 LOC net: surfaced `sessionId` from `getConsultationToken()` + `getConsultationTokenForPatient()` return type; the `consultation_sessions.id` was already in scope via `findActiveSessionByAppointment`).
- `backend/src/controllers/consultation-controller.ts` — **edited** (1 LOC: widened the local `result` type to match the service signature).

**Tests:** none added in this task — the wiring is structural + the new field is a passthrough. `consultation-text-token.test.ts` (added in voice-0T) already covers the backend contract end of the chain. Backend regression suite re-run: **128 tests pass** across `tests/unit/controllers/` + appointment + text-session-supabase + consultation-session-service. Manual smoke (above) is the patient-side verification.

**Migrations:** none.

---

## Notes / open decisions

1. **Why mirror the voice pattern instead of extracting a shared hook** — the voice page pattern is small (`Promise.all`); extracting a hook is a refactor concern. Ship the duplication today; flag a follow-up to extract `useCompanionExchange(sessionId, hmac)` if a third caller appears.
2. **`<VideoRoom>` companion-prop shape** — must match `<VoiceConsultRoom>`'s `companion` prop exactly, including the `'unavailable'` status branch (`{ status: 'unavailable', error }`). Don't invent a new shape.
3. **What if `<VideoRoom>` was built without companion in mind?** — Decision §0b expects parity. If the room is structurally hostile to a companion mount, escalate at PR time; the worst case is a follow-up task to refactor `<VideoRoom>`.
4. **PWA install / dev tunnel quirks** — the patient HMAC + redirect flow can break on some PWA installs. Smoke on at least one Android Chrome PWA install AND one mobile browser tab.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch 0](../Plans/plan-voice-consult-selected-features.md#sub-batch-0--companion-chat-hotfix-p0-1-day)
- **Decision:** [§0b — patient-side video page error UX](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-0-starts)
- **Hard dep:** [task-voice-0A](./task-voice-0A-relax-modality-guard.md).
- **Sibling:** [task-voice-0C](./task-voice-0C-companion-error-surfacing.md) — same "Chat unavailable" tile, on the voice page.
- **Reference impl:** `frontend/app/c/voice/[sessionId]/page.tsx` lines 130–139.

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** **Complete** (2026-04-30) with two scope deviations from the draft (both unavoidable; documented below). **P0; ship after [task-voice-0A](./task-voice-0A-relax-modality-guard.md).** Same-day ship target with 0C.

---

## Implementation log (2026-04-30)

### Summary

- Wired `frontend/app/consult/join/page.tsx` to the companion-chat exchange so video patients get the same chat experience as voice patients. Mirrored `<VoiceConsultRoom>`'s patient-branch into `<VideoRoom>` instead of inventing a new shape. Tiny backend extension to surface `sessionId` from the legacy patient video-token route (the URL doesn't carry a sessionId, so the frontend had nowhere else to get it).

### Scope deviations from the draft

#### Deviation #1 — exchange is **sequential**, not parallel

The draft (line 29 / acceptance criteria) said to mirror the voice page's `Promise.all([requestVoiceToken, requestTextSessionToken])` pattern. **The video URL doesn't carry a `sessionId`** (it's `/consult/join?token=<hmac>`, not `/c/voice/[sessionId]?t=<hmac>`), so the parallel pattern is impossible: the second exchange depends on the sessionId returned by the first. Implemented as a strict two-step sequence (Step 1: video token → Step 2: best-effort companion token). Latency cost: one additional sequential round-trip on the patient's first page load (~150ms typical), no impact on subsequent renders. Acceptable trade-off vs. changing every previously-issued `/consult/join?token=...` URL in IG / SMS / email histories to embed a sessionId.

#### Deviation #2 — small backend extension was required

The draft (line 84) said "Backend: none". Reality: the patient video-token route returns `{ token, roomName }` with no `sessionId`, and `requestTextSessionToken(sessionId, hmac)` requires one. Three options considered:

1. **Add a separate endpoint** `GET /api/v1/consultation/session-by-token?token=...` returning `{ sessionId }` — adds one round-trip, one new public route, one new auth path to maintain.
2. **Have the frontend HMAC-verify locally + look up the session** — would leak the consultation-token secret to the browser; unacceptable.
3. **Extend the existing video-token response** with `sessionId` (the value is already in scope as `startedSession.id` from `findActiveSessionByAppointment(appointmentId, 'video')` on line 1193 pre-edit) — ~12 LOC, zero new routes, zero new auth surface.

Took option 3. The `sessionId` field is **typed as optional** (`sessionId?: string`) on the frontend `GetConsultationTokenData` interface to keep the backend + frontend deploys decoupleable: if the backend ships first, no frontend breakage; if the frontend ships first, the page silently falls back to video-only (no companion mount) on the deploy-window window, which is the same graceful-degrade path as a companion-exchange failure.

### Code changes

**1. `backend/src/services/appointment-service.ts`** (1169–1255 area)

Extended both `getConsultationToken()` and `getConsultationTokenForPatient()` return types from `{ token, roomName }` to `{ token, roomName, sessionId }`. The value comes from the same `startedSession` row already loaded by `findActiveSessionByAppointment(appointmentId, 'video')` — zero extra DB calls. Inline comment explains the Plan 06 Decision 9 / voice-0B context.

**2. `backend/src/controllers/consultation-controller.ts`** (line 145)

Widened the local `result` type annotation to match the new service signature. No runtime change; just keeps strict-mode TypeScript happy.

**3. `frontend/lib/api.ts`** (`GetConsultationTokenData` interface)

Added optional `sessionId?: string`. Doc-comment explains the deploy-window decoupling reason for `optional` typing.

**4. `frontend/components/consultation/VideoRoom.tsx`** — **the structural change**

Three coordinated edits:

- **Companion prop shape** — added `patientAccessToken?`, `patientCurrentUserId?`, `onPatientTokenRefresh?` fields, mirroring `<VoiceConsultRoom>` 1:1. The pre-existing `patientToken?` field (HMAC pass-through) is preserved for backward compatibility.
- **`chatAuth` `useEffect`** — branched on `companion.patientAccessToken && companion.patientCurrentUserId`:
  - Patient creds present → `setChatAuth({ status: 'ready', ... })` synchronously, no Supabase round-trip.
  - Either missing → fall through to existing doctor-side `sb.auth.getSession()` path. On a patient device with no Supabase session this surfaces `unavailable`, which renders the inline "Chat unavailable" tile from Plan 06 Task 38. Used `role === 'patient'` as a heuristic to swap in patient-friendly copy (`"Couldn't load chat for this consult. Please refresh the page to retry."`) for the unavailable tile reason; doctor copy is preserved verbatim.
- **`handleChatTokenRefresh`** — branched: if `companion.onPatientTokenRefresh` is set, delegate to it (patient HMAC re-exchange via parent page's `requestTextSessionToken`); else use `sb.auth.refreshSession()` (doctor flow, unchanged).
- Updated the doc-comment block above `chatAuth` (lines 137–157 pre-edit) to document the new dual-branch reality. Removed the outdated "Patient-side mounts of `<VideoRoom>` with `companion` aren't a v1 surface" claim.

**5. `frontend/app/consult/join/page.tsx`** — **rewrote**

- Read `?token=` (HMAC), stash in `urlTokenRef` for refresh re-use (mirrors voice page).
- Step 1: `await getConsultationTokenForPatient(initialUrlToken)` → get `{ token, roomName, sessionId }`.
- Step 2: best-effort `await exchangeCompanion(sessionId)` (returns `null` on any error). Failures here NEVER block the video flow.
- `router.replace('/consult/join')` to strip `?token=` from the URL bar (mirrors voice page hygiene).
- Computed `companionProp`:
  - Both video + chat OK → full creds: `{ sessionId, patientAccessToken, patientCurrentUserId, onPatientTokenRefresh }`.
  - Video OK + chat failed but sessionId present → `{ sessionId }` only → `<VideoRoom>` renders the unavailable tile.
  - Video OK but no sessionId (pre-deploy backend) → `companion` undefined → `<VideoRoom>` renders the legacy single-pane video.
- Wired `recordingSessionId` + `recordingToken` to mirror the voice page's Plan 02 Task 28 wiring (the companion JWT doubles as the recording-API caller-auth token).
- Preserved the original `Suspense` boundary + the existing error / ended states verbatim.

### Verification

| Check | Command | Result |
|---|---|---|
| Backend type-check | `npm run type-check` (backend) | ✅ exit 0 |
| Frontend type-check | `npx tsc --noEmit` (frontend) | ✅ exit 0 |
| Backend lint (changed files) | `npx eslint src/services/appointment-service.ts src/controllers/consultation-controller.ts` | ✅ 0 errors (2 pre-existing `any` warnings on lines 781/875, unrelated to this task) |
| Frontend lint (changed files) | `npx next lint --file app/consult/join/page.tsx --file components/consultation/VideoRoom.tsx --file lib/api.ts` | ✅ "No ESLint warnings or errors" |
| Backend regression suite | `npx jest tests/unit/controllers/ tests/unit/services/appointment-service.test.ts tests/unit/services/appointment-service-start-voice.test.ts tests/unit/services/text-session-supabase.test.ts tests/unit/services/consultation-session-service.test.ts` | ✅ 9 suites / **128 tests** pass |

No new tests added — the change is structural (additive backend field + frontend wiring). Backend contract for `/text-token` is already covered by `consultation-text-token.test.ts` (added in voice-0T). Frontend wiring verification is the manual smoke checklist above; running it requires a deployed environment + live patient device.

### Follow-ups (non-blocking)

1. **Run the manual smoke checklist** on the dev tunnel set up in `docs/Work/Daily-plans/April 2026/23-04-2026/dev-environment-fast-iteration-setup.md`. Owner to do this during PR review.
2. **Extract `useCompanionChatAuth(companion, role)` hook** to dedupe the patient/doctor branch logic between `<VideoRoom>` and `<VoiceConsultRoom>`. Duplication is ~40 LOC, stable; not blocking. Track as a separate refactor task if a third caller appears.
3. **Standardize the "Chat unavailable" tile** as a shared component when 0C ships. Today both rooms inline the same JSX. 0C's task is the natural home for the extraction.
4. **PWA install + dev tunnel quirks** — Note #4 in the original task. Smoke should specifically include one Android Chrome PWA install AND one mobile browser tab.
5. **Doctor-side video companion smoke** — fast verification that the doctor dashboard's video launcher still mounts the chat panel via the doctor's Supabase session (the patient-creds branch in `chatAuth` is gated, so the doctor path is structurally untouched, but a 30-second sanity check on the dashboard is worth doing during PR review).
