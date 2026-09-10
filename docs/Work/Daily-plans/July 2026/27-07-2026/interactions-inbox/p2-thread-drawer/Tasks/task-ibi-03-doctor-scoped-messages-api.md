# Task ibi-03: Doctor-scoped `GET …/interactions/:id/messages` (IDOR-safe)

> **Links:** batch [`../plan-p2-interactions-inbox-thread-drawer-batch.md`](../plan-p2-interactions-inbox-thread-drawer-batch.md) · exec [`./EXECUTION-ORDER-p2-interactions-inbox-thread-drawer.md`](./EXECUTION-ORDER-p2-interactions-inbox-thread-drawer.md)

---

## 📋 Task Overview

Expose a doctor-authenticated messages read endpoint that **verifies conversation ownership** before returning PHI message content. Do **not** call the worker helper `getConversationMessages` without a doctor guard.

**Program / Phase:** interactions-inbox · p2 · Wave 1  
**Estimated Time:** ~3–5 hours  
**Status:** ✅ DONE (2026-07-27)  
**Change Type:** New feature (PHI read API)  
**Model:** **Opus** (agent-contract: PHI + authz)  
**Depends on:** p1 closed; existing RLS on messages/conversations (defense-in-depth)

---

## ✅ Task Breakdown

### 1. Service
- [x] 1.1 Add `getConversationMessagesForDoctor(doctorId, conversationId, correlationId)` (name TBD) that:
  - Loads conversation with `.eq('id', conversationId).eq('doctor_id', doctorId)` via admin client.
  - Returns not-found if missing / wrong doctor.
  - Then loads messages ordered by `created_at` ascending.
- [x] 1.2 Do **not** change worker callers of bare `getConversationMessages` unless necessary.

### 2. Controller + route
- [x] 2.1 `authenticateToken` → `asyncHandler` → Zod validate `:id` (uuid).
- [x] 2.2 Mount `GET /api/v1/interactions/:id/messages` (create `interactions` route file if needed).
- [x] 2.3 Controllers orchestrate only — no DB in controller; throw typed `AppError`s.
- [x] 2.4 Never log message content / PII.

### 3. Frontend API stub (thin)
- [x] 3.1 Add typed `getInteractionMessages(token, id)` in `frontend/lib/api.ts` (or leave for ibi-04 if you prefer one FE PR — prefer land stub here so drawer has a contract).

### 4. Tests
- [x] 4.1 Unit: own conversation → messages returned.
- [x] 4.2 Unit: other doctor's conversation id → 404/403, empty body (no content leak).
- [x] 4.3 Zod validation for bad id.

---

## 📁 Files

```
CREATE: backend/src/routes/api/v1/interactions.ts (or extend if exists)
UPDATE: backend/src/routes/api/v1/index.ts
CREATE: backend/src/controllers/interaction-controller.ts (or conversation-controller)
UPDATE: backend/src/services/message-service.ts and/or conversation-service.ts
UPDATE: backend/src/utils/validation.ts (Zod)
CREATE: backend/tests/unit/… authz + handler tests
UPDATE (optional): frontend/lib/api.ts
DO NOT TOUCH: webhook workers' trust-the-caller path without care; RLS migrations unless truly required
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- No send / reply endpoint.
- No list endpoint yet (`ibi-06`).
- No try-catch in controllers; use `asyncHandler`.
- Never read `process.env` — use `config/env.ts`.
- **STOP and escalate** if you need a new migration or RLS change beyond existing policies.

---

## ✅ Acceptance Criteria

- [x] Own conversation messages readable by authenticated doctor.
- [x] Cross-doctor id → no PHI leak.
- [x] Pattern matches booking-review controller (asyncHandler + Zod + service + admin client + explicit doctor_id).
- [x] Tests green.

---

**Created:** 2026-07-27.  
**Closed:** 2026-07-27.
