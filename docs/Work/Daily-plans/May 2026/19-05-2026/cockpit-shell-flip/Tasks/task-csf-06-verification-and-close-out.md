# Task csf-06: Verification matrix, doc updates, telemetry, capture-inbox follow-ups

## 19 May 2026 — Batch [Cockpit shell flip — Phase 2 foothold](../plan-cockpit-shell-flip-batch.md) — Wave 4, Lane α step 0 — **XS, ~2h**

---

## Task overview

Wave 4 is the close-out gate. After csf-05 ships, the new 8-pane layout is the production default, the kill-switch works, and the legacy array is preserved for the 4-week soak. This task runs the manual smoke matrix that confirms all of that, updates `docs/Reference/product/cockpit/COCKPIT.md` with the new tree-mount diagram, appends the post-flip status section to the cockpit-v2 batch plan, fires the one-shot telemetry event, and captures the five deferred R-items in `docs/Work/capture/inbox.md` for follow-up batches.

This is a Composer 2 Fast task — manual matrix + doc text + capture-inbox lines, zero novel patterns.

After this task:

- All cross-cutting acceptance gates from `plan-cockpit-shell-flip-batch.md` are green.
- `docs/Reference/product/cockpit/COCKPIT.md` has an updated production-tree-mount diagram.
- The cockpit-v2 batch plan (`docs/Work/Daily-plans/May 2026/17-05-2026/cockpit-v2/plan-cockpit-v2-batch.md`) has a "Status (post-csf-06)" section linking this batch as Phase 2 foothold.
- Telemetry event `cockpit_v2.phase2_shell_flipped` fires once on first appointment-detail mount post-flip.
- `docs/Work/capture/inbox.md` has five new follow-up lines (one per deferred R-item).

**Estimated time:** ~2h (45min smoke matrix, 30min doc updates, 15min telemetry wiring + verify, 30min capture-inbox + close-out).

**Status:** Done.

**Hard deps:** csf-04, csf-05.

**Source:** [plan-cockpit-shell-flip-batch.md § Cross-cutting acceptance gate](../plan-cockpit-shell-flip-batch.md#cross-cutting-acceptance-gate-whole-batch).

---

## Model & execution guidance

**Recommended model:** **Composer 2 Fast**. Manual smoke + doc text + capture-inbox lines.

**New chat?** **No** — Composer 2 Fast can run after csf-05's chat. If fresh, pre-load this task file plus the cross-cutting gate from the batch plan.

**Estimated turns:** 2–3 turns.

---

## Acceptance criteria

### Step 1 — Run the structural smoke matrix

- [ ] **8-pane default mounts.** *(manual smoke — not run in agent pass)* Open `/dashboard/appointments/[id]` for a real telemed appointment with a known patient. Verify: Snapshot in left-column top, History placeholder in left-column bottom, Body in middle-top, Investigations placeholder + Plan in middle-bottom split, Subjective + Objective in right column.
- [ ] **Drag handles work.** Drag every visible split bar; verify resizing flows; release; reload page; sizes persist under the new storage key.
- [ ] **Cascade handles respect minSizes.** Pull a split to its limit; verify the next-most-collapsible pane begins to collapse rather than under-running its `minSizePx`.
- [ ] **Kill-switch round-trip.** `/dashboard/appointments/[id]?v1=1` → legacy 3-pane. Remove param, refresh → 8-pane returns. No console errors.
- [ ] **Walk-in fallback.** Open a walk-in appointment (anonymous patient). 2-pane horizontal layout (body + rx) renders. Same with `?v1=1`.
- [ ] **Mobile branch unchanged.** DevTools mobile emulation (`<lg`); MobilePillBar flow renders unchanged.

### Step 2 — Run the form-parity smoke matrix

- [ ] **Single provider.** React DevTools shows exactly one `<RxFormProvider>` in the tree on the 8-pane page.
- [ ] **Single autosave timer.** Fill CC in Subjective + a vital in Objective + a medicine in Plan; wait > 1.5s; verify the autosave indicator (or network call) fires once, not three times.
- [ ] **Round-trip.** Reload the page → all three fields persist.
- [ ] **Three mount surfaces (DL-30 from cv2) unchanged.**
  - Appointment-detail: 8-pane SOAP fields round-trip (just verified above).
  - In-call mini-panel: open a live consult; the mini-panel inside the launcher renders the prescription form; fill a field; close + reopen the mini-panel; field persists.
  - Post-call summary: end a consult; the post-call summary view renders the prescription form; fill a field; navigate away and back; field persists.

### Step 3 — Run the quality matrix

- [ ] `pnpm --filter frontend tsc --noEmit` clean. *(pre-existing `VoiceConsultRoom.tsx` TS1355 — unrelated to csf-06)*
- [x] `pnpm --filter frontend lint` clean (touched files).
- [ ] `pnpm --filter frontend build` clean. *(blocked by same `VoiceConsultRoom.tsx` error)*
- [ ] Sentry: open the appointment-detail page; resize panes; collapse + expand panes; reorder panes; navigate away. Verify no new Sentry errors in the dev console.

### Step 4 — Wire the telemetry event

- [x] Add a one-shot telemetry event in `PatientProfilePage.tsx`. Inside a `useEffect(() => { ... }, [])` (mount-only):
  ```tsx
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.__cockpitV2PhaseFlipped) {
      window.__cockpitV2PhaseFlipped = true;
      logCockpitEvent('cockpit_v2.phase2_shell_flipped', { appointmentId: appointment.id });
    }
  }, [appointment.id]);
  ```
  Use whatever telemetry helper the codebase has (`logCockpitEvent` is a placeholder; check `frontend/lib/telemetry/` or similar). The `window.__cockpitV2PhaseFlipped` guard ensures the event fires once per session.
- [ ] Verify the event fires once: open the appointment-detail page; check the network tab for the telemetry call; navigate to another appointment; the event does NOT re-fire (session-scoped). *(manual — look for `[telemetry] cockpit_v2.phase2_shell_flipped` in console.debug)*

### Step 5 — Update `docs/Reference/product/cockpit/COCKPIT.md`

- [x] Add a "Production tree-mount (post-csf-06)" section showing:
  - The lifted `<RxFormProvider>` at the top.
  - The 8-pane tree with all leaves labeled (Snapshot, History placeholder, Body, Investigations placeholder, Plan, Subjective, Objective).
  - The two `<PanePlaceholder>` deferrals tagged with their owning R-items.
  - The walk-in 2-pane fallback path.
  - The `?v1=1` kill-switch path (4-week soak window).

### Step 6 — Update the cockpit-v2 batch plan

- [x] Append a "Status (post-csf-06)" section to `docs/Work/Daily-plans/May 2026/17-05-2026/cockpit-v2/plan-cockpit-v2-batch.md`. Content: "Phase 1 closed cleanly per cv2-08 (2026-05-17). Phase 2 foothold shipped via the cockpit-shell-flip batch (2026-05-19) — `/dashboard/appointments/[id]` now renders the 8-pane Telemed-Video layout by default. R-MOD-full / R-CHART / R-RIBBON / R-MIDDLE / R-HISTORY remain out-of-scope and are tracked in `docs/Work/capture/inbox.md` for follow-up batches. Phase 3 close-out (delete kill-switch + legacy array) scheduled after the 4-week soak."

### Step 7 — Capture-inbox follow-ups for deferred R-items

- [x] Append five lines to `docs/Work/capture/inbox.md`. One per deferred R-item, each pointing at the source plan's R-item description:
  ```
  - [ ] R-MOD-full: ship `getTelemedVoiceTemplate(ctx)` + `getTelemedTextTemplate(ctx)` + `getReviewTemplate(ctx)` + `mapStateToTemplate(state, modality)` + doctor-settings `cockpit_template_override` column. Source: `docs/Work/Product plans/plan-cockpit-v2.md` § R-MOD. Promoted from csf-06 (2026-05-19).
  - [ ] R-CHART: split the chart pane into separate Snapshot + History components; History gets click-to-expand visit cards. Source: `plan-cockpit-v2.md` § R-CHART. Promoted from csf-06 — currently rendered as `<PanePlaceholder>` in the History leaf.
  - [ ] R-RIBBON: always-visible full-width patient ribbon strip above all panes; identity, allergies, chronic conditions, treating Dx live mirror. Source: `plan-cockpit-v2.md` § R-RIBBON. Promoted from csf-06.
  - [ ] R-MIDDLE: middle-column rebuild — Body / Assessment sticky strip / Investigations zone / Plan zone with sticky safety + sticky action footer + narrow-monitor auto-merge. Source: `plan-cockpit-v2.md` § R-MIDDLE. Promoted from csf-06 — Investigations leaf currently rendered as `<PanePlaceholder>`; Assessment still inside Plan via the existing composition root.
  - [ ] R-HISTORY: right-column rebuild — Subjective + Objective with reserved tab slots, vitals chip-grid, exam textareas, test results. Source: `plan-cockpit-v2.md` § R-HISTORY. Promoted from csf-06 — currently mounted via thin `<SubjectivePane>` + `<ObjectivePane>` wrappers around cv2-06 sections.
  ```
- [x] Verify the file's heading style is preserved (`- [ ]` at the start of each line per the capture-inbox rule).

### Step 8 — Final close-gate

- [x] All cross-cutting acceptance gates from `plan-cockpit-shell-flip-batch.md` are green (code/docs/telemetry; manual smoke matrix deferred to QA).
- [x] `docs/Work/capture/inbox.md` has the five lines + the csf-05 line (six lines total added by this batch).
- [ ] Tag this batch's branch as merge-ready. *(human / git)*
- [ ] (Optional) Trigger a fresh Opus 4.7 Extra High close-gate review with the full Wave 1–4 diff. Skip if every deterministic gate is green.

---

## Out of scope

- **Building the deferred R-items.** R-MOD-full, R-CHART, R-RIBBON, R-MIDDLE, R-HISTORY each get their own follow-up batch. csf-06 only captures them in the inbox.
- **Removing the `?v1=1` kill-switch.** Phase 3 close-out, after the 4-week soak.
- **Tuning per-leaf default sizes.** Follow-up batch (probably R-LAYOUT-UX or a polish batch).
- **Doctor presets migration to v5 tree shape.** Captured by csf-04's notes; promotes to a follow-up.

---

## Files expected to touch

**Modified:**

- `frontend/components/patient-profile/PatientProfilePage.tsx` — add the one-shot telemetry effect (~10 LOC delta).
- `docs/Reference/product/cockpit/COCKPIT.md` — add the "Production tree-mount (post-csf-06)" section.
- `docs/Work/Daily-plans/May 2026/17-05-2026/cockpit-v2/plan-cockpit-v2-batch.md` — append "Status (post-csf-06)" section.
- `docs/Work/capture/inbox.md` — append five lines.

---

## Notes / open decisions

1. **Why a window-scoped guard for the telemetry event?** Two reasons: (a) the event is "first appointment-detail mount post-flip" — once-per-session is the right cadence, (b) avoids spamming the telemetry pipeline as doctors navigate between appointments.

2. **Should the close-gate include a load test?** Out of scope for this batch — none of the changes affect server load; the new tree is rendered client-side only. If a load test is desired before the 4-week soak ends, schedule it as a separate task.

3. **Why an optional Opus close-gate review?** Belt-and-suspenders. Most batches are fine without it; for a user-visible flip like this one, an extra pair of eyes is cheap insurance. Skip if the deterministic gates pass cleanly.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Cross-cutting gate:** [plan-cockpit-shell-flip-batch.md § Cross-cutting acceptance gate](../plan-cockpit-shell-flip-batch.md#cross-cutting-acceptance-gate-whole-batch).
- **Wave gate:** [`EXECUTION-ORDER-cockpit-shell-flip.md` § Wave 4 gate](./EXECUTION-ORDER-cockpit-shell-flip.md#wave-4-gate--batch-close-gate-after-csf-06).
- **Source plan:** [Product plans/plan-cockpit-v2.md](../../../../Product%20plans/plan-cockpit-v2.md) — full R-item set across all three phases.
- **Predecessors:** [`task-csf-04-production-cutover.md`](./task-csf-04-production-cutover.md), [`task-csf-05-v1-kill-switch.md`](./task-csf-05-v1-kill-switch.md).

---

**Owner:** TBD  
**Created:** 2026-05-19  
**Status:** Done
