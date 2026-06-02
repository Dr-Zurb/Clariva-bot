# e-task-arm-05: Instagram DM flow — high confidence vs pending staff review

## 2026-04-02 — Branching patient journey per plan §4–§5

---

## 📋 Task Overview

Update the **Instagram DM webhook / conversation FSM** so that after intake reaches the point where **service matching** is known (matcher from **e-task-arm-04**):

- **`high` confidence**: continue toward **slot selection + booking link** behavior **as today**, with **`catalogServiceKey` / modality** set from matcher; **patient copy** does not ask them to pick a priced tier.
- **`medium` / `low`** (or `needs_staff_review`): **do not** send **booking** / **slot** link yet; create or update **pending staff review** entity (**e-task-arm-06**); set **conversation state** (**e-task-arm-03**); send **patient-facing** message: clinic will confirm within **24h** (configurable), **no payment** yet per plan §6.
- After staff **confirms** (via ARM-07 APIs): transition state to **allow** slot link / `slot-page-info` success path (**coordinate ARM-09**, **ARM-10**).

**No structured “reject reasons”** in patient copy; **cancel** path just informs patient request was closed.

**Estimated Time:** 2–4 days  
**Status:** ✅ **DONE** — DM branching + **ARM-06** queue + **ARM-07** resolve + confirm DM + **ARM-08** timeout + **ARM-09/10** booking/pay gates.

**Change Type:**
- [x] **Update existing** — `instagram-dm-webhook-handler.ts`, related composers, possibly intent routing

**Current State:**
- ✅ Consent → slot link / external `/book` flow exists; **catalogServiceKey** can be set from state for multi-service.
- ✅ Hybrid reply composer / AI paths (`dm-reply-composer.ts`, `ai-service.ts`).
- ✅ **Matcher-driven gate** before slot/booking CTA when `pendingStaffServiceReview && !serviceSelectionFinalized` (`isSlotBookingBlockedPendingStaffReview`).
- ✅ Step **`awaiting_staff_service_confirmation`** + **`staff_service_pending`** last prompt kind; SLA hours via **`STAFF_SERVICE_REVIEW_SLA_HOURS`** (default 24).
- ✅ **DB pending review** (**ARM-06**); staff confirm sends proactive IG + state unlock (**`service-staff-review-service`**); timeout + notify **ARM-08**.

**Dependencies:** **ARM-03**, **ARM-04**, **ARM-06** (persistence APIs live before full E2E).

---

## ✅ Task Breakdown

### 1. State machine / steps
- [x] 1.1 Define **new step(s)** or sub-flow flags (e.g. `awaiting_staff_service_confirmation`) — align naming with existing `PatientCollectionStep` conventions and **`lastPromptKind`** if needed.
- [x] 1.2 **Block** transitions that issue **booking token** or slot CTA while pending staff (audit all code paths that emit **book** link).

### 2. Matcher integration
- [x] 2.1 Invoke **ARM-04** when **reason_for_visit** (and any required fields) are available per product rules — **also** on **awaiting_match_confirmation** entry (book-for-other path).
- [x] 2.2 Persist **proposal + confidence** to state; **pending review row** via ARM-06 API/service — state + deadline set; **row creation deferred to ARM-06**.

### 3. Patient messaging
- [x] 3.1 **Templated** messages in `staff-service-review-dm.ts` (server-owned; **no invented prices**).
- [x] 3.2 High-confidence: unchanged path; medium/low optional visit **label** in pending copy (from catalog).

### 4. Staff resolution hooks
- [x] 4.1 **ARM-07** confirm/reassign → `service-staff-review-service` updates state + **`sendInstagramMessage`** with booking instructions (slot link) where IG channel applies.

### 5. Tests
- [x] 5.1 Unit tests: `staff-service-review-dm.test.ts`, gate helper on `ConversationState`.
- [x] 5.2 Manual E2E checklist — see **Manual E2E** section below *(on-demand QA)*.

---

## 📁 Files (expected)

```
backend/src/workers/instagram-dm-webhook-handler.ts
backend/src/utils/staff-service-review-dm.ts
backend/src/config/env.ts — STAFF_SERVICE_REVIEW_SLA_HOURS
backend/src/types/conversation.ts — step, lastPromptKind, isSlotBookingBlockedPendingStaffReview
backend/src/types/dm-instrumentation.ts — staff_service_review_pending branch
backend/tests/unit/utils/staff-service-review-dm.test.ts
```

---

## 🧠 Design Constraints

- **COMPLIANCE**: DM content still **no PHI** leakage to logs; booking links token-scoped as today.
- **Idempotency**: matcher called once per stable intake milestone or debounced — avoid duplicate pending rows (coordinate **ARM-06** unique constraints).

---

## 🌍 Global Safety Gate

- [x] **PHI?** Y in channel — follow existing redaction
- [x] **External AI?** N on pending templates; unchanged for other branches

---

## ✅ Acceptance Criteria

- High vs low paths **observable** in state + DB.
- No slot/booking CTA on low-confidence until staff resolution.
- Documentation updated for operators (link from initiative README).

---

## 🔗 Related

- [e-task-arm-04](./e-task-arm-04-service-matcher-engine.md)
- [e-task-arm-06](./e-task-arm-06-pending-review-persistence-and-apis.md)
- [e-task-arm-07](./e-task-arm-07-doctor-review-inbox-ui.md)
- [e-task-arm-09](./e-task-arm-09-slot-page-info-and-book-prefill.md)

---

## Manual E2E (quick)

1. Catalog with 3+ services; matcher returns **medium** (e.g. vague reason + `skipLlm` off in dev).
2. Complete confirm → consent → grant consent → expect **no** booking URL, step `awaiting_staff_service_confirmation`, copy mentions SLA.
3. Same with **high** deterministic match → expect slot link as before.
4. Optional: `STAFF_SERVICE_REVIEW_SLA_HOURS=48` → copy shows 48 hours.

---

**Last Updated:** 2026-03-31
