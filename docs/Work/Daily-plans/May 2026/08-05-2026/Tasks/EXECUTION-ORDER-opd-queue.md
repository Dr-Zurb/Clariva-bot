# OPD queue redesign — Execution order (authoritative)

**Status:** `Drafted` 2026-05-08
**Owner:** TBD
**Scope:** 14 tasks across 5 phases · 6 parallel-chat lanes (α–ζ)
**Total estimate:** ~4.5 dev-days serial · **~2 calendar days with 4 parallel chats**
**Parent batch plan:** [plan-opd-queue-redesign-batch.md](../plan-opd-queue-redesign-batch.md)
**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## TL;DR — read before you touch any task

1. **Two hard prerequisites unblock everything.** `oq-01` (backend widen) and `oq-09` (frontend api clients) are independent and can run in parallel from `T+0`. Once `oq-01` ships, the frontend types / row / table cascade fans out. `oq-09` is tiny and unblocks the overflow menu in `oq-10`.
2. **One Cursor chat per lane.** You can run **up to 4 chats simultaneously** without file collisions. The lane matrix below is the no-collision contract.
3. **One topic per chat.** Each task file's `## Model & execution guidance` block tells you the model + what to pre-load.
4. **Per-message escalation.** If Sonnet stalls on one message, escalate **that** message to Opus. Don't switch the whole chat.
5. **No iteration loops.** If the agent has rewritten the same component twice, **stop**, tighten the spec in the task file, start a new chat. Each rewrite ≈ paying twice.
6. After each task ships, update its row in this file (`Status: Shipped (YYYY-MM-DD)`) AND tick the row in [plan-opd-queue-redesign-batch.md](../plan-opd-queue-redesign-batch.md). Doc-sync turns are **Composer 2 Fast**.

---

## Pre-flight — confirm before starting

```
- [ ] Patient flow batch (07-05-2026) is shipped (or at least pf-06 + pf-12 — useOpdSnapshot + OpdQueueStrip are the precedents this batch leans on):
      cd frontend && rg -l "useOpdSnapshot" hooks/ components/  → matches present.
      cd frontend && rg -l "getOpdStatusMeta" lib/  → matches present.
- [ ] Frontend type-check + lint clean BEFORE starting:
      cd frontend && npx tsc --noEmit && npx next lint
- [ ] Backend type-check + lint clean:
      cd backend && npm run typecheck && npm run lint
- [ ] Backend OPD routes are still wired (regression smoke):
      curl -s -H "Authorization: Bearer $TOKEN" "$API/api/v1/opd/queue-session?date=$(date +%F)" | jq '.data.entries | length'
- [ ] Recent screenshot of current /dashboard/opd-today saved for before/after.
```

If those are green, **`oq-01` and `oq-09` are unblocked** and 2 parallel chats are ready to fan out.

---

## Model-tier glossary

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Tier | Label | Model | Use for |
|---|---|---|---|
| 1 | **Opus** | Opus 4.7 Extra High | API contract review (`oq-01` privacy decision write-up + payload widening review), close-gate review. |
| 2 | **Sonnet** | Sonnet 4.6 Medium | Default — bounded UI / hook tasks with clear specs. |
| 3 | **Codex** | Codex 5.3 Medium | Sonnet alternative; pure code-gen / type-error fix. |
| 4 | **Composer** | Composer 2 Fast | Doc-sync, file deletes, kebab-item removal, status updates. |

**Hard rules — always Opus:**
- The widened `DoctorQueueSessionRow` API contract design + privacy-decision documentation (`oq-01`) — touches PHI surface visibility; getting the privacy boundary documented matters more than typing the fields.
- The whole-batch close-gate review.

**No new migrations in this batch.** All backend work is additive on the existing service layer.

---

## Parallel-chat lane matrix (the multi-tasking workflow)

Each lane below is **engineered to touch disjoint files** so you can run multiple Cursor chats side-by-side with zero merge / edit-stomp risk.

| Lane | Window title | Tasks (in order) | Files owned exclusively by this lane | Wait-on |
|---|---|---|---|---|
| **α** (backend widen) | `α — backend widen` | oq-01 | `backend/src/services/opd-doctor-service.ts` (widen `listDoctorQueueSession` + `DoctorQueueSessionRow`), `backend/src/controllers/opd-doctor-controller.ts` (no changes expected — verify only) | — |
| **β** (frontend table core) | `β — table core` | oq-02 → oq-03 → oq-04 → oq-05 | `frontend/types/opd-doctor.ts`, `frontend/lib/api.ts` (`getDoctorOpdQueueSession` mapping), `frontend/components/opd/OpdQueueDenseRow.tsx` (NEW), `frontend/components/opd/OpdQueueTable.tsx` (NEW), `frontend/components/opd/OpdQueueRowExpanded.tsx` (NEW), `frontend/components/opd/DoctorQueueBoard.tsx` (DELETE or thin-wrap in oq-04), `frontend/components/opd/OpdTodayClient.tsx` (one mount line — coordinates with oq-06) | oq-01 |
| **γ** (filters + search) | `γ — filters` | oq-07 → oq-08 | `frontend/components/opd/OpdQueueFilters.tsx` (NEW), `frontend/hooks/useOpdQueueFilters.ts` (NEW) | oq-04 |
| **δ** (snapshot wire-up) | `δ — snapshot wire-up` | oq-06 | `frontend/components/opd/OpdTodayClient.tsx` (one hook swap), `frontend/components/opd/DoctorQueueBoard.tsx` (delete bespoke `setInterval`) | oq-04 |
| **ε** (actions) | `ε — actions` | oq-09 → oq-10 | `frontend/lib/api.ts` (two new client fns — additive), `frontend/components/opd/OpdQueueRowActions.tsx` (NEW), `frontend/components/opd/OpdQueueDenseRow.tsx` (one prop edit — coordinates with β) | oq-09 independent; oq-10 needs oq-03 |
| **ζ** (polish) | `ζ — polish` | oq-11 → oq-12 → oq-13 → oq-14 | `frontend/components/opd/OpdQueueSessionToolbar.tsx` (NEW), `frontend/hooks/useOpdQueueDensity.ts` (NEW), `frontend/components/opd/OpdQueueMobileCard.tsx` (NEW), `frontend/hooks/useOpdQueueHotkeys.ts` (NEW), telemetry call-sites in NEW files only | oq-04 (mount target), oq-09 (for toolbar actions) |

### No-collision guarantees

- **α never touches frontend.**
- **β and ε both touch `OpdQueueDenseRow.tsx`.** Mitigation: β creates the file with row props **including an `actions: React.ReactNode` slot**. ε's `oq-10` populates that slot via `<OpdQueueRowActions>` from inside `<OpdQueueTable>`. The two edits hit **different files** after the prop slot lands. **β finishes oq-03 before ε starts oq-10.** (ε's `oq-09` — pure `lib/api.ts` additions — runs in parallel from T+0.)
- **β, δ both touch `OpdTodayClient.tsx`** (one line each). Mitigation: β's edit is the new component mount (replaces `<DoctorQueueBoard>` import); δ's edit is the optional snapshot pre-fetch (additive). Sequence: **β finishes oq-04 before δ starts oq-06**, OR fold oq-06's edit into oq-04 (the spec lets you do this — see oq-06 § Notes).
- **γ, ζ are isolated** — both create new files only.
- **No backend file is touched by anyone except α.**

---

## Suggested wall-clock plan (solo dev, 4 parallel chats max)

```
T+0h     Open Chat α — oq-01 (backend widen)               [Opus design + Sonnet impl]
T+0h     Open Chat ε-9 — oq-09 (api clients)               [Sonnet]
                                                            (2 chats running)

T+3h     oq-09 ships → ε-9 chat closes. (Tiny task.)
T+4h     oq-01 ships → unblocks β. Open Chat β — oq-02     [Sonnet]

T+5h     oq-02 ships → β continues with oq-03               [Sonnet]
T+11h    oq-03 ships → unblocks β-cont and ε-10.
                       Open Chat ε-10 — oq-10               [Sonnet]
                       β continues with oq-04               [Sonnet]
                                                            (2 chats running)

T+15h    oq-04 ships → unblocks γ, δ, ζ.
                       Open Chat γ — oq-07 → oq-08          [Sonnet]
                       Open Chat δ — oq-06                  [Sonnet]
                       Open Chat ζ-a — oq-11                [Sonnet]
                       β continues with oq-05               [Sonnet]
                                                            (4 chats running)

T+19h    All Phase 3 + oq-11 ship. Open Chat ζ-b — oq-12 (density+mobile)
                                  Open Chat ζ-c — oq-13 (keyboard+a11y)
                                  Open Chat ζ-d — oq-14 (telemetry)
                                                            (3 chats running)

T+23h    All ζ chats ship.
T+24h    Close-gate Opus review (1h, paste whole-batch diff).
T+25h    DONE.
```

**Solo: ~25h focused work spread across ~2 calendar days** if you can supervise 3–4 chats at a time. Pure-serial without parallelism: ~36h (~4.5 days).

---

## Operating rules for multi-chat workflow

1. **One window per lane.** Don't put oq-03 and oq-09 in the same chat — context costs money even if the diffs don't collide.
2. **Pin the task file.** First message of every lane chat: paste the task spec file path + open the file in the IDE.
3. **Mention the lane in your first prompt.** e.g. *"This is lane β — table core. Reading task-oq-03-dense-row-component.md. Do not touch any file owned by lanes α, γ, δ, ε, ζ (see EXECUTION-ORDER-opd-queue.md § Parallel-chat lane matrix)."*
4. **Sync at lane boundaries.** When oq-01 ships, post a one-line ping in chat β: *"oq-01 has landed; widened payload available in `backend/src/services/opd-doctor-service.ts:NN`."* When oq-03 ships, ping chat ε: *"oq-03 has landed; row prop `actions` slot ready at `frontend/components/opd/OpdQueueDenseRow.tsx:LXX`."*
5. **Status-sync turns go to Composer.** When 2 lanes ship, **don't** update the plan + the task + the source plan in the same lane chat. Open a 5-minute Composer chat for the three-way doc sync.
6. **Bail out if lanes drift.** If two chats both start trying to edit the same file (because a lane spec was wrong), **stop both chats**, fix the spec in this file, restart.

---

## Execution table — full per-task view

### Phase 1 — Backend widening

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Parallel-eligible | Unblocks |
|---|---|---|---|---|---|---|---|---|
| α-0 | [oq-01 — widen `DoctorQueueSessionRow` API; drop initials masking](./task-oq-01-backend-widen-queue-api.md) | S (~4h) | — | — | **Opus** for privacy-decision write-up + contract review (~30m), **Sonnet** for impl (~3h) | Yes (split: design + impl) | **ε-9 (oq-09) in parallel** | oq-02 |

### Phase 2 — Dense table refactor

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Parallel-eligible | Unblocks |
|---|---|---|---|---|---|---|---|---|
| β-0 | [oq-02 — frontend types + api client mapping](./task-oq-02-frontend-types-update.md) | XS (~1h) | oq-01 | — | **Sonnet** | Yes (or stitched after oq-01 if context fits) | — | oq-03 |
| β-1 | [oq-03 — `<OpdQueueDenseRow>` single-row component](./task-oq-03-dense-row-component.md) | M (~6h) | oq-02 | — | **Sonnet** | Yes | ε-10 (oq-10) waits on this | oq-04, oq-10 |
| β-2 | [oq-04 — `<OpdQueueTable>` shell + grouping + sticky header](./task-oq-04-table-shell-grouping.md) | M (~4h) | oq-03 | — | **Sonnet** | Yes | — | oq-05, oq-06, oq-07, oq-11 |
| β-3 | [oq-05 — `<OpdQueueRowExpanded>` inline-expand panel](./task-oq-05-row-expanded-panel.md) | S (~4h) | oq-03 | — | **Sonnet** | Yes | γ, δ, ζ in parallel | — |
| δ-0 | [oq-06 — wire page to `useOpdSnapshot`](./task-oq-06-wire-opd-snapshot.md) | XS (~2h) | oq-04 | — | **Sonnet** | Yes (or stitched into oq-04) | β-3, γ, ζ in parallel | — |

### Phase 3 — Filters & search

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Parallel-eligible | Unblocks |
|---|---|---|---|---|---|---|---|---|
| γ-0 | [oq-07 — status segmented control + counts](./task-oq-07-status-filter.md) | S (~4h) | oq-04 | — | **Sonnet** | Yes | β-3, δ, ζ in parallel | oq-08 |
| γ-1 | [oq-08 — search box (name / phone / token / MRN)](./task-oq-08-search-box.md) | XS (~2h) | oq-07 | — | **Sonnet** | Yes (or stitched after oq-07) | β-3, δ, ζ in parallel | — |

### Phase 4 — Actions & overflow

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Parallel-eligible | Unblocks |
|---|---|---|---|---|---|---|---|---|
| ε-0 | [oq-09 — frontend api clients for `requeue` + `markNoShow`](./task-oq-09-frontend-action-clients.md) | XS (~1h) | — | — | **Sonnet**; **Composer** OK for the boilerplate clone | Yes | **α, β-0 in parallel** | oq-10, oq-11 |
| ε-1 | [oq-10 — row primary action + overflow menu + row click target](./task-oq-10-row-actions-overflow.md) | M (~4h) | oq-03, oq-09 | — | **Sonnet** | Yes | γ, δ, ζ in parallel | oq-13 |

### Phase 5 — Session controls + density + polish

| Step | Task | Effort | Hard deps | Soft deps | Recommended model | New chat? | Parallel-eligible | Unblocks |
|---|---|---|---|---|---|---|---|---|
| ζ-0 | [oq-11 — session toolbar (broadcast delay + offer early join)](./task-oq-11-session-toolbar.md) | S (~4h) | oq-04, oq-09 | — | **Sonnet** | Yes | γ, δ, β-3 in parallel | — |
| ζ-1 | [oq-12 — density toggle + mobile fallback](./task-oq-12-density-mobile.md) | S (~4h) | oq-04 | — | **Sonnet** | Yes | All other ζ tasks | — |
| ζ-2 | [oq-13 — keyboard shortcuts + a11y polish + per-filter empty states](./task-oq-13-keyboard-a11y.md) | S (~4h) | oq-04, oq-07, oq-08, oq-10 | — | **Sonnet** | Yes | All other ζ tasks | — |
| ζ-3 | [oq-14 — PHI-free telemetry events](./task-oq-14-telemetry.md) | XS (~2h) | oq-04, oq-07, oq-10 | — | **Sonnet**; **Composer** OK | Yes (or stitched after ζ-3) | All other ζ tasks | — |

---

## Multitask guidance — what to run in parallel chats

### Wave 1 — `T+0h` (2 chats)

| Chat | Lane | Task | Why parallel-safe |
|---|---|---|---|
| Chat 1 | α | oq-01 | Backend widening only — no other lane touches `backend/src/services/opd-doctor-service.ts`. |
| Chat 2 | ε-9 | oq-09 | Pure additions to `frontend/lib/api.ts` — α never touches frontend. |

**Estimated wave time:** ~3–4h. By T+4h both ship.

### Wave 2 — `T+4h to T+11h` (1 chat — β only)

| Chat | Lane | Task | Started after |
|---|---|---|---|
| Chat 1 | β | oq-02 → oq-03 (stitched) | oq-01 |

`Chat 2 (ε)` is **idle** until oq-03 finishes — use the time to open a temporary doc-sync Composer chat, OR pre-draft oq-10's spec with screenshots of the existing overflow menu in the cockpit batch.

### Wave 3 — `T+11h to T+15h` (2 chats)

| Chat | Lane | Task | Started after |
|---|---|---|---|
| Chat 1 | β | oq-04 | oq-03 |
| Chat 2 | ε-10 | oq-10 | oq-03 + oq-09 |

### Wave 4 — `T+15h to T+19h` (4 chats — peak parallelism)

| Chat | Lane | Task | Started after |
|---|---|---|---|
| Chat 1 | β | oq-05 | oq-03 (independent of oq-04 if you're disciplined) |
| Chat 2 | γ | oq-07 → oq-08 (stitched) | oq-04 |
| Chat 3 | δ | oq-06 | oq-04 |
| Chat 4 | ζ-a | oq-11 | oq-04 + oq-09 |

### Wave 5 — `T+19h to T+23h` (3 chats — pure ζ parallel)

| Chat | Lane | Task | Started after | Notes |
|---|---|---|---|---|
| Chat ζ-b | ζ | oq-12 (density + mobile) | oq-04 | Independent. |
| Chat ζ-c | ζ | oq-13 (keyboard + a11y) | oq-04, oq-07, oq-08, oq-10 | Touches no shared files. |
| Chat ζ-d | ζ | oq-14 (telemetry) | oq-04, oq-07, oq-10 | Tiny; can also stitch after ζ-c. |

### Wave 6 — `T+23h` (1 chat)

Close-gate Opus review. One careful read against the whole-batch acceptance gate in [plan-opd-queue-redesign-batch.md § Whole-batch acceptance gate](../plan-opd-queue-redesign-batch.md#whole-batch-acceptance-gate).

---

## Acceptance gates

### Per-phase close gates

**Phase 1 close gate:**

```
- [ ] oq-01 `Status: Shipped`.
- [ ] GET /v1/opd/queue-session?date=… returns the widened payload.
- [ ] DoctorQueueSessionRow no longer has patientLabel; type docs the privacy decision.
- [ ] No call site of patientLabelFromName remains; helper is deleted.
- [ ] Backend tests cover the widened payload (one new test row added or existing assertions updated).
```

**Phase 2 close gate:**

```
- [ ] oq-02 / oq-03 / oq-04 / oq-05 / oq-06 all `Status: Shipped`.
- [ ] /dashboard/opd-today renders <OpdQueueTable> with the new dense rows.
- [ ] Each row shows full name + MRN + phone + age/gender + reason + service + modality + scheduled + waited.
- [ ] Status grouping works (Active / Done / Missed) with disclosures.
- [ ] Page consumes useOpdSnapshot; bespoke setInterval is gone.
- [ ] Inline expand reveals the secondary panel.
- [ ] No dead imports of DoctorQueueBoard or patientLabel.
```

**Phase 3 close gate:**

```
- [ ] oq-07 + oq-08 `Status: Shipped`.
- [ ] Status filter chips: All / Waiting / Called / In consult / Done / No-show / Skipped — each with live counts.
- [ ] Search box filters across name (case-insensitive substring) + phone (digits-only) + token (#NN) + MRN.
- [ ] Filter state persists in URL params (?status=…&q=…).
- [ ] Empty state per filter shows the right copy ("No waiting patients", etc.).
```

**Phase 4 close gate:**

```
- [ ] oq-09 + oq-10 `Status: Shipped`.
- [ ] Each row has one Open primary + one ⋯ overflow.
- [ ] Click row OR Open → auto-marks waiting → called (idempotent) → routes to /dashboard/appointments/:id.
- [ ] Overflow: Mark called silently / Requeue after current / Send to end of queue / Mark as no-show.
- [ ] Each overflow action round-trips and refetches the snapshot.
- [ ] No Skip button anywhere.
```

**Phase 5 close gate:**

```
- [ ] oq-11 + oq-12 + oq-13 + oq-14 `Status: Shipped`.
- [ ] Session toolbar with Broadcast delay + Offer early join.
- [ ] Density toggle (Compact / Default) persists to localStorage.
- [ ] Below lg, the table swaps to a 2-line card list.
- [ ] Keyboard map (J/K/Enter/C/S/⋯//) works; respects typing context.
- [ ] Telemetry events fire (PHI-free counts).
```

### Whole-batch close gate

Run after all 5 phase gates close. See [plan-opd-queue-redesign-batch.md § Whole-batch acceptance gate](../plan-opd-queue-redesign-batch.md#whole-batch-acceptance-gate). One Opus chat, paste full diff, ask for the final grade.

---

## Cost calibration for this batch

Expected model-mix per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Phase | Opus turns | Sonnet turns | Composer turns |
|---|---|---|---|
| Phase 1 (oq-01) | 1 (privacy + contract review) | 2–3 | 0 |
| Phase 2 (oq-02…06) | 0 | 10–12 | 0 |
| Phase 3 (oq-07, 08) | 0 | 3–4 | 0 |
| Phase 4 (oq-09, 10) | 0 | 4–5 | 1 (oq-09 boilerplate) |
| Phase 5 (oq-11…14) | 0 | 8–10 | 1 (oq-14 doc-sync) |
| Whole-batch close | 1 (final grade) | 0 | 1 (three-way doc sync) |
| **Totals** | **~2** | **~28–34** | **~3** |

**Red flag heuristic:** if any single task takes >2 chats, **stop and tighten the task file's spec section.** The task file IS the spec.

---

## References

- [plan-opd-queue-redesign-batch.md](../plan-opd-queue-redesign-batch.md) — master batch plan
- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules and chat heuristics
- Style precedent: [Daily-plans/May 2026/07-05-2026/Tasks/EXECUTION-ORDER-patient-flow.md](../../07-05-2026/Tasks/EXECUTION-ORDER-patient-flow.md) — predecessor exec-order doc
- Cockpit precedents this batch leans on:
  - [Daily-plans/May 2026/07-05-2026/Tasks/task-pf-12-opd-strip-extension.md](../../07-05-2026/Tasks/task-pf-12-opd-strip-extension.md) — `OpdQueueStrip` final shape; same status meta + grouping primitives.
  - [Daily-plans/May 2026/07-05-2026/Tasks/task-pf-08-cockpit-queue-rail.md](../../07-05-2026/Tasks/task-pf-08-cockpit-queue-rail.md) — token rail; same data model.

---

**Created:** 2026-05-08. **Status:** `Drafted`.
