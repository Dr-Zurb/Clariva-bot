# Plan — Patient profile shell rebuild

## Replace the 2,548-line `ConsultationCockpit` with a clean, content-agnostic shell that any pane can plug into

> **Status:** `Drafted` 2026-05-13. **Depends on:** the existing content components shipped by `plan-ui-system-redesign.md`, `plan-patient-seeing-flow.md`, and the [cockpit-customization batch](../Daily-plans/May%202026/10-05-2026/cockpit-customization/plan-cockpit-customization-batch.md). **Effort:** ~5 dev-days frontend, **zero backend**.
>
> **Strategy:** Strangler Fig. Build a new shell side-by-side at a `/v2` route, port real content into it by *reference* (no rewrites), validate parity, flip the default, delete the old shell. The old shell stays accessible behind `?v1=1` for one release window as a kill-switch.
>
> **Status legend (matches `ehr/` convention):** `Drafted` → `Selected` → `Committed` → `Shipped` / `Deferred` / `Killed`.
>
> **Selection markers per item:** `Decision: [ ] Yes / [ ] No / [ ] Modify`. Tick exactly one in each item before promotion to a daily-plans batch.

---

## Why this plan exists now

The cockpit shell has accumulated **four overlapping layout systems** in one file (`frontend/components/consultation/ConsultationCockpit.tsx`, 2,548 LOC, last modified today). Each was added correctly in isolation; together they form a layout state machine that is no longer tractable:

| Layer | What it owns | Shipped by | Surface in code |
|---|---|---|---|
| Three-pane resize | Pixel widths of three columns | cockpit-shell-redesign (cs-08) | `<ResizablePanelGroup>` + `handleChartResize` / `handleRxResize` |
| Side-rail collapse | Booleans `collapsed.chart` / `collapsed.rx` (+ later `.body`) | cs-08 + cc-04 | `panelRef.collapse()` + `CollapsedFlags` |
| Slot reorder | Permutation of `['chart', 'body', 'rx']` | cc-04 / cc-06 / cc-07 | `slots: ColumnSlots` + `swapSlots` + dnd-kit |
| Middle-column directional collapse | `"left" \| "right" \| null` + absorber math + spacer panel | This week's bug-fix round | `middleCollapseSide` + `buildPanelLayoutMap` + `SPACER_PANEL_ID` |

Each layer reads and writes a piece of `CockpitLayout` (`frontend/lib/consultation/cockpit-layout.ts`), and each must defend against the others ("is this column in `slots[1]`?", "is the absorber expanded?", "is the spacer still summing to 100%?"). The result:

- **2,548 LOC** in one file, with ~12 inline helpers (`isMiddleSlot`, `refForColumnType`, `buildPanelLayoutMap`, `resolveAbsorber`, …) that each guard one combination of the four layers above.
- **`?cockpitDbg=1` debug instrumentation still in tree** (see [inbox.md L280](../../capture/inbox.md)) because the "reorder, then drag a side column, watch the middle one collapse instead" bug recurs even after multiple targeted patches.
- **A `cascading drag-to-collapse` deferred** (see [inbox.md L278](../../capture/inbox.md)) because adding it on top of the current architecture would compound the same coupling.
- **`BodyColumnContent` / `RxColumnContent` are inline functions** inside `ConsultationCockpit.tsx` — they can't be unit-tested or imported without dragging the entire shell.
- **The shell knows medical concepts** (`shouldShowChartRail`, `ConsultationLauncher`, `WrapUpDialog`) — so any new tab (the user has already named AI chat as a 4th tab, and asked about "split a column into above and below for history vs treatment") forces another round of "find the right `isMiddleSlot` guard and add another branch".

The reason the layout layer can't be saved by another patch isn't that the bugs are subtle — they're tractable. It's that the **shell is coupled to its content**: every layer carries a `ColumnType` discriminator, so adding a pane means adding a column-type literal, which means touching every guard in the file.

This plan does the only thing that gets us out of this loop: **separate the shell from the content.** The shell knows about panes; panes know about medicine. Adding a 4th pane in the future means adding one entry to a `panes: PaneDefinition[]` array — not editing the shell.

---

## North star

From [ehr/plan-00-ehr-roadmap.md](./ehr/plan-00-ehr-roadmap.md):

> "doctor opens it, taps two chips, sends in 30 seconds"

From the user (2026-05-13 chat):

> "create a new patient profile page, make the architecture with proper planning, copy paste important stuff without the bugs and then delete the current page."

The architectural target this plan ladders to:

> Adding an "AI chat" pane (the user's explicit future ask) takes **one diff** that adds an entry to a panes array — and zero changes to the layout code.

Every item below either (a) makes that statement true, or (b) preserves an existing behaviour while the shell beneath it is replaced. If an item doesn't ladder to one of those, flag it in `Notes:` and probably reject.

---

## Decision lock (LOCKED 2026-05-13)

These are scoping decisions agreed in chat at plan creation. Items below MUST respect them; revisiting any of them belongs in a new `Decision:` block on the affected item with a clear `Modify` rationale.

| ID | Decision | Implication |
|----|----------|-------------|
| **DL-1** | **Strangler Fig migration.** Build the new shell side-by-side at a new route (`/dashboard/appointments/[id]/v2`), validate parity, flip the default, delete the old. The old route stays accessible via `?v1=1` for one release. | Both pages coexist for ≤1 week. New code lives in a new folder. No big-bang swap. R5 owns the flip and delete. |
| **DL-2** | **Shell knows zero medical concepts.** The new `<PatientProfileShell>` accepts a `panes: PaneDefinition[]` prop and renders them. It must compile against a blank Vite project — no imports from `@/components/consultation`, `@/components/ehr`, `@/lib/consultation`, or `@/types/appointment`. | Lint rule (R1.6) enforces this. The shell is reusable for any future "split-pane page" — settings, patient detail, doctor profile. |
| **DL-3** | **Content components ported by reference — no rewrites.** Every component in the 🟢 list below is imported as-is into the new shell. We are rewriting the layout primitive, not the medical workflow. | The 5-day estimate depends on this. Touching `AppointmentChartRail` / `RxWorkspace` / `ConsultationLauncher` / `WrapUpDialog` / `ReadyCard` / `EndedCard` / `TerminalCard` / `CockpitHeader` / `CockpitQueueRail` / `MobilePillBar` requires a new `Modify` decision on R2. |
| **DL-4** | **PaneDefinition is the only contract the shell knows.** Shape: `{ id, title, render, collapsedRender?, minSizePct?, naturalSizePct?, canCollapse?, hotkey? }`. Anything beyond this lives inside the pane's `render` function. | Adding a 4th pane = one entry in the `panes` array. No changes to the shell. No `ColumnType` enum, no `slots[1]` guards. |
| **DL-5** | **Single-axis split in v1 — horizontal columns only.** PaneDefinition is designed so vertical split inside a column (the user's "history above, treatment below" idea) ships later as a recursive type (`children?: PaneDefinition[]`) without API breakage. v1 does NOT ship the recursive case. | R6.2 captures this future. v1 ships exactly the columns the user has today. |
| **DL-6** | **Uniform collapse model.** Every pane collapses to a fixed 40px strip via a chevron in its own header. No middle-vs-side rules. No directional collapse. The space freed is absorbed by the immediately-adjacent expanded pane, falling back to a left-to-right scan, falling back to a trailing invisible spacer panel. | The `middleCollapseSide: "left" \| "right" \| null` mechanism + its top-corner chevrons + `refForColumnType` + the spacer-position math all DELETE in R5. The spacer panel itself stays (it was the right call). |
| **DL-7** | **New layout state shape — `{ paneOrder: string[]; paneState: Record<id, { sizePct, collapsed }> }`.** No `slots` tuple. No `widths` tuple. No `middleCollapseSide`. Reordering moves an id within `paneOrder`. | Replaces `frontend/lib/consultation/cockpit-layout.ts` (344 LOC, deleted in R5) with `frontend/lib/patient-profile/layout.ts` (~150 LOC). |
| **DL-8** | **Presets keep working — translated on load.** Built-in presets (Triage / Consult / Document) and custom user presets (stored in `doctor_settings.cockpit_layout_presets`) keep their hotkeys (Cmd/Ctrl+Shift+1..3) and UI. A one-time client-side migration translates the existing shape to the new shape on first load. | No backend changes. Old presets render correctly the first time a doctor opens v2. R3.2 owns the translation. |
| **DL-9** | **Persistence — new localStorage namespace.** Canonical key: `patient-profile:v1:layout` and `patient-profile:v1:walkin-layout`. The old `cockpit-layout:v1:*` + `react-resizable-panels:cockpit-shell*` keys are read once on first load of v2 (best-effort seed), then ignored. | Old saved widths still hydrate the new shell for continuity. No data is lost — the old key remains in localStorage until evicted naturally. |
| **DL-10** | **No backend changes.** Same APIs, same `appointments` schema, same `doctor_settings.cockpit_layout_presets`, same migrations (`099_doctor_cockpit_layout_presets.sql` etc.). | If the user later asks for a server-side default pane order, that's a separate plan. |
| **DL-11** | **Mobile fallback unchanged.** `<lg` keeps `<MobilePillBar>` + page-scroll. The shell renders `panes.map(p => p.render())` stacked vertically and ignores all layout state on mobile. | Mobile parity is essentially free. Tablet (`md..lg`) follows the mobile pattern. |
| **DL-12** | **Naming: `PatientProfileShell`.** Component lives under `frontend/components/patient-profile/`. The neutral name is deliberate — "cockpit" was a workflow term that boxed in future panes (AI chat, settings, etc.). | `ConsultationCockpit` and its `cockpit/` folder are deleted in R5. `cockpit-state.ts` and `WrapUpDialog` migrate to neutral homes (`patient-profile/state.ts`, `patient-profile/wrap-up/WrapUpDialog.tsx`). |
| **DL-13** | **AI chat / 4th tab is OUT of scope for v1, but the contract accommodates it.** Adding it later is `panes.push({ id: "ai-chat", title: "AI", render: () => <AiChatPane ... /> })` and nothing else. | R6.1 captures the deferred work explicitly. Locking it here forces R1's PaneDefinition shape to stay generic. |

---

## What's green vs what's getting deleted

The single most calming thing about this plan: **most of the codebase is fine.** The bug surface is narrow.

### 🟢 Ported as-is (zero rewrites)

These are imported into the new shell unchanged:

- `frontend/components/ehr/AppointmentChartRail.tsx` (220 LOC) — patient chart pane content.
- `frontend/components/consultation/cockpit/RxWorkspace.tsx` (179 LOC) — Rx form workspace.
- `frontend/components/consultation/ConsultationLauncher.tsx` (38KB) — modality picker + room mount.
- `frontend/components/consultation/TextConsultRoom.tsx`, `VoiceConsultRoom.tsx`, `VideoRoom.tsx`.
- `frontend/components/consultation/cockpit/ReadyCard.tsx`, `EndedCard.tsx`, `TerminalCard.tsx`, `EndOfDayCard.tsx`, `NextPatientCountdown.tsx`, `WrapUpDialog.tsx`.
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (1,004 LOC) — patient banner + Layout menu.
- `frontend/components/consultation/cockpit/CockpitQueueRail.tsx` (286 LOC) — top queue strip.
- `frontend/components/consultation/cockpit/MobilePillBar.tsx` — `<lg` fallback.
- `frontend/components/consultation/cockpit/CockpitColumnHeader.tsx` — header primitive (solid).
- `frontend/components/consultation/cockpit/RailCollapsedStub.tsx` — collapsed strip (solid).
- `frontend/components/consultation/cockpit/SavePresetDialog.tsx`, `ManagePresetsDialog.tsx`, `RunningBehindBadge.tsx`.
- `frontend/lib/consultation/cockpit-state.ts` (278 LOC) — pure state machine. Moves to `frontend/lib/patient-profile/state.ts` in R5.
- All hooks: `useDoctorDayPipeline`, `useCockpitHotkeys` (rename in R5), `useCockpitPresets`, `useChartPrefetch`, `useNextAppointmentRoute`, `useOpdSnapshot`, `useMediaQuery`.
- All `frontend/lib/api.ts` calls.

### 🔴 Deleted in R5

- `frontend/components/consultation/ConsultationCockpit.tsx` (2,548 LOC) → replaced by `frontend/components/patient-profile/PatientProfilePage.tsx` + `frontend/components/patient-profile/Shell.tsx` (~600 LOC combined).
- `frontend/lib/consultation/cockpit-layout.ts` (344 LOC, slot-state + middle-collapse + validation) → replaced by `frontend/lib/patient-profile/layout.ts` (~150 LOC).
- `frontend/components/consultation/cockpit/CollapsedChartRail.tsx`, `CollapsedRxRail.tsx` — replaced by per-pane `collapsedRender` functions co-located with each pane component.
- `frontend/components/consultation/cockpit/CockpitColumnDragHandle.tsx`, `CockpitColumnDropZone.tsx` — replaced by shell-owned, content-agnostic dnd handles.
- The `?cockpitDbg=1` instrumentation (search for `COCKPIT_DBG_DEFAULT`, `dbgLog`, `cockpitDbgEnabled` in `ConsultationCockpit.tsx`).
- The `middleCollapseSide` mechanism end-to-end: field on `CockpitLayout`, top-corner chevrons in `BodyColumnContent`, `handleMiddleCollapseLeft/Right/Expand`, `refForColumnType`, and the absorber math inside `buildPanelLayoutMap`.

### 🟡 Moves with rename (no behaviour change)

- `cockpit-state.ts` → `frontend/lib/patient-profile/state.ts`.
- `useCockpitHotkeys.ts` → `useShellHotkeys.ts` (prop names stay slot-positional: `onToggleLeftRail` / `onToggleRightRail`).
- `useCockpitPresets.ts` → `usePatientProfilePresets.ts` (reads/writes the same `doctor_settings.cockpit_layout_presets` column via the existing API).
- `WrapUpDialog.tsx` → `frontend/components/patient-profile/wrap-up/WrapUpDialog.tsx`.
- `CockpitHeader.tsx` → `frontend/components/patient-profile/header/PatientProfileHeader.tsx`.
- `CockpitQueueRail.tsx` → `frontend/components/patient-profile/header/QueueRail.tsx`.

---

## Decision matrix (single-screen overview)

Tick the column you want for each row. This table mirrors the per-item details below.

### R0 — Strategic decisions (locked above; column kept for audit)

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|-----|--------|-------|
| R0.1 | Strangler Fig (DL-1) | [x] | [ ] | [ ] | |
| R0.2 | Content-agnostic shell (DL-2) | [x] | [ ] | [ ] | |
| R0.3 | Port content components by reference (DL-3) | [x] | [ ] | [ ] | |
| R0.4 | `PaneDefinition` contract (DL-4) | [x] | [ ] | [ ] | |
| R0.5 | Horizontal-only in v1 (DL-5) | [x] | [ ] | [ ] | |
| R0.6 | Uniform 40px collapse (DL-6) | [x] | [ ] | [ ] | |
| R0.7 | New `{paneOrder, paneState}` layout state (DL-7) | [x] | [ ] | [ ] | |
| R0.8 | Presets translated on load (DL-8) | [x] | [ ] | [ ] | |
| R0.9 | New localStorage namespace (DL-9) | [x] | [ ] | [ ] | |
| R0.10 | No backend changes (DL-10) | [x] | [ ] | [ ] | |
| R0.11 | Mobile fallback unchanged (DL-11) | [x] | [ ] | [ ] | |
| R0.12 | Name `PatientProfileShell` (DL-12) | [x] | [ ] | [ ] | |
| R0.13 | AI chat deferred but contract-ready (DL-13) | [x] | [ ] | [ ] | |

### R1 — Foundation (~1 day)

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|-----|--------|-------|
| R1.1 | New route `/dashboard/appointments/[id]/v2` (or `?v2=1` flag) | [ ] | [ ] | [ ] | |
| R1.2 | `<PatientProfilePage>` thin client island | [ ] | [ ] | [ ] | |
| R1.3 | `<PatientProfileShell>` — pure layout, content-agnostic | [ ] | [ ] | [ ] | |
| R1.4 | `PaneDefinition` types + `useShellLayout` hook | [ ] | [ ] | [ ] | |
| R1.5 | Spacer panel pattern + 40px collapse contract | [ ] | [ ] | [ ] | |
| R1.6 | ESLint rule: shell folder may not import medical concepts | [ ] | [ ] | [ ] | |

### R2 — Content panes (~1 day)

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|-----|--------|-------|
| R2.1 | Extract `<ConsultationBodyPane>` (was `BodyColumnContent`) | [ ] | [ ] | [ ] | |
| R2.2 | Extract `<RxPane>` (was `RxColumnContent`) | [ ] | [ ] | [ ] | |
| R2.3 | Wire `<PatientChartPane>` = thin wrapper over `<AppointmentChartRail>` | [ ] | [ ] | [ ] | |
| R2.4 | Plug all three panes into shell on `/v2` | [ ] | [ ] | [ ] | |
| R2.5 | Mount header strip (`<PatientProfileHeader>` + `<QueueRail>`) | [ ] | [ ] | [ ] | |
| R2.6 | Co-locate `collapsedRender` with each pane component | [ ] | [ ] | [ ] | |

### R3 — State, persistence, presets, hotkeys (~1 day)

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|-----|--------|-------|
| R3.1 | `frontend/lib/patient-profile/layout.ts` — new layout state shape + helpers | [ ] | [ ] | [ ] | |
| R3.2 | One-time localStorage seed: read old key → write new on first v2 load | [ ] | [ ] | [ ] | |
| R3.3 | Preset translation helper (`oldShape → newShape`) + preset apply path | [ ] | [ ] | [ ] | |
| R3.4 | Hotkeys ported (`[` / `]` / `Cmd/Ctrl+Shift+1..3` / `Cmd/Ctrl+Enter`) | [ ] | [ ] | [ ] | |
| R3.5 | Walk-in mode via `panes.filter(p => p.id !== "chart")` | [ ] | [ ] | [ ] | |

### R4 — Parity QA (~1 day)

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|-----|--------|-------|
| R4.1 | Parity matrix: 6 states × 3 modes (`live` / `wrap_up` / `ended`) × 6 column permutations | [ ] | [ ] | [ ] | |
| R4.2 | Mobile parity (`<lg` MobilePillBar + bottom-sheet flow) | [ ] | [ ] | [ ] | |
| R4.3 | Drag-to-reorder smoke test (6 permutations all reachable, both directions) | [ ] | [ ] | [ ] | |
| R4.4 | Resize + collapse + uncollapse smoke test (each pane, each pane-position) | [ ] | [ ] | [ ] | |
| R4.5 | Preset apply / save / delete on v2 (built-in × 3 + custom × ≥1) | [ ] | [ ] | [ ] | |
| R4.6 | Side-by-side dual-tab dev QA: `/v1` and `/v2` open, walk every state | [ ] | [ ] | [ ] | |

### R5 — Flip and delete (~1 day)

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|-----|--------|-------|
| R5.1 | Make v2 the default at `/dashboard/appointments/[id]` | [ ] | [ ] | [ ] | |
| R5.2 | Add `?v1=1` escape hatch (one release window) | [ ] | [ ] | [ ] | |
| R5.3 | Delete `ConsultationCockpit.tsx` + `cockpit-layout.ts` + 4 obsoleted helpers | [ ] | [ ] | [ ] | |
| R5.4 | Move + rename green-grade files (`cockpit-state.ts`, `useCockpitHotkeys`, `WrapUpDialog`, `CockpitHeader`, `CockpitQueueRail`) | [ ] | [ ] | [ ] | |
| R5.5 | Remove `?cockpitDbg=1` debug instrumentation (inbox.md L280) | [ ] | [ ] | [ ] | |
| R5.6 | Close inbox debt items obsoleted by this work (inbox.md L278, L280) | [ ] | [ ] | [ ] | |
| R5.7 | Resolve git-status leftover files (delete the empty `RxRailToggle.tsx` etc.) | [ ] | [ ] | [ ] | |

### R6 — Future-proofed but parked

| ID | Item | Promote? (Y/N) | Notes |
|----|------|----------------|-------|
| R6.1 | AI chat pane (4th `PaneDefinition`) | [ ] | One-diff add. Owner: TBD. Triggered by the AI-assist plan, not this one. |
| R6.2 | Vertical split inside a column (`PaneDefinition.children`) | [ ] | Recursive PaneDefinition. The user's "history above, treatment below" idea. |
| R6.3 | Tabs inside a pane (`PaneDefinition.tabs?: TabDefinition[]`) | [ ] | Alternative to vertical split. Decide one or the other before promoting. |
| R6.4 | Tablet (`md..lg`) split layout | [ ] | Today tablet inherits the mobile pattern (DL-11). |
| R6.5 | Per-doctor default pane order from `doctor_settings` | [ ] | Today the default is `chart → body → rx`; doctors can save a custom preset and pin it. |
| R6.6 | Cascading drag-to-collapse across three columns | [ ] | inbox.md L278. The new shell makes this easier (single layout-state shape) but it's still out of v1. |

---

## Per-item details (decisions live here too — the table above is just a summary)

### R1 · Foundation (the keystone)

> **Why this is the keystone:** R1 ships a working shell with three synthetic `<div>` panes that has zero medical imports. If R1 is solid, R2 onward is mechanical wiring. If R1 leaks medical concepts, the rebuild has already failed and we've just moved the mess.

#### R1.1 — New route `/dashboard/appointments/[id]/v2`

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** New Next.js page file `frontend/app/dashboard/appointments/[id]/v2/page.tsx`. Mirrors the existing `[id]/page.tsx` (server component: auth → fetch → error states → mount a client island). The only difference: it renders `<PatientProfilePage>` instead of `<ConsultationCockpit>`.

**Why a separate route vs a `?v2=1` query flag:** A real route means Next.js can statically analyse, prefetch, and lint it independently. A query flag would force the existing page to conditionally render two trees, which re-introduces the coupling this plan is here to remove. The route is deleted in R5.1 when v2 becomes the default.

**Effort:** ~30 min.

**Depends on:** none.

**Reversibility:** Trivial — `git rm` the folder.

---

#### R1.2 — `<PatientProfilePage>` client island

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** New client component `frontend/components/patient-profile/PatientProfilePage.tsx`. Props identical to `ConsultationCockpit` (`{ appointment: Appointment; token: string }`). Owns:

1. The cockpit state machine (`deriveCockpitState`), unchanged.
2. Construction of the `panes: PaneDefinition[]` array from the appointment.
3. Mounting `<PatientProfileShell panes={panes} ... />`.

This is the ONLY file in the new shell that knows medical concepts. It's the bridge.

**Effort:** ~1h (mostly assembling the panes array from existing imports).

**Depends on:** R1.3, R1.4.

**Reversibility:** High.

---

#### R1.3 — `<PatientProfileShell>` — pure layout

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** New file `frontend/components/patient-profile/Shell.tsx`. Owns:

- The `<ResizablePanelGroup>` with one `<ResizablePanel>` per `panes[i]` + the trailing spacer panel.
- Per-pane collapse state (read + write via `useShellLayout`).
- Drag-to-reorder via `@dnd-kit/core` — column headers are the drag handles.
- Adjacent-pane absorber math when one collapses (left-to-right scan; spacer absorbs leftover).
- Persistence to `patient-profile:v1:layout` on settle.

**Hard constraint (R1.6):** ESLint enforces zero imports from `@/components/consultation/**`, `@/components/ehr/**`, `@/lib/consultation/**`, `@/types/appointment`. The shell receives `panes`; it doesn't know what's in them.

**Lines:** ~250 LOC target. Compare to today's 2,548.

**Effort:** ~3h.

**Depends on:** R1.4, R1.5.

**Reversibility:** High (lives in its own folder; not referenced outside `<PatientProfilePage>`).

---

#### R1.4 — `PaneDefinition` types + `useShellLayout`

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** New file `frontend/lib/patient-profile/types.ts`:

```ts
export interface PaneDefinition {
  /** Stable id; used as the layout key. Examples: "chart", "body", "rx", "ai-chat". */
  id: string;
  /** Header title shown in `<CockpitColumnHeader>` when expanded. */
  title: string;
  /** Render function for the expanded pane body. */
  render: () => React.ReactNode;
  /** Render function for the 40px collapsed strip. Falls back to a generic chevron-only stub. */
  collapsedRender?: () => React.ReactNode;
  /** Minimum width as a % of the group. Defaults to 12. */
  minSizePct?: number;
  /** Natural width as a % of the group. Used as the initial size and as the restore target on uncollapse. */
  naturalSizePct?: number;
  /** Whether this pane is allowed to collapse. Defaults to `true`. */
  canCollapse?: boolean;
  /** Optional hotkey to focus/expand this pane (e.g. `"mod+1"` for chart). */
  hotkey?: string;
}
```

And the hook `frontend/lib/patient-profile/useShellLayout.ts`:

```ts
export function useShellLayout(opts: {
  storageKey: string;
  defaultPaneOrder: string[];
  defaultPaneState: Record<string, { sizePct: number; collapsed: boolean }>;
}): {
  paneOrder: string[];
  paneState: Record<string, { sizePct: number; collapsed: boolean }>;
  setPaneOrder: (next: string[]) => void;
  setPaneSize: (id: string, sizePct: number) => void;
  setPaneCollapsed: (id: string, collapsed: boolean) => void;
  reorderPane: (fromId: string, toId: string) => void;
  applyPreset: (preset: PaneLayoutPreset) => void;
};
```

**Why this shape:** Replaces the four-layer `CockpitLayout` (`slots` tuple + `widths` tuple + `collapsed` map + `middleCollapseSide`) with two flat fields keyed by pane id. Adding a 4th pane = adding a string to `paneOrder` + a record entry to `paneState`. Reorder = `arrayMove(paneOrder, ...)`. No `slots[1]` guards anywhere.

**Effort:** ~2h.

**Depends on:** none.

**Reversibility:** High.

---

#### R1.5 — Spacer panel + 40px collapse contract

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Keep the spacer-panel idea from this week's fix (it was correct). The shell always renders one extra invisible `<ResizablePanel id="patient-profile-spacer">` at the end of the group; its size is computed as `100 - sum(panes' sizes)` so the panel group always sums to 100%.

When a pane collapses to 40px:
1. The shell computes `freedPct = previousSizePct - sizeOf(40px in %)`.
2. The freed % is given to the FIRST expanded pane in `paneOrder` going LEFT (i.e. with a lower index than the collapsed pane), or to the FIRST expanded pane going RIGHT if no left neighbour is expanded, or to the spacer.
3. On uncollapse, the absorber pane gives back the `naturalSizePct` of the uncollapsing pane (capped at the absorber's `minSizePct`).

**Why this is simpler than today:** No `middleCollapseSide` decision. No top-corner chevrons. No "is this in slot 1?" branches. The chevron always sits in the pane's own header on the right side, and the absorber rule is deterministic.

**Effort:** Folded into R1.3.

**Depends on:** R1.4.

---

#### R1.6 — ESLint rule: shell folder may not import medical concepts

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Add an `eslint-plugin-import` no-restricted-paths rule:

```json
{
  "zones": [{
    "target": "./frontend/components/patient-profile/Shell.tsx",
    "from": [
      "./frontend/components/consultation",
      "./frontend/components/ehr",
      "./frontend/lib/consultation",
      "./frontend/types/appointment.ts"
    ]
  }]
}
```

**Why:** This is what prevents the new shell from accumulating the same coupling as the old one. The rule is the architectural lock from DL-2 made enforceable.

**Effort:** ~30 min.

**Depends on:** none.

**Reversibility:** Trivial — delete the zone.

---

### R2 · Content panes

> **Why this phase is short:** Three of the panes are already standalone components. The only real work is pulling `BodyColumnContent` and `RxColumnContent` out of `ConsultationCockpit.tsx`'s inner scope into their own files.

#### R2.1 — Extract `<ConsultationBodyPane>`

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Cut `BodyColumnContent` from `ConsultationCockpit.tsx` (≈400 LOC) into `frontend/components/patient-profile/panes/ConsultationBodyPane.tsx`. Props become explicit (today they're closed over from the parent's scope):

```ts
interface ConsultationBodyPaneProps {
  appointment: Appointment;
  state: CockpitState;
  modality: ConsultationModality | null;
  onWrapUp: () => void;
  // ... etc — same surface the inner function reads today, just hoisted
}
```

Both v1 and v2 import this during the transition. v1 keeps working unchanged.

**Effort:** ~2h.

**Depends on:** none.

**Reversibility:** High — re-inline if anything breaks.

---

#### R2.2 — Extract `<RxPane>`

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Same pattern as R2.1 for `RxColumnContent`. Lands as `frontend/components/patient-profile/panes/RxPane.tsx` (~150 LOC). Wraps `<RxWorkspace>` with the appropriate header + collapsed renderer.

**Effort:** ~1h.

**Depends on:** none.

**Reversibility:** High.

---

#### R2.3 — Wire `<PatientChartPane>` over `<AppointmentChartRail>`

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** `frontend/components/patient-profile/panes/PatientChartPane.tsx` — ~30 LOC thin wrapper that just renders `<AppointmentChartRail>` with the pane's column header and a collapsed strip (`<CollapsedChartRail>`-equivalent inline). `AppointmentChartRail` itself is unchanged.

**Effort:** ~30 min.

**Depends on:** none.

**Reversibility:** Trivial.

---

#### R2.4 — Plug all three panes into shell on `/v2`

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** In `PatientProfilePage` (R1.2), construct the panes array:

```ts
const panes: PaneDefinition[] = [
  { id: "chart", title: "Patient chart", render: () => <PatientChartPane ... />, naturalSizePct: 26, hotkey: "mod+1" },
  { id: "body",  title: "Consultation",  render: () => <ConsultationBodyPane ... />, naturalSizePct: 48, hotkey: "mod+2" },
  { id: "rx",    title: "Prescription",  render: () => <RxPane ... />, naturalSizePct: 26, hotkey: "mod+3" },
];
```

Walk-in branch (no `patient_id`) does `panes.filter(p => p.id !== "chart")`. That's the entire walk-in special case in v2 — vs `DEFAULT_WALKIN_LAYOUT` + `LAYOUT_GROUP_ID_WALKIN` + `shouldShowChartRail` in v1.

**Effort:** ~30 min.

**Depends on:** R2.1, R2.2, R2.3, R1.3.

**Reversibility:** Trivial.

---

#### R2.5 — Mount header strip

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** `<PatientProfilePage>` renders `<PatientProfileHeader>` (existing `CockpitHeader`) + `<QueueRail>` (existing `CockpitQueueRail`) above the shell. These remain unchanged in v2 — just re-mounted from a new parent. Layout-related props (`onApplyLayout`, `onSavePreset`, etc.) re-bind to the new `useShellLayout` setters via a small adapter.

**Effort:** ~1h (most of which is the adapter).

**Depends on:** R3.3 (preset apply path).

**Reversibility:** High.

---

#### R2.6 — Co-locate `collapsedRender` with each pane

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Today `CollapsedChartRail.tsx` and `CollapsedRxRail.tsx` are standalone files referenced indirectly through the shell's "collapsed stub renderer" dispatch. In v2, each pane file owns its own collapsed render as a sibling component:

```tsx
// PatientChartPane.tsx
export function PatientChartPane(props) { ... }
export function PatientChartCollapsedStrip(props) { ... }

// panes array:
{ id: "chart", title: "Patient chart",
  render: () => <PatientChartPane {...props} />,
  collapsedRender: () => <PatientChartCollapsedStrip {...props} /> },
```

Same code, better locality. The two `CollapsedChartRail.tsx` / `CollapsedRxRail.tsx` files can be deleted in R5.

**Effort:** ~30 min.

**Depends on:** R2.1, R2.2, R2.3.

**Reversibility:** Trivial.

---

### R3 · State, persistence, presets, hotkeys

#### R3.1 — `frontend/lib/patient-profile/layout.ts`

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** New module that owns:

- The layout state shape (`PatientProfileLayout`).
- `validateLayout(raw): PatientProfileLayout | null` — like the existing `validateLayout` but against the new shape; rejects unknown pane ids and clamps `sizePct` to `[0, 100]`.
- `layoutsEqual(a, b)`.
- Helpers: `reorderPane`, `setPaneSize`, `setPaneCollapsed`, `applyAbsorberRule` (the deterministic left-to-right scan from DL-6).

Target: ~150 LOC. Replaces the 344-LOC `cockpit-layout.ts` (deleted in R5).

**Effort:** ~3h.

**Depends on:** R1.4.

**Reversibility:** High — pure module.

---

#### R3.2 — One-time localStorage seed

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** On first load of v2 for a given browser, read the old keys (`cockpit-layout:v1:cockpit-shell`, `react-resizable-panels:cockpit-shell`) once, translate to the new shape, write to `patient-profile:v1:layout`, mark the seed done with a sentinel key (`patient-profile:v1:seeded`). Subsequent loads ignore the old keys.

**Why:** Doctors who already saved a custom split don't lose it on cutover. The old keys remain in localStorage but are no longer read; they'll evict naturally.

**Effort:** ~1h.

**Depends on:** R3.1.

**Reversibility:** Trivial.

---

#### R3.3 — Preset translation + apply path

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Two pieces:

1. **Translation:** Pure helper `translateLegacyPreset(legacy): PatientProfileLayoutPreset`. Built-in presets (Triage / Consult / Document) re-author by hand into the new shape and ship as a constant.
2. **Apply path:** `usePatientProfilePresets` returns `{ applyPreset, savePreset, deletePreset, listPresets }`. Internally calls the same `doctor_settings.cockpit_layout_presets` API (no backend change, DL-10). Custom presets stored under the same column with a new `version: 2` tag; the existing v1-shape presets are translated on read.

**Effort:** ~3h.

**Depends on:** R3.1.

**Reversibility:** Medium — write path needs care so v1 doctors don't see their presets disappear.

---

#### R3.4 — Hotkeys ported

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Re-export `useCockpitHotkeys` as `useShellHotkeys` (no behaviour change). Props rename: `onToggleChartRail` → `onToggleLeftPane`, `onToggleRxRail` → `onToggleRightPane`. The shell wires these to `setPaneCollapsed(paneOrder[0], ...)` and `setPaneCollapsed(paneOrder[paneOrder.length - 1], ...)` — slot-positional semantics survive intact.

**Effort:** ~1h.

**Depends on:** R1.4.

**Reversibility:** Trivial.

---

#### R3.5 — Walk-in mode

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Already specified in R2.4: `panes.filter(p => p.id !== "chart")` when `!appointment.patient_id`. Storage key uses a `:walkin` suffix to avoid the 3-pane and 2-pane layouts fighting over a single saved record (same logic as today, simpler).

**Effort:** ~30 min.

**Depends on:** R2.4.

**Reversibility:** Trivial.

---

### R4 · Parity QA

> **Why this matters:** the only way the user gets out of the rebuild loop trusting v2 is if v2 has been walked through every state on a real appointment, side by side with v1. R4 is the "boring but mandatory" phase that earns the cutover.

#### R4.1 — Parity matrix

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** A literal table walked manually in dev:

|   | live (text) | live (voice) | live (video) | wrap_up | ended | terminal |
|---|---|---|---|---|---|---|
| chart-body-rx | | | | | | |
| chart-rx-body | | | | | | |
| body-chart-rx | | | | | | |
| body-rx-chart | | | | | | |
| rx-chart-body | | | | | | |
| rx-body-chart | | | | | | |

Each cell: tick if v1 and v2 render the same surface and the same actions are reachable. Any miss = bug.

**Effort:** ~3h.

**Depends on:** R3.

---

#### R4.2 — Mobile parity

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Open `/v1` and `/v2` on a `<lg` viewport. Walk: ready → start text consult → send Rx → wrap-up. MobilePillBar present in both. Bottom-sheets open from both. No layout drift.

**Effort:** ~30 min.

**Depends on:** R2.

---

#### R4.3 / R4.4 / R4.5 / R4.6

See decision-matrix above; all are concrete short checklists, ~30min each. Total ~2h.

---

### R5 · Flip and delete

#### R5.1 — Make v2 the default

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Edit `frontend/app/dashboard/appointments/[id]/page.tsx`: replace the `<ConsultationCockpit>` mount with `<PatientProfilePage>` (import path from `@/components/patient-profile/PatientProfilePage`). Delete `frontend/app/dashboard/appointments/[id]/v2/page.tsx` (its content moves into the canonical route).

**Effort:** ~10 min.

**Depends on:** R4 fully green.

**Reversibility:** Trivial — re-mount `<ConsultationCockpit>` for one commit's worth of regret.

---

#### R5.2 — Add `?v1=1` escape hatch

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** In `[id]/page.tsx`, if `searchParams.v1 === "1"`, render `<ConsultationCockpit>` instead of `<PatientProfilePage>`. Kept for one release window (~1 week of production use), then removed in a follow-up commit.

**Effort:** ~15 min.

**Reversibility:** Trivial.

---

#### R5.3 — Delete the old code

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** After the kill-switch window closes:

- `git rm frontend/components/consultation/ConsultationCockpit.tsx`
- `git rm frontend/lib/consultation/cockpit-layout.ts`
- `git rm frontend/components/consultation/cockpit/CollapsedChartRail.tsx`
- `git rm frontend/components/consultation/cockpit/CollapsedRxRail.tsx`
- `git rm frontend/components/consultation/cockpit/CockpitColumnDragHandle.tsx`
- `git rm frontend/components/consultation/cockpit/CockpitColumnDropZone.tsx`
- The `?v1=1` branch in `[id]/page.tsx`.
- Any imports still referencing the deleted files.

Expected diff: **−~3,200 LOC**.

**Effort:** ~30 min.

**Depends on:** ~1 release window between R5.1 and R5.3.

---

#### R5.4 — Move green-grade files

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Pure renames (no behaviour change):

- `frontend/lib/consultation/cockpit-state.ts` → `frontend/lib/patient-profile/state.ts`
- `frontend/hooks/useCockpitHotkeys.ts` → `frontend/hooks/useShellHotkeys.ts`
- `frontend/hooks/useCockpitPresets.ts` → `frontend/hooks/usePatientProfilePresets.ts`
- `frontend/components/consultation/cockpit/WrapUpDialog.tsx` → `frontend/components/patient-profile/wrap-up/WrapUpDialog.tsx`
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` → `frontend/components/patient-profile/header/PatientProfileHeader.tsx`
- `frontend/components/consultation/cockpit/CockpitQueueRail.tsx` → `frontend/components/patient-profile/header/QueueRail.tsx`
- All test files follow.

**Effort:** ~1h (including updating ~40 imports).

**Reversibility:** Trivial via git.

---

#### R5.5 / R5.6 / R5.7

- R5.5: Search `ConsultationCockpit.tsx` for `COCKPIT_DBG_DEFAULT`, `dbgLog`, `cockpitDbgEnabled` — all delete with R5.3 since the host file is gone.
- R5.6: Tick off [inbox.md L278](../../capture/inbox.md) (cascading drag — now blocked on a separate plan or accepted out-of-scope) and L280 (debug instrumentation — resolved by R5.3).
- R5.7: Git status leftovers (`RxRailToggle.tsx` D, `WalkInQuickModal.tsx` D, etc.) get committed cleanly.

---

## Sequencing recommendation

```
Day 1  (R1 — Foundation)
 │   R1.1  new route
 │   R1.4  PaneDefinition + useShellLayout
 │   R1.3  Shell.tsx (synthetic <div> panes only)
 │   R1.5  spacer + 40px collapse
 │   R1.6  ESLint zone
 │   End-of-day check: /v2 renders 3 synthetic panes; drag, resize, collapse, reorder all work.
 ▼
Day 2  (R2 — Real panes)
 │   R2.1  extract ConsultationBodyPane
 │   R2.2  extract RxPane
 │   R2.3  PatientChartPane wrapper
 │   R2.4  plug into shell
 │   R2.5  header strip
 │   R2.6  co-locate collapsed renderers
 │   End-of-day check: /v2 renders real medical content. Hotkeys not yet wired.
 ▼
Day 3  (R3 — State, presets, hotkeys)
 │   R3.1  layout module + helpers
 │   R3.2  one-time localStorage seed
 │   R3.3  preset translation + apply
 │   R3.4  hotkeys ported
 │   R3.5  walk-in branch
 │   End-of-day check: presets apply, hotkeys fire, walk-in works.
 ▼
Day 4  (R4 — Parity QA)
 │   R4.1  parity matrix (6 × 3 × 6)
 │   R4.2  mobile parity
 │   R4.3–6  smoke tests
 │   Plus any small bug fixes found.
 │   End-of-day check: zero observable difference between /v1 and /v2.
 ▼
Day 5  (R5 — Flip and delete)
     R5.1  default = v2
     R5.2  ?v1=1 escape hatch
     R5.4  rename green-grade files
     [ One release window — observe in prod ]
     R5.3  delete old shell (~3,200 LOC out)
     R5.5–7  cleanup
```

**Parallelism opportunity:** R2.1 and R2.2 can run in two parallel chats once R1 is done. R3.1 can start in parallel with R2 once R1.4 lands. Realistic 5 days → optimistic 3.5 days with two-chat parallelism.

---

## Success criteria

| Metric | Today | Target after R5 |
|---|---|---|
| LOC in the biggest layout file | 2,548 (`ConsultationCockpit.tsx`) | ≤300 (`Shell.tsx`) |
| Number of `isMiddleSlot` / `ColumnType` guards in the shell | 17 (grep result) | 0 |
| Shell folder imports from `@/components/consultation`, `@/components/ehr`, `@/lib/consultation`, `@/types/appointment` | ~30 imports | 0 (ESLint-enforced via R1.6) |
| Add a 4th pane (AI chat) | Estimated ~1 dev-day of edits across `cockpit-layout.ts`, `ConsultationCockpit.tsx`, plus new collapsed renderer | One `panes.push({...})` diff (≤20 LOC) |
| `?cockpitDbg=1` instrumentation still in tree | Yes ([inbox.md L280](../../capture/inbox.md)) | No |
| "Reorder column then resize → wrong column collapses" recurrence | Reported intermittently this week | 0 after R3 (shape rewrites away the source) |
| Open inbox debt items tagged "Cockpit polish" | 2 (L278, L280) | 0 |

---

## Open questions (track here; lock before promoting to batch)

#### R-Q1 — `/v2` route vs `?v2=1` flag

**Question:** Plan currently locks DL-1 as a separate route. Is anyone uncomfortable with two URLs for the same appointment briefly coexisting (telemetry, deep-link sharing)?

**Notes:** Recommend stay-the-course (separate route is cleaner). Telemetry can tag `app_version` either way. Deep links from emails / notifications point at the canonical URL, which is `/v1` until R5.1 and `/v2` after — both routes work for the cutover window.

---

#### R-Q2 — Drag-and-drop library — keep dnd-kit?

**Question:** Today the cockpit uses `@dnd-kit/core`. The new shell could either keep dnd-kit or simplify to HTML5 drag events (the panes are 3 items; we don't need a heavy framework).

**Notes:** Recommend keep `@dnd-kit/core`. It's already in the bundle (~9KB gz), team is familiar, accessibility props (`useDraggable`, `useDroppable`) are correct for keyboard reorder. Switching is risk for no win.

---

#### R-Q3 — Should v2 absorb the per-task work from the cockpit-customization batch?

**Question:** The 10-05-2026 cockpit-customization batch shipped 14 tasks (cc-01..cc-14). Most of their changes were structural lifts that we're keeping (column-header component, presets, hotkeys, drag-to-reorder). Are there any cc-* tasks that should be re-litigated in v2?

**Notes:** Recommend no — everything cc-* shipped is in the 🟢 list and gets ported by reference. The bug surface was elsewhere.

---

#### R-Q4 — Preset versioning column on `doctor_settings`

**Question:** v2 presets have a different shape than v1 presets (different keys, no `slots` / `widths` tuples). Should `doctor_settings.cockpit_layout_presets` get a `version: 1 | 2` discriminator, or do we just translate on read?

**Notes:** Vote: translate on read for now (DL-10 — no backend change). If we ever need to mix v1 and v2 clients reading the same row, revisit.

---

#### R-Q5 — Rename `doctor_settings.cockpit_layout_presets`?

**Question:** The column name still says "cockpit". Rename to `patient_profile_layout_presets` at some point?

**Notes:** Vote: no — column renames are expensive (migration + every read site). The name is internal; UI says "Layouts". Park.

---

## Plan rules (pre-ship workflow)

These apply while the plan is `Drafted` / `Selected`.

1. **Editing this file is welcome** under any `Notes:` line. Don't edit headers / IDs.
2. **Don't renumber items.** R-IDs are stable. New items take the next available number; killed items keep their ID and gain `[KILLED]` suffix.
3. **When all items in R0–R5 have a `Decision:` ticked, this plan promotes to a dated batch** under `Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild/plan-patient-profile-shell-rebuild-batch.md` and becomes `Committed`.
4. **Implementation MUST NOT start until promotion.** R-IDs are decided here; the daily-plans batch derives the per-task files from those IDs.
5. **The `?v1=1` escape hatch must work continuously during R5.1 → R5.3.** If at any point v1 is broken, the cutover rolls back.

---

**Created:** 2026-05-13.  
**Status:** `Drafted`.  
**Owner:** TBD.
