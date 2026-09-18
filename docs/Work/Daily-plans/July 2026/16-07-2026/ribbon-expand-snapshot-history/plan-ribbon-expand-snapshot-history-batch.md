# Ribbon-as-safety-glance + Snapshot/History on demand — 16 Jul 2026 batch plan

> **Hand-off doc.** Written for an executing agent (Grok). Self-contained: it cites the real files, the current behaviour, the locked design decisions, a phased task list, the scope guard, and the verification gate. Read it top to bottom before touching code.
>
> **One-line intent:** Snapshot and History are *read-mostly* reference surfaces the doctor doesn't need permanently mounted. We already ship an always-on context strip (`PatientRibbon`). Promote that strip to be **the** persistent safety glance with **click-to-expand** detail, and move **History** into a **summoned side sheet** — so the two panes stop competing for permanent canvas real estate.

---

## Why this batch

During a consult the doctor mostly *writes* in Subjective / Objective / Assessment / Plan. Snapshot and History are things they **read occasionally**, not edit continuously. Today both are always-mounted tabs taking canvas space.

But we already have a better always-on surface: the 52px **`PatientRibbon`** (the strip showing age/sex/weight · allergies · chronic conditions · 💊 count · Safety · 🎯 Treating). It already duplicates most of Snapshot. The move is to lean into that: keep the thin glance persistent, and make the *depth* appear only when asked.

**Clinical guardrail:** Snapshot is not purely read-only — its section components carry **add/edit** affordances ("log an allergy mid-consult"). Any replacement surface MUST preserve that capability, and **allergies must stay the loudest element** even when collapsed. This is a safety surface, not just chrome.

---

## Current state (grounded — read these first)

- **The strip** = `frontend/components/patient-profile/PatientRibbon.tsx`
  - Fixed **52px**, mounted in `frontend/components/patient-profile/PatientProfilePage.tsx` (~line 339: `<PatientRibbon appointment={appt} token={token} />`).
  - Slots: `IdentitySlot` (age·sex·weight) · `AllergiesSlot` · `ChronicSlot` · `ActiveMedsSlot` (💊 N) · `SafetySlot` (Shield, from `useOptionalRxSafety`) · `TreatingSlot` (right-aligned live mirror of `useRxForm().state.fields.provisionalDiagnosis`, click focuses `#diagnosis`).
  - Data via `frontend/hooks/usePatientRibbonData.ts` — composes `getPatientById`, `listPatientVitals({limit:1})`, `listPatientAllergies`, `listPatientConditions`, `listRecentPrescriptionsByPatient({limit:1})`. Read-only. 60s memory cache.
  - **Progressive-disclosure primitives already present:** per-chip `Tooltip`, and `OverflowPill` → `Popover` for `+N more`. Walk-in guarded (`patient_id == null → null`). Desktop-only.

- **Snapshot pane** = `frontend/components/patient-profile/panes/SnapshotPane.tsx`
  - Renders five EHR section components inside `SectionWrapper`: `AllergiesSection`, `ChronicConditionsSection`, `ProblemListSection`, `SnapshotVitalsSection`, `PreviousRxSection` (`filter="most-recent-visit"`, `limit={10}`).
  - Mounts them with `layout="in-call"`, `mode="default"`, plus `addOpen` / `onAddOpenChange` / `onCountChange`. **These sections own their own fetch + add/edit** (see `AllergiesSection` props: `patientId, token, layout, mode, addOpen?, onAddOpenChange?, onCountChange?`).
  - In the tab registry it's wrapped by `ChartRailWithEmptyState`.

- **History pane** = `frontend/components/patient-profile/panes/HistoryPane.tsx`
  - Past-visit (prescription) cards, newest first; click → opens `VisitDetailSideSheet` via `useSideSheet()`. **Already a summon-a-sheet pattern.** Only visits with a saved Rx appear.

- **Side sheet host** = `frontend/components/patient-profile/SideSheetHost.tsx`
  - `useSideSheet().open({ id, title, content, defaultWidth?, canDock? })`. Single sheet (open replaces), right-edge slide-in ~250ms, default 480px, dismiss on Esc / backdrop / close button, z-40. Mounted once in `PatientProfilePage` (~line 383) wrapping page content.

- **Tab registry** = `frontend/lib/patient-profile/v3/cockpit-tabs.tsx`
  - `buildCockpitTabs(ctx)` returns 7 uniform leaf tabs. `snapshot` renders `<ChartRailWithEmptyState>…<SnapshotPane>`; `history` renders `<HistoryPane>`.
  - **`COCKPIT_TAB_ORDER` = `['snapshot','history','body','subjective','objective','assessment','plan']` is the single source of truth**, consumed by:
    - `frontend/lib/patient-profile/v3/default-layouts.ts` — **all four preset trees (Consult / Read / Document / Review) hard-reference `snapshot` and `history` leaves**, and `isFullEightPaneRegistry` checks `panes.length === COCKPIT_TAB_ORDER.length`.
    - `frontend/lib/patient-profile/v3/blankLayout.ts` + the palette.
    - **Persisted user layouts** (saved trees reference these pane ids) → back-compat / migration surface.
    - A large test suite (`cockpit-tabs.test`, `default-layouts.test`, `layouts.integration`, `CockpitPalette`, `buildUp*`, `CockpitChrome.reparent`, `CockpitPlatform.migrationParity`, …).

---

## Locked design decisions (frozen for this batch)

- **DL-1 — Ribbon is the persistent glance.** No new always-on strip; extend `PatientRibbon`. Each slot becomes a click target that opens fuller detail.
- **DL-2 — Reuse Snapshot's section components in the expand surface.** Do **not** re-implement allergy/condition/meds/vitals rendering or fetching. Mount the existing `AllergiesSection` / `ChronicConditionsSection` / `ProblemListSection` / `SnapshotVitalsSection` / `PreviousRxSection` (or `SnapshotPane` wholesale) inside the expand surface so **add/edit is preserved and there's one data path**.
- **DL-3 — History → summoned side sheet.** Reuse `SideSheetHost` / `useSideSheet` (the visit-detail sheet already does). The History *list* is opened on demand, not permanently mounted.
- **DL-4 — Expansion is an overlay, never inline growth.** The ribbon is a fixed 52px strip; expanding must use `Popover` (single-slot quick peek) or the side sheet (full chart), so the workspace never shifts mid-consult.
- **DL-5 — Allergies stays loudest even collapsed.** Keep the severity colouring; do not let added density bury it.
- **DL-6 — Click-to-open only. No hover-to-open.** Hover overlays are fragile (accidental trigger, mouse-out dismissal, bad on touch/tablet). Tooltips (hover) stay for micro-detail; opening the panel is a click/keyboard action.
- **DL-7 — Phase the tab retirement.** Phase 1 is purely additive (no tab removed). Retiring the `snapshot` / `history` tabs is Phase 2 and is the heavy, migration-touching part — gated separately (see Scope guard).

---

## ⚠️ Scope guard (read before Phase 2)

Per `.cursor/rules/00-agent-contract.mdc`: **STOP and flag** before doing Phase 2. Removing `snapshot` / `history` from `COCKPIT_TAB_ORDER` is a **5+ file refactor that also touches persisted user layouts** — the exact class of change the contract says not to expand into unasked. Phase 1 must ship and be verified on its own first. Do **not** start Phase 2 without an explicit go-ahead.

**Phase 1 DO NOT TOUCH:** any backend file, any migration, `cockpit-tabs.tsx`, `default-layouts.ts`, `blankLayout.ts`, the palette, persisted-layout code. Phase 1 is frontend-only, additive, **zero backend / zero migration / zero RLS**.

---

## Phase 1 — additive: ribbon expands, History summons (ship this first)

### Task RX-01 — "Open chart" expand from the ribbon ✅ shipped
Add a click affordance on the ribbon that opens the **full Snapshot chart** in the side sheet.
- Simplest faithful option: `useSideSheet().open({ id: 'patient-chart', title: 'Patient chart', content: <SnapshotPane appointment=… token=… hideHeader />, defaultWidth: 520 })`.
- Trigger: make the identity/allergy/chronic region (or a small chevron/expand button on the strip) the click target. Keyboard-accessible (`button`, Enter/Space), `aria-expanded`/`aria-haspopup="dialog"`.
- Because it mounts `SnapshotPane`, **add/edit affordances come for free** (DL-2) and there's a single data path.
- Files: `PatientRibbon.tsx` (add trigger + `useSideSheet`). No new fetch logic.

### Task RX-02 — Per-slot quick expand (popovers) ✅ shipped (allergies + meds)
For single-slot "just show me the detail" without opening the whole chart:
- **Allergies slot** click → `Popover` mounting `AllergiesSection` (`layout="in-call"`, `mode="default"`, wired `addOpen`) so an allergy can be logged inline.
- **Chronic slot** click → `Popover` mounting `ChronicConditionsSection`.
- **💊 meds slot** click → `Popover`/sheet mounting `PreviousRxSection` (`filter="most-recent-visit"`) to reveal med **names** (today it's only a count).
- Reuse the existing `Popover` pattern already in `PatientRibbon.tsx` (`OverflowPill`). Keep tooltips for hover micro-detail (DL-6).
- **Decision to confirm with product (see Open questions):** do we want per-slot popovers *and* a full-chart sheet, or just the one full-chart sheet from RX-01? Recommendation: full-chart sheet (RX-01) as the primary; add per-slot popovers only for allergies + meds where inline detail has the highest value.

### Task RX-03 — Add the two missing dimensions to the glance ⏭ deferred (optional; covered by RX-01 sheet)
The ribbon lacks two things Snapshot has:
- **Real vitals** (ribbon only shows weight inside identity) → add a compact vitals chip that expands to `SnapshotVitalsSection`.
- **Problem list** (ribbon shows none) → surface a count/chip that expands to `ProblemListSection`.
- If collapsed counts are wanted, extend `usePatientRibbonData` (add problem-list count / a compact vitals summary). Optional — the expanded sheet already shows both via `SnapshotPane`, so this is a nice-to-have, not required for Phase 1.

### Task RX-04 — History as a summoned sheet ✅ shipped
- Add a **History** trigger reachable from the ribbon or the tab toolbar that does `useSideSheet().open({ id: 'visit-history', title: 'Visit history', content: <HistoryPane appointment=… token=… hideHeader />, defaultWidth: 480 })`.
- `HistoryPane` already opens `VisitDetailSideSheet` on card click. Note the single-sheet semantics (`open` replaces): confirm the visit-detail sheet replacing the list sheet is acceptable UX, or add a back affordance. **Flag to product.**

### Task RX-05 — Phase 1 close gate ✅ unit tests green
- Manual smoke (light + dark, desktop): ribbon still reads as a safety glance; clicking opens chart/History in a sheet; allergy add still works from the expanded surface; allergies remain visually loud; Esc/backdrop/close dismiss; no layout shift of the workspace.
- Note the **mobile** story (ribbon is desktop-only; `CockpitMobileFallback` handles small screens) — Phase 1 does not change mobile; capture any gap.
- Run the verification gate (below).
- **Shipped 2026-07-16:** `PatientRibbon.tsx` expands via side sheet (chart / history) + popovers (allergies / meds). Tabs untouched (Phase 2 gated). `PatientRibbon.test.tsx` — 13 passed.

---

## Phase 2 — LOCKED (2026-07-16): retire Snapshot + History tabs via 2A → 2B

**Product lock:** Remove Snapshot / History from the canvas and palette (heart + clock). Ribbon is the only entry for chart + visit history. Implement as **2A then 2B** — do not hard-delete without a prune migration (layouts are linked).

### Phase 2A — demote out of defaults (safe first cut) ✅ folded into 2B
- Rebuilt all four trees without a left chart column (Consult/Review mid+right; Read assessment+S/O; Document assessment+S/O+plan).

### Phase 2B — remove from registry + palette (final) ✅ shipped 2026-07-16
- Removed `snapshot` / `history` from `COCKPIT_TAB_ORDER` and `buildCockpitTabs` (5 tabs: body, S, O, A, P).
- Kept `SnapshotPane` / `HistoryPane` — ribbon still mounts them in the side sheet.
- **Layout prune:** `prune-layout-leaves.ts` strips unknown ids, appends missing known as hidden, rebalances; wired into `useShellLayout` hydration + `useCockpitLayoutSwitcher.applySavedLayout`. Discard only when prune fails (zero overlap).
- Updated palette (automatic via panes prop), `isFullEightPaneRegistry` (tracks new count), and cockpit layout tests.

---

## Files in scope

**Phase 1 (edit):**
- `frontend/components/patient-profile/PatientRibbon.tsx` — slot click handlers, expand triggers, `useSideSheet` wiring, History trigger.
- `frontend/hooks/usePatientRibbonData.ts` — optional: problem-list count / compact vitals summary (only if RX-03 collapsed counts are wanted).

**Phase 1 (reuse, do not rewrite):** `SnapshotPane.tsx`, `HistoryPane.tsx`, `AllergiesSection.tsx`, `ChronicConditionsSection.tsx`, `ProblemListSection.tsx`, `SnapshotVitalsSection.tsx`, `PreviousRxSection.tsx`, `SideSheetHost.tsx` (`useSideSheet`).

**Phase 2 (only after approval):** `frontend/lib/patient-profile/v3/default-layouts.ts` (Option A), and — Option B only — `cockpit-tabs.tsx`, `blankLayout.ts`, palette, persisted-layout migration, associated tests.

---

## Open questions (resolve before / during build)

1. **Expand surface:** one full-chart **side sheet** (RX-01) as primary, or per-slot **popovers** (RX-02) too? (Recommendation: full-chart sheet + popovers for allergies & meds only.)
2. **History sheet vs list replacement:** single-sheet semantics mean opening a visit detail replaces the history list. Acceptable, or add a back button?
3. **Tab retirement:** demote-to-hidden (Option A) or hard-remove (Option B)? Default to A unless product wants the tabs gone.
4. **Mobile:** ribbon is desktop-only. What's the small-screen path for the glance + expand? (Out of scope for Phase 1; needs a decision before Phase 2.)
5. **Collapsed counts:** add problem-list count + vitals summary to the ribbon's collapsed state, or only show them inside the expanded sheet?

---

## Verification gate (before "done")

Per `DEFINITION_OF_DONE.md` / agent contract — run and pass, do not skip:
- `tsc` typecheck (frontend).
- Lint (fix anything introduced).
- Test suite — including the ribbon tests (`frontend/components/patient-profile/__tests__/PatientRibbon.test.tsx`) and any snapshot/side-sheet tests touched.
- Manual light+dark desktop smoke per RX-05.

**Zero backend, zero migration, zero RLS in Phase 1.**

---

## Ribbon rethink (2026-07-17) ✅ shipped (frontend slice)

Locked and implemented:
- **Drop identity** from the ribbon (age / sex / weight stay in the header beside the name).
- **💊 = active chart meds** — `patient_medications` where `status === "active"` and not archived (PMH condition meds + additional meds). Not last-visit Rx count.
- **Meds popover** lists those chart med names (not `PreviousRxSection`).

Deferred (not in this slice):
- Promote Rx lines with `duration_unit: "continue"` into `patient_medications` on send — needed so “still taking from last Rx” lands on the chart automatically. No duration-matching heuristic on the ribbon.
