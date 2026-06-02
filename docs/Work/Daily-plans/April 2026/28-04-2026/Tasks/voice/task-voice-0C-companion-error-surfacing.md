# Task voice-0C: Surface companion-token failures on patient voice + video pages (stop silent-swallowing)

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch 0 (P0 hotfix) — **XS item, ~1h**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Today, when the patient's `requestTextSessionToken` fails (the bug 0A fixes, OR transient network failures, OR backend down), the page silently swallows the error and `<VoiceConsultRoom companion={undefined}>` falls through to the audio-only canvas. **The patient sees no indication that chat was meant to be there.** When 0A is fixed, this swallow stops being a critical bug, but it's still a UX gap — transient companion failures (re-deploy, wifi blip) leave patients stranded with no signal that they could retry.

This task **stops silent-swallowing** and surfaces a small "Chat unavailable — retry" tile in the canvas-fallback branch of `<VoiceConsultRoom>` (and `<VideoRoom>` if 0B added the same path). Mirrors the existing `chatAuth.status === "unavailable"` UI at `VoiceConsultRoom.tsx:659–665`.

**Estimated time:** ~1h.

**Status:** **Complete** (2026-04-30) — voice + video pages wired, both rooms now render the inline "Chat unavailable" tile with a functional Retry button. **P0; same-day ship with 0B.** Awaiting PR + merge.

**Depends on:** [task-voice-0A](./task-voice-0A-relax-modality-guard.md) (so the retry button can plausibly succeed); [task-voice-0B](./task-voice-0B-patient-video-companion-wiring.md) is a sibling — both surface the same tile.

**Source:** [Sub-batch 0 / P0.C](../Plans/plan-voice-consult-selected-features.md#items-in-sub-batch-0).

---

## Acceptance criteria

### Stop silent-swallowing on the voice patient page

- [x] **Edited `frontend/app/c/voice/[sessionId]/page.tsx`** — replaced the silent `try { ... } catch { return null; }` swallow with a structured `CompanionState` discriminated union (`{ status: 'ok', data } | { status: 'unavailable', error }`). The implementation deviates from the draft snippet in three small ways (all explicitly documented in code comments):
  - Returns `CompanionState | null` instead of pure `CompanionState` so `null` retains its existing meaning of "didn't even attempt the exchange" (e.g. missing sessionId or HMAC). The room then sees no `companion` prop at all and falls back to the legacy voice-only canvas — same behavior as before for sessions that never expected chat.
  - Wrapped `console.warn` in a `lastLoggedFailureRef` gate so consecutive identical failures (retry button on a still-down backend) don't spam DevTools — log-once-per-distinct-failure semantics. Reset on success.
  - Field name on `error` is `statusCode` (not `status`) to avoid colliding with the existing `state.phase` discriminator naming. Same payload shape otherwise.
- [x] **Pass-through to `<VoiceConsultRoom>`** — the `live` render branch now computes `companionProp` from the new tri-state:
  - `companion.status === 'ok'` + token + currentUserId → full ready creds (`{ sessionId, patientAccessToken, patientCurrentUserId, onPatientTokenRefresh, onCompanionRetry }`).
  - `companion.status === 'unavailable'` → `{ sessionId, onCompanionRetry }` (no creds) → room's `chatAuth` resolves to `unavailable`, the upgraded tile renders.
  - `companion === undefined` → no companion prop → voice-only canvas (legacy graceful path).
- [x] **`<VoiceConsultRoom>` `'unavailable'` branch verified** — it existed at the old line 659 (now ~679 post-edit) but was a passive **text-only** tile (no retry button at all). Upgraded — see next section.

### Surface the "Chat unavailable — retry" tile

- [x] **Upgraded `VoiceConsultRoom.tsx`** unavailable-branch tile (lines ~679 area). The pre-edit tile was just two `<p>` elements. Now:
  - Heading: `"Chat unavailable"` (preserved).
  - Body: `"Your call is still connected."` — exact wording from the spec.
  - Subline: small gray reason text (when present) — preserved for triage but de-emphasized to `text-[11px] text-gray-400`.
  - **Functional Retry button** when the parent supplied `companion.onCompanionRetry`; disabled placeholder otherwise (doctor-side mounts get the disabled "Refresh the page" copy because the right doctor recovery primitive is `sb.auth.refreshSession()`, not the patient HMAC re-exchange — which doctor mounts don't have access to anyway).
  - Click → `setChatRetryPending(true)` → `await companion.onCompanionRetry()` → `finally setChatRetryPending(false)`. Defense-in-depth `finally` so a thrown callback (forbidden by contract, but) doesn't leave the button stuck spinning.
  - Added `data-companion-tile="unavailable"` for E2E selection.
- [x] **Tile location** — preserved verbatim. The tile only renders inside `<VoiceConsultRoom>`'s **canvas** branch (the only layout `<VoiceConsultRoom>` ships); panel/standalone parity is `<VideoRoom>`'s job (next section). No new layouts introduced.

### Mirror on the video page (same component)

- [x] **`<VideoRoom>` already had a Retry button** but it was a hard-coded disabled placeholder (`aria-disabled="true"`, title `"Coming soon — refresh the page to retry."`). Made it functional with the same pattern as `<VoiceConsultRoom>`:
  - Added `companion.onCompanionRetry?` to the `<VideoRoom>` companion-prop shape.
  - Added the same `chatRetryPending` state + `handleCompanionRetry` callback.
  - Replaced the placeholder tile JSX with the functional version (mirrors `<VoiceConsultRoom>` 1:1, including the `data-companion-tile="unavailable"` hook).
- [x] **`frontend/app/consult/join/page.tsx`** — wired the same structured exchange + retry callback. Same `CompanionState` discriminated union, same gated `console.warn` ref, same companion-prop matrix as the voice page. The video page's companion exchange was already non-blocking after voice-0B; voice-0C just upgraded the failure UX from a passive missing-tile to a functional retry tile.
- [x] **One component, both modalities** — the `<TextConsultRoom>` chat surface is shared; only the unavailable-tile JSX is duplicated between `<VoiceConsultRoom>` (canvas) and `<VideoRoom>` (panel) because the layouts differ. Flagged a follow-up to extract a shared `<CompanionUnavailableTile>` component if the duplication grows.

### Manual smoke

- [ ] With backend RUNNING + 0A applied: companion exchanges normally; tile never appears.
- [ ] With backend STOPPED briefly: tile appears with retry button; clicking retry while backend is still down keeps tile; clicking retry after backend recovers mounts the chat panel.
- [ ] Console `console.warn` fires once on failure (not on every retry — only on each new failure event).
- [ ] No infinite-retry loop, no exponential backoff (out of scope; one-click retry is enough).
- [ ] Audio still works the entire time (chat unavailability does NOT block the call).

> Manual smokes intentionally left unchecked — they require a deployed environment with a live patient device. Owner to run during PR review on the dev tunnel from `docs/Work/Daily-plans/April 2026/23-04-2026/dev-environment-fast-iteration-setup.md`.

### General

- [x] Type-check + lint clean. `npx tsc --noEmit` (frontend) exit 0; `npx next lint` reports `✔ No ESLint warnings or errors` for all four changed files. (One initial pass surfaced two `string | null` vs `string | undefined` mismatches on the `recordingToken` derivation — `TextConsultTokenExchangeData.token` is `string | null` post-session-end. Coerced to `undefined` with a doc-commented narrowing in both pages.) Backend untouched in this task.
- [x] Existing voice-only fallback canvas (no companion at all) is untouched — the new tile only renders in the `chatAuth.status === 'unavailable'` branch, which only triggers when `companion` is set AND auth resolution fails. Sessions that never had a companion still get the original voice-only pulsing-circle UI.

---

## Out of scope

- **Backend changes.** All in [task-voice-0A](./task-voice-0A-relax-modality-guard.md).
- **Sentry / analytics fan-out** for the companion failure. Out of scope; `console.warn` is the v1 surface.
- **Auto-retry with backoff.** Out of scope; manual one-click retry is enough.
- **Toast notifications.** Out of scope — the inline tile is the canonical surface.
- **Doctor-side error UX.** Doctor doesn't hit this endpoint.

---

## Files expected to touch

**Frontend (touched):**

- `frontend/app/c/voice/[sessionId]/page.tsx` — **edited** (~50 LOC net: introduced `CompanionState` discriminated union, structured `exchangeCompanion` + `lastLoggedFailureRef` log gate, added `handleCompanionRetry`, refactored `companionProp` derivation, narrowed `recordingToken`).
- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edited** (~50 LOC net: extended `companion` prop with `onCompanionRetry?`, added `chatRetryPending` state + `handleCompanionRetry`, replaced passive tile with functional Retry-button tile + `data-companion-tile` E2E hook).
- `frontend/app/consult/join/page.tsx` — **edited** (~60 LOC net: same `CompanionState` union + log gate as voice page, same retry-callback wiring, refactored `companionProp` matrix, narrowed `recordingToken`).
- `frontend/components/consultation/VideoRoom.tsx` — **edited** (~50 LOC net: extended `companion` prop with `onCompanionRetry?`, added `chatRetryPending` + `handleCompanionRetry`, upgraded the placeholder Retry button to a functional one with the same JSX shape as `<VoiceConsultRoom>`).

**Backend:** none. (The structured exchange contract is purely a frontend reshape of the same `requestTextSessionToken` HTTP call.)

**Tests:** none added — the change is structural (UI tile + page-state plumbing). Backend `requestTextSessionToken` contract is already covered by `consultation-text-token.test.ts` (added in voice-0T). Manual smoke (above) is the verification.

**Migrations:** none.

---

## Notes / open decisions

1. **Why `console.warn` over Sentry** — Sentry fan-out is a separate ops concern. `console.warn` is debuggable from any patient device with DevTools attached and is the right v1 surface.
2. **Why no auto-retry** — auto-retry on a transient failure is fine; auto-retry on a real backend issue creates request storms. Manual retry is honest UX: "we tried, we failed, do you want us to try again?"
3. **Tile copy** — "Chat unavailable. Your call is still connected." is the exact wording. Reassuring (call is fine), specific (chat is the unavailable thing), no jargon.
4. **`'unavailable'` branch already exists** — if it's a fully-built tile already at lines 659–665, this task is even smaller (~30 min). Verify at file-read time.
5. **Three-host parity** — the tile must render correctly in all three layouts. Plan F06 invariant.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch 0](../Plans/plan-voice-consult-selected-features.md#sub-batch-0--companion-chat-hotfix-p0-1-day)
- **Hard dep:** [task-voice-0A](./task-voice-0A-relax-modality-guard.md).
- **Sibling:** [task-voice-0B](./task-voice-0B-patient-video-companion-wiring.md) — same tile, video page.
- **Reference UI:** `frontend/components/consultation/VoiceConsultRoom.tsx` lines 659–665 (`chatAuth.status === 'unavailable'` branch).
- **Reference impl:** the silent-swallow path is at `frontend/app/c/voice/[sessionId]/page.tsx` lines 130–139.

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** **Complete** (2026-04-30). **P0; same-day ship with [task-voice-0B](./task-voice-0B-patient-video-companion-wiring.md).** Closes Sub-batch 0 once both PRs merge.

---

## Implementation log (2026-04-30)

### Summary

Stopped the silent swallow on both patient pages. The companion text-token exchange now returns a discriminated `CompanionState` (`{ status: 'ok', data } | { status: 'unavailable', error }`) instead of `null`, and each new failure logs a structured `console.warn` once (gated by a ref to suppress retry-spam). Both rooms (`<VoiceConsultRoom>` + `<VideoRoom>`) gained a functional Retry button on the inline "Chat unavailable" tile. The retry round-trip is **page-driven** — the page (which already holds the HMAC + sessionId in scope) re-runs `exchangeCompanion()` and updates state; the room observes the prop reference change and re-resolves `chatAuth` (`unavailable` → `ready` on success, stays `unavailable` on persistent failure). No new endpoints, no new state machines.

### Key design decisions

#### Page-driven retry, not room-driven

The draft snippet (lines 37–53) implied the retry callback would live inside the room. Two reasons I pushed it to the page instead:

1. The room doesn't have the HMAC `?t=` or the `sessionId` in scope — those are URL state, not room props (post-0B `companion.sessionId` is there, but the HMAC is not). Pushing retry into the room would require either (a) leaking the HMAC as a new room prop or (b) re-deriving it from the URL inside a "use client" component, both worse than the parent-supplied callback.
2. The voice page's `exchangeCompanion()` already exists and is the single source of truth for the round-trip. Reusing it for both initial mount AND retry keeps the failure-logging gate (`lastLoggedFailureRef`) coherent across both code paths without a second copy.

The room exposes `companion.onCompanionRetry?: () => Promise<void>` as the contract. Optional — when omitted (doctor-side mounts), the tile renders a disabled "Refresh the page" button instead.

#### Tri-state `CompanionState`, not nullable token

The pre-edit voice page used `state.companion?: TextConsultTokenExchangeData` and treated `undefined` as "didn't get one" — which silently conflated "never tried" with "tried and failed". That meant the room couldn't render a tile because it had no signal that a tile *should* render. The new tri-state `{ status: 'ok' | 'unavailable' } | undefined` makes the three cases explicit:

- `undefined` → never tried → no companion at all (legacy single-pane).
- `status: 'unavailable'` → tried and failed → tile + retry.
- `status: 'ok'` → tried and succeeded → chat panel.

The same shape is reused on the video page. Considered exporting it as a shared type, but the duplication is 7 LOC and the two pages have no other shared types — kept it local with a follow-up flag.

#### Log-once-per-distinct-failure

Naive `console.warn` on every failed exchange would spam DevTools every time the patient clicks Retry against a still-down backend. Ref-gated by a `${statusCode}:${message}` signature; consecutive identical failures stay silent until either the signature changes (different error → new log) or a success resets the gate. This matches the spec's "Console `console.warn` fires once on failure (not on every retry — only on each new failure event)."

#### `chatRetryPending` lives in the room, not the page

Pre-flight pending state belongs to the surface that renders the spinner (the room's tile). The page-supplied `onCompanionRetry` is just the round-trip primitive — the room wraps it with `setChatRetryPending(true) ... finally setChatRetryPending(false)` so the button can disable + show "Retrying…" copy without the page needing to know the room's UI state. Defense-in-depth `finally` so a thrown callback (which the contract forbids, but) doesn't leave the button stuck spinning.

### Code changes

**1. `frontend/components/consultation/VoiceConsultRoom.tsx`**

- Extended `companion` prop with `onCompanionRetry?: () => Promise<void>` + doc-comment block explaining the page-driven contract.
- Added `chatRetryPending` state + `handleCompanionRetry` callback (line ~273 area).
- Replaced the passive unavailable tile (lines 659–665 pre-edit) with a functional one — heading "Chat unavailable", body "Your call is still connected." (exact spec wording), de-emphasized reason subline, functional Retry button (or disabled placeholder for doctor-side mounts), `data-companion-tile="unavailable"` E2E hook.

**2. `frontend/components/consultation/VideoRoom.tsx`**

- Same prop extension as `<VoiceConsultRoom>` (with cross-ref doc-comment).
- Same `chatRetryPending` + `handleCompanionRetry` block.
- Replaced the placeholder disabled Retry button (lines ~602–610 pre-0C) with a functional one. Same JSX shape as `<VoiceConsultRoom>` 1:1; flagged a follow-up to extract a shared `<CompanionUnavailableTile>` component.

**3. `frontend/app/c/voice/[sessionId]/page.tsx`**

- Introduced local `CompanionState` discriminated union.
- Updated `PageState.companion` typing to use it.
- Added `lastLoggedFailureRef` (in `useRef`) for the log gate.
- Rewrote `exchangeCompanion` to capture the structured failure + log via the gate.
- Updated `handlePatientTokenRefresh` to handle the new shape (only succeeds on `status === 'ok'`).
- Added `handleCompanionRetry` — re-runs the exchange and updates `state.companion`; never throws.
- Refactored `companionProp` derivation in the `live` render branch to handle the three-state matrix.
- Coerced `recordingToken` from `string | null | undefined` → `string | undefined` (the `TextConsultTokenExchangeData.token` field is null once the session ends/cancels, while the room's prop expects `string | undefined`).

**4. `frontend/app/consult/join/page.tsx`**

- Same `CompanionState` union, `lastLoggedFailureRef`, structured `exchangeCompanion`, `handlePatientTokenRefresh` rewire, `handleCompanionRetry`, `companionProp` matrix, and `recordingToken` narrowing as the voice page. The video page has the additional Step 1 → Step 2 sequencing (carried over from voice-0B), but the failure surface is the same.

### Verification

| Check | Command | Result |
|---|---|---|
| Frontend type-check | `npx tsc --noEmit` (frontend) | ✅ exit 0 (after fixing the `recordingToken` `string | null` narrowing on first pass) |
| Frontend lint (changed files) | `npx next lint --file app/c/voice/[sessionId]/page.tsx --file app/consult/join/page.tsx --file components/consultation/VoiceConsultRoom.tsx --file components/consultation/VideoRoom.tsx` | ✅ "No ESLint warnings or errors" |
| Backend (untouched) | n/a | n/a — no backend changes in this task |

No new tests added — voice-0C is a UI + page-state restructure on top of an unchanged backend contract. The backend contract is covered by `consultation-text-token.test.ts` (voice-0T). The room-tile + page-state behavior is best verified via the manual smoke checklist (above) on a real patient device — the patterns being tested (forced backend stop → tile renders with retry; retry while down → tile stays; retry after recovery → chat panel mounts) are inherently round-trip behaviors that don't unit-test cleanly.

### Follow-ups (non-blocking)

1. **Run the manual smoke checklist** on the dev tunnel from `dev-environment-fast-iteration-setup.md`. Key flows: backend up (no tile), backend stopped briefly (tile + retry works), retry-while-down (no console spam — verify the log gate), retry-after-recovery (tile clears, chat panel mounts), audio uninterrupted across all of the above.
2. **Extract `<CompanionUnavailableTile>` component** to dedupe between `<VoiceConsultRoom>` (canvas layout) and `<VideoRoom>` (panel layout). Today the JSX is duplicated 1:1 modulo the wrapping div's flex direction. Track when the tile gets a third caller or its copy needs to diverge per layout.
3. **Sentry / analytics fan-out** for the companion failure (out of scope per Notes #1). When ops surfaces are wired up project-wide, the `console.warn` call site is the natural extension point — the structured `{ statusCode, message }` payload is already shaped for it.
4. **Auto-retry with backoff** still explicitly out of scope per Notes #2. The manual one-click retry IS the v1 pattern; revisit if support tickets surface complaints about transient failures.
5. **Doctor-side mount sanity check** — confirm during PR review that the doctor dashboard's `<VideoRoom>` mount (which doesn't pass `onCompanionRetry`) shows the disabled "Refresh the page" tile copy when the doctor's Supabase session expires. Should be unchanged from the pre-0C disabled placeholder behavior, just with the upgraded "Your call is still connected." body copy.
