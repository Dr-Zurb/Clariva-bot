# EXECUTION ORDER — p1 consult-room-checkin lobby presence

Sequential. Each wave depends on the previous.

1. [task-crc-01-migration-lobby-presence.md](./task-crc-01-migration-lobby-presence.md) — **Opus** — migration 193
2. [task-crc-02-heartbeat-api-and-tags.md](./task-crc-02-heartbeat-api-and-tags.md) — heartbeat API + tags
3. [task-crc-03-checkin-cron-and-copy.md](./task-crc-03-checkin-cron-and-copy.md) — check-in cron + DM copy
4. [task-crc-04-video-lobby-and-autoconnect.md](./task-crc-04-video-lobby-and-autoconnect.md) — video lobby + auto-connect
5. [task-crc-05-board-waiting-tag-ui.md](./task-crc-05-board-waiting-tag-ui.md) — board chips
6. [task-crc-06-close-gate-p1.md](./task-crc-06-close-gate-p1.md) — close gate

**Fresh chat per task.** Pre-load the task file + [charter](../../plan-consult-room-checkin-charter.md) + [batch plan](../plan-p1-consult-room-checkin-lobby-presence-batch.md) decision lock + listed source files.

**Hard stop:** crc-01 (migration) and any unexpected RLS/PHI → switch to **Opus**.
