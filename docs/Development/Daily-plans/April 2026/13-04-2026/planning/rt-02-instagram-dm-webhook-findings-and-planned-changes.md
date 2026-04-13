# RT-02 — `instagram-dm-webhook-handler.ts` findings & planned changes

**Review date:** 2026-04-13  
**Scope:** `backend/src/workers/instagram-dm-webhook-handler.ts` (main `processInstagramDmWebhook` decision tree), cross-references to `ai-service`, `reason-first-triage`, `collection-service`  
**Reference:** [AI_BOT_BUILDING_PHILOSOPHY.md](../../../../../Reference/AI_BOT_BUILDING_PHILOSOPHY.md), [RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md](../../../../../Reference/RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md), [rt-02-instagram-dm-webhook-handler.md](../reading%20tasks/rt-02-instagram-dm-webhook-handler.md)

---

## 1. Executive summary

The handler implements **RBH-17** clearly: **Understand** (`classifyIntent` + post-policies) runs once; **Decide + Say** follow a long `if / else if` chain with `dmRoutingBranch` for instrumentation. [RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md](../../../../../Reference/RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md) matches the **core** order; the file header comment is **directionally accurate** but omits **post-medical payment-existence ack** and some **inner** sub-branches.

**Drift risk:** `effectiveAskedFor*` helpers use **`state.lastPromptKind` OR substring heuristics** on the last bot message (`lastBotMessageAskedForDetails`, etc.). New copy or i18n can desync from **structured** state until every send path sets `lastPromptKind` + `conversationLastPromptKindForStep`.

**Routing density:** Roughly **120+** occurrences of `.test` / `.includes` / inline regex in this file (not all are “NLU”; many are step gates, IDs, safety). **Fee + reason-first** combine **classifier** (`intentSignalsFeeOrPricing`), **anaphora** (`feeFollowUpAnaphora`), and **fee-thread continuation** — same theme as RT-01 (multiple signal paths).

---

## 2. Branch order vs `RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md`

| Inventory step | Code (approx.) | Notes |
|----------------|----------------|--------|
| revoke / paused | `isRevokeIntent`, `instagram_receptionist_paused` | Matches |
| Cancel / reschedule **step** gates | `awaiting_cancel_choice`, `awaiting_cancel_confirmation`, `awaiting_reschedule_choice` | Cancel confirm has regex fast-path + AI+tools fallback |
| Emergency | `isEmergencyUserMessage` \|\| `emergency` intent (with intake suppression) | Matches RBH-15 comment |
| Staff service review | `awaiting_staff_service_confirmation` | Matches |
| Consultation channel | `channelReplyPick` after `lastBotAskedForConsultationChannel` | Matches |
| **Post-med payment ack** | `post_medical_payment_existence_ack` (~L1614) | **Not** in inventory table — add row |
| Reason-first triage | Large block when `reasonFirstTriagePhase` set | Matches intent; inner branches use `reason-first-triage` helpers |
| Medical idle / fee idle / greeting / transactional | As in code | Matches |

**Dead branches:** No obvious dead top-level branch from static read; **confirm** with `dmRoutingBranch` usage and tests. Low-traffic paths (e.g. `fee_book_misclassified_idle`) are **intentional** misclassification fixes.

---

## 3. Context helpers: `lastPromptKind` vs substring

**Pattern (RBH-07):** `effectiveAskedForConsent` = `state.lastPromptKind === 'consent' || lastBotMessageAskedForConsent(recentMessages)` (same for details / confirm / match).

**Risk:** Legacy threads without `lastPromptKind` rely on **English substring** lists (e.g. `c.includes('full name')`, `c.includes('reason for visit')`). Any template change can break routing without updating four functions (~L459–L571).

**Mitigation already in code:** `conversationLastPromptKindForStep` on state updates (~L3201 area). **Gap:** audit **all** outgoing DM paths that start consent/confirm/collection to persist `lastPromptKind`.

---

## 4. Keyword / regex routing (sample)

| Kind | Examples | Philosophy note |
|------|----------|-------------------|
| **Step gates** | Numeric cancel/reschedule choice; yes/no cancel confirm | **§5** deterministic execution — OK |
| **Safety** | `isEmergencyUserMessage`, `ACKNOWLEDGMENT_REGEX` post-booking | OK |
| **Fee / reason-first** | `signalsFeePricing` composite; `userExplicitlyWantsToBookNow`, `parseReasonTriageConfirmYes`, … | Mix of LLM + helpers; watch **duplicate** paths vs `ai-service` |
| **Collection / booking** | Relation `text.match(/\b(mother|father|…)/)`; `wantsMeFirst` / `wantsJustOther` full-line regex | **Kin sprawl** — overlaps RT-01 kin list |
| **Status** | `askingForSelfOnly` for `check_appointment_status` | Product-specific; could be LLM slot later |
| **Confirm** | `isCorrectionLegacy` regex **after** `resolveConfirmDetailsReplyForBooking` | Hybrid; legacy catches “no, change:” |

**Rough signal:** treat **~30–40%** of regex uses as **bounded parsers** (yes/no, digits); the rest as **routing** that should shrink as `lastPromptKind` + structured dialog acts mature.

---

## 5. Patient experience — double-ask / fragile spots

| Scenario | Mechanism | Fragility |
|----------|-----------|-----------|
| **Details vs medical** | `inCollection` includes `lastBotAskedForDetails` + `lastPromptKind` | Comment at L1848–1851: **inCollection** prevents deflecting “Pain Abdomen” as medical — **good** |
| **Consent / confirm** | `resolveConsentReplyForBooking` / `resolveConfirmDetailsReplyForBooking` + `effectiveAskedFor*` | If substring misses new prompt wording, user may fall through to **generateResponse** → **re-ask** or wrong tone |
| **Yes on collection** | Block excludes `^(yes|…)$` + `effectiveAskedForConfirm` from **collection** branch so confirm wins | **Good** guard |
| **Persist failure** | Consent path: `persistPatientAfterConsent` failure → slot link + “re-share” message | **P2** copy — could feel like “lost” data |
| **Match** | `parseMatchConfirmationReply` + unclear | **Unclear → No** may frustrate; product choice |

---

## 6. Deliverable: happy path vs fragile branches

### Happy path (booking)

`book_appointment` → channel pick (optional) → **reason-first gate** or `collecting_all` → `validateAndApplyExtracted` → confirm → **consent** → slot link (or match → match confirm → slot).

### Known fragile branches

1. **Reason-first × fee:** `signalsFeePricing` + `userSignalsReasonFirstWrapUp` / `parseNothingElseOrSameOnly` — many conditions; golden tests help.  
2. **Consent block** when `intent` is odd but **effective** consent is true — handled; fragile if **prompt** not recognized.  
3. **`book_appointment` + fee misclassification** (`fee_book_misclassified_idle`) — depends on `signalsFeePricing` and `justStartingCollection`.  
4. **Multi-person booking** (`wantsMeFirst`, `wantsJustOther`) — regex **only** matches fixed phrases.  
5. **Staff review** / **fee ambiguous** — correct handoff; ensure **patient** never sees **slot URL** before staff (already gated in other tasks).

---

## 7. Top 5 hardcoded branches to replace (over time) with structured `lastPromptKind` + LLM

| Priority | Branch / helper | Why replace |
|----------|-----------------|-------------|
| **1** | `lastBotMessageAskedForDetails` / `Consent` / `Confirm` / `Match` substring blocks | Largest **drift** surface; **single source** should be `lastPromptKind` + optional `promptVersion` |
| **2** | Collection `relation` regex + `wantsJustOther` / `wantsMeFirst` | Duplicates kin semantics; align with **booking-relation** module (RT-01 T1a) |
| **3** | `isCorrectionLegacy` on confirm path | **Semantic** resolver exists; fold legacy patterns into **tests** or **one** classifier JSON `{ reply_kind: confirm \| correction \| unclear }` |
| **4** | `check_appointment_status` `askingForSelfOnly` regex | Narrow product rule; **structured** intent field `scope: self \| family` from classifier |
| **5** | Cancel confirm `isYes` / `isNo` regex fast-path | **Keep** for latency; optional: **small** LLM only when regex misses (already partially via `generateResponseWithActions`) |

Items **1–2** are the highest **philosophy** ROI (§4.2 giant chains, §4.5 single owner).

---

## 8. Planned changes (planning only)

1. **Doc:** Add **post_medical_payment_existence_ack** to **RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md** decision table — **done** (2026-04-13).  
2. **Audit:** Grep for `updateConversationState` / send paths; ensure **`lastPromptKind`** set for every consent/confirm/collection/match prompt.  
3. **Metrics:** Log when `effectiveAskedForConsent` is true **only** via substring (lastPromptKind falsy) — measures drift.  
4. **Consolidate:** Fee signals (handler + `ai-service`) — see RT-01 §4.2; **one** documented precedence list.  
5. **Tests:** Expand `dm-routing-golden` (or equivalent) for reason-first + consent wording variants.

---

## 9. Handoff

| Next | Owner |
|------|--------|
| **RT-03** | `collection-service` + extraction alignment |
| **RT-08** | Golden / corpus for fragile branches above |

---

## 10. Status

- [x] RT-02 read complete  
- [x] Inventory doc patch (post-med branch)  
- [ ] Execution: `tm-bot-audit-03` (routing / lastPromptKind) as applicable
