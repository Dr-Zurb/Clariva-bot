# Daily Plan: 2026-03-09

## Doctor Settings Feature – Phase Tasks

This folder contains task files for the doctor settings feature rollout. Tasks are sequential phases; later phases depend on earlier ones.

**Reference:** [DOCTOR_SETTINGS_PHASES.md](../../../Reference/DOCTOR_SETTINGS_PHASES.md)

---

## Task Index

| Task | Description | Depends On |
|------|-------------|------------|
| [e-task-1](./e-task-1-doctor-settings-extend-migration.md) | Extend doctor_settings table (migration) | — |
| [e-task-2](./e-task-2-doctor-settings-api.md) | Doctor settings API (GET/PATCH) | e-task-1 |
| [e-task-3](./e-task-3-availability-blocked-times-api.md) | Availability & blocked times API | — |
| [e-task-4](./e-task-4-bot-uses-doctor-settings.md) | Bot uses doctor settings | e-task-1, e-task-2 |
| [e-task-5](./e-task-5-frontend-dashboard.md) | Frontend dashboard | e-task-2, e-task-3 |

---

## Recommended Order

1. **e-task-1** — Migration first (unblocks 2 and 4)
2. **e-task-2** — API for settings (unblocks 4 and 5)
3. **e-task-3** — API for availability/blocked times (unblocks 5)
4. **e-task-4** — Bot integration (after 1 and 2)
5. **e-task-5** — Frontend (after 2 and 3)

---

**Last Updated:** 2026-03-09
