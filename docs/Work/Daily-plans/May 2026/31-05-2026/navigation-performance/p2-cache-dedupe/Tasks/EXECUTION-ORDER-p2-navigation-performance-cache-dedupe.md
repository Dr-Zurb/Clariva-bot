# Navigation performance — Phase 2 (client cache + dedupe) — execution order

> Sibling document of [`plan-p2-navigation-performance-cache-dedupe-batch.md`](../plan-p2-navigation-performance-cache-dedupe-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [`../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (2 waves)

```
Wave 1 (Foundation + server-auth de-dupe — ~1–1.5d, 2 parallel lanes):
  Lane α  ──── np-04 (M, Sonnet 4.6)    cache foundation [client provider + hook pattern]
  Lane β  ──── np-06 (S/M, Sonnet 4.6)  SSR auth de-dupe [server layout + pages]   ← independent of np-04
        ⇣ (np-04 gates np-05 — shared cache primitive + DashboardShell)
Wave 2 (Migrate daily-driver surfaces — ~2–3d, single lane):
  Lane α  ──── np-05 (M/L, Sonnet 4.6)  migrate surfaces (NP-Q6 order) + collapse counts poller
```

**Total wall-clock:** ~3–4.5d (Wave 1 lanes overlap).
**Total agent-time (sequential equivalent):** ~4–5.5d.

---

## Why this shape (§5 lane gate)

- **Wave 1 is genuinely parallel.** np-04 touches only the **client** tree (a new `QueryClientProvider` + hooks/key files, mounted inside the existing client boundary — `DashboardShell`/a client `Providers` component) plus `package.json`. np-06 touches only **server** code (`app/dashboard/layout.tsx`, dashboard `page.tsx` auth blocks, possibly `middleware.ts`). **Disjoint files, no cross-consumption** (np-06 doesn't use the cache; np-04 doesn't read auth), each ≫ 1 h → the lane gate passes (Shape B). **Scope guard that keeps them disjoint:** np-04 must **not** edit the server `dashboard/layout.tsx` — if the provider can only live in the server layout, fold np-04→np-06 into one sequential lane instead.
- **np-05 is gated (Wave 2).** It consumes np-04's provider + hook pattern, and it also edits `DashboardShell` (counts dedupe) which np-04 mounts the provider into — **shared file + hard dependency**, so it cannot run beside np-04. It does *not* depend on np-06 (np-06 preserves the token-passing contract its acceptance calls out), so np-05 only waits on np-04.
- **Bias to sequential honoured:** only the one defensible parallel split is taken; if a single engineer runs the batch, Wave 1 collapses to `np-04 → np-06` with no correctness change.

---

## Lane-by-lane details

### Wave 1 — Foundation + server-auth de-dupe (2 parallel lanes)

| Lane | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| α | np-04 | M | Sonnet 4.6 | `frontend/lib/api.ts`, `frontend/lib/api-base.ts`, `frontend/components/layout/DashboardShell.tsx`, `frontend/package.json`, `frontend/app/dashboard/layout.tsx` (read-only — do **not** edit) | Add `@tanstack/react-query` (+ devtools in dev). Mount provider in the **client** tree. Ship key conventions + 1 reference hook + the NP-Q4 staleness defaults. **No surface migration here.** |
| β | np-06 | S/M | Sonnet 4.6 | `frontend/app/dashboard/layout.tsx`, an example page (`frontend/app/dashboard/patients-v2/[id]/page.tsx`), `frontend/lib/supabase/server.ts` (or equivalent), `frontend/middleware.ts` | Validate user **once** per request (React `cache()` around the server auth read, or middleware) and pass `user`/token down. Preserve redirects + token availability. Does **not** weaken verification (np-02 owns that). |

### Wave 2 — Migrate daily-driver surfaces (single lane)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | np-05 | M/L | Sonnet 4.6 | np-04's provider + hooks, `frontend/hooks/useDashboardCounts.ts`, `frontend/components/dashboard/cockpit/*`, `frontend/components/layout/DashboardShell.tsx`, `frontend/components/dashboard/cockpit/KpiStrip.tsx`, patients-v2 list + `[id]` client components | Port surfaces in **NP-Q6 order**: cockpit home → patients list → patient detail → opd-today. Apply NP-Q4 `staleTime`s. Collapse both `useDashboardCounts` mounts to one shared query key (R-DEDUPE-POLL). May split into np-05a/np-05b per surface if it runs long. |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| np-04 | M | Sonnet 4.6 | Library integration + provider/hook scaffolding. Well-scoped, no security/PHI logic. |
| np-05 | M/L | Sonnet 4.6 | Mechanical-but-careful migration; the only judgement is per-surface `staleTime` (NP-Q4) and correct invalidation — spec'd in the task. No new auth logic. |
| np-06 | S/M | Sonnet 4.6 | Auth-**adjacent** but does not change verification — it only removes a redundant `getUser()`/`getSession()`. Must preserve redirect + authorization behaviour exactly; reviewer checks the unauthenticated path still 302s. |

**Caps respected:** 0 Opus tasks this phase (no security-boundary change — np-02 already owns verification); ≤ 1 Opus/wave, ≤ 2/batch.

---

## Acceptance gates per wave

### Wave 1 gate
- [ ] **np-04:** `QueryClientProvider` mounts in the client tree (server `dashboard/layout.tsx` untouched); a reference query hook renders real data; devtools available in dev only; query-key convention + NP-Q4 defaults documented; `npx tsc --noEmit` clean. **No daily-driver surface migrated yet.**
- [ ] **np-06:** exactly one server-side `getUser()` per navigation (layout validates; pages no longer re-call it); unauthenticated access still redirects; client components that need the token still receive it; `tsc` clean.

### Wave 2 gate
- [ ] **np-05:** migrated surfaces render cached on repeat-nav (no spinner) and revalidate behind; exactly one counts source (one `/queue-session`, one `/kpis` in Network); OPD queue + live vitals stay zero-stale; mutations invalidate the right keys; no contract/route change; prod-build repeat-nav improvement recorded vs baseline.
- [ ] **Phase gate (batch plan):** all six boxes in the batch-plan acceptance gate ticked.

---

## Cost estimate

| Wave | Tasks | Sonnet 4.6 chats | Opus chats | Wall-clock |
|---|---|---|---|---|
| 1 — foundation + SSR auth | np-04, np-06 | 2 | 0 | ~1–1.5d (parallel) |
| 2 — migrate surfaces | np-05 | 1 | 0 | ~2–3d |

---

## References

- Plan: [`plan-p2-navigation-performance-cache-dedupe-batch.md`](../plan-p2-navigation-performance-cache-dedupe-batch.md)
- Product plan: [`../../../../../../Product%20plans/plan-navigation-performance.md`](../../../../../../Product%20plans/plan-navigation-performance.md)
- Model strategy: [`../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)
- Prior phase: [`../../p1-backend-tax/`](../../p1-backend-tax/) · baseline: [`../../p0-measure/baseline.md`](../../p0-measure/baseline.md)
