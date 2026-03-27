# SFU-10: Remove Practice Info “consultation types” + Services catalog legacy banner

## 2026-03-28 — Catalog-first UX; keep DB fallback until deprecated

---

## 📋 Task Overview

**Problem:** Practice **Info** still exposes free-text **Consultation types**, and **Services catalog** shows a yellow **“Legacy consultation types (read-only)”** block. Per-service **modalities** in the catalog already define channels (text / voice / video); duplicate fields confuse doctors and risk drift.

**Goal:** Remove both **UI surfaces**. Consultation methods remain defined **only** via the service catalog (modalities per service). **`doctor_settings.consultation_types`** may remain in the **database and API** for now as a **read/write optional legacy fallback** for DM/fees and practices without a catalog—unless a follow-up task explicitly deprecates the column or migrates values into catalog rows.

**Estimated Time:** 0.5–1 day  
**Status:** 🔲 **PENDING**

**Change Type:**
- [x] **Update existing** — dashboard Practice Setup pages, docs; no DB migration required for MVP of this task

**Dependency:** **SFU-01** (catalog on `service_offerings_json`), **SFU-06** (Services catalog + legacy banner).  
**Related:** `consultation-fees.ts`, `ai-service.ts`, Instagram `getDoctorContext` still use `consultation_types` when catalog absent—**do not break** those paths by deleting the column without a replacement plan.

**Reference:** `docs/Reference/PRACTICE_SETUP_UI.md`, SFU-06 §3 legacy banner, `frontend/app/dashboard/settings/practice-setup/practice-info/page.tsx`, `frontend/app/dashboard/settings/practice-setup/services-catalog/page.tsx`

---

## ✅ Task Breakdown

### 1. Practice Info UI
- [ ] 1.1 Remove **Consultation types** input, label, and `consultation_types` from local form state **or** stop PATCHing it (prefer: omit from PATCH when saving Practice Info so existing DB values are untouched unless product wants explicit **Clear legacy**—document choice).
- [ ] 1.2 Update page **subtitle** copy: drop “consultation types” from the line *“Practice name, location, specialty, and consultation types.”*
- [ ] 1.3 Remove any **maxLength** / validation hints that only applied to that field (keep other fields unchanged).

### 2. Services catalog UI
- [ ] 2.1 Remove the **“Legacy consultation types (read-only)”** yellow banner and related state/helpers (e.g. `legacyConsultationTypes` display block).
- [ ] 2.2 If useful, replace with a **single** short inline tip *once* (optional): “Channels and teleconsult prices are set per service below.” — or no banner at all.

### 3. Types & API client (frontend)
- [ ] 3.1 **`frontend/types/doctor-settings.ts`**: keep `consultation_types` on the **type** if the API still returns it (avoid false TS errors); Practice Info page simply does not edit it.
- [ ] 3.2 Confirm **`frontend/lib/api.ts`** / settings helpers do not require `consultation_types` for Practice Info saves.

### 4. Docs
- [ ] 4.1 Update **`docs/Reference/PRACTICE_SETUP_UI.md`** — Practice Info field list: remove consultation_types from the documented form.
- [ ] 4.2 Update **`docs/Development/.../tasks/e-task-sfu-06-...md`** — note legacy banner **removed by SFU-10** (historical “done” item superseded).

### 5. Verification
- [ ] 5.1 Manual: Practice Info save without consultation_types field does not clear unrelated settings.
- [ ]  **5.2** Manual: Services catalog loads; add service + modalities still works.
- [ ] 5.3 **Regression (optional):** Doctor with **only** `consultation_types` set and **empty** catalog—DM fee fallback still works (`consultation-fees.ts`); no UI to edit that string anymore until they add a catalog (acceptable trade-off **or** add one-time migration CTA elsewhere—product call).

---

## 📁 Files (expected)

| Area | Path |
|------|------|
| Practice Info | `frontend/app/dashboard/settings/practice-setup/practice-info/page.tsx` |
| Services catalog | `frontend/app/dashboard/settings/practice-setup/services-catalog/page.tsx` |
| Docs | `docs/Reference/PRACTICE_SETUP_UI.md` |
| Task history | `.../tasks/e-task-sfu-06-dashboard-practice-setup-service-matrix-ui.md` |
| Tasks index | `.../tasks/README.md` |

---

## 🔮 Follow-ups (out of scope unless prioritized)

- **DB / API:** Stop accepting `consultation_types` on PATCH, or auto-migrate string → default catalog service.
- **Bot / AI:** Always derive modality list from catalog summary; shrink reliance on `consultation_types` field.
- **Analytics:** Track practices still with non-null `consultation_types` and empty catalog.

---

**Last Updated:** 2026-03-28
