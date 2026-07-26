# Execution order — p4 Direct Instagram Login

> Batch: [`../plan-p4-direct-instagram-login-batch.md`](../plan-p4-direct-instagram-login-batch.md)

---

## Pre-flight (before any code)

- [ ] Confirm **ILR4-D1…D6** (especially clean swap).
- [ ] Answer **OQ-1**: any production FB-linked doctors? If yes → STOP (dual-path / migration).
- [ ] Confirm Instagram app id/secret and redirect URI in Meta dashboard (`ilr-17` can start in parallel).

---

## Wave plan

| Wave | Tasks | Notes |
|------|-------|-------|
| **0 — Ops start** | `ilr-17` | Start Meta product config + review materials immediately (parallel). |
| **1 — Code** | `ilr-18` → `ilr-19` → `ilr-20` | OAuth swap, then refresh, then UI copy. |
| **2 — Gate** | `ilr-21` | Close only after Wave 1 green + Dev-mode manual connect verified. |

**Dependency:** Real-doctor GA needs `ilr-17` Advanced Access. Dev-mode self-test does **not**.

---

## Task files

| # | File |
|---|------|
| 17 | [`task-ilr-17-meta-instagram-login-ops.md`](./task-ilr-17-meta-instagram-login-ops.md) |
| 18 | [`task-ilr-18-oauth-instagram-login-swap.md`](./task-ilr-18-oauth-instagram-login-swap.md) |
| 19 | [`task-ilr-19-ig-token-refresh.md`](./task-ilr-19-ig-token-refresh.md) |
| 20 | [`task-ilr-20-settings-ui-copy.md`](./task-ilr-20-settings-ui-copy.md) |
| 21 | [`task-ilr-21-close-gate-p4.md`](./task-ilr-21-close-gate-p4.md) |

---

**Created:** 2026-07-26.
