# Runbook: Teleconsult catalog matcher hints

**Purpose:** Help each practice tune **per-row** `matcher_hints` in **`service_offerings_json`** so the **generic** DM matcher (no per-label code in the app) can map patient language to the right service.

**Related:** [e-task-ops-01](../Daily-plans/April%202026/04-04-2026/tasks/e-task-ops-01-ncd-catalog-hints.md)

---

## Philosophy

- Hints are **configuration**, not engineering tickets per service name.
- **Keywords / synonyms** should reflect what **patients** say (and local languages you support), not only internal abbreviations.

---

## Practice checklist (per row that feels “sticky” or wrong)

1. **Keywords / synonyms** — Comma-separated or short lines. Include plain-language variants (e.g. blood sugar, diabetes, sugar high, fasting glucose; BP, high blood pressure, hypertension) for chronic or specialty rows where the service name is clinical.
2. **Book this service when…** — Plain-language inclusive rule (chronic follow-up, medication adjustment, scheduling to review readings, etc.).
3. **Not this service when…** — Optional exclusions (e.g. first acute emergency → encourage urgent care / emergency channels per your policy).
4. **Description** — If patients can see it anywhere in the product, expand abbreviations (e.g. spell out diabetes) where helpful.

**Safety:** Do **not** paste patient names, MRNs, or other **PHI** into hint fields.

---

## Verification (staging)

1. Save catalog in **admin** (Practice setup → service offerings).
2. In **staging**, send DM phrasing that real patients use (e.g. “my blood sugar has been high”) — **not** internal codes only.
3. Confirm routing / fee narrowing lands on the **intended** catalog row (check staff review inbox or logs per your process), compared to a **blank-hints** baseline on the same row if needed.
4. Optionally note **before / after** in your internal changelog or practice notes.

---

## Where to edit (product)

**Dashboard:** Practice setup → teleconsult services → open a row → **Matching hints (optional)**.

Module reference: `frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx`.

---

**Last updated:** 2026-04-04
