# Execution order — patients-kpi-doctor

| Step | Task | Depends | Notes |
|---|---|---|---|
| 0 | [pkd-01](./task-pkd-01-strip-reshape.md) | — | Remove no-show / open-episodes / duplicates from strip. |
| 1 | [pkd-02](./task-pkd-02-incomplete-consult.md) | pkd-01 | New segment + KPI. |
| 2 | [pkd-03](./task-pkd-03-new-and-revisits.md) | pkd-01 | Visit-based new + revisit. |
| 3 | [pkd-04](./task-pkd-04-close-gate.md) | pkd-02, pkd-03 | Verify + polish. |

pkd-02 and pkd-03 may run in parallel after pkd-01 if needed; prefer 02 then 03.
