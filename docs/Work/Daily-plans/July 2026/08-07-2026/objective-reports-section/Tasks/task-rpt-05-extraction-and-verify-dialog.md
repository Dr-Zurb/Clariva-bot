# Task rpt-05: Lab-photo extraction + mandatory verify dialog

> **Filename:** `task-rpt-05-extraction-and-verify-dialog.md` in `objective-reports-section/Tasks/`.
> **Links:** batch plan [`../plan-objective-reports-batch.md`](../plan-objective-reports-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-objective-reports.md`](./EXECUTION-ORDER-objective-reports.md). Code paths **repo-relative**.

---

## 🛑 ESCALATION (agent contract)

This task makes an **external AI call on PHI** (patient lab-report images to a multimodal model). Per `.cursor/rules/00-agent-contract.mdc` that is an explicit STOP: do **not** start on Auto/Sonnet. **Flag for Opus, and surface the data-processor decision (patient lab images → OpenAI) and the verify-before-apply design for approval before writing code.**

---

## 📋 Task Overview

Turn a lab-report photo into structured rows the doctor **verifies before anything lands**. Follows the shipped "AI suggests → doctor confirms" contract of `complaint-parse-service.ts` / `medicine-parse-service.ts` (suggestion-only, tiered `config/openai.ts`, audit-metadata-only logging).

1. **Extraction endpoint** — given a report attachment, sign its URL and send the image to a multimodal model with a **strict JSON schema**: report meta `{labName?, date?}` + rows `{rawName, value, unit, printedRange?, flag?}`. Prefer vision-LLM over classic OCR (handles varied Indian lab layouts / tables).
2. **Alias match** — map each `rawName` to a library analyte (rpt-03 aliases) → matched rows get canonical id/unit/range; unmatched come back as raw candidates the doctor can accept as custom rows.
3. **Sanity checks (hallucination guard)** — value parses numerically, unit in the accepted set, value within plausible physiologic bounds; anything failing gets a warning badge.
4. **Mandatory verify dialog (RPT-D6)** — photo on one side, editable extracted rows on the other; low-confidence / unmatched / sanity-flagged rows highlighted; doctor edits/unchecks/confirms. **Only on confirm** do rows dispatch into the form (as a report with `entryMethod: 'extracted'`). Extraction failure → fall back to manual entry; never blocks the visit.

**Program / Batch:** objective-reports-section · Wave 5
**Plan:** [`../plan-objective-reports-batch.md`](../plan-objective-reports-batch.md)
**Estimated Time:** ~5–8 hours
**Status:** Not started. **Model: Opus** — external AI on PHI images + hallucination-guard verify UX (agent-contract AI/PHI escalation).

**Change Type:**
- [ ] ✅ **New** (extract service + endpoint + verify dialog), following the parse-service pattern. Follow `docs/Work/process/CODE_CHANGE_RULES.md`.

**Current State:** (check existing code first!)
- ✅ **Exists:** verify-before-apply precedent `backend/src/services/complaint-parse-service.ts`, `medicine-parse-service.ts` + their controllers/routes; tiered `backend/src/config/openai.ts` (`gpt-4o-mini` for schema-bounded extraction, flagship fallback); signed URLs in `prescription-attachment-service.ts`; the library aliases (rpt-03); report model + photos (rpt-02, rpt-04).
- ⚠️ **PHI:** parse services log **model + token counts only**, never content. Match that exactly. Sending patient lab images to OpenAI is a data-processor step to be consciously signed off.

**Scope Guard:**
- Expected files touched: a new BE extract service + controller + route (mirroring the parse services), env/config reuse, a new FE verify-dialog component + the "extract from photo" affordance in the Reports body.
- **DO NOT** auto-commit extracted rows (RPT-D6). **DO NOT** log lab values/names/patient context. **DO NOT** add a new column (writes go through the existing rows/`lab_reports_json`). **DO NOT** block the visit on extraction failure.

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `docs/Reference/engineering/development/DEFINITION_OF_DONE.md` · parse-service pattern in `backend/src/services/complaint-parse-service.ts`.

---

## ✅ Task Breakdown (Hierarchical)

### 0. Escalation gate
- [ ] 0.1 STOP: confirm data-processor sign-off (patient images → model) + verify-before-apply design approved before code (agent contract).

### 1. Extraction service (BE)
- [ ] 1.1 New service (mirror `complaint-parse-service`): sign the attachment URL, call the multimodal model with a strict JSON schema; validate output with Zod; suggestion-only.
- [ ] 1.2 Controller + route validate input (attachment id ownership) with Zod; use `asyncHandler`; throw typed `AppError`; read config via `config/env.ts` / `config/openai.ts` (never `process.env`).
- [ ] 1.3 Log model + token counts only; skip gracefully when `OPENAI_API_KEY` unset (return a "manual entry" signal, like the parse services).

### 2. Match + sanity
- [ ] 2.1 Match `rawName` → library analyte via aliases; unmatched → raw candidate (acceptable as custom row).
- [ ] 2.2 Sanity checks: numeric value, accepted unit, plausible physiologic bounds → warning badges on failures.

### 3. Verify dialog (FE)
- [ ] 3.1 Dialog: photo beside editable rows; flagged/unmatched/low-confidence rows highlighted; per-row accept/edit/discard.
- [ ] 3.2 On confirm only, dispatch rows into the form as a report (`entryMethod: 'extracted'`); on cancel/failure, nothing changes and manual entry remains.

### 4. Verification gate
- [ ] 4.1 `cd backend && npm run typecheck && npm test` — service validates/parses; unset-key path returns manual-entry signal; no PHI logged.
- [ ] 4.2 `cd frontend && npx tsc --noEmit && npm run lint && npm test` — dialog never commits without confirm; failure degrades to manual.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/src/services/lab-extract-service.ts        (mirror complaint-parse-service; suggestion-only)
CREATE: backend/src/controllers/lab-extract-controller.ts  (Zod-validate; asyncHandler; typed AppError)
CREATE: backend/src/routes/api/v1/... (extract route)
UPDATE: backend/src/config/openai.ts (reuse tiered config; add tier only if needed)
CREATE: frontend verify-dialog component (photo + editable extracted rows)
UPDATE: Reports body — "extract from photo" affordance
DO NOT TOUCH: no new DB column (write via existing rows/lab_reports_json); no PHI logging; no auto-commit
```

**When updating existing code:** (MANDATORY)
- [ ] Mirror the shipped parse-service PHI discipline (model + tokens only in logs).
- [ ] No controller try/catch (global middleware maps ZodError→ValidationError); validate all external input with Zod.
- [ ] Extraction is strictly suggestion → verify → apply; failure never blocks the visit.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Never auto-commit** (RPT-D6) — verify dialog is the only path into the form.
- **Suggestion-only service** — mirror complaint/medicine parse.
- **PHI discipline** — no content logs; data-processor sign-off recorded.
- **Graceful degradation** — no key / failure → manual entry.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] 🛑 **Data touched?** Writes go through existing rows/`lab_reports_json` (no new column) — but reads PHI images. **STOP/flag → Opus.**
- [ ] 🛑 **Any PHI in logs?** **Must be No** — model + token counts only; explicitly assert no values/names logged.
- [ ] 🛑 **External API or AI call?** **YES** — multimodal model on patient lab images. Data-processor sign-off required.
- [ ] ✅ **Retention / deletion impact?** No new stored surface beyond existing rows/attachments; extraction output is transient until the doctor confirms.

---

## ✅ Acceptance & Verification Criteria

- [ ] Extraction returns structured rows + report meta from a lab photo; alias-matched rows carry canonical unit/range; unmatched are raw candidates.
- [ ] Sanity-flagged / low-confidence / unmatched rows are highlighted in the verify dialog.
- [ ] **Nothing enters the form without an explicit confirm**; failure/unset-key degrades to manual entry.
- [ ] No PHI in logs; controller uses Zod + `asyncHandler` + typed errors; BE + FE gates green.

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- Requires [`task-rpt-02`](./task-rpt-02-lab-report-model-and-fields.md) (model), [`task-rpt-03`](./task-rpt-03-lab-test-library.md) (aliases), [`task-rpt-04`](./task-rpt-04-photos-and-imaging.md) (photo to extract from).

---

**Last Updated:** 2026-07-08
**Pattern:** vision-LLM extraction as a suggestion-only service (à la complaint/medicine parse) + a mandatory verify-before-apply dialog; PHI-safe logging and graceful degradation.
