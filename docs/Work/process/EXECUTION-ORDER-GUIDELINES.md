# EXECUTION-ORDER guidelines

> **Purpose:** a single source of truth for *how to write* an `EXECUTION-ORDER-<batch>.md` doc. The plan file says *what* and *why*. The execution-order file says **who-runs-what-when**, **what's safe to parallelise**, and **which model**. These guidelines lock down the notation so every batch doc reads the same way — and so we never repeat the `ppr` Wave 2 bug (a "Lane α" that secretly depended on Lane β).
>
> **Audience:** future-me (and any teammate / agent) sitting down to plan a fresh batch.
>
> **Scope:** this doc governs the **waves and lanes inside ONE batch** (= one phase of a program). The folder structure that holds batches — one program folder, `p{N}-<slug>/` per phase, the cross-day rule — is owned by [`PHASED-PLANS-GUIDE.md`](./PHASED-PLANS-GUIDE.md). Read that first if you're creating the phase folder; read this once you're writing its exec-order doc.
>
> **Phases vs. waves:** if sub-stages ship and gate on **different days**, they're **phases** (separate `p{N}-` folders, separate exec-order docs). If they ship together as **one batch**, they're **waves** inside this one doc (§0.5). Don't put multi-day phases into a single exec-order's waves.
>
> **Reference precedents:**
> - [`Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild/Tasks/EXECUTION-ORDER-patient-profile-shell-rebuild.md`](../Daily-plans/May%202026/13-05-2026/patient-profile-shell-rebuild/Tasks/EXECUTION-ORDER-patient-profile-shell-rebuild.md)
> - [`Daily-plans/May 2026/10-05-2026/cockpit-customization/Tasks/EXECUTION-ORDER-cockpit-customization.md`](../Daily-plans/May%202026/10-05-2026/cockpit-customization/Tasks/EXECUTION-ORDER-cockpit-customization.md)
> - Phased example: [`Daily-plans/May 2026/30-05-2026/cockpit-v3/p2-dnd/Tasks/EXECUTION-ORDER-p2-cockpit-v3-dnd.md`](../Daily-plans/May%202026/30-05-2026/cockpit-v3/p2-dnd/Tasks/EXECUTION-ORDER-p2-cockpit-v3-dnd.md)
> - [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](./AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.

---

## 0. The one rule you must internalise

> **A lane is a strictly sequential chain. Multiple lanes exist only when their tasks are fully independent of each other for the entire wave. If a downstream task needs outputs from ≥ 2 lanes, the lanes were never independent — collapse them or push the downstream task to the next wave.**

Read that again. Every other rule in this file is a corollary.

Why the strictness? We tried softer rules. In `ppr` Wave 2, the doc said "Lane α: ppr-04 → ppr-07" and "Lane β: ppr-05 → ppr-06" — visually implying that, after `ppr-04`, you could run `ppr-07` (Lane α step 1) and `ppr-05`+`ppr-06` (Lane β) in parallel chats. **You can't.** `ppr-07` consumes the outputs of both `ppr-05` and `ppr-06`. Running them in parallel meant `ppr-07` started without its full inputs. That's the bug we're banning.

---

## 0.5. How to cut waves

A **wave = one acceptance gate**. The gate must be binary (5–8 checkbox list), demo-able in ~5 minutes, and mergeable as one PR (or one feature branch). If you can't write the gate as checkboxes, the wave is wrong — either too big (split it) or too small (collapse it into a neighbour).

### The four cuts

Every wave boundary in a well-planned batch is one of these. Walk left-to-right through your dependency DAG and put a cut every time you hit one.

**Cut 1 — Dependency cliff.** A task lands a new primitive (type, state shape, hook, migration, route) that everything downstream needs. Stop and gate before the downstream pile starts.
- `cockpit-customization` Wave 3 ends after `cc-04` (slot-state primitive).
- `ppr` Wave 1 ends after `ppr-03` (the new shell + `PaneDefinition`).
- `cockpit-customization` Wave 4 starts with `cc-08` (the migration) as the sync point that unlocks the rest of the wave.

**Cut 2 — Artifact change.** The thing you can show the user changes qualitatively. "Now we have…" different.
- `ppr` Wave 1 → 2: shell with synthetic `<div>` panes → shell with real medical content.
- `ppr` Wave 2 → 3: parity at `ready` state → parity across all states + presets + hotkeys + walk-in.

**Cut 3 — Kind-of-work change.** Build vs QA vs Flip vs Delete are always different waves. The reviewer's mindset shifts; the failure mode shifts.
- `ppr` Wave 4 = pure manual QA matrix (`ppr-11`).
- `ppr` Wave 5 = destructive flip + delete (`ppr-12..14`).

**Cut 4 — Wall-clock pause.** Anywhere you wait for prod soak or a teammate, the pause is itself a wave boundary.
- `ppr` Wave 5 contains `[ release window ~1 week ]` between `ppr-12` and `ppr-13..14`.

### Standard 1-week batch shape

After cutting, you usually land in 3–5 waves with this rhythm:

| Wave | Role | Typical mix | Gate flavour |
|---|---|---|---|
| 1 — **Scaffold** | Unlock everything else | 1 Opus (the primitive) + 1–2 Sonnet (types, route, ESLint zone) | "Empty surface renders. No content yet." |
| 2 — **Build core** | Land the visible artifact | 3–5 Sonnet | "Surface renders real content. Happy path indistinguishable from old." |
| 3 — **Wire variants** | State, persistence, edge cases | 2–4 Sonnet | "All variants/presets/hotkeys/edge states work." |
| 4 — **QA / parity** | Verify, don't build | 1 Sonnet (manual matrix) | "Parity matrix all green." |
| 5 — **Flip / delete** | Cut over, remove the old | 1–3 Sonnet/Composer + a release-window pause | "Old code is gone. `rg \"OldName\"` returns zero." |

Smaller batches collapse adjacent rows (e.g., a polish batch with no QA wave folds verification into the flip wave's gate).

### Sizing sanity-check

- **3–5 waves** for a 1-week (~14-task) batch — the `cockpit-customization` and `ppr` size.
- **2–3 waves** for a half-week (~6-task) batch.
- **1 wave** is legal for a single-cosmetic-fix batch (e.g., a one-task PR).
- **> 6 waves** = cutting too finely. Collapse adjacent waves whose gates share a reviewer mindset.
- **< 3 waves on a 1-week batch** = a wave is hiding multiple gates. Split it.

---

## 1. Vocabulary

Pin these terms before drawing anything.

| Term | Meaning | Concrete picture |
|---|---|---|
| **Wave** | A phase group: one acceptance gate, one logical milestone. Everything in a wave must be merged (or at least green) before the next wave starts. | "Wave 3 — Slot-state and reorder" |
| **Lane** | A **strictly sequential chain of tasks**, executed top-to-bottom by **one chat in one git worktree**. Every step in a lane waits on the previous step in the same lane. A lane runs to completion in isolation — it never reads in-flight work from another lane during this wave. | `Lane α: cc-04 → cc-05 → cc-06 → cc-07` |
| **Step** | A single task inside a lane. Step N+1 starts when step N is **done and merged (or at least green)**. | `0 → 1 → 2 → 3` within Lane α |
| **Parallel lanes** | Two (or more) lanes whose tasks are **fully independent for the duration of the wave**. They touch disjoint files, share no in-flight state, and neither lane consumes the other's output until the wave ends. | Lane α = backend migration + service, Lane β = unrelated frontend hook — they only see each other again at the next wave's gate. |
| **Sync point** | A task that *gates the start* of another lane. Always rendered as the **last step of one lane** (not the first step of another), and the other lane writes `(waits on <task-id>) ──>` at its entry. | After the sync ships, the downstream lane unlocks. |
| **Convergence task** | A task that consumes outputs from ≥ 2 lanes. **A convergence task does NOT live inside any lane that fed it.** Two acceptable placements: (a) push it to the **next wave**, where it sits in a fresh single lane; (b) make it the **only step** of a new lane in this wave that explicitly `(waits on Lane α + Lane β) ──>`. Prefer (a). | `ppr-07` consumes `ppr-04`, `ppr-05`, `ppr-06` → push to Wave 2.5 or run as Lane γ waiting on both. |
| **Release window** | A wall-clock pause (not an agent task). Used between "flip the default" and "delete the old code". | "⏸ ~1 week of prod use" in `ppr` Wave 5 |

**The lane rule, restated as a test:**
> Before you draw Lane β, finish this sentence: "I could open Lane β in a separate chat **today**, ignore Lane α completely, and ship Lane β to a feature branch by the end of the wave without ever opening Lane α's PR." If you can't, Lane β doesn't exist — it's just later steps of Lane α.

---

## 2. Standard symbol set (ASCII)

Use exactly these glyphs. Do not invent new ones; consistency is more valuable than expressiveness.

| Glyph | Meaning |
|---|---|
| `──> ` | Sequential edge inside a lane. Read left-to-right. The task on the right starts *after* the one on the left is **done and merged (or at least green)**. |
| `Lane α / β / γ ──── X` | Lane introducer. Greek letters keep them short and unambiguous. Always assign Greek letters in order (α first, then β, then γ…). |
| `(waits on <task-id>) ──>` | A lane's **entry condition**. Drawn as the lane's first element when the lane cannot start until another lane's task ships. Used only when the two lanes are otherwise independent for the rest of the wave. |
| `[ release window ~1 week ]` | Wall-clock pause. Stands alone on its own line. |
| `⏸` | Optional emoji for the pause row to make it scan-pop in long files. |
| `**bold**` | Reserved for **the single highest-cost task in the wave** (typically the Opus task). Bold appears in the wave plan AND in the per-task model table. |

**Forbidden:**
- Any glyph that implies a task "merges" from multiple lanes (`╲╱`, `(merges X + Y → Z)`, etc.). If it merges, it's either a convergence task in a new wave or its own waiting lane — see §1 / §3.
- ASCII boxes (`┌─┐ │ └─┘`) — they break in markdown renderers.
- Custom Unicode arrows (`⇒`, `⟶`, `↦`) — pick `──> ` and stick with it.
- "After step N" prose without an arrow. Always show the relationship visually first; prose second.

---

## 3. The canonical wave block

Every wave is **one of three shapes** — no fourth shape is allowed. If your wave doesn't fit, you've planned the waves wrong; re-cut them.

### Shape A — Single sequential lane (the default)

```
Wave N (<theme> — ~<wall-clock>, single lane sequential):
  Lane α  ──── <id-1> (<size>, <model>) ──> <id-2> (<size>, <model>) ──> <id-3> (<size>, <model>)
```

Use when: any pair of tasks in the wave has a dependency, OR the tasks share enough context that one chat is more efficient. **This is the default.** Don't add lanes for the aesthetic of parallelism.

### Shape B — Parallel independent lanes

```
Wave N (<theme> — ~<wall-clock>, <K> parallel lanes — fully independent):
  Lane α  ──── <id-1α> (<size>, <model>) ──> <id-2α> (<size>, <model>)              [<scope tag, e.g. backend>]
  Lane β  ──── <id-1β> (<size>, <model>) ──> <id-2β> (<size>, <model>)              [<scope tag, e.g. frontend>]
```

Use when: lanes pass the §1 lane test (could ship independently today). Typical example: a backend migration + service stack vs an unrelated frontend hook.

**Optional sync-point variant** — when Lane β can't start until one specific task in Lane α ships, but everything after that sync point is still independent:

```
Wave N (<theme> — ~<wall-clock>, <K> parallel lanes after <sync-task-id>):
  Lane α  ──── <sync-task-id> (<size>, <model>) ──> <id-2α> (<size>, <model>)        [<scope tag>]
  Lane β  ──── (waits on <sync-task-id>) ──> <id-1β> (<size>, <model>) ──> <id-2β> (<size>, <model>)   [<scope tag>]
```

Important: **once `(waits on …) ──>` is satisfied, Lane β never looks at Lane α again for the rest of the wave.** If it does, that's Shape C in disguise — go to Shape A.

### Shape C — Sequential, with mid-wave fan-out (rare; usually a sign you need to re-cut waves)

```
Wave N (<theme> — ~<wall-clock>, sequential prelude → <K> parallel lanes):
  Lane α  ──── <prelude-task-id> (<size>, <model>)
  Lane α  ──── (continues) ──> <id-2α> (<size>, <model>) ──> <id-3α> (<size>, <model>)     [<scope tag>]
  Lane β  ──── (waits on <prelude-task-id>) ──> <id-1β> (<size>, <model>)                  [<scope tag>]
```

Use only when there is genuinely one bottleneck task that unlocks ≥ 2 independent lines, AND those lines never need to converge inside this wave. If they do converge, **stop**: split the wave at the convergence point.

> **The forbidden fourth shape:** a "merge row" or a "Lane α task that consumes Lane β". If you're tempted to draw one, do this instead:
>   - Push the convergence task to a new wave (Wave N+1 in Shape A), or
>   - Make the convergence task the **only step** of a new Lane γ in this wave that `(waits on Lane α + Lane β) ──>`. Use this only when the timeline genuinely demands it.
>   - In doubt → **collapse to Shape A.**

---

## 4. Worked examples (canon)

### Example 1 — fixing `ppr` Wave 2 (the bug we're banning)

**Wrong (current `ppr` doc):**

```
Wave 2 (Content panes — ~5h, 2 parallel lanes after ppr-04):
  Lane α  ──── ppr-04 (M, Sonnet) ──> ppr-07 (S, Sonnet)
  Lane β  ──── (waits on ppr-04) ──> ppr-05 (S, Sonnet) ──> ppr-06 (XS, Sonnet)
```

Why wrong: `ppr-07` needs `ppr-04` + `ppr-05` + `ppr-06`. The doc visually invites the agent to run `ppr-07` in parallel with `ppr-05` + `ppr-06` (it's "step 1 of Lane α"). The lanes were never independent — Lane α step 1 depends on Lane β's outputs.

**Right (Shape A — single sequential lane):**

```
Wave 2 (Content panes — ~5h, single lane sequential):
  Lane α  ──── ppr-04 (M, Sonnet) ──> ppr-05 (S, Sonnet) ──> ppr-06 (XS, Sonnet) ──> ppr-07 (S, Sonnet)
```

If the wall-clock matters and you genuinely want Lane β to run in parallel, the alternative is to split:

**Right (Shape A across two waves):**

```
Wave 2a (Pane extractions — ~3h, single lane sequential):
  Lane α  ──── ppr-04 (M, Sonnet) ──> ppr-05 (S, Sonnet) ──> ppr-06 (XS, Sonnet)

Wave 2b (Wire panes — ~2h, single lane sequential):
  Lane α  ──── ppr-07 (S, Sonnet)
```

Either is correct. The two-wave split is mechanically equivalent to the single-lane version since `ppr-07` has to wait anyway.

### Example 2 — fixing `cockpit-customization` Wave 4 (legitimate Shape B with sync point)

**Right (Shape B with sync point — already correct in the existing doc):**

```
Wave 4 (Phase D — ~6h, 2 parallel lanes after cc-08):
  Lane α  ──── cc-08 (XS, Sonnet) ──> cc-09 (S, Sonnet)              [backend]
  Lane β  ──── (waits on cc-08) ──> cc-10 (M, Sonnet) ──> cc-11 (XS, Sonnet)  [frontend]
```

This is OK because: after `cc-08` (the migration), Lane α (backend service) and Lane β (frontend hook) touch disjoint files, share no in-flight state, and neither consumes the other's output for the rest of the wave. The convergence happens at the wave's acceptance gate, not inside the wave.

### Example 3 — sequential default

```
Wave 1 (Foundation — ~6h, single lane sequential):
  Lane α  ──── ppr-01 (XS, Sonnet) ──> ppr-02 (S, Sonnet) ──> ppr-03 (L, Opus)
```

Three tasks, each depends on the previous. One lane. Boring. Correct.

### Example 4 — Reading the sync-point variant (timeline view)

Take a Shape B wave with a sync point:

```
Wave N (~3h, 2 parallel lanes after task-1):
  Lane α  ──── task-1 (S, Sonnet) ──> task-2 (M, Sonnet) ──> task-3 (S, Sonnet)
  Lane β  ──── (waits on task-1) ──> task-4 (M, Sonnet) ──> task-5 (S, Sonnet)
```

Read this as an executor:

| Time | Chat 1 (Lane α) | Chat 2 (Lane β) |
|---|---|---|
| t=0 | Open chat. Start `task-1`. | Not yet opened — locked on `task-1`. |
| t=1 (`task-1` green) | Continue with `task-2`. | **Now** open chat. Start `task-4`. |
| t=2 (`task-2` + `task-4` green) | Continue with `task-3`. | Continue with `task-5`. |
| t=3 (`task-3` + `task-5` green) | Done with the wave. | Done with the wave. |
| t=4 | Run the Wave N acceptance gate. All green → next wave. |

Key rules:

- **`task-4` cannot start before `task-1` is green.** That's what `(waits on task-1) ──>` means.
- **After `task-1` ships, Chat 2 never reads Chat 1's WIP.** If Chat 2 would need to look at `task-2` or `task-3`'s output mid-wave, the lanes weren't truly independent — use Shape A instead.
- **Lane α's first task doubles as the sync point.** You're not running the sync separately and then opening two lanes; you're running Lane α normally, and Lane β just has a delayed start.

Concrete batch example: `cockpit-customization` Wave 4 — `cc-08` (migration) is the sync point. Chat 1 ships `cc-08` then continues with `cc-09` (backend service). The moment `cc-08` is green, Chat 2 opens and starts `cc-10` (frontend hook) against the now-locked migration shape. Chat 1 and Chat 2 then run in parallel until both reach their lane's end.

---

## 5. The "is this a lane?" gate (apply in order — first NO collapses)

When you're tempted to add Lane β:

1. **Can it run in a separate chat today, with zero peeking at Lane α?** If no, it's later steps of Lane α.
2. **Are its files disjoint from Lane α's files?** Or is the overlap a single low-churn surface (e.g., one routes file)?
3. **Does it consume any output from Lane α during this wave?** If yes, it's not a lane. Push it to the next wave (and write it as Shape A there) or fold into Lane α.
4. **Does Lane α consume any output from Lane β during this wave?** Symmetric check. Same answer.
5. **Will any task in this wave ever consume outputs from both lanes?** If yes, that task is the problem — push it to the next wave OR make it its own waiting Lane γ. Don't paper over it.
6. **Is each lane's wall-clock ≥ 1 hour?** Below an hour, the context-switch tax wipes out the parallelism win.

If all six are green, you have a real Lane β. Otherwise, fall back to Shape A.

---

## 6. Marking prerequisite relationships

Every dependency must be visible in **two** places:

1. **In the ASCII wave plan.** Use `──> ` for same-lane dependencies and `(waits on <id>) ──>` for cross-lane entry conditions. **No glyph for mid-wave cross-lane dependencies** — if you need one, the lanes are wrong (§5).
2. **In the per-task table's `Pre-load` or `Notes` column.** Prose form. Example: "Waits on Lane α / cc-08 (so the migration shape and JSONB row schema are locked)."

Same-lane sequential dependencies (step N → step N+1) are **implicit in the table's row order**. Don't repeat them in prose.

---

## 7. Sequential vs parallel — bias hard toward sequential

Default to **Shape A (single sequential lane)** unless ALL of the following are true:

- [ ] §5 gate is all green for every parallel lane.
- [ ] No task in this wave consumes outputs from > 1 lane.
- [ ] Each lane's wall-clock is ≥ 1 hour.
- [ ] You can name the scope tag for each lane in one word (`[backend]`, `[frontend]`, `[docs]`, `[migrations]`). If you struggle to label them, the split is artificial.

**Bias toward sequential for:**

- Structural refactors (`cc-04`, `ppr-03`) — the blast radius makes parallelism dangerous.
- Migration + service tasks in the same backend area — let one chat own the schema until the migration is reviewed.
- The first wave of any batch — get a stable scaffold first; fan out later.
- Any wave where you sketched the lanes and immediately needed a convergence task.

**Bias toward parallel for:**

- Backend / frontend splits after a stable contract (migration + types) is in place.
- Two truly independent feature renderers behind a refactor — and only if each renderer can ship without seeing the other.
- QA / docs lanes that consume the implementation lane's output but don't feed back into the same wave.

---

## 8. Inline model-pick annotation

The inline annotation in the ASCII block is `(size, model)`. Use these abbreviations exactly:

| Size | Means |
|---|---|
| XS | < 30 LOC change, single file, 1 turn |
| S | ~50–150 LOC, 1–2 files, 1–3 turns |
| M | ~150–400 LOC, ≥ 2 files, 3–6 turns |
| L | ≥ 400 LOC or 5+ files or new primitive, ≥ 5 turns |

| Model | Means |
|---|---|
| Composer | Trivial edits, doc updates, type-only fixes |
| Sonnet | Default — well-spec'd tasks with a numbered Steps list |
| Codex | Sonnet alternative for pure code-gen — try when Sonnet feels off |
| Opus | Reserved for L-size structural tasks, security/PHI, multi-file refactors, close-gate reviews |

> **Names are model _families_, not versions** (Composer / Sonnet / Codex / Opus, plus the **Auto** router) so this shorthand doesn't go stale. In practice "Sonnet" in an annotation means "run it on **Auto**"; pick a specific version only when you need to know which model ran. Current versions, rates, and the full model strategy live in [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](./AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

**Caps:** at most **one** Opus task per wave, at most **two** Opus tasks per batch. If you find yourself penciling in three, the spec is not tight enough — go back to the plan file and break Opus tasks into S/M pieces with explicit interfaces.

---

## 9. Required sections in every EXECUTION-ORDER file

In this order:

1. **Title + plan back-link** — `> Sibling document of [plan-…-batch.md](…). The plan covers what and why; this doc covers who-runs-what-when and which model.`
2. **Cost-aware model strategy link** — `**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](…)`
3. **Wave plan (the ASCII block)** — every wave in one of the three shapes from §3, inside a single fenced ``` ``` code block at the top so it scans on first read.
4. **Total wall-clock and total agent-time** — two lines below the ASCII block.
5. **Bottleneck call-out** — one sentence: "The bottleneck is Wave N — single-lane sequential because …". Helps the next reader know where to invest.
6. **Lane-by-lane details** — one `###` heading per wave, with a per-task table (Step, Task, Size, Model, Pre-load, Notes). Tasks that the agent should pre-load go in **Pre-load** — this is how you keep the Opus chat short.
7. **Per-task model picks** — single table covering every task with `Size | Recommended model | Why`. Mirrors the inline `(size, model)` annotations in §3.
8. **Acceptance gates per wave** — one bulleted checklist per wave. These are the binary gates the human reviewer runs.
9. **Cost estimate** — table: `Wave | Tasks | Sonnet chats | Opus chats | Wall-clock`.
10. **References** — back-link to the plan, sibling exec-order docs from the previous day, and any cross-day task files referenced.

If a section feels overkill for a 3-task batch, **keep the heading and write a 1-line "N/A"** rather than deleting it. The shape of the doc must be the same every time.

---

## 10. Acceptance gates — non-negotiable shape

Every wave ends with an acceptance gate. Acceptance gates must be:

- **Binary** — every line is a checkbox. No "mostly works".
- **Mechanically checkable** — `pnpm tsc --noEmit clean`, `rg "OldName" frontend/ returns zero results`, etc. Avoid "feels right".
- **Visual smoke at most once per wave** — "open `/dashboard/appointments/[id]` and confirm…". Use sparingly; reviewers skip walls of UI checks.
- **Stacked** — Wave N gate must include "All Wave N-1 gates still green." It's how regressions surface immediately.

---

## 11. Authoring workflow (the order you actually do these in)

Lock the plan file first (`plan-<batch>.md`), then:

1. Number the tasks (`task-<prefix>-NN-…`).
2. Draw a **dependency DAG on paper** — every task and every prereq edge.
3. Cut the DAG into waves at the natural acceptance gates (usually 3–5 waves for a 1-week batch).
4. **Inside each wave, default every task into Lane α (sequential).** Only then ask whether any subset can be lifted into Lane β per §5.
5. **For every convergence task (a task with ≥ 2 prereqs from different sources), check: does it stay inside one lane?** If not, split the wave at that task.
6. Fill in the ASCII wave block (§3). Use only Shape A / B / C.
7. Walk the wave block back through the plan file's acceptance criteria — every gate item must be reachable from some task in some wave.
8. Fill in the per-task table, per-task model picks, acceptance gates, cost estimate.
9. **Run the validation checklist (§12).** Do not commit the doc until every box is ticked.

---

## 12. Validation checklist (run before committing the doc)

- [ ] Every task in the batch appears in exactly one wave block AND in the per-task model table.
- [ ] Every lane in every wave passes the §5 lane gate (all six points green).
- [ ] **No task in any wave consumes outputs from more than one lane in the same wave.** (The fix for the `ppr` Wave 2 bug.)
- [ ] Every cross-lane sync point appears as `(waits on <id>) ──>` at the receiving lane's entry, AND in a `Pre-load`/`Notes` cell.
- [ ] Every wave uses Shape A, B, or C from §3. No invented shapes.
- [ ] At most one Opus task per wave; at most two per batch.
- [ ] Every wave has an acceptance gate with checkboxes; Wave N gate includes "All Wave N-1 gates still green."
- [ ] Total wall-clock matches the wave headers' wall-clocks summed (with parallelism credit where Shape B is used).
- [ ] Total agent-time (sequential equivalent) is also stated.
- [ ] Bottleneck wave is called out in one sentence.
- [ ] References block links the plan file, the model-strategy guide, and at least one sibling exec-order from the prior day.

---

## 13. Copy-paste skeleton

> **Path depths assume the phased structure** — this exec-order file sits at `…/<program>/p{N}-<slug>/Tasks/EXECUTION-ORDER-….md`. From there: the sibling batch plan is `../plan-….md`; shared `process/` docs are six levels up (`../../../../../../process/…`). If the program is a flat single batch (`<program>/Tasks/…`), drop two `../`. See the relative-link cheat sheet in [`PHASED-PLANS-GUIDE.md`](./PHASED-PLANS-GUIDE.md) §7.

```
# <batch-name> — execution order

> Sibling document of [`plan-p{N}-<batch>.md`](../plan-p{N}-<batch>.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (<N> waves)

​```
Wave 1 (<theme> — ~<wall-clock>, single lane sequential):
  Lane α  ──── xx-01 (XS, Sonnet) ──> xx-02 (S, Sonnet)

Wave 2 (<theme> — ~<wall-clock>, 2 parallel lanes after xx-02):
  Lane α  ──── xx-02 (S, Sonnet) ──> xx-03 (M, Sonnet)        [backend]
  Lane β  ──── (waits on xx-02) ──> xx-04 (S, Sonnet)              [frontend]

Wave 3 (<theme — convergence + cleanup> — ~<wall-clock>, single lane sequential):
  Lane α  ──── xx-05 (S, Sonnet) ──> xx-06 (XS, Sonnet)
​```

**Total wall-clock with parallelism:** ~<X>h.
**Total agent-time (sequential equivalent):** ~<Y>h.

The bottleneck is Wave <N> — <one-line reason>.

---

## Lane-by-lane details

### Wave 1 — <theme> (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | xx-01 | XS | Sonnet | …files… | … |
| 1 | xx-02 | S | Sonnet | …files… | … |

…

---

## Per-task model picks
…
## Acceptance gates per wave
…
## Cost estimate
…
## References
…
```

---

## 13.5. Operating playbook (how to execute a batch from these docs)

Once the exec-order doc is written, here's how you actually run it. This is the executor's checklist — print it, paste it in the batch's `README.md`, or just memorise the 7 steps.

1. **Read the exec-order doc for the wave you're about to start.** Specifically the ASCII wave block + that wave's lane-by-lane table. Don't skim ahead to later waves.
2. **Count the lanes in this wave.** Most waves are single-lane (Shape A) — execute Chat 1 only. Two lanes = open two chats. Three lanes = three chats (very rare).
3. **Open one chat per lane, in its own git worktree if running ≥ 2 lanes simultaneously.** Single lane = one chat in your normal working copy. Multi-lane = `git worktree add ../<branch-name>` for the parallel lane so the two chats don't fight over the working tree.
4. **Each chat runs its lane's tasks top-to-bottom.** Do not start step N+1 until step N is merged or at least green. Do not peek at the other lane's WIP mid-wave.
5. **If your wave uses Shape B with a sync point** (`(waits on …) ──>` on Lane β): start Lane α immediately, keep Lane β closed until the sync-point task ships. The moment it's green, open Lane β's chat — at that instant, both lanes run in parallel for the rest of the wave.
6. **When all lanes finish, run the wave's acceptance gate checklist.** Every checkbox must be green. The gate items are the binary `pnpm tsc` / `rg` / "open this page and click that" lines from §10.
7. **All green → next wave.** Any red → fix it in the lane that owns the failure, re-run the gate, then move on. **Do not start the next wave on a flaky gate** — regressions compound across waves and become unbisectable.

### Across-wave hygiene

- **Lanes don't persist across waves.** Wave 2 starts with fresh chats. Even if Wave 1 had two lanes, those chats are done when Wave 1's gate is green. Open new chats for Wave 2 based on Wave 2's lane count.
- **Model picks per chat:** the `(size, model)` annotation on each task in the ASCII block is the recommended model for *that task*. One chat can span multiple tasks of the same model tier; start a fresh chat when the model changes (e.g., Opus → Sonnet) or when the task subject genuinely shifts. The §AGENT-EXECUTION-EFFICIENCY-GUIDE "one topic per chat" rule still applies.
- **Branches:** one branch per lane is the default. If the wave is single-lane, one branch for the whole wave. If two lanes are independent and merged separately (e.g. backend vs frontend), two branches. The exec-order doc's `Branch suggestion:` line tells you which.

### Common executor mistakes (don't do these)

- **Starting Wave N+1 because "Wave N is mostly done".** No. The gate is binary. Either it's green or it isn't.
- **Reading Lane α's diff from Lane β's chat to "stay aligned".** That's the parallelism rule violated. Either your lanes aren't truly independent (use Shape A) or they are independent and you don't need to peek.
- **Squashing two lanes into one chat to "save tokens".** Two lanes exist *because they're independent*. One chat means they share context — which means you've collapsed them sequentially anyway. Either run two chats (real parallelism) or rewrite the wave as Shape A (admitted sequential).
- **Skipping the acceptance gate "because the diff looks clean".** Run the gate. Every wave. Even Wave 1.

---

## 14. Anti-patterns gallery (don't do these)

- **Phantom parallelism (the `ppr` Wave 2 bug).** Lane α step 1 secretly depends on Lane β's output. The doc invites the agent to run them in parallel; the code doesn't permit it. Fix: collapse to Shape A or split the wave at the convergence task.
- **Merge rows / convergence lanes inside a wave.** Banned. If a task needs ≥ 2 lanes' outputs, it lives in the next wave (Shape A) or in its own waiting Lane γ — never on Lane α or β.
- **Phantom lanes.** Drawing a Lane β that the agent always waits on Lane α to finish before starting any work. That's just sequential; collapse it.
- **Floating dependencies in prose.** "(BTW, this also needs xx-04)" buried in `Notes`. If it's in prose only, the agent loading the table will miss it. It must be in the ASCII block too.
- **Mixing waves and lanes.** A "lane" that spans waves. A lane lives inside one wave. Across waves, dependencies go through the acceptance gate.
- **Opus everywhere.** Three or four Opus tasks in one batch usually means the plan file is under-specified. Tighten the plan; downgrade the model.
- **No wall-clock.** Without a wall-clock estimate, the doc is unfalsifiable. Always include one, even if it's a guess.
- **No bottleneck sentence.** The reader should know in 10 seconds which wave dictates the schedule.
- **Inventing a fourth wave shape.** If your wave doesn't fit Shape A / B / C, you've cut the waves wrong — re-cut. Don't bend the notation.

---

## 15. When to evolve these guidelines

Update this file when:

- A new batch needs a notation we haven't defined here (e.g. a "soak" wave that's neither work nor pause).
- A lane scheme misfires and we ship a bug because of it (post-mortem the doc, not just the code).
- A new model tier appears in `AGENT-EXECUTION-EFFICIENCY-GUIDE.md` and changes the inline `(size, model)` shorthand.

Anything else, leave it alone. The cost of inconsistency across docs is higher than the cost of a slightly-imperfect glyph.
