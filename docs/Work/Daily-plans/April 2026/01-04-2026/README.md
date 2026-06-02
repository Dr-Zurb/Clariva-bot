# 2026-04-01 — AI receptionist: service matching, human review, payments

**Date:** 2026-04-01  
**Theme:** Plan for an **AI-first receptionist** that maps patient **complaint / reason** to **`service_offerings_json`** without letting patients self-select priced tiers; **mandatory “Other / not listed”** catch-all; **confidence-based** routing: **high** → slot + **single capture**; **low/ambiguous** → **no slot & no capture** until **24h** staff review, then slots + **one** payment (**no** v1 incremental charges or holding fees). **Age/paeds** deferred.

**Status:** 🟡 Planning document — implementation not started

---

## Documents

| Doc | Purpose |
|-----|---------|
| [plan-ai-receptionist-service-matching-and-booking.md](./plan-ai-receptionist-service-matching-and-booking.md) | Full product + technical planning, failure modes, payment strategies, doctor/patient UX |
| [tasks/](./tasks/) | **Executable breakdown:** `e-task-arm-01` … `e-task-arm-11`, index + dependency graph |

---

## Why this plan exists

- Self-service **service pick** on `/book` biases toward **lowest price** and misaligned visit types.
- **Ambiguous** flows that **capture** payment then **refund** often still incur **non-reversible gateway fees** (e.g. Razorpay platform fee on original capture).
- Doctors need a **catch-all** path (**Other / not listed**) so **no-match** never dumps patients into “choose cheapest” UI.

---

## Suggested implementation phases (summary)

1. **Catalog contract** — mandatory **Other / not listed** row (`service_key` e.g. `other`) + rich fields + dashboard nudges.  
2. **Matcher v1** — structured output, allowlist validation, confidence bands; persist `catalogServiceKey` + `match_confidence`.  
3. **`slot-page-info` + `/book`** — pre-fill when appropriate; no patient-led price shopping as primary path.  
4. **Pending review** — **no slot until confirm**; **24h SLA**; **single payment** after resolution (**no** v1 incremental/hold fees). **Mandatory audit** on staff actions.  
5. **Review → ops improvement** — corrections drive copy/keywords (not silent ML training).  
6. **Deferred:** age gates / paediatric booking; auth-only holds; incremental charges.
