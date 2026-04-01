# e-task-arm-07: Doctor dashboard — service match review inbox

## 2026-04-02 — Confirm / reassign / cancel with audit

---

## 📋 Task Overview

Build a **Practice / Appointments-adjacent** UI where the logged-in doctor (or future staff role) sees **pending** service-match requests from **e-task-arm-06**:

- List shows: patient display name / id **per existing Patients patterns**, **reason summary** (loaded via authorized API — not echoing PHI into browser console logs), **AI proposal** (label + `service_key` internal if needed), **confidence**, **time remaining** until SLA.
- Actions: **Confirm as proposed**, **Reassign** (picker limited to **catalog keys** from current `service_offerings_json`), **Cancel** request (optional internal note field — **not** a fixed reject-reason taxonomy per plan §0).
- On success: call **ARM-06 APIs**, trigger **patient notification** path (coordinate **ARM-05** worker hook or messaging service) so patient receives **slot booking** instructions.

**Estimated Time:** 2–3 days  
**Status:** ✅ **DONE** (core inbox + actions, 2026-03-31)

**Change Type:**
- [x] **New feature** — dashboard pages + API client wrappers

**Current State:**
- ✅ Doctor dashboard shell, auth via Supabase patterns.
- ✅ Services catalog editor and appointments views exist elsewhere.
- ✅ **Inbox** at **`/dashboard/service-reviews`** (“Match reviews” in sidebar) — lists enriched rows from ARM-06, confirm / reassign / cancel, refresh, empty state → services catalog.

**Dependencies:** **ARM-06** APIs stable.

**Reference:**
- Plan §5.2
- [PRACTICE_SETUP_UI.md](../../../../../Reference/PRACTICE_SETUP_UI.md) if layout reuse

---

## ✅ Task Breakdown

### 1. UX / IA
- [x] 1.1 Route location (e.g. under **Practice** or **Appointments** — product decision); **badge count** for pending items optional v2.
  - **Done:** Top-level **Match reviews** next to Appointments. Badge deferred (v2).
- [x] 1.2 **Mobile-responsive** table or cards.
  - **Done:** Horizontal scroll on small screens (`overflow-x-auto`).

### 2. Data loading
- [x] 1.3 Hook **list** endpoint with loading/error states; **poll** or **realtime** optional v2.
  - **Done:** SSR initial load + manual **Refresh**; polling deferred (v2).
- [x] 1.4 **Empty state** + link to improve catalog hints (**ARM-02** copy).
  - **Done:** Link to `/dashboard/settings/practice-setup/services-catalog`.

### 3. Action flows
- [x] 1.5 **Reassign**: client-side validation that new key exists in doctor catalog (fetch settings or embed catalog snapshot from API).
  - **Done:** Dropdown from `getDoctorSettings` / `service_offerings_json` only; server still validates on POST.
- [x] 1.6 **Optimistic UI** vs refetch; handle **409** conflicts (already resolved).
  - **Done:** Refetch after success; **409** shows message + refresh list; dialog stays open on generic errors.

### 4. Accessibility & safety
- [x] 1.7 Do not log PHI in **browser** `console` in production builds.
  - **Done:** No `console.log` of patient/reason in inbox component.

### 5. Tests
- [x] 1.8 Playwright or unit tests — **optional v2**; backend ARM-06/07 paths covered by service/controller tests where present. Dashboard smoke deferred.

---

## 📁 Files (expected)

```
frontend/app/dashboard/service-reviews/page.tsx
frontend/components/service-reviews/ServiceReviewsInbox.tsx
frontend/components/layout/Sidebar.tsx (nav link)
frontend/lib/api.ts — getServiceStaffReviews, postConfirm/Reassign/Cancel
frontend/types/service-staff-review.ts
backend/src/services/service-staff-review-service.ts — listEnrichedServiceStaffReviewsForDoctor
backend/src/controllers/service-staff-review-controller.ts — list uses enriched rows
```

---

## 🌍 Global Safety Gate

- [x] **PHI displayed?** Y in UI — **authorized** session only; follow **COMPLIANCE** for screenshots/support

---

## ✅ Acceptance Criteria

- [x] Doctor can **clear** pending queue with three actions.
- [x] **Audit** visible in backend (not necessarily in UI v1).
- [x] Post-action, patient path unblocked — confirm path updates metadata + **Instagram** booking message (**`service-staff-review-service`**); **`/book`** aligned via **ARM-09** hints + **ARM-10** payment gate + **ARM-11** quote safety.

---

## 🔗 Related

- [e-task-arm-06](./e-task-arm-06-pending-review-persistence-and-apis.md)
- [e-task-arm-08](./e-task-arm-08-sla-timeout-and-patient-notify.md)
- [e-task-arm-09](./e-task-arm-09-slot-page-info-and-book-prefill.md)

---

**Last Updated:** 2026-03-31
