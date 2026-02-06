# Frontend Testing Strategy
## Unit, Integration, and E2E for Next.js and React

---

## 🎯 Purpose

This file defines how to test the frontend: what to test, where, and with what tools. It aligns with [FRONTEND_STANDARDS.md](./FRONTEND_STANDARDS.md) and [DEFINITION_OF_DONE_FRONTEND.md](./DEFINITION_OF_DONE_FRONTEND.md).

**This file owns:**
- Testing levels (unit, integration, E2E)
- Recommended tools (Jest, React Testing Library, Playwright/Cypress)
- What must be covered before a feature is done
- Mocking API and auth

**This file MUST NOT contain:**
- Backend testing (see [TESTING.md](./TESTING.md))
- Implementation recipes (see [FRONTEND_RECIPES.md](./FRONTEND_RECIPES.md))

---

## 📋 Related Files

- [FRONTEND_STANDARDS.md](./FRONTEND_STANDARDS.md) - Coding rules
- [DEFINITION_OF_DONE_FRONTEND.md](./DEFINITION_OF_DONE_FRONTEND.md) - Completion checklist
- [CONTRACTS.md](./CONTRACTS.md) - API shapes to mock
- [TESTING.md](./TESTING.md) - Backend testing

---

## Testing Levels

### Unit (components and hooks)

- **What:** Pure UI components, hooks, utils (e.g. `cn`, formatters).
- **Tools:** Jest + React Testing Library (or Vitest).
- **Rules:** Test behavior and accessibility (labels, focus); avoid testing implementation details; mock API and Supabase.
- **Coverage:** Critical paths and shared components; not every single div.

### Integration (pages and data flow)

- **What:** Page or layout with mocked API/Supabase; user flows (e.g. login → dashboard, list → detail).
- **Tools:** Jest + RTL + MSW (Mock Service Worker) for API; optional Next.js `render` with router/mock.
- **Rules:** Mock responses per CONTRACTS; assert loading → success and loading → error; no real backend in CI.

### E2E (full stack in test env)

- **What:** Critical user journeys in a real browser against a test backend (or mocked backend).
- **Tools:** Playwright or Cypress; run against staging or test API.
- **Rules:** Use test accounts and test data only; no PII/PHI from production; cleanup after runs where possible.

---

## MUST Rules for AI Agents

- **MUST:** Every new user-facing flow have at least one test (unit or integration) covering the happy path.
- **MUST:** API mocks MUST match CONTRACTS (success `data` + `meta`, error shape).
- **MUST NOT:** Commit tests that call production API or use production credentials.
- **SHOULD:** Use React Testing Library queries (getByRole, getByLabelText) over getByTestId for behavior and a11y.

---

## Mocking API (CONTRACTS)

Use the same shapes as backend:

```typescript
// Example mock for appointments list (align with CONTRACTS.md)
const mockAppointmentsResponse = {
  success: true,
  data: [{ id: '1', patientName: 'Test', startTime: '2026-02-01T10:00:00Z' }],
  meta: { timestamp: new Date().toISOString(), requestId: 'test-req-1' },
};
```

Use MSW or jest.mock to return this for `fetch`/API client in tests.

---

## Accessibility in Tests

- **SHOULD:** Prefer `getByRole`, `getByLabelText`, `getByText` so that accessible behavior is asserted.
- **SHOULD:** For forms, assert that submitting with invalid data shows an error message (and optionally that the field is announced).
- **MUST NOT:** Rely only on `data-testid` for critical behavior; combine with roles/labels where possible.

---

## Optional: E2E Best Practices

- One E2E suite for login → dashboard → one critical action (e.g. view appointments).
- Use env (e.g. `E2E_BASE_URL`, `E2E_USER`, `E2E_PASSWORD`) for test environment; never production.
- Keep E2E stable: avoid flaky selectors; use stable roles or test IDs only where necessary.

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0
