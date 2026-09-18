# Previsit notify email test seed (2026-08-12)

10 video appointments on a **15-minute serial** grid → `as.sahilabhi2937@gmail.com`.

| # | Offset | Expected on first cron |
|---|--------|-------------------------|
| 1 | +5m (check-in pre-stamped) | `nudge_5` |
| 2 | +20m | `checkin_30` |
| 3–10 | +35m … +140m | nothing yet (enter windows later) |

## Run

1. Apply migrations **194** + **195** (`patient_start_notified_at` for T=0).
2. Run `delete.sql` if an older same-time seed is still there.
3. Run `apply.sql`.
4. With `PREVISIT_NOTIFY_WORKER_ENABLED=true`, wait for ticks — or `npm run job:previsit`.
5. First tick: **~2 emails** (Riya nudge + Aarav check-in). At each slot’s exact time: **starting now**.
6. Cleanup: `delete.sql`.
