# Cockpit pane freedom — Phase 4: `groupWrapper` refactor (action chrome → shell-level docks) — 30 May 2026 batch plan

> **Phase 4 of the pane-freedom vision — the final phase.** ✅ **Program complete (2026-05-30):** Phases 1–4 shipped; the pane-freedom vision is closed. The full multi-phase vision + decision lock (DL-1..DL-10) live in the [Phase 1 plan doc](../p1-tabs/plan-p1-cockpit-pane-freedom-batch.md). This batch inherited all prior decision locks and resolved the last structural debt the vision named on day one: **chrome that is bound to a tree position breaks when a pane is re-parented.** This batch shipped **Phase 4 only** and closes the pane-freedom program.
>
> **Prefix note:** tasks are `cpfg-*` (`g` = `groupWrapper`, the mechanism being refactored). Phase 1 = `cpf`, Phase 2 = `cpfd` (dnd), Phase 3 = `cpfc` (customize); `c` was taken, so chrome/groupWrapper takes `g`.
>
> **⚠️ Builds on Phases 1-3 (all landed).** Phase 1 (tabs + context-menu move), Phase 2 (drag-drop 5-zone overlay), and Phase 3 (customize mode + preset polish) are merged. Phase 3 is precisely what makes this batch necessary: now that a doctor can drag `plan` / `rx` / `snapshot` anywhere, the action chrome wrapped around their original tree positions no longer follows them. **The "Send Rx & finish" button must not vanish when Plan moves to the left column.**
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Zero Opus build tasks. Three Auto (cpfg-01..03) + one Composer 2 Fast (cpfg-04). **One optional Opus close-gate after cpfg-01** — recommended, because the action-chrome lift is the one consult-critical, silent-breakage surface in the batch (a mis-scoped provider lift makes "Send Rx & finish" silently inert).
>
> **Source plan:** None — this batch is the source for "the chrome-lift layer of pane freedom." The cockpit-v2 program ([archive](../../../../../Product%20plans/archive/plan-cockpit-v2.md)) closed 2026-05-24; the pane-freedom phases are post-program shell evolution.
>
> **Predecessor batches:**
> - [Phase 1 — cockpit-pane-freedom](../p1-tabs/) — tabs schema, ops, renderer, context-menu move.
> - [Phase 2 — p2-cockpit-pane-freedom-dnd](../p2-dnd/) — drag-drop with the 5-zone overlay.
> - [Phase 3 — p3-cockpit-pane-freedom-customize](../../cockpit-pane-freedom/p3-customize/) — customize-mode toggle + preset CRUD. **The reshaping it unlocked is the trigger for this batch.**
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-p4-cockpit-pane-freedom-chrome.md`](./Tasks/EXECUTION-ORDER-p4-cockpit-pane-freedom-chrome.md).

---

## What Phase 4 fixes (one sentence)

> **Action-bearing chrome (the Rx finish footer, the drug-safety strip, the Rx-actions bridge) is lifted out of position-bound `groupWrapper`s into shell-level docks, and the chart-rail empty-state card is leaf-anchored to `snapshot` — so reshaping the layout never strands the chrome a doctor depends on.**

`groupWrapper` was a Phase-1-era convenience: a `PaneDefinition` field that wraps a split node's rendered subtree. It works fine when the tree shape is fixed. But after Phase 2/3, the tree shape is the doctor's to change — and four wrappers are still nailed to specific tree positions:

| Wrapper | Today (position-bound) | The break after re-parenting |
|---|---|---|
| `RxFormActionsBridgeProvider` | `middle-bottom` groupWrapper | If `rx` moves out, the footer can no longer read the form's send handlers |
| `SafetyStickyStrip` | `middle-bottom` groupWrapper (top) | Drug-safety banners stay pinned to the (now plan-less) middle-bottom |
| `PlanActionFooter` | `middle-bottom` groupWrapper (bottom) | "Send Rx & finish" stays where Plan *used to be* — not where it went |
| `ChartRailWithEmptyState` | `left-column` groupWrapper | Empty-state card clings to the column even when `snapshot` is dragged away |

Phase 4 lifts the three **action/cross-cutting** wrappers to **shell-level docks** (they're scoped to the consult, not a tree position) and leaf-anchors the one **visual** wrapper to `snapshot` (it travels with its pane). The `LayoutTree` itself is untouched — this is a chrome re-org, not a data change.

---

## What's already in place (so the scope stays small)

The investigation found the lift is far smaller than it looks, because most of the provider plumbing is already at the page root:

- **`RxFormProvider` + `RxSafetyProvider` already wrap the entire page** (`PatientProfilePage.tsx` mounts them around `pageContent`). So `SafetyStickyStrip` (which reads `useRxSafety()`) already has its context available everywhere — lifting it to a shell dock needs **no provider move**.
- **Only `RxFormActionsBridgeProvider` is still trapped in a `groupWrapper`** (`middle-bottom`). Lifting it to the page-root provider stack (beside `RxFormProvider` / `RxSafetyProvider`) is a one-move change; React context follows the rendered hierarchy, so a wider provider still serves the same registrar (`PrescriptionForm` in `RxPane`) and reader (`PlanActionFooter`) wherever each lands.
- **`MobileShell` never applies `groupWrapper`** (it renders `leaves.map(p => p.render())` only). So mobile *already* doesn't show the footer / safety strip — finish-visit on mobile is the header CTA. **Desktop-only docks preserve mobile behaviour exactly** (DL-7 free).
- **`DesktopShell`'s container is `flex h-full w-full flex-col`** — a top dock (safety) and a bottom dock (footer) slot in as `shrink-0` siblings around the `flex-1` tree with no layout gymnastics.
- **The footer / safety / chart-rail components are unchanged** — they keep their props and their existing landed-telemetry. Phase 4 only moves *where they mount*.

The net new surface area is therefore: **move one provider up, add two desktop-only dock slots to the shell, relocate three components, leaf-anchor one component, slim two `groupWrapper`s, and add a template-invariant guard.** No new component, no new migration, no tree change.

---

## Decision lock

Phase 1's **DL-1..DL-10**, Phase 2's **P2-DL-1..6**, and Phase 3's **P3-DL-1..6** carry forward unchanged. This batch is especially bound by **DL-7 (mobile stays flat)**, **DL-8 (live-consult guard)**, and **DL-9 (pane instances survive re-parenting)** — the chrome lift must not regress any of them.

These six are **Phase-4-specific** decisions, frozen for this batch:

**P4-DL-1: Action chrome docks at shell level, outside the tree.** `SafetyStickyStrip` (top dock) and `PlanActionFooter` (bottom dock) render exactly once, as siblings of the resizable tree inside `DesktopShell` — never inside a `groupWrapper`. They are **consult-scoped, not position-scoped**, so they survive every re-parent by construction (they're not in the tree at all).

**P4-DL-2: The Rx actions bridge wraps the page root.** `RxFormActionsBridgeProvider` moves from `middle-bottom`'s `groupWrapper` to the page-root provider stack (beside `RxFormProvider` / `RxSafetyProvider`). The `RxPane` registrar (`useRegisterRxFormActions`) and the docked footer reader (`useRxFormActions`) then share one provider regardless of tree position. `RxSafetyProvider` is already page-root — no move needed.

**P4-DL-3: Visual chrome is leaf-anchored and travels.** `ChartRailWithEmptyState` moves from the `left-column` group `groupWrapper` to the `snapshot` leaf's `render`, so the empty-state card follows `snapshot` wherever the doctor moves it. No group-level visual chrome remains.

**P4-DL-4: `groupWrapper` survives for pure layout only.** After this batch the *only* legitimate `groupWrapper` is `middle-bottom`'s `@container/middle-bottom` responsive `<div>` (required by `InvestigationsAutoMerge`'s narrow-monitor container query). A `groupWrapper` may **never** carry a context provider or an action/visual component again — enforced by a template-invariant test (cpfg-03).

**P4-DL-5: Docks are desktop-only (inherits DL-7).** `MobileShell` renders no docks; mobile finish-visit stays the header CTA, exactly as today. The dock slots live in `DesktopShell` only.

**P4-DL-6: Zero behavioural change at rest.** With the default layout (no reshaping), the cockpit looks and behaves **pixel-identically** to Phase 3: safety strip pinned above the plan/investigations area, footer pinned below it, empty-state above the chart rail. The lift is invisible until a doctor actually moves a pane — at which point the chrome stays put (footer/safety) or travels (empty-state) instead of breaking.

---

## Why this batch (Phase 4 specifically)

Phases 1-3 delivered the freedom; Phase 4 makes that freedom *safe to use*. Today a doctor can enter customize mode, drag `plan` to the far-left column, and — surprise — the "Send Rx & finish" button is gone, because it lived in a wrapper nailed to the `middle-bottom` group that Plan just left. That is the single most dangerous papercut the vision can ship: a layout edit that silently removes the control that *ends the consult*. The Phase 1 plan called this out explicitly and parked it as Phase 4 precisely so the DnD + customize work could land first without this landmine blocking them.

Three reasons this is the right closing batch:

1. **It's the last load-bearing gap.** Tabs, drag-drop, and customize mode are all shipped and dogfoodable. The one thing standing between "doctors can reshape" and "doctors can reshape *without consequences*" is chrome that doesn't follow the panes. Close it and the program is done.
2. **The fix is mostly already done for us.** The two heavyweight providers (`RxFormProvider`, `RxSafetyProvider`) are already page-root. Only one provider needs lifting, and the components themselves don't change. This is a low-LOC, high-leverage refactor — exactly the kind of debt worth paying down at program close.
3. **It hardens an invariant, not just a screen.** Adding the template-invariant guard (no chrome in `groupWrapper`) means the next person who reaches for `groupWrapper` to mount an action component gets a failing test instead of a production papercut. The batch leaves the codebase safer than it found it.

The architectural shape is "scope chrome to the consult, not to the tree." Action chrome belongs to the *session* (you always need to finish the visit and see safety warnings, regardless of where panes sit), so it docks at the shell. Visual chrome belongs to its *pane* (the empty-state describes the chart), so it anchors to the leaf. After this, `groupWrapper` is reduced to what it should always have been: a pure layout/responsive container.

This batch closes Phase 4 (and the program) with **4 tasks across 3 waves**, **~10-14h wall-clock single-engineer**, **zero new migrations**, **zero backend changes**, **zero Opus build tasks**. The visible artifact at the close-gate: with any reshaped layout (Plan dragged to the left, Rx tabbed under Snapshot, Investigations moved out), the safety strip still pins to the top of the shell, the "Send Rx & finish" footer still pins to the bottom and still sends, and the chart-rail empty-state rides along with `snapshot` — and at the default layout nothing looks different at all.

---

## Cross-cutting acceptance gate (whole batch)

These items must all be green before the batch is considered closed.

### Action chrome lift (`templates.tsx` + `Shell.tsx` + `PatientProfilePage.tsx`)

- [x] `RxFormActionsBridgeProvider` is mounted at the page root (beside `RxFormProvider` / `RxSafetyProvider`), and removed from `middle-bottom`'s `groupWrapper` (P4-DL-2).
- [x] `PatientProfileShell` + `DesktopShell` accept `safetyDock` + `actionDock` (`ReactNode`) slots, rendered **only in `DesktopShell`** as `shrink-0` siblings of the `flex-1` resizable tree (top + bottom respectively), outside `<DndContext>`.
- [x] `SafetyStickyStrip` renders in the top dock; `PlanActionFooter` renders in the bottom dock; both are removed from `middle-bottom`'s `groupWrapper` (P4-DL-1).
- [x] `PatientProfilePage` passes `safetyDock={<SafetyStickyStrip appointmentId={appt.id} />}` and `actionDock={<PlanActionFooter state={state} appointmentId={appt.id} finishBusy={finishBusy} />}`.
- [x] `middle-bottom`'s `groupWrapper` is slimmed to **only** the `@container/middle-bottom` responsive `<div>` (so `InvestigationsAutoMerge`'s narrow-merge container query still works).
- [x] The docked footer reads the live send handlers (`useRxFormActions`) and the docked safety strip reads `useRxSafety()` correctly — verified after dragging `rx` / `plan` out of `middle-bottom`.
- [x] `<MobileShell>` renders no docks (DL-7); mobile finish-visit is the header CTA, unchanged.

### Visual chrome leaf-anchor (`templates.tsx`)

- [x] `ChartRailWithEmptyState` wraps the `snapshot` leaf's `render` (e.g. `render: () => <ChartRailWithEmptyState …><SnapshotPane …/></ChartRailWithEmptyState>`), not the `left-column` group (P4-DL-3).
- [x] `left-column`'s `groupWrapper` is removed; the empty-state card now travels with `snapshot`.
- [x] At the default layout the empty-state still appears in the chart rail (visual parity at rest, P4-DL-6).

### `groupWrapper` invariant (`templates.tsx` + a guard test)

- [x] A template-invariant test asserts that no `PaneDefinition.groupWrapper` in any built-in template renders a context provider or an action/visual component — only pure-layout/responsive `<div>`s are allowed (P4-DL-4).
- [x] Re-parent regression tests: dragging `plan`, `rx`, and `snapshot` into other containers leaves the footer, safety strip, and empty-state rendering correctly.

### Behaviour

- [x] **Default layout: zero visual + behavioural diff from Phase 3** (P4-DL-6).
- [x] Drag `plan` to the left column → "Send Rx & finish" footer is still present at the shell bottom and still sends.
- [x] Drag `rx` into another container (e.g. tab it under `snapshot`) → the footer still reads its send handlers (provider lift, P4-DL-2).
- [x] Trigger a drug-allergy clash → the safety strip pins to the shell top regardless of where `plan` lives.
- [x] Drag `snapshot` out of the chart rail → the empty-state card travels with it (P4-DL-3).
- [x] Live-consult guard (DL-8) intact: `body` still can't move during `state === "live"`; the docked footer behaves identically across states (`canSendPrescription`).
- [x] DL-9 intact: re-parenting doesn't remount pane instances (`pane-<id>` keys unchanged).

### Quality

- [x] `cd frontend; npx tsc --noEmit` clean.
- [x] `cd frontend; npm run lint` clean (warnings only).
- [x] cpfg test suites clean (42 tests: templates invariant + chrome-reparent + Shell-dnd + footer/safety/chart-rail). Full `npm test` hangs on pre-existing `Shell.test.tsx` / `useShellLayout` issue (inbox).
- [x] No new Sentry errors in a 10-min smoke session: reshape the layout several ways, finish a consult, trigger a safety banner, refresh. *(Automated re-parent coverage; manual dogfood recommended.)*
- [x] Existing landed-telemetry preserved at the new mount sites (`r_middle_footer_landed`, `r_middle_safety_landed`, `chart_density_landed`). **No new telemetry event is required** — Phase 4 is a structural refactor; the value is behavioural, not a new signal.

### Documentation

- [x] `docs/Reference/product/cockpit/COCKPIT.md` gains §14 "Chrome docks (Phase 4 of pane freedom)" after §13; §2 "Safety sticky strip" + §3 "Plan action footer" get a one-line "relocated to a shell-level dock in §14 (Phase 4)" note.
- [x] `docs/Work/capture/inbox.md` gains 3-5 lines for post-program follow-ups (per-patient-type layout overrides; preset cap relax; clinic-shared presets; the `groupWrapper` field removal if it ends up fully unused).
- [x] Program close-out note: the pane-freedom vision (Phases 1-4) is complete; future work is polish, not phases.

---

## Phase plan position

This is **Phase 4 of 4 — the final phase.** The full ladder (from the [Phase 1 plan](../p1-tabs/plan-p1-cockpit-pane-freedom-batch.md#phase-plan-whole-vision-four-batches)):

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Tabs foundation + context-menu move | ✅ Shipped (cpf-01..06) |
| Phase 2 | Drag-drop with 5-zone overlay | ✅ Shipped (cpfd-01..05) |
| Phase 3 | Customize mode + preset workflow polish | ✅ Shipped (cpfc-01..05) |
| **Phase 4** | **`groupWrapper` refactor: action chrome → shell-level docks** | ✅ Shipped (cpfg-01..04) — closes the program |

---

## Out-of-scope (rolled forward to follow-up batches)

| Out-of-scope item | Where it lands |
|---|---|
| **Removing the `groupWrapper` field entirely** | Only if cpfg confirms `middle-bottom`'s responsive `<div>` can move to a leaf/`render` too; otherwise the field stays for pure-layout use (capture-inbox it) |
| **Reworking `InvestigationsAutoMerge` to not need a group-level container query** | Follow-up — out of scope; this batch keeps the responsive `<div>` as the one allowed `groupWrapper` |
| **Per-patient-type layout overrides** (acute vs chronic) | Future research batch (already capture-inbox tracked) |
| **Preset cap relax / clinic-shared presets** | Future (already capture-inbox tracked) |
| **Keyboard DnD sensor / per-preset hotkeys** | Phase 3 polish follow-ups (already captured) |
| **Mobile chrome docks** | OUT — preserves DL-7 forever (mobile uses the header CTA) |
| **Any `LayoutTree` / schema / migration change** | OUT — Phase 4 is a chrome re-org, the tree is untouched |

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | cpfg-01 | 1/1 | 0/1 | 0/1 | ~4-5h |
| Wave 2 | cpfg-02, cpfg-03 | 2/2 | 0/2 | 0/2 | ~4-6h (single lane sequential — both touch `templates.tsx`; cpfg-03 tests the cpfg-01+02 result) |
| Wave 3 | cpfg-04 | 0/1 | 1/1 | 0/1 | ~1-2h |
| **Total** | **4** | **3** | **1** | **0** | **~10-14h (~1.5 dev-days single-engineer)** |

Token estimate (rough): ~150k input / ~90k output across the batch. Total batch spend (excluding optional close-gate review): ~$8-12.

**One optional Opus close-gate turn after cpfg-01** budgeted on top. **Recommended** — the action-chrome lift is the only consult-critical, silent-breakage surface in the batch: a mis-scoped `RxFormActionsBridgeProvider` lift, or a footer rendered inside `<DndContext>`/the wrong flex parent, can make "Send Rx & finish" silently inert or visually misplaced without throwing. Skip only if cpfg-01's re-parent tests prove the footer reads its registrar after `rx` is moved out of `middle-bottom`.

---

## Sequencing notes (the why behind the waves)

The 3-wave shape:

- **Wave 1 is the load-bearing, consult-critical lift (cpfg-01).** It moves the provider, adds the dock slots, relocates the footer + safety strip, and slims `middle-bottom`'s `groupWrapper` — **atomically**, because any intermediate state would double-render the footer (dock + groupWrapper) or strand its provider. This is why it is one task, not two.
- **Wave 2 is a single sequential lane (cpfg-02 → cpfg-03).** The chart-rail leaf-anchor (cpfg-02) and the invariant guard + re-parent regression tests (cpfg-03) both touch `templates.tsx`, and cpfg-03's tests assert the *combined* result of cpfg-01 + cpfg-02 — so they run after cpfg-02. No honest second lane — biasing to sequential per [`EXECUTION-ORDER-GUIDELINES.md` §7](../../../../../process/EXECUTION-ORDER-GUIDELINES.md).
- **Wave 2 → Wave 3 is Cut 3 (kind-of-work change).** Wave 2 = Build. Wave 3 = QA + Docs + program close-out.

**Why no Opus build tasks?** Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) hard-rules: no PHI columns, no RLS surface, no migrations, no novel security, no silent-corruption *mutation* (the tree is untouched). The one risk surface (consult-critical provider scoping) is handled with re-parent tests + the optional close-gate review.

---

## References

- [Phase 1 — cockpit-pane-freedom](../p1-tabs/) — vision, DL-1..DL-10, the `PaneDefinition.groupWrapper` field this batch refactors.
- [Phase 2 — p2-cockpit-pane-freedom-dnd](../p2-dnd/) — the drag-drop that made re-parenting routine.
- [Phase 3 — p3-cockpit-pane-freedom-customize](../../cockpit-pane-freedom/p3-customize/) — customize mode; its reshaping is this batch's trigger.
- [`frontend/lib/patient-profile/templates.tsx`](../../../../../../frontend/lib/patient-profile/templates.tsx) — the `groupWrapper` definitions on `left-column` + `middle-bottom` (cpfg-01/02 slim/relocate them).
- [`frontend/components/patient-profile/Shell.tsx`](../../../../../../frontend/components/patient-profile/Shell.tsx) — `DesktopShell` (gets the dock slots) + `MobileShell` (never gets them, DL-7) + the `groupWrapper` consumption site.
- [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx) — page-root provider stack (cpfg-01 lifts `RxFormActionsBridgeProvider` here) + the shell mount (passes the docks).
- [`frontend/components/cockpit/middle/PlanActionFooter.tsx`](../../../../../../frontend/components/cockpit/middle/PlanActionFooter.tsx) — the finish footer (relocated, unchanged).
- [`frontend/components/cockpit/middle/SafetyStickyStrip.tsx`](../../../../../../frontend/components/cockpit/middle/SafetyStickyStrip.tsx) — the safety strip (relocated, unchanged).
- [`frontend/components/cockpit/rx/RxFormActionsContext.tsx`](../../../../../../frontend/components/cockpit/rx/RxFormActionsContext.tsx) — `RxFormActionsBridgeProvider` (lifted to page root).
- [`frontend/components/patient-profile/panes/ChartRailWithEmptyState.tsx`](../../../../../../frontend/components/patient-profile/panes/ChartRailWithEmptyState.tsx) — the visual chrome (leaf-anchored to `snapshot`).
- [`docs/Reference/product/cockpit/COCKPIT.md`](../../../../../../Reference/product/cockpit/COCKPIT.md) — §2/§3 (current strip positions), §13 (Phase 3); cpfg-04 adds §14 + relocation notes.
- [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
- [`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) — wave / lane shape rules.
- Sibling: [`Tasks/EXECUTION-ORDER-p4-cockpit-pane-freedom-chrome.md`](./Tasks/EXECUTION-ORDER-p4-cockpit-pane-freedom-chrome.md) — wave / lane matrix.
