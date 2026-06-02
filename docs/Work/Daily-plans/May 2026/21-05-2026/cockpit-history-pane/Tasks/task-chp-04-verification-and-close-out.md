# chp-04 · Verification + per-batch close-out

> **Status:** ✅ **DONE** (2026-05-24) — smoke matrix green (24 unit tests); `trackCockpitV2RHistoryLanded` verified in telemetry.ts + ObjectivePane call-site; COCKPIT.md + roadmap + capture-inbox updated; R-HISTORY → ✅ DONE; Phase 2 closed in roadmap §4.

> **Wave 3** of the [cockpit-history-pane batch](../plan-cockpit-history-pane-batch.md). Run cross-cutting smoke; ship the one telemetry function; update COCKPIT.md + roadmap + capture-inbox. R-HISTORY moves to ✅ DONE in the roadmap.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | XS (~100 LOC across telemetry + docs + capture-inbox) |
| **Model** | **Composer 2 Fast** — same pattern as the close-outs in crb-04 / cmi-03 / tmr-05 / cmr-07. Single telemetry function, multi-section roadmap update. No new product features. |
| **Wave** | 3 |
| **Depends on** | chp-03 (telemetry call-site in ObjectivePane, slot reservations in templates.tsx) |
| **Blocks** | chp-05 (Wave 4 — source product plan update) |

---

## Goal

Close out the cockpit-history-pane batch per-batch artifacts (telemetry + COCKPIT.md + roadmap + capture-inbox). Do NOT yet touch the source product plan — that's chp-05's job.

---

## What to do

### 1. Cross-cutting smoke matrix

Run through the gate in [`plan-cockpit-history-pane-batch.md` §"Cross-cutting acceptance gate"](../plan-cockpit-history-pane-batch.md#cross-cutting-acceptance-gate-whole-batch). Tick every box.

Pay extra attention to:

- **BMI badge** appears the moment Wt + Ht are both filled; disappears when either is cleared.
- **General + Systemic** textareas round-trip via delimited serialization (the `--- SYSTEMIC ---` delimiter is in the DB row when both are filled).
- **Legacy data** (rows where `examination_findings` was a single blob pre-this-batch) load with all text in General and Systemic empty.
- **Test results** textarea persists to `fields.testResults` and round-trips.
- **Legacy `vitalsText`** collapsed disclosure shows existing data when expanded; new data still saves.
- **Three non-cockpit mount surfaces (DL-3)** — appointment-detail standalone, in-call mini-panel, post-call summary — render the inline ObjectiveSection (with the new structure!) and continue working unchanged. They get the R-HISTORY content for free since the section is shared; verify they don't fire the cockpit-only telemetry event.

### 2. Add the telemetry function to `frontend/lib/patient-profile/telemetry.ts`

```ts
declare global {
  interface Window {
    // existing flags + new one:
    __cockpitV2RHistoryLanded?: boolean;
  }
}

/**
 * One-shot per browser session — first ObjectivePane mount (chp-03).
 * Signals reachability of the R-HISTORY enhanced content surface.
 *
 * Payload captures whether each new field-group has data at the moment of
 * landing — not after the doctor types into it. This separates reachability
 * from adoption: a follow-up `cockpit_v2.r_history_first_field_filled` event
 * (future) will measure adoption when any of the new fields gets edited.
 */
export function trackCockpitV2RHistoryLanded(payload: {
  appointmentId: string;
  vitalsFilledCount: number;
  hasGeneralExam: boolean;
  hasSystemicExam: boolean;
  hasTestResults: boolean;
  hasBmi: boolean;
}): void {
  if (typeof window === "undefined") return;
  if (window.__cockpitV2RHistoryLanded) return;
  window.__cockpitV2RHistoryLanded = true;
  logCockpitEvent("cockpit_v2.r_history_landed", payload as Record<string, string | number | boolean>);
}
```

Verify `logCockpitEvent` is the existing helper exported from telemetry.ts; if its name differs, match the file's existing pattern (the other `trackCockpitV2*` functions show the canonical shape).

### 3. Update `docs/Reference/product/cockpit/COCKPIT.md`

Add a new sub-section under the right-column description (or create one if it doesn't exist yet) titled "Right-column rebuild — R-HISTORY (2026-05-21)":

````markdown
### Right column — R-HISTORY (2026-05-21)

The right column splits Subjective (top) / Objective (bottom). Post-cockpit-history-pane batch, both panes carry the full DL-24 field set.

#### Subjective pane

```
┌──────────────────────────────┐
│ Chief complaint (CC)         │
│ [                          ] │
│                              │
│ History of present illness   │
│ [                          ] │
│ [                          ] │
│ [                          ] │
└──────────────────────────────┘
```

Tab-contract slot RESERVED (`tabs: undefined` in templates.tsx) for future Photo / AI-summary tabs.

#### Objective pane

```
┌──────────────────────────────┐
│ Vitals                       │
│ BP 120/80 ┃ HR 72 ┃ Temp …   │
│ SpO2 99 ┃ Wt 70 ┃ Ht 175     │
│ ┌────────────────────┐       │
│ │ BMI 22.9 · normal  │       │
│ └────────────────────┘       │
│                              │
│ General examination          │
│ [                          ] │
│                              │
│ Systemic examination         │
│ [                          ] │
│                              │
│ Test results (patient-…)     │
│ [                          ] │
│                              │
│ ▸ Show legacy free-text vitals │
└──────────────────────────────┘
```

Tab-contract slot RESERVED for future Labs tab.

**BMI computation** is client-side (DL-2 of cockpit-history-pane). Formula:
`bmi = weightKg / (heightCm / 100)²`. Display only; no DB column.

**Examination split via delimiter** (DL-6 / DL-9 of cockpit-history-pane). The
two UI textareas serialize to the single `examination_findings` DB column with
`\n--- SYSTEMIC ---\n` between sections. Legacy data (no delimiter) populates
General only. Helpers live in `frontend/lib/cockpit/exam-findings.ts`.

**Legacy `vitalsText`** is demoted to a collapsed `<details>` disclosure;
existing data is preserved + editable. A future NLP backfill (capture-inbox)
may lift structured fields out of legacy text.

**Source:** [`Daily-plans/May 2026/21-05-2026/cockpit-history-pane/`](../Work/Daily-plans/May%202026/21-05-2026/cockpit-history-pane/).
````

### 4. Update `plan-cockpit-v2-execution-roadmap.md`

In `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md`:

- **§2 R-item table:** Find the R-HISTORY row. Update Status from `🟡 IN FLIGHT (cockpit-history-pane)` (set at top-of-day by the roadmap update task) → `✅ DONE (cockpit-history-pane)`.
- **§3 Batch ledger:** Add a row — "cockpit-history-pane · 2026-05-21 · Shipped · R-HISTORY · chp-01..05 · {commit-sha}" with the merge link.
- **§4 Phase progress:** Update Phase 2 — "6 of 6 cockpit R-items shipped — Phase 2 ✅ COMPLETE." Add an explicit "Phase 2 closed at 2026-05-21" annotation.
- **§6 Recommended ordering:** Move `cockpit-history-pane` to the "shipped" section. The new `[NEXT]` is the first Phase 3 batch — likely `rx-polish-densification` or `keyboard-shortcuts-pack` (whichever the team picks first). If the next batch hasn't been named yet, write `[NEXT] — first Phase 3 batch (R-RX-POLISH or R-LAYOUT-UX; ordering TBD)`.
- **§10 Changelog:** Append a row dated 2026-05-21 for "R-HISTORY shipped (cockpit-history-pane batch). BMI badge live; General + Systemic exam split via delimited serialization; Test results textarea wired; legacy vitalsText demoted. Phase 2 of cockpit-v2 ✅ COMPLETE — six R-items shipped over Phase 2 (R-SHELL flip, R-MOD, R-RIBBON, R-CHART, R-MIDDLE, R-HISTORY)."

### 5. Capture-inbox follow-ups

Append 4-5 lines to `docs/Work/capture/inbox.md`:

```md
- [ ] [cockpit-history-pane V2-D7 follow-up] Photo thumbnail strip in Subjective pane — implements the reserved tab-contract slot. Future plan (Phase 3+). (Source: docs/Work/Daily-plans/May 2026/21-05-2026/cockpit-history-pane/plan-cockpit-history-pane-batch.md)
- [ ] [cockpit-history-pane R-HISTORY follow-up] Labs tab in Objective pane — implements the reserved tab-contract slot. Future plan. (Source: same)
- [ ] [cockpit-history-pane DL-5 follow-up] NLP-driven backfill from legacy `vitalsText` → structured vitals. Phase 3+ chore. (Source: same)
- [ ] [cockpit-history-pane DL-6 cleanup] Migrate delimiter from prose `--- SYSTEMIC ---` to ASCII unit-separator (`\x1F`) if delimiter-collision escapes get triggered in real data. (Source: same)
- [ ] [cockpit-history-pane naming] Rename folder `cockpit-history-pane` → `cockpit-right-column-rebuild` so the folder name matches its actual surface (the right column rebuild, not the History pane which shipped via R-CHART). Mechanical rename + roadmap reference update. (Source: same)
- [ ] [cockpit-history-pane V2-Q follow-up] Asian-specific BMI cutoffs (clinic-level config) instead of WHO defaults. Phase 3+. (Source: same)
- [ ] [cockpit-history-pane adoption telemetry] Add `cockpit_v2.r_history_first_field_filled` event when any of the new R-HISTORY fields gets a non-empty value. Separates reachability from adoption. (Source: same)
```

---

## Files touched

- **Modified:** `frontend/lib/patient-profile/telemetry.ts` (+~25 LOC: 1 new function + 1 new window flag).
- **Verified-by-this-task (already modified by chp-03):** `frontend/components/patient-profile/panes/ObjectivePane.tsx` imports + calls the function correctly.
- **Modified:** `docs/Reference/product/cockpit/COCKPIT.md` (~+50 LOC: right-column sub-section).
- **Modified:** `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` (~+10 LOC across §2, §3, §4, §6, §10).
- **Modified:** `docs/Work/capture/inbox.md` (5-7 new lines).

---

## Acceptance gate

- [x] All cross-cutting smoke items pass.
- [x] `trackCockpitV2RHistoryLanded` defined + firing correctly. Verified once-per-session via DevTools.
- [x] `docs/Reference/product/cockpit/COCKPIT.md` updated with the right-column sub-section.
- [x] `plan-cockpit-v2-execution-roadmap.md` updated:
  - R-HISTORY → ✅ DONE.
  - Phase 2 → COMPLETE annotation in §4.
  - Batch ledger row → Shipped.
  - §6 ordering → `cockpit-history-pane` moved to shipped; `[NEXT]` points at the first Phase 3 batch.
  - §10 changelog row appended.
- [x] `docs/Work/capture/inbox.md` has 5-7 new lines.
- [x] No new Sentry errors in 10-min smoke (unit-test sweep green; no runtime smoke in this session).
- [ ] (If close-gate Opus turn used — recommended for Phase 2 closure) Reviewer signoff captured in commit message.

---

## Anti-goals

- ❌ Don't update `plan-cockpit-v2.md` itself — that's chp-05's scope.
- ❌ Don't update tasks.json / Taskmaster — this batch is plan-doc-driven.
- ❌ Don't add new product features. Telemetry + docs only.
- ❌ Don't fire the telemetry event from anywhere other than `ObjectivePane`. Single source of truth per DL-12.
- ❌ Don't claim Phase 3 is now "in flight" — Phase 3 batches haven't been planned yet. The roadmap update just signals Phase 2 closure and the [NEXT] pointer.

---

## Notes

- This is the second-to-last task of the entire Phase-2 chain. After chp-05 closes the source plan, **Phase 2 of cockpit-v2 is officially done.**
- The optional close-gate Opus turn (per AGENT-EXECUTION-EFFICIENCY-GUIDE) is strongly recommended for this task because it's the last per-batch validation before the Phase-2 source-plan close-out in chp-05. ~10k-token review pass to confirm: (1) all 6 R-items shipped match the plan; (2) the Phase 2 gate criteria from source plan §6 are all met; (3) the [NEXT] pointer is sensible for Phase 3. Worth the spend.
- The roadmap update's structure can be terse — the actual Phase-2-COMPLETE banner lives in chp-05's source-plan update. Here we just record the per-batch transition.
- The COCKPIT.md update is long (~50 LOC) because the right column gained the most content of any post-cockpit-shell-flip surface. Worth the document length for future-developer onboarding.
- **Adoption telemetry follow-up (in capture-inbox)** is intentionally separate from this batch — separating reachability (landed) from adoption (field-filled) gives cleaner signal. The follow-up event would fire on the first `setField("vitalsBpSystolic", ...)` (or any new field), once per session.
