# BASELINE p1 — DM reply latency

> Recorded by `lat-01`. Compare later tasks against these numbers, not against production.

---

## Environment

| Field | Value |
|-------|--------|
| Date | 2026-08-02 |
| Commit | `e46e113` |
| Host | local macOS · `npm run dev` · single webhook worker |
| DB | dev Supabase |
| Model | `OPENAI_MODEL=gpt-5.2` |
| Harness | `npm run test:dm-language -- --timings --warmup` |

---

## Segmented baseline (real Instagram send)

Source: `webhook_instagram_dm_pipeline_timing` on a live `hey hallo` greeting turn (2026-08-02 ~05:16 UTC). Meta send succeeded, so full segments were emitted.

| Segment | ms |
|---------|-----|
| intentMs | 2070 |
| generateMs | 3178 |
| igSendMs | 1924 |
| handlerPreSendMs | 7489 |
| **otherPreSendMs** (derived) | **2241** (= 7489 − 2070 − 3178) |
| job durationMs | 10627 |

Notes from that turn:
- `greetingFastPath: false` (expected — fast path removed)
- Send path logged `Page token invalid for graph.facebook.com; trying graph.instagram.com` before succeeding

This is the scoreboard for `lat-02`…`lat-04` segment targets.

---

## Harness end-to-end baseline (synthetic senders)

Synthetic IG sender IDs make Meta send fail. Pipeline timing is only logged after a successful send today, so the harness reports **e2e wall clock** (POST → system reply row visible), not segments.

Warmup discarded: first turn of `english` scenario.

| Scenario / turn | e2eMs |
|-----------------|------:|
| english / kitna is the fee? | 5627 |
| hinglish / mujhe kal… | 10144 |
| hinglish / plain English stay | 9837 |
| devanagari | 6857 |
| emergency-hinglish / open | 8192 |
| emergency-hinglish / emergency | 4329 |
| **summary** | **min 4329 / p50 6857 / max 10144 (n=6)** |

Language assertions: **4/4 PASS**.

### Gap (surfaced per lat-01 §1.2)

Segmented timings are **not persisted** anywhere queryable (not in `webhook_idempotency`, not in audit metadata). They exist only as log lines, and only after a successful Meta send. Options for later (not lat-01):

1. Point `TEST_DM_TIMING_LOG` at a JSON pino log after a real successful send.
2. Tiny runtime change (separate task): emit `webhook_instagram_dm_pipeline_timing` even when Meta send fails, so the harness can scrape segments — or persist them without a migration (e.g. log-only remains, but fire before send).

Until then: use the real-IG segmented table above for segment gates; use harness e2e for regression of total wait.

---

## After column (fill in at lat-06)

| Segment | Before | After (2026-08-02 lat-02…04) | Target |
|---------|-------:|------:|--------|
| job / greeting | 10627 | *(re-measure on real IG)* | ≤ 5000 |
| intentMs | 2070 | *(re-measure — mini tier shipped)* | ≤ 700 p50 |
| igSendMs | 1924 | *(re-measure — IG host first)* | ≤ 1100 p50 |
| otherPreSendMs | 2241 | *(re-measure — reads parallelized)* | ≤ 1200 |
| harness e2e p50 | 6857 | **4874** | (informational) |

### Harness e2e after lat-02…04 (`--timings --warmup`, n=6)

min 3375 / p50 4874 / max 7838 — language 4/4 PASS.


---

**Created:** 2026-08-02.
