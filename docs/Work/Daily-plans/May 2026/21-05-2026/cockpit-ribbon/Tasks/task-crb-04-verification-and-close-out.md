# crb-04 · Verification + close-out

> **Wave 4** of the [cockpit-ribbon batch](../plan-cockpit-ribbon-batch.md). Run smoke matrix; update docs; fire telemetry; capture follow-ups; mark R-RIBBON ✅ DONE in the roadmap.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | XS (~50 LOC across docs + 1 LOC telemetry call) |
| **Model** | **Composer 2 Fast** — mechanical: smoke matrix + doc updates + capture-inbox lines + 1-line telemetry call site |
| **Wave** | 4 |
| **Depends on** | crb-03 (production mount) |
| **Blocks** | (nothing in this batch — closes R-RIBBON) |

---

## Goal

Close out the cockpit-ribbon batch by:

1. Running the cross-cutting smoke matrix from the plan doc.
2. Updating `docs/Reference/product/cockpit/COCKPIT.md` with the new ribbon strip diagram.
3. Updating `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md`:
   - R-RIBBON status → ✅ DONE.
   - Batch ledger row updated from "Planned" to "Shipped" with commit-sha link.
   - Recommended-ordering pointer updated to next batch (templates-r-mod).
   - Changelog row appended.
4. Firing telemetry event `cockpit_v2.r_ribbon_landed` once-per-session.
5. Capturing 3 follow-ups in `docs/Work/capture/inbox.md`.

---

## What to do

### 1. Smoke matrix

Run through the cross-cutting acceptance gate in [`plan-cockpit-ribbon-batch.md` §"Cross-cutting acceptance gate"](../plan-cockpit-ribbon-batch.md#cross-cutting-acceptance-gate-whole-batch). Tick every box. If anything fails:
- **Minor (visual nit, console warning):** capture-inbox a follow-up and continue.
- **Functional break (ribbon doesn't render, mirror doesn't update, walk-in regresses):** halt close-out; fix in a hot-fix sub-task before proceeding.

The full matrix (consolidated for one-pass execution):

**Structural:**
- [ ] Ribbon visible at `/dashboard/appointments/[id]` for a known-patient telemed-video appointment.
- [ ] All 5 slots render (identity / allergies / chronic / 💊 / 🎯).
- [ ] CLS = 0 measured in DevTools Performance tab on initial load.
- [ ] Walk-in unchanged (no ribbon; 2-pane layout intact).
- [ ] Mobile unchanged (no ribbon; MobilePillBar flow intact).
- [ ] Kill-switch `?v1=1` → legacy 3-pane layout, no ribbon, no errors.

**Behavior:**
- [ ] 🎯 Treating Dx live-mirrors within 200ms of typing in the Plan pane Dx input.
- [ ] Click 🎯 → focus + scroll-into-view `id="diagnosis"`.
- [ ] Allergies overflow: 5 allergies → 3 chips + `+2 more` pill that opens a popover.
- [ ] Chronic overflow: same handling.
- [ ] Tooltip on individual chip click shows full detail.
- [ ] Active meds count is correct (verify against the actual Rx data).

**Form parity:**
- [ ] Single `<RxFormProvider>` in the tree (React DevTools).
- [ ] Autosave fires once per debounce window; no extra saves caused by ribbon's subscription.

**Quality:**
- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend build` clean.
- [ ] No new Sentry errors in 5-min smoke session.

### 2. Update `docs/Reference/product/cockpit/COCKPIT.md`

Find the section that describes the appointment-detail page layout (post-csf-04 should already document the 8-pane shell). Add a new sub-section for the ribbon strip:

````markdown
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
│  Snapshot    │              Body                  │      Subjective     │
│  History     │                                    │      Plan           │
│              │                                    │      Objective      │
└──────────────┴────────────────────────────────────┴──────────────────────┘
```

**Slots (left → right):**
- Identity (age · sex · weight) — name lives in the header above
- Allergies (chips, max 3 + "+N more" overflow popover)
- Chronic conditions (chips, max 3 + "+N more" overflow popover)
- Active medication count badge
- 🎯 Treating Dx mirror (clicking focuses the Dx input in the Plan pane)

**Conditional rendering:**
- Walk-in (`patient_id == null`) → ribbon hides; 2-pane horizontal fallback
- Mobile (`<lg` viewport) → ribbon hides; MobilePillBar flow unchanged
- Kill-switch `?v1=1` → ribbon hides; legacy 3-pane layout

**Source:** [`Daily-plans/May 2026/21-05-2026/cockpit-ribbon/`](../Work/Daily-plans/May%202026/21-05-2026/cockpit-ribbon/).
````

### 3. Update `plan-cockpit-v2-execution-roadmap.md`

In `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md`:

- **§2 R-item table:** Find the R-RIBBON row, update `Status` column to `✅ DONE`, add a `Shipped` column entry pointing to the merge commit.
- **§3 Batch ledger:** Find the `cockpit-ribbon` row, change "Planned 2026-05-21" → "Shipped 2026-05-21" with the commit SHA / merge link.
- **§4 Phase progress:** Update Phase 2 progress (e.g., "5 of 8 R-items shipped" depending on what other batches have landed).
- **§6 Recommended ordering:** Move `cockpit-ribbon` from `[2nd]` to the "shipped" section. The new `[NEXT]` is `templates-r-mod` (R-MOD-full).
- **§10 Changelog:** Append a row dated 2026-05-21 for "R-RIBBON shipped (cockpit-ribbon batch). Patient ribbon strip live across all desktop telemed appointments."

### 4. Telemetry — fire `cockpit_v2.r_ribbon_landed`

In `<PatientRibbon>` (the component crb-02 created), add a one-time-per-session telemetry call. Match the pattern from csf-06's `cockpit_v2.phase2_shell_flipped`:

```tsx
useEffect(() => {
  if (typeof window === 'undefined') return;
  const KEY = 'cockpit_v2_r_ribbon_landed_fired';
  if (sessionStorage.getItem(KEY)) return;
  sessionStorage.setItem(KEY, '1');
  trackTelemetry('cockpit_v2.r_ribbon_landed', {
    telemed_modality: 'video',
    dx_value_present: Boolean(dxValue),
    allergies_count: data.allergies.length,
    chronic_count: data.chronicConditions.length,
  });
}, []); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot intentional
```

Use whatever existing telemetry helper the codebase has (likely `trackTelemetry` or `analytics.track` — match the existing call sites). Verify the event fires exactly once on first ribbon mount per session.

### 5. Capture-inbox follow-ups

Append three lines to `docs/Work/capture/inbox.md` (under the Phase-2 / cockpit-v2 section if there's an existing block; else at the end of the doc):

```md
- [ ] [cockpit-ribbon DL-2 follow-up] Refactor `PatientProfileHeader` to remove demographics now duplicated by the ribbon's identity slot. Phase 3 polish. (Source: docs/Work/Daily-plans/May 2026/21-05-2026/cockpit-ribbon/plan-cockpit-ribbon-batch.md)
- [ ] [cockpit-ribbon DL-7 follow-up] Design a mobile ribbon variant (compact header strip with overflow drawer). Currently mobile hides the ribbon. (Source: same)
- [ ] [cockpit-ribbon DL-1 follow-up] If doctor feedback wants the patient name back in the ribbon's identity slot, add a 6th slot or modify slot 1. (Source: same)
```

If discovery in crb-01 picked Path 2 (separate `getPatient` call) instead of Path 1 (`appointment.patient_demographics`), append a fourth line:
```md
- [ ] [cockpit-ribbon Path-1 optimization] Add `patient_demographics` to the appointment-detail response shape so the ribbon hook can drop the separate `getPatient` call. (Source: same)
```

---

## Files touched

- **Modified:** `frontend/components/patient-profile/PatientRibbon.tsx` (1-line addition: telemetry `useEffect`).
- **Modified:** `docs/Reference/product/cockpit/COCKPIT.md` (~30 LOC addition for the ribbon section).
- **Modified:** `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` (~10 LOC across §2, §3, §4, §6, §10).
- **Modified:** `docs/Work/capture/inbox.md` (3-4 new lines).

---

## Acceptance gate

- [ ] All 6 structural smoke items pass.
- [ ] All 6 behavior smoke items pass.
- [ ] All 2 form-parity smoke items pass.
- [ ] All 4 quality smoke items pass.
- [ ] `docs/Reference/product/cockpit/COCKPIT.md` updated with the ribbon section + diagram.
- [ ] `plan-cockpit-v2-execution-roadmap.md` updated:
  - R-RIBBON status → ✅ DONE.
  - Batch ledger row → Shipped.
  - §6 ordering → templates-r-mod is the new `[NEXT]`.
  - §10 changelog row appended.
- [ ] `cockpit_v2.r_ribbon_landed` telemetry event fires exactly once on first ribbon mount per session. Verified via DevTools Network tab or telemetry inspector.
- [ ] `docs/Work/capture/inbox.md` has 3 new lines (4 if Path-2 was picked in crb-01).
- [ ] No new Sentry errors in a 5-min smoke session.

---

## Anti-goals

- ❌ Don't add new product features. This task is verification + docs + telemetry only.
- ❌ Don't refactor `<PatientProfileHeader>` — DL-2 defers; the follow-up is captured.
- ❌ Don't add the ribbon to mobile — DL-7 defers; the follow-up is captured.
- ❌ Don't update tasks.json or the Taskmaster system — this batch is plan-doc-driven, not Taskmaster-tracked.
- ❌ Don't fire telemetry from anywhere else — only the `<PatientRibbon>` mount fires the event.

---

## Notes

- The smoke matrix duplicates the cross-cutting gate from the plan doc intentionally — this task is the single executor of that gate. Tick boxes here, mirror back to the plan doc if helpful.
- The roadmap update is the most important artifact — it's the single source of truth for "what's next." Get it right.
- After this task lands, the next planning batch should target **templates-r-mod (R-MOD-full)** per the roadmap's §6. That batch will productionize the remaining 3 modality templates (Telemed-Voice / Telemed-Text / In-person) since cockpit-shell-flip only flipped Telemed-Video.
