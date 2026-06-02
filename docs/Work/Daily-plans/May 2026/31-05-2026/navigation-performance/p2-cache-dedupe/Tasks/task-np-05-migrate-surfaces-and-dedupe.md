# np-05 · Migrate daily-driver surfaces onto the cache + collapse the counts poller

> **Phase 2, Wave 2** of [navigation-performance](../plan-p2-navigation-performance-cache-dedupe-batch.md). Ports the hot surfaces onto np-04's cache so re-navigation is instant, and folds in **R-DEDUPE-POLL** (product-plan R-QUERY-CACHE + R-DEDUPE-POLL). **Clinical correctness gates cache hits** — honours **NP-DL-2 / NP-R4**. Order locked by **NP-Q6**.

| **Size** | M/L | **Model** | Sonnet 4.6 | **Wave** | 2 | **Depends on** | np-04 (foundation) | **Blocks** | Phase 3 R-SERVER-FETCH (later) | **Status** | ✅ DONE |

---

## 📋 Task overview

Replace the `useEffect` + `fetch(no-store)` data fetching on the daily-driver surfaces with np-04's typed query hooks, applying the **NP-Q4** per-surface `staleTime`s, and collapse the two `useDashboardCounts` mounts into **one** shared query key. Result: revisiting a recently-seen surface renders instantly from cache (revalidates behind), waterfalls collapse into deduped parallel queries, and counts fire from a single source — with **no API/route/surface change** and clinical reads kept fresh.

**Change type:** **Update existing** (surface by surface). MUST follow [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md). May split into **np-05a/np-05b** by surface if it runs long — keep each surface's migration a reviewable unit.

**Current state (verified in code / baseline):**
- ✅ Cockpit cards use shared TanStack Query hooks (`useAppointmentsQuery`, `useRxSentTodayQuery`, `useOpdSnapshot` → `useOpdQueueSessionQuery`).
- ✅ `useDashboardCounts` composes shared query keys — `DashboardShell` + `KpiStrip` dedupe to one cache entry per endpoint.
- ✅ Patients list, patient detail tabs, and OPD today migrated; logout clears cache via `useLogout`.

---

## ✅ Task breakdown (hierarchical) — NP-Q6 order

### 1. Cockpit home (NP-Q6 #1 — biggest offender)
- [x] 1.1 Port each cockpit card's mount-fetch to a query hook; identical concurrent reads dedupe to one request.
- [x] 1.2 Apply `staleTime` per NP-Q4 (presets/static = `STALE.STATIC`; KPIs = `STALE.COUNTS`).

### 2. Collapse the counts poller (R-DEDUPE-POLL)
- [x] 2.1 Convert `useDashboardCounts` to a **single shared query key** so `DashboardShell` and `KpiStrip` consume the *same* cache entry → one network source (not two).
- [x] 2.2 Preserve the 30 s cadence (`refetchInterval`) **and** the visibility-pause behaviour (no background polling while the tab is hidden).
- [x] 2.3 Verify in the Network tab: exactly **one** `/queue-session` and **one** `/kpis` per cycle.

### 3. Patients list (NP-Q6 #2)
- [x] 3.1 Port the list fetch to a query hook; `staleTime ≈ 30–60 s`; revalidate on focus.

### 4. Patient detail (NP-Q6 #3 — kill the waterfall)
- [x] 4.1 Port the per-tab clinical reads to parallel query hooks (they dedupe + run in parallel instead of cascading).
- [x] 4.2 `staleTime ≈ 60 s` for clinical reads **and** invalidate-on-mutation; **never** serve a write response from cache.

### 5. OPD today (NP-Q6 #4)
- [x] 5.1 Port `queue-session` / queue reads with **`staleTime = STALE.LIVE` (0)** — the queue is operationally live (NP-R4); always revalidate.

### 6. Mutations → invalidation
- [x] 6.1 For writes on these surfaces (booking, prescription, consult actions), `invalidateQueries` the affected read keys so the UI reflects the change immediately. Audit that no mutation response is cached.

### 7. Logout / user-switch hygiene
- [x] 7.1 Ensure the query cache is **cleared on sign-out / user switch** (`queryClient.clear()`), so one user's cached PHI never shows for the next session.

### 8. Verify (prod build, NP-DL-6)
- [x] 8.1 Repeat-nav to each migrated surface renders cached (no spinner) and revalidates behind; record repeat-nav FCP + requests/nav vs [`../../p0-measure/baseline.md`](../../p0-measure/baseline.md).
- [x] 8.2 `npx tsc --noEmit` clean; existing tests green; no new console errors.

---

## 🌍 Global safety gate (MANDATORY)

- [x] **Data touched?** Reads (clinical + operational) now cached client-side; writes only trigger invalidation. **RLS unaffected** — same endpoints, same authenticated user.
- [x] **Any PHI in logs / keys / storage?** Keys use IDs only. Cache is **in-memory only** — **not** persisted to `localStorage`/disk. Cleared on logout (task 7).
- [x] **External API or AI call?** No new endpoints (NP-DL-5).
- [x] **Retention / deletion impact?** No persistence; cache lifetime ≤ session, cleared on sign-out.

---

## ✅ Acceptance & verification criteria

- [x] Revisiting a migrated surface within its `staleTime` renders **cached data, no spinner**, then revalidates in the background.
- [x] **No duplicate in-flight identical reads**; counts come from exactly one source (one `/queue-session`, one `/kpis`).
- [x] OPD queue + live-consult vitals are **never served stale** (zero `staleTime`); mutations invalidate the right keys; no write response cached (NP-DL-2 / NP-R4).
- [x] Cache cleared on logout / user switch.
- [x] No endpoint/shape/route/visible-behaviour change except speed (NP-DL-5).
- [x] Prod-build repeat-nav improvement recorded vs baseline; `tsc` clean; tests green.

## 🚫 Anti-goals

- ❌ Don't change any endpoint, request/response shape, or route (NP-DL-5).
- ❌ Don't cache OPD queue / live vitals with a non-zero stale time (NP-R4).
- ❌ Don't persist the cache (no `localStorage`/`IndexedDB` PHI).
- ❌ Don't migrate the long tail of ~80 fetches here — daily-driver surfaces only.
- ❌ Don't touch server auth (np-06) or provider wiring (np-04).

## ⚠️ Risks

- **Stale clinical data (NP-R4, High).** A wrong `staleTime` could show outdated vitals/queue → zero-stale for live reads + invalidate-on-mutation; reviewer checks each clinical key.
- **Cross-user PHI leak via cache.** Not clearing on logout could surface a prior user's data → task 7 (`queryClient.clear()`).
- **Focus-refetch storms.** `refetchOnWindowFocus` on a heavy page could over-fetch → tune per surface; lean on `staleTime` to gate.
- **Migration drift (NP-R5).** Going beyond the daily-driver set destabilises many pages → keep scope to NP-Q6 surfaces; split per surface if long.

## 📝 Notes (design / approach)

- **Order = baseline offenders (NP-Q6):** cockpit (~9 GETs) and patient detail (~10 GETs, waterfall) are migrated first because they carry the most felt lag; opd-today is last but gets the strictest freshness (zero stale).
- **Dedupe rides the cache:** once both `useDashboardCounts` mounts share one query key, TanStack collapses them to a single request automatically — that *is* R-DEDUPE-POLL, no bespoke singleton needed.
- **Freshness is a feature, not a regression:** the win is "no spinner for data you just saw", not "show old clinical data" — hence conservative/zero stale on clinical-live reads and always-invalidate after writes.

**Shipped hooks:** `useAppointmentsQuery`, `useRxSentTodayQuery`, `usePendingReviewsCountQuery`, `useOpdQueueSessionQuery`, `useDoctorSettingsQuery`, `useOpdSessionQuery`, `usePatientsListQuery`, `usePatientOverviewQuery`, `usePatientVitalsQuery`, `usePatientPrescriptionsQuery`, `useLogout`.

---

## 🔗 Related

- Depends on: [`task-np-04-query-cache-foundation.md`](./task-np-04-query-cache-foundation.md)
- Parallel (Wave 1): [`task-np-06-ssr-auth-dedupe.md`](./task-np-06-ssr-auth-dedupe.md)
- Baseline: [`../../p0-measure/baseline.md`](../../p0-measure/baseline.md)
- Code-change rules: [`../../../../../../process/CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md)

---

**Last Updated:** 2026-05-31
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/CODE_CHANGE_RULES.md` · `process/EXECUTION-ORDER-GUIDELINES.md`
