# ppd-05 · PlanActionFooter visibility + close-out

> **Wave 3** of [cockpit-plan-pane-deduplication](../plan-cockpit-plan-pane-deduplication-batch.md). Resolves issue #5 + closes the batch (smoke + telemetry + docs).

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | S |
| **Model** | Composer 2 Fast |
| **Wave** | 3 |
| **Depends on** | ppd-02, ppd-03, ppd-04 |
| **Blocks** | — (closes the batch) |
| **Status** | ✅ Done (2026-05-26) |

---

## What to do

### 1. Audit `<PlanActionFooter>` visibility

Open `frontend/components/cockpit/middle/PlanActionFooter.tsx`. Walk through each cockpit state (`waiting`, `live`, `wrap_up`, `ended`, `terminal`). Confirm which buttons render in each:

| State | Send Rx | Send & Finish | Finish visit |
|---|---|---|---|
| waiting | (verify) | (verify) | (verify) |
| live | ✓ | ✓ | (✓ when Rx draft is valid) |
| wrap_up | ✓ | ✓ | ✓ |
| ended | (read-only label, no buttons) | — | — |
| terminal | (footer absent — RxWorkspace returns early) | — | — |

Document the observed behavior. If a state shows no buttons when it should, file an inline comment + capture-inbox; for this batch's scope, only fix bugs that block the dedup gate (i.e., if Send Rx is invisible while it should be visible in `live`).

### 2. Verify the commit-row suppression in `PrescriptionForm`

Grep `PrescriptionForm.tsx` for the commit-row block (likely a `<div className="...flex...justify-end..."` containing "Send to patient" or "Send Rx" buttons). Confirm:

- When `actionsInFooter === true`, the entire commit row is suppressed (returns null or is wrapped in `{!actionsInFooter && (...)}`).
- When `actionsInFooter === false`, the commit row renders as before.

If the suppression is incomplete (e.g., suppresses one button but not another), patch it with a single conditional wrapper. Tests for the patch in `__tests__/PrescriptionForm.test.tsx`.

If `actionsInFooter` already correctly suppresses ALL buttons in ALL states, no code change here — log "verified, no change needed" in the close-out commit message.

### 3. Run cross-cutting smoke matrix

Walk through [`plan-cockpit-plan-pane-deduplication-batch.md` § Cross-cutting acceptance gate](../plan-cockpit-plan-pane-deduplication-batch.md#cross-cutting-acceptance-gate-whole-batch). Tick every box. Visual smoke at `/dashboard/appointments/[id]`:

- Plan column renders Medicines + nothing else SOAP-like.
- Right column owns Subjective + Objective.
- `<PlanActionFooter>` is sticky at bottom, visible.
- Tab focus moves through right column → Plan column → footer cleanly (no orphaned focus on hidden radio).

### 4. Add `trackCockpitPolishPlanPaneDedupLanded` to `frontend/lib/patient-profile/telemetry.ts`

```ts
declare global {
  interface Window {
    __cockpitPolishPlanPaneDedupLanded?: boolean;
  }
}

/** One-shot per session — first cockpit mount post-batch. */
export function trackCockpitPolishPlanPaneDedupLanded(payload: {
  appointmentId: string;
  subjectiveLifted: true;
  objectiveLifted: true;
  entryModeLifted: true;
  photoLifted: true;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitPolishPlanPaneDedupLanded) return;
  window.__cockpitPolishPlanPaneDedupLanded = true;
  logCockpitEvent(
    "cockpit_polish.plan_pane_dedup_landed",
    payload as Record<string, string | number | boolean>,
  );
}
```

Fire from a `useEffect` inside `<RxPane>` (or `<RxWorkspace>`) on first mount when all four lifts are true.

### 5. Update `docs/Reference/product/cockpit/COCKPIT.md`

Find the "lift pattern" table (if it exists from cmr-01 docs) and add four rows:

| Lift prop | Source | Consumed by | When |
|---|---|---|---|
| `subjectiveLifted` | templates.tsx `makeMiddleBottomRow` | `<PrescriptionFormCompositionRoot>` | ppd-02 (2026-05-26) |
| `objectiveLifted` | same | same | same |
| `entryModeLifted` | same | `<PrescriptionFormBody>` | ppd-03 (2026-05-26) |
| `photoLifted` | same | same | same |

Add a one-paragraph section "Plan-pane dedup (ppd, 2026-05-26)" explaining the surgical pattern and linking to this batch.

### 6. Update `plan-cockpit-v2-execution-roadmap.md`

- **§3 Batch ledger:** new row for `cockpit-plan-pane-deduplication` shipped.
- **§10 Changelog:** append a line `2026-05-26 — ppd batch shipped. Plan column dedupes Subjective + Objective + radio + photo via four new lift props. Cockpit Plan pane is now a clean Medicines-only surface; right column owns SOAP documentation.`

### 7. Capture-inbox

Append to `docs/Work/capture/inbox.md`:

```md
- [ ] [ppd follow-up] Photo-attach as a cockpit-specific affordance — likely body-pane / launcher feature, not in Plan column. (Source: docs/Work/Daily-plans/May 2026/26-05-2026/cockpit-plan-pane-deduplication/plan-cockpit-plan-pane-deduplication-batch.md)
- [ ] [ppd follow-up] Remove `entryMode` state from `PrescriptionFormBody` entirely when the radio is permanently lifted — bigger refactor; capture for Phase 4. (Source: same)
- [ ] [ppd follow-up] Backfill template integration tests covering all six lift props through all four template factories. (Source: same)
```

### 8. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test
```

---

## Acceptance gate

- [x] `<PlanActionFooter>` visible at the bottom of the middle column for all non-terminal states.
- [x] When `actionsInFooter === true`, no commit-row buttons render inside `<PrescriptionForm>`.
- [x] Cross-cutting smoke matrix all green.
- [x] Telemetry event fires once per session.
- [x] `COCKPIT.md` updated.
- [x] Roadmap updated.
- [x] Capture-inbox lines added.

---

## Anti-goals

- ❌ Don't add new lift props here — Wave 2 owns the prop surface.
- ❌ Don't redesign `<PlanActionFooter>` — just verify it works.
- ❌ Don't update `plan-cockpit-v2.md` itself — that's archived after cockpit-v2-decommission ships; today's batch is post-program.
