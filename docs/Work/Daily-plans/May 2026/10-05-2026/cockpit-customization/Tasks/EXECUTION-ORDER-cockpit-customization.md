# Cockpit customization — execution order

> Sibling document of [`plan-cockpit-customization-batch.md`](../plan-cockpit-customization-batch.md). The plan covers *what* and *why*; this doc covers *who-runs-what-when* and *which model*.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (5 phases, up to 2 lanes per phase)

```
Wave 1 (Phase A — ~30min, 1 lane):
  Lane α  ──── cc-01 (XS, Sonnet 4.6)

Wave 2 (Phase B — ~3h, 1 lane sequential):
  Lane α  ──── cc-02 (S, Sonnet 4.6) ──> cc-03 (S, Sonnet 4.6)

Wave 3 (Phase C — ~6h, 1 lane sequential):
  Lane δ  ──── cc-04 (L, Opus 4.7) ──> cc-05 (S, Sonnet 4.6)
                                  ──> cc-06 (S, Sonnet 4.6)
                                  ──> cc-07 (M, Sonnet 4.6)

Wave 4 (Phase D — ~6h, 2 lanes parallel after cc-08):
  Lane α  ──── cc-08 (XS, Sonnet 4.6) ──> cc-09 (S, Sonnet 4.6)        [backend]
  Lane β  ──── (waits on cc-08) ──> cc-10 (M, Sonnet 4.6) ──> cc-11 (XS, Sonnet 4.6)  [frontend]

Wave 5 (Phase E — ~3h, 2 lanes parallel):
  Lane α  ──── cc-12 (S, Sonnet 4.6) ──> cc-13 (M, Sonnet 4.6)
  Lane β  ──── (waits on cc-12) ──> cc-14 (S, Sonnet 4.6)
```

**Total wall-clock with 2 chats running in parallel where possible:** ~13 hours.
**Total agent-time (sequential equivalent):** ~21 hours.

The bottleneck is Wave 3 — single-lane sequential because cc-04's slot-state primitive is the dependency root for everything else in that phase. Waves 4 and 5 parallelize cleanly once their first task is in place.

---

## Lane-by-lane details

### Wave 1 — Phase A: Polish (Sonnet 4.6)

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | [cc-01](./task-cc-01-drop-duplicate-patient-chart-heading.md) | XS | `frontend/components/ehr/PatientChartPanel.tsx`, `frontend/components/ehr/AppointmentChartRail.tsx` | Gate the `<h2>Patient chart</h2>` block on `layout !== "desktop"`. One-line conditional. |

**Branch suggestion:** `fix/cc-drop-duplicate-chart-heading`. Single PR.

---

### Wave 2 — Phase B: Uniform column headers (Sonnet 4.6)

Sequential because cc-03 mounts the component cc-02 introduces.

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | [cc-02](./task-cc-02-cockpit-column-header-component.md) | S | `frontend/components/ehr/AppointmentChartRail.tsx` (the cs-05 in-flow header pattern), `frontend/components/consultation/cockpit/CockpitHeader.tsx` (style precedent) | Extract the chart-rail's in-flow header into a new `<CockpitColumnHeader>` component with `<title>`, `<actions>` slots. Refactor `<AppointmentChartRail>` to use it. |
| 1 | [cc-03](./task-cc-03-mount-headers-on-body-and-rx.md) | S | `frontend/components/consultation/ConsultationCockpit.tsx` (the desktop branch's panel children), `frontend/components/consultation/cockpit/RxWorkspace.tsx` (read-only — confirm it doesn't already render its own heading) | Mount `<CockpitColumnHeader>` on the body column (label "Consultation") and the Rx column (label "Prescription"). Hosted in `<ConsultationCockpit>`'s panel children, not deep inside the column components. |

**Branch suggestion:** `feature/cc-uniform-column-headers`. Single PR for both steps.

---

### Wave 3 — Phase C: Slot-state + reorder (sequential single lane δ)

The structural rewrite. Cannot be parallelized — every step builds on cc-04.

| Step | Task | Size | Model | Notes |
|---|---|---|---|---|
| 0 | [cc-04](./task-cc-04-cockpit-layout-slot-state.md) | **L** | Opus 4.7 Thinking-XHigh | Introduce `cockpit-layout` state (slots / widths / collapsed). Refactor `<ConsultationCockpit>`'s hardcoded chart/body/Rx panel JSX into an `Array.map` over `slots`. **Pre-load aggressively** — see cc-04's `Pre-load list` section. **Estimated turns:** 5–8. The blast radius is comparable to cs-07. |
| 1 | [cc-05](./task-cc-05-slot-based-collapsibility.md) | S | Sonnet 4.6 | Apply CC-D2: middle slot → `collapsible={false}`; side slots → `collapsible={true}`. Update the `[` / `]` hotkey wiring to target slot positions, not column types. |
| 2 | [cc-06](./task-cc-06-layout-dropdown-menu.md) | S | Sonnet 4.6 | "Layout" `<DropdownMenu>` in `<CockpitHeader>`. Items: 3 built-in presets, 6 column-order permutations, divider, custom-presets section (filled by cc-10). |
| 3 | [cc-07](./task-cc-07-drag-to-reorder-columns.md) | M | Sonnet 4.6 | Add `@dnd-kit/core` dep. Drag handle (`⋮⋮`) on each `<CockpitColumnHeader>`. Drop one onto another → swap their slots. Activation distance = 8px to avoid click-vs-drag confusion. |

**Branch suggestion:** `feature/cc-slot-state-and-reorder`. **Single PR** — the four steps produce a layout that's only sensible together.

**Pre-merge gate after cc-07:** the cross-cutting acceptance gate from `plan-cockpit-customization-batch.md § Cross-cutting acceptance gate (whole batch)` items 3–6 must pass. Wave 4 + 5 work both depend on the slot-state primitive being solid; don't ship them on top of a flaky cc-04.

---

### Wave 4 — Phase D: Layout presets (2 parallel lanes after cc-08)

cc-08 is the synchronization point. Once the migration shape is locked, lanes α + β run in parallel.

#### Lane α: Backend (Sonnet 4.6)

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | [cc-08](./task-cc-08-presets-migration.md) | XS | `backend/migrations/098_doctor_patient_flow_advance.sql` (the most recent migration — next slot is 099), `backend/migrations/035_service_offerings_json.sql` (style precedent for a JSONB column with a CHECK constraint on shape) | Migration `099_doctor_cockpit_layout_presets.sql`. Adds `cockpit_layout_presets JSONB NOT NULL DEFAULT '[]'`. CHECK constraint enforces 5-preset hard cap. |
| 1 | [cc-09](./task-cc-09-presets-backend-service-endpoints.md) | S | `backend/src/services/doctor-settings-service.ts` (style precedent), `backend/src/routes/api/v1/settings/doctor.ts` (route registration), `backend/src/utils/db-helpers.ts` (`validateOwnership`, `handleSupabaseError`) | Backend service + endpoints (`GET / PUT / DELETE /v1/settings/doctor/cockpit-presets`). Auth-scoped, per-call ownership-validated. Soft 5-cap defended at the DB level via the CHECK constraint; the endpoint surfaces a clean 400 instead of a Postgres CHECK violation. |

**Branch suggestion:** `feature/cc-presets-backend`. PR can merge independently of Lane β as long as the migration runs first on dev / staging / prod.

#### Lane β: Frontend (Sonnet 4.6)

Waits on Lane α / cc-08 (so the migration shape and JSONB row schema are locked).

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | [cc-10](./task-cc-10-presets-frontend-hook-and-ui.md) | M | `frontend/components/consultation/cockpit/CockpitHeader.tsx` (cc-06 dropdown), `frontend/lib/api.ts` (request helper pattern), the cc-04 `cockpit-layout` shape | `usePresets()` hook (load on mount, refetch after save). Render built-in + custom presets in the cc-06 dropdown. "Save current layout..." dialog (name input + soft-cap eviction confirm). "Manage presets" modal (rename / delete). |
| 1 | [cc-11](./task-cc-11-presets-built-in-hotkeys.md) | XS | `frontend/hooks/useCockpitHotkeys.ts` (extend the existing hook) | Add `Cmd/Ctrl+Shift+1/2/3` → apply built-in preset. No hotkey for custom presets (CC-D5). |

**Branch suggestion:** `feature/cc-presets-frontend`. Can start drafting / typing once cc-08's spec is reviewed; merge after cc-09 lands so the API actually works.

---

### Wave 5 — Phase E: Collapsed-stub redesign (2 parallel lanes after cc-12)

cc-12 is the synchronization point. Once the renderer-prop refactor lands, the two concrete renderers parallelize.

#### Lane α: Refactor + chart renderer (Sonnet 4.6)

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | [cc-12](./task-cc-12-rail-collapsed-stub-renderer-refactor.md) | S | `frontend/components/consultation/cockpit/RailCollapsedStub.tsx`, `frontend/components/consultation/ConsultationCockpit.tsx` (where `collapsedSize={5}` lives) | Refactor `<RailCollapsedStub>` to take a `renderer` prop. Bump `collapsedSize` from 5 → 7 in `<ConsultationCockpit>`. Keep a default renderer for backwards compat. |
| 1 | [cc-13](./task-cc-13-collapsed-chart-section-icons.md) | M | `frontend/components/ehr/PatientChartPanel.tsx` (the section structure — sections need stable `id` anchors), `lucide-react` icon set | `CollapsedChartRail` renderer: vertical stack of section-icon buttons. Each click expands the rail AND scrolls to that section. Adds stable `id` anchors to PatientChartPanel sections in the same task. |

**Branch suggestion:** `feature/cc-collapsed-rail-chart`. Merges before Lane β unless Lane β is willing to coordinate.

#### Lane β: Rx renderer (Sonnet 4.6)

Waits on Lane α / cc-12 (renderer prop must exist).

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | [cc-14](./task-cc-14-collapsed-rx-peek-strip.md) | S | `frontend/components/consultation/cockpit/RxWorkspace.tsx` (the form state), the cc-12 renderer prop signature | `CollapsedRxRail` renderer: peek-text strip ("3 medicines · 1 test · diagnosis: pending"). Reads `RxWorkspace` form state — already in scope. Click anywhere expands. |

**Branch suggestion:** `feature/cc-collapsed-rail-rx`. Can be drafted in parallel with cc-13; merges after cc-12.

---

## Per-task model picks

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Task | Size | Recommended model | Why |
|---|---|---|---|
| cc-01 | XS | Sonnet 4.6 Medium | One-line conditional render. |
| cc-02 | S | Sonnet 4.6 Medium | Component extraction; existing pattern (cs-05 header) is the template. |
| cc-03 | S | Sonnet 4.6 Medium | Mount the new component on two columns. |
| **cc-04** | **L** | **Opus 4.7 Thinking-XHigh** | **Structural slot-state refactor across `<ConsultationCockpit>`, the cockpit-layout primitive, and the persistence layer. Six permutations, slot-vs-column dispatch, backwards-compat with cs-08's saved layouts. High judgment cost.** |
| cc-05 | S | Sonnet 4.6 Medium | Conditional `collapsible` prop based on slot index. |
| cc-06 | S | Sonnet 4.6 Medium | shadcn `<DropdownMenu>` with itemized presets + permutations. |
| cc-07 | M | Sonnet 4.6 Medium | New `@dnd-kit/core` dep + drag-handle wrapper around the existing column header. |
| cc-08 | XS | Sonnet 4.6 Medium | Single SQL migration. JSONB column + CHECK constraint. |
| cc-09 | S | Sonnet 4.6 Medium | Backend service + 3 routes. Pattern matches existing `doctor-settings-service.ts`. |
| cc-10 | M | Sonnet 4.6 Medium | Hook + dropdown menu items + 2 dialogs / modals. Frontend mostly. |
| cc-11 | XS | Sonnet 4.6 Medium | Extend `useCockpitHotkeys` with 3 new bindings. |
| cc-12 | S | Sonnet 4.6 Medium | Component refactor — props change, internal logic mostly unchanged. |
| cc-13 | M | Sonnet 4.6 Medium | New renderer + section anchors + `scrollIntoView` wiring. |
| cc-14 | S | Sonnet 4.6 Medium | New renderer reading existing form state. |

---

## Acceptance gates per phase

### Phase A gate (after Wave 1)

- [ ] `pnpm tsc --noEmit` clean.
- [ ] Visual smoke test: open `/dashboard/appointments/[id]` for an appointment in `ready` state. Confirm "Patient chart" appears exactly once at the top of the chart rail.

### Phase B gate (after Wave 2, before Wave 3 starts)

- [ ] All three desktop columns show a header strip with consistent styling.
- [ ] Chart-rail header still has the collapse chevron at the right end.
- [ ] Body header reads "Consultation"; Rx header reads "Prescription".
- [ ] No regression on cc-01.

### Phase C gate (after Wave 3, before Wave 4 / Wave 5 starts)

- [ ] `<ConsultationCockpit>` renders columns from `cockpit-layout.slots` — verify by mocking different slot orders and confirming each renders correctly.
- [ ] All six permutations work via the Layout dropdown.
- [ ] Drag-to-reorder swaps two columns by drag-and-drop on their headers.
- [ ] Slot-based collapsibility holds: middle column never collapses; side columns collapse via `[` / `]` and via the in-header chevron.
- [ ] Built-in preset hotkeys are NOT yet wired (those land in cc-11). Manually triggering a built-in preset via the menu in cc-06 works.
- [ ] No regression on yesterday's `cs-NN` tests.

### Phase D gate (after Wave 4)

- [ ] Migration `099_doctor_cockpit_layout_presets.sql` applies cleanly on dev DB. Rollback rehearsed.
- [ ] `GET /v1/settings/doctor/cockpit-presets` returns `[]` for a new doctor; `PUT` saves and returns the saved row; `DELETE` removes it. All scoped to the calling doctor.
- [ ] Custom presets persist across browsers (save on Firefox → reload Chrome → preset shows up).
- [ ] Saving a 6th custom preset prompts the eviction confirm; cancelling does not save; confirming evicts the oldest.
- [ ] `Cmd/Ctrl+Shift+1/2/3` apply Triage / Consult / Document.

### Phase E gate (after Wave 5, before merge)

- [ ] All Phase A/B/C/D gates still green.
- [ ] Collapsed chart rail shows section icons; clicking each expands the rail AND scrolls to that section.
- [ ] Collapsed Rx rail shows live peek text; clicking anywhere expands.
- [ ] No regression on the `cs-NN` or `cc-NN` tests.

---

## Cost estimate

Expected model-mix per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Wave | Tasks | Sonnet 4.6 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|
| Wave 1 | cc-01 | 1 | 0 | ~30min |
| Wave 2 | cc-02, 03 | 1 (stitched) | 0 | ~3h |
| Wave 3 | cc-04, 05, 06, 07 | 3 | 1 (long) | ~6h |
| Wave 4 | cc-08, 09, 10, 11 | 3 | 0 | ~6h (2 lanes) |
| Wave 5 | cc-12, 13, 14 | 2 | 0 | ~3h (2 lanes) |

---

## References

- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules and chat heuristics
- Style precedent: [`cockpit-shell-redesign/Tasks/EXECUTION-ORDER-cockpit-shell-redesign.md`](../../../09-05-2026/cockpit-shell-redesign/Tasks/EXECUTION-ORDER-cockpit-shell-redesign.md) — sibling exec-order doc from yesterday
- Cross-day:
  - [Daily-plans/May 2026/09-05-2026/cockpit-shell-redesign/Tasks/task-cs-08-resizable-panels-wiring.md](../../../09-05-2026/cockpit-shell-redesign/Tasks/task-cs-08-resizable-panels-wiring.md) — the panel-API wiring this batch builds on.
  - [Daily-plans/May 2026/06-05-2026/Tasks/task-cockpit-2-shell.md](../../../06-05-2026/Tasks/task-cockpit-2-shell.md) — the original cockpit shell.
