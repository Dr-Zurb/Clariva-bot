# Task video-A1: Mute / unmute mic

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch A (T1 quick wins) — **XS item, ~30 min**

---

## Task overview

Today `<VideoRoom>` (lines 488-494) has a single red "Leave call" button and **no mute control at all**. Patients in cluttered or private rooms can't mute their mic without hanging up the call entirely. T1.1 ships a standard mic / mic-slash toggle in the controls bar.

Reuses the **`mute_changed`** Plan 06 system-message enum value already shipped by voice batch (voice T1.8 / A7) — no new enum needed. Companion chat surfaces "🔇 Patient muted their microphone" / "🔊 Patient unmuted" with the same debounce as voice (collapse mute+unmute within 5s into one row).

**Estimated time:** ~30 min.

**Status:** **Complete (mute toggle shipped; companion-chat system-message wire deferred to voice A7).**

**Depends on:** voice [Sub-batch 0 P0.B](../Plans/plan-voice-consult-selected-features.md#sub-batch-0--companion-chat-hotfix-p0-1-day) (HARD — patient must have a working companion chat to receive the system message); voice T1.8 / A7 (HARD for the system-message half; A7 owns the `mute_changed` infrastructure that's not yet shipped).

**Source:** [T1 §T1.1](../../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md).

---

## Acceptance criteria

### Mute toggle in `<VideoRoom>` controls bar

- [x] **Edit `frontend/components/consultation/VideoRoom.tsx`** — the freestanding red "Leave call" button is now wrapped in a controls-bar row: `[Mute] [Leave call]`. A2 will slot the camera-toggle button between them; A4 will rework "Leave call" → "End call" with confirmation.
- [x] **Mic button** uses `LocalAudioTrack.enable()` / `.disable()` to toggle (via `localTracksRef.current.find((t) => t.kind === "audio")`). **Deviation:** Lucide is **not** a frontend dependency yet — used the same text-only ("Mute" / "Unmute") + amber-tint pattern that `<VoiceConsultRoom>` already uses. When Lucide lands (or when A2/A4 extracts a shared `<VideoControlsBar>`), swap text for `Mic` / `MicOff` glyphs in one place.
- [x] **Visual states:** unmuted = neutral white/gray border button; muted = amber-tint background + amber-300 ring + amber-900 text. **Deviation:** task draft asked for "red-tinted icon" — went with **amber** to match `<VoiceConsultRoom>` (red is reserved for "End call" / destructive). Tooltip via `title="Muted — click to unmute"` / `"Mute your microphone"`. `aria-pressed={micMuted}` for screen-reader state.
- [x] **Doctor + patient symmetric** — same button, same behavior; the toggle keys off `localTracksRef` which is per-participant, so neither role can mute the other.
- [x] **Hide-when-not-connected** — mic button only renders while `status === "connected"` (no audio track exists in `connecting` / `error` / `disconnected` states; rendering a no-op button would mislead the user). Covers the "readonly mode hides controls" intent below — `<VideoRoom>` has no `mode='readonly'` prop today, so the status-gated mount is the equivalent.

### Companion-chat system message — DEFERRED to voice A7

> Voice A7 is the natural home for the `mute_changed` system-message infrastructure (backend `emitMuteChanged` helper + route, plus the `<TextConsultRoom>` system-row renderer for the new event tag). Once A7 ships, this task's frontend wires the same `fetch` + 5s debounce on the mic-toggle handler. Tracked below as a follow-up.

- [ ] ~~Emit Plan 06 system row on every state change~~ — DEFERRED. **Note for A7 author:** `consultation_messages.system_event` is plain `TEXT` (Migration 063, line 47 — *"deliberately TEXT (not an ENUM) so Plans 07, 08, 09 can each ADD tags without coordinating an ALTER TYPE migration"*) — **so no migration is needed**. Just extend the `SystemEvent` TypeScript union in `backend/src/services/consultation-message-service.ts` and add an `emitMuteChanged` helper.
- [ ] ~~Reuse the `mute_changed` enum~~ — DEFERRED. **Same correction:** there is no enum; the voice A7 task draft also gets this wrong (says "ALTER TYPE consultation_system_subtype ADD VALUE …" — that type doesn't exist). Forward the correction to A7 at PR time.
- [ ] ~~Debounce parity with voice (5s collapse)~~ — DEFERRED.
- [ ] ~~Doctor / patient actor name in chat row~~ — DEFERRED.
- [ ] **RLS reminder for A7 author:** the existing `consultation_messages_insert_live_participants` policy **blocks system-row INSERTs from any non-service-role caller** (Migration 063 §4 + Migration 052). Frontend cannot directly INSERT — A7 must add a backend route that `authenticateToken`s and calls `emitSystemMessage` on the service-role admin client.

### Manual smoke

**Live-shipped half (do during A1's PR):**

- [ ] Doctor or patient hits the call, room connects → "Mute" button appears next to "Leave call".
- [ ] Click "Mute" → button turns amber, copy flips to "Unmute", `aria-pressed=true`. Counter-party stops hearing audio (Twilio stops publishing the local audio track).
- [ ] Click "Unmute" → button reverts to neutral, copy flips to "Mute", counter-party hears audio resume.
- [ ] Toggle the mute button rapidly — no console errors, state stays in sync (debounce / system-message NOT shipped yet, so chat will be quiet — that's expected).
- [ ] During `connecting` and after `Leave call` → mic button is NOT rendered (only "Leave call" / "Call ended" copy visible). Confirms the status-gated mount.
- [ ] Recording (Plan 07 / 08) **continues across mute toggles** — pause/resume controls still work, indicator stays green, `audio_url` artifact at the end still has the doctor's audio (Twilio recording is server-side, decoupled from publish state on the room).
- [ ] `<VoiceConsultRoom>` mute behavior unchanged (this PR didn't touch voice).

**Deferred half (will be smoked when A7 lands):**

- [ ] ~~Doctor + patient on different devices: doctor mutes → patient sees "Dr. Sharma muted their microphone" within ~1s in companion chat panel.~~ — A7
- [ ] ~~Patient mutes → doctor sees the parallel system message.~~ — A7
- [ ] ~~Toggle mute on/off rapidly → only one system row appears (debounce works).~~ — A7
- [ ] ~~Voice consult emits the same row shape (cross-modality consistency check).~~ — A7

### General

- [x] Type-check (`npx tsc --noEmit`) clean — 0 errors.
- [x] Lint (`npx next lint --file components/consultation/VideoRoom.tsx`) clean — no warnings or errors.
- [x] No console errors introduced (no new `console.*` calls; the toggle is a pure-local state update + Twilio track method call).
- [x] No regression on existing video flow — `connectRoom`, `createLocalTracks`, attach/detach paths, `RecordingControls`, `VideoEscalationButton`, `<TextConsultRoom>` companion mount are all untouched.

---

## Out of scope

- **Camera off / on** — that's [task-video-A2](./task-video-A2-camera-off-on.md). The controls bar's camera slot ships in A2.
- **Mute on counterparty side (PTT-style mute the other person).** Not a clinical feature.
- **Audible "you are muted" reminder.** Out of scope; visual state is enough.
- **Push-to-talk mode.** Out of scope; clinical pace doesn't need it.

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~25 LOC: import `Mic` / `MicOff`, add `micMuted` state, `handleToggleMic` callback, render button).
- (If A2 hasn't landed) `frontend/components/consultation/VideoControlsBar.tsx` — **optional new component** if the controls bar is being extracted out of `VideoRoom.tsx` mid-Sub-batch-A. If A1 ships before that extract, edit inline; the extract can fold A1 + A2 + A4 controls when convenient.

**Backend / migrations / tests:** none in this task (assuming voice batch has shipped the `mute_changed` enum migration).

---

## Notes / open decisions

1. **Reuse the voice enum** — `mute_changed` is a Plan 06 enum value already added by voice batch. Confirm at PR time that the voice batch's migration has shipped to staging / prod; if not, this task ships the migration alongside its frontend code.
2. **Debounce window** — 5s mirrors voice doctrine; if doctors / patients flip mute slowly, every toggle still emits its own row.
3. **Cross-modality consistency** — mute UX should feel identical across voice and video calls. Same icon, same tooltip text, same system-message copy.
4. **Recording boundary** — muting LOCAL audio track does NOT pause recording (that's Plan 02 / 08 territory). Verify recording continues uninterrupted across mute toggles.
5. **A2 dependency on the controls bar layout** — if A1 ships before A2, plan the controls bar HTML so A2 can drop in the camera button without re-laying out.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch A](../Plans/plan-video-consult-selected-features.md#sub-batch-a--quick-wins-2-days)
- **Source item:** [T1 §T1.1](../../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md)
- **Sibling (voice):** [task-voice-A7](./task-voice-A7-counterparty-mute-notification.md) — already shipped the `mute_changed` enum + debounce convention
- **Plan 06:** [companion text channel](../../19-04-2026/Plans/plan-06-companion-text-channel.md) — system-message channel
- **HARD GATE:** voice [Sub-batch 0 P0.B](../Plans/plan-voice-consult-selected-features.md#sub-batch-0--companion-chat-hotfix-p0-1-day) — patient companion chat must work for the system message to be visible

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** **Complete (mute toggle shipped 2026-04-30; system-message wire deferred to voice A7).** First video-batch item after voice Sub-batch 0 cleared the gate.

---

## Implementation log

### 2026-04-30 — A1 mute toggle shipped (system-message wire deferred)

**Scope shipped (Option A):**

The local mic-mute half of T1.1 — the cheap, deploy-today value: a working Mute / Unmute button on the video controls bar, with the same visual + a11y patterns the voice room already uses, and zero touch on Twilio connect / recording / companion-chat paths. The 30-min estimate matches this scope.

**Scope deliberately deferred (Option B parts):**

The companion-chat system-message wire (`mute_changed` event, 5s debounce, "Dr. Sharma muted" rendering) is **not** in this PR. Three reasons:

1. **The infrastructure doesn't exist yet.** No `mute_changed` value in the `SystemEvent` TypeScript union (`backend/src/services/consultation-message-service.ts` line 271-296), no `emitMuteChanged` helper, no backend route. Adding all three from this video task would bleed into the voice batch's PR (voice A7 owns the helper + route by plan).
2. **RLS forbids the simpler path.** The voice A7 task draft suggests "frontend-emit with optimistic INSERT" — that **fails RLS**. `consultation_messages_insert_live_participants` (Migration 051 / 052) blocks any non-service-role caller from writing `sender_role='system'` rows; only `emitSystemMessage` (which uses the service-role admin client) can insert. So the system-message wire is **necessarily** a backend route, which is voice A7's surface.
3. **Voice A7 hasn't shipped.** Per the EXECUTION-ORDER, video tasks run before voice A7. Adding the emit-side here would mean wiring video → backend route that voice A7 owns, then changing it again when A7 lands. The cleaner sequence is: A1 ships local mute → A7 ships shared backend infra → A7's PR also wires both `<VideoRoom>` and `<VoiceConsultRoom>` to the route in one place.

**Two task-draft corrections caught during audit (forwarded to voice A7 author):**

1. **No enum migration needed.** The draft says *"if the enum is a Postgres `ENUM TYPE`, ship a tiny migration `ALTER TYPE consultation_system_subtype ADD VALUE 'mute_changed'`"* — but `consultation_system_subtype` doesn't exist. `system_event` is a free **TEXT** column (Migration 063 line 47, deliberately so). A7's PR is a pure code change — extend the `SystemEvent` TS union, add the helper, add the route.
2. **No frontend-emit path.** The draft says *"frontend-emit with optimistic INSERT into `consultation_messages`"* — RLS rejects this (point #2 above). A7 must add a backend route.

**Files changed (this PR):**

- `frontend/components/consultation/VideoRoom.tsx`
  - Added `micMuted` state (default `false`) next to existing `hasDisconnectedRef`.
  - Added `handleToggleMic` callback. Looks up the audio track via `localTracksRef.current.find((t) => t.kind === "audio")`, runtime-guards `.enable()` / `.disable()` existence, then flips state via the functional `setMicMuted` form (so the side effect runs against the prior state without a stale-closure dependency).
  - Replaced the freestanding red "Leave call" button with a `<div className="flex flex-wrap items-center gap-2 self-start">` wrapper holding `[Mute (status==='connected' only)] [Leave call]`. The wrapper is the seed of the future `<VideoControlsBar>` extract that A2 / A4 can fill out.
  - Mic button styling matches `<VoiceConsultRoom>` exactly (text "Mute"/"Unmute", amber tint when active, gray border when neutral) so the cross-modality consistency promise holds without Lucide.

**Backend / migrations / tests:** none in this PR.

**Verification:**

- `npx tsc --noEmit -p tsconfig.json` (frontend) → exit 0, no errors.
- `npx next lint --file components/consultation/VideoRoom.tsx` → "✔ No ESLint warnings or errors".
- `ReadLints` on the changed file → no diagnostics.
- No `<VideoRoom>` test file exists in the repo (`frontend/**/VideoRoom*.test.*` returned 0 matches), so no regression suite to re-run; the file is exercised live in the consult join flow.

**Deviations from the task draft:**

| # | Draft says | Shipped | Why |
|---|---|---|---|
| 1 | Lucide `Mic` / `MicOff` icon | Text "Mute" / "Unmute" | `lucide-react` is not installed (`Grep` for `lucide` returned 0 frontend files). Matches existing `<VoiceConsultRoom>` controls. |
| 2 | Red-tinted muted state | Amber-tinted muted state | Red is reserved for the destructive "Leave call" button. Amber matches `<VoiceConsultRoom>`'s muted styling exactly. |
| 3 | "Mode='readonly' (Plan 07 history viewer) hides the mic button" | `status === 'connected'` gate hides the mic button | `<VideoRoom>` has no `mode='readonly'` prop today (`Grep` returned 0 matches). The status gate is the equivalent — no audio track exists in any non-connected state. |
| 4 | Companion-chat system message + debounce | DEFERRED to voice A7 | See "Scope deliberately deferred" above; infrastructure doesn't exist yet, RLS forbids the simpler path. |

**Follow-ups (track for voice A7's PR):**

1. Extend `SystemEvent` union in `backend/src/services/consultation-message-service.ts` with `'mute_changed'` (line 271-296).
2. Add `emitMuteChanged({ sessionId, actorRole, actorName, muted })` helper that calls `emitSystemMessage` with body `"Dr. Sharma muted their microphone"` / `"Patient unmuted their microphone"` and `correlationId` like `mute_changed:{actorId}:{Math.floor(now/5000)}` for the 5s debounce window.
3. Add `POST /api/v1/consultation/:sessionId/mute` route — `authenticateToken` (works for doctor + patient — both have valid Supabase JWTs by then), `{ muted: boolean }` body, calls the helper.
4. In `<VideoRoom>` `handleToggleMic` AND `<VoiceConsultRoom>` `toggleMute`, after the local `enable()/disable()` flip, fire-and-forget `fetch(POST /mute, { muted: <new state> }, Bearer <jwt>)`. Use the same JWT that `chatAuth` uses for the session.
5. Manual smoke for the deferred half (see "Manual smoke → Deferred half" above).

**Manual smoke (live-shipped half):** the live-half rows in the "Manual smoke" section are intentionally still unchecked — they require a deployed environment + two participants. Run during PR review on staging.
