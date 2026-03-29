# Practice Setup UI – Reference

**Purpose:** Canonical reference for the Practice Setup UI structure. Defines sidebar hierarchy, routes, and section layout. Updated by e-task-7 (Practice Setup UI refinement).

**Status:** Reference for implementation. Frontend MUST align with this structure.

---

## 1. Overview

The **Practice Setup** consolidates doctor-to-bot configuration. Settings is collapsible in the sidebar; Practice Setup is expandable with 4 sub-items. Practice Setup landing shows 4 icon+label cards; each section has its own page.

**Related tasks:** [e-task-6](../Development/Daily-plans/March%202026/2026-03-09/e-task-6-practice-setup-consolidation.md), [e-task-7](../Development/Daily-plans/March%202026/2026-03-09/e-task-7-practice-setup-ui-refinement.md)

---

## 2. Sidebar Structure (Nested)

```
Settings (collapsible)
├── Practice Setup (expandable) → /dashboard/settings/practice-setup
│   ├── Practice Info → /dashboard/settings/practice-setup/practice-info
│   ├── Services catalog → /dashboard/settings/practice-setup/services-catalog  (SFU-06)
│   ├── Booking Rules → /dashboard/settings/practice-setup/booking-rules
│   ├── Bot Messages → /dashboard/settings/practice-setup/bot-messages
│   └── Availability → /dashboard/settings/practice-setup/availability
└── Integrations → /dashboard/settings/integrations
```

- **Settings:** Click toggles expand/collapse; shows Practice Setup and Integrations when expanded
- **Practice Setup:** Click toggles expand/collapse; shows 4 sub-items when expanded
- **No main-screen tabs:** Practice Setup | Integrations tab bar removed; navigation via sidebar only

---

## 3. Route Structure

| Route | Content |
|-------|---------|
| `/dashboard/settings` | Redirects to Practice Setup |
| `/dashboard/settings/practice-setup` | Landing page with icon+label cards |
| `/dashboard/settings/practice-setup/practice-info` | Practice Info form |
| `/dashboard/settings/practice-setup/services-catalog` | Service offerings matrix (`service_offerings_json`) — modalities, prices, follow-up policy |
| `/dashboard/settings/practice-setup/booking-rules` | Booking Rules form |
| `/dashboard/settings/practice-setup/bot-messages` | Bot Messages form |
| `/dashboard/settings/practice-setup/availability` | Weekly Slots + Blocked Times (two sections, single scroll) |
| `/dashboard/settings/integrations` | Instagram (and future integrations) |

---

## 4. Landing Page Cards

| Card | Label | Short description |
|------|-------|-------------------|
| Practice Info | Practice Info | Practice name, timezone, specialty, and address (teleconsult: Services catalog) |
| Services catalog | Services catalog | Teleconsult services, modalities, prices; **follow-up discount per modality** + shared max/window (SFU-06, SFU-12) |
| Booking Rules | Booking Rules | Slot length, advance booking limits, cancellation policy |
| Bot Messages | Bot Messages | Welcome message and default appointment notes |
| Availability | Availability | Weekly schedule and blocked times when you're unavailable |

Style: icon + label + short description; each card links to its section page.

---

## 5. Section Structure

| Section | Fields / Content | API |
|---------|------------------|-----|
| **Practice Info** | practice_name, timezone, specialty, address_summary (UI does not edit `consultation_types`; column remains for API/bot fallback) | PATCH /api/v1/settings/doctor |
| **Booking Rules** | slot_interval_minutes, max_advance_booking_days, min_advance_hours, business_hours_summary, cancellation_policy_hours, max_appointments_per_day, booking_buffer_minutes | PATCH /api/v1/settings/doctor |
| **Bot Messages** | welcome_message, default_notes | PATCH /api/v1/settings/doctor |
| **Availability** | Weekly slots (GET/PUT) + Blocked times (GET/POST/DELETE) | /api/v1/availability, /api/v1/blocked-times |

**Availability page:** Two sections on one page (single scroll): (1) Weekly Slots, (2) Blocked Times.

---

## 6. Navigation Aids

- **Breadcrumb:** e.g. "Settings > Practice Setup" or "Settings > Practice Setup > Practice Info"
- **Back button:** On each section page; navigates to Practice Setup landing

---

## 7. Save Behavior

- **Per-section save:** Each section page has its own Save button
- **Availability:** Weekly slots: Save; Blocked times: add/delete per item

---

**Last Updated:** 2026-03-09  
**Version:** 2.0.0 (e-task-7 refinement)
