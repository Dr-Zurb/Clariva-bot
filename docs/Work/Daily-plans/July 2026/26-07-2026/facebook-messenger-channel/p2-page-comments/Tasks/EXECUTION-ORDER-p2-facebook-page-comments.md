# Execution order — p2 Facebook Page comments

> Batch: [`../plan-p2-facebook-page-comments-batch.md`](../plan-p2-facebook-page-comments-batch.md)

---

## Pre-flight

- [ ] p1 close gate (`fbm-08`) ✅
- [ ] Page webhook can subscribe to comment/feed fields (`fbm-01` update if needed)

---

## Wave plan

| Wave | Tasks | Notes |
|------|-------|-------|
| **1** | `fbm-09` → `fbm-10` | Ingest then reply/handoff |
| **2** | `fbm-11` | Close gate |

---

## Task files

| # | File |
|---|------|
| 09 | [`task-fbm-09-page-comment-webhook.md`](./task-fbm-09-page-comment-webhook.md) |
| 10 | [`task-fbm-10-page-comment-reply-handoff.md`](./task-fbm-10-page-comment-reply-handoff.md) |
| 11 | [`task-fbm-11-close-gate-p2.md`](./task-fbm-11-close-gate-p2.md) |

---

**Created:** 2026-07-26.
