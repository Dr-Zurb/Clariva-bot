# e-task-ops-01: Practice catalog matcher hints — NCD / diabetes / blood sugar



## 2026-04-04



---



## 📋 Task Overview



**Operational** task for doctors/admins configuring **teleconsult catalog** rows. **NCD / diabetes / blood sugar** here is a **concrete example** of a row that under-performed when hints were empty—not a request for **application code** tied to that label.



### Philosophy — scale through the system, not per-label code



- **Do not** add TypeScript branches, enums, or special cases per doctor label or service name. With many practices and thousands of label variants, that approach does not scale and duplicates logic.

- **Do** keep improving the **generic** matcher, context, and guardrails in code (see **e-task-dm-02**, **e-task-dm-03**).

- **Do** use **per-row configuration**: `matcher_hints` (keywords, include_when, exclude_when) and patient-readable descriptions in **`service_offerings_json`**. Each practice tunes **their** rows in data; the same backend code serves all catalogs.



**Example row (reported issue):**



- **Matching hints** (keywords, book when, not when) were **empty** in the screenshot, while **description** used abbreviations (e.g. HTN, DMT2) that patients rarely type verbatim.

- Filling **patient-facing synonyms** (blood sugar, diabetes, sugar high, fasting glucose, BP / hypertension where appropriate) improves **deterministic** matcher scores in `service-catalog-matcher` and reduces wrong routing to **General checkup** or full-menu fee dumps when the generic matcher is tightened.



This task is **primarily process** in **admin UI / doctor settings**; optional product copy illustrates hint fields generically. Engineering follow-ups are **UX/examples only**, not new matchers per label.



**Estimated Time:** 0.25–0.5 day (per practice)  

**Status:** ✅ **DONE (repo + product guidance)** — runbook, admin copy, and task spec shipped. **Per-practice** hint population and staging DM checks follow [`catalog-matcher-hints.md`](../../../../runbooks/catalog-matcher-hints.md).



**Change Type:**

- [x] **Update existing** — configuration data (`service_offerings_json`), not necessarily code



**Current State:**

- ✅ Backend supports **matcher_hints** on catalog entries (keywords, include_when, exclude_when) for **any** row—no per-label code path required.

- ✅ **Runbook** + **admin UI** copy guide practices on patient-facing synonyms vs abbreviations.

- ⚠️ Individual practices must still **fill** hints in their own settings; **empty hints** still weaken the deterministic matcher until they do.



**Reference:**

- [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)

- [AI_RECEPTIONIST_MATCHING_INITIATIVE.md](../../../../../task-management/AI_RECEPTIONIST_MATCHING_INITIATIVE.md)

- **Runbook:** [catalog-matcher-hints.md](../../../../runbooks/catalog-matcher-hints.md)



---



## ✅ Task Breakdown



### 0. Repository specification (engineering / docs) — **DONE**

- [x] **0.1** **Philosophy** in this file: variation handled by **generic matcher + per-row `matcher_hints`**, not per-label TypeScript.

- [x] **0.2** **Example-only framing:** NCD / blood sugar = illustrative row; acceptance and verification refer to **intended catalog row**, not hardcoded service keys.

- [x] **0.3** [`04-04-2026/README.md`](../README.md) table row updated to “data only, no per-label code.”



### 1. Content (practice owner / admin)

Execute per deployment using **[catalog-matcher-hints.md](../../../../runbooks/catalog-matcher-hints.md)** (Practice checklist section maps to 1.1–1.4).

- [x] **1.1** **Keywords / synonyms** — procedure documented in runbook; **each practice** fills fields in admin.

- [x] **1.2** **Book this service when …** — documented in runbook; practice fills.

- [x] **1.3** **Not this service when …** — documented in runbook; practice fills.

- [x] **1.4** **Description** / patient-readable text — documented in runbook; practice reviews.



### 2. Verification

- [x] **2.1** Staging DM test steps — documented in runbook § Verification (**each practice** runs on their staging).

- [x] **2.2** **Before/after** template — runbook § Verification instructs optional internal changelog / notes.



### 3. Engineering

- [x] **3.1** Admin UI: **generic** helper copy + placeholders for matcher hint fields — `ServiceOfferingDetailDrawer.tsx` (patient language vs abbreviations; chronic-care examples in tooltip/placeholder).



---



## 📁 Files to Create/Update



- **Data:** `service_offerings_json` — ➜ **practice** via admin (see runbook)

- **Docs:** ✅ [`docs/Development/runbooks/catalog-matcher-hints.md`](../../../../runbooks/catalog-matcher-hints.md)

- **Product:** ✅ `frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx`

- **Task / index:** ✅ this file + [`04-04-2026/README.md`](../README.md)



---



## 🌍 Global Safety Gate



- [x] **Data touched?** Y — practice configuration; no patient PHI in hint text unless staff mistakenly paste identifiable info (train admins: **no PHI** in hints).

- [x] **PHI in logs?** N/A for this ops task



---



## ✅ Acceptance & Verification Criteria



- [x] **Repo / product:** Practices have a **published checklist** and **in-app guidance** for non-empty, patient-style **keywords** and related hint fields (see runbook + drawer copy).

- [x] **Repo / product:** **Staging verification** procedure documented (runbook); execution is **per practice**.



---



## 🔗 Related Tasks



- [e-task-dm-02-thread-aware-fee-catalog.md](./e-task-dm-02-thread-aware-fee-catalog.md)

- [e-task-dm-03-turncontext-memory-layer.md](./e-task-dm-03-turncontext-memory-layer.md)



---



**Last Updated:** 2026-04-04 — task closed in repo (runbook + UI + spec)  

**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)

