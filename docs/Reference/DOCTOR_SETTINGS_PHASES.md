# Doctor Settings Feature – Phases Overview

**Purpose:** Canonical reference for the doctor settings feature rollout. Defines phases, dependencies, and scope. Task files in `docs/Development/Daily-plans/March 2026/` implement each phase.

**Status:** Reference for implementation. Code MUST align with this flow.

---

## 1. Phase Summary

| Phase | Scope | Dependencies |
|-------|-------|--------------|
| **1.1** | Extend `doctor_settings` table (migration) | None |
| **1.2** | Doctor settings API (GET/PATCH) | Phase 1.1 |
| **2** | Availability & blocked times API | None (tables exist) |
| **3** | Bot uses doctor settings | Phase 1.1, 1.2 |
| **4** | Frontend dashboard | Phase 1.2, 2 |

---

## 2. Phase 1.1 – Extend `doctor_settings` (DB Migration)

**New columns (approved):**

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `practice_name` | TEXT | NULL | e.g. "Dr Sharma's Clinic" |
| `timezone` | TEXT | 'Asia/Kolkata' | IANA timezone for slot display |
| `slot_interval_minutes` | INTEGER | 15 | Slot length (15, 20, 30, 45, 60) |
| `max_advance_booking_days` | INTEGER | 90 | How far ahead users can book |
| `min_advance_hours` | INTEGER | 0 | Minimum notice before booking |
| `business_hours_summary` | TEXT | NULL | e.g. "Mon–Fri 9–5" for AI |
| `cancellation_policy_hours` | INTEGER | NULL | Minimum notice to cancel (e.g. 24) |
| `max_appointments_per_day` | INTEGER | NULL | Cap on bookings per day |
| `booking_buffer_minutes` | INTEGER | NULL | Gap between appointments (e.g. 15) |
| `welcome_message` | TEXT | NULL | Custom greeting (e.g. "Welcome to Dr...") |
| `specialty` | TEXT | NULL | e.g. "General Physician", "Dermatologist" |
| `address_summary` | TEXT | NULL | e.g. "Sector 15, Noida" for "Where is..." |
| `consultation_types` | TEXT | NULL | e.g. "In-person", "Video" for slot display |
| `default_notes` | TEXT | NULL | Pre-filled notes for new appointments |

**Existing columns (unchanged):** `appointment_fee_minor`, `appointment_fee_currency`, `country`

**Task:** [e-task-1-doctor-settings-extend-migration.md](../Development/Daily-plans/March%202026/2026-03-09/e-task-1-doctor-settings-extend-migration.md)

---

## 3. Phase 1.2 – Doctor Settings API

- `GET /api/v1/settings/doctor` – read settings (auth)
- `PATCH /api/v1/settings/doctor` – update settings (auth)

**Task:** [e-task-2-doctor-settings-api.md](../Development/Daily-plans/March%202026/2026-03-09/e-task-2-doctor-settings-api.md)

---

## 4. Phase 2 – Availability & Blocked Times API

- **Availability:** GET, PUT (CRUD for weekly schedule)
- **Blocked times:** GET, POST, DELETE

Tables `availability` and `blocked_times` already exist (001_initial_schema.sql). Service layer exists in `availability-service.ts`. API routes need to be added.

**Task:** [e-task-3-availability-blocked-times-api.md](../Development/Daily-plans/March%202026/2026-03-09/e-task-3-availability-blocked-times-api.md)

---

## 5. Phase 3 – Bot Uses Doctor Settings

- Slot date selection: not only tomorrow; use `max_advance_booking_days`
- Slot generation: use `slot_interval_minutes`, `timezone`, `min_advance_hours` from doctor_settings (fallback to env); optionally `booking_buffer_minutes`, `max_appointments_per_day`
- AI context: use `practice_name`, `business_hours_summary`, `welcome_message`, `specialty`, `address_summary`, `consultation_types`, `cancellation_policy_hours` in prompts
- Multi-day slot search when tomorrow has no slots
- Appointment creation: optionally use `default_notes` as pre-filled notes

**Current state:**
- Slot interval: env `SLOT_INTERVAL_MINUTES` (30 min)
- Slot date: always tomorrow (`getTomorrowDate()`)
- AI prompt: generic "Clariva Care"

**Task:** [e-task-4-bot-uses-doctor-settings.md](../Development/Daily-plans/March%202026/2026-03-09/e-task-4-bot-uses-doctor-settings.md)

---

## 6. Phase 4 – Frontend Dashboard

- Doctor dashboard UI for settings, schedule, blocked times
- Integrates with Phase 1.2 and Phase 2 APIs

**Task:** [e-task-5-frontend-dashboard.md](../Development/Daily-plans/March%202026/2026-03-09/e-task-5-frontend-dashboard.md)

---

## 6.5 Phase 4.1 – Practice Setup UI Consolidation

- Consolidate Schedule, Blocked Times, and Doctor Settings into a single **Practice Setup** page
- Single nav item; remove separate Schedule and Blocked Times routes
- Sections: Practice Info, Availability, Blocked Times, Booking Rules, Bot Messages
- Improves discoverability; aligns with "doctor configures bot" mental model

**Reference:** [PRACTICE_SETUP_UI.md](./PRACTICE_SETUP_UI.md)  
**Task:** [e-task-6-practice-setup-consolidation.md](../Development/Daily-plans/March%202026/2026-03-09/e-task-6-practice-setup-consolidation.md)

---

## 6.6 Phase 4.2 – Practice Setup UI Refinement

- Collapsible Settings and expandable Practice Setup in sidebar
- Remove Practice Setup | Integrations tabs from main screen
- Practice Setup landing: 4 icon+label cards with short descriptions
- Separate pages: Practice Info, Booking Rules, Bot Messages, Availability
- Availability page: Weekly Slots + Blocked Times (two sections, single scroll)
- Breadcrumb and Back button on section pages

**Reference:** [PRACTICE_SETUP_UI.md](./PRACTICE_SETUP_UI.md)  
**Task:** [e-task-7-practice-setup-ui-refinement.md](../Development/Daily-plans/March%202026/2026-03-09/e-task-7-practice-setup-ui-refinement.md)

---

## 7. Relevant Code Paths

| Area | Path |
|------|------|
| doctor_settings table | `backend/migrations/009_doctor_settings.sql` |
| doctor_settings service | `backend/src/services/doctor-settings-service.ts` |
| doctor_settings types | `backend/src/types/doctor-settings.ts` |
| Slot interval (env) | `backend/src/config/env.ts` (SLOT_INTERVAL_MINUTES) |
| Slot generation | `backend/src/services/availability-service.ts` |
| Bot slot date | `backend/src/workers/webhook-worker.ts` – `getTomorrowDate()`, `slotSelectionDate` |
| Instagram receptionist pause (RBH-09) | `033_instagram_receptionist_pause.sql`; `instagram-dm-webhook-handler.ts`; `instagram-comment-webhook-handler.ts`; dashboard **Bot Messages** |
| AI prompt | `backend/src/services/ai-service.ts` – RESPONSE_SYSTEM_PROMPT |
| Availability/blocked_times | `backend/src/services/availability-service.ts` |

---

**Last Updated:** 2026-03-28  
**Version:** 1.0.1
