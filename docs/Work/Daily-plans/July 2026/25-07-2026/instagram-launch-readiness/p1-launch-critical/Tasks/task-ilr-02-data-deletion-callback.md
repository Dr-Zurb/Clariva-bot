# Task ilr-02: Real Meta data-deletion callback + worker

> **Links:** batch [`../plan-p1-instagram-launch-critical-batch.md`](../plan-p1-instagram-launch-critical-batch.md) · exec [`./EXECUTION-ORDER-p1-instagram-launch-critical.md`](./EXECUTION-ORDER-p1-instagram-launch-critical.md)

---

## 🛑 Opus — PHI deletion / retention

Touches patient/conversation/comment data deletion. Run on **Opus**. Confirm OQ-1 (identity mapping) before coding. Follow COMPLIANCE + agent-contract (no `process.env` direct).

---

## 📋 Task Overview

Replace the ack-only Meta data-deletion callback with a **queued job** that actually deletes or anonymizes the correct IG-scoped records, tracks progress by `confirmation_code`, and serves a real status page.

**Program / Phase:** instagram-launch-readiness · p1 · Wave 2  
**Estimated Time:** ~4–6 hours  
**Status:** ✅ DONE (2026-07-25) · **Model: Opus**  
**Change Type:** Update existing + new service + migration  
**Depends on:** OQ-1 answered (or default accepted)

**Current State:**
- ✅ `POST /data-deletion-callback` verifies signed_request and returns `{ url, confirmation_code }` — `backend/src/routes/data-deletion.ts`
- ❌ TODO at ~L77–78: no deletion job
- ❌ `process.env.FRONTEND_URL` direct read at ~L21
- ✅ Unrelated: patient self-serve deletion worker exists (`account-deletion-worker`) — do **not** conflate

**Scope Guard:**
- Implement Meta callback path only.
- **DO NOT** redesign patient self-serve account deletion.
- Prefer anonymize vs hard-delete where clinical/audit retention requires — state choice in code header.
- No PHI in logs (log opaque ids / confirmation codes only).

---

## ✅ Task Breakdown

### 1. Config + status tracking
- [x] 1.1 Added `FRONTEND_URL` to `config/env.ts`; removed both `process.env` reads from `data-deletion.ts` (now `env.FRONTEND_URL` / `env.INSTAGRAM_FRONTEND_REDIRECT_URI`).
- [x] 1.2 Persist deletion requests — **Migration `186_meta_data_deletion.sql`** (surfaced + approved on Opus): `meta_data_deletion_requests` (confirmation_code PK, meta_user_id, status, matched_doctor_id, detail, timestamps) + `doctor_instagram.facebook_user_id`.

### 2. Identity mapping (OQ-1)
- [x] 2.1 Mapping **implemented + documented** (service + migration headers): callback `user_id` = the Facebook app-scoped id of the **doctor** who ran Facebook-Login connect. Captured at connect (`exchangeCodeForShortLivedToken` already fetched it; was discarded) and stored on `doctor_instagram.facebook_user_id`; reverse-mapped on callback.
- [x] 2.2 Deletes scoped to the **doctor path**: disconnect (`delete doctor_instagram`), which removes the Meta-derived data (page token, page/user ids, username). Patient IG PHI intentionally out of scope — patients never authorize the app, so this callback does not fire for them (Scope Guard honored).

### 3. Worker
- [x] 3.1 Runs **inline** in a service (`meta-data-deletion-service.ts`), not BullMQ: the work is a single-row disconnect, so inline keeps Meta's response prompt and re-delivery naturally idempotent. Documented in the service header; upgrade to async if patient-IG scope is ever added.
- [x] 3.2 Deletion is idempotent (2nd delivery finds nothing → `no_match`); status recorded (`received`/`completed`/`no_match`/`failed`). Service NEVER throws — Meta always gets `{ url, confirmation_code }`.
- [x] 3.3 Real status endpoint added: `GET /data-deletion-callback/status?code=...` → `{ code, status }` (unknown codes return `unknown`, no existence leak).

### 4. Tests + verify
- [x] 4.1 Unit tests: signed_request parse + signature reject, match/no-match/failed processing, idempotent status, status lookup — `tests/unit/services/meta-data-deletion-service.test.ts` + `tests/unit/routes/data-deletion.test.ts` (14 tests).
- [x] 4.2 `npm run type-check` clean; `npm run lint` introduces **0** new errors (verified against stashed baseline); targeted tests green (23/23 incl. IG connect regression).

---

## 📁 Files to Create/Update

```
UPDATE: backend/src/routes/data-deletion.ts
UPDATE: backend/src/config/env.ts
CREATE: backend/src/workers/meta-data-deletion-worker.ts (or equivalent)
CREATE: backend/src/services/meta-data-deletion-service.ts (optional)
CREATE: backend/tests/unit/... (callback + worker)
MIGRATION?: only if status table needed — confirm with human first
DO NOT TOUCH: Instagram DM funnel; WhatsApp stubs
```

---

## 🧠 Design Constraints

- Never log PII/PHI or raw signed payloads.
- Controllers/routes: no business DB logic beyond enqueue — service/worker owns deletion.
- Typed `AppError` where applicable; no raw `Error` throws in services per STANDARDS.

---

## ✅ Acceptance Criteria

- [x] Callback still returns Meta-required shape (`{ url, confirmation_code }`), even on bad signature / internal failure.
- [x] Deletion runs and updates status; re-delivery is idempotent.
- [x] No `process.env` direct reads in this path (uses `config/env`).
- [x] Tests green; deletion scope + identity mapping documented in service + migration headers.

---

## 📦 Files changed

```
CREATE: backend/migrations/186_meta_data_deletion.sql        (additive: +col, +table, RLS service-role-only)
CREATE: backend/src/services/meta-data-deletion-service.ts   (map + disconnect + status; never throws)
UPDATE: backend/src/routes/data-deletion.ts                  (env, call service, GET /status)
UPDATE: backend/src/config/env.ts                            (+FRONTEND_URL)
UPDATE: backend/src/types/database.ts                        (+facebook_user_id, +MetaDataDeletionRequest)
UPDATE: backend/src/services/instagram-connect-service.ts    (persist facebook_user_id)
UPDATE: backend/src/controllers/instagram-connect-controller.ts (capture facebook_user_id at connect)
CREATE: backend/tests/unit/services/meta-data-deletion-service.test.ts
CREATE: backend/tests/unit/routes/data-deletion.test.ts
```

## ⚠️ Deploy note

- Apply migration `186_meta_data_deletion.sql` before/with this deploy.
- `facebook_user_id` is NULL for connections made before this ships → their deletion callbacks record `no_match` until the doctor reconnects. Acceptable + safe; note if a legacy doctor requests deletion, disconnect them manually.

---

**Created:** 2026-07-25. **Completed:** 2026-07-25 (Opus).
