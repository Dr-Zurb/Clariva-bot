# Work — active execution

Plans, tasks, capture, and process guides. **Not** canonical product/engineering reference — that lives in [`Reference/`](../Reference/README.md).

```
Work/
├── Business/             ← run the company: tracks, months, weeks, days
├── Daily-plans/          ← dated engineering batches + Tasks/
├── Product plans/        ← multi-phase product plans (+ archive/)
├── process/              ← how to plan and run tasks (templates, agent guides)
└── capture/              ← inbox + features/ parking lots (triage → Daily-plans)
    ├── inbox.md          ← transient raw drops
    ├── features/         ← per-program deferred / future / debt (+ deep dives)
    └── MIGRATION-deferred.md  ← old deferred/ path map (2026-06-18)
```

> **Where am I?** [`Business/`](./Business/README.md) is where the company is run — legal, banking, GST, trademark, Meta review, customers, and the week/day ritual. [`Daily-plans/`](./Daily-plans/) is where **agents** execute engineering batches. Start the week in `Business/`, and let it feed `Daily-plans/`.

**Retired (2026-06-18):** `deferred/` — content moved to [`capture/features/`](./capture/features/). See [`capture/MIGRATION-deferred.md`](./capture/MIGRATION-deferred.md).

## Process guides (`process/`)

> **Start here:** [`process/WORKFLOW.md`](./process/WORKFLOW.md) — end-to-end path: capture → product plan → daily plan → done.

| Doc | Purpose |
|-----|---------|
| [**WORKFLOW.md**](./process/WORKFLOW.md) | **Lifecycle map** — where ideas go and how work ships |
| [PHASED-PLANS-GUIDE.md](./process/PHASED-PLANS-GUIDE.md) | **Folder structure for phased plans** + the cross-day rule (start here for a new plan/phase) |
| [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](./process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) | Model selection, batch sizing, cost rules |
| [EXECUTION-ORDER-GUIDELINES.md](./process/EXECUTION-ORDER-GUIDELINES.md) | Wave/lane ordering within one batch |
| [TASK_MANAGEMENT_GUIDE.md](./process/TASK_MANAGEMENT_GUIDE.md) | Task lifecycle |
| [TASK_TEMPLATE.md](./process/TASK_TEMPLATE.md) | Task file template |
| [CODE_CHANGE_RULES.md](./process/CODE_CHANGE_RULES.md) | Rules for changing existing code |

## Conventions

- **Business cadence:** `Business/<YYYY>/<Month>/W<NN>-<YYYY-MM-DD>/` — `0-week.md` (Sunday preplan + review) plus `1-mon.md`…`7-sun.md`. Month plan lives in `<Month>/month.md`. Standing threads: [`Business/tracks.md`](./Business/tracks.md). Weekday defaults: [`Business/rhythm.md`](./Business/rhythm.md). Full rules: [`Business/README.md`](./Business/README.md).
- **Big plans are phased.** One program = one folder; each phase is a `p{N}-<slug>/` subfolder. The program folder lives under the date its **first** phase was planned, and **later phases stay in that same folder** even when planned on a different day. Full rules: [`process/PHASED-PLANS-GUIDE.md`](./process/PHASED-PLANS-GUIDE.md).
- **Daily plans:** `Daily-plans/<Month YYYY>/<DD-MM-YYYY>/<program>/p{N}-<slug>/Tasks/task-<prefix>-NN-*.md` (a small single-batch program skips the `p{N}-` level and puts `Tasks/` directly under `<program>/`).
- **Product plans:** `Product plans/plan-*.md` own the phase table → promote each phase to a `p{N}-` subfolder when committed.
- **READMEs:** each `<program>/` has a phase-index README; each `<DD-MM-YYYY>/` has a day README that links across to programs whose phases were planned that day.
- **Capture:** append to [`capture/inbox.md`](./capture/inbox.md); triage into [`capture/features/<program>/`](./capture/features/) or promote to Daily-plans.

## Work lifecycle

| State | Home |
|-------|------|
| Raw idea | `capture/inbox.md` |
| Parked with context | `capture/features/<program>/backlog.md` (+ optional deep-dive `.md`) |
| Open business thread (legal, money, Meta, GTM) | `Business/tracks.md` |
| Committed roadmap | `Product plans/` |
| Committed to *this month* | `Business/<YYYY>/<Month>/month.md` |
| Committed to *this week* | `Business/<YYYY>/<Month>/W<NN>-*/0-week.md` |
| Committed to *today* | `Business/<YYYY>/<Month>/W<NN>-*/<n>-<dow>.md` |
| Scheduled execution | `Daily-plans/` |
| Done / archived | `capture/archive/`, `Product plans/archive/`, or `docs/Archive/` |

Index: [`../README.md`](../README.md)

> **`docs/Development/` is retired.** New tasks belong here under `Daily-plans/`. If another session created files under `docs/Development/`, merge them into this tree and delete that folder.
