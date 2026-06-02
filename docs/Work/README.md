# Work — active execution

Plans, tasks, capture, and process guides. **Not** canonical product/engineering reference — that lives in [`Reference/`](../Reference/README.md).

```
Work/
├── Daily-plans/          ← dated batches + Tasks/ (primary execution backlog)
├── Product plans/        ← multi-phase product plans (+ archive/)
├── process/              ← how to plan and run tasks (templates, agent guides)
├── deferred/             ← parked technical work with context
└── capture/              ← quick inbox + notes (triage → Daily-plans)
```

## Process guides (`process/`)

| Doc | Purpose |
|---|---|
| [PHASED-PLANS-GUIDE.md](./process/PHASED-PLANS-GUIDE.md) | **Folder structure for phased plans** + the cross-day rule (start here for a new plan/phase) |
| [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](./process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) | Model selection, batch sizing, cost rules |
| [EXECUTION-ORDER-GUIDELINES.md](./process/EXECUTION-ORDER-GUIDELINES.md) | Wave/lane ordering within one batch |
| [TASK_MANAGEMENT_GUIDE.md](./process/TASK_MANAGEMENT_GUIDE.md) | Task lifecycle |
| [TASK_TEMPLATE.md](./process/TASK_TEMPLATE.md) | Task file template |
| [CODE_CHANGE_RULES.md](./process/CODE_CHANGE_RULES.md) | Rules for changing existing code |

## Conventions

- **Big plans are phased.** One program = one folder; each phase is a `p{N}-<slug>/` subfolder. The program folder lives under the date its **first** phase was planned, and **later phases stay in that same folder** even when planned on a different day. Full rules: [`process/PHASED-PLANS-GUIDE.md`](./process/PHASED-PLANS-GUIDE.md).
- **Daily plans:** `Daily-plans/<Month YYYY>/<DD-MM-YYYY>/<program>/p{N}-<slug>/Tasks/task-<prefix>-NN-*.md` (a small single-batch program skips the `p{N}-` level and puts `Tasks/` directly under `<program>/`).
- **Product plans:** `Product plans/plan-*.md` own the phase table → promote each phase to a `p{N}-` subfolder when committed.
- **READMEs:** each `<program>/` has a phase-index README; each `<DD-MM-YYYY>/` has a day README that links across to programs whose phases were planned that day.
- **Capture:** append to [`capture/inbox.md`](./capture/inbox.md); promote to Daily-plans during triage.

Index: [`../README.md`](../README.md)

> **`docs/Development/` is retired.** New tasks belong here under `Daily-plans/`. If another session created files under `docs/Development/`, merge them into this tree and delete that folder.
