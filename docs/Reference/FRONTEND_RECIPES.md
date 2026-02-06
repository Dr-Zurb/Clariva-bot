# Frontend Recipes (Copy-Pastable Patterns)
## Standard Patterns for Next.js, React, and API Consumption

---

## ⚠️ AI AGENT WARNING

**These recipes are CANONICAL for frontend.**

**AI agents MUST use them as written unless the user explicitly asks for a different pattern.**

**DO NOT:**
- Change naming or structure without user request
- Add extra dependencies or patterns not in project standards
- Omit loading/error handling where a recipe includes it

**DO:**
- Use recipes exactly as written when they fit the task
- Check FRONTEND_STANDARDS.md and CONTRACTS.md for alignment
- If a recipe conflicts with FRONTEND_STANDARDS.md, STANDARDS wins — update the recipe and inform the user

---

## 📌 Rule vs Example Policy

- **Text outside code blocks** = **ENFORCEMENT RULES**
- **Code blocks** = **COPY-PASTABLE PATTERNS** (use as written unless context requires minor adaptation)
- Recipes MUST align with FRONTEND_STANDARDS.md and CONTRACTS.md

---

## 📋 Related Files

- [FRONTEND_STANDARDS.md](./FRONTEND_STANDARDS.md) - Coding rules (source of truth)
- [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) - Structure
- [CONTRACTS.md](./CONTRACTS.md) - API response shapes
- [FRONTEND_TESTING.md](./FRONTEND_TESTING.md) - Testing

---

## Recipe Index

| ID   | Name                          | Use case |
|------|-------------------------------|----------|
| F1   | Typed API client (fetch)      | Call backend API with CONTRACTS types |
| F2   | Supabase browser client       | Client-side Supabase (auth, optional data) |
| F3   | Auth guard (redirect)         | Protect dashboard layout |
| F4   | Page loading/error states     | Data fetch UI states |
| F5   | `cn()` for Tailwind classes   | Conditional/merged classes |
| F6   | Env usage in Next.js          | Safe env access (client vs server) |

---

## F1 – Typed API client (fetch)

**When:** Calling backend API from client or server; responses must match CONTRACTS.

**Rules:** Use CONTRACTS types for success `data` and error shape; include auth header when required.

```typescript
// lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export type ApiSuccess<T> = { success: true; data: T; meta: { timestamp: string; requestId: string } };
export type ApiError = { success: false; error: { code: string; message: string }; meta: { timestamp: string; requestId: string } };

export async function apiGet<T>(path: string, token?: string): Promise<ApiSuccess<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      'Content-Type': 'application/json',
    },
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error((json as ApiError).error?.message ?? 'Request failed'), { status: res.status, body: json });
  return json as ApiSuccess<T>;
}
```

Use `ApiSuccess<YourType>` where `YourType` matches CONTRACTS (e.g. appointment, patient list).

---

## F2 – Supabase browser client

**When:** Client-side auth or Supabase data access (if project uses Supabase in browser).

**Rules:** Create client once per app; use env for URL and anon key; do not put service_role in client.

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

Use this client in Client Components and hooks; for Server Components use a server-side Supabase client (e.g. `createServerClient` from `@supabase/ssr`).

---

## F3 – Auth guard (redirect)

**When:** Protecting dashboard (or any) layout so unauthenticated users are redirected to login.

**Rules:** Run auth check in layout or high-level page; redirect to login when no session; optional: use middleware for path-based redirect.

```typescript
// app/(dashboard)/layout.tsx (Server Component)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
      },
    }
  );
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');
  return <>{children}</>;
}
```

Adapt cookie get/set to your Supabase SSR recipe; ensure login route path matches your app.

---

## F4 – Page loading/error states

**When:** Any page or component that fetches data; MUST show loading and handle errors.

**Rules:** No silent failures; show message or fallback UI for errors; use CONTRACTS error shape if available.

```tsx
// Example: Server Component page with loading/error
// app/(dashboard)/appointments/page.tsx
async function AppointmentsPage() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/appointments`, { cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return <div role="alert">Failed to load appointments: {(err as { error?: { message?: string } }).error?.message ?? res.statusText}</div>;
  }
  const { data } = await res.json();
  return <AppointmentsList appointments={data} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div aria-busy="true">Loading appointments…</div>}>
      <AppointmentsPage />
    </Suspense>
  );
}
```

For client-side fetch, use a hook that returns `{ data, error, isLoading }` and render loading/error UI accordingly.

---

## F5 – `cn()` for Tailwind classes

**When:** Merging or applying conditional Tailwind classes.

**Rules:** Use a single helper (e.g. `clsx` + `tailwind-merge`); avoid duplicating logic.

```typescript
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

```tsx
<button className={cn('btn primary', isDisabled && 'opacity-50 cursor-not-allowed')} />
```

---

## F6 – Env usage in Next.js

**When:** Reading API URL, Supabase URL/keys, or other config.

**Rules:** Client-only values MUST use `NEXT_PUBLIC_*`; server-only MUST NOT use `NEXT_PUBLIC_` for secrets; document all in `.env.example`.

```bash
# .env.example
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

```typescript
// Client or Server (public)
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';

// Server only (never NEXT_PUBLIC_ for secrets)
const secret = process.env.SOME_SECRET;
```

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0
