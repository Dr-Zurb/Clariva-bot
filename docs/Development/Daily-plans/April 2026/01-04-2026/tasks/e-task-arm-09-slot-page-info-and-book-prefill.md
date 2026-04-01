# e-task-arm-09: `slot-page-info` + `/book` — suggested service pre-fill

## 2026-04-02 — Align public book with conversation match

---

## 📋 Task Overview

Extend **`GET /api/v1/bookings/slot-page-info`** (see `booking-controller.ts` / `getSlotPageInfoHandler`) to return **non-PHI** booking hints derived from **conversation state**:

- **`suggestedCatalogServiceKey`** (optional): only when **high confidence** or **after staff confirmation** per **ARM-05/03** rules — **never** expose a key the patient is meant to **game**; product goal is **pre-fill** to avoid **price shopping**, not to add a silent wrong charge.
- **`matchConfidence`** or boolean **`serviceSelectionFinalized`** so `/book` can **lock** UI differently (e.g. hide service carousel vs show “clinic chose X” with optional override policy — **product decision** in implementation spec).

Update **`frontend/app/book/page.tsx`**:

- On load, if API returns **finalized** suggestion: **pre-select** `selectedServiceKey` / `selectedServiceId` like today’s **single-service** shortcut.
- If **multi-service** + suggestion present: follow product **§4** (minimize patient switching to cheaper row); **disclosure** copy if override allowed.

**Estimated Time:** 1–2 days  
**Status:** ✅ **DONE**

**Change Type:**
- [x] **Update existing** — booking controller response, `frontend/lib/api.ts`, `/book` page

**Current State:**
- ✅ `getSlotPageInfoHandler` returns `serviceCatalog`, `practiceName`, `conversationId`, etc.
- ✅ `/book` pre-selects when **exactly one** service in catalog or when **ARM-09 hints** present.
- ✅ **Gating:** hints only when `serviceSelectionFinalized` and not `pendingStaffServiceReview` without finalization.
- ✅ **`deriveSlotPageBookingHints`** + **`narrowSlotPageBookingHintsToCatalog`** in `backend/src/utils/slot-page-booking-hints.ts`.

**Dependencies:** **ARM-03**, **ARM-05** state semantics; coordinate with **ARM-10** for when **payment** enabled.

**Reference:**
- Plan §4, §9 technical backlog
- [CONTRACTS.md](../../../../../Reference/CONTRACTS.md) — slot-page-info optional fields

---

## ✅ Task Breakdown

### 1. API contract
- [x] 1.1 Add optional fields to **success payload**; version / backward compatibility for old mobile clients (if any) — default **omit** behavior unchanged.
- [x] 1.2 **Authorization**: token already scoped to conversation — **do not leak** other patients’ data.

### 2. Backend assembly
- [x] 1.3 Read **conversation state** in handler (already loads `getConversationState`) — map to response fields using **pure** helpers (testable).

### 3. Frontend
- [x] 1.4 Parse new fields in `getSlotPageInfo` client; **useEffect** sets selection **before** user interaction.
- [x] 1.5 UX: if override disabled — **disable** service picker; if enabled — show warning string (product). *v1: `servicePickerLocked` — multi-service carousel hidden; disclosure banner only.*

### 4. Tests
- [x] 1.6 API unit/integration: high-confidence mock state → suggestion present; pending staff → **no** suggestion or **blocked** booking token policy (coordinate **ARM-10** — token might not be issued until ready; document interaction). *Unit tests on pure helpers; token policy remains ARM-10.*

---

## 🧠 Design Constraints

- **Token security**: booking token must remain **unguessable**; new fields must not introduce **enumeration**.

---

## 🌍 Global Safety Gate

- [x] **PHI in slot-page-info?** MUST remain **absent**; only keys/enums

---

## ✅ Acceptance Criteria

- `/book` reflects **conversation-final** service when policy allows.
- Contract documented; tests cover **with/without** suggestion.

---

## 🔗 Related

- [e-task-arm-03](./e-task-arm-03-conversation-state-match-and-review.md)
- [e-task-arm-05](./e-task-arm-05-dm-flow-high-vs-pending-staff.md)
- [e-task-arm-10](./e-task-arm-10-pay-after-staff-confirm.md)

---

**Last Updated:** 2026-03-31
