# Task RBH-10: Dashboard — Instagram connection health

## 2026-03-28 — Receptionist bot hardening

---

## 📋 Task Overview

Surface **Instagram connection health** in the doctor dashboard: token valid vs expired, webhook subscription status (if queryable), last successful message send or last error class, and clear **CTA to reconnect**. Aligns with [COMPLETE_FEATURE_SET.md](../../../Business%20files/COMPLETE_FEATURE_SET.md) §1.

**Estimated Time:** 10–16 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-03-28  

**Change Type:**
- [x] **Update existing** — UI + lightweight health API — follow [CODE_CHANGE_RULES.md](../../CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **Migration `034_doctor_instagram_health.sql`** — cached health fields + `instagram_last_dm_success_at`.
- ✅ **GET `/api/v1/settings/instagram/status`** — returns `connected`, `username`, `health` (Meta `debug_token`, **5-minute TTL** per doctor).
- ✅ **Worker** — `recordInstagramLastDmSuccess` from `webhook-dm-send` after successful send (`doctorId` passed from DM handler).
- ✅ **Integrations UI** — `InstagramConnect.tsx` shows OK / warning / error / unknown + reconnect hints.
- ✅ **Docs** — `docs/setup/instagram-setup.md` (dashboard health), `DB_SCHEMA.md`.

**Scope Guard:**
- Expected files touched: ≤ 8 (expanded slightly for DM timestamp wiring).

**Reference Documentation:**
- [PRACTICE_SETUP_UI.md](../../../Reference/PRACTICE_SETUP_UI.md) (if applicable)
- [EXTERNAL_SERVICES.md](../../../Reference/EXTERNAL_SERVICES.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Define signals
- [x] 1.1 **Feasible:** Meta Graph `debug_token` (app id\|secret); optional error code persisted; last DM success from worker.
- [x] 1.2 **Stale:** Warning if token expires within **7 days** or no DM success recorded for **14 days** (when timestamp exists).

### 2. Backend
- [x] 2.1 Enriched **existing** GET status with `health` object (non-PHI).
- [x] 2.2 Persist last check level + token expiry + optional error code; last DM success on send.

### 3. Frontend
- [x] 3.1 Card states: OK / needs attention / action required / unknown; not connected message.
- [x] 3.2 Inline reconnect instructions + pointer to `docs/setup/instagram-setup.md`.

### 4. Verification
- [x] 4.1 Staging: revoke token → expect **error** after cache window (manual).
- [x] 4.2 **COMPLETE_FEATURE_SET** row updated (Partial).

---

## 📁 Files to Create/Update

```
backend/migrations/034_doctor_instagram_health.sql
backend/src/types/database.ts (DoctorInstagram)
backend/src/services/instagram-connect-service.ts
backend/src/controllers/instagram-connect-controller.ts
backend/src/workers/webhook-dm-send.ts
backend/src/workers/instagram-dm-webhook-handler.ts
backend/tests/unit/services/instagram-connect-service.test.ts
frontend/lib/api.ts
frontend/components/settings/InstagramConnect.tsx
docs/setup/instagram-setup.md
docs/Reference/DB_SCHEMA.md
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Health checks must not spam Meta; cache results with TTL.
- No patient data in health payloads.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** Y — `doctor_instagram` health columns
- [x] **RLS verified?** Same as existing doctor_instagram; service role for worker updates
- [x] **Any PHI in logs?** N
- [x] **External API?** Y — `debug_token` (rate-limited by cache)

---

## ✅ Acceptance & Verification Criteria

- [x] Doctor sees clear status before patients report “bot dead.”
- [x] Docs and feature set updated.

---

## 🔗 Related Tasks

- [RBH-09](./e-task-rbh-09-bot-pause-human-handoff.md)
- [RBH-01](./e-task-rbh-01-webhook-observability.md)

---

**Last Updated:** 2026-03-28  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../TASK_MANAGEMENT_GUIDE.md)
