# Patient seeing flow — Execution order (authoritative)

**Status:** `Shipped` 2026-05-08 — all pf-01…pf-18 task files marked complete (verify whole-batch gate separately).
**Owner:** TBD
**Scope:** 18 tasks across 3 phases · 6 parallel-chat lanes (α–ζ)
**Total estimate:** ~5 dev-days serial · **~2.5 calendar days with 4 parallel chats**
**Parent batch plan:** [plan-patient-flow-batch.md](../plan-patient-flow-batch.md)
**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## TL;DR — read before you touch any task

1. **Two hard prerequisites unblock everything.** `pf-01` (migration) and `pf-03` (cockpit state helper) are independent of each other and can run in parallel from `T+0`. Once both ship, Phase 1 fans out. Once Phase 1 ships, Phase 2 fans out. Phase 3 starts wherever its individual deps clear.
2. **One Cursor chat per lane.** You can run **up to 4 chats simultaneously** without file collisions. The lane matrix below is the no-collision contract.
3. **One topic per chat.** Each task file's `## Model & execution guidance` block tells you the model + what to pre-load. Start a fresh chat per task unless explicitly stitched.
4. **Per-message escalation.** If Sonnet stalls on one message, escalate **that** message to Opus. Don't switch the whole chat.
5. **No iteration loops.** If the agent has rewritten the same component twice, **stop**, tighten the spec in the task file, start a new chat. Each rewrite ≈ paying twice.
6. After each task ships, update its row in this file (`Status: Shipped (YYYY-MM-DD)`) AND tick the row in [plan-patient-flow-batch.md](../plan-patient-flow-batch.md). Doc-sync turns are **Composer 2 Fast**.

---

## Pre-flight — confirm before starting

```
- [ ] Cockpit redesign batch (06-05-2026) is shipped:
      - frontend/lib/consultation/cockpit-state.ts exists (Lane α prerequisite from prior batch)
      - frontend/components/consultation/ConsultationCockpit.tsx is the live appointment surface
      - frontend/components/consultation/cockpit/CockpitHeader.tsx exists
      - <AppointmentDetailWorkArea> deleted
      Verify: cd frontend && rg -l "AppointmentDetailWorkArea" → 0 hits.
- [ ] Frontend type-check + lint clean BEFORE starting:
      cd frontend && npx tsc --noEmit && npx next lint
- [ ] Backend type-check + lint clean:
      cd backend && npm run typecheck && npm run lint
- [ ] Database has migrations applied through 096 (current HEAD).
- [ ] Recent screenshot of current cockpit + Today's Schedule + OPD strip saved for before/after.
```

If those are green, **`pf-01` and `pf-03` are unblocked** and 2 parallel chats are ready to fan out.

---

## Model-tier glossary

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Tier | Label | Model | Use for |
|---|---|---|---|
| 1 | **Opus** | Opus 4.7 Extra High | Migrations (RLS / PHI risk), `wrap-up` endpoint design (transaction + idempotency), close-gate review. |
| 2 | **Sonnet** | Sonnet 4.6 Medium | Default — bounded UI/hook tasks with clear specs. |
| 3 | **Codex** | Codex 5.3 Medium | Sonnet alternative; pure code-gen / type-error fix. |
| 4 | **Composer** | Composer 2 Fast | Doc-sync, file deletes, kebab-item removal, status updates. |

**Hard rules — always Opus:**
- Any new migration file (`pf-01`, `pf-09`).
- The `POST /v1/appointments/:id/wrap-up` endpoint design (`pf-02`) — touches PHI columns + transactional flip.
- The auto-no-show worker (`pf-17`) — flips appointment status server-side; getting the predicate wrong silently mass-mutates.

---

## Parallel-chat lane matrix (the multi-tasking workflow)

Each lane below is **engineered to touch disjoint files** so you can run multiple Cursor chats side-by-side with zero merge / edit-stomp risk.

| Lane | Window title | Tasks (in order) | Files owned exclusively by this lane | Wait-on |
|---|---|---|---|---|
| **α** (wrap-up backend) | `α — wrap-up backend` | pf-01 → pf-02 | `backend/migrations/0XX_appointment_wrapup.sql`, `backend/src/controllers/appointment-controller.ts` (additive), `backend/src/services/appointment-service.ts` (additive), `backend/src/routes/api/v1/appointments.ts` (one route), `backend/src/utils/validation.ts` (one schema) | — |
| **β** (cockpit state + dialog) | `β — wrap-up frontend` | pf-03 → pf-04 → pf-05 | `frontend/lib/consultation/cockpit-state.ts` (additive), `frontend/components/consultation/cockpit/WrapUpDialog.tsx` (NEW), `frontend/components/consultation/cockpit/CockpitHeader.tsx` (additive), `frontend/components/consultation/MarkCompletedForm.tsx` (DELETE in pf-05) | pf-02 (for the endpoint contract — pf-04 wires it) |
| **γ** (queue rail) | `γ — queue rail` | pf-06 → pf-07 → pf-08 | `frontend/hooks/useOpdSnapshot.ts`, `frontend/hooks/useDoctorDayPipeline.ts` (NEW), `frontend/components/consultation/cockpit/CockpitQueueRail.tsx` (NEW), `frontend/components/consultation/cockpit/CockpitHeader.tsx` (one mount line — coordinates with β) | pf-05 (for the header mount slot) |
| **δ** (settings + auto-advance) | `δ — auto-advance` | pf-09 → pf-10 → pf-11 | `backend/migrations/0XX_doctor_patient_flow_advance.sql`, `backend/src/controllers/doctor-settings-controller.ts` (additive), `frontend/app/dashboard/settings/practice-setup/page.tsx` (additive section), `frontend/hooks/useNextAppointmentRoute.ts` (NEW), `frontend/components/consultation/cockpit/NextPatientCountdown.tsx` (NEW), `frontend/components/consultation/cockpit/EndedCard.tsx` (additive) | pf-03 + pf-07 (uses both helpers) |
| **ε** (visual polish) | `ε — visual polish` | pf-12 → pf-13 | `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx`, `frontend/components/dashboard/cockpit/TodaysSchedule.tsx` | pf-06 (for the widened snapshot shape) |
| **ζ** (QoL + worker) | `ζ — QoL + worker` | pf-14 → pf-15 → pf-16 → pf-17 → pf-18 | `frontend/hooks/useCockpitHotkeys.ts` (NEW), `frontend/hooks/useChartPrefetch.ts` (NEW), `frontend/components/dashboard/WalkInQuickModal.tsx` (NEW), `backend/src/workers/auto-no-show-worker.ts` (NEW), `frontend/components/consultation/cockpit/EndOfDayCard.tsx` (NEW) | pf-05 (header), pf-09 (settings), pf-10 (next-route hook) |

### No-collision guarantees

- **β and γ both touch `CockpitHeader.tsx`.** Mitigation: β adds a new `<DoneWithPatientButton />` to the right side of the header (pf-05). γ adds a `<CockpitQueueRail />` to a new sub-row below the existing strip (pf-08). The two edits hit **different JSX subtrees** — pf-05's diff defines the import line for γ to drop in. Sequence: **β finishes pf-05 before γ starts pf-08**. (γ can do pf-06 + pf-07 in parallel with β.)
- **α never touches frontend.**
- **δ's `EndedCard.tsx` edit (pf-11)** is additive — wraps the existing card in a `<NextPatientCountdown>` shell. No conflict with β / γ which never touch this file.
- **ε's `OpdQueueStrip.tsx` edit (pf-12)** depends on the snapshot shape γ widens in pf-06. Sequence: **γ finishes pf-06 before ε starts**. Both can finish before pf-07/pf-08 (which γ continues to).
- **ζ's worker (pf-17)** is server-side only; never touches anything α / β / γ / δ / ε own.

---

## Suggested wall-clock plan (solo dev, 4 parallel chats max)

```
T+0h     Open Chat α — pf-01 (migration)            [Opus design + Sonnet impl]
T+0h     Open Chat β — pf-03 (cockpit state)        [Sonnet]
T+0h     Open Chat γ — pf-06 (snapshot fix)         [Sonnet]
T+0h     Open Chat δ — pf-09 (settings + migration) [Opus migration + Sonnet UI]
                                                    (4 chats running)

T+2h     pf-01 ships → α continues with pf-02 (Opus design + Sonnet impl)
T+1h     pf-03 ships → β WAITS for pf-02 (β idle ~5h; use this to draft pf-04 spec)
T+2h     pf-06 ships → γ continues with pf-07 (Sonnet)
T+4h     pf-09 ships → δ continues with pf-10 (Sonnet)

T+7h     pf-02 ships → β resumes: pf-04 (M, ~4h) → pf-05 (XS, ~0.5h)
T+5h     pf-07 ships → γ continues with pf-08 (M, ~4h)            ← needs pf-05
                       γ idles ~6h until pf-05 ships → use to draft pf-08
T+5h     pf-10 ships → δ continues with pf-11 (S, ~3h)            ← needs pf-03 ✓ + pf-09 ✓ + pf-10 ✓

T+11h    pf-05 ships → γ unblocks: pf-08 (4h)
T+8h     pf-11 ships → δ done, lane δ closes

T+12h    pf-04+pf-05 done → β closes. New chat ε: pf-12 (S, ~3h)  ← needs pf-06 ✓
T+15h    pf-08 ships → γ closes. New chat ε continues: pf-13 (M, ~5h)
T+15h    Open ζ chats in parallel (each ~3h):
            Chat ζ-a: pf-14 (XS) → pf-15 (S)
            Chat ζ-b: pf-16 (S) → pf-18 (XS)
            Chat ζ-c: pf-17 (Opus design + Sonnet impl)

T+20h    All ζ chats ship.
T+21h    Close-gate Opus review (1h, paste whole-batch diff).
T+22h    DONE.
```

**Solo: ~22h focused work spread across ~2.5 calendar days** if you can supervise 3–4 chats at a time. Pure-serial without parallelism: ~40h (~5 days).

---

## Operating rules for multi-chat workflow

1. **One window per lane.** Don't put pf-01 and pf-03 in the same chat — context costs money even if the diffs don't collide.
2. **Pin the task file.** First message of every lane chat: paste the task spec file path + open the file in the IDE.
3. **Mention the lane in your first prompt.** e.g. *"This is lane β — wrap-up frontend. Reading task-pf-04-wrapup-dialog.md. Do not touch any file owned by lanes α, γ, δ, ε, ζ (see EXECUTION-ORDER-patient-flow.md § Parallel-chat lane matrix)."*
4. **Sync at lane boundaries.** When pf-02 ships, post a one-line ping in chat β: *"pf-02 has landed; endpoint contract is in `backend/src/routes/api/v1/appointments.ts:NN`."* When pf-05 ships, ping chat γ: *"pf-05 has landed; mount slot for queue rail is `<MOUNT_SLOT_PATH>:LXX`."*
5. **Status-sync turns go to Composer.** When 2 lanes ship, **don't** update the plan + the task + the source plan in the same lane chat. Open a 5-minute Composer chat for the three-way doc sync.
6. **Bail out if lanes drift.** If two chats both start trying to edit the same file (because a lane spec was wrong), **stop both chats**, fix the spec in this file, restart. Two chats stomping each other costs more than the speedup.

---

## Execution table — full per-task view

### Phase 1 — Wrap-up keystone

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Parallel-eligible | Unblocks |
|---|---|---|---|---|---|---|---|---|
| α-0 | [pf-01 — wrap-up migration](./task-pf-01-wrapup-migration.md) | XS (~2h) | — | — | **Opus** for SQL review (PHI columns + GIN index), **Sonnet** to type | Yes | **β, γ, δ in parallel** | pf-02 |
| α-1 | [pf-02 — wrap-up backend endpoint](./task-pf-02-wrapup-backend.md) | S (~4h) | pf-01 | — | **Opus** for transaction design (~20m), **Sonnet** for impl (~3h) | Yes (split: design + impl) | β can pre-draft pf-04 in parallel | pf-04 |
| β-0 | [pf-03 — cockpit state: add `wrap_up`](./task-pf-03-cockpit-state-wrapup.md) | XS (~1h) | — | — | **Sonnet** | Yes | **α, γ, δ in parallel** | pf-04, pf-11 |
| β-1 | [pf-04 — `<WrapUpDialog>` component](./task-pf-04-wrapup-dialog.md) | M (~4h) | pf-02, pf-03 | — | **Sonnet** | Yes | — | pf-05 |
| β-2 | [pf-05 — header "Done" CTA + retire kebab](./task-pf-05-cockpit-header-done-cta.md) | XS (~1h) | pf-04 | — | **Sonnet**; **Composer** for the kebab item delete + import audit | Yes (or stitched after pf-04 if context fits) | — | pf-08, pf-14 |

### Phase 2 — Queue rail + auto-advance

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Parallel-eligible | Unblocks |
|---|---|---|---|---|---|---|---|---|
| γ-0 | [pf-06 — `useOpdSnapshot` enum drift fix + widen](./task-pf-06-opd-snapshot-enum-fix.md) | XS (~2h) | — | — | **Sonnet** | Yes | **α, β, δ in parallel** | pf-07, pf-12 |
| γ-1 | [pf-07 — `useDoctorDayPipeline()` adapter](./task-pf-07-doctor-day-pipeline-hook.md) | S (~3h) | pf-06 | — | **Sonnet** | Yes | β, δ continue | pf-08, pf-10 |
| γ-2 | [pf-08 — `<CockpitQueueRail>` + nav + counter](./task-pf-08-cockpit-queue-rail.md) | M (~4h) | pf-07, pf-05 | — | **Sonnet** | Yes | — | — |
| δ-0 | [pf-09 — `doctor_settings.patient_flow_advance` + Settings UI](./task-pf-09-doctor-settings-flow-advance.md) | S (~4h) | — | — | **Opus** for migration (~20m), **Sonnet** for UI (~3h) | Yes (split: migration + UI) | **α, β, γ in parallel** | pf-11, pf-17 |
| δ-1 | [pf-10 — `useNextAppointmentRoute()` hook](./task-pf-10-next-appointment-route-hook.md) | XS (~2h) | pf-07 | — | **Sonnet** | Yes | — | pf-11, pf-15, pf-18 |
| δ-2 | [pf-11 — `<NextPatientCountdown>` overlay](./task-pf-11-next-patient-countdown.md) | S (~3h) | pf-03, pf-09, pf-10 | — | **Sonnet** | Yes | — | — |

### Phase 3 — Visual + QoL (most tasks parallel-eligible — open ζ-a / ζ-b / ζ-c chats)

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Parallel-eligible | Unblocks |
|---|---|---|---|---|---|---|---|---|
| ε-0 | [pf-12 — `OpdQueueStrip` STATUS_META + summary](./task-pf-12-opd-strip-extension.md) | S (~3h) | pf-06 | — | **Sonnet** | Yes | ε-1 in parallel | — |
| ε-1 | [pf-13 — `TodaysSchedule` outcome rows + inline no-show](./task-pf-13-todays-schedule-outcomes.md) | M (~5h) | — | pf-06 (for status helpers) | **Sonnet** | Yes | ε-0, ζ-* in parallel | — |
| ζ-0 | [pf-14 — keyboard shortcuts + "Running behind" badge](./task-pf-14-cockpit-micro-shortcuts.md) | XS (~2h) | pf-05 | — | **Sonnet**; **Composer** OK for the badge component | Yes | All other ζ tasks | — |
| ζ-1 | [pf-15 — prefetch next patient's chart](./task-pf-15-prefetch-next-chart.md) | S (~3h) | pf-10 | — | **Sonnet** | Yes (or stitched after pf-14) | All other ζ tasks | — |
| ζ-2 | [pf-16 — "+ Walk-in" fast path](./task-pf-16-walkin-fast-path.md) | S (~3h) | — | — | **Sonnet** | Yes | All other ζ tasks | — |
| ζ-3 | [pf-17 — auto-no-show worker](./task-pf-17-auto-noshow-worker.md) | S (~4h) | pf-09 | — | **Opus** for predicate design (mass-mutation risk), **Sonnet** for impl | Yes (split: design + impl) | All frontend ζ tasks | — |
| ζ-4 | [pf-18 — end-of-day summary card](./task-pf-18-end-of-day-summary.md) | XS (~2h) | pf-10 | — | **Sonnet** | Yes (or stitched after pf-15) | All other ζ tasks | — |

---

## Multitask guidance — what to run in parallel chats

The matrix below is the **independent-chats-to-run-in-parallel** view the user asked for. Numbers are **simultaneous chats** at each phase.

### Wave 1 — `T+0h` (4 chats)

| Chat | Lane | Task | Why parallel-safe |
|---|---|---|---|
| Chat 1 | α | pf-01 | Backend migration only — no other lane touches `backend/migrations/`. |
| Chat 2 | β | pf-03 | Pure helper file — additive — no other lane touches `cockpit-state.ts`. |
| Chat 3 | γ | pf-06 | Hook-only edit — no other lane touches `useOpdSnapshot.ts`. |
| Chat 4 | δ | pf-09 | Backend migration + Settings UI — disjoint from all others. |

**Estimated wave time:** ~2–4h. By T+4h all four ship.

### Wave 2 — `T+2h to T+7h` (3 chats running concurrently)

| Chat | Lane | Task | Started after |
|---|---|---|---|
| Chat 1 | α | pf-02 | pf-01 |
| Chat 3 | γ | pf-07 | pf-06 |
| Chat 4 | δ | pf-10 | pf-07 (γ shipped) — yes, **chat 4 must wait briefly for chat 3** |

`Chat 2 (β)` is **idle this wave** — use the time to pre-load and draft pf-04's spec / mocks, OR start on pf-13 in a temporary ε chat (independent).

### Wave 3 — `T+7h to T+11h` (3 chats running concurrently)

| Chat | Lane | Task | Started after |
|---|---|---|---|
| Chat 2 | β | pf-04 → pf-05 (stitched) | pf-02 + pf-03 |
| Chat 4 | δ | pf-11 | pf-09 + pf-10 + pf-03 |
| Chat 5 (new) | ε | pf-13 | independent |

### Wave 4 — `T+11h to T+15h` (2–3 chats)

| Chat | Lane | Task | Started after |
|---|---|---|---|
| Chat 3 | γ | pf-08 | pf-05 + pf-07 |
| Chat 5 | ε | pf-12 | pf-06 |
| Chat 6 (new) | ζ | pf-16 | independent |

### Wave 5 — `T+15h to T+21h` (3 chats — pure ζ parallel)

| Chat | Lane | Task | Started after | Notes |
|---|---|---|---|---|
| Chat ζ-a | ζ | pf-14 → pf-15 | pf-05, pf-10 | Stitched: same chat, two short tasks. |
| Chat ζ-b | ζ | pf-18 | pf-10 | Tiny standalone. |
| Chat ζ-c | ζ | pf-17 | pf-09 | Backend worker — Opus + Sonnet split. |

### Wave 6 — `T+21h` (1 chat)

Close-gate Opus review. One careful read against the whole-batch acceptance gate in [plan-patient-flow-batch.md § Whole-batch acceptance gate](../plan-patient-flow-batch.md#whole-batch-acceptance-gate).

---

## Acceptance gates

### Per-phase close gates

**Phase 1 close gate (run before merging Phase 1):**

```
- [ ] pf-01 / pf-02 / pf-03 / pf-04 / pf-05 all `Status: Shipped`.
- [ ] Migration applies cleanly on a fresh DB.
- [ ] POST /v1/appointments/:id/wrap-up returns 200, persists diagnosis + follow-up,
      flips appointment.status to 'completed', ends consultation_session if live.
      Idempotent — second call returns 200 no-op.
- [ ] Header "Done with patient" CTA visible at state ∈ {live, wrap_up}.
- [ ] <MarkCompletedForm> deleted; grep returns no usages.
- [ ] Kebab "Mark completed" item gone from CockpitHeader DropdownMenu.
- [ ] cockpit-state.ts unit tests cover wrap_up state.
```

**Phase 2 close gate:**

```
- [ ] pf-06 … pf-11 all `Status: Shipped`.
- [ ] Queue rail visible in cockpit, queue-mode AND slot/telemed-mode.
- [ ] Position counter reads "#X of Y · Z done" with tabular digits.
- [ ] Click on token → cockpit re-mounts on that appointment, no full reload.
- [ ] Settings page has "Confirm before advancing / Go instantly / Stay" radio.
- [ ] After Send Rx → Done with patient → 5 s countdown overlay → next cockpit.
- [ ] Cancel button on countdown stays on ended state.
- [ ] When useNextAppointmentRoute() returns null, EndOfDayCard renders (deferred to pf-18).
```

**Phase 3 close gate:**

```
- [ ] pf-12 … pf-18 all `Status: Shipped`.
- [ ] OpdQueueStrip header reads "3 done · 1 in consult · 8 waiting" (counts adapt).
- [ ] Done-today disclosure collapses when count > 5; expands on click.
- [ ] TodaysSchedule rows colour by outcome (completed / live / late / no-show).
- [ ] Inline "Mark no-show" button works on stale rows.
- [ ] Cmd/Ctrl+Enter sends Rx; Cmd/Ctrl+Shift+Enter opens wrap-up dialog.
- [ ] Prefetch next chart fires on wrap_up / ended; confirmed via React Query devtools cache hits.
- [ ] "Running behind" badge appears when current time > nextAppointment.appointment_date.
- [ ] "+ Walk-in" creates an appointment at now() and routes the cockpit there.
- [ ] Auto-no-show worker no-ops when doctor_settings.auto_no_show_after_min IS NULL.
- [ ] EndOfDayCard renders after the day's last patient completes.
```

### Whole-batch close gate

Run after all 3 phase gates close. See [plan-patient-flow-batch.md § Whole-batch acceptance gate](../plan-patient-flow-batch.md#whole-batch-acceptance-gate). One Opus chat, paste full diff, ask for the final grade.

---

## Cost calibration for this batch

Expected model-mix per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Phase | Opus turns | Sonnet turns | Composer turns |
|---|---|---|---|
| Phase 1 (pf-01…05) | 2 (pf-01 SQL review, pf-02 transaction design) | 8–10 | 1 (kebab item delete + import audit in pf-05) |
| Phase 2 (pf-06…11) | 1 (pf-09 migration review) | 12–15 | 0 |
| Phase 3 (pf-12…18) | 1 (pf-17 worker predicate design) | 12–15 | 1 (doc-sync at end) |
| Whole-batch close | 1 (final grade) | 0 | 1 (three-way doc sync) |
| **Totals** | **~5** | **~32–40** | **~3** |

**Red flag heuristic:** if any single task takes >2 chats, **stop and tighten the task file's spec section.** The task file IS the spec; if it's vague, every chat pays for the vagueness.

---

## References

- [plan-patient-flow-batch.md](../plan-patient-flow-batch.md) — master batch plan
- [Product plans/plan-patient-seeing-flow.md](../../../../Product%20plans/plan-patient-seeing-flow.md) — source plan with locked decisions
- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules and chat heuristics
- Style precedent: [Daily-plans/May 2026/06-05-2026/Tasks/EXECUTION-ORDER-cockpit.md](../../06-05-2026/Tasks/EXECUTION-ORDER-cockpit.md) — predecessor exec-order doc
- Cockpit primitives this batch extends: [Daily-plans/May 2026/06-05-2026/plan-cockpit-redesign-batch.md](../../06-05-2026/plan-cockpit-redesign-batch.md)

---

**Created:** 2026-05-07. **Status:** `Shipped` 2026-05-08 (task checklist); run whole-batch acceptance gate before merge if not yet done.
