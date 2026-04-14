# Daily plan — 14 April 2026

## Patient ID (P-xxxxx) after payment — DM & booking copy

**Goal:** Show the human-readable **Patient ID** only **after successful payment**, not with the pre-payment booking link.

| Artifact | Link |
|----------|------|
| **Canonical task (task-management)** | [tm-patient-mrn-post-payment-dm.md](../../../../task-management/tasks/tm-patient-mrn-post-payment-dm.md) |
| Template | [TASK_TEMPLATE.md](../../../../task-management/TASK_TEMPLATE.md) |
| Code change rules | [CODE_CHANGE_RULES.md](../../../../task-management/CODE_CHANGE_RULES.md) |

**Preferred approach:** Option A (messaging + post-payment send). Option B (defer DB MRN until after payment) is documented in the task file as optional / larger scope.

**Execution:** Implement against `tm-patient-mrn-post-payment-dm.md`; add dated execution notes or subtasks under this folder if you split work across PRs.

---

**Index:** [13 Apr 2026 (prior daily)](../13-04-2026/README.md) · [task-management README](../../../../task-management/README.md)
