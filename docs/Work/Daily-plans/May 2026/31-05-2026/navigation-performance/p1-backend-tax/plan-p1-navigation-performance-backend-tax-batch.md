# Navigation performance — Phase 1: backend request-tax removal — batch plan

> **Product plan (what + why + decision locks):** [`../../../../../Product%20plans/plan-navigation-performance.md`](../../../../../Product%20plans/plan-navigation-performance.md) — R-AUTH-VERIFY + R-AUDIT-ASYNC.
>
> **Builds on Phase 0 ([p0-measure](../p0-measure/)).** The baseline is captured in [`../p0-measure/baseline.md`](../p0-measure/baseline.md); this phase removes the two serial network round-trips every authenticated request pays **before any business logic runs**, then proves the win against np-01's numbers.
>
> **Encodes:** **NP-DL-2** (preserve security + compliance — invalid tokens still rejected, **no audit event dropped**), **NP-DL-3** (backend tax first — it multiplies across every page). **NP-Q2 resolved (2026-05-31): detect the project's Supabase JWT signing scheme first, then verify accordingly** (no pre-commitment to HS256 vs JWKS).
>
> **Cost-aware model strategy:** [`../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p1-navigation-performance-backend-tax.md`](./Tasks/EXECUTION-ORDER-p1-navigation-performance-backend-tax.md).

---

## The problem this phase fixes (verified in code)

Every authenticated request flows through `authenticateToken` in `backend/src/middleware/auth.ts`, which does two serial round-trips before calling `next()`:

1. **`supabase.auth.getUser(token)`** — an HTTP round-trip to Supabase's hosted Auth (GoTrue) server to validate the JWT, on *every* request.
2. **`await logAuditEvent(...)`** — an `audit_logs` INSERT over PostgREST (`backend/src/utils/audit-logger.ts`), which **blocks** the request from proceeding.

This is the ~600–900ms floor seen across trivial endpoints in the Phase 0 baseline (and the product plan's finding F1/F2). Removing it speeds up *literally every* page, which is why it is sequenced first.

---

## Scope (this phase)

| Task | Title | Status |
|---|---|---|
| [np-02](./Tasks/task-np-02-local-jwt-verification.md) | Verify the access token **locally** in the auth middleware (retire the per-request GoTrue round-trip) | ✅ done |
| [np-03](./Tasks/task-np-03-audit-logging-off-hot-path.md) | Move audit logging **off** the request hot path (non-blocking, lossless) | ✅ done |

**Order:** np-02 first (it establishes the new middleware shape and is the security-critical change), then np-03 (audit emit). **Both edit `auth.ts`**, so they run as a single sequential lane — not in parallel (see exec-order).

**Deliverable:** authenticated-request floor drops to < ~100ms in the prod build (vs np-01 baseline), with invalid/expired tokens still rejected exactly as before and **zero audit events dropped**.

---

## Decision locks honoured

- **NP-DL-2 — security + compliance preserved.** np-02 must keep rejecting invalid/expired/garbage tokens (fail closed on any verify error); np-03 must guarantee no audit event is lost (queue + flush on graceful shutdown), and failed-auth security events stay recorded.
- **NP-DL-3 — backend first.** This phase precedes all frontend work.
- **Revocation tradeoff (documented):** local verification means a revoked refresh token isn't caught until the short-lived access token expires. Accepted for ~1h tokens; recorded in np-02. Token rejection on expiry/refresh is unchanged.

---

## Acceptance gate (phase)

- [x] Prod-build authenticated-request floor materially reduced vs np-01 (**p50 680→484 ms**, −29%) — see [`p1-measurement-results.md`](./p1-measurement-results.md). **< ~100 ms not met** on full GET (Supabase DB RTT remains; auth tax removed).
- [x] No synchronous GoTrue round-trip and no synchronous audit write remain in the request path.
- [x] Invalid / expired / tampered tokens still return 401; `req.user` shape unchanged for all downstream controllers.
- [x] No audit event dropped under normal load (60/60 load test); failed-auth `logSecurityEvent` still recorded (unit tests).
- [x] Existing auth/integration tests green; `npx tsc --noEmit` clean.

**Prior phase:** [`../p0-measure/`](../p0-measure/)
**Next phase:** Phase 2 (client cache + dedupe) — promote as `../p2-<slug>/` here once NP-Q1 (cache library) is locked.
