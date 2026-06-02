# e-task-arm-11: Catalog quote fallback safety (multi-service)

## 2026-04-02 — Avoid silent legacy fee when catalog key unknown

---

## 📋 Task Overview

Tighten **`computeSlotBookingQuote`** / **`resolveCatalogServiceKeyForSlotBooking`** behavior (see `slot-selection-service.ts`) so that when a doctor has a **non-empty teleconsult catalog** but **`catalogServiceKey` in conversation state is missing, invalid, or not in catalog**, the system does **not silently fall back** to **legacy flat fee** in a way that **undercharges** vs the patient’s **intended** service (risk described in product discussions).

**Agreed direction** (finalize during implementation with product):

- Either **block** quoting / return **actionable error** until **`applyPublicBookingSelectionsToState`**-equivalent validation passes, **or**
- **Allow** legacy only when **explicit** product flag says “this doctor uses legacy for teleconsult” (catalog empty), aligning with **`getActiveServiceCatalog`** null path.

**Scope:** backend **quote** path + tests; **DM** should set valid keys via **ARM-04/05** before patient reaches pay.

**Estimated Time:** 0.5–1 day  
**Status:** ✅ **DONE**

**Change Type:**
- [x] **Update existing** — `slot-selection-service.ts`, tests in `slot-selection-quote.test.ts` / related

**Current State:**
- ✅ `resolveCatalogServiceKeyForSlotBooking` still returns **null** when key/id invalid or multi-service missing selection.
- ✅ **`computeSlotBookingQuote`**: when **catalog exists** and resolution is **null**, throws **`ValidationError`** (400) and logs `slot_booking_quote_blocked` — **no** silent **legacy_fee** fallback.
- ✅ **Legacy** fee only when **`getActiveServiceCatalog`** is null (or **in_clinic**).

**Dependencies:** **ARM-01** ensures **`other`** always available — matcher should rarely leave **invalid** key if state machine correct; this task is a **safety net**.

**Reference:**
- Plan §9 technical backlog (last bullet)
- Prior SFU-05 / SFU-07 docs

---

## ✅ Task Breakdown

### 1. Behavior decision record
- [x] 1.1 ADR or comment in `RECIPES.md`: **exact** behavior matrix — `catalog non-null` + invalid key → **error** vs legacy (pick **one**). *RECIPES ARM-11 subsection.*

### 2. Implementation
- [x] 2.1 Adjust **`computeSlotBookingQuote`** branch when **`serviceKeyNorm`** null **but** catalog present. *Throws `ValidationError`.*
- [x] 2.2 Ensure **error surfaces** to client as structured code for `/book` / DM follow-up. *Standard error middleware → `ValidationError` / 400.*

### 3. Tests
- [x] 2.3 Update **`slot-selection-quote.test.ts`** expectations; add regression for multi-service + bad key.

### 4. Observability
- [x] 2.4 Log **reason** enum when blocking (no PHI). *`slot_booking_quote_blocked` + `slot_booking_quote_block_reason`.*

---

## 🌍 Global Safety Gate

- [x] **Money impact?** Y — treat as **high-risk** change; full regression on **checkout**

---

## ✅ Acceptance Criteria

- **No** silent wrong-tier quote for **catalog doctors** without product-approved escape hatch.
- Tests green; docs note **interaction** with **ARM-09/10**.

---

## 🔗 Related

- [e-task-arm-01](./e-task-arm-01-mandatory-other-not-listed-catalog.md)
- [e-task-arm-05](./e-task-arm-05-dm-flow-high-vs-pending-staff.md)
- [e-task-arm-10](./e-task-arm-10-pay-after-staff-confirm.md)

---

**Last Updated:** 2026-03-31
