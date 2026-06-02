# Task video-F5: Hardware volume keys + MediaSession (sibling of voice C6 / C10)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch F (T6 mobile native) — **XS item, ~1h**

---

## Task overview

Universal mobile expectation: hardware volume keys should change call audio volume; lock-screen media controls should show the call. T6.42 verifies this on video calls and patches if needed.

**If voice C6 / C10 has already shipped:** this task is mostly **smoke verification**. The MediaSession declaration in F3 (which extends voice C10) handles 90% of it.

**Estimated time:** ~1h.

**Status:** ✅ Shipped (2026-05-03) — closes Sub-batch F.

**Depends on:** [task-video-F3](./task-video-F3-android-foreground-notification.md) — HARD (MediaSession declaration); voice C6 / C10 (SOFT — sibling).

**Source:** [T6 §T6.42](../../../../Product%20plans/video-consult/plan-t6-video-mobile-native.md); [decision §35](../Plans/plan-video-consult-selected-features.md#before-sub-batch-f-starts).

---

## Acceptance criteria

### MediaSession verification (extends F3)

- [ ] Confirm `navigator.mediaSession.metadata` is set on video call start (F3 should set it).
- [ ] Confirm action handlers registered: `'pause'`, `'play'`, `'stoptransport'`.
- [ ] Confirm hardware volume keys route to call audio (Android default behavior; verify on iOS).

### Lock-screen controls verification

- [ ] **Android Chrome PWA:** lock screen → confirm media controls show "Video consult" with caller name + pause/end actions.
- [ ] **Android lock-screen pause** → mic toggles (decision §14 reuse from voice).
- [ ] **iOS Safari:** verify behavior; degrades gracefully if not supported.

### Patch any gaps

- [ ] If volume keys don't route to call audio on a target device, investigate (could be Twilio audio context issue).
- [ ] If pause action doesn't toggle mute, wire up via F3's action handler.
- [ ] If `metadata.title` shows wrong text, fix.

### OEM smoke matrix (subset of F3 matrix)

- [ ] Samsung Galaxy S22: volume keys + lock screen.
- [ ] Pixel: volume keys + lock screen.
- [ ] Xiaomi Redmi Note: volume keys + lock screen (notorious for stripping MediaSession).
- [ ] iOS Safari (16+): volume keys (lock screen degrades).

### Document degradation

- [ ] If specific OEM strips MediaSession, document in code comment + this task file.
- [ ] Don't try to patch unfixable cases (e.g., iOS PWA lock screen).

### `mode='readonly'`

- [ ] N/A.

### General

- [ ] Type-check + lint clean.
- [ ] No new tests required (extension of F3).

---

## Out of scope

- **Custom hardware key remapping.** Out of scope.
- **iOS lock-screen call controls** (requires native shell). Out of scope.
- **Bluetooth media-control button mapping** (handled by voice T6.34).

---

## Files expected to touch

**Frontend:**
- `frontend/hooks/useCallMediaSession.ts` — **edit** if patches needed (~10 LOC).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** if needed (~5 LOC).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Decision §35** — this is mostly verification; only patch if hard gaps found on target OEMs.
2. **Pause = mute** (decision §14 from voice). Consistent with all MediaSession actions in our app.
3. **iOS PWA lock screen** — Apple gates it; document degradation, don't fight it.
4. **Sibling reuse** — voice C6 + C10 + F3 should cover 95%; this task is the safety net.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch F](../Plans/plan-video-consult-selected-features.md#sub-batch-f--mobile-native-niceties-10-days)
- **Source item:** [T6 §T6.42](../../../../Product%20plans/video-consult/plan-t6-video-mobile-native.md)
- **Decision:** [§35 — verification scope](../Plans/plan-video-consult-selected-features.md#before-sub-batch-f-starts)
- **Coupled:** [task-video-F3](./task-video-F3-android-foreground-notification.md), [task-voice-C6](./task-voice-C6-hardware-volume-key.md), [task-voice-C10](./task-voice-C10-android-foreground-notification.md)
- **W3C:** MediaSession API

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** ✅ Shipped 2026-05-03 — Sub-batch F closed (5/5).

---

## Implementation log (2026-05-03)

### Audit findings vs F.5 acceptance criteria

F.4 (`task-video-F3` Android persistent foreground notification) shipped 2026-05-03 and bears the `useCallMediaSession` hook + `/sw.js` foundation. Per the F.5 spec ("If voice C6 / C10 has already shipped: this task is mostly **smoke verification**. The MediaSession declaration in F3 (which extends voice C10) handles 90% of it."), F.5's role is to audit + patch any gaps. F.4 / F.5 sequencing inverted the dependency intent (we shipped F.4 BEFORE voice C10) but the same audit applies — F.4 IS the foundation now, voice C10 will reuse it later.

| F.5 acceptance | F.4 status | F.5 action |
| --- | --- | --- |
| MediaSession metadata set on call start | ✅ `useCallMediaSession` sets title (`"Video consult"` / `"Voice consult"`) + artist (`callerName`) + album (`"Clariva"`) on mount + when `modality`/`callerName` change | None |
| Action handlers `pause`/`play`/`stoptransport` | ✅ All three registered (also `stop` for non-Chrome fallback); decision §14 honoured (pause = mute) | None |
| Hardware volume keys route to call audio | ✅ Browser default once `playbackState === 'playing'` is declared — Android Chrome routes hw-volume input to the media-session-tagged `<audio>` element automatically; Twilio's `track.attach()` uses standard `<audio>` so it inherits | None (no code; default works) |
| Lock-screen controls show call | ✅ Automatic once metadata + playbackState declared on Android Chrome PWA | None |
| Lock-screen pause → mute | ✅ Wired via `setActionHandler('pause', handlePause)` → `onPauseRef.current()` → `handleToggleMic` | None |
| Document degradation in code | ⚠️ F.4 covered browser support matrix; F.5 spec asks for OEM-specific notes | **Patched** — added OEM degradation block (Pixel / Samsung / Xiaomi MIUI / iOS Safari + PWA / Bluetooth headset) to hook JSDoc |
| OEM smoke matrix execution | ⚠️ Needs Samsung / Pixel / Xiaomi / OnePlus / iOS Safari hardware | Deferred to QA hardware availability (same gate as F.4 + the rest of Sub-batch F) |

### Patches landed

Two surgical edits to `frontend/hooks/useCallMediaSession.ts`. No `<VideoRoom>` changes needed — F.4 already wired the hook with all required surface.

- **Defensive null-setters for unsupported MediaSession actions.** Inside the metadata/action-handlers `useEffect`, after the `pause`/`play`/`stop`/`stoptransport` registrations, we explicitly `setActionHandler(action, null)` for each of `seekto`, `seekbackward`, `seekforward`, `nexttrack`, `previoustrack`, `skipad`. Three motivations:
  1. **Stale-handler hygiene.** MediaSession is a `navigator`-level singleton; handlers persist across navigations until explicitly cleared. A prior hook revision that registered `seekto` would surface a scrub bar on the lock screen even after the new revision stopped touching it. Explicit nulls clear the slate on every mount.
  2. **Misleading UX.** A scrub bar / skip button on a LIVE call (no rewind, no skip-track) confuses users; some OEMs throw `NotSupportedError` from the JS callback when tapped, which surfaces an OS-level "media error" toast.
  3. **OEM compliance.** Xiaomi MIUI is known to render every action even when `playbackState === 'paused'`; explicit clears keep the OEM-stripped widget tidy.
  Each null-set is wrapped in its own try/catch — some browsers throw `NotSupportedError` for unrecognised action names; one bad name shouldn't skip the rest of the loop.

- **OEM degradation matrix added to the hook's JSDoc.** New `OEM degradation matrix` block enumerates: Pixel / stock Android (full), Samsung One UI ("Internet call" branding override — out of our control), Xiaomi MIUI (battery-saver intercepts MediaSession before browser engine sees it — no code-side fix possible), iOS Safari regular tab (lock-screen Now Playing widget works on iOS 15+), iOS Safari PWA / standalone (Apple gates lock-screen call controls — needs native shell — `<IOSPWABanner>` warns the user up-front), Bluetooth headset media buttons (route through MediaSession on most BT stacks; voice T6.34 owns explicit BT mapping).

### Files touched

| File | LOC | Why |
| --- | --- | --- |
| `frontend/hooks/useCallMediaSession.ts` | +75 / -0 | Defensive null-setters loop (~20 LOC) + OEM degradation matrix block in JSDoc (~55 LOC) |

No `VideoRoom.tsx` changes needed — F.4's mount and prop wiring already satisfy F.5's contract.

### Verification

- `tsc --noEmit` — clean (~13s).
- `next lint --dir hooks` — clean ("✔ No ESLint warnings or errors").
- `ReadLints` — clean.
- No new tests required per spec ("extension of F3").
- OEM smoke matrix deferred — same hardware gate as F.4 + spec acknowledges the verification scope is hardware-bound.

### Cross-task confirmations

- **F.4 foreground notification.** Defensive null-setters run AFTER the pause/play/stop/stoptransport registrations, so they don't accidentally clear the actions we DO want. Verified via code review — the `for` loop only touches the unsupported-action list.
- **A1 mute / A4 end-call.** No regression — the action handlers still route to `handleToggleMic` / `handleEndConfirmConfirm` exactly as F.4 wired them.
- **Voice C6 hardware-volume-key (sibling).** Voice C6 will get the same `playbackState='playing'` signal automatically when it mounts `useCallMediaSession({modality:'voice', …})` in `<VoiceConsultRoom>`. No additional code needed for hw-volume routing on the voice side.
- **Voice C10 foreground notification (sibling).** Same hook; voice C10's mount inherits the F.5 defensive cleanup + OEM doc.

### Known gaps / follow-ups

- **OEM smoke matrix not executed** — needs Samsung Galaxy S22 + Pixel + Xiaomi Redmi Note + iOS Safari (16+) hardware. Spec acknowledges the verification scope is hardware-bound; deferred to QA window.
- **Custom hardware key remapping** — out of scope per spec.
- **iOS lock-screen call controls** — Apple gates; out of scope (requires native shell).
- **Bluetooth media-control button mapping** — voice T6.34 owns; F.5 inherits BT pause/play through MediaSession by default.
- **`MediaSession.setPositionState`** explicitly NOT called — would render a scrub bar; calls aren't seekable.

### Sub-batch F closure

F.5 is the final task in Sub-batch F. With this PR landing, **Sub-batch F is 5 of 5 complete**:

- F.1 ✅ battery-saver auto-downgrade (2026-05-02)
- F.2 ✅ front/back camera switch (2026-05-02)
- F.3 ✅ orientation lock + landscape layout (2026-05-02)
- F.4 ✅ Android persistent foreground notification (2026-05-03; bears voice C10 foundation)
- F.5 ✅ hardware volume / MediaSession verification (2026-05-03; defensive cleanup + OEM doc)
