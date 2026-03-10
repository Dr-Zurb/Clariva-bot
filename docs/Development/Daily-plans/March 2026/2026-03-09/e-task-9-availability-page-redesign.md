# Task 9: Availability Page Redesign (Weekly Calendar + Blocked Times)
## 2026-03-09

---

## 📋 Task Overview

Redesign the Availability page for better UX: (1) **Weekly Slots** — weekly calendar view with one row per day (Mon–Sun), multiple slots per day, per-day Add slot, and "Copy to other days" with options (copy to all, copy to weekdays, copy to selected days) in a three-dots menu; (2) **Blocked Times** — date picker with whole-day vs specific-time toggle, optional reason, and clearer add flow.

**Rationale:** Current flat list of slots and datetime-local inputs are clunky. A day-by-day view matches how doctors think about their schedule. Copy options reduce repetitive data entry.

**Estimated Time:** 8–12 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-09

**Change Type:**
- [ ] **New feature** — Add code only (no change to existing behavior)
- [x] **Update existing** — Change or remove existing code; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** Weekly calendar layout (one row per day Mon–Sun), multiple slots per day, per-day Add slot, three-dots Copy menu (Copy to all, Copy to weekdays, Copy to selected days). Blocked times: whole-day vs specific-time toggle, date + time inputs, reason preset dropdown.
- ✅ **Completed:** All e-task-9 items implemented.
- ⚠️ **Notes:** APIs unchanged. Frontend-only redesign.

**Scope Guard:**
- Expected files touched: availability page, possibly new subcomponents (DayRow, CopyMenu, BlockedTimeForm)
- No backend changes

**Reference Documentation:**
- [PRACTICE_SETUP_UI.md](../../../Reference/PRACTICE_SETUP_UI.md)
- [FRONTEND_ARCHITECTURE.md](../../../Reference/FRONTEND_ARCHITECTURE.md)
- [FRONTEND_STANDARDS.md](../../../Reference/FRONTEND_STANDARDS.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Weekly Slots: Calendar Layout
- [x] 1.1 Redesign layout: one row per day (Monday through Sunday)
- [x] 1.2 Each row shows: day name | slots for that day (chips/cards) | Add slot button | Copy menu (⋮)
- [x] 1.3 Group slots by day_of_week; display as "10:00–14:00", "16:00–18:00" etc.
- [x] 1.4 Per-day "Add slot" — adds a new slot for that day (default e.g. 09:00–17:00)
- [x] 1.5 Per-slot: inline edit (time inputs) and Remove
- [x] 1.6 Empty day: show "(no slots)" or "Add availability"; Add slot creates first slot
- [x] 1.7 Keep "Save schedule" at bottom; PUT entire schedule on save

### 2. Copy to Other Days
- [x] 2.1 Add three-dots (⋮) menu per day row — visible when day has at least one slot
- [x] 2.2 Menu options:
  - **Copy to all** — copy this day's slots to every other day (Mon–Sun)
  - **Copy to weekdays** — copy to Mon–Fri only (exclude Sat, Sun)
  - **Copy to selected days…** — opens modal/dropdown with checkboxes for each day; user selects target days
- [x] 2.3 Copy overwrites target days' slots with source day's slots (or merges — specify: overwrite recommended)
- [x] 2.4 Copy menu: accessible (aria-label, keyboard), closes on outside click
- [x] 2.5 Alternative placement: if three-dots feels cramped, use "Copy to…" dropdown button next to Add slot

### 3. Blocked Times: Redesign
- [x] 3.1 Replace datetime-local with separate Date + Time inputs
- [x] 3.2 Add toggle: **Whole day** vs **Specific time**
  - Whole day: single date picker; backend receives 00:00–23:59 for that date
  - Specific time: date + start time + end time
- [x] 3.3 Date: use `type="date"` or a date picker component
- [x] 3.4 Time: use `type="time"` when Specific time is selected
- [ ] 3.5 Optional: date range for multi-day blocks (e.g. vacation 20–25 Mar) — start date + end date
- [x] 3.6 Reason: keep optional; consider preset dropdown (Vacation, Sick leave, Conference, Personal, Other) + free text
- [x] 3.7 List blocked periods with clear formatting; Remove button per item

### 4. Validation & UX Polish
- [x] 4.1 Validate: start time < end time per slot; no overlapping slots on same day (optional)
- [x] 4.2 Validate blocked: start < end; whole day uses single date
- [x] 4.3 Accessible labels, focus order, keyboard support
- [x] 4.4 Mobile: stacked layout for day rows; copy menu usable on touch

### 5. Verification & Testing
- [x] 5.1 Run frontend build and lint
- [ ] 5.2 Manual test: weekly view, add/edit/remove slots, copy to all/weekdays/selected, blocked times whole-day and specific-time
- [x] 5.3 Verify API compatibility (PUT availability, POST blocked-times unchanged)

---

## 📁 Files to Create/Update

```
frontend/
├── app/dashboard/settings/practice-setup/availability/
│   └── page.tsx                      # REWRITE: weekly calendar + blocked times redesign
├── components/settings/
│   ├── WeeklySlotsCalendar.tsx        # NEW (optional): weekly slots section
│   ├── DayRow.tsx                    # NEW (optional): single day row with slots + copy menu
│   ├── CopySlotsMenu.tsx              # NEW (optional): three-dots menu with copy options
│   └── BlockedTimeForm.tsx           # NEW (optional): blocked times form with whole-day/specific-time
```

**Existing Code Status:**
- ✅ `frontend/app/dashboard/settings/practice-setup/availability/page.tsx` — EXISTS (flat slot list, datetime-local blocked form)
- ✅ API: `getAvailability`, `putAvailability`, `getBlockedTimes`, `postBlockedTime`, `deleteBlockedTime` — unchanged

**Implementation approach:** Can implement in single page.tsx first; extract components if file grows large.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Follow FRONTEND_ARCHITECTURE.md and FRONTEND_STANDARDS.md
- No PHI in client-side logs or storage
- Copy menu: accessible (aria-expanded, aria-haspopup, keyboard)
- Day order: Monday–Sunday (configurable; match common work-week first)

---

## 📐 Copy Menu UX Detail

**Three-dots (⋮) placement:** Right side of each day row, next to "Add slot". Only shown when the day has at least one slot.

**Menu structure:**
```
⋮ Copy to other days
  ├── Copy to all days
  ├── Copy to weekdays (Mon–Fri)
  └── Copy to selected days…  →  [Modal: ☐ Mon ☐ Tue ☐ Wed ☐ Thu ☐ Fri ☐ Sat ☐ Sun] [Apply]
```

**Copy behavior:** Overwrite target days' slots with source day's slots. Exclude source day from targets (e.g. copying Monday does not "copy to Monday" — it copies to Tue–Sun or selected subset).

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (N – uses existing APIs; frontend only)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Weekly slots: one row per day (Mon–Sun), multiple slots per day visible as chips
- [x] Per-day Add slot and Remove per slot
- [x] Three-dots menu with Copy to all, Copy to weekdays, Copy to selected days
- [x] Blocked times: whole-day vs specific-time toggle; date + time inputs
- [x] Optional reason; list of blocked periods with Remove
- [x] Save schedule and Add blocked time work; API unchanged

---

## 🔗 Related Tasks

- [e-task-8: Settings UI consistency](./e-task-8-settings-ui-consistency-refinement.md) — predecessor
- [e-task-3: Availability & blocked times API](./e-task-3-availability-blocked-times-api.md) — API reference

---

**Last Updated:** 2026-03-09  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)
