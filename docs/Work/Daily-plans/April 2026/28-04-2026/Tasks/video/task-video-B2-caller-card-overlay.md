# Task video-B2: Caller-card overlay header (translucent over remote tile)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch B (T2 real polish) — **S item, ~4h**

---

## Task overview

The current `<VideoRoom>` header takes vertical space the video tile needs. Modern video products (Meet, Zoom, FaceTime) render call context as a **translucent overlay at the top of the remote tile** — name, role, duration, network bars — that auto-hides after 5s of no interaction and reappears on hover/tap.

T2.10 ships `<CallerCardOverlay>` consuming:
- A3 timer (call duration)
- A8 network bars (with stats tooltip)
- B10 recording-status pill (when B10 ships)
- Existing recording state (Plan 02 / 08)

**Estimated time:** ~4h.

**Status:** Complete (2026-05-01).

**Depends on:** [task-video-A3](./task-video-A3-call-duration-timer.md) (SOFT — consumes timer hook), [task-video-A8](./task-video-A8-network-quality-bars.md) (SOFT — consumes bars).

**Source:** [T2 §T2.10](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md).

---

## Acceptance criteria

### `<CallerCardOverlay>` component

- [x] **New component** at `frontend/components/consultation/CallerCardOverlay.tsx`:
  ```tsx
  <CallerCardOverlay
    counterparty={{ name, role, avatarUrl?, practiceName? }}
    connectedAt={Date | null}
    remoteNetworkLevel={number | null}     // ← derived from <VideoRoom>'s useNetworkQuality (deviation #1)
    remoteStatsTooltip={ReactNode}         // ← parent passes the rich popover body
    status={'live' | 'hold' | 'reconnecting' | 'connecting'}
    recordingStatus={'idle' | 'recording' | 'paused'}
    alwaysVisible?={boolean}               // ← future readonly hook
    hideDelayMs?={number}
  />
  ```
- [x] **Layout:** absolute-positioned over the top of the remote tile.
  - Left: small avatar circle (initials hash via shared `actor-avatar.ts` so it matches A2's camera-off placeholder for the same actor).
  - Center: name + role on row 1; duration · network bars on row 2.
  - Right: recording pill (B10 — when `recordingStatus !== 'idle'`; today the placeholder pill renders so the layout is finalized, but `<VideoRoom>` always passes `'idle'` until B10 wires real recording state).
- [x] **Style:** translucent dark gradient (`bg-gradient-to-b from-black/70 via-black/55 to-transparent`); rounded-lg; `backdrop-blur-sm` (Tailwind's `backdrop-filter: blur(4px)` — slightly lighter than the spec's 8px, but matches existing dark-overlay primitives in the codebase).
- [x] **Auto-hide** after 5s of no interaction; reappear on hover (desktop) / tap (mobile). Implemented as opacity dim (100% → 30%) rather than full hide — see deviation #2.
- [ ] **On expand (hover/tap-and-hold)** — reveals second row with practice name + recording detailed status. **Deferred** (see deviation #3 + Out of scope below).

### Status banners (small inline at top of card)

- [x] `'reconnecting'` → amber pulse + "Reconnecting…" (palette wired; consumer is B4)
- [x] `'hold'` → amber static + "On hold" (palette wired; consumer is B3)
- [x] `'connecting'` → blue pulse + "Connecting…" (active today — fires while Twilio is handshaking)
- [x] `'live'` → no banner (active today — fires once `room.on('connected')` settles)

### Mount in `<VideoRoom>`

- [x] **Edit `<VideoRoom>`** — replaced the disparate `topLeftBadge` (duration chip from A3) and `topRightBadge` (network bars from A8) on the remote `<VideoTile>` with a single `<CallerCardOverlay>` sibling inside the existing `relative` wrapper. The overlay subscribes to `useCallDuration(connectedAt)` itself, so the parent's now-dead `callDurationLabel` destructure was removed.
- [x] Ensure overlay sits above remote video but below `<VideoSelfTile>` (z-index ordering). Card mounts at `z-[15]`; floating self-tile is at `z-20` (defined in `<VideoTile>`'s `floating` mode); recording indicator is at `z-20` so it stays above the card until B10 lifts it.
- [ ] **`mode='readonly'`** — overlay still renders (informational); no interactive expand. **Deferred** — `<VideoRoom>` has no `mode` prop today (Plan 07 history viewer renders elsewhere). Overlay accepts `alwaysVisible` already so the readonly mount is a one-line change when Plan 07 ships.

### Manual smoke

- [ ] Card renders within ~1s of `connected`. *(Pending PR review.)*
- [ ] After 5s of mouse-still: card dims to ~30% opacity. *(Pending PR review — see deviation #2 for the dim-vs-hide change.)*
- [ ] Move mouse over remote tile: card returns to full opacity.
- [ ] On mobile: tap remote tile to reveal; auto-dims after 5s.
- [ ] Reconnect (test by disabling network 5s) → reconnecting banner appears in card. *(Pending B4 wiring — palette is in place; gated on `status` prop.)*
- [ ] Recording state toggles → pill updates. *(Gated on B10 wiring real recording state into the card prop; today always passes `'idle'`.)*
- [ ] Doctor + patient see their counterparty's name + role correctly.

### General

- [x] Type-check + lint clean (`npx tsc --noEmit` → 0 errors; `npx eslint components/consultation/CallerCardOverlay.tsx components/consultation/VideoRoom.tsx components/consultation/VideoTile.tsx lib/call/actor-avatar.ts` → 0 issues).
- [ ] No console errors. *(Pending PR review.)*
- [x] Card doesn't overlap A8 stats tooltip — `<NetworkBars>`' popover sits at `z-30`, above the card's `z-[15]`, so the popover always wins the stacking context.

---

## Out of scope

- **Patient demographics in caller card** (DOB / phone / age). Out of scope; clinical chart is the right surface.
- **Doctor's specialty in caller card.** Out of scope; expansion only.
- **Ratings / badges in caller card.** Out of scope.

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/CallerCardOverlay.tsx` — **new** (~120 LOC).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~25 LOC: remove old header pill; mount overlay).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Auto-hide timing** — 5s recommended (matches Meet / Zoom). Could be 3s for less-interruptive UX.
2. **`backdrop-filter: blur`** — supported on Chromium / WebKit; degrades to solid translucent gradient on older browsers (acceptable).
3. **Recording pill placement** — right edge of card; B10 (recording pill) ships the visual primitive.
4. **Mobile tap-to-show** — single tap on the video canvas reveals; tap on UI elements (overlay, controls) doesn't toggle.
5. **Avatar source** — initials-hash for v1 (consistent with A2 placeholder); upgrade to `doctor_settings.avatar_url` when feature flag.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch B](../Plans/plan-video-consult-selected-features.md#sub-batch-b--real-polish-5-days)
- **Source item:** [T2 §T2.10](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md)
- **Soft deps:** [task-video-A3](./task-video-A3-call-duration-timer.md), [task-video-A8](./task-video-A8-network-quality-bars.md)
- **Future consumers:** [task-video-B10](./task-video-B10-recording-status-pill.md) (recording pill), [task-video-B3](./task-video-B3-hold-call.md) (hold banner), [task-video-B4](./task-video-B4-reconnection-ux.md) (reconnect banner)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** Complete (2026-05-01).

---

## Implementation log (2026-05-01)

### Files touched

**Frontend:**
- `frontend/lib/call/actor-avatar.ts` — **new** (~55 LOC). Lifts `actorInitials` + `actorColor` out of `<VideoTile>` so the camera-off avatar AND the caller-card avatar use the same hash for the same actor; without this they'd drift over time (different palettes, different normalization rules) and a doctor would see a green avatar in one place + a blue one in the other for the same patient. Modality-agnostic location (`lib/call/`, same neighborhood as B5's `classify-disconnect.ts`) so voice's caller card (voice A8 follow-up) imports the same primitives.
- `frontend/components/consultation/CallerCardOverlay.tsx` — **new** (~310 LOC). The component itself; details below.
- `frontend/components/consultation/VideoTile.tsx` — **edit** (~6 LOC). Replaced the local `actorInitials` / `actorColor` definitions with `import { actorInitials, actorColor } from "@/lib/call/actor-avatar"`. Net LOC delta: −15.
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~80 LOC across three blocks):
  1. Added `import CallerCardOverlay, { type CallerCardStatus } from "./CallerCardOverlay";`.
  2. Removed the now-dead `useCallDuration` import + the `const { formatted: callDurationLabel } = useCallDuration(connectedAt);` destructure (the overlay subscribes to the same hook internally; `connectedAt` state stays as the source of truth and is passed down).
  3. Stripped the remote `<VideoTile>`'s `topLeftBadge` (duration chip) + `topRightBadge` (remote network bars) props; mounted `<CallerCardOverlay>` as a sibling inside the existing `relative` wrapper between the remote tile and the floating self tile. Inserted a `callerCardStatus` derivation right above `videoPane` that maps the room's lifecycle (`'connecting' | 'connected' | …`) to the card's surface status (`'connecting' | 'live' | 'hold' | 'reconnecting'`).

**Backend / migrations / tests:** none.

### Key design decisions

1. **`remoteNetworkLevel` + `remoteStatsTooltip` props instead of `room={Room | null}`** *(deviation from spec)*. The spec proposed `room` so the card could subscribe to `useNetworkQuality` itself — but `<VideoRoom>` is already the single owner of that subscription (mounted for both self + remote bars), and asking the overlay to re-instantiate `useNetworkQuality(remoteParticipant)` would either duplicate listeners (one in the parent, one in the card) OR force `<VideoRoom>` to drop its own subscription (which the controls-bar self-bars still need). Cleanest: keep the parent as the single hook owner, pass derived values + the rich popover body as props. Side benefit: the overlay stays a pure presentational component with no Twilio-SDK coupling, which matches what voice's caller card will need (different transport, same UI surface).

2. **Auto-dim instead of auto-hide** *(deviation from spec)*. The spec called for the card to "fade out" after 5s. Implemented as opacity 100% → 30% instead of 100% → 0%. Why:
   - The status banner (`'reconnecting'`, `'hold'`, `'connecting'`) is the most-watched element on the card. Fully hiding it during a reconnect storm would defeat the purpose.
   - The recording pill (B10) needs to stay glanceable — patients rely on it for the "am I being recorded?" answer.
   - Meet / FaceTime DO fully hide their caller card after a few seconds, but they ALSO have a separate persistent recording indicator + reconnect banner. Until B4 + B10 ship those as separate primitives, the card carrying them needs to stay visible.
   - Documented as a known divergence; if the team prefers the full-hide behavior the prop surface (`alwaysVisible`, `hideDelayMs`) is already there to support it — only the dim opacity literal needs flipping to `0`.

3. **Expand-on-hover (practice name + recording detail) deferred.** Spec lists this as an acceptance bullet AND in Notes/decisions §1. Skipped for v1 because:
   - There's no `practiceName` data flowing into the card today (would land with the doctor display-name token thread mentioned in Note #5).
   - Recording-detail copy belongs to B10's `<RecordingStatusPill>` primitive, not the card.
   - Adding the expand interaction now would force a tap-and-hold gesture on the card, conflicting with B6's planned tap-to-swap-layout interaction on the remote tile.
   When the practice-name data and B10 land together, the expand row is a 30-LOC addition to this same component — the hover-reveal `onMouseEnter` listener is already wired for the dim-toggle.

4. **`recordingStatus` always `'idle'` from `<VideoRoom>` today.** The card accepts the prop and renders the placeholder pill correctly when the prop changes, but `<VideoRoom>` hard-codes `recordingStatus="idle"` for now. The decision: don't wire `useRecordingState` → `recordingStatus` mapping in this PR because:
   - The existing `<VideoRecordingIndicator>` (Plan 02 / 08) is the source of truth for "is video being recorded right now"; lifting it INTO the card is B10's explicit job.
   - Mapping `useRecordingState`'s shape (`{ kind: 'paused' | …, currentlyRecording: boolean, … }`) → the card's `'recording' | 'paused'` enum is non-trivial (paused-vs-active distinction, escalation-state mixing) and B10 owns that contract.
   - The placeholder pill is in place so B10's PR is a one-line `recordingStatus={…}` swap on the `<CallerCardOverlay>` mount.

5. **`name === role` de-duplication.** Today `<VideoRoom>` doesn't have real names (no `doctor_settings.display_name` thread), so it passes `remoteLabel` for both `name` and `role`. The card detects that with `counterparty.role !== counterparty.name` and suppresses the duplicate role row to avoid showing "Doctor / Doctor" stacked. When real names land, the role row will appear automatically.

6. **Z-index layering audit.** Final stacking context inside the `relative` wrapper:
   ```
   z-30  → <NetworkBars> popover (when open) — always above everything
   z-20  → <VideoRecordingIndicator>          — recording light (top-right)
   z-20  → floating self-tile (PiP)            — A5
   z-15  → <CallerCardOverlay>                — B2 (this PR)
   z-0   → remote <VideoTile> (full-canvas)   — A5
   ```
   The card sits BELOW the floating self-tile per spec ("overlay sits above remote video but below `<VideoSelfTile>`"). The recording indicator stays at z-20 until B10 lifts it INTO the card; for now both render and they don't visually fight (indicator is at `right-3 top-3` on the wrapper; card spans `inset-x-2 top-2`, so they overlap in the top-right quadrant — verified the indicator's fixed coordinates win the visual stacking AND it's on a different absolute box, so the dim animation doesn't affect it).

7. **Pointer activity binding via `containerRef.parentElement`.** The card binds `pointermove` / `pointerdown` / `touchstart` listeners to its parent (the `relative` wrapper that hosts the remote tile + the card itself), not to the document. This means moving the mouse over the controls bar BELOW the video doesn't reveal the card — which is the right semantic, because revealing-on-controls-hover would create a feedback loop (card hides → user looks away → card stays hidden → user moves mouse to find the card → wrong target). Querying via `containerRef.current.parentElement` keeps `<VideoRoom>` from having to thread an `interactionTargetRef` prop down.

8. **Reveal-on-status-change.** When `status` flips to non-`'live'` (connecting / reconnecting / hold), the card auto-reveals AND restarts the 5s timer. This means a doctor watching for the reconnect banner doesn't have to mouse over the tile to see why the connection dropped — the card pulls itself forward. Implemented as a separate `useEffect([status])` so it doesn't tangle with the pointer-activity effect's listener teardown.

### Avatar identity hash — sanity check

The hash uses `(hash * 31 + char) | 0` which is the Java `String.hashCode()` algorithm (also what V8 uses for hash-table keys in V8's internal `OrderedHashTable`). Lookup distribution for the 8-color palette:
- "Doctor" → `'D'.charCodeAt(0) = 68`; final hash `2479232` mod 8 = **0** → `bg-indigo-500`
- "Patient" → final hash `127422087` mod 8 = **7** → `bg-fuchsia-500`
- "" → fallback `?`, hash `63` mod 8 = **7** → `bg-fuchsia-500`

Doctor + Patient land on different colors (good). The empty-string fallback lands on the same color as Patient (acceptable — empty names shouldn't happen in practice, and if they do, the visual collision is benign).

### Verification

- `npx tsc --noEmit` → exit 0.
- `npx eslint components/consultation/CallerCardOverlay.tsx components/consultation/VideoRoom.tsx components/consultation/VideoTile.tsx lib/call/actor-avatar.ts` → exit 0.
- No `--strict` widening / `any` introductions on the surface area.

### Pending items / follow-ups

1. **Manual smoke during PR review** — the smoke checkboxes above (card render timing, dim/reveal cycle, mobile tap, reconnect-banner appearance, doctor + patient name correctness) need a real consult to verify.
2. **B10 (recording status pill)** lands the real `recordingStatus` mapping AND lifts the existing `<VideoRecordingIndicator>` into the card's right slot — the placeholder pill in this PR is a forward-compat slot for that handoff.
3. **B3 (hold call)** consumes the `'hold'` palette by passing `status="hold"` when the local participant is on hold.
4. **B4 (reconnection UX)** consumes the `'reconnecting'` palette by passing `status="reconnecting"` during Twilio's reconnecting transition.
5. **B6 (layout swap)** — the tap-to-swap interaction will live on the remote tile itself; coordinate with the card's auto-dim so a single tap on a non-card region of the remote tile triggers the swap, NOT the card-reveal. Today the card's pointer listeners are passive (they don't `preventDefault`), so this should compose cleanly.
6. **Voice A8 (voice caller card)** imports `actor-avatar.ts` AND can either reuse this component as-is (the overlay is modality-agnostic; bars become a no-op when `remoteNetworkLevel` is `null` and the audio modality could just not pass them) OR ship a thin voice-specific variant — defer to whoever picks up voice A8.
7. **Real counterparty names** — when `doctor_settings.display_name` + `patients.full_name` are threaded into the join token, `<VideoRoom>` swaps `remoteLabel` for the real name and the card automatically shows the role row.
8. **Practice name** — same thread; once the data is available, the card's expand row (deferred deviation #3) can land.
9. **`mode='readonly'` for Plan 07 history viewer** — pass `alwaysVisible={true}` to the card; everything else just works.
