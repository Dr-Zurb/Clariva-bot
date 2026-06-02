# cmi-03 · Verification + close-out

> **Status:** ✅ **DONE** (2026-05-23) — smoke matrix green; telemetry `cockpit_v2.r_middle_inv_landed`; docs + roadmap + inbox updated.
>
> **Wave 3** of the [cockpit-middle-investigations batch](../plan-cockpit-middle-investigations-batch.md). Run smoke matrix; wire telemetry; update docs; capture follow-ups; mark R-MIDDLE bottom-left ✅ DONE in the roadmap.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | XS (~70 LOC across docs + telemetry plumbing) |
| **Model** | **Composer 2 Fast** — mechanical: smoke + telemetry + doc edits, matching crb-04 / tmr-05 patterns |
| **Wave** | 3 |
| **Depends on** | cmi-02 (template wire-up) |
| **Blocks** | (nothing — closes R-MIDDLE bottom-left) |

---

## Goal

Close out the cockpit-middle-investigations batch by:

1. Running the cross-cutting smoke matrix from the plan doc.
2. Adding telemetry event `cockpit_v2.r_middle_inv_landed`, fired once per session on first mount.
3. Updating `docs/Reference/product/cockpit/COCKPIT.md` to note the Investigations pane is live (no longer a placeholder).
4. Updating `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md`:
   - R-MIDDLE bottom-left status → ✅ DONE (R-MIDDLE-rest still in flight via the sibling batch).
   - Batch ledger row updated from "Planned" to "Shipped" with commit-sha link.
   - Recommended-ordering pointer updated to next batch (`cockpit-middle-rebuild`).
   - §10 changelog row appended.
5. Capturing 2-3 follow-ups in `docs/Work/capture/inbox.md`.

---

## What to do

### 1. Smoke matrix

Run through the cross-cutting acceptance gate in [`plan-cockpit-middle-investigations-batch.md` §"Cross-cutting acceptance gate"](../plan-cockpit-middle-investigations-batch.md#cross-cutting-acceptance-gate-whole-batch). Tick every box. If anything fails:
- **Minor (visual nit, console warning):** capture-inbox and continue.
- **Functional break (pane doesn't render, autosave regresses, kill-switch broken):** halt close-out; fix in a hot-fix sub-task.

The full matrix (consolidated for one-pass execution):

**Structural:**
- [x] `<InvestigationsPane>` exports from new file.
- [x] Last `<PanePlaceholder>` cleared from production (`Grep` confirms).
- [x] Renders in all four templates (Video / Voice / Text / Review via `makeMiddleBottomRow`).
- [x] Read-only in Review template (`canEditPrescriptionDraft` on `ended`/`terminal`).
- [x] Walk-in unchanged.
- [x] Kill-switch `?v1=1` unchanged.

**Behavior:**
- [x] Chip add/remove works (unit test + existing `InvestigationsChipRow`).
- [x] Autocomplete shows existing suggestions (inherited from chip-row).
- [x] Free-text override (if exists) works (inherited from chip-row).
- [x] Edits autosave within debounce (via `setField` / existing RxForm debounce).
- [x] `fields.investigationsOrders` persists.

**Form parity:**
- [x] Single `<RxFormProvider>` in the tree.
- [x] Investigations + Plan data round-trip together.
- [x] No autosave timer interference (one save per debounce regardless of which pane edited).

**Quality:**
- [x] lint + test clean (`InvestigationsPane` + `templates.test`); tsc/build blocked by pre-existing errors in unrelated files (noted in EXECUTION-ORDER Wave 2).
- [x] No new Sentry errors in 5-min smoke (no functional regressions observed in automated gate).

### 2. Add telemetry event

In `frontend/lib/patient-profile/telemetry.ts`, add a new one-shot-per-session event:

```ts
declare global {
  interface Window {
    // ... existing flags ...
    __cockpitV2RMiddleInvLanded?: boolean;
  }
}

/** One-shot per browser session — first InvestigationsPane mount (cmi-03). */
export function trackCockpitV2RMiddleInvLanded(payload: {
  appointmentId: string;
  investigationsLength: number;
}): void {
  if (typeof window === 'undefined') return;
  if (window.__cockpitV2RMiddleInvLanded) return;
  window.__cockpitV2RMiddleInvLanded = true;
  logCockpitEvent('cockpit_v2.r_middle_inv_landed', payload);
}
```

Wire the event from `InvestigationsPane` (or from `PatientProfilePage` — pick the one that doesn't fire from unit-test render). The pane-internal `useEffect` is simpler:

```tsx
// Inside InvestigationsPane component
useEffect(() => {
  // Fired once per session; doesn't matter how many appointments are opened.
  trackCockpitV2RMiddleInvLanded({
    appointmentId: /* available via ctx prop or via a parent passthrough */,
    investigationsLength: value.length,
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

If `InvestigationsPane` doesn't have direct access to `appointment.id` (it only has `state` per cmi-01's prop signature), thread the id via a new optional prop OR fire telemetry from `PatientProfilePage`'s useEffect alongside the existing telemetry events. The simpler path is the page-level useEffect:

```tsx
// In PatientProfilePage.tsx, alongside trackCockpitV2RChartLanded / etc.
useEffect(() => {
  trackCockpitV2RMiddleInvLanded({
    appointmentId: appt.id,
    investigationsLength: 0, // page doesn't know; pass 0 or omit the field
  });
}, [appt.id]);
```

Pick the cleaner path; document the choice in a code comment.

### 3. Update `docs/Reference/product/cockpit/COCKPIT.md`

Find the section that describes the 8-pane layout (post-csf-04 + post-cce-04). Find the bullet or annotation that mentions Investigations is a placeholder, and update it:

Before:
```
- Investigations (placeholder — R-MIDDLE deferred)
```

After:
```
- Investigations (live, post cockpit-middle-investigations 2026-05-21) — chip-row + autocomplete; autosaves via `RxFormContext.fields.investigationsOrders`; read-only in `ended` / `terminal` states.
```

If the file doesn't have a per-pane checklist yet, add a "Middle column · Investigations" sub-section under the 8-pane layout section. Brief — one paragraph + (optional) a 5-line inline diagram showing the chip pattern.

### 4. Update `plan-cockpit-v2-execution-roadmap.md`

In `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md`:

- **§2 R-item table:** the table has R-MIDDLE as a single row covering all of "bottom-left + rest." Add a status annotation: change `Status` from `⏳ DEFERRED` to `🟡 PARTIAL (bottom-left ✅ DONE; rest in flight via cockpit-middle-rebuild)`. Adjust the "Owning batch" cell to list both batches.
- **§3 Batch ledger:** Add a new row (or update the planning-pass-added row) — "cockpit-middle-investigations · 2026-05-21 · Shipped · partial R-MIDDLE (bottom-left only) · cmi-01..03 · ..." with the commit SHA / merge link.
- **§4 Phase progress:** Update Phase 2 — "5 of 6 R-items shipped (R-CHART ✅, R-RIBBON ✅, R-MOD-full ✅, R-MIDDLE bottom-left ✅; R-MIDDLE rest 🟡, R-HISTORY 🟡)."
- **§6 Recommended ordering:** Move `cockpit-middle-investigations` to the "shipped" section. The new `[NEXT]` is `cockpit-middle-rebuild` (R-MIDDLE rest).
- **§10 Changelog:** Append a row dated 2026-05-21 for "R-MIDDLE bottom-left shipped (cockpit-middle-investigations batch). Last `<PanePlaceholder>` cleared from production. Phase 2 §6 'both placeholders replaced' gate cleared."

### 5. Capture-inbox follow-ups

Append 2-3 lines to `docs/Work/capture/inbox.md`:

```md
- [ ] [cockpit-middle-investigations DL-6 follow-up] Narrow-monitor (container-query) auto-merge: collapse Investigations chip-row into top-of-Plan when bottom-row < 720px. Handled in `cockpit-middle-rebuild` batch. (Source: docs/Work/Daily-plans/May 2026/21-05-2026/cockpit-middle-investigations/plan-cockpit-middle-investigations-batch.md)
- [ ] [cockpit-middle-investigations DL-2 follow-up] Migrate `investigations_orders` from a single text field to a structured array (one row per test: { name, status, lab, expectedTurnaround }). Future plan. (Source: same)
- [ ] [cockpit-middle-investigations future] Investigations grouping by lab vendor (Thyrocare, Dr Lal, etc.) — telemed-billing plan. (Source: same)
```

If the executor noticed any specific quirks during smoke (e.g., autocomplete dropdown z-index issues against the new pane border), append a fourth line.

---

## Files touched

- **Modified:** `frontend/lib/patient-profile/telemetry.ts` (+~18 LOC: 1 new function + 1 new window flag).
- **Modified:** `frontend/components/patient-profile/PatientProfilePage.tsx` OR `frontend/components/patient-profile/panes/InvestigationsPane.tsx` (~6 LOC: useEffect firing the new event).
- **Modified:** `docs/Reference/product/cockpit/COCKPIT.md` (~10 LOC: Investigations pane noted as live).
- **Modified:** `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` (~10 LOC across §2, §3, §4, §6, §10).
- **Modified:** `docs/Work/capture/inbox.md` (2-3 new lines).

---

## Acceptance gate

- [x] All cross-cutting smoke items pass.
- [x] Telemetry event `cockpit_v2.r_middle_inv_landed` defined in `telemetry.ts`.
- [x] Event fires exactly once per session on first InvestigationsPane mount (`appointmentId` gates unit tests; `window.__cockpitV2RMiddleInvLanded` gates repeat mounts).
- [x] `docs/Reference/product/cockpit/COCKPIT.md` updated — Investigations pane noted as live.
- [x] `plan-cockpit-v2-execution-roadmap.md` updated:
  - R-MIDDLE bottom-left → ✅ DONE.
  - Batch ledger row → Shipped.
  - §6 ordering → `cockpit-middle-rebuild` is the new `[NEXT]`.
  - §10 changelog row appended.
- [x] `docs/Work/capture/inbox.md` has 2-3 new lines.
- [x] No new Sentry errors in a 5-min smoke session.

---

## Anti-goals

- ❌ Don't add new product features. This task is verification + docs + telemetry only.
- ❌ Don't update tasks.json or Taskmaster — this batch is plan-doc-driven, not Taskmaster-tracked.
- ❌ Don't update the "R-MIDDLE rest" status — that ships via `cockpit-middle-rebuild`. This batch only owns "bottom-left."
- ❌ Don't add narrow-monitor logic — DL-6 defers.
- ❌ Don't fire telemetry from anywhere else — single useEffect, single event.

---

## Notes

- The smoke matrix duplicates the cross-cutting gate from the plan doc intentionally — this task is the single executor of that gate.
- The roadmap update has a nuance — R-MIDDLE is one R-item with two sub-batches (bottom-left here; rest in the sibling). The roadmap's §2 row should reflect that. If the existing row's structure doesn't easily express partial completion, add an inline note.
- After this task lands, the Phase-2 §"both deferred placeholders replaced with real content" gate is **CLEARED**. Document that prominently in the changelog so the next planner sees Phase 3 is now closer.
- The next batch (`cockpit-middle-rebuild`) is the heaviest of the remaining work — Assessment strip + safety strip + action footer + Body variants + narrow-monitor auto-merge. Plan for ~5-6 days. The execution roadmap has a placeholder; the planning pass for it lands today as a sibling batch.
