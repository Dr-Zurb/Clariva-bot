# Clariva Care - MVP Completion Planning
## Must-Have 1: Connect Instagram | Must-Have 2: Doctor Setup

---

## Overview

**Goal:** Complete the two must-haves required for a sellable MVP: (1) per-doctor Instagram connection so multiple doctors can use the bot, and (2) doctor setup so doctors can configure profile, availability, appointment methods, fees, and services.

**Scope (this plan only):**
- **Must-have 1:** In-app “Connect Instagram” — doctors link their Instagram (or Facebook Page) to their Clariva account; webhook resolves to the correct doctor; no single `DEFAULT_DOCTOR_ID`.
- **Must-have 2:** Doctor setup — profile, availability, appointment methods & fees, services; single Setup/Settings area (or wizard); booking and payment use these settings.

**Status:** 🟡 Not Started

**Detailed implementation tasks:** Execution tasks are in [docs/Work/Daily-plans/2026-02-06/](../Daily-plans/2026-02-06/): e-task-1–6 (Connect Instagram), e-task-7–12 (Doctor Setup). Follow [TASK_TEMPLATE](../../task-management/TASK_TEMPLATE.md) and [TASK_MANAGEMENT_GUIDE](../../task-management/TASK_MANAGEMENT_GUIDE.md) when implementing.

**Documentation Reference:** All development must follow reference documentation in [`docs/Reference/`](../../Reference/):
- **[STANDARDS.md](../../Reference/engineering/development/STANDARDS.md)** - Rules and requirements (MUST/SHOULD)
- **[ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md)** - Project structure and boundaries
- **[RECIPES.md](../../Reference/engineering/development/RECIPES.md)** - Copy-pastable code patterns
- **[COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md)** - Compliance, governance, and security requirements

**Key Standards:** Controller Pattern, asyncHandler, AppError, Zod validation, TypeScript types, RLS, secure token storage, no PII in logs.

---

## 📋 Documentation Reference Integration

**All development must follow our reference documentation.**

### 📚 Documentation Files (in `docs/Reference/`)

1. **[STANDARDS.md](../../Reference/engineering/development/STANDARDS.md)** - Rules and requirements  
   - Use for: Coding rules, error handling, validation, authentication, logging  

2. **[ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md)** - Project structure  
   - Use for: Where to put code, layer boundaries (routes → controllers → services)  

3. **[RECIPES.md](../../Reference/engineering/development/RECIPES.md)** - Copy-pastable patterns  
   - Use for: Add route, add controller, add service, validation, webhook patterns  

4. **[COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md)** - Compliance and governance  
   - Use for: Data handling, audit logging, access control, token storage, RLS  

### 🏗️ Patterns to Follow
- **Controller Pattern** - Routes define paths; controllers handle requests; services hold logic  
- **asyncHandler** - Wrap async route handlers (see STANDARDS.md)  
- **AppError** - Services throw AppError; never return `{ error }`  
- **Zod** - Input validation for all API and webhook payloads  
- **RLS** - Doctor-only access to their data; backend checks where needed  

### 🔒 Security & Compliance for This Plan
- **Tokens:** Store Instagram/Facebook tokens securely; encrypt at rest if required by COMPLIANCE.md  
- **RLS / backend:** Resolve `page_id` → `doctor_id`; only that doctor’s conversations/appointments accessible  
- **Audit logging:** Log connection/disconnection and token-related events (correlationId; no token values in logs)  
- **No PII in logs** - Only IDs; see STANDARDS.md and COMPLIANCE.md section D  

---

## Must-Have 1: In-App “Connect Instagram”

**Problem:** Currently the system assumes a single doctor / single Instagram (e.g. `DEFAULT_DOCTOR_ID`). For a sellable MVP, each doctor must link their own Instagram Business/Creator account (or Facebook Page) so DMs are attributed to them.

---

### Required for MVP

- **In-app “Connect Instagram” (or Settings → Instagram):**
  - Flow for doctor to link their Instagram Business/Creator account (or the Facebook Page connected to it) to their Clariva account.
  - Backend: store per-doctor Instagram (or Facebook Page) identifier and access token; webhook/worker resolve doctor from incoming message (e.g. `page_id` → `doctor_id`).
- **UI:** Clear state: “Connected as @handle” or “Not connected – Connect Instagram,” and optional “Disconnect” with warning.
- **Security/compliance:** Tokens stored securely; only the linked doctor’s data is accessible (RLS / backend checks).

---

### Tasks

- [ ] **Backend – Storage & resolution**
  - [ ] Add (or extend) table/columns for per-doctor Instagram: `instagram_page_id` (or equivalent), `instagram_access_token` (or ref to secure storage), optional `instagram_username`/handle for display.
  - [ ] Ensure RLS and backend services only allow the owning doctor to read/update their own Instagram link.
  - [ ] Implement resolution in webhook/worker: from incoming webhook payload (e.g. `page_id`) look up `doctor_id`; reject or dead-letter if unknown page.
- [ ] **Backend – Connect flow**
  - [ ] Implement OAuth (or Meta login) flow: redirect doctor to Meta, receive callback with page selection; exchange for long-lived token; save `page_id` + token for the authenticated doctor.
  - [ ] Ensure token is stored securely (env/secrets best practice; if in DB, follow COMPLIANCE.md for encryption at rest).
- [ ] **Backend – Disconnect**
  - [ ] Endpoint (or action) to disconnect: clear stored token and page id for that doctor; require confirmation (e.g. in UI).
- [ ] **Frontend – Settings / Connect UI**
  - [ ] Settings (or dashboard) section: “Instagram” with state “Connected as @handle” or “Not connected – Connect Instagram.”
  - [ ] “Connect Instagram” triggers backend OAuth flow (redirect or popup as designed).
  - [ ] “Disconnect” with warning; call backend to clear link.
- [ ] **Remove single-tenant assumption**
  - [ ] Remove or replace reliance on single global `DEFAULT_DOCTOR_ID` / single env Instagram for handling messages; all message handling uses `page_id` → `doctor_id` resolution.

---

### Acceptance criteria

- [ ] Doctor can connect their Instagram from the dashboard (or settings).
- [ ] Incoming DMs to that Instagram are handled by the bot and attributed to that doctor.
- [ ] Doctor can see connection status and disconnect if needed.
- [ ] No reliance on a single global `DEFAULT_DOCTOR_ID` / single env Instagram for multi-doctor use.

---

### Deliverables

- Backend: Per-doctor Instagram storage, webhook resolution `page_id` → `doctor_id`, connect/disconnect APIs.
- Frontend: Settings/Instagram section with connection status, Connect, and Disconnect (with warning).
- Documentation: How to add a new doctor’s page to the app (for MVP; app review can be later).

---

### Files to Create/Update

```
backend/
├── migrations/
│   └── 00X_doctor_instagram.sql   (or extend existing doctor/settings table)
├── src/
│   ├── services/
│   │   ├── instagram-connect-service.ts   (OAuth, token exchange, save/clear)
│   │   └── (update) instagram-service.ts  (resolve page_id → doctor_id in webhook path)
│   ├── controllers/
│   │   └── instagram-connect-controller.ts (connect callback, disconnect)
│   ├── routes/
│   │   └── instagram-connect.ts
│   └── types/
│       └── instagram-connect.ts

frontend/
├── app/
│   └── dashboard/
│       └── settings/
│           └── instagram/         (or settings page with Instagram section)
├── components/
│   └── settings/
│       └── InstagramConnect.tsx   (status, Connect, Disconnect)
```

---

### Dependencies & notes

- **Meta App:** For full multi-tenant, Meta App (Facebook/Instagram) app review may be required long-term. For first sellable MVP, documented setup (e.g. “add your page to our app”) may be enough.
- **Reference:** [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) (token storage, audit, RLS), [RECIPES.md](../../Reference/engineering/development/RECIPES.md) (webhook, add route/controller/service).

---

## Must-Have 2: Doctor Setup (Profile, Availability, Appointment Methods, Fees, Services)

**Problem:** Doctors cannot configure their practice in the app: basic info, available hours, appointment methods (e.g. text, voice, video), fee per method, services offered, and (optionally) which methods apply to which service.

---

### Required for MVP

- **Doctor profile (basic):**  
  Name, practice name, contact (email from auth); optional: phone, address for display.

- **Availability:**  
  Weekly hours (e.g. Mon–Fri 9–5), timezone; optional: block specific dates/times. Backend `availability` / `blocked_times` already exist; expose and edit in UI.

- **Appointment methods and fees:**  
  Methods: e.g. “Text/chat”, “Voice call”, “Video call” (or subset). Fee per method (reuse/extend `doctor_settings` or equivalent). Currency/country in doctor_settings; UI to set fee per method.

- **Services offered (basic):**  
  List of services (e.g. “General consultation”, “Follow-up”, “Procedure X”). Optional for MVP: “appointment method per service.” If scope is tight, one set of methods + fees for all services; add per-service method later.

- **UI:**  
  Single “Setup” or “Settings” area (or wizard post-signup): Profile → Availability → Appointment methods & fees → Services. All editable after first run.

---

### Tasks

- [ ] **Backend – Profile**
  - [ ] Ensure doctor profile fields exist (name, practice name, phone, address if needed); extend schema if necessary.
  - [ ] API: GET/PUT (or PATCH) for current doctor’s profile; validate with Zod; RLS so doctor only edits self.
- [ ] **Backend – Availability**
  - [ ] Expose existing availability and blocked_times via API (list/update); timezone in doctor_settings or profile.
  - [ ] API: GET/PUT availability (recurring weekly hours), GET/POST/DELETE blocked_times; Zod validation.
- [ ] **Backend – Appointment methods & fees**
  - [ ] Extend doctor_settings (or equivalent) with: methods (e.g. text, voice, video), fee per method, currency.
  - [ ] API: GET/PUT doctor appointment settings; Zod validation; RLS.
- [ ] **Backend – Services**
  - [ ] Services table (or equivalent) if not present: e.g. name, optional “allowed_methods” per service; link to doctor.
  - [ ] API: CRUD for doctor’s services; optional: allowed appointment method(s) per service for MVP.
- [ ] **Frontend – Setup/Settings UI**
  - [ ] Single Setup or Settings flow: Profile → Availability → Appointment methods & fees → Services (wizard or tabs).
  - [ ] All sections editable after first run; load/save via above APIs; validation and error handling.
- [ ] **Integration**
  - [ ] Booking flow uses availability/slots from these settings; payment uses fee (and currency) from doctor settings; service list shown where relevant.

---

### Acceptance criteria

- [ ] Doctor can set/update basic profile.
- [ ] Doctor can set recurring weekly availability and (optional) block dates/times.
- [ ] Doctor can set appointment methods and fee per method (and currency).
- [ ] Doctor can add/edit services; optionally set allowed appointment method(s) per service.
- [ ] Booking flow and payment use these settings (slots from availability, fee from doctor settings).

---

### Deliverables

- Backend: Profile, availability, blocked_times, appointment methods & fees, services APIs (with Zod and RLS).
- Frontend: Setup/Settings UI (Profile, Availability, Methods & fees, Services); integrated with booking and payment.

---

### Files to Create/Update

```
backend/
├── migrations/
│   └── 00X_doctor_profile_settings_services.sql   (if new tables/columns)
├── src/
│   ├── services/
│   │   ├── doctor-profile-service.ts
│   │   ├── availability-service.ts    (already exists; extend API surface if needed)
│   │   ├── doctor-settings-service.ts (or extend existing)
│   │   └── services-service.ts        (CRUD for doctor’s services list)
│   ├── controllers/
│   │   ├── doctor-profile-controller.ts
│   │   ├── availability-controller.ts
│   │   ├── doctor-settings-controller.ts
│   │   └── services-controller.ts
│   ├── routes/
│   │   └── (profile, availability, settings, services)
│   └── types/
│       └── doctor-setup.ts

frontend/
├── app/
│   └── dashboard/
│       └── setup/           (or settings with sub-routes)
│           ├── profile/
│           ├── availability/
│           ├── methods-fees/
│           └── services/
├── components/
│   └── setup/
│       ├── ProfileForm.tsx
│       ├── AvailabilityForm.tsx
│       ├── MethodsFeesForm.tsx
│       └── ServicesForm.tsx
```

---

### Dependencies & notes

- **Backend:** Availability, slots, doctor_settings already exist; main work is API surface, any schema tweaks (e.g. fee per method, services table), and UI.
- **Reference:** [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md), [RECIPES.md](../../Reference/engineering/development/RECIPES.md) (add route/controller/service, validation), [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) (RLS, audit).

---

## Implementation Order (Suggested)

1. **Must-have 2 (Doctor setup)** can be done first if desired: it uses existing backend (availability, doctor_settings) and adds UI + small schema/API extensions. Booking and payment then rely on real doctor config.
2. **Must-have 1 (Connect Instagram)** can follow: storage, webhook resolution, then connect/disconnect UI. This removes `DEFAULT_DOCTOR_ID` and makes the product multi-doctor.

Alternatively: do Must-have 1 first so each doctor has their own Instagram, then add full doctor setup so their booking and fees are configurable. Choose order based on which demo or sale you need first.

---

## Success Metrics (MVP completion)

- **Connect Instagram:** Every doctor can connect one Instagram/Page; all DMs for that Page are attributed to that doctor; no global default doctor ID in code paths.
- **Doctor setup:** Every doctor can set profile, availability, methods & fees, and services; booking and payment use these settings end-to-end.

---

**Document created:** From existing MVP completion planning  
**Last updated:** (update when you start or complete tasks)  
**Scope:** Must-have 1 (Connect Instagram) + Must-have 2 (Doctor setup) only  
**Documentation reference:** [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) | [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) | [RECIPES.md](../../Reference/engineering/development/RECIPES.md) | [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md)
