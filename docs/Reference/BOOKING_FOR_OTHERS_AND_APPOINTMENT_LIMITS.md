# Booking for Others & Appointment Limits

**Purpose:** Define behavior when a user books for someone else (e.g. "book for my mother") and when enforcing per-person-per-day appointment limits.

**Status:** Design reference. Implementation complete (e-task-2 2026-03-18).

**Related:**
- [APPOINTMENT_BOOKING_FLOW_V2.md](./APPOINTMENT_BOOKING_FLOW_V2.md) — Main booking flow
- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](./RECEPTIONIST_BOT_CONVERSATION_RULES.md) — Intent map

---

## 1. Booking for Someone Else

### Problem

When a user says "I want to book an appointment for my mother too" (or similar), the bot currently reuses the slot link tied to the **conversation's patient**. The second appointment is booked under the same person (e.g. Abhishek Sahil) instead of the intended person (mother).

### Desired Behavior

1. **Detect intent:** User wants to book for a *different* person.
2. **Start fresh collection:** Reset collected data; collect name, phone, age, gender, reason for the *other* person.
3. **Confirm & consent:** Same flow, but consent applies to the other person's details.
4. **Slot link:** After consent, send slot link. When user selects slot, book under the *other* person's details.
5. **Conversation patient unchanged:** The conversation's linked patient (the Instagram user) stays as-is. The new appointment uses a different patient record or guest booking.

### Trigger Phrases (Examples)

- "book for my mother/father/wife/husband/son/daughter"
- "book appointment for someone else"
- "I want to schedule for [name]"
- "book for my mom"

### Data Flow

| Step | Action |
|------|--------|
| Intent | `book_for_someone_else` (or `book_appointment` with context) |
| State | `bookingFor?: { name, phone, age, gender, reasonForVisit, ... }` — stored in conversation state or Redis; NOT persisted to conversation's patient |
| Consent | Consent for *other* person's details |
| Slot selection | Use `bookingFor` data for appointment; create new patient or use guest booking (patient_id = null) |
| After booking | Clear `bookingFor` from state; conversation patient unchanged |

### Patient Creation

- **Option A:** Create a new patient record for the other person (no platform link). Store `bookingForPatientId` in state. Use for appointment.
- **Option B:** Guest booking — `patient_id = null`, `patient_name` and `patient_phone` from collected data. Simpler but no patient record for future visits.

**Recommendation:** Option A — create patient for consistency and future lookups.

---

## 2. Appointment Limit Per Person Per Day

### Problem

A single person can book multiple appointments on the same day (spam, accidental double-booking, or abuse). No limit is currently enforced.

### Desired Behavior

- **Default:** 1 appointment per patient per day (per doctor).
- **Enforcement point:** Before creating appointment (in `processSlotSelectionAndPay` / `bookAppointment`).
- **Identification:** By `patient_id` when available; fallback to `(patient_name + patient_phone)` for guest bookings.
- **Error message:** "You already have an appointment on [date]. Please choose another date or contact us if you need multiple visits."

### Configurability (Future)

- Per-doctor setting: `max_appointments_per_patient_per_day` (default 1).
- Allows practices that need multiple same-day visits (e.g. follow-up).

### Implementation Notes (Done)

- `hasAppointmentOnDate(doctorId, patientId, patientName, patientPhone, dateStr, correlationId)` in `appointment-service.ts` — queries by `patient_id` when available, else by `patient_name` + `patient_phone` for guest bookings.
- Compare date portion only (YYYY-MM-DD, UTC range) — one appointment on Mar 16 blocks another on Mar 16.
- Enforced in `slot-selection-service.processSlotSelectionAndPay` before calling `bookAppointment`.
- Throws `ValidationError` (400) with message: "You already have an appointment on [date]. Please choose another date or contact us if you need multiple visits."

---

## References

- [DB_SCHEMA.md](./DB_SCHEMA.md) — appointments, patients
- [APPOINTMENT_BOOKING_FLOW_V2.md](./APPOINTMENT_BOOKING_FLOW_V2.md) — Flow
- [COMPLIANCE.md](./COMPLIANCE.md) — No PHI in logs

---

**Last Updated:** 2026-03-18
