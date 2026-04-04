# e-task-ops-01: Practice catalog matcher hints — NCD / diabetes / blood sugar

## 2026-04-04

---

## 📋 Task Overview

**Operational** task for doctors/admins configuring **teleconsult catalog** rows (example: **Non communicable diseases**):

- **Matching hints** (keywords, book when, not when) were **empty** in the reported screenshot, while **description** listed abbreviations (e.g. HTN, DMT2) that patients rarely type verbatim.
- Filling **patient-facing synonyms** (blood sugar, diabetes, sugar high, fasting glucose, BP / hypertension where appropriate) improves **deterministic** matcher scores in `service-catalog-matcher` and reduces wrong routing to **General checkup** or full-menu fee dumps when code is tightened (see **e-task-dm-02**).

This task is **primarily process** in **admin UI / doctor settings**; optional engineering follow-ups validate hint UX through staging.

**Estimated Time:** 0.25–0.5 day (per practice)  
**Status:** ⏳ **PENDING** (per deployment / Dr Zurb clinic)

**Change Type:**
- [x] **Update existing** — configuration data (`service_offerings_json`), not necessarily code

**Current State:**
- ✅ Backend supports **matcher_hints** on catalog entries (keywords, include_when, exclude_when).
- ❌ NCD row may ship with **blank** hints in production until staff complete them.
- ⚠️ After **e-task-dm-02/03**, empty hints still hurt **deterministic** path when LLM is skipped or capped.

**Reference:**
- [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)
- [AI_RECEPTIONIST_MATCHING_INITIATIVE.md](../../../../../task-management/AI_RECEPTIONIST_MATCHING_INITIATIVE.md)

---

## ✅ Task Breakdown

### 1. Content (practice owner / admin)
- [ ] 1.1 **Keywords / synonyms:** add phrases patients use (English + any supported Hinglish terms the practice expects), comma-separated per existing UI.
- [ ] 1.2 **Book this service when …** plain-language inclusive rule (e.g. chronic condition follow-up, medication adjustment, readings interpretation scheduling).
- [ ] 1.3 **Not this service when …** exclusions if needed (e.g. first acute emergency — redirect to emergency messaging).
- [ ] 1.4 Review **description** field for **patient-readable** expansions (DMT2 → diabetes) if the product displays description to patients anywhere.

### 2. Verification
- [ ] 2.1 Staging DM test: user message with **blood sugar** maps to **NCD** row with expected confidence (after code tasks land).
- [ ] 2.2 Document **before/after** in internal changelog or practice runbook.

### 3. Engineering (optional)
- [ ] 3.1 Admin UI: placeholder examples for NCD row (product copy only — no implementation detail in this task file).

---

## 📁 Files to Create/Update

- **Data:** `service_offerings_json` (doctor settings) — via admin app / API
- **Docs:** practice runbook or `docs/capture/inbox.md` entry until done

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — practice configuration; no patient PHI in hint text unless staff mistakenly paste identifiable info (train admins: **no PHI** in hints).
- [x] **PHI in logs?** N/A for this ops task

---

## ✅ Acceptance & Verification Criteria

- [ ] NCD row has non-empty **keywords** covering common diabetes / hypertension phrasing used in test transcripts.
- [ ] At least one **staging** conversation reproduces improved match vs blank hints baseline.

---

## 🔗 Related Tasks

- [e-task-dm-02-thread-aware-fee-catalog.md](./e-task-dm-02-thread-aware-fee-catalog.md)
- [e-task-dm-03-turncontext-memory-layer.md](./e-task-dm-03-turncontext-memory-layer.md)

---

**Last Updated:** 2026-04-04  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)
