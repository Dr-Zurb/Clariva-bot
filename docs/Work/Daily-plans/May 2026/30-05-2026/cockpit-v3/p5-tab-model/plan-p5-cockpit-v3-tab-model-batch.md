# Cockpit v3 — Phase 5: tab model (flatten columns → uniform tabs · fix the build-up canvas · decouple Plan/Investigations) — 31 May 2026 batch plan

> **Phase 5 of the Cockpit v3 program — the tab model.** Phases 0–4 built the editor-group shell and flipped it default-on. But the flip exposed a structural gap: **the default-on canvas is not actually usable.** The palette and the blank-seed operate on the *top-level* `PaneDefinition[]` they are handed — and `PatientProfilePage` hands them the **nested column template** (`left-column` / `middle-column` / `right-column`, each `render: () => null`). So a doctor opening a consult sees an empty canvas whose palette offers three structural wrappers that render **nothing** when added. Phase 5 makes v3 what the product always intended (**v3-DL-2: every pane is a tab; no pane is special**): it replaces the nested column template — in the v3 path only — with a **flat, uniform tab registry**, points the palette + blank-seed at the **real leaf tabs**, and decouples the Plan/Investigations container-query marriage so each tab is an independent entity. This is the phase where "build your cockpit from blank" goes from *broken* to *true*.
>
> **Source plan:** [`Product plans/plan-cockpit-v3.md`](../../../../../Product%20plans/plan-cockpit-v3.md) — **v3-DL-2** (uniform tabs; no pane is special), **v3-DL-5** (blank start + pane palette), **R-PALETTE**, and the **post-v3 fast-follow** the cutover explicitly rolled forward (P4-DL-6 / the cutover's "Out-of-scope" table: *"`InvestigationsAutoMerge` narrow-merge in the flat-pane model — assess post-cutover"* and *"deferred fast-follows promote as a fresh post-v3 batch"*). This **is** that batch.
>
> **Prefix note:** tasks are `cv3t-*` (`cv3` = cockpit v3, `t` = **t**ab model). Phase 0 = `cv3s` (scaffold), Phase 1 = `cv3c` (core shell), Phase 2 = `cv3d` (dnd), Phase 3 = `cv3p` (platform), Phase 4 = `cv3x` (cutover). Each phase restarts its sub-prefix at `01` — this program's established pattern (per [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) §3, a phase "may use its own sub-prefix when the work is genuinely distinct").
>
> **Builds on Phases 0–4 ([p0-scaffold](../p0-scaffold/), [p1-shell](../p1-shell/), [p2-dnd](../p2-dnd/), [p3-platform](../p3-platform/), [p4-cutover](../p4-cutover/)).** Phase 4 flipped `cockpitV3Enabled()` default-on (cv3x-02) and proved a parity matrix (cv3x-01). Phase 5 **re-sequences the tail of Phase 4**: it lands **before** the prod soak and **before** the old-shell deletion (cv3x-03), because the canvas defect makes a soak on the current build meaningless and deleting the fallback while v3 is unusable is unsafe (see "Re-sequencing" below).
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Two Opus tasks (the batch cap): **cv3t-01** (the structural keystone — flattens the mount of the prescribe surface; the lifted-props hazard lives here) and **cv3t-03** (re-proving the parity close-gate against the new structure). cv3t-02 (palette/seed wiring) is Sonnet.
>
> **Task-file note:** every `task-cv3t-*` file follows the current [`TASK_TEMPLATE.md`](../../../../../process/TASK_TEMPLATE.md) — **no code or pseudo-code in tasks** ([planning/execution boundary](../../../../../process/TASK_MANAGEMENT_GUIDE.md)); the "how" lives in [`RECIPES.md`](../../../../../../Reference/engineering/development/RECIPES.md) / [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md) and the code.
>
> **Exec order + wave plan:** [`Tasks/EXECUTION-ORDER-p5-cockpit-v3-tab-model.md`](./Tasks/EXECUTION-ORDER-p5-cockpit-v3-tab-model.md).

---

## What Phase 5 does (one sentence)

> **Replace the nested column template with a flat, uniform tab registry in the v3 path, point the palette + blank-seed at the real leaf tabs so adding any pane mounts real content (not a blank wrapper), mount Plan and Investigations as independent tabs (no container-query auto-merge), relabel the body tab "Consult" / "Visit summary", and re-prove parity — all by referencing the existing pane bodies unchanged, leaving the legacy template path byte-identical until cv3x-03 deletes it.**

After Phase 5: a doctor opening any consult on v3 sees a palette of the **eight real tabs** (Snapshot · History · Consult · Assessment · Investigations · Plan · Subjective · Objective); adding any one mounts its real content; each tab is a self-contained, draggable, tab-able entity reading the shared Rx / safety providers; and the prescribe → safety → send pipeline behaves exactly as before (lifted props transplanted verbatim). The canvas is finally *buildable*, so the soak and the old-shell deletion can proceed on a sound basis.

---

## The defect this phase fixes (root cause, in writing)

`task-cv3c-03` (Phase 1) built the blank-seed and palette for **a flat row of all available panes** — its own words: *"default tree = flat row of all panes, all `hidden: true`."* Both helpers walk only the **top level** of the `PaneDefinition[]` they receive:

- `blankLayout(panes)` seeds from `panes.map(p => p.id)` — top-level ids only ([`frontend/lib/patient-profile/v3/blankLayout.ts`](../../../../../../../frontend/lib/patient-profile/v3/blankLayout.ts)).
- `CockpitPalette` maps over the top-level `panes` ([`frontend/components/patient-profile/v3/CockpitPalette.tsx`](../../../../../../../frontend/components/patient-profile/v3/CockpitPalette.tsx)).

But `PatientProfilePage` hands the v3 shell the **modality template** — `getTelemedVideoTemplate(ctx)` etc. — whose top level is **three column wrappers** (`left-column`, `middle-column`, `right-column`), each with `render: () => null` and the real panes nested as `children` ([`frontend/lib/patient-profile/templates.tsx`](../../../../../../../frontend/lib/patient-profile/templates.tsx)). So the palette lists three wrappers, the seed hides three wrappers, and adding one mounts `() => null` → a **blank pane**. The eight real leaves (Snapshot, History, Body, Assessment, Investigations, Plan, Subjective, Objective) are flattened into `knownLeafIds` but never reach the palette or the seed.

**Why the cv3x-01 matrix missed it:** the parity suites seed the tree from an *expanded* template (`convertTemplateToTree`) or from flat leaf fixtures with real renders — they never exercised the production `blankLayout(columnTemplate) + add-from-palette` path. The matrix proved "v3 renders correctly when seeded with a tree"; it did not prove "a doctor can build a cockpit from blank." cv3t-03 closes that hole.

---

## Decision lock

The product plan's **v3-DL-1..10**, plus **P0-DL**, **P1-DL**, **P2-DL**, **P3-DL**, and **P4-DL** carry forward unchanged. Especially binding here: **v3-DL-2 (uniform tabs; no pane is special)**, **v3-DL-5 (blank start + palette)**, **v3-DL-1 (kept model/engine — never deleted)**, **P0-DL-1 (flag-off / kill-switch path stays byte-identical)**, **v3-DL-6 (clinical-safety chrome stays anchored, never a tab)**.

These six are **Phase-5-specific**, frozen for this batch:

**P5-DL-1: The flat tab registry is the v3 source of truth; columns are dead in the v3 path.** v3 mounts a flat, uniform list of leaf tabs built by `buildCockpitTabs(ctx)`. No column wrappers (`left/middle/right-column`, `middle-bottom`) appear in the v3 path. The eight tabs are peers — the shell arranges, the tabs render (v3-DL-2).

**P5-DL-2: Port by reference — never rewrite a pane body.** The registry *references* the existing pane components (`RxPane`, `InvestigationsPane`, `SnapshotPane`, `HistoryPane`, `SubjectivePane`, `ObjectivePane`, `AssessmentStrip`, `BodyZone` / `EndedConsultBody`) unchanged. The prescribe → safety → send engine (`RxWorkspace` / `PrescriptionForm`) is **not touched**. The Plan tab's lifted props (`hideHeader`, `actionsInFooter`, `dxLifted`, `safetyLifted`, `subjectiveLifted`, `objectiveLifted`, `entryModeLifted`, `photoLifted`, `cockpitMode`) are transplanted **verbatim** — a dropped flag is a real bug (double/missing safety banners, two send buttons), not a cosmetic one.

**P5-DL-3: Legacy templates stay until cv3x-03 — flag-off remains byte-identical.** `templates.tsx`, `InvestigationsAutoMerge`, the `middle-bottom` container-query wrapper, and the column factories remain in place — the legacy `PatientProfileShell` fallback (kill-switch / flag-off) still consumes them, and P0-DL-1 requires that path stay byte-identical. The registry is **new code** for v3; the glue **dies with the old shell in cv3x-03**, not here. Accept the temporary duplication of pane wiring across `templates.tsx` (legacy) and the registry (v3).

**P5-DL-4: Plan and Investigations are independent tabs in v3 — no auto-merge.** The container-query merge (`InvestigationsAutoMerge` + `@[720px]/middle-bottom`) does **not** exist in the v3 path. Investigations is a standalone tab; Plan is `RxPane` alone. Both edit the **same** shared `RxFormContext.fields.investigationsOrders`, so no state can split. The mobile flat fallback already stacks tabs vertically, and the doctor sizes/tabs them on desktop — the responsive merge is obsolete in the freedom model.

**P5-DL-5: Re-verify parity after the flatten; the soak + delete gate on it.** cv3t-03 re-runs the cv3x-01 safety-critical matrix against the **flat-tab** structure — this time including the `blank → add-from-palette` build-up path — and records the result. The Phase-4 soak and cv3x-03 (delete old shell) **do not begin until this is green** (it supersedes the original cv3x-01 sign-off, which had the build-up hole above).

**P5-DL-6: The default seed stays deferred (V3-Q1) — but the registry makes it trivial.** Phase 5 ships **blank-but-buildable**, not auto-seeded. No type-aware seed is decided here. The flat registry is precisely the surface a future seed task arranges (a `PaneTreeNode` of which tabs are visible + their sizes per consult type). Consistent with P4-DL-6: the seed is a feature, not part of this fix.

---

## Re-sequencing: how Phase 5 slots into the unfinished Phase 4

Phase 4 is **not** complete — cv3x-01 ✅ and cv3x-02 ✅ shipped, but cv3x-03 (delete) and cv3x-04 (docs) are still `PENDING`, gated on the soak. Phase 5 inserts **between cv3x-02 and the soak**:

```
cv3x-01 (parity) ✅  →  cv3x-02 (flip + kill-switch) ✅
        │
        ▼
   ⚠ defect found: default-on canvas not buildable (palette/seed see column wrappers)
        │
        ▼
   ── Phase 5 (cv3t-01 → cv3t-02 → cv3t-03) ──     ← THIS BATCH
        │
        ▼
   [ release window ~1 week prod soak ]   ⏸   (now meaningful — canvas is buildable)
        │
        ▼
   cv3x-03 (delete old shell + the now-dead glue)  →  cv3x-04 (docs / close-out)
```

**Why before the soak:** a soak is a stability bet on what doctors actually use. They cannot use the current build (blank wrappers), so a soak on it proves nothing. Phase 5 must land first for the soak clock to mean anything.

**Why before the delete:** cv3x-03 removes the legacy `PatientProfileShell` — the kill-switch fallback. Deleting the fallback while the default path is unusable removes the only escape hatch. The fallback stays until Phase 5 makes v3 genuinely usable and cv3t-03 re-proves parity.

**Hand-off to cv3x-03 (one-line additions to its deletion set):** once v3 stops consuming `templates.tsx`, the column factories + `InvestigationsAutoMerge` + the `middle-bottom` wrapper become legacy-only and join the cv3x-03 deletion audit. Phase 5 does **not** delete them (P5-DL-3); it records them for cv3x-03.

---

## What this phase does NOT do (deferred / out of scope)

| Item | State after Phase 5 | Lands |
|---|---|---|
| **V3-Q1 — type-aware default seed** | Still blank-but-buildable (P5-DL-6). The registry makes the seed a small data task. | Post-v3 batch |
| Per-(doctor × consult-type) persistence | Per-doctor only (P3-DL-4). | Rides V3-Q1's seed |
| Sub-tabs **within** a tab (the reserved `tabs` slot on Subjective/Objective) | Contract only (`tabs: undefined`). | Future plan |
| Side-sheets / floating panels / Cmd+K (`aux-surfaces.ts`) | Type contracts only. | Future plan |
| Preset save/manage **UI** in the palette | Preset data valid (P3-DL-7); no picker UI. | Post-v3 batch |
| **Deleting** `templates.tsx` / `InvestigationsAutoMerge` / `middle-bottom` | Left in place for the legacy fallback (P5-DL-3). | **cv3x-03** |
| Any restyle, new pane, or behaviour change to a pane body | None — port by reference (P5-DL-2). | — |

---

## Cross-cutting acceptance gate (whole batch) — ✅ all green 2026-05-31

All green before Phase 5 closes and the soak begins. Gate artifact: [`PARITY-MATRIX-cv3t-03.md`](./PARITY-MATRIX-cv3t-03.md).

### Canvas is buildable (cv3t-01 + cv3t-02 · the headline fix)
- [x] ✅ The v3 palette lists the **eight real tabs** (Snapshot, History, Consult, Assessment, Investigations, Plan, Subjective, Objective) — never the column wrappers.
- [x] ✅ Adding **any** tab from the palette (or blank-seed → add) mounts that tab's **real content**, not a blank pane.
- [x] ✅ No `left-column` / `middle-column` / `right-column` / `middle-bottom` id appears anywhere in the v3 paneTree, palette, or persisted layout (guarded by `assertFlatLeafRegistry`).
- [x] ✅ Reset → blank still works; empty-state renders when no tab is visible.

### Prescribe / send unbroken (cv3t-01 · P5-DL-2)
- [x] ✅ Build an Rx in the v3 Plan tab; "Send Rx & finish" runs the **identical** send pipeline as before — verified after a drag-reshape too (anchored docks hold, v3-DL-6).
- [x] ✅ **No** double or missing safety banners, Dx/DDx, or send buttons (every lifted prop transplanted verbatim; exactly one safety strip + one send footer when built up).
- [x] ✅ Autosave persists on the same debounce/keys; no double-save, no lost edit on remount.

### Tabs are independent entities (cv3t-01 · P5-DL-4)
- [x] ✅ Investigations is a standalone tab; editing it and editing Plan's investigations write the **same** `investigationsOrders` field (no split).
- [x] ✅ The Consult tab is labeled **"Consult"** (live; modality icon) and **"Visit summary"** (review; check icon); its id stays `body`; it is **not draggable while the consult is live** (the `body`-during-`live` guard, v3-DL-6).

### Parity re-proven + safe fallback (cv3t-03 · P5-DL-5 / P0-DL-1)
- [x] ✅ The cv3x-01 safety-critical matrix is **re-run against the flat-tab structure** (open patient × every consult type · prescribe + send · autosave · finish / no-show / review · the three mount surfaces · keyboard nav · **and the blank → build-up path**) and recorded; every cell green.
- [x] ✅ Send / autosave / finish suites green with v3 active.
- [x] ✅ Flag-off / kill-switch-on → legacy `PatientProfileShell` still byte-identical (P0-DL-1 holds until cv3x-03).
- [x] ✅ `cd frontend; npx tsc --noEmit` clean; `npm run lint` clean; v3 + surviving suites green (45 suites · 345 passed).

---

## Phase plan position

This is **Phase 5 of the Cockpit v3 program — a corrective/extension phase inserted into the cutover.** The ladder:

| Phase | Scope | Status |
|---|---|---|
| Phase 0 | Scaffold: flag + parallel mount + foundation boundary | ✅ Shipped (cv3s-01..02) |
| Phase 1 | Core shell: editor-group renderer + pane palette (R-SHELL3, R-PALETTE) | ✅ Shipped (cv3c-01..04) |
| Phase 2 | Interaction: Cursor-style always-on drag/drop (R-DND3) | ✅ Shipped (cv3d-01..04) |
| Phase 3 | Safety + platform: anchored chrome, persistence reuse, mobile (R-CHROME3, R-PERSIST3, R-MOBILE3) | ✅ Shipped (cv3p-01..04) |
| Phase 4 | Cutover: parity matrix ✅ + flag flip ✅ · delete + docs ⏳ (R-CUTOVER) | ◐ Partial (cv3x-01/02 done; cv3x-03/04 gated on the soak) |
| **Phase 5** | **Tab model: flatten columns → tabs, fix build-up canvas, decouple Plan/Investigations (v3-DL-2 / v3-DL-5)** | ✅ Shipped (cv3t-01..03; parity re-proven [`PARITY-MATRIX-cv3t-03.md`](./PARITY-MATRIX-cv3t-03.md)) |

Phase 5 is closed and parity re-proven on the buildable flat-tab canvas (2026-05-31). Phase 4's tail now runs: the ~1-week soak → cv3x-03 (delete old shell + the now-dead glue) → cv3x-04 → `COCKPIT.md` flips to v3.

---

## Cost estimate

| Wave | Tasks | Sonnet 4.6 | Composer 2 | Opus 4.7 | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | cv3t-01 (flat registry) → cv3t-02 (palette/seed fix) | 1/2 | 0/2 | 1/2 | ~4–6h |
| Wave 2 | cv3t-03 (integration + parity re-verify + gate) | 0/1 | 0/1 | 1/1 | ~3–4h |
| **Total** | **3** | **1** | **0** | **2** | **~7–10h agent-time** |

Two Opus tasks = the batch cap ([`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) §8): **cv3t-01** (structural keystone that re-mounts the prescribe surface — the lifted-props verbatim hazard) and **cv3t-03** (re-proving the parity close-gate over consult-critical paths). They sit in different waves (≤1 Opus/wave). cv3t-02 (point palette + `blankLayout` at the flat tabs + a regression test) is a bounded, well-spec'd change → Sonnet.

---

## Sequencing notes (the why behind the waves)

- **Wave 1 is single-lane sequential: cv3t-01 → cv3t-02.** The palette/seed fix (cv3t-02) needs the flat registry (cv3t-01) to point at — there is no honest second lane. Per [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) §7, structural work biases toward sequential.
- **Wave 1 → Wave 2 is a kind-of-work cut (build → verify).** cv3t-01/02 build the flat model; cv3t-03 is pure verification + the parity record. Different reviewer mindset, different failure mode.
- **No new wall-clock pause inside Phase 5.** The ~1-week soak is Phase 4's (`p4-cutover`), and it now runs **after** cv3t-03 — Phase 5 itself is continuous agent-time.

---

## References

- **Source:** [`Product plans/plan-cockpit-v3.md`](../../../../../Product%20plans/plan-cockpit-v3.md) — v3-DL-2, v3-DL-5, R-PALETTE, R-SHELL3, V3-Q1.
- **The defect surface:**
  - [`frontend/lib/patient-profile/v3/blankLayout.ts`](../../../../../../../frontend/lib/patient-profile/v3/blankLayout.ts) — seeds top-level ids only.
  - [`frontend/components/patient-profile/v3/CockpitPalette.tsx`](../../../../../../../frontend/components/patient-profile/v3/CockpitPalette.tsx) — lists top-level panes only.
  - [`frontend/lib/patient-profile/templates.tsx`](../../../../../../../frontend/lib/patient-profile/templates.tsx) — the nested column template (`render: () => null` wrappers) handed to v3.
  - [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx) — the `cockpitV3Enabled()` mount branch + the shared `RxFormProvider` / `RxSafetyProvider` (above the shell).
- **The bodies ported by reference (unchanged):** [`RxPane.tsx`](../../../../../../../frontend/components/patient-profile/panes/RxPane.tsx) · [`InvestigationsPane.tsx`](../../../../../../../frontend/components/patient-profile/panes/InvestigationsPane.tsx) · [`SnapshotPane`/`HistoryPane`/`SubjectivePane`/`ObjectivePane`](../../../../../../../frontend/components/patient-profile/panes/) · [`BodyZone`/`EndedConsultBody`/`AssessmentStrip`](../../../../../../../frontend/components/cockpit/middle/).
- **The coupling removed from the v3 path:** [`InvestigationsAutoMerge.tsx`](../../../../../../../frontend/components/cockpit/middle/InvestigationsAutoMerge.tsx) (stays for legacy; dies in cv3x-03).
- **Phase 4 (this re-sequences its tail):** [`p4-cutover/plan-p4-cockpit-v3-cutover-batch.md`](../p4-cutover/plan-p4-cockpit-v3-cutover-batch.md) · [`PARITY-MATRIX-cv3x-01.md`](../p4-cutover/PARITY-MATRIX-cv3x-01.md) · [`task-cv3x-03-delete-old-shell.md`](../p4-cutover/Tasks/task-cv3x-03-delete-old-shell.md).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`TASK_MANAGEMENT_GUIDE.md`](../../../../../process/TASK_MANAGEMENT_GUIDE.md) · [`TASK_TEMPLATE.md`](../../../../../process/TASK_TEMPLATE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).
- Sibling: [`Tasks/EXECUTION-ORDER-p5-cockpit-v3-tab-model.md`](./Tasks/EXECUTION-ORDER-p5-cockpit-v3-tab-model.md).

---

**Created:** 2026-05-31.  
**Status:** ✅ `Shipped` (2026-05-31) — Phase 5 of the v3 program; all three cv3t tasks + the cross-cutting gate green. Parity re-proven on the flat-tab canvas: [`PARITY-MATRIX-cv3t-03.md`](./PARITY-MATRIX-cv3t-03.md).  
**Closes:** ✅ closed — the Phase 4 soak now runs on the buildable v3, then cv3x-03 → cv3x-04 finish the program.  
**Next phase:** none new — Phase 5 hands back to Phase 4's tail (soak → cv3x-03 → cv3x-04). Deferred fast-follows (V3-Q1 seed, per-consult-type persistence, preset CRUD UI, sub-tabs) promote as fresh post-v3 batches when prioritised.
