# Cockpit v2 decommission — 24 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). **Zero Opus tasks.** Pure cleanup — kill-switch removal, legacy code deletion, archival. Two Auto + one Composer 2 Fast.
>
> **Source plan:** [`plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md) Phase-3 gate criteria — "All R-items shipped; legacy `/v2` and kill-switches removed; plan archived." Plus the soak-window capture from [`csf-05` follow-up](../../19-05-2026/cockpit-shell-flip/Tasks/task-csf-05-production-cutover.md): "Remove `?v1=1` kill-switch + `legacyBuiltInPanes` array after 4-week soak window from 2026-05-19."
>
> **Predecessor batches:** ALL Phase 2 + ALL Phase 3 batches MUST be shipped. Plus the 4-week soak window from cockpit-shell-flip production-cutover (2026-05-19 → 2026-06-16). **MUST be the last batch of the cockpit-v2 program.**
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-cockpit-v2-decommission.md`](./Tasks/EXECUTION-ORDER-cockpit-v2-decommission.md).

---

## Why this batch

cockpit-v2 has run for ~5 weeks (2026-05-17 cv2 batch → 2026-06-16 expected ship of last Phase-3 batch). During this window, the codebase carried **dual-render safety nets**:

1. **`?v1=1` URL kill-switch** in `PatientProfilePage.tsx` — opt back into the legacy 3-pane layout if the new shell broke (csf-05).
2. **`legacyBuiltInPanes` fallback array** in `templates.tsx` — used by the kill-switch path; a hand-maintained mirror of the pre-cv2 pane definitions.
3. **Legacy 099 `layout` flat-shape readers** in `doctor-settings-service.ts` — kept for backwards-compat with pre-110 presets. These still work but the migration to `layout_tree` (clpm-04 batch) makes them unnecessary at the read path beyond the auto-migration on first load.
4. **The product plan + execution roadmap** at `Product plans/plan-cockpit-v2*.md` are now "history" — accurate at planning time but no longer the source of truth for current cockpit work.

After the 4-week soak with zero kill-switch escapes (verified via telemetry — see acceptance gate), we decommission:

1. Remove `?v1=1` parameter parsing + the dual-branch in `PatientProfilePage.tsx` → single tree-shell render path.
2. Delete `legacyBuiltInPanes` from `templates.tsx`.
3. Delete `useShellLayout` 3-pane fallback if any remains for kill-switch.
4. Move `plan-cockpit-v2.md` + `plan-cockpit-v2-execution-roadmap.md` to `docs/Work/Product plans/archive/` with a `# ARCHIVED` banner pointing at the current cockpit-evolution docs.
5. Final Phase 3 gate-criteria audit + cockpit-v2 program close-out announcement (capture-inbox lines for follow-up cockpit work).

This batch closes the cockpit-v2 program with **3 tasks across 2 waves**, **~3-5h wall-clock (~half-dev-day)**, **zero migrations** (legacy 099 stays — it's still the source of truth for pre-110 doctors' presets until they re-save), **zero Opus tasks**.

---

## Decision lock

**DL-1: Soak-window gate is MANDATORY.** Do NOT begin this batch until:
- 4 weeks have elapsed since csf-05 production cutover (cockpit-shell-flip, 2026-05-19 → 2026-06-16).
- ALL five preceding 24-05 batches have shipped (rxd-04, rxf-07, rxs-04, rxss-04, clpm-06).
- Kill-switch telemetry shows < 1% escape rate for the last 7 consecutive days (per csf-05 acceptance gate language).

**DL-2: Soft delete first, hard delete in a follow-up batch.** This batch removes the `?v1=1` URL handling so doctors can no longer escape. Code paths reachable only via the kill-switch are marked `@deprecated` and slated for removal in a Q3 cleanup batch. Rationale: if something subtle breaks, we want easy revert without restoring deleted code.

**DL-3: Legacy 099 flat-shape READ path stays.** Doctors who saved presets before clpm-04 still have rows with only `layout` (no `layout_tree`). The read-path auto-converts via `legacyFlatToTree`. Removing this path requires either a data migration (write tree shape to every legacy row) or doctor opt-in re-save. Capture-inbox: "Q3 2026 — migrate all `cockpit_layout_presets` rows to have `layout_tree`, then drop the legacy `layout` shape and the converter."

**DL-4: Archived plans get a banner.** Top of archived `plan-cockpit-v2.md` and `plan-cockpit-v2-execution-roadmap.md`:

```markdown
> **🗄️ ARCHIVED — Cockpit v2 program completed 2026-06-{day}.**
> This plan and its roadmap are kept for historical reference. They are no
> longer the source of truth. Current cockpit work tracked in:
> - Daily plans under `docs/Work/Daily-plans/` (search "cockpit-").
> - Future cockpit product plan(s) (TBD when the next major cockpit
>   refactor is scoped).
> See `docs/Reference/product/cockpit/COCKPIT.md` for the current cockpit reference.
```

**DL-5: `docs/Reference/product/cockpit/COCKPIT.md` is promoted to the "single source of truth" for current cockpit state.** This document was built up batch-by-batch through cv2 / Phase 2 / Phase 3. After decommission, it's the only living cockpit doc. Add a top-of-page note clarifying its source-of-truth status.

**DL-6: Telemetry events from the cockpit-v2 program continue to fire.** Don't remove the `cockpit_v2.*` event names from telemetry.ts — they're now historical metric names and we want trend continuity. New cockpit work introduces new event names; old ones stay.

**DL-7: No frontend dependency removals.** Even if some dep (e.g. `cmdk`, `react-window`) was added strictly for cockpit-v2 work, leaving them is harmless. Removing risks breaking adjacent surfaces.

**DL-8: Telemetry — one event** `cockpit_v2.program_completed` — one-shot per session; payload `{ phase2BatchesShipped, phase3BatchesShipped, soakDays, killSwitchEscapeRatePct }`. Fires from `PatientProfilePage.tsx` on first render post-decommission. Captures the "we did it" moment for analytics + the audit trail.

---

## Phases

### Wave 1 — Pre-flight (1 task, ~1h)

- [`task-cvd-01-preflight-soak-audit.md`](./Tasks/task-cvd-01-preflight-soak-audit.md) — **XS, Auto** — Verify all gate conditions from DL-1: 4-week soak elapsed; 5 preceding batches shipped; kill-switch escape rate < 1% per telemetry dashboard query. Documents the verification in `docs/Work/capture/inbox.md` as a decision-record. If gates fail, this batch HALTS — no further tasks run until conditions met.

### Wave 2 — Code + docs cleanup (2 tasks, ~2-4h)

- [`task-cvd-02-remove-kill-switch-and-legacy-panes.md`](./Tasks/task-cvd-02-remove-kill-switch-and-legacy-panes.md) — **S, Auto** — Remove `?v1=1` parsing + dual-branch from `PatientProfilePage.tsx`; delete `legacyBuiltInPanes` from `templates.tsx`; mark any kill-switch-only helpers `@deprecated`. Wire `trackCockpitV2ProgramCompleted` per DL-8. tsc / lint / test / build sweep.
- [`task-cvd-03-archive-plans-and-final-docs.md`](./Tasks/task-cvd-03-archive-plans-and-final-docs.md) — **XS, Composer 2 Fast** — Move `plan-cockpit-v2.md` + `plan-cockpit-v2-execution-roadmap.md` to `Product plans/archive/`; add DL-4 banner; promote COCKPIT.md per DL-5; update inbox with Q3 follow-ups; cockpit-v2 program close-out summary line in inbox; final roadmap snapshot for the archive.

---

## Cross-cutting acceptance gate

### Pre-flight (Wave 1 strict)
- [ ] 4-week soak window elapsed (2026-06-16 or later).
- [ ] All five preceding 24-05 batches shipped + green.
- [ ] Kill-switch escape rate < 1% for last 7 consecutive days.
- [ ] Wave 2 cleared to start ONLY if all three above are true.

### Code cleanup
- [ ] `?v1=1` URL parsing removed; QA confirms appending the param no longer changes layout.
- [ ] `legacyBuiltInPanes` array deleted from `templates.tsx`.
- [ ] tsc / lint / test / build clean.
- [ ] `cockpit_v2.program_completed` telemetry fires once per session.

### Docs / archive
- [ ] `plan-cockpit-v2.md` moved to `Product plans/archive/` with banner.
- [ ] `plan-cockpit-v2-execution-roadmap.md` moved to `Product plans/archive/` with banner.
- [ ] `docs/Reference/product/cockpit/COCKPIT.md` updated with "single source of truth" note.
- [ ] `docs/Work/capture/inbox.md` has Q3 follow-ups + program-close-out summary.
- [ ] Repo grep: zero remaining references to `?v1=1` or `legacyBuiltInPanes`.

---

## Cost estimate

| Wave | Tasks | Auto | Composer | Opus | Wall-clock |
|---|---|---|---|---|---|
| 1 | cvd-01 | 1 | 0 | 0 | ~1h |
| 2 | cvd-02, cvd-03 | 1 | 1 | 0 | ~2-4h |
| **Total** | **3** | **2** | **1** | **0** | **~3-5h** |

---

## References

- Source plan: [`plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md) — Phase 3 gate.
- Predecessor batch: [`cockpit-shell-flip`](../../19-05-2026/cockpit-shell-flip/) — csf-05 captured the soak window.
- Files to touch:
  - [`frontend/app/dashboard/appointments/[id]/page.tsx`](../../../../../frontend/app/dashboard/appointments/[id]/page.tsx)
  - [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../frontend/components/patient-profile/PatientProfilePage.tsx)
  - [`frontend/lib/patient-profile/templates.tsx`](../../../../../frontend/lib/patient-profile/templates.tsx)
  - [`frontend/lib/patient-profile/useShellLayout.ts`](../../../../../frontend/lib/patient-profile/useShellLayout.ts)
  - [`frontend/lib/patient-profile/layout.ts`](../../../../../frontend/lib/patient-profile/layout.ts)
