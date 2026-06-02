# Cockpit nav clarity — 26 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR: **zero Opus tasks** — every change is a label/conditional-render touch with a clear DL. Three Auto + one Composer 2 Fast + one Composer 2 Fast close-out.
>
> **Source of issues:** dogfood review on 2026-05-26 (issues #6-9 from the [day README crosswalk](../README.md#issue-to-batch-crosswalk)).
>
> **Predecessor batches:**
> - `cockpit-plan-pane-deduplication` (today, ppd-01 must ship before `cnc-01` touches `RxWorkspace.tsx`) — same-file change region differs but cnc-01 modifies the chip-strip block while ppd-01 modifies the prop surface. Merge-safe but execute after ppd-01 lands.
> - `cmr-06` — wired the `<RxSectionNav>` strip into `RxWorkspace.tsx`. cnc-01 gates this strip on cockpit-mode so it doesn't stack on top of the column-level template tab nav.
> - `cmi-01/02` — shipped `<InvestigationsPane>` + `<InvestigationsChipRow>` but with no empty-state handling for "no orders yet". cnc-03 adds the empty-state.
> - `cockpit-ribbon` — shipped `<PatientRibbon>` with safety + treating indicators icon-only. cnc-04 adds labels / tooltips.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-cockpit-nav-clarity.md`](./Tasks/EXECUTION-ORDER-cockpit-nav-clarity.md).

---

## Why this batch

Four label / structural-clarity issues from the dogfood review:

1. **Right column header reads "Notes" but renders SOAP documentation.** `templates.tsx` `makeRightColumn` sets `title: 'Notes'` on the `right-column` group (line 225). The children are Subjective + Objective — both SOAP sections, not "notes" in the doctor-vernacular sense. Doctors who scan the column header get the wrong mental model. Fix: rename to **"Chart Notes"** (matches the right-column's actual purpose: notes captured during the visit, organized by SOAP section) OR drop the group-level header entirely (the leaves already have their own titles).
2. **`<RxSectionNav>` chip strip stacks below template-tab nav.** The Plan pane has the pane-level tab strip (Plan / Investigations) AND the `<RxSectionNav>` chip strip (Symptoms / Diagnosis / Investigations / Medicines / Notes). Two layers of navigation for the same Plan area; the chip strip is redundant in cockpit mode because (a) Symptoms + Diagnosis + Notes content is now in the right column post-ppd-02, (b) Investigations is a sibling pane via `cmi-01`, (c) only Medicines is left in the Plan column, which doesn't need its own jump-to-chip. Fix: hide `<RxSectionNav>` when `cockpitMode === true` (new prop).
3. **Investigations pane header with empty body.** `<InvestigationsPane>` renders a header + `<InvestigationsChipRow>` body, but when no orders exist, the body shows nothing — just empty white space below the header. Doctors don't know if the pane is broken or just empty. Fix: empty-state placeholder with an "Add investigation" CTA.
4. **Header safety + treating indicators are mystery icons.** `<PatientRibbon>` shows a shield/badge icon for safety status and an icon for "treating: --" placeholder. Both lack `aria-label`s, tooltips, or visible labels. Doctors hover and get nothing; non-clinical staff have no idea what the icons mean. Fix: add `aria-label`s + `<Tooltip>` wrappers + fallback text for empty values (`"Treating: not assigned"` instead of `"Treating: --"`).

These four are visible in the cockpit's nav surfaces — every doctor session sees them on first load. None require backend changes; all are conditional renders + labels.

**Visible artifact at the close-gate:** right column header reads "Chart Notes"; cockpit Plan pane no longer shows the chip strip; Investigations pane shows "No tests ordered yet · [Add test]" when empty; hovering any header icon shows a labelled tooltip; screen-reader users hear meaningful labels.

This batch closes the four label issues with **5 tasks across 3 waves**, **~3-4h wall-clock single-engineer (~0.5 dev-day)**, **zero new migrations**, **zero Opus tasks**.

---

## Decision lock (frozen for batch duration)

**DL-1: Right-column header label is `"Chart Notes"`.** Single string change in `templates.tsx` `makeRightColumn`. Considered alternatives: "Documentation" (too formal), "Notes" (current — ambiguous), "Subjective+Objective" (too literal). "Chart Notes" matches `<HistoryPane>`-adjacent vocabulary and reads clearly in 5-char-wide truncated columns. Confirmed by single dogfood session before lock.

**DL-2: `<RxSectionNav>` is gated by a new `cockpitMode?: boolean` prop on `<RxWorkspace>`.** Defaults to `false` for non-cockpit mounts. Cockpit shell (`templates.tsx makeMiddleBottomRow` → `<RxPane>` → `<RxWorkspace cockpitMode={true}>`) sets it to `true`. When `cockpitMode === true`, `<RxSectionNav>` does NOT render. The five sections in the chip strip are now navigated via: Symptoms/Diagnosis/Notes — right column; Investigations — sibling pane via cmi-01; Medicines — only thing left in Plan column, no chip needed.

**DL-3: `<RxPane>` accepts `cockpitMode?: boolean` and forwards to `<RxWorkspace>`.** Same prop-drill pattern as `dxLifted` / `subjectiveLifted`. The prop is one bool, but is semantically distinct from `subjectiveLifted` — cockpitMode controls navigation chrome; subjectiveLifted controls content sections. Keep them separate (DL-1 of ppd is "no mega-flag").

**DL-4: Investigations empty-state copy is `"No tests ordered yet"` + secondary `[+ Add test]` button.** Copy matches the cmi-01 plan's wording. Button opens the `<AddInvestigationDialog>` that cmi-01 ships (or, if it doesn't ship, fall back to the existing investigations input flow — verified during ppd-03 sibling task in cmi-01's plan doc).

**DL-5: Empty-state visibility rule:** show empty-state when `state !== "terminal"` AND `investigationsCount === 0` AND `prescription?.investigations === ""`. Three signals to avoid false-positive empty-state during loading. The hook `useInvestigationsCount` (existing from cmi-01) drives the count.

**DL-6: PatientRibbon safety indicator gets `aria-label="Safety status — review required"`** (or "no concerns" depending on state) plus a Radix `<Tooltip>` with descriptive copy. Visible-text fallback shows "Safety" on hover focus for keyboard users. The icon stays — only labels are added.

**DL-7: PatientRibbon treating indicator displays `"Treating: not assigned"`** when the field is null. When set, displays `"Treating: Dr. {name}"`. The "--" placeholder is fully removed. Tooltip explains: "The doctor currently assigned to manage this patient's care."

**DL-8: Telemetry — single event `cockpit_polish.nav_clarity_landed`** fires once per session on first cockpit mount post-batch. Payload: `{ appointmentId, cockpitMode: true, rxSectionNavHidden: true, rightColumnTitle: "Chart Notes" }`. Verifies rollout coverage.

**DL-9: Non-cockpit parity preserved.** `<RxWorkspace>` mounted outside the cockpit shell (does that exist? — Yes: appointment-detail "Quick Rx" surface MAY use it; check before commit) keeps `<RxSectionNav>` visible. The `cockpitMode` default `false` guarantees this. Same for the right-column title — that's the cockpit shell's concern, not a non-cockpit one.

**DL-10: Investigations empty-state does NOT render when `state === "terminal"`** — terminal appointments (no-show, cancelled) have no investigations to order, and the "Add test" CTA would be misleading. Empty-pane in terminal state renders the existing `<InvestigationsPane>` terminal-state copy ("Pane not available for cancelled appointments") consistent with `<RxWorkspace>`'s pattern.

---

## Phases

### Wave 1 — Cockpit-mode prop scaffolding (1 task, ~30min-1h)

- [`task-cnc-01-cockpit-mode-prop.md`](./Tasks/task-cnc-01-cockpit-mode-prop.md) — **S, Auto** — Add `cockpitMode?: boolean` to `RxWorkspaceProps` + `RxPaneProps`. Forward through the chain. Inside `<RxWorkspace>`, gate the `<RxSectionNav>` JSX block on `!cockpitMode`. Wire `cockpitMode={true}` in `templates.tsx` `makeMiddleBottomRow`. Tests in `RxWorkspace.test.tsx` (mod, ~30 LOC) verify the gate.

### Wave 2 — Empty-states + labels (3 tasks, ~2h, three parallel lanes)

Wave 2 has three independent lanes — disjoint files, no cross-lane reads.

- [`task-cnc-02-right-column-title.md`](./Tasks/task-cnc-02-right-column-title.md) — **XS, Composer 2 Fast** — Single string change in `templates.tsx` `makeRightColumn`: `title: 'Notes'` → `title: 'Chart Notes'`. Test in templates' existing test verifies the title. Capture-inbox if dogfooding wants further refinement. **Lane α — docs/**.
- [`task-cnc-03-investigations-empty-state.md`](./Tasks/task-cnc-03-investigations-empty-state.md) — **S, Auto** — Modify `frontend/components/patient-profile/panes/InvestigationsPane.tsx` to render empty-state copy per DL-4 + DL-5. Wire `[+ Add test]` button onClick to the existing `<AddInvestigationDialog>` open handler (or the equivalent from cmi-01). Tests in `__tests__/InvestigationsPane.test.tsx` (mod or new, ~50 LOC). **Lane β — frontend/**.
- [`task-cnc-04-patient-ribbon-labels.md`](./Tasks/task-cnc-04-patient-ribbon-labels.md) — **S, Auto** — Modify `frontend/components/patient-profile/PatientRibbon.tsx` to add `aria-label` + `<Tooltip>` wrappers on safety + treating indicators per DL-6 + DL-7. Replace `"--"` placeholder with explicit "not assigned" fallback. Tests in `__tests__/PatientRibbon.test.tsx` (mod or new, ~50 LOC). **Lane γ — frontend/**.

### Wave 3 — Verification + close-out (1 task, ~30min)

- [`task-cnc-05-verification-and-close-out.md`](./Tasks/task-cnc-05-verification-and-close-out.md) — **XS, Composer 2 Fast** — Cross-cutting smoke matrix. Telemetry wire. COCKPIT.md update. Capture-inbox.

---

## Cross-cutting acceptance gate (whole batch)

### Structural

- [x] `<RxWorkspace>` accepts `cockpitMode?: boolean`; defaults `false`.
- [x] `<RxPane>` accepts + forwards `cockpitMode`.
- [x] `templates.tsx` `makeMiddleBottomRow` sets `cockpitMode={true}` on the Plan `<RxPane>`.
- [x] `templates.tsx` `makeRightColumn` title is `"Chart Notes"`.

### Behavior

- [x] Cockpit Plan pane does NOT render `<RxSectionNav>`.
- [x] Non-cockpit Plan mounts still render `<RxSectionNav>` (parity preserved).
- [x] Right column header reads "Chart Notes" in all four template modalities (video/voice/text/review).
- [x] `<InvestigationsPane>` shows "No tests ordered yet · [+ Add test]" when empty and `state !== "terminal"`.
- [x] `<InvestigationsPane>` terminal state copy unchanged.
- [x] `<PatientRibbon>` safety indicator has `aria-label` + tooltip.
- [x] `<PatientRibbon>` treating indicator shows "Treating: not assigned" when empty; "Treating: Dr. {name}" when set.

### Quality

- [x] `pnpm --filter frontend tsc --noEmit` clean.
- [x] `pnpm --filter frontend lint` clean.
- [x] `pnpm --filter frontend test` clean.
- [x] Screen-reader test: hovering safety + treating indicators announces labels.
- [x] Visual regression: 1366×768 cockpit view — chip strip absent in Plan column; right column header reads "Chart Notes"; Investigations pane shows empty-state CTA.
- [x] Telemetry — `cockpit_polish.nav_clarity_landed` fires once per session.

### Documentation

- [x] `docs/Reference/product/cockpit/COCKPIT.md` updated — right-column rename + chip-strip gate documented.
- [x] `plan-cockpit-v2-execution-roadmap.md` § Changelog — new line.
- [x] `docs/Work/capture/inbox.md` has 2-3 new lines (follow-ups).

---

## Out-of-scope (rolled forward)

| Item | Where it lands |
|---|---|
| **Re-introducing `<RxSectionNav>` as a collapsible utility for power users** | Capture-inbox if dogfood requests; not in v1. |
| **Building the full `<AddInvestigationDialog>` if it doesn't exist** | Owned by cmi-01 / cmi-02; cnc-03 reuses or falls back to existing input flow. |
| **Custom safety severity copy** (e.g. "2 allergies + 1 DDI") | Capture-inbox — would need to read `<RxSafetyContext>`; bigger change. |
| **Treating-doctor picker** (clicking the indicator opens an assign-flow) | Capture-inbox for a future "patient-assignment" feature. |

---

## Cost estimate

| Wave | Tasks | Auto | Composer 2 | Opus | Wall-clock |
|---|---|---|---|---|---|
| 1 | cnc-01 | 1 | 0 | 0 | ~30min-1h |
| 2 | cnc-02, cnc-03, cnc-04 | 2 | 1 | 0 | ~2h (3 parallel lanes; ~45min-1h wall-clock if truly parallel) |
| 3 | cnc-05 | 0 | 1 | 0 | ~30min |
| **Total** | **5** | **3** | **2** | **0** | **~3-4h (~0.5 dev-day)** |

---

## References

- Source list: [day README crosswalk](../README.md#issue-to-batch-crosswalk).
- Existing chip strip: [`frontend/components/consultation/cockpit/RxSectionNav.tsx`](../../../../../frontend/components/consultation/cockpit/RxSectionNav.tsx).
- Right column factory: [`frontend/lib/patient-profile/templates.tsx`](../../../../../frontend/lib/patient-profile/templates.tsx) `makeRightColumn`.
- Empty-state precedent: cmi-01 plan + cmi-02 task (investigations chip row).
- Ribbon: [`frontend/components/patient-profile/PatientRibbon.tsx`](../../../../../frontend/components/patient-profile/PatientRibbon.tsx).
- Cost-aware model strategy: [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
- Wave / lane / shape rules: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../process/EXECUTION-ORDER-GUIDELINES.md).
