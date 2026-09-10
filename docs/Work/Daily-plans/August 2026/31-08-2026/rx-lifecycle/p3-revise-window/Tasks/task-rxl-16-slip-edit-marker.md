# Task rxl-16: `Edited h:mm a · Rev N` in the PDF footer

---

## 📋 Task Overview

Put the correction on the face of the document. A patient may be holding the 4:00 pm slip while the record says 4:05 pm — the reprint has to be distinguishable from the original by looking at it, not by querying a database.

One line of system text beside the existing short id and generated-at line.

**Program / Phase:** rx-lifecycle · Phase 3 (revise window)
**Batch:** [`plan-p3-rx-lifecycle-revise-window-batch.md`](../plan-p3-rx-lifecycle-revise-window-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-lifecycle-revise-window.md`](./EXECUTION-ORDER-p3-rx-lifecycle-revise-window.md)
**Estimated Time:** ~2 hours
**Status:** ⏳ **PENDING** (blocked on `rxl-15`)
**Completed:** —

**Change Type:**
- [x] **Update existing** — adds a line to an existing render tree; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ The PDF footer already renders system provenance — a short id and a generated-at line, assembled in the service and rendered by the document component.
- ✅ Doctor-configurable letterhead options already exist for the footer, including a custom footer line, a footer banner image, and a flag that hides the product credit.
- ✅ `rxl-15` — makes revision number and issued-artifact addressing available.
- ❌ No marker distinguishes a revised slip from an original.
- ⚠️ The doctor-configurable footer and the system provenance line are **different things** in the render tree. Putting the marker in the wrong one lets a branding setting suppress it.

**Scope Guard:** ≤ 4 files. One line of text. No letterhead redesign, no page-preset change, no new setting. Do not touch the freeze or retention logic (`rxl-15`).

**Reference:** product plan RXL-DL-11 · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

---

## ✅ Task Breakdown

### 1. Pre-flight
- [ ] 1.1 `rxl-15` merged so the revision number is available on the render input.
- [ ] 1.2 Read the footer render tree and identify precisely which parts are doctor-configurable and which are system provenance. Record the distinction before editing.

### 2. The marker
- [ ] 2.1 Rendered only when the prescription has been revised. An original slip is unchanged — no marker, no blank space where one would go.
- [ ] 2.2 Time and revision number, in the format the product plan fixes.
- [ ] 2.3 Placed with the existing system provenance line, **never** inside the doctor-configurable footer (RXL-DL-11).
- [ ] 2.4 Time rendered in the clinic's timezone using the existing house helper, not a locale default.

### 3. Verification
- [ ] 3.1 A revised prescription's reprint shows the marker.
- [ ] 3.2 An unrevised prescription shows nothing new — snapshot the existing output to prove it.
- [ ] 3.3 The marker survives a custom footer line, a footer banner image, and the hide-credit flag set. Each asserted separately.
- [ ] 3.4 Layout does not shift or overflow on the existing page presets.
- [ ] 3.5 `tsc` + lint clean; PDF suites green.

---

## 📁 Files

```
UPDATE: backend/src/services/prescription-pdf-service.ts (pass revision + edited-at into the render input)
UPDATE: backend/src/pdf/<PrescriptionDocument footer component> (render the marker)
UPDATE/CREATE: backend tests (present when revised, absent when not, unsuppressible, layout)
```

**Existing Code Status:**
- ⚠️ `prescription-pdf-service.ts` — EXISTS; footer data assembled here
- ⚠️ footer component — EXISTS; system provenance and configurable footer both live in this area
- ✅ timezone helper — EXISTS (reuse)

**When updating existing code:**
- [ ] Audit the footer render tree per 1.2 — see [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [ ] Confirm no existing footer snapshot silently absorbs the new line
- [ ] Update tests and docs per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **System text, not branding.** A letterhead setting must not be able to hide a medico-legal marker. This is the single design rule of the task and the reason 1.2 exists.
- Absent when not revised. An "Edited —" placeholder on every slip trains the eye to ignore it.
- Reuse the existing timezone helper. A UTC time on a printed slip is worse than no time.
- Do not restyle the footer. One line, in the existing type treatment.
- No PHI in the marker — a timestamp and a number, nothing else.
- Existing PDF snapshots must be updated deliberately, not regenerated wholesale; a wholesale regeneration would hide an unintended layout change.

---

## 🌍 Global Safety Gate

- [ ] Data touched? **No** — render-time only, over data `rxl-15` already supplies.
- [ ] PHI in logs? No.
- [ ] External API / AI? No.
- [ ] Retention? No.

---

## ✅ Acceptance & Verification Criteria

- [ ] Marker present on a revised reprint, absent otherwise.
- [ ] Unsuppressible by custom footer, footer banner, or hide-credit.
- [ ] Clinic-timezone time.
- [ ] No layout regression on existing presets.
- [ ] Tests added per [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md)

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 🔗 Related Tasks

- [`task-rxl-15-pdf-freeze-and-retention.md`](./task-rxl-15-pdf-freeze-and-retention.md) — supplies the revision number
- [`task-rxl-14-window-ui.md`](./task-rxl-14-window-ui.md) — prompts the reprint this marker appears on

---

**Last Updated:** 2026-08-31
**Completed:** —
