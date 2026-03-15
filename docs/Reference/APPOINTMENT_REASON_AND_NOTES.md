# Appointment: reason_for_visit and notes

**Purpose:** Define semantics for appointment columns that store patient-provided information.

---

## Column Semantics

| Column | Purpose | Required | Source |
|--------|---------|----------|--------|
| **reason_for_visit** | Patient's main complaint/symptom — answer to "What's your reason for visit?" | Yes | Collected during booking (required field) |
| **notes** | Extra context patient shares during conversation (e.g. "On blood thinners", "Allergic to X") | No | Optional prompt or extracted from conversation |

---

## Data Flow

1. **Collection:** Patient provides reason_for_visit (required) and optionally extra notes.
2. **Conversation state:** `reasonForVisit` and `extraNotes` stored in `conversations.metadata`.
3. **Booking:** Slot selection service passes both to `bookAppointment`.
4. **Database:** `appointments.reason_for_visit` and `appointments.notes` stored separately.

---

## Doctor default_notes

Practice-level `doctor_settings.default_notes` (e.g. "Please bring previous reports") is appended to `notes` when present. If patient has extras: `notes = [patient extras]. [default_notes]`. Else: `notes = default_notes`.

---

## Related

- [DB_SCHEMA.md](./DB_SCHEMA.md) — appointments table
- [APPOINTMENT_BOOKING_FLOW_V2.md](./APPOINTMENT_BOOKING_FLOW_V2.md) — Collection flow

---

**Last Updated:** 2026-03-16
