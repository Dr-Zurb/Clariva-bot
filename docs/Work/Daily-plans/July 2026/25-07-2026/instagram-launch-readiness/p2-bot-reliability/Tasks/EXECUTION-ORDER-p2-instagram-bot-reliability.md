# Instagram bot reliability — execution order (p2)

> Sibling of [`../plan-p2-instagram-bot-reliability-batch.md`](../plan-p2-instagram-bot-reliability-batch.md).  
> **Start only after p1 `ilr-05` closed.** Confirm `ILR2-D*` + OQ-1/2 before Wave 1.

---

## Wave plan

```
Wave 1: ilr-06  throttle desync          [Opus]
Wave 2: ilr-07  non-text mid-funnel      [Sonnet/Opus]
Wave 3: ilr-08  staff-review SLA         [Opus]
Wave 4: ilr-09  webhook signature        [Opus]
Wave 5: ilr-10  close gate               [Sonnet/Composer]
```

Serial Opus waves (≤1 concurrent).

---

## Task files

- [`task-ilr-06-throttle-unsent-reply.md`](./task-ilr-06-throttle-unsent-reply.md)
- [`task-ilr-07-nontext-mid-funnel-ack.md`](./task-ilr-07-nontext-mid-funnel-ack.md)
- [`task-ilr-08-staff-review-sla.md`](./task-ilr-08-staff-review-sla.md)
- [`task-ilr-09-webhook-signature-harden.md`](./task-ilr-09-webhook-signature-harden.md)
- [`task-ilr-10-close-gate-p2.md`](./task-ilr-10-close-gate-p2.md)

---

**Created:** 2026-07-25.
