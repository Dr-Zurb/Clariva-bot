# Execution order — p1 comment → conversation link

> Batch: [`../plan-p1-interactions-inbox-comment-link-batch.md`](../plan-p1-interactions-inbox-comment-link-batch.md)

---

## Pre-flight (before any code)

- [ ] Confirm **IB1…IB5** and **IBI1-D1…D3**.
- [ ] Read `linkCommentLeadToConversation` in `comment-lead-service.ts` and where conversations are created in `run-conversation-turn.ts`.
- [ ] Confirm migration 188 `comment_leads.platform` is applied in the env you test.

---

## Wave plan

| Wave | Tasks | Notes |
|------|-------|-------|
| **1 — Wire** | `ibi-01` | Single sequential task. |
| **2 — Gate** | `ibi-02` | Smoke + mark README. |

---

## Task files

| # | File |
|---|------|
| 01 | [`task-ibi-01-wire-comment-lead-conversation-link.md`](./task-ibi-01-wire-comment-lead-conversation-link.md) |
| 02 | [`task-ibi-02-close-gate-p1.md`](./task-ibi-02-close-gate-p1.md) |

---

**Created:** 2026-07-27.
