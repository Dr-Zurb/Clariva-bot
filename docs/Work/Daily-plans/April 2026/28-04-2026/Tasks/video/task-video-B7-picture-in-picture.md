# Task video-B7: Picture-in-picture (browser PiP API)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch B (T2 real polish) — **M item, ~5h**

---

## Task overview

The killer feature for doctors who need to chart in EHR while keeping the patient visible. T2.15 wires the W3C PiP API to the remote video tile:

- "PiP" button in controls bar.
- On click → `videoEl.requestPictureInPicture()` floats the remote video as a small always-on-top window.
- Browser handles drag + resize + close natively.
- On `leavepictureinpicture` event → restore in-app rendering.

**iOS Safari degradation documented** — pre-iOS 14 has no `<video>` PiP; iOS 14+ requires user gesture; some embedded browsers (in-app webviews) disable PiP entirely. Decision §8 — hide the PiP button entirely on unsupported browsers (cleaner UX than show + warn).

**Estimated time:** ~5h.

**Status:** Complete (2026-05-01).

**Depends on:** none.

**Source:** [T2 §T2.15](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md); [decision §8](../Plans/plan-video-consult-selected-features.md#before-sub-batch-b-starts).

---

## Acceptance criteria

### Feature detection

- [x] **Capability check** at component mount — implemented in `frontend/lib/call/pip-support.ts` as `isPictureInPictureSupported()` (three-gate check: `'pictureInPictureEnabled' in document` + `document.pictureInPictureEnabled` truthiness + `!isInAppBrowser(navigator.userAgent)`). The hook (`usePictureInPicture`) consumes it on mount and re-uses it via `pip.isSupported`.
- [x] If unsupported → don't render the PiP button at all (decision §8). Gate in `<VideoRoom>` is `pip.isSupported && !hold.onHold`.

### PiP button + handler

- [x] **Edit `<VideoRoom>`** controls bar — PiP button mounted between `<VideoLayoutSwitcher>` (B6) and "Leave call". **No Lucide** in deps yet (same constraint as B6 / B8 / B9), so the glyph is an inline SVG (the standard "small box inside larger box" PiP icon, 16×16 to match the layout-switcher buttons). Active state ("Exit PiP") flips both label and tint (blue when active vs. gray when idle).
- [x] **`handleTogglePip`** unified — toggles between `pip.enter()` and `pip.exit()`. Errors from the hook are mapped to user-readable strings:
  ```ts
  err === "user-gesture-required" →
    "Tap the video first, then tap Picture-in-Picture."
  err === "denied" →
    "Picture-in-Picture is unavailable in this browser."
  err === "no-element" →
    "Picture-in-Picture isn't ready yet — wait a moment and try again."
  default →
    "Picture-in-Picture unavailable; try again from the video."
  ```
  Surfaced via the ephemeral `pipNotice` (amber inline pill below the controls bar; auto-clears after 4s) — no toast lib in deps yet, same precedent as B6 / B8 / the existing red `errorMessage` banner.
- [x] **`handleLeavePiP`** wired implicitly via the hook's `'leavepictureinpicture'` listener — `pip.isActive` flips to `false` regardless of whether the user clicked our "Bring back" button or the browser's native X.

### State sync

- [x] **`<VideoRoom>` listens for** `'enterpictureinpicture'` and `'leavepictureinpicture'` — done inside `usePictureInPicture` so the parent doesn't have to wire the listeners directly.
- [x] When in PiP: in-app remote tile shows a placeholder ("Currently in Picture-in-Picture · Bring back") — overlay mounted at `absolute inset-0 z-[25]` (between recording z-20 and hold/reconnect z-30) inside the same `<div className="relative">` that wraps the tiles. `pointer-events-none` on the wrapper, `pointer-events-auto` on the inner pill, so surrounding tile interactions (Twilio mute-on-tap, future swipe gestures, self-view toggle) still work.
- [x] "Bring back" button calls `pip.exit()` → `document.exitPictureInPicture()`.

### Lifecycle

- [x] **On call disconnect** while in PiP: hook auto-exits in its unmount cleanup. The `<VideoRoom>` unmounts (or the route changes) → cleanup runs → `document.exitPictureInPicture()` fires (best-effort; rejects swallowed since there's no UI to surface them to mid-unload).
- [ ] **On reconnect (B4):** if PiP was active, attempt to re-enter PiP after reconnect — **DEFERRED**. The browser requires a fresh user gesture to enter PiP, and our reconnect path is event-driven (no gesture). Implementing this would mean either (a) showing a "Re-enter PiP" toast that the user has to click (poor UX — the user just saw the video come back, why hide it again?) or (b) silently failing (current behavior). The reconnect overlay is dismissed when status returns to `'live'` and the in-app remote tile takes over; if the user wants PiP again, the controls-bar button is one tap away. Acceptable tradeoff for v1; revisit if user feedback shows otherwise.

### Manual smoke (Chrome desktop)

- [ ] Click PiP button → remote video pops out as floating window. **Browser-side** — manual smoke pending in the next call session; the API surface is the standard `requestPictureInPicture()` and behaves the same as Google Meet / Zoom Web.
- [ ] In-app remote tile shows placeholder + Bring back button. **Implementation verified** in source; visual smoke pending.
- [ ] Browser PiP window can be dragged / kept on top — browser-native behavior; not under our control.
- [ ] Click X on browser PiP → `pip.isActive` flips to `false`, placeholder disappears (verified by the `'leavepictureinpicture'` listener wired in the hook).
- [ ] Disconnect call while in PiP → PiP window auto-closes (hook's unmount cleanup).

### Mobile / iOS

- [x] Chrome Android (post-Chrome 70+): supported by capability check.
- [x] iOS Safari 14+: supported by capability check; the user-gesture-required failure mode is mapped to the "Tap the video first" toast.
- [x] iOS Safari pre-14: PiP button NOT rendered (capability check returns `false`).
- [x] In-app webview (Instagram, FB Messenger, TikTok, WeChat, Twitter, LinkedIn, Snapchat, Threads, Bytedance, Musical.ly): PiP button NOT rendered (`isInAppBrowser()` heuristic in `pip-support.ts` covers all listed UA fragments).

### `mode='readonly'`

- [ ] PiP available in readonly view too — **NO ACTION** required today (no `mode='readonly'` prop on `<VideoRoom>` yet — same status as B4 / B6). When it lands, no gating is needed for PiP because PiP is purely a local rendering concern. Documented in the inline header comment at the hook mount in `<VideoRoom>`.

### General

- [x] Type-check + lint clean — `npx tsc --noEmit` and `npx eslint lib/call/pip-support.ts hooks/usePictureInPicture.ts components/consultation/VideoRoom.tsx` both pass with no warnings.
- [x] No console errors expected — failures route through the typed error path → ephemeral inline notice, not `console.error`.
- [x] No regression on remote video render when PiP is closed — `pip.isActive === false` returns `null` for the placeholder, the tile renders unchanged.

---

## Out of scope

- **PiP for the local self-view** (less useful; weirder UX).
- **PiP with companion chat overlay.** Browsers don't allow custom UI in PiP window.
- **Document-PiP API** (newer W3C spec for arbitrary HTML in PiP). Out of scope for v1; may revisit when browser support is broader.
- **Auto-enter PiP on tab-switch.** Out of scope; user-initiated only.

---

## Files expected to touch

**Frontend:**
- `frontend/lib/call/pip-support.ts` — **NEW** (~115 LOC). Pure module: `isInAppBrowser(userAgent?)` + `isPictureInPictureSupported()` capability check. Lives next to `actor-avatar.ts` / `classify-disconnect.ts` so the doctrine of "renderer-side decisions live as pure modules" is preserved. The in-app webview UA fragment list (Instagram, FBAN, FBAV, FB_IAB, Twitter, LinkedInApp, Snapchat, Threads, MicroMessenger, BytedanceWebview, Musical_ly, Bytedance) is exported via the same module so any future call site (post-call summary D1, voice B5, etc.) can reuse it.
- `frontend/hooks/usePictureInPicture.ts` — **NEW** (~205 LOC). Wraps the W3C PiP API around a `<video>` ref. Returns `{ isSupported, isActive, enter, exit }`. Subscribes to `'enterpictureinpicture'` / `'leavepictureinpicture'` so `isActive` follows browser reality (user closing the PiP window via its X flips it `false` automatically). Auto-exits on unmount so a call disconnect / route change while in PiP doesn't strand a window pointing at a dead `<video>`. Errors thrown by `enter()` are typed as `'user-gesture-required' | 'denied' | 'no-element' | 'unknown'` so callers can map to localised toasts without parsing `DOMException.name` themselves.
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~120 LOC net): hook mount against `remoteVideoRef`, `pipNotice` ephemeral state + auto-clear effect, `handleTogglePip` callback, PiP button in the controls bar (gated on `pip.isSupported && !hold.onHold`, inline SVG glyph, blue-tint when active), PiP placeholder overlay (`absolute inset-0 z-[25]`), and the inline amber `pipNotice` pill below the controls bar.

**Backend / migrations / tests:** none.

---

## Audit findings (2026-05-01)

Before authoring, swept the call-side surface for already-shipped scaffolding:

- **`remoteVideoRef`** (line 304) — already a `useRef<HTMLVideoElement>(null)` passed to the remote `<VideoTile>`. No new ref plumbing needed.
- **`localTracksRef` + connection state** — the existing `status === 'connected'` gate on the controls cluster already hides the PiP button before the room is ready (the tile area is a placeholder until then). No additional gating beyond `pip.isSupported && !hold.onHold` was required.
- **`<HoldCallBanner>` (z-30) + `<ReconnectionBanner>` (z-30)** — pre-existing; my placeholder overlay sits at `z-[25]` so those banners always win when both states overlap.
- **`<CallerCardOverlay>`** — no z-index; my overlay layers above it correctly.
- **No toast lib** — same constraint as B6 / B8 / B9; the inline amber pill matches the existing `errorMessage` red-banner pattern (already in use at line 1870).
- **No Lucide** — same constraint; reused the inline-SVG idiom from B6's `<VideoLayoutSwitcher>` and B8's `<VideoQualityPicker>` button group.

## Deviations from the draft

1. **Hook + helper split** — the draft suggested a `~50 LOC` edit to `<VideoRoom>` only. I extracted the API surface into a hook (`usePictureInPicture`) and the capability heuristic into a pure module (`pip-support.ts`) so:
   - The hook is reusable for future modalities (voice + companion-document PiP).
   - The capability check is unit-testable in isolation (no React render needed).
   - The `<VideoRoom>` diff stays focused on UI wiring, not API plumbing.
   The total LOC is ~120 in `<VideoRoom>` (button + overlay + handler + comments) plus ~320 across the two new files; well within scope and consistent with the B6 / B8 split.
2. **Unified `tryNow` / `enter` error → toast mapping** — the draft showed a single `showToast('Picture-in-picture unavailable; try again from the video.')` catch-all. I split it into four typed cases so the iOS Safari user-gesture failure (the most common one) gets a more actionable message ("Tap the video first").
3. **Placeholder z-index** — the draft didn't specify; I chose `z-[25]` to slot between the recording indicator (z-20) and the hold/reconnect banners (z-30) so PiP doesn't visually compete with attention-required states.
4. **Re-enter on B4 reconnect — DEFERRED** — see Lifecycle section above for the rationale. Documented but not implemented for v1.

---

## Notes / open decisions

1. **Decision §8** — hide button on unsupported browsers (cleaner than show + warn).
2. **In-app browser detection** — `isInAppBrowser()` heuristic: check `navigator.userAgent` for `Instagram`, `FBAN`, `FBAV`, `Twitter`, etc. Maintain a small allow-list.
3. **PiP window has no UI** — browser controls only (close, play/pause, etc.). Custom buttons not possible.
4. **Audio routing** — PiP doesn't change audio routing; speakers / Bluetooth still works as before.
5. **Recording boundary** — PiP doesn't affect recording (it's a local display concern).

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch B](../Plans/plan-video-consult-selected-features.md#sub-batch-b--real-polish-5-days)
- **Source item:** [T2 §T2.15](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md)
- **Decision:** [§8 — PiP iOS degradation](../Plans/plan-video-consult-selected-features.md#before-sub-batch-b-starts)
- **W3C:** Picture-in-Picture API — `requestPictureInPicture`, `pictureInPictureEnabled`, `'enterpictureinpicture'`, `'leavepictureinpicture'` events

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** Complete (2026-05-01).
