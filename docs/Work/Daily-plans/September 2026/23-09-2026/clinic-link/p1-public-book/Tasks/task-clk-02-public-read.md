# Task clk-02: Slug-scoped page info and day slots

## 📋 Task Overview

A public slug can load the same booking header and day slots a token loads today, without a conversation and without any patient data.

**Program / Phase:** clinic-link · Phase 1 (public-book)
**Batch:** [`plan-p1-clinic-link-public-book-batch.md`](../plan-p1-clinic-link-public-book-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-clinic-link-public-book.md`](./EXECUTION-ORDER-p1-clinic-link-public-book.md)
**Estimated Time:** 4 hours
**Status:** ✅ **DONE** (2026-09-23)

**Change Type:**
- [x] **New feature** — slug read
- [x] **Update existing** — booking routes gain a second way in

**Current State:**
- ✅ **What exists:** `GET /api/v1/bookings/slot-page-info` and `GET /api/v1/bookings/day-slots` verify a booking token, then return practice name, OPD mode, catalog, and slots. `getBookingPageCatalogPayload` already shapes the catalog.
- ❌ **What's missing:** those reads keyed by the public slug.
- ⚠️ **Notes:** Token routes stay token-only. An unknown slug must not resolve another doctor.

**Scope Guard:**
- Expected files touched: ≤ 5 (routes, booking controller, the service that already serves day slots, `CONTRACTS.md`, one test)
- Do not create an appointment (`clk-03`)
- Do not return a conversation id, patient id, name, phone, or reason on the slug read
- Rate-limit the new slug routes the way other public patient routes are limited. Leave the token routes on their current limiter behavior.

**Reference Documentation:**
- [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — read of practice settings and availability. No patient row.
- [x] **RLS verified?** Y — public read goes through the service role, scoped to the doctor the slug resolves. No patient table read.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Resolve the slug
- [x] 1.1 Resolve one doctor from the slug. Unknown slug is a not-found, not another practice. — 2026-09-23
- [x] 1.2 Return the header the token page already shows: practice name, timezone, OPD mode, catalog, and whether booking is allowed for a verified doctor — 2026-09-23
- [x] 1.3 Omit conversation booking hints. Those stay on the token read. — 2026-09-23

### 2. Slots
- [x] 2.1 Day slots for that doctor match the token day-slot payload for the same date — 2026-09-23
- [x] 2.2 Note both reads in `CONTRACTS.md` — 2026-09-23

### 3. Verification
- [x] 3.1 Unit test: known slug returns that doctor only; unknown slug does not; token routes still require a token — 2026-09-23
- [x] 3.2 Typecheck and lint the touched files — 2026-09-23

---

## 📁 Files to Create/Update

- ⚠️ `backend/src/routes/api/v1/bookings.ts` — EXISTS, token-only
- ⚠️ `backend/src/controllers/booking-controller.ts` — EXISTS
- ⚠️ Day-slot service used by `getDaySlotsHandler` — EXISTS
- ⚠️ `CONTRACTS.md` booking section — EXISTS
- ❌ Focused unit test — MISSING

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Zod on the query before the service. Controller does not touch the database.
- Response uses the canonical success helper.
- No patient fields in the slug payload or in logs.
- Do not weaken token verification on the existing routes.

---

## ✅ Acceptance & Verification Criteria

- [x] A slug returns practice header and day slots for that doctor only — 2026-09-23
- [x] Unknown slug does not leak another practice — 2026-09-23
- [x] Token routes are unchanged — 2026-09-23
- [x] Contract note matches the new reads — 2026-09-23

---

## 📝 Notes

Waits on clk-01. Checkout is clk-03.

---

## 🔗 Related Tasks

- [`task-clk-01-public-slug.md`](./task-clk-01-public-slug.md)
- [`task-clk-03-public-checkout.md`](./task-clk-03-public-checkout.md)

**Last Updated:** 2026-09-23
