# SFU-09 (P2): Tiered discounts, episode admin & analytics

## 2026-03-28 — Backlog after P1 uniform follow-up

### Status at a glance

| Done | Not done |
|------|----------|
| Tiered discounts: `discount_tiers` in catalog v1 + quote/tests | `version: 2` migration (only if needed) |
| `visit_kind` on quotes + payment notes | No-show consumes slot |
| Frontend Zod accepts `discount_tiers` (validate/save) | Episode admin UI (close / extend / audit) |
| | Modality overrides (`same_as_index`, per-modality) |
| | Analytics **dashboard** / export |
| | Practice Setup **tier editor** UI |

---

## 📋 Task Overview

**Post-MVP enhancements** from PLAN §5 P2/P3 (✅ = shipped in this task’s **Phase A** or earlier SFU work; ⬜ = still open):

- ✅ **Tiered follow-up rules** per service (visit 2 vs 3+ different % or flat) — `discount_tiers` + quote engine (**Phase A**).
- ⬜ **Modality rules** advanced: `same_as_index`, per-modality follow-up overrides.
- ⬜ **No-show consumes slot** (doctor setting).
- ⬜ **Doctor dashboard**: patient **episode** panel — remaining follow-ups, expiry, history; admin **close episode**.
- ⬜ **Analytics** — dashboard cards: counts `index` vs `followup` quotes, exhaustion vs expiry, disputes. *(✅ **`visit_kind`** already on quotes + payment notes from prior SFU; cards/export TBD.)*

**Estimated Time:** Multi-sprint  
**Status:** 🟨 **PARTIAL** — **Phase A (tiered discounts)** on **catalog v1**; episode admin, analytics, no-show, optional `version: 2` still **BACKLOG**.

**Change Type:**
- [x] **Update existing** — extends SFU-01 schema, SFU-03 engine, SFU-04 lifecycle

**Current State:**
- **Phase A:** `followup_policy` may include optional **`discount_tiers`**: `{ from_visit, discount_type, discount_value }[]`. Quote engine uses the tier with **largest** `from_visit` where `from_visit <= visit_index`, else top-level discount. **`visit_index`:** 2 = first follow-up after index, 3 = second, etc.
- **Practice Setup** has no tier row editor yet — configure via **catalog JSON** until a UI task adds it.
- Remaining: `same_as_index` / per-modality overrides, no-show consumes slot, episode admin, analytics, catalog **v2** if needed.

**Dependency:** SFU-01–05 **done** and in production for at least one pilot doctor.

---

## Phase A — ✅ DONE

| Area | Location |
|------|-----------|
| Zod + types | `backend/src/utils/service-catalog-schema.ts`, `frontend/lib/service-catalog-schema.ts` |
| Quote | `backend/src/services/consultation-quote-service.ts` — `resolveFollowUpDiscountSpec`, `applyFollowUpDiscount(..., visit_index)` |
| Tests | `backend/tests/unit/services/consultation-quote-service.test.ts`, `backend/tests/unit/utils/service-catalog-schema.test.ts` |

**Not in Phase A (still manual / backlog):** Practice Setup **UI** for editing tier rows — doctors use **catalog JSON** for `discount_tiers` until a UI slice ships.

---

## ✅ Task Breakdown (high level)

### 1. Schema
- [x] 1.1 Extend `followup_policy` with optional **`discount_tiers`** (`from_visit`, `discount_type`, `discount_value`) on **v1**.
- [ ] 1.2 Migration + Zod version bump (`version: 2`) — only if we need a breaking rename or stricter shape.

### 2. Quote engine
- [x] 2.1 Apply tier by **`visit_index`** (max applicable `from_visit` ≤ `visit_index`, else top-level discount).

### 3. Lifecycle
- [ ] 3.1 Optional no-show increment — gated by doctor flag.

### 4. Admin UI
- [ ] 4.1 Episode list per patient; manual **close** / **extend window** (audit logged).

### 5. Metrics
- [x] 5.1a **`visit_kind`** (`index` \| `followup`) on consultation quotes and **`payment.notes`** (prior SFU — see `payment-service.ts`, `consultation-quote-service.ts`).
- [ ] 5.1b Dashboard / export **analytics**: aggregate `index` vs `followup`, exhaustion vs expiry, disputes.

### 6. Practice Setup UX (SFU-09-adjacent)
- [ ] 6.1 Tier row editor in dashboard (optional table UI for `discount_tiers`).

---

## 📁 Files

See **Phase A — implemented** table above. Backlog slices will add admin/analytics routes and UI paths when scheduled.

---

**Last Updated:** 2026-03-28 (done vs backlog explicitly marked)
