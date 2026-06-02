# 2026-05-06 — UI system redesign batch + Consultation cockpit redesign batch + Cockpit hardening batch

## Today's folder = three related but independent batches

1. **UI system redesign** — the doctor-dashboard shell (tokens, primitives, header, sidebar, today cockpit, reference pages). Ships first.
2. **Consultation cockpit redesign** — supersedes the UI batch's D1 4-tab appointment page with a side-by-side workspace (chart + room + Rx). Runs after UI batch's A2 ships, with explicit parallel-chat lanes for fast solo execution.
3. **Cockpit hardening (post-ship)** — closes the gaps between what the cockpit redesign promised and what actually rendered after lanes α/β/γ/δ shipped (Rx pane was a dashed-border placeholder, launcher kept showing modality buttons during live, header CTAs were no-ops). 5 surgical fixes across 3 parallel-chat lanes (~3h wall-clock).

Both batches use the same [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) for per-task model-tier guidance.

The product has shipped deep features (EHR T1–T5, full consult FSM, OPD queue, IG funnel, modality upgrade FSM, Rx PDF, recording/replay, dashboard events). The shell exposing all of that is generic V0 admin: bare `globals.css`, empty Tailwind config, no `ui/` primitives, no brand assets, flat 6-link sidebar, dashboard home that says "Welcome." The UI batch closes that gap. The cockpit batch then turns the appointment-detail page from a 4-tab admin form into a teleconsult workspace where chart, room, and Rx are visible together.

---

## Files in this folder

### UI system redesign batch

| File | Purpose | Size |
|---|---|---|
| [plan-ui-system-redesign-batch.md](./plan-ui-system-redesign-batch.md) | **Master batch plan.** Confirms the U0 strategic locks, lists the 17 selected items by sub-batch, sequences them, defines whole-batch acceptance, and lists files-to-touch globally. | Large |
| [Tasks/EXECUTION-ORDER-ui.md](./Tasks/EXECUTION-ORDER-ui.md) | **Authoritative execution order** with step tables, dependencies, parallelism notes, and per-step model-tier recommendation. | Medium |
| [Tasks/task-ui-A*.md](./Tasks/) | **Sub-batch A — Foundation** (5 tasks, ~1.5 days): tokens, shadcn primitives, Inter typography, lucide icons, brand assets + BRAND.md. | Per-task |
| [Tasks/task-ui-B*.md](./Tasks/) | **Sub-batch B — Shell** (4 tasks, ~1.5 days): header redesign, sidebar regrouping + icons, sidebar counts + collapse, Cmd-K global search. | Per-task |
| [Tasks/task-ui-C*.md](./Tasks/) | **Sub-batch C — Today cockpit** (5 tasks, ~1.5–2 days): page scaffold + KPI strip, Now/Next card, OPD queue strip, Inbox column, Today's schedule. | Per-task |
| [Tasks/task-ui-D*.md](./Tasks/) | **Sub-batch D — Reference page redesigns** (3 tasks, ~1.5 days): appointment detail 3-zone, patient detail tabs + rail, list-page reskin pattern. | Per-task |

### Consultation cockpit redesign batch (supersedes D1)

| File | Purpose | Size |
|---|---|---|
| [plan-cockpit-redesign-batch.md](./plan-cockpit-redesign-batch.md) | **Master batch plan.** Locks the 7 strategic decisions (K1–K7), lists the 8 tasks across 4 parallel-chat lanes, defines whole-batch acceptance. | Large |
| [Tasks/EXECUTION-ORDER-cockpit.md](./Tasks/EXECUTION-ORDER-cockpit.md) | **Authoritative execution order** with the **parallel-chat lane matrix** — α (cockpit core) / β (Rx workspace) / γ (in-call cleanup) / δ (patient page) — engineered so each lane touches disjoint files. New multi-chat workflow for fast solo execution. | Medium |
| [Tasks/task-cockpit-1-state-machine.md](./Tasks/task-cockpit-1-state-machine.md) | Pure helper — derives `ready / lobby / live / ended / terminal` from appointment + session. Hard prerequisite for the rest. | Per-task |
| [Tasks/task-cockpit-2-shell.md](./Tasks/task-cockpit-2-shell.md) → [task-cockpit-7-mobile.md](./Tasks/task-cockpit-7-mobile.md) | Lane α — cockpit shell + state-driven center + header (deletes the 4 tabs) + mobile sheets. | Per-task |
| [Tasks/task-cockpit-5-rx-workspace.md](./Tasks/task-cockpit-5-rx-workspace.md) | Lane β — `RxWorkspace` shell + `PreviousRxPopover` + sticky action bar. Parallel chat. | Per-task |
| [Tasks/task-cockpit-6-incall-cleanup.md](./Tasks/task-cockpit-6-incall-cleanup.md) | Lane γ — strip the in-call Rx slide-over (delete `InCallChartRxTabs`). Parallel chat. | Per-task |
| [Tasks/task-cockpit-8-patient-page.md](./Tasks/task-cockpit-8-patient-page.md) | Lane δ — `/dashboard/patients/[id]` mirrors the cockpit pattern. Parallel chat. | Per-task |

### Cockpit hardening batch (post-ship gap closures)

| File | Purpose | Size |
|---|---|---|
| [plan-cockpit-hardening-batch.md](./plan-cockpit-hardening-batch.md) | **Master plan.** 5 fixes, 3 parallel-chat lanes, K-H1..K-H5 architectural locks (Opus-graded design pass already done). | Medium |
| [Tasks/EXECUTION-ORDER-cockpit-hardening.md](./Tasks/EXECUTION-ORDER-cockpit-hardening.md) | **Authoritative execution order** with the H1 / H2 / H3 parallel-chat lane matrix and per-task model-tier recommendations. | Medium |
| [Tasks/task-cockpit-fix-1-wire-rx-workspace.md](./Tasks/task-cockpit-fix-1-wire-rx-workspace.md) | H1 — replace placeholder with `<RxWorkspace>` import (kills the dashed border + the "Cockpit state: live" debug chip). Composer-grade. | Per-task |
| [Tasks/task-cockpit-fix-2-launcher-mode-aware.md](./Tasks/task-cockpit-fix-2-launcher-mode-aware.md) | H2 — gate launcher pre-call UI on `!sessionLive`. | Per-task |
| [Tasks/task-cockpit-fix-3-room-cockpit-mode.md](./Tasks/task-cockpit-fix-3-room-cockpit-mode.md) | H3 — `mode="cockpit"` prop on `VideoRoom` / `VoiceConsultRoom` (Opus-locked design baked in). The long pole. | Per-task |
| [Tasks/task-cockpit-fix-4-launcher-imperative-handle.md](./Tasks/task-cockpit-fix-4-launcher-imperative-handle.md) | H2 — replace `document.querySelector` hack with `forwardRef` + `useImperativeHandle`. Hides header End-CTA in `live`. | Per-task |
| [Tasks/task-cockpit-fix-5-hide-join-link.md](./Tasks/task-cockpit-fix-5-hide-join-link.md) | H2 — gate `<PatientJoinLink>` on remote-participant presence. | Per-task |

**T6-style deferred line:** the patient-facing surfaces (`/r/[id]`, `/consult/join`, `/book`, `/my-visit`), inside-call rooms, full settings tree visual refresh, mobile bottom-tab nav, and dim mode are **out of this batch** per U5 in the source plan. They inherit tokens passively.

---

## Read-order

Pick what fits the question:

- **"What did we commit to and in what order?"** → Read [plan-ui-system-redesign-batch.md](./plan-ui-system-redesign-batch.md), then [Tasks/EXECUTION-ORDER-ui.md](./Tasks/EXECUTION-ORDER-ui.md).
- **"I'm starting implementation today, where do I begin?"** → Open [Tasks/EXECUTION-ORDER-ui.md](./Tasks/EXECUTION-ORDER-ui.md), find the first `Drafted` step (A1), open its task file, follow the model-tier recommendation.
- **"Which model and chat strategy do I use for this task?"** → Each task file has a **Model & execution guidance** section. Read it before opening Cursor.
- **"Why are we doing this redesign?"** → Open [plan-ui-system-redesign.md](../../../Product%20plans/plan-ui-system-redesign.md) — the rationale, decisions, alternatives, and trade-offs live there.

---

## Sub-batch sequencing at a glance

### UI system redesign batch

```
Sub-batch A — Foundation (~1.5 days)        ← strict prerequisite for everything
   │   tokens · shadcn · Inter · lucide · brand
   │
   ├──→ Sub-batch B — Shell (~1.5 days)
   │       header · sidebar · counts · Cmd-K
   │
   ├──→ Sub-batch C — Today cockpit (~1.5–2 days)
   │       scaffold · Now/Next · OPD · Inbox · Schedule
   │
   └──→ Sub-batch D — Reference pages (~1.5 days)
           appointment · patient · list-pattern        ← D1 SUPERSEDED by cockpit batch below

Total solo:  ~6–7 dev-days (~1.5 calendar weeks)
Total 2-dev: ~4 calendar days (B ‖ C ‖ D after A; A is serial)
```

**Parallelism:**
- Sub-batches B, C, D can all run in parallel after A is shipped.
- Within B, B1–B3 (Header / Sidebar) are mostly serial (same files); B4 (Cmd-K) parallel.
- Within C, C1 (scaffold) gates C2–C5; C2–C5 parallel after C1.
- Within D, D1 / D2 / D3 are independent — fully parallel. **D1 is superseded by the cockpit batch — skip if cockpit batch ships in the same sprint.**

### Consultation cockpit redesign batch

```
                      cockpit-1 (state machine, ~2h, blocks everything)
                              │
              ┌───────────────┼───────────────┬──────────────────┐
              │               │               │                  │
        Chat α — cockpit     Chat γ           Chat δ             │
        cockpit-2 (shell)    cockpit-6        cockpit-8          │
        cockpit-3 (states)   (in-call cleanup) (patient page)    │
        cockpit-4 (header)                                       │
        cockpit-7 (mobile)                                       │
                              │
                          Chat β — Rx workspace (after cockpit-2)
                          cockpit-5

Total solo serial:  ~3–4 dev-days
Total solo with 4 parallel chats (the new workflow): ~2 calendar days
```

**Parallelism (multi-chat workflow):**
- **cockpit-1 is the only hard prerequisite.** After it ships, fan out into 4 parallel chats: lane α (sequential within), lane β (waits 3h for cockpit-2 mount slot), lane γ (independent), lane δ (independent).
- See [Tasks/EXECUTION-ORDER-cockpit.md § Parallel-chat lane matrix](./Tasks/EXECUTION-ORDER-cockpit.md#parallel-chat-lane-matrix-the-multi-tasking-workflow) for the no-collision file-ownership matrix and the operating rules for running 4 Cursor chats side-by-side without merge conflicts.

### Cockpit hardening batch

```
Three disjoint-file lanes — all run in parallel:

   Chat H1 — Rx wiring (Composer, 10 min)
        └── fix-1   (ConsultationCockpit.tsx only)

   Chat H2 — Launcher cleanup (Sonnet, ~2h sequential)
        ├── fix-2   (ConsultationLauncher.tsx — mode-aware)
        ├── fix-4   (forwardRef + useImperativeHandle)
        └── fix-5   (PatientJoinLink gating)

   Chat H3 — Room compact (Sonnet, ~3h, design fully locked in spec)
        └── fix-3   (VideoRoom.tsx + VoiceConsultRoom.tsx)

Total solo serial: ~5h. With 3 parallel chats: ~3h wall-clock.
```

**Parallelism:** all three lanes are file-disjoint by design. fix-3 (lane H3) is the longest pole; lane H1 ships first and is fully independent.

---

## Status

`Drafted, awaiting commit-start` — 2026-05-06.

Once a sub-batch is picked up, this folder gets in-place updates: tasks move from `Drafted` → `In progress` → `Shipped (YYYY-MM-DD)`. The source plan ([plan-ui-system-redesign.md](../../../Product%20plans/plan-ui-system-redesign.md)) gets `[SHIPPED YYYY-MM-DD]` markers on the corresponding U-IDs at sub-batch close.

---

## Cost-aware execution model

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Tier | Model | Use for |
|---|---|---|
| 1 | **Opus 4.7 Extra High** | Architectural / multi-file decisions: B4 (Cmd-K design), D1 (appointment-detail tab routing), close-gate review per sub-batch. ~10–15% of turns. |
| 2 | **Sonnet 4.6 Medium** | Default for all bounded UI tasks below — A1, A2, A3, A4, B1, B2, B3, C1–C5, D2, D3. ~50–60% of turns. |
| 3 | **Codex 5.3 Medium** | Alternate with Sonnet on pure code-gen / TS-error fix turns; no architectural calls. |
| 4 | **Composer 2 Fast** | Brand asset drop (A5 file moves), three-way doc sync (status emojis, `[SHIPPED]` tags), markdown-only edits. |

**Hard rules from the efficiency guide that apply to this batch:**

- **One topic per chat.** Start a fresh chat per task; the per-task `## Model & execution guidance` block tells you what to pre-load.
- **No iteration loops.** If the agent has rewritten the same component twice, **stop**, tighten the spec in the task file, start a new chat. Each rewrite ≈ paying twice.
- **Concrete file references over searches.** Every task file lists the exact files to touch — paste them into the prompt, don't make the agent grep.
- **Plan Mode for ambiguous turns.** If a task says "decide between X and Y" in its Notes, switch to Plan Mode + Opus before any code lands.

---

## References

### UI system redesign batch
- **Source plan (Shipped):** [plan-ui-system-redesign.md](../../../Product%20plans/plan-ui-system-redesign.md)
- **Master batch plan:** [plan-ui-system-redesign-batch.md](./plan-ui-system-redesign-batch.md)
- **Execution order:** [Tasks/EXECUTION-ORDER-ui.md](./Tasks/EXECUTION-ORDER-ui.md)
- **Companion agent plan (paused, will be regenerated post-batch):** `c:\Users\abhisheksahil\.cursor\plans\clariva-ui-system-redesign_9a557ed2.plan.md`

### Consultation cockpit redesign batch
- **Master batch plan:** [plan-cockpit-redesign-batch.md](./plan-cockpit-redesign-batch.md)
- **Execution order (with parallel-chat lanes):** [Tasks/EXECUTION-ORDER-cockpit.md](./Tasks/EXECUTION-ORDER-cockpit.md)
- **Surface this supersedes:** [Tasks/task-ui-D1-appointment-detail-three-zone.md](./Tasks/task-ui-D1-appointment-detail-three-zone.md)

### Cockpit hardening batch
- **Master plan:** [plan-cockpit-hardening-batch.md](./plan-cockpit-hardening-batch.md)
- **Execution order (with parallel-chat lanes):** [Tasks/EXECUTION-ORDER-cockpit-hardening.md](./Tasks/EXECUTION-ORDER-cockpit-hardening.md)
- **Discovered from:** dev smoke-test screenshots, 2026-05-06.

### Shared
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)
- **Style precedents:** [text-consult batch (28-04-2026)](../../April%202026/28-04-2026/Tasks/) for per-task `.md` format; [EHR batch (03-05-2026)](../03-05-2026/) for batch-level structure.

---

**Created:** 2026-05-06.  
**Status:** `Drafted` — awaiting commit-start.  
**Owner:** TBD.
