# task-cockpit-fix-1 — Wire `RxWorkspace` into the cockpit (delete `RxPaneMountSlot`)

**Lane:** H1 (Rx wiring) — runs in parallel with H2 / H3.  
**Status:** Drafted.  
**Effort:** XS (~10 minutes).  
**Owner:** TBD.  
**Hard deps:** none.

---

## Why

The cockpit redesign batch (cockpit-2 / cockpit-5) split the Rx pane work across two lanes:
- Lane α (cockpit-2) created a placeholder `RxPaneMountSlot` inside `ConsultationCockpit.tsx` with the comment *"// `appointment` and `token` are part of the locked lane-β contract; … cockpit-5 consumes them."*
- Lane β (cockpit-5) created `frontend/components/consultation/cockpit/RxWorkspace.tsx` matching the locked contract.

**The handoff was never landed.** The cockpit still imports nothing from cockpit-5; the dashed-border placeholder is what renders on the patient page right now (per the 2026-05-06 screenshots). It also leaks "Cockpit state: live" debug text to the user.

This task closes the handoff. **It is a 5-line edit.**

---

## What you'll change

**One file:** `frontend/components/consultation/ConsultationCockpit.tsx`.

1. Add an import for `RxWorkspace`.
2. Replace both `<RxPaneMountSlot ...>` JSX usages (desktop column + mobile sheet) with `<RxWorkspace ...>`.
3. Delete the entire `RxPaneMountSlot` function definition (it's no longer referenced).

This naturally removes the "Cockpit state: live" debug chip too — that text only existed inside the placeholder.

---

## Locked design

### Import

Add **next to** the existing imports near the top of `ConsultationCockpit.tsx`:

```tsx
import RxWorkspace from "./cockpit/RxWorkspace";
```

(Keep the existing `import { CockpitHeader } from "./cockpit/CockpitHeader";` style.)

### JSX swap

The `<RxPaneMountSlot>` JSX block currently used at **two places** (desktop layout and the mobile `<Sheet>`) takes these props:

```tsx
<RxPaneMountSlot
  state={cockpitState}
  appointment={appointment}
  token={token}
/>
```

`RxWorkspace`'s public signature (already shipped in cockpit-5) is:

```tsx
interface RxWorkspaceProps {
  appointmentId: string;
  patientId: string | null;
  token: string;
  state: CockpitState;
  onSent?: (prescriptionId: string) => void | Promise<void>;
}
```

Map the props as:

```tsx
<RxWorkspace
  appointmentId={appointment.id}
  patientId={appointment.patient?.id ?? null}
  token={token}
  state={cockpitState}
/>
```

(`onSent` is optional — leave it unset for now. A future task can wire system-banner emission.)

### Delete

After both JSX usages are swapped, delete the entire `function RxPaneMountSlot(...) { ... }` block (it's the function around line 535 of the file). Also delete the `RxPaneMountSlotProps` interface above it if you defined one separately, and any `void appointment; void token;` lint-quieting lines.

### Don't touch

- Do **not** touch the chart-rail / center-pane logic.
- Do **not** edit `ConsultationLauncher`, `RxWorkspace`, or any other file. (If the build complains about unused imports after the delete, fix only those imports.)

---

## Acceptance

```
- [ ] `frontend/components/consultation/ConsultationCockpit.tsx`:
      - imports RxWorkspace from "./cockpit/RxWorkspace"
      - both JSX usages of <RxPaneMountSlot ...> replaced with <RxWorkspace ...>
      - the function `RxPaneMountSlot` is gone (file is shorter by ~30 lines)
- [ ] `rg "RxPaneMountSlot" frontend/` returns zero matches.
- [ ] `rg "Rx workspace — wired in cockpit-5" frontend/` returns zero matches.
- [ ] `rg "Cockpit state:" frontend/` returns zero matches.
- [ ] `cd frontend && npx tsc --noEmit` clean.
- [ ] `cd frontend && npx next lint` clean (or no NEW errors vs. main).
- [ ] Smoke: open `/dashboard/appointments/<live-appt-id>`. The right column
      shows the real <RxWorkspace> (PrescriptionForm + sticky bottom bar).
- [ ] Smoke (mobile): collapse window, open the Rx <Sheet> via the bottom pill —
      same <RxWorkspace> renders.
```

---

## Model & execution guidance

**Recommended model:** **Composer 2 Fast**.

This is a textbook Composer task: import-line replacement, two JSX find-and-replaces, one function deletion. No design judgement needed (the design is fully locked above). Composer can do this in one turn.

**Pre-load in the chat:**

1. The full text of this task file.
2. The current `frontend/components/consultation/ConsultationCockpit.tsx` (open in editor before starting).
3. The current `frontend/components/consultation/cockpit/RxWorkspace.tsx` (so the agent can confirm the prop signature).

**One-shot prompt template:**

```
Read frontend/components/consultation/ConsultationCockpit.tsx and frontend/components/consultation/cockpit/RxWorkspace.tsx. Then apply the locked-design section of docs/Work/Daily-plans/May 2026/06-05-2026/Tasks/task-cockpit-fix-1-wire-rx-workspace.md exactly:

1. Import RxWorkspace from ./cockpit/RxWorkspace
2. Replace both <RxPaneMountSlot ...> usages with <RxWorkspace appointmentId={appointment.id} patientId={appointment.patient?.id ?? null} token={token} state={cockpitState} />
3. Delete the RxPaneMountSlot function entirely.

After editing, run npx tsc --noEmit (cd frontend) and report the result.
```

**Do NOT use Opus for this.** It's a one-turn pattern match.

---

## References

- Parent: [plan-cockpit-hardening-batch.md](../plan-cockpit-hardening-batch.md)
- Order: [EXECUTION-ORDER-cockpit-hardening.md](./EXECUTION-ORDER-cockpit-hardening.md)
- Component shipped in cockpit-5: `frontend/components/consultation/cockpit/RxWorkspace.tsx`
- Placeholder being deleted: `frontend/components/consultation/ConsultationCockpit.tsx:521-563` (approximate; confirm before edit)

---

**Status:** `Drafted` — ready to execute.
