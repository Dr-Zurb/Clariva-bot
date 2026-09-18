# opd-status-model (2026-08-11)

Split OPD slot `SlotStatus` into three independent axes so Overflow can coexist with Late/Upcoming, and Incomplete consult is server truth.

- **Plan:** [plan-opd-status-model-batch.md](./plan-opd-status-model-batch.md)
- **Order:** [Tasks/EXECUTION-ORDER-opd-status-model.md](./Tasks/EXECUTION-ORDER-opd-status-model.md)

**Start with Opus on `osm-01`** (new migration 192). Auto must not invent a schema workaround or backfill from `isAppendedAfterDay`.
