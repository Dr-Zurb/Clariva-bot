# Consultation cockpit redesign — implementation batch (2026-05-06)

## Turn `/dashboard/appointments/[id]` from a 4-tab admin page into a single workspace where chart, room, and Rx live side-by-side

> **Source product plan:** none yet — this batch IS the source. After ship, promote a "Cockpit redesign" section into `docs/Work/Product plans/` if the pattern needs to outlive the batch.
>
> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules and chat-management heuristics applied per-task.
>
> **Per-task execution checklist:** [Tasks/EXECUTION-ORDER-cockpit.md](./Tasks/EXECUTION-ORDER-cockpit.md). Per-task spec files: [Tasks/](./Tasks/).
>
> **Parent of this batch in lifecycle:** [plan-ui-system-redesign-batch.md](./plan-ui-system-redesign-batch.md) — that batch shipped the design tokens, primitives, and shell that this batch composes against. Specifically D1 shipped the 3-zone tab page; this batch supersedes D1 by replacing the tabs with a single workspace.

---

## What this is

The doctor-detail page is the surface the doctor lives in. Today it's a 4-tab page (`Overview / Consult / Prescriptions / Artifacts`) — even though the actual workflow is "see the patient (chart) ⇆ talk to them (room) ⇆ write the Rx" all at once. The teleconsult use-case demands **side-by-side**: typing in chat / talking on call AND writing Rx in the same screen.

This batch collapses the 4 tabs into one cockpit:

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Header: ← back · Patient name · status · modality CTA · kebab             │
├────────────┬───────────────────────────────────────────┬────────────────────┤
│  CHART     │   ROOM / SUMMARY (state-aware)           │   RX WORKSPACE     │
│  (col 3)   │   (col 5)                                │   (col 4)          │
│            │                                          │                    │
│ Allergies  │   ┌── ready ──┐  or  <VideoRoom>  or     │ Previous Rx ▾      │
│ Problems   │   │ launcher   │     <VoiceConsultRoom>  │ ─────────────────  │
│ Vitals     │   └────────────┘  or <TextConsultRoom>   │ SOAP               │
│ Prev Rx    │   or <CallPostCallSummary> + replay      │ Medicines          │
│            │                                          │ Allergy/DDI banner │
│            │                                          │ ─────────────────  │
│            │                                          │ Save status        │
│            │                                          │ [Send to patient]  │
└────────────┴──────────────────────────────────────────┴────────────────────┘
```

The center pane content is driven by a single state machine derived from `appointment.status` × `consultation_session.status` (`ready / lobby / live / ended / terminal`). The right Rx pane is **always present** (collapsible) so the doctor can write Rx during the consult, not after.

---

## Status

**Shipped** — 2026-05-06. All eight cockpit tasks (`cockpit-1` … `cockpit-8`) are marked **Shipped** in their spec files; implementation is complete for this batch.

The D1-era surfaces (4-tab `<AppointmentDetailWorkArea>`, in-call Rx slide-over) were retired per cockpit-2 / cockpit-4 / cockpit-6.

---

## Strategic locks (confirmed by user 2026-05-06 in chat)

| ID | Lock |
|---|---|
| K1 | Workspace, not navigation. **One screen has chart + room + Rx side by side.** No tabs that hide the room or the Rx. |
| K2 | State machine drives the center pane. Five states only: `ready / lobby / live / ended / terminal`. Derived from `appointment.status` + `consultation_session.status`. |
| K3 | Rx pane is always visible during `ready / lobby / live / ended`. The Rx form **autosaves draft** in `ready / lobby` so the doctor can pre-write before the call. `Send to patient` is gated on `live` or `ended`. |
| K4 | The in-call Rx slide-over (`InCallActionPanel` route for "rx") and `InCallChartRxTabs` are **deleted**. Rx is on screen — there's no overlay needed. The FAB keeps Schedule + Invite. |
| K5 | Modality is decided in the header (split button at `ready`) and changed mid-consult via the existing `ModalityChangeLauncher` — no top-of-page launcher card. |
| K6 | Mobile (`<lg` / ≤1023px): header + full-width room + two persistent bottom pills that open `<Sheet>` for chart and Rx; room stays mounted.
| K7 | The page stays a server component; one new client island (`ConsultationCockpit`) owns all interactivity. |

---

## The 8 selected items

Grouped by lane (parallel-chat lanes are documented in [EXECUTION-ORDER-cockpit.md](./Tasks/EXECUTION-ORDER-cockpit.md)).

### Lane α — Cockpit core (4 tasks, ~14h, sequential)

Same files (`page.tsx`, `ConsultationCockpit.tsx`); must run in order. **All rows below: Shipped 2026-05-06.**

| ID | Item | Effort | Spec |
|---|---|---|---|
| cockpit-1 | Consultation state machine helper (`lib/consultation/cockpit-state.ts`) — pure, unit-tested | XS (~2h) | [task-cockpit-1-state-machine.md](./Tasks/task-cockpit-1-state-machine.md) ✅ |
| cockpit-2 | `ConsultationCockpit` shell — three-column grid, both rails collapsible, dumb panes | M (~5h) | [task-cockpit-2-shell.md](./Tasks/task-cockpit-2-shell.md) ✅ |
| cockpit-3 | State-driven center pane — wire `ready / lobby / live / ended / terminal` | M (~5h) | [task-cockpit-3-state-panes.md](./Tasks/task-cockpit-3-state-panes.md) ✅ |
| cockpit-4 | Header redesign + modality split button + kebab; **delete `<Tabs>`** | M (~4h) | [task-cockpit-4-header.md](./Tasks/task-cockpit-4-header.md) ✅ |

### Lane β — Rx workspace (1 task, ~4h, parallel after cockpit-2)

New files only. Doesn't touch the cockpit shell after cockpit-2 lands the mount point. **Shipped 2026-05-06.**

| ID | Item | Effort | Spec |
|---|---|---|---|
| cockpit-5 | `RxWorkspace` shell + `PreviousRxPopover` + sticky action bar + pinned allergy/DDI banners | M (~4h) | [task-cockpit-5-rx-workspace.md](./Tasks/task-cockpit-5-rx-workspace.md) ✅ |

### Lane γ — In-call cleanup (1 task, ~3h, independent of α/β)

Touches `InCallQuickActions` + `VideoRoom`/`VoiceConsultRoom` only. Can run in its own chat any time. **Shipped 2026-05-06.**

| ID | Item | Effort | Spec |
|---|---|---|---|
| cockpit-6 | Strip in-call Rx slide-over: drop the "rx" quick-action; delete `InCallChartRxTabs.tsx`; FAB keeps Schedule + Invite | S (~3h) | [task-cockpit-6-incall-cleanup.md](./Tasks/task-cockpit-6-incall-cleanup.md) ✅ |

### Lane δ — Patient page (1 task, ~5h, parallel after cockpit-1)

New surface, fully independent of the appointment cockpit edits. **Shipped 2026-05-06.**

| ID | Item | Effort | Spec |
|---|---|---|---|
| cockpit-8 | `/patients/[id]` mirrors the cockpit pattern: chart-rail + Visits/Conversations/Files tabs + right rail | M (~5h) | [task-cockpit-8-patient-page.md](./Tasks/task-cockpit-8-patient-page.md) ✅ |

### Lane α (continued) — Mobile (1 task, ~3h, after cockpit-4)

**Shipped 2026-05-06.**

| ID | Item | Effort | Spec |
|---|---|---|---|
| cockpit-7 | Mobile bottom-sheet pills (`<Sheet>`) for chart and Rx; persistent room | S (~3h) | [task-cockpit-7-mobile.md](./Tasks/task-cockpit-7-mobile.md) ✅ |

**Subtotal:** ~31h (~3–4 dev-days solo). With 4 parallel chats (one per lane), reachable in ~2 calendar days.

---

## Implementation order

See [Tasks/EXECUTION-ORDER-cockpit.md](./Tasks/EXECUTION-ORDER-cockpit.md) for the authoritative order with parallel-chat lanes, hard/soft deps, per-step model-tier recommendations, and the multi-chat workflow rules.

**Quick visual:**

```
                      cockpit-1 (state machine, ~2h)
                              │
              ┌───────────────┼───────────────┬──────────────────┐
              │               │               │                  │
        Chat α-1               Chat γ          Chat δ             │
        cockpit-2 (shell)      cockpit-6       cockpit-8          │
              │              (in-call cleanup)  (patient page)    │
        Chat α-2                                                  │
        cockpit-3 (states)                                        │
              │                                                   │
        Chat α-3 ────────────────────── Chat β                    │
        cockpit-4 (header, delete tabs) cockpit-5 (Rx workspace)  │
              │                                                   │
        Chat α-4                                                  │
        cockpit-7 (mobile)                                        │
```

`Chat α-N` reuses the same chat across α steps only when context fits in <300 lines of diff. Otherwise cut the chat at task boundaries — the efficiency guide rule applies.

---

## Files expected to touch (whole-batch view)

**New files (~7):**

- `frontend/lib/consultation/cockpit-state.ts` — state derivation (cockpit-1)
- `frontend/lib/consultation/__tests__/cockpit-state.test.ts` — unit tests (cockpit-1)
- `frontend/components/consultation/ConsultationCockpit.tsx` — shell + center pane orchestration (cockpit-2, edited by 3/4/7)
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` — header + modality split button + kebab (cockpit-4)
- `frontend/components/consultation/cockpit/RxWorkspace.tsx` — Rx shell wrapping `PrescriptionForm` (cockpit-5)
- `frontend/components/consultation/cockpit/PreviousRxPopover.tsx` — collapsible chip with copy-forward (cockpit-5)
- `frontend/components/consultation/cockpit/RxRailToggle.tsx` — sibling of chart rail toggle (cockpit-2)
- `frontend/components/patients/PatientCockpit.tsx` — patient-page client island (cockpit-8)

**Modified files (~7):**

- `frontend/app/dashboard/appointments/[id]/page.tsx` — drop the work-area mount; mount `<ConsultationCockpit>` (cockpit-2). Header content moves into cockpit (cockpit-4).
- `frontend/components/consultation/AppointmentDetailWorkArea.tsx` — **DELETED** at the end of cockpit-4 (replaced by cockpit shell).
- `frontend/components/ehr/InCallChartRxTabs.tsx` — **DELETED** in cockpit-6.
- `frontend/components/consultation/InCallQuickActions.tsx` — drop `"rx"` action (cockpit-6).
- `frontend/components/consultation/VideoRoom.tsx` — drop `<InCallActionPanel>` Rx route (cockpit-6).
- `frontend/components/consultation/VoiceConsultRoom.tsx` — same (cockpit-6).
- `frontend/components/consultation/InCallActionPanel.tsx` — keep, but only Schedule + Invite consume it (cockpit-6).
- `frontend/app/dashboard/patients/[id]/page.tsx` — refactor to mount `<PatientCockpit>` (cockpit-8).

**No backend changes. No migrations. No new npm deps.** Reuses `Sheet`, `Popover`/`DropdownMenu`, `Card`, `Button`, `Badge`, `Tabs` — all from the A2 primitives that already shipped.

---

## Whole-batch acceptance gate

- [x] All 8 task files marked `Status: Shipped (2026-05-06)`.
- [ ] `<AppointmentDetailWorkArea>` deleted; the 4 page-level tabs are gone.
- [ ] `<InCallChartRxTabs>` deleted; `InCallQuickActions` no longer offers a "rx" action.
- [ ] On `/dashboard/appointments/<live>` the doctor sees chart-left, room-center, Rx-right at `xl+`.
- [ ] **Side-by-side smoke**: with a live text or video session, the doctor can type in the room AND edit Rx fields without ever opening an overlay.
- [ ] Rx autosaves draft during `ready / lobby / live`. `Send to patient` button is **disabled** until session is `live` or `ended`.
- [ ] Modality split button in the header offers `Text / Voice / Video` at `ready`. `ModalityChangeLauncher` still works mid-consult.
- [ ] Post-call: `<CallPostCallSummary>` + `<ConsultArtifactsPanel>` render in the center pane when `session.status === "ended"`. The Rx pane shows the sent Rx in read-only mode plus a "+ Add follow-up Rx" affordance.
- [ ] Mobile (`<lg` / ≤1023px): bottom pills open `<Sheet>` for chart and Rx; room never unmounts when sheets toggle.
- [ ] Type-check + lint clean.
- [ ] No console errors / warnings on the redesigned page.
- [ ] **Time-to-action**: log in → start a consult AND have the Rx draft started in **one screen, no tab clicks**.
- [ ] **Close-gate Opus review** with the diff: paste the full diff, ask for a grade against this checklist + K1–K7 locks above.

---

## Risks

- **Risk: Rx form keystrokes interfere with video bandwidth.** The room and the Rx are concurrent React subtrees; the Rx form already autosaves on debounce. Mitigation: keep the Rx debounce ≥ 1500ms (already in `useAutoSave`); verify FPS on a 720p video call.
- **Risk: Pre-call drafted Rx sent accidentally.** Mitigation per K3 — `Send to patient` button **disabled** until `live | ended`. Pre-send checks (`PrescriptionPreSendCheck`) preserved verbatim from D1.
- **Risk: We delete `<AppointmentDetailWorkArea>` and break a hidden import.** Mitigation: cockpit-4 grep before delete; the only known importer is the page.
- **Risk: Patient page (cockpit-8) drifts from appointment cockpit pattern.** Mitigation: cockpit-8 is gated on cockpit-1 only (state machine reuse); the visual pattern documented in cockpit-2 is referenced by cockpit-8's spec verbatim.
- **Risk: Walk-in (no patient_id) shows an empty chart rail.** Mitigation: cockpit-2 hides the chart pane and shows a small "Walk-in — chart unavailable" affordance with a "Promote to chart record" link (out of scope for this batch; tracked as a follow-up).

---

## Cost calibration for this batch

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Phase | Opus turns | Sonnet turns | Composer turns | Notes |
|---|---|---|---|---|
| cockpit-1 (state machine) | 1 (design) | 2–3 (impl + tests) | 0 | Pure logic; design call worth Opus, impl is Sonnet |
| cockpit-2 (shell) | 1 (layout / hydration boundary) | 3–4 | 1 (CSS pass) | Splits server vs client correctly is the architectural risk |
| cockpit-3 (states) | 0–1 | 2–3 | 0 | If states feel ambiguous mid-impl, escalate one message to Opus |
| cockpit-4 (header) | 0 | 2–3 | 1 (delete `AppointmentDetailWorkArea`) | Pure UI replacement |
| cockpit-5 (Rx workspace) | 0 | 2–3 | 0 | Wrapping `PrescriptionForm`, no logic surgery |
| cockpit-6 (in-call cleanup) | 0 | 1–2 | 1 (file delete + import audit) | Mostly removal |
| cockpit-7 (mobile) | 0 | 2 | 0 | Sheet primitive already shipped |
| cockpit-8 (patient page) | 0 | 3–4 | 0 | Pattern reuse; Sonnet handles cleanly |
| Whole-batch close | 1 (final grade) | 0 | 1 (status sync, three-way) | |
| **Totals** | **~3–5** | **~17–22** | **~4–5** | Roughly 12% Opus / 75% Sonnet / 13% Composer — matches guide ratios |

**Anti-patterns to watch:**
- "Let me extend the cockpit chat for cockpit-5 / cockpit-6 / cockpit-8" — those are independent lanes; cut the chat.
- "Re-paste the full `PrescriptionForm` into the chat to give context" — never. The Rx workspace wraps it; it's read-only context.

---

## References

- **Source plan (becoming this batch — promote post-ship):** none yet.
- **Sibling batch (parent in lifecycle):** [plan-ui-system-redesign-batch.md](./plan-ui-system-redesign-batch.md)
- **D1 surface this supersedes:** [task-ui-D1-appointment-detail-three-zone.md](./Tasks/task-ui-D1-appointment-detail-three-zone.md)
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)
- **Execution order (with parallel-chat lanes):** [Tasks/EXECUTION-ORDER-cockpit.md](./Tasks/EXECUTION-ORDER-cockpit.md)
- **Style precedents:** [text-consult batch (28-04-2026)](../../April%202026/28-04-2026/Tasks/) for per-task `.md` format.

---

**Created:** 2026-05-06.  
**Status:** `Shipped` — 2026-05-06 (all cockpit tasks complete).  
**Owner:** TBD.
