# Task rxl-17: Supersede an issued note, reason required

---

## 📋 Task Overview

The window closes at minute 16 and the dose is still wrong. The doctor needs a way to issue a corrected document that explicitly retracts the previous one — not a second note that leaves two contradictory prescriptions in circulation with nothing saying which is current.

A correction points at what it supersedes and carries a required reason.

**Program / Phase:** rx-lifecycle · Phase 3 (revise window)
**Batch:** [`plan-p3-rx-lifecycle-revise-window-batch.md`](../plan-p3-rx-lifecycle-revise-window-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-lifecycle-revise-window.md`](./EXECUTION-ORDER-p3-rx-lifecycle-revise-window.md)
**Estimated Time:** ~4 hours
**Status:** ⏳ **PENDING** (blocked on `rxl-13`)
**Completed:** —

**Change Type:**
- [x] **New feature** — a new action over columns `rxl-11` created

**Current State:**
- ✅ `rxl-11` — supersede pointer and reason columns on `prescriptions`.
- ✅ `rxl-07` — the lazy new-note path, which a correction can reuse rather than duplicate.
- ✅ `rxl-09` — the per-note history list, which is where superseded state must be visible.
- ✅ `rxl-06` / `rxl-13` — the attested note stays immutable; superseding does not edit it.
- ❌ No correction action, no supersede write path, no display of superseded state.

**Scope Guard:** ≤ 7 files. Do not mutate the superseded prescription's clinical content — superseding is a pointer from the new note, not an edit of the old one. No patient-facing notification and no auto-resend. No approval or co-sign workflow. Do not extend or reopen the window.

**Reference:** product plan RXL-DL-12, RXL-Q6 · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md)

---

## ✅ Task Breakdown

### 1. Pre-flight
- [ ] 1.1 `rxl-13` merged, so "the window has closed" is a real state to offer this from.
- [ ] 1.2 Confirm the correction can reuse `rxl-07`'s creation path. If it cannot, record why before adding a second one.

### 2. Write path
- [ ] 2.1 A new prescription that records which prescription it supersedes and why.
- [ ] 2.2 Reason is **required** — enforced server-side, not only by a form field.
- [ ] 2.3 The superseded prescription's clinical content is not touched. Its attest stamp, snapshots and issued artifacts stay exactly as they are.
- [ ] 2.4 Only an attested prescription can be superseded. A draft is simply edited.
- [ ] 2.5 A prescription cannot be superseded twice, and a chain cannot loop back on itself.
- [ ] 2.6 Same appointment (RXL-DL-3). A correction is not a new visit.

### 3. Surface
- [ ] 3.1 Offer the correction only when the window has closed on an attested note. Inside the window, editing is the answer.
- [ ] 3.2 Reason captured before the note is created, not after.
- [ ] 3.3 The correction starts seeded from the superseded note's content — the doctor is fixing one field, not retyping a prescription. Seeded per `rxl-03`'s non-dirtying path.
- [ ] 3.4 History (`rxl-09`) shows the superseded note **as superseded**, still readable, never deleted or hidden.

### 4. Verification
- [ ] 4.1 Superseding records the pointer and reason; the old note is byte-identical afterwards.
- [ ] 4.2 A missing reason is refused server-side.
- [ ] 4.3 Double-supersede and loops refused.
- [ ] 4.4 Draft cannot be superseded.
- [ ] 4.5 History shows both notes with the relationship legible.
- [ ] 4.6 Same `appointment_id`; queue and `visit_payments` unchanged.
- [ ] 4.7 `tsc` + lint clean; suites green.

---

## 📁 Files

```
UPDATE: backend/src/services/prescription-service.ts (supersede write path + invariants)
UPDATE: backend/src/utils/validation.ts (reason required)
UPDATE: backend/src/controllers/<prescription controller> (Zod, asyncHandler)
UPDATE: frontend/components/consultation/cockpit/<correction affordance> (reason capture)
UPDATE: frontend/components/patient-profile/panes/HistoryPane.tsx (superseded state)
UPDATE: frontend/lib/api
UPDATE/CREATE: backend + frontend tests
```

**Existing Code Status:**
- ✅ `rxl-11` columns — DEPLOYED
- ✅ `rxl-07` creation path — EXISTS (reuse)
- ⚠️ `HistoryPane.tsx` — EXISTS from `rxl-09`; needs superseded state
- ❌ correction affordance — MISSING

**When updating existing code:**
- [ ] Audit the creation path before reusing it — see [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [ ] Map the invariants from §2 to concrete server-side checks
- [ ] Update tests and docs per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Validate all external input with Zod in the controller before the service is called (agent contract). No try-catch in controllers — use `asyncHandler`.
- **Superseding is additive.** The old document keeps its content, its snapshots and its issued bytes. Two documents where one is silently altered is worse than no history at all.
- The reason is a clinical fact and belongs in the record — but it is **not** audit metadata. `audit_logs.metadata` is no-PHI; the reason lives on the prescription row.
- Enforce the invariants server-side. A UI that only offers the action in the right place is not an invariant.
- Do not notify the patient or resend automatically. RXL-Q6: prompt the doctor; only they know whether the patient can still be reached.
- Do not build approval or co-sign. That is explicitly a program residual.
- No PHI in logs (COMPLIANCE.md) — including the reason text.

---

## 🌍 Global Safety Gate

- [ ] Data touched? **Yes** — new PHI row plus a pointer between PHI rows. No schema change (`rxl-11` did it); `prescriptions` RLS unchanged. **RLS verified?**
- [ ] PHI in logs? **No** — the reason text must not be logged.
- [ ] External API / AI? No.
- [ ] Retention? No new obligation beyond the additional prescription row.

---

## ✅ Acceptance & Verification Criteria

- [ ] Supersede records pointer and reason; superseded note unchanged.
- [ ] Reason required server-side.
- [ ] Double-supersede, loops, and draft-supersede all refused.
- [ ] History shows the relationship; nothing deleted or hidden.
- [ ] Same appointment; queue and hisab untouched.
- [ ] Tests added per [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md)
- [ ] Logs contain no PHI (see [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md))

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 🔗 Related Tasks

- [`task-rxl-11-revisions-migration.md`](./task-rxl-11-revisions-migration.md) — supplies the columns
- [`task-rxl-13-window-guard.md`](./task-rxl-13-window-guard.md) — defines the closed state this action answers
- [`task-rxl-09-visit-history-per-note.md`](../../p2-append-notes/Tasks/task-rxl-09-visit-history-per-note.md) — the surface showing superseded state

---

**Last Updated:** 2026-08-31
**Completed:** —
