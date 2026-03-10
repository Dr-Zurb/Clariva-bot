# Practice Setup UI – Reference

**Purpose:** Canonical reference for the consolidated Practice Setup page. Defines structure, sections, and terminology. Created as part of e-task-6 (Practice Setup consolidation).

**Status:** Reference for implementation. Frontend MUST align with this structure.

---

## 1. Overview

The **Practice Setup** page consolidates all doctor-to-bot configuration into a single place. The doctor configures how the bot communicates with patients: practice info, availability, blocked times, booking rules, and bot messages.

**Route:** `/dashboard/settings/practice-setup`  
**Nav:** Settings (parent) → Practice Setup (sub-tab)

**Related task:** [e-task-6-practice-setup-consolidation.md](../Development/Daily-plans/March%202026/2026-03-09/e-task-6-practice-setup-consolidation.md)

---

## 2. Section Structure

| Section        | Fields / Content                                                                 | API                    |
|----------------|------------------------------------------------------------------------------------|------------------------|
| **Practice Info** | practice_name, specialty, address_summary, consultation_types, timezone          | PATCH /api/v1/settings/doctor |
| **Availability** | Weekly slots (day, start, end)                                                     | GET/PUT /api/v1/availability |
| **Blocked Times** | Add/list/remove blocked periods (start, end, reason)                              | GET/POST/DELETE /api/v1/blocked-times |
| **Booking Rules** | slot_interval_minutes, max_advance_booking_days, min_advance_hours, business_hours_summary, cancellation_policy_hours, max_appointments_per_day, booking_buffer_minutes | PATCH /api/v1/settings/doctor |
| **Bot Messages** | welcome_message, default_notes                                                     | PATCH /api/v1/settings/doctor |

---

## 3. Layout Options

- **Option A:** Single long page with clear section headings (h2) and visual separators
- **Option B:** Collapsible/accordion sections for each area
- **Option C:** Tabs within the page (Practice Info | Availability | Blocked Times | Booking Rules | Bot Messages)

Recommendation: Option A or B for simplicity; Option C if sections become large.

---

## 4. Save Behavior

- **Per-section save:** Each section has its own "Save" button; only that section's data is submitted
- **Single save:** One "Save all" at bottom; submit settings + availability in sequence (blocked times are add/delete per item, not bulk)

---

## 5. Integrations (Instagram)

- **Option A:** Keep Instagram in separate Settings page
- **Option B:** Add "Integrations" section to Practice Setup; Settings becomes minimal or is removed

---

## 6. Route Structure

- **Settings** (parent): `/dashboard/settings` → redirects to Practice Setup
- **Practice Setup:** `/dashboard/settings/practice-setup`
- **Integrations:** `/dashboard/settings/integrations` (Instagram)

Removed:
- `/dashboard/schedule` — content moved to Practice Setup
- `/dashboard/blocked-times` — content moved to Practice Setup
- `/dashboard/practice-setup` — moved under Settings

---

**Last Updated:** 2026-03-09  
**Version:** 1.0.0
