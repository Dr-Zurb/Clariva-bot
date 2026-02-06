# Frontend Coding Standards (MUST/SHOULD Rules)
## Production-Quality UI and Data Consumption

---

## ⚠️ Source of Truth

**IMPORTANT: For frontend code, FRONTEND_STANDARDS.md is the authoritative source. If it conflicts with other frontend docs, this file wins.**

General project hierarchy: COMPLIANCE.md > STANDARDS.md (backend) / FRONTEND_STANDARDS.md (frontend) > CONTRACTS.md > ARCHITECTURE / FRONTEND_ARCHITECTURE.

---

## ⚠️ API Contract Compliance

**AI Agents MUST NOT:**
- ❌ Assume API response shapes - **MUST** use types aligned with [CONTRACTS.md](./CONTRACTS.md)
- ❌ Ignore `meta.requestId` or error shape - **MUST** handle success/error per contract
- ❌ Hardcode API base URL or Supabase keys - **MUST** use env (e.g. `NEXT_PUBLIC_*` where required)

**ALWAYS:**
- ✅ Type all API responses (and errors) from CONTRACTS or shared types
- ✅ Handle loading, success, and error states for every data fetch
- ✅ Use env vars for `NEXT_PUBLIC_API_URL`, Supabase URL/anon key, etc.

---

## 📌 Rule vs Example Policy

**CRITICAL FOR AI AGENTS:**

- **Text outside code blocks** = **ENFORCEMENT RULES** (must be followed)
- **Code blocks** = **ILLUSTRATIVE EXAMPLES ONLY** (show intent, not mandatory implementation)
- **If an example conflicts with rules, the rule always wins**

---

**Related Files:**
- [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) - Structure and boundaries
- [FRONTEND_RECIPES.md](./FRONTEND_RECIPES.md) - Copy-pastable patterns
- [FRONTEND_TESTING.md](./FRONTEND_TESTING.md) - Testing strategy
- [FRONTEND_COMPLIANCE.md](./FRONTEND_COMPLIANCE.md) - Privacy and security
- [CONTRACTS.md](./CONTRACTS.md) - API response shapes
- [AI_AGENT_RULES.md](./AI_AGENT_RULES.md) - AI behavior (read first for frontend edits)

---

## 🎯 Core Principle

**Elite UI, simple explanations.**
- **Code:** Production-quality React/Next.js, TypeScript, accessibility
- **Explanations:** Clear and maintainable
- **Structure:** Align with FRONTEND_ARCHITECTURE; use CONTRACTS for data

---

## ⚠️ MANDATORY Rules (MUST)

### TypeScript

- **MUST:** Strict mode enabled; no `any` for API data or props that cross component boundaries.
- **MUST:** Type API responses and request bodies from CONTRACTS (or shared types).
- **SHOULD:** Use shared types with backend where possible (e.g. `Appointment`, `Patient`).

### Next.js and React

- **MUST:** Use App Router conventions: `layout.tsx` for shared shell, `page.tsx` for routes.
- **MUST:** Prefer Server Components for initial data where possible; use Client Components only when needed (hooks, events, browser APIs).
- **MUST:** Mark client-only components with `"use client"` at top of file.
- **MUST NOT:** Use `process.env.X` in client code; use `NEXT_PUBLIC_*` or server-only env as appropriate.
- **SHOULD:** Use semantic HTML (`<main>`, `<nav>`, `<section>`, headings hierarchy).

### Styling (Tailwind)

- **MUST:** Use Tailwind utility classes; use `cn()` (or equivalent) for conditional/merged classes.
- **MUST:** Prefer design tokens from `tailwind.config` (e.g. `primary`, `destructive`) over raw hex in components.
- **MUST NOT:** Inline critical PII/PHI in class names or data attributes visible in DOM.

### Data Fetching and API

- **MUST:** Every user-visible data fetch must have loading and error states (no silent failures).
- **MUST:** Consume backend API per CONTRACTS (success `data`, `meta`; error shape).
- **MUST:** Use env for API base URL (e.g. `NEXT_PUBLIC_API_URL` or server-only).
- **SHOULD:** Prefer Server Component `async` fetch for initial page data; client hooks for mutations and client-driven refetch.

### Auth

- **MUST:** Use Supabase Auth (or project-mandated auth); do not invent custom JWT handling.
- **MUST:** Protect dashboard (and other protected) routes; redirect unauthenticated users to login.
- **MUST:** Send backend-accepted auth (e.g. Bearer token from session) for API calls that require it.

### Accessibility

- **MUST:** Sufficient color contrast; visible focus states for interactive elements.
- **MUST:** Form inputs have associated labels (or `aria-label` where appropriate).
- **SHOULD:** Use `aria-live` for dynamic status/error messages; avoid removing focus without user action where possible.

### Environment and Secrets

- **MUST:** Document all required env vars in `.env.example` (Supabase URL/anon key, API URL, etc.).
- **MUST NOT:** Expose backend secrets or long-lived API keys to the client; use `NEXT_PUBLIC_*` only for non-secret config.

### Privacy and Logging

- **MUST NOT:** Log PII/PHI (names, emails, phones, DOB) in console or send to third-party analytics without compliance approval.
- **MUST NOT:** Put PII/PHI in URL path or query params when avoidable; use IDs and resolve server-side or in secure context.

---

## ⚠️ SHOULD Rules (Best Practice)

- **SHOULD:** Use a typed API client in `lib/api.ts` (or equivalent) that mirrors CONTRACTS.
- **SHOULD:** Centralize error display (e.g. toast or inline message) from API error shape.
- **SHOULD:** Use React error boundaries for route-level failure containment.
- **SHOULD:** Prefer `next/link` and `next/image` for navigation and images.
- **SHOULD:** Keep components small and focused; extract reusable pieces to `components/`.

---

## Conflict Resolution

- **FRONTEND_COMPLIANCE.md** overrides frontend features (privacy, retention, consent).
- **FRONTEND_STANDARDS.md** overrides other frontend docs for coding rules.
- **CONTRACTS.md** defines API shapes; frontend must not assume different response structure.

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0
