# Staff feedback learning system — master plan

**Purpose:** Single reference for **what** we build, **in what order**, and **what we must not break** (privacy, trust, clinical safety).  
**Audience:** Engineers, product, and AI agents implementing learning on top of existing **ARM-06** staff review.

**Related:**
- [STAFF_FEEDBACK_LEARNING_INITIATIVE.md](../../../task-management/STAFF_FEEDBACK_LEARNING_INITIATIVE.md) — task index
- [STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md](../../../Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md) — privacy / allowed fields (learn-01); cite `DC-*` section IDs
- [SERVICE_MATCH_PATTERN_KEY.md](../../../Reference/SERVICE_MATCH_PATTERN_KEY.md) — deterministic `pattern_key` (learn-03)
- [SERVICE_MATCH_SHADOW_METRICS.md](../../../Reference/SERVICE_MATCH_SHADOW_METRICS.md) — shadow vs staff agreement (learn-03)
- [AI_BOT_BUILDING_PHILOSOPHY.md](../../../Reference/AI_BOT_BUILDING_PHILOSOPHY.md) — §9 learning alignment
- [AI_RECEPTIONIST_MATCHING_INITIATIVE.md](../../../task-management/AI_RECEPTIONIST_MATCHING_INITIATIVE.md) — v1 matcher + inbox (prerequisite)
- `backend/migrations/040_service_staff_review_requests.sql` — **no PHI** on review rows by design
- [PRIVACY_BY_DESIGN.md](../../../Reference/PRIVACY_BY_DESIGN.md), [COMPLIANCE.md](../../../Reference/COMPLIANCE.md)

---

## 0. Problem statement

**Today:** Ambiguous matches go to **staff review**; staff **confirms** or **reassigns**; optional `resolution_internal_note`.  
**Gap:** We do not systematically **reuse** those decisions as **labels** for “similar next time,” and we do not have a **gated path** to **auto-finalize** only after **volume + consent**.

**Goal:** A **smart receptionist** feel: fewer redundant reviews for **same class** of ambiguity, with **auditability**, **doctor control**, and **global-ready data handling**.

---

## 1. Product principles (aligned with stakeholder input)

| # | Principle | Implication |
|---|--------|-------------|
| 1 | **Enough examples** | Thresholds per doctor (and optionally per pattern key): min count, min time window, stability checks. |
| 2 | **Not exact phrase** | Similarity uses **structured features** first (reason codes, candidate labels, modality, bucket flags). **Raw patient text** in a learning table is **out of scope for v1** unless legal + privacy sign-off. |
| 3 | **Notify before autobook** | When the system detects a **stable pattern** (e.g. repeated `proposed → final` reassignment), **do not** switch to auto-finalize silently. **Notify** the doctor; show **counts + rationale**; require **explicit opt-in** for that pattern or policy. |
| 4 | **PHI / compliance** | Treat learning as **global product**: minimize data, encrypt at rest, RLS, retention, regional rules, **no PHI in logs**; notes are **internal** and already capped — still avoid copying patient narrative into new stores. |

---

## 1a. Structured-first vs optional NL / AI (clarify scope)

This initiative is **not** “an AI model learns patterns from raw chat by default.”

| Layer | Role | AI / LLM? |
|-------|------|-----------|
| **Labels** | Staff **confirm** / **reassign** = **human** ground truth. | **No** — not model-generated labels. |
| **Learning store + aggregation** | Counts, pattern keys, **structured** feature snapshots (reason codes, candidates, modality, proposed→final). | **No** — deterministic code + SQL. |
| **Shadow / assist / autobook policy** | “Did this case match pattern P?” **same structured features** — rule/hash/k-NN on **vectors** built from allowed fields. | **No** for v1 core path. |
| **Patient message understanding** (existing product) | Matcher / triage already use **LLM + structured output** where appropriate ([AI_BOT_BUILDING_PHILOSOPHY.md](../../../Reference/AI_BOT_BUILDING_PHILOSOPHY.md)) — **separate** from this learning layer. | **Yes** — upstream of staff review, not replaced by learning. |
| **Optional later: semantic similarity** | “Same *meaning* as past cases” when structured features are not enough — **embeddings** or LLM-assisted similarity on **redacted** or **approved** text. | **Yes** — **gated** by learn-01 privacy + explicit product phase. |

**Takeaway:** Open-ended **natural language** is **advantageous** for *interpretation* (why the existing matcher uses LLM). For **learning from staff actions**, v1 relies on **structured signals + frequency + consent**, not hardcoded patient keyword lists **and** not a requirement for a separate learning-only LLM. Keywords in the fee/matcher paths remain **supplementary** fast paths per philosophy, not the main learning mechanism.

---

## 2. Learning loop (conceptual)

1. **Trigger:** Staff resolves a review (`confirmed` / `reassigned` / optional `cancelled_by_staff` excluded from positive labels unless policy says otherwise).
2. **Label:** `final_catalog_service_key` + whether proposal was accepted or changed.
3. **Features:** Snapshot of **allowed** matcher fields (from conversation state or review row), **hashed or structured only** per privacy charter.
4. **Aggregate:** Roll up patterns per `doctor_id` + **pattern key** (e.g. hash of sorted reason codes + candidate keys + proposed→final pair). **Exact formula** is specified in learn-03 (and learn-01 if it affects allowed fields) — see [tasks/README.md](./tasks/README.md); no separate “appendix” required if the spec lives in the learn-03 PR or a short `docs/Reference/` note linked here.
5. **Policy:** Shadow → assist → **autobook only** with **opt-in** + thresholds.

---

## 3. Phased delivery

| Phase | Name | User-visible? | Purpose |
|-------|------|-----------------|--------|
| **0** | Privacy + data contract | No | Lock fields, retention, legal checklist; **block** implementation until signed. |
| **1** | Learning store + ingest | No | Persist learning examples from resolved reviews; backfill job optional. |
| **2** | Shadow evaluation | No | At matcher time, compute “would suggest” vs actual staff outcome; log only. |
| **3** | Metrics + alerts | Internal | Dashboards: agreement rate, pattern counts, drift. |
| **4** | Doctor notification + opt-in | Yes | **“We noticed repeated reassignment X→Y; enable autobook for this pattern?”** |
| **5** | Assist mode | Yes | Inbox shows **similar past resolutions** without auto action. |
| **6** | Autobook (gated) | Yes | Auto-finalize **only** if policy + opt-in + thresholds; full audit. |

Phases **4–6** must not ship before **2** shows acceptable precision on shadow metrics.

### 3a. Plan phases ↔ implementation tasks

| Plan phase | What it is | Covered by |
|------------|------------|------------|
| 0 | Privacy / data contract | **e-task-learn-01** |
| 1 | Learning store + ingest | **e-task-learn-02** |
| 2 + 3 | Shadow evaluation **and** internal metrics / export | **e-task-learn-03** (metrics bundled with shadow for v1) |
| 4 | Doctor notification + opt-in policy records | **e-task-learn-04** |
| 5 + 6 | Assist UI **and** gated autobook | **e-task-learn-05** (ship assist before or with autobook per rollout flags) |

---

## 4. Risks (expanded) and mitigations

### 4.1 Cold start

- **Risk:** Too few examples → noisy or wrong rules.  
- **Mitigation:** Minimum N per pattern; show “insufficient data” in doctor UI; fall back to v1 matcher + staff review.

### 4.2 Overfitting to one patient/thread

- **Risk:** “Learning” one patient’s wording.  
- **Mitigation:** Features that generalize; optional patient-level weighting only with explicit design; decay old examples.

### 4.3 Wrong auto-finalize

- **Risk:** Incorrect service → wrong price / wrong pathway.  
- **Mitigation:** Shadow first; high thresholds; **opt-in**; **rollback** (disable policy); audit every auto decision.

### 4.4 PHI creep

- **Risk:** Storing raw messages or unnecessary identifiers in learning tables.  
- **Mitigation:** **Default deny** for new PHI columns; **data minimization**; DPIA-style checklist for embeddings; align with [COMPLIANCE.md](../../../Reference/COMPLIANCE.md).

### 4.5 Bad labels

- **Risk:** Staff misclick or inconsistency becomes “truth.”  
- **Mitigation:** Recency weighting; **exclude** from training on explicit admin flag; monitor override rate after assist/autobook.

### 4.6 Feedback loops

- **Risk:** Wrong automation stops generating corrections → silent drift.  
- **Mitigation:** Sampled audits; **disagreement** metrics (staff reassigns after auto); periodic policy review.

### 4.7 Fairness / wording

- **Risk:** Different phrasing → different routing.  
- **Mitigation:** Prefer structured signals; test diverse phrasings in corpus when text is used.

### 4.8 Trust

- **Risk:** Doctors disable feature if opaque.  
- **Mitigation:** Explainable copy (“based on 12 past reassigned cases you agreed to”), clear opt-out.

---

## 5. Consent-before-autobook (product flow)

1. System detects **pattern stability** (e.g. same `proposed_key` + `final_key` + feature bucket, count ≥ N, over window W).  
2. **Notification** to doctor (in-app + optional email): summary, counts, **example structured signals** (not raw PHI).  
3. Doctor **reviews** and chooses: **Enable autobook for this pattern** / **Not now** / **Never suggest this**.  
4. **Version** the policy record (who, when, what scope).  
5. **Autobook** only applies to **matching** new cases **after** consent timestamp.

---

## 6. Success metrics

- **Staff:** Time to resolve per review; **reassign rate** (target: stable or down after assist).  
- **Shadow evaluation:** Precision/recall (or agreement rate) of shadow suggestion vs final staff action; calibration of **structured** similarity scores — not an ML model accuracy unless a semantic layer ships.  
- **Safety:** **Post-autobook** staff override rate; patient complaints.  
- **Adoption:** % doctors with ≥1 enabled policy; **disable** rate.

---

## 7. Out of scope (v1)

- **Global** cross-tenant learning (one model for all clinics) — **not** unless separate enterprise agreement.  
- **Raw message** storage in learning DB — **not** without privacy review.  
- **Removing** staff review entirely — **not**; automation is **narrow**.  
- **Mandatory** learning-layer LLM for pattern detection — **not**; structured path is **default**.

---

## 8. Task file mapping

See [tasks/README.md](./tasks/README.md) for **e-task-learn-01** … **e-task-learn-05** and execution order.

**Operational notes (when implementing):**

- **Thresholds** (min N, window W, stability) — centralize in env or `doctor_settings` / config table; document defaults and who can tune (ops runbook).  
- **Kill switches** — `SHADOW_LEARNING_ENABLED`, `LEARNING_AUTOBOOK_ENABLED` (see learn-03 / learn-05): document incident response (disable flags before code rollback if needed).  
- **Concurrency** — learn-05 should define idempotent policy application (same conversation / same pattern) to avoid double state transitions.

---

**Last updated:** 2026-03-31
