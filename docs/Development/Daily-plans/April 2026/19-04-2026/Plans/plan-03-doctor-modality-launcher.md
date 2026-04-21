# Plan 03 — Doctor modality launcher on appointment detail page

## Generalize today's video-room area into a modality-aware `<ConsultationLauncher>` per Decision 7

> **Master plan reference:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 7 (all three modality launchers inline on the appointment detail page; no new top-level "Live consultations" tab in v1) **LOCKED**.
>
> **Sequencing index:** [plan-00-multi-modality-implementation-index.md](./plan-00-multi-modality-implementation-index.md). Depends on Plan 01 (`consultation-session-service.ts` facade). Ships before Plans 04 + 05 so the moment those modalities go live, the doctor already has a button.

---

## Goal

Replace the implicit "video room renders here when consultation_type = video" behavior with an explicit, modality-aware `<ConsultationLauncher>` that:

- Renders **all three** modality launchers (Text / Voice / Video) inline on the appointment detail page.
- Highlights the booked modality (`appointment.consultation_type`) as the **primary** CTA.
- Shows the other two as **secondary** buttons (greyed-out / disabled in v1; they become Plan 09's mid-consult-switch entry points later).
- Hosts the active consult UI in a single live-panel area (`<LiveConsultPanel>`) so all three modalities can share session-start banners, recording controls, etc.
- Defers the actual modality UIs (`<TextConsultRoom>`, `<VoiceConsultRoom>`, existing `<VideoRoom>`) to their respective plans.

After this plan ships, doctors see the new layout immediately, but text/voice buttons are stub-only ("Coming soon — Plan 04 / Plan 05") until those plans land.

---

## Companion plans

- [plan-01-foundation-consultation-sessions.md](./plan-01-foundation-consultation-sessions.md) — provides `consultation-session-service.ts#createSession()` that the launcher calls.
- [plan-02-recording-governance-foundation.md](./plan-02-recording-governance-foundation.md) — provides `<SessionStartBanner>` that this plan's `<LiveConsultPanel>` renders when `recording_consent_decision === false`.
- [plan-04-text-consultation-supabase.md](./plan-04-text-consultation-supabase.md) → unblocks the Text button.
- [plan-05-voice-consultation-twilio.md](./plan-05-voice-consultation-twilio.md) → unblocks the Voice button.
- [plan-09-mid-consult-modality-switching.md](./plan-09-mid-consult-modality-switching.md) → reuses the secondary-modality buttons as switch entry points (when modality switching is allowed mid-consult).

---

## Audit summary (current code)

### What exists today

| Component | Path | Plan-03 disposition |
|-----------|------|---------------------|
| Doctor-side appointment detail page | (typically `frontend/app/.../appointments/[id]/page.tsx` or equivalent — verify the canonical route) | **Extend** — render new `<ConsultationLauncher>` where the existing video CTA lives |
| Existing video CTA / room mount | `frontend/components/consultation/AppointmentConsultationActions.tsx` (today's owner of "Start video consultation" button) | **Refactor** — moves into `<ConsultationLauncher>` as the video-modality branch; keeps existing behavior for video appointments |
| Existing video room | `frontend/components/consultation/VideoRoom.tsx` | **No behavioral change** — now mounted inside `<LiveConsultPanel>` instead of directly |
| Existing patient-join link generation | `frontend/components/consultation/PatientJoinLink.tsx` | **Read-only consume** for video; Plans 04/05 will add modality-specific equivalents |

### What's missing (this plan delivers)

| Gap | Why it ships before Plans 04/05 |
|-----|----------------------------------|
| No modality-aware launcher UI | Doctors need a clear "this is text / this is voice / this is video" surface; without it, Plans 04 + 05 have nowhere clean to plug in. |
| No `<LiveConsultPanel>` host | Recording controls, session-start banner, and (later) modality-switch buttons should live in one host so they don't get triplicated per modality. |

---

## Tasks (from the master plan)

| #  | Master-plan task | Phase | Effort | Risk | Status |
|----|------------------|-------|--------|------|--------|
| 20 | C.4 — Doctor-side `<LiveConsultPanel>` + `<ConsultationLauncher>` inline on appointment detail page (all three modality buttons per Decision 7) | C | 2–3h | Low — pure UI refactor; backend uses Plan 01's facade | ✅ Done 2026-04-19 — see [task-20](../Tasks/task-20-consultation-launcher-and-live-panel.md). Launcher + panel + Appointment-type extension shipped; `<AppointmentConsultationActions>` refactored as a launcher-host (not a literal pass-through — see Departures). `<LiveConsultPanel>` exposes a `roomSlot` prop in addition to the four spec-listed slots so the launcher can pass a fully-configured `<VideoRoom />` without the panel owning state. Frontend tsc + next lint clean. Manual smoke pending merge. |

This is a single-task plan, but it's a load-bearing one: **every later UI plan mounts inside `<LiveConsultPanel>`.**

---

## Component design

```
appointment detail page
└── <ConsultationLauncher appointment={appointment}>
    │
    ├── Header strip
    │     "Today's consultation: 10:30 AM, 30 min — Booked as: Voice"
    │     [Reschedule] [Cancel]
    │
    ├── Modality buttons row (Decision 7)
    │     ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │     │ 💬 Text       │  │ 🎙 Voice ●   │  │ 🎥 Video      │
    │     │ (secondary)  │  │ (PRIMARY)    │  │ (secondary)  │
    │     └──────────────┘  └──────────────┘  └──────────────┘
    │      ↑ click here in v1 = "Coming soon" toast.
    │      ↑ Plan 09 makes these into mid-consult switch entry points.
    │
    └── <LiveConsultPanel modality={booked_modality} sessionId={session?.id}>
          │
          ├── <SessionStartBanner /> from Plan 02 (renders when consent declined)
          ├── <RecordingControls /> from Plan 07 (renders mid-session)
          ├── (the actual room — modality-specific child)
          │     └── <VideoRoom /> | <VoiceConsultRoom /> | <TextConsultRoom />
          └── <ModalityChangeLauncher /> from Plan 09 (renders mid-session)
```

**Primary modality** = `appointment.consultation_type`. The PRIMARY button is the action verb of the page: `[Start consultation]` / `[Join consultation]` (depending on whether the doctor has joined yet). Clicking it calls `consultation-session-service.ts#createSession()` (Plan 01's facade), which routes to the right adapter, which mints the join URL.

---

## Behavior matrix

| Scenario | What the launcher shows |
|----------|-------------------------|
| Booked = video, session not yet created | Primary `[Start video consultation]`; secondary buttons disabled with "Coming soon" tooltip in v1 (live in Plan 09) |
| Booked = video, session live, doctor not yet joined | Primary `[Join video consultation]` |
| Booked = video, session live, doctor in room | `<VideoRoom>` mounts inside `<LiveConsultPanel>`; primary button hidden |
| Booked = voice, Plan 05 not yet shipped | Primary `[Start voice consultation]` shows "Coming soon — Plan 05 ships this" toast on click; doctor can fall back to manual rebook |
| Booked = voice, Plan 05 shipped | Primary `[Start voice consultation]` → calls facade → `<VoiceConsultRoom>` mounts |
| Booked = text, Plan 04 not yet shipped | Primary `[Start text consultation]` shows "Coming soon — Plan 04 ships this" toast on click |
| Booked = text, Plan 04 shipped | Primary `[Start text consultation]` → calls facade → `<TextConsultRoom>` mounts |
| Booked = anything, `recording_consent_decision === false` | `<SessionStartBanner>` renders above the room ("Patient declined recording. Take detailed clinical notes.") |
| Session already ended | Launcher hides primary button; shows `[View consult artifacts]` link → Plan 07's post-consult surfaces |

**Key invariant for v1:** the launcher always shows all three modality buttons even if Plans 04 / 05 haven't shipped yet. The buttons themselves communicate readiness via enabled/disabled state. This avoids a UI shape change later when Plans 04 + 05 land.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/ConsultationLauncher.tsx` (**new**) — top-level launcher; reads `appointment.consultation_type`, renders three buttons, dispatches to `<LiveConsultPanel>`
- `frontend/components/consultation/LiveConsultPanel.tsx` (**new**) — host for the active modality's room + recording controls + session banner + (Plan 09) modality-switch buttons; modality-agnostic
- `frontend/components/consultation/AppointmentConsultationActions.tsx` (**refactor**) — its current "Start video consultation" code moves into `<ConsultationLauncher>`'s video-modality branch; this file may eventually be deleted, but keep as a thin wrapper for now to avoid cascading import changes
- The doctor-side appointment detail page (verify route at PR-time) — replace the existing video CTA mount with `<ConsultationLauncher>`
- Possibly: `frontend/components/consultation/PatientJoinLink.tsx` (**extend** to be modality-aware — voice/text both produce different URL shapes than video; can land in this plan or in Plans 04/05 — recommendation: ship the modality-agnostic shell here, fill in voice/text URLs in those plans)

**Backend:** none (consumes Plan 01's facade exactly as-is)

**Tests:**

- `frontend/__tests__/components/consultation/ConsultationLauncher.test.tsx` — covers each row of the behavior matrix
- `frontend/__tests__/components/consultation/LiveConsultPanel.test.tsx` — host renders the right child by modality, renders banner when consent declined

---

## Acceptance criteria

- [ ] `<ConsultationLauncher>` renders on every appointment detail page with all three modality buttons per Decision 7.
- [ ] Primary modality matches `appointment.consultation_type` and is the only enabled action button in v1.
- [ ] Secondary buttons render but are disabled with a "Coming soon" tooltip; clicking them shows a toast.
- [ ] For video appointments: existing flow preserved end-to-end (book → start → join → in-room → end → prescription) with **zero regression** (smoke test required).
- [ ] `<LiveConsultPanel>` mounts the right child by modality; mounts `<SessionStartBanner>` from Plan 02 when consent declined.
- [ ] `<AppointmentConsultationActions>` no longer renders its own button; the launcher owns the action surface.
- [ ] No backend changes; PR-time grep confirms no new direct calls to `video-session-twilio.ts` outside Plan 01's facade.
- [ ] Frontend `tsc --noEmit` + `next lint` clean on touched files.

---

## Open questions / decisions for during implementation

1. **What's the exact route for the appointment detail page?** Verify before refactor; could be `frontend/app/(dashboard)/appointments/[id]/page.tsx` or similar. Document in the task file.
2. **Mobile layout:** three buttons in a row works on desktop but may need to collapse on mobile. Recommendation: 3-column grid that wraps to stacked at `< 480px`.
3. **`<ModalityChangeLauncher>` placement (Plan 09 will need this):** does it live next to the modality buttons row, or inside `<LiveConsultPanel>` as part of the in-room controls? Recommendation: inside `<LiveConsultPanel>` since it's a mid-consult action — keeps the top-of-page launcher area for pre-session and the panel for in-session.
4. **Should the disabled "Coming soon" buttons link out to the relevant plan files?** Doctor-facing → no, internal to engineering → yes (link in code comments only).

---

## Non-goals

- No actual text or voice modality. Plans 04 + 05 land those.
- No mid-consult modality switching. Plan 09 lands that and reuses the secondary buttons + adds `<ModalityChangeLauncher>` inside the panel.
- No companion text channel for video/voice. Plan 06 lands that and extends the existing `<VideoRoom>` + Plan 05's `<VoiceConsultRoom>`.
- No backend changes. The backend facade was Plan 01.

---

## References

- **Master plan:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 7 LOCKED entry.
- **Today's video CTA:** `frontend/components/consultation/AppointmentConsultationActions.tsx`
- **Today's video room:** `frontend/components/consultation/VideoRoom.tsx`
- **Today's patient join link:** `frontend/components/consultation/PatientJoinLink.tsx`

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** ✅ Shipped 2026-04-19 — single-task plan complete. Doctor-side mount point for `<TextConsultRoom>` (Plan 04 / Task 19) is now ready; Plan 04's doctor-experience task can drop the room into `<LiveConsultPanel>`'s `roomSlot` from inside `<ConsultationLauncher>`'s text branch.
