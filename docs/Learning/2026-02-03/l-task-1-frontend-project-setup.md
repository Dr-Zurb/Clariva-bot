# Learning Topics - Frontend Project Setup
## Task #1: Week 4 Doctor Dashboard Frontend Day 1

---

## 📚 What Are We Learning Today?

Today we're learning about **Frontend Project Setup** — how to create the Doctor Dashboard frontend from scratch: a Next.js app with TypeScript, Tailwind CSS, and a minimal app shell inside a monorepo. Think of it like **laying the foundation for the dashboard** — no auth or real UI yet; just the scaffold and tooling so later tasks can add pages and components.

We'll learn about:
1. **Next.js initialization** – create-next-app, App Router, where to put the app (`frontend/` at repo root)
2. **Monorepo layout** – Backend + frontend in same repo; Node version alignment
3. **Tailwind CSS** – Config, content paths, global CSS entry
4. **TypeScript** – Strict mode, no unnecessary `any`, public props typed
5. **Env vars** – `NEXT_PUBLIC_*` placeholders, `.env.example`, `.env.local` in `.gitignore`
6. **`cn()` helper** – lib/utils.ts per FRONTEND_RECIPES F5 (conditional Tailwind classes)
7. **Tooling & verification** – ESLint, Prettier, scripts (dev, build, lint); build and lint pass

---

## 🎓 Topic 1: Next.js Project Initialization

### Why It Matters

The monthly plan and BUSINESS_PLAN specify Next.js + React for the doctor dashboard; hosting on Vercel. We need a single, consistent place for the frontend so the backend stays untouched and both can run side by side.

### Where to Create the App

- **Location:** Create the Next.js app **inside** a `frontend/` directory at **repo root** (monorepo: backend + frontend in same repo).
- **How:** From repo root, either:
  - Run `npx create-next-app@latest frontend` (creates `frontend/` and scaffolds inside it), or
  - Create `frontend/` manually, then `cd frontend && npx create-next-app@latest .`
- **Options when prompted:** TypeScript ✅, ESLint ✅, Tailwind CSS ✅, `app/` directory (App Router) ✅, no `src/` (or with `src/` per team preference). Next.js 14+ recommended.

### App Router

Next.js 13+ uses the **App Router** by default. Routes are defined by folders under `app/`; `page.tsx` in a folder is the route page. No `pages/` directory for new apps.

**Think of it like:**
- **Monorepo** = "Backend lives in `backend/`, frontend in `frontend/`; one repo, two runtimes."
- **App Router** = "Each folder under `app/` is a route; `app/page.tsx` is the home page."

---

## 🎓 Topic 2: Monorepo Layout & Node Version

### Repo Structure

```
clariva-bot/
├── backend/          ← Express API (existing)
├── frontend/         ← Next.js app (new)
│   ├── app/
│   ├── lib/
│   ├── package.json
│   └── ...
└── docs/
```

- Backend runs with `cd backend && npm run dev` (e.g. port 3001).
- Frontend runs with `cd frontend && npm run dev` (e.g. port 3000).
- Document this in the frontend README (and optionally in the repo root README under "Frontend Setup").

### Node Version

- Set Node to align with backend (e.g. 18+ or 20 LTS).
- Document in frontend README or in `package.json` under `engines`: `"node": ">=18.0.0"` (or whatever the project standard is).

**Think of it like:**
- **Two apps** = "Receptionist (backend) and dashboard (frontend) are separate processes; you run both during development."

---

## 🎓 Topic 3: Tailwind CSS

### What Gets Configured

- **postcss.config.js** – Usually just Tailwind and autoprefixer (create-next-app sets this up).
- **tailwind.config.ts** (or `.js`) – Content paths so Tailwind scans the right files: `content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}']` (adjust if you use `src/`).
- **Global CSS** – In `app/globals.css`: Tailwind directives (`@tailwind base;`, `@tailwind components;`, `@tailwind utilities;`). Import this in the root `app/layout.tsx`.

### Verification

- Run `npm run build` from `frontend/`; it should succeed.
- Use at least one Tailwind class on the placeholder page (e.g. `className="p-4"`) so the pipeline is exercised.

**Think of it like:**
- **Tailwind** = "Utility-first CSS: you use class names for layout and styling instead of writing separate CSS files for every component."

---

## 🎓 Topic 4: TypeScript

### Strict Mode

- Use TypeScript **strict** mode (no implicit `any` where avoidable). create-next-app usually enables this in `tsconfig.json`.
- Align `tsconfig.json` with project needs: include `app/`, `lib/`, `components/`, etc.

### No Unnecessary `any`

- **Public component props** – Use explicit types or interfaces (e.g. `interface PageProps { title: string }`).
- **API client types** – Will be added in later tasks; use CONTRACTS types when calling the backend (FRONTEND_ARCHITECTURE, FRONTEND_STANDARDS).

For this scaffold task, ensure the placeholder page and layout have no `any` types where a simple type would do.

**Think of it like:**
- **Strict TypeScript** = "The compiler catches missing types and typos before runtime; required by FRONTEND_STANDARDS."

---

## 🎓 Topic 5: Env Vars (NEXT_PUBLIC_*)

### Why NEXT_PUBLIC_*

In Next.js, only env vars **prefixed with `NEXT_PUBLIC_`** are exposed to the browser. Use these for:
- API base URL (e.g. `NEXT_PUBLIC_API_URL`)
- Supabase URL and anon key (e.g. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) — used in Task 2 (Supabase Auth).

**Never** put backend secrets or service-role keys in `NEXT_PUBLIC_*`; those stay server-only and must not be in client bundles.

### Files

- **`.env.example`** – Create in `frontend/` with placeholders and short comments:
  - `NEXT_PUBLIC_API_URL=` (backend API base, e.g. http://localhost:3001)
  - `NEXT_PUBLIC_SUPABASE_URL=`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY=`
- **`.env.local`** – Each developer copies `.env.example` to `.env.local` and fills in values. **Must be in `.gitignore`** (create-next-app usually adds it).

Per FRONTEND_RECIPES F6: document all required vars in `.env.example`; use `process.env.NEXT_PUBLIC_* ?? ''` in code.

**Think of it like:**
- **NEXT_PUBLIC_*** = "Safe to show in the browser (API URL, public Supabase key)."
- **No prefix** = "Server-only; never use for client-side code."

---

## 🎓 Topic 6: lib/utils.ts and cn() (Recipe F5)

### Why cn()

Components often need to merge or conditionally apply Tailwind classes (e.g. `className={isDisabled ? 'opacity-50' : ''}`). A single helper avoids duplication and handles edge cases (e.g. merging conflicting Tailwind classes).

### Implementation

Per FRONTEND_RECIPES F5 and FRONTEND_ARCHITECTURE, create **`lib/utils.ts`** from day one:

- Use `clsx` (or `classnames`) plus `tailwind-merge` so that conflicting Tailwind classes are merged correctly.
- Export a single function: `cn(...inputs: ClassValue[])`.

Example (from FRONTEND_RECIPES):

```typescript
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Install: `clsx` and `tailwind-merge` (create-next-app may not add them; add via npm).

Usage in JSX: `className={cn('btn primary', isDisabled && 'opacity-50 cursor-not-allowed')}`

**Think of it like:**
- **cn()** = "One place to combine and conditionally apply Tailwind classes without overwriting each other."

---

## 🎓 Topic 7: Tooling & Verification

### ESLint and Prettier

- ESLint (and optionally Prettier) should be configured so that `npm run lint` (and `npm run format` if present) passes.
- Align with FRONTEND_STANDARDS where applicable (e.g. no unused vars, consistent quotes).

### Scripts

Ensure `package.json` has at least:

- `dev` – Start dev server
- `build` – Production build
- `start` – Start production server (after build)
- `lint` – Run ESLint

### Verification Checklist

Task is complete only when:

1. From `frontend/`: **`npm run build`** succeeds.
2. **`npm run lint`** passes.
3. **One placeholder page** (e.g. home at `/`) renders; optional "Dashboard coming soon" at `/dashboard`.
4. Placeholder pages use **valid HTML** (e.g. at least one heading) for basic accessibility.
5. **Documentation** – Repo root README or frontend README documents how to run the frontend (`cd frontend && npm run dev`) and that the backend runs separately (`cd backend && npm run dev`).

**Think of it like:**
- **Scaffold** = "No business logic yet; just a running app, typed and styled, ready for Task 2 (Supabase Auth) and Task 3 (Dashboard layout)."

---

## 📝 Summary

### Key Takeaways

1. **Next.js in `frontend/`** – create-next-app inside `frontend/` at repo root; TypeScript, Tailwind, App Router.
2. **Monorepo** – Backend and frontend are separate apps; document run commands in README.
3. **Tailwind** – Configured via postcss + tailwind.config + globals.css; content paths must include app and components.
4. **TypeScript** – Strict; no unnecessary `any`; public props and API types explicit (CONTRACTS in later tasks).
5. **Env** – `NEXT_PUBLIC_*` only for client-safe config; `.env.example` with placeholders; `.env.local` in `.gitignore`.
6. **cn()** – lib/utils.ts with clsx + tailwind-merge per FRONTEND_RECIPES F5.
7. **Verification** – Build and lint pass; placeholder page(s) render; run instructions documented.

### Next Steps

After completing this task:

1. **Task 2** adds Supabase Auth (login/signup) and uses `NEXT_PUBLIC_SUPABASE_*`.
2. **Task 3** adds dashboard layout and navigation.
3. **Task 4 & 5** add appointments list/detail and patient detail with API client (F1, F4 from FRONTEND_RECIPES).

### Remember

- **No backend changes** – This task only adds `frontend/`; backend stays at 0 files touched.
- **No secrets in client** – Only `NEXT_PUBLIC_*` in frontend; never backend API keys or Supabase service role in the browser.
- **Definition of done** – For this scaffold, apply DEFINITION_OF_DONE_FRONTEND §1 (Code and Structure), §5 (Security and Privacy), §6 (Documentation and Config). §2 (Data/API), §3 (Accessibility), §4 (Testing) apply in later tasks.

---

**Last Updated:** 2026-02-03  
**Related Task:** [Task 1: Frontend Project Setup](../../Development/Daily-plans/2026-02-03/e-task-1-frontend-project-setup.md)  
**Reference Documentation:**
- [FRONTEND_ARCHITECTURE.md](../../Reference/FRONTEND_ARCHITECTURE.md)
- [FRONTEND_STANDARDS.md](../../Reference/FRONTEND_STANDARDS.md)
- [FRONTEND_RECIPES.md](../../Reference/FRONTEND_RECIPES.md) (F5, F6)
- [DEFINITION_OF_DONE_FRONTEND.md](../../Reference/DEFINITION_OF_DONE_FRONTEND.md)
- [DEPLOYMENT.md](../../Reference/DEPLOYMENT.md)
