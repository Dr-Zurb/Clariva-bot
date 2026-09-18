# EXECUTION ORDER — p2 consult-room-checkin presence correctness

Sequential. Each wave depends on the previous.

1. [task-crc-07-my-visit-snapshot-poll.md](./task-crc-07-my-visit-snapshot-poll.md) — `/my-visit` snapshot auto-refresh
2. [task-crc-08-voice-text-lobby-heartbeat.md](./task-crc-08-voice-text-lobby-heartbeat.md) — voice + text heartbeat
3. [task-crc-09-close-gate-p2.md](./task-crc-09-close-gate-p2.md) — close gate

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

**Fresh chat per task.** Pre-load the task file + [charter](../../plan-consult-room-checkin-charter.md) + [batch plan](../plan-p2-consult-room-checkin-presence-correctness-batch.md) decision lock + listed source files.

**Wall-clock:** ~4–5h total, single lane throughout. No parallelism — crc-07 and crc-08 both touch patient poll surfaces and the founder smoke in crc-09 needs both landed.

**Hard stop:** any backend diff (CRC2-D6), any RLS/PHI surface → stop and surface it. This phase is frontend-only; if it stops being frontend-only, it is no longer p2.
