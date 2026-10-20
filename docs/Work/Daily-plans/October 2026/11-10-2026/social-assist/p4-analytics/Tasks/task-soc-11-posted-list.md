# Task soc-11: Paste the Instagram URL and list posted cards

## 📋 Task Overview

The doctor pastes the Instagram URL of a phone post. The card leaves Schedule and appears on Analytics.

**Program / Phase:** social-assist · Phase 4 (analytics)
**Batch:** [`plan-p4-social-assist-analytics-batch.md`](../plan-p4-social-assist-analytics-batch.md)
**Execution order:** [`EXECUTION-ORDER-p4-social-assist-analytics.md`](./EXECUTION-ORDER-p4-social-assist-analytics.md)
**Estimated Time:** 4 hours
**Status:** ✅ **COMPLETED** — 2026-10-11. Run migration `250_social_card_posted.sql`. Logged-in paste is still the browser check.

**Change Type:**
- [x] **Update existing** — the empty Analytics tab, and a timed card

**Current State:**
- ✅ **What exists:** an empty Analytics tab. A timed card. The page link, after `soc-10`. Clinic Insights post funnel, which this task must not change.
- ❌ **What's missing:** a pasted URL and a list of posted cards.
- ⚠️ **Notes:** The visit count can show 0 until `soc-12`.

**Scope Guard:**
- Expected files touched: ≤ 5
- Do not call Instagram to read the URL
- Do not add reach, saves, or follows
- Do not edit `PostsFunnel` or `post-conversion-analytics-service`

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)
- [v1.md](../../../../../../Product%20plans/social-assist/v1.md) DL-8, DL-10

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — a public post URL on the doctor’s card
- [x] **RLS verified?** Y — inherited
- [x] **Any PHI in logs?** No. Do not log the URL if you cannot guarantee it has no patient text. Log the card id.
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N — the URL dies with the card

---

## ✅ Task Breakdown

### 1. Paste
- [x] ✅ 1.1 A Ready or timed card accepts an Instagram URL - **Completed: 2026-10-11**
- [x] ✅ 1.2 That card leaves Schedule and is no longer in Ready - **Completed: 2026-10-11**
- [x] ✅ 1.3 It keeps the page link from `soc-10` - **Completed: 2026-10-11**

### 2. List
- [x] ✅ 2.1 Analytics lists posted cards: title, format, topic, page link, visit count - **Completed: 2026-10-11**
- [x] ✅ 2.2 Visit count shows 0 until a booking is counted - **Completed: 2026-10-11**
- [x] ✅ 2.3 An empty Analytics tab says no posts are home yet - **Completed: 2026-10-11**

### 3. Verification
- [ ] 3.1 Browser: paste a dummy URL, the card leaves Schedule, Analytics shows it
- [ ] 3.2 Insights still opens and its post funnel is unchanged
- [x] ✅ 3.3 Typecheck and lint the touched files - **Completed: 2026-10-11**

---

## 📁 Files to Create/Update

- ⚠️ Card API — an Instagram URL and a posted state
- ⚠️ Analytics tab from `soc-01`

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Do not fetch the Instagram post.
- Do not merge this list into clinic Insights.

---

**Last Updated:** 2026-10-11
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
