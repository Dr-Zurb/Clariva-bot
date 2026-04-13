# RT-07 — Shared utils, validation, conversation types — findings & planned changes

**Review date:** 2026-04-13  
**Scope:** `types/conversation.ts`, `utils/validation.ts`, `booking-link-copy.ts`, `log-instagram-dm-routing.ts`  
**Reference:** [AI_BOT_BUILDING_PHILOSOPHY.md](../../../../../Reference/AI_BOT_BUILDING_PHILOSOPHY.md) §4.5, §5; [rt-07-utils-validation-types.md](../reading%20tasks/rt-07-utils-validation-types.md)

---

## 1. `ConversationState` & `lastPromptKind`

**Defined kinds** (`ConversationLastPromptKind`): `collect_details`, `consent`, `confirm_details`, `match_pick`, `cancel_confirm`, `staff_service_pending`, `fee_quote`.

**Persistence:** `conversationLastPromptKindForStep(step, activeFlow)` maps `step` + `activeFlow` → kind; merged into state before **`updateConversationState`** on the main success path (~`instagram-dm-webhook-handler.ts` L3199–3204).

**Consistency:** Handler **`effectiveAskedFor*`** prefers **`state.lastPromptKind`** and falls back to **substring** on last bot message for **legacy** threads (RBH-07). New flows that always persist state get structured routing; **gaps** are where the **prompt type** is not representable by `step` + `lastPromptKind` alone (see §5).

---

## 2. `validatePatientField` — validation, not NLU

**`validation.ts`:** Zod schemas per field (`patientPhoneSchema`, `patientNameSchema`, etc.); **`validatePatientField`** → **`safeParse`** → **`ValidationError`**.

**Verdict:** **Pure validation** (length, regex, numeric range) — **not** semantic interpretation. **Aligned** with §5 strict grammars for stored fields.

---

## 3. `booking-link-copy.ts`

**Template functions** take **`slotLink` / `url`** from callers (`buildBookingPageUrl`, etc.) and **`doctorSettings`** for queue vs slot mode. **No LLM**; URLs are injected by code.

---

## 4. Observability — `logInstagramDmRouting`

**Fields** (`InstagramDmRoutingLogFields`): `correlationId`, `eventId`, `doctorId`, `conversationId`, **`branch`**, **`intent`**, `intent_topics`, `is_fee_question`, `state_step_before` / `after`, `greeting_fast_path` — **no user message text**, no PHI.

**Verdict:** **Metadata-only** routing log — **aligned** with COMPLIANCE-style logging.

---

## 5. Deliverable — gaps: state fields to reduce “what we asked” via regex

| Gap | Today | Suggested direction |
|-----|--------|---------------------|
| **Consultation channel pick** (tele / voice / video / in-person) | **`lastBotAskedForConsultationChannel`** + **`parseConsultationChannelUserReply`** — **substring/keyword** on last bot text | Add **`lastPromptKind: 'consultation_channel_pick'`** (or dedicated **`pendingConsultationChannelPrompt: true`**) set when the bot sends the channel prompt; clear on pick or abandon. |
| **Optional-extras consent** (“anything else… say Yes to continue”) | Treated under **`consent`** + **`booking-consent-context`** (`isOptionalExtrasConsentPrompt`) — **substring** on assistant message | Optional: **`lastPromptKind: 'consent_optional_extras'`** **or** extend enum with **`consent_extras`** so **`resolveConsentReplyForBooking`** can branch without scanning copy. |
| **Cancel / reschedule numeric lists** | **`step`** (`awaiting_cancel_choice`, etc.) + numbers — **OK**; **`cancel_confirm`** in `lastPromptKind` exists | No change required for numeric gates. |
| **Reason-first triage** | **`reasonFirstTriagePhase`** (`ask_more` \| `confirm`) — **OK** | Keep; not a `lastPromptKind` duplicate. |
| **Legacy conversations** | Missing **`lastPromptKind`** | Backfill on read optional, or rely on **`effectiveAskedFor*`** heuristics until churned out. |

**Note:** Expanding **`ConversationLastPromptKind`** requires updating **`conversationLastPromptKindForStep`**, **`effectiveAskedFor*`** (or consolidating), and **tests** — see RT-02.

---

## 6. Planned changes (planning)

1. **Product + eng:** Prioritize **consultation channel** structured prompt kind (high substring surface).
2. **Optional:** Log **`last_prompt_kind`** in **`InstagramDmRoutingLogFields`** for metrics (enum only — no PHI).
3. **Validation:** Continue to **avoid** putting semantic “is this a name?” in **`validation.ts`** — stays in **`extractFieldsWithAI`** + merge guards.

---

## 7. Handoff

| Next | Notes |
|------|--------|
| **RT-08** | Golden / corpus |
| **RT-09** | Docs sync |

---

## 8. Status

- [x] RT-07 read complete  
