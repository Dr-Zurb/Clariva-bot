# Cockpit pane freedom — Phase 3 (customize mode) execution order — 30 May 2026 batch

> **Sibling plan doc:** [`../plan-p3-cockpit-pane-freedom-customize-batch.md`](../plan-p3-cockpit-pane-freedom-customize-batch.md). The plan answers "what + why" + how Phase 3 sits in the four-phase vision; this doc answers "who-runs-what-when" + which model.
>
> **Authoring conventions:** [`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`](../../../../../EXECUTION-ORDER-GUIDELINES.md). Biased to single sequential lanes — the whole batch concentrates on the customize-mode / preset surface + `PatientProfilePage`, so there is no honest second lane.
>
> **Cost-aware model strategy:** [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR: zero Opus build tasks, no close-gate; four Auto (cpfc-01..04) + one Composer 2 Fast (cpfc-05).
>
> **⚠️ Blocked on Phase 2.** This batch gates the drag affordances built in [p2-cockpit-pane-freedom-dnd](../../p2-dnd/) (cpfd-01..05). **Do not start until Phase 2 is merged to `main`.**
>
> **Phase scope:** This doc covers **Phase 3 only**. Phase 1 shipped (cpf-01..06); Phase 2 is planned (cpfd-01..05). Phase 4 (chrome lift) is outlined in the [Phase 1 plan](../../p1-tabs/plan-p1-cockpit-pane-freedom-batch.md) and becomes its own batch.

---

## Wave plan (3 waves)

```
Wave 1 (Customize-mode state + toggle + Shell gating — ~3-4h, single lane sequential):
  Lane α  ──── cpfc-01 (M, Auto)

Wave 2 (Customize bar + preset CRUD + cramped warning — ~5-7h, single lane sequential):
  Lane α  ──── cpfc-02 (S, Auto) ──> cpfc-03 (M, Auto) ──> cpfc-04 (S, Auto)

Wave 3 (Verify + docs + telemetry confirm — ~1-2h, single lane sequential):
  Lane α  ──── cpfc-05 (XS, Composer 2 Fast)
```

**Total wall-clock with parallelism:** ~9-13h (no parallelism — single lane throughout).
**Total agent-time (sequential equivalent):** ~9-13h.

The bottleneck is **Wave 2 — single-lane sequential** because every task touches the customize/preset surface (`<CustomizeBar>`, `<PresetPicker>`, `useLayoutTreePresets`) and `PatientProfilePage.tsx` (new handlers + extended `layoutTreeUx`). `cpfc-03` (preset rename/delete across API + hook + picker) is the highest-cost task in the batch.

---

## Lane-by-lane details

### Wave 1 — Customize-mode state + toggle + Shell gating (single lane sequential)

**Goal:** Introduce `customizeMode` (page state, default off), the header toggle button, the `Cmd+Shift+L` hotkey, and the gate that turns Phase 2's drag affordances on/off.

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [cpfc-01](./task-cpfc-01-customize-mode-state-and-toggle.md) | M | Auto | `PatientProfilePage.tsx`, `PatientProfileHeader.tsx`, `useShellHotkeys.ts`, `Shell.tsx` (Phase 2 drag sources), `telemetry.ts` | Add page state + toggle button + hotkey branch + thread `customizeMode` to gate the grip / tab `useDraggable` + the `<PaneDropOverlay>` mount. One telemetry event. |

**Acceptance gate (Wave 1 close):**

- [ ] `customizeMode` page state, default `false`, resets to `false` on mount / appointment change (P3-DL-2).
- [ ] Header "Customize" toggle button renders in the right cluster with an active/pressed state + `Cmd+Shift+L` hint.
- [ ] `Cmd/Ctrl+Shift+L` toggles the mode via `useShellHotkeys`, behind the editable-element guard, no binding collision.
- [ ] `customizeMode` gates the grip + tab drag sources (`disabled: !customizeMode || <existing guard>`) and the overlay mount.
- [ ] At rest (mode off): zero diff from Phase 2 at rest. Mode on: grips + tabs draggable, overlay arms on drag.
- [ ] `<MobileShell>` ignores the mode entirely (DL-7).
- [ ] `cockpit_pane_freedom.customize_toggled` `{ enabled, source }` fires on every toggle.
- [ ] `cd frontend; npx tsc --noEmit` + `npm test hooks/__tests__/useShellHotkeys.test.ts` clean.

### Wave 2 — Customize bar + preset CRUD + cramped warning (single lane sequential)

**Goal:** Build the customize bar (save + reset), wire preset rename/delete end-to-end, and add the cramped-layout nudge + shape telemetry.

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [cpfc-02](./task-cpfc-02-save-as-preset-bar.md) | S | Auto | cpfc-01's `customizeMode`, `PresetPicker.tsx` (save flow reference), `PatientProfilePage.tsx` (`handleSaveLayoutTreePreset`, `selectedTemplateId`, `BUILT_IN_PRESETS`) | New file `CustomizeBar.tsx`. Save-as-preset (inline name input) + always-reachable Reset-to-default. Mounts below the header in customize mode. |
| 1 | [cpfc-03](./task-cpfc-03-preset-rename-delete.md) | M | Auto | `cockpit-layout-presets-tree.ts`, `useLayoutTreePresets.ts`, `PresetPicker.tsx`, `PatientProfilePage.tsx` | Add `renamePreset` (read-modify-write PUT) + surface `deletePreset`; extend the hook; add rename/delete affordances to "My presets" rows, gated on customize mode. One telemetry event. |
| 2 | [cpfc-04](./task-cpfc-04-cramped-layout-warning.md) | S | Auto | cpfc-02's `<CustomizeBar>`, `layout-tree.ts`, `telemetry.ts`, `PatientProfilePage.tsx` | Pure shape helper in `layout-tree.ts` + dismissible cramped nudge in the bar + `layout_shape` telemetry on customize-off. |

**Acceptance gate (Wave 2 close):**

- [ ] All Wave 1 gates still green.
- [ ] `<CustomizeBar>` renders only in customize mode; offers Save-as-preset (cap-aware) + always-visible Reset-to-default (P3-DL-5).
- [ ] `renamePreset` lands in the API client (read-modify-write PUT, P3-DL-4); `useLayoutTreePresets` exposes `deletePreset` + `renamePreset` (each refreshes).
- [ ] `<PresetPicker>` "My presets" rows show rename + delete **only** in customize mode; at rest the rows are unchanged.
- [ ] Deleting the active preset doesn't crash the picker; rename enforces the same name constraints as save.
- [ ] Cramped nudge appears when the root has > 5 horizontal siblings (P3-DL-6); dismissible per-session; never blocks.
- [ ] `cockpit_pane_freedom.preset_crud` `{ op, presetCount }` and `cockpit_pane_freedom.layout_shape` `{ leafCount, tabContainers, maxRootSiblings }` fire per spec.
- [ ] Save → refresh persists; rename / delete reflect immediately + after refresh; reset works at the cap.
- [ ] Integration smoke (toggle on → save → rename → delete → reset → build cramped row → toggle off) passes manually.

### Wave 3 — Verify + docs + telemetry confirm (single lane sequential)

**Goal:** Cross-cutting gate, the three telemetry events, COCKPIT.md §13, capture follow-ups for Phase 4 + polish.

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [cpfc-05](./task-cpfc-05-verification-and-close-out.md) | XS | Composer 2 Fast | `COCKPIT.md` §12, `docs/Work/capture/inbox.md`, the smoke matrix in this doc | Docs + smoke + telemetry confirm. No production logic changes. |

**Acceptance gate (Wave 3 close):**

- [ ] All Wave 2 gates still green.
- [ ] All cross-cutting gates from [`plan-p3-cockpit-pane-freedom-customize-batch.md` §"Cross-cutting acceptance gate"](../plan-p3-cockpit-pane-freedom-customize-batch.md#cross-cutting-acceptance-gate-whole-batch) pass.
- [ ] The three telemetry events fire per spec (`customize_toggled`, `preset_crud`, `layout_shape`); none fire spuriously.
- [ ] `docs/Reference/product/cockpit/COCKPIT.md` has a new "Customize mode + preset management (Phase 3)" sub-section after §12.
- [ ] `docs/Work/capture/inbox.md` has 4-6 new follow-up lines (Phase 4 + polish).
- [ ] `cd frontend; npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] **No source plan update** — the pane-freedom phases are self-sourcing.

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| cpfc-01 | M | Auto | Page UI state + one hotkey branch + a prop-threaded gate on existing drag sources. Touches several files but each edit is mechanical. |
| cpfc-02 | S | Auto | New presentational bar reusing existing save/reset handlers; mirrors the `<PresetPicker>` save popover. |
| cpfc-03 | M | Auto | Preset CRUD across API client + hook + picker. The batch's heaviest task but bounded — reuses shipped endpoints (PUT/DELETE). |
| cpfc-04 | S | Auto | Pure shape helper + a dismissible banner in the bar + one telemetry event. |
| cpfc-05 | XS | Composer 2 Fast | Docs + smoke + telemetry confirm; no judgement-heavy code. |

**Caps check:** zero Opus build tasks (≤1/wave, ≤2/batch satisfied trivially). **No optional close-gate** — no mutation primitive or persisted-shape change this batch (contrast Phase 1/2, where a tree mutation justified one).

---

## Critical path

`cpfc-01 → cpfc-02 → cpfc-03 → cpfc-04 → cpfc-05`. Fully sequential. Single-engineer wall-clock ~9-13h. No parallelism credit — every Wave 2 task touches the customize/preset surface and `PatientProfilePage.tsx`, and each builds on the previous (cpfc-04 mounts into cpfc-02's bar; cpfc-03 shares cpfc-02's `layoutTreeUx` extension).

---

## Anti-goals

- ❌ Don't start before Phase 2 (cpfd-01..05) is merged — there are no drag affordances to gate otherwise.
- ❌ Don't persist customize mode — it's ephemeral page state (P3-DL-2).
- ❌ Don't add a new endpoint or migration for rename — read-modify-write through the existing full-array `PUT` (P3-DL-4).
- ❌ Don't raise `MAX_PRESETS` (5) — product decision, unchanged.
- ❌ Don't gate the context-menu "Move pane to…" path behind customize mode — it stays always-available (P2-DL-5).
- ❌ Don't make the cramped warning a hard block — it's a soft, dismissible nudge (P3-DL-6).
- ❌ Don't render the toggle / bar / DnD on `<MobileShell>` — DL-7.
- ❌ Don't let `body` drag during a live consult even in customize mode — DL-8.
- ❌ Don't ship a keyboard DnD sensor or per-preset hotkeys — captured as follow-ups.

---

## Notes for the executor

- **Branch off `main` (with Phase 2 merged) for Wave 1.** cpfc-01 touches `PatientProfilePage.tsx`, `PatientProfileHeader.tsx`, `useShellHotkeys.ts`, `Shell.tsx`, `telemetry.ts`.
- **Wave 1 → Wave 2 is a Cut 1 (dependency cliff).** Without `customizeMode` + its prop thread, the bar / CRUD affordances / cramped nudge have no mode to live in.
- **cpfc-01 is the load-bearing bit but NOT a corruption surface.** It adds no mutation; the risk is purely "is the gate threaded everywhere a drag source lives" — verify the grip AND the tabs AND the overlay all read the same `customizeMode`.
- **Reuse, don't reinvent.** Save uses the existing `handleSaveLayoutTreePreset` / `layoutTreePresets.savePreset`. Reset mirrors `handleResetLayoutTreePreset` (resolve `BUILT_IN_PRESETS` by `selectedTemplateId`). Delete uses the shipped `deletePreset` client fn + backend route.
- **Rename is a read-modify-write.** There is no PATCH. `renamePreset` lists, mutates the one row's name, and `PUT`s the full array back. Call `refresh()` immediately before the write if you want to minimise clobbering a concurrent edit (single-doctor surface — low risk, but note it).
- **Telemetry pattern from cpf-05 / cpfd-03.** Three events: `customize_toggled` (per toggle), `preset_crud` (per rename/delete), `layout_shape` (once, on customize-off). Don't fire `layout_shape` on every drop.
- **The cramped threshold is DL-3.1: > 5 horizontal siblings at the ROOT split.** Not nested splits — only the outermost row.

---

## References

- [`../plan-p3-cockpit-pane-freedom-customize-batch.md`](../plan-p3-cockpit-pane-freedom-customize-batch.md) — Phase 3 plan (what + why + decision lock).
- [Phase 2 batch](../../p2-dnd/) — the drag affordances this batch gates.
- [Phase 1 batch](../../p1-tabs/) — the foundation (schema + ops + renderer + context-menu workflow).
- [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../EXECUTION-ORDER-GUIDELINES.md) — wave / lane shape rules.
- [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
- Sibling exec-order (prior phase): [Phase 2 EXECUTION-ORDER](../../p2-dnd/Tasks/EXECUTION-ORDER-p2-cockpit-pane-freedom-dnd.md).
