# Task ibi-10: Badge migration + polling

> **Links:** batch [`../plan-p3-interactions-inbox-tab-batch.md`](../plan-p3-interactions-inbox-tab-batch.md) · exec [`./EXECUTION-ORDER-p3-interactions-inbox-tab.md`](./EXECUTION-ORDER-p3-interactions-inbox-tab.md)

---

## 📋 Task Overview

Point the sidebar badge at Inbox. Keep `bookingReviewsUnconfirmed` semantics (pending service-match count). Add list polling (30s, visibility-aware).

**Program / Phase:** interactions-inbox · p3 · Wave 3  
**Status:** ✅ DONE (2026-07-27)  
**Model:** Sonnet  

---

## ✅ Task Breakdown

- [x] 1.1 `Sidebar` Inbox item `badgeKey: bookingReviewsUnconfirmed` (same count semantics).
- [x] 1.2 `useInboxPolling` — 30s, visibility-aware; paused on Needs review tab.
- [x] 1.3 Tests: badge hook still green; polling unit tests.

---

**Created:** 2026-07-27.  
**Closed:** 2026-07-27.
