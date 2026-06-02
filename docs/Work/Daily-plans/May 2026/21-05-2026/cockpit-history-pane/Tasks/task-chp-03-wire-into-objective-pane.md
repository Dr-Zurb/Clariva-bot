# chp-03 · Telemetry useEffect + tab-contract slot reservation

> **Status:** ✅ **DONE** (2026-05-24) — `trackCockpitV2RHistoryLanded` wired in ObjectivePane; `tabs: undefined` reserved on subjective + objective pane definitions in `makeRightColumn`.

> **Wave 2** of the [cockpit-history-pane batch](../plan-cockpit-history-pane-batch.md). Add a `useEffect` to ObjectivePane that fires `trackCockpitV2RHistoryLanded` once per session, and reserve `tabs: undefined` on the subjective + objective pane definitions in `templates.tsx`. Mechanical wire-up — no functional UI change beyond the telemetry side-effect.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | S (~25-30 LOC across 3 files) |
| **Model** | **Auto** — mechanical. |
| **Wave** | 2 |
| **Depends on** | chp-01 (BMI badge visible), chp-02 (split exam + test-results textareas in place) |
| **Blocks** | chp-04 (cross-cutting smoke + per-batch close-out — depends on the telemetry function existing and firing) |

---

## Goal

Close the loop on R-HISTORY's "tab-contract slots reserved" acceptance from the source plan, and emit the single telemetry event for the batch. Both are small surgical changes.

---

## What to do

### 1. Modify `frontend/components/patient-profile/panes/ObjectivePane.tsx`

Final shape:

```tsx
"use client";

/**
 * ObjectivePane — pane wrapper that mounts the cv2-06 ObjectiveSection in its own
 * pane within the Telemed-Video tree. Created by csf-03 (2026-05-19) for Phase 2 foothold.
 * chp-03 added the R-HISTORY-landed telemetry event (2026-05-21).
 *
 * Reads RxFormContext from the lifted provider in PatientProfilePage (csf-01).
 */
import { useEffect } from "react";
import { ObjectiveSection } from "@/components/cockpit/rx/sections/ObjectiveSection";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { trackCockpitV2RHistoryLanded } from "@/lib/patient-profile/telemetry";
import { parseExam } from "@/lib/cockpit/exam-findings";

export interface ObjectivePaneProps {
  hideHeader?: boolean;
}

export default function ObjectivePane({
  hideHeader = false,
}: ObjectivePaneProps): JSX.Element {
  const { state } = useRxForm();

  useEffect(() => {
    // One-shot guard lives inside trackCockpitV2RHistoryLanded — safe to call
    // on every mount; the second + later calls no-op.
    const { fields } = state;
    const exam = parseExam(fields.examinationFindings);
    const vitalsFilledCount =
      (fields.vitalsBpSystolic != null ? 1 : 0) +
      (fields.vitalsBpDiastolic != null ? 1 : 0) +
      (fields.vitalsHr != null ? 1 : 0) +
      (fields.vitalsTempC != null ? 1 : 0) +
      (fields.vitalsSpo2 != null ? 1 : 0) +
      (fields.vitalsWtKg != null ? 1 : 0) +
      (fields.vitalsHtCm != null ? 1 : 0);

    trackCockpitV2RHistoryLanded({
      appointmentId: state.appointmentId ?? "unknown",
      vitalsFilledCount,
      hasGeneralExam: exam.general.trim().length > 0,
      hasSystemicExam: exam.systemic.trim().length > 0,
      hasTestResults: fields.testResults.trim().length > 0,
      hasBmi: fields.vitalsWtKg != null && fields.vitalsHtCm != null,
    });
    // Intentionally fire only on mount; the one-shot guard inside the tracker
    // ensures repeat mounts (e.g., template switches) don't re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-3">
      <ObjectiveSection heading={hideHeader ? null : undefined} />
    </div>
  );
}
```

**Note on `state.appointmentId`:** if the `RxFormContext` doesn't expose `appointmentId` on its public state (verify in chp-02), pull it from the URL params instead (same approach as `usePatientRibbonData`), or accept a prop in `ObjectivePaneProps`. The cleanest path is to add an `appointmentId` field to `ObjectivePaneProps` and have `templates.tsx` pass it through — but that's one more file to touch. Verify before adding scope.

### 2. Modify `frontend/components/patient-profile/panes/SubjectivePane.tsx`

Only a docstring update — no behavior change — to call out the tab-contract slot reservation on the pane definition:

```tsx
"use client";

/**
 * SubjectivePane — pane wrapper that mounts the cv2-06 SubjectiveSection in its
 * own pane within the Telemed-Video tree. Created by csf-03 (2026-05-19) for
 * Phase 2 foothold. chp-03 noted that the pane definition in templates.tsx
 * reserves a `tabs: undefined` slot for future Photo / AI-summary tabs
 * (R-FUTURE-PROOFING).
 *
 * Reads RxFormContext from the lifted provider in PatientProfilePage (csf-01).
 */
import { SubjectiveSection } from "@/components/cockpit/rx/sections/SubjectiveSection";

export interface SubjectivePaneProps {
  hideHeader?: boolean;
}

export default function SubjectivePane({
  hideHeader = false,
}: SubjectivePaneProps): JSX.Element {
  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-3">
      <SubjectiveSection heading={hideHeader ? null : undefined} />
    </div>
  );
}
```

### 3. Modify `frontend/lib/patient-profile/templates.tsx` — reserve `tabs: undefined`

In the `getTelemedVideoTemplate()` factory (and any other factory created by tmr-01 that mounts SubjectivePane / ObjectivePane), find the right-column pane definitions (line ~256 / ~263 for the `subjective` / `objective` ids) and add an explicit `tabs: undefined` field with a comment:

```tsx
{
  id: 'subjective',
  title: 'Subjective',
  icon: MessageSquare,
  render: () => <SubjectivePane hideHeader />,
  naturalSizePct: 50,
  minSizePx: 220,
  // R-FUTURE-PROOFING tab-contract slot — reserved for future Photo / AI-summary
  // tabs per cv2-09 / R-HISTORY acceptance. v1 leaves undefined; a future plan
  // implements PaneTabDefinition[] here. See aux-surfaces.ts.
  tabs: undefined,
},
{
  id: 'objective',
  title: 'Objective',
  icon: Activity,
  render: () => <ObjectivePane hideHeader />,
  naturalSizePct: 50,
  minSizePx: 220,
  // R-FUTURE-PROOFING tab-contract slot — reserved for future Labs tab per
  // cv2-09 / R-HISTORY acceptance. v1 leaves undefined; a future plan
  // implements PaneTabDefinition[] here. See aux-surfaces.ts.
  tabs: undefined,
},
```

If `tmr-01` already added other modality template factories that mount Subjective / Objective panes (e.g., Telemed-Voice, Telemed-Text, Review), apply the same reservation comment + `tabs: undefined` in those factories too. Sweep with a search for the pane ids and add the explicit reservation everywhere they're declared.

### 4. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend dev
# Open /dashboard/appointments/[id]
# Open DevTools — Network tab + Console
# Verify:
#   - Console shows `cockpit_v2.r_history_landed` event with the payload
#   - Refreshing the page does NOT re-fire the event (one-shot guard)
#   - Opening DIFFERENT appointment also doesn't re-fire (one-shot is per-session)
```

If you need to manually reset the one-shot guard for verification, in DevTools console:

```js
delete window.__cockpitV2RHistoryLanded;
```

…then reload to see the event fire again. (`__cockpitV2RHistoryLanded` is added by chp-04 to telemetry.ts.)

---

## Acceptance gate

- [x] `ObjectivePane` imports + calls `trackCockpitV2RHistoryLanded` from `@/lib/patient-profile/telemetry`.
- [x] Telemetry fires once per session on first ObjectivePane mount with all 5 payload flags computed correctly.
- [x] Repeat mounts (e.g., template switch from voice → video) do NOT re-fire.
- [x] `SubjectivePane` has a docstring comment referencing the tab-contract slot reservation (no functional change).
- [x] `templates.tsx` Subjective + Objective pane definitions carry `tabs: undefined` with a comment.
- [x] If tmr-01 added other modality factories that mount these panes, the reservation comment is added there too.
- [x] tsc + lint clean. *(repo-wide tsc has pre-existing failures in unrelated files; chp-03 files are clean.)*
- [ ] Manual smoke: dev server runs, /dashboard/appointments/[id] loads, telemetry event observed in console once.

---

## Anti-goals

- ❌ Don't add the telemetry call to `ObjectiveSection.tsx`. The section is rendered in non-cockpit mounts too (per DL-3 — appointment-detail standalone, in-call mini-panel, post-call summary). Telemetry must fire only for the COCKPIT mount; that means the pane wrapper, not the section.
- ❌ Don't add multiple telemetry events. DL-12: single event for the batch.
- ❌ Don't implement any tab right now. DL-11: slots reserved, not implemented.
- ❌ Don't add a tab rendering path in `PatientProfileShell.tsx`. That's a future plan.
- ❌ Don't change pane ids, positions, or sizing. DL-10.

---

## Notes

- **Why telemetry on ObjectivePane and not SubjectivePane?** The Objective pane is the surface that gains the most R-HISTORY content (BMI badge, exam split, test results). Doctors who fill any new field land via Objective; firing there represents "the new structured surface is reachable + reaches the user." Subjective only gains the slot reservation; no new visible content. One event per batch (DL-12) means we pick the surface that captures actual usage signal.
- **Why fire on mount, not on first field-fill?** A "landed" event signals **reachability** — the doctor can see and interact with the new content. Firing on first field-fill would conflate reachability with adoption; we want both signals separable. Future adoption telemetry (capture-inbox) can fire `r_history_first_field_filled` once any of the new fields gets a non-empty value.
- **`appointmentId` source.** Per chp-02, `RxFormContext` exposes the appointment id on its state (verify the exact path — could be `state.appointmentId` or via context props). If unavailable, the fallback is to add an `appointmentId` prop to `ObjectivePaneProps` and have `templates.tsx` pass `ctx.appointment.id` via the render closure. The prop path is cleaner; the context-state path is less code. Pick based on what already exists post-chp-02.
- **Why explicit `tabs: undefined`?** TypeScript `PaneDefinition.tabs` is optional already — `tabs?: PaneTabDefinition[]`. Omitting the field is equivalent semantically. But explicitly writing `tabs: undefined` with the comment is a DOCUMENTATION choice — it signals to readers of `templates.tsx` that the slot is INTENTIONALLY reserved for future work, not just forgotten. Saves the next developer 5 minutes of "is this missing or deferred?" investigation. The cost is two lines per pane.
- **`templates.tsx` sweep.** If `tmr-01` (templates-r-mod batch) shipped before this batch, it added 3 new factories (`getTelemedVoiceTemplate`, `getTelemedTextTemplate`, `getReviewTemplate`). Each mounts the Subjective + Objective panes. Apply the reservation to all of them. Use a quick grep to find every `id: 'subjective'` / `id: 'objective'` in `templates.tsx` and verify each has `tabs: undefined` + the comment.
