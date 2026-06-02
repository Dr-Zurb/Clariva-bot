# ccd-04 · Verification + close-out

> **Wave 2** of [cockpit-chart-density](../plan-cockpit-chart-density-batch.md). Smoke matrix + telemetry + docs + capture-inbox.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | XS |
| **Model** | Composer 2 Fast |
| **Wave** | 2 |
| **Depends on** | ccd-01, ccd-02, ccd-03 |
| **Blocks** | — (closes the batch) |

---

## What to do

### 1. Cross-cutting smoke matrix

Walk through [`plan-cockpit-chart-density-batch.md` § Cross-cutting acceptance gate](../plan-cockpit-chart-density-batch.md#cross-cutting-acceptance-gate-whole-batch). Tick every box.

Visual checks at `/dashboard/appointments/[id]`:
- First-visit patient → left rail shows single unified "Add patient context" card (no stack of 4 empty cards).
- Patient with allergies on file → Allergies card renders normally; other empty panes show per-pane empty-state.
- Enter vitals in Objective section → Snapshot pane updates with "Live draft" badge in real-time.
- Click any pane's chevron → body collapses to single-line summary; click again → expands.
- Refresh the page → all panes return to expanded (DL-5 confirmed).

### 2. Telemetry — `trackCockpitPolishChartDensityLanded`

Add to `frontend/lib/patient-profile/telemetry.ts`:

```ts
declare global {
  interface Window {
    __cockpitPolishChartDensityLanded?: boolean;
  }
}

export function trackCockpitPolishChartDensityLanded(payload: {
  appointmentId: string;
  emptyPaneCount: number;
  unifiedEmptyState: boolean;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitPolishChartDensityLanded) return;
  window.__cockpitPolishChartDensityLanded = true;
  logCockpitEvent(
    "cockpit_polish.chart_density_landed",
    payload as Record<string, string | number | boolean>,
  );
}
```

Fire from the new `<ChartRailWithEmptyState>` wrapper (or the left-column groupWrapper) on first mount.

### 3. Update `docs/Reference/product/cockpit/COCKPIT.md`

Add a section:

```markdown
### Chart-rail density (ccd, 2026-05-26)

- New `<ChartRailEmptyState>` + `<UnifiedChartRailEmptyState>` components in `frontend/components/patient-profile/panes/`.
- When ALL FIVE chart-rail signals are empty (allergies + chronic + problem-list + snapshot + history), the left column renders a single unified "Add patient context" card. Otherwise per-pane empty-state.
- `<SnapshotPane>` reads draft vitals from `useOptionalRxForm()` and shows a "Live draft" badge on draft-sourced values.
- Every chart-rail pane has a chevron in its header; click toggles between expanded body and a one-line summary. Collapsed state resets on page reload (not persisted).

Source: [`Daily-plans/May 2026/26-05-2026/cockpit-chart-density/`](../Work/Daily-plans/May%202026/26-05-2026/cockpit-chart-density/).
```

### 4. Update `plan-cockpit-v2-execution-roadmap.md`

- **§3 Batch ledger:** add row for `cockpit-chart-density` shipped.
- **§10 Changelog:** `2026-05-26 — ccd batch shipped. Chart-rail empty-state unification, snapshot live-draft vitals, uniform disclosure chevron.`

### 5. Capture-inbox

Append to `docs/Work/capture/inbox.md`:

```md
- [ ] [ccd follow-up] Persist per-pane collapse state to `doctor_settings.cockpit_chart_rail_collapsed` JSONB. Needs migration; defer to a follow-up micro-batch. (Source: docs/Work/Daily-plans/May 2026/26-05-2026/cockpit-chart-density/plan-cockpit-chart-density-batch.md)
- [ ] [ccd follow-up] Live-draft vs persisted comparison view — click the badge to see both side-by-side. (Source: same)
- [ ] [ccd follow-up] Auto-expand a pane when new data lands. Pilot before shipping (could be surprising). (Source: same)
- [ ] [ccd follow-up] If ccd-01 shipped Path B (deferred wrapper wiring), backfill the `useChartRailEmptySignals` aggregator hook. (Source: same)
```

### 6. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test
```

---

## Acceptance gate

- [x] Smoke matrix all green. *(code-verified 2026-05-26: unified empty-state, per-pane empty, live-draft badge, chevron collapse, session-only collapse)*
- [x] Telemetry event fires once per session. (`trackCockpitPolishChartDensityLanded` in `ChartRailWithEmptyState`)
- [x] `COCKPIT.md` updated.
- [x] Roadmap updated.
- [x] Capture-inbox lines added.

**Status:** ✅ Done (2026-05-26)

---

## Anti-goals

- ❌ Don't add new features here — verification + docs only.
- ❌ Don't update `plan-cockpit-v2.md` itself.
