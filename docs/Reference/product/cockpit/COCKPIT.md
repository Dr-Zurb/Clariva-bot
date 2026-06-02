# Cockpit architecture reference

> **Single source of truth for cockpit state.** As of **2026-06-02**, the
> **Cockpit v3** program is **shipped**: the live appointment-detail cockpit is
> `CockpitV3Shell` (editor groups + pane palette + always-on tabs + Cursor-style
> drag-and-drop). The legacy `PatientProfileShell`, customize mode, the 5-zone
> `PaneDropOverlay`, and the `NEXT_PUBLIC_COCKPIT_V3` flag are **deleted**
> (cv3x-03). This file describes the **post-cutover** world only.
>
> Prior product plans (`plan-cockpit-v2.md`, `plan-cockpit-v3.md`) and the
> pane-freedom program remain in `docs/Work/Product plans/` and daily-plans
> folders for history. **Future cockpit work updates this file** in each batch's
> close-out task.

> Agent-facing map of the patient-profile cockpit shell, Rx form wiring, and
> production mount points. Last cutover doc pass: **cv3x-04** (2026-06-02).

---

## Composition root and shared form state

All prescription SOAP fields on the appointment-detail page share **one**
`<RxFormProvider>` lifted at the top of `PatientProfilePage`. The cockpit v3
shell sits **inside** that provider stack; clinical-safety chrome is passed in
as anchored docks.

```
PatientProfilePage
└── RxFormProvider                    ← single autosave timer (DL-30)
    └── RxSafetyProvider
        └── RxFormActionsBridgeProvider
            └── PrescriptionFormShellProvider
                └── SideSheetHost
                    └── CockpitV3Shell  ← editor-group canvas (live)
                        ├── safetyDock  → SafetyStickyStrip (anchored)
                        ├── actionDock  → PlanActionFooter (anchored)
                        └── panes       → flat tab registry (buildCockpitTabs)
```

**Mount surfaces (DL-30):**

| Surface | Path | Notes |
|---|---|---|
| Appointment detail (desktop + mobile) | `frontend/app/dashboard/appointments/[id]/page.tsx` → `PatientProfilePage` | Canonical route; v3 flat-tab registry. |
| Rx column (desktop) | `plan` tab → `RxPane` → `RxWorkspace` → `PrescriptionForm` | Same provider as Subjective/Objective tabs. |
| Rx pill (mobile `<lg`) | `CockpitMobileFallback` pill bar → `RxWorkspace` | Flat mobile view; no editor-group splits. |

In-call mini-panel and post-call summary still use `PrescriptionForm` through
their own trees; they are **not** wrapped by `PatientProfilePage`'s provider.
Regression-test those separately.

**ESLint:** Direct `<ResizablePanelGroup>` usage outside
`CockpitGroupView.tsx` is forbidden. Mount panes through the v3 shell and the
`PaneDefinition` contract in `foundation.ts`.

---

## Live shell — Cockpit v3 (cv3x-03 cutover)

**Route:** `/dashboard/appointments/[id]`  
**Shell:** `frontend/components/patient-profile/v3/CockpitV3Shell.tsx`  
**Tab registry:** `frontend/lib/patient-profile/v3/cockpit-tabs.tsx` (`buildCockpitTabs`, `buildWalkInCockpitTabs`)  
**Layout hook:** `useCockpitV3Layout` → `useShellLayout` (same `PaneTreeNode` v5 shape)  
**Persistence key:** `patient-profile/v4-tree-layout::<storageKey>` — default `patient-profile/v4-tree-layout::telemed-video` (`TELEMED_VIDEO_LAYOUT_STORAGE_KEY`); walk-in uses `WALKIN_LAYOUT_STORAGE_KEY`.

### Interaction model (always on — no customize mode)

| Capability | How it works |
|---|---|
| **Add / remove panes** | Header **pane palette** (`CockpitPalette`) — toggle each of the eight clinical tabs on/off; blank canvas shows discoverable add affordance. |
| **Move / split / tab** | Grab any tab → **Cursor-style** single translucent preview (`CockpitDropOverlay`) → drop on left/right half (column), top/bottom half (row), or tab bar (stack as tab). **No mode toggle.** |
| **Context menu** | Right-click tab/header → `CockpitLeafMenu` — move/split/extract (keyboard / no-pointer path). |
| **Resize** | `react-resizable-panels` inside `CockpitGroupView` at every split depth. |
| **Caps** | `MAX_LEAVES = 10`, `MAX_PANES_PER_TABS = 6` — soft toast on hit (v3-DL-7). |
| **Live-consult guard** | `body` tab not draggable while `consultActive` (v3-DL-6). |

The pure mutation engine is **unchanged** from pane-freedom / v2:
`layout-tree-mutations.ts` (`dropPaneIntoZone`, `addToTabsNode`, `extractFromTabsNode`, `setActiveTab`, …). v3 only replaced the **renderer + overlay UX**.

### Anchored clinical-safety chrome (v3-DL-6)

These render as **fixed shell docks** outside the draggable tree — never
hideable, never draggable:

| Piece | Component | Mount |
|---|---|---|
| Safety strip | `SafetyStickyStrip` | `safetyDock` prop on `CockpitV3Shell` |
| Send footer | `PlanActionFooter` | `actionDock` prop on `CockpitV3Shell` |

`RxFormActionsBridgeProvider` stays at the **page root** so the docked footer
fires `sendAndFinish` regardless of where the `plan` tab is dragged.

### Desktop layout sketch

```
┌──────────────────────────────────────────────────────────────────────────┐
│ CockpitHeader — patient identity, consult CTA, back link                  │
├──────────────────────────────────────────────────────────────────────────┤
│ PatientRibbon (lg+, known patient) — allergies · chronic · 💊 · 🎯 Dx    │
├──────────────────────────────────────────────────────────────────────────┤
│ Pane palette: [Snapshot][History][Consult][Assessment][Inv][Plan][S][O]  │
├──────────────────────────────────────────────────────────────────────────┤
│ SafetyStickyStrip (anchored — never in the tree)                          │
├───────────────────────────┬──────────────────────────────────────────────┤
│ ┌ Snapshot │ History │     │ ┌ Consult │ Subjective │  ← tab bars always   │
│ │  (tabs)  │         │     │ │  (tabs) │            │    visible; always  │
│ ├──────────┴─────────┤     │ ├─────────┴────────────┤    draggable         │
│ │  active pane body  │     │ │  active pane body    │                      │
│ └────────────────────┘     │ └──────────────────────┘                      │
├───────────────────────────┴──────────────────────────────────────────────┤
│ PlanActionFooter (anchored): Saved · 12:04              [Send Rx & finish] │
└──────────────────────────────────────────────────────────────────────────┘
```

### Mobile (`<lg`, v3-DL-8)

`CockpitMobileFallback` — flat stacked / pill view of visible panes; **no**
drag-to-split. Safety strip + finish/send affordance remain reachable.

### Walk-in (no `patient_id`)

`buildWalkInCockpitTabs` — palette offers **`body`** + **`plan`** only;
chart-rail tabs omitted. Storage key: `WALKIN_LAYOUT_STORAGE_KEY`.

---

## The eight clinical tabs (flat registry — Phase 5)

Source of truth: `COCKPIT_TAB_ORDER` in `cockpit-tabs.tsx`. Each tab is a
**self-contained** `PaneDefinition` (no nested `left-column` / `middle-column`
wrappers). Bodies are **ported by reference** from the v2 template factories.

| Tab id | Label (live) | Body (by reference) |
|---|---|---|
| `snapshot` | Snapshot | `SnapshotPane` + `ChartRailWithEmptyState` |
| `history` | History | `HistoryPane` |
| `body` | **Consult** (live) / **Visit summary** (review) | `BodyZone` or `EndedConsultBody` |
| `assessment` | Assessment | `AssessmentStrip` (`id="diagnosis"`) |
| `investigations-orders` | Investigations | `InvestigationsPane` |
| `plan` | Plan | `RxPane` (medicines; lifted props for dedup) |
| `subjective` | Subjective | `SubjectivePane` |
| `objective` | Objective | `ObjectivePane` |

**Template dispatch** still uses `mapStateToTemplate(state, modality, override)`
→ `buildCockpitTabs(ctx, templateId)` picks body variant + tab subset. Doctor
override: `doctor_settings.cockpit_template_override` (migration 106).

**Phase-5 decouple:** Plan and Investigations are **independent tabs** (no
`InvestigationsAutoMerge` container-query marriage on the v3 path). Both still
write the shared `investigationsOrders` field in `RxFormContext`.

**Deferred seed (V3-Q1):** First open is a **blank canvas** the doctor builds
via the palette; no automatic 8-pane pre-fill on the v3 path.

---

## Pane bodies and clinical surfaces (unchanged below the shell)

The shell was rewritten; **pane bodies and Rx wiring were not.** The sections
below remain accurate for the tab bodies v3 mounts.

### Investigations (middle)

`<InvestigationsPane>` — chip row + autocomplete; autosaves via
`RxFormContext.fields.investigationsOrders` (semicolon-separated). Read-only in
`ended` / `terminal`. Telemetry: `cockpit_v2.r_middle_inv_landed`.

### Assessment strip

Working Dx + DDx chips; hosts canonical `id="diagnosis"`. PatientRibbon 🎯
focuses this input. `AssessmentSection` inside Plan hides duplicate Dx when the
strip is present.

### Plan pane dedup (ppd)

`RxPane` lift props (`subjectiveLifted`, `objectiveLifted`, `safetyLifted`,
`actionsInFooter`, …) hide duplicate blocks inside `PrescriptionForm`; the
right column owns SOAP documentation; Plan is **medicines-only** in production.

### Medicine row densification

Summary (~48px) vs editor (~260px) states; one active editor per `PlanSection`.

### Plan-pane keyboard shortcuts

Pane-scoped when focus is inside `data-cockpit-pane-id="plan"`:

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd+Enter` | Send Rx & finish |
| `Ctrl/Cmd+M` | Add medicine |
| `Ctrl/Cmd+Shift+T` | Open templates |
| `Ctrl/Cmd+Shift+P` | Open preview |

**Global:** `Ctrl/Cmd+K` command palette; `?` keyboard help.

### Previous-Rx side sheet

Plan zone → `previous-rx` anchor (480px); filter chips, virtual scroll, Append/Replace apply.

### Drug favorites + autocomplete ranking

Favorite chips + `doctor_drug_usage` ranking (migrations 108–109).

### Patient ribbon (desktop, known patient)

52px strip between header and shell — allergies, chronic, active med count, treating Dx mirror. Hidden for walk-in and mobile `<lg`.

### Right column — Subjective / Objective

Full DL-24 field set; BMI client-side; examination split via `\n--- SYSTEMIC ---\n` delimiter (`frontend/lib/cockpit/exam-findings.ts`).

### Chart-rail density

Unified empty-state when all five chart signals empty; per-pane disclosure chevrons (session-only collapse).

### Visual system (cpv)

`PaneHeader`, semantic tokens, `pane-icons.ts` SoT, AssessmentStrip zero-state, SaveStatusPill states.

---

## Persistence

| Layer | Shape | Notes |
|---|---|---|
| Browser | `PaneTreeNode` v5 in `localStorage` | Key: `patient-profile/v4-tree-layout::<storageKey>` |
| Server presets | `doctor_settings.cockpit_layout_presets` | Migration 112; tree JSONB; max 5 custom presets |

v3 reuses the pane-freedom layout model (v3-DL-10). Layouts saved under the
old shell hydrate in v3 via `validateLayout` / `upgradeV4LeavesToV5`.

**Scope today:** per-doctor per storage key (per-browser in practice). **Deferred:** per-(doctor × consult-type) keys (V3-Q6 fast-follow).

**Preset CRUD UI:** data + API remain; header preset picker / save dialogs were removed with the old shell. **Deferred:** port preset management UI to v3.

---

## Retired interaction model (not live — do not document as current)

Removed in **cv3x-03** (2026-06-02). Listed here only so agents do not resurrect
these paths:

| Removed | Was |
|---|---|
| `PatientProfileShell` (`Shell.tsx`) | Nested 8-pane template renderer |
| Customize mode | `customize-mode-context`, `CustomizeBar`, `⌘⇧L` gate |
| 5-zone overlay | `PaneDropOverlay` ("Add as tab" dashed boxes) |
| Flag branch | `cockpitV3Enabled()`, `NEXT_PUBLIC_COCKPIT_V3`, kill-switch |
| Header layout UX | Layout dropdown, `PresetPicker`, save/manage preset dialogs on header |

**Still in tree (legacy glue — deferred deletion):** `templates.tsx` column
factories, `InvestigationsAutoMerge.tsx`, `@container/middle-bottom` wrapper —
no longer on the v3 mount path; safe to delete once reference audit is green
(see capture inbox `[cv3t-03 → cv3x-03 handoff]`).

---

## Telemetry events

| Event | When |
|---|---|
| `cockpit_v3.shell_rendered` | First v3 shell mount per session |
| `cockpit_v3.drag_drop` | Successful v3 drop (split or tab) |
| `cockpit_v2.*` / `cockpit_pane_freedom.*` / `cockpit_polish.*` | Legacy one-shot landings from pane bodies and page mount — still fire at unchanged mount sites |

Implementation: `frontend/lib/patient-profile/telemetry.ts`.

---

## Key files

| File | Role |
|---|---|
| `PatientProfilePage.tsx` | DL-2 bridge; builds `v3Tabs`, mounts `CockpitV3Shell` unconditionally |
| `v3/CockpitV3Shell.tsx` | Shell entry — palette, canvas, docks, mobile branch |
| `v3/CockpitGroupView.tsx` | Recursive editor-group renderer |
| `v3/CockpitCanvas.tsx` | Layout tree → groups |
| `v3/CockpitPalette.tsx` | Add/remove panes toolbar |
| `v3/CockpitDropOverlay.tsx` | Cursor-style drop preview (v3) |
| `v3/CockpitDndContext.tsx` | Always-on DnD wiring |
| `lib/patient-profile/v3/cockpit-tabs.tsx` | Flat eight-tab registry |
| `lib/patient-profile/v3/useCockpitV3Layout.ts` | Layout state + mutations |
| `lib/patient-profile/layout-tree-mutations.ts` | Pure tree ops (kept) |
| `lib/patient-profile/layout-tree.ts` | `PaneTreeNode` schema (kept) |
| `components/patient-profile/panes/*` | Pane bodies (kept by reference) |
| `PatientRibbon.tsx` | Context strip above shell |
| `lib/patient-profile/telemetry.ts` | PHI-free event logger |

---

## Program references

| Artifact | Location |
|---|---|
| Product plan (Shipped) | [`docs/Work/Product plans/plan-cockpit-v3.md`](../../../Work/Product%20plans/plan-cockpit-v3.md) |
| Daily batches | [`docs/Work/Daily-plans/May 2026/30-05-2026/cockpit-v3/`](../../../Work/Daily-plans/May%202026/30-05-2026/cockpit-v3/) |
| Parity matrix (flat tabs) | [`PARITY-MATRIX-cv3t-03.md`](../../../Work/Daily-plans/May%202026/30-05-2026/cockpit-v3/p5-tab-model/PARITY-MATRIX-cv3t-03.md) |
| Cutover tasks | [`p4-cutover/Tasks/`](../../../Work/Daily-plans/May%202026/30-05-2026/cockpit-v3/p4-cutover/Tasks/) |

**Predecessor programs:** cockpit-v2 (nested tree + modality templates), cockpit
pane-freedom (tabs + DnD + customize + chrome docks — interaction layer
superseded by v3).
