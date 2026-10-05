# Task clk-01: Public slug on the practice

## 📋 Task Overview

Each practice gets one stable, editable slug and can copy `/d/:slug` from Practice info. The page itself is later.

**Program / Phase:** clinic-link · Phase 1 (public-book)
**Batch:** [`plan-p1-clinic-link-public-book-batch.md`](../plan-p1-clinic-link-public-book-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-clinic-link-public-book.md`](./EXECUTION-ORDER-p1-clinic-link-public-book.md)
**Estimated Time:** 4 hours
**Status:** ✅ **DONE** (2026-09-23)

**Change Type:**
- [x] **Update existing** — settings already save practice name
- [x] **New feature** — the slug column does not exist

**Current State:**
- ✅ **What exists:** `doctor_settings.practice_name`, Practice info at `frontend/components/settings/PracticeInfoClient.tsx`, doctor-scoped RLS on `doctor_settings`. Latest settings migration inspected: `240_doctor_settings_share_address_on_instagram.sql`.
- ❌ **What's missing:** a public slug, generation when missing, a copyable URL in settings.
- ⚠️ **Notes:** The slug is not PHI. Do not derive it from a patient. Existing RLS covers the row; this task does not add a policy.

**Scope Guard:**
- Expected files touched: ≤ 5 (migration, settings read/write, Practice info UI, one test)
- Do not build `/d/:slug` or change the bot URL (`clk-02`, `clk-07`)
- Do not log practice names beyond what settings already log

**Reference Documentation:**
- [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md)
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — `doctor_settings` only. Not PHI.
- [x] **RLS verified?** Y — existing doctor-scoped policies cover the row. Confirm that before writing a new policy; do not add one if they already allow the owner to update the row.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Persist the slug
- [x] 1.1 Read migrations in numeric order through `240` before adding the next one — 2026-09-23
- [x] 1.2 Add a unique public slug on `doctor_settings`, reversible, re-run safe — 2026-09-23
- [x] 1.3 Generate a URL-safe slug from the practice name when the row has none, and suffix on collision — 2026-09-23
- [x] 1.4 Reject a save that collides with another practice — 2026-09-23

### 2. Show it
- [x] 2.1 Practice info shows the full `/d/:slug` URL and lets the doctor edit the slug — 2026-09-23
- [x] 2.2 Empty practice name still gets a unique slug that is not a patient identifier — 2026-09-23

### 3. Verification
- [x] 3.1 Unit test: generated slug is unique; a taken slug is rejected; a second practice is unaffected — 2026-09-23
- [x] 3.2 Typecheck and lint the touched files — 2026-09-23 (touched files clean; repo has unrelated `tsc` errors in duplicate `* 2.ts` files)

---

## 📁 Files to Create/Update

- ✅ `backend/migrations/241_doctor_settings_public_slug.sql`
- ✅ Doctor settings read/write includes `public_slug`
- ✅ `frontend/components/settings/PracticeInfoClient.tsx` shows `/d/:slug` and a copy control
- ✅ `backend/tests/unit/utils/public-clinic-slug.test.ts` and `backend/tests/unit/migrations/241-doctor-settings-public-slug-migration.test.ts`

**When creating a migration:**
- [x] Read previous migrations in numeric order — see [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) — 2026-09-23

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Additive column. No new RLS policy if the current doctor-scoped policies already cover updates.
- Slug is unique, editable, URL-safe, and not PHI.
- Controller validates with Zod. No `process.env` reads outside config.
- No PHI in logs.

---

## ✅ Acceptance & Verification Criteria

- [x] Practice info shows a copyable `/d/:slug` — 2026-09-23
- [x] Two practices cannot save the same slug — 2026-09-23
- [x] A practice with no slug receives one without a manual step — 2026-09-23
- [x] Typecheck, lint, and the new test are green — 2026-09-23

---

## 📝 Notes

CLK-DL-6. The bot does not send this URL until `clk-07`.

---

## 🔗 Related Tasks

- [`task-clk-02-public-read.md`](./task-clk-02-public-read.md) — next, reads the slug

**Last Updated:** 2026-09-23
