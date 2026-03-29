# SFU-11: Stable `service_id` (UUID) + hide `service_key` in UI

## 2026-03-28 — Rename-safe catalog rows; episode/booking anchor on UUID

---

## 📋 Task Overview

**Problem:** `service_key` (slug) is the join key for **`care_episodes`**, quotes, and appointments. The dashboard **auto-updates `service_key` from the label** when the user has not manually locked the key (`ServiceCatalogEditor`), so **renaming a service** can **break** active follow-up episodes (quote engine: different key ⇒ episode ignored ⇒ **index** pricing).

**Goal:**

1. Add an **immutable per-row `service_id`** (UUID) to each offering in **`service_offerings_json`** (catalog v1 **or** introduce v2—prefer **extending v1** with required `service_id` + migration/backfill; see §Schema).
2. Persist **`catalog_service_id`** on **`care_episodes`** and (as needed) **`appointments`**; **primary** episode lookup + quote matching uses **UUID**.
3. Keep **`service_key`** in JSON as a **server-maintained slug** (human-readable logs, DM text, payment notes, optional URLs)—**generated** on create (from label), **not** tied to label changes after first save; **hidden** from default Practice Setup UI.
4. **Dual-read** transition: rows without `catalog_service_id` fall back to normalized `catalog_service_key` until backfilled.

**Estimated Time:** 3–6 days (schema + migration + services + frontend + tests)  
**Status:** ✅ **IMPLEMENTED** (2026-03-28) — optional: episode backfill script + `DB_SCHEMA.md` / `PRACTICE_SETUP_UI.md` refresh

**Change Type:**
- [x] **Update existing** — Zod catalog, DB, `care-episode-service`, `consultation-quote-service`, `slot-selection-service`, booking/API types, `ServiceCatalogEditor`, drafts

**Dependencies:** **SFU-01** (catalog JSON), **SFU-02** (episodes), **SFU-03** (quotes), **SFU-05/07** (booking token / `catalog_service_key` on appointments), **SFU-06** (editor).  
**Complements:** **[SFU-10](./e-task-sfu-10-remove-practice-consultation-types-ui.md)** (separate UX cleanup).

**Reference:** `backend/src/utils/service-catalog-schema.ts`, `backend/src/services/care-episode-service.ts`, `backend/src/services/consultation-quote-service.ts`, `frontend/components/practice-setup/ServiceCatalogEditor.tsx`, `frontend/lib/service-catalog-drafts.ts`, migration `036_care_episodes.sql`

---

## Design summary

| Concept | Role |
|---------|------|
| **`service_id`** | UUID, **set once** when the catalog row is created, **never** regenerated when label changes. |
| **`service_key`** | Slug, **unique per doctor catalog**; used for display in fee tables, logs; **optional** to expose in UI; may change only via explicit “Rename slug” flow (future) or stay fixed after first publish. |
| **`label`** | Doctor-editable anytime. |
| **`care_episodes.catalog_service_id`** | **Primary** match for “same service” follow-ups. |
| **`care_episodes.catalog_service_key`** | **Legacy**; keep column for backfill/debug; reads prefer **id** when present. |

---

## ✅ Task Breakdown

### 1. Catalog schema (Zod + types)

- [x] 1.1 Add **`service_id: z.string().uuid()`** to **`serviceOfferingV1Schema`** (backend `service-catalog-schema.ts` + frontend mirror).
- [x] 1.2 Enforce **unique `service_id`** and **unique `service_key`** across `services[]` (existing `service_key` uniqueness refines).
- [x] 1.3 **Backfill rule:** PATCH/normalize on save: any offering **missing** `service_id` gets **`randomUUID()`** once (server-side in `doctor-settings-service` or dedicated normalizer). Do **not** replace existing ids when label/slug edits occur.
- [x] 1.4 **`service_key` generation:** On **new** row or when slug empty/invalid, derive from label (same rules as today); **after** `service_id` exists, **do not** auto-change `service_key` when **only** `label` changes (fixes root bug). Collisions: append `-2`, `-3`, etc.

### 2. Database migrations

- [x] 2.1 **`care_episodes`:** add **`catalog_service_id UUID NULL`** (nullable for rollout; then NOT NULL for new rows only or backfill-all—product choice).
- [x] 2.2 **`appointments`:** add **`catalog_service_id UUID NULL`** if booking path stores service for matching (mirrors `catalog_service_key`).
- [x] 2.3 **Indexes:** partial unique or composite index for active episode lookup, e.g. `(doctor_id, patient_id, catalog_service_id) WHERE status = 'active'`, in addition to or **replacing** key-based index once id is canonical.
- [ ] 2.4 **Backfill script / migration step:** For each `care_episodes` row with non-null `catalog_service_key`, resolve doctor’s catalog JSON row by **`service_key`** → set **`catalog_service_id`** from that row’s `service_id` (after catalog backfill). Log/skip orphans.
- [ ] 2.5 Update **`docs/Reference/DB_SCHEMA.md`**, **`RLS_POLICIES.md`** if column comments/policies change.

### 3. Backend services

- [x] 3.1 **`care-episode-service`:** Create episode with **`catalog_service_id`** (+ keep writing `catalog_service_key` for transition). `fetchActiveEpisodeForTriplet` (and variants): prefer **`catalog_service_id`** when provided; else fallback key.
- [x] 3.2 **`consultation-quote-service`:** Extend `QuoteConsultationVisitInput` with **`catalogServiceId?: string | null`**. Match `activeEpisode` when **`episode.catalog_service_id === normalizedUuid(catalogServiceId)`**; fallback: existing **key** equality for legacy episodes.
- [x] 3.3 **`slot-selection-service` / booking-controller:** Carry **`catalog_service_id`** in quote metadata, tokens, and **`bookAppointment`** payload alongside `service_key` where needed.
- [x] 3.4 **`payment-service`:** Optional: store `service_id` in notes (alongside `service_key`) for analytics—non-breaking.
- [x] 3.5 **`consultation-fees.ts` / DM:** Resolve services by id internally when present; still print **label** + optional slug for humans.

### 4. Frontend — Practice Setup

- [x] 4.1 **`service-catalog-drafts.ts`:** Map **`service_id`** ↔ draft; on **new** service, set `service_id` = `crypto.randomUUID()`; load from API fills id; **stop** syncing **`service_key`** from label on every label change—only on **new row** or explicit regenerate (if ever).
- [x] 4.2 **`ServiceCatalogEditor`:** **Remove** the visible **Service key** field and **`serviceKeyManual`** UX; optional **Advanced** collapsible “Short code (slug)” is **out of scope** unless product asks—default = **fully hidden**.
- [x] 4.3 Intro copy: remove “unique key (slug)” from primary blurb; focus on **name + modalities + prices**.

### 5. Public book flow & conversation state

- [x] 5.1 Ensure slot/quote selection passes **`catalog_service_id`** through to **`bookAppointment`** (types in `frontend/lib/api.ts`, `backend` validation).
- [x] 5.2 **`conversation` / Instagram worker:** If state stores `service_key`, add **`catalog_service_id`** for reliable episode resolution.

### 6. Tests

- [x] 6.1 Unit: **quote** — same episode when **label** and slug **change** but **id** stable (regression for SFU-03).
- [x] 6.2 Unit: **catalog Zod** — duplicate `service_id` / missing id backfill expectations.
- [ ] 6.3 Integration / DB: migration backfill sample (optional).

### 7. Rollout & compatibility

- [x] 7.1 **Order:** deploy catalog id backfill +PATCH normalizer **before** or **with** episode column + application dual-read.
- [ ] 7.2 Document **legacy** path removal criteria (when all episodes have `catalog_service_id`).

---

## 📁 Files (expected touch list)

| Layer | Paths |
|--------|--------|
| Schema | `backend/src/utils/service-catalog-schema.ts`, `frontend/lib/service-catalog-schema.ts` |
| Settings normalize | `backend/src/services/doctor-settings-service.ts` (or new helper) |
| Episodes | `backend/src/services/care-episode-service.ts`, `backend/src/types/care-episode.ts` |
| Quotes | `backend/src/services/consultation-quote-service.ts` |
| Booking | `backend/src/services/slot-selection-service.ts`, `booking-controller.ts`, `utils/validation.ts` |
| Types | `backend/src/types/database.ts`, `payment.ts`, `conversation.ts` |
| FE | `frontend/lib/service-catalog-drafts.ts`, `components/practice-setup/ServiceCatalogEditor.tsx`, `services-catalog/page.tsx`, `frontend/lib/api.ts` |
| Docs | `DB_SCHEMA.md`, `PRACTICE_SETUP_UI.md`, PLAN cross-link |
| Migrations | New SQL under `backend/migrations/` |

---

## 🔮 Future (out of scope for SFU-11)

- Explicit **“Rename slug”** admin action with collision checks.
- **Drop** `catalog_service_key` from episodes after full backfill and monitoring.
- Catalog **`version: 2`** if you prefer breaking rename of JSON shape vs additive v1.

---

**Last Updated:** 2026-03-28
