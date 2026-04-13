# Plan — Philosophy alignment audit → elite patient experience

**Reference:** [AI_BOT_BUILDING_PHILOSOPHY.md](../../../../../Reference/AI_BOT_BUILDING_PHILOSOPHY.md)  
**Reading tasks:** [../reading tasks/README.md](../reading%20tasks/README.md)  
**Findings log:** [findings-log.md](./findings-log.md) (append as RT-* complete)

---

## 1. Goal

Move the receptionist toward **LLM-first understanding**, **context before keywords**, **single source of truth** per decision, **deterministic execution** (DB, bookings, links), and **minimal** regex/keyword sprawl — so patients get a **human-like**, **non-repetitive**, **trustworthy** DM experience.

---

## 2. Audit method (mandatory order)

1. Complete **RT-01 → RT-09** (can parallelize RT-01–08, RT-09 last).
2. Append findings to **findings-log.md** with **P0–P3** severity.
3. Consolidate into **change themes** (section 4 below).
4. Split execution into **phases** in [../execution/README.md](../execution/README.md) and `docs/task-management/tasks/tm-bot-audit-*.md`.

---

## 3. Principles (non-negotiable from philosophy)

| # | Principle | Violation pattern |
|---|-----------|-------------------|
| P-A | Interpret open text with **structured LLM** + validation | New regex branch per symptom/phrase |
| P-B | **Last turn + thread** in classifiers before global keywords | `no` = deny everywhere |
| P-C | **One canonical classifier** per decision | Same intent in webhook + ai-service + keyword file |
| P-D | **Facts** (fees, URLs, ₹) from DB/templates | Model invents price/link |
| P-E | **Fallback** regex small, bounded, logged | Second copy of NLU in regex |
| P-F | **State** (`lastPromptKind`, step) drives routing | Substring scan of last message only |

---

## 4. Expected change themes (fill after reads)

| Theme | Description | Likely files | Status |
|-------|-------------|--------------|--------|
| T1 | Consolidate intent / dialog-act routing; reduce duplicate fee/keyword paths | `ai-service`, `instagram-dm-webhook-handler`, `intent-routing-policy.test` (RBH-14) | Partial: [rt-01](./rt-01-ai-service-findings-and-planned-changes.md) §4.2, [rt-04](./rt-04-triage-fees-dm-context-findings-and-planned-changes.md) §2 |
| T2 | Expand structured extraction + thread reason | `ai-service`, `collection-service`, `reason-first-triage` | Partial: [rt-03-collection-consent-patient-findings-and-planned-changes.md](./rt-03-collection-consent-patient-findings-and-planned-changes.md) §1, §4, §5 |
| T3 | Replace substring gates with `lastPromptKind` + LLM | `instagram-dm-webhook-handler`, `conversation` types | Partial: [rt-02](./rt-02-instagram-dm-webhook-findings-and-planned-changes.md) §7, [rt-07](./rt-07-utils-validation-types-findings-and-planned-changes.md) §5 |
| T4 | Corpus + tests for context cases; **forbidden/approved** extension points for triage/fees | `dm-routing-golden*`, `dm-routing-clinical-idle-preview`, `booking-turn-classifiers.test` | Partial: [rt-04](./rt-04-triage-fees-dm-context-findings-and-planned-changes.md) §5, [rt-08](./rt-08-tests-and-corpora-findings-and-planned-changes.md) §4–5 |
| T5 | Docs sync | `RECEPTIONIST_BOT_*`, philosophy code map | Partial: [rt-09](./rt-09-reference-docs-cross-check-findings.md) §1, §7 backlog |
| **T1a** | **Kin/booking regex** → data module + tests; optional LLM-first for new terms | `ai-service`, new `booking-relation-terms.ts` (proposed) | From RT-01 §4.2 |
| **T1b** | **Catalog matcher** — Stage A deterministic vs Stage B LLM allowlist; learning orthogonal | `service-catalog-deterministic-match`, `service-catalog-matcher`, `service-match-learning-*` | Partial: [rt-06-catalog-matcher-learning-findings-and-planned-changes.md](./rt-06-catalog-matcher-learning-findings-and-planned-changes.md) §1, §5 |

---

## 5. Success criteria (patient-facing)

- [ ] No **wrong** “haven’t saved” / reset when user meant **skip optional** or **confirm**.
- [ ] No **re-ask** for data already in thread unless clarifying.
- [ ] **One** booking path after confirm + consent (no duplicate asks).
- [ ] Fee / slot **links and amounts** never from raw model text.

---

## 6. Out of scope (unless product says otherwise)

- Full rewrite of `instagram-dm-webhook-handler` in one PR.
- Removing **all** regex (emergency, phone normalize stay per §5).
- Cross-tenant ML training.

---

## 7. Review status

| Phase | Status |
|-------|--------|
| RT-01–09 | **Done** — `planning/rt-01-*` … `rt-09-reference-docs-cross-check-findings.md` |
| Findings consolidated | ✅ RT-01–09 appended in `findings-log.md` |
| Execution tasks created | ✅ [../execution/README.md](../execution/README.md) — `e-task-phil-01` … `e-task-phil-10` |
