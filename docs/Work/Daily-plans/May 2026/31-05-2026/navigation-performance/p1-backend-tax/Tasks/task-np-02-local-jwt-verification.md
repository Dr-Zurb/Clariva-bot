# np-02 · Verify the access token locally in the auth middleware

> **Phase 1, step 1** of [navigation-performance](../plan-p1-navigation-performance-backend-tax-batch.md). Retires the per-request GoTrue round-trip that dominates the request floor (product-plan F1). **Security-critical** — this is the authentication boundary; it must fail closed and preserve every existing rejection. Honours **NP-DL-2**.

| **Size** | M | **Model** | **Opus 4.7** | **Wave** | 1 | **Depends on** | np-01 (baseline) | **Blocks** | np-03 | **Status** | ✅ COMPLETED 2026-05-31 (floor measured: p50 −29%) |

---

## 📋 Task overview

Replace the per-request `supabase.auth.getUser(token)` network call in `backend/src/middleware/auth.ts` with **local cryptographic verification** of the Supabase access token (signature + standard claims), keeping a narrow fallback only when local verification is genuinely inconclusive. Goal: remove ~150–500ms from **every** authenticated request while rejecting exactly the same set of bad tokens as today.

**Change type:** **Update existing** — changes the behaviour of `authenticateToken`. MUST follow [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md) (audit → impact → implement → remove obsolete → tests → docs).

**Current state (verified in code):**
- ✅ `authenticateToken` / `optionalAuthenticateToken` (`backend/src/middleware/auth.ts`) extract the Bearer token and call `supabase.auth.getUser(token)` — a remote validation per request.
- ✅ `req.user` is set from the GoTrue response and consumed by controllers (typed via `types/express.d.ts`).
- ✅ Supabase clients are constructed in `backend/src/config/database.ts`; validated env in `backend/src/config/env.ts`.
- ❌ There is no local JWT verification path and no configured JWT secret / JWKS source yet.

**Scope guard:** expected files touched ≤ 5 (`auth.ts`, a new verify util, `config/env.ts`, possibly `config/database.ts`, tests). Any expansion needs explicit approval.

---

## ✅ Task breakdown (hierarchical)

### 1. Resolve the signing scheme (NP-Q2 — detect first)
- [x] 1.1 Determine which JWT signing scheme the project's Supabase instance uses **before** choosing a verifier: legacy shared-secret (HS256) vs the newer asymmetric keys (verified via JWKS). → **HS256 shared-secret** (see Notes).
- [x] 1.2 Decide the secret/JWKS source and add it to validated env (`config/env.ts`); document where it comes from in Supabase project settings. → `SUPABASE_JWT_SECRET` (already validated; doc updated in `env.ts` + `.env.example`).
- [x] 1.3 Record the chosen scheme + the revocation tradeoff (short-lived access token; revoked refresh token not caught until expiry) in this task's Notes.

### 2. Implement local verification (behaviour-preserving)
- [x] 2.1 Add a verification utility that validates signature and the standard claims (expiry, audience, issuer) and yields the same user identity shape the middleware needs. → `backend/src/utils/supabase-token-verifier.ts`.
- [x] 2.2 Wire `authenticateToken` to verify locally; **fail closed** — any verification error (bad signature, expired, wrong aud/iss, malformed) returns the existing `UnauthorizedError` / 401.
- [x] 2.3 Apply the same change to `optionalAuthenticateToken` (no token → continue; present-but-invalid → same as today).
- [x] 2.4 Keep a narrow, explicit fallback to the remote check only for the genuinely-inconclusive case; ensure it is not the common path. → fallback only on `inconclusive` (secret unset / asymmetric alg / unexpected issuer).

### 3. Preserve the contract + remove obsolete
- [x] 3.1 Confirm `req.user` carries everything downstream controllers read today (no controller changes required). → every consumer reads only `req.user.id` (verified by grep across all controllers/routes); zero controller edits.
- [x] 3.2 Remove/avoid the now-obsolete per-request remote call on the hot path; leave audit logging untouched here (np-03 owns it). → `getUser` removed from the hot path; audit-logging calls unchanged.

### 4. Tests + verification
- [x] 4.1 Token battery test: valid, expired, wrong-signature, wrong-aud/iss, malformed, missing → assert identical status codes/identity to the pre-change behaviour (parity against `getUser`). → `tests/unit/utils/supabase-token-verifier.test.ts` (14) + `tests/unit/middleware/auth.test.ts` (11).
- [x] 4.2 Measure the request floor against the np-01 baseline (prod build) and record the delta. → [`../p1-measurement-results.md`](../p1-measurement-results.md): p50 **680→484 ms** (−29%), p95 **1280→539 ms** (−58%). <100 ms budget not met on full endpoint (Supabase DB RTT remains).
- [x] 4.3 `npx tsc --noEmit` clean; existing auth/integration tests green. → tsc clean; new auth suites green. (Pre-existing unrelated failures remain in payment/appointment/webhook suites — stale Supabase query-builder mocks — and the `@react-pdf/renderer` ESM transform; none touch auth.)

---

## 🌍 Global safety gate (MANDATORY)

- [x] **Data touched?** Yes (identity/authn). → **RLS verified?** N/A at this layer; downstream RLS still receives the same authenticated user — `req.user.id` = the access token `sub` = the same UUID `getUser` returned.
- [x] **Any PHI in logs?** **No** — the verifier logs/returns only opaque reason codes (e.g. `verification_failed`); the middleware's security-event log message is now a generic `'Invalid or expired token'` (no token contents, no claims).
- [x] **External API or AI call?** Reduced — `getUser` removed from the hot path; the inconclusive-only fallback is the sole remaining external auth call.
- [x] **Retention / deletion impact?** No.

---

## ✅ Acceptance & verification criteria

- [x] No `supabase.auth.getUser(` on the synchronous hot path except the explicit narrow fallback. → only in `resolveUserFromToken`'s `inconclusive` branch.
- [x] Token battery parity: every token class returns the same outcome as the pre-change `getUser` path (fail closed). → covered by the two test suites.
- [x] `req.user` shape unchanged; zero controller edits needed.
- [x] Prod-build request floor materially reduced vs np-01 baseline (target contributes to phase < ~100ms). → **Reduced** (−196 ms p50); **<100 ms not reached** — DB round-trip remains (see [`../p1-measurement-results.md`](../p1-measurement-results.md)); residual floor handed to Phase 2 (cache) + likely Phase 4 (NP-Q5).
- [x] Revocation tradeoff documented; signing scheme + env source documented. → see Notes.
- [x] `npx tsc --noEmit` clean; auth tests green.

## 🚫 Anti-goals

- ❌ Don't change `req.user`'s shape or any controller's assumptions.
- ❌ Don't weaken rejection — an inconclusive/erroring verify must **never** fall through to "authenticated".
- ❌ Don't touch audit logging here (np-03).
- ❌ Don't introduce a new auth library beyond what's needed to verify the chosen scheme.

## ⚠️ Risks

- **Mis-verification (highest).** A misconfigured secret/JWKS that accepts a token it shouldn't is critical (NP-R1). Mitigate with the parity battery (4.1) and fail-closed default before any rollout.
- **Scheme mismatch.** Assuming HS256 when the project uses asymmetric keys (or vice-versa) silently breaks verification — hence detect-first (1.1).

---

## 📝 Notes (implementation)

### Signing scheme — **HS256 shared secret** (NP-Q2 resolved)
The project's Supabase instance uses the **legacy HS256 symmetric** signing scheme, not asymmetric JWKS. Evidence (detect-first, before choosing a verifier):
- `backend/src/services/supabase-jwt-mint.ts` signs JWTs **HS256** with `env.SUPABASE_JWT_SECRET` and the live Supabase project **accepts** them at REST + Realtime. That round-trip only works if Supabase verifies with the *same shared secret* — i.e. HS256.
- `backend/scripts/diagnose-text-consult-jwt.ts` documents exactly this: a mismatched `SUPABASE_JWT_SECRET` makes Supabase reject our minted tokens with a `JWSError`/signature error.

**Secret / env source:** `SUPABASE_JWT_SECRET` — Supabase Dashboard → **Project Settings → API → "JWT Secret"**. Already a validated (optional) env var; its doc comment in `config/env.ts` and `.env.example` was updated to describe the new auth-perf consumer.

### Revocation tradeoff (accepted)
Local verification trusts a token until its `exp`. A user who is deleted/banned — or whose **refresh** token is revoked — keeps passing this middleware until their **access** token expires (Supabase default ≈ 1h). This is the standard JWT tradeoff; blast radius is bounded by the short access-token lifetime, and refresh is still blocked at the Supabase layer. This is the intended behaviour for np-02.

### Design: verify locally, fail closed, narrow fallback
`utils/supabase-token-verifier.ts#verifySupabaseAccessToken` returns one of three verdicts; `middleware/auth.ts#resolveUserFromToken` maps them:
- **`verified`** → HS256 signature valid + `aud: authenticated` + not expired + `iss === ${SUPABASE_URL}/auth/v1` + non-empty `sub`. Reconstructs the `@supabase/supabase-js` `User` (id = `sub`, plus standard claims). **Hot path — no network call.**
- **`rejected`** (bad signature, expired, wrong audience, malformed, `alg:none`/unknown, missing subject) → **fail closed → 401**, *no* remote call.
- **`inconclusive`** (secret not configured / asymmetric `alg` we can't verify with the shared secret / validly-signed token with an unexpected issuer) → narrow, explicit fallback to the authoritative `supabase.auth.getUser`. Not the common path.

The `iss` check both adds defense-in-depth and **preserves parity**: our own scoped consult JWTs (minted by `supabase-jwt-mint.ts`, no `iss`) are routed to the remote check — which rejects their synthetic `sub` — exactly as `getUser` does today, so they never gain dashboard access on the fast path. The asymmetric-`alg` fallback is the detect-first guard against a silent scheme migration (NP risk "Scheme mismatch"): if the project ever rotates to JWT signing keys, those tokens degrade to the (correct, slower) remote path instead of being falsely rejected.

### Contract preservation
Every `req.user` consumer across controllers/routes reads only `req.user.id` (verified by grep) — the reconstructed `User` keeps that plus `aud`/`role`/`email`/`app_metadata`/`user_metadata` faithfully (`created_at` is not a JWT claim and is read by no one, so it's left empty). **Zero controller edits.** Audit logging is left exactly as-is (np-03 owns moving it off the hot path).

### Files touched (≤ 5, within scope guard)
1. `backend/src/utils/supabase-token-verifier.ts` (new) — local verifier.
2. `backend/src/middleware/auth.ts` — wire local verify + narrow fallback into both middlewares.
3. `backend/src/config/env.ts` — `SUPABASE_JWT_SECRET` doc comment (no schema/behaviour change).
4. `backend/.env.example` — doc.
5. Tests: `backend/tests/unit/utils/supabase-token-verifier.test.ts`, `backend/tests/unit/middleware/auth.test.ts`.

### Verification status
- `npx tsc --noEmit` → clean.
- New suites green: verifier battery **14/14**, middleware **11/11**.
- Pre-existing, unrelated full-suite failures remain (NOT introduced here): `@react-pdf/renderer` ESM transform ("suite failed to run") and stale Supabase query-builder mocks in payment/appointment/webhook tests (`.limit`/`.maybeSingle is not a function`). None import the auth middleware or the verifier.
- **Open:** task 4.2 — prod-build request-floor delta vs np-01 baseline, to be recorded at the Wave 1 acceptance gate.

---

## 🔗 Related

- Sibling task: [`task-np-03-audit-logging-off-hot-path.md`](./task-np-03-audit-logging-off-hot-path.md)
- Prior phase baseline: [`../../p0-measure/Tasks/task-np-01-baseline-instrumentation.md`](../../p0-measure/Tasks/task-np-01-baseline-instrumentation.md)
- Code-change rules: [`../../../../../../process/CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md)

---

**Last Updated:** 2026-05-31
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/CODE_CHANGE_RULES.md` · `process/EXECUTION-ORDER-GUIDELINES.md`
