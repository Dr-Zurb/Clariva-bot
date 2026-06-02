# cv3s-01 — Feature flag + parallel mount + Cockpit v3 stub shell

| | |
|---|---|
| **Batch** | [p0-cockpit-v3-scaffold (Phase 0)](../plan-p0-cockpit-v3-scaffold-batch.md) |
| **Wave / lane** | Wave 1 / lane α |
| **Size** | S |
| **Model** | Auto |
| **Depends on** | pane-freedom Phases 1–4 merged |
| **Blocks** | Phase 1 (R-SHELL3 fills the stub) |
| **Status** | Done |

> **Additive + flag-gated.** Every change here is behind `NEXT_PUBLIC_COCKPIT_V3`, off by default. The flag-off render path must be **byte-identical to today** (P0-DL-1) — when the flag is off, no v3 code runs. This is the Strangler Fig switch (v3-DL-9); get the no-op right and the rest of the program is safe to build behind it.

---

## Objective

Stand up the parallel v3 surface:

1. A `NEXT_PUBLIC_COCKPIT_V3` env flag + a one-line `cockpitV3Enabled()` helper (P0-DL-1).
2. A guarded branch at the single shell mount in `PatientProfilePage.tsx` (~line 1124): flag-on renders `<CockpitV3Shell …>`, flag-off renders today's `<PatientProfileShell …>` — with the **same props**.
3. A `CockpitV3Shell` **stub** under `frontend/components/patient-profile/v3/` that renders a labelled placeholder, with the real `safetyDock` (top) + `actionDock` (bottom) around it on desktop and a flat placeholder (no docks) on mobile (P0-DL-2, P0-DL-3, v3-DL-8).

No real shell, no DnD, no palette (that's Phase 1+). The deliverable is a flippable, dogfoodable parallel mount that proves the providers + dock geometry line up before any renderer exists.

---

## Why (context)

The cockpit mounts at exactly one place — inside `pageContent`, the resizable shell region:

```1122:1146:frontend/components/patient-profile/PatientProfilePage.tsx
      {/* ── Resizable pane shell — takes remaining vertical space ─────────── */}
      <div className="min-h-0 flex-1">
        <PatientProfileShell
          ref={shellRef}
          panes={panes}
          storageKey={storageKey}
          legacyStorageKeys={
            layoutLegacyStorageKeys.length > 0
              ? layoutLegacyStorageKeys
              : undefined
          }
          onLayoutChange={handleLayoutChange}
          onLayoutTreeChange={setCurrentLayoutTree}
          paneMoveUx={paneMoveUx}
          customizeMode={customizeMode}
          safetyDock={<SafetyStickyStrip appointmentId={appt.id} />}
          actionDock={
            <PlanActionFooter
              state={state}
              appointmentId={appt.id}
              finishBusy={finishBusy}
            />
          }
        />
      </div>
```

This is the only branch point we need. Two facts make the stub's docks work for free:

- **The Rx providers are already page-root.** `RxFormProvider` / `RxSafetyProvider` / `RxFormActionsBridgeProvider` wrap `pageContent` (pane-freedom Phase 4). `SafetyStickyStrip` (reads `useRxSafety()`) and `PlanActionFooter` (reads `useRxFormActions()`) therefore work wherever they mount inside the page — including inside the stub. **No provider move.**
- **Feature flags here are `NEXT_PUBLIC_*` env vars** (see `frontend/lib/api-base.ts`, `frontend/.env.example`). A `process.env.NEXT_PUBLIC_COCKPIT_V3` check is the repo-native pattern; NEXT_PUBLIC vars are statically inlined at build, so the off-path is fully dead-code-eliminated in production builds where the flag is unset.

---

## Files to touch / create

| File | Change |
|---|---|
| `frontend/.env.example` | **Edit** — document `NEXT_PUBLIC_COCKPIT_V3`. |
| `frontend/lib/patient-profile/v3/flags.ts` | **Create** — `cockpitV3Enabled()` helper. |
| `frontend/components/patient-profile/v3/CockpitV3Shell.tsx` | **Create** — the stub shell (placeholder + docks). |
| `frontend/components/patient-profile/PatientProfilePage.tsx` | **Edit** — import the flag + stub; branch the shell mount. |

**Do not** touch `Shell.tsx`, `templates.tsx`, `layout-tree*.ts`, `types.ts`, or anything under `panes/` (P0-DL-5).

---

## Implementation

### Step 1 — The flag helper

`frontend/lib/patient-profile/v3/flags.ts`:

```ts
/**
 * Cockpit v3 rollout gate (Phase 0 — cv3s-01).
 *
 * Env flag, off by default. When falsy, the patient profile renders today's
 * cockpit byte-identically (P0-DL-1). A per-doctor opt-in setting is deferred
 * (V3-Q7 fast-follow) — Phase 0 dogfoods via the env flag only.
 *
 * NEXT_PUBLIC_* is inlined at build, so the off-path is statically dead in
 * production builds where the flag is unset.
 */
export function cockpitV3Enabled(): boolean {
  return process.env.NEXT_PUBLIC_COCKPIT_V3 === "1";
}
```

### Step 2 — The stub shell

`frontend/components/patient-profile/v3/CockpitV3Shell.tsx`. Accept the same props the page already passes to `PatientProfileShell` (so the branch is a drop-in), but Phase 0 only *uses* the docks + a placeholder; the layout props are accepted-and-ignored for now (Phase 1 wires them):

```tsx
"use client";

import type { ReactNode } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export interface CockpitV3ShellProps {
  /** Accepted for drop-in parity with PatientProfileShell; unused in the Phase 0 stub. */
  panes?: unknown;
  storageKey?: string;
  /** Anchored clinical-safety chrome (v3-DL-6 / P0-DL-3). */
  safetyDock?: ReactNode;
  /** Anchored "Send Rx & finish" footer (v3-DL-6 / P0-DL-3). */
  actionDock?: ReactNode;
  /** Other PatientProfileShell props are accepted but ignored in Phase 0. */
  [key: string]: unknown;
}

/**
 * Cockpit v3 — Phase 0 STUB (cv3s-01).
 *
 * No editor-group rendering, no DnD, no palette yet (P0-DL-2 — those are Phase 1+).
 * Proves the parallel mount + the anchored dock geometry (safety on top, action
 * footer on bottom) before the real shell exists. Desktop only renders docks
 * (v3-DL-8 / P0-DL-3); mobile shows a flat placeholder.
 *
 * Must NOT import Shell.tsx / customize-mode-context (P0-DL-4).
 */
export default function CockpitV3Shell({
  safetyDock,
  actionDock,
}: CockpitV3ShellProps) {
  const isLg = useMediaQuery("(min-width: 1024px)", true);

  const placeholder = (
    <div
      data-testid="cockpit-v3-stub"
      className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground"
    >
      <div className="rounded-md border border-dashed border-border px-4 py-3 text-center">
        <div className="font-medium text-foreground">Cockpit v3 — scaffold</div>
        <div className="mt-1">Editor-group shell lands in Phase 1.</div>
      </div>
    </div>
  );

  if (!isLg) {
    // Mobile: flat placeholder, no docks (v3-DL-8 / P0-DL-3 desktop-only).
    return (
      <div
        data-testid="p1-cockpit-v3-shell-mobile"
        className="flex h-full w-full flex-col"
      >
        {placeholder}
      </div>
    );
  }

  // Desktop: docks anchored around the (stub) pane area — the cutover geometry.
  return (
    <div
      data-testid="p1-cockpit-v3-shell-desktop"
      className="flex h-full w-full flex-col"
    >
      {safetyDock ? <div className="shrink-0">{safetyDock}</div> : null}
      {placeholder}
      {actionDock ? <div className="shrink-0">{actionDock}</div> : null}
    </div>
  );
}
```

> **Why accept-and-ignore the layout props?** Keeping `CockpitV3ShellProps` a superset of what the page passes makes Step 3 a clean one-line branch with no prop juggling, and gives Phase 1 the exact prop surface to start wiring. The `[key: string]: unknown` index signature lets the page spread its existing props without TS friction in Phase 0.

### Step 3 — Branch the mount

In `PatientProfilePage.tsx`, add the imports near the other patient-profile imports:

```tsx
import CockpitV3Shell from "@/components/patient-profile/v3/CockpitV3Shell";
import { cockpitV3Enabled } from "@/lib/patient-profile/v3/flags";
```

Then wrap the existing shell mount (the block shown in *Why* above) in the flag branch. Keep the existing `<PatientProfileShell … />` exactly as-is in the `else` path:

```tsx
      {/* ── Resizable pane shell — takes remaining vertical space ─────────── */}
      <div className="min-h-0 flex-1">
        {cockpitV3Enabled() ? (
          <CockpitV3Shell
            panes={panes}
            storageKey={storageKey}
            safetyDock={<SafetyStickyStrip appointmentId={appt.id} />}
            actionDock={
              <PlanActionFooter
                state={state}
                appointmentId={appt.id}
                finishBusy={finishBusy}
              />
            }
          />
        ) : (
          <PatientProfileShell
            ref={shellRef}
            panes={panes}
            storageKey={storageKey}
            legacyStorageKeys={
              layoutLegacyStorageKeys.length > 0
                ? layoutLegacyStorageKeys
                : undefined
            }
            onLayoutChange={handleLayoutChange}
            onLayoutTreeChange={setCurrentLayoutTree}
            paneMoveUx={paneMoveUx}
            customizeMode={customizeMode}
            safetyDock={<SafetyStickyStrip appointmentId={appt.id} />}
            actionDock={
              <PlanActionFooter
                state={state}
                appointmentId={appt.id}
                finishBusy={finishBusy}
              />
            }
          />
        )}
      </div>
```

> **`shellRef`:** the v3 stub doesn't take a ref in Phase 0. Leave the `ref={shellRef}` on the `PatientProfileShell` branch only. If TS complains about an unused ref when the flag is on, that's fine — it's still wired to the real shell on the off-path. (Phase 1 gives `CockpitV3Shell` its own imperative handle if needed.)

### Step 4 — Document the flag

In `frontend/.env.example`, add (near the other `NEXT_PUBLIC_*` entries):

```bash
# Cockpit v3 rollout gate (p0-cockpit-v3-scaffold / cv3s-01). Off by default.
# Set to "1" to dogfood the v3 cockpit shell (Phase 0 = labelled stub).
# When unset, the patient profile renders today's cockpit unchanged.
NEXT_PUBLIC_COCKPIT_V3=
```

---

## Tests

Phase 0 is light on tests by design, but add a focused render test for the stub + branch (a new `v3/__tests__/CockpitV3Shell.test.tsx` is cleanest):

1. **Desktop stub renders docks.** Render `<CockpitV3Shell safetyDock={<div data-testid="dock-safety"/>} actionDock={<div data-testid="dock-action"/>} />` with `matchMedia` mocked to `lg+`; assert `p1-cockpit-v3-shell-desktop`, `dock-safety`, `cockpit-v3-stub`, and `dock-action` all present, with safety before the stub and action after.
2. **Mobile stub omits docks.** Mock `matchMedia` to `<lg`; assert `p1-cockpit-v3-shell-mobile` + `cockpit-v3-stub` present, and `dock-safety` / `dock-action` **absent** (v3-DL-8).
3. **No forbidden imports.** A simple source assertion (or eslint) that `CockpitV3Shell.tsx` / `flags.ts` import neither `Shell` nor `customize-mode-context` (P0-DL-4). (Can be a grep in CI; for Phase 0 a code-review check is acceptable.)

The flag-branch in `PatientProfilePage` is covered manually (set the env, load a patient) — a full page-render test is out of scope (it pulls the whole provider tree and trips the known `useShellLayout` hang).

Run:

```bash
cd frontend
npx tsc --noEmit
npm test -- components/patient-profile/v3/__tests__/CockpitV3Shell.test.tsx
npm run lint
```

---

## Acceptance criteria

- [x] `NEXT_PUBLIC_COCKPIT_V3` documented in `.env.example`; `cockpitV3Enabled()` returns `true` only when it is `"1"`.
- [x] `PatientProfilePage` renders `CockpitV3Shell` when the flag is on, `PatientProfileShell` when off — same `panes` / `storageKey` / docks passed to both.
- [x] **Flag-off: byte-identical to today** (P0-DL-1) — no v3 import evaluated in the off render path; existing cockpit unchanged.
- [x] Flag-on, desktop: labelled "Cockpit v3 — scaffold" placeholder with `SafetyStickyStrip` pinned above and `PlanActionFooter` pinned below (P0-DL-3); the footer's "Send Rx & finish" is live (reads the page-root provider).
- [x] Flag-on, mobile (`<lg`): flat placeholder, no docks (v3-DL-8).
- [x] `CockpitV3Shell.tsx` + `flags.ts` import nothing from `Shell.tsx` / `customize-mode-context` / `CustomizeBar` / `PaneDropOverlay` (P0-DL-4).
- [x] No edit to `layout-tree*.ts` / `types.ts` / `templates.tsx` / `panes/*` / any migration (P0-DL-5).
- [x] `npx tsc --noEmit`, `npm run lint`, and the stub render test clean.

---

## Out of scope

- The real editor-group renderer, tabs, DnD, palette → Phase 1+ (P0-DL-2).
- Hydrating the stub from persisted `PaneTreeNode` → Phase 1.
- A per-doctor `cockpit_v3` opt-in setting → fast-follow (V3-Q7).
- An imperative handle / `shellRef` for the v3 shell → Phase 1 if needed.

---

## Decision log

- **Stub, not a partial shell.** A labelled placeholder keeps the flag flippable for dogfood with zero consult risk; a half-built renderer would not (P0-DL-2).
- **Docks in the stub now.** Rendering the safety/action docks immediately proves the v3-DL-6 geometry (chrome outside the pane area) at the cheapest possible moment — before the pane area exists.
- **Env flag, not a doctor setting, for Phase 0.** Matches the repo's `NEXT_PUBLIC_*` pattern and gives dead-code elimination on the off-path. The per-doctor opt-in is a deliberate fast-follow once v3 is worth offering (V3-Q7).
- **Accept-and-ignore layout props.** Makes the page branch a clean drop-in and pre-declares the prop surface Phase 1 wires.

---

## References

- [Phase 0 plan](../plan-p0-cockpit-v3-scaffold-batch.md) · [Execution order](./EXECUTION-ORDER-p0-cockpit-v3-scaffold.md)
- [`Product plans/plan-cockpit-v3.md`](../../../../../../Product%20plans/plan-cockpit-v3.md) — v3-DL-6 (anchored chrome), v3-DL-9 (parallel + flag), V3-Q7 (flag shape).
- [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx) — the shell mount (~1124) + page-root providers.
- [`frontend/components/patient-profile/Shell.tsx`](../../../../../../../frontend/components/patient-profile/Shell.tsx) — `useMediaQuery` desktop/mobile pattern + dock props the stub mirrors.
- [`frontend/lib/api-base.ts`](../../../../../../../frontend/lib/api-base.ts) + [`frontend/.env.example`](../../../../../../../frontend/.env.example) — the `NEXT_PUBLIC_*` flag pattern.
- Sibling: [cv3s-02](./task-cv3s-02-foundation-boundary-and-reuse-audit.md) — the foundation boundary the stub imports in Phase 1.
