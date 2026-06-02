# Execution order — Phase 0: compliance hardening

> Batch: [`plan-p0-receptionist-compliance-batch.md`](../plan-p0-receptionist-compliance-batch.md) · Charter: [`plan-receptionist-rearchitecture-charter.md`](../../plan-receptionist-rearchitecture-charter.md)

**Cost-aware model strategy:** [`../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (1 wave)

```
Wave 1 (Compliance — ~0.5d, single lane sequential):
  Lane α  ──── rcp-00 (S, Auto + Opus close-gate)
```

**Total wall-clock:** ~0.5d. **Status:** ✅ complete.

---

## Acceptance gate

- [x] Indian phone formats (+91, 5-5 spacing, long-digit catch-all) redacted before model calls.
- [x] Redaction test matrix covers formats in charter §5 Phase 0.
- [x] Redaction applied only to model-bound text, not to downstream digit parsers.

---

## References

- Charter §5 Phase 0: [`../../plan-receptionist-rearchitecture-charter.md`](../../plan-receptionist-rearchitecture-charter.md)
- Next phase: [`../../p1-foundation/Tasks/EXECUTION-ORDER-p1-receptionist-foundation.md`](../../p1-foundation/Tasks/EXECUTION-ORDER-p1-receptionist-foundation.md)
