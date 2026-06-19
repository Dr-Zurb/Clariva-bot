# Work lifecycle — capture → product plan → daily plan → done

> **Purpose:** the single end-to-end map for how a piece of work moves from a raw idea to shipped code. This doc stitches together the other `process/` guides — it does **not** replace them.
>
> **Audience:** future-me, any agent, anyone triaging `capture/` or promoting a program.
>
> **Read first if:** you're unsure where an idea belongs, when to write a product plan, or how capture relates to Daily-plans.

---

## The one-glance flow

```
┌─────────────┐    triage     ┌──────────────────┐   promote    ┌─────────────────────────────┐
│ 0 · CAPTURE │ ────────────► │ 1 · PRODUCT PLAN │ ──────────► │ 2 · DAILY PLAN (phased)     │
│ capture/    │               │ Product plans/   │  one phase   │ Daily-plans/…/pN-<slug>/   │
└─────────────┘               └──────────────────┘   at a time  └──────────────┬──────────────┘
       ▲                              │                                        │
       │                              │ decision lock                          │ execute
       │                              ▼                                        ▼
       │                     P1–PN phase table                         ┌──────────────────┐
       │                     OBJ-D / ST-D / …                          │ 3 · EXECUTE      │
       │                                                               │ Tasks/ + waves   │
       │                                                               └────────┬─────────┘
       │                                                                        │
       │   archive / fold to Reference                                          ▼
       └──────────────────────────────────────────────────────────  ┌──────────────────┐
                                                                     │ 4 · DONE         │
                                                                     │ verify + ship    │
                                                                     └──────────────────┘
```

**Flow in one line:** `inbox → features/ → product plan → daily plan (one phase) → tasks → verification gate → shipped`.

---

## Stage table

| Stage | Home on disk | Primary artifact(s) | What it owns | Status | Exit condition |
|---|---|---|---|---|---|
| **0 · Capture** | `docs/Work/capture/` | `inbox.md` (transient) · `features/<program>/backlog.md` (durable) · optional deep-dive `.md` | Raw ideas, deferrals, debt, open decisions | `- [ ]` / `- [x]` | Triage: promote · defer · drop |
| **1 · Product plan** | `docs/Work/Product plans/<area>/` | `plan-<program>.md` + folder `README.md` | North star, scope, **decision lock** (`OBJ-D1..`, `ST-D1..`), **P1–PN phase table**, promotion path | `Drafted` → `Committed` → `Shipped` | A phase's R-items decided → promote that phase only |
| **2 · Promote (phased)** | `docs/Work/Daily-plans/<Month>/<DD-MM-YYYY>/<program>/p{N}-<slug>/` | Program `README.md` · `plan-p{N}-…-batch.md` · `Tasks/EXECUTION-ORDER-p{N}-….md` · `task-<prefix>-NN-….md` | When + who-runs-what for **one phase**; inherits prior decision lock | `Committed` (phase) | Batch plan + exec-order + task files exist; links resolve |
| **3 · Execute** | Same `p{N}-` folder | Task files + exec-order waves | Implementation tracking; model picks; agent contract | Task `⏳` → `✅` | All phase tasks complete |
| **4 · Done** | Gate + back-propagation | `DEFINITION_OF_DONE.md` checklist · phase acceptance gate in batch plan | Typecheck · lint · tests · close-gate (byte-parity etc.) | Phase `Shipped` | Gate green; capture `Promoted/done` updated; optional `Reference/` fold-in |

**Status legend** (product plan + phases): `Drafted` / `Committed` / `Shipped` / `Deferred` / `Killed`.

---

## Stage 0 — Capture

**Trigger:** an idea, bug, deferral, or "we should do this later" while building.

| Action | Where | Example |
|---|---|---|
| Fast drop | `capture/inbox.md` | `- [ ] BMI trend chart — cpv follow-up` |
| Longer dump | `capture/notes/YYYY-MM-DD-<slug>.md` or `capture/TEMPLATE.md` | Cross-cutting brainstorm |
| Program parking lot | `capture/features/<program>/backlog.md` | Deferred objective-tab items after triage |
| Deep dive (optional) | `capture/features/<program>/<topic>.md` | `exam-catalog.md`, `section-catalog.md` |

**Sections in every feature backlog:**

- **Decisions needed** — GO/NO-GO before building
- **Future features** — intentional deferrals
- **Debt / hardening** — polish, bugs, perf
- **Promoted / done** — moved to Daily-plans or closed

**Triage (weekly or before a sprint):** for each inbox item → **Promote** (Daily-plans / issue / Taskmaster) · **Defer** (`features/`) · **Drop**. See [`../capture/README.md`](../capture/README.md).

**Exit:** item is either promoted to Stage 1/2 or parked in `features/` with enough context to promote later.

---

## Stage 1 — Product plan

**Trigger:** the work is bigger than a ~1-week batch, has multiple acceptance gates, or needs a **decision lock** that later phases inherit.

| Artifact | Path pattern | Contents |
|---|---|---|
| Product plan | `Product plans/<area>/plan-<program>.md` | Why · scope (own vs link) · field inventory · **decision lock table** · data model sketch · **P1–PN phase table** · plan rules |
| Area index | `Product plans/<area>/README.md` | Read-order · file index |

**Rules:**

- The phase table lists **all phases** at a high level; only **one phase promotes at a time** ([`PHASED-PLANS-GUIDE.md`](./PHASED-PLANS-GUIDE.md) §6).
- Decision IDs are stable (`OBJ-D1`, `ST-D1`, `E1`…) — later phases **reference**, never re-litigate.
- Deep ideation can stay in `capture/features/`; the product plan **summarises and locks** what ships.

**Exit:** phase N's scope and decisions are ticked → promote to Stage 2 as `p{N}-<slug>/`.

**Litmus — need a product plan?** See [`IMPLEMENTATION-TRIAGE-PROMPT.md`](./IMPLEMENTATION-TRIAGE-PROMPT.md): if a smart junior couldn't finish it in one sitting from one paragraph → **System T** (this path).

---

## Stage 2 — Promote (phased daily plan)

**Trigger:** a phase in the product plan is ready to build.

### Folder shape (locked)

```
docs/Work/Daily-plans/
└── <Month YYYY>/
    └── <DD-MM-YYYY>/              ← date the program's FIRST phase was planned
        ├── README.md              ← day index
        └── <program-slug>/        ← ONE folder per program (no date, no pN prefix)
            ├── README.md          ← phase table; execute top-to-bottom
            ├── p1-<slug>/
            │   ├── plan-p1-<program>-<slug>-batch.md
            │   └── Tasks/
            │       ├── EXECUTION-ORDER-p1-<program>-<slug>.md
            │       └── task-<prefix>-NN-<slug>.md
            ├── p2-<slug>/         ← later phases HERE, even if planned on a later day
            └── …
```

**The cross-day rule:** when planning phase 2+ on a later calendar day, add `p{N}-<slug>/` under the **original** program folder — not under today's date. The later day's `README.md` links across. Full rules: [`PHASED-PLANS-GUIDE.md`](./PHASED-PLANS-GUIDE.md) §0–§4.

### What each promoted file does

| File | Owns |
|---|---|
| `plan-p{N}-…-batch.md` | Phase scope · decision lock for this phase · acceptance gate · task table |
| `EXECUTION-ORDER-p{N}-….md` | Waves/lanes · model picks · pre-load list |
| `task-<prefix>-NN-….md` | Per-task breakdown ([`TASK_TEMPLATE.md`](./TASK_TEMPLATE.md)) — **planning only, no code** |

**Task prefix:** one per program (`subj`, `obj`, `cv3s`, `brr`…), numbered **continuously across phases** (`subj-01..31`, `obj-01..04` then `obj-05..` in P2).

**Pre-flight:** [`PHASED-PLANS-GUIDE.md`](./PHASED-PLANS-GUIDE.md) §8 checklist before committing a new phase.

**Exit:** phase folder complete; product plan phase row marked `Committed` with back-link.

---

## Stage 3 — Execute

**Trigger:** a committed phase; pick the first wave from the exec-order.

| Concern | Guide |
|---|---|
| Wave/lane ordering | [`EXECUTION-ORDER-GUIDELINES.md`](./EXECUTION-ORDER-GUIDELINES.md) |
| Model selection (Opus gates) | [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](./AGENT-EXECUTION-EFFICIENCY-GUIDE.md) |
| Task lifecycle + completion dates | [`TASK_MANAGEMENT_GUIDE.md`](./TASK_MANAGEMENT_GUIDE.md) |
| Changing existing code | [`CODE_CHANGE_RULES.md`](./CODE_CHANGE_RULES.md) |
| Agent hard rules (Zod, no try-catch in controllers, migrations…) | `.cursor/rules/00-agent-contract.mdc` |

**Execution order within a phase (typical):**

1. **Keystone task** — schema + shared state + derived-text contract (often Opus if migration).
2. **Parallel lanes** — registry, UI, wiring on disjoint surfaces.
3. **Close-gate task** — byte-parity / PDF / verification (often Opus for output fixtures).

**Task file rules:** describe **what** + acceptance criteria; **no code** in task files ([`TASK_MANAGEMENT_GUIDE.md`](./TASK_MANAGEMENT_GUIDE.md) §Planning vs Execution Boundary).

**Exit:** every task in the phase is `✅` with completion dates.

---

## Stage 4 — Done

**Trigger:** all phase tasks complete.

1. Run the phase **cross-cutting acceptance gate** (in the batch plan).
2. Run **verification gate:** typecheck + lint + tests ([`DEFINITION_OF_DONE.md`](../../Reference/engineering/development/DEFINITION_OF_DONE.md)).
3. Mark phase `Shipped` in program `README.md` and product plan phase table.
4. Move promoted items to `capture/features/<program>/backlog.md` → **Promoted / done**.
5. If behaviour is now canonical, fold into [`Reference/`](../../Reference/README.md) (Doc Drift Guard).

**Close-gate examples:** subjective `subj-10` (`cc`/`hopi` byte-parity); objective `obj-04` (`examination_findings` byte-parity).

---

## Decision points (stop and decide)

| Gate | Question | If yes → |
|---|---|---|
| **Triage** | Is this > ~1 week, ≥ ~10 tasks, or multiple acceptance gates? | Product plan (Stage 1), not just inbox |
| **Promotion** | Are this phase's decisions locked in the product plan? | Promote **this phase only** to Daily-plans |
| **Direct vs System T** | Could a junior finish in one sitting from one paragraph? | See [`IMPLEMENTATION-TRIAGE-PROMPT.md`](./IMPLEMENTATION-TRIAGE-PROMPT.md) |
| **Agent escalation** | Migration · PHI columns · RLS · payments · 5+ file refactor? | Flag Opus / human review per agent contract |

---

## Worked example — Objective tab (2026-06-18)

End-to-end trace of a program that followed this path:

| Stage | What happened | Path |
|---|---|---|
| **0 · Capture** | Ideation: exam catalog, vitals 2.0, specialty packs, phasing | [`capture/features/objective-tab/exam-catalog.md`](../capture/features/objective-tab/exam-catalog.md) · [`backlog.md`](../capture/features/objective-tab/backlog.md) |
| **1 · Product plan** | Locked C3 hybrid (`OBJ-D1..D7`), P1–P6 phase table; P1 only committed | [`Product plans/ehr/objective-tab/plan-objective-tab.md`](../Product%20plans/ehr/objective-tab/plan-objective-tab.md) |
| **2 · Promote** | Phase 1 only: structured exam cards + derived `examination_findings` | [`Daily-plans/June 2026/18-06-2026/objective-tab/p1-structured-exam/`](../Daily-plans/June%202026/18-06-2026/objective-tab/p1-structured-exam/) |
| **3 · Execute** | `obj-01` keystone (migration 150 + derivation) → `obj-02` registry → `obj-03` UI → `obj-04` close-gate | [`Tasks/EXECUTION-ORDER-p1-objective-tab-structured-exam.md`](../Daily-plans/June%202026/18-06-2026/objective-tab/p1-structured-exam/Tasks/EXECUTION-ORDER-p1-objective-tab-structured-exam.md) |
| **4 · Done** | _(pending build)_ — gate: legacy `examination_findings` byte-identical; phase → `Shipped`; backlog → Promoted/done | batch plan acceptance gate |

**Sibling precedent:** Subjective tab — same path, started 2026-06-03: [`capture/features/subjective-tab/`](../capture/features/subjective-tab/) → [`plan-subjective-tab.md`](../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) → [`03-06-2026/subjective-tab/`](../Daily-plans/June%202026/03-06-2026/subjective-tab/) (phases p1–p12).

---

## Where things live (quick lookup)

| I have… | Put it in… |
|---|---|
| A one-line idea | `capture/inbox.md` |
| Deferred work for a program | `capture/features/<program>/backlog.md` |
| Multi-phase roadmap + decisions | `Product plans/<area>/plan-<program>.md` |
| Tasks for this week's build | `Daily-plans/…/<program>/p{N}-<slug>/Tasks/` |
| How to plan (deep rules) | `process/` guides (this folder) |
| Shipped canonical behaviour | `Reference/` |

---

## Related docs (read depth on demand)

| Doc | When to open |
|---|---|
| **[WORKFLOW.md](./WORKFLOW.md)** (this file) | End-to-end path; where does this idea go? |
| [PHASED-PLANS-GUIDE.md](./PHASED-PLANS-GUIDE.md) | Folder structure, cross-day rule, naming, pre-flight |
| [TASK_MANAGEMENT_GUIDE.md](./TASK_MANAGEMENT_GUIDE.md) | Task lifecycle, planning/execution boundary |
| [TASK_TEMPLATE.md](./TASK_TEMPLATE.md) | Copy-paste task file skeleton |
| [EXECUTION-ORDER-GUIDELINES.md](./EXECUTION-ORDER-GUIDELINES.md) | Waves/lanes inside one phase |
| [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](./AGENT-EXECUTION-EFFICIENCY-GUIDE.md) | Model picks, Opus caps |
| [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md) | Auditing and changing existing code |
| [IMPLEMENTATION-TRIAGE-PROMPT.md](./IMPLEMENTATION-TRIAGE-PROMPT.md) | Direct in chat vs System T |
| [../capture/README.md](../capture/README.md) | Capture conventions + feature parking lots |
| [../README.md](../README.md) | `Work/` tree overview |

---

**Created:** 2026-06-18.  
**Version:** 1.0.0 — initial lifecycle map + objective-tab worked example.
