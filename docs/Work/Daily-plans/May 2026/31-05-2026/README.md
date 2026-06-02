# 31 May 2026 — daily plan README

> Day overview for batches scheduled to plan or ship on 2026-05-31. **Structure:** each product plan gets one folder; phases live as `p{N}-<slug>/` subfolders inside it.

---

## Plans on this day

| Plan folder | Phases here | Product plan |
|---|---|---|
| [`booking-review-redesign/`](./booking-review-redesign/) | p1 reskin · p2 workflow · p3 depth | [`plan-booking-review-redesign.md`](../../../Product%20plans/plan-booking-review-redesign.md) |
| [`navigation-performance/`](./navigation-performance/) | p0 ✅ · p1 ✅ · p2 cache+dedupe ✅ · p3 perceived+streaming ✅ · p4 data-path (promoted) | [`plan-navigation-performance.md`](../../../Product%20plans/plan-navigation-performance.md) |

**Cockpit v3** Phases 2–5 live under [`../30-05-2026/cockpit-v3/`](../30-05-2026/cockpit-v3/) (same plan folder as Phases 0–1). Phase 4 (cutover) began the flip; **Phase 5 (tab model), planned today**, inserts ahead of the soak to fix the unbuildable v3 canvas (flatten columns → uniform tabs), then Phase 4's tail (soak → delete → docs) resumes.

---

## Program map

```
Booking review redesign (all phases in booking-review-redesign/)
  p1  booking-review-redesign/p1-reskin/      ← reskin (no backend)
  p2  booking-review-redesign/p2-workflow/    ← workflow wins
  p3  booking-review-redesign/p3-depth/       ← depth + platform

Navigation performance (all phases in navigation-performance/)
  p0  navigation-performance/p0-measure/       ← baseline + perf budget (gates the program) ✅ shipped
  p1  navigation-performance/p1-backend-tax/   ← local JWT verify + audit off hot path (np-02..03) ✅ shipped (p50 −29%)
  p2  navigation-performance/p2-cache-dedupe/       ← TanStack Query cache + dedupe + SSR-auth (np-04..06) ✅ shipped
  p3  navigation-performance/p3-perceived-streaming/ ← loading.tsx skeletons + server prefetch/Hydration streaming (np-07..08) ✅ shipped
  p4  navigation-performance/p4-data-path/          ← profile + collapse DB round-trips, counts DB-side (np-09..10; np-11 direct-PG gated) ✅ promoted

Cockpit v3 (continued — see 30 May)
  ../30-05-2026/cockpit-v3/p2-dnd/
  ../30-05-2026/cockpit-v3/p3-platform/
  ../30-05-2026/cockpit-v3/p4-cutover/   ← parity ✅ · flip ✅ · (soak → delete → docs, gated on p5)
  ../30-05-2026/cockpit-v3/p5-tab-model/ ← planned today: flatten columns → tabs, fix build-up canvas (cv3t-01..03)
```

---

## Sequencing notes

1. **Booking review:** Phase 1 → 2 → 3 within [`booking-review-redesign/`](./booking-review-redesign/). Phase 1 is zero-backend.
2. **Cockpit v3:** Requires [`../30-05-2026/cockpit-v3/p0-scaffold/`](../30-05-2026/cockpit-v3/p0-scaffold/) + [`p1-shell/`](../30-05-2026/cockpit-v3/p1-shell/) before p2 dnd.
3. **Navigation performance:** Phases 0–3 **shipped** (baseline; backend auth/audit tax removed — floor p50 680→484 ms; TanStack Query cache + dedupe + SSR-auth; `loading.tsx` skeletons + server prefetch/`HydrationBoundary` streaming). Phase 4 (**data-path latency**) is **promoted** in [`p4-data-path/`](./navigation-performance/p4-data-path/) and runs next: np-09 profiles the residual ~484 ms / ~2.5 s DB floor (RTT vs PostgREST vs round-trips), np-10 collapses per-request serial round-trips + moves KPI counts DB-side; pooled direct-PG (np-11) is profile-gated (NP-Q7). Governed by **NP-DL-7** (preserve tenant isolation — service-role bypasses RLS, so the `doctor_id` gate + a cross-tenant parity battery are mandatory). See [`navigation-performance/README.md`](./navigation-performance/README.md).

---

## Adjacent reading

- **Product plan — Booking review:** [`../../../Product plans/plan-booking-review-redesign.md`](../../../Product%20plans/plan-booking-review-redesign.md)
- **Product plan — Navigation performance:** [`../../../Product plans/plan-navigation-performance.md`](../../../Product%20plans/plan-navigation-performance.md)
- **Navigation performance (all phases):** [`./navigation-performance/README.md`](./navigation-performance/README.md)
- **Cockpit v3 (all phases):** [`../30-05-2026/cockpit-v3/README.md`](../30-05-2026/cockpit-v3/README.md)
- **Prior day (30 May):** [`../30-05-2026/README.md`](../30-05-2026/README.md)
- **Capture inbox:** [`../../capture/inbox.md`](../../capture/inbox.md)
