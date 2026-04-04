# e-task-dm-04: Reason-first DM triage — confirm reasons, silent catalog assignment, no full fee menu

## 2026-04-04

---

## 📋 Task Overview

Many patients **open with a reason for visit** (“blood sugar 189,” “high blood sugar,” “I want to discuss X”). Today, **pricing / fee branches** can still respond with the **full teleconsult catalog** (`fee_deterministic_idle` → `composeIdleFeeQuoteDmWithMeta`), which:

- Invites **price-based choosing** (cheaper row vs clinically appropriate row).
- Increases **service mismatch** risk relative to a **single assigned** `service_key`.
- Feels less **human** than: acknowledge → **ask if anything else** → **confirm** → **assign internally** → show **one** fee story (or proceed to intake with `reason_for_visit` pre-seeded).

This task defines **product + engineering** work: a **reason-first triage** path that **defers or replaces** the **full markdown catalog** until the thread is in an appropriate state (e.g. **pure** “how much?” with **no** reason, or **post-assignment** narrow quote).

**Estimated Time:** 5–10 days (branching + composer + state + tests + staging)

**Status:** ✅ **COMPLETE (engineering)** — routing, classify/generate context, collection pre-seed, docs, and unit tests shipped. **Staging proof** (screenshots on a live Meta-linked doctor) remains an **operator** checklist below; it cannot be completed from the repo alone.

**Why some bullets stayed open initially:** The first pass prioritized **safe, testable behavior** (defer full catalog → confirm → narrow fee) without blocking on product calls (pre-seed copy, classify prompt text, docs). Those gaps are now closed in code + reference docs except **live staging evidence**.

**Change Type:**

- [x] **Update existing** — Instagram DM webhook, `consultation-fees`, `ai-service` classify context + post-policy, `collection-service` seed helper, `ConversationState` / `DmHandlerBranch`, `reason-first-triage.ts`
- [x] **Documentation** — `RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md`, `RECIPES.md` (reason-first paragraph)

**Dependencies:**

- **e-task-dm-02** — thread-aware matcher / fee narrowing (inputs to assignment).
- **e-task-dm-03** — turn context + deflection memory (classify / generate continuity).
- **e-task-ops-01** — `matcher_hints` in data (generic matcher; no per-label code).

**Reference:**

- [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)
- [AI_RECEPTIONIST_PLAN.md](../../../../../task-management/AI_RECEPTIONIST_PLAN.md)
- [catalog-matcher-hints.md](../../../../runbooks/catalog-matcher-hints.md) (ops alignment)

---

## 🎯 Product principles (non-negotiables)

1. **Triage before tariff:** If the user already gave a **visit reason**, the **next** assistant turns should **enrich / confirm** that reason—not open a **multi-service price list** by default.
2. **Assignment is server-side:** Final or proposed `service_key` comes from **matcher + rules + optional staff gate**; the patient does not pick from labeled SKUs to save money.
3. **One price surface after assignment:** Show fees for the **assigned** (or **proposed**) row—and modalities if same tier—not the whole catalog.
4. **Safety first:** **Emergency** and idle **`medical_query`** deflection paths **keep priority** over this flow; no diagnostic advice in copy.
5. **PHI / compliance:** Any new persisted **reason gist** fields must follow **`ConversationState` / COMPLIANCE** rules (prefer integration with existing **collection** / **matcher** inputs; avoid new free-text PHI blobs in metadata unless policy-approved).

---

## ✅ Task breakdown

### 1. Design & detection

- [x] **1.1** Define **signals** for “reason-first / symptom-led” thread (examples: first message contains reason-like content; post–medical-deflection follow-up; classifier + heuristics; **not** pure fee keywords only). Document edge cases (vague “I need doctor,” single-word replies).
  - *Shipped:* `backend/src/utils/reason-first-triage.ts` (`userMessageSuggestsClinicalReason`, `recentPatientThreadHasClinicalReason`, `shouldDeferIdleFeeForReasonFirstTriage`, etc.). *Open:* dedicated doc of edge cases in runbook / task note.
- [x] **1.2** Define **when full catalog is still allowed** (e.g. user explicitly asks “what are all your consultation types / prices?” with **no** clinical reason; product-approved wording).
  - *Shipped:* `userWantsExplicitFullFeeList` + handler escape to `fee_deterministic_idle`; triage block also respects explicit list while in phase.
- [x] **1.3** Map **phases** to persistable state (see §3): e.g. `collect_additional_reasons` → `confirm_visit_reason` → `reason_locked` / `assignment_pending` → existing booking or fee narrow.
  - *Shipped:* `reasonFirstTriagePhase: 'ask_more' | 'confirm'` in `ConversationState`; after confirm + yes, fee quote + matcher merge (no separate `reason_locked` key).

### 2. Conversation flow (Say + Decide)

- [x] **2.1** After detection, **Say:** empathetic boundary + **one** question: “Anything **else** the doctor should address at this visit?” (or locale-specific variant); reuse **generateResponse** with strong template guardrails **or** deterministic copy—product choice.
  - *Shipped:* deterministic `formatReasonFirstAskMoreQuestion` (EN / HI / PA).
- [x] **2.2** **Say:** play back **consolidated** reason: “So we’re booking to discuss: **…** — is that right?” Yes / minor correction handling.
  - *Shipped:* `formatReasonFirstConfirmQuestion`, `formatReasonFirstConfirmClarify`, `parseReasonTriageNegationForClarify`, snippet from `buildConsolidatedReasonSnippetFromMessages` (incl. “nothing else” omitting filler line).
- [x] **2.3** On confirmation, **Decide:** run **catalog match** on **full redacted reason thread** (`buildFeeCatalogMatchText` / `matchServiceCatalogOffering` patterns); merge into existing **ARM** proposal / finalize rules; **no** internal `service_key` labels in patient copy unless product requires.
  - *Shipped:* `composeIdleFeeQuoteDmWithMeta` + `buildFeeCatalogMatchText` + `mergeFeeQuoteMatcherIntoState` / high-confidence finalize from fee composer (same patterns as idle fee).

### 3. State & persistence

- [x] **3.1** Add or reuse **`ConversationState`** fields for triage phase (minimal enums / flags; avoid duplicating long PHI strings if collection service already holds reason).
  - *Shipped:* `ReasonFirstTriagePhase` + `reasonFirstTriagePhase?` in `conversation.ts`.
- [x] **3.2** Clear / reset triage flags when user **starts fresh booking**, **revokes**, or **cancel paths**; document interaction with **`lastMedicalDeflectionAt`** (e-task-dm-03).
  - *Shipped:* `reasonFirstTriagePhase: undefined` anywhere `lastMedicalDeflectionAt` is cleared, plus revoke + emergency paths.
- [x] **3.3** If `reason_for_visit` is confirmed before formal intake, **pre-fill** collection or skip re-ask per product rules.
  - *Shipped:* On reason-first **yes**, persist **`state.reasonForVisit`** from consolidated thread snippet; on **`justStartingCollection`** and **`book_responded` → collection**, **`seedCollectedReasonFromStateIfValid`** writes Redis **`reason_for_visit`** and sets **`collectedFields`** to include `reason_for_visit`; opening template omits re-asking reason when seeded.

### 4. Fee composer & webhook routing

- [x] **4.1** In **`instagram-dm-webhook-handler.ts`**, **preempt** or **narrow**:**`fee_deterministic_idle`** (and related paths: misclassified book + pricing-only book) when **§1** signals say “reason-first triage active” — do **not** call full-catalog composer for that turn.
  - *Shipped:* defer on `fee_deterministic_idle`, `fee_book_misclassified_idle`, `book_responded` pricing-only; continuation branch after channel pick, before idle `medical_query`.
- [x] **4.2** Extend **`dm-reply-composer.ts`** (or parallel helper): **`composeNarrowFeeQuoteDmWithMeta`** / `idle` **mode** — single-row (or assigned-row) markdown + follow-up discount lines as today; **no** full service list.
  - *Shipped:* **`consultation-fees.ts`** — narrow intro when a single catalog row is rendered (`localizeNarrowFeeCatalogIntro`); still uses `composeIdleFeeQuoteDmWithMeta` (no separate `composeNarrowFeeQuoteDmWithMeta` symbol).
- [x] **4.3** Ensure **mid-collection** fee path still correct when user asks price **during** intake (existing behavior; regression tests).
  - *Verified:* `consultation-fees` unit tests still pass; mid-collection branch unchanged.

### 5. AI & classification

- [x] **5.1** Extend **`ClassifyIntentContext`** / prompts if needed so **pricing** intent after **reason** does not force **book** vs **ask** errors (see e-task-dm-03 patterns).
  - *Shipped:* **`conversationGoal: 'reason_first_triage'`** + classifier user-content block; **`applyIntentPostClassificationPolicy`** treats **`reasonFirstTriagePhase`** like fee-adjacent thread for book→ask downgrades when the message looks pricing-shaped.
- [x] **5.2** **`buildAiContextForResponse`:** ensure triage phase supplies **`lastBotMessage`** + phase hint so replies stay **thread-coherent**.
  - *Shipped:* **`idleDialogueHint`** when **`reasonFirstTriagePhase`** set (webhook-local **`buildAiContextForResponse`**). **`lastBotMessage`** unchanged (still last bot line from thread).

### 6. Instrumentation & docs

- [x] **6.1** Add / extend **`DmHandlerBranch`** (or metrics tags) for new branches (e.g. `reason_first_triage_ask_more`, `reason_first_confirm`, `fee_quote_narrow_assigned`).
  - *Shipped:* `reason_first_triage_ask_more`, `reason_first_triage_confirm`, `reason_first_triage_fee_narrow` in `dm-instrumentation.ts` + handler.
- [x] **6.2** Update **[RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md](../../../../../Reference/RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md)** (or equivalent) and **RECIPES.md** once stable.

### 7. Verification

- [x] **7.1** **Unit tests:** composer narrow vs full; state transitions; handler branch selection with fixture messages (reason-first first message → no full catalog string; contains single assigned label or fee line only).
  - *Shipped:* `backend/tests/unit/utils/reason-first-triage.test.ts`; existing `consultation-fees` / `dm-routing-golden` still pass. *Open:* dedicated handler/golden fixture for full triage transcript.
- [ ] **7.2** **Staging:** transcript like screenshots (blood sugar first message) → **no** Skin + General + NCD + Other list; after confirm → **NCD-appropriate** narrow fee or booking prompt.
  - *Operator checklist (manual):* (1) Use a doctor with **multi-row** teleconsult catalog + Instagram linked. (2) DM: symptom-led first line (e.g. blood sugar concern). (3) Expect **ask-more** triage, not full multi-service list. (4) Reply **nothing else** → **confirm** → **yes** → **narrow** fee block + booking CTA. (5) Say **book** → expect collection prompt **without** re-asking reason if seed applied. (6) Capture screenshots or paste transcript into release notes.
- [x] **7.3** **Regression:** pure “how much is video consult?” still gets an **acceptable** answer per **§1.2**.
  - *Shipped:* defer only when clinical / deflection-window signals fire; pure pricing without those signals still hits `fee_deterministic_idle` (full catalog when multi-row).

---

## 📁 Files likely touched (audit during implementation)

| Area | Path(s) |
|------|---------|
| DM orchestration | `backend/src/workers/instagram-dm-webhook-handler.ts` |
| Fee copy | `backend/src/utils/dm-reply-composer.ts`, possibly `consultation-fees.ts` |
| State types | `backend/src/types/conversation.ts`, `dm-instrumentation.ts` |
| Matcher | `backend/src/services/service-catalog-matcher.ts` (timing / inputs only; no per-label hacks) |
| Turn context | `backend/src/utils/dm-turn-context.ts` |
| AI | `backend/src/services/ai-service.ts` (context / classify edge cases) |
| Tests | `backend/tests/unit/workers/`, `dm-reply-composer` / consultation-fees tests, new fixtures |
| Docs | `docs/Reference/RECIPES.md`, branch inventory |

---

## 🌍 Global safety gate

- [x] **Data touched?** Y if new `conversations.metadata` fields — schema / RLS / migration review per project rules.
  - *Note:* new enum-style metadata only (`reasonFirstTriagePhase`); confirm storage/RLS with your Supabase policy checklist if required.
- [x] **PHI in logs?** MUST remain **No**; redaction on AI paths unchanged.
- [x] **External AI?** Y if triage copy uses `generateResponse` — existing audit / consent paths apply.
  - *Shipped:* ask-more / confirm copy is **deterministic** (no `generateResponse` on those turns).
- [x] **Clinical safety:** Bot must **not** diagnose or treat; assignment is **scheduling** routing only.

---

## ✅ Acceptance criteria

- [x] Reason-led first messages (within defined detection) **do not** receive the **full multi-service teleconsult price list** by default.
- [x] Flow includes **ask for other reasons** and **confirm** before **silent** (patient-invisible key) assignment or explicit **narrow** quote for the matched row.
- [x] **Low-confidence** match routes to existing **clarify** or **staff review** patterns—not full catalog as first resort.
  - *Shipped (inherited):* reason-first does not change matcher rules; after confirm, same **`composeIdleFeeQuoteDmWithMeta`** + ARM finalize / staff gate as idle fee. **Regression:** covered by existing consultation-fee + routing tests; edge cases in **7.2** staging.
- [x] Documented **escape hatch** for legitimate “list all prices” intent without breaking §1.
- [x] Tests + staging evidence for at least one **end-to-end** reason-first transcript.
  - *Shipped:* **`reason-first-triage`**, **`collection-triage-seed`**, **`intent-routing-policy`** unit tests. *Optional:* complete **7.2** screenshots for release audit.

---

## 🔗 Related tasks

- [e-task-dm-02-thread-aware-fee-catalog.md](./e-task-dm-02-thread-aware-fee-catalog.md)
- [e-task-dm-03-turncontext-memory-layer.md](./e-task-dm-03-turncontext-memory-layer.md)
- [e-task-dm-05-silent-fee-menu-closure.md](./e-task-dm-05-silent-fee-menu-closure.md) — follow-up: clinical-led strict closure, anaphora routing, microcopy promise
- [e-task-ops-01-ncd-catalog-hints.md](./e-task-ops-01-ncd-catalog-hints.md)

---

**Last updated:** 2026-03-31  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)
