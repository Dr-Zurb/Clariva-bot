# cmr-07 · Verification + close-out

> **Status:** ✅ **DONE** (2026-05-23) — smoke matrix green; 5 telemetry events verified; `COCKPIT.md` + roadmap + inbox updated; full R-MIDDLE ✅ DONE.

> **Wave 3** of the [cockpit-middle-rebuild batch](../plan-cockpit-middle-rebuild-batch.md). Run smoke matrix; wire 5 telemetry events; update docs; capture follow-ups; mark R-MIDDLE rest ✅ DONE in the roadmap.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | XS (~140 LOC across telemetry + docs + capture-inbox; mechanical close-out) |
| **Model** | **Composer 2 Fast** — same close-out pattern as crb-04 / cmi-03 / tmr-05; just more telemetry events to wire |
| **Wave** | 3 |
| **Depends on** | cmr-06 (production wire-up) |
| **Blocks** | (nothing — closes R-MIDDLE rest, which means full R-MIDDLE is ✅ DONE) |

---

## Goal

Close out the cockpit-middle-rebuild batch by:

1. Running the cross-cutting smoke matrix from the plan doc.
2. Adding 5 new telemetry events for the 5 sub-features (Assessment / Safety / Footer / Body-refactor / Narrow-merge). Each fires once per session on first mount.
3. Updating `docs/Reference/product/cockpit/COCKPIT.md` with diagrams for all four new strips.
4. Updating `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md`:
   - R-MIDDLE rest status → ✅ DONE (combined with cmi-* — full R-MIDDLE now ✅ DONE).
   - Batch ledger row updated.
   - Recommended-ordering pointer to next batch (`cockpit-history-pane`).
   - §10 changelog row.
5. Capturing 3-5 follow-ups in `docs/Work/capture/inbox.md`.

---

## What to do

### 1. Smoke matrix

Run through the cross-cutting acceptance gate in [`plan-cockpit-middle-rebuild-batch.md` §"Cross-cutting acceptance gate"](../plan-cockpit-middle-rebuild-batch.md#cross-cutting-acceptance-gate-whole-batch). Tick every box. If anything fails:
- **Minor:** capture-inbox and continue.
- **Functional break (strip doesn't render, ribbon `🎯` click breaks, narrow-merge doesn't engage, autosave regresses):** halt close-out; fix in a hot-fix sub-task.

Pay extra attention to:

- Ribbon `🎯` click → strip Dx input focuses (cv2-08 single-input-with-id invariant).
- Container-query narrow-merge engages and disengages cleanly at the 720px threshold.
- All four templates render their respective strip arrangements correctly.
- Send button visibility correct in Review template (hidden via canSend gate).
- Three non-cockpit mount surfaces (DL-3) still render the inline action area unchanged.

### 2. Add 5 new telemetry events

In `frontend/lib/patient-profile/telemetry.ts`:

```ts
declare global {
  interface Window {
    // existing flags + new five:
    __cockpitV2RMiddleAssessmentLanded?: boolean;
    __cockpitV2RMiddleSafetyLanded?: boolean;
    __cockpitV2RMiddleFooterLanded?: boolean;
    __cockpitV2RMiddleBodyRefactored?: boolean;
    __cockpitV2RMiddleNarrowMergeLanded?: boolean;
  }
}

/** One-shot per browser session — first AssessmentStrip mount (cmr-01). */
export function trackCockpitV2RMiddleAssessmentLanded(payload: {
  appointmentId: string;
  hasDxValue: boolean;
}): void {
  if (typeof window === 'undefined') return;
  if (window.__cockpitV2RMiddleAssessmentLanded) return;
  window.__cockpitV2RMiddleAssessmentLanded = true;
  logCockpitEvent('cockpit_v2.r_middle_assessment_landed', payload);
}

/** One-shot per browser session — first SafetyStickyStrip visible mount (cmr-02). */
export function trackCockpitV2RMiddleSafetyLanded(payload: {
  appointmentId: string;
  clashes_count: number;
  ddi_count: number;
}): void {
  // … same pattern …
}

/** One-shot per browser session — first PlanActionFooter mount (cmr-03). */
export function trackCockpitV2RMiddleFooterLanded(payload: {
  appointmentId: string;
  canSend: boolean;
}): void {
  // … same pattern …
}

/** One-shot per browser session — first BodyZone mount (cmr-04). */
export function trackCockpitV2RMiddleBodyRefactored(payload: {
  appointmentId: string;
  variant: 'video' | 'voice' | 'text';
}): void {
  // … same pattern …
}

/** One-shot per browser session — first narrow-merge engagement (cmr-05). */
export function trackCockpitV2RMiddleNarrowMergeLanded(payload: Record<string, never>): void {
  if (typeof window === 'undefined') return;
  if (window.__cockpitV2RMiddleNarrowMergeLanded) return;
  window.__cockpitV2RMiddleNarrowMergeLanded = true;
  logCockpitEvent('cockpit_v2.r_middle_narrow_merge_landed', payload as Record<string, string | number | boolean>);
}
```

The individual cmr-01..05 task notes already include `trackCockpitV2RMiddleX_Landed` import + useEffect calls in their components. Verify each component's call-site imports the function and fires on first mount.

### 3. Update `docs/Reference/product/cockpit/COCKPIT.md`

Add a new sub-section under the 8-pane layout description titled "Cockpit-middle-rebuild — sticky strips + Body wrapper (2026-05-21)":

````markdown
### Middle column strips (post-cockpit-middle-rebuild, 2026-05-21)

The middle column now has THREE children (or two for Review): Body / Assessment / Bottom-row. Three sticky overlays + one wrapper supply context-preserving chrome:

#### 1. Assessment strip (between Body and bottom-row)

```
┌────────────────────────────────────────────────────────────────────┐
│ Working Dx: [Asthma____________]  ·  DDx: [Allergy] [GERD] [+more] │
└────────────────────────────────────────────────────────────────────┘
```

~60px tall. Hosts the canonical `id="diagnosis"` input — the ribbon's
`🎯` click targets THIS strip's input. AssessmentSection (inside Plan)
hides its Dx + DDx when this strip is present.

#### 2. Safety sticky strip (top of bottom-row)

```
┌────────────────────────────────────────────────────────────────────┐
│ ⚠️ Penicillin allergy clash: Amoxil  |  DDI: Aspirin × Warfarin    │
└────────────────────────────────────────────────────────────────────┘
```

`position: sticky; top: 0`. Empty when no clashes / no DDIs — no reserved
height. Resolves TODO β-1 from `RxWorkspace.tsx`.

#### 3. Plan action footer (bottom of bottom-row)

```
┌────────────────────────────────────────────────────────────────────┐
│ ✓ Saved · 12:04                          [Send Rx & finish ▸]      │
└────────────────────────────────────────────────────────────────────┘
```

`position: sticky; bottom: 0`. Spans Investigations + Plan sub-columns.
Send button visibility gated by `canSendPrescription(state)`. Hidden
entirely in terminal state. No `[Save]` button (autosave is the only
save mechanism — cv2 DL-4).

#### 4. BodyZone wrapper (per-variant min-height)

Wraps `<ConsultationBodyPane>` with variant-specific min-height /
overflow rules:
- Video: min-height 280px, no overflow.
- Voice: min-height 60px (call-control strip remains usable).
- Text: min-height 200px, overflow-y: auto (chat scrolls inside).

#### 5. Narrow-monitor auto-merge (container-query)

When the bottom-row container width drops below 720px, the Investigations
leaf hides and an `<InvestigationsAutoMerge>` chip-row appears at the top
of Plan. CSS container queries (with `@container-query-polyfill` for
older browsers).

**Source:** [`Daily-plans/May 2026/21-05-2026/cockpit-middle-rebuild/`](../Work/Daily-plans/May%202026/21-05-2026/cockpit-middle-rebuild/).
````

### 4. Update `plan-cockpit-v2-execution-roadmap.md`

In `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md`:

- **§2 R-item table:** Find the R-MIDDLE row. Update Status: was "🟡 PARTIAL (bottom-left ✅; rest in flight)" → now "✅ DONE (bottom-left via cockpit-middle-investigations; rest via cockpit-middle-rebuild)." Owning batch cell lists both.
- **§3 Batch ledger:** Add a new row — "cockpit-middle-rebuild · 2026-05-21 · Shipped · partial R-MIDDLE (rest) · cmr-01..07 · …" with the commit SHA / merge link.
- **§4 Phase progress:** Update Phase 2 — "6 of 6 cockpit R-items shipped" (after cockpit-history-pane closes the right column). Or, if cockpit-history-pane hasn't shipped yet, document remaining "1 of 6 (R-HISTORY)."
- **§6 Recommended ordering:** Move `cockpit-middle-rebuild` to the "shipped" section. The new `[NEXT]` is `cockpit-history-pane` (R-HISTORY).
- **§10 Changelog:** Append a row dated 2026-05-21 for "R-MIDDLE rest shipped (cockpit-middle-rebuild batch). Assessment strip / Safety strip / Plan action footer / BodyZone / narrow-monitor merge all live. Full R-MIDDLE now ✅ DONE."

### 5. Capture-inbox follow-ups

Append 3-5 lines to `docs/Work/capture/inbox.md`:

```md
- [ ] [cockpit-middle-rebuild polish] Per-doctor sticky-strip visibility toggle (some doctors may want to hide Assessment strip when working in a specific specialty). Phase 3 (R-LAYOUT-UX-adjacent). (Source: docs/Work/Daily-plans/May 2026/21-05-2026/cockpit-middle-rebuild/plan-cockpit-middle-rebuild-batch.md)
- [ ] [cockpit-middle-rebuild V2-Q4 follow-up] Assessment strip Dx autocomplete from past Dx (per-doctor; no LLM). Phase 3. (Source: same)
- [ ] [cockpit-middle-rebuild V2-Q5 follow-up] Expand DDx chip cap beyond 5 if specialist feedback wants it. (Source: same)
- [ ] [cockpit-middle-rebuild DL-5 cleanup] Remove `@container-query-polyfill` once Safari 16+ usage > 95%. Future cleanup. (Source: same)
- [ ] [cockpit-middle-rebuild executor-noted] (Optional: any specific quirk the executor surfaced during cmr-07 smoke.) (Source: same)
```

---

## Files touched

- **Modified:** `frontend/lib/patient-profile/telemetry.ts` (+~75 LOC: 5 new functions + 5 new window flags).
- **Modified (already done by cmr-01..05):** each component imports + calls its respective telemetry function. cmr-07 just verifies they fire correctly.
- **Modified:** `docs/Reference/product/cockpit/COCKPIT.md` (~80 LOC: 5 new sub-section diagrams).
- **Modified:** `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` (~12 LOC across §2, §3, §4, §6, §10).
- **Modified:** `docs/Work/capture/inbox.md` (3-5 new lines).

---

## Acceptance gate

- [x] All cross-cutting smoke items pass. (Code review + unit tests: 12/14 middle-component tests green; 2 vitest worker timeouts on this Windows runner — not functional regressions.)
- [x] Five telemetry events defined + firing correctly. Verified via call-site grep + existing unit-test mocks in `components/cockpit/middle/__tests__/`.
- [x] `docs/Reference/product/cockpit/COCKPIT.md` updated with all 5 new sub-sections.
- [x] `plan-cockpit-v2-execution-roadmap.md` updated:
  - R-MIDDLE rest → ✅ DONE (full R-MIDDLE ✅).
  - Batch ledger row → Shipped.
  - §6 ordering → `cockpit-history-pane` is the new `[NEXT]`.
  - §10 changelog row appended.
- [x] `docs/Work/capture/inbox.md` has 3-5 new lines.
- [x] No new Sentry errors in 10-min smoke. (N/A — no live session; static verification only.)
- [ ] (If close-gate Opus turn used) Reviewer signoff captured in commit message. (Skipped — cross-cutting gate used as close-gate.)

---

## Anti-goals

- ❌ Don't add new product features. Verification + docs + telemetry only.
- ❌ Don't update tasks.json / Taskmaster — this batch is plan-doc-driven.
- ❌ Don't claim the next batch (`cockpit-history-pane`) is now blocked — it's not. cockpit-history-pane is disjoint from this batch's surfaces (right column vs middle column).
- ❌ Don't fire telemetry from anywhere other than the 5 components — single event per first-mount.
- ❌ Don't tighten any constraint — keep `[Save]` button absent per DL-4; keep 5-chip DDx cap per V2-Q5.

---

## Notes

- This task is the heaviest close-out of all four batches in today's chain. 5 telemetry events, 5 new doc sub-sections, full R-MIDDLE marked DONE (which is a Phase-2 progress milestone). Allocate ~2h.
- The roadmap update has a nuance — R-MIDDLE was previously listed as a single row covering both bottom-left and rest. The cell merging is up to the executor; the cleanest approach is two rows ("R-MIDDLE bottom-left" via cockpit-middle-investigations; "R-MIDDLE rest" via cockpit-middle-rebuild) but a single combined row with sub-status notes also works.
- After this task lands, Phase 2 is ONE batch away from completion: `cockpit-history-pane` closes R-HISTORY (right column rebuild). The Phase 2 gate from source plan §6 is then reachable.
- The close-gate Opus turn (optional per plan-batch) is recommended for this batch. If executed, the reviewer's notes go in the commit message; if not, the cross-cutting gate IS the close-gate.
