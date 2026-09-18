# EXECUTION ORDER — p4 consult-room-checkin realtime + channel gaps

> Sibling document of [`plan-p4-consult-room-checkin-realtime-and-channel-gaps-batch.md`](../plan-p4-consult-room-checkin-realtime-and-channel-gaps-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan

```
Wave 1 (Presence channel — ~5h, single lane sequential):
  Lane α  ──── crc-14 (L, Opus)

Wave 2 (Board + channels — ~7h, 2 parallel lanes after crc-14):
  Lane α  ──── (waits on crc-14) ──> crc-15 (M, Sonnet)        [frontend]
  Lane β  ──── crc-16 (M, Sonnet)                              [backend]

Wave 3 (Resilience — ~3h, single lane sequential):
  Lane α  ──── crc-17 (M, Sonnet)

Wave 4 (Close — ~1h, single lane sequential):
  Lane α  ──── crc-18 (S, Composer / Founder)
```

**Total wall-clock with parallelism:** ~13h.
**Total agent-time (sequential equivalent):** ~16h.

The bottleneck is Wave 1 — `crc-14` is single-lane Opus because the lobby has no `consultation_sessions` row (CRC-D3), so the presence token/claim shape is an unsolved auth design problem, not a wiring task. Everything in Wave 2's Lane α consumes its output.

`crc-16` (Lane β) passes the lane gate: disjoint files (`notification-service.ts` + `workers/channels/facebook/` vs frontend Realtime + OPD board), no shared in-flight state, neither consumes the other, ~4h of work. Run it in a separate worktree or fold it into Wave 3 if you would rather stay single-threaded.

---

## Lane-by-lane details

### Wave 1 — Presence channel (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | crc-14 | L | **Opus** | `use-tab-presence-claim.ts`, `supabase-jwt-mint.ts`, `scoped-client.ts`, charter CRC-D3/D13 | Token shape is the decision. Hard stop if it needs RLS or a migration. |

### Wave 2 — Board + channels (2 parallel lanes after crc-14)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | crc-15 | M | Sonnet | `OpdTodayClient.tsx`, `opd-slot-status.ts`, crc-14's channel contract | Waits on crc-14 so the channel topic + payload shape are locked. Must degrade to poll. |
| 0 | crc-16 | M | Sonnet | `notification-service.ts` L1202–1363, `workers/channels/facebook/send.ts` | Fully independent of Lane α for the whole wave. |

### Wave 3 — Resilience (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | crc-17 | M | Sonnet | join page, voice page, crc-14's channel | Runs after crc-15 so reconnect covers both poll and Realtime paths. |

### Wave 4 — Close (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | crc-18 | S | Composer / Founder | batch plan gate, program README | Closes the program, measures the charter metric. |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| crc-14 | L | **Opus** | New auth/claim surface on a patient-facing token. Hard-rules list. |
| crc-15 | M | Sonnet | Well-spec'd UI wiring against a locked channel contract. |
| crc-16 | M | Sonnet | Existing fan-out pattern, existing channel module, additive. |
| crc-17 | M | Sonnet | Bounded frontend resilience work. |
| crc-18 | S | Composer / Founder | Verification + doc sync + manual smoke. |

One Opus task in the batch — within the ≤2 cap.

---

## Acceptance gates per wave

**Wave 1**

- [ ] Patient lobby joins a presence channel; doctor-side subscriber receives the event in <2s.
- [ ] No PHI in any frame (inspect the websocket).
- [ ] No migration; `appointments` not added to `supabase_realtime`.
- [ ] Token/claim shape documented in the task file as an outcome, not left implicit in code.

**Wave 2**

- [ ] All Wave 1 gates still green.
- [ ] Board shows Waiting in <2s; blocking websockets leaves the 30s poll fully working with no doctor-visible error.
- [ ] A Facebook-only patient receives consult-ready and pre-visit messages; a Facebook failure is recorded as an outcome, not thrown.

**Wave 3**

- [ ] All Wave 2 gates still green.
- [ ] ~30s network drop in the lobby self-recovers, still checked in, no DM re-open needed.

**Wave 4**

- [ ] All Wave 3 gates still green.
- [ ] Phase + program gates fully checked; charter success metric measured by stopwatch.

---

## Cost estimate

| Wave | Tasks | Sonnet chats | Opus chats | Wall-clock |
|---|---|---|---|---|
| 1 | crc-14 | 0 | 1 | ~5h |
| 2 | crc-15, crc-16 | 2 | 0 | ~4h (parallel) |
| 3 | crc-17 | 1 | 0 | ~3h |
| 4 | crc-18 | 1 (Composer) | 0 | ~1h |

**Fresh chat per task.** Pre-load the task file + [charter](../../plan-consult-room-checkin-charter.md) + [batch plan](../plan-p4-consult-room-checkin-realtime-and-channel-gaps-batch.md) decision lock + listed source files.

**Hard stop:** any migration, any RLS policy, any change to the `supabase_realtime` publication → stop and surface it.

---

## References

- [Batch plan](../plan-p4-consult-room-checkin-realtime-and-channel-gaps-batch.md)
- [Charter](../../plan-consult-room-checkin-charter.md)
- [p3 exec order](../../p3-device-precheck/Tasks/EXECUTION-ORDER-p3-consult-room-checkin-device-precheck.md)
- [EXECUTION-ORDER-GUIDELINES.md](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md)
