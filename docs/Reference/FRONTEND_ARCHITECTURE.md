# Frontend Architecture & Structure
## Next.js App, Layouts, and Data Flow

---

## ⚠️ DO NOT Violate API Contracts

**AI Agents MUST NOT:**
- ❌ Assume response shapes - **MUST** consume backend per [CONTRACTS.md](./CONTRACTS.md)
- ❌ Expose PII/PHI in URLs, logs, or client state without necessity - **MUST** follow [FRONTEND_COMPLIANCE.md](./FRONTEND_COMPLIANCE.md)
- ❌ Bypass auth or RLS expectations - **MUST** use Supabase Auth and API tokens as documented

**ALWAYS:**
- ✅ Type API responses from CONTRACTS.md (or shared types)
- ✅ Use env vars for API base URL and Supabase keys (never hardcode)
- ✅ Handle loading and error states for every data fetch

**See:** [CONTRACTS.md](./CONTRACTS.md) for API response shapes. [FRONTEND_STANDARDS.md](./FRONTEND_STANDARDS.md) for coding rules.

---

## 📁 Project Structure (Next.js App Router)

```
frontend/                    ← Next.js app (or equivalent root)
├── app/                      ← App Router
│   ├── layout.tsx            ← Root layout (providers, fonts)
│   ├── page.tsx              ← Home/landing (or redirect)
│   ├── (auth)/                ← Auth route group
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── signup/
│   │       └── page.tsx
│   ├── (dashboard)/          ← Protected dashboard group
│   │   ├── layout.tsx         ← Dashboard shell (nav, sidebar)
│   │   ├── page.tsx          ← Dashboard home
│   │   ├── appointments/
│   │   │   ├── page.tsx      ← List
│   │   │   └── [id]/page.tsx ← Detail
│   │   └── patients/
│   │       └── [id]/page.tsx
│   └── api/                  ← Optional: API route handlers (proxy, webhooks)
│       └── ...
├── components/               ← Reusable UI
│   ├── ui/                   ← Primitives (Button, Input, Card)
│   ├── layout/               ← Header, Sidebar, Footer
│   └── domain/               ← App-specific (AppointmentCard, PatientHeader)
├── lib/                      ← Shared utilities and clients
│   ├── supabase/             ← Supabase client (browser + server)
│   ├── api.ts                ← Typed API client (fetch to backend)
│   └── utils.ts              ← cn(), formatters, constants
├── hooks/                    ← Custom React hooks (useAppointments, useAuth)
├── types/                    ← Frontend types (align with CONTRACTS / backend)
├── styles/                   ← Global CSS, Tailwind entry
├── public/
├── .env.local                 ← Never commit; use .env.example as template
└── .env.example               ← Document all required vars
```

---

## 🏗️ Layer Boundaries

### Request Flow (User → UI → Backend)

```
User action (click, submit)
    ↓
Page or Server Component (app/)
    ↓
Data: Server Component → direct fetch/ Supabase; Client → hooks → lib/api
    ↓
Backend API (or Supabase) returns; shape per CONTRACTS.md
    ↓
UI renders with loading / success / error states
```

### What Goes Where

| Directory       | Responsibility                    | Can Import From     | Cannot Import        |
|----------------|-----------------------------------|---------------------|----------------------|
| `app/**`       | Routes, layouts, page-level data  | `components/`, `lib/`, `hooks/`, `types/` | Direct `process.env` (use Next.js env) |
| `components/`  | Presentational + domain UI        | `lib/`, `types/`, `hooks/` | Route-specific logic |
| `lib/`         | API client, Supabase, utils       | `types/`            | `app/` (no route deps) |
| `hooks/`       | Data fetching, auth state         | `lib/`, `types/`    | `app/`               |
| `types/`       | Shared TS types (API shapes)      | —                   | Nothing app-specific |

---

## 🔐 Auth and Protection

- **Supabase Auth** is the source of truth for session (JWT). Use `@supabase/ssr` (or equivalent) for cookie-based server session.
- **Protected routes:** Wrap dashboard layout (or individual pages) with auth check; redirect unauthenticated users to login.
- **API calls to backend:** Send backend-accepted auth (e.g. Bearer token from Supabase session, or API key as per backend contract). Do not send Supabase anon key to the backend as “auth”.
- **RLS:** Backend and Supabase RLS enforce access; frontend must not assume “if I can call it, I can see it” — always handle 403 and empty lists.

---

## 📡 Data Fetching

- **Server Components:** Prefer `async` page/layout and `fetch` (or Supabase server client) for initial data; no `useEffect` for that.
- **Client Components:** Use hooks that call `lib/api` or Supabase client; show loading/error UI; avoid fetching in `useEffect` without cleanup/cancel.
- **Caching:** Respect Next.js `fetch` cache and `revalidate`; for client-side, avoid stale data (invalidate on mutation or use a small stale-while-revalidate window).
- **Types:** All API responses typed from CONTRACTS.md; shared types with backend where possible.

---

## 🎨 Styling and Theming

- **Tailwind** as the primary utility layer. Use `lib/utils.ts` `cn()` for conditional classes.
- **Design tokens:** Colors, spacing, typography in `tailwind.config`; prefer semantic tokens (e.g. `primary`, `destructive`) over raw hex in components.
- **Accessibility:** Sufficient contrast, focus states, and semantic HTML (see FRONTEND_STANDARDS.md and FRONTEND_COMPLIANCE.md).

---

## 📦 Environment and Config

- **Next.js:** Use `NEXT_PUBLIC_*` only for values that must be exposed to the browser (e.g. Supabase URL, anon key). Backend API base URL can be `NEXT_PUBLIC_API_URL` or server-only.
- **Secrets:** No backend API keys or secrets in client bundles. Server-side only in `.env` (no `NEXT_PUBLIC_`).
- **.env.example:** Document every variable needed to run the app (Supabase, API URL, etc.).

---

## Related Files

- [FRONTEND_STANDARDS.md](./FRONTEND_STANDARDS.md) - Coding rules and patterns
- [FRONTEND_RECIPES.md](./FRONTEND_RECIPES.md) - Copy-pastable patterns
- [CONTRACTS.md](./CONTRACTS.md) - API response shapes consumed by frontend
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Backend structure and boundaries

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0
