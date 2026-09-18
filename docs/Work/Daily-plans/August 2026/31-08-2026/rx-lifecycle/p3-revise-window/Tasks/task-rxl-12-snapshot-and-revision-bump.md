# Task rxl-12: Snapshot on first post-attest edit; bump on finalize

> **Model: Opus (max thinking). Auto must not run this task.** This is the integrity mechanism — a subtle bug here loses the record of what the patient was given.

---

## 📋 Task Overview

Before the first post-attest edit changes anything, capture what was issued. After that the live row absorbs in-window edits freely; the revision counter advances only when the document is finalized again.

Two rules doing the work: exactly one snapshot per revision transition, and a counter that counts finalizations rather than saves.

**Program / Phase:** rx-lifecycle · Phase 3 (revise window)
**Batch:** [`plan-p3-rx-lifecycle-revise-window-batch.md`](../plan-p3-rx-lifecycle-revise-window-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-lifecycle-revise-window.md`](./EXECUTION-ORDER-p3-rx-lifecycle-revise-window.md)
**Estimated Time:** ~6 hours
**Status:** ⏳ **PENDING** (blocked on `rxl-11`)
**Completed:** —

**Change Type:**
- [x] **Update existing** — inserts a snapshot step into the existing write path; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ `rxl-11` — revision table, counter column, supersede columns.
- ✅ `rxl-06` — the attest guard and the single place the stamp is set.
- ✅ `updatePrescription` — the one content-write path, already guarded.
- ✅ The Rx form persists a payload built from form fields, so a snapshot can be stored in the same shape it is read back.
- ❌ Nothing snapshots. Nothing advances a revision.
- ⚠️ The Rx autosave is **debounced and fires continuously while typing**. A snapshot or counter driven by saves would produce dozens of rows per correction.
- ⚠️ At the moment the first post-attest edit arrives, the PDF for the issued state may or may not exist yet — a print-only note has one, a finish-without-print note may not. The snapshot must be correct in both cases.

**Scope Guard:** ≤ 7 files. Do not relax the guard — that is `rxl-13`, and until it lands this task's snapshot path is exercised only by tests. Do not touch the PDF service (`rxl-15`). No UI.

**Reference:** product plan RXL-DL-9, RXL-DL-10 · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md)

---

## ✅ Task Breakdown

### 1. Pre-flight
- [ ] 1.1 `rxl-11` deployed. Else **STOP**.
- [ ] 1.2 Confirm where "finalize" happens — the same single owner `rxl-06` established for the attest stamp. Reuse it; do not introduce a second definition of finalize.
- [ ] 1.3 Decide and record how the payload shape is captured so that a snapshot and the live row are comparable without a translation layer.

### 2. Snapshot
- [ ] 2.1 On the **first** content write after attest, capture the issued state before applying the change.
- [ ] 2.2 Exactly one snapshot per revision transition. The second, third and fortieth in-window edit add nothing.
- [ ] 2.3 Record the PDF pointer for the issued state when one exists, and record its absence honestly when it does not. Do not generate a PDF here to fill the gap.
- [ ] 2.4 Snapshot and content write must not be able to half-succeed. If the snapshot cannot be written, the edit is refused.

### 3. Revision counter
- [ ] 3.1 Advance on finalize — re-issue, or the window closing. Never on save.
- [ ] 3.2 A finalize with no intervening change advances nothing and snapshots nothing.
- [ ] 3.3 The counter and the snapshot rows must agree: revision N's snapshot exists for every N the counter has passed through.

### 4. Verification
- [ ] 4.1 Type continuously for two minutes inside the window, then finalize: exactly one snapshot, counter at 2. **The test must type repeatedly** — a single-keystroke test passes under a per-save counter too.
- [ ] 4.2 Finalize twice with no edit between: no second snapshot, counter unchanged.
- [ ] 4.3 First post-attest edit on a note that was finished but never printed: snapshot written, PDF pointer recorded as absent.
- [ ] 4.4 Snapshot failure refuses the edit; the live row is unchanged.
- [ ] 4.5 A draft prescription's edits snapshot nothing.
- [ ] 4.6 `tsc` + lint clean; backend suites green.

---

## 📁 Files

```
UPDATE: backend/src/services/prescription-service.ts (snapshot-before-write; counter on finalize)
CREATE: backend/src/services/prescription-revision-service.ts (snapshot write + read)
UPDATE: backend/src/services/<finalize owner from 1.2> (bump on finalize)
UPDATE: backend/src/types/prescription.ts (revision shape on responses, if exposed)
UPDATE: backend/src/utils/errors.ts (only if no existing class fits a failed snapshot — justify in Notes)
UPDATE/CREATE: backend tests (repeat-typing, double-finalize, missing-PDF, snapshot-failure)
```

**Existing Code Status:**
- ✅ `rxl-11` migration — DEPLOYED (precondition)
- ⚠️ `prescription-service.ts` — EXISTS; needs the snapshot step inserted ahead of the field mapping
- ❌ revision service — MISSING

**When updating existing code:**
- [ ] Audit the write path and the finalize owner — see [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [ ] Map the snapshot step to a concrete insertion point; do not scatter it across callers
- [ ] Remove obsolete branches; no "skip snapshot" flag
- [ ] Update tests and docs per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Counting saves is the trap.** RXL-DL-9 exists because the autosave is debounced; a counter driven by writes prints an absurd revision number on a real slip. Advance on finalize only.
- **All or nothing.** A content write that succeeded while its snapshot failed leaves no record of what was issued — the exact failure this program exists to prevent. Refuse the edit instead.
- One definition of finalize, shared with the attest owner from `rxl-06`. Two definitions will drift.
- Do not manufacture a PDF to fill a missing pointer. A note that was finished without printing genuinely has no issued artifact, and recording that truthfully is correct.
- Throw typed `AppError` subclasses, never raw `Error` (agent contract).
- Never log PHI. Snapshot payloads must not appear in logs while debugging — this is the single highest-risk logging surface in the program.
- Service layer must not import Express types (ARCHITECTURE.md).

---

## 🌍 Global Safety Gate

- [ ] Data touched? **Yes** — writes full clinical payloads to the new PHI table. RLS deny-all; access is service-role only. **RLS verified?**
- [ ] PHI in logs? **No** — assert in a test that no snapshot payload reaches a log line.
- [ ] External API / AI? No.
- [ ] Retention? **Yes** — each revision adds a stored payload. Cascades from the prescription per `rxl-11`.

---

## ✅ Acceptance & Verification Criteria

- [ ] Repeat-typing test proves the counter is finalize-driven, not save-driven.
- [ ] Exactly one snapshot per revision transition.
- [ ] Snapshot failure refuses the edit atomically.
- [ ] Missing issued PDF recorded honestly.
- [ ] Draft edits unaffected.
- [ ] Tests added per [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md)
- [ ] Logs contain no PHI (see [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md))

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 📝 Notes

Record at implementation time: the payload-shape decision from 1.3, the single finalize owner, and how atomicity between snapshot and write was achieved.

---

## 🔗 Related Tasks

- [`task-rxl-11-revisions-migration.md`](./task-rxl-11-revisions-migration.md) — must be deployed first
- [`task-rxl-13-window-guard.md`](./task-rxl-13-window-guard.md) — cannot land before this task, per RXL-DL-8
- [`task-rxl-15-pdf-freeze-and-retention.md`](./task-rxl-15-pdf-freeze-and-retention.md) — supplies the artifact the snapshot points at

---

**Last Updated:** 2026-08-31
**Completed:** —
