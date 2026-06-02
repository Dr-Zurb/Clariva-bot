# np-06 · Validate the user once per navigation (retire the layout→page `getUser()` double hop)

> **Phase 2, Wave 1 (Lane β)** of [navigation-performance](../plan-p2-navigation-performance-cache-dedupe-batch.md). Removes the redundant server-side auth round-trip each navigation pays (product-plan R-SSR-AUTH / F5). **Server-side only — independent of the cache work, runs parallel to np-04.** Auth-**adjacent**: it must preserve every redirect and never weaken verification (np-02 owns that). Honours **NP-DL-2 / NP-DL-5**.

| **Size** | S/M | **Model** | Sonnet 4.6 | **Wave** | 1 | **Depends on** | np-02 (verify path) | **Blocks** | — | **Status** | ✅ DONE |

---

## 📋 Task overview

Validate the authenticated user **once** per server render and reuse that result, instead of `dashboard/layout.tsx` calling `supabase.auth.getUser()` and then each page calling `getUser()` + `getSession()` again. Net effect: one server-side auth read per navigation (down from ≥2 across the **12** call sites), with **identical** redirect/authorization behaviour and tokens still reaching the client components that need them.

**Change type:** **Update existing** (server auth reads). MUST follow [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

**Current state (verified in code):**
- ✅ `lib/auth/server-user.ts` wraps `getUser()` / `getSession()` in React `cache()` for one read per request.
- ✅ `dashboard/layout.tsx` + all dashboard pages consume the memoized util; placeholder pages rely on layout gate only.
- ✅ Consult deeplink keeps `doctor_id !== user.id` check via cached `getServerUser()`.

---

## ✅ Task breakdown (hierarchical)

### 1. One validated auth read per request
- [x] 1.1 Introduce a **request-memoized** server auth read — wrap the `getUser()` (and session, if needed) in React's `cache()` in a shared server util (e.g. `lib/auth/server-user.ts`), so repeated calls within a single render resolve to one underlying read. (Alternative: hoist the gate into `middleware.ts`; pick one and note why.)
- [x] 1.2 `dashboard/layout.tsx` performs the validation; pages consume the **memoized** util rather than calling `getUser()`/`getSession()` again.

### 2. Preserve the token-passing contract
- [x] 2.1 Client components that currently receive the access token (for `lib/api.ts` calls) **still receive it** — don't break the prop/session contract np-05's migrated surfaces rely on.

### 3. Preserve redirects + authorization (NP-DL-2)
- [x] 3.1 Unauthenticated access still redirects exactly as today (same target, same status); any role/authorization checks are unchanged.
- [x] 3.2 Confirm no page relied on its own `getUser()` for a **distinct** authorization decision the layout doesn't make — if one does, keep that check (don't over-collapse).

### 4. Reduce the call sites
- [x] 4.1 Walk the 12 server `getUser()` sites; remove the redundant per-page re-validation where the layout/util already covers it; leave genuinely-separate entry points intact.

### 5. Verify
- [x] 5.1 Instrument/log (temporarily) to confirm **one** `getUser()` per dashboard navigation (not layout + page).
- [x] 5.2 Auth redirects, deep-links, and refresh all behave as before (manual pass on a protected route while signed out).
- [x] 5.3 `npx tsc --noEmit` clean; existing tests green.

---

## 🌍 Global safety gate (MANDATORY)

- [x] **Data touched?** Identity/authn (server-side). → **RLS verified?** N/A at this layer; downstream still receives the same authenticated user — this only removes a *duplicate* read, it does not change *who* is authenticated.
- [x] **Any PHI in logs?** **No** — the temporary instrumentation (5.1) logs a count/marker, not user data; remove it before merge.
- [x] **External API or AI call?** **Fewer** — collapses ≥2 GoTrue reads per nav to 1.
- [x] **Retention / deletion impact?** No.

---

## ✅ Acceptance & verification criteria

- [x] Exactly **one** server-side `getUser()` per navigation (layout validates; pages reuse it).
- [x] Unauthenticated access still redirects identically; authorization decisions unchanged.
- [x] Tokens still reach client components that need them (np-05 surfaces keep working).
- [x] Verification logic **unchanged** (np-02 still owns the security boundary).
- [x] `npx tsc --noEmit` clean; tests green; temporary instrumentation removed.

## 🚫 Anti-goals

- ❌ Don't weaken or re-implement token verification (np-02 owns it).
- ❌ Don't change any redirect target/behaviour or authorization rule.
- ❌ Don't drop a token/session a client component depends on.
- ❌ Don't touch the client cache (np-04/np-05) or edit the same client files.

## ⚠️ Risks

- **Over-collapsing an authorization gate.** A page's `getUser()` might guard a decision the layout doesn't make → audit each site (3.2) before removing.
- **Token starvation.** Removing a page's `getSession()` could starve a client component of its token → preserve the passing contract (2.1).
- **Middleware blast radius.** If hoisting to `middleware.ts`, a wrong matcher could over/under-protect routes → scope the matcher narrowly and test signed-out deep-links.

## 📝 Notes (design / approach)

- **Why `cache()` over a refactor:** React's per-request `cache()` memoizes the auth read across layout + page **without** restructuring how pages get their data — the smallest change that kills the double hop while keeping redirects local and obvious.
- **Independent of the cache work:** this is server-only and shares no files with np-04/np-05, which is exactly why it runs parallel in Wave 1 (see exec-order §"Why this shape").
- **Cheap now, still worth it:** np-02 made each `getUser()` fast, but a redundant per-page round-trip is still latency on the critical path before data fetch — and halving it is a clean, low-risk win.

**Approach chosen:** `cache()` in `lib/auth/server-user.ts` (not middleware) — keeps redirect logic in layout/pages, avoids middleware matcher blast radius.

**Shipped:** `lib/auth/server-user.ts` (`getServerSupabase`, `getServerUser`, `getServerSession`, `requireDashboardAuth`); updated `dashboard/layout.tsx` + 10 page routes.

---

## 🔗 Related

- Parallel (Wave 1): [`task-np-04-query-cache-foundation.md`](./task-np-04-query-cache-foundation.md)
- Builds on: [`../../p1-backend-tax/Tasks/task-np-02-local-jwt-verification.md`](../../p1-backend-tax/Tasks/task-np-02-local-jwt-verification.md)
- Code-change rules: [`../../../../../../process/CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md)

---

**Last Updated:** 2026-05-31
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/CODE_CHANGE_RULES.md` · `process/EXECUTION-ORDER-GUIDELINES.md`
