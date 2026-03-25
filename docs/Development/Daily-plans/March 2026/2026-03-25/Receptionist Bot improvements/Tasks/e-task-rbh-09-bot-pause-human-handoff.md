# Task RBH-09: Bot pause & human handoff (doctor controls)

## 2026-03-28 — Receptionist bot hardening

---

## 📋 Task Overview

Deliver **product-level controls** so doctors can **pause** automated DM responses and optionally show a **human handoff** path when the AI is wrong or the patient asks for a human. Integrates with [COMPLETE_FEATURE_SET.md](../../../Business%20files/COMPLETE_FEATURE_SET.md) §1 (bot pause / handoff). Webhook worker must respect pause without breaking idempotency or queue processing.

**Estimated Time:** 14–24 hours (product + backend + dashboard)  
**Status:** ✅ **DONE**  
**Completed:** 2026-03-28  

**Change Type:**
- [x] **Update existing** — New settings or flags + worker gating — follow [CODE_CHANGE_RULES.md](../../CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **Migration `033_instagram_receptionist_pause.sql`:** `instagram_receptionist_paused`, `instagram_receptionist_pause_message`.
- ✅ **DM worker:** After `revoke_consent`, if paused → single handoff DM + `step: responded` (idempotent per webhook event).
- ✅ **Comment worker:** High-intent DM + public reply skipped when paused; `createCommentLead` + email to doctor unchanged; metric `automationSkipped: receptionist_paused`.
- ✅ **API:** PATCH validation + `getDoctorSettings`; audit `doctor_settings_instagram_receptionist_pause` when toggle changes.
- ✅ **Dashboard:** **Settings → Practice setup → Bot messages** — checkbox + optional custom message (≤500 chars).
- ✅ **Docs:** `DB_SCHEMA.md`, `DOCTOR_SETTINGS_PHASES.md`, `RECEPTIONIST_BOT_ENGINEERING.md`.

**Scope Guard:**
- Expected files touched: ≤ 10 across API, worker, frontend, migrations if persisted in DB.
- **Scope Guard expansion** allowed for this task — multiple bounded PRs (settings → worker → UI).

**Reference Documentation:**
- [COMPLETE_FEATURE_SET.md](../../../Business%20files/COMPLETE_FEATURE_SET.md)
- [DOCTOR_SETTINGS_PHASES.md](../../../Reference/DOCTOR_SETTINGS_PHASES.md)
- [RECEPTIONIST_BOT_ENGINEERING.md](../../../Development/Daily-plans/March%202026/2026-03-25/Receptionist%20Bot%20improvements/RECEPTIONIST_BOT_ENGINEERING.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Product rules
- [x] 1.1 **Paused DM:** Webhooks still enqueue; patient message stored; classifyIntent runs; one handoff DM per event (Meta retry deduped by idempotency). `revoke_consent` still processed first.
- [x] 1.2 **Paused comments:** No proactive DM or public auto-reply; lead row + doctor email notification preserved.

### 2. Data model & API
- [x] 2.1 Doctor settings columns with defaults (`automation on`).
- [x] 2.2 GET/PATCH via existing `/api/v1/settings/doctor`; Zod validation (strict PATCH).

### 3. Worker behavior
- [x] 3.1 Early branch in `instagram-dm-webhook-handler` after persistence of inbound message.
- [x] 3.2 Duplicate notices prevented by existing webhook idempotency (same `event_id` not re-queued).

### 4. Dashboard & audit
- [x] 4.1 Settings UI on **Bot Messages** page + `updated_at` from API row.
- [x] 4.2 `logAuditEvent` when `instagram_receptionist_paused` included in PATCH.

### 5. Verification
- [x] 5.1 `webhook-worker-characterization.test.ts` — paused doctor, no `generateResponse`.
- [x] 5.2 Logs: no PHI in pause-specific entries beyond existing patterns.

---

## 📁 Files to Create/Update

```
backend/migrations/033_instagram_receptionist_pause.sql
backend/src/types/doctor-settings.ts
backend/src/services/doctor-settings-service.ts
backend/src/utils/validation.ts
backend/src/workers/instagram-dm-webhook-handler.ts
backend/src/workers/instagram-comment-webhook-handler.ts
backend/src/services/webhook-metrics.ts
backend/tests/unit/utils/patch-doctor-settings-validation.test.ts
backend/tests/unit/workers/webhook-worker-characterization.test.ts
frontend/types/doctor-settings.ts
frontend/app/dashboard/settings/practice-setup/bot-messages/page.tsx
docs/Reference/DB_SCHEMA.md
docs/Reference/DOCTOR_SETTINGS_PHASES.md
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Paused mode must not block legally compliant data collection without legal review.
- Handoff copy must not promise immediate human response unless operations can deliver.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** Y — settings
- [x] **RLS verified?** Doctor-only settings per existing model
- [x] **Any PHI in logs?** N
- [x] **External API?** Instagram send for handoff DM only

---

## ✅ Acceptance & Verification Criteria

- [x] Doctor can pause/resume from dashboard; DM behavior matches spec.
- [x] Schema + settings docs updated; tests added.

---

## 🔗 Related Tasks

- [RBH-10](./e-task-rbh-10-dashboard-instagram-health.md)
- [RBH-01](./e-task-rbh-01-webhook-observability.md)

---

**Last Updated:** 2026-03-28  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../TASK_MANAGEMENT_GUIDE.md)
