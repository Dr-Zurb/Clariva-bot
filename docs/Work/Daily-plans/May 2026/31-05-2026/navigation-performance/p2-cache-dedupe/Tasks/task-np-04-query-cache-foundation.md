# np-04 · Stand up the TanStack Query cache foundation

> **Phase 2, Wave 1 (Lane α)** of [navigation-performance](../plan-p2-navigation-performance-cache-dedupe-batch.md). Lays the client-cache primitive every daily-driver surface will sit on (product-plan R-QUERY-CACHE). **Foundation only — migrates no surface** (np-05 does that). Honours **NP-DL-4** (one library, incremental) and **NP-Q1 (locked → TanStack Query)**.

| **Size** | M | **Model** | Sonnet 4.6 | **Wave** | 1 | **Depends on** | Phase 1 shipped (np-02/np-03) | **Blocks** | np-05 | **Status** | ✅ DONE |

---

## 📋 Task overview

Add **TanStack Query** to the frontend and stand up the shared cache: a `QueryClientProvider` mounted in the **client** tree, sensible default options, a typed query-hook pattern that wraps the existing `frontend/lib/api.ts` callers (not a rewrite), query-key conventions, and the NP-Q4 staleness defaults as named constants. Prove it with **one** reference hook — then stop. Migrating real surfaces is np-05.

**Change type:** **Create new** (provider + hooks/keys/constants) + a minimal wiring edit at the client boundary. MUST follow [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md) (audit → impact → implement → tests → docs).

**Current state (verified in code):**
- ✅ `frontend/lib/api.ts` centralises fetches but hard-codes `cache: "no-store"` in ~80 places; `frontend/lib/api-base.ts` holds the base helper.
- ✅ `frontend/components/layout/DashboardShell.tsx` is already a `"use client"` boundary that wraps the dashboard subtree (good provider host).
- ✅ `@tanstack/react-query` + dev-only `@tanstack/react-query-devtools` installed; provider + reference hook wired in `DashboardShell`.

**Scope guard:** new files (provider, hooks barrel, keys, staleTime constants) + `package.json` + **one** client-boundary wiring edit + one reference hook. **Do NOT** edit the server `frontend/app/dashboard/layout.tsx` (np-06 owns it — keeping these disjoint is what lets Wave 1 run in parallel). Expected files touched ≤ 6. Any expansion needs approval.

**Shipped files (6):** `package.json`, `components/providers/QueryProvider.tsx`, `lib/query/keys.ts`, `lib/query/stale.ts`, `hooks/queries/useDashboardEventsUnreadCount.ts`, `components/layout/DashboardShell.tsx`.

---

## ✅ Task breakdown (hierarchical)

### 1. Add the library + a stable client
- [x] 1.1 Add `@tanstack/react-query` and (dev-only) `@tanstack/react-query-devtools` via the package manager (let it resolve the latest stable; do not hand-pin a guessed version).
- [x] 1.2 Create a **stable** `QueryClient` (e.g. `useState(() => new QueryClient(...))` or a guarded module singleton) so it is not recreated on every render. Default options: a conservative default `staleTime`, a `gcTime`, `refetchOnWindowFocus` policy, and a `retry` policy aligned with the app's error model (don't retry 401/403/4xx).
- [x] 1.3 Mount `QueryClientProvider` in the **client** tree — inside `DashboardShell` or a new client `components/providers/QueryProvider.tsx` rendered by it — so the whole dashboard client subtree is covered **without touching the server `dashboard/layout.tsx`**.
- [x] 1.4 Mount React Query Devtools **only in development** (`process.env.NODE_ENV !== 'production'`).

### 2. Establish conventions (so np-05 is mechanical)
- [x] 2.1 Define a **query-key convention** (e.g. `['patients','list',filters]`, `['patient', id, 'vitals']`) in a `lib/query/keys.ts` and document it. **Keys carry IDs/filters only — never PHI** (no names, no free-text) (see safety gate).
- [x] 2.2 Provide a **thin typed hook pattern** that wraps existing `lib/api.ts` functions (do not rewrite `api.ts`); include one short example hook in a `hooks/queries/` (or `lib/query/`) location to copy from.
- [x] 2.3 Encode the **NP-Q4 staleness defaults** as named constants/helpers (e.g. `STALE.LIVE = 0`, `STALE.COUNTS = 30_000`, `STALE.STATIC = 300_000`) so per-surface choices in np-05 are explicit and reviewable.
- [x] 2.4 Provide an **invalidation convention** (how to `invalidateQueries` the right keys after a mutation) and document "never cache mutation responses".

### 3. Guardrails (NP-DL-4 / NP-DL-5)
- [x] 3.1 Leave `lib/api.ts` and every existing `useEffect`+fetch working **unchanged** — adoption is incremental; **do not** strip `cache:"no-store"` globally.
- [x] 3.2 Provider is client-only; ensure no server component imports a hook (no hydration/`use client` violations).

### 4. Tests + verification
- [x] 4.1 One reference hook renders **real** data through the provider in the running app (smoke).
- [x] 4.2 Devtools present in dev, **absent** in a prod build (`next build && next start` check).
- [x] 4.3 `npx tsc --noEmit` clean (frontend); no new hydration warnings/console errors; **no daily-driver surface migrated** (diff stays within scope guard).

---

## 🌍 Global safety gate (MANDATORY)

- [x] **Data touched?** Reads only (no writes/migrations). The cache holds API responses **in memory** for the session.
- [x] **Any PHI in logs / keys?** **No** — query keys use IDs/filters only, never patient names or free-text; devtools is dev-only so PHI in cached payloads is never shipped to prod tooling.
- [x] **External API or AI call?** No new endpoints — hooks wrap existing `lib/api.ts` calls.
- [x] **Retention / deletion impact?** None here. (Cache is in-memory and not persisted; np-05 wires the **clear-on-logout** behaviour when real PHI starts flowing through it.)

---

## ✅ Acceptance & verification criteria

- [x] `QueryClientProvider` mounts in the **client** tree; server `app/dashboard/layout.tsx` is **untouched**.
- [x] `QueryClient` is stable across renders (not re-instantiated per render).
- [x] Query-key convention, the typed-hook pattern, NP-Q4 `staleTime` constants, and the invalidation convention are documented and exported for np-05.
- [x] Devtools dev-only; absent from prod bundle.
- [x] `lib/api.ts` + all existing fetches still work unchanged (incremental adoption).
- [x] One reference hook proves the pattern; **no real surface migrated**.
- [x] `npx tsc --noEmit` clean; no new console/hydration errors.

## 🚫 Anti-goals

- ❌ Don't migrate any daily-driver surface (np-05 owns it).
- ❌ Don't edit the server `dashboard/layout.tsx` (np-06's file) — would break Wave-1 parallelism.
- ❌ Don't strip `cache:"no-store"` across `lib/api.ts` (NP-DL-4 incremental).
- ❌ Don't add a second cache/data library or change any endpoint/shape (NP-DL-5).
- ❌ Don't put PHI in query keys.

## ⚠️ Risks

- **Unstable client.** Recreating `QueryClient` per render silently disables the cache — use a stable instance (1.2).
- **Provider placement.** Putting it in the server layout would (a) need `"use client"` gymnastics and (b) collide with np-06 — mount in the existing client boundary instead.
- **Default `staleTime` too aggressive.** A large global default could later mask clinical updates — keep the default conservative; per-surface clinical-live = 0 is set in np-05.

## 📝 Notes (design / approach)

- **Why mount in the client tree:** keeps np-04 and np-06 on disjoint files so Wave 1 parallelises (see exec-order §"Why this shape"). The dashboard's client subtree (under `DashboardShell`) is exactly the set of components np-05 will migrate, so provider coverage there is sufficient.
- **Incremental, not flag-day (NP-DL-4 / NP-R5):** this task adds capability and conventions; existing fetches keep working so nothing regresses while np-05 ports surfaces one at a time.
- **NP-Q4 defaults** live as constants here so the per-surface policy in np-05 is a small, reviewable diff rather than scattered magic numbers.

---

## 🔗 Related

- Next task: [`task-np-05-migrate-surfaces-and-dedupe.md`](./task-np-05-migrate-surfaces-and-dedupe.md) (consumes this foundation)
- Parallel task: [`task-np-06-ssr-auth-dedupe.md`](./task-np-06-ssr-auth-dedupe.md) (server-side, independent)
- Baseline: [`../../p0-measure/baseline.md`](../../p0-measure/baseline.md)
- Code-change rules: [`../../../../../../process/CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md)

---

**Last Updated:** 2026-05-31
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/CODE_CHANGE_RULES.md` · `process/EXECUTION-ORDER-GUIDELINES.md`
