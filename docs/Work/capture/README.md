# Capture system

Use this folder so ideas and “we should fix this” items do not get lost. Keep it **raw** here; turn serious work into **Daily-plans**, **GitHub issues**, or **Taskmaster** when you triage.

> **Full lifecycle:** [`../process/WORKFLOW.md`](../process/WORKFLOW.md) — capture → product plan → daily plan → done.

## Files

| File / folder      | Purpose |
|--------------------|--------|
| `inbox.md`         | Quick bullets. Default drop zone — **transient**, unsorted. |
| `features/`        | Per-program parking lots (deferred / future / debt). **Durable** after triage. |
| `MIGRATION-deferred.md` | Path map after `Work/deferred/` retirement (2026-06-18). |
| `TEMPLATE.md`      | Copy to `notes/YYYY-MM-DD.md` (or any name) for a longer dump. |
| `notes/`           | Optional cross-cutting deep-dives; prefer `features/<program>/` when scoped. |
| `archive/`         | Closed or fully promoted items by month. |

## How to capture

1. **Fast:** Open `inbox.md`, add `- [ ] Short description` (one line). Optional: `— context, link, or path`.
2. **Longer:** Copy `TEMPLATE.md` → `notes/2026-04-07-my-topic.md` (or today’s date + slug).
3. **With Cursor:** Say things like *“capture this: …”* or *“add to the capture inbox …”* — the agent rule will append to `inbox.md` unless you name another file under `docs/Work/capture/`.

## Per-feature parking lots (`features/`)

When you **defer** work while building, or park **future** ideas for a program, move (or add) items to the matching feature file instead of letting `inbox.md` grow forever.

| File | Scope |
|------|--------|
| [`features/subjective-tab/`](features/subjective-tab/) | Subjective tab |
| [`features/objective-tab/`](features/objective-tab/) | Objective tab |
| [`features/cockpit.md`](features/cockpit.md) | Cockpit v3, panes, chart rail |
| [`features/booking-review.md`](features/booking-review.md) | Booking review / triage UI |
| [`features/nav-performance.md`](features/nav-performance.md) | Dashboard nav latency |
| [`features/service-matcher/`](features/service-matcher/) | Catalog matcher phases B–D |
| [`features/messaging-bot/`](features/messaging-bot/) | Instagram DM bot UX |
| [`features/frontend-platform/`](features/frontend-platform/) | Cross-cutting frontend platform |
| [`features/patients/`](features/patients/) | Patients & roster |
| [`features/ops-platform/`](features/ops-platform/) | Payouts, RLS testing, Sentry |

> **Migrated from `Work/deferred/`:** see [`MIGRATION-deferred.md`](MIGRATION-deferred.md) for old → new paths.

Each feature file uses the same sections:

- **Decisions needed** — GO/NO-GO before building
- **Future features** — intentional deferrals, new scope
- **Debt / hardening** — polish, bugs, doc drift, perf
- **Promoted / done** — archive when moved to Daily-plans or closed

Add a new `features/<program-slug>/` folder when a program gets its own deferred backlog (use `backlog.md` + optional deep-dive `.md` files). Use top-level `notes/` only for cross-cutting dumps not tied to one program.

## Triage (weekly or before a sprint)

1. Open `inbox.md` and recent files in `notes/` and `features/`.
2. For each **inbox** item either:
   - **Promote** → `docs/Work/Daily-plans/...` task file, `task-master add-task`, or a GitHub issue; then remove or check off the capture line.
   - **Defer** → move to the right `features/<name>.md` (or add a dated `notes/` file if it explodes).
   - **Drop** → delete; not everything needs to live forever.
3. For each **feature file** item: promote to Daily-plans when scheduled, or check off when done.

## Conventions

- Use `- [ ]` for open items; `- [x]` when done or fully promoted elsewhere.
- Prefer **one idea per line** in `inbox.md`; split with a dated note or feature file if it explodes.
- Link to code with backtick paths: `` `backend/src/...` ``.
- Link feature files to their Daily-plan program folder at the top.

## Relation to Daily-plans & Taskmaster

- **Capture** = parking lot (low friction).
- **features/** = per-program deferred/future backlog (survives triage).
- **Daily-plans** = what you intend to execute in a window.
- **Taskmaster** = structured tasks when you want dependencies, expand, and status.

Flow: **inbox → triage → features/ or Daily-plans or Taskmaster**. See [`../process/WORKFLOW.md`](../process/WORKFLOW.md) for the full staged path.
