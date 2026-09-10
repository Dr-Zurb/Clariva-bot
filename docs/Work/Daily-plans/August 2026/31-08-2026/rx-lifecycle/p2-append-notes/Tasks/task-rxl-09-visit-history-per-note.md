# Task rxl-09: Visit history lists notes, not visits

> **Model:** executed on Grok 4.6 at owner override 2026-09-10.

---

## 📋 Task Overview

Once an appointment can own several notes, "one history row per visit" stops telling the truth. Make the history surface list prescriptions — each with its own timestamp, read-only, independently reprintable — so a doctor can see that the 11 am note is closed and the 5 pm note is separate.

**Program / Phase:** rx-lifecycle · Phase 2 (append notes)
**Batch:** [`plan-p2-rx-lifecycle-append-notes-batch.md`](../plan-p2-rx-lifecycle-append-notes-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-rx-lifecycle-append-notes.md`](./EXECUTION-ORDER-p2-rx-lifecycle-append-notes.md)
**Estimated Time:** ~4 hours
**Status:** ✅ **IMPLEMENTED** 2026-09-10
**Completed:** 2026-09-10

**Change Type:**
- [x] **Update existing** — changes what the history surface enumerates; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ `listPrescriptionsByAppointment` — already returns every note for an appointment, newest-first, with medicines and attachments. No API change needed.
- ✅ `HistoryPane` and `PatientRibbon` — EXIST as the visit-history surfaces, opened as side sheets from the ribbon.
- ✅ `PreviousRxPopover` — EXISTS; a separate affordance for pulling from a prior Rx. Not this task.
- ✅ History lists one row per note, with Draft / Closed, and groups siblings that share an appointment. Version + superseded chrome is `rxl-28`.

**Scope Guard:** ≤ 6 files, frontend only. No new endpoint. Do not touch `PreviousRxPopover`, the PDF pipeline, or the share link. Do not build a diff / compare view — that is `rxl-18`'s question and RXL-Q5 defers it.

**Reference:** product plan RXL-DL-3, RXL-Q5 · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

---

## ✅ Task Breakdown

### 1. Pre-flight
- [x] 1.1 `rxl-06` merged so attest state is readable.
- [x] 1.2 Read both history surfaces and record which one is canonical. Do not change two surfaces to say the same thing in two ways.
- [x] 1.3 Confirm the existing endpoint returns everything needed — attest state, timestamps, medicine counts. If a field is missing, note it; do not silently add an endpoint.

### 2. The list
- [x] 2.1 One row per note, newest-first, with the note's own timestamp — not the appointment's.
- [x] 2.2 Show attest state plainly: closed versus draft. An open draft must be visually distinct from a closed note.
- [x] 2.3 Where several notes share an appointment, make that relationship legible — the doctor should understand these are one visit's notes, not two visits.
- [x] 2.4 Opening a note from history is read-only and must not adopt it into the form or trip `rxl-07`'s load decision.

### 3. Verification
- [x] 3.1 Two notes under one appointment render as two dated rows.
- [x] 3.2 A single-note appointment renders exactly as before — no visual regression for the common case.
- [x] 3.3 Opening a note from history performs no write and does not change what the cockpit form points at.
- [x] 3.4 `tsc` + lint clean; history suites green.

---

## 📁 Files

```
CREATE: frontend/components/patient-profile/historyNoteMeta.ts
CREATE: frontend/components/patient-profile/panes/__tests__/HistoryPane.notes.test.tsx
UPDATE: frontend/components/patient-profile/panes/HistoryPane.tsx
UPDATE: frontend/components/patient-profile/side-sheets/VisitDetailSideSheet.tsx
UPDATE: frontend/components/patient-profile/side-sheets/__tests__/VisitDetailSideSheet.test.tsx
```

Canonical surface: `HistoryPane` (ribbon sheet + chart leaf). `PatientRibbon` stays the entry point only — no second list.

**Existing Code Status:**
- ✅ `HistoryPane.tsx` — lists notes; sibling group + Draft/Closed
- ✅ `PatientRibbon.tsx` — hosts the side sheet (unchanged)
- ✅ `listPrescriptionsByPatient` — EXISTING patient list, sufficient (`select *`)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Read-only means read-only: opening a historical note must not adopt it into the editable form, or `rxl-07`'s decision becomes unpredictable.
- Do not add a reprint control for attested notes here. Until the PDF freeze is re-keyed (`rxl-15`), printing a print-only note re-renders it, so a reprint button would hand out a document that is not the one that was issued.
- Do not build compare / diff. RXL-Q5 defers it deliberately; inline diffs on every row would bury the clinical content.
- The single-note case must not get visually noisier. Most appointments will always have one note.
- No PHI in logs. No clinical content in telemetry payloads.

---

**Last Updated:** 2026-09-10 (implemented)
**Completed:** 2026-09-10
