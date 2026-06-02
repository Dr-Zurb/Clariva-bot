# Task 1: Frontend Project Setup
## February 3, 2026 – Week 4: Doctor Dashboard Frontend Day 1

---

## 📋 Task Overview

Set up the Doctor Dashboard frontend: Next.js project with TypeScript, Tailwind CSS, and a minimal app shell. No auth or dashboard UI yet; this task delivers the project scaffold and tooling so subsequent tasks can add pages and components.

**Estimated Time:** 1–2 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-02-03

**Change Type:**
- [x] **New feature** — Add frontend project only (no change to backend)
- [ ] **Update existing** — N/A

**Current State:** (MANDATORY - Check existing code first!)
- ✅ **What exists:** Frontend in `frontend/` (Next.js 14, TypeScript, Tailwind, App Router); `frontend/.env.example` with NEXT_PUBLIC_* placeholders; `frontend/README.md` and repo root README "Frontend Setup" subsection; `lib/utils.ts` with `cn()`; placeholder pages at `/` and `/dashboard`; build and lint (and format) pass.
- ❌ **What's missing:** Nothing for this task.
- ⚠️ **Notes:** Monthly plan and [BUSINESS_PLAN.md](../../Business%20files/BUSINESS_PLAN.md) specify Next.js + React; dashboard hosted on Vercel. Next.js 14 with App Router; project at **`frontend/`** at repo root (monorepo).

**Scope Guard:**
- Expected files touched: new `frontend/` directory and config only; backend unchanged (0 backend files)
- Any expansion requires explicit approval

**Reference Documentation:**
- [FRONTEND_ARCHITECTURE.md](../../Reference/engineering/architecture/FRONTEND_ARCHITECTURE.md) - Next.js structure, app/, lib/, env (primary)
- [FRONTEND_STANDARDS.md](../../Reference/engineering/development/FRONTEND_STANDARDS.md) - TypeScript, Tailwind, env; no PII in logs
- [FRONTEND_RECIPES.md](../../Reference/engineering/development/FRONTEND_RECIPES.md) - F5 cn(), F6 env usage
- [DEFINITION_OF_DONE_FRONTEND.md](../../Reference/engineering/development/DEFINITION_OF_DONE_FRONTEND.md) - Frontend completion checklist
- [FRONTEND_TESTING.md](../../Reference/engineering/development/FRONTEND_TESTING.md) - When tests are required (not for this scaffold)
- [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) - Backend structure (context)
- [DEPLOYMENT.md](../../Reference/engineering/operations/DEPLOYMENT.md) - Pre-deployment checklist; Vercel for frontend (Week 4 Day 8–12)
- [BUSINESS_PLAN.md](../../Business%20files/BUSINESS_PLAN.md) - Doctor dashboard, Next.js, Vercel hosting
- [TASK_TEMPLATE.md](../../task-management/TASK_TEMPLATE.md) - Task structure
- [Monthly Plan Week 4](../../Monthly-plans/2025-01-09_1month_dev_plan.md#week-4-dashboard--launch-prep-jan-31---feb-12)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Project Initialization
- [x] 1.1 Create Next.js app **inside** `frontend/` at repo root (e.g. run `create-next-app frontend` from repo root, or create `frontend/` then `cd frontend && npx create-next-app@latest .`). Use flags: **TypeScript**, **ESLint**, **Tailwind CSS**, **`app/` directory** (App Router), **no `src/`** (or with `src/` per team preference). Next.js 14+ recommended.
- [x] 1.2 Confirm project lives at `frontend/` (monorepo: backend + frontend in same repo); document in frontend README.
- [x] 1.3 Set Node version to align with backend (e.g. 18+ or 20 LTS); document in frontend README or `package.json` `engines`.
- [x] 1.4 Create `frontend/.env.example` with placeholders: `NEXT_PUBLIC_API_URL=`, `NEXT_PUBLIC_SUPABASE_URL=`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=` (used in Task 2); add short comments. Ensure `.env.local` is in frontend `.gitignore` (create-next-app usually adds it).

### 2. Tailwind CSS
- [x] 2.1 Confirm Tailwind is configured (postcss, tailwind.config, content paths)
- [x] 2.2 Add a minimal global CSS entry (e.g. Tailwind directives) and ensure build succeeds

### 3. TypeScript
- [x] 3.1 Strict TypeScript (no implicit any where avoidable); align tsconfig with project needs
- [x] 3.2 No `any` for public component props or API client types; use explicit types or interfaces

### 4. Tooling & Quality
- [x] 4.1 ESLint and Prettier (or project default) so lint/format pass; align with FRONTEND_STANDARDS where applicable
- [x] 4.2 Scripts: `dev`, `build`, `start`, `lint` (and `format` if applicable)
- [x] 4.3 Create `lib/utils.ts` with `cn()` helper per [FRONTEND_RECIPES.md](../../Reference/engineering/development/FRONTEND_RECIPES.md) F5 (conditional Tailwind classes); FRONTEND_ARCHITECTURE expects this from day 1.

### 5. Verification
- [x] 5.1 From `frontend/`: `npm run build` succeeds; `npm run lint` passes.
- [x] 5.2 One placeholder page (e.g. home at `/`) renders; optional "Dashboard coming soon" at `/dashboard`.
- [x] 5.3 Placeholder pages use valid HTML (e.g. at least one heading per page) for basic accessibility.
- [x] 5.4 Repo root README or frontend README documents how to run the frontend (`cd frontend && npm run dev`) and that the backend runs separately (`cd backend && npm run dev`).

---

## 📁 Files to Create/Update

```
frontend/                    (NEW - at repo root, monorepo)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── next.config.js
├── .eslintrc.json (or equivalent)
├── .env.example              (NEXT_PUBLIC_* placeholders; see Task 2; per FRONTEND_RECIPES F6)
├── .gitignore                 (node_modules, .next, .env.local - create-next-app default)
├── app/
│   ├── layout.tsx
│   ├── page.tsx              (placeholder home)
│   ├── globals.css
│   └── dashboard/
│       └── page.tsx          (optional - "Dashboard coming soon")
├── lib/
│   └── utils.ts              (NEW - cn() per FRONTEND_RECIPES F5; FRONTEND_ARCHITECTURE)
├── public/
└── README.md                 (how to run, env vars, link to backend)
```

**Existing Code Status:**
- ✅ Frontend directory created at `frontend/` with Next.js 14, TypeScript, Tailwind, App Router, .env.example, lib/utils.ts (cn), placeholder pages, README; repo root README has "Frontend Setup" subsection.

**When creating a migration:** N/A (no DB changes)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Use Next.js App Router if using Next.js 13+ (monthly plan).
- TypeScript strict; no unnecessary `any` (FRONTEND_STANDARDS).
- Tailwind for styling; no inline styles for layout/theming unless justified (FRONTEND_STANDARDS).
- Frontend must not contain backend secrets; use env placeholders (e.g. `NEXT_PUBLIC_*`) and document in README (FRONTEND_RECIPES F6).
- Prefer semantic design tokens in `tailwind.config` (e.g. `primary`, `destructive`) per FRONTEND_ARCHITECTURE; optional for this scaffold.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (N) — No backend or DB
- [x] **Any PHI in logs?** (MUST be No) — No logging of user data in this task
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Next.js app runs with `npm run dev` and build passes
- [x] TypeScript and Tailwind are configured and used
- [x] Lint (and format if applicable) pass
- [x] Placeholder page(s) render; project location and run instructions documented

**See also:** [DEFINITION_OF_DONE_FRONTEND.md](../../Reference/engineering/development/DEFINITION_OF_DONE_FRONTEND.md). For this scaffold task, apply: §1 Code and Structure, §5 Security and Privacy (no secrets in client), §6 Documentation and Config (.env.example). §2 Data/API, §3 Accessibility, §4 Testing apply in later tasks.

---

## 📝 Notes

- Backend API base URL will be configured in a later task (e.g. `NEXT_PUBLIC_API_URL`). This task only sets up the frontend project and env placeholders.
- **Business plan:** Dashboard is doctor-facing (view appointments, patients); frontend is Next.js + React; hosting on Vercel (BUSINESS_PLAN, DEPLOYMENT).
- Week 4 Day 5–7: E2E testing of full flow; Day 8–12: deployment (backend to Render/Railway, frontend to Vercel per monthly plan).
- No unit tests required for this scaffold task; E2E will cover frontend in Week 4 Day 5–7. When tests are required, follow [FRONTEND_TESTING.md](../../Reference/engineering/development/FRONTEND_TESTING.md).

---

## 🔗 Related Tasks

- [Task 2: Supabase Auth & Login/Signup](./e-task-2-supabase-auth-and-login.md) – Depends on this project
- [Task 3: Dashboard Layout & Navigation](./e-task-3-dashboard-layout-and-navigation.md)

---

**Last Updated:** 2026-02-03  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
