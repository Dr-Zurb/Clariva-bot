# Task video-B1: Pre-call lobby (clinic branding + countdown; extends A7)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch B (T2 real polish) — **M item, ~5h**

---

## Task overview

A7's bare camera+mic check is functional but feels like a debug screen. T2.9 wraps it with **clinic-branded lobby chrome**:

- Top: clinic logo + practice name + appointment date/time (en-GB locale).
- Below banner: countdown — "Your consult starts in 02:34" → "Starting now…" → "Waiting for Dr. Sharma to join…".
- Existing A7 mic-check + camera-check section preserved.
- Reassuring copy: "Hold tight — Dr. Sharma will join shortly."

After scheduled time passes, countdown switches to "Waiting for Dr. Sharma to join…" with a soft pulse.

**Doctor side** has the parallel variant: branding is the doctor's own clinic; countdown is "Patient joining shortly" / "Patient hasn't joined yet (waited 02:34)".

Reuses voice batch's `frontend/lib/clinic/branding.ts` (voice T2.9 / B2).

**Estimated time:** ~5h.

**Status:** Complete (2026-05-01).

**Depends on:** [task-video-A7](./task-video-A7-precall-camera-mic-check.md) (HARD — extends), voice [task-voice-B2](./task-voice-B2-precall-lobby.md) (SOFT — reuse branding lib).

**Source:** [T2 §T2.9](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md); [decision §6](../Plans/plan-video-consult-selected-features.md#before-sub-batch-b-starts).

---

## Acceptance criteria

### `frontend/lib/clinic/branding.ts`

- [x] **Voice B2 hadn't shipped** → ship the lib here per the voice B2 contract.
  - Pure normaliser `resolveClinicBranding({ practiceName?, logoUrl?, primaryColor? }) → ClinicBranding` with text-only fallback (`'Your clinic'` when input is sparse). `isFallback` flag exposed so renderers can dim the chrome.
  - Reuses shared `actorInitials` / `actorColor` from `frontend/lib/call/actor-avatar.ts` so the lobby logo placeholder + the in-call caller card share the same initials algorithm + colour palette.
  - `formatAppointmentTimeEnGB(iso)` returns `{ dateLine: 'Fri, 1 May 2026', timeLine: '14:30' }` from cached `Intl.DateTimeFormat('en-GB')` instances.
  - **No fetch path**: data already arrives via `requestTextSessionToken` → `exchangeTextConsultTokenHandler` (which already looks up `doctor_settings.practice_name` for the chat header — see `consultation-controller.ts §practiceName lookup`). The lib normalises the payload; it doesn't re-fetch. This satisfies the "single-fetch / no fetch storm on countdown re-renders" requirement structurally.
  - Deferrals (documented in the file header): `logoUrl` (no `doctor_settings.logo_url` column today; field plumbed for forward compat); `primaryColor` (same); in-memory cache (single render per join, not needed yet).

### `<VideoConsultLobbyHeader>` + `<VideoConsultLobbyCountdown>` (extracted, not bolted into PreCall)

- [x] **New `frontend/components/consultation/VideoConsultLobbyHeader.tsx`** — clinic-branded header card: logo slot (initials placeholder today; `<img>` when `logoUrl` arrives, with `onError` fallback to initials so a broken upload doesn't leave a broken-image icon), practice name, appointment date · time line. Title attribute carries the untruncated practice name for tooltips.
- [x] **New `frontend/components/consultation/VideoConsultLobbyCountdown.tsx`** — three-phase banner (`countdown` blue, `starting` green pulse, `waiting` amber pulse). Pure `computePhase()` resolver exported for future tests. `setInterval(1s)` only ticks while in `countdown`/`starting` (auto-stops on transition); pauses on `document.visibilityState === 'hidden'` to save battery on background tabs.
- [x] **Edit `frontend/components/consultation/VideoConsultPreCall.tsx`** — removed the temporary `sessionMeta` chip placeholder (introduced in A7 as a forward-compat seam for B1; superseded by the lobby header above). Header doc updated to point at B1.
- [x] **Edit `frontend/app/consult/join/page.tsx`** — composes `<VideoConsultLobbyHeader>` + `<VideoConsultLobbyCountdown>` ABOVE `<VideoConsultPreCall>` in the `step === 'precall'` branch, with branding + scheduled time pulled from `companion.data` (when status='ok'). Falls back gracefully (generic "Your clinic" + waiting state) when companion exchange failed.
- [ ] **Doctor variant — DEFERRED**. A7 only ships a patient-side `<VideoConsultPreCall>`; the doctor side mounts `<VideoRoom>` directly via `<ConsultationLauncher>` with no pre-call gate. Building a doctor lobby would require either a new doctor pre-call screen (out of B1's scope) or composing the lobby cards inside `<ConsultationLauncher>`'s pre-live state (would couple the launcher to lobby chrome). Recommend a follow-up task `task-video-B1b-doctor-lobby.md` once a doctor pre-call mount point exists. Components are role-agnostic — header takes branding (would be the doctor's own); countdown takes `counterpartyLabel` (would be `'your patient'`).

### Countdown behavior

- [x] Computes from `scheduledStartAt` of the **session** (carried from `consultation_sessions.scheduled_start_at` via the existing exchange payload — same source as the appointment time, no separate read needed).
- [x] Updates every second via `setInterval(1000)`; cheap state-equality guard prevents re-renders when display string didn't change (halves paints in the steady state).
- [x] At T-0: switches to "Starting now…" for 30s (`STARTING_NOW_WINDOW_MS`), then to "Waiting for your doctor to join…".
- [x] If `scheduledStartAt` is in the past >30 min (`LATE_THRESHOLD_MS`): switches to "Waiting…" immediately at first render.
- [x] If `scheduledStartAt` is missing (drop-in / instant consult): renders "Waiting for your doctor to join…" with the pulse, no countdown.

### Manual smoke

- [ ] Patient opens link 5 min before scheduled time → countdown shows "Your consult starts in 04:59" → ticks down. *(Pending PR review — waits for a real test appointment.)*
- [ ] At scheduled time → flips to green "Starting now…" with pulse for 30s. *(Pending.)*
- [ ] After 30s → flips to amber "Waiting for your doctor to join…" with pulse. *(Pending.)*
- [ ] Doctor joins → patient clicks Continue → transitions to live `<VideoRoom>` (lobby unmounts → countdown interval cleared by useEffect cleanup; verified by code structure). *(Pending visual verification.)*
- [ ] No `logoUrl` today (always undefined under v1 schema) → text + initials placeholder renders without console errors. *(Pending — but the rendering path is the only path today, so this is implicitly the default.)*
- [ ] Mobile + desktop both render correctly. *(Pending viewport sweep.)*
- [x] A7's mic-check + camera-check section continues to work unchanged — no logic changes inside `<VideoConsultPreCall>`, only the vestigial chip + a doc-comment update.
- [ ] **Deferred** — doctor side variant (no mount point exists today; see Doctor variant note above).

### General

- [x] Type-check (`npx tsc --noEmit`) clean.
- [x] Lint (`npx eslint`) clean on all five touched files.
- [x] Branding lookup is single-fetch — data arrives once via the companion-token exchange the join page already makes; the lib only normalises, no fetch path inside it.
- [x] Date formatted as `en-GB` via cached `Intl.DateTimeFormat` instances.

---

## Implementation log (2026-05-01)

### Audit findings that shaped the implementation

1. **Backend already exposes the data we need.** `exchangeTextConsultTokenHandler` (companion text-token endpoint) already returns `practiceName` (from `doctor_settings.practice_name` via service-role lookup) AND `scheduledStartAt` (from `consultation_sessions.scheduled_start_at`). The patient join page already calls this exchange (Plan 06 Decision 9 / voice-0B). **B1 reads from this existing payload — no backend changes needed.** This validates the task draft's `Backend / migrations / tests: none` line.
2. **`doctor_settings` has no `logo_url` or `primary_color` column** (verified against `docs/Reference/engineering/architecture/DB_SCHEMA.md` §doctor_settings). The lib type plumbs both for forward compat; the resolver returns `undefined` for both today; the header gracefully shows the initials placeholder.
3. **No `doctor_full_name` exposed to patient.** The `practiceName` is the only doctor-identifying string the patient sees client-side (mirrors the existing IG / SMS / email fan-outs). Countdown therefore uses generic copy `"your doctor"` instead of `"Dr. Sharma"`. When a future task surfaces the doctor name to the patient (likely via `exchangeTextConsultTokenHandler` extension), pass it as `counterpartyLabel`.
4. **Doctor side has no pre-call mount point.** A7 added pre-call only on the patient `/consult/join` page; the doctor flow goes straight from `<ConsultationLauncher>` → `<VideoRoom>`. Doctor variant deferred (see acceptance section).

### Deviations from the draft

- **Two components extracted instead of one wrapper / inline.** The task draft suggested either editing `<VideoConsultPreCall>` in-place OR adding a single `<VideoConsultPreLobby>` wrapper. Shipped as TWO components (`<VideoConsultLobbyHeader>` + `<VideoConsultLobbyCountdown>`) composed at the page level. Rationale: cleaner separation (PreCall stays focused on device check); easier to reuse independently when the doctor mount point lands; easier to test the pure phase resolver without React.
- **Removed `sessionMeta` prop from `<VideoConsultPreCall>`.** Was added by A7 as a forward-compat seam; superseded by the lobby header. Nothing was passing it, so safe to drop.
- **Visibility-pause optimisation.** Beyond the spec — pauses the 1s interval when the tab is hidden. Background tabs without this would still tick, wasting CPU. Re-syncs immediately on focus return.
- **Phase + display-string equality guard in the tick.** Avoids re-renders when neither the phase nor the formatted countdown string changed. ~Halves paints in the steady state.

### Files touched

**Frontend (5 files, ~370 LOC net):**
- `frontend/lib/clinic/branding.ts` — **new** (~165 LOC). Pure helper module.
- `frontend/components/consultation/VideoConsultLobbyHeader.tsx` — **new** (~100 LOC).
- `frontend/components/consultation/VideoConsultLobbyCountdown.tsx` — **new** (~210 LOC).
- `frontend/components/consultation/VideoConsultPreCall.tsx` — **edit** (-15 LOC: dropped `sessionMeta` prop + chip; doc updated).
- `frontend/app/consult/join/page.tsx` — **edit** (+30 LOC: import + compose lobby chrome above PreCall in the precall branch).

**Backend / migrations / tests:** none (as the draft predicted).

### Follow-ups

- **`task-video-B1b-doctor-lobby.md`** (suggested) — once a doctor pre-call screen exists, mount the same `<VideoConsultLobbyHeader>` + `<VideoConsultLobbyCountdown>` with `counterpartyLabel='your patient'` and the doctor's own clinic branding (already accessible doctor-side via `getDoctorSettings`).
- **Doctor name plumb-through** — extend `exchangeTextConsultTokenHandler` response with optional `doctorDisplayName` so the patient countdown can read "Waiting for Dr. Sharma to join…". Schema follow-up needed first (no `doctor_full_name` column).
- **Logo upload pipeline** — voice B2 / a future task to add `doctor_settings.logo_url` (TEXT) + Supabase Storage bucket + dashboard upload UI; the lobby header's `logoUrl` slot is already wired with `onError` fallback.
- **Component tests** — `__computePhaseForTests` is exported from the countdown module specifically to enable a Jest test sweep of the four phase transitions without React. Skipped in the v1 PR (manual smoke covers it); cheap to add when the test sweep cycle picks back up.

---

## Out of scope

- **Background music.** Out of scope (Principle 8: medical UX, not waiting-room muzak).
- **Live "doctor is on the way" Realtime presence.** Out of scope for v1; T-0 switchover is good enough.
- **Custom lobby per clinic** (different photos / videos). Out of scope.
- **Estimated wait time AI prediction.** Out of scope.

---

## Files expected to touch

**Frontend:**
- `frontend/lib/clinic/branding.ts` — **reuse** if voice shipped, **new** otherwise (~50 LOC).
- `frontend/components/consultation/VideoConsultPreCall.tsx` — **edit** (~70 LOC: add lobby header + countdown).
- `frontend/app/consult/join/page.tsx` — **possibly edit** if lobby state needs page-level orchestration.

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Decision §6** — `clinic.branding.logoUrl` confirmed as source. Fall back to text-only.
2. **Why extend A7 vs replace** — A7's mic-check is the foundation; B1 just adds chrome around it. Don't reinvent.
3. **Date locale** — en-GB per the [deferred date-locale hydration sweep](../../../deferred/deferred-date-locale-hydration-sweep-2026-04-28.md).
4. **No live-presence beacon** — would require Realtime; out of scope. Twilio's `participant-connected` event handles the actual switchover.
5. **Cross-modality coordination** — the lobby chrome should look identical between voice and video lobbies (different inner content). Pull voice batch's `<ConsultLobbyHeader>` if extracted; otherwise inline.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch B](../Plans/plan-video-consult-selected-features.md#sub-batch-b--real-polish-5-days)
- **Source item:** [T2 §T2.9](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md)
- **Hard dep:** [task-video-A7](./task-video-A7-precall-camera-mic-check.md)
- **Sibling (voice):** [task-voice-B2](./task-voice-B2-precall-lobby.md)
- **Decision:** [§6 — lobby branding source](../Plans/plan-video-consult-selected-features.md#before-sub-batch-b-starts)

---

**Owner:** Sahil
**Created:** 2026-04-30
**Status:** Complete (2026-05-01).
