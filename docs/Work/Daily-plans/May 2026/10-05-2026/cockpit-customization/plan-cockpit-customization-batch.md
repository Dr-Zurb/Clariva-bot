# Cockpit customization — 10 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Fresh chat per task, smallest model that can solve the problem, deterministic verifications. The structural slot-state refactor (cc-04) is the only Opus 4.7 task; everything else is Sonnet 4.6.

**Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-cockpit-customization.md`](./Tasks/EXECUTION-ORDER-cockpit-customization.md).

---

## Why this batch

The morning [`cockpit-shell-redesign`](../../09-05-2026/cockpit-shell-redesign/plan-cockpit-shell-redesign-batch.md) batch (yesterday) shipped the fixed-height + per-column-scroll + drag-resizable shell. When the user retested:

1. **The chart-rail collapse chevron sits visually adrift from the column content** ("the arrow is way out, theres a empty space between the border and other things"). cs-05 hoisted the chevron into the rail's own in-flow `<header>`; the resize handle's gutter + the chart panel's internal padding combine to make the chevron look stranded between two regions.
2. **The "Patient chart" heading renders twice** — once in the cs-05 rail header, once inside `<PatientChartPanel>` itself. Pre-cs-05 the panel's own `<h2>` was the canonical heading; cs-05 added a sibling `<h3>` without removing it.
3. **The body and Rx columns have no header strip** — only the chart rail does. Visually inconsistent and means the body / Rx columns can't host the drag handle / collapse chevron pattern that needs to land for reorder.
4. **The collapsed-rail stub is too cramped** — 60px wide with vertical-rotated text. Doctors read it as "the rail vanished" rather than "the rail is collapsed and clickable".
5. **The shell is fixed-position** — chart on left, body in middle, Rx on right. The user explicitly asked: "any column can have space left right or middle". Chart-handed users, RTL users, and doctors who want the Rx in the middle while typing all need the columns to be reorderable.
6. **No saved layouts** — drag-resizing back to a useful split for every patient is friction. Doctors want named templates: "Triage", "Consult", "Document", plus their own custom presets, recallable in one click.

This batch addresses all six in **14 tasks across 5 phases**, runs as up to 2 parallel-chat lanes per phase, and ships **one new migration** (`099_doctor_cockpit_layout_presets.sql`).

---

## Decision lock (locked 2026-05-10, copied here for stability)

The following decisions are **frozen** for the duration of this batch. Re-opening them requires a new batch.

- **CC-D1: Slot-state primitive — `cockpit-layout`.** The cockpit shell renders columns from a single `cockpit-layout` state object: `{ slots: ['chart', 'body', 'rx'], widths: [26, 48, 26], collapsed: { chart: false, rx: false } }`. The `slots` array is a 3-tuple over the column-type union `'chart' | 'body' | 'rx'`; rendering iterates the array and looks up the renderer for each column type. **All six permutations** of the three column types are supported. The hardcoded JSX positions in `<ConsultationCockpit>` (cs-08) become a layout-driven `Array.map` over `slots`. cc-04 introduces this state and its persistence layer; cc-05 / cc-06 / cc-07 / cc-10 all consume it.

- **CC-D2: Slot-based collapsibility — middle slot is always-on, side slots are collapsible.** The collapsibility rule is tied to the *slot position*, not the column type. Whichever column happens to be in `slots[1]` (the middle) is non-collapsible — its `<ResizablePanel>` is rendered without `collapsible={true}`. Both side columns are `collapsible` with `collapsedSize={7}` (≈88px, see CC-D6). Reordering the slots therefore reorders which columns can be collapsed; for example, putting `body` on the left and `chart` in the middle would make `body` collapsible and `chart` always-on. This is the doctor's choice — they're explicitly opting into "I want this column central".

- **CC-D3: Reorder UX — both drag and dropdown menu.** Two surfaces write to the same `cockpit-layout.slots` state:
  - **Drag-to-reorder.** Each column header (cc-02) hosts a small drag handle (`⋮⋮` grip icon). Dragging a header onto another column's header swaps their slots. Built on `@dnd-kit/core` (already a transitive dep via shadcn but installed explicitly in cc-07; ~9KB gz).
  - **Dropdown menu.** A "Layout" button in the cockpit header opens a dropdown listing the six permutations as one-click items, the three built-in presets, and the custom presets. The menu is the discoverability surface and the keyboard-accessible fallback for users who can't drag.
  Both surfaces are wired through cc-06 (menu) + cc-07 (drag). They share the same setter on `cockpit-layout`.

- **CC-D4: Layout presets — backend-synced, soft cap of 5 custom presets, full snapshot.** Built-in presets (`Triage`, `Consult`, `Document`) are hardcoded in the frontend (`lib/cockpit-presets/built-in.ts`) and never sync. Custom user presets are stored in a new column `doctor_settings.cockpit_layout_presets JSONB NOT NULL DEFAULT '[]'` (migration cc-08). Each preset row is a complete `cockpit-layout` snapshot — `{ id, name, slots, widths, collapsed, createdAt }`. Soft cap of 5: when a doctor saves a 6th, the UI confirms eviction of the oldest custom preset (`createdAt` ascending). Backend defends with a hard cap that rejects the 6th save with 400 if the client lies about the eviction confirm.

- **CC-D5: Built-in preset hotkeys.** `Cmd/Ctrl+Shift+1` → Triage, `Cmd/Ctrl+Shift+2` → Consult, `Cmd/Ctrl+Shift+3` → Document. (Used `Shift` to avoid conflict with browser tab-switch shortcuts on most browsers.) Custom presets accessible via the menu only — no hotkeys (avoids the binding-creep problem; the menu is fast enough). Wired through `useCockpitHotkeys` (extends the existing hook).

- **CC-D6: Collapsed-rail stub redesign — wider + per-column-type renderers.** Bump `collapsedSize` from `5` to `7` (≈88px on 1280px viewport). The `<RailCollapsedStub>` component (cs-08) is refactored into a wrapper that accepts a `renderer` prop. Two concrete renderers ship:
  - `CollapsedChartRail` (cc-13) — vertical stack of section-icon chips: 🩹 Allergies · ⚠️ Conditions · ❤️ Vitals · 📋 Problems · 📝 History · 💊 Previous Rx. Click an icon → expand the rail AND scroll to that section (requires PatientChartPanel section anchor ids).
  - `CollapsedRxRail` (cc-14) — peek-text strip: "3 medicines · 1 test · diagnosis pending". Click anywhere → expand. Reads from RxWorkspace state (already in scope).
  The body column is never collapsed (CC-D2), so no body renderer is needed.

- **CC-D7: Body column header — static "Consultation".** No state chip, no derived label. The body content already shows the cockpit state via `<ReadyCard>` / `<EndedCard>` / `<ConsultationLauncher>`'s own headers; the body column header just identifies the column itself.

- **CC-D8: Patient chart heading deduplication — drop the panel's own `<h2>` in desktop.** `<PatientChartPanel>` (`frontend/components/ehr/PatientChartPanel.tsx`) currently renders its own `<header><h2>Patient chart</h2></header>` block at the top. cc-01 gates this header on `layout !== "desktop"` so the rail-hosted desktop usage shows the column-header heading exactly once. Mobile bottom-sheet (`layout === "mobile"`) and any standalone usage keep the panel's heading.

- **CC-D9: Last-write-wins multi-device sync semantics.** Preset CRUD is straightforward — no realtime sync, no collaborative editing. Doctor opens cockpit on device A, edits a preset on device B → device A still shows the stale preset until next reload (or until device A explicitly saves, which would overwrite device B's edit). Acceptable: presets are doctor-personal config, not shared state, and edit frequency is low.

- **CC-D10: Wave 3 (cc-04 → cc-07) is the structural bottleneck.** The slot-state primitive is a hard prerequisite for both Wave 4 (presets need to read/write the layout) and Wave 5 (collapsed-stub renderer is per-column-type, which only makes sense once the renderer dispatches by column type). Waves 1 + 2 can ship before Wave 3 because they're orthogonal cosmetic / structural-prep work; Waves 4 + 5 cannot.

Decisions explicitly **not** in scope for this batch (deferred):

- **Mobile / tablet shell reorder.** Mobile uses `MobilePillBar` + page-scroll; reorder is a desktop-only feature. Same pattern as cs-07.
- **Vertical resize / row-level layout.** Only column-level reorder + resize. No "stack chart on top of body" mode.
- **Cross-doctor preset sharing.** Presets are doctor-private. No marketplace, no clinic-wide templates. If clinics want shared layouts, that's a separate batch with a new `clinic_cockpit_layout_presets` table.
- **Realtime preset sync via Supabase Realtime.** CC-D9 above; not worth the wiring for low-frequency edits.
- **Saved-layout history / undo.** A doctor accidentally saves a bad layout → they can re-save the right one. Soft cap of 5 keeps the menu sane; no undo stack.

---

## Phases

### Phase A — Polish (1 task, ~30min, 1 lane)

A pure cosmetic bug fix. Ships independently of everything else.

- [`task-cc-01-drop-duplicate-patient-chart-heading.md`](./Tasks/task-cc-01-drop-duplicate-patient-chart-heading.md) — XS — Gate `<PatientChartPanel>`'s own `<h2>Patient chart</h2>` on `layout !== "desktop"`. Eliminates the double-heading the user flagged.

### Phase B — Uniform column headers (2 tasks, ~3h, 1 lane sequential)

Lifts the cs-05 chart-rail header pattern out into a shared component, then mounts it on the body and Rx columns. After Phase B all three columns have the same header strip — title, future drag handle slot (cc-07), future collapse chevron slot (cc-05).

- [`task-cc-02-cockpit-column-header-component.md`](./Tasks/task-cc-02-cockpit-column-header-component.md) — S — New `<CockpitColumnHeader>` component (`frontend/components/consultation/cockpit/CockpitColumnHeader.tsx`) with slots for `<title>`, `<actions>` (collapse chevron + future drag handle). Refactor `<AppointmentChartRail>` to use it (replaces cs-05's bespoke header).
- [`task-cc-03-mount-headers-on-body-and-rx.md`](./Tasks/task-cc-03-mount-headers-on-body-and-rx.md) — S — Mount `<CockpitColumnHeader>` on the body column ("Consultation" — CC-D7) and the Rx column ("Prescription"). Hosted in `<ConsultationCockpit>`'s panel children, not deep inside `<RxWorkspace>` / `CenterPane`.

### Phase C — Slot-state primitive + reorder (4 tasks, ~6h, 1 lane sequential)

The structural rewrite. cc-04 introduces the slot-state primitive that everything downstream consumes; cc-05 wires the slot-based collapsibility rule; cc-06 / cc-07 wire the two reorder surfaces.

- [`task-cc-04-cockpit-layout-slot-state.md`](./Tasks/task-cc-04-cockpit-layout-slot-state.md) — **L** — **Opus 4.7 Thinking-XHigh.** Introduce `cockpit-layout` state (slots / widths / collapsed). Refactor `<ConsultationCockpit>`'s hardcoded chart/body/Rx panel JSX into an `Array.map` over `slots`. Persist alongside the existing `react-resizable-panels:cockpit-shell` layout key. **Pre-load aggressively** — see cc-04's `Pre-load list` section. The structural blast radius is comparable to cs-07.
- [`task-cc-05-slot-based-collapsibility.md`](./Tasks/task-cc-05-slot-based-collapsibility.md) — S — Apply CC-D2: middle-slot column gets `collapsible={false}`; side-slot columns get `collapsible={true}`. The hotkey bindings (`[` for left rail, `]` for right rail) keep working — they target the slot, not the column-type.
- [`task-cc-06-layout-dropdown-menu.md`](./Tasks/task-cc-06-layout-dropdown-menu.md) — S — "Layout" button in `<CockpitHeader>` opens a `<DropdownMenu>` with the three built-in presets, the six column-order permutations as quick items, and a divider before custom presets (filled in by cc-10).
- [`task-cc-07-drag-to-reorder-columns.md`](./Tasks/task-cc-07-drag-to-reorder-columns.md) — M — Add `@dnd-kit/core` dep. Each `<CockpitColumnHeader>` gets a `⋮⋮` grip icon that's the drag source. Dropping one header onto another swaps their slots. Wire to the same `cockpit-layout` setter cc-04 introduced.

### Phase D — Layout presets (4 tasks, ~6h, 2 lanes parallel after D1)

Backend (D1 + D2) and frontend (D3 + D4) are mostly independent once the migration shape is locked. D1 is the synchronization point.

- [`task-cc-08-presets-migration.md`](./Tasks/task-cc-08-presets-migration.md) — XS — Migration `099_doctor_cockpit_layout_presets.sql`: add `cockpit_layout_presets JSONB NOT NULL DEFAULT '[]'` to `doctor_settings`. CHECK constraint enforces the 5-preset hard cap.
- [`task-cc-09-presets-backend-service-endpoints.md`](./Tasks/task-cc-09-presets-backend-service-endpoints.md) — S — Backend service + endpoints (`GET / PUT / DELETE /v1/settings/doctor/cockpit-presets`). Auth-scoped to the calling doctor; rejects oversized payloads (>50 KB), invalid slot tuples, and saves that would breach the 5-cap.
- [`task-cc-10-presets-frontend-hook-and-ui.md`](./Tasks/task-cc-10-presets-frontend-hook-and-ui.md) — M — `usePresets()` hook (load on mount, refetch after save). Cockpit-header preset section in the cc-06 dropdown — built-ins always, custom below. "Save current layout..." dialog (name + soft-cap eviction confirm). "Manage presets" modal (rename / delete).
- [`task-cc-11-presets-built-in-hotkeys.md`](./Tasks/task-cc-11-presets-built-in-hotkeys.md) — XS — Extend `useCockpitHotkeys` with `Cmd/Ctrl+Shift+1/2/3` → apply built-in preset. No hotkey for custom presets (CC-D5).

### Phase E — Collapsed-stub redesign (3 tasks, ~3h, 2 lanes parallel)

The collapsed rail stops being a void; it becomes column-type-aware navigation / summary.

- [`task-cc-12-rail-collapsed-stub-renderer-refactor.md`](./Tasks/task-cc-12-rail-collapsed-stub-renderer-refactor.md) — S — Refactor `<RailCollapsedStub>` from a single template into a wrapper that takes a `renderer` prop. Bump `collapsedSize` from 5 → 7 in `<ConsultationCockpit>`. Backwards-compatible default renderer kept for any non-cockpit callers.
- [`task-cc-13-collapsed-chart-section-icons.md`](./Tasks/task-cc-13-collapsed-chart-section-icons.md) — M — `CollapsedChartRail` renderer: vertical stack of section-icon buttons (Allergies / Conditions / Vitals / Problems / History / Previous Rx). Each button expands the rail AND scrolls to that section. Requires PatientChartPanel sections to expose stable `id` anchors (small lift in this same task).
- [`task-cc-14-collapsed-rx-peek-strip.md`](./Tasks/task-cc-14-collapsed-rx-peek-strip.md) — S — `CollapsedRxRail` renderer: peek-text strip showing the live Rx state ("3 medicines · 1 test · diagnosis: pending"). Click anywhere expands. Reads from the same `RxWorkspace` form state already in scope.

---

## Cross-cutting acceptance gate (whole batch)

Before declaring this batch shipped, all of the following must be true:

- [ ] **No double "Patient chart" heading anywhere on the cockpit.** Verified on a desktop viewport (≥1024px) for an appointment in `ready`, `lobby`, `live`, `ended` states.
- [ ] **All three desktop columns have a visible header strip** with consistent styling (chart / "Consultation" / "Prescription").
- [ ] **All six column permutations render correctly.** Manually walk through each via the Layout dropdown: `chart-body-rx`, `chart-rx-body`, `body-chart-rx`, `body-rx-chart`, `rx-chart-body`, `rx-body-chart`. No layout overlap, no z-fighting, no missing column.
- [ ] **Slot-based collapsibility works regardless of slot occupant.** Put `body` in the left slot via reorder → confirm `body` is now collapsible (and the chart-or-Rx in the middle is not). Hotkeys `[` / `]` collapse left/right side slots respectively.
- [ ] **Drag-to-reorder works** — drag the chart header onto the Rx header → they swap. Drop on the body header → swap chart with body. Both work.
- [ ] **Three built-in presets work via menu and via `Cmd/Ctrl+Shift+1/2/3`.** Apply Triage → equal-ish three columns. Consult → wide body, slim Rx, chart collapsed. Document → wide Rx, slim body, chart collapsed.
- [ ] **Custom presets persist across browsers** — save a custom preset on Firefox, reload Chrome, the preset shows up in the menu. Apply it → restores the saved layout.
- [ ] **Soft cap of 5 enforces.** Save 5 custom presets → save attempt #6 prompts the doctor to evict the oldest (with name shown). Cancel → no save. Confirm → 6th saves, oldest is gone.
- [ ] **Backend hard cap defends.** A test that POSTs a 6th preset *without* the client-side eviction returns 400 (Conflict acceptable too).
- [ ] **Collapsed chart rail shows section-icon stack** and clicking each icon expands the rail AND scrolls to the section.
- [ ] **Collapsed Rx rail shows peek text** that updates as the doctor types into the Rx form. Click expands.
- [ ] **No regression on yesterday's batch.** `cs-NN` tests stay green. The cockpit shell still ships drag-resize + per-column scroll + auto-save layout.
- [ ] **`<lg` mobile / tablet view byte-identical to before this batch.** Reorder / presets / collapsed-stub redesign are desktop-only (lg+) features.

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| `cc-04` slot-state refactor breaks one of the six permutations | H | Per-permutation visual smoke test in cc-04's acceptance criteria. Snapshot tests in `__tests__/ConsultationCockpit.shell.test.tsx` updated to render each permutation. |
| `react-resizable-panels` `<ResizablePanelGroup>` doesn't tolerate dynamic panel keys (cc-04 maps over `slots` and assigns `key={slotId}`) | M | Library docs confirm dynamic children with stable keys work; `key=` is the column-type ('chart'/'body'/'rx') not the slot index, so swap renders new positions for the same panel ids. cc-04 includes a smoke test that mounts each permutation. |
| `@dnd-kit/core` SSR / Next.js hydration warnings | L | Library is Next-friendly; wrap the drag wrapper in `'use client'`. cc-07 verifies no `pnpm dev` console warnings. |
| Doctor accidentally evicts a useful custom preset | M | Eviction confirm dialog names the preset being evicted; soft cap warning appears at 5. No undo (CC-D9 deferred). |
| Backend `cockpit_layout_presets` JSONB grows unbounded if the cap is bypassed | M | DB-side CHECK constraint `jsonb_array_length(cockpit_layout_presets) <= 5` (cc-08). Hard wall. |
| Built-in preset hotkeys collide with browser shortcuts | L | `Cmd/Ctrl+Shift+1/2/3` chosen because `Cmd+1/2/3` on most browsers switches tabs. cc-11 verifies on Chrome / Firefox / Safari. |
| Drag-to-reorder confuses with drag-to-resize on the resize handles | M | `@dnd-kit/core` activation distance set to 8px so a click on the header doesn't accidentally start a drag; resize handles are visually distinct (vertical bar between columns) and use the library's own pointer handler. |
| Collapsed chart-rail icons get clipped on tall viewports | L | Stack uses `min-h-0 flex-1 overflow-y-auto`; if 6 icons + label overflow at very small heights, collapsed rail scrolls. cc-13 acceptance includes 768px-tall viewport check. |

---

## Cost estimate

Expected model-mix per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Phase | Tasks | Sonnet 4.6 Medium | Opus 4.7 Thinking-XHigh | Tokens (rough) |
|---|---|---|---|---|
| Phase A | cc-01 | 1/1 | 0/1 | ~5k in / ~7k out |
| Phase B | cc-02 → cc-03 | 2/2 | 0/2 | ~25k in / ~30k out |
| Phase C | cc-04 → cc-07 | 3/4 | 1/4 (cc-04) | ~90k in / ~140k out |
| Phase D | cc-08 → cc-11 | 4/4 | 0/4 | ~45k in / ~55k out |
| Phase E | cc-12 → cc-14 | 3/3 | 0/3 | ~25k in / ~35k out |
| **Total** | **14** | **13** | **1** | **~190k in / ~270k out** |

Comparable to `cockpit-shell-redesign` (which ran 2 Opus tasks); cc-04 is the only place the structural reasoning warrants Opus.

---

## References

- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules
- Style precedent: [`cockpit-shell-redesign/plan-cockpit-shell-redesign-batch.md`](../../09-05-2026/cockpit-shell-redesign/plan-cockpit-shell-redesign-batch.md) — sibling batch from yesterday whose shell this batch customizes
- Cross-day predecessors:
  - [Daily-plans/May 2026/06-05-2026/plan-cockpit-redesign-batch.md](../../06-05-2026/plan-cockpit-redesign-batch.md) — original cockpit redesign that introduced the state machine + sticky shell.
  - [Daily-plans/May 2026/09-05-2026/cockpit-polish/plan-cockpit-polish-batch.md](../../09-05-2026/cockpit-polish/plan-cockpit-polish-batch.md) — morning polish batch on 09-05-2026.
  - [Daily-plans/May 2026/09-05-2026/cockpit-shell-redesign/plan-cockpit-shell-redesign-batch.md](../../09-05-2026/cockpit-shell-redesign/plan-cockpit-shell-redesign-batch.md) — afternoon structural batch this batch customizes.

---

**Status:** `Drafted` 2026-05-10. **Owner:** TBD.
