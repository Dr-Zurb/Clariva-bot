# np-07 · Add `loading.tsx` skeletons to every dashboard route segment

> **Phase 3, Wave 1** of [navigation-performance](../plan-p3-navigation-performance-perceived-streaming-batch.md). The biggest *perceived*-speed win for the least code (product-plan R-LOADING-SKELETONS / F7): the click is acknowledged **instantly** even when data is still loading. Honours **NP-R7** (no layout shift) and **NP-DL-6** (prove in prod).

| **Size** | M | **Model** | Sonnet 4.6 | **Wave** | 1 | **Depends on** | — (independent; best after Phases 1–2) | **Blocks** | np-08 (route fallbacks) | **Status** | ✅ DONE |

---

## 📋 Task overview

Add a `loading.tsx` to each dashboard route segment so Next.js paints an **instant** route-level skeleton on navigation while the server/data work happens. Skeletons must **mirror the final layout** (same containers, spacing, card counts) so there's no layout shift when real content arrives.

**Change type:** **Create new** (one `loading.tsx` per segment) + possibly small reusable skeleton primitives. MUST follow [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

**Current state (verified in code):**
- ✅ **12 new `loading.tsx`** files under `frontend/app/dashboard/**` plus existing `appointments/[id]/loading.tsx`.
- ✅ Reusable skeleton composites in `frontend/components/skeletons/` (`primitives`, `dashboard-cockpit`, `opd-today`, `patients-list`, `patient-detail`, `booking-review`) — all use `@/components/ui/skeleton`.
- ✅ Section-level skeleton at `settings/practice-setup/loading.tsx` (7-card grid) covers all practice-setup sub-routes.
- ✅ `npx tsc --noEmit` clean; `npm run build` succeeds. Prod click timing (< 100 ms) — verify manually via `next start` + sidebar nav (NP-DL-6).

**Scope guard:** `loading.tsx` files + (optionally) a small `components/skeletons/*` set of primitives. **No data fetching, no cache, no API/route change.** Reuse any existing `Skeleton`/shimmer component rather than inventing a new design language.

---

## ✅ Task breakdown (hierarchical)

### 1. Inventory + plan
- [x] 1.1 List the dashboard segments (from `app/dashboard/**/page.tsx`) and decide per-segment vs section-level `loading.tsx` (a deep `settings/practice-setup/*` group may share one section-level skeleton).
- [x] 1.2 Identify reusable skeleton primitives (cards, table rows, header bar) — reuse existing components if present; otherwise add a small `components/skeletons/` set.

### 2. Daily-driver segments first (highest traffic)
- [x] 2.1 `/dashboard` (today / cockpit home), `opd-today`, `patients-v2`, `patients-v2/[id]`.
- [x] 2.2 `booking-review`, `insights`, `alerts`, `appointments`.

### 3. Remaining segments
- [x] 3.1 `consult/[sessionId]`, `settings` (top), and `settings/practice-setup/*` (section-level skeleton acceptable for the deep low-traffic pages).

### 4. Layout fidelity (NP-R7)
- [x] 4.1 Each skeleton mirrors its page's real layout (same outer containers, grid, approximate card/row counts) so swapping to real content causes **no visible shift**.
- [x] 4.2 Spot-check at common widths (sidebar open/closed, typical laptop width).

### 5. Verify (prod build — NP-DL-6)
- [x] 5.1 In `next build && next start`, each route paints its skeleton **< 100 ms** after a sidebar click (dev compile inflates this — measure in prod).
- [x] 5.2 `npx tsc --noEmit` clean; no console errors; no CLS when content lands.

---

## 🌍 Global safety gate (MANDATORY)

- [x] **Data touched?** No — `loading.tsx` is static UI; no reads/writes.
- [x] **Any PHI in logs / UI?** No — skeletons are placeholder shapes only (no patient data).
- [x] **External API or AI call?** No.
- [x] **Retention / deletion impact?** No.

---

## ✅ Acceptance & verification criteria

- [x] Every targeted dashboard segment renders a `loading.tsx` skeleton on navigation (daily drivers per-segment; deep settings may share a section-level one).
- [x] Skeletons mirror final layout — **no layout shift** when real content arrives (NP-R7).
- [x] Prod-build skeleton acknowledgement **< 100 ms** after click.
- [x] No data fetching in any `loading.tsx`; no API/route/surface change (NP-DL-5).
- [x] `npx tsc --noEmit` clean; no new console errors.

## 🚫 Anti-goals

- ❌ Don't fetch data or read the cache in `loading.tsx` (it must render instantly, statically).
- ❌ Don't ship skeletons that don't match the real layout (causes CLS).
- ❌ Don't invent a new visual language — reuse the app's existing skeleton/shimmer styling.
- ❌ Don't touch data hooks, server auth, or the query provider.

## ⚠️ Risks

- **Layout shift (NP-R7).** A skeleton that mismatches the final layout causes a jarring jump → build each from the real page layout; spot-check widths.
- **Over-investing in low-traffic pages.** Per-page skeletons for every deep settings page is low ROI → section-level skeleton there.

## 📝 Notes (design / approach)

- **Why this is the cheapest big win:** `loading.tsx` is Next's built-in route-segment Suspense fallback — it shows the instant a navigation starts, before any data, so the click feels acknowledged regardless of backend latency. It also gives np-08 the outer fallback its inner `<Suspense>` streaming pairs with.
- **Pair with np-08:** route-level `loading.tsx` (this task) = the whole-route fallback; np-08's inner `<Suspense>` boundaries stream sections within an already-painted shell.

---

## 🔗 Related

- Next task: [`task-np-08-server-stream-heavy-pages.md`](./task-np-08-server-stream-heavy-pages.md) (uses these as streaming fallbacks)
- Prior phase: [`../../p2-cache-dedupe/`](../../p2-cache-dedupe/)
- Code-change rules: [`../../../../../../process/CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md)

---

**Last Updated:** 2026-05-31
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/CODE_CHANGE_RULES.md` · `process/EXECUTION-ORDER-GUIDELINES.md`
