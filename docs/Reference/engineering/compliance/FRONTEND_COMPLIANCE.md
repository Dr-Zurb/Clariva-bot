# Frontend Compliance & Data Handling
## Privacy, Security, and Global Baseline in the UI

---

## ⚠️ Compliance Overrules Features

**If a frontend feature conflicts with this document or [COMPLIANCE.md](./COMPLIANCE.md):**
- **Compliance wins** — redesign or drop the feature
- **AI agents MUST refuse** non-compliant implementations and suggest compliant alternatives

**Scope:** This file governs frontend-specific handling of PII/PHI, consent, retention UX, and security. Backend and global rules remain in [COMPLIANCE.md](./COMPLIANCE.md).

---

## 🌍 Global Privacy Baseline (Frontend)

- **Data minimization (UI):** Only request and display data necessary for the current screen; avoid preloading or caching unnecessary PII.
- **Purpose limitation:** Do not use data collected for one purpose (e.g. appointment booking) for another (e.g. marketing) without consent and documentation.
- **Least privilege:** Frontend must not assume “if the API returns it, we can show it everywhere.” Respect backend RLS and scoping; hide or redact when required by policy.

---

## PII/PHI in the Frontend

- **MUST NOT:** Log PII/PHI (names, emails, phones, DOB, health data) to console, analytics, or error reporting without explicit compliance-approved mechanism.
- **MUST NOT:** Put PII/PHI in URL path or query params when an ID suffices (e.g. use `/patients/123`, not `/patients?name=John`).
- **MUST NOT:** Store PII/PHI in localStorage/sessionStorage beyond what is strictly necessary (e.g. session token in httpOnly cookie is preferred over storing user name in localStorage).
- **SHOULD:** Prefer server-side or secure context for displaying sensitive data; avoid sending sensitive payloads in client-side only flows when avoidable.

---

## Authentication and Session

- **MUST:** Use project-mandated auth (e.g. Supabase Auth); secure token storage (httpOnly cookies preferred for web).
- **MUST:** Protect routes that show PII/PHI; redirect unauthenticated users; do not expose sensitive data in client bundle or client-visible env.
- **MUST NOT:** Expose backend secrets or long-lived API keys to the client; use `NEXT_PUBLIC_*` only for non-secret configuration.

---

## Consent and Transparency (UI)

- **SHOULD:** Where consent is required (e.g. marketing, non-essential cookies), show clear opt-in and record consent per COMPLIANCE.md; do not pre-check consent checkboxes.
- **SHOULD:** Provide a way for users to understand what data is used (e.g. link to privacy notice, in-app summary).

---

## Accessibility and Non-Discrimination

- **MUST:** Meet baseline accessibility (contrast, focus, labels) per FRONTEND_STANDARDS.md so that features are usable by people with disabilities.
- **SHOULD:** Prefer semantic HTML and ARIA where needed; avoid conveying important information by color or layout alone.

---

## Conflict Resolution

- **COMPLIANCE.md** (global) overrides all.
- **FRONTEND_COMPLIANCE.md** overrides other frontend docs for privacy and data handling in the UI.

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0
