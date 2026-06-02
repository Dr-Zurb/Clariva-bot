# Phase 4 np-10 measurement results (fan-out reduction)

> **Captured:** 2026-05-31 · **Baseline:** [`p4-measurement-results.md`](./p4-measurement-results.md) (np-09) · **Build:** prod `node dist/index.js` / in-process service timing (avoids HTTP rate-limit during burst)

---

## Changes shipped (np-10)

| Area | Change |
|------|--------|
| **Overview wave A+B** | Patient fetch ∥ ownership probes → **1 wave** (was 2 serial) |
| **Overview wave D** | `fetchPaymentEvents` starts when appointments resolve; **overlaps** wave C (not after all 6 sections) |
| **Prescriptions section** | PostgREST embed `prescription_medicines` + `prescription_attachments` → **1 RT** (was N+1); `skipAccessGate` when overview already gated |
| **KPI compute** | **Parallel** fetch wave (apt + linked ids + rx + problems + duplicates); `new_30d` / `new_7d` via **`count`/`head:true`** (no full patient row transfer) |

Task **3.1** (caller dedup) deferred — np-09 ranked backend aggregators; no endpoint/shape change required (NP-DL-5).

---

## Cold timing vs np-09 (same E2E fixture, sparse chart)

| Metric | np-09 p50 | np-10 p50 | Δ |
|--------|----------:|----------:|--:|
| Patient overview (in-process) | **1889 ms** (wave Σ) / **1833 ms** (HTTP) | **949 ms** | **−48%** |
| Overview wave AB (tenant gate) | 306 + 327 = **633 ms** | **239 ms** | **−62%** |
| Overview wave C (sections) | **1017 ms** | **697 ms** | **−31%** |
| Overview wave D (payments) | **239 ms** (serial after C) | **233 ms** (overlapped in C) | removes serial gap |
| KPI cold (in-process, cache flushed) | **~2350 ms** (HTTP miss) | **1011 ms** | **−57%** |

**Sequential Supabase waves (overview):** **~4 → ~2** (AB merged; C includes overlapped D).

---

## Tenant isolation (NP-DL-7)

| Check | Result |
|-------|--------|
| Parity battery | `backend/tests/unit/services/patient-overview-fanout-tenant.test.ts` — **3/3 green** |
| `doctor_id` on every changed query path | Verified via mock chain assertions |
| Response contract | Unchanged shape; pure-function unit suite **23/23 green** |

---

## Re-run

```bash
cd backend
npm run build
# In-process (PHI-free wave log):
NP_DB_PROFILE=1 node -r dotenv/config -r ts-node/register -e "
  require('dotenv').config({ path: '../frontend/.env.local' });
  process.env.NP_DB_PROFILE='1';
  // … see measure-p4-db-path-profile.ts or in-process snippet in np-09 results
"
npm test -- --testPathPattern=patient-overview
```

---

## Raw JSON (2026-05-31T12:01:24Z)

```json
{
  "overviewInProcess": { "p50": 949, "waveAB_ms": 239, "waveC_ms": 697, "waveD_ms": 233 },
  "kpiInProcessCold": { "p50": 1011 },
  "np09Baseline": { "overviewP50": 1833, "waveSum": 1889, "kpiCold": 2350 }
}
```
