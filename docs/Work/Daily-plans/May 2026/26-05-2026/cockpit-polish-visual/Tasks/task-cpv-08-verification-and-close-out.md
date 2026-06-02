# cpv-08 · Verification + close-out

> **Status:** ✅ Done (2026-05-26). Telemetry + COCKPIT.md + roadmap + capture-inbox; day-26 cpv batch closed.

> **Wave 4** of [cockpit-polish-visual](../plan-cockpit-polish-visual-batch.md). Smoke matrix + telemetry + docs + capture-inbox. Closes the day-26 polish program.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | XS |
| **Model** | Composer 2 Fast |
| **Wave** | 4 |
| **Depends on** | cpv-01..07 |
| **Blocks** | — (closes the batch and the day) |

---

## What to do

### 1. Cross-cutting smoke matrix

Walk through [`plan-cockpit-polish-visual-batch.md` § Cross-cutting acceptance gate](../plan-cockpit-polish-visual-batch.md#cross-cutting-acceptance-gate-whole-batch). Tick every box.

Visual smoke at three viewports:
- **1366×768** (laptop) — cockpit fits without scroll; column headers identical; AssessmentStrip thin in waiting; BMI badge visible.
- **1920×1080** (desktop) — search bar expanded; everything roomy.
- **1280×800** (small laptop) — search collapses to icon; cockpit still legible.

### 2. Telemetry — `trackCockpitPolishVisualSystemLanded`

Add to `frontend/lib/patient-profile/telemetry.ts`:

```ts
declare global {
  interface Window {
    __cockpitPolishVisualSystemLanded?: boolean;
  }
}

export function trackCockpitPolishVisualSystemLanded(payload: {
  appointmentId: string;
  batch: "cpv";
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitPolishVisualSystemLanded) return;
  window.__cockpitPolishVisualSystemLanded = true;
  logCockpitEvent(
    "cockpit_polish.visual_system_landed",
    payload as Record<string, string | number | boolean>,
  );
}
```

Fire from the cockpit shell on first mount post-batch.

### 3. Update `docs/Reference/product/cockpit/COCKPIT.md`

Add a "Visual system" section:

```markdown
### Visual system (cpv, 2026-05-26)

- **AssessmentStrip** zero-state: collapses to ~24px hint when state=waiting and no Dx.
- **SaveStatusPill**: 4 states (idle / saving / saved / error) — never "—".
- **VitalsGrid**: BMI badge appears inline next to weight chip; WHO classification tooltip.
- **ObjectiveSection**: General / Systemic examination textareas have labels + icons + divider.
- **PaneHeader**: every column header renders through this single component; unified style.
- **Color tokens**: hex literals replaced with semantic Tailwind tokens. PatientRibbon separators are `·`.
- **Header search**: collapses to icon below 1280px (xl breakpoint).
- **Pane icons**: single source of truth in `frontend/lib/patient-profile/pane-icons.ts`.
- **Problem list**: long entries wrap (`break-words min-w-0`), no horizontal scroll.

Source: [`Daily-plans/May 2026/26-05-2026/cockpit-polish-visual/`](../Work/Daily-plans/May%202026/26-05-2026/cockpit-polish-visual/).
```

### 4. Update `plan-cockpit-v2-execution-roadmap.md`

- **§3 Batch ledger:** add row for `cockpit-polish-visual` shipped.
- **§10 Changelog:** `2026-05-26 — cpv batch shipped. AssessmentStrip zero-state, SaveStatusPill copy, BMI badge, examination labels, unified PaneHeader, color tokens, search collapse, pane-icon SoT, problem-list wrap.`

### 5. Capture-inbox

Append to `docs/Work/capture/inbox.md`:

```md
- [ ] [cpv follow-up] Animated transitions on AssessmentStrip expand/collapse. (Source: docs/Work/Daily-plans/May 2026/26-05-2026/cockpit-polish-visual/plan-cockpit-polish-visual-batch.md)
- [ ] [cpv follow-up] BMI trend chart in VitalsGrid — bigger feature, needs historical pull. (Source: same)
- [ ] [cpv follow-up] Full dark-mode audit — tokens cleanup from cpv-06 unlocks this; needs its own batch. (Source: same)
- [ ] [cpv follow-up] Search-bar full re-design with command palette overlap — coordinate with rx-polish-shortcuts cmdk. (Source: same)
- [ ] [day-26 polish follow-up] Schedule dogfood pass after all 4 batches ship to confirm no regressions. (Source: docs/Work/Daily-plans/May 2026/26-05-2026/README.md)
```

### 6. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test
```

---

## Acceptance gate

- [x] Smoke matrix all green at all three viewports.
- [x] Telemetry event fires once per session.
- [x] `COCKPIT.md` updated with the Visual System section.
- [x] Roadmap updated.
- [x] Capture-inbox lines added.

---

## Anti-goals

- ❌ Don't add new features here — verification + docs only.
- ❌ Don't update `plan-cockpit-v2.md` itself.
- ❌ Don't bundle telemetry events from cpv-01..07 individually — one event for the whole batch is sufficient.

---

## Notes

- This task closes the four-batch day-26 polish program. After this ships, the cockpit visual surface is in its target state per the 2026-05-26 dogfood review.
- Future polish surfaces (dark mode, animation, BMI trends) live in capture-inbox until dogfooded.
