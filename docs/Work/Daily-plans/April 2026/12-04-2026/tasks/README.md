# Tasks — Staff feedback learning (e-task-learn-*)

**Plan:** [plan-staff-feedback-learning-system.md](../plan-staff-feedback-learning-system.md)  
**Initiative:** [STAFF_FEEDBACK_LEARNING_INITIATIVE.md](../../../../task-management/STAFF_FEEDBACK_LEARNING_INITIATIVE.md)

**Execution order:** Strict — later tasks depend on earlier privacy + store + shadow foundations.

**AI stance:** Tasks **learn-01–05** implement **structured** learning + **policy** + optional **semantic** path only where learn-01 allows. They do **not** assume a learning-only LLM for v1; patient NLU stays in the existing matcher/triage layer ([plan §1a](../plan-staff-feedback-learning-system.md#1a-structured-first-vs-optional-nl--ai-clarify-scope)).

---

## Dependency graph

```
learn-01 (privacy contract)
    ↓
learn-02 (store + ingest)
    ↓
learn-03 (shadow + metrics)
    ↓
learn-04 (notify + opt-in policy)
    ↓
learn-05 (assist UI + gated autobook)
```

---

## Task index

| Order | ID | File |
|-------|-----|------|
| 1 | e-task-learn-01 | [e-task-learn-01-privacy-and-data-contract.md](./e-task-learn-01-privacy-and-data-contract.md) |
| 2 | e-task-learn-02 | [e-task-learn-02-learning-store-and-ingest.md](./e-task-learn-02-learning-store-and-ingest.md) |
| 3 | e-task-learn-03 | [e-task-learn-03-shadow-evaluation-and-metrics.md](./e-task-learn-03-shadow-evaluation-and-metrics.md) |
| 4 | e-task-learn-04 | [e-task-learn-04-opt-in-notification-autobook-policy.md](./e-task-learn-04-opt-in-notification-autobook-policy.md) |
| 5 | e-task-learn-05 | [e-task-learn-05-assist-ui-and-gated-autobook.md](./e-task-learn-05-assist-ui-and-gated-autobook.md) |

---

**Last updated:** 2026-03-31
