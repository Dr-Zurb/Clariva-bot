# Cockpit ribbon — R-RIBBON — 21 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR rule #1: **plan with Opus, execute with Auto, polish with Composer**. This batch has **zero Opus tasks** — none of the four tasks meet the hard-rules thresholds (no PHI columns added, no RLS redesign, no novel security, no new architectural primitive — the ribbon is a presentational component subscribing to existing data sources). Two tasks are Auto; two are Composer 2 Fast (crb-03 the production mount, crb-04 the verification close-out).
>
> **Source plan:** [`Product plans/plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md) §R-RIBBON (line ~311). R-RIBBON is one of five Phase-2 R-items deferred from the [`cockpit-shell-flip`](../../19-05-2026/cockpit-shell-flip/) batch and is the **second-priority** Phase-2 follow-up per the [execution roadmap](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md) §6.
>
> **Predecessor batches:**
> - [Daily-plans/May 2026/19-05-2026/cockpit-shell-flip](../../19-05-2026/cockpit-shell-flip/) — must be merged before crb-03 (Wave 3) ships. csf-01 lifts `<RxFormProvider>` to wrap `<PatientProfileShell>` inside `<PatientProfilePage>`; this batch's ribbon mounts INSIDE that lifted provider so it can subscribe to the live Dx field via `useRxForm()`.
> - [Daily-plans/May 2026/17-05-2026/cockpit-v2](../../17-05-2026/cockpit-v2/) — cv2-05 ships `RxFormContext` (the form state the ribbon subscribes to); cv2-06 ships `<AssessmentSection>` which already has the Dx input at `id="diagnosis"` (the focus target for the ribbon's `🎯` click handler). No changes to either; this batch reads them.
> - [Daily-plans/May 2026/20-05-2026/cockpit-chart-extraction](../../20-05-2026/cockpit-chart-extraction/) — disjoint conflict surface (`templates.tsx` only; this batch doesn't touch it). The two batches can ship in either order.
> - [backend/migrations/](../../../../../backend/migrations/) — **no new migrations**. Ribbon data composes existing `chart-context` + `appointment-detail` endpoints client-side.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-cockpit-ribbon.md`](./Tasks/EXECUTION-ORDER-cockpit-ribbon.md).

---

## Why this batch

The new 8-pane Telemed-Video layout (cockpit-shell-flip) is a structural win, but it loses one piece of context the legacy chart pane provided implicitly: **constant visibility of the patient's allergies and chronic conditions**. In the legacy layout the chart panel always showed allergies/chronic at the top of its scroll container; in the new layout doctors have to scan the Snapshot leaf in the left column, which competes for attention with the active video / voice / text feed in the middle column. Per the source plan: "Even more important in voice / text consults where the doctor has minimal visual context of the patient."

R-RIBBON adds a **48–56px full-width strip above all panes**, between the existing top header and the pane grid, that surfaces the safety-critical patient context at all times: identity (age / sex / weight), allergies (max 3 chips + overflow), chronic conditions (max 3 chips + overflow), active medication count, and a `🎯 Treating: {Dx}` mirror that updates within 200ms of any edit to the Plan pane's Dx field.

The clinical justification is concrete: missed allergy + drug interaction is the single most common Rx safety incident class in primary-care telemed. A ribbon that's always visible regardless of which pane has focus is the lowest-friction safety mitigation. The 200ms `🎯 Treating` mirror is a usability win — doctors who are mid-medicine-row don't have to scroll back to the Plan pane to remember what they're treating; the answer is always at the top of the screen.

The architectural unlock: **the ribbon subscribes directly to `RxFormContext` (lifted by csf-01)**. This works because csf-01 hoisted the provider above the shell so all sibling components can read form state. The ribbon is a sibling to the shell, both under the provider, and `useRxForm()` returns the live `state.fields.provisionalDiagnosis`. No prop drilling, no new context, no derived state machinery. Click-to-focus on `🎯` is a one-line `document.getElementById('diagnosis')?.focus()` because cv2-06's `<AssessmentSection>` already exposes the Dx input with the right ID.

This batch closes R-RIBBON with **4 tasks across 4 waves**, **~7h wall-clock single-engineer (~1 dev-day)**, **zero new migrations**, **zero Opus tasks**. The visible artifact at the close-gate is `/dashboard/appointments/[id]` rendering the patient ribbon strip between the existing header and the pane grid, with skeleton loading state, overflow chip handling, tooltip-on-click for individual chips, and the live Dx mirror reacting to typing in the Plan pane within 200ms.

---

## Decision lock (frozen for batch duration)

These match the planning conversation locked 2026-05-21. Re-opening any belongs in a new batch.

**DL-1: Five slots per source plan, with one tweak — identity slot is "age · sex · weight" (no name).** The existing `<PatientProfileHeader>` Row 1 already shows the patient name; duplicating it in the ribbon's identity slot adds visual noise. The ribbon's identity slot reads "42 y · M · 68 kg" (age · sex · weight) and skips the name. Source plan said "name, age, sex, weight"; this batch keeps the spec spirit (make patient identity visible) while avoiding the duplication. Captured as a Phase 3 follow-up in case doctor feedback wants the name back.

**DL-2: `<PatientProfileHeader>` is unchanged in this batch.** Source plan's "Files touched: refactor `PatientProfileHeader.tsx`" line is interpreted as a Phase 3 polish concern (consolidate demographics across header + ribbon). This batch keeps the header intact to avoid touching a heavily-used component while csf-* is still in flight. Capture-inbox a follow-up: "Phase 3: refactor PatientProfileHeader to remove demographics now duplicated by the ribbon."

**DL-3: Ribbon mounts INSIDE the lifted `<RxFormProvider>` from csf-01.** Specifically: between `<PatientProfileHeader>` and `<PatientProfileShell>` inside `<PatientProfilePage>`. The provider already wraps the shell post-csf-01; the ribbon becomes a sibling to the shell, both under the provider. This lets the ribbon call `useRxForm()` for the Dx live-mirror with zero prop drilling. The cv2-08 single-provider invariant is preserved (still exactly one `<RxFormProvider>` in the tree).

**DL-4: Click `🎯` → `document.getElementById('diagnosis')?.focus()` (existing ID from cv2-06).** No new context, no imperative ref system, no `useImperativeHandle`. The Dx input in `<AssessmentSection>` already has `id="diagnosis"` (verified 2026-05-21). Plus a `scrollIntoView({ block: 'center', behavior: 'smooth' })` so the input is visible if the Plan pane is scrolled. Future R-MIDDLE batch may move the Dx input into a sticky Assessment strip; the ID moves with it. Zero coupling.

**DL-5: 200ms live-mirror via React state.** The ribbon's Dx mirror reads `state.fields.provisionalDiagnosis` from `useRxForm()`. React's commit cycle naturally lands the update within ~16-32ms (one frame); no debouncing needed. The 200ms acceptance bound from source plan is a generous ceiling, not a target. (If profiling reveals re-render cost is high, fall back to `requestAnimationFrame`-batched updates — captured as a polish follow-up.)

**DL-6: Walk-in fallback (`appointment.patient_id == null`) hides the ribbon entirely.** No "No patient context" placeholder; the ribbon simply doesn't render. Walk-in appointments use the legacy 2-pane horizontal body+rx fallback (csf-* DL-5) which doesn't have the chart leaves anyway; the ribbon's value prop (constant patient context) doesn't apply.

**DL-7: Mobile (`<lg`) hides the ribbon entirely.** Per cv2 DL-12 (mobile branch unchanged), the ribbon is desktop-only. Mobile doctors continue to see the existing `MobilePillBar` flow. Capture-inbox a follow-up: "Phase 3: design a mobile ribbon variant (compact header strip with overflow drawer)."

**DL-8: Skeleton renders without layout shift.** The ribbon container has a fixed height (52px = source plan's mid-range) regardless of data state. Loading state shows skeleton chip placeholders. Empty data state (e.g., zero allergies) shows a dimmed "No known allergies" inline label, not collapsed empty space. Result: CLS = 0 on patient data load.

**DL-9: No new backend endpoints, no new migrations.** Ribbon data composes existing endpoints client-side:
- Identity (age / sex / weight): from `appointment.patient_demographics` (exists today via cs-03) OR from `GET /api/v1/patients/:id` if demographics aren't on the appointment object — task discovers.
- Allergies: existing `GET /api/v1/patients/:patientId/chart/allergies` (from cv2 / EHR Sub-batch A).
- Chronic conditions: existing `GET /api/v1/patients/:patientId/chart/conditions`.
- Active meds count: derived from the most recent prescription's medicines array, OR from a `?status=active` filter on prescriptions list — task picks the cheapest path.
- 🎯 Treating Dx: client-only via `useRxForm()`.

**DL-10: Zero Opus tasks.** Per AGENT-EXECUTION-EFFICIENCY-GUIDE hard-rules list, none of these tasks reach the L-size structural-refactor / PHI / RLS / novel security thresholds. Per-message escalation to Opus on crb-02 only if Auto stalls on overflow chip detection or skeleton CLS guarantee.

---

## Phases

### Wave 1 — Ribbon data hook (1 task, ~1.5h, single sequential lane)

The dependency cliff per [EXECUTION-ORDER-GUIDELINES § 0.5 Cut 1](../../../../process/EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves). crb-01 builds the data hook; crb-02 consumes it. Both run before any production-page edit.

- [`task-crb-01-ribbon-data-hook.md`](./Tasks/task-crb-01-ribbon-data-hook.md) — **XS-S, Auto** — New `frontend/hooks/usePatientRibbonData.ts` (or `frontend/lib/patient-profile/use-ribbon-data.ts` — task picks based on existing convention). Composes existing API client wrappers (`listAllergies`, `listChronicConditions`, an active-meds-count derivation) into a single ribbon-shaped data structure. Returns `{ identity: { ageYears, sex, weightKg }, allergies: AllergyChip[], chronicConditions: ChronicChip[], activeMedsCount: number, isLoading: boolean, error?: Error }`. Uses existing SWR / React Query / `useEffect`-fetch patterns based on what the existing chart sections do. No backend changes.

### Wave 2 — PatientRibbon component (1 task, ~3-4h, single sequential lane)

Cut 2 (artifact change) per [EXECUTION-ORDER-GUIDELINES § 0.5](../../../../process/EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves). End of Wave 1: data hook compiles. End of Wave 2: ribbon renders correctly in a fixture.

- [`task-crb-02-patient-ribbon-component.md`](./Tasks/task-crb-02-patient-ribbon-component.md) — **M, Auto** — New `frontend/components/patient-profile/PatientRibbon.tsx`. 52px height, full-width, 5 slots (identity / allergies / chronic / active meds count / 🎯 Treating Dx). Subscribes to `useRxForm()` for the live Dx mirror per DL-5. Skeleton state during load. Overflow chip detection (max 3 chips + "+N more" pill that opens a popover with the rest). Tooltip on individual chip click. Click `🎯` → focus + scrollIntoView the `id="diagnosis"` input per DL-4. Smoke at a dev-only fixture page.

### Wave 3 — Mount in `PatientProfilePage` (1 task, ~1h, single sequential lane)

**⚠️ Cross-batch dependency:** Wave 3 is gated on the [`cockpit-shell-flip`](../../19-05-2026/cockpit-shell-flip/) batch's csf-04 (production cutover) being merged. crb-03 modifies `PatientProfilePage.tsx` which csf-01 + csf-04 + csf-05 + csf-06 also write. Stack Wave 3 on the merged `cockpit-shell-flip-cutover` branch.

- [`task-crb-03-mount-in-patient-profile-page.md`](./Tasks/task-crb-03-mount-in-patient-profile-page.md) — **XS, Composer 2 Fast** — In `PatientProfilePage.tsx`, render `<PatientRibbon appointment={appointment} token={token} />` between `<PatientProfileHeader>` and `<PatientProfileShell>`, INSIDE the `<RxFormProvider>` from csf-01 so the ribbon can subscribe to form state. Walk-in branch (`!showChart` / `appointment.patient_id == null`) skips the mount per DL-6. Mobile branch (`<lg`) skips the mount per DL-7. ~10 LOC delta.

### Wave 4 — Verification + close-out (1 task, ~1h, single sequential lane)

- [`task-crb-04-verification-and-close-out.md`](./Tasks/task-crb-04-verification-and-close-out.md) — **XS, Composer 2 Fast** — Run smoke matrix per cross-cutting gate. tsc + lint + build sweep. Wire telemetry event `cockpit_v2.r_ribbon_landed` (one-shot per session, same pattern as csf-06's `phase2_shell_flipped`). Update `docs/Reference/product/cockpit/COCKPIT.md` with the new ribbon strip diagram. Update [`plan-cockpit-v2-execution-roadmap.md`](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md): R-RIBBON status → ✅ DONE; batch ledger entry; recommended-ordering pointer to next batch (templates-r-mod). Capture-inbox follow-ups for: PatientProfileHeader refactor (DL-2), mobile ribbon variant (DL-7), name-back-in-ribbon if doctor feedback wants it (DL-1).

---

## Cross-cutting acceptance gate (whole batch)

These items must all be green before the batch is considered closed.

### Structural

- [ ] **Ribbon visible across all paths** — `/dashboard/appointments/[id]` (post-csf-* + post-this-batch) renders the ribbon strip between the existing header and the pane grid for all telemed appointments with a known patient.
- [ ] **All five slots render** — identity (age · sex · weight), allergies (chips, max 3 + overflow), chronic conditions (chips, max 3 + overflow), active meds count badge, 🎯 Treating Dx mirror.
- [ ] **No layout shift on load** — measured `CLS = 0` via DevTools Performance tab. Skeleton state visible during 300ms+ load and identical in height to the loaded state.
- [ ] **Walk-in unchanged** — open a walk-in appointment (`patient_id == null`); ribbon does not render. 2-pane horizontal layout unchanged.
- [ ] **Mobile unchanged** — DevTools `<lg` viewport; ribbon does not render. MobilePillBar flow unchanged.
- [ ] **Kill-switch (`?v1=1`) still works** — ribbon does not render under the legacy 3-pane layout (the legacy layout doesn't have a ribbon slot above the panes). No console errors.

### Behavior

- [ ] **🎯 Treating Dx live-mirrors within 200ms** — type "URI" in the Dx field of the Plan pane; the ribbon's "🎯 Treating: URI" updates within 200ms (measured via `performance.mark`/`measure`). Empty Dx renders dimmed "🎯 Treating: —".
- [ ] **Click 🎯 focuses the Dx input** — clicking the 🎯 segment of the ribbon moves focus to `id="diagnosis"` AND scrolls it into view if it's offscreen.
- [ ] **Overflow chip handling** — patient with 5 allergies; ribbon shows 3 chips + "+2 more" pill; clicking the pill opens a popover listing all 5. Same for chronic conditions.
- [ ] **Tooltip on chip click** — clicking a single allergy chip opens a tooltip showing the allergy's full detail (name + reaction + severity from the existing chart endpoint shape).
- [ ] **Active meds count is correct** — patient with 4 active medicines on their most recent Rx → ribbon shows `💊 4`. Patient with zero active meds → ribbon shows `💊 0` dimmed.

### Form parity

- [ ] **Single `<RxFormProvider>` in the tree** — React DevTools shows exactly one provider on the appointment-detail page. The ribbon does not introduce a second provider.
- [ ] **No autosave timer interference** — fill Dx + a medicine + a CC; wait 1.5s; saving indicator fires once; reload → all three persist. The ribbon's subscription to the form state doesn't trigger extra saves.

### Quality

- [ ] **`pnpm --filter frontend tsc --noEmit` clean.** `pnpm --filter frontend lint` clean. `pnpm --filter frontend build` clean.
- [ ] **No new Sentry errors** in a 5-min smoke session opening the ribbon, typing in Dx, opening overflow popovers, hovering chips, switching appointments.
- [ ] **Telemetry** — `cockpit_v2.r_ribbon_landed` fires exactly once during crb-04's smoke pass.

### Documentation

- [ ] **`docs/Reference/product/cockpit/COCKPIT.md` updated** with the ribbon strip diagram between header and pane grid.
- [ ] **`plan-cockpit-v2-execution-roadmap.md` updated** with R-RIBBON → ✅ DONE; batch ledger entry; next-batch pointer to `templates-r-mod` (R-MOD-full).
- [ ] **Capture-inbox follow-ups** — three lines: PatientProfileHeader refactor (DL-2), mobile ribbon variant (DL-7), name-back-in-ribbon if feedback wants it (DL-1).

---

## Out-of-scope (rolled forward to follow-up batches)

| Out-of-scope item | Where it lands |
|---|---|
| **PatientProfileHeader refactor** to remove demographics now duplicated by the ribbon's identity slot | Phase 3 polish batch |
| **Mobile ribbon variant** | Phase 3 batch (TBD) |
| **AI-augmented ribbon slots** (e.g., risk score, AI-suggested diagnosis) | DL-2 of source plan defers AI; future plan |
| **Editable ribbon chips** (e.g., add allergy from the ribbon) | Source plan DL-19 says ribbon is read-only; future polish |
| **Drag-to-reorder ribbon slots** | Not requested; source plan locks left-to-right order |
| **Per-doctor ribbon preset** (which slots to show) | Future R-LAYOUT-UX (Phase 3) extension |
| **Live update on chart edits from another tab/device** | Existing chart hooks have their own caching; live-update is a separate concern |

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | crb-01 | 1/1 | 0/1 | 0/1 | ~1.5h |
| Wave 2 | crb-02 | 1/1 | 0/1 | 0/1 | ~3-4h |
| Wave 3 | crb-03 | 0/1 | 1/1 | 0/1 | ~1h |
| Wave 4 | crb-04 | 0/1 | 1/1 | 0/1 | ~1h |
| **Total** | **4** | **2** | **2** | **0** | **~7h (~1 dev-day, single-lane sequential)** |

Token estimate (rough): ~120k input / ~80k output across the batch. Total batch spend (excluding optional close-gate review): ~$6-10.

**One optional Opus close-gate turn after crb-04** budgeted on top. Skip if every cross-cutting gate above passes cleanly.

---

## Sequencing notes (the why behind the waves)

The 4-wave shape:

- **Wave 1 → Wave 2 is a Cut 1 (dependency cliff).** Without crb-01's data hook, crb-02 has nothing to render against.
- **Wave 2 → Wave 3 is a Cut 2 (artifact change).** End of Wave 2: ribbon renders in a fixture. End of Wave 3: ribbon renders in production.
- **Wave 3 → Wave 4 is a Cut 3 (kind-of-work change).** Wave 3 = Build (production mount). Wave 4 = QA + Docs (smoke matrix, doc updates, telemetry, capture-inbox, roadmap update).

**Single-lane sequential everywhere.** None of the four tasks are independent enough to justify Shape B parallelism — each consumes the previous task's output.

**Cross-batch dependency:** Wave 3 (crb-03) is gated on `cockpit-shell-flip` being merged (specifically csf-04 — the production cutover). Wave 1 (crb-01) and Wave 2 (crb-02) **can run in parallel** with the in-flight csf-* + cce-* tasks because they only modify NEW files. Practical scheduling: start Wave 1 + Wave 2 on a fresh branch from `main`; rebase onto `cockpit-shell-flip-cutover` once that's merged; run Wave 3 + Wave 4.

**Why no Opus tasks?** Per AGENT-EXECUTION-EFFICIENCY-GUIDE hard-rules list, none of these tasks reach the L-size structural-refactor / PHI / RLS / novel security thresholds. The ribbon is a presentational component subscribing to existing data sources. Per-message escalation to Opus on crb-02 only if Auto stalls on the overflow chip detection or the CLS guarantee.

---

## References

- [Product plans/plan-cockpit-v2.md §R-RIBBON](../../../Product%20plans/plan-cockpit-v2.md) — source product spec; this batch's scope locks against the source plan's R-RIBBON section.
- [Product plans/plan-cockpit-v2-execution-roadmap.md](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md) — master tracker; R-RIBBON is the recommended next batch per §6 ordering.
- [Daily-plans/May 2026/19-05-2026/cockpit-shell-flip/](../../19-05-2026/cockpit-shell-flip/) — predecessor batch; csf-01 lifts the `<RxFormProvider>` this batch's ribbon subscribes to.
- [Daily-plans/May 2026/20-05-2026/cockpit-chart-extraction/](../../20-05-2026/cockpit-chart-extraction/) — sibling Phase-2 batch; disjoint conflict surface.
- [docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules; this batch sits entirely below the hard-rules list.
- [docs/Work/process/EXECUTION-ORDER-GUIDELINES.md](../../../../process/EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape rules used to draft the sibling EXECUTION-ORDER doc.
- Sibling: [`Tasks/EXECUTION-ORDER-cockpit-ribbon.md`](./Tasks/EXECUTION-ORDER-cockpit-ribbon.md) — wave / lane matrix + model picks + acceptance gates per wave.
