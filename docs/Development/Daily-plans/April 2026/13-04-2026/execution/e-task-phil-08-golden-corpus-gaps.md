# e-task-phil-08 — Golden corpus & tests: RT-08 minimum entries

**Initiative:** [BOT_PHILOSOPHY_ELITE_AUDIT_2026.md](../../../../../task-management/BOT_PHILOSOPHY_ELITE_AUDIT_2026.md)  
**Themes:** T4  
**Planning source:** [rt-08-tests-and-corpora-findings-and-planned-changes.md](../planning/rt-08-tests-and-corpora-findings-and-planned-changes.md) §4–5  
**Maps to:** [tm-bot-audit-03-consent-confirm-corpus.md](../../../../../task-management/tasks/tm-bot-audit-03-consent-confirm-corpus.md) (overlap)

---

## Objective

Close **P2** gap: add **`reason_first_triage_ask_more_ambiguous_yes`** scenario to **`corpus.json`**; add **Hinglish** wrap-up / **multi-field blob** tests per plan §5.

---

## Tasks

- [x] **`backend/tests/fixtures/dm-routing-golden/corpus.json`:** new scenario for `reason_first_triage_ask_more_ambiguous_yes` matching `previewClinicalIdleDmBranch` (see `dm-routing-clinical-idle-preview.ts` L82–89).
- [x] **Booking turn classifiers:** Romanized Hindi optional-extras (`nahi bas`, etc.) if not covered.
- [x] **Collection:** multi-field blob test (name+phone in one message) in **`collection-service.test.ts`** or characterization.
- [x] Verify **`fee_follow_up_anaphora_idle`** vs `fee_deterministic_idle` — add scenario if uncovered.
- [x] Optional: **`corpus.json` `notes`** — document that **confirm_details / consent** are **not** in clinical-idle corpus (preview scope).

_Corpus: `reason_first_explicit_catalog_fee_thread_anaphora` asserts **`fee_follow_up_anaphora_idle`** (explicit catalog ask + `fee_thread_continuation` + fee-topic bot line, without pricing-keyword fallback on user text). **`fee_deterministic_idle`** remains covered by **`reason_first_full_fee_list_escape`**._

_`corpus.json` already states preview scope in `notes`; no change._

---

## Acceptance criteria

- `dm-routing-golden-corpus.test.ts` passes with new rows; CI green.

---

## Out of scope

- Full handler simulation in JSON — golden remains **preview**-scoped.
