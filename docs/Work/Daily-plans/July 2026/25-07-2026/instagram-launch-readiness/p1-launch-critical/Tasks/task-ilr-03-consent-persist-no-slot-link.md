# Task ilr-03: Consent-persist failure must not send booking link

> **Links:** batch [`../plan-p1-instagram-launch-critical-batch.md`](../plan-p1-instagram-launch-critical-batch.md) · exec [`./EXECUTION-ORDER-p1-instagram-launch-critical.md`](./EXECUTION-ORDER-p1-instagram-launch-critical.md)

---

## 🛑 Opus — consent / booking gate

Consent + booking path. On failure today the patient still gets a slot link. Run on **Opus**.

---

## 📋 Task Overview

When consent/demographics persist fails (`!persistResult.success`), reply with trouble-saving copy **without** a booking link, and keep conversation state recoverable (do not advance to `awaiting_slot_selection` as if consent succeeded).

**Program / Phase:** instagram-launch-readiness · p1 · Wave 1  
**Estimated Time:** ~1–2 hours  
**Status:** ✅ Complete (2026-07-25)  
**Change Type:** Update existing

**Current State:**
- ⚠️ `booking-funnel.ts` ~652–655: on persist failure, trouble-saving copy **plus** slot link; state moves to `awaiting_slot_selection`.
- ✅ Happy path consent → slot link is correct — do not break it.

**Scope Guard:**
- Touch only the failure branch (and tests).
- **DO NOT** redesign consent copy system-wide.
- **DO NOT** skip consent on failure.

---

## ✅ Task Breakdown

### 1. Fix failure branch
- [x] 1.1 On `!persistResult.success`: send trouble-saving / retry copy **without** slot URL.
- [x] 1.2 Keep step suitable for retry (e.g. stay at consent/collection — do **not** treat as successful slot-await).
- [x] 1.3 Log failure with correlation id only (no PHI).

### 2. Tests
- [x] 2.1 Unit/characterization: persist fail → no booking URL in reply; step not `awaiting_slot_selection` (or equivalent asserted).
- [x] 2.2 Persist success path still sends link.

### 3. Verify
- [x] 3.1 type-check + lint + targeted tests green.

---

## 📁 Files to Create/Update

```
UPDATE: backend/src/workers/dm/.../booking-funnel.ts (or exact path under workers/dm)
UPDATE/CREATE: backend/tests/unit/... covering consent persist failure
READ: consent-service / collection persist helpers used by the funnel
DO NOT TOUCH: payment, WhatsApp, unrelated stages
```

---

## ✅ Acceptance Criteria

- [x] Persist failure never includes a slot/booking link.
- [x] Patient can retry consent on a subsequent turn.
- [x] Success path unchanged; tests green.

---

**Created:** 2026-07-25. **Closed:** 2026-07-25.
