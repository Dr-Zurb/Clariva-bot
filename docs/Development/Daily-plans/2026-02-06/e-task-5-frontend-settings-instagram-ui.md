# Task 5: Frontend Settings Instagram UI
## 2026-02-06 - Must-have 1: Connect Instagram

---

## 📋 Task Overview

Add a Settings (or Dashboard) section for Instagram: show connection status (“Connected as @handle” or “Not connected – Connect Instagram”); “Connect Instagram” button that triggers backend OAuth flow (redirect); “Disconnect” with warning (modal or confirm dialog) that calls disconnect API. All actions require authenticated doctor.

**Estimated Time:** 1.5–2 hours  
**Status:** ✅ **IMPLEMENTED**  
**Completed:** 2026-02-06

**Change Type:**
- [x] **New feature**
- [ ] **Update existing**

**Current State:**
- ✅ **What exists:** Dashboard layout (`dashboard/layout.tsx`); appointments and patients pages; Supabase auth; backend connect (GET `/api/v1/settings/instagram/connect`), callback, and disconnect (DELETE `/api/v1/settings/instagram/disconnect`) from e-task-3 and e-task-4; routes live under `api/v1/settings/instagram.ts`.
- ❌ **What's missing:** Backend GET connection status for current doctor; frontend settings route(s); Instagram UI component (status + Connect/Disconnect); API client helpers for status, connect redirect, and disconnect.
- ⚠️ **Notes:** Backend must expose GET connection status (e.g. GET `/api/v1/settings/instagram` or `/api/v1/settings/instagram/status`) returning `{ connected, username? }` for current doctor. After OAuth callback, user is redirected to frontend with `?connected=1` or `?connected=0&error=...`; settings page may read query params to show success/error feedback.

**Scope Guard:** Expected files touched: ≤ 6

**Reference Documentation:**
- [FRONTEND_ARCHITECTURE.md](../../Reference/FRONTEND_ARCHITECTURE.md) - App structure, auth
- [FRONTEND_STANDARDS.md](../../Reference/FRONTEND_STANDARDS.md) - TypeScript, API, a11y
- [FRONTEND_RECIPES.md](../../Reference/FRONTEND_RECIPES.md) - API client, auth guard
- [FRONTEND_COMPLIANCE.md](../../Reference/FRONTEND_COMPLIANCE.md) - No PII in logs/URLs; secure auth
- [DEFINITION_OF_DONE_FRONTEND.md](../../Reference/DEFINITION_OF_DONE_FRONTEND.md) - Completion checklist
- [CONTRACTS.md](../../Reference/CONTRACTS.md) - API response shapes (if status endpoint is documented)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Backend: connection status endpoint
- [x] 1.1 Add GET endpoint under existing settings/instagram router (e.g. GET `/api/v1/settings/instagram` or `/api/v1/settings/instagram/status`): auth required; query doctor_instagram for req.user.id; return payload with connected (boolean) and optional username; no token in response (COMPLIANCE).
- [x] 1.2 If no row for doctor, return connected: false; if row exists, return connected: true and username when available.

### 2. Frontend: settings entry
- [x] 2.1 Add route (e.g. `dashboard/settings/page.tsx` or `dashboard/settings/instagram/page.tsx`) so user can navigate to Settings → Instagram (or single settings page with Instagram section)
- [x] 2.2 Use auth guard so only authenticated users see settings; redirect to login if not authenticated

### 3. Frontend: Instagram component
- [x] 3.1 Create component for Instagram settings: on mount, fetch connection status from backend (GET status endpoint).
- [x] 3.2 Display: if connected, show “Connected as @{username}” or “Connected” with Disconnect button; if not connected, show “Not connected” and “Connect Instagram” button.
- [x] 3.3 “Connect Instagram”: redirect user to backend connect URL (GET `/api/v1/settings/instagram/connect`) with auth (e.g. Bearer token) so backend can redirect to Meta; after OAuth, user returns to frontend with query params (e.g. `?connected=1`); optionally show success/error from params.
- [x] 3.4 “Disconnect”: show confirmation dialog (e.g. “Are you sure? Incoming DMs will no longer be handled.”); on confirm, call DELETE disconnect API; on success, refetch status and update UI.
- [x] 3.5 Loading and error states per FRONTEND_STANDARDS; no PII or token in console logs (FRONTEND_COMPLIANCE).

### 4. API client
- [x] 4.1 Add typed helpers in frontend API layer: fetch connection status; obtain or navigate to connect URL (backend redirects to Meta); call disconnect (DELETE). Use auth session (e.g. Supabase session / Bearer token) for all requests per FRONTEND_RECIPES.
- [x] 4.2 Handle 401 (redirect to login or show auth required) and 4xx/5xx with user-friendly message; no token or PII in logs.

### 5. Verification
- [ ] 5.1 Manual: login → settings → see status; connect (OAuth flow); return from Meta to settings with success; disconnect with confirm; UI updates after each action.
- [x] 5.2 Type-check and lint; a11y basics (labels, focus, contrast) per DEFINITION_OF_DONE_FRONTEND; no PII in client storage or URLs beyond what is necessary.

---

## 📁 Files to Create/Update

```
backend/src/
├── controllers/
│   └── instagram-connect-controller.ts (UPDATE - add status handler)
├── routes/
│   └── api/v1/
│       └── settings/
│           └── instagram.ts            (UPDATE - add GET status route)
└── services/
    └── instagram-connect-service.ts   (UPDATE - add getConnectionStatus for current doctor)

frontend/
├── app/
│   └── dashboard/
│       └── settings/
│           ├── page.tsx               (NEW - settings layout or Instagram section)
│           └── instagram/
│               └── page.tsx            (optional - if dedicated Instagram page)
├── components/
│   └── settings/
│       └── InstagramConnect.tsx       (NEW - or equivalent name)
└── lib/
    └── api.ts                          (UPDATE - add Instagram status, connect URL, disconnect)
```

**Existing Code Status:**
- ✅ Dashboard layout and auth - EXISTS
- ✅ Backend connect, callback, disconnect - EXISTS (e-task-3, e-task-4; routes at `api/v1/settings/instagram.ts`)
- ❌ Backend GET status endpoint - MISSING (add in this task)
- ❌ Frontend settings route(s) and Instagram component - MISSING
- ❌ Frontend API helpers for Instagram - MISSING

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- No token or sensitive data in frontend state or URLs; connect is redirect to backend which then redirects to Meta (FRONTEND_COMPLIANCE).
- Use existing auth pattern (Supabase session / Bearer token) for all API calls; protected routes redirect when unauthenticated (FRONTEND_ARCHITECTURE, FRONTEND_RECIPES).
- Disconnect is DELETE (backend contract from e-task-4); status and connect URL follow backend paths under `/api/v1/settings/instagram`.
- Accessible buttons and labels; loading and error states for every fetch (FRONTEND_STANDARDS, DEFINITION_OF_DONE_FRONTEND).

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – read connection status from backend) → [x] **RLS verified?** (Y – backend filters by req.user.id; no PHI in status response)
- [x] **Any PHI in logs?** (MUST be No; no token or PII in frontend logs per FRONTEND_COMPLIANCE)
- [x] **External API or AI call?** (N – frontend calls own backend only; OAuth redirect is user navigation)
- [x] **Retention / deletion impact?** (N)

**Rationale:** Status is non-PHI; backend enforces auth and scoping; frontend must not log tokens or PII.

---

## ✅ Acceptance & Verification Criteria

Task is complete **only when** (see also [DEFINITION_OF_DONE_FRONTEND.md](../../Reference/DEFINITION_OF_DONE_FRONTEND.md)):

- [x] Doctor sees “Connected as @handle” or “Not connected” and can Connect or Disconnect.
- [x] Connect redirects to backend then Meta; after authorizing, user returns to settings (e.g. with `?connected=1`); success or error reflected in UI.
- [x] Disconnect requires confirmation and calls DELETE API; UI updates after success (refetch status).
- [x] GET status returns correct state for authenticated doctor only; 401 when unauthenticated.
- [x] Type-check and lint pass; a11y and FRONTEND_COMPLIANCE satisfied (no PII/token in logs or URLs).

---

## 🔗 Related Tasks

- [e-task-3: Connect flow (OAuth)](./e-task-3-instagram-connect-flow-oauth.md) — backend connect/callback; frontend redirects to connect URL and receives callback redirect with query params
- [e-task-4: Disconnect endpoint](./e-task-4-instagram-disconnect-endpoint.md) — backend DELETE disconnect; frontend calls it with confirmation

---

## 🐛 Issues Encountered & Resolved

_(Record any issues and solutions during implementation.)_

---

## 📝 Notes

- Backend: GET `/api/v1/settings/instagram/status` returns `{ connected, username }`. Frontend: Settings at `/dashboard/settings` with Instagram section; Connect uses fetch with redirect: 'manual' then window.location to backend then Meta; callback query params `?connected=1` / `?connected=0&error=...` shown in UI; Disconnect uses window.confirm and DELETE.

---

**Last Updated:** 2026-02-06  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
