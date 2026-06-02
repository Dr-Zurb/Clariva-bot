# Cockpit shell flip — Phase 2 foothold — 19 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR rule #1: **plan with Opus, execute with Auto, polish with Composer**. This batch has **zero Opus tasks** — none of the six tasks are on the hard-rules list (no PHI columns added, no RLS redesign, no novel security, no new primitive). Four tasks are Auto; two are Composer 2 Fast (csf-05 the URL kill-switch, csf-06 the verification + close-out).
>
> **Source plan:** [`Product plans/plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md). Phase 2 of the source plan covers **R-MOD + R-CHART + R-RIBBON + R-MIDDLE + R-HISTORY** (~14–17 dev-days). This batch is a deliberate **partial scope of Phase 2** — the smallest possible increment that flips the production appointment-detail mount from the legacy 3-pane chart/body/rx layout to the 8-pane Telemed-Video tree, using existing components wired into existing leaves. The five Phase 2 R-items proper (full modality auto-switch, Snapshot/History split, patient ribbon, middle-column rebuild, right-column rebuild) all promote to follow-up batches per the source plan's `Out-of-scope` table. csf-06 captures them in `docs/Work/capture/inbox.md`.
>
> **Predecessor batches:**
> - [Daily-plans/May 2026/17-05-2026/cockpit-v2](../../17-05-2026/cockpit-v2/) — the foundation this batch flips into production. **Must be merged before csf-01 starts.** Specifically: cv2-01 (recursive shell + `PaneDefinition.children`), cv2-02 (layout-tree v3→v4), cv2-03 (the `TELEMED_VIDEO_TEMPLATE` literal + `<PanePlaceholder>` component this batch refactors), cv2-05 (`<RxFormContext>` + `<RxFormProvider>` — the provider this batch hoists), cv2-06 (the four section components — `<SubjectiveSection>` etc. — that this batch mounts in their own panes), cv2-07 (the SOAP fields UI now rendered across panes), cv2-09 (the Cmd+K placeholder, unchanged).
> - [Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild](../../13-05-2026/patient-profile-shell-rebuild/) — the `<PatientProfileShell>` + `PaneDefinition` contract (ppr-03) the recursive shell extends. The 3-pane `builtInPanes` array in `PatientProfilePage.tsx` ships from ppr-07; this batch retires it as the production default.
> - [Daily-plans/May 2026/10-05-2026/cockpit-customization](../../10-05-2026/cockpit-customization/) — the preset / layout-presets backend (`doctor_cockpit_layout_presets` table from cc-08, the `usePatientProfilePresets` hook from cc-10). Doctors with saved presets continue to apply them via `<CockpitHeader>`'s preset dropdown after this batch flips. Phase 2's full R-LAYOUT-UX (per-modality presets, save layout, template hotkeys) is out of scope and lands in a follow-up batch.
> - [backend/migrations/](../../../../../backend/migrations/) — **no new migrations** in this batch. Migration 103 from cv2-04 is the last PHI-touching schema change; csf-01..csf-06 add no columns, no tables, no policies.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-cockpit-shell-flip.md`](./Tasks/EXECUTION-ORDER-cockpit-shell-flip.md).

---

## Why this batch

The cockpit-v2 Phase 1 batch (17-05-2026) closed cleanly per [`cv2-08-verification-report.md`](../../17-05-2026/cockpit-v2/Tasks/cv2-08-verification-report.md). Every Phase-1 deliverable shipped: the recursive `<PatientProfileShell>` walks `PaneDefinition.children`, the layout-tree migration covers v3→v4, the `<RxFormProvider>` + four-section composition root replaces the monolithic `PrescriptionForm.tsx` body, the SOAP fields UI persists round-trip, the Cmd+K placeholder binds, the auxiliary surface contracts compile.

But the **user-facing artifact** of cockpit-v2 — the 8-pane structure that the source plan describes as *the* reason to do the rebuild — is invisible to doctors today. The smoke-test route at `/dashboard/appointments/[id]/v2-tree` was deliberately deleted in cv2-08. The production appointment-detail mount at `/dashboard/appointments/[id]` still renders the legacy 3-pane chart/body/rx layout (`builtInPanes` in `PatientProfilePage.tsx` — see lines 292–358). Doctors opening any patient see exactly what they saw before cockpit-v2 shipped, modulo the new SOAP fields inside the right column's prescription form.

The reason this didn't ship in Phase 1 was the source plan's correct decision to gate the production cutover behind the Phase 2 content rebuild — R-CHART splits the chart pane into Snapshot + History, R-RIBBON adds the always-visible patient strip, R-MIDDLE rebuilds the Body/Assessment/Investigations/Plan zones, R-HISTORY rebuilds Subjective + Objective. Together those R-items take ~14 dev-days. The Phase 1 plan promised that "Phase 2 (R-MOD + R-CHART + R-RIBBON + R-MIDDLE + R-HISTORY) — to be scheduled separately" would flip `/v2-tree` into the production default.

This batch reads that promise differently. The **flip itself** can ship in ~5 dev-days if we accept that the four leaves whose content lives in components that already exist (Snapshot ← `<PatientChartPane>`, Body ← `<ConsultationBodyPane>`, Plan ← `<RxPane>`, Subjective + Objective ← `<SubjectiveSection>` + `<ObjectiveSection>` from cv2-06) can mount their existing content immediately, and the two leaves whose content extraction is genuinely new work (History ← R-CHART; Investigations ← R-MIDDLE bottom-left) can keep `<PanePlaceholder>` for now. The user gets the 8-pane layout in production this week; the deferred R-items layer in over the following weeks without blocking the visible flip.

The architectural blocker that made this look more expensive than it is: `<RxFormProvider>` is mounted **inside** `PrescriptionForm.tsx` (line 263). So sibling panes of the Plan pane can't call `useRxForm()` — Subjective and Objective leaves have no provider to subscribe to. csf-01 lifts the provider above the shell in `PatientProfilePage.tsx`, with a self-mount fallback inside `PrescriptionForm.tsx` so the in-call mini-panel and post-call summary mounts (which render `PrescriptionForm` standalone, not under `PatientProfilePage`) keep working. After csf-01 ships, all four section components can mount in any pane while sharing one provider, one autosave timer, and one source of truth.

This batch closes the partial-Phase-2-scope with **6 tasks across 4 waves**, **~5 dev-days wall-clock single-engineer**, **zero new migrations**, and **zero Opus tasks** (the cheapest cockpit-v2-aligned batch in the Phase-2 chain). The visible artifact at the close-gate is `/dashboard/appointments/[id]` rendering the 8-pane Telemed-Video layout with five leaves of real content + two `<PanePlaceholder>` leaves whose deferred extractions are tagged with their owning R-item. A `?v1=1` URL kill-switch matches the ppr / cv2 strangler-fig pattern; doctors who hit a regression can revert to the legacy 3-pane layout for a 4-week window before Phase 3 deletes the fallback.

---

## Decision lock (frozen for batch duration)

These match the planning conversation locked 2026-05-19. Re-opening any of them belongs in a new batch.

**DL-1: Strangler Fig — flip in place, kill-switch via URL.** The new 8-pane default ships at `/dashboard/appointments/[id]` (the existing route). The legacy 3-pane layout is reachable via `/dashboard/appointments/[id]?v1=1` for a 4-week soak window. After 4 weeks of zero rollback traffic the kill-switch + the `legacyBuiltInPanes` array delete in a Phase 3 close-out task (captured in `docs/Work/capture/inbox.md` by csf-06). This is the same cutover model used by ppr-14 and the cv2-08 Phase 1 close-out.

**DL-2: Five leaves get real content; two stay as placeholders.** The Telemed-Video layout has 8 leaves. This batch wires 5 of them to existing components (Snapshot, Body, Plan, Subjective, Objective) and keeps 2 as `<PanePlaceholder>` (History, Investigations). The placeholder leaves are tagged with the owning R-item (`R-CHART` and `R-MIDDLE` respectively). The Assessment "sticky strip" from the source plan layout sketch is NOT a leaf in this batch — its inputs (working diagnosis + DDx chips) continue to render inside the Plan leaf via the existing `PrescriptionFormCompositionRoot`. The R-MIDDLE follow-up batch lifts Assessment into a true sticky strip above the bottom row.

**DL-3: One `<RxFormProvider>` per page, hoisted above the shell.** The provider mounts inside `PatientProfilePage.tsx` wrapping `<PatientProfileShell>` (csf-01). `PrescriptionForm.tsx` keeps a self-mount fallback (mounts its own provider when no parent provider exists) so the in-call mini-panel and post-call summary mounts continue to work standalone. The autosave timer remains a single instance per draft row (verified by the cross-cutting acceptance gate). Three mount surfaces (DL-30 from cv2) preserved.

**DL-4: Telemed-Video is the only template.** Modality auto-switch (`telemed-voice`, `telemed-text`, `review` templates per source plan §"Modality template overrides") promotes to the R-MOD-full follow-up batch. This batch ships only `getTelemedVideoTemplate(ctx)` as the single template factory. Voice and text consults render the same 8-pane layout as video consults; the R-MOD-full batch ships `mapStateToTemplate(state, modality)` and the doctor-settings override (`cockpit_template_override`) on a new `doctor_settings` column.

**DL-5: Walk-in stays on the legacy fallback.** When `appointment.patient_id == null` (walk-in slot, no chart pane), `<PatientProfilePage>` keeps the existing 2-pane horizontal layout (body + rx). The Telemed-Video template assumes a chart pane and a known patient; walk-in's "in-clinic" template is a Phase 2 follow-up (named `templates-in-clinic` in the source plan's R-MOD scope). Showing a placeholder Snapshot / History / Subjective / Objective for an anonymous patient is worse UX than the existing 2-pane fallback, so we keep the fallback active until R-MOD-full ships the in-clinic variant.

**DL-6: No new migrations.** The cv2-04 migration (103) was the last PHI-touching schema change for the cockpit-v2 chain. csf-01..csf-06 add no columns, no tables, no policies. The doctor-settings `cockpit_template_override` column promotes to the R-MOD-full batch with the auto-switch logic.

**DL-7: No new Opus tasks.** Per the AGENT-EXECUTION-EFFICIENCY-GUIDE hard-rules list, Opus is reserved for L-size structural refactors, PHI-touching migrations, and RLS redesigns. None of those apply to csf-01..csf-06. csf-01 (provider lift) is the closest call, but `<RxFormProvider>` already exposes the value-prop shape needed; the lift is a hoist not a redesign. Per-message escalation to Opus on csf-01 only if Auto stalls on the provider-aware fallback pattern.

**DL-8: Storage namespace migration is silent.** csf-04 changes the localStorage key from `patient-profile:v1:layout` (post-cv2 flat-tree shape) to `patient-profile:v2:telemed-video-layout`. The old key is left in place; the new key starts empty. On first mount the shell's existing seed loader (cv2-02's `readLegacyLayoutOnce`) reads the v3/v4 layout if it exists and translates the column widths into the new tree's outer-horizontal sizes. Doctors with saved presets (cc-08 / cc-10) keep their presets; the preset apply path runs through `<CockpitHeader>` unchanged.

---

## Phases

### Wave 1 — Provider lift + factory refactor (2 tasks, ~3h, single sequential lane)

The dependency cliff per [EXECUTION-ORDER-GUIDELINES § 0.5 Cut 1](../../../../process/EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves). csf-01 hoists `<RxFormProvider>` above the shell; csf-02 converts the templates literal to a factory. Both unlock csf-03 (the content wiring) and csf-04 (the production cutover) in subsequent waves.

- [`task-csf-01-rxform-provider-lift.md`](./Tasks/task-csf-01-rxform-provider-lift.md) — **S, Auto** — Hoist `<RxFormProvider>` from inside `PrescriptionForm.tsx` to wrap `<PatientProfileShell>` inside `PatientProfilePage.tsx`. PrescriptionForm becomes provider-aware: a small `useExistingRxFormProviderOrMount` helper checks for a parent context; when present, PrescriptionForm subscribes; when absent, PrescriptionForm self-mounts a provider (preserves the in-call mini-panel and post-call summary standalone mounts). Three mount surfaces preserved (DL-30 from cv2). One autosave timer per draft row enforced by construction (the lifted provider IS the only provider when mounted under `PatientProfilePage`; PrescriptionForm sees the parent and skips its own mount).

- [`task-csf-02-templates-factory-refactor.md`](./Tasks/task-csf-02-templates-factory-refactor.md) — **S, Auto** — Convert `export const TELEMED_VIDEO_TEMPLATE: PaneDefinition[]` to `export function getTelemedVideoTemplate(ctx: TelemedVideoContext): PaneDefinition[]`. Add `TelemedVideoContext` type carrying the appointment, token, derived cockpit state, launcher ref, hideHeader flag, and the four event handlers (`onRxSent`, `onMarkNoShow`, `onFinishVisit`, `onMedicineCountChange`) plus `finishBusy` boolean. Leaves still render `<PanePlaceholder>` in this task — content injection is csf-03's job. Pure refactor: render the factory output with a fixture context and assert the leaf-id list and tree depth match the pre-refactor literal byte-for-byte.

### Wave 2 — Wire real content into leaves (1 task, ~5h, single sequential lane)

Cut 2 (artifact change) per [EXECUTION-ORDER-GUIDELINES § 0.5](../../../../process/EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves). End of Wave 1: factory returns placeholders. End of Wave 2: factory returns five leaves with real content + two leaves with tagged `<PanePlaceholder>`.

- [`task-csf-03-wire-real-content-into-leaves.md`](./Tasks/task-csf-03-wire-real-content-into-leaves.md) — **M, Auto** — Wire content per leaf inside `getTelemedVideoTemplate(ctx)`:

  | Leaf id | Render | Component |
  |---|---|---|
  | `snapshot` | Real content | `<PatientChartPane appointment token hideHeader />` (existing component from `frontend/components/patient-profile/panes/`) |
  | `history` | Placeholder | `<PanePlaceholder title="History" icon={Clock} futureRItem="R-CHART (Snapshot/History split deferred)" />` |
  | `body` | Real content | `<ConsultationBodyPane state appointment token launcherRef onRxSent onMarkNoShow hideHeader />` (existing) |
  | `investigations-orders` | Placeholder | `<PanePlaceholder title="Investigations" icon={Beaker} futureRItem="R-MIDDLE (Investigations extraction deferred)" />` |
  | `plan` | Real content | `<RxPane appointment token state onRxSent onFinishVisit onMedicineCountChange hideHeader />` (existing) |
  | `subjective` | Real content | New `<SubjectivePane>` (~25 LOC) wrapping `<SubjectiveSection heading={null} />` (existing from cv2-06) |
  | `objective` | Real content | New `<ObjectivePane>` (~25 LOC) wrapping `<ObjectiveSection heading={null} />` (existing from cv2-06) |

  The two new wrapper components (`SubjectivePane.tsx`, `ObjectivePane.tsx`) live in `frontend/components/patient-profile/panes/`. Each is a thin scrollable container around its corresponding section. Both rely on the lifted `<RxFormProvider>` from csf-01.

### Wave 3 — Production cutover + kill-switch (2 tasks, ~3h, single sequential lane)

Cut 2 (artifact change again — the user-visible default flips) per [EXECUTION-ORDER-GUIDELINES § 0.5](../../../../process/EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves). End of Wave 2: the factory returns the wired tree but no production page consumes it. End of Wave 3: `/dashboard/appointments/[id]` defaults to the 8-pane layout; `?v1=1` reverts.

- [`task-csf-04-production-cutover.md`](./Tasks/task-csf-04-production-cutover.md) — **S, Auto** — In `PatientProfilePage.tsx`, replace `builtInPanes` with `useTelemedVideoTemplate(ctx)` (a `useMemo` around `getTelemedVideoTemplate(ctx)`). Rename the existing `builtInPanes` to `legacyBuiltInPanes` and keep it in the file for the kill-switch (csf-05 short-circuits to it). Walk-in branch (`!showChart`) keeps `legacyBuiltInPanes.filter(p => p.id !== 'chart')` as the 2-pane horizontal fallback (DL-5). `defaultLeafPaneOrder`, `toggleBarPanes`, the seed effect — all already use cv2-02's `flattenPaneDefinitions` and walk the tree without changes. Storage namespace bumps to `patient-profile:v2:telemed-video-layout`.

- [`task-csf-05-v1-kill-switch.md`](./Tasks/task-csf-05-v1-kill-switch.md) — **XS, Composer 2 Fast** — `frontend/app/dashboard/appointments/[id]/page.tsx` (Server Component) reads `searchParams.v1`; when `=== '1'`, passes `legacyShape={true}` to `<PatientProfilePage>`. Inside the component, `legacyShape === true` short-circuits the factory hook and mounts `legacyBuiltInPanes` instead. 4-week soak window matches ppr-14's pattern. Append a one-line follow-up to `docs/Work/capture/inbox.md` for "Phase 3: delete `legacyBuiltInPanes` + `?v1=1` reader after 4-week soak (promoted from csf-05, 2026-05-19)."

### Wave 4 — Verification + close-out (1 task, ~2h, single sequential lane)

Cut 3 (kind-of-work change — Build → QA) per [EXECUTION-ORDER-GUIDELINES § 0.5](../../../../process/EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves). Wave 4 = pure manual smoke + doc updates + telemetry + capture-inbox lines for the deferred R-items.

- [`task-csf-06-verification-and-close-out.md`](./Tasks/task-csf-06-verification-and-close-out.md) — **XS, Composer 2 Fast** — Run the 4-flow smoke matrix on the production appointment-detail page: empty appointment, autosave + reload, full Send Rx, modality-state transitions (`waiting` → `live` → `wrap_up`). Verify the kill-switch round-trip (`?v1=1` reverts to legacy; removing the param restores 8-pane). Verify walk-in fallback (anonymous slot keeps 2-pane horizontal). tsc + lint + build sweep. Update `docs/Reference/product/cockpit/COCKPIT.md` with the new production tree-mount diagram. Append "Status (post-csf-06)" section to the cockpit-v2 batch plan linking this batch as Phase 2 foothold. Telemetry `cockpit_v2.phase2_shell_flipped` fires once on first appointment-detail mount post-flip. Capture five `docs/Work/capture/inbox.md` follow-ups (R-MOD-full / R-CHART / R-RIBBON / R-MIDDLE / R-HISTORY) with one-line summaries pointing at the source plan's R-item descriptions.

---

## Cross-cutting acceptance gate (whole batch)

These items must all be green before the batch is considered closed. They span waves and surface the batch-level invariants the per-wave gates can't individually verify.

### Structural

- [ ] **Production default flipped** — `/dashboard/appointments/[id]` (no query string) renders the 8-pane Telemed-Video layout. Doctors see Snapshot in the top of the left column; Body + Investigations placeholder + Plan in the middle column; Subjective + Objective in the right column. Drag handles work at every nesting level. Cascade handles respect each leaf's `minSizePct` + `minSizePx`.
- [ ] **Kill-switch works both ways** — `/dashboard/appointments/[id]?v1=1` renders the legacy 3-pane chart/body/rx layout. Removing `?v1=1` and refreshing returns to the 8-pane default. No console errors on either route.
- [ ] **Walk-in fallback preserved** — open an appointment with `patient_id = null` (walk-in slot); the 2-pane horizontal body/rx layout still renders. Telemed-Video template's chart pane is filtered out (the `legacyBuiltInPanes.filter(p => p.id !== 'chart')` path).
- [ ] **Storage namespace migration silent** — paste a pre-batch v3 / v4 payload into `localStorage` under the legacy key, mount the page, observe the new `patient-profile:v2:telemed-video-layout` key gets populated AND the v4 column widths translate into the new tree's outer-horizontal sizes (where the column count matches; new shell ignores it otherwise and uses defaults).
- [ ] **Mobile branch unchanged (DL-12 from cv2)** — `<lg` viewport renders the existing `MobilePillBar` flow. The 8-pane tree never reaches mobile.

### Form parity (the `<RxFormProvider>` lift sanity)

- [ ] **Single provider, single autosave timer** — open the appointment-detail page; React DevTools shows exactly one `<RxFormProvider>` in the tree (mounted by `PatientProfilePage`); fill CC in Subjective + a vital in Objective + a medicine in Plan; wait > 1.5s; saving indicator fires once; reload → all three fields persist.
- [ ] **Three mount surfaces (DL-30 from cv2) unchanged** — appointment-detail page renders 8-pane (post-flip), in-call mini-panel renders flat composition root (PrescriptionForm self-mounts a provider), post-call summary renders flat composition root (PrescriptionForm self-mounts a provider). All three round-trip the SOAP fields.
- [ ] **Section components mount in their target panes without errors** — Subjective and Objective leaves both call `useRxForm()` and read fields from the lifted provider. No "must be inside RxFormProvider" runtime error.

### Quality

- [ ] **`pnpm --filter frontend tsc --noEmit` clean.** `pnpm --filter frontend lint` clean. `pnpm --filter frontend build` succeeds. Bundle size for the appointment-detail route stays within ±5% of pre-batch (sanity check; not a blocker unless > 20%).
- [ ] **No new Sentry errors** in a 5-min manual smoke session opening / resizing / collapsing / reordering panes on the new default and on `?v1=1`.
- [ ] **Telemetry event** `cockpit_v2.phase2_shell_flipped` fires exactly once during csf-06's manual round-trip on the appointment-detail page.

### Documentation

- [ ] **`docs/Reference/product/cockpit/COCKPIT.md` updated** with the new production tree-mount diagram showing the 8 leaves, the lifted `<RxFormProvider>`, and the two `<PanePlaceholder>` deferrals tagged with their owning R-items.
- [ ] **Cockpit-v2 batch plan tagged** — append "Status (post-csf-06)" to `docs/Work/Daily-plans/May 2026/17-05-2026/cockpit-v2/plan-cockpit-v2-batch.md` linking this batch as the Phase 2 foothold.
- [ ] **Capture-inbox follow-ups** — five lines in `docs/Work/capture/inbox.md` for R-MOD-full, R-CHART, R-RIBBON, R-MIDDLE, R-HISTORY with one-line summaries and pointers at the source plan's R-item descriptions.

---

## Out-of-scope (rolled forward to follow-up batches)

These items appear in the source [`plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md) Phase 2 but are explicitly **not** delivered by this batch. Each gets a future batch named in the source plan's `Out-of-scope` table.

| Out-of-scope item | Source plan section | Where it lands |
|---|---|---|
| **Modality template chooser** (`telemed-voice`, `telemed-text`, `review` templates + `mapStateToTemplate` + doctor-settings override) | R-MOD | Follow-up batch — `templates-r-mod` |
| **Snapshot + History extraction** (split the chart pane into separate Snapshot and History components; History gets click-to-expand visit cards) | R-CHART | Follow-up batch — `cockpit-chart-extraction` |
| **Patient ribbon strip** (always-visible full-width strip above all panes; identity, allergies, chronic, treating Dx live mirror) | R-RIBBON | Follow-up batch — `cockpit-ribbon` |
| **Middle-column rebuild** (Body / Assessment sticky strip / Investigations zone / Plan zone with sticky safety + sticky action footer + narrow-monitor auto-merge) | R-MIDDLE | Follow-up batch (or split: `cockpit-middle-top` + `cockpit-middle-bottom`) |
| **Right-column rebuild** (Subjective / Objective with reserved tab slots, vitals chip-grid, exam textareas, test results) | R-HISTORY | Follow-up batch — `cockpit-history-pane` |
| **Rx polish + densification** (MedicineRow summary mode, drug-frequency ranking, row favorites, previous-Rx side sheet, keyboard shortcuts) | R-RX-POLISH | Phase 3 batch — `rx-polish-densification` |
| **Per-modality layout presets + save layout + template hotkeys** | R-LAYOUT-UX | Phase 3 batch — `cockpit-layout-presets-modality` |
| **Removing the `?v1=1` kill-switch + `legacyBuiltInPanes`** | "Decommission plan" in source plan | Phase 3 close-out — captured in `docs/Work/capture/inbox.md` by csf-05 |

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | csf-01, csf-02 | 2/2 | 0/2 | 0/2 | ~3h |
| Wave 2 | csf-03 | 1/1 | 0/1 | 0/1 | ~5h |
| Wave 3 | csf-04, csf-05 | 1/2 | 1/2 | 0/2 | ~3h |
| Wave 4 | csf-06 | 0/1 | 1/1 | 0/1 | ~2h |
| **Total** | **6** | **4** | **2** | **0** | **~13h (single-lane sequential everywhere)** |

Token estimate (rough): ~250k input / ~150k output across the batch. Zero Opus tasks (the cheapest cockpit-v2-aligned batch in the Phase-2 chain). Total batch spend (excluding optional close-gate review): ~$10–15.

**One optional Opus close-gate turn after csf-06** budgeted on top. Skip if every cross-cutting gate above passes cleanly.

---

## Sequencing notes (the why behind the waves)

The 4-wave shape falls out of the EXECUTION-ORDER-GUIDELINES §0.5 cuts:

- **Wave 1 → Wave 2 is a Cut 1 (dependency cliff).** Without csf-01's provider lift, Subjective and Objective leaves can't `useRxForm()` — they'd crash at runtime with "must be inside RxFormProvider". Without csf-02's factory refactor, csf-03 has nowhere to inject the appointment / token / state context the leaves need. Both are structural unlocks.
- **Wave 2 → Wave 3 is a Cut 2 (artifact change).** End of Wave 2: the factory returns a tree of real components but no production page consumes it. End of Wave 3: the production page renders the new tree. Two qualitatively different artifacts; reviewer mindset shifts.
- **Wave 3 → Wave 4 is a Cut 3 (kind-of-work change).** Wave 3 = Build (cutover code). Wave 4 = QA + Docs (smoke matrix, doc updates, telemetry, capture-inbox). Different mindset, different failure mode, deserves a separate gate.

Single-lane sequential is the right shape for every wave because the §5 lane gate fails for every potential split — every task in this batch consumes the previous task's output. Per [EXECUTION-ORDER-GUIDELINES §7](../../../../process/EXECUTION-ORDER-GUIDELINES.md#7-sequential-vs-parallel--bias-hard-toward-sequential), default-to-sequential bias applies.

The bottleneck is **Wave 2 (~5h, single-lane)** — csf-03 alone wires five content swaps across `templates.tsx` plus creates two new pane wrapper components. Splitting the wiring across two lanes (e.g., one lane for Snapshot/Body/Plan, another for Subjective/Objective) was considered and rejected because the file overlap is non-trivial and the lane-1h-floor (§5 point #6) would barely hold. Single-engineer execution runs Lane α through to completion in ~5h.

**Why no Shape B parallel lanes anywhere?** Every wave has either one task (Wave 2, Wave 4) or two tasks where the second consumes the first's output (Wave 1: csf-02 needs csf-01's provider hoist before it can refactor the templates factory to take a `ctx` carrying handlers from the lifted provider; Wave 3: csf-05's kill-switch short-circuits csf-04's factory hook). All correctly Shape A per the guidelines.

**Why zero Opus tasks in this batch?** Per the AGENT-EXECUTION-EFFICIENCY-GUIDE hard-rules list, Opus is reserved for L-size structural refactors (≥ 5 files), PHI-touching migrations, RLS redesigns, novel security surfaces, or new architectural primitives. None apply to this batch — every task either lifts an existing primitive (csf-01), refactors a literal into a factory (csf-02), wires existing components into existing leaves (csf-03), swaps a hook reference (csf-04), reads a query param (csf-05), or runs a manual matrix (csf-06). Per-message escalation to Opus on csf-01 only if Auto stalls on the provider-aware fallback pattern.

---

## References

- [Product plans/plan-cockpit-v2.md](../../../Product%20plans/plan-cockpit-v2.md) — source product plan with the full R-item / DL set across all three phases. This batch is a deliberate partial scope of Phase 2.
- [Daily-plans/May 2026/17-05-2026/cockpit-v2/](../../17-05-2026/cockpit-v2/) — Phase 1 of cockpit-v2; the foundation this batch flips into production. The cv2-08 verification report linked from there is the regression baseline.
- [Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild/](../../13-05-2026/patient-profile-shell-rebuild/) — the shell foundation (ppr-03's `<PatientProfileShell>` + `PaneDefinition` contract).
- [Daily-plans/May 2026/10-05-2026/cockpit-customization/](../../10-05-2026/cockpit-customization/) — the preset / layout-presets backend, untouched by this batch but consumed via `<CockpitHeader>`'s preset dropdown.
- [docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules; the hard-rules list (which this batch sits entirely below — no Opus tasks).
- [docs/Work/process/EXECUTION-ORDER-GUIDELINES.md](../../../../process/EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape rules used to draft the sibling EXECUTION-ORDER doc.
- Sibling: [`Tasks/EXECUTION-ORDER-cockpit-shell-flip.md`](./Tasks/EXECUTION-ORDER-cockpit-shell-flip.md) — wave / lane matrix + model picks + acceptance gates per wave + cost estimate.

