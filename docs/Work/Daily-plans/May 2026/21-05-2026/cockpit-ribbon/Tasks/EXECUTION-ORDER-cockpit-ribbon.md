# Cockpit ribbon — execution order — 21 May 2026 batch

> **Sibling plan doc:** [`../plan-cockpit-ribbon-batch.md`](../plan-cockpit-ribbon-batch.md). The plan answers "what + why"; this doc answers "who-runs-what-when".
>
> **Authoring conventions:** [`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md). This batch follows the standard wave / lane shape: 4 waves, single sequential lane (no Shape B parallelism — every wave consumes the prior wave's artifact).
>
> **Cost-aware model strategy:** [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR: zero Opus tasks; two Auto (crb-01, crb-02); two Composer 2 Fast (crb-03, crb-04).
>
> **Cross-batch dependency:** Wave 3 (crb-03) is **gated on [`cockpit-shell-flip`](../../../19-05-2026/cockpit-shell-flip/) batch's csf-04 merge** — both edit `PatientProfilePage.tsx`. Wave 1 and Wave 2 are conflict-free with csf-* and can start in parallel.

---

## Wave plan at a glance

| Wave | Goal | Tasks | Lanes | Output artifact | Acceptance gate |
|---|---|---|---|---|---|
| **1** | Ribbon data hook ready | crb-01 | 1 | `usePatientRibbonData(patientId, token)` returns ribbon-shaped data | Hook compiles. Smoke at React DevTools fixture: identity / allergies / chronic / activeMedsCount populated. |
| **2** | Ribbon component ready | crb-02 | 1 | `<PatientRibbon>` renders 5 slots with skeleton + overflow + tooltip + Dx mirror | Component renders correctly at a dev fixture page. Skeleton CLS = 0. Click 🎯 focuses `id="diagnosis"`. |
| **3** | Ribbon mounted in production | crb-03 | 1 | `PatientProfilePage.tsx` renders ribbon between header and shell | Open `/dashboard/appointments/[id]`; ribbon visible. Walk-in path skips ribbon. Mobile path skips ribbon. |
| **4** | Verification + docs + telemetry | crb-04 | 1 | Smoke matrix green; `COCKPIT.md` + roadmap updated; telemetry firing; capture-inbox lines | All cross-cutting gates from plan-batch §"Cross-cutting acceptance gate" pass. R-RIBBON → ✅ DONE in roadmap. |

**Total wall-clock estimate:** ~7h single-engineer single-lane sequential (~1 dev-day).

---

## Task table

| # | Task | Size | Model | Lane | Wave | Predecessor | Files touched (new / mod) |
|---|---|---|---|---|---|---|---|
| 1 | [crb-01: Ribbon data hook](./task-crb-01-ribbon-data-hook.md) | XS-S | Auto | α | 1 | csf-01 (RxFormProvider lift; not strictly required for this task — only for crb-02's `useRxForm()`) | `frontend/hooks/usePatientRibbonData.ts` (new) — or `frontend/lib/patient-profile/use-ribbon-data.ts` (task picks based on existing convention) |
| 2 | [crb-02: PatientRibbon component](./task-crb-02-patient-ribbon-component.md) | M | Auto | α | 2 | crb-01 (data hook); cv2-05 (RxFormContext, already shipped); cv2-06 (AssessmentSection with `id="diagnosis"`, already shipped) | `frontend/components/patient-profile/PatientRibbon.tsx` (new) |
| 3 | [crb-03: Mount in PatientProfilePage](./task-crb-03-mount-in-patient-profile-page.md) | XS | Composer 2 Fast | α | 3 | crb-02 + **csf-04 merged** (production cutover; otherwise the merge conflict is large) | `frontend/app/dashboard/appointments/[id]/page.tsx` (mod, ~10 LOC delta) |
| 4 | [crb-04: Verification + close-out](./task-crb-04-verification-and-close-out.md) | XS | Composer 2 Fast | α | 4 | crb-03 | `docs/Reference/product/cockpit/COCKPIT.md` (mod), `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` (mod), `docs/Work/capture/inbox.md` (mod), telemetry call site in `<PatientRibbon>` (mod, optional 1-line addition) |

**Lanes:** Single lane α throughout. No Shape B parallelism — every wave consumes the prior wave's artifact.

**Models:** 2 Auto (crb-01, crb-02) + 2 Composer 2 Fast (crb-03, crb-04) + 0 Opus. Per-message escalation to Opus on crb-02 only if Auto stalls on overflow chip detection or CLS guarantee.

---

## Wave 1 — Ribbon data hook

**Goal:** Compose existing chart endpoints into a single ribbon-shaped data structure.

**Tasks:**

- [crb-01](./task-crb-01-ribbon-data-hook.md)

**Acceptance gate (Wave 1 close):**

- [ ] `usePatientRibbonData(patientId, token)` exports from its module and compiles.
- [ ] Returns `{ identity: { ageYears, sex, weightKg }, allergies: AllergyChip[], chronicConditions: ChronicChip[], activeMedsCount: number, isLoading: boolean, error?: Error }`.
- [ ] Composes existing API client wrappers — no new `fetch` calls, no new endpoints.
- [ ] React DevTools smoke at a dev fixture: with a known patient ID, all four data fields populate within 500ms.
- [ ] `pnpm --filter frontend tsc --noEmit` clean for the new file.

---

## Wave 2 — PatientRibbon component

**Goal:** Build the ribbon UI component, smoke at a dev fixture page (not yet in production).

**Tasks:**

- [crb-02](./task-crb-02-patient-ribbon-component.md)

**Acceptance gate (Wave 2 close):**

- [ ] `<PatientRibbon appointment={...} token={...} />` renders 5 slots: identity (age · sex · weight), allergies (chips, max 3 + "+N more"), chronic (chips, max 3 + "+N more"), 💊 active meds count, 🎯 Treating Dx mirror.
- [ ] Skeleton state during load. Identical container height (52px) in both states. CLS = 0.
- [ ] Subscribes to `useRxForm()` for live Dx mirror. Mirror updates within one React commit cycle (well below 200ms ceiling).
- [ ] Click 🎯 → `document.getElementById('diagnosis')?.focus()` + `scrollIntoView({ block: 'center' })`.
- [ ] Click an allergy / chronic chip → tooltip popover with full detail.
- [ ] Click "+N more" pill → popover listing all overflow chips.
- [ ] Walk-in (`appointment.patient_id == null`) → component returns `null` (renders nothing).
- [ ] Smoke at `/dashboard/_dev/ribbon-fixture` (or equivalent dev fixture path the task picks); all behaviors verified manually.
- [ ] `pnpm --filter frontend tsc --noEmit` + `lint` clean.

---

## Wave 3 — Mount in `PatientProfilePage`

**⚠️ GATED on [`cockpit-shell-flip`](../../../19-05-2026/cockpit-shell-flip/) batch's csf-04 merge.**

**Goal:** Render the ribbon in production between the existing header and the shell, inside the lifted `<RxFormProvider>`.

**Tasks:**

- [crb-03](./task-crb-03-mount-in-patient-profile-page.md)

**Acceptance gate (Wave 3 close):**

- [ ] `/dashboard/appointments/[id]` for a known-patient appointment renders the ribbon strip between `<PatientProfileHeader>` and `<PatientProfileShell>`.
- [ ] React DevTools shows exactly one `<RxFormProvider>` in the tree (cv2-08 invariant preserved).
- [ ] Ribbon's 🎯 Dx mirror updates live as you type in the Plan pane's Dx input.
- [ ] Walk-in (`appointment.patient_id == null`) → ribbon does NOT render. 2-pane horizontal layout unchanged.
- [ ] Mobile (`<lg`) → ribbon does NOT render. MobilePillBar flow unchanged.
- [ ] Kill-switch (`?v1=1`) — legacy 3-pane layout doesn't render the ribbon (the legacy layout is below `<RxFormProvider>` but the ribbon is in the new tree only).
- [ ] No new console errors. No new Sentry errors in 5-min smoke.
- [ ] `pnpm --filter frontend tsc --noEmit` + `lint` + `build` clean.

---

## Wave 4 — Verification + close-out

**Goal:** Run the cross-cutting gate from the plan doc, update documentation, fire telemetry, capture follow-ups.

**Tasks:**

- [crb-04](./task-crb-04-verification-and-close-out.md)

**Acceptance gate (Wave 4 close):**

- [ ] All cross-cutting gates from [`plan-cockpit-ribbon-batch.md` §"Cross-cutting acceptance gate"](../plan-cockpit-ribbon-batch.md#cross-cutting-acceptance-gate-whole-batch) pass.
- [ ] `docs/Reference/product/cockpit/COCKPIT.md` updated with the new ribbon strip diagram between header and pane grid.
- [ ] `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` updated:
  - R-RIBBON status → ✅ DONE.
  - Batch ledger row added for `cockpit-ribbon` (2026-05-21).
  - Recommended ordering (§6) updated to point to next batch (templates-r-mod / R-MOD-full).
- [ ] Telemetry event `cockpit_v2.r_ribbon_landed` fires exactly once on first ribbon-mount per session.
- [ ] `docs/Work/capture/inbox.md` has three new lines: PatientProfileHeader refactor follow-up (DL-2); mobile ribbon variant follow-up (DL-7); name-back-in-ribbon follow-up (DL-1).
- [ ] No new Sentry errors in a 5-min smoke session.
- [ ] If everything is clean, mark R-RIBBON ✅ DONE in the roadmap and move on to the next batch (templates-r-mod).

---

## Optional close-gate review turn

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md "Use Opus sparingly"](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

> "**Close-gate review:** one Opus turn at the very end of a wave or batch when the worker drift risk is real (e.g., complex branching, refactors that span 5+ files, security-sensitive surfaces)."

For this batch, **skip the close-gate Opus turn** unless any cross-cutting gate fails. The batch is presentational + read-only consumption of existing data; the worker drift risk is low.

If a cross-cutting gate fails, escalate to a single Opus turn focused on the failing gate. Budget: ~1 Opus chat / ~10k tokens.

---

## Notes for the executor

- **Branch off `main` for Wave 1 + Wave 2.** The data hook + component file are both new; no merge conflicts with in-flight `cockpit-shell-flip` or `cockpit-chart-extraction` work.
- **Rebase on `cockpit-shell-flip-cutover` for Wave 3.** crb-03 modifies `PatientProfilePage.tsx` which csf-* heavily edits. Wait for csf-04 to merge, rebase, run Wave 3.
- **Crb-04's roadmap update is a NON-trivial doc edit.** The roadmap has a §10 changelog at the bottom — append a row dated 2026-05-21 for "R-RIBBON shipped." The §3 batch ledger row marked "Planned" gets updated to "Shipped" with a commit-sha link.
- **No new package installs.** All UI primitives the ribbon needs (`Tooltip`, `Popover`, `Skeleton`) are already in `frontend/components/ui/` from prior batches.
- **Telemetry pattern from csf-06.** Follow the same one-shot-per-session sessionStorage flag pattern. Event payload: `{ telemed_modality: 'video', dx_value_present: boolean, allergies_count: number, chronic_count: number }`.
