# Learning Topics - Availability & Time Slots
## Task #1: Week 3 Booking System Day 1–2

---

## 📚 What Are We Learning Today?

Today we're learning about **Availability & Time Slots** — how to extend the availability service for Phase 0: basic working hours, time slot calculation, and an API to return available slots. Think of it like **building the appointment book grid** — the doctor's schedule becomes queryable so patients (or the AI receptionist) can see which slots are open.

We'll learn about:
1. **Time slot calculation** – Intervals, multiple windows per day, schema alignment (TIME vs TIMESTAMPTZ)
2. **Exclusion logic** – Blocked times and booked appointments (pending/confirmed only)
3. **API design** – GET available-slots, Zod validation, asyncHandler, successResponse
4. **Zod validation** – Past-date rejection, max future range, R-VALIDATION-001
5. **Compliance & logging** – No PII in logs; audit metadata only
6. **Service ownership** – availability-service vs booking-service; auth decisions

---

## 🎓 Topic 1: Time Slot Calculation

### Why It Matters

Doctors have working hours (e.g. 9:00–12:00, 14:00–17:00). We need to turn those into discrete bookable slots (e.g. every 30 minutes) while excluding times that are already blocked or booked.

### Core Algorithm

1. **Fetch availability** – For `date`'s `day_of_week`, get all availability rows (multiple windows allowed)
2. **Generate slots** – For each availability window, emit slots at interval (e.g. 30 min) from start to end
3. **Exclude blocked_times** – Remove slots that overlap any blocked_times row for that doctor/date
4. **Exclude appointments** – Remove slots that overlap appointments with `status IN ('pending', 'confirmed')`; cancelled/completed do not block

### Schema Alignment

- **availability** – Uses `TIME` (start_time, end_time); no timezone; per `day_of_week`
- **blocked_times** – Uses `TIMESTAMPTZ`; has start/end timestamps
- **appointments** – Uses `appointment_date` (TIMESTAMPTZ)

Combine `date` + `availability.TIME` in doctor timezone (or UTC); then filter blocked_times and appointments that overlap the date range (day start–end).

### Multiple Windows Per Day

The availability table allows multiple rows per doctor per day (UNIQUE on doctor_id, day_of_week, start_time, end_time). Slot generation must iterate over all windows and merge/union the resulting slots before exclusions.

**Think of it like:**
- **Availability** = "Doctor works 9–12 and 2–5."
- **Slots** = "9:00, 9:30, 10:00, … 11:30, 14:00, 14:30, … 16:30."

---

## 🎓 Topic 2: Exclusion Logic

### What Blocks a Slot?

1. **blocked_times** – Any row whose start/end overlaps the slot
2. **appointments** – Only `status IN ('pending', 'confirmed')`

### What Does NOT Block

- Appointments with status `cancelled` or `completed`
- Past slots (handled by validation; no slots for past dates)

### Overlap Check

For a slot `[slotStart, slotEnd]` and a block `[blockStart, blockEnd]`:

- Overlap exists if: `slotStart < blockEnd && slotEnd > blockStart`

**Think of it like:**
- **Blocked** = "Lunch break 12:00–13:00" → 12:00 and 12:30 slots removed
- **Booked** = "Patient has 10:00 appointment" → 10:00 slot removed

---

## 🎓 Topic 3: API Design

### Endpoint

```
GET /api/v1/appointments/available-slots?doctorId=<UUID>&date=YYYY-MM-DD
```

### Response Shape

```json
{
  "slots": [
    { "start": "2026-02-01T09:00:00.000Z", "end": "2026-02-01T09:30:00.000Z", "durationMinutes": 30 },
    { "start": "2026-02-01T09:30:00.000Z", "end": "2026-02-01T10:00:00.000Z", "durationMinutes": 30 }
  ]
}
```

- No PHI in response
- Empty availability for date returns `{ "slots": [] }`

### Route Structure

- Create `routes/api/v1/appointments.ts` with route definitions
- Mount under api/v1 in `index.ts`
- Controller uses `asyncHandler` and `successResponse` per STANDARDS

### Auth Decision

Document whether:
- **Doctor-only** – Dashboard UI; requires JWT with doctor role
- **Unauthenticated** – Patient-facing; anyone can query slots

Webhook worker calls the service directly (no HTTP); uses service role.

**Think of it like:**
- **API** = "Receptionist answering: 'What times are free on Tuesday?'"
- **Worker** = "Receptionist checking the book in person, no phone call needed."

---

## 🎓 Topic 4: Zod Validation

### Schema Requirements

Per RECIPES R-VALIDATION-001:

- `doctorId` – UUID
- `date` – YYYY-MM-DD format

### Additional Rules

1. **Reject past dates** – No slots for yesterday; return 400 with ValidationError
2. **Max future range** – e.g. 90 days; prevent abuse; make configurable
3. **Invalid format** – Malformed UUID or date → ValidationError per ERROR_CATALOG

### Implementation

- Add `availableSlotsQuerySchema` to `utils/validation.ts`
- Use in controller before calling service

**Think of it like:**
- **Validation** = "Receptionist won't look up slots for 'next year' or 'last Tuesday' without a valid request."

---

## 🎓 Topic 5: Compliance & Logging

### No PII in Logs

Log only: `correlationId`, `doctorId`, `date`. No patient names, phones, or appointment details.

### Audit Event

Log "get_available_slots" or similar with metadata only per COMPLIANCE.md Section D:

- Action type
- Actor (if authenticated)
- Resource (doctor, date)
- No PHI

**Think of it like:**
- **Logs** = "Someone asked for slots for Dr. X on Feb 1." Not "Patient Jane asked for slots."

---

## 🎓 Topic 6: Service Ownership & Timezone

### Where Does Slot Calculation Live?

- **availability-service** – Can add `getAvailableSlots`; already owns availability and blocked_times
- **booking-service** – Monthly plan may introduce this; Task 2 may define it

Document the choice. If availability-service owns it, keep appointment-service as a dependency for `getDoctorAppointments`.

### Timezone Handling

- availability uses TIME (no timezone)
- appointments and blocked_times use TIMESTAMPTZ

Choose one of:
- **Doctor timezone** – Slots in doctor's local time; requires doctor timezone config
- **UTC** – Simpler; slots in UTC; document for consumers

**Think of it like:**
- **TIME** = "9:00" (wall clock)
- **TIMESTAMPTZ** = "9:00 in London" vs "9:00 in New York"

---

## 📝 Summary

### Key Takeaways

1. **Slot calculation** – Availability windows → intervals → exclude blocked + booked (pending/confirmed).
2. **Schema alignment** – Combine date + TIME for availability; use TIMESTAMPTZ for exclusions.
3. **API** – GET /api/v1/appointments/available-slots; asyncHandler; successResponse; no PHI.
4. **Zod** – Past dates rejected; max future range; R-VALIDATION-001.
5. **Compliance** – No PII in logs; audit metadata only.
6. **Ownership** – Document service choice; document timezone choice.

### Next Steps

After completing this task:

1. Webhook worker (Task 3) can call `getAvailableSlots` when user says "book appointment."
2. Task 2 implements POST /book and GET /:id using the same slot semantics.
3. Auth and RLS for the API are documented for future dashboard/patient UI.

### Remember

- **Empty availability** – Return `[]`, not an error.
- **Cancelled appointments** – Do not block slots.
- **Multiple windows** – Handle 9–12 and 2–5 in one day.

---

**Last Updated:** 2026-01-30  
**Related Task:** [Task 1: Availability & Time Slots](../../Development/Daily-plans/2026-02-01/e-task-1-availability-and-time-slots.md)  
**Reference Documentation:**
- [DB_SCHEMA.md](../../Reference/DB_SCHEMA.md)
- [STANDARDS.md](../../Reference/STANDARDS.md)
- [RECIPES.md](../../Reference/RECIPES.md)
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md)
- [TESTING.md](../../Reference/TESTING.md)
