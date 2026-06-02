# Task ppr-07: Plug panes into shell + mount header strip

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 2, Lane α step 1 — **S, ~2h**

---

## Task overview

Replace the three synthetic `<div>` panes in `<PatientProfilePage>` (set up by ppr-03) with the real medical panes (`<PatientChartPane>` / `<ConsultationBodyPane>` / `<RxPane>` from ppr-04/05/06). Mount the existing header strip (`<CockpitHeader>` + `<CockpitQueueRail>`) above the shell.

End-of-task: `/dashboard/appointments/[id]/v2` is **functionally indistinguishable from `/v1`** for a `ready` state appointment. Hotkeys, presets, walk-in mode still not wired (those come in Wave 3).

**Estimated time:** ~2h.

**Status:** Pending.

**Hard deps:** ppr-03 (shell), ppr-04 (body), ppr-05 (rx), ppr-06 (chart).

**Source:** R2.4 + R2.5 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/components/patient-profile/PatientProfilePage.tsx` (ppr-03 output — three synthetic panes).
- `frontend/components/patient-profile/Shell.tsx` (ppr-03 output).
- `frontend/components/patient-profile/panes/ConsultationBodyPane.tsx` (ppr-04 output).
- `frontend/components/patient-profile/panes/RxPane.tsx` (ppr-05 output).
- `frontend/components/patient-profile/panes/PatientChartPane.tsx` (ppr-06 output).
- `frontend/components/consultation/ConsultationCockpit.tsx` — the wiring around `<CockpitHeader>` and `<CockpitQueueRail>` we mirror:
  - Search for `<CockpitHeader` and `<CockpitQueueRail`.
  - Note the props each receives (appointment, state, modality, onWrapUp, layout setters, preset hooks, etc.).
- `frontend/lib/consultation/cockpit-state.ts` (`deriveCockpitState`).

**Estimated turns:** 4–6 turns.

---

## Acceptance criteria

### Construct the `panes` array in `<PatientProfilePage>`

- [ ] Replace the synthetic panes from ppr-03 with the real ones:

  ```tsx
  "use client";

  import { useMemo, useRef, useState } from "react";
  import { deriveCockpitState, shouldShowChartRail } from "@/lib/consultation/cockpit-state";
  import type { Appointment } from "@/types/appointment";
  import type { ConsultationLauncherHandle } from "@/components/consultation/ConsultationLauncher";
  import CockpitHeader from "@/components/consultation/cockpit/CockpitHeader";
  import CockpitQueueRail from "@/components/consultation/cockpit/CockpitQueueRail";
  import PatientProfileShell from "@/components/patient-profile/Shell";
  import PatientChartPane, {
    PatientChartCollapsedStrip,
  } from "@/components/patient-profile/panes/PatientChartPane";
  import ConsultationBodyPane from "@/components/patient-profile/panes/ConsultationBodyPane";
  import RxPane from "@/components/patient-profile/panes/RxPane";
  import type { PaneDefinition } from "@/lib/patient-profile/types";

  interface PatientProfilePageProps {
    appointment: Appointment;
    token: string;
  }

  export default function PatientProfilePage({ appointment, token }: PatientProfilePageProps) {
    const launcherRef = useRef<ConsultationLauncherHandle>(null);
    const [rxMedicineCount, setRxMedicineCount] = useState(0);

    const state = useMemo(
      () => deriveCockpitState({
        appointmentStatus: appointment.status,
        session: appointment.consultation_session ?? null,
      }),
      [appointment.status, appointment.consultation_session],
    );

    const hasPatientId = Boolean(appointment.patient_id);
    const showChart = shouldShowChartRail(state, hasPatientId);

    const panes: PaneDefinition[] = useMemo(() => {
      const all: PaneDefinition[] = [
        {
          id: "chart",
          title: "Patient chart",
          render: () => <PatientChartPane appointment={appointment} token={token} hideHeader />,
          collapsedRender: () => <PatientChartCollapsedStrip onExpand={/* shell handles */ () => undefined} />,
          minSizePct: 12,
          naturalSizePct: 26,
          hotkey: "mod+1",
        },
        {
          id: "body",
          title: "Consultation",
          render: () => (
            <ConsultationBodyPane
              state={state}
              appointment={appointment}
              token={token}
              launcherRef={launcherRef}
              hideHeader
            />
          ),
          minSizePct: 18,
          naturalSizePct: 48,
          hotkey: "mod+2",
        },
        {
          id: "rx",
          title: "Prescription",
          render: () => (
            <RxPane
              appointment={appointment}
              token={token}
              state={state}
              onMedicineCountChange={setRxMedicineCount}
              hideHeader
            />
          ),
          minSizePct: 14,
          naturalSizePct: 26,
          hotkey: "mod+3",
        },
      ];

      // DL-11 walk-in: filter out the chart pane when there's no patient_id.
      return showChart ? all : all.filter((p) => p.id !== "chart");
    }, [appointment, token, state, showChart]);

    const storageKey = showChart ? "patient-profile:v1:layout" : "patient-profile:v1:walkin-layout";

    return (
      <div className="flex h-screen flex-col">
        <CockpitHeader
          appointment={appointment}
          token={token}
          state={state}
          // ... wire all the other props CockpitHeader needs today (see ConsultationCockpit.tsx for the full list).
        />
        <CockpitQueueRail
          appointment={appointment}
          /* ... */
        />
        <div className="min-h-0 flex-1">
          <PatientProfileShell panes={panes} storageKey={storageKey} />
        </div>
      </div>
    );
  }
  ```

- [ ] **`hideHeader={true}` on every pane** — the shell's `<ColumnHeader>` (introduced in ppr-03) is the canonical column header. Panes contribute only their body.

### Mount `<CockpitHeader>` and `<CockpitQueueRail>` above the shell

- [ ] The two header components are imported as-is from `@/components/consultation/cockpit/**`. v2 is allowed to import them from `PatientProfilePage.tsx` (DL-2 carve-out — the page is the bridge).
- [ ] Wire every prop these two components receive in v1's `ConsultationCockpit.tsx`. Concretely you'll need:
  - For `<CockpitHeader>`: appointment, token, state, modality, primary CTA wiring (`primaryCtaFor(state, modality)`), wrap-up open/close handlers, mark-no-show handler, layout dropdown props (preset apply, save, manage — wired to a no-op for ppr-07; ppr-09 supplies the real handlers).
  - For `<CockpitQueueRail>`: appointment + the result of `useDoctorDayPipeline()` (or whatever v1 passes today).
- [ ] **Best-effort wire stubs:** props that only ppr-09 (presets) or ppr-10 (hotkeys) will actually drive can take `() => undefined` placeholders in ppr-07. Comment each placeholder with the task that fills it. ppr-09 / ppr-10 then replace each in-place.

### Walk-in handling (DL-11 carve-out)

- [ ] When `appointment.patient_id` is null, the panes array filters out `"chart"` and the shell uses the `walkin-layout` storage key.
- [ ] The chart-filtering test: open a walk-in appointment (or seed one) on `/v2` → shell renders only `body` + `rx` columns. Resize / collapse / reorder still work between those two.

### Shell mount

- [ ] `<PatientProfileShell>` is mounted inside a `<div className="min-h-0 flex-1">` so the header strip stays at the natural height and the shell takes the remaining vertical space (matches v1's flex layout).

### Tests

- [ ] No new tests in ppr-07 (the panes are already covered; the shell is covered by ppr-03's tests; the only new code here is the panes-array construction, which is purely declarative).
- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean — the ESLint zone for `PatientProfilePage.tsx` is **already lifted** (DL-2 lets the page import medical concepts).

### Manual smoke

- [ ] Open `/dashboard/appointments/[real-id]/v2` for a `ready` state appointment.
- [ ] `<CockpitHeader>` renders at top (patient name, status badge, primary CTA).
- [ ] `<CockpitQueueRail>` renders below the header (queue strip with prev / next chevrons).
- [ ] Three columns render below the queue rail: Patient chart (with real allergies / problems / vitals), Consultation (lobby card / Ready card / Launcher depending on state), Prescription (workspace with empty medicines / tests / diagnosis).
- [ ] **Side-by-side v1 vs v2:** open both routes in two tabs. They are visually indistinguishable for `ready` state.
- [ ] Drag, resize, collapse, reorder all work on real content.
- [ ] Walk-in test: open a walk-in appointment on `/v2`. Chart column is absent. Body + Rx render. Layout-key differs from the 3-pane layout (don't share saved widths).

---

## Out of scope

- **Hotkeys.** ppr-10 wires `useShellHotkeys` to the shell's setters.
- **Presets / Layout dropdown actions.** ppr-09 supplies the apply / save / manage handlers; ppr-07 uses no-op placeholders.
- **One-time localStorage seed.** ppr-08 supplies the migration helper; ppr-07 uses the default layout on first load.
- **Renaming `<CockpitHeader>` to `<PatientProfileHeader>`.** ppr-13 does the post-flip renames.

---

## Files expected to touch

**New:** none.

**Modified:**
- `frontend/components/patient-profile/PatientProfilePage.tsx` (~150 LOC — replaces the ppr-03 placeholder with the real panes-array construction and header strip mounting).

**Tests:** none added.

---

## Notes / open decisions

1. **Why is `rxMedicineCount` state lifted to the page?** The original `ConsultationCockpit.tsx` lifts it because the cc-14 `<CollapsedRxRail>` reads the live medicine count from the form. `<RxPane>` keeps that prop. In v2, when the Rx pane is collapsed, the collapsed renderer (`CollapsedRxRail` reused) needs the same count. The page lifts it.
2. **Why does the chart pane's `collapsedRender` pass a no-op `onExpand`?** The shell handles collapse/expand via its own state. The chart's collapsed-strip click should trigger `setPaneCollapsed("chart", false)` on the shell, but the shell wires that automatically through its `DefaultCollapsedStub`. The chart pane's custom `collapsedRender` will need to receive an `onExpand` callback from the shell — wire this in ppr-07 if not already in ppr-03's contract, or skip the collapsed-render for chart and let the default stub work.
3. **Why mount `<CockpitHeader>` and `<CockpitQueueRail>` in `<PatientProfilePage>` and not in `<Shell>`?** DL-2. The shell is content-agnostic; the page is the bridge. The header strip is medical content that happens to live above the panes.

---

## References

- **Affected files:**
  - mod `frontend/components/patient-profile/PatientProfilePage.tsx` (~+120 LOC)
- **Source decisions:** R2.4 + R2.5 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).
- **Reference (full prop wiring for CockpitHeader / CockpitQueueRail):** `frontend/components/consultation/ConsultationCockpit.tsx`.
- **Next task:** [`task-ppr-08-layout-module-and-localstorage-seed.md`](./task-ppr-08-layout-module-and-localstorage-seed.md) — fresh chat (different concerns: persistence + migration).

---

**Owner:** TBD
**Created:** 2026-05-13
**Status:** Pending
