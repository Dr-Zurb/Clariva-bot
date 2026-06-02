# Receptionist re-architecture — daily batches

> **Program charter (vision + DL-1..DL-12 + phase ladder):** [`plan-receptionist-rearchitecture-charter.md`](./plan-receptionist-rearchitecture-charter.md)  
> **Philosophy:** [`Reference/product/receptionist-bot/AI_BOT_BUILDING_PHILOSOPHY.md`](../../../../../Reference/product/receptionist-bot/AI_BOT_BUILDING_PHILOSOPHY.md)  
> Execute phases **in order**. Phases 0–4 are ✅ shipped; Phases 5–6 are spec'd.

| Phase | Folder | Batch plan | Execution order | Tasks |
|---|---|---|---|---|
| 0 — compliance | [`p0-compliance/`](./p0-compliance/) | [`plan-p0-receptionist-compliance-batch.md`](./p0-compliance/plan-p0-receptionist-compliance-batch.md) | [`EXECUTION-ORDER-p0-receptionist-compliance.md`](./p0-compliance/Tasks/EXECUTION-ORDER-p0-receptionist-compliance.md) | rcp-00 |
| 1 — foundation | [`p1-foundation/`](./p1-foundation/) | [`plan-p1-receptionist-foundation-batch.md`](./p1-foundation/plan-p1-receptionist-foundation-batch.md) | [`EXECUTION-ORDER-p1-receptionist-foundation.md`](./p1-foundation/Tasks/EXECUTION-ORDER-p1-receptionist-foundation.md) | rcp-01..02 |
| 2 — stage router | [`p2-stage-router/`](./p2-stage-router/) | [`plan-p2-receptionist-stage-router-batch.md`](./p2-stage-router/plan-p2-receptionist-stage-router-batch.md) | [`EXECUTION-ORDER-p2-receptionist-stage-router.md`](./p2-stage-router/Tasks/EXECUTION-ORDER-p2-receptionist-stage-router.md) | rcp-03..08 |
| 3 — channels | [`p3-channels/`](./p3-channels/) | [`plan-p3-receptionist-channels-batch.md`](./p3-channels/plan-p3-receptionist-channels-batch.md) | [`EXECUTION-ORDER-p3-receptionist-channels.md`](./p3-channels/Tasks/EXECUTION-ORDER-p3-receptionist-channels.md) | rcp-09..13 |
| 4 — state | [`p4-state/`](./p4-state/) | [`plan-p4-receptionist-state-batch.md`](./p4-state/plan-p4-receptionist-state-batch.md) | [`EXECUTION-ORDER-p4-receptionist-state.md`](./p4-state/Tasks/EXECUTION-ORDER-p4-receptionist-state.md) | rcp-14..19 |
| 5 — returning memory | [`p5-returning-memory/`](./p5-returning-memory/) | [`plan-p5-receptionist-returning-memory-batch.md`](./p5-returning-memory/plan-p5-receptionist-returning-memory-batch.md) | [`EXECUTION-ORDER-p5-receptionist-returning-memory.md`](./p5-returning-memory/Tasks/EXECUTION-ORDER-p5-receptionist-returning-memory.md) | rcp-20..24 |
| 6 — identity | [`p6-identity/`](./p6-identity/) | [`plan-p6-receptionist-identity-batch.md`](./p6-identity/plan-p6-receptionist-identity-batch.md) | [`EXECUTION-ORDER-p6-receptionist-identity.md`](./p6-identity/Tasks/EXECUTION-ORDER-p6-receptionist-identity.md) | rcp-25..29 |

**Task prefix:** `rcp-*` — numbered continuously across all phases (do not restart at 01 per phase).

**Future:** Phase 7+ (Instagram depth, cross-channel WhatsApp) outlined in charter §5 — promote as `p7-*` subfolders here when ready.
