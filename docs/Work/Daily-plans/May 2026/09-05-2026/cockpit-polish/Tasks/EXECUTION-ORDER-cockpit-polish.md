# Cockpit polish — Execution order (authoritative)

**Status:** `Drafted` 2026-05-09
**Owner:** TBD
**Scope:** 9 tasks across 4 phases · 5 parallel-chat lanes (α–ε)
**Total estimate:** ~19h serial · **~8h with 4 parallel chats**
**Parent batch plan:** [plan-cockpit-polish-batch.md](../plan-cockpit-polish-batch.md)
**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## TL;DR — read before you touch any task

1. **Five independent lanes — four are unblocked from `T+0`.** α (pipeline → strip), β (cleanup), γ (text-room mark-no-show), δ-BE (backend demographics) all start at the same time. ε (header redesign) also starts at T+0 because its design uses a graceful demographics fallback (`patient_age && /${patient_sex}`) so it doesn't block on δ.
2. **One Cursor chat per lane.** You can run **up to 4 chats simultaneously** without file collisions. The lane matrix below is the no-collision contract.
3. **One topic per chat.** Each task file's `## Model & execution guidance` block tells you the model + what to pre-load.
4. **Per-message escalation.** If Sonnet stalls on one message, escalate **that** message to Opus. Don't switch the whole chat.
5. **No iteration loops.** If the agent has rewritten the same component twice, **stop**, tighten the spec in the task file, start a new chat. Each rewrite ≈ paying twice.
6. After each task ships, update its row in this file (`Status: Shipped (YYYY-MM-DD)`) AND tick the row in [plan-cockpit-polish-batch.md](../plan-cockpit-polish-batch.md). Doc-sync turns are **Composer 2 Fast**.

---

## Pre-flight — confirm before starting

```
- [ ] WrapUpDialog elimination work shipped earlier today is in `main`:
      cd frontend && rg "postAppointmentWrapUp" lib/api.ts hooks/  → matches present.
      cd frontend && rg "WrapUpDialog" components/   → only the deprecated file matches.
- [ ] Patient flow batch (07-05-2026) is shipped — pf-11 NextPatientCountdown lands the auto-advance:
      cd frontend && rg -l "NextPatientCountdown" components/   → matches present.
      cd frontend && rg -l "useNextAppointmentRoute" hooks/     → matches present.
- [ ] Frontend type-check + lint clean BEFORE starting:
      cd frontend && npx tsc --noEmit && npx next lint
- [ ] Backend type-check + lint clean:
      cd backend && npm run typecheck && npm run lint
- [ ] Recent screenshot of current cockpit ready/live/wrap_up/ended states saved for before/after.
- [ ] (For δ-BE only) supabase project has at least one patient row with both `date_of_birth`
      and `gender` populated, plus one row with both NULL — to verify both code paths.
```

If those are green, **all five lanes are unblocked** and 4 parallel chats are ready to fan out.

---

## Model-tier glossary

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Tier | Label | Model | Use for |
|---|---|---|---|
| 1 | **Opus** | Opus 4.7 Extra High | Privacy-decision write-up + payload contract review (`cp-07`), close-gate review. |
| 2 | **Sonnet** | Sonnet 4.6 Medium | Default — bounded UI / hook tasks with clear specs. |
| 3 | **Codex** | Codex 5.3 Medium | Sonnet alternative; pure code-gen / type-error fix. |
| 4 | **Composer** | Composer 2 Fast | Doc-sync, file deletes, kebab-item removal, status updates. |

**Hard rules — always Opus:**
- The doctor-scoped widening of `GET /v1/appointments/:id` to include `patient_age` + `patient_sex` (`cp-07`) — touches PHI surface visibility; getting the privacy boundary documented matters more than typing the fields. Pattern is identical to `oq-01` from the OPD queue batch.
- The whole-batch close-gate review.

**No new migrations in this batch.** All backend work is additive on the existing service layer (a `select(..., patients(...))` join).

---

## Parallel-chat lane matrix (the multi-tasking workflow)

Each lane below is **engineered to touch disjoint files** so you can run multiple Cursor chats side-by-side with zero merge / edit-stomp risk.

| Lane | Window title | Tasks (in order) | Files owned exclusively by this lane | Wait-on |
|---|---|---|---|---|
| **α** (pipeline + strip) | `α — pipeline + strip` | cp-01 → cp-02 | `frontend/hooks/useDoctorDayPipeline.ts`, `frontend/components/consultation/cockpit/CockpitQueueRail.tsx` (full rewrite — also removes the "+ Walk-in" rail slot in this same edit) | — |
| **β** (cleanup) | `β — cleanup` | cp-03 → cp-04 | `frontend/components/dashboard/WalkInQuickModal.tsx` (DELETE), `frontend/components/dashboard/cockpit/NowNextCard.tsx` (remove walk-in mount), `frontend/components/consultation/cockpit/MobilePillBar.tsx` (comment cleanup), `frontend/components/consultation/cockpit/RxWorkspace.tsx` (drop ended-state stub button), `frontend/lib/consultation/cockpit-state.ts` (remove `draft-followup` action + ended-state CTA), `frontend/lib/consultation/__tests__/cockpit-state.test.ts` (test update) | — |
| **γ** (text mark-no-show) | `γ — text mark-no-show` | cp-06 | `frontend/components/consultation/TextConsultRoom.tsx` (add prop + button + 2-step confirm), `frontend/components/consultation/ConsultationLauncher.tsx` (one-line prop forward) | — |
| **δ-BE** (demographics) | `δ-BE — demographics` | cp-07 → cp-08 | `backend/src/services/appointment-service.ts` (widen select + privacy block-comment), `backend/src/types/appointment.ts` (add fields), `backend/tests/unit/services/*.ts` (one new assertion), `frontend/types/appointment.ts` (mirror new fields) | — |
| **ε** (header redesign) | `ε — header redesign` | cp-09 → cp-05 | `frontend/components/consultation/cockpit/CockpitHeader.tsx` (full layout rewrite, then mark-no-show ghost link slots into the new layout) | — (cp-09 uses graceful fallback for demographics; cp-05 lands inside the new layout) |

### No-collision guarantees

- **α is hook + 1 component, full rewrite of `CockpitQueueRail.tsx` (which folds in the "+ Walk-in" rail-slot removal — β does not touch this file).**
- **β touches `MobilePillBar.tsx` only for a 2-line comment update.** No runtime change in that file.
- **γ never touches CockpitHeader.tsx.** ε owns CockpitHeader.tsx exclusively.
- **δ-BE never touches frontend components or hooks.** Only types + backend service.
- **ε is a single-file rewrite (`CockpitHeader.tsx`).** No other lane writes to it. cp-05 (mark-no-show ghost link) is sequenced after cp-09 in the same lane to avoid a within-lane rebase.
- **No backend file is touched by anyone except δ-BE.**
- **`frontend/types/appointment.ts`** is touched by δ-BE's `cp-08` only. ε references the field optionally (graceful fallback) but never writes to the type file.

---

## Suggested wall-clock plan (solo dev, 4 parallel chats max)

```
T+0h     Open Chat α — cp-01 (pipeline sort fix)             [Sonnet]
T+0h     Open Chat β — cp-03 (remove walk-in)                [Sonnet]
T+0h     Open Chat γ — cp-06 (text mark-no-show)             [Sonnet]
T+0h     Open Chat δ-BE — cp-07 (backend demographics)       [Opus design + Sonnet impl]
                                                              (4 chats running)

T+1h     cp-01 ships → α continues with cp-02                 [Sonnet]
T+2h     cp-06 ships → γ chat closes. (Tiny task.)
                       Open Chat ε — cp-09 (header rewrite)   [Sonnet]
                                                              (4 chats running: α, β, δ-BE, ε)

T+3h     cp-03 ships → β continues with cp-04                 [Composer or Sonnet]
T+3.5h   cp-04 ships → β chat closes.
T+3.5h   cp-07 ships → δ-BE continues with cp-08              [Sonnet]
T+4h     cp-08 ships → δ-BE chat closes.
T+4h     cp-02 ships → α chat closes.
                                                              (1 chat running: ε)

T+6h     cp-09 ships → ε continues with cp-05                 [Sonnet]
T+8h     cp-05 ships → ε chat closes.

T+8h     Close-gate Opus review (1h, paste whole-batch diff). [Opus]
T+9h     DONE.
```

**Solo: ~8–9h focused work** if you can supervise 4 chats at a time. Pure-serial without parallelism: ~19h.

---

## Operating rules for multi-chat workflow

1. **One window per lane.** Don't put cp-01 and cp-06 in the same chat — context costs money even if the diffs don't collide.
2. **Pin the task file.** First message of every lane chat: paste the task spec file path + open the file in the IDE.
3. **Mention the lane in your first prompt.** e.g. *"This is lane α — pipeline + strip. Reading task-cp-01-pipeline-sort-fix.md. Do not touch any file owned by lanes β, γ, δ-BE, ε (see EXECUTION-ORDER-cockpit-polish.md § Parallel-chat lane matrix)."*
4. **Sync at lane boundaries.** When cp-01 ships, post a one-line ping in chat α: *"cp-01 has landed; queueEntries now sorted by tokenNumber globally — proceeding to cp-02."* When cp-08 ships, ping chat ε: *"cp-08 has landed; `Appointment.patient_age` and `Appointment.patient_sex` are now typed — feel free to drop the graceful-fallback if you want."*
5. **Status-sync turns go to Composer.** When 2 lanes ship, **don't** update the plan + the task + the source plan in the same lane chat. Open a 5-minute Composer chat for the three-way doc sync.
6. **Bail out if lanes drift.** If two chats both start trying to edit the same file (because a lane spec was wrong), **stop both chats**, fix the spec in this file, restart.

---

## Execution table — full per-task view

### Phase 1 — Pipeline + strip

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Parallel-eligible | Unblocks |
|---|---|---|---|---|---|---|---|---|
| α-0 | [cp-01 — fix `useDoctorDayPipeline` queue sort](./task-cp-01-pipeline-sort-fix.md) | XS (~1h) | — | — | **Sonnet** | Yes | β, γ, δ-BE, ε in parallel | cp-02 |
| α-1 | [cp-02 — `<CockpitQueueRail>` prev/now/next windowing + drop "+ Walk-in"](./task-cp-02-prev-now-next-strip.md) | S (~3h) | cp-01 | — | **Sonnet** | Yes | β, γ, δ-BE, ε in parallel | — |

### Phase 2 — Cleanup

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Parallel-eligible | Unblocks |
|---|---|---|---|---|---|---|---|---|
| β-0 | [cp-03 — remove walk-in feature](./task-cp-03-remove-walkin.md) | S (~3h) | — | — | **Sonnet** | Yes | α, γ, δ-BE, ε in parallel | cp-04 |
| β-1 | [cp-04 — drop follow-up-Rx surfaces](./task-cp-04-drop-followup-rx-surfaces.md) | XS (~30m) | — | cp-03 (file ordering convenience only — independent) | **Composer** OK; **Sonnet** if test update is non-trivial | Yes (or stitched after cp-03) | α, γ, δ-BE, ε in parallel | — |

### Phase 3 — Mark-no-show parity

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Parallel-eligible | Unblocks |
|---|---|---|---|---|---|---|---|---|
| γ-0 | [cp-06 — Mark-no-show in `<TextConsultRoom>`](./task-cp-06-mark-no-show-text-room.md) | S (~2h) | — | — | **Sonnet** | Yes | α, β, δ-BE, ε in parallel | — |
| ε-1 | [cp-05 — Mark-no-show in `<CockpitHeader>` ready state](./task-cp-05-mark-no-show-ready-header.md) | S (~2h) | cp-09 | — | **Sonnet** | Yes (stitched after cp-09 in lane ε) | — | — |

### Phase 4 — Header redesign + demographics

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Parallel-eligible | Unblocks |
|---|---|---|---|---|---|---|---|---|
| δ-0 | [cp-07 — backend: widen appointment payload with `patient_age` + `patient_sex`](./task-cp-07-appointment-demographics-backend.md) | S (~3h) | — | — | **Opus** for privacy + contract review (~30m), **Sonnet** for impl (~2.5h) | Yes (split: design + impl) | α, β, γ, ε in parallel | cp-08 |
| δ-1 | [cp-08 — frontend: `Appointment` type update](./task-cp-08-appointment-demographics-frontend-types.md) | XS (~30m) | cp-07 | — | **Sonnet** | Yes (or stitched after cp-07) | α, β, γ, ε in parallel | — |
| ε-0 | [cp-09 — `<CockpitHeader>` two-row patient identity layout](./task-cp-09-cockpit-header-two-row-layout.md) | M (~4h) | — (uses graceful fallback for demographics; benefits from cp-08 but doesn't block on it) | cp-08 | **Sonnet** | Yes | α, β, γ, δ-BE in parallel | cp-05 |

---

## Multitask guidance — what to run in parallel chats

### Wave 1 — `T+0h` (4 chats — peak parallelism)

| Chat | Lane | Task | Why parallel-safe |
|---|---|---|---|
| Chat 1 | α | cp-01 → cp-02 | Hook + own component file. No other lane touches `useDoctorDayPipeline.ts` or `CockpitQueueRail.tsx`. |
| Chat 2 | β | cp-03 → cp-04 | Modal delete + cockpit-state cleanup. None of α / γ / δ-BE / ε touch `WalkInQuickModal`, `NowNextCard`, `RxWorkspace`, or `cockpit-state.ts`. |
| Chat 3 | γ | cp-06 | TextConsultRoom + 1-line prop in ConsultationLauncher. ε does **not** touch ConsultationLauncher. |
| Chat 4 | δ-BE | cp-07 → cp-08 | Backend service + types only. No lane touches `appointment-service.ts` or `frontend/types/appointment.ts` outside of δ-BE. |

**Estimated wave time:** ~3.5h. By T+4h three of the four lanes ship.

### Wave 2 — `T+2h to T+8h` (1–4 chats, contracting toward ε)

When γ ships at T+2h, **immediately open ε's chat with cp-09** (`<CockpitHeader>` rewrite). ε then continues with cp-05 (mark-no-show ghost link) once cp-09 is reviewed and merged inside the same lane chat (the file `CockpitHeader.tsx` is owned exclusively by ε across both tasks, so the within-lane sequencing is safe).

ε is the long pole — ~6h of focused header work. Use the time after the other three lanes ship to:
- Run a quick smoke test of α + β + δ on a real appointment (one cycle through ready → live → wrap_up → ended).
- Pre-draft the close-gate review prompt for the whole-batch Opus pass.

### Wave 3 — `T+8h` (1 chat)

Close-gate Opus review. One careful read against the whole-batch acceptance gate in [plan-cockpit-polish-batch.md § Whole-batch acceptance gate](../plan-cockpit-polish-batch.md#whole-batch-acceptance-gate).

---

## Acceptance gates

### Per-phase close gates

**Phase 1 close gate:**

```
- [ ] cp-01 + cp-02 `Status: Shipped`.
- [ ] queueEntries: all three buckets merged + sorted by tokenNumber ASC; one new test in
      hooks/__tests__/useDoctorDayPipeline.test.ts (or equivalent) covers the
      "current patient just flipped to completed" case.
- [ ] CockpitQueueRail renders prev / now / next chips only; no overflow pill;
      no "+ Walk-in" trigger.
```

**Phase 2 close gate:**

```
- [ ] cp-03 + cp-04 `Status: Shipped`.
- [ ] WalkInQuickModal.tsx is deleted; rg "WalkInQuickModal" in frontend/ → no matches.
- [ ] RxWorkspace.tsx no longer renders the dashed "+ Add follow-up Rx" stub.
- [ ] cockpit-state.ts: `draft-followup` removed from CockpitCtaAction; ended-state
      ctaForState() returns null (or a quieter "Re-open Rx" — see task spec).
- [ ] cockpit-state.test.ts updated.
```

**Phase 3 close gate:**

```
- [ ] cp-05 + cp-06 `Status: Shipped`.
- [ ] CockpitHeader.ready: ghost-link "Mark no-show", visible only when
      appointment_date <= now() + 5min.
- [ ] TextConsultRoom: destructive-ghost button next to "End chat";
      two-step confirm; calls onMarkNoShow.
- [ ] ConsultationLauncher threads `onMarkNoShow` to text room
      (mirroring video / voice rooms).
- [ ] No regressions in voice / video room mark-no-show.
```

**Phase 4 close gate:**

```
- [ ] cp-07 + cp-08 + cp-09 `Status: Shipped`.
- [ ] GET /v1/appointments/:id returns patient_age (number|null), patient_sex (enum|null).
- [ ] Privacy block-comment in appointment-service.ts mirrors the OQ-D1/D7 doctor-scope rationale.
- [ ] Backend test asserts both fields are present on the response.
- [ ] frontend Appointment type carries patient_age + patient_sex.
- [ ] CockpitHeader: two rows; row 1 = name + age/sex (prominent); row 2 = MRN +
      phone + modality + scheduled + token (small, muted).
- [ ] Below `lg`: row 2 collapses to single truncated line + tooltip.
- [ ] cp-05's mark-no-show ghost link integrates with the new layout.
```

### Whole-batch close gate

Run after all 4 phase gates close. See [plan-cockpit-polish-batch.md § Whole-batch acceptance gate](../plan-cockpit-polish-batch.md#whole-batch-acceptance-gate). One Opus chat, paste full diff, ask for the final grade.

---

## Cost calibration for this batch

Expected model-mix per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Phase | Opus turns | Sonnet turns | Composer turns |
|---|---|---|---|
| Phase 1 (cp-01, 02) | 0 | 3–4 | 0 |
| Phase 2 (cp-03, 04) | 0 | 2–3 | 1 (cp-04 boilerplate-y) |
| Phase 3 (cp-05, 06) | 0 | 3–4 | 0 |
| Phase 4 (cp-07 design + impl, cp-08, cp-09) | 1 (cp-07 privacy + contract) | 5–6 | 0 |
| Whole-batch close | 1 (final grade) | 0 | 1 (three-way doc sync) |
| **Totals** | **~2** | **~13–17** | **~2** |

**Red flag heuristic:** if any single task takes >2 chats, **stop and tighten the task file's spec section.** The task file IS the spec.

---

## References

- [plan-cockpit-polish-batch.md](../plan-cockpit-polish-batch.md) — master batch plan
- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules and chat heuristics
- Style precedent: [Daily-plans/May 2026/08-05-2026/Tasks/EXECUTION-ORDER-opd-queue.md](../../../08-05-2026/Tasks/EXECUTION-ORDER-opd-queue.md) — predecessor exec-order doc
- Cockpit precedents this batch builds on:
  - [Daily-plans/May 2026/06-05-2026/Tasks/task-cockpit-1-state-machine.md](../../../06-05-2026/Tasks/task-cockpit-1-state-machine.md) — `cockpit-state.ts` is the source of the CTA mapping cp-04 retires.
  - [Daily-plans/May 2026/07-05-2026/Tasks/task-pf-11-next-patient-countdown.md](../../../07-05-2026/Tasks/task-pf-11-next-patient-countdown.md) — the auto-advance flow cp-01's bug currently breaks.
  - [Daily-plans/May 2026/07-05-2026/Tasks/task-pf-16-walkin-fast-path.md](../../../07-05-2026/Tasks/task-pf-16-walkin-fast-path.md) — **superseded** by CP-D1; this batch removes the surfaces it shipped.

---

**Created:** 2026-05-09. **Status:** `Drafted`.
