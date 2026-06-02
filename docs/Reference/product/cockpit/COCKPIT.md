# Cockpit architecture reference

> **Single source of truth for cockpit state.** As of 2026-05-24, the
> `plan-cockpit-v2.md` + `plan-cockpit-v2-execution-roadmap.md` are
> archived to `docs/Work/Product plans/archive/`. This file is
> built up batch-by-batch and reflects current behaviour. Future
> cockpit work should update this file directly in each batch's
> close-out task; further product plans get authored when the next
> major refactor is scoped.

> Agent-facing map of the patient-profile cockpit shell, Rx form wiring, and production mount points. Updated by cv2-08 (Phase 1) and csf-06 (Phase 2 foothold).

---

## Composition root and shared form state

All prescription SOAP fields on the appointment-detail page share **one** `<RxFormProvider>` lifted at the top of `PatientProfilePage`:

```
PatientProfilePage
└── RxFormProvider                    ← single autosave timer (DL-30)
    └── PrescriptionFormShellProvider
        └── PatientProfileShell       ← nested PaneDefinition tree
            ├── SubjectivePane        → SubjectiveSection
            ├── ObjectivePane         → ObjectiveSection
            ├── RxPane / Plan zone    → PrescriptionForm (composition root)
            └── …
```

**Mount surfaces (DL-30):**

| Surface | Path | Notes |
|---|---|---|
| Appointment detail (desktop + mobile) | `frontend/app/dashboard/appointments/[id]/page.tsx` → `PatientProfilePage` | Canonical route; 8-pane default post-csf-04. |
| Rx column (desktop) | `RxPane` → `RxWorkspace` → `PrescriptionForm` | Same provider as Subjective/Objective leaves. |
| Rx pill (mobile `<lg`) | `MobilePillBar` → `RxWorkspace` | Unchanged branch; not part of the 8-pane tree. |

In-call mini-panel and post-call summary still use `PrescriptionForm` through their own trees; they are **not** wrapped by `PatientProfilePage`'s provider. Regression-test those separately per `task-cv2-08-mount-surface-verification.md`.

**ESLint:** Direct `<ResizablePanelGroup>` usage outside `frontend/components/patient-profile/Shell.tsx` is forbidden. Use a `PaneDefinition` tree instead.

---

## Production tree-mount (post-cce-04)

**Route:** `/dashboard/appointments/[id]`  
**Factory:** `getTelemedVideoTemplate()` in `frontend/lib/patient-profile/templates.tsx`  
**Persistence key:** `patient-profile/v4-tree-layout::telemed-video` (`TELEMED_VIDEO_LAYOUT_STORAGE_KEY`)

### Default — 8-pane telemed layout

```
RxFormProvider
└── PatientProfileShell
    ├── SideSheetHost (shell-scoped; visit-detail + previous-Rx side sheets)
    │   └── 3 top-level columns
    │       ├── left-column (vertical)
    │       │   ├── snapshot          → SnapshotPane (Allergies / Chronic / Problems / Vitals / Current meds)
    │       │   └── history           → HistoryPane (past visit cards, most-recent-first)
    │       ├── middle-column (vertical)
    │       │   ├── body              → BodyZone → ConsultationBodyPane (video / voice / text launcher)
    │       │   ├── assessment        → AssessmentStrip (Working Dx + DDx chips; id="diagnosis")
    │       │   └── middle-bottom (horizontal; SafetyStickyStrip + PlanActionFooter overlays)
    │       │       ├── investigations-orders → InvestigationsPane [R-MIDDLE]
    │       │       └── plan                  → RxPane (medicines; send CTA in PlanActionFooter)
    │       └── right-column (vertical)
    │           ├── subjective        → SubjectivePane (CC + HOPI)
    │           └── objective         → ObjectivePane (vitals, exam findings)
```

Click any History card → `<VisitDetailSideSheet>` opens via `useSideSheet()` at 480px from the right edge (read-only DL-24 fields). Single-sheet semantic: opening a second card replaces the first sheet (no stack). `Esc`, backdrop click, and close button all dismiss.

**Template dispatch (post-templates-r-mod, 2026-05-21):** `PatientProfilePage` calls `mapStateToTemplate(state, modality, override)` and dispatches to one of four factories (`getTelemedVideoTemplate`, `getTelemedVoiceTemplate`, `getTelemedTextTemplate`, `getReviewTemplate`). Doctor override: `doctor_settings.cockpit_template_override` (migration 106).

### Telemed-Video template (default)

Auto-selected when `consultation_type === 'video'` (or `in_clinic` until an in-clinic template ships) and state is `ready` / `lobby` / `live` / `wrap_up`. Body leaf ~40%; Plan ~50%.

```
┌──────────────┬─────────────────────────────────────────┬──────────────┐
│  Snapshot    │ Body (Video — launcher + media)   ~40% │  Subjective  │
│              ├─────────────────────────────────────────┤              │
│  History     │ Investigations  │  Plan (Rx)       ~50% │  Objective   │
│              │                 │                       │              │
└──────────────┴─────────────────────────────────────────┴──────────────┘
```

### Telemed-Voice template (post-templates-r-mod, 2026-05-21)

Auto-selected when `appointment.consultation_type === 'voice'` and state is `ready` / `lobby` / `live` / `wrap_up`. Body leaf shrinks to ~15% (mute / end / timer call-control strip); Plan expands to ~75%.

```
┌──────────────┬─────────────────────────────────────────┬──────────────┐
│  Snapshot    │ Body (Voice — call controls only)  ~15% │  Subjective  │
│              ├─────────────────────────────────────────┤              │
│  History     │ Investigations  │  Plan (Rx)       ~75% │  Objective   │
│              │                 │                       │              │
└──────────────┴─────────────────────────────────────────┴──────────────┘
```

### Telemed-Text template (post-templates-r-mod, 2026-05-21)

Auto-selected when `consultation_type === 'text'`. Body becomes a scrollable chat thread at ~40%; Plan ~50%.

```
┌──────────────┬─────────────────────────────────────────┬──────────────┐
│  Snapshot    │ Body (Text — chat thread)          ~40% │  Subjective  │
│              ├─────────────────────────────────────────┤              │
│  History     │ Investigations  │  Plan (Rx)       ~50% │  Objective   │
│              │                 │                       │              │
└──────────────┴─────────────────────────────────────────┴──────────────┘
```

### Review template (post-templates-r-mod, 2026-05-21)

Auto-selected when state is `ended` or `terminal` regardless of modality. Body leaf omitted entirely; Plan + S/O become the main content. Send button hidden via existing `canSendPrescription(state)` gate.

```
┌──────────────┬─────────────────────────────────────────┬──────────────┐
│  Snapshot    │         (no Body leaf)                  │  Subjective  │
│              ├─────────────────────────────────────────┤              │
│  History     │ Investigations  │  Plan (Rx)      ~85% │  Objective   │
│              │                 │                       │              │
└──────────────┴─────────────────────────────────────────┴──────────────┘
```

**Source:** [`Daily-plans/May 2026/21-05-2026/templates-r-mod/`](../Work/Daily-plans/May%202026/21-05-2026/templates-r-mod/).

### Walk-in fallback (no `patient_id`)

When `shouldShowChartRail` is false, `panesToMount` extracts `body` + `plan` from the dispatched template:

- **Default:** 2-pane horizontal — `body` + `plan`.
- Storage key: `WALKIN_LAYOUT_STORAGE_KEY`.
- Snapshot + History leaves do not mount.

### Middle column · Investigations (post-cockpit-middle-investigations, 2026-05-21)

Live in all four modality templates via `<InvestigationsPane>` in `makeMiddleBottomRow`. Chip-row + autocomplete; autosaves via `RxFormContext.fields.investigationsOrders` (semicolon-separated). Read-only in `ended` / `terminal` states (`canEditPrescriptionDraft`). Telemetry: `cockpit_v2.r_middle_inv_landed` (one-shot per session on first pane mount).

```
[ ECG × ] [ Trop-I × ] [ + add test… ]  ← chips; autocomplete from prior orders
```

### Cockpit-middle-rebuild — sticky strips + Body wrapper (2026-05-21)

The middle column now has THREE children (or two for Review): Body / Assessment / Bottom-row. Three sticky overlays + one wrapper supply context-preserving chrome.

#### 1. Assessment strip (between Body and bottom-row)

```
┌────────────────────────────────────────────────────────────────────┐
│ Working Dx: [Asthma____________]  ·  DDx: [Allergy] [GERD] [+more] │
└────────────────────────────────────────────────────────────────────┘
```

~60px tall. Hosts the canonical `id="diagnosis"` input — the ribbon's
`🎯` click targets THIS strip's input. AssessmentSection (inside Plan)
hides its Dx + DDx when this strip is present.

#### 2. Safety sticky strip (top of bottom-row)

> **Relocated to a shell-level dock in §14 (Phase 4, 2026-05-30); the component is unchanged, only its mount site moved.**

```
┌────────────────────────────────────────────────────────────────────┐
│ ⚠️ Penicillin allergy clash: Amoxil  |  DDI: Aspirin × Warfarin    │
└────────────────────────────────────────────────────────────────────┘
```

`position: sticky; top: 0`. Empty when no clashes / no DDIs — no reserved
height. Resolves TODO β-1 from `RxWorkspace.tsx`.

#### 3. Plan action footer (bottom of bottom-row)

> **Relocated to a shell-level dock in §14 (Phase 4, 2026-05-30); the component is unchanged, only its mount site moved.**

```
┌────────────────────────────────────────────────────────────────────┐
│ ✓ Saved · 12:04                          [Send Rx & finish ▸]      │
└────────────────────────────────────────────────────────────────────┘
```

`position: sticky; bottom: 0`. Spans Investigations + Plan sub-columns.
Send button visibility gated by `canSendPrescription(state)`. Hidden
entirely in terminal state. No `[Save]` button (autosave is the only
save mechanism — cv2 DL-4).

**Visibility by `CockpitState` (ppd-05 audit, 2026-05-26):**

| State | SaveStatus pill | Send Rx & finish | Notes |
|---|---|---|---|
| `ready` / `lobby` | ✓ | hidden | Consult not in flight (`canSendPrescription` false). |
| `live` / `wrap_up` | ✓ | ✓ when `RxFormActionsBridge` wired | Primary CTA only — no separate inline Send Rx / Finish visit (cmr-03). |
| `ended` | ✓ | ✓ when bridge wired | Form body is read-only overlay; footer still mounts. |
| `terminal` | — | — | Footer returns `null`; `RxWorkspace` shows unavailable message. |

Inline commit row (`Send Rx`, `Send Rx & finish`, `Finish visit`) is
suppressed in cockpit via `actionsInFooter` on `<RxPane>` (see lift table
below).

#### 4. BodyZone wrapper (per-variant min-height)

Wraps `<ConsultationBodyPane>` with variant-specific min-height /
overflow rules:
- Video: min-height 280px, no overflow.
- Voice: min-height 60px (call-control strip remains usable).
- Text: min-height 200px, overflow-y: auto (chat scrolls inside).

#### 5. Narrow-monitor auto-merge (container-query)

When the bottom-row container width drops below 720px, the Investigations
leaf hides and an `<InvestigationsAutoMerge>` chip-row appears at the top
of Plan. CSS container queries (with `@container-query-polyfill` for
older browsers).

**Source:** [`Daily-plans/May 2026/21-05-2026/cockpit-middle-rebuild/`](../Work/Daily-plans/May%202026/21-05-2026/cockpit-middle-rebuild/).

### Plan-pane dedup (ppd, 2026-05-26)

The cockpit shell already owned Subjective, Objective, safety banners, and
send actions in dedicated leaves/overlays, but `<PrescriptionForm>` still
rendered duplicate blocks. The fix is **surgical lift props** (same pattern
as cmr-01/02/03): `templates.tsx` `makeMiddleBottomRow` passes four booleans
on `<RxPane>`; each receiver forwards unchanged until the leaf consumer
conditionally omits the lifted subtree. Non-cockpit mounts keep all props
`false` (default). Plan column is **Medicines-only** in production; right
column owns SOAP documentation.

**Source:** [`Daily-plans/May 2026/26-05-2026/cockpit-plan-pane-deduplication/`](../Work/Daily-plans/May%202026/26-05-2026/cockpit-plan-pane-deduplication/).

### Cockpit nav clarity (cnc, 2026-05-26)

- Right-column group title is **"Chart Notes"** (not "Notes") to disambiguate from message-log notes.
- `<RxSectionNav>` chip strip is hidden when `<RxWorkspace cockpitMode>` — the cockpit shell's per-pane tab nav already provides section navigation. Non-cockpit mounts keep the chip strip.
- `<InvestigationsPane>` renders an empty-state with `[+ Add test]` CTA when no orders exist.
- `<PatientRibbon>` safety + treating indicators have aria-labels + Radix tooltips; empty treating diagnosis shows **"not assigned"** (replaces em-dash).

**Source:** [`Daily-plans/May 2026/26-05-2026/cockpit-nav-clarity/`](../Work/Daily-plans/May%202026/26-05-2026/cockpit-nav-clarity/).

### Chart-rail density (ccd, 2026-05-26)

- New `<ChartRailEmptyState>` + `<UnifiedChartRailEmptyState>` components in `frontend/components/patient-profile/panes/`.
- When ALL FIVE chart-rail signals are empty (allergies + chronic + problem-list + snapshot + history), the left column renders a single unified "Add patient context" card. Otherwise per-pane empty-state.
- `<SnapshotPane>` reads draft vitals from `useOptionalRxForm()` and shows a "Live draft" badge on draft-sourced values.
- Every chart-rail pane has a chevron in its header; click toggles between expanded body and a one-line summary. Collapsed state resets on page reload (not persisted).

**Source:** [`Daily-plans/May 2026/26-05-2026/cockpit-chart-density/`](../Work/Daily-plans/May%202026/26-05-2026/cockpit-chart-density/).

### Visual system (cpv, 2026-05-26)

- **AssessmentStrip** zero-state: collapses to ~24px hint when state=waiting and no Dx.
- **SaveStatusPill**: 4 states (idle / saving / saved / error) — never "—".
- **VitalsGrid**: BMI badge appears inline next to weight chip; WHO classification tooltip.
- **ObjectiveSection**: General / Systemic examination textareas have labels + icons + divider.
- **PaneHeader**: every column header renders through this single component; unified style.
- **Color tokens**: hex literals replaced with semantic Tailwind tokens. PatientRibbon separators are `·`.
- **Header search**: collapses to icon below 1280px (xl breakpoint).
- **Pane icons**: single source of truth in `frontend/lib/patient-profile/pane-icons.ts`.
- **Problem list**: long entries wrap (`break-words min-w-0`), no horizontal scroll.

**Source:** [`Daily-plans/May 2026/26-05-2026/cockpit-polish-visual/`](../Work/Daily-plans/May%202026/26-05-2026/cockpit-polish-visual/).

#### Lift pattern (prop chain)

| Lift prop | Source | Consumed by | When |
|---|---|---|---|
| `dxLifted` | `templates.tsx` `makeMiddleBottomRow` | `<AssessmentSection>` | cmr-01 (2026-05-21) |
| `safetyLifted` | same | `<PlanSection>` (inline banners) | cmr-02 (2026-05-21) |
| `actionsInFooter` | same | `<PrescriptionForm>` commit row + header SaveStatus | cmr-03 (2026-05-21) |
| `subjectiveLifted` | same | `<PrescriptionFormCompositionRoot>` | ppd-02 (2026-05-26) |
| `objectiveLifted` | same | same | ppd-02 (2026-05-26) |
| `entryModeLifted` | same | `<PrescriptionFormBody>` | ppd-03 (2026-05-26) |
| `photoLifted` | same | same | ppd-03 (2026-05-26) |

#### 6. Medicine row densification (R-RX-POLISH/2.1, 2026-05-24)

Medicine rows now render in two states:

```
Editor (incomplete OR active):           Summary (complete + inactive):
┌────────────────────────────────┐       ┌────────────────────────────────┐
│ Drug name [autocomplete______] │       │ ⋮ PCM 500mg · TID · 5d  ✎ 🗑   │
│ Dosage    [_________________]  │       └────────────────────────────────┘
│ Route     [_________________]  │       ~44-48px tall
│ Frequency [_________________]  │
│ Duration  [_________________]  │
│ Instructions                   │
│ [____________________________] │
└────────────────────────────────┘
~260px tall
```

One row in editor at a time per `<PlanSection>`. New rows start as editor.
Incomplete rows can't collapse (data-loss guard).

**Source:** [`Daily-plans/May 2026/24-05-2026/rx-polish-densification/`](../Work/Daily-plans/May%202026/24-05-2026/rx-polish-densification/).

#### 7. Keyboard shortcuts (R-RX-POLISH/3.x, 2026-05-24)

Plan-pane shortcuts are **pane-scoped** — they fire only when focus is inside the `plan` leaf (`data-cockpit-pane-id="plan"`). `mod` means **⌘ on macOS** and **Ctrl on Windows/Linux**.

| Shortcut | Action | Scope |
|---|---|---|
| `Ctrl/Cmd+Enter` | Send Rx & finish | Plan pane; blocked inside text inputs (use `Ctrl/Cmd+Shift+Enter` there) |
| `Ctrl/Cmd+M` | Add medicine | Plan pane focused |
| `Ctrl/Cmd+Shift+T` | Open templates | Plan pane focused |
| `Ctrl/Cmd+Shift+P` | Open preview | Plan pane focused |

**Global palette:** `Ctrl/Cmd+K` opens the command palette (`<CommandBar>`) — fuzzy-search registered commands and press Enter to run.

**Help:** `?` opens the keyboard-shortcuts dialog (skipped when a text field has focus). Same dialog is reachable via Cmd+K → "Keyboard shortcuts".

Tooltips on **Send Rx & finish** and **+ Add medicine** show the matching hint badges.

Telemetry: `cockpit_v2.r_rx_polish_shortcut_used` (per press, `{ combo, action }`).

**Source:** [`Daily-plans/May 2026/24-05-2026/rx-polish-shortcuts/`](../Work/Daily-plans/May%202026/24-05-2026/rx-polish-shortcuts/).

#### 8. Previous-Rx side sheet (R-RX-POLISH/4.x, 2026-05-24)

Cockpit Plan zone exposes **Previous Rx (N)** via `<PreviousRxPlanTrigger>` in `<PlanSection>`. Click opens the cv2-09 side sheet registered by `<PreviousRxSideSheetAnchor>` in `<RxWorkspace>`.

| Property | Value |
|---|---|
| Anchor id | `previous-rx` |
| Width | 480px right-edge (`SideSheetHost` default; anchor `widthPct: 35` on ~1366px) |
| Dismiss | `Esc`, backdrop, close button (host semantics) |
| Filter chips | `All` · `Last 30 days` · `Same diagnosis` (disabled when current Dx empty) · `Active condition` (disabled when no active conditions) |
| Search | Substring match on medicine names (case-insensitive) |
| Virtual scroll | `react-window` when filtered list &gt; 20 rows |
| Apply | Row **Apply** → preview overlay with **Append** / **Replace** mode chips + diff list → **Confirm Apply** writes medicines via `RxFormContext` and sets `fromPrescriptionId` |

**DL-1:** Appointment-detail / in-call / post-call mounts still use `<PreviousRxPopover>` in `RxPane` header actions — not the side sheet.

Telemetry (per session use, not one-shot): `cockpit_v2.r_rx_polish_side_sheet_opened` (`priorRxCount`), `r_rx_polish_side_sheet_filter_changed` (`chip`, `hasSearch`), `r_rx_polish_side_sheet_applied` (`priorRxId`, `mode`, `medicineCount`).

**Source:** [`Daily-plans/May 2026/24-05-2026/rx-polish-side-sheet/`](../Work/Daily-plans/May%202026/24-05-2026/rx-polish-side-sheet/).

#### 9. Per-doctor drug favorites + autocomplete ranking (R-RX-POLISH/2.2 + /2.3, 2026-05-24)

Two complementary surfaces in the Plan zone:

**Favorite chips** — horizontal strip above the medicine list (below Investigations when present):

```
⭐ [PCM fever] [Pantop GERD] [Azithro]  [+ Save current row]  [Manage]
────────────────────────────────────────────────────────────────────────
│ Medications                                    [Previous Rx] [+ Add] │
│ ⋮ PCM 500mg · TID · 5d                                    ✎ 🗑      │
```

| Action | Behavior |
|---|---|
| Tap chip | Appends a new medicine row pre-filled from the favorite template; row becomes the active editor |
| `+ Save current row` | Shown when the active editor row is complete; prompts for a name; `POST` creates a favorite (max 30 per doctor) |
| `Manage` | Opens side sheet anchor `rx-favorites` — list, inline rename, delete-with-confirm |
| Cold start (0 favorites) | Inline hint: "⭐ Save medicines you prescribe often as one-tap chips." |

**Autocomplete personal ranking** — `DrugAutocomplete` fetches `GET /api/v1/doctors/me/drug-usage` once per session (`useDoctorDrugUsage`). Results sort by `usage_count DESC`, then existing prefix/alphabetical tiebreakers. Cold-start doctors (empty usage map) see identical ordering to pre-batch. Usage increments on **Send Rx & finish** only (not draft save); free-text drugs (`drug_master_id` null) are excluded.

| Backend table | Migration | Purpose |
|---|---|---|
| `doctor_drug_usage` | 108 | `(doctor_id, drug_master_id)` → `usage_count`, `last_used_at` |
| `doctor_drug_favorites` | 109 | Per-doctor named templates (`template` JSONB = `MedicineRowValue`) |

RLS on both tables: `current_doctor_id()` — no cross-doctor reads/writes.

Telemetry: `cockpit_v2.r_rx_polish_favorites_landed` (one-shot, `{ favoritesCount }`); `r_rx_polish_favorite_applied` (per chip-tap, `{ favoriteId, fromCount }`); `r_rx_polish_ranking_landed` (one-shot when top autocomplete result has personal score &gt; 0, `{ topResultPersonalScore }`).

**Source:** [`Daily-plans/May 2026/24-05-2026/rx-polish-favorites/`](../Work/Daily-plans/May%202026/24-05-2026/rx-polish-favorites/).

#### 10. Layout customization (R-LAYOUT-UX, 2026-05-24)

Power-user escape hatch: right-click any **pane header** (not the body — DL-10 preserves browser spellcheck/paste menus inside textareas) to split, merge, collapse, or hide panes; save the resulting tree as a custom preset; switch among four built-in modality templates.

**Tree-shape JSONB** (persisted in `doctor_settings.cockpit_layout_presets[].layout_tree`, migration 112):

```json
{
  "kind": "split",
  "direction": "horizontal",
  "sizes": [25, 50, 25],
  "children": [
    { "kind": "pane", "paneId": "snapshot" },
    {
      "kind": "split",
      "direction": "vertical",
      "sizes": [40, 60],
      "children": [
        { "kind": "pane", "paneId": "body" },
        {
          "kind": "split",
          "direction": "horizontal",
          "sizes": [50, 50],
          "children": [
            { "kind": "pane", "paneId": "investigations-orders" },
            { "kind": "pane", "paneId": "plan" }
          ]
        }
      ]
    },
    {
      "kind": "split",
      "direction": "vertical",
      "sizes": [50, 50],
      "children": [
        { "kind": "pane", "paneId": "subjective" },
        { "kind": "pane", "paneId": "objective" }
      ]
    }
  ]
}
```

Legacy 099 flat presets (`{ slots, widths, collapsed }`) auto-migrate to this shape on read via `legacyFlatToTree`.

**Context-menu actions** (header only):

```
Right-click pane header
├── Split horizontally    → sibling leaf inserted (50/50)
├── Split vertically      → sibling leaf inserted (50/50)
├── Merge with sibling    → chosen leaf removed; sibling absorbs size
├── ─────────────────
├── Collapse / Expand     → header-only strip (~32px); content hidden
└── Hide pane             → leaf removed from tree; sizes rebalance
```

**Preset picker taxonomy** (`Layout` dropdown → `<PresetPicker>` when tree UX is active):

| Section | Source | Deletable? | Notes |
|---|---|---|---|
| Built-in | `layout-presets-builtin.ts` — Telemed (Video/Voice/Text), Read-only Review | No (DL-12) | Not stored in DB; `sourceTemplateId` drives reset |
| My presets | `GET /api/v1/settings/doctor/cockpit-presets` (`layout_tree` rows) | Yes | Max 5 per doctor (migration 099 CHECK); oldest evicted on 6th save |
| Hidden panes | Diff: template pane ids − current tree leaf ids | — | Each row calls `restoreLeaf` |

**Hidden-panes restoration flow:**

1. Doctor hides a built-in pane via context menu → `hideLeaf` removes the leaf; parent split rebalances.
2. Preset picker computes `templatePaneIds − collectLayoutPaneIds(currentTree)`.
3. Doctor picks **Restore: Subjective** (etc.) → `restoreLeaf` appends the leaf to the rightmost split (or wraps a single-leaf root).
4. Structural change persists to localStorage (`patient-profile/v4-tree-layout::…`) and is included on next **Save current layout**.

**Soft 10-leaf cap (DL-6):** Defaults ship 8 sub-panes; doctors may split up to **10** visible leaves. The 11th split or restore attempt shows a toast — *"Layout limit reached (10 sub-panes max). Merge or hide a pane to add more."* — not a hard error. Rationale: prevents runaway nested splits from degrading resize math and minimum-size floors on typical 1366px viewports; power users who need more should merge or hide first.

**Key files:** `PaneContextMenu.tsx` · `layout-tree-mutations.ts` · `layout-node-bridge.ts` · `layout-presets-builtin.ts` · `cockpit-layout-presets-tree.ts` (API client).

Telemetry: `cockpit_v2.r_layout_ux_context_menu_opened` (per open, `{ paneId }`); `r_layout_ux_tree_mutation` (per split/merge/collapse/hide/restore, `{ op, paneId }`); `r_layout_ux_preset_saved` (per save, `{ paneCount }`); `r_layout_ux_preset_applied` (per apply, `{ presetId, isBuiltIn, paneCount }`).

**Source:** [`Daily-plans/May 2026/24-05-2026/cockpit-layout-presets-modality/`](../Work/Daily-plans/May%202026/24-05-2026/cockpit-layout-presets-modality/).

#### 11. Tabs grammar (Phase 1 of pane freedom — 2026-05-28)

Every leaf in `PaneTreeNode` is a **tabs container** — `paneIds: string[]` + `activeTabId: string`. Single-pane leaves render today's per-pane chrome (no tab strip). Multi-pane leaves render a `<PaneTabStrip>` above the body; only the active tab's pane mounts.

Mutation ops (in `layout-tree-mutations.ts`):

- `addToTabsNode(tree, paneId, targetGroupId, position?)` — move into target container at position.
- `extractFromTabsNode(tree, paneId, direction)` — extract to new sibling split.
- `moveLeafBetweenTabs(tree, paneId, toGroupId)` — convenience wrapper.
- `setActiveTab(tree, groupId, paneId)` — pure active-tab metadata update (no `layoutVersion` bump).

Invariants enforced at the mutation layer:

1. **Single-home** — each `paneId` lives in exactly one `paneIds` array.
2. **Non-empty leaves** — every leaf has `paneIds.length >= 1`.
3. **Active-tab in paneIds** — `paneIds.includes(activeTabId)` always.
4. **MAX_LEAVES = 10** — total leaf count cap (already existed; tabs don't change it).
5. **MAX_PANES_PER_TABS = 6** — per-container cap; soft overflow at 4 (cosmetic).

User-visible workflow (Phase 1): right-click a pane → "Move pane to…" → submenu lists other containers + new-split options.

Phase 2 (drag-and-drop layout editing) shipped 2026-05-30 — see §12 below. Phase 3 (Customize mode + preset management) shipped 2026-05-30 — see §13 below. Phase 4 (chrome lift) shipped 2026-05-30 — see §14 below.

**Versioning:** `PatientProfileLayout.version` is now `5`. v4 leaves auto-upgrade on hydration:
`{ id: "snapshot" }` → `{ id: "snapshot", paneIds: ["snapshot"], activeTabId: "snapshot" }`.
Migration is idempotent; v3 chain-migrates via v4 → v5.

Telemetry: `cockpit_pane_freedom.move_via_context_menu` (per successful move, `{ sourcePaneId, targetType }`); does not fire on failures or tab switches.

**Source:** [`Daily-plans/May 2026/30-05-2026/cockpit-pane-freedom/p1-tabs/`](../Work/Daily-plans/May%202026/30-05-2026/cockpit-pane-freedom/p1-tabs/).

#### 12. Drag-and-drop layout editing (Phase 2 of pane freedom — 2026-05-30)

Doctors reshape the cockpit by dragging a pane onto a 5-zone overlay. Drag sources: the pane header grip (`ShellPaneHeader`) and individual tabs (`<PaneTabStrip>`). Drop targets: five zones per container, drawn by `<PaneDropOverlay>` while a drag is active.

Zones → ops (all via `dropPaneIntoZone` in `layout-tree-mutations.ts`):

- **center** → tab into the container (`addToTabsNode`).
- **north / south / east / west** → new sibling leaf above / below / right / left of the target (wraps the target in a nested split when the parent's orientation doesn't match the zone axis).

Wiring: one `<DndContext>` (`pointerWithin` collision detection) in `DesktopShell`; `handleDragEnd` reads `{ groupId, zone }` from the over-droppable and calls `PatientProfilePage.handleDropPaneOnZone` via the `paneMoveUx.onDropPaneOnZone` surface. `<DragOverlay>` shows a drag preview.

Guards: live-consult (`body` can't drag during `state === "live"`, DL-8); single-home (DL-10); `MAX_LEAVES = 10` for edge drops, `MAX_PANES_PER_TABS = 6` for center; self-drops return `no-op` (silent). Mobile renders no DnD (DL-7). Dropped panes keep their component instance (DL-9, `pane-<id>` key).

No persisted-shape change — Phase 2 is an input method on top of the Phase 1 v5 schema. Telemetry: `cockpit_pane_freedom.drag_drop` `{ sourcePaneId, targetGroupId, zone }` per successful drop.

The context-menu "Move pane to…" workflow (Phase 1) remains the keyboard / no-pointer path. Phase 3 (Customize mode toggle + preset CRUD) shipped 2026-05-30 — see §13 below. Phase 4 (chrome lift) shipped 2026-05-30 — see §14 below.

**Source:** [`Daily-plans/May 2026/30-05-2026/cockpit-pane-freedom/p2-dnd/`](../Work/Daily-plans/May%202026/30-05-2026/cockpit-pane-freedom/p2-dnd/).

#### 13. Customize mode + preset management (Phase 3 of pane freedom — 2026-05-30)

The drag affordances from Phase 2 are gated behind an explicit **Customize layout** mode — off by default, so the cockpit is clean during normal consults. Toggle via the header "Customize" button or `Cmd+Shift+L` (`useShellHotkeys`). Mode is ephemeral page state in `PatientProfilePage` (`customizeMode`) and resets to off on reload / appointment change — it is never persisted (P3-DL-2).

When on:
- The `ShellPaneHeader` grip and `<PaneTabStrip>` tabs become `useDraggable` (`disabled: !customizeMode || <live-body guard>`); `<PaneDropOverlay>` mounts. Off → none of these render/arm (identical to Phase 1 at rest).
- A `<CustomizeBar>` docks under the header with: Save-as-preset (inline name input, reuses `savePresetTree`, 5-preset cap), always-reachable Reset-to-default (active template's built-in tree, P3-DL-5 / DL-2.5), and a dismissible cramped-layout nudge when the root row exceeds 5 horizontal siblings (P3-DL-6 / DL-3.1).
- `<PresetPicker>` "My presets" rows expose rename + delete. Rename is a read-modify-write through the existing full-array `PUT` (no PATCH, no migration — P3-DL-4); delete uses the shipped `DELETE /:id`.

Telemetry: `cockpit_pane_freedom.customize_toggled` `{ enabled, source }` per toggle; `cockpit_pane_freedom.preset_crud` `{ op, presetCount }` on rename/delete; `cockpit_pane_freedom.layout_shape` `{ leafCount, tabContainers, maxRootSiblings }` once on customize-off.

No persisted-shape change, no migration, no backend change — Phase 3 is UI state + surfacing CC-09 preset endpoints. Mobile renders no customize affordances (DL-7). Phase 4 (chrome lift) shipped 2026-05-30 — see §14 below.

**Source:** [`Daily-plans/May 2026/30-05-2026/cockpit-pane-freedom/p3-customize/`](../Work/Daily-plans/May%202026/30-05-2026/cockpit-pane-freedom/p3-customize/).

#### 14. Chrome docks (Phase 4 of pane freedom — 2026-05-30)

> **Program close-out:** The cockpit pane-freedom vision (Phases 1–4) is **complete**. Tabs + context-menu move (P1), drag-drop 5-zone overlay (P2), customize mode + preset CRUD (P3), and chrome docks (P4) all shipped. Future work is polish and experiments, not new phases.

Phase 3 unlocked layout reshaping; Phase 4 ensures consult-critical chrome survives it. Action-bearing wrappers that were trapped in position-bound `groupWrapper`s are lifted to **shell-level docks** (desktop-only); the chart-rail empty-state card is **leaf-anchored** to `snapshot`.

**Action chrome (consult-scoped, not position-scoped):**

| Piece | Mount site (post-P4) | Notes |
|---|---|---|
| `SafetyStickyStrip` | `PatientProfileShell` top dock (`safetyDock`) | Passed from `PatientProfilePage`; `DesktopShell` only (P4-DL-1, P4-DL-5). |
| `PlanActionFooter` | `PatientProfileShell` bottom dock (`actionDock`) | Same; outside `<DndContext>`, `shrink-0` sibling of the `flex-1` tree. |
| `RxFormActionsBridgeProvider` | Page-root provider stack | Lifted from `middle-bottom`'s `groupWrapper` beside `RxFormProvider` / `RxSafetyProvider` (P4-DL-2). Footer reads `useRxFormActions()` regardless of where `plan` / `RxPane` lives. |

**Visual chrome (leaf-anchored, travels with its pane):**

| Piece | Mount site (post-P4) | Notes |
|---|---|---|
| `ChartRailWithEmptyState` | `snapshot` leaf `render` | Removed from `left-column`'s `groupWrapper`; empty card follows `snapshot` on re-parent (P4-DL-3). `useChartRailEmptySignals` still spans the whole chart. |

**`groupWrapper` after P4 (P4-DL-4):** only `middle-bottom`'s pure-layout responsive `<div>` (`@container/middle-bottom`) survives — required by `InvestigationsAutoMerge`'s `@[720px]` narrow-monitor merge. No context provider or action/visual component may live in a `groupWrapper`; enforced by `cpfg-03` template-invariant + re-parent regression tests.

**At rest (P4-DL-6):** default layout is pixel- and behaviour-identical to Phase 3 — safety strip above plan/investigations, footer below, unified empty-state above the chart rail. The lift is invisible until a doctor reshapes.

**Mobile (DL-7):** `<MobileShell>` renders no docks; finish-visit stays the header CTA.

**Telemetry:** no new events. Existing landed events fire once at the new mount sites: `cockpit_v2.r_middle_safety_landed`, `cockpit_v2.r_middle_footer_landed`, `cockpit_polish.chart_density_landed`.

**Source:** [`Daily-plans/May 2026/30-05-2026/cockpit-pane-freedom/p4-chrome/`](../Work/Daily-plans/May%202026/30-05-2026/cockpit-pane-freedom/p4-chrome/). Prior phases: [Phase 1](../Work/Daily-plans/May%202026/30-05-2026/cockpit-pane-freedom/p1-tabs/) · [Phase 2](../Work/Daily-plans/May%202026/30-05-2026/cockpit-pane-freedom/p2-dnd/) · [Phase 3](../Work/Daily-plans/May%202026/30-05-2026/cockpit-pane-freedom/p3-customize/).

### Right column — R-HISTORY (2026-05-21)

The right column splits Subjective (top) / Objective (bottom). Post-cockpit-history-pane batch, both panes carry the full DL-24 field set.

#### Subjective pane

```
┌──────────────────────────────┐
│ Chief complaint (CC)         │
│ [                          ] │
│                              │
│ History of present illness   │
│ [                          ] │
│ [                          ] │
│ [                          ] │
└──────────────────────────────┘
```

Tab-contract slot RESERVED (`tabs: undefined` in templates.tsx) for future Photo / AI-summary tabs.

#### Objective pane

```
┌──────────────────────────────┐
│ Vitals                       │
│ BP 120/80 ┃ HR 72 ┃ Temp …   │
│ SpO2 99 ┃ Wt 70 ┃ Ht 175     │
│ ┌────────────────────┐       │
│ │ BMI 22.9 · normal  │       │
│ └────────────────────┘       │
│                              │
│ General examination          │
│ [                          ] │
│                              │
│ Systemic examination         │
│ [                          ] │
│                              │
│ Test results (patient-…)     │
│ [                          ] │
│                              │
│ ▸ Show legacy free-text vitals │
└──────────────────────────────┘
```

Tab-contract slot RESERVED for future Labs tab.

**BMI computation** is client-side (DL-2 of cockpit-history-pane). Formula:
`bmi = weightKg / (heightCm / 100)²`. Display only; no DB column.

**Examination split via delimiter** (DL-6 / DL-9 of cockpit-history-pane). The
two UI textareas serialize to the single `examination_findings` DB column with
`\n--- SYSTEMIC ---\n` between sections. Legacy data (no delimiter) populates
General only. Helpers live in `frontend/lib/cockpit/exam-findings.ts`.

**Legacy `vitalsText`** is demoted to a collapsed `<details>` disclosure;
existing data is preserved + editable. A future NLP backfill (capture-inbox)
may lift structured fields out of legacy text.

**Source:** [`Daily-plans/May 2026/21-05-2026/cockpit-history-pane/`](../Work/Daily-plans/May%202026/21-05-2026/cockpit-history-pane/).

### Patient ribbon strip (post-cockpit-ribbon, 2026-05-21)

A 52px full-width strip rendered between `<PatientProfileHeader>` and
`<PatientProfileShell>` for desktop telemed appointments with a known patient.
Surfaces always-visible patient context to reduce risk of missed allergies and
to anchor the doctor on the active diagnosis across all panes.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ [← Back]  Ravi Sharma  42 y / M                                  [Start]  │ ← header (existing)
│           MRN-00123 · +91 98765 43210 · Video · 10:30 · #4                │
├───────────────────────────────────────────────────────────────────────────┤
│ 42 y · M · 68 kg │ ⚠️ Penicillin · Sulfa · +2 │ 🩺 HTN · DM · COPD │ 💊 4 │ 🎯 URI │ ← ribbon (new)
├──────────────┬────────────────────────────────────┬──────────────────────┤
│  Snapshot    │              Body                  │      Subjective      │
│  History     │                                    │      Plan            │
│              │                                    │      Objective       │
└──────────────┴────────────────────────────────────┴──────────────────────┘
```

**Slots (left → right):**
- Identity (age · sex · weight) — name lives in the header above (DL-1)
- Allergies (chips, max 3 + "+N more" overflow popover, severity-tinted)
- Chronic conditions (chips, max 3 + "+N more" overflow popover)
- Active medication count badge (`💊 N`)
- 🎯 Treating Dx mirror — clicking focuses the Dx input (`id="diagnosis"`) in the Assessment strip

**Conditional rendering:**
- Walk-in (`patient_id == null`) → ribbon hides; 2-pane horizontal fallback unchanged
- Mobile (`<lg` viewport) → ribbon hides; MobilePillBar flow unchanged

**Source files:** `frontend/hooks/usePatientRibbonData.ts` (crb-01) · `frontend/components/patient-profile/PatientRibbon.tsx` (crb-02).  
**Source plan:** [`Daily-plans/May 2026/21-05-2026/cockpit-ribbon/`](../Work/Daily-plans/May%202026/21-05-2026/cockpit-ribbon/).

### Related batches

| Batch | What shipped |
|---|---|
| cockpit-v2 (17 May) | Recursive shell, SOAP fields, section extraction, templates factory |
| cockpit-shell-flip (19 May) | Production cutover to 8-pane template |
| cockpit-chart-extraction (20 May) | Snapshot + History split; `<SideSheetHost>` first real consumer |
| cockpit-ribbon (21 May) | 52px patient context ribbon strip; identity / allergies / chronic / 💊 / 🎯 Dx mirror |
| templates-r-mod (21 May) | Voice / Text / Review template factories; `mapStateToTemplate` dispatcher; doctor-settings `cockpit_template_override` |
| cockpit-middle-investigations (23 May) | `<InvestigationsPane>` live; last production `<PanePlaceholder>` cleared |
| cockpit-middle-rebuild (23 May) | Assessment strip, Safety strip, Plan action footer, BodyZone, narrow-monitor auto-merge |
| rx-polish-densification (24 May) | Medicine row two-state summary/editor (~48px summary line); one active editor per PlanSection |
| rx-polish-shortcuts (24 May) | Plan-pane keyboard shortcuts + real Cmd+K palette + `?` help dialog |
| rx-polish-side-sheet (24 May) | Previous-Rx popover → side sheet on cockpit Plan zone; filter chips + search + Append/Replace diff apply |
| cockpit-layout-presets-modality (24 May) | Right-click pane header context menu; recursive layout-tree mutations; tree-shaped presets (migration 112); built-in modality templates + hidden-pane restore in preset picker |
| cockpit-history-pane (24 May) | BMI badge on VitalsGrid; General + Systemic exam split via delimited serialization; test results textarea; legacy vitalsText demoted; tab-contract slots reserved |
| cockpit-v2-decommission (24 May) | Kill-switch removed; plans archived; `COCKPIT.md` promoted to live SoT; `cockpit_v2.program_completed` telemetry |
| cockpit-plan-pane-deduplication (26 May) | Four lift props on Plan `<RxPane>`; Subjective/Objective/entry-mode/photo duplicates hidden; Medicines-only Plan surface |
| cockpit-nav-clarity (26 May) | Right column "Chart Notes" title; `cockpitMode` gates `<RxSectionNav>`; Investigations empty-state CTA; PatientRibbon safety + treating labels/tooltips |
| cockpit-chart-density (26 May) | Unified chart-rail empty-state when all five signals empty; Snapshot live-draft vitals badge; per-pane disclosure chevron + one-line collapse summary (session-only) |
| cockpit-polish-visual (26 May) | AssessmentStrip zero-state; SaveStatusPill copy; BMI badge; exam labels; unified PaneHeader; color tokens; search collapse; pane-icon SoT; problem-list wrap |

---

## Telemetry events

| Event | When | Guard |
|---|---|---|
| `cockpit_v2.phase2_shell_flipped` | First `PatientProfilePage` mount per browser session after csf-04 cutover | `window.__cockpitV2PhaseFlipped` |
| `cockpit_v2.r_chart_landed` | First `PatientProfilePage` mount per browser session after R-CHART (cce-05) | `window.__cockpitV2RChartLanded` |
| `cockpit_v2.r_ribbon_landed` | First `PatientRibbon` mount per browser session after R-RIBBON (crb-02). Payload: `allergies_count`, `chronic_count`, `dx_value_present`. | `window.__cockpitV2RRibbonLanded` |
| `cockpit_v2.r_mod_voice_landed` | First Voice template mount per browser session (tmr-05). Payload: `appointmentId`, `override_active`. | `window.__cockpitV2RModVoiceLanded` |
| `cockpit_v2.r_mod_text_landed` | First Text template mount per browser session (tmr-05). Payload: `appointmentId`, `override_active`. | `window.__cockpitV2RModTextLanded` |
| `cockpit_v2.r_mod_review_landed` | First Review template mount per browser session (tmr-05). Payload: `appointmentId`, `override_active`. | `window.__cockpitV2RModReviewLanded` |
| `cockpit_v2.r_middle_inv_landed` | First `<InvestigationsPane>` mount (cmi-03). Payload: `appointmentId`, `investigations_length`. | `window.__cockpitV2RMiddleInvLanded` |
| `cockpit_v2.r_middle_assessment_landed` | First `<AssessmentStrip>` mount (cmr-07). Payload: `appointmentId`, `has_dx_value`. | `window.__cockpitV2RMiddleAssessmentLanded` |
| `cockpit_v2.r_middle_safety_landed` | First `<SafetyStickyStrip>` mount (cmr-07). Payload: `appointmentId`, `banner_visible`, `ddi_chip_count`. | `window.__cockpitV2RMiddleSafetyLanded` |
| `cockpit_v2.r_middle_footer_landed` | First `<PlanActionFooter>` mount (cmr-07). Payload: `appointmentId`, `can_send`. | `window.__cockpitV2RMiddleFooterLanded` |
| `cockpit_v2.r_middle_body_refactored` | First `<BodyZone>` mount (cmr-07). Payload: `appointmentId`, `variant`. | `window.__cockpitV2RMiddleBodyRefactored` |
| `cockpit_v2.r_middle_narrow_merge_landed` | First `<InvestigationsAutoMerge>` mount (cmr-07). Empty payload. | `window.__cockpitV2RMiddleNarrowMergeLanded` |
| `cockpit_v2.r_history_landed` | First `<ObjectivePane>` mount (chp-03). Payload: `appointmentId`, `vitalsFilledCount`, `hasGeneralExam`, `hasSystemicExam`, `hasTestResults`, `hasBmi`. | `window.__cockpitV2RHistoryLanded` |
| `cockpit_v2.r_rx_polish_densification_landed` | First `<MedicineRow>` summary-mode mount per browser session (rxd-04). Payload: `appointmentId`, `completedRowsCount`, `editorRowsCount`. | `window.__cockpitV2RRxPolishDensificationLanded` |
| `cockpit_v2.r_rx_polish_shortcut_used` | Plan-pane shortcut fired (rxs-04). Payload: `combo`, `action`. | — (per press) |
| `cockpit_v2.r_rx_polish_side_sheet_opened` | Previous-Rx side sheet finished loading (rxss-04). Payload: `priorRxCount`. | — (per open) |
| `cockpit_v2.r_rx_polish_side_sheet_filter_changed` | Chip or search filter changed (rxss-04). Payload: `chip`, `hasSearch`. | — (per change) |
| `cockpit_v2.r_rx_polish_side_sheet_applied` | Prior Rx confirmed into draft (rxss-03). Payload: `priorRxId`, `mode`, `medicineCount`. | — (per apply) |
| `cockpit_v2.r_layout_ux_context_menu_opened` | Pane header context menu opened (clpm-03). Payload: `paneId`. | — (per open) |
| `cockpit_v2.r_layout_ux_tree_mutation` | Layout tree split / merge / collapse / hide / restore (clpm-05). Payload: `op`, `paneId`. | — (per mutation) |
| `cockpit_v2.r_layout_ux_preset_saved` | Custom layout preset saved (clpm-05). Payload: `paneCount`. | — (per save) |
| `cockpit_v2.r_layout_ux_preset_applied` | Built-in or custom preset applied (clpm-05). Payload: `presetId`, `isBuiltIn`, `paneCount`. | — (per apply) |
| `cockpit_v2.program_completed` | First `PatientProfilePage` mount per browser session post decommission (cvd-02). Payload: `phase2BatchesShipped`, `phase3BatchesShipped`, `soakDays`, `killSwitchEscapeRatePct`. | `window.__cockpitV2ProgramCompleted` |
| `cockpit_polish.plan_pane_dedup_landed` | First `<RxPane>` mount per session with all four ppd lifts true (ppd-05). Payload: `appointmentId`, `subjectiveLifted`, `objectiveLifted`, `entryModeLifted`, `photoLifted`. | `window.__cockpitPolishPlanPaneDedupLanded` |
| `cockpit_polish.nav_clarity_landed` | First `<RxWorkspace>` mount per session with `cockpitMode` true (cnc-05). Payload: `appointmentId`, `cockpitMode`, `rxSectionNavHidden`, `rightColumnTitle`. | `window.__cockpitPolishNavClarityLanded` |
| `cockpit_polish.chart_density_landed` | First `<ChartRailWithEmptyState>` mount per session after signals load (ccd-04). Payload: `appointmentId`, `emptyPaneCount`, `unifiedEmptyState`. | `window.__cockpitPolishChartDensityLanded` |
| `cockpit_polish.visual_system_landed` | First `PatientProfilePage` mount per session post cpv batch (cpv-08). Payload: `appointmentId`, `batch`. | `window.__cockpitPolishVisualSystemLanded` |
| `cockpit_v2.phase1_close_gate_smoke_passed` | Reserved for cv2-08 human smoke sign-off | — |

Implementation: `frontend/lib/patient-profile/telemetry.ts`.

---

## Key files

| File | Role |
|---|---|
| `frontend/components/patient-profile/PatientProfilePage.tsx` | DL-2 carve-out; pane factory + RxFormProvider lift |
| `frontend/components/patient-profile/Shell.tsx` | Recursive `PaneDefinition` renderer |
| `frontend/components/patient-profile/PatientRibbon.tsx` | 52px ribbon strip (crb-02); consumes `usePatientRibbonData` + `useRxForm` |
| `frontend/hooks/usePatientRibbonData.ts` | Ribbon data hook (crb-01); composes allergies / chronic / Rx / patient endpoints |
| `frontend/lib/patient-profile/templates.tsx` | Four template factories + shared column helpers |
| `frontend/lib/patient-profile/state.ts` | `mapStateToTemplate` dispatcher |
| `frontend/lib/patient-profile/layout.ts` | Storage keys + seed helpers |
| `frontend/lib/patient-profile/layout-tree-mutations.ts` | Pure split / merge / collapse / hide / restore on `LayoutNode` (clpm-04) |
| `frontend/lib/patient-profile/layout-presets-builtin.ts` | Four built-in modality layout trees for preset picker (clpm-02) |
| `frontend/components/patient-profile/PaneContextMenu.tsx` | Right-click pane header menu — split / merge / collapse / hide (clpm-03) |
| `frontend/lib/patient-profile/telemetry.ts` | PHI-free cockpit event logger; all `cockpit_v2.*` events funnel here |
| `frontend/components/cockpit/rx/RxFormContext.tsx` | Shared SOAP form state |
