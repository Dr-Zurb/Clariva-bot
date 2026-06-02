# Cockpit v3 flat-tab ⇄ old-shell parity matrix (cv3t-03 — the Phase-5 close-gate)

> **Artifact type:** Auditable parity record (P5-DL-5). **Supersedes** the cv3x-01 sign-off ([`../p4-cutover/PARITY-MATRIX-cv3x-01.md`](../p4-cutover/PARITY-MATRIX-cv3x-01.md)) for the flip → soak → delete decision: cv3x-01 proved parity on the **template-seeded** tree but never exercised the production `blank → add-from-palette` build-up path (the hole that let the canvas ship blank). This record re-proves every cv3x-01 cell against the **flat-tab** structure (`buildCockpitTabs(ctx)`, cv3t-01/02) **and** adds the build-up axis.
> **Task:** [`./Tasks/task-cv3t-03-integration-parity-reverify-and-gate.md`](./Tasks/task-cv3t-03-integration-parity-reverify-and-gate.md) · **Batch:** [`./plan-p5-cockpit-v3-tab-model-batch.md`](./plan-p5-cockpit-v3-tab-model-batch.md) · **Exec order:** [`./Tasks/EXECUTION-ORDER-p5-cockpit-v3-tab-model.md`](./Tasks/EXECUTION-ORDER-p5-cockpit-v3-tab-model.md)
> **No PHI:** every fixture below is synthetic (`Test Patient`, `appt-1`, `pat-1`). No real patient or Rx data appears in this record ([COMPLIANCE.md](../../../../../../Reference/engineering/compliance/COMPLIANCE.md)).

---

## 0. Verdict

> ### ✅ **Parity green on the flat-tab structure on 2026-05-31; the Phase-4 soak + cv3x-03 are re-opened.** (P5-DL-5)

Every cell of the cv3x-01 consult-type × safety-critical-path matrix is **green on the flat-tab v3** (`buildCockpitTabs(ctx)`), and the **new build-up axis** the original matrix lacked is green too: from blank, each of the eight tabs mounts its **real** body (never a `() => null` wrapper), the palette lists the eight real tabs, exactly **one** safety strip + **one** "Send Rx & finish" footer survive a built-up arrangement, and the decoupled Plan/Investigations write the **same** `investigationsOrders` field (no split). The proof rests on the same structural invariant as cv3x-01 — the send / autosave / safety pipeline lives **above** both shells and the pane bodies are **ported by reference** (P5-DL-2), so flattening the columns into tabs cannot move safety-critical behaviour — plus **45 test suites / 345 assertions** run with the v3 flat-tab shell mounted. No shell or pane-body file was modified by this task.

Two carried-over, non-blocking observations are recorded in §6 (the pre-existing jsdom hang in the **shared** persistence hook, and why the reload/persist cell is proven by the migration/persistence suites rather than re-driven through the real shell here). Neither is a v3-vs-old or flat-vs-nested behavioural difference.

---

## 1. Why parity still holds after the flatten — the structural thesis (read this first)

cv3x-01 established that the cockpit's safety-critical logic does **not** live in either shell: the send / autosave / safety pipeline is mounted at the **page root** in `PatientProfilePage.tsx`, *above* the shell branch. Phase 5 changed **only the shape of the `panes` prop the v3 branch receives** — from the nested column template to the flat tab registry — and **nothing above it**:

```
PatientProfilePage  (frontend/components/patient-profile/PatientProfilePage.tsx)
└── RxFormProvider                 ← autosave (1500ms debounce), single timer  [page root — UNCHANGED]
    └── RxSafetyProvider           ← allergy / DDI surface                       [page root — UNCHANGED]
        └── RxFormActionsBridgeProvider   ← send-handler registration bridge     [page root — UNCHANGED]
            └── { cockpitV3Enabled()
                    ? <CockpitV3Shell panes={v3Tabs} …/>      ← FLAT registry (buildCockpitTabs) — Phase 5
                    : <PatientProfileShell panes={panes} …/> }← nested template  — UNCHANGED (P0-DL-1 / P5-DL-3)
                    storageKey={storageKey}               ← SAME key
                    safetyDock={<SafetyStickyStrip …/>}   ← SAME element
                    actionDock={<PlanActionFooter …/>}    ← SAME element
```

Consequences that keep the matrix green by construction after the flatten:

1. **Same send pipeline.** The flat `plan` tab renders the **same** `RxPane` with its lifted props transplanted **verbatim** (P5-DL-2). `PlanActionFooter` still reads the live handler via `useRxFormActions()`; `PrescriptionForm` still registers it via `useRegisterRxFormActions()` — both descendants of the same page-root bridge. The v3 footer fires the identical `sendAndFinish` → `handleSaveAndSend` → `performSaveAndSend` path.
2. **Same autosave.** Owned by `RxFormProvider` at the page root — one timer, same keys, shell- and registry-independent. The tab registry cannot change save keys or debounce.
3. **Bodies ported by reference.** Each flat tab's `render()` returns the **existing** pane component (`SnapshotPane`, `HistoryPane`, `BodyZone`/`EndedConsultBody`, `AssessmentStrip`, `InvestigationsPane`, `RxPane`, `SubjectivePane`, `ObjectivePane`) unchanged (P5-DL-2). Render parity per consult type is therefore structural — the registry authors no new UI.
4. **Docks anchored outside the canvas.** Unchanged from cv3x-01: the docks are `shrink-0` siblings of the drag canvas, **outside** `<CockpitDndContext>`, so a drag-reshape cannot detach the footer from the send pipeline (v3-DL-6).
5. **The flatten removed wrappers, not behaviour.** The dead `left/middle/right-column` + `middle-bottom` wrappers (`render: () => null`) are gone from the v3 path; the eight **leaves** that always carried the content are now the top-level tabs the palette + blank-seed operate on. This is exactly what makes the build-up axis green where cv3x-01 was blank.

The only intentional behavioural changes (v3-DL-2 / v3-DL-4) are non-safety-critical and **by design**: Plan and Investigations are now independent tabs (no `InvestigationsAutoMerge` container-query marriage), and the body tab is relabelled "Consult" (live) / "Visit summary" (review). Both are verified below; neither moves a safety path.

---

## 2. Matrix axes

### Rows — consult types (the complete set, unchanged from cv3x-01)

Source of truth: `mapStateToTemplate(state, modality, override)` still dispatches the **same four** template ids; `buildCockpitTabs(ctx, templateId)` consumes that id to pick the body variant + tab subset. The list is closed.

| Row | Consult type (template) | Serves |
|---|---|---|
| R1 | `telemed-video` | video · `in_clinic` · null/unknown modality (default) |
| R2 | `telemed-voice` | voice |
| R3 | `telemed-text` | text (chat) |
| R4 | `review` | `ended` + `terminal` (completed / cancelled / no-show review) |
| R5 | *walk-in (no patient_id)* | `buildWalkInCockpitTabs(ctx)` — the same tabs minus the chart-rail Snapshot; shell-agnostic |

### Columns — cv3x-01 safety-critical paths (carried over)

"Pass" = **flat-tab v3 behaviour == old-shell behaviour**: same outcome, same network/side-effects, same end state.

| Col | Path | Pass criterion |
|---|---|---|
| C1 | **Open patient** | All expected tabs mount; no console error; no layout collapse. |
| C2 | **Prescribe + Send Rx & finish** | Docked footer fires the *identical* `sendAndFinish` pipeline. |
| C3 | **Send after reshape** | After Plan is dragged / tabbed elsewhere, the docked footer **still fires** `sendAndFinish` (the crown jewel). |
| C4 | **Autosave** | Same page-root provider, same keys, 1500ms debounce; no double-save; no lost edit. |
| C5 | **Lifecycle — finish / no-show / review** | Send hidden in `terminal`, shown in `live`/`ended`; `body`-during-`live` drag guard intact; Consult ⇄ Visit-summary relabel. |
| C6 | **Mount surfaces (cockpit-v2 DL-3 / DL-30)** | All three Rx mount surfaces render; shell governs only surface 1. |
| C7 | **Keyboard nav** | Help host, focus order, `⌘/Ctrl+Enter` send hotkey unchanged. |

### Columns — the NEW Phase-5 axes (the cv3x-01 hole, now closed)

| Col | Path | Pass criterion |
|---|---|---|
| **B1** | **Build-up — palette lists real tabs** | The palette lists the **eight real tabs** (Snapshot · History · Consult · Assessment · Investigations · Plan · Subjective · Objective), never a column wrapper. |
| **B2** | **Build-up — each tab mounts real content** | From blank, adding any one of the eight mounts its **real** body (not a `() => null` blank); a built-up multi-tab layout renders. |
| **B3** | **Decoupled Plan/Investigations** | Investigations (standalone tab) and Plan write the **same** `investigationsOrders` field — a write in one is read by the other; no split, no double chip-row. |
| **B4** | **No safety-chrome duplication** | Exactly **one** safety strip + **one** "Send Rx & finish" footer in every built-up arrangement (lifted props verbatim, observed end-to-end). |

---

## 3. The matrix — every cell green

Legend: ✅ = behavioural parity verified. `[E#]` keys point to the evidence in §4. "≡" = green **by shell-/registry-independence** (the path runs in page-root / pane code the flatten did not touch).

### 3a. cv3x-01 safety-critical matrix, re-proven on the flat-tab structure

| Consult type ↓ \ Path → | C1 Open | C2 Send | C3 Send after reshape | C4 Autosave | C5 Lifecycle | C6 Mount surfaces | C7 Keyboard |
|---|---|---|---|---|---|---|---|
| **R1 telemed-video** | ✅ `[E1][E2][E12]` | ✅ `[E3]` | ✅ `[E4]` | ✅ ≡ `[E5][Eauto]` | ✅ `[E6][E7][E12]` | ✅ `[E8][E9]` | ✅ ≡ `[E10][E11]` |
| **R2 telemed-voice** | ✅ ≡ `[E12]` | ✅ ≡ `[E3]` | ✅ ≡ `[E4]` | ✅ ≡ `[E5]` | ✅ ≡ `[E6]` | ✅ `[E8][E9]` | ✅ ≡ `[E10]` |
| **R3 telemed-text** | ✅ ≡ `[E12]` | ✅ ≡ `[E3]` | ✅ ≡ `[E4]` | ✅ ≡ `[E5]` | ✅ ≡ `[E6]` | ✅ `[E8][E9]` | ✅ ≡ `[E10]` |
| **R4 review (ended/terminal)** | ✅ `[E12]` | ✅ `[E7]` | ✅ ≡ `[E4]` | ✅ ≡ `[E5]` | ✅ `[E7][E12]` | ✅ `[E8][E9]` | ✅ ≡ `[E10]` |
| **R5 walk-in** | ✅ ≡ `[E12]` | ✅ ≡ `[E3]` | ✅ ≡ `[E4]` | ✅ ≡ `[E5]` | ✅ ≡ `[E6]` | ✅ `[E8]` | ✅ ≡ `[E10]` |

### 3b. The new Phase-5 axes (proven on the production registry)

| Path | Status | Evidence |
|---|---|---|
| **B1 — palette lists the eight real tabs** | ✅ | `[E13][E14]` — palette ids == registry ids; the `assertFlatLeafRegistry` guard rejects the nested column template / wrappers. |
| **B2 — each of the eight mounts real content** | ✅ | `[E13]` — from blank, all eight `Add <tab>` buttons mount their real body testid; `assertLeafRegistryRenders` guarantees no `() => null`. |
| **B3 — decoupled Plan/Investigations share one field** | ✅ | `[E15]` — an order added in the standalone Investigations tab is read by a separate consumer of the shared `RxFormProvider` (no split). |
| **B4 — exactly one safety strip + one send footer** | ✅ | `[E13]` — a built-up arrangement (Plan + Investigations + Consult) renders exactly one `safetyDock` + one `actionDock`, both anchored outside the canvas. |

**Why the "≡" cells are sound:** the four consult types differ only in the *tab set / body variant* `buildCockpitTabs` emits — not in the send/autosave/safety wiring, which is identical page-root code. R1 (the video default used by every chrome/platform fixture) physically exercises that wiring on the flat structure; the other rows feed the *same* providers/`actionDock` into the *same* shell. R4 review is proven directly (`EndedConsultBody` + Send hidden in `terminal`) `[E7][E12]`.

---

## 4. Evidence key (suite :: test) — all green, v3 flat-tab shell mounted

All commands run from `frontend/` via `npx vitest run` on 2026-05-31. Suites new/updated by Phase 5 are flagged **(P5)**.

| Key | What it proves | Suite :: test |
|---|---|---|
| `[E1]` | v3 desktop mounts palette + canvas between anchored safety/action docks; empty-state + build-up render | `components/patient-profile/v3/__tests__/CockpitV3Shell.integration.test.tsx` |
| `[E2]` | v3 anchored-chrome leaf re-anchor on reshape (chart-rail empty-state follows pane) — **(P5)** now seeded from `buildCockpitTabs(fixtureCtx(), "telemed-video")` | `…/v3/__tests__/CockpitChrome.leafAnchor.test.tsx` |
| `[E3]` | Docked footer fires `sendAndFinish` on the **default** layout (identical pipeline) | `…/v3/__tests__/CockpitChrome.reparent.test.tsx` :: *fires send on default layout* |
| `[E4]` | Docked footer **still fires** `sendAndFinish` after Plan → chart-rail (north), tabbed under snapshot (center), → body column (west) | `…/v3/__tests__/CockpitChrome.reparent.test.tsx` :: *footer sends after re-parent* (3 cases) |
| `[E5]` | Persistence/migration parity on the kept `PaneTreeNode` shape (`validateLayout` runs for real); reload + reshape round-trip | `…/v3/__tests__/CockpitPlatform.migrationParity.test.tsx`; `…/v3/__tests__/persistence.test.tsx`; `…/v3/__tests__/CockpitPlatform.integration.test.tsx` **(P5: integration panes = `buildCockpitTabs`)** |
| `[E6]` | `body`-during-`live` drag guard (`consultActive` disables Consult-tab drag; other tabs draggable) | `…/v3/__tests__/CockpitChrome.reparent.test.tsx` :: *disables body tab drag when consultActive* |
| `[E7]` | Consult-state coverage: Send shown in `live` + `ended`, **hidden** in `terminal` (action dock still present) | `…/v3/__tests__/CockpitChrome.reparent.test.tsx` :: *shows footer send in live and ended; hides in terminal* |
| `[E8]` | Mount surface 1 (desktop): docks outside `<CockpitDndContext>`, anchored top/bottom | `…/v3/__tests__/CockpitChrome.reparent.test.tsx` :: *docks outside DnD context*; `CockpitV3Shell.integration.test.tsx` |
| `[E9]` | Mount surface 1 (mobile): flat stacked visible tabs, no panel groups / palette | `…/v3/__tests__/CockpitMobileFallback.test.tsx`; `CockpitV3Shell.integration.test.tsx` |
| `[E10]` | Send hotkey + wrap-up hotkey + help-host wiring (shell-independent; page-root) | `hooks/__tests__/useShellHotkeys.test.ts`; `components/patient-profile/__tests__/KeyboardHelpHost.test.tsx` |
| `[E11]` | Consult-type completeness: `mapStateToTemplate` truth table (no consult type maps elsewhere) | `lib/patient-profile/__tests__/state.test.ts` :: *mapStateToTemplate* |
| `[E12]` | **(P5)** Flat registry shape: 8 uniform top-level leaf tabs (no `children`), correct ids/titles/icons, Consult ⇄ Visit-summary by state, walk-in subset | `lib/patient-profile/v3/__tests__/cockpit-tabs.test.tsx` |
| `[E13]` | **(P5)** Production build-up: palette lists the 8 real tabs; each of the 8 mounts its real body from blank; reset → blank; exactly one safety + one action dock when built up | `components/patient-profile/v3/__tests__/buildUp.production.test.tsx` |
| `[E14]` | **(P5)** Flat-leaf guards: `blankLayout` + `CockpitPalette` accept `buildCockpitTabs(ctx)` and **reject** the nested column template / `render:()=>null` wrappers | `…/v3/__tests__/buildUp.production.test.tsx` :: *flat registry guards*; `lib/patient-profile/v3/blankLayout.ts` (`assertFlatLeafRegistry` / `assertLeafRegistryRenders`) |
| `[E15]` | **(P5)** Decoupled Plan/Investigations: a write in the standalone Investigations tab is read by a separate consumer of the shared `investigationsOrders` field (no split) | `components/patient-profile/panes/__tests__/InvestigationsPane.test.tsx` :: *decoupled Investigations writes the shared field (no split)* |
| `[Eauto]` | Send/autosave engine unit behaviour (the page-root pipeline both shells share) | `components/consultation/__tests__/PrescriptionForm.test.tsx`; `components/cockpit/rx/__tests__/PrescriptionFormCompositionRoot.test.tsx`; `components/consultation/cockpit/__tests__/RxWorkspace.test.tsx`; `components/consultation/__tests__/sendButtonState.test.ts` |
| `[Eref]` | **Old-shell reference** — same reshape→send + safety-dock behaviour on `PatientProfileShell` (flag-off path, byte-identical) | `components/patient-profile/__tests__/chrome-reparent.test.tsx`; `…/PatientProfilePage.live-consult-guard.test.tsx` |
| `[Efoot]` | `PlanActionFooter` + `SafetyStickyStrip` unit behaviour (the docked elements both shells share) | `components/cockpit/middle/__tests__/PlanActionFooter.test.tsx`; `…/SafetyStickyStrip.test.tsx` |

### Mount-surface detail (C6 / cockpit-v2 DL-30) — unchanged by the flatten

| Surface | Owner | Parity status |
|---|---|---|
| 1. Appointment detail (desktop **+** mobile) | `PatientProfilePage` → the shell branch | v3 desktop `[E1][E8]` + mobile `[E9]`; old shell has the same branches. ✅ |
| 2. Rx column (desktop) | `RxPane` → `RxWorkspace` → `PrescriptionForm` (the flat `plan` tab) | Same page-root `RxFormProvider`; shell-/registry-independent. ✅ ≡ |
| 3. In-call mini-panel / post-call summary | `PrescriptionForm` via its own trees (not wrapped by the page provider) | Does not use the cockpit shell at all → unaffected. ✅ ≡ |

---

## 5. The crown jewel + the build-up hole, both closed

**C3 (crown jewel), re-proven on tabs.** The single most dangerous regression — *"after a doctor drags Plan, the bottom Send button silently stops sending"* — is re-asserted on the flat-tab structure: `CockpitChrome.reparent.test.tsx` reshapes the live tree three ways (Plan→north, Plan-tabbed-center, Plan→west) and asserts `sendAndFinish` is called exactly once each, with the footer inside `cockpit-v3-action-dock` and outside `p2-cockpit-v3-dnd-context`. The old shell has the byte-for-byte equivalent `[Eref]`.

**B2 (the cv3x-01 hole), now closed.** cv3x-01 proved "v3 renders when seeded with a tree" but never the production `blankLayout(panes) + add-from-palette` path — so the column-wrapper defect shipped a blank canvas. `buildUp.production.test.tsx` now seeds from `buildCockpitTabs(ctx)` (the production registry, not a fixture) and proves: the palette lists the eight real tabs; adding **each** of the eight mounts its real body; reset returns to blank; and a built-up arrangement keeps exactly one safety strip + one send footer `[E13]`. The `assertFlatLeafRegistry` / `assertLeafRegistryRenders` guards `[E14]` make a regression to the wrapper bug a **build-time test failure**, not a silent blank pane.

---

## 6. Issues encountered & resolved (non-blocking)

**Issue 1 — reload/persist on the production registry is proven by the migration suites, not re-driven through the real shell.**
An attempt to assert "multi-tab layout persists across reload" by mounting the real `CockpitV3Shell` twice on the same `storageKey` (pre-seeded `localStorage`) hit the **known jsdom hydration limitation** the cv3x-01 matrix logged (its §6 Issue 2: `useShellLayout`/`useCockpitV3Layout` + pre-seeded `localStorage` under jsdom). This is a **test-harness artifact in a shared hook**, not a flat-vs-nested behaviour: persistence operates on the kept `PaneTreeNode` shape, which is **registry-agnostic** (the flat tabs yield the same node shape as the template leaves). Reload/persist parity is therefore taken from the passing `CockpitPlatform.migrationParity.test.tsx` + `persistence.test.tsx` `[E5]`, and the speculative full-shell reload assertion was **removed** rather than shipped flaky (verify, don't fight infra). The shared-hook hang remains logged to the capture inbox as a test-infra follow-up; it does **not** block the gate.

**Issue 2 — v3 integration suites still passed the nested template (corrected in cv3t-02).**
`CockpitChrome.leafAnchor`, `CockpitChrome.reparent`, and `CockpitPlatform.integration` were seeding `CockpitV3Shell` with `getTelemedVideoTemplate(...)` (the nested column tree), which the new `assertFlatLeafRegistry` guard correctly rejects. cv3t-02 repointed them at `buildCockpitTabs(fixtureCtx(), "telemed-video")`; they exercise the same layout-tree mutations on the flat registry and are green. No shell or pane-body code changed.

---

## 7. Verification log (the commands behind §4)

All from `frontend/` on 2026-05-31.

| Run | Scope | Result |
|---|---|---|
| 1 | Full v3 suites — `components/patient-profile/v3` + `lib/patient-profile/v3` (shell, dnd, reparent, leaf-anchor, platform, migration, persistence, mobile, palette, build-up ±**production (P5)**, group-view, **cockpit-tabs (P5)**) | **27 files · 162 passed** |
| 2 | cv3x-01 cross-cutting evidence — `useShellHotkeys`, `KeyboardHelpHost`, `state` truth-table, old-shell `chrome-reparent`, `live-consult-guard`, `templates` | **6 files · 113 passed** |
| 3 | Docked elements + send-button — `PlanActionFooter`, `SafetyStickyStrip`, `sendButtonState` | **3 files · 19 passed** |
| 4 | Send/autosave engine — `PrescriptionForm`, `PrescriptionFormCompositionRoot` | **2 files · 14 passed** |
| 5 | Decoupled + ported bodies — `InvestigationsPane (P5)`, `RxWorkspace`, `InvestigationsAutoMerge` (legacy), `AssessmentStrip`, `SubjectivePane`, `ObjectivePane`, `SnapshotPane` | **7 files · 34 passed** (pre-`[E15]` addition) |
| 6 | **Consolidated parity run** (runs 1–5 deduped, one invocation, post-additions) | **45 files · 345 passed · 0 failing** |
| 7 | `npx tsc --noEmit` (`frontend/`) | **clean** (exit 0) |
| 8 | `npx eslint` (the two changed test files) | **clean** (exit 0) |
| — | `shell-preseed-probe` / `blank-seed-probe` | excluded — pre-existing jsdom hang in the **shared** hook (§6 Issue 1 / cv3x-01 §6 Issue 2) |

**Total: 45 suites · 345 assertions green · 0 failing · tsc clean · lint clean.**

**No shell or pane-body file modified.** This task touched exactly four artifacts: this matrix record + two targeted parity-test additions (`InvestigationsPane.test.tsx` :: shared-field no-split; `buildUp.production.test.tsx` :: each-of-eight + single-dock build-up axis) + the status stamps (task / exec-order / README / inbox). `CockpitV3Shell.tsx`, `cockpit-tabs.tsx`, `RxPane.tsx`, `InvestigationsPane.tsx`, `templates.tsx`, and `PatientProfilePage.tsx` are unchanged by cv3t-03. (Repository is not under git here; the constraint is satisfied by construction.)

---

## 8. Global safety gate

- **Data touched?** No new data access — verification exercises existing, unchanged data paths.
  - **RLS:** unchanged; no schema/policy change in this task.
- **PHI in logs/record?** No — all fixtures synthetic (`Test Patient` / `appt-1` / `pat-1`).
- **External API / AI call?** No — the send pipeline is exercised via the existing mocked path; no new external call.
- **Retention / deletion impact?** None — no data or persisted-layout-key change.

---

## 9. Sign-off (P5-DL-5)

**Flat-tab parity green on 2026-05-31; this record supersedes cv3x-01 for the flip → soak → delete decision.**
`CockpitV3Shell` on the flat-tab registry (`buildCockpitTabs`) is behaviourally identical to `PatientProfileShell` across all five consult types and all seven cv3x-01 safety-critical paths, **and** the previously-unproven build-up axis (palette lists real tabs · each mounts real content · decoupled Plan/Investigations share one field · single safety/action dock) is now green. The legacy flag-off path is byte-identical by construction (`templates.tsx` + the `PatientProfileShell` branch unchanged; P0-DL-1 / P5-DL-3).

**Phase 5 closes here and hands back to Phase 4:** the ~1-week prod soak — now meaningful, because the canvas is buildable — may begin, after which **cv3x-03** deletes the old shell **plus the now-legacy-only glue** (column factories, `InvestigationsAutoMerge`, the `middle-bottom` wrapper) and **cv3x-04** finishes the docs.

**Last updated:** 2026-05-31 · **Pattern:** Close-gate parity re-verification (re-use cv3x-01 axes + add the build-up axis; record the superseding matrix). · **Supersedes:** [`../p4-cutover/PARITY-MATRIX-cv3x-01.md`](../p4-cutover/PARITY-MATRIX-cv3x-01.md) for P5-DL-5.
