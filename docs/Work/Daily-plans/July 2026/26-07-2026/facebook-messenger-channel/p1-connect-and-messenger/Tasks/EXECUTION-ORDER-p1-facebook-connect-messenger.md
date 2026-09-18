# Execution order — p1 Facebook connect + Messenger

> Batch: [`../plan-p1-facebook-connect-messenger-batch.md`](../plan-p1-facebook-connect-messenger-batch.md)

---

## Pre-flight (before any code)

- [ ] Confirm **FBM-D1…D8** and **FBM1-D1…D4**.
- [ ] Answer **OQ-1** (webhook route) and **OQ-2** (single Page).
- [ ] Confirm Facebook app id (`276…` or chosen) ≠ `INSTAGRAM_APP_ID`.
- [ ] Funnel still routes `/webhooks` → backend.

---

## Wave plan

| Wave | Tasks | Notes |
|------|-------|-------|
| **0 — Ops** | `fbm-01` | Meta product + permissions + webhook URL (parallel). |
| **1 — Data** | `fbm-02` | **Opus** — migration + types. |
| **2 — Connect** | `fbm-03` | OAuth + subscribed_apps + disconnect. |
| **3 — Runtime** | `fbm-04` → `fbm-05` | Adapter then webhook wire. |
| **4 — Product** | `fbm-06` → `fbm-07` | UI then health. |
| **5 — Gate** | `fbm-08` | Manual Messenger DM smoke required. |

---

## Task files

| # | File |
|---|------|
| 01 | [`task-fbm-01-meta-facebook-messenger-ops.md`](./task-fbm-01-meta-facebook-messenger-ops.md) |
| 02 | [`task-fbm-02-doctor-facebook-migration.md`](./task-fbm-02-doctor-facebook-migration.md) |
| 03 | [`task-fbm-03-facebook-oauth-connect.md`](./task-fbm-03-facebook-oauth-connect.md) |
| 04 | [`task-fbm-04-facebook-channel-adapter.md`](./task-fbm-04-facebook-channel-adapter.md) |
| 05 | [`task-fbm-05-page-webhook-wire.md`](./task-fbm-05-page-webhook-wire.md) |
| 06 | [`task-fbm-06-integrations-ui-facebook.md`](./task-fbm-06-integrations-ui-facebook.md) |
| 07 | [`task-fbm-07-page-token-health.md`](./task-fbm-07-page-token-health.md) |
| 08 | [`task-fbm-08-close-gate-p1.md`](./task-fbm-08-close-gate-p1.md) |

---

**Created:** 2026-07-26.
