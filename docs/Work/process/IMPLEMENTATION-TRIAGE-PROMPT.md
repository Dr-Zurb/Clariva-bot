# Implementation triage prompt

> **Purpose:** I'm about to make a code change or feature and I'm unsure *how* to run it.
> Your only job this turn is to tell me **how to implement it**, not to implement it.
> `@`-mention this file in a fresh chat, then describe the change. Return the verdict block, then stop.

> **System T** = our existing task-management system: daily plans → phases → execution-order → task files.
> The deep rules live in the guides under §References. You decide whether a change is worth that machinery
> or should just be done here in chat.

---

## The one decision

Pick **one** path:

| Path | Choose when | Signals |
|---|---|---|
| **① Direct in chat** | The change is bounded and low-risk enough that a written spec would be overhead. | ≤ ~3 files; pattern already exists in the codebase; clear "done when"; you could describe it in 1–2 sentences; no schema/RLS/PHI/auth. |
| **② Route through System T** | The change is big, branchy, risky, or spans multiple sittings/gates — a written spec prevents rework. | Many files; new data model; multiple acceptance gates; needs to ship in slices; or you'd otherwise re-explain it across several chats. |

**Litmus question:**
> "Could a smart junior who's seen this codebase once finish this correctly, in one sitting, from my one-paragraph description, without a written spec?"
>
> **Yes** → ① Direct. **No** → ② System T.

---

## If ① Direct in chat — which model? (efficiency × quality)

Recommend exactly one, defaulting to the cheapest that still produces correct code:

| Model | Use for |
|---|---|
| **Composer** | Pure-text / trivial: doc sync, comments, status ticks, simple renames/moves, a one-line fix I already know. Cheapest. |
| **Auto** *(default)* | Bounded, well-described execution: a component, an endpoint on an existing pattern, tests, a concrete TS fix. Best balance for ~most direct work. Never escalates to a thinking model on its own. |
| **Codex** | Tight-spec code-gen, refactor renames, type-error fixing (pick when you want that behavior specifically). |
| **Sonnet** | Same tier as Auto; pick manually only to know which model ran (A/B, repro). |
| **Opus** | Forced by the hard-rules list below, or unknown-cause debugging, or a small-but-high-risk refactor. Pick the effort with the table below. |

---

## If Opus — which effort? (high → extra high → max)

Effort = how much the model reasons before answering. More effort = better on hard/ambiguous/high-stakes work, but slower and pricier. Match effort to **how expensive a silent mistake would be**, not to how important the task feels. Default low, escalate on demand.

| Effort | Use for |
|---|---|
| **High** *(home base)* | Single-layer, well-scoped Opus work; following an existing pattern; anything a typecheck/lint/test will catch. Also: reference, Q&A, explanations. |
| **Extra high** | Multi-file features, cross-layer work (API + service + DB), real design tradeoffs. e.g. a self-contained feature across a few files. |
| **Max** *(reserve)* | Highest blast radius / hardest reasoning — the hard-rules list below, unknown-cause debugging, or a 5+ file refactor. When in doubt on a hard-rule item, this is the tier. |

> Money habits: scope tightly so High can succeed; spend effort on the *plan/design*, then execute the spec'd steps at a lower tier; never burn Max on a question.

---

## Hard rules — force Opus at **max** effort, even on path ①

If the change touches ANY of these, the model is **Opus (max)**, no matter how small it looks:

1. `auth.uid()`, RLS policies, `safe_uuid_sub()`, HMAC tokens, signed-URL TTLs, or any audit-logging path.
2. PHI columns (medicines, diagnosis, clinical notes, allergies, vitals).
3. A new migration file.
4. Validating a spec before starting a System T batch/phase.
5. The close-gate review of a finished batch/phase.

None apply → default to **Auto**.

---

## If ② Route through System T — hand off, don't plan it here

Tell me, per [`PHASED-PLANS-GUIDE.md`](./PHASED-PLANS-GUIDE.md):

- **Single batch vs phased:** single batch if self-contained, < ~1 week, **one** acceptance gate (flat program folder + `Tasks/`). Phased (`p1-…`, `p2-…`) if > ~1 week, ≥ ~10 tasks, **multiple** gates, or a decision lock later phases inherit.
- **Where it lands:** suggested program folder + file name(s) (`plan-…-batch.md`, `EXECUTION-ORDER-…`, `task-<prefix>-NN-…`).
- **Which model for what:** **Opus (extra high, or max if it hits a hard rule)** to write the plan/task spec, **Auto** to execute the spec'd tasks, **Composer** for doc sync.

Do **not** write the task/plan files this turn unless I reply "go".

---

## Output (return exactly this, then stop)

```
VERDICT
- Path:        ① Direct in chat | ② System T  — <one-line why>
- Model:       Composer | Auto | Codex | Sonnet | Opus  — <why>
- Effort:       (only if Opus) high | extra high | max  — <why>
               (for ②: model+effort to PLAN with + model to EXECUTE with)
- Hard-rule:   none | <which rule(s) hit>
- Scope guess: ~<n> files; data/RLS/PHI touched? yes/no
- If ②:        single batch | phased; suggested path + filename(s)
- Next action: <one concrete sentence — e.g. "Reply 'go' and I'll implement now on Auto"
               or "Open a fresh Opus chat and have it write the task file under <path>">
```

If something material is ambiguous (acceptance criteria, blast radius, data model), ask **one** sharp clarifying question first — then give the verdict.

---

## References (System T deep rules)

- Model/cost routing: [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](./AGENT-EXECUTION-EFFICIENCY-GUIDE.md)
- Phase vs single batch + folder/naming rules: [`PHASED-PLANS-GUIDE.md`](./PHASED-PLANS-GUIDE.md)
- Waves/lanes within a batch: [`EXECUTION-ORDER-GUIDELINES.md`](./EXECUTION-ORDER-GUIDELINES.md)
- Task lifecycle + planning/execution boundary: [`TASK_MANAGEMENT_GUIDE.md`](./TASK_MANAGEMENT_GUIDE.md)
- Per-task file shape: [`TASK_TEMPLATE.md`](./TASK_TEMPLATE.md)
- Rules when editing existing code: [`CODE_CHANGE_RULES.md`](./CODE_CHANGE_RULES.md)

---

**Created:** 2026-06-17
