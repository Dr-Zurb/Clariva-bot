# Task vit-08: `ManageVitalsMenu` — hide/unhide (no locks), grouped, has-data hint + warning

> **Filename:** `task-vit-08-manage-vitals-menu.md` in `vitals-section/Tasks/`.
> **Relative-link note:** `process/` = five `../`; `Reference/` = six; `frontend/`/`backend/` = seven.

---

## 📋 Task Overview

The doctor-facing control: a `ManageVitalsMenu` inside the vitals section header that lists every vital
**grouped**, each with an eye / eye-off toggle — **nothing locked**, core included (V3-D2). It shows a boolean
"has data" hint per vital (never the value — mirrors P10-D5), and when the doctor hides a vital that currently
**holds a value**, it shows a **one-line warning/confirm** ("Value is kept, just hidden") and then proceeds.
A near-clone of `ManageObjectiveSectionsMenu`, wired to the vit-07 resolver/transport.

**Program / Phase:** vitals-section · VP3 (hide/unhide engine)  
**Batch:** [`../plan-vitals-section-batch.md`](../plan-vitals-section-batch.md)  
**Execution order:** [`EXECUTION-ORDER-vitals-section.md`](./EXECUTION-ORDER-vitals-section.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **Done** (2026-06-21).

**Change Type:**
- [x] **Add component + wire** — `ManageVitalsMenu` + header trigger. Follow [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** `ManageObjectiveSectionsMenu.tsx` (the popover/eye-toggle/has-data pattern to clone); vit-07 resolver + `vitals_hidden` transport; the grouped registry (vit-01); the grid (vit-05/06); `ManageVitalsMenu` + VitalsGrid wiring.
- ✅ **Shipped:** per-vital manage menu + hide-with-data warning + persisted toggles.

**Scope Guard:**
- Expected files touched: ≤ 4 (`ManageVitalsMenu` + grid header wiring + warning affordance + tests). **No** "+ Add vital" per-visit override (vit-09), **no** reorder (out of scope — hide/unhide only), **no** specialty.
- Hide/unhide writes the vit-07 `vitals_hidden` default (persisted); per-visit ephemeral reveal is vit-09.

**Reference Documentation:**
- [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md) · [`../../../../../Reference/engineering/development/STANDARDS.md`](../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Menu UI (clone, grouped)
- [x] ✅ 1.1 A popover listing every vital **grouped**, each with an eye/eye-off toggle (`aria-pressed`), a boolean "has data" hint, and group headers; trigger in the vitals header shows the hidden count (clone `ManageObjectiveSectionsMenu`). - **Completed: 2026-06-21**
- [x] ✅ 1.2 **No locks** — every vital, core included, can be toggled (V3-D2). No "cannot hide" state. - **Completed: 2026-06-21**

### 2. Hide-with-data warning
- [x] ✅ 2.1 When hiding a vital whose form-state value is non-null, show a **one-line warning/confirm** ("Value is kept, just hidden"); on confirm, hide; the value stays in form-state + storage (never cleared). - **Completed: 2026-06-21**
- [x] ✅ 2.2 Unhiding is immediate (no warning). The "has data" hint is boolean only — never render the value in the menu (P10-D5). - **Completed: 2026-06-21**

### 3. Wire to vit-07
- [x] ✅ 3.1 Toggles update the persisted `vitals_hidden` default via the vit-07 transport (debounced like the objective menu); the grid re-renders the visible set. - **Completed: 2026-06-21**

### 4. Verification & Testing
- [x] ✅ 4.1 Test: every vital toggles (incl. core, no lock); hide-with-data shows the warning then hides + retains value; has-data hint boolean-only; hidden count + a11y labels correct. - **Completed: 2026-06-21**
- [x] ✅ 4.2 `frontend tsc` + lint clean; targeted vitest green. - **Completed: 2026-06-21**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/inputs/ManageVitalsMenu.tsx (+ test)
UPDATE: VitalsGrid header (mount the trigger; render the resolved visible set)
DO NOT TOUCH: "+ Add vital" per-visit override (vit-09); reorder; buildRxPayload; storage
```

**When updating existing code:**
- [x] Clone `ManageObjectiveSectionsMenu` structure/a11y; do not fork a new menu paradigm.
- [x] Never clear a value on hide; never surface the value in the menu (boolean hint only).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **No locks** — any vital hideable, core included (V3-D2).
- **Hidden = off-screen** but value retained; **warn, don't block** on hide-with-data.
- **Boolean has-data hint only** (P10-D5) — no value in the menu.
- **UX-only** — visibility never reaches `buildRxPayload` (V3-D5).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No write to prescriptions** — toggles the doctor `vitals_hidden` config (vit-07).
- [x] **Any PHI in logs?** **No** — boolean has-data hint only; never log values.
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No** — hiding never deletes a value.

> **No STOP/Opus gate** — UI over the vit-07 transport; config-only writes.

---

## ✅ Acceptance & Verification Criteria

- [x] Grouped menu toggles every vital (no lock); hide-with-data warns-then-proceeds + retains value.
- [x] Boolean has-data hint; hidden set persists via vit-07; grid reflects the visible set.
- [x] `tsc`/lint/tests green for the slice.

**See also:** [`../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md`](../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The freedom-with-a-seatbelt control: the doctor can do anything (even hide BP), but a vital that holds a value warns before it leaves the screen and never loses the data. Directly mirrors the objective manage-sections menu, one level deeper.

---

## 🔗 Related Tasks

- [`task-vit-07-vitals-visibility-persistence.md`](./task-vit-07-vitals-visibility-persistence.md) — the resolver/transport this drives.
- [`task-vit-09-add-vital-per-visit.md`](./task-vit-09-add-vital-per-visit.md) — the per-visit reveal counterpart.

---

**Last Updated:** 2026-06-21  
**Pattern:** clone of `ManageObjectiveSectionsMenu` (popover + eye-toggle + has-data hint), per vital, no locks.  
**Reference:** `process/CODE_CHANGE_RULES.md`
