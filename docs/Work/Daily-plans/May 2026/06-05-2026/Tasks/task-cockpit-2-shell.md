# Task cockpit-2: Three-pane cockpit shell

## 06 May 2026 — Batch [Cockpit redesign](../plan-cockpit-redesign-batch.md) — Lane α step 1 — **M, ~5h**

---

## Task overview

Replaces `AppointmentDetailWorkArea` (the 4-tab work area) with a new client component `ConsultationCockpit` that renders three columns at all times: **chart left, room/summary center, Rx workspace right**. Both side rails collapsible (and persisted per-doctor). The center pane today is a placeholder; cockpit-3 wires the state-driven content into it.

This is the architectural anchor for the whole batch. Get the layout, hydration boundaries, and rail collapse story right here, and cockpit-3/4/5/7 are mechanical fills.

**Estimated time:** ~5h. ~30min Opus design (hydration + layout), ~4h Sonnet impl, ~30min CSS pass (Composer).

**Status:** Shipped (2026-05-06).

**Hard deps:** [cockpit-1](./task-cockpit-1-state-machine.md) shipped. A2 primitives (`Tabs`, `Card`, `Button`, `Badge`, `Sheet`, `Tooltip`) shipped (verified by D1).

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Extra High** for the layout / hydration design call (~30min, Plan Mode), then **Sonnet 4.6 Medium** for impl. Pattern B.

**Why Opus for design:** three failure modes lurk —
1. The page is a server component (`page.tsx` uses `await params` + `redirect`); putting `<Tabs>`-like client APIs there silently fails.
2. The chart rail is `position: sticky` with `h-screen`; nesting it in a CSS grid that also has `xl:sticky top-20` on the right column will fight the parent scroll container.
3. Lane β (cockpit-5) builds `RxWorkspace` in isolation; this task must define the **mount slot** for it (a single import line + a single `<RxWorkspace ... />` JSX node) so β can plug in without touching this file again.

One Opus turn nails the boundaries; Sonnet types it out.

**New chat?** **Yes — split:**

1. **Opus design chat (~30min, Plan Mode):**
   - Pre-load: this task file + `frontend/app/dashboard/appointments/[id]/page.tsx` + `frontend/components/consultation/AppointmentDetailWorkArea.tsx` + `frontend/components/ehr/AppointmentChartRail.tsx`.
   - Ask: *"Design the `ConsultationCockpit` client island: server/client boundary, 3-column grid behavior at xl/lg/<lg, both rails collapse strategy, mount slot contract for `RxWorkspace` (lane β). Output a 1-page implementation spec."*

2. **Sonnet impl chat (~3.5h):**
   - Pre-load: this task file + the locked spec from Opus chat 1.
   - Build the cockpit shell with placeholder center pane + Rx slot mount.

**Lane β can start as soon as the mount slot lands** — even before cockpit-3 ships. Once the impl chat for cockpit-2 commits the file with `<RxWorkspaceMountSlot />` (or equivalent), ping the β chat.

**Multi-chat coordination:**
- This is the **only** task in lane α that **also coordinates** with lane β. Post a one-line ping in the β window when the mount slot is committed.
- γ and δ can already be running. Don't ping them.

**Escalate per-message to Opus** if Sonnet ships a layout where the chart rail loses its sticky behavior (most likely failure mode — flexbox vs grid sticky containers).

**Composer-OK sub-steps:** the final CSS-only pass for token swaps (e.g. `bg-white` → `bg-card` in any leftover spots) is fine for Composer.

---

## Acceptance criteria

### Layout

- [ ] **At `xl+` (≥1280px):** 12-col grid, `chart 3 / room 5 / rx 4`. Chart and Rx rails sticky and independently scrolling. Room column is the page's main scroll.
- [ ] **At `lg` (1024–1279px):** chart 3 / room 6 / rx 3 — Rx narrows but stays visible. If width < 1100px, Rx pane shows a "📝 Open Rx" pill and the actual `RxWorkspace` opens in a right-side `<Sheet>`. Room pane expands to fill.
- [ ] **At `<lg`:** stacked, chart on top (collapsed accordion), room middle, Rx bottom — UNTIL cockpit-7 lands the bottom-pill UX. cockpit-2 ships the simple stacked fallback.

### Rail collapse

- [ ] Chart rail re-uses `<AppointmentChartRail>` as-is (it already has the `localStorage` collapse logic with key `ehr_chart_collapsed_v1`).
- [ ] Rx rail gets a sibling toggle. New tiny component `frontend/components/consultation/cockpit/RxRailToggle.tsx` — chevron button + `localStorage` key `cockpit_rx_collapsed_v1`. Same behaviour: collapsed = `w-12` icon-only stub with vertical "Prescription" label; expanded = full pane.
- [ ] Both rails default `expanded` on first visit. Persistence per browser, per doctor (no server-side persist).

### Server / client boundary

- [ ] `frontend/app/dashboard/appointments/[id]/page.tsx` stays a **server component**. It does the auth + `getAppointmentById` + error states verbatim from D1, then mounts:

  ```tsx
  <ConsultationCockpit appointment={appointment} token={token} />
  ```

  Header markup currently in the page (back link, h1, status badge, meta strip) **stays in the server component for fast first paint**. cockpit-4 moves the header inside the cockpit later; cockpit-2 leaves it in the page.

- [ ] `frontend/components/consultation/ConsultationCockpit.tsx` is `"use client"`. It owns the 3-column grid, both rail-collapse states, and renders three children:
  - `<ChartPane />` (wraps `<AppointmentChartRail>`)
  - `<CenterPane state={...} appointment={...} token={...} />` — **placeholder in cockpit-2**, filled by cockpit-3
  - `<RxPane state={...} appointment={...} token={...} />` — mounts cockpit-5's `<RxWorkspace>` once it lands; in cockpit-2 mounts a placeholder card with text *"Rx workspace — wired in cockpit-5"*

### State derivation

- [ ] Cockpit derives `state: CockpitState` from `cockpit-1`'s helper at the top of its render function:

  ```ts
  const state = deriveCockpitState({
    appointmentStatus: appointment.status,
    session: appointment.consultation_session,
  });
  ```

- [ ] Pass `state` to both `<CenterPane>` and `<RxPane>` so they react.

### Walk-in handling (no `patient_id`)

- [ ] If `!appointment.patient_id`, hide the chart pane and stretch the room/rx columns: `room 6 / rx 6` at `xl+`. cockpit-2 does NOT add a "Promote to chart record" CTA — that's deferred.
- [ ] Use the `shouldShowChartRail(state, !!appointment.patient_id)` helper from cockpit-1.

### Behavior preservation

- [ ] Auth, fetch, error UI, "Back to appointments" link, page header all untouched in this task.
- [ ] Plan-07 / D1 / video-D1 JSDoc blocks living inside `AppointmentDetailWorkArea`'s artifacts tab — **carry verbatim into a temporary file note** at the top of `ConsultationCockpit.tsx`. cockpit-3 will move them next to the surfaces they document.

### General

- [ ] Type-check + lint clean.
- [ ] Mobile breakpoints verified at 375 / 768 / 1024 / 1280 / 1440.
- [ ] No console errors.
- [ ] No raw color classes — token-only.

---

## Skeleton (impl chat starts from here)

```tsx
"use client";

import { useEffect, useState } from "react";
import AppointmentChartRail from "@/components/ehr/AppointmentChartRail";
import RxRailToggle from "./cockpit/RxRailToggle";
import {
  deriveCockpitState,
  shouldShowChartRail,
} from "@/lib/consultation/cockpit-state";
import type { Appointment } from "@/types/appointment";

interface Props {
  appointment: Appointment;
  token: string;
}

const RX_COLLAPSE_KEY = "cockpit_rx_collapsed_v1";

export default function ConsultationCockpit({ appointment, token }: Props) {
  const state = deriveCockpitState({
    appointmentStatus: appointment.status,
    session: appointment.consultation_session,
  });

  const showChart = shouldShowChartRail(state, !!appointment.patient_id);
  const [rxCollapsed, setRxCollapsed] = useState(false);
  useEffect(() => {
    setRxCollapsed(localStorage.getItem(RX_COLLAPSE_KEY) === "1");
  }, []);

  // Grid template adapts to (showChart, rxCollapsed). At lg / xl+:
  //   showChart && !rxCollapsed → "3 5 4"
  //   showChart &&  rxCollapsed → "3 8 1" (Rx becomes a w-12 stub via inner styles)
  //  !showChart && !rxCollapsed → "0 6 6"
  //  ...etc.
  // For cockpit-2, simplest: render 3 col-span-N divs and let the inner components
  // own their own widths via Tailwind classes — keeps the grid pure.

  return (
    <div className="lg:grid lg:grid-cols-12 lg:gap-0">
      {showChart && (
        <div className="lg:col-span-3">
          <AppointmentChartRail
            patientId={appointment.patient_id!}
            doctorId={appointment.doctor_id ?? undefined}
            token={token}
            appointmentId={appointment.id}
          />
        </div>
      )}

      <div className={showChart ? "lg:col-span-5" : "lg:col-span-6"}>
        {/* CenterPane — placeholder in cockpit-2, real in cockpit-3 */}
        <CenterPanePlaceholder state={state} />
      </div>

      <div
        className={
          showChart
            ? rxCollapsed
              ? "lg:col-span-1"
              : "lg:col-span-4"
            : rxCollapsed
              ? "lg:col-span-1"
              : "lg:col-span-6"
        }
      >
        <RxRailToggle
          collapsed={rxCollapsed}
          onToggle={() => {
            setRxCollapsed((v) => {
              const next = !v;
              localStorage.setItem(RX_COLLAPSE_KEY, next ? "1" : "0");
              return next;
            });
          }}
        />
        {!rxCollapsed && (
          <RxPaneMountSlot state={state} appointment={appointment} token={token} />
        )}
      </div>
    </div>
  );
}
```

`RxPaneMountSlot` is the **lane-β contract**: cockpit-5 replaces it with the real `<RxWorkspace>`. Until then, render a placeholder card with a one-line "Rx workspace — wired in cockpit-5" hint.

---

## Out of scope

- **State-driven center content.** That's cockpit-3.
- **The new header / modality split button.** That's cockpit-4. cockpit-2 keeps the existing page header.
- **`RxWorkspace` itself.** That's cockpit-5. cockpit-2 only defines the mount slot.
- **Mobile bottom-pill UX.** That's cockpit-7.
- **Deleting `AppointmentDetailWorkArea`.** Done in cockpit-4 (after the header migration is complete).

---

## Files expected to touch

**New:**
- `frontend/components/consultation/ConsultationCockpit.tsx` (~150 LOC for cockpit-2's scope; grows in cockpit-3/4/7)
- `frontend/components/consultation/cockpit/RxRailToggle.tsx` (~50 LOC)

**Modified:**
- `frontend/app/dashboard/appointments/[id]/page.tsx` — replace `<AppointmentDetailWorkArea>` mount with `<ConsultationCockpit>`. Keep the page header above for now (cockpit-4 absorbs it).

**Deleted:** none in this task. (`AppointmentDetailWorkArea` lives until cockpit-4.)

---

## Notes / open decisions

1. **Why both rails collapsible and not full-screen toggleable.** The doctor's most common state during a video call is "all three columns visible." Full-screen toggles are a power-user feature; collapse rails covers 95%.
2. **Why not Resizable panels.** Tempting but adds complexity (drag handles, layout-shift on first paint, persistence). Lock to a fixed grid for V1; revisit if telemetry shows doctors want it.
3. **Why a placeholder center pane in cockpit-2.** Lane β unblocks 3h sooner. Worth the temporary placeholder.
4. **Why the page header stays in the server component for now.** Faster first paint; cockpit-4 absorbs it once the modality split-button design is locked.

---

## References

- **Batch plan:** [plan-cockpit-redesign-batch.md § Lane α](../plan-cockpit-redesign-batch.md#lane-α--cockpit-core-4-tasks-14h-sequential)
- **Hard dep:** [task-cockpit-1-state-machine.md](./task-cockpit-1-state-machine.md)
- **Sibling lane β:** [task-cockpit-5-rx-workspace.md](./task-cockpit-5-rx-workspace.md) (consumes the mount slot landed here)
- **Surface this supersedes:** [task-ui-D1-appointment-detail-three-zone.md](./task-ui-D1-appointment-detail-three-zone.md)
- **Cost strategy — Pattern B:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md § Pattern B](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md#pattern-b-new-feature--no-spec-yet)

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Shipped (2026-05-06).
