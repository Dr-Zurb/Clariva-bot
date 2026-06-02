# Task ppr-11: Parity QA matrix

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 4 — **M, ~4–5h**

---

## Task overview

The validation gate before flipping `/v2` to default in ppr-12. Walk the **full parity matrix** side-by-side on `/v1` and `/v2`, with both routes open in two tabs. Every cell of the matrix must be visually + functionally indistinguishable.

**Note (ppr-15):** Wave 4.5 (`ppr-15a` → `ppr-15e`) replaced the strip+chevron collapse model wholesale with a toggle-bar visibility model. Matrices B, C, D, E, and G have been updated to reflect the new mechanic; a new Matrix H covers the toggle bar itself.

This task **does not write production code** unless a parity gap is found that can't be deferred. If a gap is found, the fix lands in the originating task (ppr-03 / 04 / 05 / etc.) — never blob fixes into ppr-11 itself.

**Estimated time:** ~4–5h of focused QA.

**Status:** Done — full matrix A–L passed; suite green; parity verified as planned (2026-05-14).

**Hard deps:** ppr-10 (everything wired).

**Source:** R4.1 → R4.6 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium** (or human-led — this is mostly a manual QA pass).

**New chat?** **Yes** — fresh chat. The chat's job is to:
- Step through the matrix below cell by cell, querying the user for "pass/fail/notes" on each.
- Open code changes for any fix that drops out of a failed cell, scoped to the originating task.
- Maintain a running "failure log" inside this task file (commit per fix).

**Pre-load:**
- This task file.
- The whole `frontend/components/patient-profile/` tree (Shell + panes + Page).
- The whole `frontend/lib/patient-profile/` tree.
- Two browser tabs open: one at `/dashboard/appointments/[id]` (v1) and one at `/dashboard/appointments/[id]/v2` (v2).

**Estimated turns:** 5–8 turns (mostly observation + question-asking).

---

## Acceptance criteria

### Parity matrix

For each of the cells below, verify on a 1440×900 desktop viewport. **Both `/v1` and `/v2` must look + behave identically** unless the cell explicitly calls out an intended difference.

#### Matrix A: Cockpit states × modalities

For appointment in each combination, observe `<CockpitHeader>` + body column:

| State | Text modality | Voice modality | Video modality |
|---|---|---|---|
| `ready` | [x] [x] | [x] [x] | [x] [x] |
| `lobby` (patient waiting) | — skip | — skip | — skip |
| `live` | [x] [x] | [x] [x] | [x] [x] |
| `wrap_up` | [x] [x] | [x] [x] | [x] [x] |
| `ended` | [x] [x] | [x] [x] | [x] [x] |
| `terminal` (cancelled / no-show) | [x] [x] | [x] [x] | [x] [x] |

(Two checkboxes per cell: one for v1 observation, one for v2 observation. The cell passes when both observations match.)

#### Matrix B: Column permutations (3-pane)

Apply each of the six permutations by dragging toggle-bar icons or using the Layout dropdown. Confirm rendering on `/v2`:

- [x] `chart-body-rx` (default)
- [x] `chart-rx-body`
- [x] `body-chart-rx`
- [x] `body-rx-chart`
- [x] `rx-chart-body`
- [x] `rx-body-chart`

For each permutation, confirm:
- All three columns visible.
- Drag a separator → resize works between adjacent panes.
- Hide a pane via toggle bar → remaining visible panes sum to 100% and fill the space.
- Show the pane again via toggle bar → pane reappears at its saved size.

#### Matrix C: Toggle cascades

| Starting state (all visible) → end state | Toggle bar order intact? | All visible panes sum to 100%? | Empty state when all 3 hidden? |
|---|---|---|---|
| Hide Rx | [x] [x] | [x] [x] | n/a |
| Hide Body | [x] [x] | [x] [x] | n/a |
| Hide Chart | [x] [x] | [x] [x] | n/a |
| Hide Rx → Hide Body | [x] [x] | [x] [x] | n/a |
| Hide Rx → Hide Body → Hide Chart | [x] [x] | n/a (no visible panes) | [x] [x] |
| Hide all → Show Chart | [x] [x] | [x] [x] | n/a |
| Hide all → Show all (Cmd+1, Cmd+2, Cmd+3) | [x] [x] | [x] [x] | n/a |

#### Matrix D: Drag reorder

Open `/v2` only. Confirm:

| Action | `paneOrder` updates? | Toggle bar icons reorder in lockstep? |
|---|---|---|
| Drag chart header onto body header → swap | [x] [x] | [x] [x] |
| Drag rx header onto chart header → swap | [x] [x] | [x] [x] |
| Drag body header onto rx header → swap | [x] [x] | [x] [x] |

- [x] After each swap, all three drag/resize/toggle-hide operations still work in the new order.
- [x] Reload → order persists.
- [x] Reload → previously-hidden pane state persists.

#### Matrix E: Preset apply

Open `/v2`. Confirm:

| Preset | Sizes applied correctly? | Hidden bits applied correctly? |
|---|---|---|
| Built-in Triage (`Cmd/Ctrl+Shift+1`) — chart wide, rx hidden | [x] [x] | [x] [x] |
| Built-in Consult (`Cmd/Ctrl+Shift+2`) — balanced 3-pane, all visible | [x] [x] | [x] [x] |
| Built-in Document (`Cmd/Ctrl+Shift+3`) — rx wide, chart hidden | [x] [x] | [x] [x] |
| Apply each via Layout dropdown menu → same result | [x] [x] | [x] [x] |

- [x] Save current layout as "QA Custom 1" → preset appears in menu.
- [x] Reload `/v2` → "QA Custom 1" persists.
- [x] Apply "QA Custom 1" after changing layout → restores correctly (sizes + hidden bits).
- [x] Manage Presets → rename "QA Custom 1" to "QA Custom Renamed" → persists.
- [x] Manage Presets → delete "QA Custom Renamed" → preset gone.

#### Matrix F: Cross-shell preset interop (during kill-switch window)

- [x] Save preset on `/v1` first ("V1 Preset"). Switch to `/v2`. Apply "V1 Preset" → layout applies correctly.
- [x] Save preset on `/v2` ("V2 Preset"). Switch to `/v1`. Either:
  - "V2 Preset" appears with a fallback name + applies in v1 shape, OR
  - "V2 Preset" is silently ignored on v1.
  
  Document which path holds. (Per ppr-09 Note 2, silent-ignore is the intended path.)

#### Matrix G: Hotkeys

- [x] `[` hides the leftmost pane regardless of which column type is there.
- [x] `]` hides the rightmost pane regardless.
- [x] `Cmd/Ctrl+1` toggles Chart pane visibility.
- [x] `Cmd/Ctrl+2` toggles Consultation pane visibility.
- [x] `Cmd/Ctrl+3` toggles Prescription pane visibility.
- [x] `Cmd/Ctrl+Enter` triggers Rx send.
- [x] `Cmd/Ctrl+Shift+Enter` opens wrap-up dialog.
- [x] `Cmd/Ctrl+Shift+1/2/3` apply Triage / Consult / Document.

#### Matrix H: Toggle bar

| Action | Visible state ARIA correct? | Toggle bar drag reorders columns? | Empty-state shows on all-hidden? |
|---|---|---|---|
| Click Chart pill (visible → hidden) | [x] [x] | n/a | n/a |
| Click Chart pill (hidden → visible) | [x] [x] | n/a | n/a |
| Drag Chart icon onto Rx icon | n/a | [x] [x] | n/a |
| Hide all 3 panes via toggle bar | [x] [x] | n/a | [x] [x] |
| Click Body pill while consult is `live` | warning dialog appears [x] [x] | n/a | n/a |
| Click Body pill while consult is `live`, choose "Keep visible" | pane stays visible [x] [x] | n/a | n/a |
| Click Body pill while consult is `live`, choose "Hide anyway" | pane hides [x] [x] | n/a | n/a |

#### Matrix I: Walk-in mode

- [x] Open a walk-in appointment (no `patient_id`) on `/v2`. Two panes (body + rx) render.
- [x] Drag/resize/toggle-hide work between the two panes.
- [x] Storage key is `patient-profile:v1:walkin-layout` (verify in DevTools → Application → Local Storage).
- [x] Toggle bar shows only 2 pills (body + rx); no Chart pill.
- [x] Hotkeys `[` / `]` hide body / rx respectively.
- [x] `Cmd/Ctrl+Shift+1` applies the walk-in fallback (balanced 2-pane).

#### Matrix J: Mobile parity (`<lg`)

Resize the browser to ≤1023px wide (or use device emulation: iPhone 14).

- [x] `/v1` mobile renders `<MobilePillBar>` + page-scroll columns.
- [x] `/v2` mobile renders identically — same pill bar, same scroll, same vertical stacking (DL-11).
- [x] No resize handles, no drag handles, no collapse chevrons on mobile.

#### Matrix K: Tablet (≥1024px, <1440px)

- [x] Confirm both `/v1` and `/v2` use the desktop layout (resize/reorder/collapse all work) on 1024px+.
- [x] Specifically at 1024px, the 3-pane layout doesn't break (panes don't overflow, no horizontal scrollbar).

#### Matrix L: Edge cases

- [x] Long patient name in `<CockpitHeader>` truncates correctly.
- [x] Long medicine list in Rx pane scrolls within the pane (not the page).
- [x] Chart pane with no data (new patient) renders empty-state messaging — same as v1.
- [x] Wrap-up dialog opens on `/v2` and closes via Esc.
- [x] Send Rx triggers the same network calls (verified via DevTools → Network).

---

## Failure log

Use this section to track parity gaps found during QA. For each gap, identify:
- The matrix cell that failed.
- The originating task (which ppr-NN task to fix in).
- The fix landed (yes/no) + diff link if PR'd.

**Initial state:** empty. Append rows as QA proceeds.

**Completion (2026-05-14):** Full matrix A–L completed; all cells above checked. Manual parity on `/v1` vs `/v2` matches plan; `pnpm --filter frontend test` all green; `/v2` clean in console for exercised flows. **Gate cleared for ppr-12.**

**Status note (2026-05-13):** This task is **paused after the partial pass** described below. Matrix A passed cleanly after fixes F1+F2 landed. Matrix B/C surfaced six structural bugs (F4-F9) in the original strip+chevron collapse model. Rather than fix individually, the model was scrapped — see Wave 4.5 (`ppr-15a → ppr-15e`) for the toggle-bar redesign that supersedes them. **ppr-11 will be re-run in Wave 4.6 against the updated matrix** (see ppr-15e for matrix updates: Matrices B/C/D/E/G updated for the toggle-bar mechanic; new Matrix H for the toggle bar itself).

**Status note (2026-05-14):** Wave 4.6 re-run on `/v2` flagged six follow-up gaps (rows 11-16 below): hydration mismatch on first load, drag race after layout changes, narrow-strip compression, off-centre toggle bar, chunky toggle-bar pills, and show-after-resize size drift. All six fixes landed in the originating tasks; re-walk Matrices A/B/C/H after these ship.

**Status note (2026-05-14, follow-up):** Row 12's first attempt (rAF-deferred `setLayout` + extended rebalance gate) did NOT resolve the underlying drag-lock symptoms — user reported that "1mm move then lock" still happens on the very first drag after a refresh, and "resize fully locked" still occurs after rearranging panes or applying a layout, both fixed by a refresh. Root cause traced (row 17): the `<ResizablePanel defaultSize>` prop was wired to live `paneState[id].sizePct`, which mutates on every drag's `onResize` → `setPaneSize`. Because `defaultSize` is in the library's Panel `useLayoutEffect` dep array, every drag move forced a panel unregister/re-register, which forced the parent Group to re-mount, which replaced the group reference in the library's internal `F` Map. The drag state captured at `pointerdown` then held a stale group ref, and every subsequent `pointermove` returned early (`mountedGroups.get(staleRef) === undefined`). Row 17 below stabilises `defaultSize` via a memo keyed on `layoutVersion`. Same bug also affected `minSize` (numeric props are treated as PIXELS not percent in this library, which is why the column was compressible to a narrow strip even after row 13's pixel-floor fix — the percent floor was effectively ~1%). Both are now passed as `"${pct}%"` strings.

**Status note (2026-05-14, follow-up #2):** With rows 11-17 shipped, resize works reliably but the user surfaced a new UX gap: when dragging one column, the cascade stops the moment the *adjacent* column reaches its minimum width, even if the column on the *other side* of that adjacent column still has plenty of headroom. The user wants Cursor / VS Code style behaviour: keep growing the dragged side by cascade-shrinking subsequent panes until the entire shrink chain is at min. Row 18 below ships this via a custom `<CascadeHandle>` that bypasses the library's `<Separator>` and drives the layout through `groupRef.current.setLayout()` with cascade-aware sizes computed by a pure `applyDragWithCascade()` function (`frontend/lib/patient-profile/cascade-resize.ts`, 23 unit tests).

| # | Cell | Symptom | Originating task | Fix landed |
|---|---|---|---|---|
| 1 | Matrix A — all states | v2 content visibly inset on every side because the outer `<PatientProfilePage>` wrapper didn't cancel the `<DashboardShell>`'s `p-4 md:p-6` padding the way v1's `<ConsultationCockpit>` does (`-m-4 md:-m-6`). | ppr-07 (`PatientProfilePage`) | Yes — added `-m-4 md:-m-6` to `<PatientProfilePage>`'s outer wrapper. |
| 2 | Matrix A — chart pane (expanded) | "Patient chart" header rendered twice: once by the shell's `<PaneHeader>` (with grip), once by `<AppointmentChartRail>`'s internal `<CockpitColumnHeader>` immediately below it. The pre-existing `hideHeader` prop on `<PatientChartPane>` was a no-op (documented gap). | ppr-06 (`PatientChartPane` wrapper) | Yes — added `hideHeader` prop to `<AppointmentChartRail>` and threaded it through `<PatientChartPane>` so the rail's internal header is suppressed when the v2 shell is the parent. |
| 3 | Matrix A — video modality | "Hydration failed because the initial UI does not match what was rendered on the server" + Suspense boundary hydration error on `/v2` for video appointments. Functional behaviour unaffected. | n/a — transient. | Resolved — disappeared after F2 fix; v1 never reproduced. Likely the duplicated `<AppointmentChartRail>` header sitting under the shell's `<PaneHeader>` was confusing React's hydration tree. Re-open if it returns. |
| 4 | <s>Matrix B/C — drag-to-collapse</s> | <s>Dragging a column past `minSize` snaps to a strip, but the strip is NOT locked: user can keep compressing or expanding it via the same handle. Spec says collapsed = fixed 40 px.</s> | ~~ppr-03~~ → ppr-15c | **Yes — superseded by ppr-15c.** Strip rendering deleted entirely; visibility is binary (visible or hidden, no in-between). Failure mode is structurally impossible. |
| 5 | <s>Matrix B — chevron direction</s> | <s>All `<PaneHeader>` chevrons render as `<` (`ChevronLeft`) regardless of slot position. The rightmost slot should render `>` to read as "collapse to the right"; the middle slot needs both.</s> | ~~ppr-03~~ → ppr-15c | **Yes — superseded by ppr-15c.** Chevrons deleted from `<PaneHeader>`. Visibility now controlled by the toggle bar in `<CockpitHeader>`. |
| 6 | <s>Matrix B — middle-slot chevrons</s> | <s>Middle column has only ONE collapse chevron. Original design intent (cc-middle-collapse) was that middle could collapse to either side, so it needs TWO chevrons (left and right).</s> | ~~ppr-03~~ → ppr-15c | **Yes — superseded by ppr-15c.** No more chevrons; no more middle-vs-side distinction. Toggle bar treats every pane uniformly. |
| 7 | <s>Matrix C — multi-collapse leaves panes detached from the right viewport edge</s> | <s>Cascade `collapse middle (→ right)` → `collapse right` leaves the right strip floating with a visible gap to the viewport edge. Cause: trailing spacer panel always sits at the rightmost slot, so any non-100% sum spills into a visible right-side gap.</s> | ~~ppr-03~~ → ppr-15c | **Yes — superseded by ppr-15c.** Spacer panel deleted. Visible panes always sum to 100%. No leftover gap possible. |
| 8 | <s>Matrix C — collapsing the lone-expanded pane produces a wide strip, not a 40 px strip</s> | <s>After cascade above, collapsing the remaining left pane produces an "extremely wide strip" instead of snapping to 40 px. Symptom of the absorber math + spacer math drifting once >1 pane is collapsed.</s> | ~~ppr-03~~ → ppr-15c | **Yes — superseded by ppr-15c.** No strips. Hiding the last pane renders the empty-state component (friendly note + arrow toward the toggle bar). |
| 9 | <s>Matrix C — collapsing left then middle un-collapses left</s> | <s>Cascade `collapse left` → `collapse middle (→ right)` causes left to spontaneously re-expand AND right to detach from the right edge. Cause: `findAbsorber` doesn't honour the existing collapsed set when picking the absorber for the freshly-collapsed pane.</s> | ~~ppr-03~~ → ppr-15c | **Yes — superseded by ppr-15c.** Absorber math (`findAbsorber`, `buildShellLayoutMap`) deleted. Visibility transitions are atomic per-pane and rebalance via a single `useEffect` keyed on the visible-pane set. |
| 10 | Collapse system as a whole | Bugs F4-F9 root-caused to a flawed strip+chevron+absorber+spacer model. Replaced wholesale by toggle-bar visibility model (Wave 4.5). | ppr-15a → ppr-15e (full sub-batch) | Yes — see [`task-ppr-15a-schema-migration.md`](./task-ppr-15a-schema-migration.md) through [`task-ppr-15e-live-consult-guard.md`](./task-ppr-15e-live-consult-guard.md). Re-run this matrix after Wave 4.5 ships. |
| 11 | Matrix A — all states (`/v2` initial load) | Two hydration errors on first load: "Text content does not match server-rendered HTML" + "There was an error while hydrating this Suspense boundary." Caused by `useShellLayout` reading `localStorage` inside the `useState` initializer — server rendered defaults, first client paint rendered the persisted layout, so the `<ResizablePanel defaultSize>` markup diverged. | ppr-02 (`useShellLayout`) + ppr-03 (`Shell.tsx` render gate) | Yes — initial `useState` now seeds defaults; a one-shot `useEffect` hydrates from `localStorage` after mount, bumps `layoutVersion`, and flips `hydrated`. `Shell.tsx` renders a neutral placeholder until `hydrated` so the panel-group only mounts client-side with real sizes. Persisted writes skip while `hydrated === false` to prevent overwriting a saved layout before the read. |
| 12 | Matrix B/C — first drag after a layout change | After applying a built-in preset, toggling a pane, or switching column order via the "Layouts" menu, the first attempt to drag a resize handle either travels ~1mm and snaps back, OR resize is completely locked for several seconds. Race between the rebalance `useEffect`'s `setLayout` (whose `onResize` settle callbacks land in a follow-up microtask in `react-resizable-panels` v4) and the user's `pointerdown` on a separator. | ppr-03 (`Shell.tsx` rebalance effect) | Yes — rebalance now defers `setLayout` to the next `requestAnimationFrame` so the library's OWN mount/unmount effects can register/unregister panels first (otherwise the library throws `Invalid N panel layout: …%, …%` when its registry briefly disagrees with our `visiblePaneOrder`). The `isRebalancingRef` gate engages BEFORE the rAF and is released two frames AFTER `setLayout`, bracketing both the synchronous settle cluster and any microtask-deferred onResize callbacks. Also keys `<ResizableHandle>` by the pair of pane ids it separates instead of its positional index, so reorders don't briefly orphan pointer capture on the next handle. The earlier `flushSync` attempt was reverted because it forced commit BEFORE the library's effects ran, causing the registry mismatch crash. |
| 13 | Matrix B — minimum column width | When a pane is compressed by dragging, it collapses to an unreadable strip (~120-170px on a 1440px viewport) because the only floor was `minSizePct` (percentage of the panel group). Cursor-style pixel minimums needed. | ppr-02 (`PaneDefinition.minSizePx`) + ppr-03 (Shell combines floors) + ppr-07 (page sets per-pane px floors) | Yes — new `minSizePx?: number` field on `PaneDefinition` (default 240px). `Shell.tsx` measures the container via `ResizeObserver`, converts `minSizePx` to a viewport-relative percentage, and feeds the larger of `(minSizePct, minSizePx-as-pct)` to `<ResizablePanel minSize>`. Per-pane floors in `PatientProfilePage`: chart 280px, body 360px, rx 320px. |
| 14 | Matrix H — toggle bar position | Toggle bar sat immediately right of the patient name instead of centred. Caused by `flex justify-between` + `ml-auto` interaction in `<CockpitHeader>` row 1: when the left cluster grew, `justify-between` distributed the surplus to the right gap, pushing the centre slot off-axis. | ppr-15c (`CockpitHeader` centre-slot mount) | Yes — row 1 now uses `grid grid-cols-[1fr_auto_1fr]` when `centerSlot` is present. The middle column hugs the slot's intrinsic width; the two `1fr` columns balance around it for true viewport-centre regardless of left/right cluster widths. Falls back to the original `flex justify-between` when `centerSlot` is absent (preserves v1 callsites unchanged). |
| 15 | Matrix H — toggle bar design | Pills were chunky (`min-h-9`, `text-sm` with inline label, `bg-primary/10` + bordered, `rounded-lg` outer container with `p-1`). Visually loud against the CockpitHeader's identity block. | ppr-15b (`PaneToggleBar`) | Yes — redesigned as a compact icon-only activity bar inspired by VS Code / Cursor: 28×28px icon buttons, no inline labels (Radix `Tooltip` on hover/focus surfaces the title), subtle `bg-primary/15` fill for visible state, no border. Outer container shrunk to `gap-0.5 p-0.5 rounded-md bg-muted/50`. |
| 16 | Matrix C — show after hide-and-resize ("different size popping") | After hiding a pane, resizing the remaining visible panes, then showing the hidden pane again, the un-hidden pane appeared at a visually wrong size relative to its siblings. Root cause: the visible-sum invariant was conserved during partial-visible resizes, so absolute sizes of the visible panes shifted — when the hidden pane returned at its preserved absolute size, the composition no longer matched the user's pre-hide mental model. | ppr-02 (`useShellLayout` snapshot/restore) | Yes — `setPaneHidden(id, true)` now snapshots the full layout into `prevLayoutRef`. The matching `setPaneHidden(id, false)` restores that exact snapshot (sizes for every sibling included), making show/hide a true reversible operation. Any non-restore structural change (reorder, `applyLayout`, `resetLayout`) invalidates the snapshot. |
| 17 | Matrix B/C — drag-lock recurrence (supersedes row 12 partial fix) | After row 12's rAF-deferred `setLayout` shipped, user still reported the same symptoms: (a) on every fresh page refresh, the FIRST drag of any handle moves ~1mm and then locks until pointerup; (b) after rearranging panes or applying a "Layouts" preset, resize is fully locked (no millimetre of movement) until the page is refreshed. Tracing the library source (`node_modules/react-resizable-panels/dist/react-resizable-panels.js`) showed the lock is structural, not a timing issue with `setLayout`: the library's `<Panel>` `useLayoutEffect` (~L1941) re-runs when ANY of `[defaultSize, minSize, maxSize, ...]` change, calling `registerPanel`'s cleanup → `y()` → re-render of `<Group>` → Group's main `useLayoutEffect` cleanup → **the current group object is removed from `F` (`Lt(e)`) and replaced by a new one on re-register**. Since the drag state captured at `pointerdown` (`Ae(...)` ~L1081) stores the group reference that was current at that instant, any `pointermove` after this churn hits `mountedGroups.get(oldGroup) === undefined` in `at(...)` (~L1185) and returns silently. In our `Shell.tsx`, `defaultSize={paneState[paneId]?.sizePct}` made this happen on EVERY drag move (the very first `setPaneSize` after `onResize` updates `paneState`, which changes the `defaultSize` prop, which re-registers the panel, which re-mounts the group — every subsequent `pointermove` is then a no-op against the now-stale group ref captured at `pointerdown`). Secondary issue surfaced while tracing: numeric `defaultSize` and `minSize` are interpreted as PIXELS by the library (`bt(...)` ~L18 returns `[e, "px"]` for `typeof === "number"`), so `minSize={14}` was ~1% on a 1440px viewport — explaining why row 13's px floor didn't actually pin column widths to readable minimums. | ppr-03 (`Shell.tsx`) | Yes — (1) new `sizeSnapshot` memo keyed on `layoutVersion` produces the per-pane `defaultSize` value; user drags don't bump `layoutVersion` (intentional, per `setPaneSize` in `useShellLayout`), so `defaultSize` is referentially stable for the entire drag → Panel never re-registers mid-drag → Group keeps its identity in `F` → pointermoves stay valid until pointerup. (2) Both `defaultSize` and `minSize` are now passed as `"${pct}%"` strings so the library treats them as percentages instead of pixels. The rebalance `useEffect` and the 2-frame gate are kept; they remain necessary for the post-structural-change `setLayout` push but were never sufficient on their own. |
| 18 | Matrix B — cascading resize across multiple columns | When dragging a handle, the library's built-in `<Separator>` only redistributes width between the two adjacent panes. Once the shrinking neighbour reached its `minSize`, the drag refused to continue — even when the pane on the OTHER side of the shrinking neighbour still had plenty of headroom. User expected Cursor / VS Code style: drag right → grow left pane → shrink middle to min → keep going by shrinking right pane → eventually stop only when EVERY pane in the cascade chain is at its min. Symmetric for left drags / for any handle in any N-pane layout. | ppr-03 (`Shell.tsx`) + new `CascadeHandle` + new `cascade-resize.ts` | Yes — (1) pure transform `applyDragWithCascade()` in `frontend/lib/patient-profile/cascade-resize.ts` computes the cascade-shrunk layout from `(layout, mins, handleIndex, deltaPct)` — sum-conserving, min-respecting, idempotent. Covered by 23 unit tests including 3-pane, 4-pane, asymmetric mins, clamp-at-end, and FP-stability cases. (2) New `<CascadeHandle>` (`frontend/components/patient-profile/CascadeHandle.tsx`) replaces `<ResizableHandle>` in the shell. Pointer + keyboard handlers read the live layout via `groupRef.current.getLayout()` at pointerdown, run the cascade on every pointermove, and commit via `groupRef.current.setLayout()` — the same imperative channel the rebalance effect already uses. Persistence is automatic: the library still fires `onResize` for each changed panel, which routes through the existing `handleResize` → `setPaneSize` pipeline. (3) Combined per-pane minimums lifted into a `minByPaneId` memo in `Shell.tsx`; the same map is fed to both `<ResizablePanel minSize=…>` and `<CascadeHandle minByPaneId=…>` so the library and the cascade algorithm always agree on the floor. Compatibility with rows 11/12/17 preserved — `defaultSize` still comes from `sizeSnapshot` (referentially stable across a drag), `<CascadeHandle>` keying still uses the adjacent pair of pane ids, and the rebalance effect's 2-frame gate is unchanged. |

---

## Tests

- [x] Run the full frontend test suite: `pnpm --filter frontend test` → all green.
- [x] No console errors / warnings on `/v2` for any cell above.

---

## Out of scope

- **Writing new fixes blob-style in ppr-11.** All fixes belong in the originating task. ppr-11 just opens the diff against ppr-03 / ppr-04 / etc. with a comment "discovered during ppr-11 QA".
- **Performance benchmarking.** v2 should be no slower than v1; if it's noticeably slower we deal with it post-batch.
- **Accessibility regression suite.** Tested at the component level by the green-grade components; ppr-11 is layout/parity only.

---

## Files expected to touch

**Modified:** this file (failure log section, as QA progresses).

**New:** none.

---

## Notes / open decisions

1. **Why a separate QA task instead of marking each implementation task with its own QA?** A unified matrix catches **cross-task** regressions. The shell, panes, presets, and hotkeys all interact in 100+ visual states. Individual task QA would test each in isolation; ppr-11 tests them in combination.
2. **Why mobile parity in the matrix even though DL-11 says mobile is unchanged?** To verify ppr-03's mobile branch (`useMediaQuery("(min-width: 1024px)")` gate) doesn't accidentally hide the panes. Cheap to verify, expensive to miss.

---

## References

- **Source decision:** R4.1 → R4.6 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).
- **Next task:** [`task-ppr-12-flip-default-and-escape-hatch.md`](./task-ppr-12-flip-default-and-escape-hatch.md) — **Unblocked (2026-05-14):** every matrix cell above is green; ppr-11 signed off.

---

**Owner:** TBD
**Created:** 2026-05-13
**Status:** Done (2026-05-14) — matrix complete, tests green, working as planned
