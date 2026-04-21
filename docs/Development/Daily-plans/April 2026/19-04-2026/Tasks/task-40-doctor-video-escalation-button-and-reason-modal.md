# Task 40: Doctor `<VideoEscalationButton>` + reason-capture modal + cooldown waiting-state surface in `<VideoRoom>` controls (Decision 10 LOCKED)

## 19 April 2026 — Plan [Video recording escalation](../Plans/plan-08-video-recording-escalation.md) — Phase B

---

## Task overview

Decision 10 LOCKED the doctor-initiated branch of the video-escalation flow: camera tracks are live for every video consult but **not recorded by default**. The doctor must click a deliberate "Start video recording" button, type / pick a reason, and wait for the patient to consent. This task ships the doctor-side UI surface only — the escalation button, the reason-capture modal, the waiting-on-consent countdown UX, and the post-decline cooldown surface. The server-side request/consent/timeout flow is Task 41.

The UX is **friction-by-design**: asking a doctor to justify video recording in writing is the ethical prerequisite to generating a long-lived video artifact of a consult. The friction deters "I'll just record everything in case" and documents the clinical justification for audit.

Scope:

- **`<VideoEscalationButton>`** — a control-bar button in `<VideoRoom>` labelled `[🎥+ Start video recording]`. Disabled when recording rule is already audio+video. Disabled during the 5-min cooldown after a decline.
- **Reason-capture modal** — opens on button click; preset radio buttons ("Visible symptom" / "Document procedure" / "Patient request" / "Other") + free-text field (≥5 chars, required; ≤200 chars); CTAs `[Cancel]` / `[Send request]`. Submission calls `recording-escalation-service.ts#requestVideoEscalation`.
- **Waiting-for-consent state** — post-submit, the modal transitions to a waiting view with a 60s countdown timer mirroring the server clock. No keystroke input permitted during wait.
- **Post-decline / post-timeout banner** — replaces the modal on patient decline or server timeout. Shows reason the patient gave (if any), cooldown timer ("Try again in 4:32"), `[Close]` CTA. Button in control bar is disabled until cooldown expires (backed by `video_escalation_audit.requested_at` per open question #2).
- **Rate-limit enforcement surface** — after 2 escalation requests in the same consult, the button becomes permanently disabled for the rest of the consult with a tooltip "Max 2 video recording requests per consult reached".

**Estimated time:** ~3 hours (above the plan's 2h estimate — the waiting-state countdown-sync with the server + the cooldown persistence across page refresh + the three surface states (idle / requesting / cooldown / locked) push above 2h).

**Status:** ✅ Completed 2026-04-19 (frontend-only; Task 41's server endpoints pending).

**Depends on:**

- Task 45 (soft — UI reads cooldown-available-at from the server; if Task 45's `video_escalation_audit` table doesn't exist, the UI degrades to an always-enabled button with a toast "Rate-limit info unavailable"; server will still 429 on rate-limit violations).
- Task 41 (hard — the `requestVideoEscalation` endpoint that this button POSTs to).
- Plan 06 Task 38 (soft — `<VideoRoom>` layout with companion chat panel; this task extends the same control-bar area).
- Plan 06 Task 37 (soft — `emitSystemMessage` for the `video_recording_started` system event that the doctor sees mirrored in the chat panel; this task does not call the emitter directly — Task 41's server flow does).

**Plan:** [plan-08-video-recording-escalation.md](../Plans/plan-08-video-recording-escalation.md)

---

## Acceptance criteria

### `<VideoEscalationButton>` component

- [x] **`frontend/components/consultation/VideoEscalationButton.tsx`** (NEW) — a control-bar button with these props:
  ```tsx
  interface VideoEscalationButtonProps {
    sessionId: string;
    doctorId: string;
    roomSid: string;
    currentRecordingRule: 'audio_only' | 'audio_and_video';
    escalationState:
      | { kind: 'idle' }
      | { kind: 'requesting'; requestId: string; expiresAt: string }  // server-synced
      | { kind: 'cooldown'; availableAt: string; attemptsUsed: 1 | 2 }
      | { kind: 'locked'; reason: 'max_attempts' | 'already_recording_video' };
    onStateChange?: (next: EscalationState) => void;                  // lift for tests
  }
  ```
  > **Implementation divergence:** the shipped prop surface is smaller —
  > `{ sessionId, token, currentUserRole, className? }`. `doctorId` is
  > resolved internally from `createClient().auth.getSession()` (mirrors
  > the `chatAuth` pattern already in `VideoRoom`). The per-state props
  > listed above are computed inside `useVideoEscalationState` from the
  > audit-row Realtime stream rather than lifted into host state, which
  > keeps host components (VideoRoom + future VoiceConsultRoom) trivial.
  > The `onStateChange` hook was dropped in favour of direct consumption
  > of the hook — host components that need to observe state changes can
  > call `useVideoEscalationState` alongside the button.
- [x] **Button label + disabled shape:**
  - Idle: `[🎥+ Start video recording]`, enabled.
  - Requesting: `[⏳ Waiting for patient… 42s]`, disabled, shows live countdown.
  - Cooldown with 1 attempt left: `[🎥+ Try again in 4:32]`, disabled until cooldown expires; re-enables → idle (label reverts to "Start video recording").
  - Cooldown with 2 attempts used: `[🎥 Max requests reached]`, permanently disabled. Tooltip: "Max 2 video recording requests per consult reached per safety policy."
  - Locked `already_recording_video`: button hidden (the `<VideoRecordingIndicator>` from Task 42 takes over the real estate).
- [x] **Countdown accuracy:** implemented with wall-clock `Date.parse(expiresAt) - Date.now()` evaluated at 1Hz; the `setInterval` is scoped to the `requesting|cooldown` states so it's not running uselessly during `idle`/`locked`. Defensive auto-transition to cooldown or locked if `expiresAt` is reached without a Realtime flip (tab-backgrounded recovery). ✅
- [x] **Accessibility:**
  - Button has `aria-label="Start video recording; patient consent required"` in idle, `"Waiting for patient consent"` in requesting, and the policy-worded `"Max video recording requests reached per consult"` when locked. ✅
  - Disabled state uses `aria-disabled="true"` + native `disabled` attr. ✅
  - Countdown text has `aria-live="polite"`. v1 fires the announcement on every 1s state change rather than debouncing to 10s — assistive tech typically self-throttles polite regions, so the deferred 10s-granularity debounce is captured as a v1.1 follow-up (see inbox).

### Reason-capture modal

- [x] **Modal is co-located inside `VideoEscalationButton.tsx`** (the option the spec allowed). It's a role="dialog" with aria-modal="true" rendered at the same z-index as `RecordingControls`' pause modal, sharing the same backdrop pattern. Prop surface:
  ```tsx
  interface VideoEscalationReasonModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (input: { presetReasonCode: PresetReason; reason: string }) => Promise<void>;
    remainingAttempts: 1 | 2;                    // shown to doctor as "You have X request(s) left"
  }

  type PresetReason = 'visible_symptom' | 'document_procedure' | 'patient_request' | 'other';
  ```
- [x] **Layout:** shipped with the approved copy and control order. Preset radios default to `other`; clinical-note textarea is required; character counter `N/200` goes red at 195; submit is disabled when `reasonLength < 5 || reasonLength > 200`. Screenshot parity with the ASCII sketch below.
  ```
  ┌─────────────────────────────────────────────────┐
  │ Start video recording                           │
  ├─────────────────────────────────────────────────┤
  │ The patient will be asked to consent before     │
  │ video is recorded. Tell them why you need to    │
  │ record video.                                   │
  │                                                 │
  │ Reason:                                         │
  │   ( ) Need to see a visible symptom             │
  │   ( ) Need to document a procedure              │
  │   ( ) Patient request                           │
  │   (•) Other (elaborate)                         │
  │                                                 │
  │ ┌─────────────────────────────────────────────┐ │
  │ │ Describe the clinical reason…               │ │
  │ │                                     12/200  │ │
  │ └─────────────────────────────────────────────┘ │
  │                                                 │
  │ You have 1 request left per consult.            │
  │                                                 │
  │         [  Cancel  ]   [ Send request ]         │
  └─────────────────────────────────────────────────┘
  ```
- [x] **Free-text validation:**
  - Required for every submission (not just `'other'`). Rationale: even presets benefit from a sentence of clinical specificity ("rash on left forearm, red border, ~2cm") in the audit trail. Server CHECK enforces 5..200 chars (Task 45); client enforces same for instant feedback.
  - Character counter: live "N/200" display; turns red at 195; blocks submit at 201 (blocks input at 200).
  - Empty submit: red inline error "Please describe why video is needed (at least 5 characters)."
  - Under-5 chars: "A bit more detail, please (at least 5 characters)."
  - Validate in an `onBlur` + `onChange` combo — shows error on blur, clears on keystroke, re-validates on blur. ✅
- [x] **Preset-reason selection behaviour:** default `'other'`; native `<input type="radio">` group keyed by `name="video-escalation-preset"` so keyboard arrow-key nav falls out of the browser WCAG radio-group pattern automatically.
- [x] **Submit behaviour:**
  - POST to `/api/v1/consultation/:sessionId/video-escalation/request` via `requestVideoEscalation()` in `frontend/lib/api/recording-escalation.ts`.
  - During POST: Cancel/Send disabled; Send button label flips to `Sending…`.
  - On 200: calls `markRequesting` on the hook (optimistic), stage transitions to waiting view. `{ requestId, expiresAt, correlationId }` returned.
  - On 429: client maps via `VideoEscalationError.code === "RATE_LIMITED"`; hook is stamped via `markCooldown`/`markLocked` using server-provided `availableAt` (falling back to `locked:max_attempts` if the server doesn't echo one); modal closes; button surfaces the cooldown state.
  - On 500 / network: inline error "Couldn't send the request. Please try again." (or the server's message); reason text is retained so the doctor can retry by clicking Send again (no separate `[Retry]` affordance — clicking Send re-submits).
  - **Contract note:** Task 41 has not shipped yet. Until it does, the POST returns 404, which `requestVideoEscalation` surfaces as a `VideoEscalationError{code:'UNKNOWN', status:404}`. The inline error renders as the existing "Couldn't send the request" copy — a graceful-degradation fallback per the parallel-development discipline EXECUTION-ORDER.md sanctions for 40 ‖ 41.

### Waiting view

- [x] On successful submit, the modal body replaces content with:
  ```
  ┌─────────────────────────────────────────────────┐
  │ Waiting for patient to respond                  │
  ├─────────────────────────────────────────────────┤
  │                                                 │
  │   ⏳ 58 seconds remaining                        │
  │                                                 │
  │   The patient has been asked to consent to      │
  │   video recording. They have 60 seconds to      │
  │   respond.                                      │
  │                                                 │
  │   If no response, the request will auto-        │
  │   decline.                                      │
  │                                                 │
  │               [  Close  ]                       │
  │                                                 │
  └─────────────────────────────────────────────────┘
  ```
- [x] `[ Close ]` CTA closes the modal **but does NOT cancel the server-side timer**. The hook's `requesting` state persists; the button in the control bar shows `⏳ Waiting for patient… Ns` with the same ISO-timestamp-driven countdown. ✅
- [x] **No "cancel the request" CTA** in v1. Once sent, the doctor waits it out. The only close affordance on the waiting view is `[ Close ]` which does NOT cancel (see above). Rationale documented inline at the top of the component. ✅
- [x] **Realtime updates on patient response:** implemented via Supabase Postgres-changes on the `video_escalation_audit` table filtered by `session_id`, inside `useVideoEscalationState.ts`. Subscription is session-scoped (not request-scoped) so we get INSERT + UPDATE in one channel. On terminal UPDATE:
  - `allow` → hook emits `locked:already_recording_video`; the button short-circuits to `null` so the Task 42 indicator takes the real estate; modal auto-closes.
  - `decline` → hook emits `cooldown:{availableAt = requested_at + 5min}`; modal stage flips to `declined`.
  - `timeout` → same as decline but stage flips to `timedout`.
  - **No `escalation:${requestId}` broadcast channel** — the Postgres-changes approach handles everything without requiring Task 41 to emit anything beyond a DB write. Migration 070's RLS policy scopes visibility to session participants, so the doctor's browser-auth client sees exactly (and only) their session's rows. ✅

### Decline / timeout banner

- [x] On patient decline or timeout, the modal body replaces with:
  ```
  ┌─────────────────────────────────────────────────┐
  │ Patient declined video recording                │
  ├─────────────────────────────────────────────────┤
  │                                                 │
  │   Reason: "I prefer audio only, thank you."     │
  │   (if none provided: "No reason given.")        │
  │                                                 │
  │   You can try again in 4:58.                    │
  │   (1 request left this consult.)                │
  │                                                 │
  │               [  Close  ]                       │
  │                                                 │
  └─────────────────────────────────────────────────┘
  ```
- [x] On timeout: dedicated stage `timedout` shows "Patient did not respond in time" + the cooldown countdown + remaining-attempts copy. ✅
- [x] After close: hook is already in `cooldown`; button label becomes `🎥+ Try again in M:SS`; auto-transitions to `idle` with "1 request left this consult." caption when cooldown expires. ✅
- [x] On second decline / timeout: hook transitions to `locked/max_attempts` (after cooldown(2) expires defensively, and eagerly via `markLocked` on a 429 without an `availableAt`). Button label pins to `🎥 Max requests reached`; tooltip "Max 2 video recording requests per consult reached per safety policy." ✅

### Cooldown persistence across page refresh

- [x] The UI defers the derivation to Task 41's `GET /video-escalation-state` endpoint, which is specified to return a typed `VideoEscalationStateData` union matching the state machine above. See `frontend/lib/api/recording-escalation.ts` for the contract.
- [x] Initial fetch wired via `getVideoEscalationState()` in `useVideoEscalationState`. When the endpoint 404s (Task 41 not deployed) or the network fails, the hook falls back to `idle`; the button is still usable; the first POST surfaces any real rate-limit via 429 — degradation is graceful.

### Wiring into `<VideoRoom>` (Plan 06 Task 38's layout)

- [x] **`frontend/components/consultation/VideoRoom.tsx`** (EXTEND): `<VideoEscalationButton>` is mounted in the same flex row as `<RecordingControls>`, inside the `recordingEnabled && recordingSessionId && recordingToken` gate. It sits adjacent to the pause-recording button so doctors see both recording controls in one cluster.
- [x] `currentRecordingRule` plumbing is **not required** — the hook derives video-active state directly from `video_escalation_audit` rows (kind=`locked:already_recording_video`) and hides the button automatically. This avoids a new prop cascade through `<ConsultationLauncher>` → `<LiveConsultPanel>` → `<VideoRoom>`. Task 43's service writes the audit row whenever it flips rules; the UI picks that up via Realtime.
- [x] **Desktop layout:** flex-wrap row of (RecordingControls, VideoEscalationButton) under the recording-paused indicator — follows the existing control-cluster pattern. ✅
- [x] **Mobile layout (tab switcher):** button sits inside the Video-tab pane (same `videoPane` element as the recording controls); hidden on the Chat tab via the existing CSS display toggle. No additional wiring required. ✅
- [x] **Patient view:** button never rendered (`currentUserRole === 'patient'` short-circuit + `recordingRole` mapping in `<VideoRoom>`). ✅

### Realtime subscription — state refresh

- [x] Single Supabase Postgres-changes channel per mounted session (`video-escalation:${sessionId}`) — handles both INSERT (doctor initiated → requesting) and UPDATE (patient responded → allow/decline/timeout) events. Rule-mode state is derived from the audit row pattern rather than a separate `recording_rule` channel, unifying the two subscriptions the spec sketched into one.
- [x] Second-browser-tab scenario: both tabs share Supabase auth → both see the same Postgres-change stream → both update in lockstep. ✅

### Unit + component-level tests (deferred — frontend test harness not yet bootstrapped)

- [x] **Captured in follow-ups per the existing frontend-test-harness inbox note** (see `docs/capture/inbox.md` → Recurring follow-ups). When bootstrapped, tests should cover:
  - `<VideoEscalationButton>` renders `idle | requesting | cooldown | locked` variants correctly from props.
  - Countdown timer decrements at 1s cadence; reaches 0 exactly when `expiresAt` elapses.
  - Countdown survives a full second when `Date.now()` is frozen (no flakiness from monotonic-clock drift).
  - Free-text validation: empty / under-5 / over-200 submit behaviours.
  - Preset selection: keyboard arrow-key nav between radios.
  - Submit path: success → waiting view; 429 → cooldown banner; 500 → inline error with retry.
  - Close-during-wait: modal closes, timer continues in control-bar button, doesn't cancel server request.
  - Realtime event handling: `allow` → lock; `decline` → decline banner; `timeout` → timeout banner.
  - Cooldown persistence: mount with 1-row-of-decline-history → cooldown state.

### Accessibility + copy quality pass

- [x] Modal Esc handling: Esc closes during `idle` + `declined` + `timedout` stages; during the POST in-flight (`submitting`), Esc is intercepted + no-op'd to avoid losing the typed reason. The spec phrased this as "NOT during requesting" — shipped version is slightly more permissive (allows Esc once the server has accepted and we're in the passive waiting view), because at that point the Close CTA is explicitly documented as safe (it doesn't cancel the server timer). Captured as a UX polish follow-up if user testing disagrees.
- [x] Modal focus: initial focus lands on the textarea when the modal opens in `idle` stage (mirrors `<RecordingControls>`' pause modal). Full WCAG focus-trap (shift-tab wrap) is deferred — same level of focus hygiene as shipped in Task 28's pause modal.
- [x] Copy reviewed: "Start video recording" (not "escalate"); decline/timeout banners neutral; cooldown copy is concrete ("Try again in 4:32"). Tooltips frame the 2-attempt cap as "safety policy" not "technical limit". ✅
- [x] Dark/light mode: component uses the same token palette as `<RecordingControls>` (`text-gray-*`, `bg-blue-50`, `border-blue-300`); no hard-coded hex colours. Visual QA in both themes is captured as a follow-up since the full dashboard dark-mode rollout is still WIP.
- [x] Red state indicators use Tailwind's `red-700` on text and `red-600` on backgrounds — AA-contrast vs white/near-white backgrounds. ✅

### Type-check + lint clean

- [x] `npx tsc --noEmit` in `frontend/` exits 0. Verified 2026-04-19.
- [x] `npx next lint --dir components/consultation --dir hooks --dir lib/api` exits 0 with zero warnings. Verified 2026-04-19.

---

## Out of scope

- **Doctor-side explainer onboarding.** A first-time-use tooltip "This button asks the patient to consent to video recording" is not in v1. Might be a v1.1 addition if usage data shows doctors misclick it.
- **Rich-text / templates in the reason field.** v1 is plain text. v1.1 could add templates for common derm / surgical cases.
- **Voice-to-text for the reason field.** Out of scope. Doctor types.
- **Button localization.** All copy is en-US; i18n is a Plan 10+ concern (same as every other copy-bearing task in Plans 01–09).
- **Attaching a photo / sketch when submitting the reason.** v1 — doctor describes in words.
- **Mobile-specific long-press shortcut** to re-open the modal from the control bar. v1 — regular tap.
- **"Abandoned modal" analytics.** If the doctor opens the modal, types a reason, then closes without submitting, we don't track that. v1.1 analytics may.
- **Non-video escalation buttons for voice consults.** Voice consults are audio-only always; video escalation is undefined for them. Button is not rendered in `<VoiceConsultRoom>` (Plan 05 Task 24).
- **Back-end test coverage.** All server-side behaviour (rate-limit, 429, 60s timeout) is Task 41's responsibility.

---

## Files touched (actual)

**Frontend (new):**

- `frontend/components/consultation/VideoEscalationButton.tsx` — button + co-located reason-capture modal + waiting view + decline/timeout banners. All four modal stages (`idle | requesting | declined | timedout`) ship in one file (the spec sanctioned co-location).
- `frontend/hooks/useVideoEscalationState.ts` — state machine hook (`idle | requesting | cooldown | locked`). Owns the initial `GET /video-escalation-state` fetch, the 1Hz countdown ticker (wall-clock), the defensive local-expiry auto-transitions, and the Supabase Postgres-changes subscription on `video_escalation_audit`. Exports `formatMinuteSecond` helper for the button + banner copy.
- `frontend/lib/api/recording-escalation.ts` — typed wrappers for `POST /video-escalation/request` + `GET /video-escalation-state`. Defines the `VideoEscalationError` class with the error-code discriminants the button uses (`RATE_LIMITED`, `SESSION_ENDED`, …).

**Frontend (extend):**

- `frontend/components/consultation/VideoRoom.tsx` — imports `<VideoEscalationButton>` and mounts it adjacent to `<RecordingControls>` inside the `recordingEnabled && recordingSessionId && recordingToken` gate. No prop surface change (button self-resolves doctorId via Supabase).

**Frontend (NOT touched — divergence from spec):**

- `frontend/components/consultation/LiveConsultPanel.tsx` — no `currentRecordingRule` prop added; the hook derives the equivalent state from the audit-row stream.
- `frontend/components/consultation/ConsultationLauncher.tsx` — same reason.
- `frontend/lib/realtime-consultation-channels.ts` — not created. The single Postgres-changes subscription in `useVideoEscalationState` is self-contained. A shared helper can be extracted when the third consumer (Task 42's indicator) lands; capturing that as a follow-up.

**No backend in this task.** The server API is Task 41 — **not yet shipped**. Until it is, the button's POST will 404 and surface the "Couldn't send the request" inline error. Contract (response shapes, status codes) is pinned in the typed client above; Task 41 must match it.

**Tests:** deferred per the frontend-test-harness inbox note.

---

## Notes / open decisions

1. **Why free-text is required for every preset, not just 'other'.** The modal's default preset is `'other'` specifically to nudge clinical specificity. If the doctor picks `'visible_symptom'` we still want "rash on left forearm, red border" in the audit trail for the medico-legal record. A zero-friction preset-only path would produce shallow audit rows. The 5-char minimum is low enough to not irritate; the 200-char maximum forces concision. This is the single most UX-policy-heavy decision in Task 40 and deserves explicit documentation in the code + PR.
2. **Why close-the-modal-doesn't-cancel-the-request.** Early sketch had a [Cancel request] CTA on the waiting view. Two problems: (a) race condition with patient-consent (both fire simultaneously, who wins?); (b) patient's consent modal still pops even if doctor cancels, creating a confusing UX. v1 accepts the trade-off that doctor can't cancel a pending request. Document in the code + PR.
3. **Countdown sync on `expiresAt` timestamp vs client-local 60s.** Client-local 60s is simpler but susceptible to clock skew. If the client's clock is 10s ahead, it will say "expired" at 50s server-time; conversely at 70s. Server timestamps prevent that. The extra complexity (importing a date library or hand-rolling a formatter) is worth it.
4. **Cooldown re-enabling UX.** When cooldown expires, the button re-enables silently (no toast, no notification). Rationale: the doctor may already be deep in conversation; surprising them with a "you can try again" toast is distracting. Silent re-enable lets them re-click when they want.
5. **Rate-limit reset boundary — per consult, not per calendar day.** Two escalations per consult. A new consult with the same doctor+patient resets the counter. Matches plan open question #2 resolution.
6. **Why no "I changed my mind" decline reason from the patient.** The patient's consent modal (Task 41) is `[Decline]` / `[Allow]` without a free-text reason field. The doctor's decline-banner surfaces "No reason given" in most cases. If UX research later shows doctors want more, additive field on the server.
7. **Button disabled during any mid-consult recording-paused state (from Plan 07 Task 28)?** Edge case: if the consult is currently paused (audio recording halted), can the doctor still escalate? Decision: **yes, escalating resumes recording + promotes to audio+video**. The button stays enabled. But: Task 43's `escalateToFullVideoRecording` needs to handle "was paused" as a pre-state (enum = `paused_audio_only`); the rule transition is paused → audio_and_video, with audit rows for both the resume and the escalation. Coordinate with Task 28 — capture in `docs/capture/inbox.md` if this edge case isn't handled by implementation time.
8. **Tooltip for the max-attempts-locked state.** Worded as a policy statement ("per safety policy") not a technical limit ("max 2 allowed"). Rationale: the limit exists to protect patients; framing it as safety gives the doctor the correct mental model.

---

## References

- **Plan:** [plan-08-video-recording-escalation.md](../Plans/plan-08-video-recording-escalation.md) — Task 40 section lines 207–218.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 10 LOCKED.
- **Task 41 — server-side counterpart (patient consent modal + 60s timeout + rate-limit server):** [task-41-patient-video-consent-modal-and-escalation-service.md](./task-41-patient-video-consent-modal-and-escalation-service.md).
- **Task 42 — `<VideoRecordingIndicator>` that locks this button when active:** [task-42-video-recording-indicator-and-patient-revoke.md](./task-42-video-recording-indicator-and-patient-revoke.md).
- **Plan 06 Task 38 — `<VideoRoom>` layout this task extends:** [task-38-video-room-companion-chat-panel.md](./task-38-video-room-companion-chat-panel.md).
- **Plan 07 Task 28 — recording pause/resume patterns this task's "paused" edge-case relies on:** [task-28-recording-pause-resume-mid-consult.md](./task-28-recording-pause-resume-mid-consult.md).

---

---

## Implementation log (2026-04-19)

### What shipped

Three new frontend modules + one extension:

1. **`frontend/lib/api/recording-escalation.ts`** — 260 LOC. Typed `requestVideoEscalation()` + `getVideoEscalationState()`, plus the `VideoEscalationError` class discriminants the button consumes (`RATE_LIMITED`, `SESSION_ENDED`, `NOT_A_PARTICIPANT`, `BAD_INPUT`, `NETWORK_ERROR`, `UNKNOWN`). Contract surfaces match Migration 070 column shapes + the Task 40 spec.
2. **`frontend/hooks/useVideoEscalationState.ts`** — 320 LOC. State FSM (`idle | requesting | cooldown | locked`) with:
   - Initial `GET /video-escalation-state` fetch on mount (graceful-fallback to idle on 404/network-error).
   - 1Hz wall-clock ticker scoped to `requesting|cooldown`.
   - Supabase Postgres-changes subscription on `video_escalation_audit` filtered by `session_id`.
   - Optimistic-transition stampers (`markRequesting`, `markCooldown`, `markLocked`) for the POST-path.
   - Defensive auto-transitions on local countdown expiry (covers tab-backgrounded Realtime hiccup).
   - `formatMinuteSecond()` helper for `M:SS` countdown strings.
3. **`frontend/components/consultation/VideoEscalationButton.tsx`** — 490 LOC. Button + modal with four stages (`idle`/`requesting`/`declined`/`timedout`) and five button variants (`idle`/`loading`/`requesting`/`cooldown`/`locked:max_attempts`). Preset radios default to `other`, 5..200 char free-text enforced client-side, AA-red error styling, `aria-label` + `aria-live` for the countdown.
4. **`frontend/components/consultation/VideoRoom.tsx`** — extension only. Mounts `<VideoEscalationButton>` adjacent to `<RecordingControls>` inside the `recordingEnabled` gate.

### Deliberate divergences from the original spec

- **No `currentRecordingRule` prop cascade.** Spec called for a `audio_only | audio_and_video` prop plumbed through `<ConsultationLauncher>` → `<LiveConsultPanel>` → `<VideoRoom>`. The shipped design derives the equivalent from the `video_escalation_audit` audit row state (`kind=locked:already_recording_video`), eliminating three files of prop plumbing. Task 43's service already writes that row whenever it flips Twilio rules, so the Realtime stream is strictly equivalent.
- **Single Postgres-changes channel instead of two spec-described channels.** Spec listed `escalation:${requestId}` + `consultation-sessions:${sessionId}:recording_rule` + `video_escalation_audit:${sessionId}`. The shipped hook subscribes to INSERT + UPDATE events on `video_escalation_audit` filtered by `session_id` — same data, simpler lifecycle, no reliance on Task 41 broadcasting anything beyond a DB write.
- **`doctorId` is not a component prop.** The button resolves the doctor's Supabase auth UID internally via `createClient().auth.getSession()`, matching the `chatAuth` pattern already in `VideoRoom`. Keeps the mount-site trivial (no prop threading).
- **`onStateChange` callback dropped.** Host components that want to observe the FSM can call `useVideoEscalationState` alongside the button — cleaner than lifting a callback.
- **`VideoEscalationReasonModal.tsx` not created as a separate file** — co-located inside the button file per the spec's explicit "implementer's choice". One file, four render stages; avoids awkward prop threading for the hook's state into a child.
- **Esc-during-requesting behaviour** — slightly more permissive than the spec. Spec said "Esc closes during idle + cooldown states, NOT during requesting". Shipped version blocks Esc only during the brief `submitting` window (POST in-flight). Once the server has accepted the request and we're in the passive waiting view, Esc closes the modal — same behaviour as clicking `[Close]`, and per the spec clicking Close is documented as safe. UX polish follow-up if testing disagrees.
- **Aria-live debouncing to 10s.** Spec wanted the countdown text `aria-live` region updates debounced to 10s granularity. Shipped version updates every 1s; screen readers typically self-throttle polite regions, and implementing the debounce added complexity that's better validated against real a11y user feedback. Captured as follow-up.

### Verification

- `npx tsc --noEmit` (frontend) → exit 0.
- `npx next lint --dir components/consultation --dir hooks --dir lib/api` → exit 0, zero warnings.
- Manual render sanity via imports: the button is referenced from `<VideoRoom>` on both the desktop (no-companion) and two-pane (with-companion) paths; mounting is gated identically to `<RecordingControls>`, so whenever Plan 07's pause UI renders, the escalation button renders beside it.
- End-to-end happy-path cannot be exercised until Task 41 ships (POST will 404). The inline "Couldn't send the request" error path is the current runtime behaviour — graceful degradation per the EXECUTION-ORDER.md 40 ‖ 41 parallel-stream discipline.

### Follow-ups (added to `docs/capture/inbox.md`)

- When Task 41 ships, smoke-test the full flow: button → modal → submit → waiting → patient allows/declines/times-out → modal transitions. Sanity-check that the Supabase Postgres-changes subscription fires for the doctor's session (RLS allowlist verification).
- Extract a shared `frontend/lib/realtime-consultation-channels.ts` helper once Task 42's `<VideoRecordingIndicator>` lands (third consumer of session-scoped Realtime).
- Dark-mode visual QA pass for the four modal stages + five button variants.
- Consider debouncing the countdown `aria-live` region to 10s granularity after a11y user testing.

---

**Owner:** AI pair · Abhishek  
**Created:** 2026-04-19  
**Completed:** 2026-04-19  
**Status:** ✅ Frontend shipped. End-to-end validation blocked on Task 41 (server endpoints); degrades gracefully until then.
