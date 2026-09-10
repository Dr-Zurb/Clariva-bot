# Execution order — p3 one LLM round trip

> Batch: [`../plan-p3-single-llm-turn-batch.md`](../plan-p3-single-llm-turn-batch.md)

---

## Pre-flight (before any code)

- [ ] **`lat-06` closed**, with the remaining `intentMs + generateMs` written down. If the sum no longer justifies the risk, cancel the phase here and say why (LAT3-D6). Cancelling is a success.
- [ ] Read the stage router end to end (`backend/src/workers/dm/stage-router.ts`, `control-gates.ts`, and the stages). You cannot judge a merged-call design without knowing every branch the classification feeds.
- [ ] Read `lang-04`'s prompt work before touching the reply prompt. The explicit `LANGUAGE:` directive is load-bearing and must survive verbatim (LAT3-D5).
- [ ] Confirm **LAT3-D2** (safety branches stay deterministic) and **LAT3-D3** (discarded drafts are structurally unreachable). These two constrain the design more than the latency target does.
- [ ] Have the scenario corpus ready — `lat-09` needs it to project savings and `lat-10` needs it for parity. Reuse `lat-02`'s intent fixtures as the seed.

---

## Wave plan

| Wave | Tasks | Notes |
|------|-------|-------|
| **1 — Spike** | `lat-09` | **Opus.** Written recommendation with projected saving, risk, and cost delta. Ends in a go / no-go, and no-go is a legitimate ending (LAT3-D1). |
| **2 — Build** | `lat-10` | **Opus.** Only after the spike is accepted. Behind a flag so it can be turned off in production without a deploy. |
| **3 — Gate** | `lat-11` | Branch parity across the corpus, plus live smoke. |

Do not overlap waves 1 and 2. The entire point of the spike is that it might say stop, and a half-built implementation is exactly the pressure that makes a team ignore that.

---

## Task files

| # | File |
|---|------|
| 09 | [`task-lat-09-design-spike.md`](./task-lat-09-design-spike.md) |
| 10 | [`task-lat-10-implement-single-turn.md`](./task-lat-10-implement-single-turn.md) |
| 11 | [`task-lat-11-close-gate-p3.md`](./task-lat-11-close-gate-p3.md) |

---

**Created:** 2026-08-02.
