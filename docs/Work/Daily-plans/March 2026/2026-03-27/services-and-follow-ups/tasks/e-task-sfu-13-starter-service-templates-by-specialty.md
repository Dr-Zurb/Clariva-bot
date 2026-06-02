# SFU-13: Starter service catalogs by specialty (system templates)

## 2026-03-29 — Curated “by specialty” packs the practice can apply

---

## 📋 Task Overview

**Problem:** New practices (or those clearing the catalog) must **manually** recreate common service lines, **per-channel list prices**, and **per-modality follow-up rules**. Specialty choice (Practice Info) does not yet unlock any suggested catalog.

**Goal:** For **each specialty** the product supports in the **Practice Info dropdown** (see `frontend/lib/medical-specialties.ts`, region `IN` today), provide **at least one** **system-owned** starter template: a valid **`service_offerings_json`**-compatible catalog (same shape as live catalog per **SFU-01** / **SFU-12**). The user **opts in** via **Apply starter template** — never auto-overwrite without confirmation.

**Out of scope (this task):** Persisting **user-named** template libraries — that is **SFU-14**. Optional cross-link: suggest a starter when Practice Info specialty changes (nice-to-have, not required).

**Estimated Time:** 3–6 days (content + validation hooks + Services catalog UI + tests)  
**Status:** 🟡 **In progress (v1 shipped: 8 starters + modal + suggest banner)** — expand specialty coverage / tests as needed

**Change Type:**

- [x] **New** — bundled starter data (repo), UI on Services catalog
- [ ] **Optional** — backend field only if templates move server-side later; **v1 ships templates in frontend** as static data + Zod parse

**Dependencies:** **SFU-01** (catalog schema), **SFU-06** (Services catalog UI / editor), **SFU-12** (per-modality follow-up shape in catalog + editor).  
**Related:** **SFU-14** (user templates); Practice Info specialty list; `e-ref-medical-specialties-practice-info.md`.

**Reference (code anchors):**

- `backend/src/utils/service-catalog-schema.ts` — canonical `ServiceOfferingV1` / catalog array
- `frontend/lib/service-catalog-drafts.ts` — drafts ↔ catalog
- `frontend/components/practice-setup/ServiceCatalogEditor.tsx` — editor state
- Services catalog page under `frontend/app/dashboard/settings/practice-setup/…`

---

## Design summary

| Concept | Role |
|--------|------|
| **Starter template** | Frozen JSON array of offerings **validated** with the same parser as live `service_offerings_json` (or FE mirror Zod). |
| **Specialty key** | String **matching** a `MEDICAL_SPECIALTIES` label (e.g. `"General Medicine"`) so UI can group/filter consistently with Practice Info. |
| **Variants (optional)** | Multiple starters per specialty (e.g. “Basic”, “With procedures”) — use `id` + `title` metadata; **v1 may ship one variant per specialty** and expand later. |
| **Apply** | Loads template into editor state → user reviews → **Save** persists `service_offerings_json` as today. |
| **Non-destructive default** | If catalog **non-empty**, show confirm: **Replace entire catalog** vs **Cancel**; **Merge** is optional follow-up (define conflict rule: `service_key` / `id`). |

**Content philosophy (India-first):** Use **placeholder** or **round-number** list prices in main currency; document that practices **must** adjust. Include **realistic** service **labels** (e.g. “Follow-up consult”, “New patient visit”) per specialty — clinical accuracy is product/legal review, not only engineering.

---

## ✅ Task breakdown

### 1. Data layout & validation

- [x] 1.1 Add `frontend/lib/service-catalog-starter-templates/` — `data.ts`, `registry.ts`, `types.ts`, `index.ts`.
- [x] 1.2 **Build-time:** `registry.ts` runs `safeParseServiceCatalogV1` for each template; invalid data **throws** at module load (Next build fails).
- [x] 1.3 **v1 content:** 8 specialties documented in [e-ref-service-starter-templates.md](./e-ref-service-starter-templates.md). Remaining `MEDICAL_SPECIALTIES` → future packs or “expand coverage” follow-up.

### 2. Services catalog UI

- [x] 2.1 **Entry point:** “**Apply starter template**” above catalog editor.
- [x] 2.2 **Picker:** modal with keyword filter (specialty, title, description).
- [x] 2.3 **Apply flow:** `window.confirm` when `services.length > 0`; then `catalogToServiceDrafts` + `setServices` (marks dirty until Save).
- [x] 2.4 **Accessibility:** `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape closes, focus moves to filter on open.

### 3. Product & docs

- [x] 3.1 [e-ref-service-starter-templates.md](./e-ref-service-starter-templates.md)
- [x] 3.2 Suggest line when `settings.specialty` **exactly matches** a template’s `specialtyLabel`.

### 4. Tests

- [ ] 4.1 Dedicated unit test runner (optional): duplicate validation or fixture snapshot — **today:** build-time parse in `registry.ts`.
- [ ] 4.2 E2E (optional): apply starter → Save → reload → offerings visible.

---

## Acceptance criteria

1. At least **N** agreed starters ship (product picks N), all **schema-valid**.
2. User can **apply** a starter from Services catalog without touching API shape beyond existing PATCH `service_offerings_json`.
3. **Replace** confirmation prevents silent wipe of existing catalog.
4. No automatic apply on specialty change unless explicitly built and approved.

---

## Risks / notes

- **Duplicate specialty strings** between regions later — starter keys should use the **same** string as Practice Info stored `specialty`.
- **Schema drift** — when SFU-11/12 evolve, regenerate or validate all starters in CI.

---

**Last updated:** 2026-03-29
