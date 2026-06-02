# Cockpit pane freedom — Phase 4 (chrome lift) execution order — 30 May 2026 batch

> **Sibling plan doc:** [`../plan-p4-cockpit-pane-freedom-chrome-batch.md`](../plan-p4-cockpit-pane-freedom-chrome-batch.md). The plan answers "what + why" + how Phase 4 closes the four-phase vision; this doc answers "who-runs-what-when" + which model.
>
> **Authoring conventions:** [`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`](../../../../../EXECUTION-ORDER-GUIDELINES.md). Biased to single sequential lanes — the batch concentrates on `templates.tsx` + the shell chrome surface, so there is no honest second lane.
>
> **Cost-aware model strategy:** [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR: zero Opus build tasks; three Auto (cpfg-01..03) + one Composer 2 Fast (cpfg-04). One optional Opus close-gate after Wave 1 (consult-critical provider scoping).
>
> **Builds on Phases 1-3 (all landed).** Tabs, drag-drop, and customize mode are merged. This batch closes the program.
>
> **Phase scope:** This doc covers **Phase 4 only** — the final phase.

---

## Wave plan (3 waves)

```
Wave 1 (Action chrome lift — ~4-5h, single lane sequential, consult-critical):
  Lane α  ──── cpfg-01 (L, Auto)

                                  ── optional Opus close-gate review here ──

Wave 2 (Visual leaf-anchor + invariant guard — ~4-6h, single lane sequential):
  Lane α  ──── cpfg-02 (M, Auto) ──> cpfg-03 (S, Auto)

Wave 3 (Verify + docs + program close-out — ~1-2h, single lane sequential):
  Lane α  ──── cpfg-04 (XS, Composer 2 Fast)
```

**Total wall-clock with parallelism:** ~10-14h (no parallelism — single lane throughout).
**Total agent-time (sequential equivalent):** ~10-14h.

The bottleneck is **Wave 1 (cpfg-01)** — the atomic, consult-critical action-chrome lift. It is the batch's heaviest and highest-stakes task; everything after is verification-and-polish on top of it.

---

## Lane-by-lane details

### Wave 1 — Action chrome lift (single lane sequential, consult-critical)

**Goal:** Lift the Rx-actions bridge to the page root, add desktop-only dock slots, relocate the footer + safety strip into them, and slim `middle-bottom`'s `groupWrapper` — atomically.

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [cpfg-01](./task-cpfg-01-action-chrome-shell-docks.md) | L | Auto | `templates.tsx` (`middle-bottom` groupWrapper), `Shell.tsx` (`DesktopShell` return + `MobileShell`), `PatientProfilePage.tsx` (provider stack + shell mount), `PlanActionFooter.tsx`, `SafetyStickyStrip.tsx`, `RxFormActionsContext.tsx` | **Atomic** — provider lift + dock slots + relocate both strips + slim groupWrapper in one task (any split double-renders the footer). |

**Acceptance gate (Wave 1 close):**

- [x] `RxFormActionsBridgeProvider` mounted at page root; removed from `middle-bottom` groupWrapper (P4-DL-2).
- [x] `PatientProfileShell` + `DesktopShell` take `safetyDock` + `actionDock` slots, rendered desktop-only as `shrink-0` siblings of the `flex-1` tree, outside `<DndContext>` (P4-DL-1, P4-DL-5).
- [x] `SafetyStickyStrip` (top) + `PlanActionFooter` (bottom) render in the docks; removed from the groupWrapper.
- [x] `middle-bottom`'s groupWrapper slimmed to only the `@container/middle-bottom` responsive `<div>` (P4-DL-4 keeps the narrow-merge query working).
- [x] Default layout: zero visual/behavioural diff (P4-DL-6). Reshaped layout: footer reads its registrar after `rx` is moved out of `middle-bottom`; safety strip pins to shell top regardless of `plan` position.
- [x] `<MobileShell>` renders no docks (DL-7).
- [x] `cd frontend; npx tsc --noEmit` + targeted footer/safety tests clean.

### Wave 2 — Visual leaf-anchor + invariant guard (single lane sequential)

**Goal:** Leaf-anchor the chart-rail empty-state to `snapshot`, then lock in the whole batch with a `groupWrapper` invariant + re-parent regression tests.

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [cpfg-02](./task-cpfg-02-chart-rail-leaf-anchor.md) | M | Auto | `templates.tsx` (`left-column` groupWrapper + `snapshot` leaf), `ChartRailWithEmptyState.tsx` | Move the wrapper from the `left-column` group to the `snapshot` leaf's `render`; remove `left-column`'s groupWrapper. |
| 1 | [cpfg-03](./task-cpfg-03-groupwrapper-invariant-and-reparent-tests.md) | S | Auto | `templates.tsx`, the built-in templates, a test harness for the layout tree | Template-invariant test (no provider/action/visual chrome in any groupWrapper) + re-parent regression tests (drag plan/rx/snapshot → footer/safety/empty-card still render). |

**Acceptance gate (Wave 2 close):**

- [x] All Wave 1 gates still green.
- [x] `ChartRailWithEmptyState` wraps the `snapshot` leaf's `render`; `left-column`'s groupWrapper removed (P4-DL-3).
- [x] Default layout: empty-state still shows in the chart rail (parity, P4-DL-6).
- [x] Template-invariant test: no built-in template's `groupWrapper` carries a context provider or action/visual component — only pure-layout `<div>`s (P4-DL-4).
- [x] Re-parent regression tests pass for `plan` / `rx` / `snapshot`.
- [x] `cd frontend; npx tsc --noEmit` + the new template + Shell tests clean.

### Wave 3 — Verify + docs + program close-out (single lane sequential)

**Goal:** Cross-cutting gate, COCKPIT.md §14 + §2/§3 relocation notes, capture follow-ups, program close-out.

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [cpfg-04](./task-cpfg-04-verification-and-close-out.md) | XS | Composer 2 Fast | `COCKPIT.md` §2/§3/§13, `docs/Work/capture/inbox.md`, the smoke matrix in this doc | Docs + smoke + program close-out. No production logic changes. |

**Acceptance gate (Wave 3 close):**

- [x] All Wave 2 gates still green.
- [x] All cross-cutting gates from [`plan-p4-cockpit-pane-freedom-chrome-batch.md` §"Cross-cutting acceptance gate"](../plan-p4-cockpit-pane-freedom-chrome-batch.md#cross-cutting-acceptance-gate-whole-batch) pass.
- [x] Existing landed-telemetry still fires at the new mount sites (`r_middle_footer_landed`, `r_middle_safety_landed`, `chart_density_landed`); no new event required.
- [x] `docs/Reference/product/cockpit/COCKPIT.md` has §14 + the §2/§3 relocation one-liners.
- [x] `docs/Work/capture/inbox.md` has 3-5 post-program follow-up lines.
- [x] `cd frontend; npx tsc --noEmit`, `npm run lint`, cpfg test suites, `npm run build` all clean.
- [x] **No source plan update** — the pane-freedom phases are self-sourcing; program complete.

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| cpfg-01 | L | Auto | Mechanical but wide refactor (provider move + dock slots + relocate two components + slim groupWrapper). Consult-critical → optional Opus close-gate after. |
| cpfg-02 | M | Auto | Move one wrapper from a group to a leaf `render`; small and contained. |
| cpfg-03 | S | Auto | Test-only — a template-invariant assertion + re-parent regression cases. |
| cpfg-04 | XS | Composer 2 Fast | Docs + smoke + program close-out; no judgement-heavy code. |

**Caps check:** zero Opus build tasks (≤1/wave, ≤2/batch satisfied trivially). One optional Opus close-gate review turn after cpfg-01 (not a build task).

---

## Optional close-gate review turn

Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md` "Use Opus sparingly"](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

**Recommended after cpfg-01 (end of Wave 1).** The action-chrome lift is the only consult-critical, silent-breakage surface in the batch — "Send Rx & finish" is how a doctor ends a visit, and a mis-scoped provider lift or a footer in the wrong flex/DnD parent can make it inert or misplaced without throwing. Budget ~1 Opus chat / ~10k tokens focused on:

1. **Provider scoping** — the docked footer reads its `RxFormActionsContext` registrar after `rx` is dragged out of `middle-bottom` (the registrar and reader share the page-root provider).
2. **No double-render** — the footer/safety strip render exactly once (dock only; not also in the groupWrapper).
3. **Flex/DnD placement** — docks are `shrink-0` siblings of the `flex-1` tree, outside `<DndContext>`; the tree still scrolls between them.
4. **Mobile + state parity** — `MobileShell` renders no docks; footer visibility across `ready/lobby/live/wrap_up/ended/terminal` is unchanged.

Skip if cpfg-01's re-parent tests cover provider scoping + single-render explicitly.

---

## Critical path

`cpfg-01 → cpfg-02 → cpfg-03 → cpfg-04`. Fully sequential. Single-engineer wall-clock ~10-14h. No parallelism credit — Wave 2 touches `templates.tsx` (shared with Wave 1) and cpfg-03 verifies the combined cpfg-01+02 result.

---

## Anti-goals

- ❌ Don't split cpfg-01 — the lift must be atomic or the footer double-renders mid-batch.
- ❌ Don't render docks on `<MobileShell>` — DL-7; mobile finish-visit is the header CTA.
- ❌ Don't change the `LayoutTree` / schema / add a migration — Phase 4 is a chrome re-org.
- ❌ Don't leave any action/context chrome in a `groupWrapper` — only the responsive `<div>` survives (P4-DL-4).
- ❌ Don't add a new telemetry event — preserve the existing landed events at their new sites.
- ❌ Don't regress DL-8 (live `body` move guard) or DL-9 (no remount on re-parent).
- ❌ Don't refactor `InvestigationsAutoMerge` / the container-query merge — out of scope; keep the responsive `<div>`.

---

## Notes for the executor

- **Branch off `main` (Phases 1-3 merged) for Wave 1.** cpfg-01 touches `templates.tsx`, `Shell.tsx`, `PatientProfilePage.tsx` (+ reads the footer/safety/bridge components, which don't change).
- **The hard part is provider scoping, not layout.** `RxFormProvider` + `RxSafetyProvider` are already page-root; only `RxFormActionsBridgeProvider` moves. React context follows the rendered hierarchy — a footer element created in the page and passed as `actionDock` consumes context from where `DesktopShell` renders it (inside the page providers), so the lift is sound. Verify with a re-parent test, not by reasoning alone.
- **Atomicity matters.** Add the dock slots AND relocate the strips AND slim the groupWrapper in one commit — never leave the footer rendering in both the dock and the groupWrapper.
- **`MobileShell` is your DL-7 proof.** It renders `leaves.map(p => p.render())` with no `groupWrapper` — so it already never showed the footer/safety. Don't add docks to it.
- **Keep the responsive `<div>`.** `middle-bottom`'s `@container/middle-bottom` div drives `InvestigationsAutoMerge`'s `@[720px]` query. Slim the groupWrapper down to *just* that div — don't delete it.
- **Leaf-anchor, don't duplicate.** `ChartRailWithEmptyState` moves to `snapshot`'s `render`; remove it from `left-column`. The empty-signals hook spans the whole chart, so anchoring to `snapshot` keeps the signal correct while making the card travel.
- **Preserve telemetry.** The three components keep their `useEffect` landed-telemetry; lifting them changes the mount site, not the event. Confirm they still fire once.

---

## References

- [`../plan-p4-cockpit-pane-freedom-chrome-batch.md`](../plan-p4-cockpit-pane-freedom-chrome-batch.md) — Phase 4 plan (what + why + decision lock).
- [Phase 3 batch](../../../cockpit-pane-freedom/p3-customize/) — customize mode; its reshaping is this batch's trigger.
- [Phase 2 batch](../../p2-dnd/) — the drag-drop layer.
- [Phase 1 batch](../../p1-tabs/) — the vision + the `groupWrapper` field.
- [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../EXECUTION-ORDER-GUIDELINES.md) — wave / lane shape rules.
- [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
- Sibling exec-order (prior phase): [Phase 3 EXECUTION-ORDER](../../../cockpit-pane-freedom/p3-customize/Tasks/EXECUTION-ORDER-p3-cockpit-pane-freedom-customize.md).
