# np-08 · Server-stream first paint on the heavy pages (prefetch + hydrate into the Phase-2 cache)

> **Phase 3, Wave 2** of [navigation-performance](../plan-p3-navigation-performance-perceived-streaming-batch.md). Kills the cold-visit client waterfall on the heaviest surfaces (product-plan R-SERVER-FETCH / F6) by streaming server-prefetched data **into** the Phase-2 TanStack cache via `<HydrationBoundary>` + `<Suspense>`. Honours **NP-DL-5** (no contract change), **NP-DL-2 / NP-R4** (clinical freshness), **NP-DL-6** (prove in prod).

| **Size** | L | **Model** | Sonnet 4.6 | **Wave** | 2 | **Depends on** | np-04/05 (cache), np-06 (server-user), np-07 (fallbacks) | **Blocks** | — | **Status** | ✅ DONE |

---

## 📋 Task overview

On the heavy pages (**patient detail** first, then **cockpit home**), prefetch the first-paint reads **on the server**, `dehydrate` them, and wrap the page in `<HydrationBoundary>` so the client cache hydrates **without** an on-mount refetch. Wrap independent regions in `<Suspense>` (fallbacks = np-07 skeletons) so HTML streams progressively instead of assembling client-side. The existing client query hooks keep ownership of revalidation afterward.

**Change type:** **Update existing** + new SSR query infra. MUST follow [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md). **May split** into np-08 (patient detail) + **np-09** (cockpit home) if it runs long.

**Current state (verified in code):**
- ✅ `lib/query/client.ts` — per-request `getQueryClient()` via React `cache()`.
- ✅ `lib/query/options.ts` — shared query key + `queryFn` + `staleTime` factories (server + client hooks).
- ✅ `lib/query/dehydrate.ts` + `lib/query/prefetch/*` — scoped prefetch + dehydrate helpers.
- ✅ `/dashboard/patients-v2/[id]` — `PatientDetailHydrated` prefetches overview + vitals, wraps in `HydrationBoundary`.
- ✅ `/dashboard` — four Suspense streaming sections (KPI, Now/Next, OPD strip, schedule) with np-07 fallbacks.
- ✅ `p3-measurement-results.md` recorded; `tsc` + prod build pass.

**Scope guard:** the two heavy surfaces + a small server-side query-client/hydration helper. **No new endpoints, shapes, or routes (NP-DL-5).** Reuse the **exact** query keys the client hooks use (extract shared key factories if needed). Don't migrate other surfaces.

---

## ✅ Task breakdown (hierarchical)

### 1. SSR query + hydration infra
- [x] 1.1 Add a **per-request** server `QueryClient` factory (e.g. `cache()`-wrapped) and a small helper to `dehydrate` it and render `<HydrationBoundary state={…}>`.
- [x] 1.2 Confirm the client `QueryProvider` consumes hydrated state (it already wraps the subtree; `HydrationBoundary` slots beneath it on the server-rendered page).

### 2. Patient detail — establish the pattern
- [x] 2.1 In the server `patients-v2/[id]/page.tsx`, get the user/token via `lib/auth/server-user.ts` and **`prefetchQuery` the core first-paint reads in parallel** (overview/vitals/etc.) using the **same keys** as the client hooks.
- [x] 2.2 `dehydrate` + wrap the page subtree in `<HydrationBoundary>`; wrap independent sections in `<Suspense>` with np-07 skeletons as fallbacks so they stream.
- [x] 2.3 **Verify no double-fetch:** client hooks hydrate from the dehydrated state and do **not** refetch on mount (keys + `staleTime` match). Fix any key mismatch by sharing a key factory.

### 3. Cockpit home — reuse the pattern
- [x] 3.1 Apply the same server-prefetch + hydrate + Suspense pattern to the cockpit cards' first-paint reads. (If splitting, this becomes np-09.)

### 4. Preserve freshness + error UX (NP-R4)
- [x] 4.1 Streamed reads still respect per-surface `STALE` (live reads — OPD queue, consult vitals — still revalidate after hydration; don't pin them stale).
- [x] 4.2 Preserve the current error/empty states (server prefetch failure must not blank the page — keep an error boundary / let the client query retry).

### 5. Verify (prod build — NP-DL-6)
- [x] 5.1 Patient detail + cockpit first paint render core data in **one streamed pass** (no per-card spinner cascade) on a cold visit.
- [x] 5.2 Repeat-nav unchanged (Phase-2 cache still instant); no CLS; `npx tsc --noEmit` clean; tests green.
- [x] 5.3 Record `p3-measurement-results.md` (cold FCP + requests/nav before/after; **plus the deferred Phase-2 repeat-nav numbers**) vs [`../../p0-measure/baseline.md`](../../p0-measure/baseline.md).

---

## 🌍 Global safety gate (MANDATORY)

- [x] **Data touched?** Clinical reads now also fetched **server-side** (same endpoints, same authenticated user via `server-user.ts`). → **RLS unaffected** — identical query as the client would issue.
- [x] **Any PHI in logs / serialized state?** The dehydrated state is serialized into the streamed HTML — **only `prefetchQuery` the page's own keys** (never `dehydrate` the whole client cache), so no more PHI ships than the page already renders. No PHI in logs.
- [x] **External API or AI call?** No new endpoints — same reads, moved earlier (server) for first paint.
- [x] **Retention / deletion impact?** None — server cache is per-request and discarded after the response.

---

## ✅ Acceptance & verification criteria

- [x] Patient detail + cockpit home stream first paint in **one pass** on a cold visit (no spinner cascade).
- [x] **No double-fetch:** client hydrates from server-streamed state; no immediate refetch on mount (keys match between server prefetch and client hooks).
- [x] Clinical-live reads still revalidate after hydration (NP-R4); error/empty states preserved.
- [x] Repeat-nav still instant (no Phase-2 regression); no CLS.
- [x] Only the page's own keys are dehydrated (no over-serialization of the cache).
- [x] No endpoint/shape/route change (NP-DL-5); `tsc` clean; `p3-measurement-results.md` recorded.

## 🚫 Anti-goals

- ❌ Don't bypass or duplicate the Phase-2 cache — server prefetch must hydrate **into** it (matching keys).
- ❌ Don't `dehydrate` the entire client cache (PHI over-serialization) — only the page's keys.
- ❌ Don't change endpoints/shapes/routes, or pin clinical-live reads stale.
- ❌ Don't regress repeat-nav or the dedupe from Phase 2.
- ❌ Don't migrate other surfaces here (scope = the two heavy pages).

## ⚠️ Risks

- **Key mismatch → double fetch (most likely).** If server prefetch keys differ from client hook keys, the client refetches on mount and the win is lost → share key factories; assert in the Network tab (5.1/2.3).
- **PHI over-serialization.** Dehydrating more than the page's keys leaks extra patient data into the HTML stream → scope `prefetchQuery` per page.
- **Suspense granularity.** Too coarse → all-or-nothing paint; too fine → many tiny streams → tune boundaries to the real visual sections.
- **Server fetch failure blanks the page.** Preserve an error boundary / let the client query take over on prefetch error (4.2).

## 📝 Notes (design / approach)

- **Hydrate, don't rewrite (the Phase-2-informed call):** because the heavy pages already own their data via TanStack Query (client), R-SERVER-FETCH is implemented as **SSR hydration** (`prefetchQuery` → `dehydrate` → `<HydrationBoundary>`), not a server-component rewrite that bypasses the cache. This keeps one source of truth and avoids a double-fetch, while still delivering data-with-the-HTML.
- **Suspense + `loading.tsx`:** np-07's route `loading.tsx` is the **outer** fallback (whole route); np-08's inner `<Suspense>` boundaries stream **sections** within the already-painted shell.
- **Split valve:** patient detail establishes the pattern; cockpit reuses it. If long, cockpit → np-09 (same shape, second surface).

---

## 🔗 Related

- Depends on: [`task-np-07-loading-skeletons.md`](./task-np-07-loading-skeletons.md) (fallbacks) · Phase 2 [`../../p2-cache-dedupe/`](../../p2-cache-dedupe/) (cache + `server-user.ts`)
- Baseline: [`../../p0-measure/baseline.md`](../../p0-measure/baseline.md)
- Results: [`../p3-measurement-results.md`](../p3-measurement-results.md)
- Code-change rules: [`../../../../../../process/CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md)

---

**Last Updated:** 2026-05-31
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/CODE_CHANGE_RULES.md` · `process/EXECUTION-ORDER-GUIDELINES.md`
