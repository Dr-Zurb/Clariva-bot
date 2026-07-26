# Task ilr-21: Close gate p4

> **Links:** batch [`../plan-p4-direct-instagram-login-batch.md`](../plan-p4-direct-instagram-login-batch.md) · exec [`./EXECUTION-ORDER-p4-direct-instagram-login.md`](./EXECUTION-ORDER-p4-direct-instagram-login.md)

---

## 📋 Task Overview

Close the Direct Instagram Login phase when code + Dev-mode verification are done and Meta ops status is recorded (approval may still be pending — note that explicitly).

**Status:** ⏳ PENDING  
**Depends on:** `ilr-18`, `ilr-19`, `ilr-20` complete; `ilr-17` at least submitted or status noted

---

## ✅ Checklist

- [ ] `ilr-18`–`ilr-20` acceptance criteria met; tests green.
- [ ] Manual: app-role doctor Connect Instagram → Instagram login → connected as @username → test DM handled.
- [ ] `ilr-17` status logged (submitted / approved / blocked with reason).
- [ ] Program README: p4 marked appropriately; note GA blocked on Advanced Access if still pending.
- [ ] Existing FB-linked test rows disconnected/reconnected (clean swap).

---

**Created:** 2026-07-26.
