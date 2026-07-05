# Task vit-13: Vitals close-gate — byte-parity + visibility round-trip + a11y + sparse + verification

> **Filename:** `task-vit-13-vitals-close-gate.md` in `vitals-section/Tasks/`.
> **Relative-link note:** `process/` = five `../`; `Reference/` = six; `frontend/`/`backend/` = seven.

---

## 📋 Task Overview

Close the program: **prove** the whole vitals surface (the expanded catalog, hide/unhide, "+ Add vital", and
per-vital trends) is **view/UX-only against the derived output** and accessible. Assert that no visibility
permutation, per-visit reveal, or trend surface changes `buildRxPayload` by a byte; that rows using only the
shipped columns derive **byte-identically** to today; that a hidden-but-recorded vital still serializes (data is
never lost) while a hidden-empty vital is `null`; that the per-doctor hidden set **round-trips** a remount; that
the menu / "+ Add vital" / clickable sparklines / charts are accessible; and that sparse/empty states hold.
Then run the verification gate. Mirrors obj-15 / obj-29.

**Program / Phase:** vitals-section · VP5 (close-gate)  
**Batch:** [`../plan-vitals-section-batch.md`](../plan-vitals-section-batch.md)  
**Execution order:** [`EXECUTION-ORDER-vitals-section.md`](./EXECUTION-ORDER-vitals-section.md)  
**Estimated Time:** ~2–4 hours  
**Status:** ✅ **Done** (2026-06-21) — close-gate `vitalsSectionParity.test.tsx` lands (12/12); vitals + objective slice green; genuine vitals-slice `TS2322` errors fixed; unrelated subjective/tsc/backend pre-existing failures routed to the capture inbox.

**Change Type:**
- [ ] **Add tests + verify** — close-gate fixtures + the program verification gate. Follow [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** vit-01..12 surfaces; the P1/P3/P6 parity-fixture shapes (`objectiveLayoutParity.test.tsx`, `objectiveTrendsParity.test.tsx`); `buildRxPayload`; the vit-03 derived-text parity test.
- ❌ **What's missing:** the cross-cutting view-only + visibility round-trip + a11y + sparse proof for the vitals surface; the green program gate.

**Scope Guard:**
- Expected files touched: ≤ 3 (one comprehensive close-gate test file + any tiny a11y/empty-state fix the gate surfaces + plan/checkbox + program-doc ticks). **No** feature work — if a real fix beyond a one-line a11y/empty-state tweak is needed, fix the *source* (never weaken the assertion) and surface it.

**Reference Documentation:**
- [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md) · [`../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md`](../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md) · [`../../../../../Reference/engineering/development/TESTING.md`](../../../../../Reference/engineering/development/TESTING.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. View-only byte-parity (V3-D5)
- [x] ✅ 1.1 `buildRxPayload` is **byte-identical** across every visibility permutation (hide/unhide any vital incl. core), every "+ Add vital" per-visit reveal, and with all trend surfaces rendered — UX state never reaches the payload. — **Completed: 2026-06-21** (`vitalsSectionParity.test.tsx §1.1`)
- [x] ✅ 1.2 A row using **only the shipped columns** derives `examination_findings`/`vitals` **byte-identically to today**; PDF/SMS/snapshot unchanged (re-assert the vit-03 contract end-to-end). — **Completed: 2026-06-21** (`§1.2`, `deriveVitalsText({}) === ""`)
- [x] ✅ 1.3 A **hidden vital that holds a value still serializes** (data never lost); a **hidden empty vital is `null`** (no leaked key); no visibility/trend keys leak into the payload. — **Completed: 2026-06-21** (`§1.3`, `§1.4`)

### 2. Visibility + storage round-trips
- [x] ✅ 2.1 The per-doctor `vitals_hidden` set survives a remount + re-applies as the default; "+ Add vital" reveal does **not** persist (remount returns to default). — **Completed: 2026-06-21** (`§2.1`, `§2.2`)
- [x] ✅ 2.2 `vitals_json` round-trips: enter json vitals → save → reload → re-save fixed point (incl. canonical units). — **Completed: 2026-06-21** (`§2.3`)

### 3. Accessibility + sparse-data sweep
- [x] ✅ 3.1 `ManageVitalsMenu` (aria-expanded/aria-pressed, labels), "+ Add vital" picker, clickable sparklines (keyboard), and charts (text/aria descriptions) are operable + labelled. — **Completed: 2026-06-21** (`§3.1`–`§3.3`; charts/growth covered by obj-29)
- [x] ✅ 3.2 0/1/sparse-visit data renders gracefully across grid + sparkline + chart + overview + categorical timeline; empty states announced; never throws. — **Completed: 2026-06-21** (`§3.4` zero-history, `§3.5` single-visit)

### 4. Verification gate
- [x] ✅ 4.1 `frontend` lint + test clean for the slice (vitals + objective: close-gate 12/12; objective slice 64/64 after harness fix); `tsc --noEmit` genuine vitals-slice `TS2322` errors fixed; **pre-existing unrelated failures routed** (subjective subj-20/23/25/35/38; repo-wide tsc debt; backend env import failures) — see capture inbox. — **Completed: 2026-06-21**
- [x] ✅ 4.2 Program README + batch-plan cross-cutting gate + per-task checkboxes updated. — **Completed: 2026-06-21**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 🧾 Close-gate outcome (2026-06-21)

- **Landed:** `frontend/components/cockpit/rx/sections/__tests__/vitalsSectionParity.test.tsx` (12/12) — §1 view-only byte-parity, §2 visibility/`vitals_json` round-trips, §3 a11y + sparse.
- **Source fixes the gate surfaced (slice-local, runtime-identical):** `VitalsGrid.tsx` (narrowed `visitRevealed*` Sets to `VitalKey`/`CategoricalVitalKey`), `vitals-json.ts` + `vitals-visibility.ts` (union-keyed-write / cast `TS2322`).
- **Pre-existing breakage repaired (vit-10..12 gave `VitalsGrid` a `QueryClient` dependency that broke objective harnesses):** stubbed `VitalsGrid` in 9 objective test files (`ObjectiveSection.{test,order,reorder-collapse,modality-seed}`, `objective{Layout,Results,Template}Parity`, `ManageObjectiveSectionsMenu`, `CustomObjectiveSectionsField`) + added a `QueryClientProvider` to `PrescriptionFormCompositionRoot.test.tsx`. Objective slice now green (64/64 + composition root 5/5).
- **Routed (not introduced) → capture inbox:** 5 subjective-program failures (subj-20/23/25/35/38), repo-wide pre-existing `tsc --noEmit` debt (no `target`; test files excluded; enforced gate is `next lint` + `vitest`), and backend test-env import failures.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/.../__tests__/vitalsSectionParity.test.tsx
UPDATE: (only if the gate surfaces a tiny a11y/empty-state fix) the relevant vitals component
UPDATE: docs .../vitals-section/{README.md, plan-vitals-section-batch.md} + task checkboxes
DO NOT TOUCH: feature scope — vit-01..12 land the surfaces; this proves them
```

**When updating existing code:**
- [ ] Proof/gate task — prefer tests over source changes; if a parity contract breaks, fix the source, never relax the assertion.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Assertion-first** — encode the V3-D5 view-only contract + V3-D2 "data never lost" + round-trips. Drift ⇒ fix source.
- **Reuse the obj-15/obj-29 fixture shape** so this reads like the shipped close-gates.
- Pre-existing repo-wide failures are **routed, not introduced**.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** (tests + verification; the only source edits were slice-local type-soundness fixes the gate surfaced — runtime-identical).
  - [x] **RLS verified?** **Yes** — re-confirms vitals reuse the shipped doctor-scoped reads; no widening.
- [x] **Any PHI in logs?** **No** (synthetic fixtures; never log values).
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

> **Opus-grade:** the parity/verification slice (like obj-15 / obj-29) — maximum care proving the view-only contract + "hide never loses data" hold across the whole surface.

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ `buildRxPayload` byte-identical across visibility / "+ Add vital" / trend permutations; shipped-column rows byte-identical; hidden-with-data serializes; hidden-empty is `null`.
- [x] ✅ `vitals_hidden` + `vitals_json` round-trip a remount; per-visit reveal never persists.
- [x] ✅ a11y + sparse-data states pass; `frontend` lint/test green for the vitals + objective slice; genuine vitals-slice `tsc` errors fixed; pre-existing unrelated failures (subjective, repo-wide tsc, backend env) routed to the capture inbox.
- [x] ✅ Program docs marked done.

**See also:** [`../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md`](../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The most important thing to *prove* in the program: vitals is the highest-traffic surface, and the doctor now has full freedom to hide anything — so the gate must show that freedom never (a) leaks layout into the patient-facing output or (b) loses a recorded value. Direct analog of obj-15 / obj-29.

---

## 🔗 Related Tasks

- [`task-vit-04-form-state-payload-wiring.md`](./task-vit-04-form-state-payload-wiring.md) + [`task-vit-03-vitals-json-contract-and-derived-text.md`](./task-vit-03-vitals-json-contract-and-derived-text.md) — the byte-parity contract this re-proves end-to-end.
- [`task-vit-08-manage-vitals-menu.md`](./task-vit-08-manage-vitals-menu.md) + [`task-vit-09-add-vital-per-visit.md`](./task-vit-09-add-vital-per-visit.md) — the visibility surfaces gated here.

---

**Last Updated:** 2026-06-20  
**Pattern:** view-only byte-parity + round-trip + a11y + sparse close-gate (mirror obj-15 / obj-29).  
**Reference:** `process/CODE_CHANGE_RULES.md`
