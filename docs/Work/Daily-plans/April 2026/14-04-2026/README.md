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

## Scenario Alignment — Bot vs Spec Audit & Implementation

Full audit of all 22 bot–patient interaction scenarios against the codebase.

| Document | Description |
|----------|-------------|
| [all bot patient scenarios](./all%20bot%20patient%20scenarios) | All 22 scenarios (spec) |
| [scenario-alignment-plan.md](./scenario-alignment-plan.md) | Audit results + implementation plan |

### Task Files (in implementation order)

| # | Task | Effort | Why this order |
|---|------|--------|----------------|
| 01 | [task-01-emergency-consent-fixes.md](./task-01-emergency-consent-fixes.md) | Small | Bug fixes first — lowest risk, immediate correctness |
| 02 | [task-02-greeting-via-llm.md](./task-02-greeting-via-llm.md) | Small | Highest visibility — first thing patients see |
| 03 | [task-03-booking-modality-transition.md](./task-03-booking-modality-transition.md) | Small | Core booking UX — must land before fee display (task 06) |
| 04 | [task-04-non-text-message-reply.md](./task-04-non-text-message-reply.md) | Small | Patient-facing gap — currently rude/silent |
| 05 | [task-05-throttle-ack.md](./task-05-throttle-ack.md) | Small | Patient experience polish |
| 06 | [task-06-context-aware-fee-display.md](./task-06-context-aware-fee-display.md) | Medium | Depends on 03 (modality UX settled first) |
| 07 | [task-07-self-booking-duplicate-check.md](./task-07-self-booking-duplicate-check.md) | Medium | Data quality — independent |
| 08 | [task-08-status-all-appointments.md](./task-08-status-all-appointments.md) | Medium | Patient info — independent |
| 09 | [task-09-staff-review-timeout.md](./task-09-staff-review-timeout.md) | Medium | New cron infra — patients stuck indefinitely without this |
| 10 | [task-10-abandoned-booking-reminder.md](./task-10-abandoned-booking-reminder.md) | Medium | New cron infra — conversion improvement |
| 11 | [task-11-post-consent-corrections.md](./task-11-post-consent-corrections.md) | Medium | UX polish — less urgent than cron features |
| 12 | [task-12-language-mirroring.md](./task-12-language-mirroring.md) | Large | Last — touches all files; avoids merge conflicts with 01–11 |

---

**Index:** [13 Apr 2026 (prior daily)](../13-04-2026/README.md) · [task-management README](../../../../task-management/README.md)
