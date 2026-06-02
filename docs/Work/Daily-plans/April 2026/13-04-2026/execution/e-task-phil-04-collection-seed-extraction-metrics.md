# e-task-phil-04 — Collection: reason seed parity, extraction metrics, consent regression

**Initiative:** [BOT_PHILOSOPHY_ELITE_AUDIT_2026.md](../../../../../task-management/BOT_PHILOSOPHY_ELITE_AUDIT_2026.md)  
**Themes:** T2  
**Planning source:** [rt-03-collection-consent-patient-findings-and-planned-changes.md](../planning/rt-03-collection-consent-patient-findings-and-planned-changes.md) §4–6  
**Maps to:** [tm-bot-audit-02-extraction-thread.md](../../../../../task-management/tasks/tm-bot-audit-02-extraction-thread.md), [tm-bot-audit-03-consent-confirm-corpus.md](../../../../../task-management/tasks/tm-bot-audit-03-consent-confirm-corpus.md)

---

## Objective

Guarantee **`seedCollectedReasonFromStateIfValid`** runs on **every** reason-first → collection entry; add **metrics** for dropped fields in `validateAndApplyExtracted`; add/verify **tests** for optional-extras **"no"** vs consent **deny**.

---

## Tasks

- [x] **Audit** all call sites that set `step` to `collecting_all` / collection — ensure **seed** when `state.reasonForVisit` present (see RT-03 ~L2870, ~L3105 references; verify any new paths).
- [x] **Metrics:** counter or log aggregate when guard drops field (symptom/relation/gender) in **`validateAndApplyExtracted`** — no PHI in labels.
- [x] **Tests:** consent flow — user **"no"** on optional extras vs **deny** bare consent (extend **`booking-turn-classifiers.test.ts`** or webhook characterization if missing).
- [x] Optional: expand **`collection-service`** header diagram (phone/email → AI → regex) per RT-03 §6.1.

_Audit: `seedCollectedReasonFromStateIfValid` is invoked on primary book→collection paths (~2880, ~3115). Other `collecting_all` entries (e.g. book-for-someone-else, emergency resume) intentionally clear or omit seed — see handler._

_Skipped optional diagram — no change requested._

---

## Acceptance criteria

- Grep-based audit checklist committed or attached to PR.
- At least one new/updated test covering **optional extras** negation vs consent denial.

---

## Out of scope

- Replacing **`parseConsentReply`** keyword list with LLM-only — fast path remains per product.
