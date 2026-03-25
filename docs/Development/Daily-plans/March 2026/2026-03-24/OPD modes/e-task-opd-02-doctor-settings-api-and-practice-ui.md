# Task OPD-02: Doctor settings API & practice UI (OPD mode)

## 2026-03-24 — OPD initiative

---

## 📋 Task Overview

Expose **`opd_mode`** (`slot` | `queue`) and **policy fields** (grace window, slot-contract copy flags, optional queue: show ETA range, buffer, staged next) via **GET/PATCH** doctor settings API and **practice setup** UI so doctors can configure OPD before queue features go live.

**Estimated Time:** 6–12 hours  
**Status:** ✅ **DONE** (API already from opd-01; Practice Setup **OPD mode** page added 2026-03-24)

**Change Type:**
- [x] **Update existing** — extends `doctor-settings-service`, routes, validation, frontend settings pages — follow [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ `backend/src/routes/api/v1/settings/doctor.ts` + `settings-controller.ts` + `doctor-settings-service.ts`
- ✅ Frontend `frontend/app/dashboard/settings/practice-setup/*` — booking rules, availability ([DOCTOR_SETTINGS_PHASES.md](../../../../../Reference/DOCTOR_SETTINGS_PHASES.md))
- ❌ No OPD mode picker or policy fields in API/UI
- ⚠️ Validation: `backend/src/utils/validation.ts` — extend Zod for PATCH body

**Scope Guard:** ≤ 12 files; split validation helpers if needed.

**Reference Documentation:**
- [API_DESIGN.md](../../../../../Reference/API_DESIGN.md) · [FRONTEND_STANDARDS.md](../../../../../Reference/FRONTEND_STANDARDS.md)
- [opd-systems-plan.md](./opd-systems-plan.md) §4

---

## ✅ Task Breakdown (Hierarchical)

### 1. Backend — contract

- [x] 1.1 **`opd_mode`**, **`opd_policies`** on `doctor_settings` (snake_case API) — done in **opd-01** / `validation.ts`.
- [x] 1.2 Zod `patchDoctorSettingsSchema` includes `opd_mode`, `opd_policies`.
- [x] 1.3 `GET` returns DB row; service `DEFAULT_SETTINGS` includes `opd_mode: 'slot'` when no row.
- [ ] 1.4 Audit log — unchanged (existing modification log on update).

### 2. Frontend — API client

- [x] 2.1 `getDoctorSettings` / `patchDoctorSettings` already typed via `DoctorSettings` / `PatchDoctorSettingsPayload`.
- [x] 2.2 `frontend/types/doctor-settings.ts` — `opd_mode` / `opd_policies` optional for pre-migration resilience.

### 3. Frontend — UI

- [x] 3.1 New page **`/dashboard/settings/practice-setup/opd-mode`** — radio **slot** vs **queue** + card on Practice Setup landing.
- [x] 3.2 Inline copy per plan; queue notes that full flow is follow-up.
- [x] 3.3 **Advanced:** optional `slot_grace_join_minutes` stored in `opd_policies` JSON.

### 4. Verification

- [ ] 4.1 Manual: change mode, save, refresh (after migration **028** applied).
- [x] 4.2 Default **slot** in DB + `DEFAULT_SETTINGS`.

---

## 📁 Files to Create/Update

```
backend/src/services/doctor-settings-service.ts
backend/src/controllers/settings-controller.ts
backend/src/routes/api/v1/settings/doctor.ts
backend/src/utils/validation.ts
frontend/lib/api.ts
frontend/types/doctor-settings.ts
frontend/app/dashboard/settings/practice-setup/... (new or existing page)
```

---

## 🌍 Global Safety Gate

- [ ] **Data touched?** Y (settings) → RLS unchanged if only `doctor_settings` update path
- [ ] **PHI?** N in settings payload for OPD mode

---

## 🔗 Related Tasks

- Depends on: [e-task-opd-01-domain-model-and-database-migrations.md](./e-task-opd-01-domain-model-and-database-migrations.md)
- Next: [e-task-opd-03-backend-opd-services-and-routing.md](./e-task-opd-03-backend-opd-services-and-routing.md)

---

**Last Updated:** 2026-03-24 (completed)
