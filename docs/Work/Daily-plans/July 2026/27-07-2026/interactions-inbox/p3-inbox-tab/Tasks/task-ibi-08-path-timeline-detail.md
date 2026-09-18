# Task ibi-08: Path timeline payload on interaction detail

> **Links:** batch [`../plan-p3-interactions-inbox-tab-batch.md`](../plan-p3-interactions-inbox-tab-batch.md) · exec [`./EXECUTION-ORDER-p3-interactions-inbox-tab.md`](./EXECUTION-ORDER-p3-interactions-inbox-tab.md)

---

## 📋 Task Overview

Enrich `GET /api/v1/interactions/:id` with an ordered **pre-consult path timeline** reconstructed from joins: comment lead → first DM → booking steps → appointment booked/paid. No consult chat (IB2).

**Program / Phase:** interactions-inbox · p3 · Wave 2  
**Status:** ✅ DONE (2026-07-27)  
**Model:** Sonnet  
**Depends on:** `ibi-06`, `ibi-07`

---

## ✅ Task Breakdown

### 1. Timeline steps
- [x] 1.1 Define step types: `comment_captured`, `first_dm`, `booking_started`, `slot_selected`, `needs_review`, `booked`, `paid`.
- [x] 1.2 Source from `comment_leads`, first patient `messages` timestamp, conversation metadata, `appointments`, pending `service_staff_review_requests`.
- [x] 1.3 Quick-link ids on steps + list item (`patient_id`, `appointment_id`, `comment_lead_id`, `conversation_id`).

### 2. Tests
- [x] 2.1 Fixture conversation with comment + appointment → expected step order.
- [x] 2.2 Comment-only → single `comment_captured` step.

---

**Created:** 2026-07-27.  
**Closed:** 2026-07-27 — `buildInteractionTimeline` + Inbox Path UI.
