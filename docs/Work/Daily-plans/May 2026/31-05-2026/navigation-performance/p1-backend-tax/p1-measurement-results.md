# Phase 1 measurement results (np-02 + np-03 gate)

> **Captured:** 2026-05-31 · **Script:** `backend/scripts/measure-p1-auth-floor.ts` · **Baseline:** [`../p0-measure/baseline.md`](../p0-measure/baseline.md)

---

## Setup

| Item | Value |
|------|-------|
| Build | `npm run build` → `node dist/index.js` |
| `NODE_ENV` | `production` |
| Port | `3002` (isolated from dev on `:3001`) |
| Auth | E2E doctor login → Supabase access token; local HS256 verify (`SUPABASE_JWT_SECRET` set) |
| Endpoint | `GET /api/v1/settings/doctor/cockpit-presets` (np-01 Today capture sample) |
| Samples | 60 (after 5 warmup) |

---

## Authenticated-request floor (client RTT ≈ server `durationMs` on localhost)

| Metric | np-01 prod baseline (Today aggregate) | **P1 after np-02/np-03** | Δ |
|--------|--------------------------------------:|-------------------------:|--:|
| p50 `durationMs` | ~680 | **484** | **−196 ms (−29%)** |
| p95 `durationMs` | ~1 280 | **539** | **−741 ms (−58%)** |
| min / max | — | 464 / 616 | — |

**Budget (< ~100 ms p50):** **Not met** on this endpoint. F1 (GoTrue `getUser`) and F2 (blocking audit insert) are removed; remaining floor is dominated by **Supabase PostgREST round-trip** for the handler query (~400–500 ms from this host), not auth middleware. That DB latency is out of Phase 1 scope (Phase 2+ cache/dedupe).

**Gate interpretation:** Phase 1 delivered the intended **auth-tax removal** (measurable ~200 ms+ win vs np-01 on the same class of endpoint). The North-star **< ~100 ms trivial GET** budget requires further phases once business-logic/DB paths are addressed.

---

## Audit completeness (np-03)

| Check | Result |
|-------|--------|
| Authenticated requests | 60 |
| `audit_logs` rows (`action=authenticate`, matching `correlation_id`) | **60** |
| Completeness | **PASS** (100%) |
| Flush lag | 3 s wait after last request; all rows visible |

Failed-auth security events were not load-tested here (covered by unit tests in `auth.test.ts` + `audit-logger.test.ts`).

---

## Re-run

```bash
cd backend
npm run build
NODE_ENV=production PORT=3002 node dist/index.js &
npx ts-node -r dotenv/config scripts/measure-p1-auth-floor.ts --base-url=http://localhost:3002
# optional: --endpoint=/api/v1/patients/kpis  (may hit rate limit under burst)
```

Requires `SUPABASE_JWT_SECRET` + E2E creds in `frontend/.env.local` (or `TEST_DOCTOR_JWT`).

---

## Raw JSON (2026-05-31T06:28:09Z)

```json
{
  "capturedAt": "2026-05-31T06:28:09.866Z",
  "baseUrl": "http://localhost:3002",
  "endpoint": "/api/v1/settings/doctor/cockpit-presets",
  "sampleCount": 60,
  "durationMs": { "min": 464, "p50": 484, "p95": 539, "max": 616 },
  "audit": { "requests": 60, "rowsMatched": 60, "complete": true },
  "np01BaselineProd": { "p50": 680, "p95": 1280 },
  "budgetMs": 100
}
```
