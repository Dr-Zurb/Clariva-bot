# Daily plan — 2026-05-04

**Theme:** Smarter, scalable DM routing — reduce brittle regex-only coverage by leaning on **classifier-led signals**, **shared normalization**, and a **repeatable quality loop** (metrics + golden transcripts). Complements shipped work on [e-task-dm-05](../04-04-2026/tasks/e-task-dm-05-silent-fee-menu-closure.md).

## Task index

| File | Topic | Status |
|------|--------|--------|
| [tasks/e-task-dm-06-classifier-led-payment-fee-routing.md](./tasks/e-task-dm-06-classifier-led-payment-fee-routing.md) | Hybrid NLU: model-first payment/fee signals; regex/typos as fallback; policy doc | ✅ Shipped (staging 3.2 + SILENT_FEE cross-link 3.3 optional) |
| [tasks/e-task-ops-02-dm-routing-quality-regression-corpus.md](./tasks/e-task-ops-02-dm-routing-quality-regression-corpus.md) | Branch analytics, golden transcripts, periodic misroute review | ✅ Corpus + tests + docs (see [fixtures](../../../../../backend/tests/fixtures/dm-routing-golden/README.md)) |

## Golden corpus (e-task-ops-02)

- **Fixtures:** [backend/tests/fixtures/dm-routing-golden/README.md](../../../../../backend/tests/fixtures/dm-routing-golden/README.md)

## References

- [TASK_MANAGEMENT_GUIDE.md](../../../../task-management/TASK_MANAGEMENT_GUIDE.md)
- [TASK_TEMPLATE.md](../../../../task-management/TASK_TEMPLATE.md)
- [SILENT_FEE_ASSIGNMENT_POLICY.md](../../../../task-management/SILENT_FEE_ASSIGNMENT_POLICY.md)
- [OBSERVABILITY.md](../../../../Reference/OBSERVABILITY.md) — routing / `instagram_dm_routing`
- Prior day: [04-04-2026 / README.md](../04-04-2026/README.md)

**Last updated:** 2026-05-04
