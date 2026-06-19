# Nav performance — capture (deferred / future / debt)

> Parking lot for dashboard navigation latency, DB path profiling, and aggregator round-trips.  
> **Program:** [`../../Daily-plans/May 2026/31-05-2026/navigation-performance/`](../../Daily-plans/May%202026/31-05-2026/navigation-performance/)

## Decisions needed

- [ ] **np-11 (direct-PG)** — promote ONLY IF co-located per-RTT floor stays > ~100 ms after API region move; otherwise never ship. (Source: inbox 2026-05-31, NP-Q7)

## Future features

_Add exploration items here during triage._

## Debt / hardening

- [ ] **Infra follow-up** — co-locate prod API with Supabase region (DEL edge → likely `ap-south-1`), then re-run `backend/scripts/measure-p4-db-path-profile.ts` from prod.

## Promoted / done

_Move lines here when promoted to Daily-plans or closed._
