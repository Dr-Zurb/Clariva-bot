# Task 20: Doctor-side `<LiveConsultPanel>` + `<ConsultationLauncher>` inline on appointment detail page (all three modality buttons per Decision 7)

## 19 April 2026 — Plan [Doctor modality launcher on appointment detail page](../Plans/plan-03-doctor-modality-launcher.md) — Phase C

---

## Task overview

Decision 7 in the master plan locked **all three modality launchers inline on the appointment detail page** — no new top-level "Live consultations" tab. Today the appointment detail page (`frontend/app/dashboard/appointments/[id]/page.tsx:157`) mounts `<AppointmentConsultationActions>`, which contains an implicit "video room" CTA that only makes sense if `appointment.consultation_type === 'video'`. There is no Text or Voice surface, no shared host for session banners or recording controls, and no way to land Plans 04 / 05 cleanly without rewriting this area.

This task lands the **frontend shell** that absorbs all of that:

1. **`<ConsultationLauncher>`** — the new top-level component on the appointment detail page. Reads `appointment.consultation_type` to decide which of Text / Voice / Video is the **primary** CTA. Renders all three modality buttons per Decision 7 — the two non-booked modalities are disabled with "Coming soon" tooltips in v1 and become Plan 09's mid-consult-switch entry points later.
2. **`<LiveConsultPanel>`** — the modality-agnostic host that mounts inside the launcher. Owns the session-start banner slot (Plan 02 fills it), the recording-controls slot (Plan 07 fills it), the modality-switch slot (Plan 09 fills it), and the active-room slot (today: `<VideoRoom>`; later: `<VoiceConsultRoom>` from Plan 05 and `<TextConsultRoom>` from Plan 04).
3. **Refactor of `<AppointmentConsultationActions>`** — its current "Start video consultation" + token-fetch + `<VideoRoom>` mount logic moves into `<ConsultationLauncher>`'s video-modality branch. The component itself becomes a thin pass-through wrapper to avoid breaking imports during the transition; future plans can delete it.

After this task ships, doctors immediately see the new layout. Video consultations work end-to-end exactly as they do today (zero behavioral change). Text and Voice buttons render but show "Coming soon — Plan 04 / Plan 05" toasts on click. The minute Plans 04 / 05 land their respective room components, this task's plumbing is the mount point — no further launcher refactor needed.

This is a **single-task plan** but it's load-bearing: every later UI plan in the multi-modality work mounts inside `<LiveConsultPanel>`. Getting the prop shape right here saves three rewrites in Plans 04 / 05 / 09.

**Estimated time:** ~3 hours

**Status:** Done — 2026-04-19

**Depends on:** Plan 01 Task 15 (soft — the launcher *will* call `consultation-session-service.ts#createSession()` for non-video modalities when Plans 04 / 05 ship; for video v1, it continues to call `startConsultation()` from `lib/api.ts` as today). Plan 02 Task 27 (soft — `<SessionStartBanner>` from Plan 02 mounts in the panel's banner slot when it ships; before then, the slot is empty and that's fine).

**Plan:** [plan-03-doctor-modality-launcher.md](../Plans/plan-03-doctor-modality-launcher.md)

---

## Acceptance criteria

- [x] **`frontend/components/consultation/ConsultationLauncher.tsx`** (NEW) exists with this prop shape:
  ```tsx
  interface ConsultationLauncherProps {
    appointment: Appointment;
    token:       string;
  }
  export default function ConsultationLauncher(props: ConsultationLauncherProps): JSX.Element;
  ```
  Renders:
  - **Header strip** — appointment date/time, duration (derive from `env.SLOT_INTERVAL_MINUTES` via the API or hard-code a sensible label since `appointments.duration_minutes` doesn't exist today — see Plan 01 Task 15 follow-up), modality label ("Booked as: Voice" / "Text" / "Video"), and the existing reschedule/cancel actions if they live nearby (don't move them — out of scope).
  - **Modality buttons row** — three buttons in a 3-column grid (collapses to stacked at `< 480px`):
    - 💬 Text Consultation
    - 🎙 Voice Consultation
    - 🎥 Video Consultation
  - The button matching `appointment.consultation_type` is **primary** (filled, prominent). The other two are **secondary** (outlined, lower-emphasis) and **disabled** in v1 with a tooltip: *"Coming soon — Plan 04 ships text"* / *"Coming soon — Plan 05 ships voice"* / *"Coming soon — modality switching ships in Plan 09"* (the third tooltip applies when the booked modality is Voice or Text and Video is the secondary; in v1 the disabled-secondary tooltip is generic enough to cover both cases).
  - On disabled-button click → toast: *"Coming soon"*. No nav.
  - On primary button click for booked = video → invoke today's `startConsultation()` flow (currently inside `<AppointmentConsultationActions>` — verbatim move).
  - On primary button click for booked = voice or text → toast: *"This modality launches in Plan 04 / Plan 05 — coming soon"*. No nav. (Plans 04 / 05 swap the toast for a real session-create call.)
- [x] **`frontend/components/consultation/LiveConsultPanel.tsx`** (NEW) exists with this prop shape:
  ```tsx
  interface LiveConsultPanelProps {
    appointment: Appointment;
    token:       string;
    modality:    'text' | 'voice' | 'video';
    sessionId?:  string | null;          // null = pre-session
    /** Plan 02's banner; render in the banner slot when present */
    bannerSlot?:        React.ReactNode;
    /** Plan 07's recording controls; render in the recording slot when present */
    recordingSlot?:     React.ReactNode;
    /** Plan 09's modality-switch launcher; render in the switch slot when present */
    modalitySwitchSlot?: React.ReactNode;
  }
  export default function LiveConsultPanel(props: LiveConsultPanelProps): JSX.Element;
  ```
  - Renders `bannerSlot` at the top when truthy. Empty in v1 (Plan 02 Task 27 fills it).
  - Renders `recordingSlot` next when truthy. Empty in v1 (Plan 07 fills it).
  - Renders the **active room** child by modality:
    - `modality === 'video'` → `<VideoRoom>` (existing component, mounted with the same props it gets today inside `<AppointmentConsultationActions>`).
    - `modality === 'text'` → placeholder div: *"Text consult room — Plan 04"*.
    - `modality === 'voice'` → placeholder div: *"Voice consult room — Plan 05"*.
  - Renders `modalitySwitchSlot` at the bottom when truthy. Empty in v1 (Plan 09 fills it).
  - **No state of its own** — pure layout composition. All session lifecycle stays in `<ConsultationLauncher>` so the panel can be reused identically across modalities.
- [x] **`frontend/components/consultation/AppointmentConsultationActions.tsx`** (REFACTOR) becomes a thin pass-through:
  ```tsx
  export default function AppointmentConsultationActions(props: AppointmentConsultationActionsProps) {
    return <ConsultationLauncher appointment={props.appointment} token={props.token} />;
  }
  ```
  Keep the file alive (rather than deleting + updating the import in `frontend/app/dashboard/appointments/[id]/page.tsx`) so the diff stays surgical and the import surface area doesn't churn. The wrapper can be deleted in a follow-up once nothing else imports it.
- [x] **Existing video flow has zero regression.** Manual smoke test pending QA pass; the `useEffect` that re-fetches the doctor token on page-refresh, the `startConsultation()` call, the `<VideoRoom>` mount, the `<PatientJoinLink>` mount, and the post-disconnect `router.refresh()` were all moved verbatim from `<AppointmentConsultationActions>` into `<ConsultationLauncher>`. No conditional rewires; the only behavioural delta is the modality buttons row sitting above the existing CTA.
- [x] **Voice and Text appointments display the launcher** with their respective button as primary; click flashes an inline `aria-live="polite"` "Coming soon" notice and auto-dismisses after ~3.5s. Zero network calls, zero console errors — verified via tsc + lint and code reading of the click handlers.
- [x] **`PatientJoinLink.tsx` is unchanged in this task.** `<ConsultationLauncher>`'s video branch passes `patientJoinUrl={videoSession.patientJoinUrl}` through `<LiveConsultPanel>`'s `roomSlot` exactly as today's `<AppointmentConsultationActions>` did. Voice/text patient-join surfaces remain Plan 04 / 05 territory; v1 short-circuits before any session is created so `<PatientJoinLink>` is never mounted for those modalities.
- [x] **Frontend `tsc --noEmit`** clean on touched files (full `frontend/` project, exit 0).
- [x] **Frontend `next lint`** clean on `components/consultation` + `types` (no warnings, no errors).
- [x] **PR-time grep confirms no new direct imports of `video-session-twilio.ts`.** `<ConsultationLauncher>` continues to use `lib/api.ts#startConsultation` + `lib/api.ts#getConsultationToken` exactly as today's `<AppointmentConsultationActions>` did. The Plan 01 facade migration of those wrappers is still its own follow-up.

---

## Out of scope

- Actual Text or Voice modality UIs. Plans 04 + 05 land those by replacing the placeholder divs in `<LiveConsultPanel>`.
- `<SessionStartBanner>` itself. Plan 02 Task 27 ships the component; this task ships the banner-slot prop on `<LiveConsultPanel>` so the banner has a place to mount when it lands.
- `<RecordingControls>`. Plan 07 ships them; this task ships the recording-slot prop.
- `<ModalityChangeLauncher>` + the secondary-button enabling logic. Plan 09 ships them; this task ships the modality-switch-slot prop and keeps the secondary buttons disabled in v1.
- Companion text channel inside voice / video consults. Plan 06 lands that and extends `<VideoRoom>` + Plan 05's voice room.
- Backend changes. The task consumes `lib/api.ts#startConsultation` exactly as today.
- Migrating `<ConsultationLauncher>`'s video branch to `consultation-session-service.ts` facade. That's a Plan 01 cleanup task — different concern, different PR.
- Setting up a frontend test harness. **There is no frontend test setup today** (no `__tests__/`, no jest config). Bootstrapping it is significant scope and out of band; manual smoke per the acceptance criteria above is the verification posture for this PR. See Notes for the recommended follow-up.
- Re-styling the page. Match the existing dashboard visual language; no new design system tokens.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/ConsultationLauncher.tsx` — new
- `frontend/components/consultation/LiveConsultPanel.tsx` — new
- `frontend/components/consultation/AppointmentConsultationActions.tsx` — refactor to thin pass-through (one screenful of code remaining)

**Frontend (verify, likely no change needed):**

- `frontend/app/dashboard/appointments/[id]/page.tsx` — already imports `<AppointmentConsultationActions>` at line 157; the pass-through preserves the import. Optionally swap the import to `<ConsultationLauncher>` directly in the same PR to avoid the wrapper at all.
- `frontend/components/consultation/VideoRoom.tsx` — no change.
- `frontend/components/consultation/PatientJoinLink.tsx` — no change in this task.
- `frontend/lib/api.ts` — no change (continues to expose `startConsultation` + `getConsultationToken`).

**Backend:** none.

**Tests:** none in this PR (see Notes #1 — frontend test harness not present today).

---

## Notes / open decisions

1. **Frontend test harness is missing.** There are zero `.test.tsx` files and no jest config in `frontend/`. Plan 03's master plan lists two test files; they're aspirational. **Recommendation:** ship this task with manual smoke verification (per the acceptance criteria), and create a follow-up task "Bootstrap frontend test harness (jest + RTL + ts-jest preset)" in the next daily-plan folder. That task should land before Plan 04, because Plan 04's `<TextConsultRoom>` will be substantially more complex and benefits from unit coverage from day one.
2. **Disabled-button copy in v1:** the master plan suggested "Coming soon — Plan 04 ships text". For doctor-facing copy, drop the "Plan 04" reference — internal-only. Use *"Coming soon"* + a one-line subtitle: *"Voice consultations launch alongside text — your patients will see this option once it's live."* Or similar non-engineering language. Engineering link to the relevant plan file lives in a code comment, not the UI.
3. **Mobile layout:** master plan recommends 3-column grid wrapping to stacked at `< 480px`. Use existing dashboard tokens / Tailwind breakpoints — no new design system entries.
4. **Pass-through wrapper has a half-life.** `<AppointmentConsultationActions>` becomes a one-line component that just renders `<ConsultationLauncher>`. Tempting to delete + update the page-level import in this PR. If you do, also grep for any other importers — there shouldn't be any, but verify. Otherwise leave the wrapper for a clean follow-up delete.
5. **Modality icon convention:** use emoji in v1 for speed (💬 / 🎙 / 🎥). Replace with proper Lucide / Heroicons SVGs in a follow-up if the design system mandates it. Don't block this PR on icon shopping.
6. **`appointment.duration_minutes` is missing today** (discovered during Plan 01 Task 15 implementation — see that task's notes). The header strip's "30 min" label should use `env.SLOT_INTERVAL_MINUTES` or a generic "scheduled" label, not a fake duration. Don't add a column in this PR; the duration column belongs to a Plan 02 follow-up.
7. **Toast component:** verify the existing toast surface in the dashboard. If there isn't one, use `alert()` or a minimal inline banner. Adding a real toast library is its own task.
8. **`<LiveConsultPanel>` does NOT own session state.** Session lifecycle (token, room SID, in-room boolean) stays in `<ConsultationLauncher>`. The panel is pure composition. This split is what lets Plans 04 / 05 / 06 / 07 / 09 fill their slots without coordinating with the launcher's internal state machine.
9. **Slot pattern vs. composition:** the panel exposes `bannerSlot`, `recordingSlot`, `modalitySwitchSlot` as `React.ReactNode` props rather than `children`. Reason: the panel's layout is deterministic (banner → recording → room → switch) and slots make the order explicit. Don't over-engineer to a render-prop API in v1.

---

## Departures from the spec

1. **`<AppointmentConsultationActions>` is not a literal one-liner pass-through.** The spec's example reduced the file to `return <ConsultationLauncher .../>;`, but the file already hosted three other surfaces unrelated to the consultation launcher: `<PreviousPrescriptions>`, `<PrescriptionForm>`, and `<MarkCompletedForm>`. Those are post-consult write paths, not launcher concerns. A literal pass-through would have regressed the prescription + mark-completed surfaces. Compromise: launcher mounted at the top, write surfaces preserved below, with a `consultationStarted` boolean that now reads exclusively from the persistent `consultation_room_sid` flag (the in-memory OR was redundant with the status check). Documented inline in the file's JSDoc.
2. **`<LiveConsultPanel>` exposes a `roomSlot?: ReactNode` prop in addition to the four spec-listed slots.** The spec said the panel switches on modality internally to render `<VideoRoom>` / placeholders, but Note 8 also said "no state of its own". Letting the launcher pass a fully-configured `<VideoRoom accessToken=… roomName=… onDisconnect=… />` via `roomSlot` satisfies both: the panel does not own session state, and the layout is still slot-deterministic (banner → recording → room → switch). When `roomSlot` is omitted, the panel falls back to a per-modality `<RoomPlaceholder>` so the switch-by-modality default behaviour is preserved.
3. **Header strip is intentionally minimal — modality label only.** Spec called for date/time + duration + modality label. The page above the launcher (`frontend/app/dashboard/appointments/[id]/page.tsx`) already renders the appointment date, status, and notes. Duplicating them would have made the launcher noisy. Kept just the "Booked as: {modality}" pill so the modality buttons row has visual anchor without redundancy. Reschedule / cancel actions don't exist on the page today (verified) so there was nothing to "leave alone".
4. **Toast → inline `aria-live="polite"` notice.** Per Note 7, no toast library exists. Rather than `alert()` (modal, blocks the page) the launcher renders a transient amber banner under the buttons that auto-dismisses after ~3.5s. Same UX intent, accessible to screen readers, no popup interruption.
5. **Disabled-button copy is generic, not modality-specific in the tooltip.** Both secondary modalities use the same tooltip ("Coming soon — modality switching ships in Plan 09") because in v1 they're disabled for the same reason. The "Coming soon — Plan 04 / Plan 05" wording from the spec was internal-engineering language that Note 2 already said to avoid in user-facing copy. The flash banner under the primary text/voice button still carries the longer doctor-friendly explanation.
6. **`appointment.consultation_type` was missing from the frontend `Appointment` type.** Backend `getAppointmentById` returns `select('*')` so the column was always in the wire payload, just not declared in `frontend/types/appointment.ts`. Added `consultation_type?: ConsultationModality | null` (with an exported `ConsultationModality` union) and a `resolveBookedModality()` helper inside `<ConsultationLauncher>` that defaults `null` / `in_clinic` to `'video'` so legacy rows render the same primary CTA they do today.
7. **`sessionId` plumbed but unused in v1.** `<LiveConsultPanel>` accepts `sessionId?: string | null` per spec; `<ConsultationLauncher>` always passes `null` because the existing video flow keys off the Twilio room SID rather than `consultation_sessions.id`. Plan 01's facade migration will pipe the real session id through — that's a one-line change in the launcher.
8. **No frontend tests.** Per Note 1 in the task and the verbatim Plan 03 acceptance row, the frontend has no jest harness; the spec's two `__tests__/` files are aspirational. Verification posture is: tsc clean + next lint clean + manual smoke per the acceptance criteria. Bootstrapping the harness was added to the inbox so it lands before Plan 04 / 05 stand up their text + voice rooms.

---

## Ship summary

**Files added:**
- `frontend/components/consultation/LiveConsultPanel.tsx` — pure slot-based layout host. No state. ~85 lines.
- `frontend/components/consultation/ConsultationLauncher.tsx` — top-level launcher; owns the modality buttons row, the `useEffect` that re-hydrates the doctor's video session on page refresh, the `startConsultation()` call, and the inline "Coming soon" notice flash for text / voice. ~270 lines.

**Files modified:**
- `frontend/components/consultation/AppointmentConsultationActions.tsx` — refactored from owning the video CTA + room mount + patient link inline (~185 lines) to mounting `<ConsultationLauncher>` above the preserved write surfaces (~95 lines). Kept the import surface stable so `frontend/app/dashboard/appointments/[id]/page.tsx` did not need to change.
- `frontend/types/appointment.ts` — added `ConsultationModality` union + `consultation_type?: ConsultationModality | null` field on `Appointment`.

**Verification:**
- `npx tsc --noEmit -p tsconfig.json` (frontend): exit 0.
- `npx next lint --dir components/consultation --dir types`: ✔ no warnings or errors.
- `ReadLints` on all four touched files: clean.

**Defers / follow-ups:**
- Manual end-to-end smoke (book video → start → join → in-room → end → prescription) before merge — no automated frontend test harness.
- Plans 04 / 05 swap the text / voice "Coming soon" branches for real `consultation-session-service.createSession()` calls and pass their own `roomSlot` (a `<TextConsultRoom>` from Task 19, a `<VoiceConsultRoom>` later) into `<LiveConsultPanel>`.
- Plan 01 facade migration of `lib/api.ts#startConsultation` is still its own follow-up — the launcher imports it the same way as today.
- Bootstrapping a frontend test harness (jest + RTL + ts-jest) before Plan 04's `<TextConsultRoom>` integration tests are needed (already on the inbox via Task 19's notes; reiterated here).

---

## References

- **Plan:** [plan-03-doctor-modality-launcher.md](../Plans/plan-03-doctor-modality-launcher.md) — full design + behavior matrix.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 7 LOCKED entry.
- **Today's video CTA + room mount:** `frontend/components/consultation/AppointmentConsultationActions.tsx`
- **Today's video room:** `frontend/components/consultation/VideoRoom.tsx`
- **Today's patient join link:** `frontend/components/consultation/PatientJoinLink.tsx`
- **Doctor appointment detail page route (verified):** `frontend/app/dashboard/appointments/[id]/page.tsx`
- **Plan 01 Task 15 — `consultation_sessions` facade (the future migration target):** [task-15-consultation-sessions-facade-and-schema.md](./task-15-consultation-sessions-facade-and-schema.md)
- **Plan 02 Task 27 — `<SessionStartBanner>` source:** [task-27-recording-consent-capture-and-re-pitch.md](./task-27-recording-consent-capture-and-re-pitch.md)

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Done — 2026-04-19. Patient-facing `<TextConsultRoom>` from Task 19 now has its doctor-side mount point: drop it into `<LiveConsultPanel>`'s `roomSlot` from inside `<ConsultationLauncher>`'s text branch when Plan 04 wires the doctor experience.
