# Task soc-03: Doctor-owned card record and API

## 📋 Task Overview

Persist a social card for the signed-in doctor and expose create, read, update, and delete. The board UI is the next task.

**Program / Phase:** social-assist · Phase 2 (content)
**Batch:** [`plan-p2-social-assist-content-batch.md`](../plan-p2-social-assist-content-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-social-assist-content.md`](./EXECUTION-ORDER-p2-social-assist-content.md)
**Estimated Time:** 6 hours
**Status:** ✅ **COMPLETED** — 2026-10-11

**Change Type:**
- [x] **New feature** — no card store exists

**Current State:**
- ✅ **What exists:** doctor-scoped RLS on practice tables. Route mounting in `backend/src/routes/api/v1/index.ts`. Zod validation in controllers. Latest canonical migration inspected: `245_visit_page_links.sql`.
- ❌ **What's missing:** a card record, doctor-only access, and an authenticated API.
- ⚠️ **Notes:** The card is the doctor's marketing words. It must not have a patient id, name, phone, or chart field. Do not reuse `visit_page_links`.

**Scope Guard:**
- Expected files touched: ≤ 8 (migration, service, controller, route mount, tests)
- No file upload (`soc-05`). No time. No Instagram URL. No visit count.
- Do not edit Insights or the public booking page

**Reference Documentation:**
- [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md)
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — a new doctor-owned card. Not a patient row.
- [x] **RLS verified?** Y — required. The owner can read and write their rows. No policy for other doctors. Service role for the server write path if that matches neighbouring tables. Confirm against a current doctor-owned table before inventing a second style.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** Y — deleting the doctor’s account must not leave another doctor able to read the cards. Follow the neighbouring `ON DELETE` pattern for `doctor_id`.

---

## ✅ Task Breakdown

### 1. Record
- [x] ✅ 1.1 Read migrations in numeric order through `245` before adding the next one - **Completed: 2026-10-11**
- [x] ✅ 1.2 Add a doctor-owned card. Fields the product needs: which column it is in, the title, an optional format (Post, Reel, Story), an optional topic, and the words. No patient columns. No time, URL, or visit count. - **Completed: 2026-10-11**
- [x] ✅ 1.3 Doctor-only RLS. Another doctor cannot select the row. - **Completed: 2026-10-11**

### 2. API
- [x] ✅ 2.1 Authenticated list, create, update, and delete for the signed-in doctor - **Completed: 2026-10-11**
- [x] ✅ 2.2 Zod on the controller. The service owns the database. Typed errors. No `process.env` outside config. - **Completed: 2026-10-11**
- [x] ✅ 2.3 A create may name the starting column, including Ready, so a card need not begin in Thoughts and ideas - **Completed: 2026-10-11**
- [x] ✅ 2.4 Update `CONTRACTS.md` with the new request and response shapes after the handlers exist. Do not invent the shape in this task file. - **Completed: 2026-10-11**

### 3. Verification
- [x] ✅ 3.1 Tests: the owner can write and read; a second doctor cannot; a patient field is rejected; logs contain ids only - **Completed: 2026-10-11**
- [x] ✅ 3.2 Typecheck and lint the touched files - **Completed: 2026-10-11** (eslint clean; `tsc` has no errors in these files. Existing errors remain in duplicate `* N.ts` files.)

---

## 📁 Files to Create/Update

- ❌ Next migration after `245` — MISSING. Number it from the sequence on the day you write it.
- ❌ Social card service, controller, and route — MISSING
- ⚠️ `backend/src/routes/api/v1/index.ts` — mount the route
- ⚠️ `docs/Reference/engineering/architecture/CONTRACTS.md` — add the shapes once they exist

**When creating a migration:**
- [x] ✅ Read previous migrations in numeric order — see [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) - **Completed: 2026-10-11**

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Controller orchestrates only. Zod before the service. `asyncHandler`. No try/catch in the controller.
- RLS is required. Do not rely on the service filter as the only guard.
- No PHI in logs. A title is the doctor’s words; still do not log titles.
- No Instagram call.

---

## 📝 Notes

Format and topic may be empty while the card is in Thoughts and ideas. Chosen is when the UI asks for them (`soc-04`, `soc-05`).

---

**Last Updated:** 2026-10-11
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
