# Clariva Doctor Dashboard (Frontend)

Next.js frontend for the Clariva Doctor Dashboard. This app lives in the **monorepo** alongside the backend: backend in `backend/`, frontend in `frontend/`.

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Dev server runs at [http://localhost:3000](http://localhost:3000) by default.

## Run the backend (separate process)

The backend API runs separately:

```bash
cd backend
npm install
npm run dev
```

Backend typically runs on port 3001. Configure `NEXT_PUBLIC_API_URL` in `frontend/.env.local` to point to it (e.g. `http://localhost:3001`).

## Environment variables

Copy `frontend/.env.example` to `frontend/.env.local` and fill in values. Never commit `.env.local`.

| Variable                        | Description                                       |
| ------------------------------- | ------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`           | Backend API base URL (e.g. http://localhost:3001) |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL (used in Task 2: Auth)       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (used in Task 2: Auth)     |

## Scripts

- `npm run dev` – Start development server
- `npm run build` – Production build
- `npm run start` – Start production server (after `build`)
- `npm run lint` – Run ESLint
- `npm run format` – Format with Prettier
- `npm run format:check` – Check formatting

## Node version

Node 18+ (or 20 LTS) recommended. See `package.json` `engines` field.

## Tech stack

- **Next.js 14** (App Router)
- **TypeScript** (strict)
- **Tailwind CSS**
- **ESLint** + **Prettier**

## Docs

- [FRONTEND_ARCHITECTURE.md](../docs/Reference/FRONTEND_ARCHITECTURE.md) – Structure, app/, lib/
- [FRONTEND_STANDARDS.md](../docs/Reference/FRONTEND_STANDARDS.md) – Coding rules
- [FRONTEND_RECIPES.md](../docs/Reference/FRONTEND_RECIPES.md) – Patterns (e.g. cn(), env)
