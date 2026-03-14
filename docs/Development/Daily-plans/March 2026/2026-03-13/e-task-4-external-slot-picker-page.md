# Task 4: External Slot Picker Page
## 2026-03-13

---

## 📋 Task Overview

Build a public-facing slot picker page at `/book` that: (1) Accepts token in URL; (2) Shows calendar/date picker; (3) Fetches all slots for selected date (with status: available/booked); (4) Displays full slot grid — **booked slots greyed out and disabled**, **available slots tappable**; (5) On save, POSTs to select-slot API and redirects user to Instagram.

**Estimated Time:** 12–14 hours  
**Status:** ✅ **COMPLETE**  
**Completed:** 2026-03-13

**Change Type:**
- [x] **New feature** — New frontend page

**Current State:**
- ✅ **What exists:** Frontend Next.js app; lib/api.ts (getAvailableSlots or similar); dashboard availability page (doctor-facing); GET /api/v1/appointments/available-slots (unauthenticated)
- ❌ **What's missing:** Public /book page; token in URL; day-slots fetch (all slots with status); greyed-out booked slots UX; POST select-slot; redirect to Instagram
- ⚠️ **Notes:** Use GET /api/v1/bookings/day-slots?token=X&date=YYYY-MM-DD (e-task-3) — returns all slots with status. Use GET /api/v1/bookings/slot-page-info?token=X for doctorId, practiceName.

**Scope Guard:**
- Expected files touched: app/book/page.tsx, lib/api.ts, possibly components

**Reference Documentation:**
- [APPOINTMENT_BOOKING_FLOW_V2.md](../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md)
- [FRONTEND_ARCHITECTURE.md](../../../Reference/FRONTEND_ARCHITECTURE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Page Setup

- [x] 1.1 Create `app/book/page.tsx` (or `app/(public)/book/page.tsx`)
  - [x] 1.1.1 Read token from searchParams (?token=...)
  - [x] 1.1.2 If no token, show "Invalid or expired link. Please start from the chat."
  - [x] 1.1.3 Call GET /api/v1/bookings/slot-page-info?token=X to get { doctorId, practiceName } for header and slot fetch
- [x] 1.2 Add API function to fetch slot page info (or use token decode for doctorId)

### 2. Date Picker / Calendar

- [x] 2.1 Date picker / calendar component
  - [x] 2.1.1 Show next N days (e.g. 14 or from doctor's max_advance_booking_days)
  - [x] 2.1.2 User selects date → fetch day-slots for that date
- [x] 2.2 Fetch slots: GET /api/v1/bookings/day-slots?token=X&date=YYYY-MM-DD
  - [x] 2.2.1 Returns { slots: [{ start, end, status: 'available'|'booked' }], timezone }
  - [x] 2.2.2 Display loading state

### 3. Slot Grid (Full Day with Greyed-Out Booked)

- [x] 3.1 Display **all** slots for the selected day in a grid
  - [x] 3.1.1 **Available slots:** Normal style, clickable, tappable
  - [x] 3.1.2 **Booked slots:** Greyed out, disabled, not clickable (visual feedback that they're taken)
- [x] 3.2 User clicks available slot → select it (highlight, e.g. border or background)
- [x] 3.3 "Save" or "Confirm" button (enabled only when a slot is selected)
- [x] 3.4 If no available slots for date, show "No slots available. Pick another date."
- [x] 3.5 Format slot times in doctor's timezone (from API response)

### 4. Save & Redirect

- [x] 4.1 On Save click: POST /api/v1/bookings/select-slot with { token, slotStart: slot.start }
- [x] 4.2 On success: response has redirectUrl
  - [x] 4.2.1 Show "Slot saved! Redirecting you to the chat..." (brief)
  - [x] 4.2.2 window.location.href = redirectUrl (or meta refresh)
- [x] 4.3 On error: show "Something went wrong. Please try again or return to the chat."

### 5. UX & Accessibility

- [x] 5.1 Mobile-responsive (many users on phone)
- [x] 5.2 Clear labels: "Select a date", "Select a time"
- [x] 5.3 Loading states for fetch
- [x] 5.4 Practice name in header if available

### 6. GET Slot Page Info

- [x] 6.1 Call GET /api/v1/bookings/slot-page-info?token=X on page load
  - [x] 6.1.1 Verifies token, returns { doctorId, practiceName }
  - [x] 6.1.2 Page uses token for day-slots (token passed in query); practiceName for header
  - [x] 6.1.3 If token invalid → show error, no slot fetch

### 7. Verification

- [ ] 7.1 Manual test: open /book?token=valid → select date → select slot → save → redirect
- [ ] 7.2 Manual test: invalid token → error message
- [ ] 7.3 Manual test: no slots → appropriate message

---

## 📁 Files to Create/Update

```
frontend/
├── app/
│   └── book/
│       └── page.tsx              (NEW)
├── lib/
│   └── api.ts                    (UPDATED - add getDaySlots, getSlotPageInfo, selectSlot)
└── components/                   (optional - SlotGrid, DatePicker if reusable)
```

**Existing Code Status:**
- ✅ lib/api.ts — fetch pattern for API calls
- ✅ GET available-slots — exists (returns only available); e-task-3 adds day-slots (returns all with status)
- ❌ /book page — does not exist

---

## 🧠 Design Constraints

- No PHI on page (token only; slot times are not PHI)
- Public page — no auth
- Mobile-first (Instagram users often on mobile)

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (N – read-only for slots)
- [ ] **Any PHI in logs?** (N)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] /book?token=X loads and shows date picker
- [ ] Selecting date fetches day-slots (all slots with status)
- [ ] Slot grid shows: available = tappable; booked = greyed out, disabled
- [ ] Selecting available slot and Save → POST → redirect to Instagram
- [ ] Invalid token shows error

---

## 🔗 Related Tasks

- [e-task-3: Slot selection API](./e-task-3-slot-selection-api.md)
- [e-task-5: Webhook flow integration](./e-task-5-webhook-flow-integration.md)

---

**Last Updated:** 2026-03-13
