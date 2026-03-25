# Appointment Booking Flow V2 — Desired State

**Purpose:** Canonical reference for the redesigned appointment booking flow. Replaces sequential field-by-field collection with "all at once" collection, adds confirmation steps, and uses an external slot picker with proactive messaging.

**Status:** Design reference for implementation. Code MUST align with this flow.

**Related:** [APPOINTMENT_BOOKING_FLOW.md](./APPOINTMENT_BOOKING_FLOW.md) (legacy), [e-task-*](../../Development/Daily-plans/March%202026/2026-03-13/)

---

## Design Principles

1. **Real-world behavior:** Accept partial info, messy format, corrections anytime.
2. **Confirm before slots:** Read back summary; user confirms before seeing availability.
3. **Confirm before book:** Final confirmation after slot selection.
4. **External slot picker:** Calendar + grid for all slots; no chat clutter.
5. **Proactive messaging:** Bot sends confirmation immediately after user saves slot (no "send a message to trigger").
6. **Redirect to chat:** User is redirected back to chat after saving slot (compliance).

---

## Field Set

| Field | Required | Notes |
|-------|----------|-------|
| Full name | Yes | Already exists |
| Age | Yes | New field (1–120) |
| Gender | Yes | Important for medical context |
| Mobile number | Yes | Already exists |
| Reason for visit | Yes | Wire to appointment.notes |
| Email | Optional | For receipts; new column in patients |
| Consultation type | **Skipped** | Defer to future (service-based availability) |
| Date of birth | **Skipped** | Use age only |

---

## Flow Overview

| Phase | Step | Bot Action | User Response |
|-------|------|------------|---------------|
| 1 | Collect | "To book, share: Full name, Age, Mobile, Reason for visit. Email (optional), Gender (optional)." | Partial or full details |
| 1 | Fill gaps | "Got name and age. Still need: mobile, reason." | Missing fields |
| 1 | Validate | "That phone format doesn't look right. Please share again." | Corrected value |
| 2 | Confirm details | "Let me confirm: **Abhishek Sahil**, **25**, **male**, **8264602737**, reason: fever. Is this correct? Reply Yes or tell me what to change." | "Yes" or correction |
| 3 | Consent | "Thanks, Abhishek. We'll use **8264602737** to confirm. Ready to pick a time?" | "Yes" |
| 4 | Slot link | "Pick your slot: [link]. You'll be redirected back here after you choose." | User opens link |
| 5 | External page | User selects date + slot, clicks Save | — |
| 5 | Proactive | Bot sends: "You selected **Tuesday Mar 14 at 2:00 PM**. Reply Yes to confirm, or No to pick another. [link] to change." | — |
| 5 | Redirect | Page redirects user to Instagram | User lands in chat |
| 6 | Final confirm | User sees message, replies "Yes" | — |
| 6 | Book | Bot books, sends confirmation + payment link | — |

---

## State Machine

| State | Description |
|-------|-------------|
| `collecting_all` | Asking for all details at once; accepting partial/multi-turn |
| `confirm_details` | Read back summary; waiting for Yes or correction |
| `consent` | Combined consent; waiting for Yes |
| `awaiting_slot_selection` | Sent slot link; waiting for user to pick on external page |
| `confirming_slot` | User picked slot; bot sent confirmation; waiting for Yes/No |
| `responded` | Flow complete |

---

## External Slot Picker Flow

1. **Link generation:** Token = `{ conversationId, doctorId, expiresAt }` (signed).
2. **User on page:** Calendar + date picker → fetch slots via `GET /api/v1/bookings/day-slots?token=X&date=YYYY-MM-DD`.
3. **Slot grid UX:** Display **all** slots for the day:
   - **Available slots:** Normal style, tappable, clickable.
   - **Booked slots:** Greyed out, disabled, not clickable.
4. **User selects** an available slot → taps Save.
5. **User saves:** POST to `POST /api/v1/bookings/select-slot` with `{ token, slotStart }`.
6. **Backend:** Verify token → save to `slot_selections` → load conversation → get `platform_conversation_id` → send Instagram message → return `{ redirectUrl }`.
7. **Page:** Redirect user to `redirectUrl` (e.g. `https://instagram.com/[practice_username]`).

### Day Slots API

- **Endpoint:** `GET /api/v1/bookings/day-slots?token=X&date=YYYY-MM-DD`
- **Response:** `{ slots: [{ start, end, status: 'available'|'booked' }], timezone }`
- **Purpose:** Enables full-day slot grid with greyed-out booked slots (typical calendar UX).

---

## Slot Selections Table

```sql
CREATE TABLE slot_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES auth.users(id),
  slot_start TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  UNIQUE(conversation_id)
);
```

---

## Redirect URL

- **Instagram:** `https://instagram.com/[instagram_username]` — user taps Message.
- **Source:** `doctor_instagram.instagram_username` (from migration 011).

---

## OPD modes (slot vs queue) — patient snapshot

After booking, the patient **visit** experience (token / ETA / slot window) is driven by `doctor_settings.opd_mode` and public APIs under `/api/v1/bookings/session/*`. The client **polls** `GET /api/v1/bookings/session/snapshot` (see [CONTRACTS.md](./CONTRACTS.md)); there is **no Meta DM requirement** for live OPD status in MVP. Queue copy must stay **forecast**-aligned (approximate wait), not a fixed-time guarantee.

---

## References

- [APPOINTMENT_BOOKING_FLOW.md](./APPOINTMENT_BOOKING_FLOW.md) — Legacy flow
- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](./RECEPTIONIST_BOT_CONVERSATION_RULES.md)
- [COMPLIANCE.md](./COMPLIANCE.md)

---

**Last Updated:** 2026-03-24
