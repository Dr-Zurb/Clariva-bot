# Execution order — patients-multi-tag

| Step | Task | Depends | Model | Notes |
|---|---|---|---|---|
| 0 | [pmt-01](./task-pmt-01-migration-and-types.md) | — | **Opus** | `patient_tags TEXT[]` + backfill. Hard stop for Auto. |
| 1 | [pmt-02](./task-pmt-02-bulk-and-list-api.md) | pmt-01 | Opus | Bulk `op` + list membership filter. |
| 2 | [pmt-03](./task-pmt-03-list-ui-badges-filter.md) | pmt-02 | Auto | Row badges, View → Tags, cache patch. |
| 3 | [pmt-04](./task-pmt-04-bulk-ui-add-remove.md) | pmt-03 | Auto | Bulk Add / Remove / Clear all. |
| 4 | [pmt-05](./task-pmt-05-close-gate.md) | pmt-02…04 | Auto | Tests, merge union, stop writing legacy column. |

Do not start pmt-03 until list API returns `patient_tags`.
