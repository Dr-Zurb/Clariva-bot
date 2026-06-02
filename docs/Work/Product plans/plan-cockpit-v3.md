# Cockpit v3 — product plan

## Make the cockpit feel like Cursor's editor groups — grab any pane, drop it anywhere, split or tab it, with no "modes" and no fixed structure

> **Source thread:** 2026-05-30 chat. The doctor looked at the shipped pane-freedom cockpit and said the interaction was wrong: *"I don't like the ideology of activating a mode to make the tabs movable… I like how Cursor does it… it's a whole new architecture, I think it's better to write it from empty space than to fix the current."*
>
> **Relationship to predecessors (do not re-litigate):**
> - [`archive/plan-cockpit-v2.md`](./archive/plan-cockpit-v2.md) — Cockpit v2 (nested 8-pane tree + modality templates + distributed Rx form) is **shipped and load-bearing**. v3 keeps everything v2 built *below* the shell (the `PaneDefinition` contract, all pane bodies, the distributed `RxFormContext`, the SOAP schema). v3 only replaces the **shell + interaction + initial-state** layers.
> - [`plan-patient-profile-shell-rebuild.md`](./plan-patient-profile-shell-rebuild.md) — ppr's flat 3-column shell; v2 made it a tree; v3 makes the tree directly manipulable like an editor.
> - **Cockpit pane-freedom program (Phases 1–4, shipped 2026-05-28→30)** — Phase 1 tabs foundation ([cockpit-pane-freedom](../Daily-plans/May%202026/30-05-2026/cockpit-pane-freedom/p1-tabs/)), Phase 2 drag-drop 5-zone ([p2-cockpit-pane-freedom-dnd](../Daily-plans/May%202026/30-05-2026/cockpit-pane-freedom/p2-dnd/)), Phase 3 customize mode + presets ([p3-cockpit-pane-freedom-customize](../Daily-plans/May%202026/30-05-2026/cockpit-pane-freedom/p3-customize/)), Phase 4 chrome lift ([p4-cockpit-pane-freedom-chrome](../Daily-plans/May%202026/30-05-2026/cockpit-pane-freedom/p4-chrome/)). **v3 supersedes the pane-freedom *interaction layer*** (customize mode, the 5-zone overlay) but **inherits its model and mutation engine wholesale** (see v3-DL-1). The program is not deleted; it is the foundation v3 stands on.
>
> **Canonical reference:** [`docs/Reference/product/cockpit/COCKPIT.md`](../../Reference/product/cockpit/COCKPIT.md) is the live single source of truth for cockpit behaviour and will be updated at v3 cutover.
>
> **Status:** **Shipped** (2026-06-02) — Phases 0–5 + Phase 4 cutover complete (`cv3x-03` deletion, `cv3x-04` docs). v3 is the only live cockpit on `/dashboard/appointments/[id]`.
>
> **Status legend:** `Drafted` → `Selected` → `Committed` → `Shipped` / `Deferred` / `Killed`.

---

## North star

> The doctor opens a patient and arranges their workspace the way they arrange editor tabs in Cursor — grab a pane by its tab, drop it where they want, drop on an edge to split into a new column or row, drop on a tab bar to stack it as a tab. No "customize" button to press first. No five dashed boxes. The arrangement they build is theirs, and it's there next time.

After this plan ships:

1. **Every pane is a tab in an editor group.** There is no "leaf pane" vs "tab container" distinction in the doctor's mental model — a single pane is just a group with one tab. Snapshot, History, Subjective, Objective, Assessment, Plan, Investigations, and the Consultation/Body pane are all peers; none is special.
2. **Dragging is always on.** Grab any tab and move it. No mode to toggle, no `⌘⇧L`. The "Customize layout" concept is deleted, not ported.
3. **Drag-and-drop feels like Cursor.** While dragging, a single translucent preview shows exactly where the pane will land — drop on the **left/right half** of a group → new column, **top/bottom half** → new row, **on the tab bar** → added as a tab in that group. The old 5-zone "Add as tab" dashed overlay is gone.
4. **The cockpit can be built up from scratch.** A header **pane palette** lists every available pane; selecting one drops it onto the canvas. One pane → one group; a second → two columns; and so on. (The *default seed* — what's on screen before the doctor touches anything — is intentionally deferred; see V3-Q1.)
5. **Clinical-safety chrome can never be hidden.** The drug-interaction / allergy **safety strip** and the **"Send Rx & finish" footer** remain fixed shell docks, outside the freely-rearrangeable pane tree. Freedom applies to clinical *content*, never to the controls that keep prescribing safe.
6. **Nothing below the shell is rewritten.** The layout model, the pure mutation engine, the pane bodies, the distributed Rx form, the persistence shape, and the telemetry all carry forward unchanged. v3 is a new *shell*, not a new *cockpit*.

---

## Why this is worth doing now

1. **The shipped interaction model fights the doctor.** Pane-freedom Phase 3 gated all drag/split/tab affordances behind a "Customize layout" mode (`useCustomizeMode`). A doctor who wants to move a pane has to discover a button, toggle a mode, perform the move, and toggle back. That is the opposite of direct manipulation, and it is exactly what the user rejected. The capability is real but undiscoverable and ceremonial.

2. **The 5-zone overlay reads as engineering, not product.** `PaneDropOverlay` paints five dashed rectangles with literal labels ("Add as tab", "Split up/down/left/right") on *every* container during a drag. It is legible but ugly and unlike any tool doctors already use. Cursor/VS Code solved this years ago with a single fluid half/quadrant preview; doctors who use modern tools expect that feel.

3. **The model is already right — only the surface is wrong.** The persisted `PaneTreeNode` is already a recursive tree of splits + tab-containers, and `layout-tree-mutations.ts` already implements edge-splits (`dropPaneIntoZone`), tab-into, extract, reorder, and cap enforcement — with a full truth-table test suite. **Rebuilding the shell does not mean rebuilding the hard part.** This is the single most important fact in this plan: the risky, correctness-critical core is *kept*, which shrinks the rewrite to a rendering + interaction problem.

4. **A blank-canvas + palette flow matches how the product is actually positioned.** Clariva is telemed-first and multi-specialty; a dentist, a physician, and a psychiatrist do not want the same eight panes. A build-it-up model (with a sensible per-context seed, planned later) generalises where a fixed default never will.

5. **The cutover risk is bounded by a pattern the codebase has used twice.** ppr and cockpit-v2 both shipped via the Strangler Fig: build the new surface behind a flag at a parallel route, validate parity, flip, delete the old. v3 uses the same playbook, so the "rewrite from scratch" instinct is de-risked into a well-trodden migration.

6. **Doing it now avoids compounding on the wrong base.** Every future cockpit feature (AI assist dock, labs browser, imaging) would otherwise be built against customize-mode and the 5-zone overlay. Replacing the interaction model *before* those land is far cheaper than retrofitting them afterward.

---

## Decision locks (v3-DL-1 .. v3-DL-10)

Locked in the 2026-05-30 planning thread. Re-opening any of these belongs in a new `Decision:` block on the affected R-item, not mid-execution.

- **v3-DL-1 — Reuse the engine; rewrite only the shell.** `frontend/lib/patient-profile/layout-tree.ts`, `layout-tree-mutations.ts`, `types.ts` (the `PaneDefinition` contract), `find-pane-tree-leaf-metadata.ts`, `pane-icons.ts`, and `telemetry.ts` are **kept**. All pane bodies under `frontend/components/patient-profile/panes/*` are **reused by reference**. v3 builds a new rendering + interaction layer on top. Rewriting the model is explicitly out of scope — it is the most-tested, correctness-critical code and rewriting it buys nothing.

- **v3-DL-2 — Uniform tabs; no pane is special.** Every pane is a tab; a single pane is a one-tab group. The Consultation/Body pane is treated identically to Snapshot or Plan — whatever the patient picked (video / voice / text) is rendered *inside* that pane and is invisible to the layout system. No layout-level special-casing of any pane id.

- **v3-DL-3 — No modes; dragging is always on.** Customize mode is deleted, not ported. There is no toggle, no `⌘⇧L`, no `CustomizeBar`. Every tab is draggable at all times (subject only to the live-consult guard carried forward from v3-DL-6 / the existing `body`-during-`live` rule).

- **v3-DL-4 — Cursor-style drag-and-drop.** A single translucent preview shows the target region during a drag: drop on a group's left/right half → column split, top/bottom half → row split, on the tab bar → add as a tab. The five-dashed-box overlay (`PaneDropOverlay`) and its "Add as tab" center zone are removed. Under the hood this maps onto the existing `dropPaneIntoZone(tree, source, target, zone)` engine (`east/west/north/south` = split, `center` = tab) — the *engine* is unchanged; only the *overlay UX and zone-resolution geometry* change.

- **v3-DL-5 — Blank start + pane palette.** v3 boots to a canvas the doctor builds up. A header palette lists every available pane; selecting one adds it (1 → one group, 2 → two columns, …). The *default seed* (what appears before any doctor interaction) is **deferred** and decided after the structure works (V3-Q1). For planning purposes, treat the initial state as blank.

- **v3-DL-6 — Clinical-safety chrome stays anchored.** The safety strip (allergy clash / DDI) and the "Send Rx & finish" action footer remain fixed shell docks, rendered outside the draggable pane tree (carried forward from pane-freedom Phase 4). The doctor can never drag, tab-away, or hide these. Freedom applies to clinical content, not to safety controls. The existing `body`-during-`live` move guard is preserved.

- **v3-DL-7 — Soft caps, quietly enforced.** `MAX_LEAVES = 10` and `MAX_PANES_PER_TABS = 6` carry forward as gentle guardrails. On hit, the mutation refuses and the shell toasts; nothing is silently truncated. Caps are not advertised in the UI. Revisit the exact numbers post-launch.

- **v3-DL-8 — Mobile stays flat.** Editor-group splits are desktop-only (`lg+`). Mobile (`<lg`) continues to render a flat, stacked / pill view (`MobilePillBar` lineage). No drag-to-split on phones.

- **v3-DL-9 — Parallel route behind a flag; delete old after parity.** v3 is built at a parallel route / mount behind a `cockpit_v3` feature flag. The existing shell is untouched until v3 reaches parity on the safety-critical paths (prescribing, autosave, finish-visit, mount surfaces). Then the flag flips and the old shell + customize-mode + 5-zone overlay + template pre-fill are deleted. A kill-switch keeps the old shell reachable for one release window.

- **v3-DL-10 — Persistence reuse; existing layouts migrate for free.** v3 persists the **same** `PaneTreeNode` shape (localStorage v5 + `doctor_settings.cockpit_layout_presets` per migration 112). Saved layouts and presets created under the pane-freedom shell keep working. Any read-path adjustment is a one-shot, idempotent migration — no new persisted schema.

---

## What changes vs what stays

The Strangler Fig from ppr and cockpit-v2 applies again: build the new shell side-by-side behind a flag, port content **by reference** (no body rewrites), validate parity, flip the default, delete the old.

### 🟢 Preserved unchanged (the kept foundation — v3-DL-1)

- `frontend/lib/patient-profile/layout-tree.ts` — `PaneTreeNode`, serialise/deserialise, validators, `upgradeV4LeavesToV5`, shape helpers.
- `frontend/lib/patient-profile/layout-tree-mutations.ts` — the pure mutation engine: `dropPaneIntoZone`, `addToTabsNode`, `extractFromTabsNode`, `setActiveTab`, `restoreLeaf`, `hideLeaf`, cap constants. **Untouched.**
- `frontend/lib/patient-profile/types.ts` — the `PaneDefinition` contract (`tabs?`, `aiSummarySlot?`, `aiAssistButtonSlot?`, etc.).
- `frontend/components/patient-profile/panes/*` — every pane body (`SnapshotPane`, `HistoryPane`, `SubjectivePane`, `ObjectivePane`, `RxPane`, `InvestigationsPane`, `ConsultationBodyPane`, chart-rail, …). Mounted by reference into v3 groups.
- The distributed Rx form (`RxFormContext` + section components), the SOAP schema, autosave, and the three-mount-surface invariant (cockpit-v2 DL-3 / E6).
- Telemetry (`telemetry.ts`), pane icons, keyboard-shortcut registry primitives.

### 🆕 Created (new files — the rewrite)

- A new recursive **editor-group renderer** (working name `CockpitGroupView`) that walks `PaneTreeNode` and renders every group as an always-tabbed editor group with resizable splits.
- A new **Cursor-style drop overlay** (replaces `PaneDropOverlay`) — single translucent half/quadrant preview + tab-bar drop target.
- A new **pane palette** header control (evolution of `PaneToggleBar`) — lists available panes, adds them to the canvas.
- A new **v3 page / route** (mount behind the `cockpit_v3` flag), wiring the kept providers (Rx form, safety) and the anchored chrome docks around the new shell.
- A copied-and-simplified **always-on tab strip** (forked from `PaneTabStrip`, with the `useCustomizeMode` gate removed).

### 🟡 Touched (substantive diffs)

- `frontend/components/patient-profile/PatientProfilePage.tsx` — branch on the `cockpit_v3` flag to mount the new shell; pass the anchored safety/action docks (as today).
- `frontend/components/patient-profile/PatientProfileHeader.tsx` — host the pane palette; drop the Customize toggle and preset/customize affordances in the v3 path.
- Persistence read-path (`useShellLayout` lineage) — accept and hydrate the same `PaneTreeNode`; one-shot migration if needed (v3-DL-10).

### 🗑️ Deleted (cutover complete — v3-DL-9, cv3x-03 2026-06-02)

- `Shell.tsx` (`PatientProfileShell`) and `PatientProfileShellHandle`.
- `customize-mode-context.tsx`, `CustomizeBar.tsx`, and all customize-mode gating.
- `PaneDropOverlay.tsx` (5-zone overlay).
- `flags.ts` / `cockpitV3Enabled()` / `NEXT_PUBLIC_COCKPIT_V3` and the page branch.
- Header preset/layout customize UI (`PresetPicker`, save/manage preset dialogs on the old path).
- `PaneToggleBar.tsx`, `PaneTabStrip.tsx` (old shell), preset hooks superseded by v3 palette.

**Still deferred (not on v3 mount path):** `templates.tsx` column factories, `InvestigationsAutoMerge.tsx`, `middle-bottom` wrapper — see capture inbox handoff.

---

## Interaction model (canonical)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Header:  ‹ Patient name · badges        [ + Add pane ▾ palette ]   ⋯       │
├──────────────────────────────────────────────────────────────────────────┤
│ Safety strip (anchored dock — never draggable):  ⚠ Penicillin allergy …   │
├───────────────────────────┬────────────────────────────────────────────────┤
│ ┌ Snapshot ┐ ┌ History ┐  │ ┌ Body ┐ ┌ Subjective ┐                        │
│ │●Snapshot │ │ History │  │ │●Body │ │ Subjective │   ← tab bars always    │
│ ├──────────┴───────────┤  │ ├──────┴────────────┤      visible; tabs always │
│ │  (active tab body)   │  │ │  (active body)    │      draggable             │
│ │                      │  │ │                   │                            │
│ │  drop preview while dragging:                  │                           │
│ │   ┌───────────┬───────────┐                    │                           │
│ │   │  left ½   │  right ½  │  → split into columns                          │
│ │   │ (translucent) (translucent)                │                           │
│ │   └───────────┴───────────┘                    │                           │
│ │   drop on a tab bar  → add as a tab            │                           │
│ └──────────────────────┘  └───────────────────┘                            │
├───────────────────────────┴────────────────────────────────────────────────┤
│ Action footer (anchored dock):   Saved · 12:04    [Save]  [Send Rx ▸]       │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Add a pane:** header palette → pick a pane → it lands on the canvas (first pane = one group; subsequent = a new column, or a tab via drag).
- **Move/stack/split:** grab a tab → translucent preview follows the cursor → drop on a half (split) or a tab bar (tab). Always on; no mode.
- **Resize:** drag the divider between groups (react-resizable-panels lineage).
- **Remove a pane:** close it from its tab (`×`) or remove from the palette; last pane is protected (`would-remove-last-leaf`).
- **Caps:** beyond 10 leaves / 6 tabs-per-group the action is refused with a toast (v3-DL-7).
- **Safety chrome:** strip (top) and action footer (bottom) are fixed docks — present in every arrangement, never draggable (v3-DL-6).

---

## R-item details

Seven R-items across four phases. Each: Why / What / Acceptance / Effort / Dependencies / Files / Decision.

### R-SHELL3 · Editor-group recursive renderer (always-on tabs)

**Why:** The heart of v3. A new renderer over the kept `PaneTreeNode` where every group is an always-tabbed editor group, with no customize-mode gating.

**What:**
- New `CockpitGroupView` that recursively renders `PaneTreeNode`: split nodes → resizable `PanelGroup` (horizontal/vertical); leaf nodes → an editor group with an always-visible tab strip + the active pane body.
- Single-pane groups still show a (single) tab — uniform model (v3-DL-2). Bodies mounted by reference from `panes/*`.
- Fork `PaneTabStrip` → always-draggable variant (remove `useCustomizeMode`); overflow popover preserved.
- Resize, collapse, hotkey-focus behaviour preserved from the kept shell semantics.
- Builds behind the `cockpit_v3` flag at a parallel mount; old shell unaffected.

**Acceptance:**
- Any `PaneTreeNode` (incl. nested splits + multi-tab groups) renders correctly; round-trips through serialise/deserialise.
- Every group shows a tab strip; tabs are draggable with no mode toggle anywhere in the UI.
- Resize works at every split depth; layout persists across reload via the kept persistence shape.
- No reference to `customize-mode-context` remains in the v3 render path.

**Effort:** 6–8 days (largest item). **Dependencies:** v3-DL-1 (kept model). **Files:** new `CockpitGroupView` + forked tab strip; reads `layout-tree.ts`.

**Decision:** [x] Yes  [ ] No  [ ] Modify — shipped Phase 1 (`p1-shell/`, cv3c-01..04).

---

### R-DND3 · Cursor-style always-on drag-and-drop

**Why:** Replace the five dashed boxes with a single fluid preview, matching the tool doctors already know (v3-DL-4).

**What:**
- New drop overlay: while dragging, render one translucent region preview over the hovered group — left/right half (column split), top/bottom half (row split), or full tab-bar highlight (tab-into).
- Pointer-geometry resolves the half/quadrant under the cursor → maps to `dropPaneIntoZone` `east/west/north/south/center`.
- Tab-bar is a first-class drop target → `center` (add as tab) without a dashed center box.
- Drag threshold + grip affordance to prevent accidental drags; preserve the `body`-during-`live` guard.
- Delete `PaneDropOverlay` (old) from the v3 path.

**Acceptance:**
- Dropping on left/right half creates a column; top/bottom creates a row; tab bar adds a tab — verified against the existing `dropPaneIntoZone` truth table.
- Exactly one preview is visible at a time; no dashed multi-box overlay.
- Accidental micro-drags do not reparent panes (threshold honoured).
- Live-consult guard still blocks moving `body` during a live consult.

**Effort:** 4–6 days. **Dependencies:** R-SHELL3. **Files:** new drop overlay; DnD wiring in `CockpitGroupView`; reuses `layout-tree-mutations.ts`.

**Decision:** [x] Yes  [ ] No  [ ] Modify — promoted 2026-05-31 to [`Daily-plans/May 2026/30-05-2026/cockpit-v3/p2-dnd/`](../Daily-plans/May%202026/30-05-2026/cockpit-v3/p2-dnd/plan-p2-cockpit-v3-dnd-batch.md) as Phase 2 (cv3d-01..04). Engine reuse confirmed: Phase 1's `useCockpitV3Layout.movePane` already wraps `dropPaneIntoZone`, so the work is geometry + a single translucent overlay + drag wiring.

---

### R-PALETTE · Blank canvas + pane palette

**Why:** v3-DL-5 — the doctor builds the cockpit up; the palette is the "all available tabs" control the user described.

**What:**
- Header palette listing every available pane (title + icon from `PaneDefinition`), showing which are on-canvas vs available.
- Select to add: first pane → single group; subsequent → new column (reuses `restoreLeaf` semantics) or via drag to a tab.
- Remove from canvas (respecting last-leaf protection).
- A clear empty-state when the canvas is blank ("Add a pane to begin"), pending the deferred seed (V3-Q1).

**Acceptance:**
- Every `PaneDefinition` appears in the palette with correct title + icon.
- Add/remove updates the live tree and persists; caps enforced with a toast (v3-DL-7).
- Blank canvas shows a discoverable add affordance; no console errors at zero panes.

**Effort:** 3–4 days. **Dependencies:** R-SHELL3. **Files:** new palette (evolves `PaneToggleBar`); header wiring.

**Decision:** [x] Yes  [ ] No  [ ] Modify — shipped Phase 1 palette + Phase 5 flat registry (`p1-shell/`, `p5-tab-model/`).

---

### R-CHROME3 · Anchored clinical-safety chrome

**Why:** v3-DL-6 — prescribing safety controls must survive any arrangement.

**What:**
- Carry forward pane-freedom Phase 4 chrome docks: render `SafetyStickyStrip` (top) and `PlanActionFooter` (bottom) as fixed shell docks around the v3 shell, outside the draggable tree.
- Keep the page-root provider scope (`RxFormActionsBridgeProvider`, `RxFormProvider`, `RxSafetyProvider`) so the docked footer/strip read live form + safety state regardless of where the Plan pane sits.
- Leaf-anchored visual chrome (chart-rail empty state) continues to travel with its pane.

**Acceptance:**
- Safety strip + action footer render in every arrangement, including a blank canvas, and are never draggable/tab-able.
- The docked "Send Rx & finish" footer fires the registered handler after the Plan pane is moved/tabbed/split.
- On mobile, docks behave per the flat fallback (v3-DL-8).

**Effort:** 2–3 days. **Dependencies:** R-SHELL3. **Files:** v3 page/shell dock slots (mirrors current `safetyDock` / `actionDock`).

**Decision:** [x] Yes  [ ] No  [ ] Modify — promoted 2026-05-31 to [`Daily-plans/May 2026/30-05-2026/cockpit-v3/p3-platform/`](../Daily-plans/May%202026/30-05-2026/cockpit-v3/p3-platform/plan-p3-cockpit-v3-platform-batch.md) as Phase 3 (cv3p-01). Mostly verification + hardening: the docks (Phase 0/1), page-root providers (pane-freedom P4-DL-2), and the leaf-anchored empty-state (P4-DL-3) already exist; cv3p-01 proves the footer **sends** + the strip stays unhideable after a Phase-2 drag (V3-R2) and that docks sit outside `<CockpitDndContext>` (P3-DL-1/2).

---

### R-PERSIST3 · Persistence + migration reuse

**Why:** v3-DL-10 — existing saved layouts and presets must keep working; no churn for doctors who already customised.

**What:**
- Persist the same `PaneTreeNode` (localStorage v5 + `doctor_settings` presets via migration 112).
- One-shot, idempotent read-path migration if the v3 renderer needs any normalisation (e.g., ensuring every leaf carries `paneIds`/`activeTabId` — `upgradeV4LeavesToV5` already does this).
- Per-doctor remembering of the last arrangement; "reset" returns to blank (or the deferred seed once it exists).

**Acceptance:**
- A layout saved under the pane-freedom shell loads correctly in v3 (round-trip test on representative trees).
- No new persisted schema; migration is idempotent and reversible-by-no-op.
- Reload restores the doctor's last arrangement.

**Effort:** 2–3 days. **Dependencies:** R-SHELL3. **Files:** `useShellLayout` lineage; no backend schema change.

**Decision:** [x] Yes  [ ] No  [ ] Modify — promoted 2026-05-31 to [`p3-cockpit-v3-platform/`](../Daily-plans/May%202026/30-05-2026/cockpit-v3/p3-platform/plan-p3-cockpit-v3-platform-batch.md) as Phase 3 (cv3p-02). Migration is inherited: `validateLayout` already covers v2→v5 on the same `patient-profile/v4-tree-layout::<key>`, so the work is round-trip + idempotence proofs, a blank-seed-no-clobber guard, the V3-Q6 per-doctor lock, and a reset-to-blank affordance. **Presets:** data + migration 112 stay valid (P3-DL-7); the preset-CRUD *UI* port is a deferred fast-follow.

---

### R-MOBILE3 · Mobile flat fallback

**Why:** v3-DL-8 — editor groups don't work on phones.

**What:**
- Below `lg`, render a flat stacked / pill view of the active panes (preserve `MobilePillBar` lineage); no drag-to-split.
- Safety strip + action footer remain reachable on mobile.

**Acceptance:**
- `<lg` shows the flat view with no drag affordances; `lg+` shows editor groups.
- Safety + send controls reachable on mobile.

**Effort:** 1–2 days. **Dependencies:** R-SHELL3. **Files:** v3 shell responsive branch.

**Decision:** [x] Yes  [ ] No  [ ] Modify — promoted 2026-05-31 to [`p3-cockpit-v3-platform/`](../Daily-plans/May%202026/30-05-2026/cockpit-v3/p3-platform/plan-p3-cockpit-v3-platform-batch.md) as Phase 3 (cv3p-03). Phase 1 shipped a minimal flat fallback; cv3p-03 polishes it to the `MobilePillBar` lineage and — the R-MOBILE3 delta — renders the safety strip + a finish/send affordance **reachable** on mobile (P3-DL-6), still no splits/DnD (v3-DL-8).

---

### R-CUTOVER · Parity, flag flip, delete old

**Why:** v3-DL-9 — retire the old interaction model cleanly once v3 is at parity.

**What:**
- Parity matrix across the safety-critical paths: open patient (all consult types), prescribe + send, autosave, finish/no-show/review states, three mount surfaces (cockpit-v2 DL-3), keyboard nav.
- Flip the `cockpit_v3` flag to default-on; keep a one-release kill-switch to the old shell.
- After the kill-switch window: delete the old `Shell.tsx`, `customize-mode-context`, `CustomizeBar`, old `PaneDropOverlay`, template pre-fill path, and superseded tests; update `docs/Reference/product/cockpit/COCKPIT.md`.

**Acceptance:**
- Parity matrix green; no regression in send/autosave/finish E2E.
- Flag default-on; kill-switch documented.
- Dead code removed; `COCKPIT.md` reflects v3 as the live model.

**Effort:** 3–4 days. **Dependencies:** all prior R-items. **Files:** flag config; deletions; `COCKPIT.md`.

**Decision:** [x] Yes  [ ] No  [ ] Modify — promoted 2026-05-31 to [`p4-cockpit-v3-cutover/`](../Daily-plans/May%202026/30-05-2026/cockpit-v3/p4-cutover/plan-p4-cockpit-v3-cutover-batch.md) as Phase 4 (cv3x-01..04). Shape is verify→flip→(soak)→delete→document: cv3x-01 proves the parity matrix (the close-gate; **P4-DL-1** gates the flip on green), cv3x-02 flips `cockpitV3Enabled()` default-on with a **no-deploy kill-switch** held one release (**P4-DL-2**), cv3x-03 deletes the old `Shell.tsx` / customize-mode / `PaneDropOverlay` / pre-fill / flag only after the soak (**P4-DL-3/4**, audited per CODE_CHANGE_RULES), cv3x-04 rewrites `COCKPIT.md` to v3 as the live model (**P4-DL-5**). No new behavior (**P4-DL-6**); the type-aware seed (V3-Q1), per-consult-type persistence, and preset-CRUD *UI* stay deferred fast-follows.

> **Re-sequenced 2026-05-31 — Phase 5 inserted (no longer the final phase).** cv3x-01/02 shipped, but the flip exposed a structural defect: the default-on canvas is not buildable — the palette + blank-seed operate on the nested template's column wrappers (`left/middle/right-column`, all `render: () => null`), so adding a pane mounts nothing. The fix is the **tab model** the cutover itself deferred (P4-DL-6 / the InvestigationsAutoMerge-in-flat-panes question): flatten the columns into a uniform flat tab registry, point the palette/seed at the real leaves, decouple Plan/Investigations, relabel the body tab "Consult". Promoted to [`p5-tab-model/`](../Daily-plans/May%202026/30-05-2026/cockpit-v3/p5-tab-model/plan-p5-cockpit-v3-tab-model-batch.md) as **Phase 5 (cv3t-01..03)**, executed **between cv3x-02 and the soak** (a soak/delete on an unbuildable canvas is meaningless/unsafe). cv3t-03 re-proves the parity matrix on the flat structure + the build-up path the cv3x-01 matrix missed (**P5-DL-5**), then Phase 4's tail (soak → cv3x-03 → cv3x-04) resumes — cv3x-03's deletion set inherits the now-legacy-only column factories + `InvestigationsAutoMerge` + `middle-bottom`.

---

## Sequencing

Four phases. Within a phase, items can run in parallel chats.

### Phase 0 — Scaffold
- `cockpit_v3` feature flag + parallel mount + reuse audit (confirm the kept-file inventory compiles in isolation). Lightest phase; no user-visible change.

### Phase 1 — Core shell (the rewrite)
| R-item | Effort | Notes |
|---|---|---|
| R-SHELL3 | 6–8d | Editor-group renderer + always-on tabs, behind the flag |
| R-PALETTE | 3–4d | Can start once R-SHELL3 renders a single group |

**Gate:** a blank canvas + palette can build arbitrary column/row/tab arrangements that persist, with always-on tabs and no customize mode anywhere.

### Phase 2 — Interaction
| R-item | Effort | Notes |
|---|---|---|
| R-DND3 | 4–6d | Cursor-style preview; replaces 5-zone overlay |

**Gate:** drag any tab → single translucent preview → drop to split or tab; truth-table parity with `dropPaneIntoZone`; live-guard preserved.

### Phase 3 — Safety + platform
| R-item | Effort | Notes |
|---|---|---|
| R-CHROME3 | 2–3d | Anchored safety strip + action footer |
| R-PERSIST3 | 2–3d | Same `PaneTreeNode`; existing layouts migrate |
| R-MOBILE3 | 1–2d | Flat fallback |

**Gate:** safety chrome unhideable in every arrangement; saved layouts load; mobile flat.

### Phase 4 — Cutover ✅ (2026-06-02)
| R-item | Effort | Notes |
|---|---|---|
| R-CUTOVER | 3–4d | Parity matrix, flag flip, delete old, docs |

**Gate:** ✅ flag removed; old shell + customize mode + 5-zone overlay deleted; `COCKPIT.md` updated to v3 (cv3x-03 + cv3x-04). Kill-switch retired with the flag.

### Phase 5 — Tab model *(inserted into the cutover, ahead of the soak — see R-CUTOVER decision note)* ✅
| Theme | Effort | Notes |
|---|---|---|
| Flatten columns → uniform flat tab registry (`buildCockpitTabs`); fix the build-up canvas (palette/seed on real leaves); decouple Plan/Investigations; relabel body → "Consult" / "Visit summary"; re-prove parity | ~1–1.5d | cv3t-01..03 in [`p5-tab-model/`](../Daily-plans/May%202026/30-05-2026/cockpit-v3/p5-tab-model/plan-p5-cockpit-v3-tab-model-batch.md). Port by reference (no body rewrites); legacy templates untouched until cv3x-03. Realises **v3-DL-2** (every pane is a tab; no pane is special). |

**Gate:** ✅ green ([`PARITY-MATRIX-cv3t-03.md`](../Daily-plans/May%202026/30-05-2026/cockpit-v3/p5-tab-model/PARITY-MATRIX-cv3t-03.md), 2026-05-31). Phase 4 tail (cv3x-03 → cv3x-04) completed 2026-06-02.

### Total effort estimate
**~21–30 dev-days serial** (~3–4.5 weeks one engineer; ~2.5–3 weeks with two parallelising Phase 1/2). The kept model (v3-DL-1) is what keeps this materially smaller than v2's 30–35 days despite being framed as a "rewrite."

---

## Success criteria

| Metric | Today (pane-freedom shell) | Target after v3 |
|---|---|---|
| Steps to move a pane | Toggle Customize → drag → toggle back (3) | Grab tab → drop (1) |
| "Mode" toggles in the move flow | 1 (`⌘⇧L` / Customize button) | 0 |
| Drop affordances on screen during a drag | 5 dashed boxes per container | 1 translucent preview |
| Can the doctor hide the safety strip / send button? | No (Phase 4 docks) | No (v3-DL-6 — preserved) |
| Existing saved layouts still load | n/a | Yes (v3-DL-10) |
| Model / mutation engine rewritten | n/a | No (v3-DL-1 — reused) |
| Send / autosave / finish E2E | pass | pass (no regression) |
| Three mount surfaces (cockpit-v2 DL-3) | work | work |
| Mobile flat fallback | works | works (v3-DL-8) |
| Lines of customize-mode code in the shell path | present | 0 (deleted at cutover) |

---

## Open questions (live — answer in chat, then lock here)

### V3-Q1 — Default seed layout *(deferred by explicit user direction)*
**Question:** What is on screen *before* the doctor touches anything — truly blank, a single sensible default, or a per-consult-type seed (video → call-friendly, in-person → exam, completed/no-show → review)?
**Notes:** The user said *"skip the default layout, we can plan that once our structure is ready, plan like blank for now."* So Phase 0–4 treat the initial state as blank with a discoverable "add pane" affordance. **Lock after R-SHELL3 + R-PALETTE prove the structure.** This is the single most important deferred decision — a literally-blank screen every visit is likely the wrong end state clinically, so this question must be answered before flag-flip (R-CUTOVER).

### V3-Q2 — Tab reordering within a strip
**Question:** Can a doctor drag a tab to reorder it *within* the same group (sortable strip), not just between groups?
**Notes:** Lean **yes** — Cursor does it and the user explicitly likes Cursor's feel; the pane-freedom backlog already parked this (`@dnd-kit/sortable`). Fold into R-DND3 if cheap; otherwise fast-follow. Lock before R-DND3.
**Locked 2026-05-31 (= Yes, in-phase):** folded into Phase 2 as **P2-DL-6** (cv3d-03) via the kept `moveLeafBetweenTabs`. If within-strip sortable fights the single cross-group droppable it splits to a captured fast-follow, but the plan-of-record is in-phase.

### V3-Q3 — Blank-canvas empty state
**Question:** What does a zero-pane canvas show — a centered palette prompt, a ghosted suggested layout, or a one-click "add my usual set"?
**Notes:** Lean **centered prompt + palette** for v3; richer suggestions ride with V3-Q1's seed. Lock before R-PALETTE.

### V3-Q4 — Keep the context-menu move as a no-pointer fallback?
**Question:** Retain a right-click "Move pane to…" path for accessibility / no-drag users?
**Notes:** Lean **yes, keep a slim version** — keyboard/a11y parity matters for a clinical tool. Lock before R-DND3.
**Locked 2026-05-31 (= Yes, keep):** already resolved in Phase 1 (P1-DL-5 shipped `CockpitLeafMenu`). Re-affirmed for Phase 2 as **P2-DL-5** — drag is layered *over* the same engine ops; the context menu stays as the permanent no-pointer/a11y path, and no keyboard-DnD sensor is built.

### V3-Q5 — Caps: keep 10 / 6 or raise?
**Question:** Keep `MAX_LEAVES=10` / `MAX_PANES_PER_TABS=6`, or relax now that the doctor builds up deliberately?
**Notes:** Lean **keep as-is** for launch; revisit with telemetry. Lock before R-SHELL3.

### V3-Q6 — Persistence scope
**Question:** Remember one layout per doctor, or per (doctor × consult-type)?
**Notes:** Lean **per-doctor for v3**, with per-consult-type as a fast-follow once V3-Q1's seed lands. Lock before R-PERSIST3.
**Locked 2026-05-31 (= per-doctor):** folded into Phase 3 as **P3-DL-4** (cv3p-02). Satisfied for free by the stable per-route localStorage key (per-browser = per-doctor in practice) — no re-keying. Per-(doctor × consult-type) stays a deferred fast-follow that rides V3-Q1's seed.

### V3-Q7 — Route / flag shape
**Question:** Is `cockpit_v3` a query param (`?cockpit=v3`), a doctor setting, or an env/rollout flag?
**Notes:** Lean **doctor setting + env rollout gate** (so we can dogfood, then ramp). Lock before Phase 0.

---

## Deferred — explicitly out of scope for this plan

- **V3-D1: Default seed / per-specialty templates** — deferred per user (V3-Q1). The v2 `templates.tsx` factories may be repurposed as seeds later.
- **V3-D2: AI assist dock / Cmd+K** — contracts exist from cockpit-v2 R-FUTURE-PROOFING; no implementation here.
- **V3-D3: Labs / records / imaging surfaces** — side-sheet contracts ready; content deferred.
- **V3-D4: Cross-doctor / clinic-wide layout sharing** — deferred.
- **V3-D5: In-clinic OPD-specific arrangements** — reaffirms cockpit-v2 DL-13; out of scope.
- **V3-D6: Animated tab/drag micro-interactions polish** — ride after parity.

---

## Risk register

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| V3-R1 | "Rewrite from scratch" balloons in scope | **High** | v3-DL-1 keeps the model/engine/bodies; the rewrite is rendering + interaction only. Phase gates + parallel flag bound it. |
| V3-R2 | New shell makes safety chrome reachable-to-hide / unreachable | **High** | v3-DL-6 anchored docks + provider scope; explicit parity gate on "send reachable in every arrangement" before flip. |
| V3-R3 | Always-on dragging causes accidental reparents mid-consult | Med | Drag threshold + grip affordance; preserve `body`-during-`live` guard; undo affordance considered. |
| V3-R4 | Persistence migration breaks existing saved layouts | Med | v3-DL-10 reuses `PaneTreeNode`; idempotent one-shot migration; round-trip tests; kill-switch. |
| V3-R5 | Blank-canvas paralysis — doctor faces an empty screen | **High** | This is *why* V3-Q1 (seed) must be answered before R-CUTOVER; interim blank ships a clear add affordance; flag-gated dogfood first. |
| V3-R6 | Cursor-style geometry feels imprecise (wrong half chosen) | Med | Tune half/quadrant thresholds; snap preview; dogfood on real monitors at 1366/1920/2560px. |
| V3-R7 | Pre-existing `useShellLayout` test hang bleeds into v3 | Low | Known issue (inbox `[cpf-04 follow-up]`); v3 ships its own focused suites; address hang separately. |
| V3-R8 | Two cockpit shells coexisting confuses contributors | Low | Flag is short-lived; R-CUTOVER deletes the old path within one release window. |
| V3-R9 | Mobile regression from the shell swap | Low | v3-DL-8 keeps the flat fallback; mobile path explicitly tested in R-MOBILE3. |

---

## Future-proofing checklist (apply to every R-item)

- [ ] Does the v3 renderer still round-trip arbitrary `PaneTreeNode`s through serialise/deserialise?
- [ ] Is clinical-safety chrome anchored and unhideable in this arrangement (v3-DL-6)?
- [ ] Does this path avoid any new reference to customize-mode (v3-DL-3)?
- [ ] Does persistence stay on the kept `PaneTreeNode` shape (v3-DL-10)?
- [ ] Do the three mount surfaces (cockpit-v2 DL-3) still render?
- [ ] Does mobile fall back to flat (v3-DL-8)?

Runs as part of each phase gate.

---

## Cost estimate (per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../AGENT-EXECUTION-EFFICIENCY-GUIDE.md))

No PHI columns, no RLS redesign, no new persisted schema (v3-DL-10), no novel security — **zero Opus tasks** anticipated. Sonnet-tier throughout; Composer-tier sufficient for the lightest items (R-MOBILE3, flag scaffold). The kept model (v3-DL-1) removes the highest-risk correctness work from the rewrite entirely.

| Phase | R-items | Effort (serial) |
|---|---|---|
| Phase 0 — Scaffold | flag + parallel mount + reuse audit | ~1–2d |
| Phase 1 — Core shell | R-SHELL3 + R-PALETTE | ~9–12d |
| Phase 2 — Interaction | R-DND3 | ~4–6d |
| Phase 3 — Safety + platform | R-CHROME3 + R-PERSIST3 + R-MOBILE3 | ~5–8d |
| Phase 4 — Cutover | R-CUTOVER | ~3–4d |

---

## Plan rules (pre-ship workflow)

1. **Editing this file is welcome under any `Notes:` line.** Don't edit headers, R-IDs, or DL-IDs.
2. **Don't renumber items.** R-IDs and v3-DL-IDs are stable; killed items keep their ID + `[KILLED]` suffix with a one-line reason.
3. **v3-DL-IDs are locked.** Reopening one requires a `Decision: … [x] Modify` block on the affected R-item with written rationale.
4. **When all Phase 1 R-items have a `Decision:` ticked, this plan promotes to a dated batch** under `docs/Work/Daily-plans/<Month>/<date>/cockpit-v3/p{N}-<slug>/plan-p{N}-cockpit-v3-<slug>-batch.md` and becomes `Committed`. **Later phases promote as sibling `p{N}-` subfolders under the same `cockpit-v3/` folder created on the start date — not under the later day's date.** Folder rules: [`process/PHASED-PLANS-GUIDE.md`](../process/PHASED-PLANS-GUIDE.md).
5. **Implementation MUST NOT start until promotion.** R-IDs are decided here; the daily-plans batch derives per-task files from them.
6. **The three-mount-surface check (cockpit-v2 DL-3) and the safety-chrome reachability check re-run at every phase gate**, not just at cutover.

---

## References

### Plans
- [archive/plan-cockpit-v2.md](./archive/plan-cockpit-v2.md) — Cockpit v2 (shipped). v3 keeps everything below its shell.
- [plan-patient-profile-shell-rebuild.md](./plan-patient-profile-shell-rebuild.md) — ppr; original `PaneDefinition` + flat shell.
- Pane-freedom batches — [Phase 1 tabs](../Daily-plans/May%202026/30-05-2026/cockpit-pane-freedom/p1-tabs/), [Phase 2 dnd](../Daily-plans/May%202026/30-05-2026/cockpit-pane-freedom/p2-dnd/), [Phase 3 customize](../Daily-plans/May%202026/30-05-2026/cockpit-pane-freedom/p3-customize/), [Phase 4 chrome](../Daily-plans/May%202026/30-05-2026/cockpit-pane-freedom/p4-chrome/). v3 inherits their model; supersedes their interaction layer.
- [docs/Reference/product/cockpit/COCKPIT.md](../../Reference/product/cockpit/COCKPIT.md) — live cockpit reference; updated at v3 cutover.

### Code surfaces (kept vs new)
- **Kept:** `frontend/lib/patient-profile/layout-tree.ts`, `layout-tree-mutations.ts`, `types.ts`, `frontend/components/patient-profile/panes/*`, `telemetry.ts`, `pane-icons.ts`.
- **New (rewrite):** editor-group renderer (`CockpitGroupView`), Cursor-style drop overlay, pane palette, v3 page/route, always-on tab strip (fork of `PaneTabStrip`).
- **Deleted at cutover:** `Shell.tsx` (desktop), `customize-mode-context.tsx`, `CustomizeBar.tsx`, `PaneDropOverlay.tsx` (5-zone), template pre-fill path.

---

**Created:** 2026-05-30.  
**Status:** **Shipped** (2026-06-02).  
**Owner:** TBD.  
**Promoted to:** [`docs/Work/Daily-plans/May 2026/30-05-2026/cockpit-v3/`](../Daily-plans/May%202026/30-05-2026/cockpit-v3/) (Phases 0–5).  
**Relationship:** Supersedes the cockpit pane-freedom *interaction layer*; reuses its model + mutation engine (v3-DL-1). Live reference: [`docs/Reference/product/cockpit/COCKPIT.md`](../../Reference/product/cockpit/COCKPIT.md).
