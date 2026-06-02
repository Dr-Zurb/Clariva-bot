# Navigation performance — Phase 1 (backend tax) — execution order

> Sibling document of [`plan-p1-navigation-performance-backend-tax-batch.md`](../plan-p1-navigation-performance-backend-tax-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [`../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (1 wave)

```
Wave 1 (Backend request-tax removal — ~2–3.5d, single lane sequential):
  Lane α  ──── np-02 (M, Opus 4.7) ──> np-03 (M, Sonnet 4.6)
```

**Total wall-clock:** ~2–3.5d.
**Total agent-time (sequential equivalent):** ~2–3.5d.

The bottleneck is Wave 1 — **single lane, sequential, because both tasks edit `backend/src/middleware/auth.ts`.** They are *not* independent lanes (shared file + np-03 reasons about the request path np-02 just reshaped), so the §5 lane gate fails and we collapse to Shape A. np-02 is the security-critical change and goes first.

---

## Lane-by-lane details

### Wave 1 — Backend request-tax removal (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | np-02 | M | **Opus 4.7** | `backend/src/middleware/auth.ts`, `backend/src/config/database.ts`, `backend/src/config/env.ts`, `backend/src/utils/errors.ts` | Security-critical: local JWT verify, detect signing scheme first (NP-Q2). Fail closed. Keep `req.user` shape. |
| 1 | np-03 | M | Sonnet 4.6 | `backend/src/utils/audit-logger.ts`, `backend/src/middleware/auth.ts`, server bootstrap/shutdown hook | Audit off hot path; lossless queue + shutdown drain. Waits on np-02 (same file). |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| np-02 | M | **Opus 4.7** | Touches the **authentication** path — a security boundary. Mis-verifying a token is a critical failure (NP-R1). Reserve the one Opus slot here per the efficiency guide ("security/PHI"). |
| np-03 | M | Sonnet 4.6 | Compliance-sensitive but well-spec'd (move an awaited write to a lossless async queue). No new auth logic. |

**Caps respected:** 1 Opus task in this wave, 1 in the batch (≤ 1/wave, ≤ 2/batch).

---

## Acceptance gates per wave

### Wave 1 gate
- [x] All Phase 0 gates still green (baseline table still valid; measurement-only change unaffected).
- [x] Prod-build authenticated-request floor **materially reduced** vs np-01 (**p50 −196 ms**); **< ~100 ms not reached** on trivial GET — DB RTT; see [`p1-measurement-results.md`](./p1-measurement-results.md).
- [x] No synchronous GoTrue round-trip in the request path (grep: no `supabase.auth.getUser(` on the hot path except the explicit fallback).
- [x] No `await logAuditEvent`/`await logSecurityEvent` in the synchronous request path (`auth.ts` uses `void`).
- [x] Invalid / expired / tampered / missing tokens still return 401; a valid token still populates `req.user` identically (downstream controllers unchanged).
- [x] Audit completeness: **60/60** authenticated requests → `audit_logs` rows in load test; shutdown drain wired.
- [x] Existing auth + integration tests green; `npx tsc --noEmit` clean.

---

## Cost estimate

| Wave | Tasks | Sonnet 4.6 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|
| 1 — backend tax | np-02, np-03 | 1 | 1 | ~2–3.5d |

---

## References

- Plan: [`plan-p1-navigation-performance-backend-tax-batch.md`](../plan-p1-navigation-performance-backend-tax-batch.md)
- Product plan: [`../../../../../../Product%20plans/plan-navigation-performance.md`](../../../../../../Product%20plans/plan-navigation-performance.md)
- Model strategy: [`../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)
- Prior phase baseline: [`../../p0-measure/Tasks/task-np-01-baseline-instrumentation.md`](../../p0-measure/Tasks/task-np-01-baseline-instrumentation.md)
