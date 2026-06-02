# Patient profile shell rebuild — 13 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Fresh chat per task, smallest model that can solve the problem, deterministic verifications. The new-shell task (**ppr-03**) is the only Opus 4.7 task; everything else is Sonnet 4.6.
>
> **Source plan:** [`Product plans/plan-patient-profile-shell-rebuild.md`](../../../Product%20plans/plan-patient-profile-shell-rebuild.md). Decision locks `DL-1..DL-13` and items `R1..R5` originate there.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-patient-profile-shell-rebuild.md`](./Tasks/EXECUTION-ORDER-patient-profile-shell-rebuild.md).
>
> **Mid-batch amendment:** Wave 4 (`ppr-11` parity QA) surfaced 6 systemic bugs in the strip+chevron collapse model. After conversation with the user, the model was scrapped and replaced with a **toggle-bar visibility model**. See [§ Mid-batch amendment](#mid-batch-amendment-toggle-bar-redesign-ppr-15) below for the full rationale, plus the new sub-tasks `ppr-15a..15e`. The original DL-6 (uniform 40px collapse) is **superseded by DL-6′** (toggle bar; no collapsed strips).

---

## Why this batch

After this week's bug-fix round on `ConsultationCockpit.tsx`, the cockpit shell hosts four overlapping layout systems in one 2,548-LOC file (three-pane resize, side-rail collapse, slot reorder, middle-column directional collapse). Each layer reads and writes a piece of `CockpitLayout`, and each must defend against the others. The result is a layout state machine that:

1. Reproducibly leaks "wrong column collapses on drag after reorder" bugs.
2. Carries debug instrumentation (`?cockpitDbg=1`) that can't be safely removed.
3. Inlines `BodyColumnContent` / `RxColumnContent` so they can't be unit-tested.
4. Couples shell to content via `ColumnType`, so adding a 4th pane (the user has explicitly named AI chat) means touching every guard in the file.

This batch ships the Strangler Fig rebuild from the source product plan:

- **New shell** at `frontend/components/patient-profile/Shell.tsx` (~250 LOC target).
- **Built side-by-side** at `/dashboard/appointments/[id]/v2`.
- **Content components ported by reference** — no rewrites.
- **Parity QA** on a 6 × 3 × 6 matrix.
- **Flip** at `/dashboard/appointments/[id]`; `?v1=1` escape hatch for one release.
- **Delete** the 2,548-LOC `ConsultationCockpit.tsx` + 344-LOC `cockpit-layout.ts` + 4 obsoleted helpers + 3 collapsed-rail helpers (Wave 4.5 amendment). Net **−~3,400 LOC**.

**19 tasks across 6 waves** (was 14 tasks / 5 waves before the Wave 4.5 amendment), ~6 dev-days wall-clock, single-lane sequential per wave.

---

## Decision lock (copied from source plan, frozen for batch duration)

These match `DL-1..DL-13` in [`plan-patient-profile-shell-rebuild.md`](../../../Product%20plans/plan-patient-profile-shell-rebuild.md). Re-opening any of them belongs in a new batch.

- **DL-1: Strangler Fig migration.** New shell at `/dashboard/appointments/[id]/v2`. Both pages coexist briefly. Flip default; keep `?v1=1` for one release; delete old shell.
- **DL-2: Shell knows zero medical concepts.** `<PatientProfileShell>` must compile against a blank project — no imports from `@/components/consultation/**`, `@/components/ehr/**`, `@/lib/consultation/**`, `@/types/appointment.ts`. Enforced by an ESLint zone (ppr-01).
- **DL-3: Content components ported by reference.** Every component in the 🟢 list is imported as-is. The 5-day estimate depends on this.
- **DL-4: `PaneDefinition` is the only contract.** Shape: `{ id, title, render, collapsedRender?, minSizePct?, naturalSizePct?, canCollapse?, hotkey? }`. Adding a 4th pane = one diff. No `ColumnType` enum.
- **DL-5: Horizontal-only in v1.** Recursive `children?: PaneDefinition[]` shipping later; v1 ships exactly the columns the user has today.
- **DL-6: Uniform 40px collapse.** No middle-vs-side rule. No directional collapse. Adjacent-pane absorber rule (left-to-right scan), spacer panel absorbs leftover.
  - **⚠️ SUPERSEDED by DL-6′ (Wave 4.5).** See [§ Mid-batch amendment](#mid-batch-amendment-toggle-bar-redesign-ppr-15). The 40px-strip model proved structurally bug-prone in QA; toggle-bar visibility replaces it.
- **DL-6′ (Wave 4.5 amendment): Toggle-bar visibility, no collapsed strips.** Panes are either fully visible (in the resizable layout, summing to 100%) or fully hidden (removed from the layout entirely). A `<PaneToggleBar>` in the center of `<CockpitHeader>` controls visibility (one icon+label button per pane). The toggle bar doubles as a mini-layout map: drag a toggle icon to reorder columns; drag a column header to reorder both. Empty state when all panes hidden. No spacer panel; no chevrons; no absorber math; no drag-to-collapse threshold. The shell renders only visible panes.
- **DL-7: New layout state — `{ paneOrder: string[]; paneState: Record<id, { sizePct, collapsed }> }`.** Replaces the 4-tuple `CockpitLayout`.
- **DL-8: Presets translated on load.** Built-in (Triage / Consult / Document) re-authored. Custom presets stored under the same `doctor_settings.cockpit_layout_presets` column; v1-shape rows translated on read; v2 rows tagged with `version: 2`.
- **DL-9: New localStorage namespace.** Canonical key: `patient-profile:v1:layout`. Old keys read once on first v2 load as a seed.
- **DL-10: No backend changes.** Same APIs, schema, migrations. Translation is client-side.
- **DL-11: Mobile fallback unchanged.** `<lg` keeps `<MobilePillBar>` + page-scroll.
- **DL-12: Component name = `PatientProfileShell`.** Lives under `frontend/components/patient-profile/`. `cockpit/` folder gets deleted; surviving green-grade files move to neutral homes.
- **DL-13: AI chat / 4th tab is OUT of scope for v1.** The contract accommodates it without rework.

Decisions explicitly **not** in scope for this batch (deferred):

- **AI chat 4th pane** (DL-13). Adds in a follow-up plan once the AI assist surface is specified.
- **Vertical split inside a column** (DL-5). Requires recursive `PaneDefinition`; ships when the user prioritises history-above / treatment-below.
- **Tabs inside a pane.** Alternative to vertical split; decide one or the other before promoting.
- **Tablet (`md..lg`) split layout.** Today tablet inherits the mobile pattern.
- **Per-doctor server-side default pane order.** Today the default is `chart → body → rx`; custom presets cover the customisation need.
- **Cascading drag-to-collapse across three columns** ([inbox.md L278](../../../../capture/inbox.md)). Will be easier on the new shell but still out of v1.

---

## Phases

### Wave 1 — Foundation (3 tasks, ~1 day, sequential single lane)

The keystone. Wave 1 ships a working shell at `/v2` with three synthetic `<div>` panes that has zero medical imports. Everything downstream is mechanical wiring on top.

- [`task-ppr-01-new-route-and-page-shell.md`](./Tasks/task-ppr-01-new-route-and-page-shell.md) — XS — New route `/dashboard/appointments/[id]/v2/page.tsx` (server component mirrors v1). Empty `<PatientProfilePage>` client island. ESLint `no-restricted-paths` zone (DL-2 enforced).
- [`task-ppr-02-pane-definition-and-use-shell-layout.md`](./Tasks/task-ppr-02-pane-definition-and-use-shell-layout.md) — S — `PaneDefinition` types + `useShellLayout` hook in `frontend/lib/patient-profile/`. Pure types + state. Unit-tested.
- [`task-ppr-03-patient-profile-shell.md`](./Tasks/task-ppr-03-patient-profile-shell.md) — **L, Opus 4.7** — The shell itself. `<ResizablePanelGroup>` + spacer + dnd-kit reorder + collapse + persistence. Renders synthetic `<div>` panes only. End-of-task: `/v2` works with three coloured boxes, drag, resize, collapse, reorder.

### Wave 2 — Content panes (4 tasks, ~1 day, 2 parallel lanes)

Extract the inline pane functions from `ConsultationCockpit.tsx` into standalone files (both v1 and v2 will import them during the transition), then plug them into the shell.

- [`task-ppr-04-extract-consultation-body-pane.md`](./Tasks/task-ppr-04-extract-consultation-body-pane.md) — M — Lift `BodyColumnContent` (~400 LOC inside `ConsultationCockpit.tsx`) into `frontend/components/patient-profile/panes/ConsultationBodyPane.tsx` with explicit props. v1 imports it; behaviour unchanged.
- [`task-ppr-05-extract-rx-pane.md`](./Tasks/task-ppr-05-extract-rx-pane.md) — S — Same pattern for `RxColumnContent` → `RxPane.tsx`.
- [`task-ppr-06-patient-chart-pane-wrapper.md`](./Tasks/task-ppr-06-patient-chart-pane-wrapper.md) — XS — Thin `<PatientChartPane>` wrapper over `<AppointmentChartRail>` + its `collapsedRender` sibling.
- [`task-ppr-07-plug-panes-and-header-strip.md`](./Tasks/task-ppr-07-plug-panes-and-header-strip.md) — S — Construct the `panes: PaneDefinition[]` array in `<PatientProfilePage>`. Mount `<PatientProfileHeader>` + `<QueueRail>` above the shell. End-of-Wave-2: `/v2` renders real medical content in three resizable / reorderable / collapsible columns.

### Wave 3 — State, persistence, presets, hotkeys (3 tasks, ~1 day, sequential single lane)

- [`task-ppr-08-layout-module-and-localstorage-seed.md`](./Tasks/task-ppr-08-layout-module-and-localstorage-seed.md) — S — `frontend/lib/patient-profile/layout.ts`. New shape, `validateLayout`, `layoutsEqual`, absorber rule. One-time read of old localStorage keys to seed v2 on first load.
- [`task-ppr-09-preset-translation-and-apply.md`](./Tasks/task-ppr-09-preset-translation-and-apply.md) — M — Built-in presets re-authored. Translation helper `translateLegacyPreset(oldShape) → newShape`. `usePatientProfilePresets` hook calls the same `/v1/settings/doctor/cockpit-presets` endpoint, tags new writes with `version: 2`.
- [`task-ppr-10-hotkeys-and-walkin-mode.md`](./Tasks/task-ppr-10-hotkeys-and-walkin-mode.md) — S — Hotkeys ported (`[`, `]`, `Cmd/Ctrl+Shift+1..3`, `Cmd/Ctrl+Enter`). Walk-in branch via `panes.filter(p => p.id !== "chart")`.

### Wave 4 — Parity QA, partial pass (1 task, ~0.5 day, sequential single lane)

- [`task-ppr-11-parity-qa-matrix.md`](./Tasks/task-ppr-11-parity-qa-matrix.md) — M — Walk the 6 cockpit states × 3 modes × 6 column permutations matrix side-by-side on `/v1` and `/v2`. Mobile parity. Drag / resize / collapse / preset smoke tests. Fix every gap found. **No code from earlier waves changes during ppr-11 unless a parity bug forces it.**
  - **Status:** paused after Matrix A passed and F1+F2 fixes merged. Matrix B/C uncovered F4-F9 (collapse-system bugs) → Wave 4.5 replaces the model. Ppr-11 resumes in Wave 4.6.

### Wave 4.5 — Toggle-bar redesign (5 tasks, ~0.75 day, sequential single lane)

See [§ Mid-batch amendment](#mid-batch-amendment-toggle-bar-redesign-ppr-15) above for the full rationale. Single PR (`feature/ppr-toggle-bar-redesign`) stacks all five sub-tasks.

- [`task-ppr-15a-schema-migration.md`](./Tasks/task-ppr-15a-schema-migration.md) — S — Rename `collapsed` → `hidden`, bump storage `version: 2` → `3`, add `icon?: LucideIcon`, v2→v3 auto-migration in `validateLayout`. No visual change.
- [`task-ppr-15b-pane-toggle-bar.md`](./Tasks/task-ppr-15b-pane-toggle-bar.md) — M — `<PaneToggleBar>` standalone component. Mirrors `<MobilePillBar>` pattern. Drag-reorder + click-toggle + ARIA. Not mounted yet.
- [`task-ppr-15c-shell-slim.md`](./Tasks/task-ppr-15c-shell-slim.md) — M — Slim `<PatientProfileShell>` (delete ~190 LOC of strip+chevron+absorber+spacer+drag-lock). Add `centerSlot` prop on `<CockpitHeader>`. Mount toggle bar.
- [`task-ppr-15d-presets-and-hotkeys.md`](./Tasks/task-ppr-15d-presets-and-hotkeys.md) — S — Re-author 3 built-in presets as full snapshots. Reinterpret `[`/`]` as hide-leftmost / hide-rightmost. Add `Cmd/Ctrl+1/2/3` toggles.
- [`task-ppr-15e-live-consult-guard.md`](./Tasks/task-ppr-15e-live-consult-guard.md) — S — Live-consult warning dialog when hiding Consultation during a `live` appointment. Update ppr-11 matrix + failure log. Add follow-ups to capture/inbox.md.

### Wave 4.6 — Parity QA re-run (~0.5 day, single lane)

- ppr-11 re-walked against the updated matrix. ~30-45 min if Wave 4.5 lands clean.

### Wave 5 — Flip and delete (3 tasks, ~1 day, sequential single lane, with a release-window gate)

- [`task-ppr-12-flip-default-and-escape-hatch.md`](./Tasks/task-ppr-12-flip-default-and-escape-hatch.md) — XS — Edit `[id]/page.tsx` so the default is `<PatientProfilePage>`. Add `?v1=1` escape hatch.
- [`task-ppr-13-rename-green-grade-files.md`](./Tasks/task-ppr-13-rename-green-grade-files.md) — S — Move + rename the green-grade files to neutral homes (`cockpit-state.ts` → `patient-profile/state.ts`, `CockpitHeader` → `PatientProfileHeader`, etc.). Pure renames; no behaviour change.
- [`task-ppr-14-delete-old-shell-and-cleanup.md`](./Tasks/task-ppr-14-delete-old-shell-and-cleanup.md) — S — After the kill-switch window, `git rm ConsultationCockpit.tsx`, `cockpit-layout.ts`, the four obsoleted helpers, the debug instrumentation, and resolve the git-status leftovers. Tick off the inbox debt items.
  - **Wave 4.5 amendment:** also delete `RailCollapsedStub.tsx`, `CollapsedChartRail.tsx`, `CollapsedRxRail.tsx` — they were the v1 collapsed-render path and become unreferenced once the v1 shell is gone.

---

## Mid-batch amendment: Toggle-bar redesign (ppr-15)

### Why we re-cut mid-batch

`ppr-11`'s parity QA pass (Wave 4) walked Matrix A cleanly (state × modality combinations). Two small parity bugs surfaced (F1: squeezed layout, F2: doubled "Patient chart" header) and were fixed in place. F3 (a hydration warning on video) self-resolved after F2.

When we hit Matrix B (column permutations) and Matrix C (collapse cascades), six **structural** bugs surfaced in rapid succession (F4-F9):

1. **F4** — drag-to-collapse didn't lock the resulting strip.
2. **F5** — chevron direction logic wrong (all pointed left regardless of slot).
3. **F6** — middle slot only had one chevron; couldn't collapse to either side.
4. **F7** — multi-collapse left visible gap to the right viewport edge.
5. **F8** — collapsing the lone-expanded pane produced a wide strip instead of 40px.
6. **F9** — collapsing left then middle un-collapsed left.

These are not bugs in the same fix-able sense as F1/F2 — they are **symptoms of the underlying model**. Strips + chevrons + adjacent absorber + trailing spacer + drag-threshold = four overlapping width systems each writing into `paneState.collapsed` with different invariants. The matrix that works is necessarily small.

The user proposed (and after collaborative design we landed on) replacing the model entirely:

- **No collapsed strips.** Hidden panes are removed from the layout flow.
- **Toggle bar in `<CockpitHeader>` center** controls visibility (Cursor-inspired pill bar; mirrors the existing `<MobilePillBar>` pattern from mobile).
- **Toggle bar is also a mini-layout map** — drag toggles to reorder columns, and drag column headers to reorder toggles in lockstep.
- **Visible panes always sum to 100%** — no spacer panel, no leftover gap.
- **Empty state** when all panes hidden — friendly note + arrow pointing at the toggle bar.
- **Re-show restores the persisted size** of the re-shown pane and rebalances the others.

### Design decisions locked during the conversation (Q1-Q10)

| # | Question | Decision |
|---|---|---|
| Q1 | Toggle bar location? | Center of `<CockpitHeader>` (between patient info and status/actions). |
| Q2 | Can Consultation be hidden? | Yes — any pane can be hidden. Empty state when all are hidden. |
| Q3 | Toggle bar drag-and-drop semantics? | Mini-layout map: dragging a toggle icon reorders columns; dragging a column header reorders icons. Both fire `reorderPane`. |
| Q4 | What happens to a re-shown pane's size? | Restore last persisted `sizePct`; rebalance others to sum=100. |
| Q5 | Replace `collapsed` field? | Yes — `collapsed: boolean` becomes `hidden: boolean`. Resize still supported on visible panes. |
| Q6 | How do presets interact with hidden bits? | **Model B:** all built-in presets always offered; applying a preset replaces both `paneOrder` and `paneState.hidden` (full snapshot). |
| Q7 | Hotkey reinterpretation? | `[`/`]` become hide-leftmost / hide-rightmost. New `Cmd/Ctrl+1/2/3` toggle pane[0/1/2] visibility. `Cmd/Ctrl+Shift+1/2/3` keep meaning "apply preset". |
| Q8 | Walk-in mode toggle bar? | Out of scope for this batch; defer. |
| Q9 | Future panes (AI chat, history)? | Plug into the toggle bar by passing a 4th+ entry in `panes`. The bar already iterates dynamically. |
| Q10 | Visual density on overflow? | Recommendation accepted: icon-only at narrow widths (with `title` tooltip). Wired when a 4th pane lands; for 3 panes the labels fit. |

### Soft concerns acknowledged

- **Live consult guard.** Hiding the Consultation pane during a `live` appointment shows an `<AlertDialog>` ("Consultation is currently active. Hide anyway?") on the toggle-bar click path. Hotkey + preset paths bypass deliberately (power-user shortcuts; can revisit if user-test feedback flags).
- **Toggle preference persistence.** Already covered by the existing localStorage layout key (`patient-profile:v1:layout`) — `hidden` bits round-trip with `sizePct` and `paneOrder`.

### Wave 4.5 sub-tasks

Five Sonnet 4.6 tasks, single lane sequential, single PR (`feature/ppr-toggle-bar-redesign`):

- [`task-ppr-15a-schema-migration.md`](./Tasks/task-ppr-15a-schema-migration.md) — S — Rename `collapsed` → `hidden`, bump `version: 2` → `3`, add `icon?: LucideIcon` to `PaneDefinition`, v2→v3 auto-migration in `validateLayout`. **No visual change.**
- [`task-ppr-15b-pane-toggle-bar.md`](./Tasks/task-ppr-15b-pane-toggle-bar.md) — M — Standalone `<PaneToggleBar>` component. Mirrors `<MobilePillBar>` pattern. Drag-reorder + click-toggle + ARIA. Not mounted yet.
- [`task-ppr-15c-shell-slim.md`](./Tasks/task-ppr-15c-shell-slim.md) — M — Slim `<PatientProfileShell>` (delete ~190 LOC: strips, chevrons, absorber, spacer, drag-lock). Add `centerSlot` prop on `<CockpitHeader>`. Mount toggle bar in `<PatientProfilePage>`. **The visible cut-over.**
- [`task-ppr-15d-presets-and-hotkeys.md`](./Tasks/task-ppr-15d-presets-and-hotkeys.md) — S — Re-author 3 built-in presets as full snapshots. Reinterpret `[`/`]`. Add `Cmd/Ctrl+1/2/3`.
- [`task-ppr-15e-live-consult-guard.md`](./Tasks/task-ppr-15e-live-consult-guard.md) — S — Live-consult warning dialog. Update ppr-11 matrix + failure log. Add follow-ups to capture/inbox.md.

After Wave 4.5, ppr-11 is **re-run** (Wave 4.6) against the updated matrix. Then the original Wave 5 (`ppr-12 → 13 → 14`) proceeds unchanged, with one addition: ppr-14 also deletes `RailCollapsedStub.tsx` / `CollapsedChartRail.tsx` / `CollapsedRxRail.tsx` (no longer referenced).

### Net impact on the batch

| Metric | Before amendment | After amendment |
|---|---|---|
| Total tasks | 14 | **19** (added 15a-e) |
| Opus tasks | 1 (ppr-03) | **1** (no change — design locked in conversation, not deferred to agent) |
| Wall-clock | ~5 dev-days + release window | ~6 dev-days + release window (+0.75d for Wave 4.5, +0.5d for QA re-run) |
| Net LOC change at batch end | ~−3,200 | **~−3,400** (Wave 4.5 deletes ~190 LOC from `Shell.tsx`, ppr-14 deletes 3 more files) |
| Failure modes that survive into prod | F4-F9 (collapse system) | **None** — the failure modes are structurally impossible after Wave 4.5 |

---

## Cross-cutting acceptance gate (whole batch)

Before declaring this batch shipped, all of the following must be true:

- [ ] **`<PatientProfileShell>` imports nothing from `@/components/consultation/**`, `@/components/ehr/**`, `@/lib/consultation/**`, or `@/types/appointment.ts`.** Verified by `pnpm --filter frontend lint` against the ppr-01 ESLint zone.
- [ ] **`/v1` and `/v2` are pixel-equivalent on a 1440×900 viewport** for `ready`, `lobby`, `live (text)`, `live (voice)`, `live (video)`, `wrap_up`, `ended`, `terminal` states. Verified manually side-by-side in two tabs.
- [ ] **All six column permutations render correctly on `/v2`** — walk through each via the Layout dropdown (chart-body-rx / chart-rx-body / body-chart-rx / body-rx-chart / rx-chart-body / rx-body-chart). No overlap, no missing column.
- [ ] **Toggle-bar visibility (DL-6′) holds.** Each pane toggles via its toggle-bar pill. Hidden panes are removed from the layout entirely; visible panes always sum to 100%. When all three are hidden, the empty-state component renders ("Pick a panel..."). No 40px strips. No chevrons in `<PaneHeader>`.
- [ ] **Drag-to-reorder works between any two columns**, in any direction. Toggle-bar icons reorder in lockstep with the columns. Dragging a toggle icon also reorders columns.
- [ ] **All three built-in presets work** via menu and via `Cmd/Ctrl+Shift+1/2/3`.
- [ ] **Custom presets persist across browsers** — save on Firefox, reload Chrome, preset shows up and applies.
- [ ] **Old v1-shape custom presets are correctly translated** on first read into v2. Save a custom preset on `/v1` first; switch to `/v2`; preset applies correctly.
- [ ] **Walk-in mode works on `/v2`** — open a walk-in appointment, chart column is filtered out, two panes resize/collapse normally.
- [ ] **Mobile (`<lg`) view byte-identical to v1.** Reorder / presets / collapse are desktop-only.
- [ ] **`?v1=1` escape hatch works** during Wave 5.1 → Wave 5.3. At any point in that window, hitting `/dashboard/appointments/[id]?v1=1` renders the old shell.
- [ ] **Net diff after Wave 5.3 is −3,000 LOC or more.**
- [ ] **No regression on cs-NN / cc-NN / pf-NN test suites.** All existing unit + integration tests stay green.
- [ ] **`?cockpitDbg=1` debug instrumentation is gone.** `rg "COCKPIT_DBG_DEFAULT" frontend/` returns zero results.

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| `ppr-03` shell ships with a subtle layout bug that only surfaces under specific permutation × collapse combinations | H | Wave 4 (`ppr-11`) is a dedicated 1-day QA pass walking 108 cells. No flip until every cell is green. Parity-matrix table lives in the task file as the literal checklist. |
| Preset translation in `ppr-09` corrupts an existing custom preset (doctor opens v2, sees their preset broken / missing) | H | Translation helper is pure; unit-tested against fixtures of every shape we've shipped (cc-08 v1, cs-08 layout, default). On read failure, fall back to default + log; never overwrite the legacy preset row. |
| Two pages (v1 + v2) hitting the same `doctor_settings.cockpit_layout_presets` row write-race during the kill-switch window | M | Writes from `/v1` keep using the v1 shape (untouched). Writes from `/v2` tag with `version: 2` and translate-on-read goes through every entry. Last-writer-wins is acceptable (presets are doctor-personal config, low edit frequency — same as CC-D9). |
| `ppr-04` / `ppr-05` extraction breaks v1 because of a closed-over variable that wasn't migrated to a prop | M | The extract task explicitly lists props derived from the closure. Both v1 and v2 import the new file during transition — if v1 breaks, the bug surfaces before ppr-07 even mounts the pane on v2. |
| Drag-to-reorder confuses with drag-to-resize on the resize handles | M | Same dnd-kit `activationConstraint.distance = 8` as cc-07. Drag handle is the column header, not the resize bar. |
| `@dnd-kit/core` SSR / Next.js hydration warnings | L | Already proven on cc-07. ppr-03 wraps the shell in `'use client'`. |
| Doctor's saved widths from v1 don't round-trip cleanly to v2 (different storage shape) | M | ppr-08 reads the old `react-resizable-panels:cockpit-shell` + `cockpit-layout:v1:cockpit-shell` keys once on first v2 load and translates to the new `patient-profile:v1:layout`. Old keys remain in localStorage as a fallback; never overwritten by v2. |
| Wave 5 deletion accidentally removes a still-referenced file | L | `pnpm --filter frontend tsc --noEmit` is the cheap gate — any import-not-found error blocks the delete. Run it after each `git rm`. |
| `?cockpitDbg=1` removed too early and re-introduces the original drag bug | L | The new shell rewrites the source of that bug (no more slot-vs-column dispatch). Once `/v2` is the default, the instrumentation has nothing to instrument. Removal is part of ppr-14 (after the kill-switch window). |

---

## Cost estimate

Expected model-mix per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Wave | Tasks | Sonnet 4.6 Medium | Opus 4.7 Thinking-XHigh | Tokens (rough) |
|---|---|---|---|---|
| Wave 1 | ppr-01 → ppr-03 | 2/3 | 1/3 (ppr-03) | ~90k in / ~140k out |
| Wave 2 | ppr-04 → ppr-07 | 4/4 | 0/4 | ~70k in / ~95k out |
| Wave 3 | ppr-08 → ppr-10 | 3/3 | 0/3 | ~50k in / ~70k out |
| Wave 4 | ppr-11 (partial pass) | 1/1 | 0/1 | ~15k in / ~20k out |
| **Wave 4.5** | **ppr-15a → ppr-15e** | **5/5** | **0/5** | **~85k in / ~115k out** |
| Wave 4.6 | ppr-11 (re-run) | 1/1 (folded into 4.5 PR if no fixes) | 0/1 | ~10k in / ~10k out |
| Wave 5 | ppr-12 → ppr-14 | 3/3 | 0/3 | ~25k in / ~30k out |
| **Total** | **19** | **18** | **1** | **~345k in / ~480k out** |

Wave 4.5's 5 sub-tasks intentionally stay in Sonnet tier — the design is locked, each task is a tightly-scoped delete/rename/wire, and the largest (ppr-15c) is structurally subtractive. Per the Opus cap (≤ 1 per wave, ≤ 2 per batch), this batch still ships with 1 Opus task end-to-end.

---

## Release plan

```
Wave 1 → Wave 2 → Wave 3 → Wave 4 (partial — paused at Matrix B/C)
  │
  ▼
Wave 4.5 (ppr-15a → ppr-15e): toggle-bar redesign
  │   └─ feature/ppr-toggle-bar-redesign — single stacked PR
  ▼
Wave 4.6 (ppr-11 re-run against updated matrix)
  │
  ▼
Wave 5.1 (ppr-12): /v2 becomes default at /dashboard/appointments/[id]
  │
  ▼
[ One release window — observe in prod, ~1 week ]
  │
  ▼
Wave 5.2 (ppr-13): rename green-grade files (`cockpit/` → `patient-profile/`)
  │
  ▼
Wave 5.3 (ppr-14): delete old shell + cleanup (~3,400 LOC out)
```

The release window between ppr-12 and ppr-14 is the safety margin. If a parity gap shows up in prod that wasn't caught by ppr-11, `?v1=1` reverts a single doctor / appointment without redeploying. Once a week passes with zero `?v1=1` queries in the logs, ppr-14 deletes.

---

## References

- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules
- [Product plans/plan-patient-profile-shell-rebuild.md](../../../Product%20plans/plan-patient-profile-shell-rebuild.md) — source product plan, decision locks
- Style precedent: [Daily-plans/May 2026/10-05-2026/cockpit-customization/plan-cockpit-customization-batch.md](../../10-05-2026/cockpit-customization/plan-cockpit-customization-batch.md) — same shape, same convention
- Cross-day predecessors:
  - [Daily-plans/May 2026/10-05-2026/cockpit-customization/](../../10-05-2026/cockpit-customization/) — the slot-state + presets batch this rebuild absorbs.
  - [Daily-plans/May 2026/09-05-2026/cockpit-shell-redesign/](../../09-05-2026/cockpit-shell-redesign/) — the fixed-height + drag-resize shell whose mistakes this corrects.

---

**Status:** `Drafted` 2026-05-13. **Owner:** TBD.
