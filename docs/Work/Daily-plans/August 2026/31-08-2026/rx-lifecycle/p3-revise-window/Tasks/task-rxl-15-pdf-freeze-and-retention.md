# Task rxl-15: Re-key the freeze to attest; retain bytes per revision

> **Model: Opus (max thinking). Auto must not run this task.** Reverses a documented storage lock (T3-D2) and touches already-issued patient artifacts.

---

## 📋 Task Overview

Two changes to one service. First, the freeze that already protects sent prescriptions is re-keyed to the attest stamp, so a printed-only prescription — the dominant in-clinic path — stops re-rendering on every print. Second, the bytes issued at each revision are retained instead of overwritten, so what the patient was handed remains retrievable after a correction.

The freeze mechanism already exists and is correct; it is simply keyed on the wrong signal.

**Program / Phase:** rx-lifecycle · Phase 3 (revise window)
**Batch:** [`plan-p3-rx-lifecycle-revise-window-batch.md`](../plan-p3-rx-lifecycle-revise-window-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-lifecycle-revise-window.md`](./EXECUTION-ORDER-p3-rx-lifecycle-revise-window.md)
**Estimated Time:** ~6 hours
**Status:** ⏳ **PENDING** (blocked on `rxl-11`)
**Completed:** —

**Change Type:**
- [x] **Update existing** — reverses a documented design lock; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ The freeze **exists**: a prescription with the digital-send stamp set reminds a signed URL for the stored file instead of re-rendering (documented BRD-D4, "sent = remint frozen file; unsent = re-render").
- ✅ Private bucket, signed-URL only, 24h TTL. 5-minute in-memory result cache (batch-18 decision).
- ✅ `rxl-11` — revision table with a column for the artifact pointer.
- ❌ Print-only prescriptions have a null send stamp, so they re-render and upsert on every print. **No freeze on the main clinic flow.**
- ❌ Per-revision retention does not exist. The service header states the lock plainly: `overwrite-on-regen — we never accumulate per-version PDFs` (T3-D2).
- ⚠️ The storage path is built in **three** separate places — the upload, the frozen-remint branch, and the existing-file signed-URL helper. Changing one and missing two produces a freeze that silently does not hold.
- ⚠️ The result cache is keyed by prescription id alone, so it cannot distinguish revisions.
- ⚠️ `invalidatePrescriptionPdfCache` is called on every prescription update, including attested ones where the artifact is immutable.

**Scope Guard:** ≤ 6 files. **Drafts keep re-rendering and overwriting** — do not turn every draft print into a stored artifact. No letterhead, layout or design change (the footer marker is `rxl-16`). Do not change what sets the send stamp. No retention-worker change.

**Reference:** product plan RXL-DL-10, RXL-Q4 · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md)

---

## ✅ Task Breakdown

### 1. Pre-flight
- [ ] 1.1 `rxl-11` deployed. Else **STOP**.
- [ ] 1.2 Read the service header locks in full — T3-D2, BRD-D4, batch-18 — and record which are being reversed, which retained, and why. A reversal that is not written down will be re-reversed by the next reader.
- [ ] 1.3 Enumerate all three storage-path construction sites and every caller of the cache invalidator.

### 2. One path helper first
- [ ] 2.1 Extract a single storage-path helper before changing behaviour. Three hand-built paths cannot be safely made revision-aware in place.
- [ ] 2.2 All three sites route through it. Verified by grep, not by inspection.

### 3. Re-key the freeze
- [ ] 3.1 The freeze condition becomes the attest stamp rather than the send stamp.
- [ ] 3.2 A print-only attested prescription is served the stored artifact, not a re-render.
- [ ] 3.3 A sent prescription behaves exactly as before — this must not regress BRD-D4.
- [ ] 3.4 Drafts keep re-rendering. Explicitly test this; it is the behaviour most likely to be broken by accident.

### 4. Retain per revision
- [ ] 4.1 An attested prescription's artifact is addressed per revision so a new revision cannot overwrite the previous one.
- [ ] 4.2 The pointer is recorded on the revision row from `rxl-11`.
- [ ] 4.3 Revision N's bytes remain retrievable after N+1 exists. No delete, no upsert over an issued artifact.
- [ ] 4.4 A reprint of an unchanged attested note returns the identical artifact and creates no revision.

### 5. Cache
- [ ] 5.1 The cache key distinguishes revisions.
- [ ] 5.2 Invalidation stops firing for attested rows — an immutable artifact cannot go stale, and invalidating it reintroduces the drift this task removes.
- [ ] 5.3 Draft invalidation behaviour unchanged.

### 6. Docs + verification
- [ ] 6.1 Update the service header: T3-D2 now applies to drafts only; state the attest-keyed freeze.
- [ ] 6.2 Note the storage-volume consequence for whoever owns retention (RXL-Q4).
- [ ] 6.3 All of §3–§5 proven by test. `tsc` + lint clean.

---

## 📁 Files

```
UPDATE: backend/src/services/prescription-pdf-service.ts (path helper, freeze key, per-revision address, header locks)
UPDATE: backend/src/services/prescription-pdf-cache.ts (revision-aware key)
UPDATE: backend/src/services/prescription-service.ts (stop invalidating for attested rows)
UPDATE: backend/src/services/prescription-revision-service.ts (record the artifact pointer)
UPDATE/CREATE: backend tests (print-only freeze, sent unregressed, draft re-render, N retrievable after N+1, reprint identity)
UPDATE: docs/Reference/engineering/architecture/DB_SCHEMA.md (artifact pointer, if shape changed)
```

**Existing Code Status:**
- ⚠️ `prescription-pdf-service.ts` — EXISTS; freeze correct but wrongly keyed; three path sites
- ⚠️ `prescription-pdf-cache.ts` — EXISTS; key too coarse
- ⚠️ `prescription-service.ts` — EXISTS; invalidates unconditionally
- ✅ `rxl-11` revision table — DEPLOYED

**When updating existing code:**
- [ ] Audit all three path sites and every invalidator caller from 1.3 — see [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [ ] Extract the helper **before** changing behaviour (§2 precedes §3 deliberately)
- [ ] Remove the obsolete unconditional invalidation rather than guarding it inline
- [ ] Update tests and docs per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Never re-render an issued document.** RXL-DL-10: a later letterhead change would make an old revision render differently from the paper that was handed over. Store the bytes; do not regenerate from payload.
- **Never overwrite or delete an issued artifact.** Upsert over an attested revision's file is the failure mode this whole task exists to close.
- Drafts are unaffected. Turning every draft print into a permanent artifact would multiply storage for documents that were never issued.
- Do not change what sets the send stamp. Other code depends on its meaning; this task only stops using it as the freeze key.
- Write the reversal down in the service header. The lock being reversed is documented there, and leaving stale guidance beside new behaviour is how the next reader reintroduces the bug.
- Never read `process.env` directly — use `config/env.ts` (agent contract).
- No PHI in logs. Log ids, revision numbers and byte counts only — never a signed URL that grants access to a patient's document.

---

## 🌍 Global Safety Gate

- [ ] Data touched? **Yes** — patient-facing documents in private storage, plus a write to the revision table. Bucket stays private, signed-URL only. **RLS / bucket policy verified unchanged?**
- [ ] PHI in logs? **No** — explicitly assert no signed URL is logged.
- [ ] External API / AI? No.
- [ ] Retention? **Yes** — this task increases stored artifacts per prescription. Same 7-year obligation; document the volume change and flag it for the retention owner. Worker changes are **out of scope**.

---

## ✅ Acceptance & Verification Criteria

- [ ] Print-only attested prescription is frozen; sent behaviour unregressed; drafts still re-render.
- [ ] Revision N's bytes retrievable after N+1 exists.
- [ ] Reprint of an unchanged attested note is byte-identical and creates no revision.
- [ ] All three path sites route through one helper.
- [ ] Cache revision-aware; invalidation no longer fires for attested rows.
- [ ] Service header reflects the reversed lock.
- [ ] Tests added per [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md)
- [ ] Logs contain no PHI or signed URLs (see [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md))

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 📝 Notes

Record at implementation time: which header locks were reversed versus retained, the per-revision address scheme, and the tolerance decision if reprint identity needed one.

---

## 🔗 Related Tasks

- [`task-rxl-11-revisions-migration.md`](./task-rxl-11-revisions-migration.md) — supplies the artifact pointer column
- [`task-rxl-12-snapshot-and-revision-bump.md`](./task-rxl-12-snapshot-and-revision-bump.md) — records the pointer at snapshot time
- [`task-rxl-16-slip-edit-marker.md`](./task-rxl-16-slip-edit-marker.md) — needs the revision number this task makes addressable

---

**Last Updated:** 2026-08-31
**Completed:** —
