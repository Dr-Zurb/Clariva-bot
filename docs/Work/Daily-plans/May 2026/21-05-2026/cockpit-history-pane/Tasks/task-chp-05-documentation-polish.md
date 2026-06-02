# chp-05 · Phase-2 gate — update source product plan

> **Status:** ✅ **DONE** (2026-05-24) — `plan-cockpit-v2.md` updated: all six Phase-2 R-items + Phase-1 prerequisites carry Shipped banners; top metadata reflects Phase 1 + Phase 2 ✅; §6 Phase-2 gate verification block added; capture-inbox archival follow-up appended.

> **Wave 4** of the [cockpit-history-pane batch](../plan-cockpit-history-pane-batch.md). Update `docs/Work/Product plans/plan-cockpit-v2.md` itself — mark Phase 2 ✅ COMPLETE. This is the official Phase-2 closure of the cockpit-v2 plan. Conservative scope: ONLY the source plan + one final capture-inbox line.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | XS (~30-40 LOC into the source plan + 1 capture-inbox line) |
| **Model** | **Composer 2 Fast** — documentation-only. Slow-thinking Opus is overkill for status-banner updates. |
| **Wave** | 4 |
| **Depends on** | chp-04 (per-batch close-out done, roadmap reflects Phase 2 closure) |
| **Blocks** | (nothing — closes Phase 2 of cockpit-v2) |

---

## Goal

The source product plan (`plan-cockpit-v2.md`) is the single canonical statement of what cockpit-v2 is. Every R-item it lists has a `Decision: [ ] Yes [ ] No [ ] Modify` checkbox and an implicit shipped-status. With Phase 2 done, the plan needs to reflect:
1. Every Phase-2 R-item is marked Shipped.
2. The Status legend (top of the plan) is updated to call out Phase 2 closure.
3. The §6 "Phase 2 gate" acceptance items get a verification pass — each criterion either checked or annotated with which Phase-3 batch will close it (criterion 5: "all the polish items from plan-cockpit-rx-pane.md still ship" overlaps Phase 3).

---

## What to do

### 1. Update R-item shipped statuses in `plan-cockpit-v2.md`

For each Phase-2 R-item — R-SHELL, R-MOD, R-CHART, R-RIBBON, R-MIDDLE, R-HISTORY — find the heading line and add a shipped-banner line right after the `**Decision:**` line.

Format:

```markdown
### R-HISTORY · Right column rebuild (Subjective / Objective)

… existing content …

**Decision:** [x] Yes  [ ] No  [ ] Modify

**Shipped:** 2026-05-21 via [cockpit-history-pane](../../Daily-plans/May%202026/21-05-2026/cockpit-history-pane/) batch — chp-01..05.
```

Do this for ALL six Phase-2 R-items. For each, fill in:
- The decision checkbox → `[x]` (assumed; the team did decide Yes by the time the batch shipped).
- The Shipped date + the batch link.

Mapping:

| R-item | Shipping batch | Date |
|---|---|---|
| R-SHELL | Multiple — cockpit-shell-flip-test + cockpit-shell-flip (19-05-2026) | 2026-05-19 |
| R-MOD | templates-r-mod (21-05-2026) | 2026-05-21 |
| R-CHART | cockpit-chart-extraction (20-05-2026) | 2026-05-20 |
| R-RIBBON | cockpit-ribbon (21-05-2026) | 2026-05-21 |
| R-MIDDLE | cockpit-middle-investigations + cockpit-middle-rebuild (21-05-2026) — combined | 2026-05-21 |
| R-HISTORY | cockpit-history-pane (21-05-2026) — this batch | 2026-05-21 |

R-FUTURE-PROOFING and R-RX-FORM are Phase 1 — verify they're already marked shipped from earlier batches (likely cv2-04..09). If not, fix in this task (same one-line banner pattern).

### 2. Update the top-of-plan Status legend / metadata block

Find the metadata block near the top of `plan-cockpit-v2.md` (usually a `**Status:**`, `**Phase:**`, or similar line near the title). Add or update:

```markdown
**Status:** Phase 1 ✅ shipped | Phase 2 ✅ shipped (2026-05-21) | Phase 3 — open for planning
**Phase 2 closure:** 6 of 6 R-items shipped — R-SHELL, R-MOD, R-CHART, R-RIBBON, R-MIDDLE, R-HISTORY. Phase 2 gate criteria met (see §6).
```

If the existing metadata is structured differently, conform to the existing format — the goal is the information, not the exact text.

### 3. Verify §6 Phase-2 gate criteria

The source plan §6 (or wherever the "Phase 2 gate" / "after this plan ships" criteria are listed) has six items (the `What changes` block from the start of the plan). Walk through each and add a ✅ + batch reference:

```markdown
**Phase 2 gate — verified 2026-05-21:**

1. **8 default sub-panes in a nested tree** ✅ — shipped via cockpit-shell-flip (Snapshot / History) + cockpit-chart-extraction (left column split) + cockpit-middle-investigations (Investigations) + cockpit-middle-rebuild (Body / Assessment / Plan strips) + cockpit-history-pane (Subjective / Objective).
2. **4 modality-aware default templates** ✅ — shipped via templates-r-mod (R-MOD-full).
3. **A patient ribbon runs full-width above all panes** ✅ — shipped via cockpit-ribbon (R-RIBBON).
4. **The Rx pane no longer exists as a single column** ✅ — distributed across Subjective / Objective / Assessment / Investigations / Plan via cv2-06 + R-MIDDLE + R-HISTORY.
5. **All polish items from `plan-cockpit-rx-pane.md` still ship** ⏳ Phase 3 — R-RX-POLISH not yet planned; tracked in roadmap §6 [NEXT].
6. **Future auxiliary surfaces contracted but not built** ✅ — shipped via cv2-09 (`aux-surfaces.ts` + `types.ts.tabs?`).
```

Insert this block right after the §6 gate-criteria list if one exists; otherwise add it under §6 as a sub-section titled "Phase 2 gate verification (2026-05-21)."

### 4. Capture-inbox: source plan archival follow-up

Append ONE line to `docs/Work/capture/inbox.md`:

```md
- [ ] [cockpit-v2 Phase-3 close-out] After Phase 3 of cockpit-v2 ships, archive `plan-cockpit-v2.md` to `docs/Work/Product plans/archive/` and move its `plan-cockpit-v2-execution-roadmap.md` companion alongside. The plan is canonical-history at that point. (Source: docs/Work/Daily-plans/May 2026/21-05-2026/cockpit-history-pane/task-chp-05-documentation-polish.md)
```

### 5. Verify

The verification is a docs-grep:

```powershell
# All Phase-2 R-items carry a "Shipped:" line
rg "Shipped: 2026-" "docs/Work/Product plans/plan-cockpit-v2.md"
# Should show ~6 hits (one per shipped R-item).

# Status block updated
rg "Phase 2 ✅" "docs/Work/Product plans/plan-cockpit-v2.md"
# Should show at least one hit.
```

No automated test for this task — it's a docs update. Manual review during the optional close-gate Opus turn (see Notes).

---

## Acceptance gate

- [x] All six Phase-2 R-items in `plan-cockpit-v2.md` carry a "Shipped: 2026-MM-DD via [batch-name](link)" line.
- [x] The top-of-plan Status / metadata block reflects Phase 1 + Phase 2 both ✅ shipped.
- [x] The §6 Phase-2 gate has each criterion either checked ✅ with batch reference, or explicitly annotated as Phase-3 overlap.
- [x] `docs/Work/capture/inbox.md` has one new line for the Phase-3 source-plan archival.
- [ ] (Optional close-gate Opus turn) Reviewer verdict captured in commit message — confirms all six criteria are genuinely met, not just claimed.

---

## Anti-goals

- ❌ Don't archive or delete the source plan. DL-(implicit): the plan stays canonical until Phase 3 ships too. Archive is a Phase-3 close-out task (capture-inbox).
- ❌ Don't move the plan to a different folder.
- ❌ Don't add new R-items, new DLs, or new open questions. The source plan is FROZEN for closure; new work belongs in Phase 3 plans.
- ❌ Don't claim Phase 3 is in flight. Phase 3 doesn't even have a planning batch yet. The status is "open for planning."
- ❌ Don't touch the roadmap doc here — chp-04 owns that. This task touches ONLY the source plan + one capture-inbox line.
- ❌ Don't change any of the source plan's DL-1..DL-25 wording. They're historical record.

---

## Notes

- **Why a separate task from chp-04?** Different artifact, different stakeholders. chp-04 updates the engineering / agent-execution tracker (`plan-cockpit-v2-execution-roadmap.md`). chp-05 updates the PRODUCT plan (`plan-cockpit-v2.md`) which is the source-of-truth for what we set out to build. The two updates have different review concerns:
  - Roadmap: did we ship the batches we planned? Were the dates accurate?
  - Source plan: did we ship the R-items we promised? Did the Phase 2 gate criteria actually pass?
  
  Splitting prevents stuffing too much into one task and keeps the close-out review focused.
- **Why is this Composer 2 Fast and not Opus?** Documentation status-banner updates don't benefit from slow-thinking. Per AGENT-EXECUTION-EFFICIENCY-GUIDE the criterion-by-criterion verification is mechanical (grep + spot-check), not a novel decision. The OPTIONAL close-gate Opus review afterward is where slow-thinking adds value — verifying that the criteria are genuinely met, not just textually claimed. If the close-gate is run, it can be a single ~10k-token Opus chat that reads the source plan + the 4 shipping batches + spot-checks the implementation files.
- **The Phase-2-COMPLETE banner is a milestone marker.** It signals to anyone reading `plan-cockpit-v2.md` later that the plan delivered. It also unblocks Phase 3 planning — the next planning conversation can start with "Phase 2 is closed; what's the first Phase 3 batch?"
- **R-RX-POLISH overlap (criterion 5 of the gate).** This is the only criterion that doesn't fully resolve in Phase 2. R-RX-POLISH is a Phase 3 R-item; its polish items (sticky safety, sticky send, medicine row densification, etc.) ship in Phase 3 batches. The Phase-2 gate verification annotates this honestly — "⏳ Phase 3" instead of pretending it's resolved.
- **The capture-inbox archival follow-up.** Phase 3 ships R-RX-POLISH + R-LAYOUT-UX; once both are done, the source plan + roadmap can move to `archive/`. The follow-up captures the cleanup task; whoever plans the final Phase 3 close-out will see it.
