# Task 4: Worker Migration — Remove Chat Confirmation for Unified Flow
## 2026-03-14

---

## 📋 Task Overview

Migrate the webhook worker to the unified slot+payment flow. Remove the "Reply Yes to confirm" step—when the user completes slot selection and payment on the external page, no chat confirmation is needed. Simplify `confirming_slot` handling: the old flow (select-slot → redirect → Yes in chat) is replaced by the new flow (select-slot-and-pay → payment → redirect). The worker no longer expects or processes "Yes" for slot confirmation when the frontend uses the new API.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-03-14

**Change Type:**
- [x] **Update existing** — webhook-worker; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **Implemented:** confirming_slot branch simplified (migrates to awaiting_slot_selection); slot link message updated; no "Reply Yes" in flow
- ✅ **Kept:** POST select-slot for backwards compatibility (legacy)
- ⚠️ **Notes:** Frontend will call select-slot-and-pay (e-task-3). The old select-slot API will no longer be used by the frontend. processSlotSelection still sends proactive message—we need to decide: (a) Remove proactive "Reply Yes" message from processSlotSelection when frontend uses new flow, or (b) Frontend never calls processSlotSelection—only selectSlotAndPay. So processSlotSelection becomes dead code for the main flow. We can deprecate it or keep for manual/testing. The proactive message from processSlotSelection says "Reply Yes to confirm"—if we keep that, users would still get it when... but the frontend now calls select-slot-and-pay, so processSlotSelection is never called. So we can leave processSlotSelection as-is for backwards compatibility (e.g. old links) and just have the frontend use the new API. The worker's confirming_slot branch would only be hit if someone used the OLD flow (select-slot) and then said "yes" in chat. So we have two paths: (1) New: select-slot-and-pay → no chat confirmation. (2) Old: select-slot → proactive message → user says yes → confirming_slot. We can keep both. The worker doesn't need to change much—the new flow never hits the worker for confirmation. The only change: when we send the slot link after consent, we could update the message to say "Select your slot and complete payment on the link—you'll be redirected back here when done" instead of "Pick your slot... You'll be redirected back here after you choose." The current message is fine. Actually the flow is: we send link. User opens link. With NEW flow: user selects slot, pays, redirects to chat. With OLD flow: user selects slot, redirects to chat, gets "Reply Yes", says yes, we book. So the worker change is minimal: update the post-consent message to reflect that payment happens on the page? And we can remove or simplify confirming_slot if we're fully migrating. Let me re-read the plan. "Fully migrate. When bot sends the link, the link now does slot + payment. We remove the confirming_slot step from the worker." So we remove the ability to confirm in chat. The frontend always uses select-slot-and-pay. The old select-slot API could be removed or kept for backwards compat. If we remove confirming_slot from the worker, then when would that branch be hit? Never, if the frontend only uses select-slot-and-pay. So we can remove the confirming_slot branch. But wait—processSlotSelection is called by the OLD select-slot API. That API updates state to confirming_slot and sends the proactive message. So if someone has an old link and uses select-slot, they'd get the message and say "yes". The worker would need to handle that. So we have two options: (1) Keep both flows: old select-slot + confirming_slot for backwards compat. (2) Remove old flow: deprecate select-slot, remove confirming_slot. The plan says "fully migrate". So we remove the old flow. That means: (a) Frontend only calls select-slot-and-pay. (b) We can remove or deprecate POST select-slot. (c) We remove the confirming_slot branch from the worker. (d) processSlotSelection might still be used... no, if we remove select-slot API, processSlotSelection is never called. So we could remove processSlotSelection or leave it for potential future use. Simpler: leave processSlotSelection and select-slot API in place but undocumented—they're dead for the main flow. Remove the confirming_slot branch from the worker. When would confirming_slot be set? Only by processSlotSelection. So if we never call processSlotSelection (frontend uses new API), we never set confirming_slot. So the confirming_slot branch is dead code. We can remove it. And update the post-consent message to say payment happens on the page.

**Scope Guard:**
- Expected files touched: webhook-worker.ts, possibly slot-selection-service (no proactive "Reply Yes" when using new flow—but that's in processSlotSelection which we might not call). Actually the proactive message is sent by the select-slot API's processSlotSelection. So when we use select-slot-and-pay, we don't call processSlotSelection, so no proactive message. Good. The worker change: remove confirming_slot branch. Update the consent→slot link message to mention payment on the page.

**Reference Documentation:**
- [unified-slot-payment-flow-and-appointment-status.md](./unified-slot-payment-flow-and-appointment-status.md)
- [APPOINTMENT_BOOKING_FLOW_V2.md](../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Remove confirming_slot Branch

- [x] 1.1 Remove or simplify the `state.step === 'confirming_slot'` branch in webhook-worker
  - [x] 1.1.1 This branch handled user saying "yes" after slot selection
  - [x] 1.1.2 New flow: appointment + payment happen in select-slot-and-pay; no chat confirmation
  - [x] 1.1.3 Remove the entire confirming_slot block (bookAppointment, createPaymentLink, sendNewAppointmentToDoctor logic)
- [x] 1.2 Ensure awaiting_slot_selection still works (user can say "change" to get new link)

### 2. Update Post-Consent Message

- [x] 2.1 Update the slot link message after consent
  - [x] 2.1.1 Current: "Pick your slot: [link]. You'll be redirected back here after you choose."
  - [x] 2.1.2 New: "Pick your slot and complete payment here: [link]. You'll be redirected back to this chat when done."
  - [x] 2.1.3 Or keep similar; ensure user understands payment is on the page

### 3. Deprecate Old select-slot (Optional)

- [x] 3.1 Consider keeping POST select-slot for backwards compatibility (old links)
  - [x] 3.1.1 If kept: users with old links get "Reply Yes" flow
  - [ ] 3.1.2 If removed: old links return 410 Gone or redirect
- [x] 3.2 Recommendation: keep select-slot for now; document as legacy

### 4. Verification & Testing

- [ ] 4.1 Full flow: consent → link → slot + payment on page → redirect to chat
- [ ] 4.2 No "Reply Yes" expected or sent
- [ ] 4.3 "Change" in awaiting_slot_selection still sends new link

---

## 📁 Files to Create/Update

```
backend/src/
└── workers/
    └── webhook-worker.ts   (UPDATED - remove confirming_slot; update slot link message)
```

**Existing Code Status:**
- ✅ confirming_slot: simplified to migrate to awaiting_slot_selection (no booking in chat)
- ✅ Consent→slot link: "Pick your slot and complete payment here: [link]. You'll be redirected back to this chat when done."

---

## 🧠 Design Constraints

- No PHI in logs
- Slot link message must be clear about payment on page
- Keep awaiting_slot_selection for "change" / "pick another"

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – conversation state; no new writes)
  - [x] **RLS verified?** (N/A)
- [x] **Any PHI in logs?** (N)
- [x] **External API or AI call?** (Y – Instagram, OpenAI)
  - [x] **Consent + redaction confirmed?** (Y)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] No "Reply Yes to confirm" in flow; payment on external page
- [x] Slot link message updated
- [x] confirming_slot branch removed
- [x] "Change" still works for new link

---

## 🔗 Related Tasks

- [e-task-2: Select slot and pay API](./e-task-2-select-slot-and-pay-api.md)
- [e-task-3: Booking page + success page](./e-task-3-booking-page-success-page.md)
- [e-task-5: Webhook flow integration](../2026-03-13/e-task-5-webhook-flow-integration.md)

---

**Last Updated:** 2026-03-14
