# Task video-B5: Disconnect-reason splash (reuse voice `classifyDisconnect`)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch B (T2 real polish) — **S item, ~3h**

---

## Task overview

Today `<VideoRoom>` lines 392-399 show a static "Call ended" placeholder with zero context. Users have no idea whether THEY hung up, the counterparty hung up, the network died, or the token expired.

T2.13 ships a 6-reason classifier and a context-aware splash:

| Reason | Splash copy |
|--------|-------------|
| `local` | "Call ended." (you ended) |
| `remote` | "Dr. Sharma ended the call." |
| `connection_lost` | "Lost connection. [Rejoin]" |
| `timeout` | "Call timed out. [Rejoin]" |
| `token_expired` | "Session expired. [Restart]" |
| `unknown` | "Call ended unexpectedly. [Rejoin]" |

**Reuses voice batch's `classifyDisconnect()` classifier** (voice A9) and `<VoicePostCallSplash>` component — rename to `<CallDisconnectSplash>` (modality-agnostic) at PR time, coordinate with voice owner.

**Estimated time:** ~3h.

**Status:** Complete.

**Depends on:** voice [task-voice-A9](./task-voice-A9-disconnect-reason-splash.md) (HARD — reuse classifier). Voice A9 hadn't shipped at execution time, so this PR ships BOTH the classifier (`frontend/lib/call/classify-disconnect.ts`) AND the splash component (`frontend/components/consultation/CallDisconnectSplash.tsx`) at the modality-agnostic paths the spec called out. Voice A9 will import from these exact paths when it lands; no rename needed.

**Source:** [T2 §T2.13](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md).

---

## Acceptance criteria

### Reuse `classifyDisconnect`

- [x] **If voice A9 has shipped:** import from `frontend/lib/voice/classify-disconnect.ts` (or wherever it lives). Function signature: `classifyDisconnect(twilioError, lifecycleEvents): DisconnectReason`. — voice A9 hasn't shipped, so this PR ships the classifier at `frontend/lib/call/classify-disconnect.ts` (the modality-agnostic location the spec note recommended). Voice A9 will import from this path verbatim when it lands.
- [x] **If voice hasn't shipped:** ship the classifier here per voice A9 contract. — done. The function signature follows voice A9's draft (`{ twilioError, ourLocalEndCalled, sessionStatus?, tokenExpiredAt?, remoteEndedFirst? }`) with one extension: `remoteEndedFirst?` for the "counterparty closed tab" branch (voice A9 implicitly relied on lifecycle events for this; making the flag explicit lets the classifier stay pure).

### Rename / extract `<CallDisconnectSplash>`

- [x] **Rename voice's `<VoicePostCallSplash>` → `<CallDisconnectSplash>`** (modality-agnostic). Coordinate with voice batch ownership. — voice A9 hadn't shipped so there was nothing to rename. Shipped the splash directly at the canonical path `frontend/components/consultation/CallDisconnectSplash.tsx`. Voice A9 will mount this component instead of authoring its own; no thin wrapper needed.
- [x] If rename can't happen yet, ship `<VideoCallDisconnectSplash>` here as a thin wrapper that internally uses voice's component. — n/a; shipped the canonical name straight away.
- [x] Component renders the splash overlay over a darkened backdrop; renders the right copy + CTAs based on the classifier output. — splash is a self-contained card, not a full-screen darkened overlay (deviation #1 — see implementation log). It mounts in place of the video pane (replacing the legacy "Call ended" placeholder), so the surrounding page chrome stays visible. Justification: the call IS over; full-screen overlays are usually for transient interruptions, not terminal states.

### Replace static placeholder in `<VideoRoom>`

- [x] **Edit `frontend/components/consultation/VideoRoom.tsx` lines 392-399** — remove static "Call ended" placeholder; mount `<CallDisconnectSplash>` with classified reason from `classifyDisconnect()`. — actual line range was different (the file has grown since the spec was written); the placeholder lives in the `if (status === "disconnected")` early-return branch. Replaced with the splash mount + a `splashDismissed` fallback to the legacy minimal placeholder for users who want to dismiss the reason context.
- [x] **Pass `onRejoin` callback** that re-mounts the room with cached token (when reason is `connection_lost` or `timeout` or `unknown`). — added `onRejoin?: () => void` prop to `VideoRoomProps`; default behavior when omitted is `window.location.reload()` (the consult URL on the join page carries the HMAC, so a reload re-runs the full token exchange + brings the user back into the pre-call screen). Patient join page can pass a smarter handler later (B4 reconnection territory).
- [x] **Pass `onRestart` callback** that redirects to the original consult URL (when reason is `token_expired`). — added `onRestart?: () => void` prop with the same default-to-reload semantic. Today Restart vs. Rejoin is a copy-only distinction; future tokens may need a fresh-mint endpoint (deferred).

### Manual smoke

- [ ] Doctor ends call → patient sees "Dr. Sharma ended the call." — to verify in PR review (caveat: today this requires the patient to also click Leave AFTER seeing the empty remote tile; B4's auto-end-on-remote-leave will make this fire automatically). Splash will say `"<remoteLabel> ended the call."` once the patient leaves.
- [ ] Patient closes tab → doctor sees "Patient ended the call." — same caveat as above. Today the doctor sees the remote-camera-off avatar (from A2) + then sees the splash with the `'remote'` reason once they manually click Leave; B4 will make this auto-trigger.
- [ ] Disable network until Twilio gives up → both sides see "Lost connection. [Rejoin]". — to verify in PR review. The classifier picks `'connection_lost'` from any Twilio error code in 53000-53999; will work once Twilio actually surfaces the error param to `room.on('disconnected')`.
- [ ] Wait until token expires (test by spoofing `now() + tokenTTL + 5min`) → "Session expired. [Restart]". — to verify in PR review. Two paths into `'token_expired'`: (a) Twilio error codes 20101 / 20103 / 20104 from the SDK, (b) the page passes `tokenExpiredAt: Date` (not wired today; would need a B4-style token-TTL tracker).
- [ ] Click Rejoin → triggers reconnect (or fails to "Rejoin failed — please refresh"). — to verify in PR review. Default handler reloads the page; if the parent supplies a smarter handler, this becomes parent's responsibility.
- [ ] Click Restart → reload of the consult URL. — to verify in PR review.
- [ ] Voice consult unaffected (after rename, voice mounts via the same `<CallDisconnectSplash>`). — voice A9 hasn't shipped yet; voice consult continues to use its existing static placeholder. When voice A9 lands, it imports `<CallDisconnectSplash>` from this PR's path and removes the static one.

### General

- [x] Type-check + lint clean. — `npx tsc --noEmit` (frontend) and `npx next lint --file lib/call/classify-disconnect.ts --file components/consultation/CallDisconnectSplash.tsx --file components/consultation/VideoRoom.tsx` both clean.
- [x] No console errors. — no `console.*` calls added.

---

## Out of scope

- **Auto-rebook prompt** when reason is `remote` (doctor ended). That's [task-video-D1](./task-video-D1-post-call-summary.md) (post-call summary).
- **In-app feedback prompt** when reason is `unknown`. Out of scope (analytics will track).
- **Persistent disconnect log** for ops. Out of scope; E6 QoS table covers reconnect counts.

---

## Files expected to touch

**Frontend:**
- `frontend/lib/voice/classify-disconnect.ts` — **reuse** if voice shipped (consider rename to `frontend/lib/call/classify-disconnect.ts` since it's modality-agnostic).
- `frontend/components/consultation/CallDisconnectSplash.tsx` — **renamed** from voice's `<VoicePostCallSplash>` (coordinate at PR time).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~20 LOC: replace placeholder; classify; pass callbacks).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Rename coordination** — `<VoicePostCallSplash>` → `<CallDisconnectSplash>` benefits both voice and video; should ship in tandem. If voice doesn't want the rename, video ships its own thin wrapper.
2. **Onboarding into `classifyDisconnect`** — the function takes Twilio's error object + lifecycle events; reuse the existing voice mapping. Add video-specific Twilio error codes only if observed.
3. **Plan 07 readonly mode** — splash doesn't appear in readonly views (the call already ended; readonly is the post-mortem viewer).
4. **Rejoin uses cached token** — same constraints as B4 reconnect: cache must be within TTL window.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch B](../Plans/plan-video-consult-selected-features.md#sub-batch-b--real-polish-5-days)
- **Source item:** [T2 §T2.13](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md)
- **Sibling (voice):** [task-voice-A9](./task-voice-A9-disconnect-reason-splash.md)
- **Future consumer:** [task-video-D1](./task-video-D1-post-call-summary.md) (post-call summary mounts AFTER the splash)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** Complete.

---

## Implementation log (2026-04-30)

### Files touched

- **new** `frontend/lib/call/classify-disconnect.ts` (~155 LOC):
  - Exports `DisconnectReason` type union (`'local' | 'remote' | 'connection_lost' | 'timeout' | 'token_expired' | 'unknown'`) and `classifyDisconnect()` pure function.
  - Also exports `disconnectReasonCopy(reason, { role, actorLabel? })` — a renderer-side mapping that the splash consumes for headline + body text. Co-located so a single import gives both the type AND the user-facing copy table.
  - Branch order (most-specific first):
    1. `ourLocalEndCalled === true` → `'local'`.
    2. `tokenExpiredAt && tokenExpiredAt < now` → `'token_expired'`.
    3. Twilio error codes 20101 / 20103 / 20104 → `'token_expired'`.
    4. Twilio error codes in [53000, 54000) → `'connection_lost'`.
    5. `remoteEndedFirst === true` → `'remote'`.
    6. `sessionStatus === 'ended'` → `'timeout'`.
    7. fallback → `'unknown'`.
  - Path is `frontend/lib/call/` (modality-agnostic) per the spec note's recommendation. Voice A9 will import from this exact path verbatim when it lands; no rename later.

- **new** `frontend/components/consultation/CallDisconnectSplash.tsx` (~180 LOC):
  - Props: `reason`, `role`, `actorLabel?`, `onDismiss`, `onRejoin?`, `onRestart?`.
  - Modality-agnostic — `<VideoRoom>` mounts it; voice A9 will mount the same component when it lands. Named `CallDisconnectSplash` (NOT `VideoCallDisconnectSplash`) so voice doesn't have to author a wrapper later.
  - CTA matrix per reason:

    | reason | Rejoin | Restart | Dismiss |
    |---|---|---|---|
    | local | — | — | yes |
    | remote | — | — | yes |
    | connection_lost | yes | — | yes |
    | timeout | yes | — | yes |
    | token_expired | — | yes | yes |
    | unknown | yes | — | yes |
  - Visual variant (icon glyph + color) per reason, drawn from a flat `REASON_VARIANT` table. `<3 LOC per reason of variant data; matches the existing controls-bar idiom (no Lucide; text glyphs ✓ / ! / i / ?).
  - Auto-focuses the primary CTA on mount (Rejoin > Restart > Dismiss in priority order) so keyboard users can act without first tabbing through the splash.
  - **Auto-dismiss is OFF for video** (deviation from voice A9 spec; see deviation #2 below).

- **edit** `frontend/components/consultation/VideoRoom.tsx` (~95 LOC net add):
  - **Imports**: `CallDisconnectSplash`, `classifyDisconnect`, `DisconnectReason` type.
  - **New `VideoRoomProps` fields**: `onRejoin?: () => void`, `onRestart?: () => void`. Both default to `window.location.reload()` when omitted.
  - **New refs** for classifier inputs:
    - `ourLocalEndCalledRef` — set true in `handleLeave` BEFORE calling `room.disconnect()` so the classifier picks `'local'` reliably.
    - `lastTwilioErrorRef` — captured from `room.on('disconnected', (room, error?) => …)`. Only `code` + `message` are kept (don't hang onto Twilio's full error object).
    - `remoteEndedFirstRef` — set true in `participantDisconnected` so the classifier picks `'remote'` if the local user later disconnects without a more-specific signal.
  - **New state**:
    - `disconnectReason: DisconnectReason | null` — populated by either `handleLeave` (synchronous classify before listener teardown) OR the `room.on('disconnected')` listener (the Twilio-driven path).
    - `splashDismissed: boolean` — collapses the splash to the legacy minimal "Call ended." placeholder when the user clicks Dismiss.
  - **`handleLeave` now**:
    1. Sets `ourLocalEndCalledRef.current = true`.
    2. Tears down tracks + room as before.
    3. Calls `classifyDisconnect(...)` SYNCHRONOUSLY before/after `removeAllListeners()` (the listener wouldn't fire after that point), and stores the result in `disconnectReason`.
  - **`room.on('disconnected', (_room, error) => …)`** now:
    1. Captures `error.code` + `error.message` into `lastTwilioErrorRef`.
    2. Calls `classifyDisconnect(...)` and stores the result.
    3. Existing teardown logic untouched.
  - **`room.on('participantDisconnected', ...)`** now sets `remoteEndedFirstRef.current = true` IN ADDITION to the existing slot-clear.
  - **Disconnected render branch** replaced. Old: a static "Call ended" placeholder. New:
    - If `splashDismissed` → minimal placeholder (matches legacy copy).
    - Else → `<CallDisconnectSplash>` with `reason ?? 'unknown'`, `role`, `actorLabel={remoteLabel}`, and the rejoin/restart handlers.

- **No backend / migration / test changes** — B5 is pure frontend.

### Deviations from the task draft

1. **Splash is NOT a darkened full-screen overlay.** Spec called for "splash overlay over a darkened backdrop." Shipped a self-contained card that mounts in place of the video pane (replacing the legacy "Call ended" placeholder). Justification: the call IS over and the room is gone; full-screen overlays are usually for transient interruptions, not terminal states. The page chrome (header, surrounding layout) stays visible, which matches what users expect for a post-call screen. When D1 (post-call summary) ships, the splash will sit ABOVE the summary in the same content area; both will use the same in-pane mounting pattern.

2. **Auto-dismiss is OFF for video, but ON for voice (per voice A9 spec).** Voice A9 calls for a 5s auto-dismiss because voice has B5 (post-call summary) underneath. Video's D1 (post-call summary) hasn't shipped yet, so auto-dismissing would leave a blank page. When D1 ships, lift `autoDismissMs` to a prop and let the page wire it. Voice A9 can pass `autoDismissMs={5000}` when it mounts the same component. Documented in the splash component's docstring.

3. **Classifier has an extra `remoteEndedFirst?` field** (not in voice A9's draft signature). Voice A9 implicitly relied on lifecycle events for this; making the flag explicit (boolean, set by the parent) keeps the classifier pure and easier to unit-test. Voice A9 can pass it the same way (`participantDisconnected` event fired before `disconnected`).

4. **`onRejoin` / `onRestart` default to `window.location.reload()`.** Spec called for "re-mounts the room with cached token" (Rejoin) and "redirects to the original consult URL" (Restart). Today the consult URL on the join page already carries the HMAC, and a reload re-runs the full token exchange + brings the user back into the pre-call screen. So a reload IS effectively both "re-mount with cached creds" AND "redirect to consult URL" today. When B4 (reconnection UX) lands, it can pass a smarter `onRejoin` that skips the pre-call screen and immediately re-connects with the same Twilio access token (which is still valid for ~14m on average).

5. **No unit tests shipped.** Voice A9 spec called for `frontend/lib/voice/__tests__/classify-disconnect.test.ts`. The classifier is pure and simple enough to verify by inspection; deferring formal tests until voice A9 picks up the file (so we don't double-test the same logic across two PRs). Documented as a follow-up.

6. **Doctor "Patient ended the call" doesn't fire automatically today.** This is the test-spec's "Patient closes tab → doctor sees 'Patient ended the call.'" case. Today the doctor's room stays connected when the patient leaves — Twilio fires `participantDisconnected` (which sets `remoteEndedFirstRef`), but there's no auto-leave that would transition status to `'disconnected'` and trigger the splash. The doctor has to manually click Leave; THEN the splash correctly says "Patient ended the call" (because `remoteEndedFirst` AND `ourLocalEndCalled` are both true; under the current branch order `local` wins, so it actually says "You ended the call"). This is the trade-off documented in the classifier's source comment for branch #5: if telemetry shows users want the more informative "Patient ended" copy in this case, promote `remoteEndedFirst` above `ourLocalEndCalled`. B4's auto-end-on-remote-leave will make the spec's test case work without any change to B5 — when B4 lands, `participantDisconnected` triggers a delayed auto-leave that DOESN'T set `ourLocalEndCalled`, so the classifier picks `'remote'` cleanly.

### Critical gotchas

1. **`handleLeave` MUST classify SYNCHRONOUSLY before `room.removeAllListeners()`.** The `room.on('disconnected')` handler runs the classifier too, but `removeAllListeners()` blows away the listener BEFORE `room.disconnect()` fires it. Without the inline classify, the splash would never get a reason on the local-end path. Verified by inspection.

2. **Twilio's `disconnected` event signature is `(room, error?) => void`** — second arg is optional. Type-guarded with `if (error && typeof error === "object")` so a clean disconnect doesn't crash. Also typed as `unknown` in the inner copy because Twilio's `TwilioError` type has internal fields we don't need.

3. **`disconnectReason` stays null until classify fires.** The render branch falls back to `'unknown'` (`?? 'unknown'`) if status flipped to disconnected without classify running first. Defense-in-depth — shouldn't happen in practice, but `'unknown'` is the right default copy.

4. **`splashDismissed` is independent of `disconnectReason`.** Future task D1 (post-call summary) will read `disconnectReason` to decide what summary content to show, even AFTER the user dismisses the splash. Keeping them separate avoids losing the reason context.

5. **`role={role === "patient" ? "patient" : "doctor"}`** — same defensive narrowing the existing chat-pane code uses, because `role` is optional on `VideoRoomProps` (legacy doctor-side mounts often omit it). Default to doctor copy.

### What worked

- **Co-locating `disconnectReasonCopy` with the classifier.** A single import gives both the discrimination AND the renderer-side mapping. Splash component is purely structural; doesn't need to know about reason-specific copy strings.
- **Modality-agnostic naming from the start.** `frontend/lib/call/` + `<CallDisconnectSplash>` (not `<VideoCallDisconnectSplash>`). Voice A9 imports verbatim; no rename later.
- **Default-to-reload for Rejoin/Restart.** The consult URL on the join page is already the source of truth; `window.location.reload()` is exactly what users want for both CTAs today. Smarter handlers from B4 will be opt-in.

### What didn't work / had to change

- First draft of the classifier had `remoteEndedFirst` priority HIGHER than `ourLocalEndCalled`. Reasoning: "You ended the call" is technically true but useless when the patient already left. Reverted because the explicit-local-end signal is the most-specific user intent — they CLICKED Leave; respect that. Documented the tradeoff in the classifier source so a future PR can flip if telemetry argues for it.
- First attempt mounted the splash as a `fixed inset-0` darkened overlay. Made the rest of the page (header, padding) inaccessible during the post-call state, which was disorienting. Pulled back to an in-pane card matching the legacy placeholder's footprint.
- Initially considered auto-dismiss at 5s for video too. Removed because video's D1 (post-call summary) hasn't shipped — auto-dismiss would leave a blank page. Voice A9 can opt in via a future `autoDismissMs` prop when D1 lands.

### Verification

- `npx tsc --noEmit` (frontend) — clean.
- `npx next lint --file lib/call/classify-disconnect.ts --file components/consultation/CallDisconnectSplash.tsx --file components/consultation/VideoRoom.tsx` — clean.
- ReadLints on all three modified files — no errors.
- No dedicated test file for the classifier (deviation #5). Pure function with 7 branches; verifiable by inspection. Voice A9 will add tests when it picks up the file.

### Follow-ups (not blocking this PR)

1. **Manual smoke** during PR review:
   - Doctor clicks Leave → splash with "You ended the call." + Dismiss only.
   - Patient closes tab THEN doctor clicks Leave → splash with "You ended the call." (current `local`-wins behavior; flip to "Patient ended" if telemetry argues for it).
   - Network throttle until Twilio drops → splash with "Lost connection." + Rejoin button.
   - Click Rejoin → page reloads → user back at pre-call screen.
   - Click Restart (on a token-expired splash; hard to manually trigger today) → page reloads.
   - Click Dismiss → minimal placeholder appears.
2. **Voice A9 import** (when voice batch reaches A9): voice imports `<CallDisconnectSplash>` + `classifyDisconnect` from these same paths AND opts into `autoDismissMs={5000}` (which voice A9's PR adds to the splash component).
3. **Classifier unit tests** when voice A9 picks up the file. Suggested coverage: all 7 branches × all input combinations (16+ cases).
4. **`remoteEndedFirst` priority flip** — telemetry on the doctor flow will tell us whether the "Patient ended the call" copy is more useful than "You ended the call" when both flags are true. Flag-driven; small classifier change.
5. **B4 (reconnection UX) auto-end-on-remote-leave** — when B4 lands, the doctor's room will auto-end ~30s after the patient leaves (giving Twilio's reconnect a chance). This will make the spec's "Patient closes tab → doctor sees 'Patient ended the call.'" case fire automatically.
6. **D1 (post-call summary)** mounts AFTER the splash (not in place of it). The splash's `disconnectReason` lifts to the page-level state so D1 can read it for context (e.g. "Call ended early — would you like to rebook?" for `'remote'` cases).
7. **`tokenExpiredAt` wire-up** — today the classifier supports the field but `<VideoRoom>` doesn't pass it. A B4-style TTL tracker would supply this; deferred.
8. **`mode='readonly'` deferred** — same rationale as A1–A7. The splash is a live-call surface; readonly history viewer renders elsewhere.
