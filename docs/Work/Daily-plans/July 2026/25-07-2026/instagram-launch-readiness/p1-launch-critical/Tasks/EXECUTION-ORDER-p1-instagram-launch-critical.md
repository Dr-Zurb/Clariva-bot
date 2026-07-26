# Instagram launch-critical — execution order (p1)

> Sibling of [`../plan-p1-instagram-launch-critical-batch.md`](../plan-p1-instagram-launch-critical-batch.md).  
> **🛑 GATE:** Do not start Wave 1 until `ILR1-D1`…`D5` confirmed and OQ-1/2/3 answered (or defaults accepted).  
> Ops track `ilr-01` may start immediately in parallel.

### Pre-flight (2026-07-25 — execution started)

- [x] `ILR1-D1`…`D5` accepted (defaults in batch plan).
- [x] **OQ-1** → default: doctor disconnect path first; expand patient mapping if Meta sends end-user IDs.
- [x] **OQ-2** → both dashboard event + email.
- [x] **OQ-3** → 7-day warn window.

---

## Wave plan

```
ilr-01  Meta App Review ops (parallel, non-blocking)     [Founder]
        │
🛑 GATE (decision lock)
        │
Wave 1: ilr-03  consent-persist fix                      [Opus]
        │
Wave 2: ilr-02  data-deletion worker                     [Opus]
        │
Wave 3: ilr-04  token health sweep + alerts              [Opus]
        │
Wave 4: ilr-05  close gate                               [Sonnet/Composer]
```

Never two Opus tasks concurrently.

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load |
|------|------|------|-------|----------|
| Ops | **ilr-01** | S | Founder | Meta App Dashboard; privacy policy URL; data-deletion URL |
| W1 | **ilr-03** | S | **Opus** | `booking-funnel.ts` ~652–655; consent persist path |
| W2 | **ilr-02** | M | **Opus** | `data-deletion.ts`; patient/conversation/comment_leads schema; OQ-1 |
| W3 | **ilr-04** | M | **Opus** | `instagram-connect-service.ts` health; `routes/cron.ts`; dashboard-events |
| W4 | **ilr-05** | S | Sonnet | All p1 outputs |

---

## Task files

- [`task-ilr-01-meta-app-review-ops.md`](./task-ilr-01-meta-app-review-ops.md)
- [`task-ilr-02-data-deletion-callback.md`](./task-ilr-02-data-deletion-callback.md)
- [`task-ilr-03-consent-persist-no-slot-link.md`](./task-ilr-03-consent-persist-no-slot-link.md)
- [`task-ilr-04-token-lifecycle-health-sweep.md`](./task-ilr-04-token-lifecycle-health-sweep.md)
- [`task-ilr-05-close-gate-p1.md`](./task-ilr-05-close-gate-p1.md)

---

**Created:** 2026-07-25.
