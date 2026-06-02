# Task ui-C5: Cockpit Today's schedule (compact agenda grouped by hour)

## 06 May 2026 — Batch [UI system redesign](../plan-ui-system-redesign-batch.md) — Sub-batch C (Today cockpit) — **S item, ~3h**

---

## Task overview

Below the Now/Next card and OPD queue strip, the cockpit needs a compact agenda showing the rest of the day at a glance. Not a calendar view — a simple grouped list ("9 AM: 3 patients", "10 AM: 1 patient", etc.) so the doctor can scan their day in two seconds.

Click a row → that appointment's detail page. Hovers preview key info (patient name, modality, status). Past entries today are dimmed. The current hour is highlighted.

**Estimated time:** ~3h.

**Status:** Drafted.

**Hard deps:** C1 (cockpit scaffold). A2 close (`Card`, `Badge`, `Separator`).

**Soft deps:** C2 (shares `useTodaysAppointments`).

**Source:** [U3.5 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u35--todays-schedule).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**Why this tier:** Pure composition over an existing data source. No new fetches. Sonnet handles cleanly.

**New chat?** Yes — fresh chat.

**Pre-load (paste at start):**

- This task file.
- C1 + C2 outputs (so the agent sees the shared `useTodaysAppointments` hook).
- One sentence about locale: "Use the browser's locale via `Intl.DateTimeFormat` for time formatting; do not hard-code en-US."

**Estimated turns:** 1.

**Escalate to Opus if:** never for this task.

**Composer-OK sub-steps:** none.

---

## Acceptance criteria

### Component contract

- [ ] **`frontend/components/dashboard/cockpit/TodaysSchedule.tsx`** — replaces C1 placeholder. Props:
  ```ts
  interface TodaysScheduleProps {
    token: string;
  }
  ```

### Data

- [ ] **Reuse `useTodaysAppointments(token)`** from C2 (same hook, same fetch). Don't double-fetch.
- [ ] If `useTodaysAppointments` doesn't exist (C2 hasn't shipped extraction), inline the fetch + filter and TODO-link to extract later.

### Grouping by hour

- [ ] Group appointments by `appointment_date`'s hour bucket (browser locale). Stable order.
- [ ] **Each hour group renders as:**
  ```
  ┌─────────────────────────────────────────────┐
  │ 09:00         3 appointments                │
  │   ├ Patient A · video · confirmed           │
  │   ├ Patient B · text · pending              │
  │   └ Patient C · video · confirmed           │
  └─────────────────────────────────────────────┘
  ```
- [ ] Hour headers: `font-medium text-sm tabular-nums`.
- [ ] Each entry row: clickable, routes to `/dashboard/appointments/<id>`.

### Visual states

- [ ] **Past entries** (`appointment_date < now`): dim opacity-60, struck or muted.
- [ ] **Current hour group** (now's hour): subtle `bg-primary/5` background.
- [ ] **Future entries** (now's hour and beyond): full opacity.
- [ ] **Status pill** per row (`Badge variant=...`): pending / confirmed / cancelled / completed — same color mapping as the appointment list.

### Empty / loading

- [ ] **Empty (no appointments today):** card hidden entirely (Now/Next State 3 already covers the "no appointments" message).
- [ ] **Loading:** `Skeleton` placeholder hour groups.

### Header + footer

- [ ] Card header: "TODAY'S SCHEDULE" + total count badge ("8 appointments").
- [ ] Footer link: "View all appointments →" → `/dashboard/appointments`.

### General

- [ ] Time format respects browser locale via `Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })`.
- [ ] `font-tabular` on time strings so colons align.
- [ ] Mobile: hour rows collapse acceptably; hour header sticky inside the card's scroll area is a stretch goal — not required.
- [ ] Type-check + lint clean.
- [ ] No PHI in telemetry — fire `cockpit.todays_schedule.viewed` (count only).

---

## Out of scope

- **Drag-to-reschedule.** Calendar territory; not V1 cockpit.
- **Inline patient profile peek on hover.** Tooltip only with patient name; no rich preview.
- **Day-view calendar.** That's `/dashboard/appointments` already.
- **Multi-day schedule.** Today only; "tomorrow" is one click via "View all appointments".
- **Color-coding by service type.** Future; status pill is enough for V1.

---

## Files expected to touch

**Frontend:**
- `frontend/components/dashboard/cockpit/TodaysSchedule.tsx` — **edit** (~150 LOC, replaces C1 placeholder).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Hour bucket vs minute-precision agenda.** Hour buckets are cleaner for at-a-glance scanning — clinics rarely book to the minute, and patients are often early/late anyway. Minute precision goes inside each row.
2. **What "now" means.** Use `new Date()` on each render OR a once-per-minute interval to avoid re-renders every second. A 60s clock tick is fine; rows are already cheap to re-render.
3. **Sticky hour headers.** Stretch goal; if the card grows tall on a doctor with 20+ appointments, sticky headers help. Skip for V1, revisit if real-world feedback comes in.
4. **No virtualization.** A doctor's day is rarely >30 appointments; flat list render is fine.
5. **Reusing data with C2.** Critical — Now/Next + Today's schedule both query the same appointments. One hook, two consumers.

---

## References

- **Batch plan:** [plan-ui-system-redesign-batch.md § Sub-batch C](../plan-ui-system-redesign-batch.md#sub-batch-c--today-cockpit-5-items-152-days)
- **Source item:** [U3.5 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u35--todays-schedule)
- **Hard deps:** [task-ui-C1-cockpit-scaffold.md](./task-ui-C1-cockpit-scaffold.md), [task-ui-A2-shadcn-bootstrap.md](./task-ui-A2-shadcn-bootstrap.md)
- **Soft dep:** [task-ui-C2-cockpit-now-next.md](./task-ui-C2-cockpit-now-next.md) (shared hook)
- **Sibling tasks:** C2, C3, C4
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Drafted; blocked on C1 close.
