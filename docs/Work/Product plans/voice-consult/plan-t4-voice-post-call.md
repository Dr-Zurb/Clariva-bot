# Voice T4 — Post-call (4 items, ~1 sprint)

## Post-call summary, patient rating + review, one-click rebook, recording playback

> **Roadmap reference:** [plan-00-voice-consult-roadmap.md](./plan-00-voice-consult-roadmap.md). T4 is the post-call surface; **Deferred** — sequenced after Plan 07 (recording replay & history) lands.
>
> **Foundation:** Plan 07 owns the recording-playback infrastructure. T4 is the voice-call-specific UX layer on top of it.

---

## Goal

Convert the moments **immediately after a voice consult** from a generic disconnect splash into a useful, branded surface that:

- Confirms what happened ("here's what we did, here's what's next").
- Captures patient sentiment when it's freshest (rating + free-text review).
- Closes the loop on follow-up bookings with a one-click CTA.
- Surfaces the recording replay link (when consent allowed) without the patient having to dig through DMs.

This tier is small in line-count but high in retention impact. It's where casual users become repeat patients.

---

## Status

`Deferred` overall. **2026-04-28 partial selection:** **T4.25 + T4.28 SELECTED**; T4.26 + T4.27 remain `Deferred` (existing service-reviews + `/book` flow with prefill cover them for now). See [combined batch plan](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md). Trigger to revisit T4.26 / T4.27: explicit doctor or patient feedback that the existing surfaces fall short.

---

## What's in scope (4 items)

> Selection markers reflect the 2026-04-28 batch. T4.28 stays `[SELECTED]` even if Plan 07 hasn't shipped — it ships as a disabled placeholder and lights up automatically once Plan 07's `GET /api/v1/consultations/:id/replay` endpoint exists.

| # | Item | Effort | Hard dependencies |
|---|------|--------|-------------------|
| **T4.25** | **`[SELECTED 2026-04-28]`** **Post-call summary screen** — duration, was-recorded indicator, attachments shared, doctor + patient names, "Send summary to patient" button (doctor side). | M (~2 days) | T2.16 disconnect-reason splash (so the summary slot is well-defined). |
| **T4.26** | **`[NOT SELECTED 2026-04-28]`** **Patient-side rating + free-text review** — "How was your consult? ★★★★★ + comment". Feeds the existing service-reviews system. | S (~1 day) | Existing `service_reviews` infrastructure. |
| **T4.27** | **`[NOT SELECTED 2026-04-28]`** **One-click rebook** — "Schedule follow-up with Dr. X in 2 weeks" — prefilled slot picker. | S (~1 day) | Existing slot-selection booking flow. |
| **T4.28** | **`[SELECTED 2026-04-28]`** **Recording playback link** — "Listen to your consult" CTA when consent gave us a recording. | S (~1 day) | Plan 07 (recording-replay infrastructure). Ships as disabled placeholder if Plan 07 not yet shipped. |

---

## Why this tier exists

- **T4.25** — the moment the call ends, both sides need a clear "this is what happened" surface. Today they get a blank disconnect splash. Even a minimal summary card (duration + recorded? + attachments) is a step-change.
- **T4.26** — service reviews exist, but they're not surfaced at the right moment. Asking 3 days later via DM gets ~5% response rates; asking immediately gets ~30%+. Same backend, drastically better data.
- **T4.27** — every clinic has a follow-up flow. Today the patient has to start over from scratch. A one-click "follow-up in 2 weeks with the same doctor" CTA is the smallest possible loop closer.
- **T4.28** — recording exists (when consent allows) but the patient has to find the IG-DM with the link. A direct CTA on the post-call screen makes it real.

---

## Implementation contract per item

### T4.25 — Post-call summary screen

```
frontend/components/consultation/VoicePostCallSummary.tsx (NEW)

Mounted by VoiceConsultRoom on `disconnected` (replaces the simple
splash from T2.16 — disconnect-reason becomes a row inside the summary).

Layout (mobile-first):

  ┌──────────────────────────────────────────────┐
  │ Consultation summary                         │
  │                                              │
  │ Dr. Sharma · Cardiology                      │
  │ Apr 27 · 6:30 PM · 28 minutes                │
  │                                              │
  │ ✅ Recorded (consent given)                  │
  │ 📎 2 attachments shared                      │
  │ 💊 Prescription sent                         │
  │                                              │
  │ [Listen to your consult] (T4.28)             │
  │ [Schedule follow-up]     (T4.27)             │
  │ [Rate this consult]      (T4.26)             │
  │                                              │
  │ Need help? Reply to our IG DM.               │
  └──────────────────────────────────────────────┘

Doctor view: same skeleton, but:
  - Replaces "Listen to your consult" with [Listen] + [Download transcript].
  - Replaces patient CTAs with [Send summary to patient] +
    [Write/edit prescription] + [Send to dashboard].

Data flows from a single GET /api/v1/appointments/:id/post-call-summary
endpoint that returns:
  {
    duration_minutes,
    recorded: bool,
    attachments_count,
    prescription_sent: bool,
    transcript_available: bool,
    feedback_already_left: bool   // controls T4.26 visibility
  }
```

### T4.26 — Patient-side rating + review

```
frontend/components/consultation/RateConsultDialog.tsx (NEW)

Triggered from T4.25 [Rate this consult] button.

Fields:
  - 5-star rating (mandatory)
  - Free-text "What went well?" (optional, 280 chars max)
  - Free-text "What could improve?" (optional, 280 chars max)
  - Checkbox: "Recommend Dr. X to others?" (yes/no/blank)

Submits to existing service-reviews API:
  POST /api/v1/service-reviews
    body: { appointment_id, rating, well, improve, recommend }

UX rules:
  - Dialog is dismissible; don't pester the patient.
  - One submission per appointment. After submit, T4.25 hides the
    [Rate this consult] button and shows a "Thanks for your feedback"
    chip in its place.
  - Reviews ≤3 stars route to ops via the existing review-triage
    flow (no new backend).
```

### T4.27 — One-click rebook

```
Re-uses existing slot-selection booking flow:
  /book/{doctorSlug}?prefill_reason=follow-up&prefill_link={appointmentId}

The prefill_link surfaces a small banner on the booking page:
  "Follow-up of your Apr 27 consult — prefilled."

Doctor's default follow-up suggestion comes from doctor settings:
  doctor_settings.default_follow_up_offset_days  -- e.g. 14

T4.27 [Schedule follow-up] button on the post-call summary deep-links
to /book/{doctorSlug}?... with the date prefilled to today + offset.

If the doctor's slot view shows no availability in the prefilled
window, the booking page automatically shifts to the next available
day in the same week.

Free vs paid follow-ups: doctor settings flag
  doctor_settings.follow_up_charging_mode = 'free' | 'discounted' | 'full'
already exists; the booking flow respects it (no new logic).
```

### T4.28 — Recording playback link

```
Hard dependency on Plan 07: GET /api/v1/consultations/:id/replay
which returns:
  {
    audio_url: signed URL (15 min TTL),
    transcript_url: signed URL,
    available: bool,    // false if consent === false OR not yet ready
    expires_at: timestamptz
  }

T4.28 [Listen to your consult] button:
  - Disabled (greyed) if available === false.
    Tooltip: "This consult wasn't recorded" or "Recording is being
    processed — check back in a few minutes" depending on reason.
  - Enabled → opens an in-app audio player modal (T4.28 builds the
    player; Plan 07 ships the API).

Doctor view: same button + [Download transcript] for SOAP-note copy.

Audit: every replay tap is logged to the existing recording_audit table
(Plan 02 already wires this).
```

---

## Acceptance criteria

- [ ] **T4.25** — post-call summary mounts within 500 ms of disconnect; data fetch completes in ≤1 s; renders correctly when prescription / attachments / recording are missing.
- [ ] **T4.26** — rating dialog submits within 500 ms; one-submission-per-appointment enforced server-side; ≤3-star reviews route to ops triage.
- [ ] **T4.27** — follow-up booking deep-link lands on the right doctor + correct prefilled date; respects doctor's `follow_up_charging_mode`.
- [ ] **T4.28** — playback button is correctly disabled when consent === false; in-app player works on iOS Safari + Android Chrome + desktop; replay tap audited.
- [ ] No regression on existing post-call disconnect flow (router refresh, dashboard nav, IG-DM "your consult is over" already in place).
- [ ] Backend + frontend type-check + lint clean.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/VoicePostCallSummary.tsx` (**new**, T4.25).
- `frontend/components/consultation/RateConsultDialog.tsx` (**new**, T4.26).
- `frontend/components/consultation/RecordingPlaybackPlayer.tsx` (**new**, T4.28).
- `frontend/components/consultation/VoiceConsultRoom.tsx` (**extend**, T4.25 mount).
- `frontend/lib/api.ts` (**extend**) — `getPostCallSummary`, `submitConsultReview`, `getReplayUrl`.

**Backend:**

- `backend/src/routes/api/v1/consultation.ts` (**extend**, T4.25) — `GET /:id/post-call-summary` aggregating duration / recorded / attachments / prescription_sent.
- `backend/src/services/post-call-summary-service.ts` (**new**, T4.25) — aggregation only; reuses existing repo queries.
- (Plan 07 owns) `backend/src/routes/api/v1/consultation.ts` `GET /:id/replay` — T4.28 consumes; doesn't ship.

**Schema:**

- None. T4 is purely additive UI on existing data.

---

## Open questions / decisions for during implementation

1. **Should the summary persist beyond the immediate post-call screen?** Recommendation: yes — the same screen should be reachable from `appointments/:id` for both sides, indefinitely. Implementation: T4.25 component is mounted both as a post-call splash AND as the appointment-detail view.
2. **Default follow-up offset doctor setting** (T4.27) — does the field already exist? If not, T4.27 includes a one-line `doctor_settings.default_follow_up_offset_days INT DEFAULT 14` migration. Verify at PR time.
3. **Review prompt fatigue** (T4.26) — if a patient declines once on the post-call screen, do we re-prompt via DM 24h later? Recommendation: yes once, then never. Already aligns with existing review-prompt cadence.
4. **In-app player vs external download** (T4.28) — in-app player is better UX but adds complexity. Recommendation: ship in-app for v1 with a fallback download link.

---

## References

- [plan-00-voice-consult-roadmap.md](./plan-00-voice-consult-roadmap.md)
- [plan-t1-voice-quick-wins.md](./plan-t1-voice-quick-wins.md)
- [plan-t2-voice-real-polish.md](./plan-t2-voice-real-polish.md) — T2.16 disconnect-reason becomes a row in the T4.25 summary.
- [plan-07-recording-replay-and-history.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-07-recording-replay-and-history.md) — hard dependency for T4.28.
- Existing service-reviews service (frontend `lib/api.ts` + backend `service-review-*` files).

---

**Owner:** TBD  
**Created:** 2026-04-27  
**Status:** Drafted. **2026-04-28 partial selection: T4.25 + T4.28 SELECTED**, sequenced into sub-batch B of [combined batch plan](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md). T4.26 + T4.27 remain `Deferred`.
