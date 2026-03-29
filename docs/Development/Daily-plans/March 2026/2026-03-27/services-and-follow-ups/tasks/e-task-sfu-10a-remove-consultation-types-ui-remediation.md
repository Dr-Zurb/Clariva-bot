# SFU-10a: Remove consultation types UI (remediation)

## 2026-03-29 — Close residual SFU-10 surfaces

---

## 📋 Context

**Parent:** [e-task-sfu-10-remove-practice-consultation-types-ui.md](./e-task-sfu-10-remove-practice-consultation-types-ui.md)  
**Problem:** After SFU-10 was specified, the dashboard still rendered:

1. **Practice Info** — “Consultation types” field and subtitle mentioning it  
2. **Services catalog** — yellow **“Legacy consultation types (read-only)”** banner (and landing card copy still referenced consultation types)

Catalog-first UX: modalities and teleconsult prices live **only** under Services catalog.  
**`doctor_settings.consultation_types`** remains in DB/API for bot/DM fallback when catalog is absent; Practice Info **does not PATCH** that column anymore (preserves existing values).

---

## ✅ Implementation checklist

- [x] **Practice Info** (`practice-info/page.tsx`) — remove field, remove from form state + payload, update subtitle  
- [x] **Practice Setup landing** (`practice-setup/page.tsx`) — update Practice Info card description  
- [x] **Services catalog** — remove `legacyConsultationTypes` wiring (`services-catalog/page.tsx`)  
- [x] **ServiceCatalogEditor** — remove `legacyConsultationTypes` prop and yellow banner block  
- [x] **Docs** — `PRACTICE_SETUP_UI.md` tables; cross-link from SFU-10 optional  

---

## 📁 Files touched

| Area | Path |
|------|------|
| Practice Info | `frontend/app/dashboard/settings/practice-setup/practice-info/page.tsx` |
| Landing cards | `frontend/app/dashboard/settings/practice-setup/page.tsx` |
| Services catalog | `frontend/app/dashboard/settings/practice-setup/services-catalog/page.tsx` |
| Editor | `frontend/components/practice-setup/ServiceCatalogEditor.tsx` |
| Reference | `docs/Reference/PRACTICE_SETUP_UI.md` |

---

## 🔍 Verification

- [ ] Practice Info Save does **not** send `consultation_types`; other fields still persist  
- [ ] Services catalog: no legacy banner; add/save services unchanged  
- [ ] Regression: doctor with only `consultation_types` + empty catalog — DM fee fallback still uses backend field (`consultation-fees.ts`); no dashboard editor for that string  

---

**Status:** ✅ **DONE** (2026-03-29)  
**Last updated:** 2026-03-29
