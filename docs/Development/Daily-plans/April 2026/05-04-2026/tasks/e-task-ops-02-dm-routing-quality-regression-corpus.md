# e-task-ops-02: DM routing quality — metrics, golden corpus, review loop

## 2026-05-04 — scoped planning

---

## 📋 Task Overview

Engineering can improve **intent** (see [e-task-dm-06](./e-task-dm-06-classifier-led-payment-fee-routing.md)), but **product quality** also needs a **repeatable loop**: know which **`DmHandlerBranch`** fires, spot **misroutes** (e.g. `reason_first_triage_ask_more` right after payment curiosity), and maintain a **small golden corpus** of transcripts so changes do not regress real conversations.

**Estimated time:** 2–4 days (docs + fixtures + optional dashboard); ongoing **light** review (~30 min/week)  
**Status:** ✅ **SHIPPED** (corpus + regression tests + observability + playbook — 2026-04-05)  
**Completed:** Golden corpus under `backend/tests/fixtures/dm-routing-golden/`; `previewClinicalIdleDmBranch`; Jest `dm-routing-golden-corpus.test.ts`; `OBSERVABILITY.md` section; `MISROUTE_PLAYBOOK.md`.

**Change type:**

- [x] **New feature** — fixtures, scripts, docs, optional logging fields
- [x] **Update existing** — observability queries, CI job, dashboard — per scope; follow [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md) when touching app code

**Dependencies:**

- **e-task-dm-06** (optional but complementary) — classifier changes should add **explicit** log fields / dimensions for new signals.
- Existing: `logInstagramDmRouting`, `instagram_dm_routing` (see [OBSERVABILITY.md](../../../../../Reference/OBSERVABILITY.md)).

---

## 🎯 Goals

1. **Golden corpus** — versioned **anonymized** transcripts (expected branch sequence + short notes). Stored under repo (e.g. `backend/tests/fixtures/dm-routing-golden/` or `docs/Development/.../fixtures/`) — **no real PHI**; synthetic or redacted.
2. **Regression mechanism** — at least one of: (a) Jest tests that replay **stubbed** classifier outcomes through a thin routing helper, or (b) document **manual** staging checklist + link to corpus.
3. **Metrics / review** — define **1–3** SQL or log queries (or dashboard tiles): e.g. % `unknown`, % `reason_first_triage_ask_more` following `medical_safety`, fee branches after post-medical ack. Enough to catch drift after deploy.
4. **Misroute playbook** — one-page “if users see X, check branches Y/Z” for support.

---

## ✅ Task breakdown

### 1. Corpus

- [x] 1.1 Collect **10–20** anonymized scenarios: symptom → deflection → payment question → expected path (post-medical ack, narrow fee, triage, etc.). _(13 rows in `corpus.json`, synthetic only.)_
- [x] 1.2 Encode as **YAML/JSON or markdown tables** with: `messages[]`, `expected_branch` (or sequence), `flags` (clinical-led, post_ack, …).
- [x] 1.3 Cross-link from [05-04-2026 README](../README.md) and [OBSERVABILITY.md](../../../../../Reference/OBSERVABILITY.md).

### 2. Automation (minimum viable)

- [x] 2.1 Add **unit-level** tests: given `ConversationState` + `recentMessages` + **stub** `intentResult`, assert `dmRoutingBranch` (extract pure decision helper if needed — scope carefully). → `previewClinicalIdleDmBranch` + `dm-routing-golden-corpus.test.ts`
- [x] 2.2 **Optional:** script to diff branch mix week-over-week (logs export) — doc only if no code in v1. _(Queries documented in OBSERVABILITY; no export script in v1.)_

### 3. Ops & docs

- [x] 3.1 Update [OBSERVABILITY.md](../../../../../Reference/OBSERVABILITY.md) with **queries** and “healthy ranges” caveats.
- [x] 3.2 Add **review cadence** (e.g. weekly) and owner in this file or `TASK_MANAGEMENT_GUIDE` pointer. → [MISROUTE_PLAYBOOK.md](../../../../../../backend/tests/fixtures/dm-routing-golden/MISROUTE_PLAYBOOK.md)

### 4. Verification

- [x] 4.1 New tests / checklist run green.
- [ ] 4.2 Staging dry-run of **two** new corpus rows after [e-task-dm-06](./e-task-dm-06-classifier-led-payment-fee-routing.md) lands (if parallel, note dependency). _(Recommended manual follow-up.)_

---

## 📁 Deliverables

```
docs/Development/Daily-plans/April 2026/05-04-2026/fixtures/   (or tests/fixtures — pick one)
docs/Reference/OBSERVABILITY.md                               (section update)
backend/tests/...                                              (optional routing tests)
```

---

## 🌍 Privacy

- [x] **No real patient content** in committed corpus; use synthetic Hindi/English mix if needed.
- [ ] If production logs are used for analysis, follow existing **redaction** and access policies.

---

## ✅ Acceptance criteria

- [x] **Corpus** checked in with **≥10** scenarios and clear expected branches.
- [x] **OBSERVABILITY** documents how to measure routing mix and spot regressions.
- [x] **≥1** automated test or documented manual gate that blocks obvious misroute regressions.

---

**Last updated:** 2026-05-04
