# Task rxl-29: Phase 3 suites + docs + gate

> **Model:** executed on Grok 4.6 at owner override 2026-09-10.

---

## 📋 Task Overview

Close Phase 3. Walk the batch acceptance gate end to end. Two tests carry the weight: a yesterday-issued note refused with a client whose clock says today, and continuous typing producing Version 2 rather than Version 47.

**Program / Phase:** rx-lifecycle · Phase 3-D
**Batch:** [`plan-p3-rx-lifecycle-same-day-revise-batch.md`](../plan-p3-rx-lifecycle-same-day-revise-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md`](./EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md)
**Estimated Time:** ~3 hours
**Status:** ✅ **IMPLEMENTED** 2026-09-10 — phase closed with residuals (not Shipped)
**Completed:** 2026-09-10

**Change Type:**
- [x] **Update existing** — tests and docs only

**Scope Guard:** Tests and docs. No production behaviour change. If a gate item fails, record it and stop.

**Reference:** batch acceptance gate · product plan program gate · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## ✅ Task Breakdown

### 1. Pre-flight
- [x] 1.1 `rxl-19`…`28` implemented (not git-merged as a PR).
- [x] 1.2 Phase 1 gate re-run: `rxLifecyclePhase1Gate.test.tsx` **green**. Ended visit without `noteClosed` still locks (Phase 3 unlocks via `noteClosed: false`, not by deleting the visit fallback). Phase 2 dedicated gate (`rxl-10`) **does not exist** — `rxl-08`/`rxl-10` still open. Ran `prescription-attest-guard`, `useRxFormProviderSetup.rxl07`, and `prescription-write-guard` instead.

### 2. Suites
- [x] 2.1 Labs print does not attest; note stays editable; Finish once attests. (`prescription-pdf-url-handler` + `prescription-attest-guard`)
- [x] 2.2 Same-day re-issue after Finish → Version 2 linked, Version 1 retrievable. (`prescription-revision-clone`)
- [x] 2.3 Continuous typing → Version 2, not Version 47. (`rxLifecyclePhase3Gate` + `needsReissue` + write guard allows in-place same-day updates)
- [x] 2.4 Yesterday-issued note refused server-side against a "today" client clock. (`rx-lifecycle-phase3-gate` + `prescription-write-guard`)
- [x] 2.5 Footer replaces-line + distinguishable filenames. (`prescription-replaces-line`, `prescription-pdf-footer`, `prescription-pdf-filename`)

### 3. Docs
- [x] 3.1 Batch and product-plan gates ticked for what actually shipped.
- [x] 3.2 Residuals recorded below.

---

## Verification this sitting

| Suite | Result |
|---|---|
| Frontend Phase 1 gate + Phase 3 related (`rxLifecyclePhase1Gate`, `rxLifecyclePhase3Gate`, `rxLoadDecision`, `rxRevise`, `rxl07`, History notes, VisitDetail) | **48 passed** |
| Backend Phase 3 related (write-guard, clone, attest-guard, PDF handler, filename, replaces-line, footer, phase3-gate) | **49 passed** (after gate TS fix) |
| Repo-wide `tsc` / `lint` | **Not claimed.** Pre-existing reds recorded since `rxl-04`. Targeted eslint on new frontend gate file clean. |

---

## Residuals (do not pretend these shipped)

- **`lvc` later-day past-visit strip** — batch gate item. Not this program. Yesterday is refused and reviewed read-only; the greyed reference + repeat UI is still `lvc`.
- **Front-desk re-check-in = new visit** — unchanged, not re-proven this sitting.
- **Legacy panes** still use `canEditPrescriptionDraft(visit)`: `InvestigationsPane`, `AssessmentStrip`, `InvestigationsAutoMerge`, `templates.tsx`. v3 SOAP columns do not.
- **Preview CTA split** ("Send & finish" → three first-class actions) was explicitly out of Phase A and did not land here.
- **`printed_at` is never written** on print. RXL-Q6 reprint half of the delivery prompt rarely fires.
- **RXL-Q10** — cloned attachments share `file_path`. Erasure/retention worker still needs a flag.
- **`incomplete` KPI** does not cover in-clinic walk-ins (no `consultation_sessions` row).
- **Phase 2 leftovers:** `rxl-08` (carry sibling / current non-superseded), `rxl-10` (Phase 2 gate). `rxl-09` landed with `rxl-28`.
- **Share-link superseded chrome (RXL-Q9)** — out of program.
- **Repo-wide typecheck / lint** — still pre-existing dirty; phase not Shipped.

---

## 📁 Files

```
CREATE: backend/tests/unit/rx-lifecycle-phase3-gate.test.ts
CREATE: frontend/components/cockpit/rx/__tests__/rxLifecyclePhase3Gate.test.ts
UPDATE: docs (this task, batch plan, product plan, program README, inbox)
```

---

**Not this task:** starting `lvc`, queue, or share-link work.

**Last Updated:** 2026-09-10 (gate walked; residuals recorded)
**Completed:** 2026-09-10
