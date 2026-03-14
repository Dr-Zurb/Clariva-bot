# Task 3: Slot Selection API — Token, Save, Proactive Send, Redirect
## 2026-03-13

---

## 📋 Task Overview

Implement the backend API for the external slot picker: (1) Generate signed token for booking link; (2) GET day-slots endpoint (all slots with status: available/booked for greyed-out UX); (3) POST endpoint to receive slot selection; (4) Save to slot_selections; (5) Update conversation state; (6) Send proactive Instagram message; (7) Return redirect URL to chat.

**Estimated Time:** 10–12 hours  
**Status:** ✅ **COMPLETE**  
**Completed:** 2026-03-13

**Change Type:**
- [x] **New feature** — New API, new service functions

**Current State:**
- ✅ **What exists:** GET /api/v1/appointments/available-slots (doctorId, date); sendInstagramMessage(recipientId, message, correlationId, token); conversation-service (getConversationState, updateConversationState); doctor_instagram.instagram_username
- ❌ **What's missing:** Token generation/verification; GET day-slots (slots with status); POST select-slot endpoint; slot_selections CRUD; redirect URL resolution
- ⚠️ **Notes:** Instagram username from doctor_instagram; need doctorId from token (conversation → doctor_id)

**Scope Guard:**
- Expected files touched: routes, controller, service (slot-selection or booking), instagram-service (reuse send), conversation-service (reuse update)

**Reference Documentation:**
- [APPOINTMENT_BOOKING_FLOW_V2.md](../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md)
- [EXTERNAL_SERVICES.md](../../../Reference/EXTERNAL_SERVICES.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Token Generation & Verification

- [x] 1.1 Create `booking-token.ts` utility (or in slot-selection-service)
  - [x] 1.1.1 `generateBookingToken(conversationId, doctorId, expiresInSeconds)` — sign JWT or HMAC payload { conversationId, doctorId, exp }
  - [x] 1.1.2 `verifyBookingToken(token)` — verify signature, expiry; return { conversationId, doctorId } or throw
  - [x] 1.1.3 Use env.BOOKING_TOKEN_SECRET or similar; document in .env.example
- [x] 1.2 Token expiry: 1 hour (configurable)

### 2. Slot Selection Service

- [x] 2.1 Create `slot-selection-service.ts` (or extend existing)
  - [x] 2.1.1 `saveSlotSelection(conversationId, doctorId, slotStart)` — upsert slot_selections (overwrite by conversation_id)
  - [x] 2.1.2 `getRedirectUrlForDoctor(doctorId)` — lookup doctor_instagram.instagram_username → `https://instagram.com/${username}`
  - [x] 2.1.3 `processSlotSelection(token, slotStart, correlationId)` — verify token, save, load conversation, update state, send message, return redirectUrl
- [x] 2.2 Update conversation state: step = 'confirming_slot', slotToConfirm = { start, end, dateStr }
- [x] 2.3 Format slot for display (timezone-aware) in message

### 3. Proactive Instagram Message

- [x] 3.1 Load conversation by conversationId → get doctor_id
- [x] 3.2 Get platform_conversation_id (Instagram PSID) from conversation
- [x] 3.3 Get doctor's Instagram access token (getInstagramAccessTokenForDoctor)
- [x] 3.4 Build message: "You selected **Tuesday Mar 14 at 2:00 PM**. Reply Yes to confirm, or No to pick another time. [link] to change."
- [x] 3.5 Call sendInstagramMessage(platform_conversation_id, message, correlationId, doctorToken)
- [x] 3.6 Include fresh booking link in message (for "change" option)

### 4. GET Day Slots (All Slots with Status)

- [x] 4.1 Create `GET /api/v1/bookings/day-slots?token=X&date=YYYY-MM-DD`
  - [x] 4.1.1 Verify token; extract doctorId
  - [x] 4.1.2 Call availability-service: new `getDaySlotsWithStatus(doctorId, date)` — returns all slots from availability windows with status: 'available' | 'booked'
  - [x] 4.1.3 Response: `{ slots: [{ start, end, status }], timezone }`
  - [x] 4.1.4 No auth required (token is the auth)
- [x] 4.2 Add `getDaySlotsWithStatus` to availability-service (or slot-selection-service)
  - [x] 4.2.1 Generate all slots from availability; mark booked/blocked vs available
  - [x] 4.2.2 Exclude past slots; respect minAdvanceHours

### 5. POST Select Slot API

- [x] 5.1 Create `POST /api/v1/bookings/select-slot`
  - [x] 5.1.1 Body: { token: string, slotStart: string } (ISO datetime)
  - [x] 5.1.2 Validate slotStart format, not in past
  - [x] 5.1.3 Call processSlotSelection
  - [x] 5.1.4 Return { success: true, redirectUrl: string }
  - [x] 5.1.5 No auth required (token is the auth)
- [x] 5.2 Add route in api/v1/index or new bookings router
- [x] 5.3 Add validation schema (Zod)

### 6. GET Slot Page Info (Optional)

- [x] 6.1 Create `GET /api/v1/bookings/slot-page-info?token=X`
  - [x] 6.1.1 Verify token; return { doctorId, practiceName } for page to use
  - [x] 6.1.2 Page uses doctorId for day-slots; practiceName for header

### 7. Token in Slot Link

- [ ] 7.1 When webhook sends "Pick your slot" link — deferred to e-task-5
- [x] 7.2 FRONTEND_URL from env (BOOKING_PAGE_URL)

### 8. Verification

- [ ] 8.1 Unit test: token generation and verification
- [ ] 8.2 Unit test: getDaySlotsWithStatus returns correct status per slot
- [ ] 8.3 Integration test: POST select-slot → saves, sends message, returns redirect
- [ ] 8.4 Manual test: full flow from chat to external page to redirect

---

## 📁 Files to Create/Update

```
backend/
├── src/
│   ├── routes/api/v1/
│   │   ├── bookings.ts           (NEW - day-slots, select-slot, slot-page-info)
│   │   └── index.ts              (UPDATED - mount bookings)
│   ├── controllers/
│   │   └── booking-controller.ts (NEW - getDaySlotsHandler, selectSlotHandler, getSlotPageInfoHandler)
│   ├── services/
│   │   ├── availability-service.ts (UPDATED - add getDaySlotsWithStatus)
│   │   └── slot-selection-service.ts (NEW)
│   └── utils/
│       └── booking-token.ts      (NEW - optional, can be in service)
backend/.env.example              (UPDATED - BOOKING_TOKEN_SECRET, BOOKING_PAGE_URL)
```

**Existing Code Status:**
- ✅ sendInstagramMessage — exists; needs doctor token for multi-tenant
- ✅ getInstagramAccessTokenForDoctor — exists in instagram-connect-service
- ✅ conversation.platform_conversation_id — Instagram PSID
- ✅ doctor_instagram.instagram_username — for redirect URL
- ✅ availability-service — getAvailableSlots, generateSlotsFromAvailability, fetchBookedAppointments; extend for getDaySlotsWithStatus

---

## 🧠 Design Constraints

- No PHI in logs
- Token must be signed; prevent tampering
- slotStart must be valid ISO, not in past
- Redirect URL: fallback to generic Instagram if no username

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – slot_selections, conversations.metadata)
  - [ ] **RLS verified?** (Y)
- [ ] **Any PHI in logs?** (N)
- [ ] **External API or AI call?** (Y – Instagram Send API)
  - [ ] **Consent + redaction confirmed?** (Y – message may contain slot time only)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] GET /api/v1/bookings/day-slots returns all slots with status (available/booked)
- [ ] POST /api/v1/bookings/select-slot accepts token + slotStart
- [ ] Invalid token → 401
- [ ] Valid request → saves to slot_selections, updates conversation state, sends Instagram message, returns redirectUrl
- [ ] Redirect URL points to practice's Instagram

---

## 🔗 Related Tasks

- [e-task-1: Migrations](./e-task-1-migrations-slot-selections-patients-email.md)
- [e-task-4: External slot picker page](./e-task-4-external-slot-picker-page.md)
- [e-task-5: Webhook flow integration](./e-task-5-webhook-flow-integration.md)

---

**Last Updated:** 2026-03-13
