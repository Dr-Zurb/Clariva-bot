# Task 4: Instagram disconnect endpoint
## 2026-02-06 - Must-have 1: Connect Instagram

---

## 📋 Task Overview

Add an API endpoint for the authenticated doctor to disconnect their Instagram link: clear stored token and page id for that doctor. Caller must be authenticated; confirmation is enforced by frontend (e.g. “Disconnect” with warning modal); backend only verifies auth and performs delete/clear.

**Estimated Time:** 0.5–1 hour  
**Status:** ✅ **IMPLEMENTED**  
**Completed:** 2026-02-06

**Change Type:**
- [x] **New feature**
- [ ] **Update existing**

**Current State:**
- ✅ **What exists:** doctor_instagram table (e-task-1); auth middleware; instagram-connect-service (e-task-3) with saveDoctorInstagram, getDoctorIdByPageId; instagram-connect-controller (e-task-3) with connect and callback handlers; routes at `api/v1/settings/instagram.ts` (connect, callback).
- ❌ **What's missing:** Service function to delete/clear row for doctor; disconnect controller handler and route; audit log for disconnect.

**Scope Guard:** Expected files touched: ≤ 4

**Reference Documentation:**
- [RECIPES.md](../../Reference/engineering/development/RECIPES.md) - Add route, controller, service
- [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) - asyncHandler, successResponse
- [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) - Controller → service; no Express in services
- [API_DESIGN.md](../../Reference/engineering/architecture/API_DESIGN.md) - HTTP method (DELETE preferred for remove), response format
- [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) - Audit logging; no token in metadata
- [TESTING.md](../../Reference/engineering/development/TESTING.md) - Unit test patterns
- [DEFINITION_OF_DONE.md](../../Reference/engineering/development/DEFINITION_OF_DONE.md) - Completion checklist

---

## ✅ Task Breakdown (Hierarchical)

### 1. Service layer
- [x] 1.1 Add disconnect function in instagram-connect-service: delete row from doctor_instagram where doctor_id equals the given doctor; use admin client; only that doctor’s row is affected (no Express in service per ARCHITECTURE.md).
- [x] 1.2 If no row exists, treat as success (idempotent).
- [x] 1.3 Audit log: action e.g. instagram_disconnect, resource_type doctor_instagram, status success; no token or PHI in metadata (COMPLIANCE.md).

### 2. Controller and route
- [x] 2.1 Add disconnect handler in instagram-connect-controller: require auth; get doctorId from req.user.id; call service disconnect; use asyncHandler (STANDARDS.md).
- [x] 2.2 Add route: DELETE preferred per REST (API_DESIGN.md), e.g. DELETE `/api/v1/settings/instagram/disconnect`; mount on existing settings/instagram router; protect with authenticateToken.
- [x] 2.3 Response: 204 No Content or 200 with successResponse({ disconnected: true }, req) per API_DESIGN and STANDARDS.md; no request body required.

### 3. Verification
- [x] 3.1 Unit test: disconnect clears row for given doctor_id; no row is idempotent success (TESTING.md).
- [x] 3.2 Type-check and lint; verify against DEFINITION_OF_DONE where applicable.

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   └── instagram-connect-service.ts     (UPDATE - add disconnect function)
├── controllers/
│   └── instagram-connect-controller.ts (UPDATE - add disconnect handler)
└── routes/
    └── api/v1/
        └── settings/
            └── instagram.ts            (UPDATE - add DELETE disconnect route)
```

**Existing Code Status:**
- ✅ instagram-connect-service.ts - EXISTS (e-task-3; getDoctorIdByPageId, saveDoctorInstagram, OAuth helpers)
- ✅ instagram-connect-controller.ts - EXISTS (e-task-3; connectHandler, callbackHandler)
- ✅ routes/api/v1/settings/instagram.ts - EXISTS (e-task-3; GET connect, GET callback)
- ❌ Disconnect service function, controller handler, and route - MISSING

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Only the authenticated doctor can disconnect their own link (doctorId from req.user); no other user’s row may be affected.
- Controller uses asyncHandler and successResponse or 204 per STANDARDS.md and API_DESIGN.md; service does not import Express (ARCHITECTURE.md).
- No PHI or token in logs or audit metadata; audit with correlationId only (COMPLIANCE.md).

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – doctor_instagram delete) → [x] **RLS verified?** (Y – delete scoped by doctor_id from JWT; admin client used with doctor_id filter)
- [x] **Any PHI in logs?** (MUST be No; no token in audit metadata)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (Y – clearing token; audit log records disconnect event; retention per DATA_RETENTION.md if applicable)

**Rationale:** Delete affects only authenticated doctor’s row; no PHI/token in logs; no external calls; disconnect is a deliberate deletion event for audit.

---

## ✅ Acceptance & Verification Criteria

Task is complete **only when** (see also [DEFINITION_OF_DONE.md](../../Reference/engineering/development/DEFINITION_OF_DONE.md)):

- [x] Authenticated doctor can call disconnect and their Instagram link is removed (row deleted or cleared).
- [x] Unauthenticated request returns 401 (STANDARDS.md, CONTRACTS.md).
- [x] Audit log records disconnect event; no token or PHI in metadata (COMPLIANCE.md).
- [x] Response format and status code follow API_DESIGN and CONTRACTS (204 or 200 with canonical success shape).
- [x] Type-check and lint pass.

---

## 🔗 Related Tasks

- [e-task-3: Instagram connect flow (OAuth)](./e-task-3-instagram-connect-flow-oauth.md) — prerequisite (connect + callback exist; disconnect extends same controller/routes)
- [e-task-5: Frontend Settings Instagram UI](./e-task-5-frontend-settings-instagram-ui.md) — frontend will call disconnect and show confirmation

---

## 🐛 Issues Encountered & Resolved

_(Record any issues and solutions during implementation.)_

---

## 📝 Notes

- Implemented as hard delete (row removed from doctor_instagram). Response: 204 No Content. Audit action: `instagram_disconnect`.

---

**Last Updated:** 2026-02-06  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
