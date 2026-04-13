# RT-08 — Tests, golden corpora, characterization — findings & planned changes

**Review date:** 2026-04-13  
**Scope:** `dm-routing-golden.test.ts`, `dm-routing-golden-corpus.test.ts` + `corpus.json`, `webhook-worker-characterization.test.ts`, `booking-turn-classifiers.test.ts`, `ai-service.test.ts` (sample), `collection-service.test.ts`  
**Reference:** [AI_BOT_BUILDING_PHILOSOPHY.md](../../../../../Reference/AI_BOT_BUILDING_PHILOSOPHY.md) checklist §6 (regression corpus as quality gate); [rt-08-tests-and-corpora.md](../reading%20tasks/rt-08-tests-and-corpora.md)

---

## 1. What each layer covers

| Asset | Role |
|-------|------|
| **`corpus.json` + `previewClinicalIdleDmBranch`** | **Context-heavy** clinical-idle routing: post-med payment existence, reason-first phases (ask_more / confirm), fee bridges, Hinglish amount, anaphora after fee line, explicit catalog ask, **in_collection → null** guard. |
| **`dm-routing-golden.test.ts` + `dm-transcripts/*.json`** | **Flag-level** early branch resolution via `resolveRoutingBranchForFixture` (emergency, medical idle, fee mid-collection, greeting, misclassified fee) — **not** full text simulation. |
| **`webhook-worker-characterization.test.ts`** | **End-state** DM/comment behaviors (consent → slot, confirm → consent+extras, match pick, cancel/reschedule, throttle, comment pipeline). **All I/O mocked**; `classifyIntent` / `generateResponse` stubbed — **no live OpenAI**. |
| **`booking-turn-classifiers.test.ts`** | **Deterministic** `resolveConfirmDetailsReplyForBooking` / `resolveConsentReplyForBooking` — includes **optional-extras** prompt + `"no thats it"` → granted. |
| **`ai-service.test.ts`** | Intent redaction, classification paths, **`jest.mock('../../../src/config/openai')`**; explicit cases when **`OPENAI_API_KEY` unset** → fallback + audit. |
| **`collection-service.test.ts`** | Order, `validateAndApply`, store — **field-level**; not full DM thread. |

**Split:** **`corpus.json` is only `step: responded` / idle clinical preview** (`previewClinicalIdleDmBranch` returns `null` for non-idle steps). **confirm_details / consent / optional extras** are **not** in that corpus; they are covered by **booking-turn-classifiers** and **webhook characterization** instead. That is intentional but should stay **documented** so nobody expects `corpus.json` alone to gate those flows.

---

## 2. Coverage vs RT checklist

1. **Context vs keywords:** Golden corpus is **strong** on **thread + phase** (recent messages, `reasonFirstTriagePhase`, deflection window). **Transcript fixtures** are **mostly keyword/signal flags** (aligned with narrow resolver).  
2. **Optional extras / confirm_details:** Exercised in **unit + worker characterization**, **not** in `corpus.json`.  
3. **Fee thread:** Well covered in `corpus.json` and transcript `fee-idle` / `fee-mid-collection`.  
4. **Gaps called out in RT:** “no thats it” → **booking-turn-classifiers**; **multi-field blobs** → **not** in golden corpus (add under collection or handler characterization). **Hinglish** → one amount scenario in `corpus.json`; room for wrap-up / confirm variants.

---

## 3. Flaky / live API risk

- **`webhook-worker-characterization`:** Documented — **no Meta/OpenAI in CI**.  
- **`ai-service.test`:** OpenAI **mocked**; tests include behavior when API key missing.  
- **No** evidence in sampled files of **unmocked** `openai` calls in these unit tests.

---

## 4. Alignment with philosophy §6

**Regression corpus as gate:** `corpus.json` + transcript fixtures give **repeatable** checks before refactors. **Gap:** `previewClinicalIdleDmBranch` can return **`reason_first_triage_ask_more_ambiguous_yes`** but **no scenario in `corpus.json`** asserts that branch — **instrumentation drift risk**.

---

## 5. Deliverable — minimum new corpus / test entries (elite bar)

**A. `corpus.json` (clinical-idle preview)**

1. **`reason_first_triage_ask_more_ambiguous_yes`** — patient message + `recentMessages` + `lastAssistantDmContent` such that `parseReasonFirstAskMoreAmbiguousYes` fires and user does **not** suggest new clinical reason (matches `dm-routing-clinical-idle-preview.ts` L82–89).  
2. **`fee_follow_up_anaphora_idle`** — if distinct from existing `reason_first_anaphora_after_fee_line` in production metrics, add a **minimal** row that hits the **anaphora-only** fee-idle path (verify expected branch name against `DmHandlerBranch`).  
3. **Hinglish wrap-up** — e.g. `"bas"`, `"ho gaya"`, `"aur kuch nahi"` in **ask_more** with **fee** classifier off, to lock **reason_first_triage_confirm** vs payment bridge.  
4. **Negation / correction** in ask_more — user adds symptom after “nothing else” (already partially covered by `reason_first_confirm_clarify` in confirm phase; add **ask_more** variant if handler differs).

**B. `dm-transcripts` (RBH-20 resolver)**

5. **Kin / “for my father”** booking intent — only if product adds a **data-driven** branch; otherwise track under **RT-01 / T1a** with matcher tests, not transcript flags.  
6. **Emergency + collection** edge — if product cares, mirror **`dm-routing-golden`** test: medical in collection → `unknown` (already asserted in `dm-routing-golden.test.ts`).

**C. Booking / collection (not in clinical idle corpus)**

7. **Multi-field blob** — one user message containing **name + phone** (or **reason + age**) → `validateAndApply` / collection order — **`collection-service.test.ts`** or **characterization** case with mocked extraction.  
8. **Optional extras — Romanized Hindi** — `"nahi bas"` / `"theek hai aage badho"` with **`optionalExtrasPrompt`** in **`booking-turn-classifiers.test.ts`** (parallel to existing `"no thats it"`).  
9. **Consent unclear** — already in **webhook characterization** (`parseConsentReply` → `unclear`); optional **second** system prompt variant to avoid **only** one assistant string.

---

## 6. Planned follow-ups (execution)

- Add **§1 table** to `backend/tests/fixtures/dm-routing-golden/README.md` (or `corpus.json` `notes`) stating **which flows are out of scope** for `corpus.json`.  
- Wire **CI** to fail if **new `DmHandlerBranch`** is added without a **fixture or corpus** row (optional lint).  
- After **T3** (`lastPromptKind` expansion), add **corpus** or **transcript** rows for **consultation channel** and **optional-extras** prompt kinds if they become first-class in preview.

---

## 7. Severity summary

| Severity | Item |
|----------|------|
| **P2** | Missing **`reason_first_triage_ask_more_ambiguous_yes`** in `corpus.json` |
| **P3** | Multi-field blob + Hinglish extras not in corpus/classifiers |
| **—** | confirm_details / consent covered elsewhere — document split |
