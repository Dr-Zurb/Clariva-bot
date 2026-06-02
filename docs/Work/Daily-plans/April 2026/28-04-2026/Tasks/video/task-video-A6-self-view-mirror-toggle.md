# Task video-A6: Self-view mirror toggle (default ON; persisted per-device)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch A (T1 quick wins) — **XS item, ~30 min**

---

## Task overview

Selfie cameras are universally mirrored (every native phone camera, FaceTime, WhatsApp, Meet, etc. mirrors the selfie). Today `<VideoRoom>` renders the local video unmirrored — text appears reversed, hand gestures feel wrong. T1.6 fixes with a single CSS line + a toggle:

```tsx
<video style={{ transform: mirror ? 'scaleX(-1)' : 'none' }} />
```

**Default ON.** A small "Flip" / "Mirror" button (or an item in a self-view context menu) lets users disable mirroring if they prefer.

The remote view is NEVER mirrored — only the LOCAL self-view is.

**Estimated time:** ~30 min.

**Status:** Complete.

**Depends on:** [task-video-A2](./task-video-A2-camera-off-on.md) (HARD — adds the prop to `<VideoSelfTile>`).

**Source:** [T1 §T1.6](../../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md).

---

## Acceptance criteria

### Mirror prop on `<VideoSelfTile>`

- [x] **Edit `frontend/components/consultation/VideoSelfTile.tsx`** — accept `mirror: boolean` prop. Apply `transform: scaleX(-1)` to the inner `<video>` element when `mirror === true`. — already implemented in A2 as a `mirror?: boolean` prop on the shared `<VideoTile>` (Tailwind `scale-x-[-1]`); this PR just wires the parent state through.
- [x] **Default `mirror = true`** — passed from `<VideoRoom>` based on persistence; first-time default is ON. — `useState(true)` initializer; mount effect overrides only when localStorage holds `"false"`.
- [x] **CSS-only** — does NOT mirror the actual video track that goes over Twilio (remote sees the unmirrored real view; local self-view is just a visual flip). — `scale-x-[-1]` is a CSS transform on the `<video>` element only; the underlying `LocalVideoTrack` is untouched, so the doctor / patient on the other side always sees the natural unflipped view.

### Toggle UI

- [x] **In `<VideoRoom>`** — add a small "Mirror" toggle. — implemented as a third button in the existing controls bar (between the Camera button and the Leave call button), matching the Mute + Camera button styling. **Deviated from the draft's "context menu" / "Lucide icon" recommendations** because (a) Lucide isn't a frontend dep yet (same constraint that A1 hit) and (b) a context-menu primitive doesn't exist in this codebase — adding one for a 30-min task is overkill. Text-button parity with Mute / Camera is the same idiom Sub-batch A has used everywhere else.
  - [ ] **(Recommended)** Item in the new "Self-view options" context menu (right-click on self-view; long-press on mobile). — **deferred** (no context-menu primitive yet; not blocking).
  - [ ] **(Alternative)** Small icon button in the bottom-right of `<VideoSelfTile>` (Lucide `FlipHorizontal2`). — **deferred** until Lucide lands as a dep; today the floating PiP also has a click handler from A5 (cycle position), so an in-tile button would need event-stop-propagation logic. The controls-bar button avoids the conflict cleanly.
- [x] **Toggle action** — flips state + persists to localStorage. — `handleToggleMirror` callback; persists synchronously inside the `setState` updater.

### Persistence

- [x] **localStorage key:** `video-self-view-mirror` storing `'true' | 'false'`. — `MIRROR_STORAGE_KEY` constant, hoisted to module scope alongside the A5 keys.
- [x] **Default:** `true`. — `useState(true)`.
- [x] **Restore on mount;** persist on every change. — same SSR-safe pattern as A5: mount effect with `typeof window !== "undefined"` guard + value-set validation + try/catch silent-fallback.

### Manual smoke

- [ ] Self-view starts mirrored (text on a sticky note behind you reads correctly). — to verify in PR review.
- [ ] Toggle off → unmirrored (text reads reversed). — to verify in PR review.
- [ ] Refresh → restores state. — to verify in PR review.
- [ ] Remote tile NEVER mirrors (verify with the doctor + patient on different devices: each sees the other's natural view, not flipped). — confirmed at the source: the remote `<VideoTile>` mount in `<VideoRoom>` does NOT pass `mirror`; the prop defaults to `false` and the remote `<video>` is never `scale-x-[-1]`. The flip is purely a CSS transform on the LOCAL element.
- [ ] `mode='readonly'` — toggle hidden; mirror state still applied per persisted preference for visual consistency. — **deferred** for the same reason as A1/A2/A3/A4/A5: `<VideoRoom>` has no `mode` prop today (Plan 07 history viewer renders elsewhere). The toggle is gated on `status === "connected"` (parent `<>` block), so it's already invisible during connecting / disconnected; a future readonly mount can add the gate trivially.

### General

- [x] Type-check + lint clean. — `npx tsc --noEmit` and `npx next lint --file VideoRoom.tsx --file VideoTile.tsx` both clean.
- [x] No console errors. — no `console.*` calls added in this PR.
- [x] No regression on remote video render (mirror is local-CSS only). — verified by inspection: remote tile mount has no `mirror` prop; `<VideoTile>` defaults to `mirror = false` for the remote case.

---

## Out of scope

- **Mirror the recorded artifact.** Out of scope; recordings show the unmirrored real view. Mirror is purely a local-display preference.
- **Auto-detect "user wants mirror"** based on camera type. Out of scope; user toggles.
- **Per-app default override.** Out of scope.

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/VideoSelfTile.tsx` — **edit** (~10 LOC: mirror prop + transform).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~15 LOC: state + persistence + toggle).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Toggle placement** — context menu (right-click / long-press) is cleanest; small button is more discoverable. Pick at PR time.
2. **CSS performance** — `transform: scaleX(-1)` is GPU-accelerated; zero perf concern.
3. **Long-press conflict** — if A5 ships a long-press drag-handle (stretch goal), reuse the same long-press handler to open the context menu. Otherwise standalone.
4. **Mirror per-camera** — front-camera default ON; back-camera default OFF. Defer to F1 (camera switch) — for now, mirror state is global per-device.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch A](../Plans/plan-video-consult-selected-features.md#sub-batch-a--quick-wins-2-days)
- **Source item:** [T1 §T1.6](../../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md)
- **Hard dep:** [task-video-A2](./task-video-A2-camera-off-on.md)
- **Future coordination:** [task-video-F1](./task-video-F1-camera-switch.md) — when camera switches between front/back, mirror default may flip per-camera.

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** Complete.

---

## Implementation log (2026-04-30)

### Files touched

- **edit** `frontend/components/consultation/VideoRoom.tsx` (~75 LOC net add):
  - Module-scope `MIRROR_STORAGE_KEY` constant (`"video-self-view-mirror"`), hoisted alongside the A5 keys for the same `react-hooks/exhaustive-deps` reason.
  - `mirrorSelf` state (`useState(true)` default) + mount `useEffect` that reads localStorage with `typeof window !== "undefined"` guard + value-set validation (`stored === "true" || stored === "false"`) + try/catch silent-fallback for private-browsing / quota throws.
  - `handleToggleMirror` callback (`useCallback`, no deps) that flips state and persists synchronously inside the `setState` updater.
  - Self `<VideoTile>` mount now passes `mirror={mirrorSelf}` (the prop existed since A2 but wasn't being driven by parent state).
  - Added a third button to the controls bar (between Camera and Leave call): action-style label flips between `"Mirror off"` (when ON, default) and `"Mirror on"` (when OFF), amber tint when in the non-default state (mirror=false), `aria-pressed={!mirrorSelf}` for screen-reader semantics. Tooltip explains both states.

- **No changes** to `frontend/components/consultation/VideoTile.tsx` — the `mirror?: boolean` prop already shipped in A2 (the component applies `scale-x-[-1]` Tailwind class to the inner `<video>` when set). A6 is just a wiring task on the parent.

- **No backend / migration / test changes** — A6 is a pure frontend toggle.

### Deviations from the task draft

1. **Toggle placement: controls-bar text button instead of context menu / Lucide icon.**
   - The draft's "(Recommended)" option is a context-menu item triggered by right-click / long-press on the self-view. There's no context-menu primitive in this codebase yet, and adding one for a 30-min task would explode scope.
   - The draft's "(Alternative)" option is a Lucide `FlipHorizontal2` icon button in the bottom-right of `<VideoSelfTile>`. Lucide isn't a frontend dep yet (same constraint A1's mute icon hit) AND the floating PiP already has a click handler from A5 (cycle position), so an in-tile button would need event-stop-propagation logic to avoid both handlers firing on a single tap.
   - Chosen: **third button in the existing controls bar**, between Camera and Leave call. Same idiom as Mute + Camera; no new primitive; no event-conflict with A5's PiP tap.
   - Migration path when Lucide / context-menu primitives land: swap the button for an icon and OR add a `<SelfViewContextMenu>` component. The `mirrorSelf` state + `handleToggleMirror` callback stay put.

2. **`mode='readonly'` deferred.** Same rationale as A1/A2/A3/A4/A5 — `<VideoRoom>` has no `mode` prop today; readonly history-viewer renders elsewhere. The toggle is already gated on `status === "connected"` (inside the same `<>` block as Mute + Camera), so it's invisible during connecting / disconnected; a readonly mount would just need to skip the connected branch entirely (or pass a `readonly` prop that suppresses the bar — same one-line change all five A-tasks need).

### Why mirror state is GLOBAL not per-camera

Per task draft Note #4: front-camera default ON / back-camera default OFF is the eventual UX. F1 (camera switch) owns that. Today there's no camera-switch path in `<VideoRoom>` (Twilio's default acquisition picks one camera; users can't change it), so per-camera state has nothing to switch on. When F1 lands, this state expands to `Record<CameraDeviceId, boolean>` and the `handleToggleMirror` callback writes against the active camera's entry.

### Why the toggle uses action-style labels (not state-style)

The Mute + Camera buttons use action-style labels ("Mute" = action; click to mute / "Unmute" = action; click to unmute). Mirror follows the same pattern: "Mirror off" = action when currently ON, click to turn off / "Mirror on" = action when currently OFF, click to turn back on. Action-style labels are clearer than state-style ("Mirrored" vs "Not mirrored") because the user reads the button as a verb they're about to invoke, not a state they're already in.

### What worked

- Reusing the A2 `mirror` prop stub on `<VideoTile>` — zero changes to the tile component; A6 is purely parent-side wiring.
- Mirroring (heh) the A5 module-scope-constant + SSR-safe-mount-effect + try/catch-silent-fallback pattern for the second localStorage-backed preference. The two preferences are now visibly cohorted in the file as `// Sub-batch A · task-video-A5` / `A6` blocks; future per-device prefs (camera default, layout default) should follow the same pattern.
- `aria-pressed={!mirrorSelf}` semantically correct (button is "in active toggled state" only when flipped from default).

### What didn't work / had to change

- Initially considered a third in-tile click target on the floating self PiP (long-press → mirror toggle), but the A5 `onTap` cycle handler already owns the floating tile's pointer events — adding a long-press would need a long-press primitive AND propagation guards. Pulled back to the controls bar; cleaner.
- Considered `aria-label="Mirror self-view"` instead of action-style label; the screen-reader experience is fine either way, but visual users get a clearer cue from the action verb. Kept the action-style label and let `aria-pressed` carry the state semantics for AT users.

### Verification

- `npx tsc --noEmit` (frontend) — clean.
- `npx next lint --file components/consultation/VideoRoom.tsx --file components/consultation/VideoTile.tsx` — clean.
- No dedicated test file — there's no existing test harness for `<VideoTile>` or `<VideoRoom>`; A6 is a layout-only PR with the same test posture as A1–A5.

### Follow-ups (not blocking this PR)

1. **Manual smoke** during PR review:
   - First-load default = mirror ON (text on a sticky note behind you reads correctly in your self-view).
   - Toggle off → unmirrored (text reads reversed in self-view).
   - Refresh mid-call restores the persisted state.
   - Doctor + patient on different devices: each sees the other's UNMIRRORED natural view.
2. **Lucide migration**: when Lucide lands as a dep, swap the text label for `FlipHorizontal2` (and do the same for Mute = `Mic`/`MicOff`, Camera = `Video`/`VideoOff` per the A1 / A2 follow-up).
3. **Per-camera state** (F1 coordination): when the front/back camera-switch lands, expand `mirrorSelf: boolean` to `Record<CameraDeviceId, boolean>` and write against the active camera's entry. Default front=ON, back=OFF per Note #4.
4. **Context-menu primitive** (separate PR, possibly C5 or D2 era): if a `<SelfViewContextMenu>` component lands (right-click / long-press), move "Mirror self-view" into it and remove the controls-bar button. Self-view options menu would also host A5's cycle-position-now-visually-discoverable, future zoom, etc.
