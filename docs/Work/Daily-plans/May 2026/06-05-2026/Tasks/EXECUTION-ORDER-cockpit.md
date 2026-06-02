# Consultation cockpit redesign — Execution order (authoritative)

**Status:** Shipped — 2026-05-06. All 8 cockpit task specs marked **Shipped**; batch implementation complete.  
**Last doc sync:** 2026-05-06  
**Owner:** TBD  
**Scope:** 8 tasks across 4 parallel-chat lanes (α, β, γ, δ)  
**Total estimate:** ~3–4 dev-days solo · ~2 calendar days with 4 parallel chats  
**Parent batch plan:** [plan-cockpit-redesign-batch.md](../plan-cockpit-redesign-batch.md)  
**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## TL;DR — read before you touch any task

1. **`cockpit-1` is the only hard prerequisite.** Once the state machine helper lands, the other 7 tasks fan out into **4 parallel-chat lanes** (α, β, γ, δ).
2. **One Cursor chat per lane.** You can run α + β + γ + δ in **four chat windows side by side** — they touch independent files. The lane table below is the authoritative no-collision matrix.
3. **Within lane α, tasks are sequential** (they all touch `ConsultationCockpit.tsx` + the appointment page). Cut the chat at α-task boundaries; do not extend a chat across cockpit-2 → cockpit-3 unless context < 300 lines of diff.
4. **One topic per chat.** Each task file's `## Model & execution guidance` block tells you the model to pick + what to pre-load. **Start a fresh chat per task unless lane-α stitching is documented as safe.**
5. **No iteration loops.** If the agent has rewritten the same component twice, **stop**, tighten the spec in the task file, start a new chat. Each rewrite ≈ paying twice.
6. After each task ships, update its row in the task file (`Status: Shipped (YYYY-MM-DD)`) AND tick the row in [plan-cockpit-redesign-batch.md](../plan-cockpit-redesign-batch.md). Doc-sync turns are **Composer 2 Fast**.

---

## Pre-flight — confirm before starting

```
- [ ] Sub-batch A (foundation) and Sub-batch D1 of the UI redesign batch have shipped.
      Required primitives: Tabs, Card, Button, Badge, Sheet, DropdownMenu, Popover, Tooltip.
      Verify: ls frontend/components/ui/  → button, card, badge, sheet, dropdown-menu, tooltip,
              popover, tabs all present.
- [ ] D1's <AppointmentDetailWorkArea> + 4-tab <Tabs> are live on dashboard appointment detail.
      Cockpit-2 replaces it; cockpit-4 deletes it.
- [ ] Frontend dev server runs clean: cd frontend && npm run dev
- [ ] Frontend type-check + lint clean BEFORE starting:
      cd frontend && npx tsc --noEmit && npx next lint
- [ ] Recent screenshot of current appointment-detail page saved for before/after.
```

If those are green, **cockpit-1 is unblocked** and 4 parallel lanes are ready to fan out after it ships.

---

## Model-tier glossary

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Tier | Label | Model | Use for |
|---|---|---|---|
| 1 | **Opus** | Opus 4.7 Extra High | Architectural / multi-file decisions; state-machine design (cockpit-1); close-gate review. |
| 2 | **Sonnet** | Sonnet 4.6 Medium | Default — bounded UI tasks with clear specs. |
| 3 | **Codex** | Codex 5.3 Medium | Sonnet alternative; pure code-gen / type-error fix. |
| 4 | **Composer** | Composer 2 Fast | Doc-sync, file deletes, status updates, markdown edits. |

**Per-message escalation:** if Sonnet stalls on one message, escalate **that** message to Opus. Don't switch the whole chat.

---

## Parallel-chat lane matrix (the multi-tasking workflow)

This is the new workflow you wanted: **multiple Cursor chats running in parallel on different lanes**. The matrix below is engineered so each lane touches disjoint files — no merge conflicts, no edit-stomp races.

| Lane | Window title | Tasks (in order) | Files owned exclusively by this lane | Wait-on |
|---|---|---|---|---|
| **α** (cockpit core) | "α — cockpit shell" | cockpit-2 → cockpit-3 → cockpit-4 → cockpit-7 | `app/dashboard/appointments/[id]/page.tsx`, `components/consultation/ConsultationCockpit.tsx`, `components/consultation/cockpit/CockpitHeader.tsx`, `components/consultation/cockpit/RxRailToggle.tsx` | cockpit-1 ship |
| **β** (Rx workspace) | "β — Rx workspace" | cockpit-5 | `components/consultation/cockpit/RxWorkspace.tsx`, `components/consultation/cockpit/PreviousRxPopover.tsx` | cockpit-2 ship (needs the mount slot) |
| **γ** (in-call cleanup) | "γ — in-call cleanup" | cockpit-6 | `components/consultation/InCallQuickActions.tsx`, `components/consultation/VideoRoom.tsx`, `components/consultation/VoiceConsultRoom.tsx`, `components/ehr/InCallChartRxTabs.tsx` (DELETE) | cockpit-1 ship (uses the same state types) |
| **δ** (patient page) | "δ — patient page" | cockpit-8 | `app/dashboard/patients/[id]/page.tsx`, `components/patients/PatientCockpit.tsx` | cockpit-1 ship |

**No-collision guarantees:**

- α never touches `InCallQuickActions.tsx` / `VideoRoom.tsx` / `VoiceConsultRoom.tsx` (γ's files).
- β creates only **new** files under `components/consultation/cockpit/`. The mount slot in α's `ConsultationCockpit.tsx` is added in cockpit-2 (a single-line `<RxWorkspace />` import) and **β never edits that file** — it builds the component in isolation, α imports it.
- δ touches only the patient page tree; never the appointment page tree.
- The only file three lanes might want to import from each other is `lib/consultation/cockpit-state.ts` (cockpit-1) — that file is **frozen** by the time α/β/γ/δ start (cockpit-1 is the prerequisite).

**Suggested wall-clock plan (solo dev with 4 chats):**

```
T+0h    Open Chat 0:           cockpit-1 (Opus design + Sonnet impl + tests)
T+2h    cockpit-1 ships → 4 chats fan out:

   Chat α — cockpit shell        Chat β — Rx workspace      Chat γ — in-call cleanup        Chat δ — patient page
   ──────────────────────────    ────────────────────────   ──────────────────────────      ──────────────────────
   T+2h  cockpit-2 (5h)          T+5h cockpit-5 (4h)*       T+2h  cockpit-6 (3h)            T+2h  cockpit-8 (5h)
   T+7h  cockpit-3 (5h)
   T+12h cockpit-4 (4h)
   T+16h cockpit-7 (3h)

   * β waits 3h for α's cockpit-2 to land the mount slot (β uses that idle time
     to draft the spec / pre-load the chat).

T+17h   close-gate Opus review (1h)  → done.
```

Solo: **~17h focused work** spread across **2 calendar days** if you can context-switch between 2 chats at a time. Pure-serial without parallelism: ~31h (~3.5 days).

**Operating rules for multi-chat workflow:**

1. **One window per lane.** Don't put α-2 and β-1 in the same chat — context costs money even if the diffs don't collide.
2. **Pin the task file.** First message of every lane chat: paste the task spec file path + open the file in the IDE.
3. **Mention the lane in your first prompt.** e.g. *"This is lane α — cockpit shell. Reading task-cockpit-2-shell.md. Do not touch any file owned by lanes β, γ, δ (see EXECUTION-ORDER-cockpit.md § Parallel-chat lane matrix)."* This reduces the chance the agent goes exploring into another lane's territory.
4. **Sync at lane boundaries.** When α-2 ships, post a one-line ping in chat β: *"cockpit-2 has landed; mount slot is at `<MOUNT_SLOT_PATH>:LXX`."* Then β can start.
5. **Status-sync turns go to Composer.** When 2 lanes have shipped a task, **don't** update the plan + the task + the source plan in the same lane chat (that's an Opus/Sonnet chat with markdown overhead). Open a 5-minute Composer chat for the three-way doc sync.
6. **Bail out if lanes drift.** If α and β chats both start trying to edit the same file (because a lane spec was wrong), **stop both chats**, fix the spec in this file, restart. Two chats stomping each other costs more than the speedup.

---

## Execution table — full per-task view

### Lane α — Cockpit core (sequential within lane)

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Parallel-eligible | Unblocks |
|---|---|---|---|---|---|---|---|---|
| α-0 | [cockpit-1 — state machine helper](./task-cockpit-1-state-machine.md) | XS (~2h) | — | — | **Opus** for design (~30min), **Sonnet** for impl + tests | Yes | Run alone first | All other tasks |
| α-1 | [cockpit-2 — three-pane shell](./task-cockpit-2-shell.md) | M (~5h) | cockpit-1 | A2 primitives (already shipped) | **Opus** for layout / hydration design, **Sonnet** for impl | Yes | β starts after this; γ can start in parallel since cockpit-1 ships first | cockpit-3, cockpit-5 (Rx mount slot) |
| α-2 | [cockpit-3 — state-driven center pane](./task-cockpit-3-state-panes.md) | M (~5h) | cockpit-2 | — | **Sonnet** | Yes (or stitched after α-1 if context fits) | — | cockpit-4 |
| α-3 | [cockpit-4 — header + modality split + delete tabs](./task-cockpit-4-header.md) | M (~4h) | cockpit-3 | — | **Sonnet** | Yes | — | cockpit-7 |
| α-4 | [cockpit-7 — mobile bottom-sheet pills](./task-cockpit-7-mobile.md) | S (~3h) | cockpit-4 | — | **Sonnet** | Yes | — | — |

### Lane β — Rx workspace (1 task, parallel after α-1)

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Parallel with | Unblocks |
|---|---|---|---|---|---|---|---|---|
| β-1 | [cockpit-5 — Rx workspace + PreviousRxPopover + sticky action bar](./task-cockpit-5-rx-workspace.md) | M (~4h) | cockpit-2 (mount slot exists) | A2 Popover primitive | **Sonnet** | Yes — own chat | α-2/3, γ-1, δ-1 | cockpit-3 (state pane wires the workspace) |

### Lane γ — In-call cleanup (1 task, parallel any time after cockpit-1)

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Parallel with | Unblocks |
|---|---|---|---|---|---|---|---|---|
| γ-1 | [cockpit-6 — strip in-call Rx slide-over](./task-cockpit-6-incall-cleanup.md) | S (~3h) | cockpit-1 | — | **Sonnet**; **Composer** for the file delete + import audit | Yes — own chat | α-1/2/3, β-1, δ-1 | — |

### Lane δ — Patient page (1 task, parallel after cockpit-1)

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Parallel with | Unblocks |
|---|---|---|---|---|---|---|---|---|
| δ-1 | [cockpit-8 — patient page mirrors cockpit pattern](./task-cockpit-8-patient-page.md) | M (~5h) | cockpit-1, cockpit-2 design (read the spec, no need to wait for impl) | — | **Sonnet** | Yes — own chat | α-1/2/3, β-1, γ-1 | — |

---

## Acceptance gates

### Per-lane close gates (run before merging that lane's work)

**Lane α close gate:**
- [x] cockpit-1 / 2 / 3 / 4 / 7 all `Status: Shipped (2026-05-06)`.
- [ ] `<AppointmentDetailWorkArea>` deleted.
- [ ] Page-level 4 tabs gone — replaced by header + 3-column workspace.
- [ ] State machine drives the center pane; smoke-test all 5 states (`ready / lobby / live / ended / terminal`).
- [ ] Mobile bottom-sheet pills work; room never unmounts when sheets toggle.

**Lane β close gate:**
- [x] cockpit-5 `Status: Shipped (2026-05-06)`.
- [ ] `RxWorkspace` mounts inside `ConsultationCockpit`'s right column.
- [ ] `PreviousRxPopover` chip shows last 3 Rx; "copy medicines" populates `PrescriptionForm` state.
- [ ] Sticky action bar with `Save status` + `Send to patient`; send button disabled outside `live | ended`.
- [ ] Allergy clash + DDI banners pinned to top of Rx pane during the writing flow.

**Lane γ close gate:**
- [x] cockpit-6 `Status: Shipped (2026-05-06)`.
- [ ] `InCallChartRxTabs.tsx` deleted; grep returns no usages.
- [ ] `InCallQuickActions` no longer offers a `"rx"` action; FAB shows `Schedule` + `Invite` (+ greyed `Labs` / `Consent`).
- [ ] `VideoRoom` / `VoiceConsultRoom` no longer mount `<InCallActionPanel>` for Rx route.
- [ ] No regression in mid-call schedule-follow-up flow.

**Lane δ close gate:**
- [x] cockpit-8 `Status: Shipped (2026-05-06)`.
- [ ] `/dashboard/patients/<id>` is now a 3-zone layout: chart-rail / Visits-Conversations-Files tabs / right rail.
- [ ] No regression on patient list deep-link.

### Whole-batch close gate

Run after all 4 lanes close. See [plan-cockpit-redesign-batch.md § Whole-batch acceptance gate](../plan-cockpit-redesign-batch.md#whole-batch-acceptance-gate). One Opus chat, paste full diff, ask for the final grade.

---

## Cost calibration for this batch

Expected model-mix per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Phase | Opus turns | Sonnet turns | Composer turns |
|---|---|---|---|
| cockpit-1 | 1 (design) | 2–3 | 0 |
| Lane α (cockpit-2/3/4/7) | 1 (cockpit-2 layout call) | 9–12 | 1 (delete `AppointmentDetailWorkArea`) |
| Lane β (cockpit-5) | 0 | 2–3 | 0 |
| Lane γ (cockpit-6) | 0 | 1–2 | 1 (file delete + import audit) |
| Lane δ (cockpit-8) | 0 | 3–4 | 0 |
| Whole-batch close | 1 (final grade) | 0 | 1 (three-way doc sync) |
| **Totals** | **~3–4** | **~17–22** | **~3–5** |

**Red flag heuristic:** if any single task takes >2 chats, **stop and tighten the task file's spec section.** The task file IS the spec; if it's vague, every chat pays for the vagueness.

---

## References

- [plan-cockpit-redesign-batch.md](../plan-cockpit-redesign-batch.md) — master batch plan
- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules and chat heuristics
- [task-ui-D1-appointment-detail-three-zone.md](./task-ui-D1-appointment-detail-three-zone.md) — the 4-tab D1 surface this batch supersedes
- Style precedent: [EXECUTION-ORDER-ui.md](./EXECUTION-ORDER-ui.md) — sibling exec-order doc

---

**Created:** 2026-05-06.  
**Status:** `Shipped` — 2026-05-06 (all 8 task specs marked Shipped; per-lane QA items below remain for verification).
