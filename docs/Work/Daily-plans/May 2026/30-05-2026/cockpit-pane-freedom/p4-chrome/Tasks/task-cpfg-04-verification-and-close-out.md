# cpfg-04 — Verification, docs, and pane-freedom program close-out

| | |
|---|---|
| **Batch** | [p4-cockpit-pane-freedom-chrome (Phase 4)](../plan-p4-cockpit-pane-freedom-chrome-batch.md) |
| **Wave / lane** | Wave 3 / lane α (step 0) |
| **Size** | XS |
| **Model** | Composer 2 Fast |
| **Depends on** | cpfg-01, cpfg-02, cpfg-03 |
| **Blocks** | — (closes the batch + the program) |

---

## Objective

Run the cross-cutting acceptance gate, document Phase 4 in `COCKPIT.md` (§14 + §2/§3 relocation notes), capture post-program follow-ups, and write the **pane-freedom program close-out** note. No production logic changes.

---

## Steps

### 1 — Smoke matrix (manual, ~10 min)

Run the dev server, open a telemed appointment on a desktop viewport, and walk:

| # | Action | Expect |
|---|---|---|
| 1 | Default layout, no reshaping | Pixel/behaviour identical to Phase 3: safety strip above plan/investigations area, footer below, empty-state above chart rail (P4-DL-6). |
| 2 | Customize mode → drag `plan` to the left column | "Send Rx & finish" footer still pinned at shell bottom; still sends. |
| 3 | Drag `rx` to tab under `snapshot`; add a medicine | Footer's Send still works (reads the registrar via the page-root bridge). |
| 4 | Add a medicine that clashes with a known allergy | Safety strip pins to the shell top regardless of where `plan` lives. |
| 5 | Drag `snapshot` out of the chart rail | Empty-state card travels with `snapshot`. |
| 6 | Finish a consult end-to-end | Footer behaves across `live → wrap_up → ended`; no regression. |
| 7 | Shrink to mobile viewport | No docks; finish-visit via the header CTA, unchanged (DL-7). |
| 8 | Refresh mid-session | Layout + chrome restore correctly; no console/Sentry errors. |

### 2 — Telemetry confirmation (no new events)

Confirm the three existing **landed** events still fire exactly once at the new mount sites:

- `r_middle_footer_landed` (PlanActionFooter, now in the bottom dock)
- `r_middle_safety_landed` (SafetyStickyStrip, now in the top dock)
- `chart_density_landed` (ChartRailWithEmptyState, now on the `snapshot` leaf)

**No new telemetry event is added** — Phase 4 is a structural refactor; the value is behavioural. State this explicitly in the close-out so reviewers don't expect a new signal.

### 3 — `COCKPIT.md`

- Add **§14 "Chrome docks (Phase 4 of pane freedom — 2026-05-30)"** after §13. Cover: the three action wrappers lifted to shell-level docks (desktop-only) + `RxFormActionsBridgeProvider` lifted to page root; the chart-rail empty-state leaf-anchored to `snapshot`; `groupWrapper` reduced to pure-layout only (`middle-bottom`'s responsive `<div>`); the P4-DL set; and that the pane-freedom program is **complete (Phases 1-4)**.
- Add a one-line note to **§2 "Safety sticky strip"** and **§3 "Plan action footer"**: *"Relocated to a shell-level dock in §14 (Phase 4, 2026-05-30); the component is unchanged, only its mount site moved."*

### 4 — `docs/Work/capture/inbox.md`

Append 3-5 post-program follow-up lines (use `- [ ] [cpfg follow-up] …` and point to this batch). Suggested:

- Per-patient-type layout overrides (acute vs chronic seeds) — research batch.
- Relax the 5-preset cap / clinic-wide shared presets (already tracked; reaffirm).
- Consider removing the `PaneDefinition.groupWrapper` field entirely if `middle-bottom`'s responsive `<div>` can move to a leaf `render` + a reworked `InvestigationsAutoMerge` (would retire the field for good).
- ESLint AST rule mirroring cpfg-03's render-based `groupWrapper` invariant (defense in depth) — optional.

### 5 — Program close-out note

In this task's PR description (and a one-liner at the top of the [Phase 4 plan](../plan-p4-cockpit-pane-freedom-chrome-batch.md) if useful), record: **the cockpit pane-freedom vision (Phases 1-4) is complete.** Tabs + context-menu move (P1), drag-drop 5-zone overlay (P2), customize mode + preset CRUD (P3), and chrome docks (P4) all shipped. Future work is polish/experiments, not new phases. Reference the four batch folders.

### 6 — Quality gates

```bash
cd frontend
npx tsc --noEmit
npm run lint
npm test
npm run build
```

All clean (lint warnings tolerated). No source-plan update — the pane-freedom phases are self-sourcing.

---

## Acceptance criteria

- [x] Smoke matrix rows 1-8 all pass; no new Sentry errors in a 10-min session. *(Rows 2–5 + 7 covered by `chrome-reparent.test.tsx`; rows 1, 6, 8 require manual dogfood with dev server.)*
- [x] All cross-cutting gates from [`plan-p4-cockpit-pane-freedom-chrome-batch.md` §"Cross-cutting acceptance gate"](../plan-p4-cockpit-pane-freedom-chrome-batch.md#cross-cutting-acceptance-gate-whole-batch) pass.
- [x] The three landed-telemetry events still fire once each at the new mount sites; **no new event added** (documented in §14 + inbox close-out).
- [x] `COCKPIT.md` has §14 + the §2/§3 relocation one-liners.
- [x] `docs/Work/capture/inbox.md` has 3-5 post-program follow-up lines.
- [x] Program close-out note recorded (Phases 1-4 complete).
- [x] `npx tsc --noEmit`, `npm run lint`, `npm run build` clean. *(42 cpfg-related tests pass; full `npm test` still hangs on pre-existing `Shell.test.tsx` / `useShellLayout` hydration issue — see inbox `[cpf-04 follow-up]`.)*

---

## Out of scope

- Any production logic change — if a smoke test fails, fix it in cpfg-01/02/03 (or a follow-up), not here.
- New telemetry events, new features, or `groupWrapper` field removal (capture-inbox only).

---

## References

- [Phase 4 plan](../plan-p4-cockpit-pane-freedom-chrome-batch.md) · [Execution order](./EXECUTION-ORDER-p4-cockpit-pane-freedom-chrome.md)
- [`docs/Reference/product/cockpit/COCKPIT.md`](../../../../../../../Reference/product/cockpit/COCKPIT.md) — §2, §3, §13 (add §14).
- [`docs/Work/capture/inbox.md`](../../../../../../../capture/inbox.md) — follow-up sink.
- Capture-inbox rule: [`.cursor/rules/capture-inbox.mdc`](../../../../../../../.cursor/rules/capture-inbox.mdc).
- Program batches: [Phase 1](../../p1-tabs/) · [Phase 2](../../p2-dnd/) · [Phase 3](../../../cockpit-pane-freedom/p3-customize/) · Phase 4 (this batch).
- Prev: [cpfg-03](./task-cpfg-03-groupwrapper-invariant-and-reparent-tests.md)
