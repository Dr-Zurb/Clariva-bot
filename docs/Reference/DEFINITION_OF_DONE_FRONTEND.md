# Definition of Done – Frontend
## When a Frontend Feature Is Complete

---

## ⚠️ CRITICAL

**A frontend feature is NOT complete until ALL of the following are satisfied.**

This file is the gatekeeper checklist for UI work. Implementation details live in [FRONTEND_RECIPES.md](./FRONTEND_RECIPES.md) and [FRONTEND_STANDARDS.md](./FRONTEND_STANDARDS.md).

---

## 📋 Related Files

- [FRONTEND_STANDARDS.md](./FRONTEND_STANDARDS.md) - Coding rules
- [FRONTEND_TESTING.md](./FRONTEND_TESTING.md) - Testing requirements
- [FRONTEND_COMPLIANCE.md](./FRONTEND_COMPLIANCE.md) - Privacy and security
- [CONTRACTS.md](./CONTRACTS.md) - API shapes

---

## ✅ Frontend Completion Checklist (MANDATORY)

**AI agents MUST verify ALL items before marking a frontend feature done:**

### 1. Code and Structure
- [ ] Code follows FRONTEND_STANDARDS.md
- [ ] Uses patterns from FRONTEND_RECIPES.md where applicable
- [ ] Aligns with FRONTEND_ARCHITECTURE.md (routes, components, lib, hooks)
- [ ] No violations of FRONTEND_COMPLIANCE.md (no PII in URLs/logs, secure auth)
- [ ] TypeScript: no `any` for API data; types aligned with CONTRACTS
- [ ] ESLint/Prettier (or project lint) passes

### 2. Data and API
- [ ] All API responses typed from CONTRACTS (or shared types)
- [ ] Loading and error states implemented for every data fetch (no silent failures)
- [ ] Env used for API URL and Supabase config; no hardcoded secrets or URLs
- [ ] Auth sent for protected endpoints (e.g. Bearer token) where required

### 3. Accessibility and UX
- [ ] Sufficient contrast and visible focus states
- [ ] Form inputs have labels (or aria-label)
- [ ] Critical dynamic messages (errors, success) visible and preferably announced (e.g. aria-live)

### 4. Testing
- [ ] At least one test (unit or integration) for the new/updated user flow (happy path)
- [ ] API mocks match CONTRACTS
- [ ] No tests calling production API or using production credentials

### 5. Security and Privacy
- [ ] No PII/PHI in console, URL params, or client storage beyond what is necessary and compliant
- [ ] Protected routes require auth and redirect when unauthenticated
- [ ] No backend secrets or long-lived keys in client bundle or NEXT_PUBLIC_*

### 6. Documentation and Config
- [ ] New env vars documented in `.env.example`
- [ ] New routes or major components reflected in docs if required by project

---

## Optional (SHOULD)

- [ ] Error boundary or global error UI for the affected area
- [ ] E2E test for critical path (if project has E2E suite)

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0
