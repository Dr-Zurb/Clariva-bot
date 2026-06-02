# Cockpit polish — strips + visual system — 26 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR: **zero Opus tasks** — visual polish, tokens, and small wiring. Seven Auto + one Composer 2 Fast close-out.
>
> **Source of issues:** dogfood review on 2026-05-26 (issues #13-22 from the [day README crosswalk](../README.md#issue-to-batch-crosswalk)).
>
> **Predecessor batches:**
> - `cmr-01` shipped `<AssessmentStrip>`; cpv-01 polishes its zero-state.
> - `csf-03` + `rxss-*` shipped `<SaveStatusPill>`; cpv-02 polishes the idle copy.
> - `chp-01` shipped `<VitalsGrid>` chip-grid; cpv-03 adds the BMI badge.
> - `chp-02` shipped the General/Systemic examination split; cpv-04 polishes the visibility of the two textareas.
> - `cockpit-ribbon` + `csf-02` shipped column headers; cpv-05 unifies treatment.
> - `cockpit-plan-pane-deduplication` (today) **must ship first** so cpv's visual work targets the post-dedup UI.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-cockpit-polish-visual.md`](./Tasks/EXECUTION-ORDER-cockpit-polish-visual.md).

---

## Why this batch

Ten visual / polish issues consolidated into one batch (issues #13-22):

13. **AssessmentStrip too tall + empty during `waiting` state.** When no Dx is entered and the visit is in `waiting` state, the strip renders at full height with empty inner regions — looks broken.
14. **SaveStatusPill renders as `"—"` when idle.** Doctors don't know if autosave is on, off, or just hasn't fired. Copy is silent on the meaning of the dash.
15. **VitalsGrid lacks BMI badge.** Height + weight are both entered, but BMI is computed nowhere visible. R-HISTORY chp-01 specified a BMI badge that hasn't shipped.
16. **Examination General/Systemic split is not visually obvious.** chp-02 added two textareas (General, Systemic) but they look like one labelless textarea pair. Doctors fill the wrong one.
17. **Column header treatment ad-hoc.** Left column uses one header style (sticky border-bottom), middle column another (no border), right column a third (border-top-only). Three styles per row of panes; the eye doesn't pattern-match.
18. **Ad-hoc badge/button colors.** Yellow safety pill, blue indicators, green CTA, red destructive — but none of them use the design tokens. Future re-theming requires touching ~30 hex literals.
19. **Patient meta row separators inconsistent.** PatientRibbon shows name · age · sex · phone separated by dots; treating · safety · token shows with vertical bars. Mixed separators read as different sections, but they're meant to be one ribbon.
20. **Top-bar search bar takes ~30% of width even when collapsible.** Header search input is full-width on desktop ≥1366px even though the cockpit-shell doesn't need it that wide. A collapsed icon + popover would free real estate for the breadcrumb / patient name.
21. **Lucide icon mismatch on Investigations vs Snapshot.** Two different lab/test icons used; one is `Beaker`, one is `FlaskConical`. Inconsistent across the same cockpit surface.
22. **Problem-list text overflows the pane.** Long problem strings don't wrap or truncate; they push the pane horizontally and break the column.

These ten polish issues don't share a single architectural cause but they share a single fix family: design-system discipline. The batch is structured to bundle each polish item into a focused task, with a "visual system audit" task (cpv-06) that consolidates the token + color work and a "misc nits" task (cpv-07) that batches the truly trivial ones.

**Visible artifact at the close-gate:** the cockpit's visual system looks unified — column headers match, badge/button colors are tokenized, AssessmentStrip + SaveStatusPill have clear copy in every state, BMI badge appears in VitalsGrid, General/Systemic split is visually distinct, problem-list text wraps, header search collapses below ~1280px, all chart-rail icons match.

This batch closes the ten visual issues with **8 tasks across 4 waves**, **~6-8h wall-clock single-engineer (~1 dev-day)**, **zero new migrations**, **zero Opus tasks**.

---

## Decision lock (frozen for batch duration)

**DL-1: AssessmentStrip zero-state shows a single-line muted hint.** When `state === "waiting"` AND no Dx is entered, the strip collapses to `~24px` height with the copy `"Diagnosis appears here once the doctor enters one"` in muted text. When `state` transitions to `"live"` or Dx is entered, the strip expands to its full height per cmr-01. No additional padding when collapsed.

**DL-2: SaveStatusPill idle copy is `"Autosaving"`.** When `state === "idle"` AND no change has been made, copy reads `"Autosaving"` with a small ✓ icon (Lucide `CheckCircle2` muted). When dirty: `"Saving…"` with a spinner. When saved: `"Saved"` with ✓. When error: `"Save failed — retry"` with a red icon. The dash `"—"` is removed entirely.

**DL-3: BMI badge is computed in `<VitalsGrid>` from `height_cm` + `weight_kg` fields and rendered inline next to the weight chip.** Format: `"BMI 22.5"` with a category color (underweight blue / normal green / overweight yellow / obese red). Tooltip shows category name + the WHO classification. Computed only when both fields are non-null; absent otherwise.

**DL-4: Examination General/Systemic visual treatment.** Each textarea gets a `<label>` ("General Examination" / "Systemic Examination") above it with a small Lucide icon (User / Stethoscope). The two textareas share a single bordered container with a divider between them. Visual goal: two clearly distinct fields, not a single text-area-pair.

**DL-5: Column header treatment.** Single source of truth — `<PaneHeader>` already exists. All three columns route their header through `<PaneHeader>`. Style: `border-b border-border bg-card text-sm font-semibold px-3 py-2`. Inconsistent inline header markup in any pane (`<div>` ad-hoc) is replaced.

**DL-6: Design tokens — semantic color audit.** Identify all hex literals in cockpit components (use grep). Replace with semantic Tailwind tokens (`bg-warning`, `bg-destructive`, `text-success`, etc.) from the existing `tailwind.config.ts` token set. Where a token doesn't exist, add one (max 3 new tokens). Audit scope: `frontend/components/cockpit/**`, `frontend/components/patient-profile/**`. NOT scope: `frontend/components/consultation/**` (that's text/voice chat surfaces; out of cockpit polish).

**DL-7: Patient meta row separators are all `·` (middle dot).** PatientRibbon's vertical-bar separators (`|`) are replaced with `·`. The ribbon reads as one row, not three sections. Separator color is `text-muted-foreground/40`.

**DL-8: Search collapse threshold is `< 1280px`.** Header search input collapses to a search icon + click-to-open popover below 1280px width. At ≥1280px, expanded inline input. Implementation uses container query or CSS media query — pick the existing pattern in the codebase.

**DL-9: Lucide icon mapping for chart-rail / middle panes.** Single source-of-truth lookup table in `frontend/lib/patient-profile/pane-icons.ts` (new, ~20 LOC). Maps `paneId → LucideIcon`. Both Investigations + Lab-related panes use `Beaker`. Snapshot uses `Heart`. History uses `Clock`. Plan uses `Pill`. Subjective uses `MessageSquare`. Objective uses `Activity`. Templates.tsx imports from this single source.

**DL-10: Problem-list text wrapping.** Each problem row gets `break-words` + `min-w-0` Tailwind classes; the pane body gets `overflow-x-hidden`. Long problem strings wrap onto multiple lines within the pane bounds. No truncation (doctors need to read full problems); no horizontal scroll.

**DL-11: Telemetry — single event `cockpit_polish.visual_system_landed`** fires once per session on first cockpit mount post-batch. Payload: `{ appointmentId, batch: "cpv" }`. Marks rollout coverage.

**DL-12: No backend / no migrations.** Pure CSS + JSX + Lucide swaps.

---

## Phases

### Wave 1 — Strip + pill copy (2 tasks, ~1.5h, single sequential lane)

- [`task-cpv-01-assessment-strip-zero-state.md`](./Tasks/task-cpv-01-assessment-strip-zero-state.md) — **S, Auto** — Modify `<AssessmentStrip>` to render the DL-1 muted hint when `state === "waiting"` AND no Dx is entered. Collapses to ~24px when in zero-state; expands to full height when Dx populates. Tests in `__tests__/AssessmentStrip.test.tsx` (mod, ~30 LOC).
- [`task-cpv-02-save-status-pill-copy.md`](./Tasks/task-cpv-02-save-status-pill-copy.md) — **XS, Auto** — Modify `<SaveStatusPill>` to render the DL-2 copy in each of 4 states (idle / dirty / saved / error). Replace "—" with "Autosaving". Tests in `__tests__/SaveStatusPill.test.tsx` (mod or new, ~40 LOC).

### Wave 2 — BMI + examination split (2 tasks, ~2h, two parallel lanes)

- [`task-cpv-03-bmi-badge-in-vitals-grid.md`](./Tasks/task-cpv-03-bmi-badge-in-vitals-grid.md) — **S, Auto** — Compute BMI in `<VitalsGrid>` from `height_cm` + `weight_kg` and render a `<BmiBadge>` per DL-3 (new sub-component or inline; ~30 LOC). Tests in `__tests__/VitalsGrid.test.tsx` (mod, ~40 LOC). Lane α.
- [`task-cpv-04-examination-split-visibility.md`](./Tasks/task-cpv-04-examination-split-visibility.md) — **XS, Auto** — Modify `<ObjectiveSection>` (which owns the General/Systemic textareas post-chp-02) to render labels + icons + divider per DL-4. Tests in `__tests__/ObjectiveSection.test.tsx` (mod, ~30 LOC). Lane β.

### Wave 3 — Visual system (3 tasks, ~3h, sequential)

cpv-05 (column headers) must ship first because cpv-06 (token audit) might touch the same files. cpv-06 + cpv-07 can be parallel after cpv-05.

- [`task-cpv-05-column-header-unification.md`](./Tasks/task-cpv-05-column-header-unification.md) — **S, Auto** — Audit + route all column headers through `<PaneHeader>` per DL-5. Replace ad-hoc inline header markup. Tests in `__tests__/PaneHeader.test.tsx` (mod, ~20 LOC).
- [`task-cpv-06-color-token-audit.md`](./Tasks/task-cpv-06-color-token-audit.md) — **M, Auto** — Grep for hex literals in cockpit + patient-profile components. Replace with semantic tokens per DL-6. Add up to 3 new tokens in `tailwind.config.ts` if needed. Touch up PatientRibbon separators per DL-7. Tests rely on visual regression (no new unit tests; existing tests must pass).
- [`task-cpv-07-misc-nits.md`](./Tasks/task-cpv-07-misc-nits.md) — **S, Auto** — Header search collapse (DL-8), pane-icon source of truth (DL-9), problem-list wrap (DL-10). Three small changes bundled. Tests for each touched file (mod, ~50 LOC total).

### Wave 4 — Verification + close-out (1 task, ~30min)

- [`task-cpv-08-verification-and-close-out.md`](./Tasks/task-cpv-08-verification-and-close-out.md) — **XS, Composer 2 Fast** — Cross-cutting smoke matrix. Telemetry wire. COCKPIT.md update. Capture-inbox.

---

## Cross-cutting acceptance gate (whole batch)

### Behavior

- [x] AssessmentStrip in `waiting` + no-Dx state renders ~24px tall with muted hint copy.
- [x] SaveStatusPill never shows "—"; shows one of 4 copy states with appropriate icon.
- [x] VitalsGrid shows BMI badge when both height + weight are set; absent otherwise.
- [x] ObjectiveSection's General + Systemic textareas have visible labels + icons + divider.
- [x] All three column headers use `<PaneHeader>`; visual style is identical.
- [x] No hex literals remain in cockpit components — `rg "#[0-9a-fA-F]{3,6}" frontend/components/cockpit/` returns zero results (or only documented exceptions).
- [x] PatientRibbon separators are all `·`.
- [x] Header search collapses to icon below 1280px.
- [x] Pane icons match across all cockpit surfaces (single source of truth).
- [x] Problem-list text wraps; no horizontal scroll.

### Quality

- [x] `pnpm --filter frontend tsc --noEmit` clean.
- [x] `pnpm --filter frontend lint` clean.
- [x] `pnpm --filter frontend test` clean.
- [x] Visual regression: full cockpit screenshot at 1366×768 + 1920×1080 + 1280×800 — matches the DL-locked treatment.
- [x] Telemetry — `cockpit_polish.visual_system_landed` fires once per session.

### Documentation

- [x] `docs/Reference/product/cockpit/COCKPIT.md` updated — visual-system section added; lift table unchanged; pane-icon source documented.
- [x] `plan-cockpit-v2-execution-roadmap.md` § Changelog — new line.
- [x] `docs/Work/capture/inbox.md` has 3-4 new lines (follow-ups).

---

## Out-of-scope (rolled forward)

| Item | Where it lands |
|---|---|
| **Animated transitions on AssessmentStrip expand/collapse** | Capture-inbox — minor; nice-to-have. |
| **BMI trend chart in VitalsGrid** | Capture-inbox — bigger feature; needs historical data pull. |
| **Full dark-mode audit** | Capture-inbox — tokens cleanup unlocks this but the audit itself is its own batch. |
| **Replacing remaining ad-hoc badges in non-cockpit surfaces (consult chat / patient-profile sub-pages)** | Out of scope — this batch is cockpit-only. |
| **Search bar full re-design (with command palette overlap)** | Owned by rx-polish-shortcuts cmdk work; cpv-07 only handles the collapse threshold. |

---

## Cost estimate

| Wave | Tasks | Auto | Composer 2 | Opus | Wall-clock |
|---|---|---|---|---|---|
| 1 | cpv-01, cpv-02 | 2 | 0 | 0 | ~1.5h (single lane sequential) |
| 2 | cpv-03, cpv-04 | 2 | 0 | 0 | ~2h (2 parallel lanes; ~1h wall-clock) |
| 3 | cpv-05, cpv-06, cpv-07 | 3 | 0 | 0 | ~3h (cpv-05 syncs cpv-06 + cpv-07 in 2 parallel lanes; ~2h wall-clock if parallel) |
| 4 | cpv-08 | 0 | 1 | 0 | ~30min |
| **Total** | **8** | **7** | **1** | **0** | **~6-8h (~1 dev-day)** |

---

## References

- Source list: [day README crosswalk](../README.md#issue-to-batch-crosswalk).
- AssessmentStrip: [`frontend/components/cockpit/middle/AssessmentStrip.tsx`](../../../../../frontend/components/cockpit/middle/AssessmentStrip.tsx).
- SaveStatusPill: [`frontend/components/cockpit/rx/SaveStatusPill.tsx`](../../../../../frontend/components/cockpit/rx/SaveStatusPill.tsx).
- VitalsGrid: [`frontend/components/cockpit/rx/inputs/VitalsGrid.tsx`](../../../../../frontend/components/cockpit/rx/inputs/VitalsGrid.tsx).
- ObjectiveSection: [`frontend/components/cockpit/rx/sections/ObjectiveSection.tsx`](../../../../../frontend/components/cockpit/rx/sections/ObjectiveSection.tsx).
- PaneHeader: [`frontend/components/patient-profile/PaneHeader.tsx`](../../../../../frontend/components/patient-profile/PaneHeader.tsx).
- PatientRibbon: [`frontend/components/patient-profile/PatientRibbon.tsx`](../../../../../frontend/components/patient-profile/PatientRibbon.tsx).
- Tailwind config: [`frontend/tailwind.config.ts`](../../../../../frontend/tailwind.config.ts).
- Cost-aware model strategy: [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
- Wave / lane / shape rules: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../process/EXECUTION-ORDER-GUIDELINES.md).
