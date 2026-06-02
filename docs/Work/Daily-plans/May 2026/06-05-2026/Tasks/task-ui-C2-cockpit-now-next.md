# Task ui-C2: Cockpit Now / Next card

## 06 May 2026 — Batch [UI system redesign](../plan-ui-system-redesign-batch.md) — Sub-batch C (Today cockpit) — **M item, ~5h**

---

## Task overview

Most-asked question on login: **"What's next?"** The Now/Next card answers it in one card, with one CTA. Three states:

1. **Active session** — there's a `consultation_session.status IN ('connecting', 'active', 'paused')` for an appointment whose `appointment_date` is today: show "In consult with `<patient>` · `<elapsed>`" + `Resume` CTA.
2. **Next confirmed appointment** — no active session, but at least one appointment today is `pending` / `confirmed`: show "Next: `<patient>` at `<time>`" + modality-aware `Start consult` CTA (opens [`ConsultationLauncher`](../../../../../frontend/components/consultation/ConsultationLauncher.tsx)).
3. **Empty** — no more appointments today: show "No more appointments today" + `Add appointment` CTA → opens the existing add-appointment modal from [`AppointmentsListWithFilters`](../../../../../frontend/components/appointments/AppointmentsListWithFilters.tsx).

Lives in the top-left zone of the cockpit grid scaffold from C1. Hot-reloaded every 60s OR on visibility-change to "visible" (catches state drift if the doctor backgrounded the tab during a consult).

**Estimated time:** ~5h.

**Status:** Drafted.

**Hard deps:** C1 (cockpit scaffold mount point exists). A2 close (`Card`, `Button`, `Badge`, `Skeleton` primitives). A4 (lucide icons).

**Soft deps:** B1 (header `Start consult` CTA — same launcher; for state coherence). B3 (`useDashboardCounts` for elapsed/idle hints — not required).

**Source:** [U3.2 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u32--now--next-card).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**Why this tier:** State-machine-ish (3 states + loading + error), but the data shape is well-known. Sonnet handles cleanly.

**New chat?** Yes — fresh chat. C1 unblocks C2; do not roll over C1 chat context.

**Pre-load (paste at start):**

- This task file (full).
- C1's resolved `frontend/components/dashboard/cockpit/NowNextCard.tsx` placeholder + `frontend/app/dashboard/page.tsx`.
- The shape of `Appointment` from `frontend/types/appointment.ts`.
- One sentence about `ConsultationLauncher` props (paste the export signature).

**Estimated turns:** 2–3.

**Escalate to Opus if:** the active-session detection logic surfaces edge cases (e.g., yesterday's session still `active` due to no `ended_at` flush — needs the team to decide policy). One Opus turn settles the rule.

**Composer-OK sub-steps:** none.

---

## Acceptance criteria

### Component contract

- [ ] **`frontend/components/dashboard/cockpit/NowNextCard.tsx`** — replaces the C1 placeholder. Props:
  ```ts
  interface NowNextCardProps {
    token: string;
  }
  ```

### Data fetch

- [ ] **Single fetch on mount:** uses existing `getAppointments(token)` (per [`frontend/lib/api.ts`](../../../../../frontend/lib/api.ts)) and filters client-side to today's appointments.
- [ ] **Active-session detection:** find an appointment whose `consultation_session.status` is one of `connecting | active | paused | reconnecting` (verify exact enum from `appointment.consultation_session` shape).
- [ ] **Next-up detection:** earliest `pending`/`confirmed` appointment today with `appointment_date >= now()`.
- [ ] **Re-fetch:** `setInterval` every 60s, AND on `document.visibilitychange` to "visible". Pause when hidden.
- [ ] **Stale-while-revalidate:** keep last-known render during refetch.

### State 1 — Active session

- [ ] Header chip: `Badge variant="default"` with text "In consult" + a pulsing green dot.
- [ ] Patient name (large, `text-2xl font-semibold`).
- [ ] Modality icon prefix (`Video` / `MessageSquare` / `Phone` from lucide).
- [ ] Elapsed time: `<elapsed>` formatted as `mm:ss` if <1h else `hh:mm`. Updates every second using a small interval.
- [ ] CTA: `<Button>Resume</Button>` — routes to the active session room (use the same path the existing appointment-detail page uses to "Resume" — verify in [`AppointmentConsultationActions`](../../../../../frontend/components/consultation/AppointmentConsultationActions.tsx)).
- [ ] Secondary action: link "View appointment" → `/dashboard/appointments/<id>`.

### State 2 — Next-up appointment

- [ ] Header chip: `Badge variant="secondary"` text "Next up".
- [ ] Patient name (large).
- [ ] Time: `<HH:mm>` (locale-aware) and a relative hint ("in 12 minutes" / "in 2 hours").
- [ ] Modality icon prefix.
- [ ] CTA: `<Button>Start consult</Button>` — opens `<ConsultationLauncher>` modal targeting that appointment.
- [ ] Secondary actions: "View appointment", "Reschedule" (link to detail page; reschedule is a follow-on, no work needed here).

### State 3 — Empty

- [ ] Friendly empty state: lucide `CalendarCheck` icon + "All caught up. No more appointments today."
- [ ] CTA: `<Button variant="outline">Add appointment</Button>` — opens the existing `AddAppointmentModal` from [`frontend/components/appointments/AddAppointmentModal.tsx`](../../../../../frontend/components/appointments/AddAppointmentModal.tsx).
- [ ] Secondary copy: "Or browse [tomorrow's schedule](/dashboard/appointments)" (lower-emphasis link).

### Loading / error

- [ ] First paint while loading: `<Skeleton>` rows in the card.
- [ ] Error: muted "Couldn't load. Tap to retry." inside the card. Don't break the whole cockpit on a single fetch failure.

### General

- [ ] Card uses `<Card>` primitive (A2). No raw classes for card chrome.
- [ ] Modality detection respects existing helpers — don't re-implement; reuse from `consultation` components.
- [ ] No PHI in console / telemetry. The existing `cockpit` telemetry (if any from C1) gets a `cockpit.now_next.viewed` event — counts only.
- [ ] Type-check + lint clean. No console errors.
- [ ] Mobile breakpoints: card stacks naturally; CTAs full-width on `<sm`.
- [ ] Time-to-action: "log in → see Now/Next → click Start consult" is **2 clicks** (matches Success Criteria in source plan).

---

## Out of scope

- **Multi-active-session handling.** If two sessions are simultaneously active (rare; multi-tab edge), prefer the most recently-updated. Don't overengineer.
- **Real-time push updates** (Supabase realtime). 60s polling is fine for V1.
- **Pre-call lobby preview.** Out of card scope; the launcher / lobby flows already exist.
- **Per-modality CTA labels.** Single "Start consult" / "Resume" — modality is conveyed by the prefix icon.

---

## Files expected to touch

**Frontend:**
- `frontend/components/dashboard/cockpit/NowNextCard.tsx` — **edit** (~250 LOC, replaces C1 placeholder).
- `frontend/components/dashboard/cockpit/useTodaysAppointments.ts` (or inline hook) — **new helper** if you extract for C5 to share. Recommended: extract; C5 needs the same data.

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Active-session staleness.** A session marked `active` from yesterday is a bug; treat any session with `started_at` older than 12h as "stale, ignore" — fall through to State 2. Document this rule in code.
2. **Modality icon set.** lucide `Video` for video, `Phone` for voice, `MessageSquare` for text. Stay consistent with sidebar (B2) and downstream cockpit cards.
3. **Pulse animation on the green "In consult" dot.** Use Tailwind's `animate-pulse` on a sibling `<span>` overlay; cheap and recognizable.
4. **Why one card, not two columns ("Now" + "Next").** A doctor is in one state at a time. Splitting wastes the most valuable real estate. Single card with state-driven content keeps the gravitational center clear.
5. **Reuse data with C5.** C5 (Today's schedule) needs the same "today's appointments" list. Extract `useTodaysAppointments(token)` so both cards share one fetch.

---

## References

- **Batch plan:** [plan-ui-system-redesign-batch.md § Sub-batch C](../plan-ui-system-redesign-batch.md#sub-batch-c--today-cockpit-5-items-152-days)
- **Source item:** [U3.2 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u32--now--next-card)
- **Hard deps:** [task-ui-C1-cockpit-scaffold.md](./task-ui-C1-cockpit-scaffold.md), [task-ui-A2-shadcn-bootstrap.md](./task-ui-A2-shadcn-bootstrap.md)
- **Sibling tasks:** C3 (OPD strip), C4 (Inbox column), C5 (Today's schedule)
- **Reuses:** [`ConsultationLauncher`](../../../../../frontend/components/consultation/ConsultationLauncher.tsx), [`AddAppointmentModal`](../../../../../frontend/components/appointments/AddAppointmentModal.tsx)
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Drafted; blocked on C1 close.
