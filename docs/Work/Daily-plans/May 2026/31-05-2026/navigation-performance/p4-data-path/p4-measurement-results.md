# Phase 4 measurement results (np-09 gate)

> **Captured:** 2026-05-31 · **Script:** `backend/scripts/measure-p4-db-path-profile.ts` · **Build:** `npm run build` → `NODE_ENV=production PORT=3002 node dist/index.js` · **Prior:** [`../p1-backend-tax/p1-measurement-results.md`](../p1-backend-tax/p1-measurement-results.md) · [`../p0-measure/baseline.md`](../p0-measure/baseline.md)

---

## Setup

| Item | Value |
|------|-------|
| Build | `npm run build` → `node dist/index.js` |
| `NODE_ENV` | `production` (API server) |
| Port | `3002` (isolated from dev on `:3001`) |
| Auth | E2E doctor login → Supabase access token |
| Patient (overview) | `cbb28396-8d13-4029-aaed-2aef3bc98001` (E2E panel; PHI-free id) |
| Samples | 20 per HTTP endpoint (after 2 warmup); 10 per Supabase probe |

---

## Region locality (API ↔ Supabase)

| Item | Value |
|------|-------|
| Supabase URL | `https://kqrktfhudeickmdbvavk.supabase.co` |
| Project ref | `kqrktfhudeickmdbvavk` |
| Cloudflare edge (probe) | `cf-ray: …-DEL` (Delhi PoP on REST preflight) |
| API host (this capture) | Local dev machine (`darwin`) — same host as np-01 / P1 |
| Data layer | **100% PostgREST over HTTPS** — no `pg` driver (`backend/src/config/database.ts`) |

**Assessment:** Measurements run from a local API process talking to hosted Supabase. Per-call floor (~230–330 ms direct PostgREST, ~450 ms trivial HTTP GET) is dominated by **HTTPS + PostgREST fixed cost**, not payload size (see probes below). Production API deploy region must be aligned with the Supabase project region (likely **ap-south-1** given DEL edge routing) before evaluating direct-PG.

---

## Supabase three-probe attribution (from API host)

Separates **fixed RTT/PostgREST** from **payload/query** cost (service-role client, no Express auth).

| Probe | p50 (ms) | p95 (ms) | Interpretation |
|-------|---------:|---------:|----------------|
| (a) Trivial `select … limit 1` (`doctor_settings`) | **313** | 329 | Fixed per-round-trip floor |
| (b) `head:true, count:'exact'` (`appointments`) | **228** | 234 | Count path — same order of magnitude |
| (c) Moderate select 50 rows (`appointments`) | **234** | 282 | **Δ vs (a): −79 ms** → payload/query **not** the bottleneck |

**Conclusion:** Residual cost is **not** query execution or row payload on these paths. It is **per-round-trip HTTPS + PostgREST overhead** (~230–330 ms from Node; ~450 ms through full authenticated HTTP handler).

---

## Hot-endpoint round-trip inventory

| Surface | Endpoint | Supabase round-trips (approx.) | Serial / parallel |
|---------|----------|-------------------------------:|-------------------|
| **Cockpit home** | `GET /api/v1/settings/doctor/cockpit-presets` | **1** | serial |
| | `GET /api/v1/appointments` (+ other zones) | 2–3 each | mostly serial per handler |
| **Patients list** | `GET /api/v1/patients/kpis` | **6–8** | mixed (see KPI section) |
| | `GET /api/v1/patients` | 1–2 | serial |
| **Patient detail** | `GET /api/v1/patients/:id/overview` | **4 sequential waves**; wave C = 6 parallel branches + rx **N+1** | A→B→C→D serial |
| **OPD today** | `GET /api/v1/opd/queue-session` (+ day context) | **2–4** | serial session → entries |

### `getPatientOverview` wave breakdown (in-process, `NP_DB_PROFILE=1`)

| Wave | Step | Wall time (ms) | Row counts (PHI-free) |
|------|------|---------------:|------------------------|
| **A** | `findPatientByIdWithAdmin` | **306** | 1 patient row |
| **B** | ownership (`appointments` ∥ `conversations`) | **327** | 2 probes |
| **C** | 6 sections (`Promise.all`) | **1017** | allergies 0, conditions 0, problems 0, vitals 0, rx 1, appts 2 |
| **D** | `fetchPaymentEvents` | **239** | payments 1 |
| **Σ** | | **1889** | matches HTTP p50 ~1833 ms |

**Wave C dominates** even on a sparse chart (1 rx, 2 appts) because `listPrescriptionsByPatient` runs **N+1** queries (ownership ×2 + list + 2× per prescription for medicines/attachments).

### `computePatientsKpis` payload (count-heavy)

| Dataset transferred for JS counting | Rows (E2E doctor) |
|---------------------------------------|------------------:|
| All `appointments` (`patient_id, appointment_date`) | **6** |
| All follow-up `prescriptions` | **0** |
| `patient_problem_list_v` (episodes) | **3** |
| Linked patient ids (apt + conv union) | **6** |

Full row sets are fetched to count in TypeScript — np-10 should replace with PostgREST `count`/`head` where safe.

---

## Endpoint server time (prod build, client RTT ≈ server on localhost)

| Endpoint | p50 (ms) | p95 (ms) | Notes |
|----------|---------:|---------:|-------|
| Trivial GET `/settings/doctor/cockpit-presets` | **454** | 466 | Aligns with P1 ~484 ms floor |
| Patient overview `/patients/:id/overview` | **1833** | 2019 | Down from baseline ~2530 ms (sparse fixture) but still **~4× trivial GET** |
| Patients KPIs `/patients/kpis` (cache **miss**) | **~2350** | — | First request after server start (`X-KPIs-Cache: miss`) |
| Patients KPIs (cache **hit**, 60 s LRU) | **~230** | 238 | Subsequent requests in window |

---

## Attribution summary

| Factor | Evidence | Share of problem |
|--------|----------|------------------|
| **Network RTT + PostgREST fixed cost** | Probes (a–c) all ~230–330 ms; trivial GET ~454 ms | **Dominant per round-trip** — not fixable by query tuning alone |
| **Query / payload time** | 50-row select **faster** than trivial limit-1 in p50 | **Negligible** on hot paths |
| **Round-trip count** | Overview Σ waves ≈ endpoint time; KPI cold ~2350 ms for 6–8 trips; rx N+1 in wave C | **Dominant multiplier** on aggregators |

---

## Ranked lever recommendation (for np-10 / np-11)

| Rank | Lever | Rationale |
|------|-------|-----------|
| **1** | **R-FANOUT (np-10)** | Round-trip count dominates aggregators (4 serial overview waves; KPI fetch-all; rx N+1). Collapsing waves + DB-side counts is the **certain code win** with existing PostgREST + tenant gates. |
| **2** | **Co-location (infra)** | Align production API region with Supabase project (ap-south-1 / DEL edge). Cuts per-RT floor before considering direct-PG. |
| **3** | **Direct-PG (np-11)** | **Deferred** — see NP-Q7 below. |

---

## NP-Q7 resolution (direct-PG go/no-go)

**Decision: NO-GO on direct-PG (np-11) for this batch.**

| Criterion (product-plan rule) | Result |
|-------------------------------|--------|
| PostgREST/connection overhead dominates (not RTT)? | **Partial** — ~230–330 ms/call is mostly fixed HTTPS/PostgREST, but **round-trip multiplication** explains overview/KPI more than marginal PostgREST savings alone |
| Cross-region RTT dominates? | **Verify at deploy** — DEL edge suggests India-adjacent routing; production API region must be confirmed |
| Round-trip count dominates? | **Yes** — overview waves + KPI full-fetch + rx N+1 |

**Action:** Ship **np-10** (fan-out reduction + DB-side KPI counts). Re-profile after np-10 + co-location; promote **np-11** only if co-located per-RT floor remains **> ~100 ms** and PostgREST overhead (not trip count) is still the residual.

---

## Instrumentation (guarded)

| File | Guard | Purpose |
|------|-------|---------|
| `backend/src/services/patient-overview-service.ts` | `NP_DB_PROFILE=1` | Per-wave ms + row counts; `consumeOverviewWaveProfile()` for scripts |
| `backend/scripts/measure-p4-db-path-profile.ts` | — | Reproducible capture (probes + endpoints + waves) |

No production behaviour change when `NP_DB_PROFILE` is unset.

---

## Re-run

```bash
cd backend
npm run build
NODE_ENV=production PORT=3002 node dist/index.js &
npx ts-node -r dotenv/config scripts/measure-p4-db-path-profile.ts --base-url=http://localhost:3002
# optional: E2E_PATIENT_ID=… MEASURE_P4_SAMPLES=30
```

Requires `SUPABASE_*` + E2E creds in `frontend/.env.local` (or `TEST_DOCTOR_JWT`).

---

## Raw JSON (2026-05-31T11:56:13Z)

```json
{
  "capturedAt": "2026-05-31T11:56:13.649Z",
  "supabaseProbes": {
    "trivialSingleRow": { "p50": 313, "p95": 329 },
    "headExactCount": { "p50": 228, "p95": 234 },
    "moderateSelect50": { "p50": 234, "p95": 282 }
  },
  "endpointTimings": {
    "trivial-get": { "p50": 454, "p95": 466 },
    "patient-overview": { "p50": 1833, "p95": 2019 },
    "patients-kpis-cached": { "p50": 228, "p95": 238 },
    "patients-kpis-cold-miss": { "p50": 2350 }
  },
  "patientOverviewWaves": {
    "waveA_findPatientMs": 306,
    "waveB_ownershipMs": 327,
    "waveC_sectionsMs": 1017,
    "waveD_paymentsMs": 239
  },
  "npQ7": "NO-GO direct-PG; np-10 first"
}
```
