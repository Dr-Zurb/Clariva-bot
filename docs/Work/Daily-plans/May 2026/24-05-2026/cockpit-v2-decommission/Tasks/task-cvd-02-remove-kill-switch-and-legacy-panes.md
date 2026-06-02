# cvd-02 · Remove kill-switch + legacy panes

> **Wave 2 α** of [cockpit-v2-decommission](../plan-cockpit-v2-decommission-batch.md). Code cleanup.

| **Size** | S | **Model** | Auto | **Wave** | 2 | **Depends on** | cvd-01 PASS | **Blocks** | cvd-03 |

---

## What to do

### 1. Find every `?v1=1` reference

```powershell
# rg "v1=1|v1_flag|killSwitch|KILL_SWITCH" frontend
```

Expected hits in:
- `frontend/app/dashboard/appointments/[id]/page.tsx` — URL parsing.
- `frontend/components/patient-profile/PatientProfilePage.tsx` — dual-branch render.
- `frontend/lib/patient-profile/layout.ts` or `useShellLayout.ts` — possible kill-switch helpers.
- Telemetry: `cockpit_v1_killswitch_invoked` event firing site.

### 2. Remove URL parsing in `page.tsx`

Whatever existing block reads `searchParams.get("v1")` — delete it. The kill-switch flag no longer flows into `PatientProfilePage` props.

### 3. Simplify `PatientProfilePage.tsx`

Delete the conditional that picks between the legacy 3-pane render and the new shell render. Keep only the new shell render path. ~30 LOC delta.

### 4. Delete `legacyBuiltInPanes` from `templates.tsx`

Find the array (named `legacyBuiltInPanes` per csf-05 capture); delete it. Update any export list. Verify no other file imports it (`rg "legacyBuiltInPanes"`).

### 5. Mark kill-switch-only helpers `@deprecated`

For helpers that existed solely to support the kill-switch path (e.g. a flat-layout converter that's now unreachable), add a JSDoc `@deprecated` marker:

```ts
/**
 * @deprecated kill-switch path removed 2026-06-{day} (cvd-02).
 *   Slated for hard deletion in Q3 2026 cleanup batch.
 *   See docs/Work/Daily-plans/May 2026/24-05-2026/cockpit-v2-decommission/.
 */
export function legacyThreePaneLayoutHelper(...) { ... }
```

Per DL-2, soft-delete first.

### 6. Wire `trackCockpitV2ProgramCompleted` in `frontend/lib/patient-profile/telemetry.ts`

```ts
declare global {
  interface Window {
    __cockpitV2ProgramCompleted?: boolean;
  }
}

export function trackCockpitV2ProgramCompleted(payload: {
  phase2BatchesShipped: number;   // 8 — cockpit-v2 (phase 1), shell-flip, chart-extraction, ribbon, templates-r-mod, middle-investigations, middle-rebuild, history-pane
  phase3BatchesShipped: number;   // 6 — 4× rx-polish, layout-presets, decommission (this one, counted)
  soakDays: number;               // computed at fire time: today - 2026-05-19
  killSwitchEscapeRatePct: number; // from cvd-01 audit, recorded by hand or via env var
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2ProgramCompleted) return;
  window.__cockpitV2ProgramCompleted = true;
  logCockpitEvent("cockpit_v2.program_completed", payload as Record<string, string | number | boolean>);
}
```

Fire from `PatientProfilePage.tsx` on first render after the dual-branch removal. Hard-code the values for simplicity — this is a one-time historical marker, not an ongoing metric.

### 7. tsc / lint / test / build sweep

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test
pnpm --filter frontend build
```

### 8. QA the removal

- Open `/dashboard/appointments/[id]?v1=1` in a browser → confirm layout is identical to without the param (new shell renders unconditionally).
- Run the e2e smoke test for cockpit if one exists.

---

## Acceptance gate

- [x] `?v1=1` URL handling removed.
- [x] `legacyBuiltInPanes` deleted (inline in `PatientProfilePage.tsx`; none in `templates.tsx`).
- [x] Kill-switch-only helpers `@deprecated`. N/A — no standalone helpers remained after inline removal.
- [x] `cockpit_v2.program_completed` event wired + firing.
- [x] tsc / lint / test / build all clean.
- [x] Manual QA: `?v1=1` no longer changes layout (param ignored; same shell renders).

---

## Anti-goals

- ❌ Don't hard-delete `@deprecated` helpers in this batch — Q3 cleanup batch owns that.
- ❌ Don't remove the existing `cockpit_v1_killswitch_invoked` event name from telemetry.ts — DL-6 (preserve historical metric names).
- ❌ Don't change migration 099 — DL-3.
- ❌ Don't remove `cmdk` / `react-window` deps — DL-7.

---

## Notes

- The `cockpit_v2.program_completed` event payload is intentionally simple. It's a one-shot historical marker firing per-doctor on first load post-decommission. Subsequent loads no-op via the `__cockpitV2ProgramCompleted` guard.
- If your investigation in cvd-01 found a non-zero (but < 1%) escape rate, record the exact percentage in the payload's `killSwitchEscapeRatePct` field — useful for the program retrospective.
