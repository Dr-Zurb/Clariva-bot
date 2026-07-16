# Task asmt-06 (+ asmt-07): ICD-coded diagnosis entry — catalog autocomplete + AI resolver

> **Filename:** `task-asmt-06-icd-coded-diagnosis-entry.md` in `assessment-tab/Tasks/`.
> **Links:** batch plan [`../plan-assessment-tab-batch.md`](../plan-assessment-tab-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-assessment-tab.md`](./EXECUTION-ORDER-assessment-tab.md). Code paths **repo-relative**.
> **Status:** 📝 **SPEC / DRAFT — not implemented.** Written for review before any code (spec-first). Supersedes the deferred "ICD-10 / SNOMED coding + search" row in the README.

---

## 🛑 ESCALATION (agent contract)

This is a **two-wave, full-stack** feature and every wave is an explicit STOP under `.cursor/rules/00-agent-contract.mdc`:

- **New migration(s)** — a new `diagnosis_catalog` (ICD-11) reference table, and a schema addition (`code` / `code_title`) inside the `diagnoses_json` row shape.
- **New AI endpoint** — `POST /api/v1/diagnoses/parse` + an `ai-service` method (external model call).
- **5+ file cross-layer** — migration + BE types + Zod + service + route/controller + FE types + API client + new components + tests.
- **PHI-adjacent** — diagnosis labels are PHI; the AI call sends free-text diagnosis input.

**Do not implement on Auto/Sonnet.** Run on **Opus**, and only after this spec + the decision-lock reversal (below) are approved. This document contains **no code** by design.

### Decision-lock reversal (must be recorded on approval)
- **Reverses ASMT-D7** ("No coding vocabulary in v1"). This program now adds ICD-11 coding + catalog search + a gated AI resolver. Record the reversal as **ASMT-D7′** in [`../README.md`](../README.md) + [`../plan-assessment-tab-batch.md`](../plan-assessment-tab-batch.md) (mirror how **ASMT-D4′** was recorded for asmt-05), and move the two "Deferred" rows ("ICD-10 / SNOMED coding + search"; "AI-generated assessment" — this is the narrower *diagnosis-coding* slice of it) into the phasing table.
- **Upholds** ASMT-D8 (PHI discipline, no RLS edits) and ASMT-D6 (no silent chronic-condition writes).

---

## 📋 Feature Overview

Today diagnosis capture in `DiagnosisRowsList.tsx` is a **plain text input** — type + Enter → card, free-text label, no coding, no suggestions. The chief-complaint card by contrast has a **catalog autocomplete** (`ComplaintAutocomplete` → `complaint_master` search) plus a **gated AI parse** fallback (`parseComplaintWithAI` → `POST /api/v1/complaints/parse`). This feature brings that same two-layer mechanism to diagnoses, but the resolution target is **ICD-11**.

**End state (doctor's mental model):**
1. Type a diagnosis → a **dropdown of real ICD-11 entries** (autocomplete against a local catalog) appears; pick one → the card carries the canonical name **and** its ICD code.
2. For **hard cases** (typo / vernacular / ambiguous — "sugar", "BP high", misspelling) → a **gated AI resolver** maps the messy text to the correct ICD-11 term+code, **suggestion-only**, constrained to codes that exist in the catalog.

**Why ICD-11 (locked, user-approved):** ICD-10 is frozen; ICD-11 is WHO's current standard and better structured for normalization. Catalog is **local + seeded** (not the live WHO API) → fast typeahead, offline, no per-request dependency, and it becomes the **whitelist that constrains AI output**. Live WHO ICD-11 API auto-refresh can be a later enhancement.
> **Open veto:** if these codes must feed **Indian govt/insurance reporting** near-term (which largely expects ICD-10), flip the catalog source to ICD-10 before code. Default stands at ICD-11.

**Natural build order (not a shortcut — a dependency):** the AI resolver (Wave 7) must validate against the catalog, so the catalog + autocomplete (Wave 6) must exist first. Each wave is independently shippable.

**Program / Batch:** assessment-tab · Waves 6–7
**Estimated Time:** asmt-06 ~6–9h · asmt-07 ~5–7h
**Change Type:** ➕ **New** (catalog table + AI endpoint) + **Update existing** (row schema, diagnosis editor). Follow `docs/Work/process/CODE_CHANGE_RULES.md`.

**Current State:** (check existing code first!)
- ✅ **Exists (reuse, do not fork):**
  - Complaint autocomplete pattern — `frontend/components/cockpit/rx/subjective/ComplaintAutocomplete.tsx` (debounced search, portal dropdown, ↑↓/Enter/Shift+Enter/Esc/Tab, session cache, `MIN_QUERY_LEN`).
  - Complaint master search API — `frontend/lib/api/complaint-master.ts` (`searchComplaints`) + backend route pattern in `backend/src/routes/api/v1/complaint-master.ts`.
  - Gated AI parse — `frontend/lib/api/complaint-parse.ts` (`parseComplaintWithAI`, `tier`, `fieldSpec`, `AbortSignal`), the gate/refine flow in `frontend/components/cockpit/rx/subjective/ComplaintList.tsx`, proposal UI `AiRefineProposal.tsx`, backend `parseComplaintHandler` (`POST /api/v1/complaints/parse`) + `backend/src/services/ai-service.ts`.
  - Recent diagnoses — `GET /api/v1/diagnoses/recent` + `frontend/hooks/useRecentDiagnosisTags.ts` (a *secondary* suggestion source; NOT the ICD catalog).
  - Diagnosis card + row model — `frontend/components/cockpit/rx/inputs/DiagnosisRowsList.tsx`; `DiagnosisRow` (`frontend/types/prescription.ts` L49-69, mirrored BE); tolerant `diagnosisRowSchema` / `diagnosesJsonSchema` (`backend/src/utils/validation.ts`).
- ❌ **Does not exist:** any ICD/SNOMED table or code data; a diagnosis full-text search endpoint; a `code`/`title` field on `DiagnosisRow`; a `/diagnoses/parse` AI endpoint.
- ⚠️ **Invariant:** `prescriptions` RLS via `auth.uid() = doctor_id` (migration 026) — do not touch. `provisional_diagnosis` / `differential_diagnosis` **output shape stays byte-identical** (ASMT-D4/D4′); coding is additive metadata on the row, it does **not** change derived TEXT output.
- ⚠️ **Next free migration ≈ 162** (161 is highest today: `161_prescriptions_diagnoses_json.sql`). Confirm at implementation time — cross-program ordering may shift.

**Scope Guard:**
- **DO NOT** change `provisional_diagnosis` / `differential_diagnosis` output shape or derivation. Coding is additive.
- **DO NOT** make coding mandatory — a free-text (uncoded) diagnosis must still save (ASMT-D3). `code` is nullable.
- **DO NOT** auto-apply AI output — suggestion-only, doctor confirms; keep the doctor's original text if declined.
- **DO NOT** auto-write chronic conditions (ASMT-D6) or edit RLS (ASMT-D8).
- **DO NOT** ship the AI resolver (Wave 7) able to return a code absent from the catalog.
- **DO NOT** log diagnosis labels / AI input text (PHI).

---

## 🌊 Wave 6 — ICD-11 catalog + autocomplete + row coding (Opus, migration)

**Goal:** replace the plain capture input with an ICD-11 catalog autocomplete; persist the chosen code on the row.

### Design (NO IMPLEMENTATION)
- **Catalog store.** New reference table (working name `diagnosis_catalog`): ICD-11 code, canonical title, searchable text/synonyms, optional chapter/parent for grouping. **Not PHI** (a public code list) — but confirm RLS/read-policy posture with the migration (likely readable by any authenticated doctor; no per-doctor scoping). Seeded from a chosen ICD-11 MMS release; **start with the common-OPD subset, expandable** (data-population choice, not an architectural shortcut). Document the seed source + license (ICD-11 is CC BY-ND) and the refresh story.
- **Search endpoint.** `GET /api/v1/diagnoses/search?q=&limit=` returning `{ code, title, … }`, mirroring `searchComplaints` shape + the `asyncHandler` + Zod-validated query contract. Cacheable per query like the complaint search.
- **Row schema.** Add nullable `code` + `codeTitle` (canonical ICD title) to `DiagnosisRow` (FE + BE types) and to the tolerant `diagnosisRowSchema` (`.optional().nullable().catch(null)` — old rows hydrate unchanged). `label` stays the doctor-facing text (may differ from `codeTitle`). **JSONB soft-add**; confirm migration 161's CHECK is `jsonb_typeof = 'array'` only (no per-key CHECK) so no SQL change is needed for the row keys — but the **catalog table itself is a new migration**.
- **Autocomplete component.** New `DiagnosisAutocomplete` modeled on `ComplaintAutocomplete` (portal dropdown, keyboard nav, debounce, session cache). Selecting an entry sets `label` + `code` + `codeTitle`. Free-text Enter (no match) still commits an uncoded card (ASMT-D3). Optionally surface recent diagnoses (`useRecentDiagnosisTags`) as a zero-query prefill — secondary, not the catalog.
- **Card display.** Show a small code chip on the card header/preview when coded; uncoded cards look exactly like today.

### Files (indicative)
```
NEW:    backend/migrations/162_diagnosis_catalog.sql            (ICD-11 reference table + seed; confirm number)
NEW:    backend/src/services/diagnosis-catalog-service.ts       (search query)
NEW:    backend/src/routes/api/v1/diagnoses-search route + controller handler (mirror complaint-master)
UPDATE: backend/src/routes/api/v1/index.ts                       (mount)
UPDATE: frontend/types/prescription.ts + backend/src/types/prescription.ts  (DiagnosisRow +code +codeTitle, nullable)
UPDATE: backend/src/utils/validation.ts                          (diagnosisRowSchema: tolerant code/codeTitle)
NEW:    frontend/lib/api/diagnosis-catalog.ts                    (searchDiagnoses client, mirror complaint-master.ts)
NEW:    frontend/components/cockpit/rx/inputs/DiagnosisAutocomplete.tsx
UPDATE: frontend/components/cockpit/rx/inputs/DiagnosisRowsList.tsx  (swap capture input → autocomplete; set code on select; code chip)
UPDATE: tests — validation diagnoses test; DiagnosisRowsList test; new DiagnosisAutocomplete test; rxFormContext hydrate/payload (code round-trips)
DO NOT TOUCH: RLS; provisional/differential OUTPUT shape + derivation; migrations 160/161 SQL (unless a key CHECK is found)
```

---

## 🌊 Wave 7 — AI ICD resolver (Opus, new AI endpoint) — split to `asmt-07` at promotion

**Goal:** for messy/typo/vernacular input, propose the correct ICD-11 term+code — gated, suggestion-only, catalog-constrained.

### Design (NO IMPLEMENTATION)
- **Endpoint.** `POST /api/v1/diagnoses/parse` + `ai-service` method, mirroring `parseComplaintHandler` + `parseComplaintWithAI`: tiered (mini default / flagship on explicit ✨ refine), `AbortSignal`, canonical error format, PHI never logged.
- **Catalog constraint (the safety spine).** The model proposes candidate ICD entries; the **server validates every returned code against `diagnosis_catalog`** and drops/repairs any code not present (same discipline as the complaint `fieldSpec` bounding). Never surface an unvalidated code. Consider server-side retrieval (top-N catalog candidates for the query) passed to the model to ground it.
- **Gating.** Fires only when the deterministic path can't confidently match (no strong catalog hit) or on explicit ✨ refine — never on every keystroke. Mirror `ComplaintList` auto-gate + refine.
- **Suggestion UI.** A proposal surface (model on `AiRefineProposal.tsx`): show proposed term(s) + code + confidence; doctor **accepts** (sets `label`/`code`/`codeTitle`) or **ignores** (keeps typed text). Never auto-applied.

### Files (indicative)
```
NEW:    backend/src/routes/api/v1/diagnoses parse route + controller handler
NEW/UPDATE: backend/src/services/ai-service.ts                  (diagnosis-parse method, catalog-constrained)
UPDATE: backend/src/utils/validation.ts                         (parse request/response Zod)
NEW:    frontend/lib/api/diagnosis-parse.ts                     (parseDiagnosisWithAI, mirror complaint-parse.ts)
NEW:    frontend/components/cockpit/rx/inputs/DiagnosisAiProposal.tsx  (or reuse AiRefineProposal pattern)
UPDATE: frontend/components/cockpit/rx/inputs/DiagnosisRowsList.tsx    (gate + refine trigger + proposal wiring)
UPDATE: tests — AI parse integration (mock), catalog-constraint (rejects off-catalog code), gate behavior
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **ICD-11, local seeded catalog** (user-approved). Live WHO API is a later enhancement. Veto → ICD-10 only if near-term govt/insurance reporting requires it.
- **Coding is additive + optional.** `code` nullable; uncoded diagnoses save (ASMT-D3). Output TEXT (`provisional_diagnosis`/`differential_diagnosis`) byte-identical (ASMT-D4/D4′) — coding never alters it.
- **AI is suggestion-only + catalog-constrained.** No auto-apply; no off-catalog codes; keep doctor's text on decline.
- **PHI discipline (ASMT-D8).** Never log labels or AI input; catalog table is public code data (non-PHI) but confirm read-policy in the migration. No RLS edits.
- **No auto-write to chronic conditions (ASMT-D6).**

**DO NOT include** code or signatures in this doc.

---

## 🌍 Global Safety Gate (MANDATORY — re-check at implementation)

- [ ] 🛑 **Data touched?** **YES** — new `diagnosis_catalog` table (non-PHI code list) + additive `code`/`codeTitle` on `diagnoses_json` rows (PHI record). New migration → **Opus + STOP/flag + approve first**.
- [ ] 🛑 **External API or AI call?** **YES (Wave 7)** — new `/diagnoses/parse` model call. Suggestion-only, catalog-constrained, PHI never logged.
- [ ] **PHI in logs?** **No** — never log diagnosis labels / AI input text.
- [ ] **RLS / retention?** No RLS edits (ASMT-D8). `prescriptions` retention unchanged; catalog table retention = reference data.

---

## ✅ Acceptance & Verification Criteria (target)

**Wave 6**
- [ ] Typing ≥2 chars shows an ICD-11 catalog dropdown; keyboard nav + select set `label` + `code` + `codeTitle`; free-text Enter still commits an uncoded card.
- [ ] `code`/`codeTitle` round-trip through hydrate → reducer → `buildRxPayload`; old rows (no code) hydrate unchanged.
- [ ] `provisional_diagnosis` / `differential_diagnosis` output byte-identical (coding additive; proven by parity test).
- [ ] Catalog search endpoint Zod-validated; no RLS edits; BE + FE slice gates green.

**Wave 7**
- [ ] Hard-case input yields an AI proposal (gated / on ✨ refine); accepting sets code, ignoring keeps typed text.
- [ ] Server rejects any AI-proposed code not present in `diagnosis_catalog` (proven by test).
- [ ] AI never auto-applies; PHI never logged; canonical error format on failure.

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- Builds on [`task-asmt-03-structured-diagnoses.md`](./task-asmt-03-structured-diagnoses.md) (the `diagnoses_json` row) and [`task-asmt-05-differential-role-and-card-entry.md`](./task-asmt-05-differential-role-and-card-entry.md) (card entry / role model).
- **Reverses ASMT-D7** — record ASMT-D7′ in [`../README.md`](../README.md) + [`../plan-assessment-tab-batch.md`](../plan-assessment-tab-batch.md), and add Waves 6–7 to [`./EXECUTION-ORDER-assessment-tab.md`](./EXECUTION-ORDER-assessment-tab.md) (≤1 Opus/wave holds).
- **Pattern lineage:** the drug-master picker + complaint-master autocomplete + complaint/medicine gated AI parse.

---

**Last Updated:** 2026-07-11
**Pattern:** bring the chief-complaint two-layer entry (catalog autocomplete + gated AI fallback) to diagnoses, resolving to **ICD-11** via a local seeded catalog that both powers typeahead and constrains the AI; coding is additive/optional and never changes patient-facing derived TEXT.
**Status:** SPEC / DRAFT — awaiting approval; not implemented.
