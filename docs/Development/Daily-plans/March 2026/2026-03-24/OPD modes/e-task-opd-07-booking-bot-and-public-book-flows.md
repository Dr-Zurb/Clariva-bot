# Task OPD-07: Booking bot & public book flows (mode-aware copy)

## 2026-03-24 — OPD initiative

---

## 📋 Task Overview

Update **AI receptionist / booking bot** and **`frontend/app/book/*`** flows so copy, intents, and slot selection **match** `doctor_settings.opd_mode`: **slot** = existing day/slot picker; **queue** = session/join-queue messaging, token confirmation, ETA expectations per [opd-systems-plan.md](./opd-systems-plan.md) §3.2, §5.3, [APPOINTMENT_BOOKING_BOT_FLOW.md](../../../../../Reference/APPOINTMENT_BOOKING_BOT_FLOW.md).

**Estimated Time:** 10–18 hours  
**Status:** ✅ **DONE** (2026-03-24)

**Change Type:**
- [x] **Update existing** — bot handlers, prompts, booking pages — [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ Booking token flow: `booking-token.ts`, `bookings.ts` routes.
- ✅ AI types/intents in `backend/src/types/ai.ts` (verify).
- ✅ Mode-aware copy: `opd_mode` via `getDoctorSettings` + `booking-link-copy.ts` in webhook; `/book` reads `opdMode` from slot-page-info / day-slots.
- ✅ **Instagram DM** — slot vs queue templates; short copy with token / approximate-wait language on public page when queue + zero fee.

**Scope Guard:** Queue booking wired to opd-03 services (queue rows, caps); no separate feature flag required for this task.

**Reference Documentation:**
- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](../../../../../Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md)
- [APPOINTMENT_BOOKING_FLOW_V2.md](../../../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Load doctor mode in booking flows

- [x] 1.1 When resolving doctor for booking link, include **`opdMode`** in API response used by `book` page (`slot-page-info`, `day-slots`, `select-slot-and-pay`).
- [x] 1.2 Bot: fetch or cache mode before offering slot vs queue (`doctorSettings` in webhook → `formatBookingLinkDm` / reschedule helpers).

### 2. Slot mode regression

- [x] 2.1 Ensure **slot** path unchanged for default doctors (default `opd_mode` / slot copy and time grid on `/book`).

### 3. Queue mode UX copy

- [x] 3.1 Replace “pick a time” with “join queue…” + **token** after confirm (API `tokenNumber`; zero-fee success screen on `/book`).
- [x] 3.2 DM templates: **forecast** language (“approximate”, token #) — not a fixed-time promise — per §5.3.

### 4. Error messages

- [x] 4.1 **Session full** — stable code **`OPD_SESSION_FULL`** + user string ([ERROR_CATALOG.md](../../../../../Reference/ERROR_CATALOG.md)).

### 5. Verification

- [ ] 5.1 E2E: book queue appointment (stub) + receive token in response body/message — **optional / not automated** (manual smoke OK).

---

## 📁 Files to Create/Update

```
backend/src/controllers/booking-controller.ts
backend/src/services/slot-selection-service.ts
backend/src/services/opd/opd-queue-service.ts
backend/src/utils/booking-link-copy.ts
backend/src/workers/webhook-worker.ts
frontend/app/book/page.tsx, frontend/lib/api.ts
docs/Reference/APPOINTMENT_BOOKING_BOT_FLOW.md (if flow changes materially — Doc Drift Guard)
```

---

## 🌍 Global Safety Gate

- [x] **AI prompts** — no PHI leakage in external LLM if used; follow [AI_AGENT_RULES.md](../../../../../Reference/AI_AGENT_RULES.md) (copy is deterministic in webhook for booking links)

---

## 🔗 Related Tasks

- Depends on: [e-task-opd-02](./e-task-opd-02-doctor-settings-api-and-practice-ui.md), [e-task-opd-03](./e-task-opd-03-backend-opd-services-and-routing.md)

---

**Last Updated:** 2026-03-24
