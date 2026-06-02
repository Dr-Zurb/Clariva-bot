# tmr-04 · Wire `mapStateToTemplate` into `PatientProfilePage`

> **Status:** ✅ **DONE** (2026-05-23) — dispatch wired; override via `getDoctorSettings`. Manual smoke → tmr-05.

> **Wave 3** of the [templates-r-mod batch](../plan-templates-r-mod-batch.md). Replace the hardcoded `getTelemedVideoTemplate(ctx)` with a `useMemo`'d dispatch that picks the right factory based on state + modality + doctor override.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | S (one existing file modified, ~30 LOC delta) |
| **Model** | **Composer 2 Fast** — mechanical wire-up of an already-tested pure function; small surface |
| **Wave** | 3 |
| **Depends on** | tmr-01 (factories) + tmr-02 (dispatcher) + tmr-03 (override column) + **csf-04 merged** (production cutover) |
| **Blocks** | tmr-05 (verification + close-out) |

---

## ⚠️ Cross-batch dependency

This task is **gated on the [`cockpit-shell-flip`](../../../19-05-2026/cockpit-shell-flip/) batch's csf-04 merge**.

Both this task and csf-04 modify `PatientProfilePage.tsx`. csf-04 introduced the `getTelemedVideoTemplate(ctx)` call this task replaces; tmr-04 adds a single dispatch line above it. Rebase order: csf-04 first, then this task.

If `cockpit-ribbon`'s crb-03 has also landed (likely, since it's a sibling batch dated today), there's a second region of `PatientProfilePage.tsx` already modified — your edit is in a third disjoint region (the `useMemo` block that picks the template).

---

## Goal

In `frontend/components/patient-profile/PatientProfilePage.tsx`:

1. Pull the doctor's `cockpit_template_override` from the existing doctor-settings client cache (or `null` if unavailable; capture-inbox a follow-up).
2. Call `mapStateToTemplate(state, modality, override)` to pick a template id.
3. Dispatch to the right factory: `getTelemedVideoTemplate` / `getTelemedVoiceTemplate` / `getTelemedTextTemplate` / `getReviewTemplate`.
4. Preserve every other branch (walk-in fallback, kill-switch, legacy 3-pane).

---

## What to do

### 1. Locate the existing template call

Find the block in `PatientProfilePage.tsx` (around line ~396 post-csf-04 + crb-03):

```tsx
const telemedVideoTemplate = useMemo(
  () =>
    getTelemedVideoTemplate({
      appointment: appt,
      token,
      state,
      launcherRef,
      hideHeader: true,
      onRxSent: handleRxSent,
      onMarkNoShow: handleMarkNoShow,
      onFinishVisit: () => void handleFinishVisit(),
      onMedicineCountChange: setRxMedicineCount,
      finishBusy,
    }),
  [/* deps */],
);
```

### 2. Replace with the dispatched call

```tsx
import {
  getTelemedVideoTemplate,
  getTelemedVoiceTemplate,
  getTelemedTextTemplate,
  getReviewTemplate,
  type TelemedVideoContext,
  type CockpitTemplate,
} from "@/lib/patient-profile/templates";
import { mapStateToTemplate } from "@/lib/patient-profile/state";

// ...

// tmr-04: Doctor's preferred template override from doctor_settings.
// Returns null if not yet fetched or if the doctor hasn't set one.
const cockpitTemplateOverride = useDoctorCockpitTemplateOverride();

const selectedTemplateId = useMemo<CockpitTemplate>(
  () =>
    mapStateToTemplate(
      state,
      appt.consultation_type ?? null,
      cockpitTemplateOverride,
    ),
  [state, appt.consultation_type, cockpitTemplateOverride],
);

const templateContext: TelemedVideoContext = useMemo(
  () => ({
    appointment: appt,
    token,
    state,
    launcherRef,
    hideHeader: true,
    onRxSent: handleRxSent,
    onMarkNoShow: handleMarkNoShow,
    onFinishVisit: () => void handleFinishVisit(),
    onMedicineCountChange: setRxMedicineCount,
    finishBusy,
  }),
  [
    appt,
    token,
    state,
    launcherRef,
    handleRxSent,
    handleMarkNoShow,
    handleFinishVisit,
    finishBusy,
  ],
);

const dispatchedTemplate = useMemo(() => {
  switch (selectedTemplateId) {
    case 'telemed-voice':
      return getTelemedVoiceTemplate(templateContext);
    case 'telemed-text':
      return getTelemedTextTemplate(templateContext);
    case 'review':
      return getReviewTemplate(templateContext);
    case 'telemed-video':
    default:
      return getTelemedVideoTemplate(templateContext);
  }
}, [selectedTemplateId, templateContext]);
```

Update `panesToMount` to use `dispatchedTemplate` instead of `telemedVideoTemplate`:

```tsx
const panesToMount = useMemo(() => {
  if (legacyShape) {
    return showChart
      ? legacyBuiltInPanes
      : legacyBuiltInPanes.filter((p) => p.id !== "chart");
  }
  if (!showChart) {
    return legacyBuiltInPanes.filter((p) => p.id !== "chart");
  }
  return dispatchedTemplate;
}, [legacyShape, showChart, legacyBuiltInPanes, dispatchedTemplate]);
```

### 3. Implement `useDoctorCockpitTemplateOverride`

Two options:

**Option A: Reuse existing doctor-settings hook.** If `PatientProfilePage` (or an ancestor) already calls a `useDoctorSettings()` SWR hook, extend it to return `cockpit_template_override` and consume that here.

**Option B: Skip for v1, return null.** If no doctor-settings hook exists client-side today, ship the dispatcher with `cockpitTemplateOverride = null` and capture-inbox a follow-up: "Read `cockpit_template_override` from doctor settings — needed for templates-r-mod DL-4."

Pick Option A if it's a 5-minute extension; Option B if it requires plumbing a new hook into the page (defer that to the future Settings UI batch).

```tsx
// Option B fallback hook — replace with real SWR call in follow-up batch.
function useDoctorCockpitTemplateOverride(): CockpitTemplateOverride {
  return null;
}
```

### 4. Verify the smoke matrix locally

Open `/dashboard/appointments/[id]` for:

- A video appointment with active consult → Telemed-Video template.
- A voice appointment with active consult → Telemed-Voice template (Body shrunk to ~15%, Plan ~75%).
- A text appointment → Telemed-Text template (Body ~40%).
- A completed appointment → Review template (Body hidden).
- (If Option A) Manually set `doctor_settings.cockpit_template_override = 'review'` via SQL → all appointments render Review.
- A walk-in appointment (no patient_id) → legacy 2-pane horizontal (no template runs).
- `?v1=1` → legacy 3-pane chart/body/rx (no template runs).

### 5. Layout persistence

The localStorage layout key is shared across all four templates (see `TELEMED_VIDEO_LAYOUT_STORAGE_KEY` in `frontend/lib/patient-profile/layout.ts`). When switching templates, saved column widths apply. Verify:

1. Open a video appointment. Drag the Snapshot/History split. Note the new sizes.
2. Open a voice appointment for the same doctor. The Snapshot/History sizes should match.
3. The Body / bottom-row sizes differ (because the natural sizes differ) — that's expected.

If the persistence behaves weirdly for the Review template (no Body leaf in the saved tree), check `flatToPaneTree` / `paneTreeToFlat` round-tripping; the existing layout-tree migrator handles trees of varying child counts. Capture-inbox if a real bug surfaces.

---

## Files touched

- **Modified:** `frontend/components/patient-profile/PatientProfilePage.tsx` (~30 LOC delta).
  - Add imports: `getTelemedVoiceTemplate`, `getTelemedTextTemplate`, `getReviewTemplate`, `mapStateToTemplate`.
  - Add `useDoctorCockpitTemplateOverride()` hook stub (or wire to existing settings cache).
  - Replace single-factory `useMemo` with dispatch-based `useMemo`.
  - Update `panesToMount` to reference `dispatchedTemplate`.

That's the entire surface. No other files.

---

## Acceptance gate

- [x] `pnpm --filter frontend tsc --noEmit` clean. `pnpm --filter frontend lint` clean. `pnpm --filter frontend build` clean. *(PatientProfilePage + doctor-settings types compile; pre-existing tsc errors in VoiceConsultRoom / PatientRibbon unrelated.)*
- [ ] `/dashboard/appointments/[id]` for a video appointment renders the existing Telemed-Video layout (regression test).
- [ ] Same path for a voice appointment renders Telemed-Voice (Body ~15%, Plan ~75%).
- [ ] Same path for a text appointment renders Telemed-Text (Body ~40%).
- [ ] Same path for a completed (`status='completed'`) appointment renders Review (Body hidden).
- [ ] (Option A only) Override pin: `UPDATE doctor_settings SET cockpit_template_override = 'review'` → every appointment renders Review.
- [ ] Walk-in (`patient_id == null`) renders legacy 2-pane horizontal layout. No template factory runs.
- [ ] Kill-switch `?v1=1` renders legacy 3-pane chart/body/rx layout.
- [ ] React DevTools: exactly one `<RxFormProvider>` in the tree across all four templates.
- [ ] Layout persistence works: column widths saved in Video apply to Voice + Text. Review template handles its missing Body leaf gracefully (no console error).
- [ ] No new console errors. No new Sentry errors in 5-min smoke session cycling all four templates.

**Status:** ✅ Implementation shipped 2026-05-23 — `mapStateToTemplate` dispatch + `useDoctorCockpitTemplateOverride` (Option A via `getDoctorSettings`). Manual smoke matrix deferred to tmr-05.

---

## Anti-goals

- ❌ Don't fire telemetry from this task — that's tmr-05.
- ❌ Don't add a Settings UI for the override — DL-5 defers.
- ❌ Don't change `RxFormProvider` mounting — single provider above the shell, unchanged from csf-01.
- ❌ Don't introduce a second template-cache layer. The `useMemo` is sufficient; React's referential stability handles re-renders.
- ❌ Don't add a "fallback to telemed-video on error" Try/Catch — `mapStateToTemplate` is a pure function with a complete truth table; if it throws, the bug is in tmr-02 not here.
- ❌ Don't introduce dynamic `import()` for the template factories — they're tree-shakeable but small; static imports are fine.

---

## Notes

- The dispatch `switch` is intentionally exhaustive. TypeScript's `CockpitTemplate` literal type enforces it; the default → video is defensive but should never run.
- If Option B is picked (no existing settings hook), capture-inbox the follow-up: "Read `cockpit_template_override` from doctor settings — needed for templates-r-mod DL-4." This task's verification still passes because the column-default is null and the dispatcher defaults to modality-based auto-select.
- This is the smallest of the five tasks in terms of LOC delta. Composer 2 Fast handles it in 1-2 turns.
- After this task ships, the page renders four different layouts depending on inputs. Cycling through them in DevTools is the smoke matrix. Document the four-image sequence in `docs/Reference/product/cockpit/COCKPIT.md` (tmr-05 does that).
