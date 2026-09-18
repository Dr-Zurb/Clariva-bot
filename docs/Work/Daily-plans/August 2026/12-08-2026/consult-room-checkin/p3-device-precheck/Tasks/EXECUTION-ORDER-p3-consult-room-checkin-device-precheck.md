# EXECUTION ORDER — p3 consult-room-checkin device pre-check

Sequential. Each wave depends on the previous.

1. [task-crc-10-lobby-precall-hoist.md](./task-crc-10-lobby-precall-hoist.md) — hoist pre-call into the lobby + skip gate on auto-connect
2. [task-crc-11-connection-quality-probe.md](./task-crc-11-connection-quality-probe.md) — advisory connection probe
3. [task-crc-12-voice-parity-and-lobby-context.md](./task-crc-12-voice-parity-and-lobby-context.md) — voice parity + lobby context
4. [task-crc-13-close-gate-p3.md](./task-crc-13-close-gate-p3.md) — close gate

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

**Fresh chat per task.** Pre-load the task file + [charter](../../plan-consult-room-checkin-charter.md) + [batch plan](../plan-p3-consult-room-checkin-device-precheck-batch.md) decision lock + listed source files.

**Wall-clock:** ~12–14h total, single lane throughout.

The bottleneck is crc-10 — it restructures the join page's state machine (`status` × `step`), and both crc-11 and crc-12 mount into the surface it creates. Do not start them against the old shape.

**Hard stop:** any Twilio room created from a lobby path, any migration, any RLS/PHI surface → stop and surface it.
