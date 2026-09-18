# Task rxl-02: Replace the inert overlay with a real read-only banner

---

## 📋 Task Overview

`RxWorkspace` renders an absolutely-positioned overlay when the consultation has ended, intended to make the prescription read-only. It carries `pointer-events-none`, so every click passes straight through it. It has never blocked anything — it contributes an aria-label and nothing else. Delete it and state the locked condition visibly instead.

**Program / Phase:** rx-lifecycle · Phase 1 (lock integrity)
**Batch:** [`plan-p1-rx-lifecycle-lock-integrity-batch.md`](../plan-p1-rx-lifecycle-lock-integrity-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-rx-lifecycle-lock-integrity.md`](./EXECUTION-ORDER-p1-rx-lifecycle-lock-integrity.md)
**Estimated Time:** ~2 hours
**Status:** ✅ **DONE**
**Completed:** 2026-08-31

**Change Type:**
- [x] **Update existing** — removes dead code, replaces with an affordance; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ `RxWorkspace.tsx` — computes `canEdit` from `canEditPrescriptionDraft(state)` correctly.
- ✅ `RxWorkspace.tsx` — the `terminal` branch already returns a proper "not available" message, which is the tone to match.
- ⚠️ The `ended` overlay — EXISTS but is a no-op. Its aria-label is the only thing it delivers.
- ❌ No visible statement that a note is locked. The doctor discovers it by clicking and nothing happening (and until `rxl-01`, by clicking and it *working*).

**Scope Guard:** ≤ 3 files. Do not make the overlay click-blocking. Do not touch the `terminal` branch's copy or the commit actions. No new dependency.

**Reference:** product plan RXL-DL-2 · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md)

---

## ✅ Task Breakdown

### 1. Pre-flight
- [ ] 1.1 `rxl-01` merged. Without it, removing the overlay changes nothing but the banner would lie.
- [ ] 1.2 Read the existing cockpit banner / notice patterns and reuse one. Do not introduce a new visual language for this.

### 2. Remove
- [ ] 2.1 Delete the overlay element and any state that existed only to render it.
- [ ] 2.2 Confirm nothing else depended on its aria-label — search tests for that string.

### 3. Replace
- [ ] 3.1 A visible, non-blocking notice at the top of the Rx surface when the note is locked, stating that it is read-only and why.
- [ ] 3.2 Announce it to assistive tech at least as well as the aria-label did.
- [ ] 3.3 Copy must not promise a capability that does not exist yet. This phase has **no** correction window and **no** new-note affordance — do not write "amend" or "edit for 15 minutes" (that is Phase 3, `rxl-14`).

### 4. Verification
- [ ] 4.1 A locked note scrolls normally and its text can be selected and copied.
- [ ] 4.2 The notice is present on a locked note and absent on an open one.
- [ ] 4.3 `tsc` + lint clean; affected suites judged.

---

## 📁 Files

```
UPDATE: frontend/components/consultation/cockpit/RxWorkspace.tsx (delete overlay, mount notice)
UPDATE/CREATE: frontend read-only notice component (reuse an existing banner if one fits)
UPDATE/CREATE: frontend unit tests
```

**Existing Code Status:**
- ⚠️ `RxWorkspace.tsx` — EXISTS; contains the dead overlay
- ✅ cockpit banner patterns — EXIST (reuse, do not re-invent)

**When updating existing code:**
- [ ] Audit callers and tests referencing the overlay or its aria-label — see [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [ ] Remove the obsolete element and any now-unused derivation rather than leaving it inert
- [ ] Update tests and docs per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Do not repair the overlay by removing `pointer-events-none`.** Blocking pointer events would also block scrolling and text selection of a record the doctor legitimately needs to read. Per-field disabling from `rxl-01` is the correct mechanism; the banner's job is communication only.
- The banner states a fact; it is not a control. No buttons in it this phase.
- Match the existing cockpit notice styling and the tone of the `terminal` branch already in this file.
- No PHI in the copy — no patient name, no clinical content.
- Accessibility must not regress relative to the aria-label being removed.

---

## 🌍 Global Safety Gate

- [ ] Data touched? **No.**
- [ ] PHI in logs? No.
- [ ] External API / AI? No.
- [ ] Retention? No.

---

## ✅ Acceptance & Verification Criteria

- [ ] Overlay gone; no `pointer-events-none` full-bleed element remains in the Rx surface.
- [ ] Locked note scrolls and selects.
- [ ] Locked state is visibly stated and announced.
- [ ] Copy makes no promise about amending or a time window.
- [ ] Tests added or updated per [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md)

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 🔗 Related Tasks

- [`task-rxl-01-lock-gate-and-wiring.md`](./task-rxl-01-lock-gate-and-wiring.md) — must land first
- `rxl-14` (Phase 3) — replaces this static notice with the live window countdown

---

**Last Updated:** 2026-08-31
**Completed:** 2026-08-31

**Ship notes:** Overlay deleted. Non-blocking `role="status"` strip: "This prescription is read-only. The consultation has ended." No 15-minute / amend copy.
