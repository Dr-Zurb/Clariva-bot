# cnc-05 · Verification + close-out

> **Wave 3** of [cockpit-nav-clarity](../plan-cockpit-nav-clarity-batch.md). Smoke matrix + telemetry + docs + capture-inbox.

| Property | Value |
|---|---|
| **Status** | ✅ Done (2026-05-26) |
| **Owner** | Frontend |
| **Size** | XS |
| **Model** | Composer 2 Fast |
| **Wave** | 3 |
| **Depends on** | cnc-01, cnc-02, cnc-03, cnc-04 |
| **Blocks** | — (closes the batch) |

---

## What to do

### 1. Cross-cutting smoke matrix

Walk through [`plan-cockpit-nav-clarity-batch.md` § Cross-cutting acceptance gate](../plan-cockpit-nav-clarity-batch.md#cross-cutting-acceptance-gate-whole-batch). Tick every box.

Visual checks at `/dashboard/appointments/[id]`:
- Right column header reads "Chart Notes" (not "Notes").
- Plan column shows NO `<RxSectionNav>` chip strip.
- Open with a fresh appointment (no investigations) — Investigations pane shows "No tests ordered yet" + Add button.
- Hover the safety icon → tooltip appears.
- Patient with no treating doctor → ribbon reads "Treating: not assigned".

### 2. Telemetry — `trackCockpitPolishNavClarityLanded`

Add to `frontend/lib/patient-profile/telemetry.ts`:

```ts
declare global {
  interface Window {
    __cockpitPolishNavClarityLanded?: boolean;
  }
}

export function trackCockpitPolishNavClarityLanded(payload: {
  appointmentId: string;
  cockpitMode: true;
  rxSectionNavHidden: true;
  rightColumnTitle: "Chart Notes";
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitPolishNavClarityLanded) return;
  window.__cockpitPolishNavClarityLanded = true;
  logCockpitEvent(
    "cockpit_polish.nav_clarity_landed",
    payload as Record<string, string | number | boolean>,
  );
}
```

Fire from `<RxWorkspace>` on first mount when `cockpitMode === true`.

### 3. Update `docs/Reference/product/cockpit/COCKPIT.md`

Add a short section:

```markdown
### Cockpit nav clarity (cnc, 2026-05-26)

- Right-column group title is **"Chart Notes"** (not "Notes") to disambiguate from message-log notes.
- `<RxSectionNav>` chip strip is hidden when `<RxWorkspace cockpitMode>` — the cockpit shell's per-pane tab nav already provides section navigation. Non-cockpit mounts keep the chip strip.
- `<InvestigationsPane>` renders an empty-state with `[+ Add test]` CTA when no orders exist.
- `<PatientRibbon>` safety + treating indicators have aria-labels + Radix tooltips.

Source: [`Daily-plans/May 2026/26-05-2026/cockpit-nav-clarity/`](../Work/Daily-plans/May%202026/26-05-2026/cockpit-nav-clarity/).
```

### 4. Update `plan-cockpit-v2-execution-roadmap.md`

- **§3 Batch ledger:** add row for `cockpit-nav-clarity` shipped.
- **§10 Changelog:** `2026-05-26 — cnc batch shipped. Right column "Chart Notes" title, RxSectionNav gated in cockpit mode, InvestigationsPane empty-state, PatientRibbon labelled indicators.`

### 5. Capture-inbox

Append to `docs/Work/capture/inbox.md`:

```md
- [ ] [cnc follow-up] Treating-doctor picker — clicking the indicator opens an assign-flow side-sheet. (Source: docs/Work/Daily-plans/May 2026/26-05-2026/cockpit-nav-clarity/plan-cockpit-nav-clarity-batch.md)
- [ ] [cnc follow-up] Safety severity copy derivation from `<RxSafetyContext>` (replace generic v1 copy with "2 allergies + 1 DDI" etc.). (Source: same)
- [ ] [cnc follow-up] Backfill `<AddInvestigationDialog>` if cnc-03 used the fallback inline-focus path. (Source: same)
```

### 6. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test
```

---

## Acceptance gate

- [x] Smoke matrix all green.
- [x] Telemetry event fires once per session.
- [x] `COCKPIT.md` updated.
- [x] Roadmap updated.
- [x] Capture-inbox lines added.

---

## Anti-goals

- ❌ Don't add new features here — verification + docs only.
- ❌ Don't update `plan-cockpit-v2.md` itself.
