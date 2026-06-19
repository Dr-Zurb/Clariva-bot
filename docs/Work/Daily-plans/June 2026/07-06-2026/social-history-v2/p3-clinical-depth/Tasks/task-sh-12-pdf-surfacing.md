# Task sh-12: surface derived social-history TEXT on the prescription PDF

> **Filename:** `task-sh-12-pdf-surfacing.md` in `social-history-v2/p3-clinical-depth/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Social history is captured + stored (structured JSONB + derived `social_history` TEXT) but never
reaches the patient-facing document. Add a **Social history** `SectionBlock` to the prescription PDF
that renders the already-derived plain text (smoking pack-years, alcohol units/week, CAGE/AUDIT-C,
the nine lifestyle dimensions). Read-only, plain-text, omitted when empty (SHv3-D5). The serializer
is already PDF-ready — this task only plumbs the field through the composer/types and places one
block in the document.

**Program / Phase:** social-history-v2 · Phase 3 (clinical depth + surfacing)  
**Batch:** [`plan-p3-social-history-v2-clinical-depth-batch.md`](../plan-p3-social-history-v2-clinical-depth-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p3-social-history-v2-clinical-depth.md`](./EXECUTION-ORDER-p3-social-history-v2-clinical-depth.md)  
**Estimated Time:** ~1–2 hours  
**Status:** ✅ `Done`

**Change Type:**
- [x] **New feature** — additive PDF section (no schema migration).

**Current State:**
- ✅ **What exists:** PDF templates with the `SectionBlock` omit-when-empty pattern in [`PrescriptionDocument.tsx`](../../../../../../../backend/src/templates/prescription-pdf/PrescriptionDocument.tsx) (renders cc / hopi / dx / investigations / follow-up / education / clinical notes); `PrescriptionPdfBodyData` in [`types.ts`](../../../../../../../backend/src/templates/prescription-pdf/types.ts); composer in [`prescription-pdf-service.ts`](../../../../../../../backend/src/services/prescription-pdf-service.ts); a stored `social_history` TEXT column.
- ✅ **What's missing (was):** `socialHistory` on `PrescriptionPdfBodyData`, the composer mapping from the prescription row, and a `SectionBlock` in the document — all shipped.

**Scope Guard:**
- Expected files touched: ≤ 4 (`types.ts`; `prescription-pdf-service.ts` composer; `PrescriptionDocument.tsx`; + a PDF/composer test). **No** new derived format, **no** SMS/patient-app surfacing (deferred), **no** structured re-render (uses the TEXT).

**Reference Documentation:**
- Batch plan **SHv3-D5** (PDF surfacing read-only + plain text) · [`SectionBlock.tsx`](../../../../../../../backend/src/templates/prescription-pdf/SectionBlock.tsx) convention · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Type + composer
- [x] ✅ 1.1 Add `socialHistory: string | null` to `PrescriptionPdfBodyData`. - **Completed: 2026-06-08**
- [x] ✅ 1.2 Map the stored `social_history` TEXT into `body.socialHistory` in the composer (null/empty when absent). - **Completed: 2026-06-08** (`prescription-pdf-composer.ts` + `prescription-pdf-service.ts`)

### 2. Document
- [x] ✅ 2.1 Add a `<SectionBlock label="Social history" body={body.socialHistory} />` at the appropriate position (e.g. after HOPI, before diagnosis — confirm clinical ordering); inherits omit-when-empty. - **Completed: 2026-06-08**

### 3. Verification & Testing
- [x] ✅ 3.1 PDF/composer test: section renders with derived text; omitted entirely when social history empty; no PHI written to logs during composition. - **Completed: 2026-06-08** (`prescription-pdf-document.test.ts`)
- [x] ✅ 3.2 `cd backend; npx tsc --noEmit` + lint + PDF suites green; spot-render a sample to confirm layout. - **Completed: 2026-06-08**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: backend/src/templates/prescription-pdf/types.ts (PrescriptionPdfBodyData.socialHistory)
UPDATE: backend/src/services/prescription-pdf-service.ts (compose social_history → body)
UPDATE: backend/src/templates/prescription-pdf/PrescriptionDocument.tsx (SectionBlock)
UPDATE/CREATE: PDF/composer test
DO NOT TOUCH: serializer (already PDF-ready); migrations (none); SMS/patient-app (deferred)
```

**Shipped files:**
- `backend/src/templates/prescription-pdf/types.ts`
- `backend/src/services/prescription-pdf-composer.ts` (extracted mapper for testability)
- `backend/src/services/prescription-pdf-service.ts`
- `backend/src/templates/prescription-pdf/PrescriptionDocument.tsx`
- `backend/tests/unit/services/prescription-pdf-document.test.ts`

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Read-only + plain text** (SHv3-D5) — reuse the derived `social_history` TEXT; do not re-derive from JSONB in the PDF layer.
- **Omit when empty** — follow the existing `SectionBlock` convention; no empty headers.
- **No PHI in logs** — composition must not log the social-history text.
- **No new format** — the existing serializer output is the source.

**DO NOT include** code, SQL, or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Read-only** — renders existing `social_history` TEXT (PHI) into the PDF; no write, no new column.
  - [x] **RLS verified?** **Yes** — read path inherits the prescription's existing access controls; unchanged.
- [x] **Any PHI in logs?** **No** — must not log the social-history body.
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No** — PDF inherits prescription retention.

---

## ✅ Acceptance & Verification Criteria

- [x] Social-history section renders the derived TEXT on the prescription PDF, omitted when empty; no PHI in logs; backend `tsc`/lint/PDF suites green; no migration.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Independent of sh-10/11 (reads derived TEXT). Sequence after sh-09 so AUDIT-C/binge already appear in the serialized text; otherwise re-render is automatic once those land.

Composer extracted to `prescription-pdf-composer.ts` so unit tests can validate mapping without loading `@react-pdf/renderer` (ESM).

---

## 🔗 Related Tasks

- [`task-sh-09-alcohol-audit-c.md`](./task-sh-09-alcohol-audit-c.md) — adds AUDIT-C to the derived text this renders.

---

**Last Updated:** 2026-06-08  
**Pattern:** additive `SectionBlock` over the shipped omit-when-empty PDF convention.  
**Reference:** `process/CODE_CHANGE_RULES.md` · batch plan SHv3-D5.
