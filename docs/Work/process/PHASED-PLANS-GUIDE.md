# Phased plans — folder structure & lifecycle

> **Purpose:** the single source of truth for **how a big plan is broken into phases and laid out on disk.** A product plan says *what* and *why*; [`EXECUTION-ORDER-GUIDELINES.md`](./EXECUTION-ORDER-GUIDELINES.md) says *who-runs-what-when within a batch*. **This doc says where the folders live and how phases of one program stay together — even when they're planned on different days.**
>
> **Audience:** future-me (and any agent) promoting a product plan into dated batches, or adding the next phase to a program that's already in flight.
>
> **Read first if:** you're about to create a new `plan-*-batch.md`, a new `Tasks/` folder, or you're wondering "where does Phase 3 go if Phases 0–2 were planned last week?"

---

## 0. The one rule you must internalise

> **A program is one folder. Every phase of that program is a `p{N}-<slug>/` subfolder inside it. The program folder lives under the date its FIRST phase was planned — and it stays there. Phases planned on later days are added as new subfolders in the ORIGINAL program folder, never under the later day's date.**

That's the whole model. Everything below is a corollary or an example.

Why: a reader who opens `cockpit-v3/` should see the **entire** program — all phases, in order, in one place — regardless of how many calendar days it took to plan them. Scattering Phase 2 under `31-05-2026/` because that's the day you happened to plan it destroys that property and makes the program impossible to follow.

---

## 1. Why we plan big work in phases (the rationale)

Phasing is the default for anything bigger than a ~1-week batch. It is better than one giant batch for concrete reasons:

1. **Each phase ends at a real acceptance gate.** A phase is demoable and mergeable on its own. You always have a green, shippable state — never a half-done 40-task mega-branch.
2. **Value ships early.** Phase 1 of booking-review (reskin) shipped real UI before Phase 2 (workflow) was even planned. The doctor got value on day one.
3. **Decisions compound, they don't re-litigate.** Phase 1 freezes a decision lock (DL-1, DL-2…). Later phases *inherit* it instead of re-deriving — the plan doc is written once, the phases reference it.
4. **Reversibility.** A phase behind a feature flag (e.g. cockpit-v3 `p0-scaffold`) can be abandoned without unwinding the others.
5. **Model/cost discipline.** Each phase is small enough to spec tightly, so most tasks run on Auto/Sonnet, not Opus (see [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](./AGENT-EXECUTION-EFFICIENCY-GUIDE.md)).
6. **Parallelism across programs.** Small phase folders with disjoint surfaces let two programs (cockpit-v3 + booking-review) run the same week without colliding.

### When to phase vs. ship a single batch

| Situation | Shape |
|---|---|
| > ~1 week of work, or ≥ ~10 tasks, or multiple acceptance gates | **Phase it.** Product plan → `p1-`, `p2-`, … subfolders. |
| A program with a frozen decision lock that later work inherits | **Phase it.** Phase 1 carries the lock; later phases reference it. |
| Self-contained, < ~1 week, one acceptance gate | **Single batch.** Flat program folder with a `Tasks/` (no `pN-` subfolders). |

> **Phases live inside the EXECUTION-ORDER as "waves" only when they ship together.** If sub-stages ship and gate independently across days, they are **phases (separate `pN-` folders)**, not waves. If they ship as one batch, they are **waves** inside one exec-order doc (see [`EXECUTION-ORDER-GUIDELINES.md`](./EXECUTION-ORDER-GUIDELINES.md) §0.5).

---

## 2. Canonical folder structure

```
docs/Work/
├── Product plans/
│   └── plan-<program>.md                         ← multi-phase product plan (what + why + phase table)
└── Daily-plans/
    └── <Month YYYY>/
        └── <DD-MM-YYYY>/                          ← the date the program's FIRST phase was planned
            ├── README.md                          ← day index: lists programs touched this day
            └── <program-slug>/                    ← ONE folder per program (no date, no pN prefix)
                ├── README.md                      ← program index: phase table, execute-in-order
                ├── p0-<slug>/                     ← Phase 0
                │   ├── plan-p0-<program>-<slug>-batch.md
                │   └── Tasks/
                │       ├── EXECUTION-ORDER-p0-<program>-<slug>.md
                │       └── task-<prefix>-NN-<slug>.md
                ├── p1-<slug>/                     ← Phase 1
                │   ├── plan-p1-<program>-<slug>-batch.md
                │   └── Tasks/ …
                └── p2-<slug>/                     ← Phase 2 (even if planned on a later day)
                    └── …
```

### Real example (live)

```
30-05-2026/
├── README.md
├── cockpit-v3/                  ← program started 30 May
│   ├── README.md
│   ├── p0-scaffold/             planned 30 May
│   ├── p1-shell/                planned 30 May
│   ├── p2-dnd/                  planned 31 May → still lives here
│   └── p3-platform/             planned 31 May → still lives here
├── cockpit-pane-freedom/
│   ├── p1-tabs/   p2-dnd/   p3-customize/   p4-chrome/
└── receptionist-rearchitecture/     ← program started 30 May (7 phases)
    ├── plan-receptionist-rearchitecture-charter.md   ← vision + DL lock (program-level)
    ├── README.md
    ├── p0-compliance/    rcp-00
    ├── p1-foundation/    rcp-01..02
    ├── p2-stage-router/  rcp-03..08
    ├── p3-channels/      rcp-09..13
    ├── p4-state/         rcp-14..19
    ├── p5-returning-memory/  rcp-20..24
    └── p6-identity/      rcp-25..29

31-05-2026/
├── README.md                    ← links ACROSS to 30-05-2026/cockpit-v3/ for p2–p3
└── booking-review-redesign/     ← program started 31 May
    ├── p1-reskin/   p2-workflow/   p3-depth/
```

Note `cockpit-v3/p2-dnd` and `p3-platform` were **planned on 31 May but live under 30-05-2026** — the day the program started. The `31-05-2026/README.md` points across to them; it does **not** hold them.

---

## 3. Naming conventions (locked)

| Thing | Pattern | Example |
|---|---|---|
| Program folder | `<program-slug>/` (no date, no `p` prefix) | `cockpit-v3/`, `booking-review-redesign/` |
| Phase subfolder | `p{N}-<short-slug>/` — `N` matches the product plan's phase number | `p0-scaffold/`, `p2-dnd/`, `p3-platform/` |
| Batch plan file | `plan-p{N}-<descriptive-batch>-batch.md` | `plan-p2-cockpit-v3-dnd-batch.md` |
| Execution order | `Tasks/EXECUTION-ORDER-p{N}-<descriptive-batch>.md` | `EXECUTION-ORDER-p2-cockpit-v3-dnd.md` |
| Task file | `Tasks/task-<prefix>-NN-<slug>.md` | `task-cv3d-01-tab-drag-sources.md` |
| Program index | `<program-slug>/README.md` | phase table + execute-in-order |
| Day index | `<DD-MM-YYYY>/README.md` | lists programs touched that day |

### Task prefix + numbering

- Each program has a short **task prefix** (`cv3s`, `cv3d`, `cpf`, `brr`, `rcp`…). Pick one per program; keep it stable across phases.
- **Number tasks continuously across phases** for traceability: booking-review was `brr-01..04` (Phase 1), `brr-05..09` (Phase 2), `brr-10..13` (Phase 3). Don't restart at 01 each phase.
- A phase may use its own sub-prefix when the work is genuinely distinct (cockpit-v3 used `cv3s` for scaffold, `cv3c` for core shell, `cv3d` for dnd, `cv3p` for platform). State the prefix in the batch plan's header (“Prefix note”).

### `p{N}-<slug>` — what's the slug?

Short, kebab-case, the *theme* of the phase — not a restatement of the program. `p2-dnd`, not `p2-cockpit-v3-drag-and-drop`. The program name is already the parent folder.

---

## 4. The cross-day rule (the part that's easy to get wrong)

When you sit down on a later day to plan the next phase of an in-flight program:

1. **Find the program's ORIGINAL folder** — under the date its first phase was planned. (`rg "plan-p1-<program>" docs/Work/Daily-plans` finds it fast.)
2. **Create the new phase subfolder there**: `<original-date>/<program>/p{N}-<slug>/`.
3. **Do NOT** create `<program>/` or `p{N}-<slug>/` under today's date.
4. **In today's day-README**, add a one-line pointer across to the program folder (see §5), so the day is still discoverable.
5. **Link phases as siblings**: from `p2-dnd/` to `p1-shell/`, write `../p1-shell/` — they're in the same program folder, so sibling links are short and stable.

> **Litmus test:** open the program folder. If you cannot see *every* phase of that program in it, the structure is wrong — a phase leaked into a date folder. Move it back.

### Exception — a phase that legitimately belongs to a new program

If "the next phase" is really a *new program* (new decision lock, new north star, supersedes the old), it gets its **own** program folder under the day it started — and the old program's plan doc records the hand-off. cockpit-v3 is exactly this: it's a successor to `cockpit-pane-freedom`, so it's a separate program folder, and `plan-cockpit-v3.md` documents that it inherits the model but supersedes the interaction layer.

---

## 5. READMEs (two levels, both required)

**Program README** (`<program>/README.md`) — the phase index. Execute top-to-bottom.

```markdown
# <Program> — daily batches

> **Product plan:** [`plan-<program>.md`](../../../Product%20plans/plan-<program>.md)
> All phases for this program live in this folder. Execute in order.

| Phase | Folder | Batch plan | Execution order |
|---|---|---|---|
| 0 — scaffold | [`p0-scaffold/`](./p0-scaffold/) | [`plan-p0-…`](./p0-scaffold/plan-p0-…-batch.md) | [`EXECUTION-ORDER-p0-…`](./p0-scaffold/Tasks/EXECUTION-ORDER-p0-….md) |
| 1 — shell    | [`p1-shell/`](./p1-shell/)       | …                                              | …                                                                    |
```

**Day README** (`<DD-MM-YYYY>/README.md`) — lists programs touched that day. For a phase planned today whose program started earlier, link **across** rather than nesting:

```markdown
## Plans on this day

| Plan folder | Phases here | Product plan |
|---|---|---|
| [`booking-review-redesign/`](./booking-review-redesign/) | p1 · p2 · p3 | [`plan-booking-review-redesign.md`](../../Product%20plans/plan-booking-review-redesign.md) |

**Cockpit v3** Phases 2–3 (planned today) live under [`../30-05-2026/cockpit-v3/`](../30-05-2026/cockpit-v3/) — same program folder as Phases 0–1.
```

---

## 6. Lifecycle: product plan → phased batches

1. **Draft the product plan** in `Product plans/plan-<program>.md`. It owns the **phase table** (Phase 1 = R-items X,Y; Phase 2 = …), the decision lock, and the north star.
2. **Promote Phase 1** when its R-items are decided: create `<start-date>/<program>/p1-<slug>/` with the batch plan + `Tasks/`. Mark the phase `Committed` in the product plan with a back-link to the batch folder.
3. **Build Phase 1** to its acceptance gate (see [`EXECUTION-ORDER-GUIDELINES.md`](./EXECUTION-ORDER-GUIDELINES.md)). Ship.
4. **Promote Phase 2** — on whatever day you get to it — into the **same** `<program>/` folder as `p2-<slug>/`. Reference Phase 1's decision lock; don't re-derive it.
5. **Repeat** until the program's phases are all shipped. Update the product plan's status to `Shipped` and (if it's a live reference) fold the behaviour into the canonical `Reference/` doc.

The product plan's **"Plan rules"** section must state the promotion path. Use this wording (adjust the program slug):

> *When all Phase 1 R-items have a `Decision:` ticked, this plan promotes to a dated batch under `docs/Work/Daily-plans/<Month>/<date>/<program>/p1-<slug>/plan-p1-<program>-<slug>-batch.md` and becomes `Committed`. **Later phases promote as sibling subfolders under the same `<program>/` plan folder** (the one created on the start date), not under the later day's date.*

---

## 7. Relative-link depth cheat sheet

Because phase folders nest two levels deeper than a flat batch, relative links to shared resources need the right number of `../`. Counts are from the **file's** directory.

| From | To `docs/Work/process/` | To `docs/Work/Product plans/` | To repo `frontend/` |
|---|---|---|---|
| Batch plan file `<program>/p{N}-<slug>/plan-….md` | `../../../../../process/` | `../../../../../Product%20plans/` | `../../../../../../frontend/` |
| Task / exec-order file `…/p{N}-<slug>/Tasks/….md` | `../../../../../../process/` | `../../../../../../Product%20plans/` | `../../../../../../../frontend/` |
| Program README `<program>/README.md` | `../../../../process/` | `../../../../Product%20plans/` | — |

Sibling-phase links are always short: `../p1-shell/`, `../../cockpit-pane-freedom/p2-dnd/` (cross-program, same day).

> **Sanity check before committing:** every relative link must resolve. From the file's directory, `ls <the-relative-path>` should hit the target. Over-deep `../` chains (a link with more `../` than the path has segments) silently 404 in the renderer.

---

## 8. Pre-flight checklist (run before committing a new phase)

- [ ] The phase folder is `p{N}-<slug>/` under the program's **original start-date** folder — not today's date.
- [ ] `N` matches the phase number in the product plan's phase table.
- [ ] Batch plan, exec-order, and task files follow the §3 naming patterns.
- [ ] The batch plan references the prior phase's decision lock (doesn't re-derive it) and links the prior phase as `../p{N-1}-<slug>/`.
- [ ] The program README's phase table has a row for this phase.
- [ ] If this phase was planned on a later day, that day's README links **across** to the program folder.
- [ ] The product plan's phase is marked `Committed` with a back-link to the batch folder.
- [ ] All relative links resolve (§7 sanity check).
- [ ] Task files obey the planning/execution boundary — no code in tasks (see [`TASK_MANAGEMENT_GUIDE.md`](./TASK_MANAGEMENT_GUIDE.md)).

---

## 9. Related docs

- [`TASK_MANAGEMENT_GUIDE.md`](./TASK_MANAGEMENT_GUIDE.md) — task lifecycle, planning/execution boundary, hierarchical task files.
- [`TASK_TEMPLATE.md`](./TASK_TEMPLATE.md) — the per-task file template.
- [`EXECUTION-ORDER-GUIDELINES.md`](./EXECUTION-ORDER-GUIDELINES.md) — waves/lanes **inside** one batch (one phase).
- [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](./AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model selection + cost per task.
- [`CODE_CHANGE_RULES.md`](./CODE_CHANGE_RULES.md) — rules when a task changes existing code.
- Live examples: [`cockpit-v3/`](../Daily-plans/May%202026/30-05-2026/cockpit-v3/README.md), [`booking-review-redesign/`](../Daily-plans/May%202026/31-05-2026/booking-review-redesign/README.md), [`receptionist-rearchitecture/`](../Daily-plans/May%202026/30-05-2026/receptionist-rearchitecture/README.md).

---

**Created:** 2026-05-31.  
**Version:** 1.0.0 — initial structure + cross-day rule.
