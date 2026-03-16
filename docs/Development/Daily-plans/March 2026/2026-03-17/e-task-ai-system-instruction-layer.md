# Task: AI-to-System Instruction Layer
## Two-Layer Architecture — AI as Conversation Expert, System as Action Executor

---

## 📋 Task Overview

Implement a two-layer architecture where the **AI layer** handles complex conversation with patients (natural language understanding, context, nuance) and sends **simple structured instructions** to the **system layer**, which executes actions (cancel appointment, reschedule, confirm, etc.). This fixes the bug where the AI said "I've cancelled" but the system never executed the cancel.

**Estimated Time:** 12–16 hours (phased)  
**Status:** 🟡 **IN PROGRESS** (Phase 1)  
**Completed:** 2026-03-27 — Phase 1: cancel confirmation via AI tools

**Change Type:**
- [ ] **Update existing** — Add OpenAI function/tool calling; create action executor; refactor webhook flow. Follow [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)

**Architecture:**
```
Patient message → AI (conversation expert) → { reply: string, action?: SystemAction }
                                                    ↓
                                            System layer executes action
                                                    ↓
                                            DB update, notifications, etc.
```

**Current State:**
- ✅ **What exists:** `classifyIntent`, `generateResponse` in ai-service; step-based handlers in webhook-worker; `cancelAppointmentForPatient`, `updateAppointmentDateForPatient`
- ❌ **What's missing:** AI tool/function definitions; action executor; structured output from AI (action + reply); wiring so AI can "call" system actions
- ⚠️ **Bug fixed:** `stateToPersist` did not include `awaiting_cancel_choice`, `awaiting_cancel_confirmation`, `awaiting_reschedule_choice`, `awaiting_reschedule_slot` — state was overwritten to `responded` after each reply, so cancel flow never completed. Fixed in webhook-worker.

**Scope Guard:**
- Expected files touched: ≤ 10
- Phased delivery (Phase 1: cancel/reschedule; Phase 2: extend to other flows)

**Reference Documentation:**
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [e-task-cancel-appointment.md](./e-task-cancel-appointment.md)
- [e-task-reschedule-appointment.md](./e-task-reschedule-appointment.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Define System Actions Schema

- [x] 1.1 Create `backend/src/types/system-actions.ts`
  - [x] 1.1.1 `SystemAction` union: `confirm_cancel`, `pick_appointment`, `no_action` (Phase 1)
  - [x] 1.1.2 Each action has typed params (e.g. `confirm_cancel: { confirm: boolean }`)
  - [x] 1.1.3 `AIResponseWithActions` = `{ reply: string; toolCalls?: ToolCallFromAI[] }`
- [x] 1.2 Document when each action is valid (e.g. `confirm_cancel` only when `state.step === 'awaiting_cancel_confirmation'`)

### 2. OpenAI Tool Definitions

- [ ] 2.1 Add tool definitions for OpenAI Chat Completions API
  - [ ] 2.1.1 `cancel_appointment` — params: `appointment_id` (string, UUID)
  - [ ] 2.1.2 `confirm_cancel` — params: `confirm` (boolean, true = cancel, false = keep)
  - [ ] 2.1.3 `reschedule_appointment` — params: `appointment_id`
  - [ ] 2.1.4 `pick_appointment` — params: `index` (number, 1-based)
  - [ ] 2.1.5 Tool descriptions must explain when to use (e.g. "Call when user confirms they want to cancel the appointment")
- [ ] 2.2 Tool definitions are context-aware: pass `state.step`, `pendingCancelAppointmentIds`, etc. so AI knows what actions are valid

### 3. AI Service: Generate Response with Tools

- [x] 3.1 Create `generateResponseWithActions` in ai-service
  - [x] 3.1.1 Accept `availableTools` based on current state (e.g. when `awaiting_cancel_confirmation`, only offer `confirm_cancel`)
  - [x] 3.1.2 Call `client.chat.completions.create` with `tools` parameter
  - [x] 3.1.3 Parse response: extract tool name + args from `tool_calls`
  - [x] 3.1.4 Return `{ reply: string, toolCalls?: ToolCallFromAI[] }`
- [x] 3.2 Caller executes tool; uses `replyOverride` from action executor
- [x] 3.3 Fallback: if no tool call, use AI reply

### 4. Action Executor Service

- [x] 4.1 Create `backend/src/services/action-executor-service.ts`
  - [x] 4.1.1 `executeAction(action: SystemAction, context: ActionContext): Promise<ActionResult>`
  - [x] 4.1.2 `ActionContext` = `{ conversationId, doctorId, conversation, state, correlationId, timezone? }`
  - [x] 4.1.3 `ActionResult` = `{ success: boolean; replyOverride?: string; stateUpdate?: Partial<ConversationState> }`
- [x] 4.2 Implement handlers:
  - [x] 4.2.1 `confirm_cancel` (confirm=true) → cancelAppointmentForPatient, notify doctor, return confirmation
  - [x] 4.2.2 `confirm_cancel` (confirm=false) → clear state, return "No problem. Your appointment is still scheduled."
  - [x] 4.2.3 `pick_appointment` → validate index, set cancel/reschedule id, return next-step message or reschedule URL
- [x] 4.3 Validate action is allowed for current state

### 5. Webhook Integration

- [x] 5.1 Refactor cancel confirmation to use AI-with-tools
  - [x] 5.1.1 When `step === 'awaiting_cancel_confirmation'`: call `generateResponseWithActions` with `confirm_cancel` tool
  - [x] 5.1.2 If AI returns `confirm_cancel`: parse, execute via action executor, use replyOverride
  - [x] 5.1.3 If AI returns reply only: use reply
- [x] 5.2 Action executor runs before sending reply; stateUpdate merged and persisted

### 6. Broaden AI Understanding (Without Tools)

- [ ] 6.1 For flows that still use step handlers: broaden "Yes" detection
  - [ ] 6.1.1 `awaiting_cancel_confirmation`: accept "just #2 for me", "go ahead", "do it", "2737" (when confirming), "yea", "yep", "sure"
  - [ ] 6.1.2 Document in task that tool-calling approach supersedes this for long-term
- [ ] 6.2 Optional: keep step handlers as fallback when tools not used

### 7. Extend to Other Flows (Phase 2)

- [ ] 7.1 Consent: `confirm_consent` tool — AI can call when user says "yes" in varied ways
- [ ] 7.2 Match confirmation: `pick_patient_match` tool
- [ ] 7.3 Confirm details: `confirm_details` tool
- [ ] 7.4 Document pattern for adding new tools

### 8. Testing & Verification

- [ ] 8.1 Unit tests: action executor for each action
- [ ] 8.2 Integration: mock OpenAI tool call, verify executor runs
- [ ] 8.3 Manual: "cancel" → "just #2 for me" → "2737" → appointment cancelled in DB
- [ ] 8.4 Manual: "reschedule" → pick slot → appointment updated

---

## 📁 Files to Create/Update

```
backend/src/
├── types/
│   └── system-actions.ts          (NEW - action schema)
├── services/
│   ├── ai-service.ts               (UPDATE - generateResponseWithActions, tool defs)
│   └── action-executor-service.ts (NEW - executeAction)
└── workers/
    └── webhook-worker.ts           (UPDATE - use AI-with-tools for cancel/reschedule)
```

---

## 🧠 Design Constraints

- No PHI in tool arguments or logs
- Action executor must validate context (appointment belongs to doctor/patient)
- Tool definitions must be minimal (reduce tokens)
- Fallback: if OpenAI doesn't support tools or returns no tool call, use current step-handler logic

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y)
  - [ ] **RLS verified?** (Y)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (Y)
  - [ ] **Consent + redaction confirmed?** (Y)
- [ ] **Retention / deletion impact?** (N)

---

## 📝 Implementation Notes

### OpenAI Tool Format (Chat Completions)

```typescript
tools: [{
  type: 'function',
  function: {
    name: 'confirm_cancel',
    description: 'Call when user confirms they want to cancel the appointment. Use when they say yes, yeah, go ahead, do it, etc.',
    parameters: {
      type: 'object',
      properties: {
        confirm: { type: 'boolean', description: 'true to cancel, false to keep' }
      },
      required: ['confirm']
    }
  }
}]
```

### Flow When AI Uses Tool

1. User: "2737" (confirming cancel)
2. We call `generateResponseWithActions` with `confirm_cancel` tool, context: `step=awaiting_cancel_confirmation`, `cancelAppointmentId=...`
3. AI returns `tool_calls: [{ name: 'confirm_cancel', arguments: { confirm: true } }]`
4. We execute `confirm_cancel(confirm: true)` → `cancelAppointmentForPatient(...)`
5. We use AI's text reply OR action executor's `replyOverride`: "Your appointment has been cancelled."
6. Send to patient

### Phased Delivery

- **Phase 1:** Cancel + reschedule flows only. Prove the pattern.
- **Phase 2:** Extend to consent, match confirmation, confirm details.

---

## 🔗 Related Tasks

- [e-task-cancel-appointment.md](./e-task-cancel-appointment.md)
- [e-task-reschedule-appointment.md](./e-task-reschedule-appointment.md)

---

**Last Updated:** 2026-03-17  
**Completed:** —  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
