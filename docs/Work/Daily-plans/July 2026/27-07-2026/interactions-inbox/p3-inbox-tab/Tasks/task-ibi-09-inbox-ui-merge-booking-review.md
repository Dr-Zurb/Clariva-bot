# Task ibi-09: Inbox UI tab + merge Booking review + sidebar

> **Links:** batch [`../plan-p3-interactions-inbox-tab-batch.md`](../plan-p3-interactions-inbox-tab-batch.md) · exec [`./EXECUTION-ORDER-p3-interactions-inbox-tab.md`](./EXECUTION-ORDER-p3-interactions-inbox-tab.md)

---

## 📋 Task Overview

Ship `/dashboard/inbox`: list + detail (timeline + read-only thread). Replace sidebar **Booking review** with **Inbox**. Redirect old booking-review route. Preserve service-match triage via **Needs review** filter.

**Program / Phase:** interactions-inbox · p3 · Wave 3  
**Status:** ✅ DONE (2026-07-27)  
**Model:** Sonnet  

---

## ✅ Task Breakdown

### 1. Page + list
- [x] 1.1 SSR page with `requireDashboardAuth` + seed list (`scope=signal`).
- [x] 1.2 Client inbox: filters (Signal / All / Needs review).
- [x] 1.3 Rows: channel badge, identity (MRN or lead label), snippet, status chip; comment-only badge.

### 2. Detail
- [x] 2.1 Path timeline + reuse read-only thread (p2 API).
- [x] 2.2 Quick links to patient / appointment.
- [x] 2.3 Needs-review lane embeds `ServiceReviewsInbox`.

### 3. Nav cutover
- [x] 3.1 Sidebar: Inbox item; Booking review removed.
- [x] 3.2 `/dashboard/booking-review` → `/dashboard/inbox?filter=needs_review`.
- [x] 3.3 Alerts SLA deep-link updated.

### 4. Tests
- [x] 4.1 Sidebar / alerts tests green with Inbox href.
- [x] 4.2 Thread + polling coverage.

---

**Created:** 2026-07-27.  
**Closed:** 2026-07-27.
