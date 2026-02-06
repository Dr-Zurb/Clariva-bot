# Learning Topics - Appointment Booking Logic
## Task #2: Week 3 Booking System Day 2–3

---

## 📚 What Are We Learning Today?

Today we're learning about **Appointment Booking Logic** — how to implement booking with double-booking prevention, Zod validation, and atomicity. Think of it like **the receptionist actually writing an appointment into the book** — we move from "what slots are free?" (Task 1) to "book this slot for this patient."

We'll learn about:
1. **Double-booking prevention** – Check slot availability before insert; conflict handling
2. **Book API** – POST /api/v1/appointments/book; payload validation; successResponse
3. **Get Appointment API** – GET /api/v1/appointments/:id; ownership validation; audit read
4. **Atomicity** – Postgres rpc() vs compensating logic for multi-step operations
5. **Compliance & logging** – No PII in logs; audit metadata only; changedFields (no values)
6. **Zod schemas** – book payload (patientName, patientPhone, appointmentDate, doctorId, notes)

---

## 🎓 Topic 1: Double-Booking Prevention

### Why It Matters

Two patients must not book the same slot. Between "slot is available" (Task 1) and "create appointment," another booking could occur. We must verify the slot is still free before insert.

### Core Algorithm

1. **Before createAppointment** – Query appointments for doctor + date range overlapping the requested slot
2. **Filter by status** – Only `pending` and `confirmed` block; `cancelled` and `completed` do not
3. **If overlap exists** – Throw `ConflictError` or `ValidationError` with a clear message (e.g. "This time slot is no longer available")
4. **If free** – Proceed with insert

### Overlap Check

For a slot `[slotStart, slotEnd]` and an existing appointment `[appStart, appEnd]`:

- Overlap exists if: `slotStart < appEnd && slotEnd > appStart`

Assume a default appointment duration (e.g. 30 min) to derive `appEnd` from `appointment_date`.

### Implementation Options

- **Application-level check** – Query before insert; simple; small race window between check and insert
- **Database constraint** – UNIQUE on `(doctor_id, appointment_date)` prevents duplicates; stricter; may require different granularity (e.g. slot-start rounded)
- **Phase 0 choice** – Document which approach is used; application check is usually sufficient for MVP

**Think of it like:**
- **Check** = "Receptionist looks at the book before writing. Is 10:00 still empty?"
- **Conflict** = "Sorry, someone just took that slot."

---

## 🎓 Topic 2: Book API

### Endpoint

```
POST /api/v1/appointments/book
```

### Request Body

```json
{
  "doctorId": "550e8400-e29b-41d4-a716-446655440000",
  "patientName": "Jane Doe",
  "patientPhone": "+15551234567",
  "appointmentDate": "2026-02-02T10:00:00.000Z",
  "notes": "Follow-up visit"
}
```

### Zod Schema

Per RECIPES R-VALIDATION-001:

- `doctorId` – UUID
- `patientName` – String, length bounds (e.g. 1–200)
- `patientPhone` – E.164-like (reuse patientPhoneSchema from validation.ts)
- `appointmentDate` – ISO datetime string; must not be in past
- `notes` – Optional string; max length

### Flow

1. **Controller** – Validate body with Zod; call appointment-service; return `successResponse({ appointment })`
2. **Service** – Validate slot available; create appointment; audit log (metadata only, no PHI)
3. **Response** – Return created appointment (id, doctor_id, appointment_date, status); PHI (patient_name, patient_phone) is in response for caller; never in logs

### PHI Handling

- **In request/response** – OK; encrypted at rest
- **In logs** – NEVER; only correlationId, appointmentId, doctorId, resource IDs

**Think of it like:**
- **API** = "Receptionist writes: Jane Doe, +1-555-1234, 10:00 Tuesday."
- **Logs** = "Appointment created for doctor X, slot 10:00." Not "Patient Jane booked."

---

## 🎓 Topic 3: Get Appointment API

### Endpoint

```
GET /api/v1/appointments/:id
```

### Flow

1. **Controller** – Validate `id` (UUID); call `getAppointmentById`; return `successResponse({ appointment })`
2. **Service** – Fetch single appointment; validate ownership (`doctor_id = userId`); audit read
3. **Response** – Return appointment for owner only

### Ownership

- **Doctor-only** – Only the doctor who owns the appointment can read it
- **RLS** – Database enforces; service validates ownership (defense in depth)
- **404** – If not found or not owner, return 404 (don't leak existence)

### Audit

- Log "read_appointment" with metadata (correlationId, userId, resourceId); no PHI

**Think of it like:**
- **API** = "Doctor asks: Show me appointment #123."
- **Ownership** = "Only if it's your appointment."

---

## 🎓 Topic 4: Atomicity

### Why It Matters

Creating an appointment may involve multiple steps (insert appointment, audit log). If one fails, we need a clear strategy.

### Options

1. **Postgres rpc()** – Single database function that does both in one transaction; all-or-nothing
2. **Compensating logic** – If audit fails after insert, log error and optionally retry or mark for manual review
3. **Phase 0** – Single insert + separate audit log; audit failure does not roll back insert (audit is best-effort per COMPLIANCE); document if stricter atomicity needed later

### STANDARDS Reference

Per STANDARDS Services Architecture: use `rpc()` or compensating logic for multi-step operations. Phase 0 may use simpler approach; document the choice.

**Think of it like:**
- **rpc()** = "One atomic action: write appointment and log it, or do neither."
- **Compensating** = "If log fails after write, we have a plan to fix it."

---

## 🎓 Topic 5: Compliance & Logging

### No PII in Logs

- **Never log:** patient_name, patient_phone, notes content
- **OK to log:** correlationId, appointmentId, doctorId, action type, resource IDs

### Audit Requirements (COMPLIANCE D)

- **create** – Log with action, resourceType, resourceId; changedFields (field names only, not values)
- **read** – Log with action, resourceType, resourceId
- **Metadata only** – No PHI in audit_logs.metadata JSONB

**Think of it like:**
- **Audit** = "Appointment created for doctor X." Not "Patient Jane, phone +1-555-1234, booked."

---

## 🎓 Topic 6: Zod Validation (Book Payload)

### Reuse Existing Schemas

- `patientNameSchema` – From validation.ts (name length, trim)
- `patientPhoneSchema` – E.164-like
- `doctorId` – UUID
- `appointmentDate` – ISO datetime; reject past

### New Schema

```ts
bookAppointmentSchema = z.object({
  doctorId: z.string().uuid(),
  patientName: patientNameSchema,
  patientPhone: patientPhoneSchema,
  appointmentDate: z.string().datetime(),
  notes: z.string().max(500).optional(),
});
```

### Validation Flow

- Validate in controller before calling service
- Throw `ValidationError` (400) on invalid input per ERROR_CATALOG

---

## 📝 Summary

### Key Takeaways

1. **Double-booking** – Check slot overlap before insert; throw ConflictError if taken.
2. **POST /book** – Validate payload; check slot; create; audit (metadata only).
3. **GET /:id** – Validate UUID; fetch; check ownership; return for owner only.
4. **Atomicity** – Document rpc vs compensating; Phase 0 may use simpler approach.
5. **Compliance** – No PII in logs; audit metadata only; changedFields (names, not values).
6. **Zod** – Reuse patientName, patientPhone; add doctorId, appointmentDate, notes.

### Next Steps

After completing this task:

1. Task 3 integrates booking into the conversation flow and sends Instagram DM confirmation.
2. Webhook worker can call `createAppointment` (or book API) after patient selects a slot.
3. Auth model for API (doctor dashboard vs worker) is documented.

### Remember

- **Slot check** – Always verify before insert; race window exists but is small.
- **Ownership** – GET /:id returns 404 if not owner; don't leak existence.
- **PHI** – In request/response OK; never in logs.

---

**Last Updated:** 2026-02-01  
**Related Task:** [Task 2: Appointment Booking Logic](../../Development/Daily-plans/2026-02-01/e-task-2-appointment-booking-logic.md)  
**Reference Documentation:**
- [DB_SCHEMA.md](../../Reference/DB_SCHEMA.md)
- [STANDARDS.md](../../Reference/STANDARDS.md)
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md)
- [RECIPES.md](../../Reference/RECIPES.md)
- [ERROR_CATALOG.md](../../Reference/ERROR_CATALOG.md)
